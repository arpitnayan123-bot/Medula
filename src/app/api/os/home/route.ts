// ═══════════════ MEDICAL EDUCATION OS — command center payload (PRODUCT 20) ═══════════════
// One request composes every existing engine into the unified "what should I
// do next" feed (see lib/os-engine.ts for the published priority rule and the
// honesty rules). No feature is re-implemented here — this is coordination.

import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildOsCommandCenter } from '@/lib/os-engine'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    if (!profile) {
      return NextResponse.json({ error: 'No profile found.' }, { status: 404 })
    }
    const payload = await buildOsCommandCenter(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('os/home error:', error)
    return NextResponse.json({ error: 'Failed to load your command center.' }, { status: 500 })
  }
}
