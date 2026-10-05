import { NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadLabHome } from '@/lib/lab'

export const dynamic = 'force-dynamic'

// GET /api/lab/home — the Image Lab landing payload: measured study stats,
// per-modality accuracy, the full image library summary, weak modalities,
// missed finding patterns, the recommended next image and any resumable
// attempt. Every number is MEASURED from LabAttempt rows.
export async function GET() {
  const profile = await getDemoProfile()
  const home = await loadLabHome(profile.id)
  return NextResponse.json(home)
}
