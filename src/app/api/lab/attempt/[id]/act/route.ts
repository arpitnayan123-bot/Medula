import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import {
  buildPlan,
  clampAspect,
  clampPin,
  clampReportedTimeMs,
  gradeStep,
  nextIndexFor,
  parseBrief,
  parseEvents,
  rapidPlanFromSession,
} from '@/lib/lab'
import type { LabAnswerEvent, LabEvent, LabPlanStep, LabStepInput } from '@/lib/lab'
import type { LabActResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'

const SINGLE_SELECT = new Set(['identify', 'diagnose', 'quiz', 'rapid'])

const contentKeyOf = (step: LabPlanStep, input: LabStepInput): string => {
  if (step.kind === 'locate') {
    const pins = (input.pins ?? []).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort()
    return `pins:${pins.join(';')}|aspect:${(input.aspect ?? 1).toFixed(3)}`
  }
  return `chosen:${(input.chosen ?? []).join('|')}`
}

// POST /api/lab/attempt/[id]/act — commit ONE step answer. Grading is
// DETERMINISTIC against the hidden brief (pins graded server-side). The same
// stepId event is REPLACED in the append-only log (idempotent retry, never a
// duplicate); re-acting a step with a DIFFERENT answer after it is done is a
// 400 (the feedback already revealed the answer key). Nothing advances here —
// the stage route owns stepIndex.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ stepId?: unknown; chosen?: unknown; pin?: unknown; aspect?: unknown; timeMs?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const stepId = asTrimmed(body.stepId, 60)
  if (!stepId) return NextResponse.json({ error: 'stepId is required' }, { status: 400 })

  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.labAttempt.findUnique({ where: { id }, include: { image: true } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ error: `Attempt is ${attempt.status} — no further actions` }, { status: 409 })
  }

  const events = parseEvents(attempt.answers)

  // ── build the plan for this attempt's mode ──
  let plan: LabPlanStep[]
  let briefOf: (imageId: string) => ReturnType<typeof parseBrief> | undefined
  if (attempt.mode === 'rapid') {
    const session = events.find((e): e is Extract<LabEvent, { type: 'session' }> => e.type === 'session')
    if (!session) {
      return NextResponse.json({ error: 'This rapid attempt has no session data' }, { status: 409 })
    }
    const rows = await db.labImage.findMany({ where: { id: { in: session.imageIds } } })
    const imageMap = new Map(rows.map((r) => [r.id, r as unknown as import('@/lib/lab').LabImageRowLite]))
    plan = rapidPlanFromSession(session.imageIds, imageMap)
    briefOf = (imageId) => {
      const row = imageMap.get(imageId)
      return row ? parseBrief(row.brief) : undefined
    }
  } else {
    plan = buildPlan(attempt.mode as 'identify' | 'interpret' | 'diagnose' | 'quiz', parseBrief(attempt.image.brief))
    briefOf = () => parseBrief(attempt.image.brief)
  }
  const step = plan.find((s) => s.stepId === stepId)
  if (!step) return NextResponse.json({ error: 'Unknown step for this attempt' }, { status: 404 })
  const brief = briefOf(step.imageId ?? attempt.image.id)
  if (!brief) return NextResponse.json({ error: 'Image for this step is missing' }, { status: 404 })

  // ── normalise + validate the input ──
  const input: LabStepInput = { timeMs: 0 }
  if (step.kind === 'locate') {
    const pin = clampPin(body.pin)
    if (!pin) return NextResponse.json({ error: 'pin must be {x, y} in % of the natural image' }, { status: 400 })
    input.pins = [pin]
    input.aspect = clampAspect(body.aspect)
    input.timeMs = Math.min(3600000, Math.max(0, Math.round(Number(body.timeMs)) || 0))
  } else {
    const chosen = (Array.isArray(body.chosen) ? body.chosen : [body.chosen])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((c) => c.trim())
    const validIds = new Set(step.options.map((o) => o.id))
    if (!chosen.length) {
      return NextResponse.json({ error: 'chosen must be a non-empty option id (or array of ids)' }, { status: 400 })
    }
    if (!chosen.every((c) => validIds.has(c))) {
      return NextResponse.json({ error: 'chosen contains unknown option ids' }, { status: 400 })
    }
    if (SINGLE_SELECT.has(step.kind) && chosen.length > 1) {
      return NextResponse.json({ error: 'Select exactly one option for this step' }, { status: 400 })
    }
    input.chosen = chosen
    input.timeMs =
      step.kind === 'rapid'
        ? clampReportedTimeMs(body.timeMs) // server clamp 300..30000 (binding rapid rule)
        : Math.min(3600000, Math.max(0, Math.round(Number(body.timeMs)) || 0))
  }

  // ── idempotent retry vs re-act-after-done ──
  const existing = events.find((e): e is LabAnswerEvent => e.type === 'answer' && e.stepId === stepId)
  if (existing) {
    const existingInput: LabStepInput = {
      chosen: existing.chosen,
      pins: existing.pins ?? (existing.pin ? [existing.pin] : []),
      aspect: existing.aspect,
      timeMs: existing.timeMs,
    }
    if (step.kind === 'locate') {
      // Multi-pin locate: every NEW pin accumulates into the same step —
      // the student keeps placing pins until they move on to naming.
      // Re-sending a pin already recorded is an idempotent retry.
      const merged = [...(existingInput.pins ?? [])]
      for (const p of input.pins ?? []) {
        if (!merged.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.75)) merged.push(p)
      }
      input.pins = merged
    } else if (contentKeyOf(step, existingInput) !== contentKeyOf(step, input)) {
      return NextResponse.json({ error: `Step "${stepId}" is already answered — re-acting it is not allowed` }, { status: 400 })
    }
  }

  // ── deterministic grading ──
  const feedback = gradeStep(step, brief, input)
  const newEvent: LabAnswerEvent = {
    type: 'answer',
    stepId,
    ...(input.chosen ? { chosen: input.chosen } : {}),
    ...(step.kind === 'locate' ? { pins: input.pins ?? [], aspect: input.aspect } : {}),
    correct: feedback.correct,
    score: feedback.score,
    timeMs: input.timeMs,
    ts: Date.now(),
    ...(step.kind === 'locate' && feedback.pins ? { hits: feedback.pins.hits, total: feedback.pins.total } : {}),
    ...(feedback.missed && feedback.missed.length ? { missedIds: feedback.missed.map((m) => m.id) } : {}),
  }
  const nextEvents: LabEvent[] = existing
    ? events.map((e) => (e.type === 'answer' && e.stepId === stepId ? newEvent : e))
    : [...events, newEvent]

  await db.labAttempt.update({
    where: { id },
    data: { answers: nextEvents as unknown as Prisma.InputJsonValue },
  })

  const nextIndex = nextIndexFor(plan, nextEvents)
  const payload: LabActResponse = { ok: true, feedback, nextIndex, done: nextIndex >= plan.length }
  return NextResponse.json(payload)
}
