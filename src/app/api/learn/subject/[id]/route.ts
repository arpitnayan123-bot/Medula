// ─── LEARN SUBJECT STUDY API — one subject's full study map ─────────────────
// GET /api/learn/subject/<id> → subject meta (registry), per-topic 5-state
// progress rollups, lesson coverage, question/card availability, curriculum
// registry records that cover this subject. Powers the SubjectStudy surface.
//
// Honesty rules: every count measured (0 means zero); unknown subject → 400.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAY, estimatedRecall } from '@/lib/engine'
import { getDemoProfile } from '@/lib/profile'
import { allCurriculumRecords, allSubjects, phaseOfSubject } from '@/lib/curriculum/registry'
import { SYSTEMS } from '@/lib/curriculum/taxonomy'
import { effectiveLearnStatus, type LearnStatus } from '@/lib/learn-status'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    return NextResponse.json(await build(id))
  } catch (err) {
    if (err instanceof SubjectNotFound) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 400 })
    }
    console.error('[api/learn/subject] request failed:', err)
    return NextResponse.json({ error: 'Failed to load subject study data' }, { status: 500 })
  }
}

class SubjectNotFound extends Error {}

function emptyCounts(): Record<LearnStatus, number> {
  return { 'not-started': 0, learning: 0, completed: 0, 'needs-revision': 0, mastered: 0 }
}

async function build(subjectId: string) {
  const reg = allSubjects().find((s) => s.id === subjectId)
  if (!reg) throw new SubjectNotFound(subjectId)

  const profile = await getDemoProfile()
  const now = new Date()

  const [topics, concepts, states, marks, flashcardsByTopic, questionsByTopic, assets] =
    await Promise.all([
      db.topic.findMany({
        where: { subjectId },
        orderBy: [{ importance: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true, system: true, importance: true, description: true },
      }),
      db.concept.findMany({
        where: { topic: { subjectId } },
        select: { id: true, topicId: true, lesson: true },
      }),
      db.knowledgeState.findMany({
        where: { profileId: profile.id, concept: { topic: { subjectId } } },
        select: { conceptId: true, score: true, attemptCount: true, lastReviewed: true, stability: true },
      }),
      db.learnProgress.findMany({
        where: { profileId: profile.id, OR: [{ kind: 'topic' }, { kind: 'concept' }] },
        select: { kind: true, entityId: true, status: true },
      }),
      db.flashcard.groupBy({ by: ['conceptId'], where: { subjectCode: reg.code }, _count: true }),
      db.question.groupBy({ by: ['topicId'], where: { subjectCode: reg.code }, _count: true }),
      db.asset3D.findMany({
        select: { id: true, title: true, conceptIds: true, handcrafted: true },
      }),
    ])

  const topicIds = new Set(topics.map((t) => t.id))
  const conceptsByTopic = new Map<string, string[]>()
  const lessonTopicsSet = new Set<string>()
  for (const c of concepts) {
    if (!topicIds.has(c.topicId)) continue
    const list = conceptsByTopic.get(c.topicId) ?? []
    list.push(c.id)
    conceptsByTopic.set(c.topicId, list)
    if (c.lesson !== null) lessonTopicsSet.add(c.topicId)
  }

  const stateByConcept = new Map(
    states.map((s) => {
      const days = s.lastReviewed ? (now.getTime() - s.lastReviewed.getTime()) / DAY : 999
      return [s.conceptId, { score: s.score, attemptCount: s.attemptCount, estRecall: estimatedRecall(days, s.stability) }]
    }),
  )
  const conceptMark = new Map(
    marks.filter((m) => m.kind === 'concept').map((m) => [m.entityId, m.status]),
  )
  const topicMark = new Map(
    marks.filter((m) => m.kind === 'topic').map((m) => [m.entityId, m.status]),
  )

  // mastery over engaged concepts (parity with the rest of the app)
  const engaged = states.map((s) => {
    const days = s.lastReviewed ? (now.getTime() - s.lastReviewed.getTime()) / DAY : 999
    return { score: s.score, estRecall: estimatedRecall(days, s.stability) }
  })
  const mastery = engaged.length
    ? Math.round(engaged.reduce((a, s) => a + s.score, 0) / engaged.length)
    : 0

  const flashcardCountByTopic = new Map<string, number>()
  for (const f of flashcardsByTopic) {
    if (!f.conceptId) continue
    const topicOf = concepts.find((c) => c.id === f.conceptId)
    if (!topicOf || !topicIds.has(topicOf.topicId)) continue
    flashcardCountByTopic.set(topicOf.topicId, (flashcardCountByTopic.get(topicOf.topicId) ?? 0) + f._count)
  }
  const questionCountByTopic = new Map<string, number>()
  for (const q of questionsByTopic) {
    if (q.topicId && topicIds.has(q.topicId)) questionCountByTopic.set(q.topicId, q._count)
  }

  const subjectAssetIds = new Set(
    assets
      .filter((a) => {
        const ids = Array.isArray(a.conceptIds) ? (a.conceptIds as unknown[]) : []
        return ids.some((cid) => concepts.some((c) => c.id === String(cid)))
      })
      .map((a) => a.id),
  )

  const subjectStatus = emptyCounts()
  const topicRows = topics.map((t) => {
    const cids = conceptsByTopic.get(t.id) ?? []
    const counts = emptyCounts()
    for (const cid of cids) {
      const status = effectiveLearnStatus(conceptMark.get(cid) ?? null, stateByConcept.get(cid) ?? null)
      counts[status] += 1
      subjectStatus[status] += 1
    }
    const sys = t.system // canonical keys are stored at seed time
    return {
      id: t.id,
      name: t.name,
      system: sys,
      systemLabel: SYSTEMS.find((s) => s.system === sys)?.label ?? null,
      importance: t.importance,
      description: t.description,
      conceptCount: cids.length,
      lessonCoverage: lessonTopicsSet.has(t.id)
        ? cids.length // presence flag becomes exact count below
        : 0,
      questionCount: questionCountByTopic.get(t.id) ?? 0,
      flashcardCount: flashcardCountByTopic.get(t.id) ?? 0,
      mastery: engaged.length && cids.length
        ? Math.round(
            cids.reduce((a, cid) => a + (stateByConcept.get(cid)?.score ?? 0), 0) /
              cids.filter((cid) => stateByConcept.has(cid)).length || 0,
          )
        : 0,
      statusCounts: counts,
      marked: topicMark.get(t.id) ?? null,
    }
  })
  // exact per-topic lesson counts (concepts with a lesson, per topic)
  const lessonCountByTopic = new Map<string, number>()
  for (const c of concepts) {
    if (c.lesson === null || !topicIds.has(c.topicId)) continue
    lessonCountByTopic.set(c.topicId, (lessonCountByTopic.get(c.topicId) ?? 0) + 1)
  }
  for (const row of topicRows) row.lessonCoverage = lessonCountByTopic.get(row.id) ?? 0

  const systemsCovered = [...new Set(topics.map((t) => t.system).filter((s): s is string => !!s))]

  return {
    subject: {
      id: reg.id,
      code: reg.code,
      name: reg.name,
      latinName: reg.latinName ?? null,
      year: reg.year,
      phase: phaseOfSubject(reg.id) ?? reg.phase,
      color: reg.color,
      blurb: reg.blurb,
      neetWeight: reg.neetWeight,
      systems: reg.systems,
      systemsCovered,
    },
    topics: topicRows,
    statusCounts: subjectStatus,
    mastery,
    counts: {
      topics: topics.length,
      concepts: concepts.filter((c) => topicIds.has(c.topicId)).length,
      lessons: [...lessonCountByTopic.values()].reduce((a, b) => a + b, 0),
      questions: [...questionCountByTopic.values()].reduce((a, b) => a + b, 0),
      flashcards: [...flashcardCountByTopic.values()].reduce((a, b) => a + b, 0),
      assets3d: subjectAssetIds.size,
    },
    registry: allCurriculumRecords().filter((r) => r.subjectsCovered.includes(reg.id)),
  }
}
