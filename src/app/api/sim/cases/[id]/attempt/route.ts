import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

// POST /api/sim/cases/[id]/attempt — start a run. Any stale active attempt
// for this profile+case is marked 'abandoned' first so the home "resume"
// banner stays honest (one active run per case). 'ai' mode requires the case
// to be aiReady.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ mode?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const mode = body.mode === 'ai' ? 'ai' : body.mode === 'guided' ? 'guided' : null
  if (!mode) return NextResponse.json({ error: "mode must be 'guided' or 'ai'" }, { status: 400 })

  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const simCase = await db.simCase.findUnique({ where: { id } })
  if (!simCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  if (mode === 'ai' && !simCase.aiReady) {
    return NextResponse.json({ error: 'AI Case Mode is not available for this case' }, { status: 409 })
  }

  // close stale active runs of this case (idempotent; keeps resume honest)
  await db.simCaseAttempt.updateMany({
    where: { profileId: profile.id, caseId: id, status: 'active' },
    data: { status: 'abandoned' },
  })

  const attempt = await db.simCaseAttempt.create({
    data: { profileId: profile.id, caseId: id, mode, status: 'active', stageIndex: 0, events: [] },
  })
  return NextResponse.json({ attemptId: attempt.id })
}
