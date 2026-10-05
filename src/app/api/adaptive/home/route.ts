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

  const [bank, dueConcepts, counts, topWeakRows, wrongAttempts, recentSessions, questionRows, topics] = await Promise.all([
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
    // Builder facets — measured from the live bank (systems, topics, concepts)
    db.question.findMany({
      select: { system: true, concept: { select: { topicId: true, topic: { select: { id: true, name: true, subject: { select: { code: true } } } } } } },
    }),
    db.topic.findMany({
      select: { id: true, name: true, system: true, subject: { select: { code: true } }, concepts: { select: { id: true, name: true } } },
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

  // Facets: only topics/concepts that actually carry questions in the bank.
  const systemCounts = new Map<string, number>()
  const topicsWithQs = new Set<string>()
  for (const row of questionRows) {
    if (row.system) systemCounts.set(row.system, (systemCounts.get(row.system) ?? 0) + 1)
    if (row.concept) topicsWithQs.add(row.concept.topicId)
  }
  const systems = [...systemCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  const topicFacets = topics
    .filter((t) => topicsWithQs.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, subjectCode: t.subject.code, system: t.system ?? '' }))
  const conceptFacets = topics
    .filter((t) => topicsWithQs.has(t.id))
    .flatMap((t) => t.concepts.map((c) => ({ id: c.id, name: c.name, topicId: t.id })))

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
    facets: { systems, topics: topicFacets, concepts: conceptFacets },
  }
  return NextResponse.json(payload)
}
