import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { buildGraphHub, buildGraphPath, loadGraphContext } from '@/lib/knowledge-graph'
import type { GraphConceptCtx, GraphContext, GraphEdgeCtx } from '@/lib/knowledge-graph'
import type { GraphAiAction, GraphAiResponse, GraphPath, GraphHub } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/graph/ai — grounded AI actions over the Knowledge Graph ──────
// The relationship data is ALWAYS the platform's own measured graph. The LLM
// may only explain what the supplied edge + concept material already says —
// no invented facts, drugs, numbers, guidelines or references, no
// chain-of-thought. If no real edge connects a pair, the request is refused
// (422) rather than hallucinating a connection. On SDK failure a
// deterministic fallback text is assembled from the same edge data.

type AiAction = GraphAiAction
const ACTIONS: AiAction[] = ['explain-relationship', 'why-path', 'study-order']

const DISCLAIMER =
  "AI-generated educational explanation from this platform's own graph data — verify against your standard textbooks. Not medical advice."

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact). Shape: {"text":"<the answer as ONE string, newlines escaped as \\n>"}.'

const GROUNDING_RULE =
  'Use ONLY the provided graph material. Do NOT add facts, drugs, doses, numbers, guidelines or references that are not in the material. If the material is insufficient for the request, say so.'

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

function salvageText(raw: string): string {
  const m = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
  if (m) return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
  const parsed = parseLooseJson(raw)
  if (parsed) {
    const candidates = Object.values(parsed).filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 40,
    )
    if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0]!.slice(0, 4000)
  }
  return raw
    .replace(/```(?:json)?/gi, '')
    .trim()
    .slice(0, 4000)
}

// ── grounding builders (real platform rows only) ─────────────────────────────

function conceptLines(c: GraphConceptCtx, tag: string): string[] {
  return [
    `${tag} — ${c.name} (${c.kind})`,
    c.summary ? `SUMMARY: ${c.summary}` : '',
    c.whyMatters ? `WHY IT MATTERS: ${c.whyMatters}` : '',
  ].filter(Boolean)
}

function edgeGrounding(a: GraphConceptCtx, b: GraphConceptCtx, edge: GraphEdgeCtx): string {
  return [
    ...conceptLines(a, 'CONCEPT A'),
    ...conceptLines(b, 'CONCEPT B'),
    `RELATIONSHIP (the platform's own curated graph): ${a.name} → ${b.name} — type "${edge.type}"${edge.label ? `, note: "${edge.label}"` : ''}`,
  ].join('\n')
}

function pathGrounding(path: GraphPath): string {
  const lines = [
    `CONCEPT — ${path.concept.name} (${path.concept.kind})`,
    path.concept.summary ? `SUMMARY: ${path.concept.summary}` : '',
    path.concept.whyMatters ? `WHY IT MATTERS: ${path.concept.whyMatters}` : '',
    'MEASURED PATH (from the platform graph — every item below is a real relationship):',
  ]
  for (const step of path.steps) {
    lines.push(`[${step.label.toUpperCase()} — ${step.question}]`)
    for (const item of step.items) {
      lines.push(`- ${item.name}${item.edgeLabel ? ` (note: ${item.edgeLabel})` : ''}`)
    }
  }
  if (path.narrative.length) {
    lines.push('EDGE FACTS (measured cause→effect sentences):')
    for (const n of path.narrative) lines.push(`- ${n}`)
  }
  return lines.join('\n')
}

function hubGrounding(hub: GraphHub): string {
  const p = hub.personal
  const lines = [
    `CONCEPT — ${hub.concept.name} (${hub.concept.kind})`,
    hub.concept.summary ? `SUMMARY: ${hub.concept.summary}` : '',
    hub.concept.whyMatters ? `WHY IT MATTERS: ${hub.concept.whyMatters}` : '',
  ]
  if (p.missingPrerequisites.length) {
    lines.push('WEAK PREREQUISITES (measured mastery below 45% — learn first):')
    for (const m of p.missingPrerequisites) lines.push(`- ${m.name} — mastery ${m.mastery}%`)
  }
  if (p.recommendedNext.length) {
    lines.push('RECOMMENDED ORDER (measured):')
    p.recommendedNext.forEach((r, i) => lines.push(`${i + 1}. ${r.name} — ${r.reason}`))
  }
  if (p.weakNeighbors.length) {
    lines.push('WEAK NEIGHBOURS (measured mastery below 45%):')
    for (const w of p.weakNeighbors) lines.push(`- ${w.name} — mastery ${w.mastery}%`)
  }
  if (p.strongZones.length) {
    lines.push('ALREADY STRONG (mastery 70%+):')
    for (const s of p.strongZones) lines.push(`- ${s.name} — mastery ${s.mastery}%`)
  }
  if (!p.missingPrerequisites.length && !p.recommendedNext.length && !p.weakNeighbors.length) {
    lines.push('No measured weak spots around this concept right now.')
  }
  return lines.filter(Boolean).join('\n')
}

// ── deterministic fallbacks (AI failure never blocks the student) ────────────

function explainFallback(a: GraphConceptCtx, b: GraphConceptCtx, edge: GraphEdgeCtx): string {
  const parts = [
    `${a.name} is linked to ${b.name} in your platform graph as "${edge.type}"${edge.label ? ` — ${edge.label}` : ''}.`,
    a.summary ? `${a.name}: ${a.summary}` : '',
    b.summary ? `${b.name}: ${b.summary}` : '',
    'Study the two concepts side by side and verify the details against your standard textbook.',
  ]
  return parts.filter(Boolean).join(' ')
}

function pathFallback(path: GraphPath): string {
  const stageBits = path.steps.map((s) => `${s.label}: ${s.items.slice(0, 3).map((i) => i.name).join(', ')}`)
  const narrative = path.narrative.slice(0, 2).join(' ')
  return [
    `Measured path for ${path.concept.name}.`,
    stageBits.length ? stageBits.join(' · ') : 'No measured relationships around this concept yet.',
    narrative,
  ]
    .filter(Boolean)
    .join(' ')
}

function hubFallback(hub: GraphHub): string {
  if (!hub.personal.recommendedNext.length) {
    return `No measured weak spots around ${hub.concept.name} right now — the graph shows nothing below the weak threshold next to it.`
  }
  const ordered = hub.personal.recommendedNext
    .map((r, i) => `${i + 1}. ${r.name} — ${r.reason}`)
    .join(' ')
  return `Measured study order around ${hub.concept.name}: ${ordered}`
}

// ── edge lookup (any direction; type hint honoured first) ────────────────────

function findEdgeBetween(ctx: GraphContext, aId: string, bId: string, typeHint: string | null): GraphEdgeCtx | null {
  const between = ctx.edges.filter(
    (e) => (e.fromId === aId && e.toId === bId) || (e.fromId === bId && e.toId === aId),
  )
  if (!between.length) return null
  if (typeHint) {
    const matched = between.find((e) => e.type === typeHint)
    if (matched) return matched
  }
  return between[0]
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ action?: unknown; conceptId?: unknown; otherId?: unknown; edgeType?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const action = asTrimmed(body.action, 30) as AiAction | null
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }
  const conceptId = asTrimmed(body.conceptId, 200)
  const otherId = asTrimmed(body.otherId, 200)
  const edgeTypeRaw = asTrimmed(body.edgeType, 40)

  const profile = await getDemoProfile()
  const ctx = await loadGraphContext(profile.id)

  // ── grounding (invalid/missing ids are 4xx, never a silent hallucination) ──
  let grounding = ''
  let task = ''
  let fallbackText = ''

  if (action === 'explain-relationship') {
    if (!conceptId || !otherId) {
      return NextResponse.json({ error: 'conceptId and otherId are required for the explain-relationship action' }, { status: 400 })
    }
    const a = ctx.concepts.get(conceptId)
    const b = ctx.concepts.get(otherId)
    if (!a || !b) return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
    const edge = findEdgeBetween(ctx, a.id, b.id, edgeTypeRaw)
    // honesty gate: never narrate a relationship the graph does not have
    if (!edge) {
      return NextResponse.json(
        { error: `No relationship between "${a.name}" and "${b.name}" exists in the graph yet — nothing to explain honestly.` },
        { status: 422 },
      )
    }
    grounding = edgeGrounding(a, b, edge)
    fallbackText = explainFallback(a, b, edge)
    task = `TASK: Explain ONLY this relationship to an MBBS student in 120–180 words — what connects "${a.name}" and "${b.name}", and why the link matters for understanding. Use ONLY the material above; do not add facts, drugs, numbers, guidelines or references that are not in it.`
  } else if (action === 'why-path') {
    if (!conceptId) return NextResponse.json({ error: 'conceptId is required for the why-path action' }, { status: 400 })
    const path = buildGraphPath(ctx, conceptId)
    if (!path) return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
    grounding = pathGrounding(path)
    fallbackText = pathFallback(path)
    task = `TASK: Walk the student through the measured path for "${path.concept.name}" — answer each stage question (why it happens, mechanism, clinical picture, diagnosis, treatment) using ONLY the listed relationships and edge facts. Keep it under 200 words.`
  } else {
    if (!conceptId) return NextResponse.json({ error: 'conceptId is required for the study-order action' }, { status: 400 })
    const hub = buildGraphHub(ctx, conceptId)
    if (!hub) return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
    grounding = hubGrounding(hub)
    fallbackText = hubFallback(hub)
    task = `TASK: Explain the measured study order around "${hub.concept.name}" — why each listed concept comes first/next, using ONLY the measured lists above. Keep it under 180 words.`
  }

  const system = `You are a medical knowledge-graph guide on MEDOS, an educational platform for Indian MBBS students. You support ONE action at a time; complete only the TASK given.

GRAPH MATERIAL (your ONLY factual grounding — never contradict it, never go beyond it):
${grounding}

${task}

${JSON_RULE}

SAFETY (non-negotiable): ${GROUNDING_RULE} Never provide individualized medical advice or treatment decisions. NO chain-of-thought: output conclusions only, never your step-by-step deliberation.`

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        // The upstream API requires at least one user-role message.
        { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    const text =
      parsed && typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 4000) : salvageText(content)
    if (!text) throw new Error('empty AI response')
    const payload: GraphAiResponse = { ok: true, action, text, fallback: false, disclaimer: DISCLAIMER }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('Graph AI error:', err)
    // deterministic fallback assembled from the same measured graph data
    const payload: GraphAiResponse = { ok: true, action, text: fallbackText, fallback: true, disclaimer: DISCLAIMER }
    return NextResponse.json(payload)
  }
}
