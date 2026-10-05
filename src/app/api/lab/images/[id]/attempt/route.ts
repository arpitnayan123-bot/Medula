import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { buildPlan, GRADED_LAB_MODES, parseBrief } from '@/lib/lab'
import type { LabAttemptStart, LabMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/lab/images/[id]/attempt — start a graded run. 'guided' is a
// non-graded study experience handled by the study view (no attempt row), so
// it is rejected here with 400. Any stale active attempt for this
// profile+image is marked 'abandoned' first so the home "resume" banner stays
// honest (one active run per image).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ mode?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const modeRaw = asTrimmed(body.mode, 20)
  if (!modeRaw || !GRADED_LAB_MODES.includes(modeRaw as LabMode)) {
    return NextResponse.json(
      {
        error: `mode must be one of: ${GRADED_LAB_MODES.join(', ')} — 'guided' is a non-graded study view and starts no attempt`,
      },
      { status: 400 },
    )
  }
  const mode = modeRaw as LabMode

  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const image = await db.labImage.findUnique({ where: { id } })
  if (!image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

  // the plan must have at least one gradable step (defensive against a
  // malformed brief)
  const plan = buildPlan(mode as 'identify' | 'interpret' | 'diagnose' | 'quiz', parseBrief(image.brief))
  if (plan.length === 0) {
    return NextResponse.json({ error: 'This image has no gradable content for this mode' }, { status: 409 })
  }

  // close stale active runs of this image (idempotent; keeps resume honest)
  await db.labAttempt.updateMany({
    where: { profileId: profile.id, imageId: id, status: 'active' },
    data: { status: 'abandoned' },
  })

  const attempt = await db.labAttempt.create({
    data: { profileId: profile.id, imageId: id, mode, status: 'active', stepIndex: 0, answers: [] },
  })

  const payload: LabAttemptStart = { ok: true, attemptId: attempt.id, mode }
  return NextResponse.json(payload)
}
