import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

// POST /api/lab/attempt/[id]/abandon — quit the run. Idempotent for already
// abandoned attempts; a completed run is never rewriteable.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.labAttempt.findUnique({ where: { id } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status === 'completed') {
    return NextResponse.json({ error: 'Completed attempts cannot be abandoned' }, { status: 409 })
  }
  await db.labAttempt.update({ where: { id }, data: { status: 'abandoned' } })
  return NextResponse.json({ ok: true })
}
