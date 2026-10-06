import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { resourceDetail } from '@/lib/resource-hub'

export const dynamic = 'force-dynamic'

// GET /api/library/resources/[id] — topic-integrated detail (404 when the id
// does not resolve against the catalog or the live measured counts).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const profile = await getDemoProfile()
    const payload = await resourceDetail(decodeURIComponent(id), profile.id)
    if (!payload) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('library detail error:', err)
    return NextResponse.json({ error: 'Failed to load the resource' }, { status: 500 })
  }
}
