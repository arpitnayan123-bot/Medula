import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { spaceDetail } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/spaces/[id]?filter=&sort= — one space with its rules and
// post list (unresolved questions pinned first, then the chosen sort).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const profile = await getDemoProfile()
    const filter = req.nextUrl.searchParams.get('filter') ?? ''
    const sort = req.nextUrl.searchParams.get('sort') === 'top' ? 'top' : 'recent'

    const detail = await spaceDetail(profile.id, decodeURIComponent(id), filter, sort)
    if (!detail) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch (error) {
    console.error('community/spaces/[id] error:', error)
    return NextResponse.json({ error: 'Failed to load space.' }, { status: 500 })
  }
}
