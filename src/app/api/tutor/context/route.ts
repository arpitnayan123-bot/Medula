import { NextRequest, NextResponse } from 'next/server'
import { buildTutorContext } from '@/lib/tutor-context'

export const dynamic = 'force-dynamic'

// GET /api/tutor/context[?topicId=] — what the AI tutor knows about this
// student right now: weak areas, recurring mistakes, error patterns, due
// revision, drill history — plus, when the student is studying a topic,
// that topic's teaching context. All values are measured platform data.
export async function GET(req: NextRequest) {
  const topicId = req.nextUrl.searchParams.get('topicId')
  try {
    const ctx = await buildTutorContext(topicId)
    return NextResponse.json(ctx)
  } catch (err) {
    console.error('Tutor context error:', err)
    return NextResponse.json({ error: 'Could not build tutor context' }, { status: 500 })
  }
}
