import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { loadPlannerForProfile, buildPlanShape, computeFeasibility, realizedCapacity, generateToday, buildProgress, aiDigest } from '@/lib/planner'
import type { PlannerAiResponse, PlannerMode } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/planner/ai — grounded planning helper ─────────────────────────
// The plan itself is ALWAYS built by the deterministic engine. The LLM only
// narrates and advises on top of measured numbers: why-today, rebalance
// advice, a 1-hour shrink, realism critique, next action. It receives the
// engine digest (numbers only) — never chain-of-thought is exposed, and it
// is forbidden from predicting ranks or promising outcomes.

type AiAction = 'why' | 'rebalance' | 'shrink' | 'realism' | 'next'
const ACTIONS: AiAction[] = ['why', 'rebalance', 'shrink', 'realism', 'next']

const DISCLAIMER =
  'AI planning advice over your measured platform data — pacing arithmetic, never a rank or outcome prediction.'

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after. Shape: {"text":"<2-4 sentence answer>","bullets":["<short actionable bullet>","..."]} (2-5 bullets).'

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

// ── deterministic fallbacks (AI failure never blocks the student) ───────────
function fallbackFor(action: AiAction, digest: string, carriedOverCount: number): { text: string; bullets: string[] } {
  const lines = digest.split('\n')
  const feasibilityLine = lines.find((l) => l.startsWith('FEASIBILITY:')) ?? ''
  const todayLines = lines.filter((l) => l.startsWith('  '))
  switch (action) {
    case 'why':
      return {
        text: `Today's queue is the highest-need items measured from your own data: weakest subjects first, due revision, and open mistakes — everything else waits.`,
        bullets: todayLines.length ? todayLines.slice(0, 5).map((l) => l.trim()) : ['No pending blocks today.'],
      }
    case 'rebalance':
      return {
        text: carriedOverCount > 0
          ? `${carriedOverCount} missed item${carriedOverCount > 1 ? 's were' : ' was'} folded into today at capped priority — one off-day never breaks the plan. Phases are date-windowed, so nothing cascades.`
          : 'Nothing is pending carry-over. Missed work ages into "missed" and the top items re-enter within a day — the plan self-heals.',
        bullets: ['Skipped (deliberately) tasks do NOT come back — only missed ones carry over.', 'Catch-Up Day mode raises the carry-over cap to 45% of today\'s capacity.'],
      }
    case 'shrink':
      return {
        text: 'One-hour version: keep only the revise and practice blocks with the highest measured need, drop the rest — recall and mistakes beat passive coverage on short days.',
        bullets: ['Revise block (due cards / weak queue) — protects the forgetting curve', 'Mistake retests — fastest accuracy win', 'Skip new material today if accuracy is below ~60%'],
      }
    case 'realism':
      return {
        text: feasibilityLine
          ? `Honest read: ${feasibilityLine.replace('FEASIBILITY: ', '')}. The planner trims to high-yield automatically when the math does not close.`
          : 'Feasibility is computed from your remaining syllabus vs available days — the numbers decide, not optimism.',
        bullets: ['If overcommitted: increase daily time, defer low-yield topics, or shorten revision to one cycle.', 'This is pacing arithmetic — it never predicts ranks or outcomes.'],
      }
    case 'next':
      return {
        text: 'Start with the Priority banner task at the top of TODAY — it is the single item with the highest measured need right now.',
        bullets: todayLines.length ? [todayLines[0].trim()] : ['Open a section and finish one block — momentum first.'],
      }
  }
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ action?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const action = asTrimmed(body.action, 12) as AiAction | null
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }

  try {
    const { planRow, ctx } = await loadPlannerForProfile()

    // ── engine state (measured numbers only — the LLM sees the digest, not CoT) ──
    const realized = realizedCapacity(ctx)
    const weekdayAvg = planRow
      ? Math.round(((planRow.weekdayMinutes || planRow.dailyMinutes) * 5 + (planRow.weekendMinutes || planRow.dailyMinutes) * 2) / 7)
      : ctx.dailyMinutes
    const feasibility = planRow
      ? computeFeasibility(ctx, realized.median >= 15 && realized.days >= 5 ? realized.median : weekdayAvg, null)
      : null
    const plan = planRow ? buildPlanShape(ctx, feasibility!) : null
    // respect the persisted day mode — never regenerate today as 'auto' when
    // the student explicitly chose a different day shape.
    const dayLog = await db.plannerDayLog.findUnique({
      where: { profileId_dayKey: { profileId: ctx.profileId, dayKey: ctx.todayKey } },
    })
    const persistedMode = dayLog?.mode && isPlannerMode(dayLog.mode) ? dayLog.mode : 'auto'
    const { today } = planRow ? await generateToday(ctx, !!planRow, persistedMode, feasibility) : { today: null }
    const progress = planRow ? await buildProgress(ctx) : null
    const digest = aiDigest(ctx, plan, feasibility, today, progress)

    const taskFor: Record<AiAction, string> = {
      why: 'TASK: Explain in plain words WHY today\'s queue looks the way it does — tie each slot (Study / Practice / Revise / Test) to the student\'s own measured data (coverage, accuracy, due cards, mistakes, exam proximity).',
      rebalance: 'TASK: The student may have missed sessions. Explain how the plan absorbs missed work (carry-over caps, date-windowed phases) and give concrete advice for the current backlog state shown in the digest.',
      shrink: 'TASK: Give a one-hour compressed version of today: which blocks to keep and which to drop, justified by measured need (recall risk and mistakes beat passive coverage on short days).',
      realism: 'TASK: Critique the schedule realism honestly using the FEASIBILITY numbers: is the remaining syllabus closable in the available time? If not, give the realistic options. Never suggest the student should have started earlier.',
      next: 'TASK: Name the ONE thing to do next and why it is the highest-need item right now, from the TODAY data in the digest.',
    }

    const system = `You are a study-planning coach on MEDOS, an educational platform for Indian MBBS students preparing for NEET-PG.

MEASURED STATE (your ONLY grounding — use these numbers, do not invent any):
${digest}

${taskFor[action]}

RULES (non-negotiable):
- Be concrete and warm; speak to one student, not an audience.
- Use ONLY the measured numbers above; never invent statistics, dates, ranks, or cutoffs.
- NEVER predict ranks, scores, or exam outcomes, and never promise success. Feasibility is pacing arithmetic, nothing more.
- NO chain-of-thought: give conclusions and advice only, never your step-by-step deliberation.
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
      const text = typeof parsed?.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 900) : ''
      if (!text) throw new Error('empty AI response')
      const bullets = Array.isArray(parsed?.bullets)
        ? (parsed!.bullets as unknown[]).filter((b): b is string => typeof b === 'string' && b.trim().length > 0).slice(0, 5)
        : []
      const payload: PlannerAiResponse = { ok: true, action, text, bullets, fallback: false, disclaimer: DISCLAIMER }
      return NextResponse.json(payload)
    } catch {
      const fb = fallbackFor(action, digest, today?.carriedOverCount ?? 0)
      const payload: PlannerAiResponse = { ok: true, action, text: fb.text, bullets: fb.bullets, fallback: true, disclaimer: DISCLAIMER }
      return NextResponse.json(payload)
    }
  } catch (err) {
    console.error('[api/planner/ai]', err)
    return NextResponse.json({ error: 'AI planning action failed' }, { status: 500 })
  }
}

// tiny helper — validate a persisted mode string
function isPlannerMode(v: string): v is PlannerMode {
  return ['auto', 'full', 'two-hour', 'one-hour', 'revision', 'mock', 'catch-up', 'last-30', 'emergency'].includes(v)
}
