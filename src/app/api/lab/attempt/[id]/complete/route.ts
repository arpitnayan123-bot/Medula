import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import {
  buildDebrief,
  buildPlan,
  feedMistakes,
  parseBrief,
  parseConceptIds,
  parseEvents,
  rapidPlanFromSession,
  scoreAttempt,
} from '@/lib/lab'
import type { LabEvent, LabImageRowLite, LabPlanStep } from '@/lib/lab'

export const dynamic = 'force-dynamic'

// POST /api/lab/attempt/[id]/complete — close the run: deterministic scoring
// from the event log, attempt + StudySession updates, mistake-intelligence
// feed (exactly ONCE) and the full debrief. Double-completing is a 409 (no
// force escape — a second pass would double-feed the mistake intelligence).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.labAttempt.findUnique({ where: { id }, include: { image: true } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status === 'completed') {
    return NextResponse.json({ error: 'Attempt already completed' }, { status: 409 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json(
      { error: `Attempt is ${attempt.status} — only active attempts can be completed` },
      { status: 409 },
    )
  }

  const events = parseEvents(attempt.answers)

  // ── plan (rapid rebuilds from the stored session; other modes from the brief) ──
  let plan: LabPlanStep[]
  let briefOf: (imageId: string) => ReturnType<typeof parseBrief> | undefined
  if (attempt.mode === 'rapid') {
    const session = events.find((e): e is Extract<LabEvent, { type: 'session' }> => e.type === 'session')
    if (!session) {
      return NextResponse.json({ error: 'This rapid attempt has no session data' }, { status: 409 })
    }
    const rows = await db.labImage.findMany({ where: { id: { in: session.imageIds } } })
    const imageMap = new Map(rows.map((r) => [r.id, r as unknown as LabImageRowLite]))
    plan = rapidPlanFromSession(session.imageIds, imageMap)
    briefOf = (imageId) => {
      const row = imageMap.get(imageId)
      return row ? parseBrief(row.brief) : undefined
    }
  } else {
    plan = buildPlan(attempt.mode as 'identify' | 'interpret' | 'diagnose' | 'quiz', parseBrief(attempt.image.brief))
    briefOf = () => parseBrief(attempt.image.brief)
  }

  const scores = scoreAttempt(plan, events)
  const now = new Date()
  const timeMs = Math.max(0, now.getTime() - attempt.startedAt.getTime())
  const updated = await db.labAttempt.update({
    where: { id },
    data: {
      status: 'completed',
      completedAt: now,
      score: scores.total,
      correct: scores.correct,
      findingsHit: scores.findingsHit,
      findingsTotal: scores.findingsTotal,
      timeMs,
    },
  })

  // shared study-session feed (always logged on graded completion, even for a
  // very short run)
  await db.studySession.create({
    data: {
      profileId: profile.id,
      minutes: Math.max(1, Math.round(timeMs / 60000)),
      kind: 'lab',
      label: attempt.image.title,
    },
  })

  const mistakeFed = await feedMistakes(
    profile.id,
    {
      title: attempt.image.title,
      diagnosis: attempt.image.diagnosis,
      conceptIds: parseConceptIds(attempt.image.conceptIds),
    },
    { mode: attempt.mode, correct: scores.correct, findingsHit: scores.findingsHit, findingsTotal: scores.findingsTotal },
  )

  const debrief = await buildDebrief(
    profile.id,
    attempt.image as unknown as LabImageRowLite,
    {
      id: updated.id,
      mode: updated.mode,
      score: updated.score,
      correct: updated.correct,
      findingsHit: updated.findingsHit,
      findingsTotal: updated.findingsTotal,
      timeMs: updated.timeMs,
    },
    events,
    plan,
    briefOf,
    mistakeFed,
  )
  return NextResponse.json(debrief)
}
