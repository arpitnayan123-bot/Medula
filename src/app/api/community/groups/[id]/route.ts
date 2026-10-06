import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { db } from '@/lib/db'
import { groupDetail, groupAction } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/groups/[id] — group detail with the privacy gate: private
// groups hide members/plan/challenges/discussions from non-members.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const profile = await getDemoProfile()
    const result = await groupDetail(profile.id, decodeURIComponent(id))
    if (!result) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    return NextResponse.json({ group: result.group })
  } catch (error) {
    console.error('community/groups/[id] GET error:', error)
    return NextResponse.json({ error: 'Failed to load group.' }, { status: 500 })
  }
}

// POST /api/community/groups/[id] — one guarded mutation route. The client
// vocabulary (share with an explicit boolean, plan-add, challenge-create,
// challenge-archive) is translated onto the engine's actions; every successful
// mutation returns the refreshed detail so the UI can re-render in one round-trip.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const groupId = decodeURIComponent(id)
    const body = await readJson<{
      action?: unknown; line?: unknown; kind?: unknown; title?: unknown; detail?: unknown
      target?: unknown; dueAt?: unknown; challengeId?: unknown; on?: unknown
    }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const profile = await getDemoProfile()
    const action = asTrimmed(body.action, 20) ?? ''

    const refresh = async () => {
      const detail = await groupDetail(profile.id, groupId)
      return detail?.group ?? null
    }

    if (action === 'join' || action === 'leave') {
      const result = await groupAction(profile.id, groupId, { action })
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, joinRequestNote: result.joinRequestNote ?? null },
          { status: result.status },
        )
      }
      return NextResponse.json({ ok: true, group: await refresh() })
    }

    if (action === 'share') {
      // explicit opt-in boolean (NOT a toggle) — privacy transitions must be
      // intentional, never accidental double-taps
      const membership = await db.groupMembership.findFirst({ where: { groupId, actorKey: 'you', profileId: profile.id } })
      if (!membership) return NextResponse.json({ error: 'Join the group first' }, { status: 400 })
      const on = body.on === true
      await db.groupMembership.update({ where: { id: membership.id }, data: { shareData: on } })
      return NextResponse.json({ ok: true, shareData: on, group: await refresh() })
    }

    if (action === 'plan-add') {
      const line = asTrimmed(body.line, 200)
      if (!line) return NextResponse.json({ error: 'line is required' }, { status: 400 })
      const result = await groupAction(profile.id, groupId, { action: 'plan', line })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, group: await refresh() })
    }

    if (action === 'challenge-create') {
      const kind = asTrimmed(body.kind, 10) ?? ''
      const title = asTrimmed(body.title, 120)
      if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
      const result = await groupAction(profile.id, groupId, {
        action: 'challenge', kind,
        title,
        detail: asTrimmed(body.detail, 400) ?? '',
        target: typeof body.target === 'number' ? body.target : Number(body.target ?? NaN),
        dueAt: asTrimmed(body.dueAt, 40) ?? undefined,
      })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, challenge: result.challenge, group: await refresh() })
    }

    if (action === 'challenge-archive') {
      const challengeId = asTrimmed(body.challengeId, 60)
      if (!challengeId) return NextResponse.json({ error: 'challengeId is required' }, { status: 400 })
      const group = await db.studyGroup.findUnique({ where: { id: groupId } })
      if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
      if (group.ownerProfileId !== profile.id) return NextResponse.json({ error: 'Only the group owner can archive challenges' }, { status: 403 })
      const updated = await db.groupChallenge.updateMany({
        where: { id: challengeId, groupId },
        data: { status: 'archived' },
      })
      if (updated.count === 0) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 })
      return NextResponse.json({ ok: true, group: await refresh() })
    }

    if (action === 'archive') {
      const result = await groupAction(profile.id, groupId, { action: 'archive' })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, archived: true })
    }

    return NextResponse.json(
      { error: 'action must be one of: join, leave, share, plan-add, challenge-create, challenge-archive, archive' },
      { status: 400 },
    )
  } catch (error) {
    console.error('community/groups/[id] POST error:', error)
    return NextResponse.json({ error: 'Failed to run group action.' }, { status: 500 })
  }
}
