import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildXpLedger } from '@/lib/gamify-engine'
import { asInt } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/gamify/xp — the full measured XP ledger, day-grouped, plus
// per-kind totals. Every row is a real learning action (see the published
// XP table) — never an app-open or a screen-time grant.
export async function GET(req: NextRequest) {
  try {
    const limit = asInt(req.nextUrl.searchParams.get('limit'), 10, 200, 120)
    const profile = await getDemoProfile()
    const payload = await buildXpLedger(profile.id, limit)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('gamify/xp error:', error)
    return NextResponse.json({ error: 'Failed to load the XP ledger.' }, { status: 500 })
  }
}
