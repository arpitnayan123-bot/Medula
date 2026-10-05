import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { appendEvent, parseResponses, serializeResponses } from '@/lib/exam'

export const dynamic = 'force-dynamic'

// POST /api/exam/attempt/[id]/mark {questionId, marked} — review-flag toggle
// (exam-style "Mark for Review"). Creates the answer-sheet entry on first use.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await readJson<{ questionId?: unknown; marked?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const questionId = asTrimmed(body.questionId, 100)
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
  const marked = body.marked === true

  const profile = await getDemoProfile()
  const attempt = await db.examAttempt.findUnique({ where: { id } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ error: `Attempt is ${attempt.status}` }, { status: 409 })
  }

  const paperIds = (Array.isArray(attempt.questionIds) ? attempt.questionIds : []).filter((x): x is string => typeof x === 'string')
  if (!paperIds.includes(questionId)) {
    return NextResponse.json({ error: 'Question is not part of this paper' }, { status: 422 })
  }

  const responses = parseResponses(attempt.responses)
  const entry = responses.find((r) => r.questionId === questionId)
  if (entry) entry.marked = marked
  else responses.push({ questionId, history: [], timeMs: 0, marked, at: new Date().toISOString() })

  await db.examAttempt.update({
    where: { id },
    data: {
      responses: serializeResponses(responses),
      events: appendEvent(attempt.events, { kind: marked ? 'mark' : 'unmark', questionId, at: new Date().toISOString() }),
    },
  })

  return NextResponse.json({ ok: true as const, marked })
}
