import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates, buildTutorPack } from '@/lib/brain-engine'
import type { BrainTutorPack } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/tutor-context — transparency view: the EXACT measured blocks
// the AI tutor receives (when enabled). Nothing here is hidden from the
// student — this payload is also what /api/tutor appends to its system prompt.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)
    const payload: BrainTutorPack = buildTutorPack(ctx, states)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/tutor-context error:', error)
    return NextResponse.json({ error: 'Failed to load the tutor context pack.' }, { status: 500 })
  }
}
