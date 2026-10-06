import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { setConsent } from '@/lib/gamify-engine'
import { readJson, asTrimmed } from '@/lib/http'

export const dynamic = 'force-dynamic'

// POST /api/gamify/consent — the explicit per-group privacy switch for the
// leaderboard. Reuses the P16 GroupMembership.shareData column — no new
// sharing surface. Only YOUR row is ever flipped.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ groupId?: unknown; on?: unknown }>(req)
    const groupId = asTrimmed(body?.groupId, 64)
    if (!groupId || typeof body?.on !== 'boolean') {
      return NextResponse.json({ error: 'groupId and on (boolean) are required.' }, { status: 400 })
    }
    const profile = await getDemoProfile()
    const consentOn = await setConsent(profile.id, groupId, body.on)
    return NextResponse.json({ ok: true, consentOn })
  } catch (error) {
    console.error('gamify/consent error:', error)
    return NextResponse.json({ error: error instanceof Error && error.message === 'not a member' ? 'You are not a member of this group.' : 'Failed to update sharing.' }, { status: 400 })
  }
}
