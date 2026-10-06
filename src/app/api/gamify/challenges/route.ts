import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getDemoProfile } from '@/lib/profile'
import { buildChallenges, enrollChallenge, abandonChallenge } from '@/lib/gamify-engine'
import { readJson, asTrimmed } from '@/lib/http'

export const dynamic = 'force-dynamic'

// GET /api/gamify/challenges — the six adaptive challenges with live
// measured progress, enrolled/active/completed state and honest suggestions
// (max 2) derived from the student's real baseline.
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const payload = await buildChallenges(profile.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('gamify/challenges error:', error)
    return NextResponse.json({ error: 'Failed to load challenges.' }, { status: 500 })
  }
}

// POST /api/gamify/challenges — enroll (freezes the measured adaptive
// baseline + target in startSnap) or abandon (leaving is always fine).
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ challengeId?: unknown; action?: unknown }>(req)
    const challengeId = asTrimmed(body?.challengeId, 64)
    const action = asTrimmed(body?.action, 16)
    if (!challengeId || (action !== 'enroll' && action !== 'abandon')) {
      return NextResponse.json({ error: 'challengeId and action (enroll|abandon) are required.' }, { status: 400 })
    }
    const profile = await getDemoProfile()
    let challenge
    if (action === 'enroll') {
      try {
        challenge = await enrollChallenge(profile.id, challengeId)
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          return NextResponse.json({ error: 'Already enrolled in this challenge.' }, { status: 409 })
        }
        if (e instanceof Error && e.message === 'unknown challenge') {
          return NextResponse.json({ error: 'Unknown challenge.' }, { status: 404 })
        }
        throw e
      }
    } else {
      challenge = await abandonChallenge(profile.id, challengeId)
    }
    return NextResponse.json({ ok: true, challenge })
  } catch (error) {
    console.error('gamify/challenges POST error:', error)
    return NextResponse.json({ error: 'Failed to update the challenge.' }, { status: 400 })
  }
}
