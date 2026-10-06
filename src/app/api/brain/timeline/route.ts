import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildTimeline } from '@/lib/brain-engine'
import type { BrainTimelinePayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/timeline — the longitudinal view: one point per materialized
// IST-day snapshot (mastery/strong/at-risk/needs-revision + accuracy).
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload: BrainTimelinePayload = await buildTimeline(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/timeline error:', error)
    return NextResponse.json({ error: 'Failed to load your timeline.' }, { status: 500 })
  }
}
