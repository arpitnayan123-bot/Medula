import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson } from '@/lib/http'
import { appendEvent, currentPick, gradeAndAnalyze, feedExamResults, parseResponses } from '@/lib/exam'
import type { ExamAnalysis } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/exam/attempt/[id]/submit {auto?} — the one deterministic grading
// pass: +4/−1 (when negative marking applies), attempt records into the
// knowledge state + mistake bank, analysis snapshot, revision feed. A second
// submit returns the stored report unchanged (idempotent, like complete
// routes elsewhere on this platform).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await readJson<{ auto?: unknown }>(req)
  const auto = body?.auto === true

  const profile = await getDemoProfile()
  const attempt = await db.examAttempt.findUnique({ where: { id } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status === 'submitted' && attempt.report) {
    return NextResponse.json(attempt.report)
  }
  if (attempt.status !== 'active') {
    return NextResponse.json({ error: `Attempt is ${attempt.status}` }, { status: 409 })
  }

  const now = new Date()
  const timeMs = Math.max(0, now.getTime() - attempt.startedAt.getTime())

  const analysis = await gradeAndAnalyze(attempt, { auto, submittedAt: now })

  const responses = parseResponses(attempt.responses)
  const answeredIds = responses.filter((r) => currentPick(r) !== null).map((r) => r.questionId)
  const minutes = Math.round(timeMs / 60_000)

  const feeds = await feedExamResults(profile.id, analysis, answeredIds, minutes)
  const finalAnalysis: ExamAnalysis = {
    ...analysis,
    fed: {
      studySession: feeds.studySession,
      revisionItems: feeds.revisionItems,
      attemptsRecorded: feeds.attemptsRecorded,
      reason: feeds.reason,
    },
  }

  await db.examAttempt.update({
    where: { id },
    data: {
      status: 'submitted',
      submittedAt: now,
      answered: finalAnalysis.totals.answered,
      correct: finalAnalysis.totals.correct,
      wrong: finalAnalysis.totals.wrong,
      unattempted: finalAnalysis.totals.unattempted,
      score: finalAnalysis.totals.score,
      maxScore: finalAnalysis.totals.maxScore,
      timeMs,
      autoSubmitted: auto || attempt.autoSubmitted,
      report: finalAnalysis as unknown as object,
      events: appendEvent(attempt.events, { kind: auto ? 'auto-submit' : 'submit', at: now.toISOString() }),
    },
  })

  return NextResponse.json(finalAnalysis)
}
