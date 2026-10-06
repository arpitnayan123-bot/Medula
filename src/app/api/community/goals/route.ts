import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson } from '@/lib/http'
import { goalsAction } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// POST /api/community/goals — manage personal accountability goals.
// Client ops (add | pause | resume | delete) map onto the engine's
// add/update/delete; pause and resume are explicit active-flag writes.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{
      op?: unknown; id?: unknown; scope?: unknown; kind?: unknown; title?: unknown
      target?: unknown; unit?: unknown; dueAt?: unknown
    }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const op = typeof body.op === 'string' ? body.op : ''
    const profile = await getDemoProfile()

    if (op === 'add') {
      const result = await goalsAction(profile.id, {
        action: 'add',
        scope: typeof body.scope === 'string' ? body.scope : undefined,
        kind: typeof body.kind === 'string' ? body.kind : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
        target: typeof body.target === 'number' ? body.target : Number(body.target),
        dueAt: typeof body.dueAt === 'string' && body.dueAt ? body.dueAt : undefined,
      })
      if (!result.ok) return NextResponse.json({ error: result.error, goal: null, goals: result.goals }, { status: result.status })
      return NextResponse.json({ ok: true, goal: result.goal, goals: result.goals }, { status: 201 })
    }

    if (op === 'pause' || op === 'resume') {
      const id = typeof body.id === 'string' ? body.id : ''
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      const result = await goalsAction(profile.id, { action: 'update', id, active: op === 'resume' })
      if (!result.ok) return NextResponse.json({ error: result.error, goal: null, goals: result.goals }, { status: result.status })
      return NextResponse.json({ ok: true, goal: result.goal, goals: result.goals })
    }

    if (op === 'delete') {
      const id = typeof body.id === 'string' ? body.id : ''
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      const result = await goalsAction(profile.id, { action: 'delete', id })
      if (!result.ok) return NextResponse.json({ error: result.error, goal: null, goals: result.goals }, { status: result.status })
      return NextResponse.json({ ok: true, goal: null, goals: result.goals })
    }

    return NextResponse.json({ error: 'op must be one of: add, pause, resume, delete' }, { status: 400 })
  } catch (error) {
    console.error('community/goals error:', error)
    return NextResponse.json({ error: 'Failed to update goals.' }, { status: 500 })
  }
}
