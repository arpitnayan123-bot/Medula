import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { readJson } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { parseBrief, parseEvents } from '@/lib/sim'
import type { SimStageEvent } from '@/lib/sim'

export const dynamic = 'force-dynamic'

// POST /api/sim/attempt/[id]/stage — the student moved to another stage
// (stage rail navigation). Records the position + a stage event so the run
// can always be resumed exactly where it was.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ stageIndex?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const attempt = await db.simCaseAttempt.findUnique({ where: { id }, include: { case: true } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ error: `Attempt is ${attempt.status} — no further actions` }, { status: 409 })
  }

  const brief = parseBrief(attempt.case.brief)
  const maxIdx = Math.max(0, brief.stages.length - 1)
  const stageIndex = Math.round(Number(body.stageIndex))
  if (!Number.isFinite(stageIndex) || stageIndex < 0 || stageIndex > maxIdx) {
    return NextResponse.json({ error: `stageIndex must be an integer between 0 and ${maxIdx}` }, { status: 400 })
  }

  const stageEvent: SimStageEvent = { type: 'stage', stageIndex, ts: Date.now() }
  await db.simCaseAttempt.update({
    where: { id },
    data: {
      stageIndex,
      events: [...parseEvents(attempt.events), stageEvent] as unknown as Prisma.InputJsonValue,
    },
  })
  return NextResponse.json({ ok: true })
}
