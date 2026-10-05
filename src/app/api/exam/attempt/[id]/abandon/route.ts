import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { appendEvent } from '@/lib/exam'

export const dynamic = 'force-dynamic'

// POST /api/exam/attempt/[id]/abandon — quit the paper without grading.
// Nothing is fed to the knowledge state or mistake bank (no answers were
// graded), the attempt is kept for the event log only.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.examAttempt.findUnique({ where: { id } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ ok: true as const })
  }

  await db.examAttempt.update({
    where: { id },
    data: {
      status: 'abandoned',
      events: appendEvent(attempt.events, { kind: 'abandon', at: new Date().toISOString() }),
    },
  })

  return NextResponse.json({ ok: true as const })
}
