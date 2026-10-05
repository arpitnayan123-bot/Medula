import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { guidedSteps, parseBrief } from '@/lib/lab'
import type { LabAiResponse } from '@/lib/types'
import { LAB_PROVENANCE_META } from '@/lib/types'
import type { LabProvenance } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/lab/ai — grounded image tutor ────────────────────────────────
// The LLM may only explain what the image's curated brief already says
// (finding labels/descriptions/whys, diagnosis, teaching pearls, sourceNote,
// aiBrief) plus similar images' briefs for comparison questions. Uncertainty
// framing is MANDATORY — never a definitive diagnosis, never certain
// interpretation, never medical advice. NO chain-of-thought: conclusions
// only. On SDK failure a deterministic fallback assembled from the guided
// reveal steps keeps the study view usable.

const DISCLAIMER =
  "AI-generated educational explanation grounded in this platform's curated teaching material — not a diagnosis, not medical advice."
const AI_BADGE = 'AI-GENERATED · EDUCATIONAL'
const REPLY_CHAR_CAP = 1000

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact). Shape: {"reply":"<your answer as ONE string, newlines escaped as \\n>"}.'

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

function salvageReply(raw: string): string {
  const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
  if (m) return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
  const parsed = parseLooseJson(raw)
  if (parsed) {
    const candidates = Object.values(parsed).filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 20,
    )
    if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0]!.slice(0, REPLY_CHAR_CAP)
  }
  return raw
    .replace(/```(?:json)?/gi, '')
    .trim()
    .slice(0, REPLY_CHAR_CAP)
}

// ── grounding builders (curated brief rows only) ─────────────────────────────

function imageGrounding(row: {
  title: string
  modality: string
  system: string
  provenance: string
  sourceNote: string
  diagnosis: string
  brief: unknown
}): string {
  const brief = parseBrief(row.brief)
  const provenance = LAB_PROVENANCE_META[row.provenance as LabProvenance]
  const lines = [
    `IMAGE — "${row.title}" (${row.modality}, ${row.system})`,
    provenance ? `PROVENANCE: ${provenance.badge} — ${provenance.note}` : '',
    row.sourceNote ? `SOURCE NOTE: ${row.sourceNote}` : '',
    `CURATED TEACHING DIAGNOSIS: ${row.diagnosis}`,
    'CURATED FINDINGS (the only findings you may speak about):',
  ]
  for (const f of brief.findings) {
    lines.push(
      f.present === false
        ? `- ABSENT (deliberate negative for teaching): ${f.label} — ${f.description} Why it matters: ${f.why}`
        : `- ${f.primary ? 'PRIMARY. ' : ''}${f.label} — ${f.description} Why it matters: ${f.why}`,
    )
  }
  if (brief.teaching.length) {
    lines.push('TEACHING PEARLS:')
    for (const t of brief.teaching) lines.push(`- ${t}`)
  }
  if (brief.aiBrief) {
    lines.push(`GROUNDING NOTE: ${brief.aiBrief}`)
  }
  return lines.filter(Boolean).join('\n')
}

function similarGrounding(
  rows: { title: string; modality: string; diagnosis: string; brief: unknown }[],
): string {
  return rows
    .map((row) => {
      const brief = parseBrief(row.brief)
      const labels = brief.findings.map((f) => f.label).join('; ')
      return `- "${row.title}" (${row.modality}) — curated diagnosis: ${row.diagnosis}. Findings: ${labels || 'none listed'}`
    })
    .join('\n')
}

// ── deterministic fallback (AI failure never blocks the student) ─────────────

function fallbackReply(row: { title: string; diagnosis: string; brief: unknown }): string {
  const brief = parseBrief(row.brief)
  const steps = guidedSteps(brief)
  const findingLines = steps.map((s) => s.label)
  const pearl = brief.teaching[0] ?? ''
  const parts = [
    `In this teaching image ("${row.title}"), the curated findings to recognise are: ${findingLines.join('; ') || row.diagnosis}.`,
    pearl,
    '(The image-tutor AI is unavailable right now — the guided explanation below still works fully.)',
  ]
  return parts.filter(Boolean).join(' ').slice(0, REPLY_CHAR_CAP)
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ imageId?: unknown; question?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const imageId = asTrimmed(body.imageId, 100)
  const question = asTrimmed(body.question, 1000)
  if (!imageId || !question) {
    return NextResponse.json({ error: 'imageId and question are required' }, { status: 400 })
  }

  await getDemoProfile() // single-profile platform — kept for pattern parity
  const image = await db.labImage.findUnique({ where: { id: imageId } })
  if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  if (!image.aiReady) {
    return NextResponse.json({ error: 'The AI tutor is not available for this image' }, { status: 409 })
  }

  // similar teaching images for comparison questions: same compareGroup first,
  // then same modality — never self, capped at 3
  const similarRows = image.compareGroup
    ? await db.labImage.findMany({
        where: { id: { not: image.id }, OR: [{ compareGroup: image.compareGroup }, { modality: image.modality }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    : await db.labImage.findMany({
        where: { id: { not: image.id }, modality: image.modality },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
  const similar = similarRows.slice(0, 3)

  const system = `You are the image tutor on MEDOS, an educational platform for Indian MBBS students. You answer ONE student question about ONE teaching image.

THE IMAGE (your ONLY factual grounding for this image — never contradict it, never go beyond it):
${imageGrounding(image)}

SIMILAR TEACHING IMAGES (platform material you may use for comparison questions):
${similar.length ? similarGrounding(similar) : '(none available)'}

RULES (non-negotiable):
- Ground EVERY claim in the material above. If the material cannot answer the question, say so honestly.
- Uncertainty framing is MANDATORY: say "In this teaching image…" or "the curated findings show…". NEVER present an interpretation as certain and NEVER state a definitive diagnosis as fact — these are teaching materials, and a real diagnosis always needs the full clinical picture.
- This is education, not medical advice: never advise an individual patient; if asked, redirect to their treating doctor.
- NO chain-of-thought: give conclusions only — never narrate step-by-step reasoning.
- At most 130 words, plain English.

${JSON_RULE}`

  let reply = ''
  let fallback = false
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        // The upstream API requires at least one user-role message.
        { role: 'user', content: question },
      ],
      temperature: 0.2,
      maxTokens: 600,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    const text =
      parsed && typeof parsed.reply === 'string' && parsed.reply.trim()
        ? parsed.reply.trim().slice(0, REPLY_CHAR_CAP)
        : salvageReply(content)
    if (!text) throw new Error('empty AI response')
    reply = text
  } catch (err) {
    console.error('Lab AI error:', err)
    fallback = true
    reply = fallbackReply(image)
  }

  const payload: LabAiResponse = { ok: true, reply, fallback, disclaimer: DISCLAIMER, aiBadge: AI_BADGE }
  return NextResponse.json(payload)
}
