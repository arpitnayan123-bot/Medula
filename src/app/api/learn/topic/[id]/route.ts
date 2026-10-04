// ─── LEARN TOPIC STUDY API — one topic's full study surface ─────────────────
// GET /api/learn/topic/<id> → everything the TopicStudy surface needs.
// The payload logic lives in src/lib/topic-study.ts (shared with the Topic
// Hub route, PRODUCT 02) so both surfaces never drift apart.

import { NextResponse } from 'next/server'
import { buildTopicStudy, TopicNotFound } from '@/lib/topic-study'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    return NextResponse.json(await buildTopicStudy(id))
  } catch (err) {
    if (err instanceof TopicNotFound) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }
    console.error('[api/learn/topic] request failed:', err)
    return NextResponse.json({ error: 'Failed to load topic study data' }, { status: 500 })
  }
}
