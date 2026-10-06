import { NextRequest, NextResponse } from 'next/server'
import { topicFeed } from '@/lib/resource-hub'

export const dynamic = 'force-dynamic'

// GET /api/library/for-topic/[topicId] — the topic integration feed
// (platform resources synthesized from measured counts + linked externals).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  try {
    const { topicId } = await params
    const payload = await topicFeed(decodeURIComponent(topicId))
    if (!payload) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('library topic feed error:', err)
    return NextResponse.json({ error: 'Failed to load the topic feed' }, { status: 500 })
  }
}
