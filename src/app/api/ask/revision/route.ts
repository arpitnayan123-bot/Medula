import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { enqueueAskRevision, dueRevisionCount } from '@/lib/ask-engine'

export const dynamic = 'force-dynamic'

// ─── POST /api/ask/revision — add the thread's concept to Smart Revision ─────
// Same dedupe-guarded enqueue pattern as every other surface (no duplicates),
// then the fresh measured due-count is returned.

export async function POST(req: NextRequest) {
  const body = await readJson<{ threadId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const threadId = asTrimmed(body.threadId, 100)
  if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const thread = await db.askThread.findUnique({ where: { id: threadId } })
  if (!thread || thread.profileId !== profile.id) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }
  if (!thread.conceptId) {
    return NextResponse.json({ error: 'This thread is not anchored to a concept' }, { status: 409 })
  }

  const { queued } = await enqueueAskRevision(profile.id, thread.conceptId, thread.rootQuery)
  const due = await dueRevisionCount(profile.id)
  return NextResponse.json({ ok: true, queued, due })
}
