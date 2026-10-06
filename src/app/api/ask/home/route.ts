import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { buildTutorContext } from '@/lib/tutor-context'
import { lessonsByConceptId } from '@/lib/curriculum/registry'
import { EXTERNAL_CATALOG } from '@/lib/resource-catalog'
import type { AskHomePayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ─── GET /api/ask/home — measured counts, recent threads, resolvable starters ─
// Every stat is a live DB count; every example query is templated from a real
// platform concept (or a real ConfusionPair) so it always resolves.

export async function GET() {
  const profile = await getDemoProfile()

  const [threads, conceptCount, questionCount, pyqCount, caseCount, tutorCtx] = await Promise.all([
    db.askThread.findMany({
      where: { profileId: profile.id },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, title: true, rootQuery: true, resolvedKind: true, updatedAt: true },
    }),
    db.concept.count(),
    db.question.count(),
    // JSON array filtering isn't available on SQLite — count PYQ tags in JS
    db.question.findMany({ select: { tags: true } }).then((rows) =>
      rows.filter((r) => Array.isArray(r.tags) && (r.tags as string[]).includes('pyq-pattern')).length,
    ),
    db.clinicalCase.count(),
    buildTutorContext(),
  ])

  // measured, always-resolvable starter queries
  const lessonIds = [...lessonsByConceptId().keys()]
  const topConcepts = lessonIds.length
    ? await db.concept.findMany({
        where: { id: { in: lessonIds } },
        orderBy: [{ examRelevance: 'desc' }, { name: 'asc' }],
        take: 4,
        select: { id: true, name: true },
      })
    : []
  const pair = await db.confusionPair.findFirst({
    where: { aCode: { not: '' }, bCode: { not: '' } },
    orderBy: { a: 'asc' },
    select: { a: true, b: true },
  })
  const examples: string[] = []
  if (topConcepts[0]) examples.push(`Explain ${topConcepts[0].name}`)
  if (pair) examples.push(`${pair.a} vs ${pair.b}`)
  if (topConcepts[1]) examples.push(`Why does ${topConcepts[1].name} happen?`)
  if (topConcepts[2]) examples.push(`NEET-PG high-yield on ${topConcepts[2].name}`)

  const payload: AskHomePayload = {
    threads: threads.map((t) => ({
      id: t.id, title: t.title, rootQuery: t.rootQuery, resolvedKind: t.resolvedKind,
      updatedAt: t.updatedAt.toISOString(),
    })),
    stats: {
      concepts: conceptCount,
      questions: questionCount,
      pyq: pyqCount,
      lessons: lessonsByConceptId().size,
      cases: caseCount,
      resources: EXTERNAL_CATALOG.length,
    },
    personal: {
      yearLabel: tutorCtx.profile.yearLabel,
      prepStage: tutorCtx.profile.prepStage,
      weak: tutorCtx.weak.slice(0, 3).map((w) => ({ conceptId: w.conceptId, name: w.name, mastery: w.mastery })),
      missed: tutorCtx.missed.slice(0, 3).map((m) => ({ conceptId: m.conceptId, name: m.name, count: m.count })),
      dueRevision: tutorCtx.revision.due,
    },
    examples,
  }
  return NextResponse.json(payload)
}
