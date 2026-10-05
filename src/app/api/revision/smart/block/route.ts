import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asInt, asTrimmed, readJson } from '@/lib/http'
import { parseStoredBlocks, touchConceptReview } from '@/lib/revision-engine'
import type { RevisionBlock, RevisionBlockResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/revision/smart/block — mark one plan block as done.
// Concept and compare blocks ALSO strengthen the shared KnowledgeState (same
// blend formula as /api/revision/clear), clear the concept's open revision
// items and log one StudySession. Flashcard/MCQ/PYQ/mistake blocks get their
// knowledge updates through the per-item endpoints (/api/revision/review,
// /api/attempts) which the runner calls while working through the block.
export async function POST(req: NextRequest) {
  const body = await readJson<{ sessionId?: unknown; blockId?: unknown; minutes?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const sessionId = asTrimmed(body.sessionId, 200)
  const blockId = asTrimmed(body.blockId, 200)
  if (!sessionId || !blockId) {
    return NextResponse.json({ error: 'sessionId and blockId are required' }, { status: 400 })
  }

  const profile = await getDemoProfile()
  const session = await db.revisionSession.findFirst({ where: { id: sessionId, profileId: profile.id } })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const blocks = parseStoredBlocks(session.plan)
  const index = blocks.findIndex((b) => b.id === blockId)
  if (index === -1) return NextResponse.json({ error: 'Block not found in this session' }, { status: 404 })

  const doneCount = () => blocks.filter((b) => b.done).length

  // Idempotent: marking a done block again just reports current counts.
  if (blocks[index]!.done) {
    const payload: RevisionBlockResult = { ok: true, done: doneCount(), total: blocks.length, knowledgeTouched: false }
    return NextResponse.json(payload)
  }

  const block: RevisionBlock = blocks[index]!
  let knowledgeTouched = false
  if ((block.kind === 'concept' || block.kind === 'compare') && block.conceptId) {
    const fallbackMinutes = block.minutes || 5
    const minutes = body.minutes === undefined ? fallbackMinutes : asInt(body.minutes, 1, 240, fallbackMinutes)
    knowledgeTouched = await touchConceptReview(profile.id, block.conceptId, minutes, `Smart revision — ${block.title}`)
  }

  blocks[index] = { ...block, done: true }
  await db.revisionSession.update({
    where: { id: session.id },
    data: { plan: JSON.stringify(blocks), done: doneCount() },
  })

  const payload: RevisionBlockResult = { ok: true, done: doneCount(), total: blocks.length, knowledgeTouched }
  return NextResponse.json(payload)
}
