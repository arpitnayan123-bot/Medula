import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildExplore, loadGraphContext } from '@/lib/knowledge-graph'

export const dynamic = 'force-dynamic'

// GET /api/graph/explore?subject=<id-or-code> — the graph grouped by
// body system and topic. Unknown subject param → 404 (honest).
export async function GET(req: NextRequest) {
  const profile = await getDemoProfile()
  const subject = req.nextUrl.searchParams.get('subject')
  const ctx = await loadGraphContext(profile.id)
  const { payload, subjectFound } = buildExplore(ctx, subject)
  if (!subjectFound) return NextResponse.json({ error: 'Subject not found' }, { status: 404 })
  return NextResponse.json(payload)
}
