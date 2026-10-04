import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import { parseSessionState } from '@/lib/adaptive'
import type { AdaptiveConfig, AdaptiveMode, AdaptiveReport, AdaptiveTopicInsight } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/adaptive/complete {sessionId} — build the measured session report
// (accuracy / speed band / difficulty split / topic insights / mistakes /
// repeated misses / deterministic next-step recommendation), persist it on the
// session and return it. Calling again returns the stored report unchanged.
export async function POST(req: NextRequest) {
  const body = await readJson<{ sessionId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const sessionId = asTrimmed(body.sessionId, 100)
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const session = await db.adaptiveSession.findUnique({ where: { id: sessionId } })
  if (!session || session.profileId !== profile.id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (session.completedAt && session.report) {
    return NextResponse.json(session.report)
  }

  const state = parseSessionState(session.state)
  const answered = state.answered
  const questionIds = answered.map((a) => a.questionId)
  const questions = questionIds.length
    ? await db.question.findMany({
        where: { id: { in: questionIds } },
        include: { concept: { select: { id: true, name: true, topicId: true, topic: { select: { id: true, name: true, subject: { select: { code: true } } } } } } },
      })
    : []
  const qById = new Map(questions.map((q) => [q.id, q] as const))

  const answeredCount = answered.length
  const correctCount = answered.filter((a) => a.correct).length
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0
  const avgTimeMs = answeredCount > 0 ? Math.round(answered.reduce((a, e) => a + e.timeMs, 0) / answeredCount) : 0
  const avgSec = avgTimeMs / 1000
  const speedBand: 'fast' | 'steady' | 'slow' = answeredCount === 0 ? 'steady' : avgSec < 45 ? 'fast' : avgSec <= 90 ? 'steady' : 'slow'

  // Difficulty split (1..3 always; 4 only if one of the rare d4 rows was served)
  const diffs = new Set(answered.map((a) => qById.get(a.questionId)?.difficulty ?? 0))
  const difficulty = [1, 2, 3, ...(diffs.has(4) ? [4] : [])].map((d) => {
    const rows = answered.filter((a) => qById.get(a.questionId)?.difficulty === d)
    return { d, correct: rows.filter((r) => r.correct).length, total: rows.length }
  })

  // Topic insights: group answered by the linked concept's topic. A topic needs
  // ≥3 attempts in this run to qualify as strong (≥75%) or weak (≤50%).
  const topicMap = new Map<string, { name: string; subjectCode: string; topicId: string; correct: number; total: number }>()
  for (const a of answered) {
    const q = qById.get(a.questionId)
    const topic = q?.concept?.topic
    if (!topic) continue
    const entry = topicMap.get(topic.id) ?? {
      name: topic.name, subjectCode: topic.subject.code, topicId: topic.id, correct: 0, total: 0,
    }
    entry.total += 1
    if (a.correct) entry.correct += 1
    topicMap.set(topic.id, entry)
  }
  const insights: AdaptiveTopicInsight[] = [...topicMap.values()].map((t) => ({
    name: t.name, subjectCode: t.subjectCode, correct: t.correct, total: t.total,
    accuracy: Math.round((t.correct / t.total) * 100), topicId: t.topicId,
  }))
  const strongTopics = insights.filter((t) => t.total >= 3 && t.accuracy >= 75).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5)
  const weakTopics = insights.filter((t) => t.total >= 3 && t.accuracy <= 50).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5)

  // Self-reported error types logged during THIS session (ids only; the client
  // maps them to labels).
  const mistakeMap = new Map<string, number>()
  for (const a of answered) {
    if (!a.errorType) continue
    mistakeMap.set(a.errorType, (mistakeMap.get(a.errorType) ?? 0) + 1)
  }
  const mistakes = [...mistakeMap.entries()]
    .map(([errorType, count]) => ({ errorType, count }))
    .sort((a, b) => b.count - a.count)

  // All-time repeated misses by concept (measured, top 5)
  const wrongAttempts = await db.questionAttempt.findMany({
    where: { profileId: profile.id, correct: false, question: { conceptId: { not: null } } },
    select: { question: { select: { conceptId: true, concept: { select: { id: true, name: true } } } } },
  })
  const wrongMap = new Map<string, { conceptId: string; conceptName: string; misses: number }>()
  for (const a of wrongAttempts) {
    const c = a.question.concept
    if (!c) continue
    const entry = wrongMap.get(c.id) ?? { conceptId: c.id, conceptName: c.name, misses: 0 }
    entry.misses += 1
    wrongMap.set(c.id, entry)
  }
  const repeatedWrong = [...wrongMap.values()].sort((a, b) => b.misses - a.misses).slice(0, 5)

  const wrongQuestions = answered
    .filter((a) => !a.correct)
    .map((a) => {
      const q = qById.get(a.questionId)
      return { id: a.questionId, stem: q?.stem ?? '', conceptName: q?.concept?.name ?? undefined }
    })

  // Deterministic, honest recommendation.
  const qualified = insights.filter((t) => t.total >= 2)
  const weakestTopic = qualified.length ? qualified.reduce((w, t) => (t.accuracy < w.accuracy ? t : w)) : null
  const d3Share = answeredCount > 0 ? answered.filter((a) => qById.get(a.questionId)?.difficulty === 3).length / answeredCount : 0
  let recommended: AdaptiveReport['recommended'] = null
  if (answeredCount > 0) {
    if (accuracy < 60) {
      recommended = {
        mode: 'weakness',
        config: { mode: 'weakness', count: 10, ...(weakestTopic?.topicId ? { topicId: weakestTopic.topicId } : {}) } as AdaptiveConfig,
        reason: weakestTopic
          ? `Accuracy ${accuracy}% — repair pass on ${weakestTopic.name}`
          : `Accuracy ${accuracy}% — repair pass`,
      }
    } else if (speedBand === 'slow') {
      recommended = {
        mode: 'rapid',
        config: { mode: 'rapid', count: 15 } as AdaptiveConfig,
        reason: 'Build speed under time pressure',
      }
    } else if (accuracy >= 85 && d3Share >= 0.5) {
      recommended = {
        mode: 'exam',
        config: { mode: 'exam', count: 20 } as AdaptiveConfig,
        reason: 'Ready for a tougher paper',
      }
    } else {
      recommended = {
        mode: 'adaptive',
        config: { mode: 'adaptive', count: 15 } as AdaptiveConfig,
        reason: 'Keep the mixed run going — the engine keeps steering',
      }
    }
  }

  const report: AdaptiveReport = {
    sessionId: session.id,
    mode: session.mode as AdaptiveMode,
    total: session.total,
    answered: answeredCount,
    correct: correctCount,
    accuracy,
    avgTimeMs,
    speedBand,
    difficulty,
    strongTopics,
    weakTopics,
    mistakes,
    repeatedWrong,
    recommended,
    wrongQuestions,
  }

  await db.adaptiveSession.update({
    where: { id: session.id },
    data: { report: report as unknown as object, completedAt: new Date() },
  })
  return NextResponse.json(report)
}
