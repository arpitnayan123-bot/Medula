import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates, buildPractice } from '@/lib/brain-engine'
import type { BrainPracticePayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/practice — the measured question feed: confusion-pair
// discrimination + weakest-concept questions from the REAL pool. Respects
// questionPersonalizationOn: when OFF the payload is honest about it
// (empty arrays) and the handoff stays valid.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)
    const payload: BrainPracticePayload = buildPractice(ctx, states)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/practice error:', error)
    return NextResponse.json({ error: 'Failed to build your practice feed.' }, { status: 500 })
  }
}
