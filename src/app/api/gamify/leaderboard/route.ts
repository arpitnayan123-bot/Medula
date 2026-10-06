import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildLeaderboard } from '@/lib/gamify-engine'
import { asTrimmed } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/gamify/leaderboard?groupId= — privacy-conscious, consent-gated
// boards over your P16 study groups. Peers are labelled demo snapshots; your
// row appears only when you turned sharing ON for that group. The headline is
// always you vs your own last week — rank stays secondary.
export async function GET(req: NextRequest) {
  try {
    const groupId = asTrimmed(req.nextUrl.searchParams.get('groupId'), 64)
    const profile = await getDemoProfile()
    const payload = await buildLeaderboard(profile.id, groupId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('gamify/leaderboard error:', error)
    return NextResponse.json({ error: 'Failed to load the board.' }, { status: 500 })
  }
}
