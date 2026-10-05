import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { buildReview } from '@/lib/exam'

export const dynamic = 'force-dynamic'

// GET /api/exam/review/[id] — full post-test review: every question with the
// correct answer, explanation, per-option wrong-notes, concept/topic links,
// all-time mistake status, bookmark state. Only reachable AFTER submit.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.examAttempt.findUnique({ where: { id } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'submitted' || !attempt.report) {
    return NextResponse.json({ error: 'Review unlocks after the test is submitted' }, { status: 409 })
  }

  const review = await buildReview({
    id: attempt.id,
    profileId: attempt.profileId,
    mode: attempt.mode,
    label: attempt.label,
    questionIds: attempt.questionIds,
    responses: attempt.responses,
    report: attempt.report,
  })
  return NextResponse.json(review)
}
