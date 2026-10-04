import { db } from '@/lib/db'
import { DAY, estimatedRecall, updateKnowledge, statusFor } from '@/lib/engine'

// ─── SHARED ATTEMPT RECORDER (pure extraction from /api/attempts) ───────────
// Both the classic Question Lab (/api/attempts) and the Adaptive Engine
// (/api/adaptive/answer) must apply the SAME measured knowledge update, so the
// transaction body lives here once. Behavior is byte-for-byte the moved body —
// no scoring changes.
//
// The attempt record + knowledge-state read-modify-write run in ONE transaction
// so concurrent submissions can't interleave the read and the update.

export interface RecordedAttempt {
  correct: boolean
  mastery?: number // rounded KnowledgeState score after the update (linked concepts only)
  status?: string // new|weak|unstable|strong after the update
}

export async function recordAttempt(
  profileId: string,
  questionId: string,
  selected: string,
  timeMs: number,
  confidence: number,
): Promise<RecordedAttempt> {
  const question = await db.question.findUnique({ where: { id: questionId } })
  if (!question) throw new Error(`recordAttempt: question ${questionId} not found`)

  const correct = selected === question.answer

  const { mastery, status } = await db.$transaction(async (tx) => {
    await tx.questionAttempt.create({
      data: { questionId, profileId, selected, correct, timeMs, confidence },
    })

    // Update knowledge state for linked concept
    let mastery: number | undefined
    let status: string | undefined
    if (question.conceptId) {
      const existing = await tx.knowledgeState.findUnique({
        where: { profileId_conceptId: { profileId, conceptId: question.conceptId } },
      })
      const now = new Date()
      if (!existing) {
        const init = updateKnowledge(0, 1, correct, question.difficulty)
        const rec = await tx.knowledgeState.create({
          data: {
            profileId, conceptId: question.conceptId,
            score: init.score, stability: init.stability, estRecall: 1,
            attemptCount: 1, correctCount: correct ? 1 : 0,
            lastReviewed: now, lastCorrect: correct ? now : null,
            status: statusFor(init.score, 1),
          },
        })
        mastery = Math.round(rec.score); status = rec.status
      } else {
        const days = existing.lastReviewed ? (now.getTime() - existing.lastReviewed.getTime()) / DAY : 999
        const recall = estimatedRecall(days, existing.stability)
        const blended = existing.score * recall + (1 - recall) * existing.score * 0.4
        const upd = updateKnowledge(blended, existing.stability, correct, question.difficulty)
        const rec = await tx.knowledgeState.update({
          where: { id: existing.id },
          data: {
            score: upd.score, stability: upd.stability, estRecall: recall,
            attemptCount: existing.attemptCount + 1,
            correctCount: existing.correctCount + (correct ? 1 : 0),
            lastReviewed: now, lastCorrect: correct ? now : existing.lastCorrect,
            status: statusFor(upd.score, recall),
          },
        })
        mastery = Math.round(rec.score); status = rec.status
      }
    }
    return { mastery, status }
  })

  return { correct, mastery, status }
}

// Deterministic error-type HINT (same rule as the attempts route): fast + wrong
// reads like a misread; low confidence reads like a guess; else a reasoning slip.
// The student still logs the real error type — this is never stored as truth.
export function errorTypeSuggestionFor(correct: boolean, timeMs: number, confidence: number): string | undefined {
  if (correct) return undefined
  return timeMs < 10000 ? 'misread' : confidence <= 2 ? 'guess' : 'reasoning'
}
