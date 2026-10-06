import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { communityHome } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/home — the community landing payload: measured stats,
// measured accountability snapshot, featured threads, all spaces with
// personalised reason tags, For-You picks (null when no learning signal),
// your groups, guidelines state and block/mute counts.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload = await communityHome(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('community/home error:', error)
    return NextResponse.json({ error: 'Failed to load community home.' }, { status: 500 })
  }
}
