import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import type { MistakeStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ACTIONS = ['resolve', 'revising', 'reopen'] as const
type Action = (typeof ACTIONS)[number]

// POST /api/mistakes-intel/action {recordId, action}
// Lifecycle moves the student controls: resolve (manual "fixed"),
// revising (a revision item now exists), reopen (it slipped again).
// Retest-driven transitions live in the retest/answer route.
export async function POST(req: NextRequest) {
  const body = await readJson<{ recordId?: unknown; action?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const recordId = asTrimmed(body.recordId, 100)
  const action = asTrimmed(body.action, 20) as Action
  if (!recordId) return NextResponse.json({ error: 'recordId is required' }, { status: 400 })
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }

  const profile = await getDemoProfile()
  const record = await db.mistakeRecord.findUnique({ where: { id: recordId } })
  if (!record || record.profileId !== profile.id) {
    return NextResponse.json({ error: 'Mistake record not found' }, { status: 404 })
  }

  let status: MistakeStatus = record.status as MistakeStatus
  if (action === 'resolve') {
    status = 'resolved'
    await db.mistakeRecord.update({
      where: { id: record.id },
      data: { status, resolvedAt: new Date(), resolvedBy: 'manual' },
    })
  } else if (action === 'revising') {
    status = 'revising'
    await db.mistakeRecord.update({ where: { id: record.id }, data: { status } })
    // Feed the real Revision Engine: one open item per concept (same rule the
    // error-type automation uses). No concept anchor → nothing to revise.
    if (record.conceptId) {
      const already = await db.revisionItem.findFirst({
        where: { profileId: profile.id, conceptId: record.conceptId, cleared: false },
      })
      if (!already) {
        await db.revisionItem.create({
          data: {
            profileId: profile.id,
            conceptId: record.conceptId,
            reason: `Mistake review — missed ${record.wrongCount}×. Compare the classic differential before retesting.`,
            priority: 3,
            minutes: 15,
          },
        })
      }
    }
  } else {
    status = 'unresolved'
    await db.mistakeRecord.update({
      where: { id: record.id },
      data: { status, retestCorrect: 0, resolvedAt: null, resolvedBy: null },
    })
  }

  return NextResponse.json({ ok: true, status })
}
