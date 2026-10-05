import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asInt, asTrimmed, readJson } from '@/lib/http'
import { recordAttempt, errorTypeSuggestionFor } from '@/lib/attempt-record'
import { parseSessionState, selectNextQuestion, reorderRemaining, startTargetFor } from '@/lib/adaptive'
import type { AdaptiveAnswerFeedback, AdaptiveMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/adaptive/answer {sessionId, questionId, selected, timeMs, confidence, marked?}
// Applies the SAME measured attempt + knowledge update as /api/attempts
// (shared recordAttempt), then advances the engine: queue bookkeeping, focus
// lock on a miss, difficulty staircase, and (ai-adaptive only) live re-selection
// of the next question.
export async function POST(req: NextRequest) {
  const body = await readJson<{
    sessionId?: unknown; questionId?: unknown; selected?: unknown
    timeMs?: unknown; confidence?: unknown; marked?: unknown
  }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const sessionId = asTrimmed(body.sessionId, 100)
  const questionId = asTrimmed(body.questionId, 200)
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
  if (typeof body.selected !== 'string') return NextResponse.json({ error: 'selected must be a string' }, { status: 400 })
  const selected = body.selected
  const timeMs = asInt(body.timeMs, 0, 3_600_000, 0)
  const confidence = asInt(body.confidence, 1, 5, 3)
  const marked = body.marked === true

  const profile = await getDemoProfile()
  const session = await db.adaptiveSession.findUnique({ where: { id: sessionId } })
  if (!session || session.profileId !== profile.id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (session.completedAt) {
    return NextResponse.json({ error: 'Session is already completed' }, { status: 409 })
  }

  const question = await db.question.findUnique({
    where: { id: questionId },
    include: { concept: { select: { id: true, topicId: true, name: true } } },
  })
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const state = parseSessionState(session.state)
  if (state.answered.some((a) => a.questionId === questionId)) {
    return NextResponse.json({ error: 'Question already answered in this session' }, { status: 409 })
  }
  if (!state.queue.includes(questionId)) {
    return NextResponse.json({ error: 'Question is not in this session queue' }, { status: 400 })
  }

  // Same measured effect as normal practice (attempt + KnowledgeState update).
  const { correct, mastery, status } = await recordAttempt(profile.id, questionId, selected, timeMs, confidence)
  const errorTypeSuggestion = errorTypeSuggestionFor(correct, timeMs, confidence)

  // ── Session bookkeeping ────────────────────────────────────────────────────
  state.answered.push({ questionId, correct, timeMs, errorType: null })
  state.queue = state.queue.filter((id) => id !== questionId)
  if (marked && !state.markedIds.includes(questionId)) state.markedIds.push(questionId)
  // Focus lock: a miss re-locks the engine onto that concept's topic (or an
  // adjacent one) for the questions served until the next answer; a correct
  // answer — or a miss on an unlinked question — consumes any active lock.
  // The lock lives in state (not cleared here) so the /next re-selection
  // (deterministic) reproduces the same focus-honoring pick instead of
  // silently replacing it.
  state.focus = !correct && question.conceptId && question.concept
    ? { conceptId: question.conceptId, topicId: question.concept.topicId }
    : null
  if (!correct && question.conceptId && !state.missedConcepts.includes(question.conceptId)) {
    state.missedConcepts.push(question.conceptId)
  }

  let focusNote: string | undefined
  if (session.mode === 'ai-adaptive') {
    // Live re-selection: the fresh pick replaces the remaining queue head.
    const pick = await selectNextQuestion(
      { mode: session.mode, config: session.config, state: state as unknown as object },
      profile.id,
    )
    state.queue = pick.question ? [pick.question.id] : []
    state.target = pick.target
    focusNote = pick.focusNote
  } else {
    // Static queue: reorder the remainder by focus lock + recomputed target.
    const reordered = await reorderRemaining(state.queue, state.answered, startTargetFor(session.mode as AdaptiveMode), state.focus)
    state.queue = reordered.queue
    state.target = reordered.target
    focusNote = reordered.focusNote
    state.focus = null // static reorder is one-shot: lock consumed by the reorder
  }

  const avgTimeMs = state.answered.length > 0
    ? Math.round(state.answered.reduce((a, e) => a + e.timeMs, 0) / state.answered.length)
    : 0

  await db.adaptiveSession.update({
    where: { id: session.id },
    data: {
      answered: { increment: 1 },
      correct: correct ? { increment: 1 } : undefined,
      state: state as unknown as object,
    },
  })

  // Other PYQ-pattern questions sharing this concept (for the "more like this" cue).
  // Up to 3 stems are shipped inline for immediate review; the count covers all.
  let relatedPyqCount = 0
  let relatedPyqs: AdaptiveAnswerFeedback['relatedPyqs'] | undefined
  if (question.conceptId) {
    const siblings = await db.question.findMany({
      where: { conceptId: question.conceptId, id: { not: questionId } },
      select: { id: true, stem: true, subjectCode: true, tags: true },
    })
    const pyqSiblings = siblings.filter((s) => Array.isArray(s.tags) && (s.tags as string[]).includes('pyq-pattern'))
    relatedPyqCount = pyqSiblings.length
    if (pyqSiblings.length > 0) {
      relatedPyqs = pyqSiblings.slice(0, 3).map((s) => ({ id: s.id, stem: s.stem, subjectCode: s.subjectCode }))
    }
  }

  const feedback: AdaptiveAnswerFeedback = {
    correct,
    answer: question.answer,
    explanation: question.explanation,
    teaching: question.teaching,
    errorTypeSuggestion,
    knowledgeUpdated: Boolean(question.conceptId),
    mastery,
    status,
    sessionAnswered: session.answered + 1,
    sessionCorrect: session.correct + (correct ? 1 : 0),
    avgTimeMs,
    focusNote,
    relatedPyqCount: relatedPyqCount > 0 ? relatedPyqCount : undefined,
    relatedPyqs,
  }
  return NextResponse.json(feedback)
}
