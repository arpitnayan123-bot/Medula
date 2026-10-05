import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadGraphContext, searchGraph } from '@/lib/knowledge-graph'

export const dynamic = 'force-dynamic'

// GET /api/graph/search?q= — synonym-aware concept/topic/subject search.
// Empty q → all lists empty (not an error).
export async function GET(req: NextRequest) {
  const profile = await getDemoProfile()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const ctx = await loadGraphContext(profile.id)
  const payload = searchGraph(ctx, q)
  return NextResponse.json(payload)
}
