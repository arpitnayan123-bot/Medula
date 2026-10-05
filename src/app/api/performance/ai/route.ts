import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { readJson, asTrimmed } from '@/lib/http'
import { buildPerformancePayload, buildPerformanceDigest } from '@/lib/performance'
import type { PerformanceAiAction, PerformanceAiResponse, PerformanceHandoff } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/performance/ai — the AI Analyst ──────────────────────────────
// PERFORMANCE & READINESS INTELLIGENCE (PRODUCT 13).
// The full performance profile is ALWAYS computed by the deterministic engine
// (src/lib/performance.ts). The LLM only narrates over the measured digest —
// it can see the student's real numbers and nothing else, it may not invent
// statistics, predict ranks or scores, and never exposes chain-of-thought.
// Action buttons attached to each answer are engine-built (measured), never
// AI-generated.

const ACTIONS: PerformanceAiAction[] = ['weekly_focus', 'weakest_subject', 'why_slow', 'why_mistakes', 'mock_ready', 'ask']

const DISCLAIMER =
  'AI Analyst answers are grounded ONLY in your measured platform signals — they never predict ranks, scores or results.'

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after. Shape: {"text":"<answer>","bullets":["<short point>","..."]} (0-4 bullets).'

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

// ── measured action hand-offs per intent (engine-owned, never AI-invented) ──
function actionsFor(action: PerformanceAiAction, p: Awaited<ReturnType<typeof buildPerformancePayload>>, question: string): PerformanceHandoff[] {
  const firstWeak = p.weaknesses[0]
  const topSubject = p.subjects[0]
  switch (action) {
    case 'weekly_focus': {
      const acts: PerformanceHandoff[] = []
      for (const ins of p.insights.slice(0, 2)) if (ins.actions[0]) acts.push(ins.actions[0])
      if (p.indicators.revisionDebt.count >= 8 && !acts.some((a) => a.kind === 'revision')) {
        acts.push({ kind: 'revision', label: 'Start Smart Revision' })
      }
      if (firstWeak && !acts.some((a) => a.kind === firstWeak.action.kind && a.label === firstWeak.action.label)) {
        acts.push(firstWeak.action)
      }
      return acts.slice(0, 3)
    }
    case 'weakest_subject': {
      const acts: PerformanceHandoff[] = []
      if (firstWeak) acts.push(firstWeak.action)
      if (topSubject) acts.push({ kind: 'learn', label: `Review ${topSubject.name} topics`, learn: { kind: 'subject', id: topSubject.id } })
      return acts.slice(0, 2)
    }
    case 'why_slow': {
      const acts: PerformanceHandoff[] = []
      if (firstWeak) acts.push(firstWeak.action)
      acts.push({ kind: 'planner', label: 'Re-plan the week' })
      return acts.slice(0, 2)
    }
    case 'why_mistakes': {
      const acts: PerformanceHandoff[] = [{ kind: 'mistakes', label: 'Open Mistake Intelligence' }]
      if (firstWeak) acts.push(firstWeak.action)
      return acts.slice(0, 2)
    }
    case 'mock_ready': {
      const acts: PerformanceHandoff[] = []
      if (p.examReadiness.testReadiness == null || p.indicators.mock.tests === 0) {
        acts.push({ kind: 'exam', label: 'Take a short subject mock', exam: { mode: 'subject' } })
      } else {
        acts.push({ kind: 'exam', label: 'Open the Exam Lab', exam: { mode: 'full' } })
      }
      if (p.indicators.revisionDebt.count >= 8) acts.push({ kind: 'revision', label: 'Clear revision debt first' })
      return acts.slice(0, 2)
    }
    case 'ask': {
      const acts: PerformanceHandoff[] = []
      if (firstWeak) acts.push(firstWeak.action)
      if (p.insights[0]?.actions[0] && !acts.some((a) => a.label === p.insights[0]!.actions[0]!.label)) {
        acts.push(p.insights[0].actions[0])
      }
      if (question.length > 0 && acts.length === 0) acts.push({ kind: 'map', label: 'Open weakest-area map', map: { scope: 'weakest' } })
      return acts.slice(0, 2)
    }
  }
}

// ── deterministic fallbacks (AI failure never blocks the student) ───────────
function fallbackFor(action: PerformanceAiAction, p: Awaited<ReturnType<typeof buildPerformancePayload>>, question: string): { text: string; bullets: string[] } {
  const i = p.indicators
  const weak1 = p.weaknesses[0]
  const weak2 = p.weaknesses[1]
  const acc = i.accuracy != null ? `${i.accuracy}%` : 'no data yet'
  switch (action) {
    case 'weekly_focus':
      return {
        text: p.insights.length
          ? `This week, work the engine's top findings in order — they are ranked by measured impact on your readiness (${p.readiness.overall ?? 'provisional'}, ${p.readiness.band}).`
          : 'There is not enough measured data to rank a weekly focus yet — answer a few question sets and this fills in.',
        bullets: p.insights.slice(0, 3).map((x) => `${x.title} — ${x.why}`),
      }
    case 'weakest_subject':
      return weak1
        ? {
            text: `${weak1.kind === 'subject' ? weak1.label : `${weak1.parent ?? 'Your'} ${weak1.kind === 'topic' ? 'topic' : 'concept'} ${weak1.label}`} is the top measured priority right now.`,
            bullets: [weak1.reason, weak2 ? `Next: ${weak2.label} — ${weak2.reason}` : 'Everything else is currently lower-priority.'].filter(Boolean),
          }
        : { text: 'No weakness stands out yet — either the data is thin or performance is balanced.', bullets: ['Keep practicing; the ranking sharpens with every attempt.'] }
    case 'why_slow':
      return {
        text: `Readiness is ${p.readiness.overall ?? 'provisional'} (${p.readiness.band}). The measured limiters, in order: ${p.weaknesses.slice(0, 3).map((w) => w.signals.join(', ') || 'weakness').join('; ') || 'no dominant limiter yet'}. Accuracy ${acc}, recall ${i.recall != null ? `${Math.round(i.recall * 100)}%` : 'n/a'}, active days ${i.consistency.activeDays14}/14.`,
        bullets: p.weaknesses.slice(0, 3).map((w) => `${w.label}: ${w.reason}`),
      }
    case 'why_mistakes':
      return {
        text: `You have ${i.mistakes.open} open mistakes (${i.mistakes.repeated} repeated).${i.mistakes.topErrorType ? ` Your dominant error type is "${i.mistakes.topErrorType.type}" (${i.mistakes.topErrorType.count} occurrences).` : ''} Repeated mistakes usually persist when the underlying concept was re-read but never re-tested.`,
        bullets: p.weaknesses.filter((w) => w.signals.includes('repeated-mistakes')).slice(0, 3).map((w) => `${w.label} — ${w.reason}`),
      }
    case 'mock_ready':
      return p.examReadiness.testReadiness == null
        ? {
            text: 'There is no mock baseline yet, so readiness for a full mock cannot be judged honestly. Start with one short subject mock — it measures pace and marking discipline that practice cannot.',
            bullets: [`Practice accuracy: ${acc}`, i.speed.medianSec != null ? `Pace: ${i.speed.medianSec}s per question vs ${i.speed.pace}s target` : 'Pace: no timed data yet'],
          }
        : {
            text: `Last mock ${p.examReadiness.testReadiness.lastPercent}% (${p.examReadiness.testReadiness.band}), mean ${p.examReadiness.testReadiness.meanPercent}%. ${p.examReadiness.trajectory?.note ?? ''}`,
            bullets: [
              p.examReadiness.testReadiness.note,
              i.revisionDebt.count >= 10 ? `Caveat: ${i.revisionDebt.count} concepts of revision debt are open — mocks will under-read retention until cleared.` : 'Revision debt is low enough to trust the reading.',
            ],
          }
    case 'ask':
      return {
        text: question
          ? `Here is the measured read on that: readiness ${p.readiness.overall ?? 'provisional'} (${p.readiness.band}), accuracy ${acc}, recall ${i.recall != null ? `${Math.round(i.recall * 100)}%` : 'n/a'}, ${i.consistency.activeDays14}/14 active days, ${i.mistakes.open} open mistakes.${p.weaknesses[0] ? ` Top measured priority: ${p.weaknesses[0].label} — ${p.weaknesses[0].reason}` : ''}`
          : 'Ask a question about your preparation and the analyst will answer from your measured data only.',
        bullets: p.insights.slice(0, 2).map((x) => x.title),
      }
  }
}

const TASKS: Record<PerformanceAiAction, string> = {
  weekly_focus: 'TASK: The student asks "What should I focus on this week?" Give at most 3 priorities for THIS WEEK, each tied to a measured number from the digest, each with a concrete first step. Rank by measured impact, not by syllabus order.',
  weakest_subject: 'TASK: The student asks "What is my weakest subject?" Name it (or the top-priority weak area if subjects are mixed) using the measured mastery/accuracy/trend numbers, explain briefly why it ranks first, and note the runner-up.',
  why_slow: 'TASK: The student asks "Why am I improving slowly?" Diagnose using the measured signals only — name the 1-3 biggest limiters (e.g. low active days, revision debt, decayed recall, pace, thin coverage) with their numbers. No excuses, no filler.',
  why_mistakes: 'TASK: The student asks "Why am I making the same mistakes?" Use the open/repeated mistake counts, the dominant error type, and the repeated-mistake weaknesses in the digest to explain the likely mechanism (re-reading without re-testing, untagged errors, overconfidence on fast misses) and how to break the loop.',
  mock_ready: 'TASK: The student asks "Am I ready for a mock test?" Answer with an honest yes / almost / too-early verdict derived ONLY from mock history, timed pace, revision debt and consistency in the digest. If no mock exists, say what a first short mock would measure.',
  ask: 'TASK: Answer the student\'s question below using ONLY the measured digest. If the data cannot answer it, say exactly what signal is missing and where in the platform they can generate it. Never speculate beyond the numbers.',
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ action?: unknown; question?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const action = asTrimmed(body.action, 20) as PerformanceAiAction | null
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }
  const question = asTrimmed(body.question, 300) ?? ''

  try {
    const payload = await buildPerformancePayload()
    const digest = buildPerformanceDigest(payload)
    const actions = actionsFor(action, payload, question)

    const system = `You are the Performance Analyst on MEDULA, an educational platform for Indian MBBS students preparing for NEET-PG.

MEASURED STATE (your ONLY grounding — use these numbers, do not invent or extrapolate any):
${digest}

${TASKS[action]}${action === 'ask' && question ? `\n\nSTUDENT QUESTION: "${question}"` : ''}

RULES (non-negotiable):
- Ground every claim in the measured numbers above; never invent statistics, dates, ranks, or cutoffs.
- NEVER predict ranks, scores, cutoffs, or exam outcomes, and never promise success. Readiness talk is pacing and coverage arithmetic only.
- Be honest about thin data: if a signal is missing or marked insufficient, say so plainly instead of guessing.
- Be concrete, warm and brief; speak to one student, not an audience.
- NO chain-of-thought: give conclusions and advice only, never your step-by-step deliberation.
- Max ~170 words total.
${JSON_RULE}`

    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
        ],
        temperature: 0.35,
        maxTokens: 900,
      })
      const content = completion.choices[0]?.message?.content ?? ''
      const parsed = parseLooseJson(content)
      const text = typeof parsed?.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 1000) : ''
      if (!text) throw new Error('empty AI response')
      const bullets = Array.isArray(parsed?.bullets)
        ? (parsed!.bullets as unknown[]).filter((b): b is string => typeof b === 'string' && b.trim().length > 0).slice(0, 4)
        : []
      const res: PerformanceAiResponse = {
        ok: true, action, question: question || undefined,
        text, bullets, actions, fallback: false, disclaimer: DISCLAIMER,
      }
      return NextResponse.json(res)
    } catch {
      const fb = fallbackFor(action, payload, question)
      const res: PerformanceAiResponse = {
        ok: true, action, question: question || undefined,
        text: fb.text, bullets: fb.bullets, actions, fallback: true, disclaimer: DISCLAIMER,
      }
      return NextResponse.json(res)
    }
  } catch (err) {
    console.error('[api/performance/ai]', err)
    return NextResponse.json({ error: 'AI analyst failed' }, { status: 500 })
  }
}
