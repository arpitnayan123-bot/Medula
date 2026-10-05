import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed, asInt } from '@/lib/http'
import { appendEvent, currentPick, parseResponses, serializeResponses } from '@/lib/exam'

export const dynamic = 'force-dynamic'

// POST /api/exam/attempt/[id]/answer {questionId, selected|null, timeMs}
// Records one pick on the answer sheet. Exam-style: NO grading, NO feedback —
// the answer is stored (answer changes are recorded in history, never punished)
// and graded once, server-side, at submit. selected:null clears the answer.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await readJson<{ questionId?: unknown; selected?: unknown; timeMs?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const questionId = asTrimmed(body.questionId, 100)
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
  const selected = typeof body.selected === 'string' ? asTrimmed(body.selected, 10) : null
  // delta time on this question, clamped to 10 min (a stalled tab must not
  // inflate the careless/slow buckets)
  const timeMs = asInt(body.timeMs, 0, 10 * 60_000, 0)

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

  // Validate the option id belongs to the question (defensive — grading trusts
  // the sheet, so nonsense picks must be rejected, not silently recorded).
  const question = await db.question.findUnique({ where: { id: questionId }, select: { options: true } })
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  if (selected !== null) {
    const optionIds = (Array.isArray(question.options) ? question.options : []).map((o) => (o as { id?: unknown }).id)
    if (!optionIds.includes(selected)) {
      return NextResponse.json({ error: 'selected is not an option of this question' }, { status: 422 })
    }
  }

  const responses = parseResponses(attempt.responses)
  const entry = responses.find((r) => r.questionId === questionId)
  const nowIso = new Date().toISOString()
  if (entry) {
    const last = currentPick(entry)
    if (selected === last) {
      // same pick — only accumulate time
      entry.timeMs += timeMs
    } else {
      entry.history.push(selected)
      entry.timeMs += timeMs
      entry.at = entry.at // first-pick time is preserved
    }
  } else {
    responses.push({ questionId, history: selected === null ? [] : [selected], timeMs, marked: false, at: nowIso })
  }
  const answered = responses.filter((r) => currentPick(r) !== null).length

  const hadPick = entry ? currentPick(entry) !== null : false
  const nowPick = responses.find((r) => r.questionId === questionId) ? currentPick(responses.find((r) => r.questionId === questionId)!) : null
  const kind = !hadPick && nowPick !== null ? 'answer' : hadPick && nowPick === null ? 'clear' : hadPick ? 'change' : 'mark'

  await db.examAttempt.update({
    where: { id },
    data: {
      responses: serializeResponses(responses),
      answered,
      events: appendEvent(attempt.events, { kind: kind as 'answer' | 'change' | 'clear' | 'mark', questionId, at: nowIso }),
    },
  })

  return NextResponse.json({ ok: true as const, answered })
}
