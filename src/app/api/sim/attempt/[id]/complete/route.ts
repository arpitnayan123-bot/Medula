import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { buildDebrief, feedMistakes, parseBrief, parseEvents, scoreAttempt } from '@/lib/sim'

export const dynamic = 'force-dynamic'

// POST /api/sim/attempt/[id]/complete — close the run: deterministic scoring
// from the event log, attempt + StudySession updates, mistake-intelligence
// feed and the full debrief. Double-completing is a 409 (no ?force escape —
// a second pass would double-feed the mistake intelligence).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.simCaseAttempt.findUnique({ where: { id }, include: { case: true } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status === 'completed') {
    return NextResponse.json({ error: 'Attempt already completed' }, { status: 409 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ error: `Attempt is ${attempt.status} — only active attempts can be completed` }, { status: 409 })
  }

  const brief = parseBrief(attempt.case.brief)
  const events = parseEvents(attempt.events)
  const scores = scoreAttempt(brief, events)

  const now = new Date()
  const timeMs = Math.max(0, now.getTime() - attempt.startedAt.getTime())
  const updated = await db.simCaseAttempt.update({
    where: { id },
    data: {
      status: 'completed',
      completedAt: now,
      score: scores.total,
      diagnosisCorrect: scores.diagnosisCorrect,
      reasoning: scores.reasoning,
      investigations: scores.investigations,
      management: scores.management,
      timeMs,
    },
  })

  // shared study-session feed (always logged, even for a very short run)
  await db.studySession.create({
    data: {
      profileId: profile.id,
      minutes: Math.max(1, Math.round(timeMs / 60000)),
      kind: 'case',
      label: attempt.case.title,
    },
  })

  const mistakeFed = await feedMistakes(profile.id, attempt.case, brief, {
    diagnosisCorrect: scores.diagnosisCorrect,
    reasoning: scores.reasoning,
    events,
  })

  const debrief = await buildDebrief(profile.id, attempt.case, updated, events, mistakeFed)
  return NextResponse.json(debrief)
}
