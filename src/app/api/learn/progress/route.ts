// ─── LEARN PROGRESS API — explicit 5-state marks (topic | concept) ──────────
// GET  /api/learn/progress                      → every mark for the profile
// GET  /api/learn/progress?topicId=<id>         → resolved statuses inside a topic
// GET  /api/learn/progress?conceptId=<id>       → one concept's resolved status
// POST /api/learn/progress                      → set or clear a mark
//
// POST body: { kind: 'topic'|'concept', entityId, status }
//   status ∈ 'learning' | 'completed' | 'needs-revision' | 'mastered' | null
//   status null → clear the mark (falls back to auto-derived status).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAY, estimatedRecall } from '@/lib/engine'
import { getDemoProfile } from '@/lib/profile'
import { effectiveLearnStatus, isSettableLearnStatus, type LearnStatus } from '@/lib/learn-status'

export const dynamic = 'force-dynamic'

function emptyCounts(): Record<LearnStatus, number> {
  return { 'not-started': 0, learning: 0, completed: 0, 'needs-revision': 0, mastered: 0 }
}

export async function GET(req: NextRequest) {
  const topicId = req.nextUrl.searchParams.get('topicId')
  const conceptId = req.nextUrl.searchParams.get('conceptId')
  try {
    const profile = await getDemoProfile()

    if (conceptId) {
      const concept = await db.concept.findUnique({
        where: { id: conceptId },
        select: { id: true, name: true },
      })
      if (!concept) return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
      const [state, mark] = await Promise.all([
        db.knowledgeState.findUnique({
          where: { profileId_conceptId: { profileId: profile.id, conceptId } },
          select: { score: true, attemptCount: true, lastReviewed: true, stability: true },
        }),
        db.learnProgress.findUnique({
          where: { profileId_kind_entityId: { profileId: profile.id, kind: 'concept', entityId: conceptId } },
          select: { status: true, updatedAt: true },
        }),
      ])
      const days = state?.lastReviewed ? (Date.now() - state.lastReviewed.getTime()) / DAY : 999
      return NextResponse.json({
        conceptId,
        name: concept.name,
        marked: mark?.status ?? null,
        markedAt: mark?.updatedAt.toISOString() ?? null,
        status: effectiveLearnStatus(mark?.status ?? null, state
          ? { score: state.score, attemptCount: state.attemptCount, estRecall: estimatedRecall(days, state.stability) }
          : null),
      })
    }

    if (topicId) {
      const topic = await db.topic.findUnique({
        where: { id: topicId },
        select: { id: true, concepts: { select: { id: true } } },
      })
      if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
      const conceptIds = topic.concepts.map((c) => c.id)
      const [states, marks, topicMark] = await Promise.all([
        conceptIds.length
          ? db.knowledgeState.findMany({
              where: { profileId: profile.id, conceptId: { in: conceptIds } },
              select: { conceptId: true, score: true, attemptCount: true, lastReviewed: true, stability: true },
            })
          : Promise.resolve([] as { conceptId: string; score: number; attemptCount: number; lastReviewed: Date | null; stability: number }[]),
        conceptIds.length
          ? db.learnProgress.findMany({
              where: { profileId: profile.id, kind: 'concept', entityId: { in: conceptIds } },
              select: { entityId: true, status: true, updatedAt: true },
            })
          : Promise.resolve([] as { entityId: string; status: string; updatedAt: Date }[]),
        db.learnProgress.findUnique({
          where: { profileId_kind_entityId: { profileId: profile.id, kind: 'topic', entityId: topicId } },
          select: { status: true, updatedAt: true },
        }),
      ])
      const stateByConcept = new Map(
        states.map((s) => {
          const days = s.lastReviewed ? (Date.now() - s.lastReviewed.getTime()) / DAY : 999
          return [s.conceptId, { score: s.score, attemptCount: s.attemptCount, estRecall: estimatedRecall(days, s.stability) }]
        }),
      )
      const markByConcept = new Map(marks.map((m) => [m.entityId, m.status]))
      const statusCounts = emptyCounts()
      const resolved: Record<string, LearnStatus> = {}
      for (const cid of conceptIds) {
        const st = effectiveLearnStatus(markByConcept.get(cid) ?? null, stateByConcept.get(cid) ?? null)
        resolved[cid] = st
        statusCounts[st] += 1
      }
      return NextResponse.json({
        topicId,
        topicMark: markByConceptTopic(topicMark),
        statusCounts,
        concepts: resolved,
      })
    }

    const marks = await db.learnProgress.findMany({
      where: { profileId: profile.id },
      select: { kind: true, entityId: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    })
    const topics: Record<string, { status: string; updatedAt: string }> = {}
    const concepts: Record<string, { status: string; updatedAt: string }> = {}
    for (const m of marks) {
      const entry = { status: m.status, updatedAt: m.updatedAt.toISOString() }
      if (m.kind === 'topic') topics[m.entityId] = entry
      else if (m.kind === 'concept') concepts[m.entityId] = entry
    }
    return NextResponse.json({ topics, concepts })
  } catch (err) {
    console.error('[api/learn/progress] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 })
  }
}

function markByConceptTopic(mark: { status: string; updatedAt: Date } | null) {
  return mark ? { status: mark.status, updatedAt: mark.updatedAt.toISOString() } : null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      kind?: unknown; entityId?: unknown; status?: unknown
    }
    const kind = body.kind
    const entityId = body.entityId
    const status = body.status

    if (kind !== 'topic' && kind !== 'concept') {
      return NextResponse.json({ error: 'kind must be "topic" or "concept"' }, { status: 400 })
    }
    if (typeof entityId !== 'string' || !entityId || entityId.length > 200) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
    }
    const profile = await getDemoProfile()

    // status null/undefined/'not-started' → clear the mark
    if (status === null || status === undefined || status === 'not-started') {
      await db.learnProgress.deleteMany({
        where: { profileId: profile.id, kind, entityId },
      })
      return NextResponse.json({ ok: true, status: null, cleared: true })
    }
    if (!isSettableLearnStatus(status)) {
      return NextResponse.json(
        { error: 'status must be learning | completed | needs-revision | mastered | null' },
        { status: 400 },
      )
    }

    // Validate the target exists — never mark a ghost id.
    const exists =
      kind === 'topic'
        ? !!(await db.topic.findUnique({ where: { id: entityId }, select: { id: true } }))
        : !!(await db.concept.findUnique({ where: { id: entityId }, select: { id: true } }))
    if (!exists) return NextResponse.json({ error: `${kind} not found` }, { status: 404 })

    const saved = await db.learnProgress.upsert({
      where: { profileId_kind_entityId: { profileId: profile.id, kind, entityId } },
      create: { profileId: profile.id, kind, entityId, status },
      update: { status },
      select: { status: true, updatedAt: true },
    })
    return NextResponse.json({ ok: true, status: saved.status, updatedAt: saved.updatedAt.toISOString() })
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    console.error('[api/learn/progress] POST failed:', err)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}
