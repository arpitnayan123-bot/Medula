import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildGraphHome, loadGraphContext } from '@/lib/knowledge-graph'

export const dynamic = 'force-dynamic'

// GET /api/graph/home?recent=<comma-ids> — measured Knowledge Graph home.
export async function GET(req: NextRequest) {
  const profile = await getDemoProfile()
  const recentParam = req.nextUrl.searchParams.get('recent') ?? ''
  const recentIds = recentParam ? recentParam.split(',') : []
  const ctx = await loadGraphContext(profile.id)
  const payload = buildGraphHome(ctx, recentIds)
  return NextResponse.json(payload)
}
