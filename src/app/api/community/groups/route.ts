import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { listGroups, createGroup } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/groups?mine=1 — visible groups (public + private ones you
// are in) with measured member/challenge/activity chips, plus your memberships.
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const mineOnly = req.nextUrl.searchParams.get('mine') === '1'
    const payload = await listGroups(profile.id, mineOnly)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('community/groups GET error:', error)
    return NextResponse.json({ error: 'Failed to load groups.' }, { status: 500 })
  }
}

// POST /api/community/groups — create a study group (you become the owner;
// shareData starts false — privacy is opt-in).
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{
      name?: unknown; description?: unknown; privacy?: unknown
      focusKind?: unknown; focusRef?: unknown; goalText?: unknown; meetCadence?: unknown
    }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const name = asTrimmed(body.name, 80) ?? ''
    if (name.length < 4) return NextResponse.json({ error: 'Group name must be at least 4 characters.' }, { status: 400 })

    const privacy = asTrimmed(body.privacy, 10) ?? 'public'
    if (privacy !== 'public' && privacy !== 'private') {
      return NextResponse.json({ error: 'privacy must be public or private' }, { status: 400 })
    }
    const focusKind = asTrimmed(body.focusKind, 10) ?? 'mixed'
    if (!['subject', 'topic', 'exam', 'mixed'].includes(focusKind)) {
      return NextResponse.json({ error: 'focusKind must be one of: subject, topic, exam, mixed' }, { status: 400 })
    }

    const profile = await getDemoProfile()
    const result = await createGroup(profile.id, {
      name,
      description: asTrimmed(body.description, 500) ?? '',
      privacy,
      focusKind,
      focusRef: asTrimmed(body.focusRef, 60) ?? '',
      goalText: asTrimmed(body.goalText, 300) ?? '',
      meetCadence: asTrimmed(body.meetCadence, 140) ?? '',
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    // the create result carries the full detail; members[] is derived — return
    // the summary-shaped group (members = count) to match the frozen contract.
    const detail = result.group
    const group = detail ? { ...detail, members: Array.isArray(detail.members) ? detail.members.length : 0 } : null
    return NextResponse.json({ ok: true, group }, { status: 201 })
  } catch (error) {
    console.error('community/groups POST error:', error)
    return NextResponse.json({ error: 'Failed to create group.' }, { status: 500 })
  }
}
