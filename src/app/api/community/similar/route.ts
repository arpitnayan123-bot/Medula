import { NextRequest, NextResponse } from 'next/server'
import { similarSearch } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/similar?q= — deterministic (NOT AI) duplicate-question
// scan before asking: token-overlap Jaccard against open threads, title
// weighted for short queries. Helps the community stay duplicate-free.
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 3) return NextResponse.json({ posts: [] })
    const posts = await similarSearch(q.slice(0, 200))
    return NextResponse.json({ posts })
  } catch (error) {
    console.error('community/similar error:', error)
    return NextResponse.json({ error: 'Failed to scan for similar questions.' }, { status: 500 })
  }
}
