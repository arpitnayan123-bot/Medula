import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildJourney } from '@/lib/gamify-engine'

export const dynamic = 'force-dynamic'

// GET /api/gamify/journey — the Progress Journey: Subjects → Topics →
// Mastery → Milestones → Exam Readiness, all measured (same mastery bar as
// Performance Intelligence; readiness from the P13 engine).
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload = await buildJourney(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('gamify/journey error:', error)
    return NextResponse.json({ error: 'Failed to load your progress journey.' }, { status: 500 })
  }
}
