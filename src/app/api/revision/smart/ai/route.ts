import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { asTrimmed, readJson } from '@/lib/http'
import { parseConceptDetail } from '@/lib/revision-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// PRODUCT 06 — Smart Revision AI actions. GROUNDED ONLY in the platform's own
// concept material / confusion-pair points: the model is forbidden from adding
// facts, drugs, numbers, guidelines or references that are not in the material
// (critical for medical reliability). Responses are labelled AI-generated with
// a verify-against-textbook disclaimer. Nothing is logged to the DB.

type AiAction = 'rapid-notes' | 'recall' | 'compare'
const ACTIONS: AiAction[] = ['rapid-notes', 'recall', 'compare']

const DISCLAIMER =
  "AI-generated from this concept's platform material — verify against your standard textbook. Not medical advice."

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact).'

const GROUNDING_RULE = `Use ONLY the provided concept material. Do NOT add facts, drugs, numbers, guidelines or references that are not in the material. If the material is insufficient for the request, say so.`

// ── robust parsing (direct → fenced → brace slice → field salvage) ──────────
function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parseLooseJson(text: string): Record<string, unknown> | null {
  const direct = tryParse(text.trim())
  if (direct) return direct
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const fromFence = tryParse(fence[1]!.trim())
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

const unescapeJson = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()

function salvageText(raw: string): string {
  const m = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
  if (m) return unescapeJson(m[1])
  // The model used its own JSON key (e.g. "contrast_paragraph") — accept the
  // longest string value in the object as the note (still grounded material).
  const parsed = parseLooseJson(raw)
  if (parsed) {
    const candidates = Object.values(parsed).filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 40,
    )
    if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0]!.slice(0, 4000)
  }
  // Last resort: strip fences and use the raw output.
  return raw
    .replace(/```(?:json)?/gi, '')
    .trim()
    .slice(0, 4000)
}

function salvageQaPairs(raw: string): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = []
  const re = /"question"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const question = unescapeJson(m[1]!)
    const answer = unescapeJson(m[2]!)
    if (question && answer) pairs.push({ question, answer })
  }
  return pairs
}

// ── grounding builders (real platform rows only) ─────────────────────────────
function conceptGrounding(concept: {
  name: string
  summary: string
  whyMatters: string
  mnemonic: string
  detail: unknown
}): string {
  const lines = [
    `CONCEPT: ${concept.name}`,
    concept.summary ? `SUMMARY: ${concept.summary}` : '',
    concept.whyMatters ? `WHY IT MATTERS: ${concept.whyMatters}` : '',
    concept.mnemonic ? `MNEMONIC: ${concept.mnemonic}` : '',
  ]
  const sections = parseConceptDetail(concept.detail)
  if (sections) {
    for (const s of sections) {
      lines.push(`SECTION — ${s.h}:`)
      for (const b of s.body) lines.push(`- ${b}`)
      if (s.table) {
        lines.push(`TABLE — ${s.table.head.join(' | ')}`)
        for (const row of s.table.rows) lines.push(`  ${row.join(' | ')}`)
      }
    }
  }
  return lines.filter(Boolean).join('\n')
}

function pairGrounding(pair: {
  a: string
  b: string
  aPoints: unknown
  bPoints: unknown
  mnemonic: string
  subjectCode: string
}): string {
  const pts = (raw: unknown) => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  const lines = [
    `SUBJECT: ${pair.subjectCode}`,
    `A — ${pair.a}:`,
    ...pts(pair.aPoints).map((p) => `- ${p}`),
    `B — ${pair.b}:`,
    ...pts(pair.bPoints).map((p) => `- ${p}`),
    pair.mnemonic ? `MNEMONIC: ${pair.mnemonic}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ action?: unknown; conceptId?: unknown; pairId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const action = asTrimmed(body.action, 20) as AiAction | null
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }
  const conceptId = asTrimmed(body.conceptId, 200)
  const pairId = asTrimmed(body.pairId, 200)

  // ── grounding (invalid/missing ids are a 400, never a silent fallback) ────
  let grounding = ''
  let task = ''
  if (action === 'compare') {
    if (!pairId) return NextResponse.json({ error: 'pairId is required for the compare action' }, { status: 400 })
    const pair = await db.confusionPair.findUnique({ where: { id: pairId } })
    if (!pair) return NextResponse.json({ error: 'Confusion pair not found' }, { status: 400 })
    grounding = pairGrounding(pair)
    task = `TASK: Write a short contrast paragraph (maximum ~130 words) that clearly differentiates "${pair.a}" from "${pair.b}", built ONLY from the differentiating points provided above. Mention the mnemonic if one is provided.`
  } else {
    if (!conceptId) return NextResponse.json({ error: `conceptId is required for the ${action} action` }, { status: 400 })
    const concept = await db.concept.findUnique({
      where: { id: conceptId },
      select: { name: true, summary: true, whyMatters: true, mnemonic: true, detail: true },
    })
    if (!concept) return NextResponse.json({ error: 'Concept not found' }, { status: 400 })
    grounding = conceptGrounding(concept)
    if (action === 'rapid-notes') {
      task =
        'TASK: Produce a tight rapid-revision note for this concept (maximum ~150 words) — the shortest complete refresher possible, covering only what the material above covers. If the material is thin, say so in one line instead of padding. The JSON must have exactly this shape: {"text":"<the note as ONE string, newlines escaped as \\n>"}.'
    } else {
      task =
        'TASK: Write 4-6 active-recall question/answer pairs STRICTLY from the material above — questions a student can use to test themselves, answers short and factual. Do not go beyond the material. The JSON must have exactly this shape: {"questions":[{"question":"...","answer":"..."}]}.'
    }
  }

  const system = `You are a medical revision assistant on MEDOS, an educational platform for Indian MBBS students. You support ONE action at a time; complete only the TASK given.

CONCEPT MATERIAL (your ONLY factual grounding — never contradict it, never go beyond it):
${grounding}

${task}

${JSON_RULE}

SAFETY (non-negotiable): ${GROUNDING_RULE} Never provide individualized medical advice. NO chain-of-thought: output conclusions only, never your step-by-step deliberation.`

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        // The upstream API requires at least one user-role message.
        { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)

    if (action === 'recall') {
      const raw = Array.isArray(parsed?.questions) ? parsed!.questions : []
      const questions = raw
        .map((q) =>
          q && typeof q === 'object'
            ? { question: String((q as Record<string, unknown>).question ?? '').trim(), answer: String((q as Record<string, unknown>).answer ?? '').trim() }
            : null,
        )
        .filter((q): q is { question: string; answer: string } => !!q && !!q.question && !!q.answer)
      const finalQuestions = questions.length ? questions.slice(0, 6) : salvageQaPairs(content).slice(0, 6)
      if (!finalQuestions.length) {
        console.error('Revision AI: recall produced no usable Q/A pairs —', content.slice(0, 300))
        return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 502 })
      }
      return NextResponse.json({ questions: finalQuestions, aiGenerated: true, disclaimer: DISCLAIMER })
    }

    // rapid-notes / compare → { text }
    const text =
      parsed && typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 4000) : salvageText(content)
    if (!text) {
      console.error('Revision AI: text action returned no text —', content.slice(0, 300))
      return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 502 })
    }
    return NextResponse.json({ text, aiGenerated: true, disclaimer: DISCLAIMER })
  } catch (err) {
    console.error('Revision AI error:', err)
    return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 502 })
  }
}
