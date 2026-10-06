import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates, buildMemory } from '@/lib/brain-engine'
import type { BrainMemoryPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/memory — the forgetting surface: engaged concepts sorted by
// recall (lowest first), each with revisions, flashcard reps/lapses, measured
// retrieval success and per-concept signals.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)
    const payload: BrainMemoryPayload = buildMemory(ctx, states)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/memory error:', error)
    return NextResponse.json({ error: 'Failed to load your memory surface.' }, { status: 500 })
  }
}
