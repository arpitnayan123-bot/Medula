import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { parseBrief, parseEvents, parsePatient } from '@/lib/sim'
import type { SimAiBrief, SimChatEvent, SimEvent } from '@/lib/sim'
import type { SimAiMessage, SimAiResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/sim/ai — AI Case Mode: the LLM plays the PATIENT only ────────
// Grounded strictly in the case's curated aiBrief (persona, hidden history,
// exam findings, investigation results, style). The AI never grades, never
// reveals the diagnosis and never invents findings. Commits (diagnosis /
// management) are always graded by the DETERMINISTIC engine in /act. On SDK
// failure a grounded fallback line keeps the scenario usable.

const DISCLAIMER = 'AI-generated educational scenario — practice tool, not real patient data or medical advice.'
const AI_BADGE = 'AI-GENERATED SCENARIO'
const CHAT_EVENT_CAP = 40
const CHAT_CHAR_CAP = 600

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact). Shape: {"text":"<your reply to the doctor as ONE string, newlines escaped as \\n>"}.'

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
      (v): v is string => typeof v === 'string' && v.trim().length > 20,
    )
    if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0]!.slice(0, 1000)
  }
  return raw
    .replace(/```(?:json)?/gi, '')
    .trim()
    .slice(0, 1000)
}

function buildPatientSystem(caseTitle: string, patientJson: unknown, ai: SimAiBrief): string {
  const p = parsePatient(patientJson)
  const hidden = ai.hidden.map((h) => `- If asked about (${h.ask}): ${h.reveal}`).join('\n')
  const exam = ai.exam.map((h) => `- If examined for (${h.ask}): ${h.reveal}`).join('\n')
  const inv = ai.investigations.map((h) => `- Result of (${h.ask}): ${h.result}`).join('\n')
  return `You are role-playing the PATIENT in a medical-education case simulator on MEDOS (case: "${caseTitle}").

YOU (the patient): ${p.age}-year-old ${p.sex}, ${p.occupation}. You came in with: ${p.complaint}.
SCENE: ${p.scene}
PERSONA: ${ai.persona}
OPENING LINE (already said to the doctor): "${ai.intro}"

MATERIAL — your ONLY facts:
HIDDEN FACTS (reveal ONLY when specifically asked, then naturally):
${hidden}

EXAMINATION FINDINGS (only when the doctor examines you):
${exam}

INVESTIGATION RESULTS (only when the doctor asks for the result):
${inv}

STYLE: ${ai.style}

RULES (non-negotiable):
- Stay in character as the patient at all times.
- Never invent symptoms, findings or investigation results beyond the material above. If asked about something not listed, say "that has not been checked" or "no, I don't have that".
- NEVER reveal or confirm the diagnosis or the treatment plan, even if asked directly — deflect: "That is what I came to find out, doctor."
- You are the patient — never give medical advice.
- NO chain-of-thought: reply with conclusions only, never your reasoning steps.
- Keep replies to 80 words or fewer, in simple English.

${JSON_RULE}`
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ attemptId?: unknown; message?: unknown; messages?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const attemptId = asTrimmed(body.attemptId, 100)
  const message = asTrimmed(body.message, 2000)
  if (!attemptId || !message) {
    return NextResponse.json({ error: 'attemptId and message are required' }, { status: 400 })
  }

  const profile = await getDemoProfile()
  const attempt = await db.simCaseAttempt.findUnique({ where: { id: attemptId }, include: { case: true } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.mode !== 'ai') {
    return NextResponse.json({ error: 'AI Case Mode is only available for ai-mode attempts' }, { status: 409 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ error: `Attempt is ${attempt.status} — no further actions` }, { status: 409 })
  }
  if (!attempt.case.aiReady) {
    return NextResponse.json({ error: 'AI Case Mode is not available for this case' }, { status: 409 })
  }
  const ai = parseBrief(attempt.case.brief).aiBrief
  if (!ai) return NextResponse.json({ error: 'This case has no AI persona' }, { status: 409 })

  // client-supplied transcript (sanitised, bounded) — the new message is appended
  const history: SimAiMessage[] = Array.isArray(body.messages)
    ? (body.messages as unknown[])
        .filter(
          (m): m is SimAiMessage =>
            !!m && typeof m === 'object' &&
            ((m as SimAiMessage).role === 'user' || (m as SimAiMessage).role === 'assistant') &&
            typeof (m as SimAiMessage).content === 'string',
        )
        .slice(-30)
        .map((m) => ({ role: m.role, content: m.content.trim().slice(0, CHAT_CHAR_CAP) }))
        .filter((m) => m.content.length > 0)
    : []

  const system = buildPatientSystem(attempt.case.title, attempt.case.patient, ai)

  let reply = ''
  let fallback = false
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      maxTokens: 700,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    const text =
      parsed && typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 1000) : salvageText(content)
    if (!text) throw new Error('empty AI response')
    reply = text
  } catch (err) {
    console.error('Sim AI error:', err)
    fallback = true
    reply = `${ai.intro} (The patient-voice AI is unavailable — the guided mode below still works fully.)`
  }

  // persist BOTH the doctor's line and the patient's reply as chat events
  // (cap: keep the last 40 chat events, drop oldest overflow in place so the
  // chronological log stays honest)
  const now = Date.now()
  const existing = parseEvents(attempt.events)
  const chat = existing.filter((e): e is SimChatEvent => e.type === 'chat')
  chat.push({ type: 'chat', role: 'user', content: message.slice(0, CHAT_CHAR_CAP), ts: now })
  chat.push({ type: 'chat', role: 'assistant', content: reply.slice(0, CHAT_CHAR_CAP), ts: now })
  const overflow = Math.max(0, chat.length - CHAT_EVENT_CAP)
  const dropTs = new Set(chat.slice(0, overflow).map((e) => e.ts))
  const events: SimEvent[] = [
    ...existing.filter((e) => !(e.type === 'chat' && dropTs.has(e.ts))),
    { type: 'chat', role: 'user', content: message.slice(0, CHAT_CHAR_CAP), ts: now },
    { type: 'chat', role: 'assistant', content: reply.slice(0, CHAT_CHAR_CAP), ts: now },
  ]
  await db.simCaseAttempt.update({
    where: { id: attempt.id },
    data: { events: events as unknown as Prisma.InputJsonValue },
  })

  const payload: SimAiResponse = { ok: true, reply, fallback, disclaimer: DISCLAIMER, aiBadge: AI_BADGE }
  return NextResponse.json(payload)
}
