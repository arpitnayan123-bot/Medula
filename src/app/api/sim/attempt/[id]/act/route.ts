import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { findInteraction, gradeInteraction, parseBrief, parseEvents } from '@/lib/sim'
import type { SimActResponse } from '@/lib/types'
import type { SimEvent, SimInteractionEvent } from '@/lib/sim'

export const dynamic = 'force-dynamic'

const isInteractionEvent = (e: SimEvent): e is SimInteractionEvent => e.type === 'interaction'

// POST /api/sim/attempt/[id]/act — commit ONE interaction choice. Grading is
// DETERMINISTIC against the hidden brief. Re-acting the same interactionId
// REPLACES the stored event (idempotent), never duplicates.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await readJson<{ stageId?: unknown; interactionId?: unknown; chosen?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const stageId = asTrimmed(body.stageId, 100)
  const interactionId = asTrimmed(body.interactionId, 100)
  if (!stageId || !interactionId) {
    return NextResponse.json({ error: 'stageId and interactionId are required' }, { status: 400 })
  }
  const chosen = Array.isArray(body.chosen)
    ? body.chosen
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        .map((c) => c.trim())
        .slice(0, 30)
    : []
  if (!chosen.length) {
    return NextResponse.json({ error: 'chosen must be a non-empty array of option ids' }, { status: 400 })
  }

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
  const found = findInteraction(brief, stageId, interactionId)
  if (!found) return NextResponse.json({ error: 'Unknown stage or interaction' }, { status: 404 })

  const validIds = new Set(found.interaction.options.map((o) => o.id))
  if (!chosen.every((c) => validIds.has(c))) {
    return NextResponse.json({ error: 'chosen contains unknown option ids' }, { status: 400 })
  }
  if (typeof found.interaction.maxSelect === 'number' && chosen.length > found.interaction.maxSelect) {
    return NextResponse.json({ error: `Select at most ${found.interaction.maxSelect} options` }, { status: 400 })
  }
  if (typeof found.interaction.minSelect === 'number' && chosen.length < found.interaction.minSelect) {
    return NextResponse.json({ error: `Select at least ${found.interaction.minSelect} options` }, { status: 400 })
  }

  const feedback = gradeInteraction(found.stage, found.interaction, chosen)

  // replace-or-append the interaction event (idempotent per interactionId)
  const events = parseEvents(attempt.events)
  const newEvent: SimInteractionEvent = {
    type: 'interaction',
    stageId,
    interactionId,
    chosen,
    correct: feedback.correct,
    score: feedback.score,
    ts: Date.now(),
  }
  const existingIdx = events.findIndex((e) => isInteractionEvent(e) && e.interactionId === interactionId)
  const next = [...events]
  if (existingIdx >= 0) next[existingIdx] = newEvent
  else next.push(newEvent)

  const stageIdx = Math.max(0, brief.stages.findIndex((s) => s.id === stageId))
  const nextStageIndex = Math.max(attempt.stageIndex, stageIdx)

  const gradedIds = new Set(next.filter(isInteractionEvent).map((e) => e.interactionId))
  const stageDone = found.stage.interactions.every((it) => gradedIds.has(it.id))
  const allDone = brief.stages.every((st) => st.interactions.every((it) => gradedIds.has(it.id)))

  await db.simCaseAttempt.update({
    where: { id },
    data: { events: next as unknown as Prisma.InputJsonValue, stageIndex: nextStageIndex },
  })

  const payload: SimActResponse = {
    ok: true,
    feedback,
    stageIndex: nextStageIndex,
    stageDone,
    allDone,
  }
  return NextResponse.json(payload)
}
