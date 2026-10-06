import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildRewards } from '@/lib/gamify-engine'

export const dynamic = 'force-dynamic'

// GET /api/gamify/rewards — non-monetary rewards: level-gated accent themes
// (scoped to this section), featured badges, challenge badges and study-group
// recognition. Educational recognition only — no coins, no purchases.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload = await buildRewards(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('gamify/rewards error:', error)
    return NextResponse.json({ error: 'Failed to load rewards.' }, { status: 500 })
  }
}
