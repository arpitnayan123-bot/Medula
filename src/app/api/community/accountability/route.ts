import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { accountabilityPayload } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/accountability — the measured accountability workspace:
// full snapshot (streaks, today/week activity, goals, planned-vs-completed,
// group challenges), a 14-day IST history strip, active commitments and one
// gentle coaching tip. Every number is measured from real study activity.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload = await accountabilityPayload(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('community/accountability error:', error)
    return NextResponse.json({ error: 'Failed to load accountability data.' }, { status: 500 })
  }
}
