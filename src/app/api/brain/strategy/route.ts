import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates, buildStrategy } from '@/lib/brain-engine'
import type { BrainStrategyPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/strategy — evidence-based exam strategy: exam clock, P13
// readiness, high-impact weaknesses, strong areas, time management, mistake
// tactics, revision gaps, test-taking signals and the playbook. Never
// predicts or guarantees a rank.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)
    const payload: BrainStrategyPayload = await buildStrategy(ctx, states)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/strategy error:', error)
    return NextResponse.json({ error: 'Failed to build your exam strategy.' }, { status: 500 })
  }
}
