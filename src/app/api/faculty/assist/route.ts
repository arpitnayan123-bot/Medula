import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { createDraft, FacultyHttpError } from '@/lib/faculty-engine'
import type { FacultyAssistAction, FacultyAssistResult, FacultyDraftBody, FacultyEntityType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/faculty/assist — AI content assistance over EXISTING platform
// content (PRODUCT 19). Binding rules:
// - The model is grounded ONLY in the platform content loaded below and is
//   forbidden from inventing guidelines, trials or citations.
// - Every result is a DRAFT (aiAssisted, status=draft) — it never becomes
//   authoritative here; publishing happens only through the reviewer gate on
//   /api/faculty/drafts/[id].
// - NO chain-of-thought: the model outputs conclusions only.
// - Deterministic fallback: if the model is unavailable or its output fails
//   validation, a deterministic extract from platform content is stored
//   instead (aiAssisted=false) — the faculty workspace never fabricates.

const ACTIONS: FacultyAssistAction[] = [
  'summary', 'simplify', 'key-points', 'flashcards', 'mcq', 'case', 'revision-notes', 'concept-links',
]

const SAFETY = `SAFETY RULES (non-negotiable):
- This is an EDUCATIONAL platform for medical students. Never provide individualized medical advice, never diagnose a real patient, never prescribe for a real person.
- Do not invent citations, statistics, trials or guidelines. References may ONLY cite the PLATFORM CONTENT provided.
- Ground every claim in the PLATFORM CONTENT provided, or in standard textbook knowledge of this concept — never fabricate facts beyond it.
- NO chain-of-thought: output conclusions only, never your step-by-step deliberation.`

const JSON_RULE = `OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact).`

// ── robust JSON parsing (platform-wide pattern) ──────────────────────────────

function parseLooseJson(text: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s)
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
    } catch { return null }
  }
  const direct = tryParse(text.trim())
  if (direct) return direct
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const fromFence = tryParse(fence[1].trim())
    if (fromFence) return fromFence
  }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) return tryParse(text.slice(first, last + 1))
  return null
}

// Truncated-output salvage (mirrors the adaptive route): when the model's JSON
// is cut off mid-string by the token cap, regex-rebuild the payload from the
// raw text instead of discarding it.
function salvageMcqs(raw: string): Record<string, unknown> | null {
  const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
  const str = (key: string) => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i'))
    return m ? unescape(m[1]) : ''
  }
  const stem = str('stem')
  if (!stem) return null
  const options: { id: string; text: string }[] = []
  const pairRe = /"id"\s*:\s*"([a-dA-D])"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = pairRe.exec(raw)) !== null) {
    const id = m[1].toLowerCase()
    if (!options.some((o) => o.id === id)) options.push({ id, text: unescape(m[2]) })
  }
  if (options.length < 3) return null
  return { mcqs: [{ stem, options, answer: str('answer').toLowerCase(), explanation: str('explanation'), teaching: str('teaching') }] }
}

function salvageCards(raw: string): Record<string, unknown> | null {
  const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
  const cards: { front: string; back: string }[] = []
  const pairRe = /"front"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"back"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = pairRe.exec(raw)) !== null) {
    const front = unescape(m[1])
    const back = unescape(m[2])
    if (front && back && !cards.some((c) => c.front === front)) cards.push({ front, back })
  }
  return cards.length >= 2 ? { cards } : null
}

// ── validators: raw model output → strict FacultyDraftBody ───────────────────

const cleanStr = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const cleanArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, maxItems).map((s) => s.slice(0, maxLen)) : []

function validateBody(action: FacultyAssistAction, parsed: Record<string, unknown>): FacultyDraftBody | null {
  const references = cleanArr(parsed.references, 8, 200)
  switch (action) {
    case 'summary':
    case 'simplify':
    case 'revision-notes': {
      const text = cleanStr(parsed.text, 5000)
      if (text.length < 40) return null
      return { text, references }
    }
    case 'key-points': {
      const bullets = cleanArr(parsed.bullets, 10, 300)
      if (bullets.length < 3) return null
      return { bullets, references }
    }
    case 'flashcards': {
      const raw = Array.isArray(parsed.cards) ? parsed.cards : []
      const cards = raw
        .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : null))
        .filter((c): c is Record<string, unknown> => c !== null)
        .map((c) => ({ front: cleanStr(c.front, 300), back: cleanStr(c.back, 800) }))
        .filter((c) => c.front && c.back)
        .slice(0, 8)
      if (cards.length < 2) return null
      return { cards, references }
    }
    case 'mcq': {
      const raw = Array.isArray(parsed.mcqs) ? parsed.mcqs : Array.isArray(parsed.questions) ? parsed.questions : []
      const mcqs = raw
        .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
        .filter((m): m is Record<string, unknown> => m !== null)
        .map((m) => {
          const opts = Array.isArray(m.options) ? m.options : []
          const normOptions = opts
            .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : null))
            .filter((o): o is Record<string, unknown> => o !== null)
            .map((o) => ({ id: String(o.id ?? o.label ?? '').trim().toLowerCase(), text: cleanStr(o.text ?? o.choice ?? o.option, 300) }))
            .filter((o) => o.id && o.text)
          return {
            stem: cleanStr(m.stem, 900),
            options: normOptions.slice(0, 5),
            answer: cleanStr(m.answer, 3).toLowerCase(),
            explanation: cleanStr(m.explanation, 1200),
            teaching: cleanStr(m.teaching, 300),
          }
        })
        .filter((m) => m.stem.length > 15 && m.options.length >= 3 && m.options.some((o) => o.id === m.answer) && m.explanation)
        .slice(0, 3)
      if (mcqs.length < 1) return null
      return { mcqs, references }
    }
    case 'case': {
      const c = (parsed.case && typeof parsed.case === 'object' ? parsed.case : null) as Record<string, unknown> | null
      if (!c) return null
      const title = cleanStr(c.title, 200)
      const patient = cleanStr(c.patient, 900)
      const steps = cleanArr(c.steps, 8, 600)
      const learning = cleanArr(c.learning, 8, 400)
      if (!title || !patient || steps.length < 3 || learning.length < 2) return null
      return { case: { title, specialty: cleanStr(c.specialty, 60) || 'Medicine', patient, steps, learning }, references }
    }
    case 'concept-links': {
      const raw = Array.isArray(parsed.links) ? parsed.links : []
      const links = raw
        .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : null))
        .filter((l): l is Record<string, unknown> => l !== null)
        .map((l) => ({
          fromId: cleanStr(l.fromId, 200),
          toId: cleanStr(l.toId, 200),
          type: cleanStr(l.type, 40).toLowerCase(),
          label: cleanStr(l.label, 120),
          why: cleanStr(l.why, 400),
        }))
        .filter((l) => l.fromId && l.toId && l.type && l.why)
        .slice(0, 6)
      if (links.length < 1) return null
      return { links, references }
    }
    default:
      return null
  }
}

// ── entity grounding ─────────────────────────────────────────────────────────

type GroundSources = { kind: string; label: string }[]

async function loadConcept(conceptId: string) {
  const c = await db.concept.findUnique({
    where: { id: conceptId },
    select: {
      id: true, name: true, kind: true, summary: true, whyMatters: true, detail: true, lesson: true,
      examWeight: true, evidenceLevel: true, mnemonic: true,
      topic: { select: { id: true, name: true, subject: { select: { name: true, code: true } } } },
    },
  })
  return c
}

function conceptFacts(c: NonNullable<Awaited<ReturnType<typeof loadConcept>>>): string {
  const lines = [
    `CONCEPT: ${c.name} (${c.kind}) — ${c.summary}`,
    c.whyMatters ? `WHY IT MATTERS: ${c.whyMatters}` : '',
    `SUBJECT / TOPIC: ${c.topic.subject.name} · ${c.topic.name}`,
    c.examWeight ? `EXAM WEIGHT: ${c.examWeight}/5` : '',
    c.mnemonic ? `MNEMONIC: ${c.mnemonic}` : '',
  ]
  const lesson = c.lesson as Record<string, unknown> | null
  if (lesson && typeof lesson === 'object') {
    const oneLiner = typeof lesson.oneLiner === 'string' ? lesson.oneLiner : ''
    const explain30s = typeof lesson.explain30s === 'string' ? lesson.explain30s : ''
    const eli5 = typeof lesson.eli5 === 'string' ? lesson.eli5 : ''
    const mechanism = typeof lesson.mechanism === 'string' ? lesson.mechanism : ''
    const firstPrinciples = Array.isArray(lesson.firstPrinciples) ? lesson.firstPrinciples.slice(0, 6) : []
    const mistakes = Array.isArray(lesson.mistakes) ? lesson.mistakes.slice(0, 5) : []
    const management = Array.isArray(lesson.management) ? lesson.management.slice(0, 6) : []
    if (oneLiner) lines.push(`LESSON ONE-LINER: ${oneLiner}`)
    if (explain30s) lines.push(`LESSON 30s EXPLANATION: ${explain30s}`)
    if (eli5) lines.push(`LESSON BEGINNER VERSION: ${eli5}`)
    if (mechanism) lines.push(`MECHANISM: ${mechanism.slice(0, 900)}`)
    if (firstPrinciples.length) lines.push(`FIRST PRINCIPLES: ${firstPrinciples.map(String).join(' | ')}`)
    if (mistakes.length) lines.push(`COMMON MISTAKES: ${mistakes.map(String).join(' | ')}`)
    if (management.length) lines.push(`MANAGEMENT PRINCIPLES: ${management.map(String).join(' | ')}`)
  }
  return lines.filter(Boolean).join('\n')
}

async function loadQuestion(questionId: string) {
  const q = await db.question.findUnique({
    where: { id: questionId },
    select: {
      id: true, stem: true, options: true, answer: true, explanation: true, teaching: true, subjectCode: true, difficulty: true,
      concept: { select: { id: true, name: true, summary: true } },
    },
  })
  return q
}

async function loadTopic(topicId: string) {
  const t = await db.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true, name: true, description: true, importance: true, system: true,
      subject: { select: { name: true, code: true } },
      concepts: { select: { id: true, name: true, summary: true }, take: 12 },
    },
  })
  return t
}

// ── deterministic fallbacks (never fabricate; extract from platform content) ─

function fallbackBody(action: FacultyAssistAction, ground: {
  label: string
  summary: string
  whyMatters: string
  lesson: Record<string, unknown> | null
}): FacultyDraftBody | null {
  const lessonText = (key: string, max = 6): string[] => {
    const v = ground.lesson?.[key]
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []
  }
  const oneLiner = typeof ground.lesson?.oneLiner === 'string' ? ground.lesson.oneLiner : ''
  const eli5 = typeof ground.lesson?.eli5 === 'string' ? ground.lesson.eli5 : ''
  const explain30s = typeof ground.lesson?.explain30s === 'string' ? ground.lesson.explain30s : ''

  switch (action) {
    case 'summary':
    case 'revision-notes': {
      const text = [oneLiner, ground.summary, ground.whyMatters, explain30s].map((s) => s.trim()).filter(Boolean).join('\n\n')
      if (text.length < 40) return null
      return { text: text.slice(0, 5000) }
    }
    case 'simplify': {
      const text = [eli5, explain30s, ground.summary].map((s) => s.trim()).filter(Boolean).join('\n\n')
      if (text.length < 40) return null
      return { text: text.slice(0, 5000) }
    }
    case 'key-points': {
      const bullets = [
        ...lessonText('firstPrinciples', 6),
        ...lessonText('mistakes', 4),
      ].map((s) => s.slice(0, 300)).filter(Boolean)
      if (bullets.length < 3 && !ground.summary) return null
      return { bullets: bullets.length >= 3 ? bullets : [ground.summary, ground.whyMatters].map((s) => s.trim()).filter(Boolean) }
    }
    default:
      // flashcards / mcq / case / concept-links have no safe deterministic form —
      // an empty placeholder records the request honestly instead of fabricating.
      return null
  }
}

// ── route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await readJson<{ entityType?: unknown; entityId?: unknown; action?: unknown; instruction?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const entityType = asTrimmed(body.entityType, 20) as FacultyEntityType | null
  const entityId = asTrimmed(body.entityId, 200)
  const action = asTrimmed(body.action, 20) as FacultyAssistAction | null
  const instruction = asTrimmed(body.instruction, 300)

  if (!entityType || !['concept', 'question', 'topic'].includes(entityType)) {
    return NextResponse.json({ error: 'entityType must be one of: concept, question, topic' }, { status: 400 })
  }
  if (!entityId) return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }
  if (action === 'concept-links' && entityType !== 'concept') {
    return NextResponse.json({ error: 'concept-links assists on a concept — it drafts graph edges between concepts.' }, { status: 400 })
  }

  // ── grounding (measured platform content only) ───────────────────────────
  let entityLabel = entityId
  let facts = ''
  let summary = ''
  let whyMatters = ''
  let lessonJson: Record<string, unknown> | null = null
  const sources: GroundSources = []
  const validConceptIds = new Set<string>()

  try {
    if (entityType === 'concept') {
      const c = await loadConcept(entityId)
      if (!c) return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
      entityLabel = c.name
      summary = c.summary
      whyMatters = c.whyMatters
      lessonJson = (c.lesson ?? null) as Record<string, unknown> | null
      sources.push(lessonJson ? { kind: 'lesson', label: `Lesson — ${c.name}` } : { kind: 'summary', label: `Concept summary — ${c.name}` })
      const [qCount, edgeCount] = await Promise.all([
        db.question.count({ where: { conceptId: c.id } }),
        db.conceptEdge.count({ where: { OR: [{ fromId: c.id }, { toId: c.id }] } }),
      ])
      if (qCount > 0) sources.push({ kind: 'questions', label: `${qCount} linked question${qCount === 1 ? '' : 's'}` })
      if (edgeCount > 0) sources.push({ kind: 'graph', label: `${edgeCount} verified concept edge${edgeCount === 1 ? '' : 's'}` })
      // concept-links grounding: sibling concepts + existing neighbours
      if (action === 'concept-links') {
        const [siblings, edgesOut, edgesIn] = await Promise.all([
          db.concept.findMany({ where: { topicId: c.topic.id, id: { not: c.id } }, select: { id: true, name: true }, take: 12 }),
          db.conceptEdge.findMany({ where: { fromId: c.id }, select: { toId: true, type: true } }),
          db.conceptEdge.findMany({ where: { toId: c.id }, select: { fromId: true, type: true } }),
        ])
        facts += `\nSIBLING CONCEPTS IN THIS TOPIC (candidate link targets, use their exact ids): ${siblings.map((s) => `${s.id} (${s.name})`).join('; ') || 'none'}`
        const existing = [...edgesOut.map((e) => `${e.toId} [${e.type}]`), ...edgesIn.map((e) => `${e.fromId} [${e.type}]`)]
        facts += `\nEXISTING EDGES for this concept (do not duplicate these): ${existing.join('; ') || 'none'}`
        validConceptIds.add(c.id)
        siblings.forEach((s) => validConceptIds.add(s.id))
        edgesOut.forEach((e) => validConceptIds.add(e.toId))
        edgesIn.forEach((e) => validConceptIds.add(e.fromId))
      }
      facts = conceptFacts(c) + facts
    } else if (entityType === 'question') {
      const q = await loadQuestion(entityId)
      if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
      const options = Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : []
      entityLabel = q.stem.length > 80 ? `${q.stem.slice(0, 79)}…` : q.stem
      summary = q.concept?.summary ?? ''
      sources.push({ kind: 'question', label: `Platform question — ${q.subjectCode}` })
      if (q.concept) {
        sources.push({ kind: 'concept', label: `Concept — ${q.concept.name}` })
        validConceptIds.add(q.concept.id)
      }
      facts = [
        `QUESTION (difficulty ${q.difficulty}/3, subject ${q.subjectCode}): ${q.stem}`,
        `OPTIONS: ${options.map((o) => `(${o.id}) ${o.text}`).join(' | ')}`,
        `CORRECT ANSWER: (${q.answer}) ${options.find((o) => o.id === q.answer)?.text ?? ''}`,
        `PLATFORM EXPLANATION: ${q.explanation}`,
        q.teaching ? `PLATFORM TAKEAWAY: ${q.teaching}` : '',
        q.concept ? `LINKED CONCEPT: ${q.concept.id} — ${q.concept.name}: ${q.concept.summary}` : '',
      ].filter(Boolean).join('\n')
    } else {
      const t = await loadTopic(entityId)
      if (!t) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
      entityLabel = t.name
      sources.push({ kind: 'topic', label: `Topic — ${t.name} · ${t.subject.name}` })
      facts = [
        `TOPIC: ${t.name} (${t.subject.name}, importance ${t.importance}/5)`,
        t.description ? `DESCRIPTION: ${t.description}` : '',
        `CONCEPTS IN THIS TOPIC: ${t.concepts.map((c) => `${c.id} (${c.name}): ${c.summary}`).join(' | ')}`,
      ].filter(Boolean).join('\n')
      t.concepts.forEach((c) => validConceptIds.add(c.id))
    }
  } catch (err) {
    console.error('faculty/assist grounding error:', err)
    return NextResponse.json({ error: 'Grounding failed — the content store did not respond' }, { status: 500 })
  }

  // ── per-action task + JSON spec ──────────────────────────────────────────
  const instructionLine = instruction ? `\nFACULTY INSTRUCTION (follow it faithfully): ${instruction}` : ''
  const tasks: Record<FacultyAssistAction, { task: string; spec: string }> = {
    summary: {
      task: 'TASK: Write a tight faculty-grade summary of the entity above for the content library. Cover what it is, why it matters and the must-know exam angle. Maximum 220 words, markdown allowed.',
      spec: 'The JSON must have exactly this shape: {"text":"<the summary>","references":["<source line 1>","<source line 2>"]}',
    },
    simplify: {
      task: 'TASK: Rewrite the content above as the simplest possible student-facing explanation — short sentences, first-year level, one everyday analogy that maps back to the real medical terms, no unexplained jargon. Maximum 180 words.',
      spec: 'The JSON must have exactly this shape: {"text":"<the simplified explanation>","references":["<source line>"]}',
    },
    'key-points': {
      task: 'TASK: Extract 4-8 high-yield key points from the content above — each a single crisp sentence a student can revise from. Order by exam yield.',
      spec: 'The JSON must have exactly this shape: {"bullets":["<point 1>","<point 2>","..."],"references":["<source line>"]}',
    },
    flashcards: {
      task: 'TASK: Draft 3-6 spaced-repetition flashcards from the content above — one atomic fact per card, front asks, back answers in at most 2 sentences.',
      spec: 'The JSON must have exactly this shape: {"cards":[{"front":"<question>","back":"<answer>"},...],"references":["<source line>"]}',
    },
    mcq: {
      task: 'TASK: Draft ONE new single-best-answer MCQ on this content in the platform\'s exam-realistic style. Exactly 4 options (a-d), one unambiguous key, an explanation of why the answer wins and a one-line teaching point.',
      spec: 'The JSON must have exactly this shape: {"mcqs":[{"stem":"<stem>","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"answer":"<a-d>","explanation":"<why the answer is right>","teaching":"<one-line takeaway>"}],"references":["<source line>"]}',
    },
    case: {
      task: 'TASK: Draft ONE short clinical teaching case anchored on this content — 3-5 sequential steps from presentation to management, each step one or two sentences, plus 2-4 learning points. Educational only; never a real patient.',
      spec: 'The JSON must have exactly this shape: {"case":{"title":"<title>","specialty":"<specialty>","patient":"<one-line de-identified patient summary>","steps":["<step 1>","<step 2>","..."],"learning":["<point 1>","<point 2>","..."]},"references":["<source line>"]}',
    },
    'revision-notes': {
      task: 'TASK: Write compact revision notes for the content above — the skeleton a student revises from the night before: definitions, numbers, differentials, management lines. Maximum 200 words.',
      spec: 'The JSON must have exactly this shape: {"text":"<the revision notes>","references":["<source line>"]}',
    },
    'concept-links': {
      task: 'TASK: Suggest 1-4 new concept-graph edges for this concept using the candidate ids provided (siblings/neighbours). Prefer prerequisite_of, related_to, differential_of, complication_of, commonly_tested_with. Do NOT duplicate existing edges.',
      spec: 'The JSON must have exactly this shape: {"links":[{"fromId":"<exact id>","toId":"<exact id>","type":"<edge type>","label":"<short label>","why":"<why this link helps students>"}],"references":["<source line>"]}',
    },
  }

  const actionLabels: Record<FacultyAssistAction, string> = {
    summary: 'Summary', simplify: 'Simplified explanation', 'key-points': 'Key points',
    flashcards: 'Flashcards', mcq: 'MCQ', case: 'Clinical case', 'revision-notes': 'Revision notes',
    'concept-links': 'Concept links', manual: 'Note',
  } as Record<FacultyAssistAction, string>

  const system = `You are the content-studio assistant on MEDOS, an educational platform for Indian MBBS students preparing for NEET-PG. You are assisting the FACULTY workspace: your output is a DRAFT for a human reviewer — it is never published as-is.

PLATFORM CONTENT (your only factual grounding — never contradict it):
${facts}
${instructionLine}

${tasks[action].task}

${tasks[action].spec}

Rules for references: cite ONLY the platform content lines above (e.g. "MEDOS lesson — ${entityLabel}") — never a textbook edition, trial, or URL you were not given.

${JSON_RULE}

${SAFETY}`

  const profile = await getDemoProfile()

  const makeTitle = (): string => `AI draft — ${actionLabels[action]}: ${entityLabel}`

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
      ],
      temperature: 0.4,
      maxTokens: 2800,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    let parsed = parseLooseJson(content)
    // known truncation failure modes — regex-salvage the raw output
    if (!parsed && action === 'mcq') parsed = salvageMcqs(content)
    if (!parsed && action === 'flashcards') parsed = salvageCards(content)
    let aiBody = parsed ? validateBody(action, parsed) : null

    // concept-links: keep only links whose ids exist on the real graph
    if (aiBody) {
      const linksNow = aiBody.links
      if (linksNow && validConceptIds.size > 0) {
        const kept = linksNow.filter((l) => validConceptIds.has(l.fromId) && validConceptIds.has(l.toId))
        aiBody = kept.length ? { ...aiBody, links: kept } : null
      }
    }

    if (aiBody) {
      aiBody = {
        ...aiBody,
        references: aiBody.references?.length ? aiBody.references : [`MEDOS platform content — ${entityLabel}`],
      }
      const draft = await createDraft({
        profileId: profile.id,
        entityType,
        entityId,
        kind: action,
        title: makeTitle(),
        body: aiBody,
        aiAssisted: true,
        grounded: true,
      })
      const result: FacultyAssistResult = {
        draft,
        sources,
        aiAssisted: true,
        disclaimer: 'AI-assisted draft — grounded in existing platform content, not authoritative until a reviewer publishes it.',
        note: 'The draft is stored in the Studio with the AI-ASSISTED badge. Send it for review with a change note; a reviewer publishes or rejects it with their own note.',
      }
      return NextResponse.json(result)
    }

    console.error('faculty/assist: unparseable or invalid model output —', content.slice(0, 400))
    // fall through to the deterministic fallback
  } catch (err) {
    console.error('faculty/assist AI error:', err)
    // fall through to the deterministic fallback
  }

  // ── deterministic fallback (AI unavailable or output unusable) ───────────
  const fb = fallbackBody(action, { label: entityLabel, summary, whyMatters, lesson: lessonJson })
  if (fb) {
    fb.references = [`MEDOS platform content — ${entityLabel}`]
    const draft = await createDraft({
      profileId: profile.id,
      entityType,
      entityId,
      kind: action,
      title: `${actionLabels[action]}: ${entityLabel}`,
      body: fb,
      aiAssisted: false,
      grounded: true,
      changeNote: 'Deterministic extract from existing platform content (AI assist unavailable at generation time).',
    })
    const result: FacultyAssistResult = {
      draft,
      sources,
      aiAssisted: false,
      disclaimer: 'Deterministic extract from existing platform content — the AI model was unavailable, so nothing was generated.',
      note: 'This draft carries no AI badge because no AI output was used. Retry the assist later for a generated draft.',
    }
    return NextResponse.json(result)
  }

  // No safe deterministic form for this action — record the request as an
  // empty placeholder draft instead of fabricating content.
  const draft = await createDraft({
    profileId: profile.id,
    entityType,
    entityId,
    kind: action,
    title: `${actionLabels[action]}: ${entityLabel}`,
    body: { text: 'AI assist was unavailable when this draft was requested. No content was generated — retry the assist action to fill this draft.' },
    aiAssisted: false,
    grounded: false,
    changeNote: 'Placeholder — AI assist unavailable.',
  })
  return NextResponse.json({
    draft,
    sources,
    aiAssisted: false,
    disclaimer: 'AI is unavailable right now — a placeholder draft records the request; nothing was fabricated.',
    note: 'Retry the assist action in a moment. The placeholder stays out of the published library until real content replaces it.',
  } satisfies FacultyAssistResult)
}
