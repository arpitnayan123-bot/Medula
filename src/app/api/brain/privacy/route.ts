import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, buildPrivacy, setBrainPrivacy } from '@/lib/brain-engine'
import { readJson } from '@/lib/http'
import type { BrainPrivacyPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

const BOOLEAN_KEYS = [
  'personalizationOn',
  'tutorContextOn',
  'questionPersonalizationOn',
  'revisionPersonalizationOn',
  'contentPersonalizationOn',
  'historySnapshotsOn',
] as const

// GET /api/brain/privacy — stored-data inventory, private-by-default promise
// and the published derivation rules.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const payload: BrainPrivacyPayload = buildPrivacy(ctx)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/privacy GET error:', error)
    return NextResponse.json({ error: 'Failed to load privacy settings.' }, { status: 500 })
  }
}

// POST /api/brain/privacy — partial settings update. Only the 6 whitelisted
// boolean keys are accepted; anything else → 400. Returns the refreshed
// privacy payload so the client can render the new state in one round-trip.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<Record<string, unknown>>(req)
    if (!body) {
      return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 })
    }
    const patch: Partial<Record<(typeof BOOLEAN_KEYS)[number], boolean>> = {}
    for (const key of BOOLEAN_KEYS) {
      const v = body[key]
      if (v === undefined) continue
      if (typeof v !== 'boolean') {
        return NextResponse.json({ error: `${key} must be a boolean.` }, { status: 400 })
      }
      patch[key] = v
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: `Provide at least one of: ${BOOLEAN_KEYS.join(', ')}.` }, { status: 400 })
    }
    const profile = await getDemoProfile()
    await setBrainPrivacy(profile.id, patch)
    const ctx = await loadBrainContext(profile.id)
    const payload: BrainPrivacyPayload = buildPrivacy(ctx)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/privacy POST error:', error)
    return NextResponse.json({ error: 'Failed to update privacy settings.' }, { status: 500 })
  }
}
