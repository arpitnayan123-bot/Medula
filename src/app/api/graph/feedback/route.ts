import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'

export const dynamic = 'force-dynamic'

// ─── POST /api/graph/feedback — student review of a relationship ─────────────
// vote 'wrong' marks that exact edge verified=false (hidden from every graph
// output until reviewed + fixed); 'helpful'/'unsure' are recorded only.

const VOTES = ['wrong', 'helpful', 'unsure'] as const
type Vote = (typeof VOTES)[number]

export async function POST(req: NextRequest) {
  const body = await readJson<{ fromId?: unknown; toId?: unknown; type?: unknown; vote?: unknown; note?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const fromId = asTrimmed(body.fromId, 200)
  const toId = asTrimmed(body.toId, 200)
  const type = asTrimmed(body.type, 40)
  const vote = asTrimmed(body.vote, 10) as Vote | null
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''

  if (!fromId || !toId || !type) {
    return NextResponse.json({ error: 'fromId, toId and type are required' }, { status: 400 })
  }
  if (!vote || !VOTES.includes(vote)) {
    return NextResponse.json({ error: `vote must be one of: ${VOTES.join(', ')}` }, { status: 400 })
  }
  if (fromId === toId) {
    return NextResponse.json({ error: 'fromId and toId must be different concepts' }, { status: 400 })
  }

  // both endpoints must be real concepts (honest feedback only)
  const concepts = await db.concept.findMany({ where: { id: { in: [fromId, toId] } }, select: { id: true } })
  if (concepts.length < 2) {
    return NextResponse.json({ error: 'fromId/toId must be existing concepts' }, { status: 400 })
  }

  const profile = await getDemoProfile()
  await db.graphFeedback.create({
    data: { profileId: profile.id, fromId, toId, type, vote, note, status: 'open' },
  })

  if (vote === 'wrong') {
    // flag that exact edge — it disappears from all graph outputs until reviewed
    await db.conceptEdge.updateMany({ where: { fromId, toId, type }, data: { verified: false } })
  }

  return NextResponse.json({ ok: true })
}
