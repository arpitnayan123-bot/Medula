import { NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadSimHome } from '@/lib/sim'

export const dynamic = 'force-dynamic'

// GET /api/sim/home — the Case Simulator landing payload: measured study
// stats, per-specialty accuracy, the full case library summary, weak areas,
// repeated misses, the recommended next case + difficulty and any resumable
// attempt. Every number is MEASURED from SimCaseAttempt rows.
export async function GET() {
  const profile = await getDemoProfile()
  const home = await loadSimHome(profile.id)
  return NextResponse.json(home)
}
