import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates, buildBrainPath } from '@/lib/brain-engine'
import { asTrimmed } from '@/lib/http'
import type { BrainPathPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/path — the 7-stage dynamic learning path for a focus concept
// (?conceptId= optional; auto-picked from measured impact when absent).
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const conceptId = asTrimmed(req.nextUrl.searchParams.get('conceptId'), 64)
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)
    const payload: BrainPathPayload = buildBrainPath(ctx, states, conceptId ?? undefined)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/path error:', error)
    return NextResponse.json({ error: 'Failed to load your learning path.' }, { status: 500 })
  }
}
