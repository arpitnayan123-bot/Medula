import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { clampMinutes, parseResponses, currentPick } from '@/lib/exam'
import type { ExamConfig, ExamMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/exam/attempt/[id] — resume state for an active exam. The answer
// key stays server-side; the client receives only its own answer sheet and
// the server-authoritative deadline. Expired attempts come back with
// expired: true so the client can offer the auto-submit.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.examAttempt.findUnique({ where: { id } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ error: `Attempt is ${attempt.status}` }, { status: 409 })
  }

  const minutes = clampMinutes((attempt.config as unknown as ExamConfig)?.minutes, attempt.mode as ExamMode)
  const endsAt = new Date(attempt.startedAt.getTime() + minutes * 60_000)

  return NextResponse.json({
    attemptId: attempt.id,
    mode: attempt.mode as ExamMode,
    label: attempt.label,
    negativeMark: (attempt.config as unknown as ExamConfig)?.negativeMark ?? true,
    total: attempt.total,
    endsAt: endsAt.toISOString(),
    status: attempt.status,
    expired: endsAt.getTime() <= Date.now(),
    responses: parseResponses(attempt.responses).map((r) => ({
      questionId: r.questionId,
      history: r.history,
      timeMs: r.timeMs,
      marked: r.marked,
    })),
    answered: parseResponses(attempt.responses).filter((r) => currentPick(r) !== null).length,
  })
}
