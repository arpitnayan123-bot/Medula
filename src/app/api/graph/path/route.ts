import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildGraphPath, loadGraphContext } from '@/lib/knowledge-graph'

export const dynamic = 'force-dynamic'

// GET /api/graph/path?id=<conceptId> — Why → Mechanism → Clinical → Diagnosis
// → Treatment, with a strictly measured narrative. 404 when unknown.
export async function GET(req: NextRequest) {
  const profile = await getDemoProfile()
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id.trim()) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const ctx = await loadGraphContext(profile.id)
  const payload = buildGraphPath(ctx, id.trim())
  if (!payload) return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
  return NextResponse.json(payload)
}
