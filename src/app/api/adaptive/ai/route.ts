import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import { DAY } from '@/lib/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// PRODUCT 04 — per-question AI actions. The LLM NEVER selects or scores
// questions (that is the deterministic engine's job). It only answers
// on-demand study actions on a question the student is looking at, grounded in
// the platform's own content, and every generated MCQ is returned labeled as
// AI-generated practice, not platform-validated.

type AiAction = 'explain' | 'simplify' | 'similar' | 'harder' | 'easier' | 'weakness'
const ACTIONS: AiAction[] = ['explain', 'simplify', 'similar', 'harder', 'easier', 'weakness']

const SAFETY = `SAFETY RULES (non-negotiable):
- This is an EDUCATIONAL platform for medical students. Never provide individualized medical advice, never diagnose a real patient, never prescribe for a real person.
- Do not invent citations, statistics, or guidelines. If uncertain, say so plainly ("I am not certain about this — verify against your standard textbook").
- Ground every claim in the PLATFORM CONTENT provided, or in standard medical knowledge — never fabricate facts beyond it.
- NO chain-of-thought: output conclusions only, never your step-by-step deliberation.`

const JSON_RULE = `OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact).`

// Robust parse: direct JSON → fenced ```json block → first-{ to last-} slice.
function parseLooseJson(text: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s)
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
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
  if (first !== -1 && last > first) {
    const sliced = tryParse(text.slice(first, last + 1))
    if (sliced) return sliced
  }
  return null
}

interface GroundQuestion {
  id: string; stem: string; answer: string; explanation: string; teaching: string
  difficulty: number; subjectCode: string
  options: { id: string; text: string }[]
  concept: { id: string; name: string; summary: string; whyMatters: string; topic: { id: string; name: string; subject: { name: string } } | null } | null
}

async function loadQuestion(questionId: string): Promise<GroundQuestion | null> {
  const q = await db.question.findUnique({
    where: { id: questionId },
    include: {
      concept: {
        select: {
          id: true, name: true, summary: true, whyMatters: true,
          topic: { select: { id: true, name: true, subject: { select: { name: true } } } },
        },
      },
    },
  })
  if (!q) return null
  return { ...q, options: (q.options as { id: string; text: string }[]) } as GroundQuestion
}

function questionFacts(q: GroundQuestion): string {
  const lines = [
    `SUBJECT: ${q.concept?.topic?.subject.name ?? q.subjectCode}`,
    `TOPIC: ${q.concept?.topic?.name ?? '—'}`,
    `CONCEPT: ${q.concept?.name ?? '—'}${q.concept?.summary ? ` — ${q.concept.summary}` : ''}`,
    `QUESTION (difficulty ${q.difficulty}/3): ${q.stem}`,
    `OPTIONS: ${q.options.map((o) => `(${o.id}) ${o.text}`).join(' | ')}`,
    `CORRECT ANSWER: (${q.answer}) ${q.options.find((o) => o.id === q.answer)?.text ?? ''}`,
    `PLATFORM EXPLANATION: ${q.explanation}`,
    q.teaching ? `PLATFORM TAKEAWAY: ${q.teaching}` : '',
    q.concept?.whyMatters ? `WHY THIS CONCEPT MATTERS: ${q.concept.whyMatters}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ action?: unknown; questionId?: unknown; conceptId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const action = asTrimmed(body.action, 20) as AiAction | null
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }
  const questionId = asTrimmed(body.questionId, 200)
  const conceptId = asTrimmed(body.conceptId, 200)

  // ── Grounding (measured platform data only) ───────────────────────────────
  let grounding = ''
  let expectedDifficulty: number | null = null
  if (questionId) {
    const q = await loadQuestion(questionId)
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    if (action === 'explain') {
      grounding = `PLATFORM CONTENT (your grounding — never contradict it):\n${questionFacts(q)}`
    } else if (action === 'simplify') {
      grounding = `PLATFORM CONTENT (your grounding — never contradict it):\n${questionFacts(q)}`
    } else {
      // similar / harder / easier — ONE new MCQ strictly grounded on this
      // question's concept/topic facts.
      expectedDifficulty = Math.min(3, Math.max(1, q.difficulty + (action === 'harder' ? 1 : action === 'easier' ? -1 : 0)))
      grounding = `PLATFORM CONTENT (your ONLY factual grounding — do not invent guidelines, trials or citations beyond these facts and standard textbook knowledge of this concept):\n${questionFacts(q)}`
    }
  } else if (conceptId) {
    const concept = await db.concept.findUnique({
      where: { id: conceptId },
      include: { topic: { select: { name: true, subject: { select: { name: true, code: true } } } } },
    })
    if (!concept) return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
    grounding = `CONCEPT: ${concept.name} (${concept.kind}) — ${concept.summary}\nWHY IT MATTERS: ${concept.whyMatters}\nTOPIC: ${concept.topic.name} · ${concept.topic.subject.name}`
  } else {
    return NextResponse.json({ error: 'questionId or conceptId is required' }, { status: 400 })
  }

  // Weakness action: honest measured read of the student's own data.
  let weaknessData = ''
  if (action === 'weakness') {
    const profile = await getDemoProfile()
    const cid = conceptId ?? (questionId ? (await loadQuestion(questionId))?.concept?.id ?? null : null)
    if (cid) {
      const [state, attempts, patterns] = await Promise.all([
        db.knowledgeState.findUnique({
          where: { profileId_conceptId: { profileId: profile.id, conceptId: cid } },
        }),
        db.questionAttempt.findMany({
          where: { profileId: profile.id, question: { conceptId: cid } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { correct: true, timeMs: true, confidence: true, errorType: true, createdAt: true },
        }),
        db.errorPattern.findMany({ where: { profileId: profile.id, conceptId: cid } }),
      ])
      const wrongs = attempts.filter((a) => !a.correct)
      const errorCounts = new Map<string, number>()
      for (const a of wrongs) if (a.errorType) errorCounts.set(a.errorType, (errorCounts.get(a.errorType) ?? 0) + 1)
      const recentWrong30d = wrongs.filter((a) => Date.now() - a.createdAt.getTime() <= 30 * DAY).length
      const avgTime = attempts.length ? Math.round(attempts.reduce((x, a) => x + a.timeMs, 0) / attempts.length) : 0
      weaknessData = `
MEASURED STUDENT DATA FOR THIS CONCEPT (never invent more):
- Mastery indicator: ${state ? `${Math.round(state.score)}% (${state.status})` : 'no data yet (never attempted)'}
- Attempts: ${state?.attemptCount ?? 0}, correct: ${state?.correctCount ?? 0}${attempts.length ? `, avg time ${avgTime} ms` : ''}
- Estimated recall: ${state ? Math.round(state.estRecall * 100) + '%' : '—'}
- Wrong attempts: ${wrongs.length} total, ${recentWrong30d} in the last 30 days
- Self-reported error types: ${errorCounts.size ? [...errorCounts.entries()].map(([t, c]) => `${t}×${c}`).join(', ') : 'none logged'}
- Logged error patterns: ${patterns.map((p) => `${p.errorType}×${p.count}`).join(', ') || 'none'}`
    }
  }

  const task: Record<AiAction, string> = {
    explain: `TASK: Give a DEEPER answer explanation for the question above — why the correct option is right and what makes the near-miss options tempting (without dumping every option). Maximum 180 words. Plain prose with bold key terms.`,
    simplify: `TASK: Explain the answer in the simplest possible language — short sentences, first-year level, no unexplained jargon, and include ONE everyday analogy that maps back to the real medical terms. Maximum 150 words.`,
    similar: `TASK: Write ONE new single-best-answer MCQ on the SAME concept, at a comparable angle, using the platform question's style. Do not copy the original stem.`,
    harder: `TASK: Write ONE new single-best-answer MCQ on the same concept, ONE step harder (more discriminators, subtler distractors, or a management-next-step angle). Difficulty level ${expectedDifficulty}/3.`,
    easier: `TASK: Write ONE new single-best-answer MCQ on the same concept, ONE step easier (clearer stem, more obvious discriminators). Difficulty level ${expectedDifficulty}/3.`,
    weakness: `TASK: Give a short honest read of the student's underlying weakness on this concept based ONLY on the measured data, then 2-3 concrete next practice steps. Maximum 150 words. If the data is thin, say so honestly instead of speculating.`,
  }

  const questionJsonSpec = `The JSON must have exactly this shape:
{"stem":"<question stem>","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"answer":"<correct option id a-d>","explanation":"<why the answer is right>","teaching":"<one-line takeaway>","difficulty":${expectedDifficulty ?? 2}}
Rules: exactly 4 options with ids a,b,c,d; "answer" must be one of those ids; keep the stem exam-realistic and self-contained.`

  const textSpec = `The JSON must have exactly this shape: {"text":"<your response, markdown allowed>"}`

  const system = `You are the adaptive-practice study assistant on MEDOS, an educational platform for Indian MBBS students preparing for NEET-PG. You support ONE action at a time; complete only the TASK given.

${grounding}${weaknessData}

${task[action]}

${action === 'explain' || action === 'simplify' || action === 'weakness' ? textSpec : questionJsonSpec}

${JSON_RULE}

${SAFETY}`

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        // The upstream API requires at least one user-role message.
        { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
      ],
      temperature: action === 'similar' || action === 'harder' || action === 'easier' ? 0.6 : 0.4,
      maxTokens: 1200,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    if (!parsed) {
      console.error('Adaptive AI: unparseable model output —', content.slice(0, 400))
      return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 502 })
    }

    if (action === 'explain' || action === 'simplify' || action === 'weakness') {
      const text = typeof parsed.text === 'string' ? parsed.text.trim().slice(0, 4000) : ''
      if (!text) {
        console.error('Adaptive AI: text action returned no text —', content.slice(0, 300))
        return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 502 })
      }
      return NextResponse.json({ text })
    }

    // Generated MCQ — validate strictly, ignore any model-invented difficulty
    // (the engine's staircase owns difficulty: base ±1, clamped). Options are
    // normalized defensively: ids may arrive upper-case, as {a:"…"} maps, or
    // under alternate key names.
    const normalizeOptions = (raw: unknown): { id: string; text: string }[] => {
      if (Array.isArray(raw)) {
        return raw
          .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : null))
          .filter((o): o is Record<string, unknown> => o !== null)
          .map((o) => ({
            id: String(o.id ?? o.label ?? o.key ?? '').trim().toLowerCase(),
            text: String(o.text ?? o.choice ?? o.option ?? '').trim(),
          }))
          .filter((o) => o.id && o.text)
      }
      if (raw && typeof raw === 'object') {
        return Object.entries(raw as Record<string, unknown>)
          .map(([id, v]) => ({
            id: id.trim().toLowerCase(),
            text: typeof v === 'string' ? v.trim() : String((v as Record<string, unknown>)?.text ?? '').trim(),
          }))
          .filter((o) => o.id && o.text)
      }
      return []
    }
    const options = normalizeOptions(parsed.options)
    // Some models emit all four options as duplicate "id"/"text" keys inside a
    // SINGLE object ({"id":"a","text":"…","id":"b","text":"…"}) — JSON.parse
    // then keeps only the last pair. Salvage every id/text pair from the raw
    // output when the parsed shape came out incomplete.
    let finalOptions = options
    if (finalOptions.length < 4) {
      const salvaged: { id: string; text: string }[] = []
      const pairRe = /"id"\s*:\s*"([a-dA-D])"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g
      let m: RegExpExecArray | null
      while ((m = pairRe.exec(content)) !== null) {
        const id = m[1].toLowerCase()
        if (!salvaged.some((o) => o.id === id)) salvaged.push({ id, text: m[2].trim() })
      }
      if (salvaged.length > finalOptions.length) finalOptions = salvaged
    }
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim().toLowerCase() : ''
    const stem = typeof parsed.stem === 'string' ? parsed.stem.trim() : ''
    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : ''
    const teaching = typeof parsed.teaching === 'string' ? parsed.teaching.trim() : ''
    const idsOk = finalOptions.length === 4 && ['a', 'b', 'c', 'd'].every((id) => finalOptions.some((o) => o.id === id))
    if (!stem || !idsOk || !finalOptions.some((o) => o.id === answer) || !explanation) {
      console.error('Adaptive AI: generated MCQ failed validation — RAW:', content.slice(0, 500))
      return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 502 })
    }
    return NextResponse.json({
      question: {
        stem,
        options: finalOptions,
        answer,
        explanation,
        teaching,
        difficulty: expectedDifficulty ?? 2,
      },
      aiGenerated: true,
      disclaimer: 'AI-generated practice question — not platform-validated',
    })
  } catch (err) {
    console.error('Adaptive AI error:', err)
    return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 502 })
  }
}
