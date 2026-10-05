import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { clientCase, parseEvents } from '@/lib/sim'

export const dynamic = 'force-dynamic'

// GET /api/sim/cases/[id] — client-safe case detail (brief stripped: options
// carry {id,label} only, no verdicts/whys/findings/keys/costs) plus any
// active attempt to resume.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const row = await db.simCase.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const attempts = await db.simCaseAttempt.findMany({
    where: { profileId: profile.id, caseId: id },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
  })

  // most recent ACTIVE attempt → resume payload (events = the student's own
  // progress log; the answer key itself still never leaves the server)
  const active = [...attempts].reverse().find((a) => a.status === 'active')

  return NextResponse.json({
    case: clientCase(row, attempts),
    resume: active
      ? {
          attemptId: active.id,
          stageIndex: active.stageIndex,
          mode: active.mode,
          startedAt: active.startedAt.toISOString(),
          events: parseEvents(active.events),
        }
      : null,
  })
}
