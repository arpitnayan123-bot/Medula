import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates, buildContent } from '@/lib/brain-engine'
import { asTrimmed } from '@/lib/http'
import type { BrainContentPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/content — measured platform content recommendations for the
// focus concept (?conceptId= optional). Respects contentPersonalizationOn:
// when OFF it falls back to the highest exam-weight concept (still measured)
// with an honest note.
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const conceptId = asTrimmed(req.nextUrl.searchParams.get('conceptId'), 64)
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)
    const payload: BrainContentPayload = buildContent(ctx, states, conceptId ?? undefined)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/content error:', error)
    return NextResponse.json({ error: 'Failed to build content recommendations.' }, { status: 500 })
  }
}
