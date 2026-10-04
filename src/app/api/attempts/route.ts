import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordAttempt, errorTypeSuggestionFor } from '@/lib/attempt-record'
import { getDemoProfile } from '@/lib/profile'
import { asInt, asTrimmed, readJson } from '@/lib/http'
import type { AttemptResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await readJson<{ questionId?: unknown; selected?: unknown; timeMs?: unknown; confidence?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const questionId = asTrimmed(body.questionId, 200)
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
  if (typeof body.selected !== 'string') return NextResponse.json({ error: 'selected must be a string' }, { status: 400 })
  const selected = body.selected
  const timeMs = asInt(body.timeMs, 0, 3_600_000, 0) // sanity-clamped: up to 1h
  const confidence = asInt(body.confidence, 1, 5, 3)

  const profile = await getDemoProfile()
  const question = await db.question.findUnique({ where: { id: questionId } })
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  // Attempt record + knowledge-state update live in src/lib/attempt-record.ts
  // (shared verbatim with the adaptive engine so both paths apply the same
  // measured update). Deterministic suggestion is a HINT only — the student
  // still logs the real error type.
  const { correct, mastery, status } = await recordAttempt(profile.id, questionId, selected, timeMs, confidence)

  const errorTypeSuggestion = errorTypeSuggestionFor(correct, timeMs, confidence)

  const result: AttemptResult = {
    correct,
    answer: question.answer,
    explanation: question.explanation,
    teaching: question.teaching,
    errorTypeSuggestion,
    knowledgeUpdated: Boolean(question.conceptId),
    mastery,
    status,
  }
  return NextResponse.json(result)
}
