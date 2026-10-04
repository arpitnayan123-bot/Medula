import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { measureAdaptiveCounts } from '@/lib/adaptive'
import type { AdaptiveMode, AdaptiveHomePayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/adaptive/home — measured entry payload for the Adaptive Engine view.
// Every number here is a real pool/content measurement (no fabricated sizes).
export async function GET() {
  const profile = await getDemoProfile()

  const [bank, dueConcepts, counts, topWeakRows, wrongAttempts, recentSessions] = await Promise.all([
    db.question.count(),
    db.knowledgeState.count({ where: { profileId: profile.id, status: 'unstable' } }),
    measureAdaptiveCounts(),
    // Lowest-score weak/unstable state with a real concept name
    db.knowledgeState.findMany({
      where: { profileId: profile.id, status: { in: ['weak', 'unstable'] }, attemptCount: { gt: 0 } },
      include: { concept: { select: { id: true, name: true } } },
      orderBy: { score: 'asc' },
      take: 1,
    }),
    // Concept with the most all-time wrong attempts
    db.questionAttempt.findMany({
      where: { profileId: profile.id, correct: false, question: { conceptId: { not: null } } },
      select: { question: { select: { conceptId: true, concept: { select: { id: true, name: true } } } } },
    }),
    db.adaptiveSession.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, mode: true, total: true, answered: true, correct: true, createdAt: true, completedAt: true },
    }),
  ])

  const missedMap = new Map<string, { conceptId: string; conceptName: string; misses: number }>()
  for (const a of wrongAttempts) {
    const c = a.question.concept
    if (!c) continue
    const entry = missedMap.get(c.id) ?? { conceptId: c.id, conceptName: c.name, misses: 0 }
    entry.misses += 1
    missedMap.set(c.id, entry)
  }
  const topMissed = [...missedMap.values()].sort((a, b) => b.misses - a.misses)[0] ?? null

  const topWeakRow = topWeakRows[0]
  const resume = await db.adaptiveSession.findFirst({
    where: { profileId: profile.id, completedAt: null, answered: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  const payload: AdaptiveHomePayload = {
    counts: {
      bank,
      pyqPattern: counts.pyqPattern,
      imageBased: counts.imageBased,
      clinical: counts.clinical,
      rapid: counts.rapid,
      weaknessQuestions: counts.weaknessQuestions,
      dueConcepts,
    },
    personalization: {
      topWeak: topWeakRow
        ? { conceptId: topWeakRow.concept.id, conceptName: topWeakRow.concept.name, mastery: Math.round(topWeakRow.score) }
        : null,
      topMissed,
    },
    recent: recentSessions.map((s) => ({
      id: s.id,
      mode: s.mode as AdaptiveMode,
      total: s.total,
      answered: s.answered,
      correct: s.correct,
      createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    })),
    resumeId: resume?.id ?? null,
  }
  return NextResponse.json(payload)
}
