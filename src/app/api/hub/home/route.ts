// ─── TOPIC HUB HOME API (PRODUCT 02) ────────────────────────────────────────
// GET /api/hub/home → suggestions + continue + totals for the hub landing.
// Suggested = honestly ranked by measured content richness (questions +
// flashcards + lessons + system cases), never fabricated. Continue = the
// user's own Learn-progress topic marks, newest first.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { allSubjects } from '@/lib/curriculum/registry'
import { systemLabel, canonicalSystem } from '@/lib/topic-study'
import type { HubHomePayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [topics, caseRows, profile] = await Promise.all([
      db.topic.findMany({
        select: {
          id: true, name: true, system: true, importance: true, subjectId: true,
          concepts: {
            select: {
              id: true, lesson: true,
              _count: { select: { questions: true, flashcards: true } },
            },
          },
        },
      }),
      db.clinicalCase.groupBy({ by: ['system'], _count: true }),
      getDemoProfile(),
    ])

    const subjectMeta = new Map(allSubjects().map((s) => [s.id, s]))
    const caseCountBySystem = new Map(caseRows.map((c) => [c.system, c._count]))

    const ranked = topics
      .map((t) => {
        const lessons = t.concepts.filter((c) => !!c.lesson).length
        const questions = t.concepts.reduce((a, c) => a + c._count.questions, 0)
        const flashcards = t.concepts.reduce((a, c) => a + c._count.flashcards, 0)
        const cases = t.system ? (caseCountBySystem.get(t.system) ?? 0) : 0
        const richness = questions * 2 + flashcards + lessons * 3 + Math.min(cases, 3) * 2
        return { t, lessons, questions, flashcards, cases, richness }
      })
      .sort((a, b) => b.richness - a.richness || b.t.importance - a.t.importance)
      .slice(0, 8)

    const suggested: HubHomePayload['suggested'] = ranked.map(({ t, lessons, questions, flashcards, cases }) => {
      const meta = subjectMeta.get(t.subjectId)
      const bits: string[] = []
      if (questions > 0) bits.push(`${questions} Qs`)
      if (flashcards > 0) bits.push(`${flashcards} cards`)
      if (cases > 0) bits.push(`${cases} case${cases > 1 ? 's' : ''}`)
      if (lessons > 0) bits.push(`${lessons} lesson${lessons > 1 ? 's' : ''}`)
      return {
        id: t.id,
        name: t.name,
        systemLabel: systemLabel(canonicalSystem(t.system)),
        subjectName: meta?.name ?? t.subjectId,
        subjectColor: meta?.color ?? '#22d3ee',
        importance: t.importance,
        concepts: t.concepts.length,
        questions,
        flashcards,
        cases,
        reason: bits.length ? bits.join(' · ') : 'Concepts ready to explore',
      }
    })

    const marks = await db.learnProgress.findMany({
      where: { profileId: profile.id, kind: 'topic', status: { not: 'not-started' } },
      select: { entityId: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    })
    const markTopicIds = marks.map((m) => m.entityId)
    const markedTopics = markTopicIds.length
      ? await db.topic.findMany({
          where: { id: { in: markTopicIds } },
          select: { id: true, name: true, subjectId: true },
        })
      : []
    const markedById = new Map(markedTopics.map((t) => [t.id, t]))
    const continueTopics: HubHomePayload['continueTopics'] = []
    for (const m of marks) {
      const t = markedById.get(m.entityId)
      if (!t) continue
      const meta = subjectMeta.get(t.subjectId)
      continueTopics.push({
        id: t.id,
        name: t.name,
        subjectName: meta?.name ?? t.subjectId,
        subjectColor: meta?.color ?? '#22d3ee',
        status: m.status,
        updatedAt: m.updatedAt.toISOString(),
      })
    }

    const [conceptTotal, questionTotal, cardTotal, caseTotal] = await Promise.all([
      db.concept.count(),
      db.question.count(),
      db.flashcard.count(),
      db.clinicalCase.count(),
    ])

    const payload: HubHomePayload = {
      suggested,
      continueTopics,
      totals: {
        topics: topics.length,
        concepts: conceptTotal,
        questions: questionTotal,
        flashcards: cardTotal,
        cases: caseTotal,
      },
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[api/hub/home] request failed:', err)
    return NextResponse.json(
      { suggested: [], continueTopics: [], totals: { topics: 0, concepts: 0, questions: 0, flashcards: 0, cases: 0 }, degraded: true },
      { status: 200 },
    )
  }
}
