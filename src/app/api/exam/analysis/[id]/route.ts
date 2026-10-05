import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import type { ExamAnalysis } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/exam/analysis/[id] — the stored measured analysis of a submitted
// test (deterministic snapshot from submit time; never recomputed, so the
// numbers can't drift from what the student was shown).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.examAttempt.findUnique({ where: { id } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'submitted' || !attempt.report) {
    return NextResponse.json({ error: 'This test has not been submitted yet' }, { status: 409 })
  }
  return NextResponse.json(attempt.report as unknown as ExamAnalysis)
}
