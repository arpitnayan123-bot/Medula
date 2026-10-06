import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildAchievements, setFeatured } from '@/lib/gamify-engine'
import { readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/gamify/achievements — the curated achievement set (14, code-
// versioned) with honest unlock states and progress lines, plus the current
// featured (showcase) picks.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload = await buildAchievements(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('gamify/achievements error:', error)
    return NextResponse.json({ error: 'Failed to load achievements.' }, { status: 500 })
  }
}

// POST /api/gamify/achievements — set the featured badge showcase (cap 3,
// ids validated against the definitions; unknown ids are dropped).
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ featured?: unknown }>(req)
    if (!body || !Array.isArray(body.featured)) {
      return NextResponse.json({ error: 'featured must be an array of achievement ids.' }, { status: 400 })
    }
    const ids = body.featured.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    const profile = await getDemoProfile()
    const featured = await setFeatured(profile.id, ids)
    return NextResponse.json({ ok: true, featured })
  } catch (error) {
    console.error('gamify/achievements POST error:', error)
    return NextResponse.json({ error: 'Failed to update featured badges.' }, { status: 400 })
  }
}
