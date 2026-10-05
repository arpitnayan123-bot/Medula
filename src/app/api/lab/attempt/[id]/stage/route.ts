import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { buildPlan, parseBrief, parseEvents, rapidPlanFromSession } from '@/lib/lab'
import type { LabEvent, LabImageRowLite } from '@/lib/lab'

export const dynamic = 'force-dynamic'

// POST /api/lab/attempt/[id]/stage — the student advanced the step runner
// (locate → labels, quiz question → question, rapid item → item). Monotonic
// guard: stepIndex can only move forward, and never past the plan. Answer
// events live in `answers`; this route only owns the position marker.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ stepIndex?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

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
  let maxIdx: number
  if (attempt.mode === 'rapid') {
    const session = events.find((e): e is Extract<LabEvent, { type: 'session' }> => e.type === 'session')
    if (!session) {
      return NextResponse.json({ error: 'This rapid attempt has no session data' }, { status: 409 })
    }
    const rows = await db.labImage.findMany({ where: { id: { in: session.imageIds } } })
    const imageMap = new Map(rows.map((r) => [r.id, r as unknown as LabImageRowLite]))
    maxIdx = rapidPlanFromSession(session.imageIds, imageMap).length
  } else {
    maxIdx = buildPlan(
      attempt.mode as 'identify' | 'interpret' | 'diagnose' | 'quiz',
      parseBrief(attempt.image.brief),
    ).length
  }

  const stepIndex = Math.round(Number(body.stepIndex))
  if (!Number.isFinite(stepIndex) || stepIndex < 0 || stepIndex > maxIdx) {
    return NextResponse.json({ error: `stepIndex must be an integer between 0 and ${maxIdx}` }, { status: 400 })
  }
  if (stepIndex < attempt.stepIndex) {
    return NextResponse.json(
      { error: `stepIndex can only move forward (currently at ${attempt.stepIndex})` },
      { status: 400 },
    )
  }

  await db.labAttempt.update({ where: { id }, data: { stepIndex } })
  return NextResponse.json({ ok: true })
}
