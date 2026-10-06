import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadGamifyHome } from '@/lib/gamify-engine'

export const dynamic = 'force-dynamic'

// GET /api/gamify/home — the Motivation landing payload: measured XP/level,
// healthy streaks (with the published recovery rule), today's measured line,
// recent XP ledger, achievement/challenge summaries and deterministic
// motivation cards. XP syncs idempotently from real study activity first.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload = await loadGamifyHome(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('gamify/home error:', error)
    return NextResponse.json({ error: 'Failed to load your motivation home.' }, { status: 500 })
  }
}
