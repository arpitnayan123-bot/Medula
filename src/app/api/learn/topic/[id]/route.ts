// ─── LEARN TOPIC STUDY API — one topic's full study surface ─────────────────
// GET /api/learn/topic/<id> → everything the TopicStudy surface needs:
// topic + subject meta, concepts with 5-state progress, flow-rail counts
// (Learn → Understand → Explore → Clinical → Practice → Revise), key facts
// aggregated from existing lessons, connected topics (same system + genuine
// cross-subject edges), section availability, evidence/sources rollup.
//
// Honesty rules (unchanged): every count is measured; missing lesson fields
// are simply absent — never invented; 0 means zero.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAY, estimatedRecall } from '@/lib/engine'
import { getDemoProfile } from '@/lib/profile'
import { allSubjects, phaseOfSubject } from '@/lib/curriculum/registry'
import { SYSTEMS } from '@/lib/curriculum/taxonomy'
import type { ConceptLesson } from '@/lib/curriculum/types'
import { effectiveLearnStatus, type LearnStatus } from '@/lib/learn-status'

export const dynamic = 'force-dynamic'

const LEGACY_SYSTEM_ALIASES: Record<string, string> = {
  hematology: 'haematology',
  infectious: 'immune-infection',
  neurology: 'nervous',
}
function canonicalSystem(raw: string | null | undefined): string | null {
  if (!raw) return null
  return LEGACY_SYSTEM_ALIASES[raw] ?? raw
}
function systemLabel(key: string | null): string | null {
  if (!key) return null
  return SYSTEMS.find((s) => s.system === key)?.label ?? null
}

function parseLesson(raw: unknown): ConceptLesson | null {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw as ConceptLesson
  return null
}

const KIND_ORDER = [
  'disease', 'process', 'physiology', 'pathology', 'pharmacology', 'microbiology',
  'anatomy', 'investigation', 'clinical_skill', 'drug', 'sign', 'procedure', 'principle', 'concept',
] as const
const KIND_LABEL: Record<string, string> = {
  disease: 'Diseases', process: 'Processes', physiology: 'Physiology', pathology: 'Pathology',
  pharmacology: 'Pharmacology', microbiology: 'Microbiology', anatomy: 'Anatomy',
  investigation: 'Investigations', clinical_skill: 'Clinical skills', drug: 'Drugs',
  sign: 'Signs', procedure: 'Procedures', principle: 'Principles', concept: 'Concepts',
}
function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`
}

class TopicNotFound extends Error {}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    return NextResponse.json(await build(id))
  } catch (err) {
    if (err instanceof TopicNotFound) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }
    console.error('[api/learn/topic] request failed:', err)
    return NextResponse.json({ error: 'Failed to load topic study data' }, { status: 500 })
  }
}

async function build(topicId: string) {
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    include: { subject: true },
  })
  if (!topic) throw new TopicNotFound(topicId)

  const profile = await getDemoProfile()
  const now = new Date()

  const [concepts, flashcards, edges, allAssets, cases] = await Promise.all([
    db.concept.findMany({
      where: { topicId: topic.id },
      select: {
        id: true, name: true, kind: true, summary: true, mnemonic: true,
        difficulty: true, examRelevance: true, lesson: true,
        _count: { select: { questions: true, flashcards: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.flashcard.count({ where: { concept: { topicId: topic.id } } }),
    db.conceptEdge.findMany({
      where: { OR: [{ from: { topicId: topic.id } }, { to: { topicId: topic.id } }] },
      select: { fromId: true, toId: true, type: true },
    }),
    db.asset3D.findMany({ select: { id: true, title: true, conceptIds: true, handcrafted: true } }),
    topic.system
      ? db.clinicalCase.findMany({
          where: { system: topic.system },
          select: { id: true, title: true, specialty: true, difficulty: true },
          take: 6,
        })
      : Promise.resolve([] as { id: string; title: string; specialty: string; difficulty: number }[]),
  ])

  const conceptIds = concepts.map((c) => c.id)

  const [states, marks, pendingRevision] = await Promise.all([
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
    conceptIds.length
      ? db.revisionItem.findMany({
          where: { profileId: profile.id, conceptId: { in: conceptIds }, cleared: false },
          select: { conceptId: true },
        })
      : Promise.resolve([] as { conceptId: string }[]),
  ])

  const stateByConcept = new Map(
    states.map((s) => {
      const days = s.lastReviewed ? (now.getTime() - s.lastReviewed.getTime()) / DAY : 999
      return [s.conceptId, { score: s.score, attemptCount: s.attemptCount, estRecall: estimatedRecall(days, s.stability) }]
    }),
  )
  const markByConcept = new Map(marks.map((m) => [m.entityId, m.status]))
  const pendingRevisionSet = new Set(pendingRevision.map((r) => r.conceptId))

  // ── concepts with effective 5-state status ────────────────────────────────
  const statusCounts: Record<LearnStatus, number> = {
    'not-started': 0, learning: 0, completed: 0, 'needs-revision': 0, mastered: 0,
  }
  const conceptRows = concepts.map((c) => {
    const lesson = parseLesson(c.lesson)
    const state = stateByConcept.get(c.id) ?? null
    let status = effectiveLearnStatus(markByConcept.get(c.id) ?? null, state)
    // A pending revision item is a genuine "needs revision" signal — only
    // surface it when the user has not explicitly marked otherwise.
    if (!markByConcept.get(c.id) && pendingRevisionSet.has(c.id) && status !== 'mastered') {
      status = 'needs-revision'
    }
    statusCounts[status] += 1
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      oneLiner: lesson?.oneLiner || c.summary || '',
      hasLesson: !!lesson,
      mnemonic: c.mnemonic || lesson?.mnemonics?.[0]?.hook || '',
      examWeight: lesson?.examWeight ?? c.examRelevance,
      difficulty: c.difficulty,
      mastery: state ? Math.round(state.score) : 0,
      learnStatus: status,
      marked: markByConcept.has(c.id),
      questionCount: c._count.questions,
      flashcardCount: c._count.flashcards,
    }
  })
  conceptRows.sort(
    (a, b) => b.examWeight - a.examWeight || b.mastery - a.mastery || a.name.localeCompare(b.name),
  )

  // Group by kind (subtopic feel) in a stable, medical order.
  const kindKeys: string[] = []
  for (const c of conceptRows) if (!kindKeys.includes(c.kind)) kindKeys.push(c.kind)
  kindKeys.sort((a, b) => {
    const ia = (KIND_ORDER as readonly string[]).indexOf(a)
    const ib = (KIND_ORDER as readonly string[]).indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  const groups = kindKeys.map((kind) => ({
    kind,
    label: kindLabel(kind),
    concepts: conceptRows.filter((c) => c.kind === kind).map((c) => c.id),
  }))

  // ── lessons rollup: section availability + key facts + evidence ──────────
  const sections = {
    mechanism: false, presentation: false, diagnosis: false, management: false,
    differentials: false, complications: false, reasoning: false, global: false,
    numbers: false, drugs: false, procedures: false, imaging: false, firstPrinciples: false,
  }
  const numbers: { label: string; value: string; note?: string }[] = []
  const seenNumbers = new Set<string>()
  const differentials: { name: string; key: string }[] = []
  const seenDiffs = new Set<string>()
  const mistakes: string[] = []
  const seenMistakes = new Set<string>()
  const mnemonics: { hook: string; expands: string }[] = []
  const seenMnemonic = new Set<string>()
  const evidenceLevels: Record<string, number> = {}
  let lastReviewed: string | null = null
  let reasoningSteps = 0
  let crossLinkCount = 0
  const sourceInstitutions: string[] = []
  const seenSources = new Set<string>()

  for (const c of concepts) {
    const lesson = parseLesson(c.lesson)
    if (!lesson) continue
    if (lesson.mechanism) sections.mechanism = true
    if (lesson.presentation?.length) sections.presentation = true
    if (lesson.diagnosis?.length) sections.diagnosis = true
    if (lesson.management?.length) sections.management = true
    if (lesson.differentials?.length) sections.differentials = true
    if (lesson.complications?.length) sections.complications = true
    if (lesson.reasoning?.length) { sections.reasoning = true; reasoningSteps += lesson.reasoning.length }
    if (lesson.global?.length) sections.global = true
    if (lesson.numbers?.length) sections.numbers = true
    if (lesson.drugs?.length) sections.drugs = true
    if (lesson.procedures?.length) sections.procedures = true
    if (lesson.imaging) sections.imaging = true
    if (lesson.firstPrinciples?.length) sections.firstPrinciples = true
    if (lesson.crossLinks?.length) crossLinkCount += lesson.crossLinks.length

    for (const n of lesson.numbers ?? []) {
      const key = n.label.toLowerCase()
      if (n.label && n.value && !seenNumbers.has(key)) { seenNumbers.add(key); numbers.push({ label: n.label, value: n.value, note: n.note }) }
    }
    for (const d of lesson.differentials ?? []) {
      const key = d.name.toLowerCase()
      if (d.name && d.key && !seenDiffs.has(key)) { seenDiffs.add(key); differentials.push({ name: d.name, key: d.key }) }
    }
    for (const m of lesson.mistakes ?? []) {
      const key = m.toLowerCase().slice(0, 60)
      if (m && !seenMistakes.has(key)) { seenMistakes.add(key); mistakes.push(m) }
    }
    for (const m of lesson.mnemonics ?? []) {
      const key = m.hook.toLowerCase()
      if (m.hook && !seenMnemonic.has(key)) { seenMnemonic.add(key); mnemonics.push({ hook: m.hook, expands: m.expands }) }
    }
    evidenceLevels[lesson.evidenceLevel] = (evidenceLevels[lesson.evidenceLevel] ?? 0) + 1
    if (lesson.lastReviewed && (!lastReviewed || lesson.lastReviewed > lastReviewed)) lastReviewed = lesson.lastReviewed
    for (const s of lesson.sources ?? []) {
      const key = `${s.institution}::${s.title}`.toLowerCase()
      if (!seenSources.has(key)) { seenSources.add(key); sourceInstitutions.push(s.institution) }
    }
  }

  // ── connected topics: same subject+system first, then cross-subject edges ─
  const [siblingTopics, allTopics, neighbourConcepts] = await Promise.all([
    db.topic.findMany({
      where: { subjectId: topic.subjectId, id: { not: topic.id }, ...(topic.system ? { system: topic.system } : {}) },
      select: { id: true, name: true, system: true, importance: true },
      take: 6,
    }),
    db.topic.findMany({ select: { id: true, name: true, subjectId: true } }),
    db.concept.findMany({
      where: { id: { in: [...new Set(edges.flatMap((e) => [e.fromId, e.toId]))] } },
      select: { id: true, name: true, topicId: true },
    }),
  ])
  const topicById = new Map(allTopics.map((t) => [t.id, t]))
  const conceptById = new Map(concepts.map((c) => [c.id, c]))
  const neighbourById = new Map(neighbourConcepts.map((c) => [c.id, c]))
  const subjectMeta = new Map(allSubjects().map((s) => [s.id, s]))

  // Cross-subject: edge leaves this topic's concept → neighbour concept in
  // another topic → whose subject differs from this topic's subject.
  const crossLinks = new Map<string, { links: number; via: string[] }>()
  for (const e of edges) {
    const mineId = conceptById.has(e.fromId) ? e.fromId : conceptById.has(e.toId) ? e.toId : null
    if (!mineId) continue
    const otherId = mineId === e.fromId ? e.toId : e.fromId
    const neighbour = neighbourById.get(otherId)
    const targetTopic = neighbour ? topicById.get(neighbour.topicId) : undefined
    if (!targetTopic || targetTopic.subjectId === topic.subjectId) continue
    const cur = crossLinks.get(targetTopic.id) ?? { links: 0, via: [] }
    cur.links += 1
    const mineName = conceptById.get(mineId)?.name
    if (mineName && cur.via.length < 2) cur.via.push(mineName)
    crossLinks.set(targetTopic.id, cur)
  }

  const connectedTopics: {
    id: string; name: string; subjectName: string; subjectColor: string
    system: string | null; reason: string
  }[] = []
  for (const t of siblingTopics.slice(0, 4)) {
    const meta = subjectMeta.get(topic.subjectId)
    connectedTopics.push({
      id: t.id, name: t.name,
      subjectName: meta?.name ?? topic.subject.name,
      subjectColor: meta?.color ?? topic.subject.color,
      system: canonicalSystem(t.system),
      reason: 'Same system — builds on this topic',
    })
  }
  for (const [linkedTopicId, link] of [...crossLinks.entries()].sort((a, b) => b[1].links - a[1].links).slice(0, 4)) {
    const t = topicById.get(linkedTopicId)
    if (!t) continue
    const meta = subjectMeta.get(t.subjectId)
    if (!meta) continue
    connectedTopics.push({
      id: t.id, name: t.name, subjectName: meta.name, subjectColor: meta.color,
      system: null,
      reason: `Via ${link.via[0] ?? 'concept links'} → ${meta.name}`,
    })
  }

  // ── 3D assets touching this topic's concepts ─────────────────────────────
  const assets3d = allAssets
    .filter((a) => {
      const ids = Array.isArray(a.conceptIds) ? (a.conceptIds as unknown[]) : []
      return ids.some((cid) => conceptIds.includes(String(cid)))
    })
    .map((a) => ({
      id: a.id,
      title: a.title,
      handcrafted: a.handcrafted,
      conceptIds: (Array.isArray(a.conceptIds) ? (a.conceptIds as unknown[]) : [])
        .map((cid) => String(cid))
        .filter((cid) => conceptIds.includes(cid)),
    }))

  // ── topic-level progress mark ─────────────────────────────────────────────
  const topicMark = await db.learnProgress.findUnique({
    where: { profileId_kind_entityId: { profileId: profile.id, kind: 'topic', entityId: topic.id } },
    select: { status: true, updatedAt: true },
  })

  const reg = subjectMeta.get(topic.subjectId)

  return {
    topic: {
      id: topic.id,
      name: topic.name,
      system: canonicalSystem(topic.system),
      systemLabel: systemLabel(canonicalSystem(topic.system)),
      importance: topic.importance,
      description: topic.description,
      subject: {
        id: topic.subject.id,
        code: topic.subject.code,
        name: topic.subject.name,
        color: reg?.color ?? topic.subject.color,
        year: reg?.year ?? topic.subject.year,
        phase: phaseOfSubject(topic.subject.id) ?? reg?.phase ?? 'pre-clinical',
      },
    },
    concepts: conceptRows,
    groups,
    statusCounts,
    flow: {
      learn: { concepts: conceptRows.length, lessons: conceptRows.filter((c) => c.hasLesson).length },
      understand: { lessons: conceptRows.filter((c) => c.hasLesson).length },
      explore: { assets3d: assets3d.length },
      clinical: { cases: cases.length, reasoningSteps, crossLinks: crossLinkCount },
      practice: { questions: conceptRows.reduce((a, c) => a + c.questionCount, 0) },
      revise: { flashcards },
    },
    assets3d,
    cases,
    keyFacts: {
      numbers: numbers.slice(0, 12),
      differentials: differentials.slice(0, 10),
      mistakes: mistakes.slice(0, 8),
      mnemonics: mnemonics.slice(0, 6),
    },
    sections,
    connectedTopics,
    evidence: {
      levels: evidenceLevels,
      lastReviewed,
      sourcesCount: seenSources.size,
      sourceInstitutions: [...new Set(sourceInstitutions)].slice(0, 8),
    },
    progress: {
      status: (topicMark?.status ?? null) as LearnStatus | null,
      marked: !!topicMark,
      updatedAt: topicMark?.updatedAt.toISOString() ?? null,
    },
  }
}
