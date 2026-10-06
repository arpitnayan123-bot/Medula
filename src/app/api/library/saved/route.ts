import { NextRequest, NextResponse } from 'next/server'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { savedList, toggleSaved } from '@/lib/resource-hub'

export const dynamic = 'force-dynamic'

// GET /api/library/saved — the profile's saved resources (resolved honestly;
// ids that no longer resolve are dropped).
export async function GET() {
  try {
    const profile = await getDemoProfile()
    const payload = await savedList(profile.id)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('library saved list error:', err)
    return NextResponse.json({ error: 'Failed to load saved resources' }, { status: 500 })
  }
}

// POST /api/library/saved {resourceId} — toggle the bookmark. 400 on invalid ids.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ resourceId?: unknown }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    const resourceId = asTrimmed(body.resourceId, 120)
    if (!resourceId) {
      return NextResponse.json({ error: 'resourceId is required' }, { status: 400 })
    }
    const profile = await getDemoProfile()
    let result: { saved: boolean }
    try {
      result = await toggleSaved(profile.id, resourceId)
    } catch {
      return NextResponse.json({ error: 'Unknown resourceId — not in the catalog' }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('library saved toggle error:', err)
    return NextResponse.json({ error: 'Failed to toggle the bookmark' }, { status: 500 })
  }
}
