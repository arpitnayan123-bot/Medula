// ─── AI FACULTY & CONTENT INTELLIGENCE — ENGINE (PRODUCT 19) ─────────────────
// Deterministic, computed-on-read engine over the real content tables plus
// this account's measured learning activity. The AI layer (assist) lives in
// the route and only ever PRODUCES DRAFTS via the draft helpers here.
//
// Binding rules (enforced by construction, published verbatim in payloads):
// - MEASURED ONLY: every count, share and priority is computed from Subject/
//   Topic/Concept/Question/Flashcard/ClinicalCase/SimCase/LabImage/
//   LearningModule/ConceptEdge rows and this account's QuestionAttempt /
//   MistakeRecord / KnowledgeState / LearnProgress / RevisionItem activity.
//   Nothing is estimated, sampled from peers or invented.
// - AI NEVER PUBLISHES: drafts carry aiAssisted + status; `publish` requires a
//   reviewer note and mints a FacultyContentVersion attributed to a human
//   reviewer. Verification status is 'verified' only when references exist —
//   publishing without references stays 'unverified'.
// - FLAG, DON'T DECLARE: quality findings are flagged FOR human review; the
//   engine never auto-resolves a finding or declares content correct.
// - VERSIONING: FacultyContentVersion rows are additive; applying lesson
//   content is an explicit reviewer action that only ADDS a facultyRevision
//   block and refreshes lastReviewed — KnowledgeState/attempt rows keyed by
//   conceptId are never rewritten.
// - PRIORITY (published): exam weight × learner demand × severity, so faculty
//   effort lands where students struggle most — not where the library is thin.
// - No chain-of-thought anywhere: payloads carry final measured results only.

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type {
  FacultyEntityType, FacultyGapItem, FacultyGapKind, FacultyGapsPayload, FacultySeverity,
  FacultyQualityItem, FacultyQualityKind, FacultyQualityPayload,
  FacultyInventoryPayload, FacultyInventorySubject,
  FacultyDraftView, FacultyDraftsPayload, FacultyDraftStatus, FacultyDraftKind, FacultyDraftBody,
  FacultyReviewItemView, FacultyReviewQueuePayload,
  FacultyRecommendItem, FacultyRecommendResource, FacultyRecommendPayload,
  FacultyVersionView, FacultyVersionsPayload, FacultyHomePayload,
} from '@/lib/types'
import { EXTERNAL_CATALOG } from '@/lib/resource-catalog'

// ── constants ────────────────────────────────────────────────────────────────

export const FACULTY_ACTOR = 'Faculty (demo)'

const DAY_MS = 86_400_000
const OUTDATED_LESSON_DAYS = 540 // ~18 months since last content review
const ITEMS_CAP = 60 // payload cap — counts stay complete and honest
const SEVERITY_RANK: Record<FacultySeverity, number> = { critical: 0, warning: 1, info: 2 }

const GAP_KINDS: FacultyGapKind[] = [
  'missing-lesson', 'missing-practice', 'missing-revision', 'missing-case-correlation',
  'missing-prerequisite-lesson', 'unlinked-question', 'unlinked-flashcard', 'outdated-content',
]
const QUALITY_KINDS: FacultyQualityKind[] = [
  'answer-key-skew', 'duplicate-question', 'ambiguous-mcq', 'poor-explanation',
  'missing-option-notes', 'missing-citation', 'outdated-resource', 'fail-after-read', 'open-report',
]

const PRIORITIZED_BY =
  'priority = exam weight (0–45) + learner demand (0–40) + severity (0–15), scaled 0–100 — measured from the content tables and this account\'s learning activity'

const GAPS_DATA_BASIS =
  'Live reads of Concept.lesson presence, per-concept Question/Flashcard pools, ConceptEdge prerequisites, case linkage (ClinicalCase.system + SimCase brief conceptIds) and this account\'s attempts, mistakes, knowledge states, lesson marks and open revision items.'

const QUALITY_DISCLAIMER =
  'These are measured QC signals over the library — a human reviewer decides every outcome; no automated check can certify medical correctness.'

// ── small helpers ────────────────────────────────────────────────────────────

export class FacultyHttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

const num = (n: number) => n.toLocaleString('en-IN')
const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null)
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

const normStem = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const severityScore = (s: FacultySeverity): number => (s === 'critical' ? 15 : s === 'warning' ? 8 : 3)

function demandScore(d: { attempts: number; mistakes: number; revisionItems: number; learnWeight: number }): number {
  const raw = d.attempts * 1 + d.mistakes * 3 + d.revisionItems * 5 + d.learnWeight * 8
  return Math.min(40, raw)
}

const LEARN_WEIGHT: Record<string, number> = {
  learning: 3, completed: 5, 'needs-revision': 6, mastered: 0,
}

function gapPriority(examWeight: number | null, demand: number, severity: FacultySeverity): number {
  const exam = ((Math.max(1, Math.min(5, examWeight ?? 2))) / 5) * 45
  return Math.round(Math.min(100, exam + Math.min(40, demand) + severityScore(severity)))
}

// ── shared measured context (one set of queries feeds gaps + quality + home) ─

interface Demand {
  attempts: number; correct: number; wrong: number; mistakes: number
  revisionItems: number; learnWeight: number; ksAttempts: number
}

interface ContentContext {
  subjects: { id: string; name: string; code: string }[]
  topics: { id: string; name: string; subjectId: string; subjectName: string; system: string; importance: number }[]
  concepts: {
    id: string; name: string; topicId: string; kind: string; summary: string
    examWeight: number | null; hasLesson: boolean; lastReviewed: string | null
    hasEvidence: boolean
  }[]
  prereqEdges: { fromId: string; toId: string }[]
  questionCountByConcept: Map<string, number>
  flashcardCountByConcept: Map<string, number>
  demandByConcept: Map<string, Demand>
  caseCountByTopic: Map<string, number>
  total: {
    questions: number; flashcards: number; cases: number; simCases: number
    labImages: number; modules: number; edges: number; verifiedEdges: number; pyqQuestions: number
  }
}

const LEARN_SELECT_WEIGHTED = { status: true }

async function loadContentContext(): Promise<ContentContext> {
  const [subjects, topics, conceptsRaw, lessonIds, prereqEdges, qByConcept, fByConcept, attempts, mistakes, revisionByConcept, learnRows, ksRows, cases, simCases, labImages, modules, edges, verEdges] = await Promise.all([
    db.subject.findMany({ select: { id: true, name: true, code: true } }),
    db.topic.findMany({ select: { id: true, name: true, subjectId: true, system: true, importance: true, subject: { select: { name: true } } } }),
    db.concept.findMany({
      select: { id: true, name: true, topicId: true, kind: true, summary: true, examWeight: true, evidenceLevel: true, lastReviewed: true },
    }),
    db.concept.findMany({ where: { lesson: { not: Prisma.DbNull } }, select: { id: true } }),
    db.conceptEdge.findMany({ where: { type: 'prerequisite_of' }, select: { fromId: true, toId: true } }),
    db.question.groupBy({ by: ['conceptId'], _count: true }),
    db.flashcard.groupBy({ by: ['conceptId'], _count: true }),
    db.questionAttempt.findMany({ select: { correct: true, question: { select: { conceptId: true } } } }),
    db.mistakeRecord.findMany({ select: { conceptId: true, wrongCount: true } }),
    db.revisionItem.groupBy({ by: ['conceptId'], where: { cleared: false }, _count: true }),
    db.learnProgress.findMany({ select: { kind: true, entityId: true, ...LEARN_SELECT_WEIGHTED } }),
    db.knowledgeState.findMany({ select: { conceptId: true, attemptCount: true } }),
    db.clinicalCase.findMany({ select: { system: true } }),
    db.simCase.findMany({ select: { brief: true } }),
    db.labImage.findMany({ select: { id: true, subjectCode: true } }),
    db.learningModule.findMany({ select: { id: true, stepsJson: true } }),
    db.conceptEdge.count(),
    db.conceptEdge.count({ where: { verified: true } }),
  ])
  const pyqRows = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT COUNT(*) AS c FROM Question WHERE tags LIKE '%pyq-pattern%'`)
  const pyq = Number(pyqRows[0]?.c ?? 0)

  const hasLesson = new Set(lessonIds.map((c) => c.id))

  // topic → subject mapping + per-topic case linkage (measured, both sources)
  const topicSubject = new Map(topics.map((t) => [t.id, t]))
  const conceptTopic = new Map(conceptsRaw.map((c) => [c.id, c.topicId]))
  const caseCountByTopic = new Map<string, number>()
  const caseBySystem = new Map<string, number>()
  for (const c of cases) {
    if (c.system) caseBySystem.set(c.system, (caseBySystem.get(c.system) ?? 0) + 1)
  }
  const simConcepts = new Set<string>()
  for (const s of simCases) {
    const brief = s.brief as { conceptIds?: unknown } | null
    const ids = Array.isArray(brief?.conceptIds) ? (brief!.conceptIds as unknown[]) : []
    for (const id of ids) if (typeof id === 'string') simConcepts.add(id)
  }
  for (const t of topics) {
    let n = caseBySystem.get(t.system ?? '') ?? 0 // ClinicalCase.system matches the topic's system string
    if (n === 0) {
      // fallback: any sim case whose brief conceptIds sit inside this topic
      n = conceptsRaw.filter((c) => c.topicId === t.id && simConcepts.has(c.id)).length > 0 ? 1 : 0
    }
    caseCountByTopic.set(t.id, n)
  }

  const demandByConcept = new Map<string, Demand>()
  const blankDemand = (): Demand => ({ attempts: 0, correct: 0, wrong: 0, mistakes: 0, revisionItems: 0, learnWeight: 0, ksAttempts: 0 })
  const demandOf = (conceptId: string): Demand => {
    let d = demandByConcept.get(conceptId)
    if (!d) { d = blankDemand(); demandByConcept.set(conceptId, d) }
    return d
  }
  for (const a of attempts) {
    const cid = a.question.conceptId
    if (!cid) continue
    const d = demandOf(cid)
    d.attempts += 1
    if (a.correct) d.correct += 1; else d.wrong += 1
  }
  for (const m of mistakes) {
    if (!m.conceptId) continue
    demandOf(m.conceptId).mistakes += m.wrongCount
  }
  for (const r of revisionByConcept) if (r.conceptId) demandOf(r.conceptId).revisionItems = r._count
  for (const l of learnRows) {
    if (l.kind !== 'concept') continue
    const w = LEARN_WEIGHT[l.status] ?? 0
    if (w > 0) demandOf(l.entityId).learnWeight = Math.max(demandOf(l.entityId).learnWeight, w)
  }
  for (const k of ksRows) if (k.conceptId) demandOf(k.conceptId).ksAttempts = Math.max(demandOf(k.conceptId).ksAttempts, k.attemptCount)

  const concepts = conceptsRaw.map((c) => ({
    id: c.id, name: c.name, topicId: c.topicId, kind: c.kind, summary: c.summary,
    examWeight: c.examWeight, hasLesson: hasLesson.has(c.id),
    lastReviewed: c.lastReviewed ?? null,
    hasEvidence: Boolean(c.evidenceLevel),
  }))

  return {
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
    topics: topics.map((t) => ({ id: t.id, name: t.name, subjectId: t.subjectId, subjectName: t.subject.name, system: t.system ?? '', importance: t.importance })),
    concepts,
    prereqEdges,
    questionCountByConcept: new Map(qByConcept.filter((r) => r.conceptId).map((r) => [r.conceptId as string, r._count])),
    flashcardCountByConcept: new Map(fByConcept.filter((r) => r.conceptId).map((r) => [r.conceptId as string, r._count])),
    demandByConcept,
    caseCountByTopic,
    total: {
      questions: (await db.question.count()),
      flashcards: (await db.flashcard.count()),
      cases: cases.length,
      simCases: simCases.length,
      labImages: labImages.length,
      modules: modules.length,
      edges,
      verifiedEdges: verEdges,
      pyqQuestions: pyq,
    },
  }
}

// ── INVENTORY ────────────────────────────────────────────────────────────────

export async function getInventory(): Promise<FacultyInventoryPayload> {
  const [subjects, topicsRaw, ctx, lessonsBySubject, topicCountBySubject, conceptCountBySubject, qBySubject, fBySubject, unlinkedQ, unlinkedQTotal, questionsWithoutConcept, unlinkedF, unlinkedFTotal, casesForSystems] = await Promise.all([
    db.subject.findMany({ select: { id: true, name: true } }),
    db.topic.findMany({ select: { id: true, subjectId: true, system: true } }),
    loadContentContext(),
    db.concept.findMany({ where: { lesson: { not: Prisma.DbNull } }, select: { id: true, topicId: true } }),
    db.topic.groupBy({ by: ['subjectId'], _count: true }),
    db.concept.groupBy({ by: ['topicId'], _count: true }), // per-topic concept counts, rolled up below
    db.question.groupBy({ by: ['subjectCode'], _count: true }),
    db.flashcard.groupBy({ by: ['subjectCode'], _count: true }),
    db.question.findMany({ where: { topicId: null }, select: { id: true, stem: true, subjectCode: true }, take: 5 }),
    db.question.count({ where: { topicId: null } }),
    db.question.count({ where: { conceptId: null } }),
    db.flashcard.findMany({ where: { conceptId: null }, select: { id: true, front: true, subjectCode: true }, take: 5 }),
    db.flashcard.count({ where: { conceptId: null } }),
    db.clinicalCase.findMany({ select: { system: true } }),
  ])

  // topic→subject + concept→topic rollups
  const topicToSubject = new Map(topicsRaw.map((t) => [t.id, t.subjectId]))
  const lessonSubject = new Map<string, number>()
  for (const l of lessonsBySubject) {
    const sid = topicToSubject.get(l.topicId)
    if (sid) lessonSubject.set(sid, (lessonSubject.get(sid) ?? 0) + 1)
  }
  const conceptTopicCount = new Map<string, number>()
  for (const row of conceptCountBySubject) conceptTopicCount.set(row.topicId, row._count)
  const conceptSubject = new Map<string, number>()
  for (const c of ctx.concepts) {
    const sid = topicToSubject.get(c.topicId)
    if (sid) conceptSubject.set(sid, (conceptSubject.get(sid) ?? 0) + 1)
  }
  const topicSubjectCount = new Map(topicCountBySubject.map((r) => [r.subjectId, r._count]))
  const qSubject = new Map(qBySubject.map((r) => [r.subjectCode, r._count]))
  const fSubject = new Map(fBySubject.map((r) => [r.subjectCode, r._count]))

  // per-subject case counts: ClinicalCase.system ∈ the subject's topic systems
  const topicSystemsBySubject = new Map<string, Set<string>>()
  for (const t of topicsRaw) {
    if (!t.system) continue
    let set = topicSystemsBySubject.get(t.subjectId)
    if (!set) { set = new Set(); topicSystemsBySubject.set(t.subjectId, set) }
    set.add(t.system)
  }
  const caseBySystem = new Map<string, number>()
  for (const c of casesForSystems) if (c.system) caseBySystem.set(c.system, (caseBySystem.get(c.system) ?? 0) + 1)

  const rows: FacultyInventorySubject[] = subjects.map((s) => {
    const concepts = conceptSubject.get(s.id) ?? 0
    const lessons = lessonSubject.get(s.id) ?? 0
    return {
      id: s.id,
      name: s.name,
      topics: topicSubjectCount.get(s.id) ?? 0,
      concepts,
      lessons,
      questions: qSubject.get(s.id) ?? 0,
      flashcards: fSubject.get(s.id) ?? 0,
      cases: [...(topicSystemsBySubject.get(s.id) ?? [])].reduce((acc, sys) => acc + (caseBySystem.get(sys) ?? 0), 0),
      lessonCoveragePct: concepts > 0 ? Math.round((lessons / concepts) * 100) : null,
    }
  }).sort((a, b) => b.concepts - a.concepts)

  const totals = {
    subjects: subjects.length,
    topics: topicsRaw.length,
    concepts: ctx.concepts.length,
    lessons: lessonsBySubject.length,
    questions: ctx.total.questions,
    pyqPatternQuestions: ctx.total.pyqQuestions,
    flashcards: ctx.total.flashcards,
    cases: ctx.total.cases,
    simCases: ctx.total.simCases,
    labImages: ctx.total.labImages,
    learningModules: ctx.total.modules,
    edges: ctx.total.edges,
    verifiedEdges: ctx.total.verifiedEdges,
  }

  return {
    generatedAt: new Date().toISOString(),
    totals,
    subjects: rows,
    organization: {
      unlinkedQuestions: {
        count: unlinkedQTotal,
        sample: unlinkedQ.map((q) => ({ id: q.id, stem: trunc(q.stem, 90), subjectCode: q.subjectCode })),
      },
      questionsWithoutConcept,
      unlinkedFlashcards: {
        count: unlinkedFTotal,
        sample: unlinkedF.map((f) => ({ id: f.id, front: trunc(f.front, 90), subjectCode: f.subjectCode })),
      },
    },
    note: 'Counts are live reads of the content tables — nothing cached, nothing estimated. "Cases" matches ClinicalCase.system against each subject\'s topic systems; sim cases link through brief conceptIds.',
  }
}

// ── GAPS ─────────────────────────────────────────────────────────────────────

async function computeGaps(): Promise<{ payload: FacultyGapsPayload; critical: number }> {
  const ctx = await loadContentContext()
  const items: FacultyGapItem[] = []

  const conceptById = new Map(ctx.concepts.map((c) => [c.id, c]))
  const topicById = new Map(ctx.topics.map((t) => [t.id, t]))
  const conceptsByTopic = new Map<string, number>()
  for (const c of ctx.concepts) conceptsByTopic.set(c.topicId, (conceptsByTopic.get(c.topicId) ?? 0) + 1)
  const prereqByTarget = new Map<string, string[]>()
  for (const e of ctx.prereqEdges) {
    const list = prereqByTarget.get(e.toId) ?? []
    list.push(e.fromId)
    prereqByTarget.set(e.toId, list)
  }

  const demandLine = (d: Demand): string | null => {
    if (d.attempts === 0 && d.mistakes === 0 && d.revisionItems === 0) return null
    const acc = d.attempts > 0 ? pct(d.correct, d.attempts) : null
    const parts = [`${num(d.attempts)} attempts`]
    if (acc !== null) parts.push(`${acc}% correct`)
    if (d.mistakes > 0) parts.push(`${num(d.mistakes)} mistakes`)
    if (d.revisionItems > 0) parts.push(`${num(d.revisionItems)} open revision items`)
    return parts.join(' · ')
  }

  const gap = (g: Omit<FacultyGapItem, 'id'>) => items.push({ id: `${g.kind}:${g.entityType}:${g.entityId}`, ...g })

  const outdatedCutoff = Date.now() - OUTDATED_LESSON_DAYS * DAY_MS

  for (const c of ctx.concepts) {
    const topic = topicById.get(c.topicId)
    const d = ctx.demandByConcept.get(c.id) ?? {
      attempts: 0, correct: 0, wrong: 0, mistakes: 0, revisionItems: 0, learnWeight: 0, ksAttempts: 0,
    }
    const weight = c.examWeight
    const demand = demandScore(d)
    const dl = demandLine(d)
    const ctxLine = `${topic ? `${topic.name} · ${topic.subjectName}` : c.topicId}`

    // 1) missing-lesson
    if (!c.hasLesson) {
      const severity: FacultySeverity =
        weight !== null && weight >= 4 && (d.attempts >= 8 || d.mistakes >= 2 || d.learnWeight >= 5) ? 'critical'
          : (weight !== null && weight >= 3) || demand >= 8 ? 'warning' : 'info'
      const evidence = [`No structured lesson exists for “${c.name}” — checked live against Concept.lesson.`]
      if (weight !== null) evidence.push(`Exam weight ${weight}/5 on the concept record.`)
      if (dl) evidence.push(`Measured demand on this account: ${dl}.`)
      evidence.push(`Where: ${ctxLine}.`)
      gap({
        kind: 'missing-lesson', severity, entityType: 'concept', entityId: c.id,
        label: `${c.name} — no lesson`, subjectName: topic?.subjectName, topicName: topic?.name,
        examWeight: weight, demandLine: dl ?? undefined, evidence,
        suggestion: 'Draft a structured lesson in the Studio (summary → key points → flashcards) and send it for review — students hitting this concept in practice currently have no lesson to fall back on.',
        priority: gapPriority(weight, demand, severity),
        handoff: { view: 'learn', label: 'Open Learn', focus: c.id },
      })
    }

    // 2) missing-practice
    if ((ctx.questionCountByConcept.get(c.id) ?? 0) === 0) {
      const severity: FacultySeverity = weight !== null && weight >= 4 ? 'warning' : 'info'
      const evidence = [`Zero questions are linked to “${c.name}” in the question bank.`]
      if (weight !== null) evidence.push(`Exam weight ${weight}/5.`)
      if (d.learnWeight > 0 || d.revisionItems > 0) evidence.push(`This account marked it as learning material${d.revisionItems > 0 ? ` with ${num(d.revisionItems)} open revision items` : ''} — practice cannot follow.`)
      evidence.push(`Where: ${ctxLine}.`)
      gap({
        kind: 'missing-practice', severity, entityType: 'concept', entityId: c.id,
        label: `${c.name} — no practice pool`, subjectName: topic?.subjectName, topicName: topic?.name,
        examWeight: weight, demandLine: dl ?? undefined, evidence,
        suggestion: 'Link existing questions to this concept or draft new MCQs in the Studio — a concept without practice cannot be tested, revised or measured.',
        priority: gapPriority(weight, demand, severity),
        handoff: { view: 'questions', label: 'Open Questions', focus: c.id },
      })
    }

    // 3) missing-revision
    if ((ctx.flashcardCountByConcept.get(c.id) ?? 0) === 0) {
      const severity: FacultySeverity = weight !== null && weight >= 4 ? 'warning' : 'info'
      const evidence = [`No flashcards are linked to “${c.name}” — spaced repetition cannot schedule it.`]
      if (weight !== null) evidence.push(`Exam weight ${weight}/5.`)
      evidence.push(`Where: ${ctxLine}.`)
      gap({
        kind: 'missing-revision', severity, entityType: 'concept', entityId: c.id,
        label: `${c.name} — no revision material`, subjectName: topic?.subjectName, topicName: topic?.name,
        examWeight: weight, demandLine: dl ?? undefined, evidence,
        suggestion: 'Draft flashcards in the Studio from the existing lesson (or summary when no lesson exists) so spaced repetition can carry this concept.',
        priority: gapPriority(weight, demand, severity),
        handoff: { view: 'revise', label: 'Open Revision', focus: c.id },
      })
    }

    // 4) missing-prerequisite-lesson — a prereq on the graph lacks a lesson
    const prereqs = prereqByTarget.get(c.id) ?? []
    const prereqGaps = prereqs.filter((pid) => {
      const p = conceptById.get(pid)
      return p && !p.hasLesson
    })
    if (prereqGaps.length > 0) {
      const p0 = conceptById.get(prereqGaps[0])!
      const severity: FacultySeverity = c.examWeight !== null && c.examWeight >= 3 ? 'warning' : 'info'
      const evidence = [
        `“${p0.name}” is a published prerequisite of “${c.name}” on the concept graph but has no lesson.`,
        `${prereqGaps.length} prerequisite${prereqGaps.length === 1 ? '' : 's'} of this concept lack lessons.`,
        dl ? `Measured demand on this account: ${dl}.` : `Concept graph edge: ${prereqGaps.map((id) => conceptById.get(id)?.name ?? id).join(', ')}.`,
      ]
      gap({
        kind: 'missing-prerequisite-lesson', severity, entityType: 'concept', entityId: c.id,
        label: `${c.name} — prerequisite without a lesson`, subjectName: topic?.subjectName, topicName: topic?.name,
        examWeight: c.examWeight, demandLine: dl ?? undefined, evidence,
        suggestion: `Write or link a lesson for ${p0.name} first — students reaching “${c.name}” stand on a step that does not exist yet.`,
        priority: gapPriority(c.examWeight, demand, severity),
        handoff: { view: 'graph', label: 'View on Graph', focus: c.id },
      })
    }

    // 5) outdated-content — lesson last reviewed too long ago
    if (c.hasLesson && c.lastReviewed) {
      const t = Date.parse(c.lastReviewed)
      if (Number.isFinite(t) && t < outdatedCutoff) {
        const severity: FacultySeverity = 'warning'
        const days = Math.floor((Date.now() - t) / DAY_MS)
        gap({
          kind: 'outdated-content', severity, entityType: 'concept', entityId: c.id,
          label: `${c.name} — review overdue`, subjectName: topic?.subjectName, topicName: topic?.name,
          examWeight: c.examWeight, demandLine: dl ?? undefined,
          evidence: [
            `Lesson last reviewed ${new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} — ${num(days)} days ago (threshold: ${num(OUTDATED_LESSON_DAYS)}).`,
            dl ? `Measured demand on this account: ${dl}.` : `Where: ${ctxLine}.`,
          ],
          suggestion: 'Re-verify the lesson against the current standard textbook or guideline, then publish a fresh version so the review date moves forward.',
          priority: gapPriority(c.examWeight, demand, severity),
          handoff: { view: 'learn', label: 'Open Lesson', focus: c.id },
        })
      }
    }
  }

  // 6) missing-case-correlation — topic-level
  for (const t of ctx.topics) {
    if ((conceptsByTopic.get(t.id) ?? 0) === 0) continue // nothing to correlate
    if ((ctx.caseCountByTopic.get(t.id) ?? 0) > 0) continue
    const conceptIds = ctx.concepts.filter((c) => c.topicId === t.id).map((c) => c.id)
    const d = conceptIds.reduce((acc, id) => {
      const dd = ctx.demandByConcept.get(id)
      return dd ? acc + dd.attempts + dd.mistakes * 2 : acc
    }, 0)
    const severity: FacultySeverity = t.importance >= 4 ? 'warning' : 'info'
    const evidence = [
      `No clinical case (legacy cases or simulator cases) is linked to “${t.name}” — checked via case system tags and simulator conceptIds.`,
      `Topic importance ${t.importance}/5 on the curriculum record.`,
      `${num(conceptsByTopic.get(t.id) ?? 0)} concepts sit in this topic with no applied context.`,
    ]
    gap({
      kind: 'missing-case-correlation', severity, entityType: 'topic', entityId: t.id,
      label: `${t.name} — no case correlation`, subjectName: t.subjectName, topicName: t.name,
      examWeight: t.importance, demandLine: d > 0 ? `${num(d)} measured demand events on this account` : undefined, evidence,
      suggestion: 'Draft an anchored clinical case in the Studio (or link an existing simulator case via conceptIds) so the topic can be practised the way it is asked — applied.',
      priority: gapPriority(t.importance, Math.min(40, d), severity),
      handoff: { view: 'cases', label: 'Open Cases', focus: t.id },
    })
  }

  // 7) unlinked questions / 8) unlinked flashcards
  const [unlinkedQuestions, unlinkedFlashcards] = await Promise.all([
    db.question.findMany({ where: { conceptId: null }, select: { id: true, stem: true, subjectCode: true } }),
    db.flashcard.findMany({ where: { conceptId: null }, select: { id: true, front: true, subjectCode: true } }),
  ])
  for (const q of unlinkedQuestions) {
    gap({
      kind: 'unlinked-question', severity: 'info', entityType: 'question', entityId: q.id,
      label: trunc(q.stem, 80), subjectName: q.subjectCode,
      evidence: [
        'This question has no conceptId — it never feeds knowledge states, mistake intelligence or gap detection.',
        `Subject: ${q.subjectCode}.`,
      ],
      suggestion: 'Link the question to its concept so attempts measure mastery and the gap engine sees the demand it creates.',
      priority: gapPriority(2, 0, 'info'),
      handoff: { view: 'questions', label: 'Open Questions', focus: q.id },
    })
  }
  for (const f of unlinkedFlashcards) {
    gap({
      kind: 'unlinked-flashcard', severity: 'info', entityType: 'flashcard', entityId: f.id,
      label: trunc(f.front, 80), subjectName: f.subjectCode,
      evidence: [
        'This flashcard has no conceptId — reviews on it cannot touch any concept\'s knowledge state.',
        `Subject: ${f.subjectCode}.`,
      ],
      suggestion: 'Link the flashcard to its concept so spaced repetition and mastery signals stay connected.',
      priority: gapPriority(2, 0, 'info'),
      handoff: { view: 'revise', label: 'Open Revision', focus: f.id },
    })
  }

  items.sort((a, b) => b.priority - a.priority || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const counts: FacultyGapsPayload['counts'] = { all: items.length }
  for (const k of GAP_KINDS) counts[k] = items.filter((i) => i.kind === k).length

  return {
    payload: {
      generatedAt: new Date().toISOString(),
      counts,
      items: items.slice(0, ITEMS_CAP),
      prioritizedBy: PRIORITIZED_BY,
      dataBasis: GAPS_DATA_BASIS,
      note: `${num(counts.all)} gaps measured; the list shows the top ${Math.min(ITEMS_CAP, counts.all)} by priority. Fix demand-heavy, exam-weighted gaps first — library thinness alone is not a priority.`,
    },
    critical: items.filter((i) => i.severity === 'critical').length,
  }
}

export async function getGaps(): Promise<FacultyGapsPayload> {
  return (await computeGaps()).payload
}

// ── QUALITY ──────────────────────────────────────────────────────────────────

async function computeQuality(): Promise<{ payload: FacultyQualityPayload; critical: number }> {
  const [questions, reports, resReports, openReviewRows, ctx] = await Promise.all([
    db.question.findMany({
      select: { id: true, stem: true, answer: true, explanation: true, options: true, optionNotes: true, subjectCode: true },
    }),
    db.questionReport.findMany({ select: { id: true, questionId: true, reason: true, detail: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    db.resourceReport.findMany({ where: { status: 'open' }, select: { id: true, resourceId: true, reason: true, details: true, createdAt: true } }),
    db.facultyReviewItem.findMany({ where: { status: { in: ['open', 'in-review'] } }, select: { id: true, kind: true, entityType: true, entityId: true } }),
    loadContentContext(),
  ])

  // open review map — flags + already-resolved signals
  const openFlags = new Map(openReviewRows.map((r) => [`${r.kind}:${r.entityType}:${r.entityId}`, r.id]))
  const [resolvedRows] = await Promise.all([
    db.facultyReviewItem.findMany({ where: { status: { in: ['resolved', 'dismissed'] } }, select: { kind: true, entityType: true, entityId: true } }),
  ])
  const settled = new Set(resolvedRows.map((r) => `${r.kind}:${r.entityType}:${r.entityId}`))

  const items: FacultyQualityItem[] = []
  const push = (f: Omit<FacultyQualityItem, 'flagged' | 'reviewItemId' | 'id'>) => {
    const key = `${f.kind}:${f.entityType}:${f.entityId}`
    const reviewItemId = openFlags.get(key)
    items.push({ id: key, ...f, flagged: Boolean(reviewItemId), reviewItemId })
  }

  // 1) answer-key distribution + skew (bank-wide)
  const dist = new Map<string, number>()
  for (const q of questions) dist.set(q.answer, (dist.get(q.answer) ?? 0) + 1)
  const answerKeyDist = [...dist.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([option, count]) => ({ option, count, sharePct: pct(count, questions.length) ?? 0 }))
  const topKey = [...dist.entries()].sort((a, b) => b[1] - a[1])[0]
  let answerKeySkew: FacultyQualityPayload['answerKeySkew'] = null
  if (topKey) {
    const share = pct(topKey[1], questions.length) ?? 0
    if (share >= 40) {
      const severity: FacultySeverity = share >= 60 ? 'critical' : 'warning'
      const line = `${share}% of ${num(questions.length)} answer keys sit on option ${topKey[0]} — students can game the key without knowing the content.`
      answerKeySkew = { skewPct: share, line }
      push({
        kind: 'answer-key-skew', severity, entityType: 'question', entityId: '__bank__',
        label: `Answer-key skew — option ${topKey[0]} at ${share}%`,
        evidence: [line, `Distribution: ${answerKeyDist.map((d) => `${d.option} ${d.count} (${d.sharePct}%)`).join(' · ')}.`],
        suggestion: 'Rebalance correct answers across options on new and edited questions; treat existing skew as a writing habit to fix, not a scoring bug.',
      })
    }
  }

  // 2) duplicate stems (exact normalized match — flag, never auto-merge)
  const byStem = new Map<string, string[]>()
  for (const q of questions) {
    const n = normStem(q.stem)
    if (n.length < 20) continue
    const list = byStem.get(n) ?? []
    list.push(q.id)
    byStem.set(n, list)
  }
  for (const group of byStem.values()) {
    if (group.length < 2) continue
    push({
      kind: 'duplicate-question', severity: 'warning', entityType: 'question', entityId: group[0],
      label: `Duplicate stems — ${group.length} questions share the same stem`,
      evidence: group.map((id) => `Question ${id}: ${trunc(questions.find((q) => q.id === id)?.stem ?? '', 100)}`),
      suggestion: 'Review the group — keep one canonical question, differentiate or retire the rest. The engine only flags; a human decides.',
    })
  }

  // 3) ambiguous options + 4) thin explanations + 5) missing option notes
  for (const q of questions) {
    const options = Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : []
    const texts = options.map((o) => (o.text ?? '').trim().toLowerCase())
    const hasAllNone = texts.some((t) => t === 'all of the above' || t === 'none of the above')
    const dupText = texts.some((t, i) => t.length > 0 && texts.indexOf(t) !== i)
    if (hasAllNone || dupText) {
      push({
        kind: 'ambiguous-mcq', severity: 'warning', entityType: 'question', entityId: q.id,
        label: `Ambiguous options — ${trunc(q.stem, 70)}`,
        evidence: [
          hasAllNone ? 'Uses “all/none of the above” — the option order can give the answer away.' : 'Two options carry identical text.',
          `Subject: ${q.subjectCode}.`,
        ],
        suggestion: 'Rewrite the options as parallel, mutually exclusive choices — exam-realistic stems never lean on meta-options.',
      })
    }
    if (q.explanation.trim().length < 80) {
      push({
        kind: 'poor-explanation', severity: 'warning', entityType: 'question', entityId: q.id,
        label: `Thin explanation — ${trunc(q.stem, 70)}`,
        evidence: [`Explanation is ${q.explanation.trim().length} characters (threshold: 80).`, `Subject: ${q.subjectCode}.`],
        suggestion: 'Extend the explanation: why the answer wins and what makes near-miss options tempting. Post-review, option notes carry the per-distractor teaching.',
      })
    }
    if (!q.optionNotes && options.length >= 4) {
      push({
        kind: 'missing-option-notes', severity: 'info', entityType: 'question', entityId: q.id,
        label: `No option notes — ${trunc(q.stem, 70)}`,
        evidence: ['No curated per-option notes exist — wrong picks get no targeted correction.', `Subject: ${q.subjectCode}.`],
        suggestion: 'Add per-option notes (why each distractor loses) — the highest-leverage enrichment for practice feedback.',
      })
    }
  }

  // 6) missing citation on rich lessons
  for (const c of ctx.concepts) {
    if (c.hasLesson && !c.hasEvidence) {
      push({
        kind: 'missing-citation', severity: 'info', entityType: 'concept', entityId: c.id,
        label: `Lesson without evidence level — ${c.name}`,
        evidence: ['A structured lesson exists but evidenceLevel is unset — the trust label a student sees is blank.'],
        suggestion: 'Set evidenceLevel (established / widely-taught / emerging / varies-by-guideline) and a lastReviewed date so the lesson carries its provenance.',
      })
    }
  }

  // 7) resources — open reports + catalog verification pending
  const catalog = EXTERNAL_CATALOG as ReadonlyArray<{ id: string; title: string; lastVerified: string | null }>
  for (const r of resReports) {
    const kind: FacultyQualityKind = r.reason === 'outdated' ? 'outdated-resource' : r.reason === 'copyright' ? 'missing-citation' : 'open-report'
    const res = catalog.find((x) => x.id === r.resourceId)
    push({
      kind, severity: 'warning', entityType: 'resource', entityId: r.resourceId,
      label: `${kind === 'outdated-resource' ? 'Outdated' : kind === 'missing-citation' ? 'Copyright concern' : 'Open report'} — ${res?.title ?? r.resourceId}`,
      evidence: [`Student report (${r.reason}): ${trunc(r.details || '(no detail)', 140)}`, `Reported ${r.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`],
      suggestion: 'Verify the resource: re-check the link, license line and lastVerified date. Attribution must stay intact — a missing attribution is itself a finding.',
    })
  }
  for (const row of catalog) {
    if (row.lastVerified) continue
    push({
      kind: 'outdated-resource', severity: 'info', entityType: 'resource', entityId: row.id,
      label: `Verification pending — ${row.title}`,
      evidence: ['The catalog marks this resource lastVerified: null — its link and license were never machine-verified.'],
      suggestion: 'Verify the source (link reachable, license line intact) and stamp lastVerified, or retire the entry.',
    })
  }

  // 8) open question reports
  const qById = new Map(questions.map((q) => [q.id, q]))
  for (const r of reports) {
    const q = qById.get(r.questionId)
    push({
      kind: 'open-report', severity: 'warning', entityType: 'question', entityId: r.questionId,
      label: `Open student report — ${trunc(q?.stem ?? r.questionId, 70)}`,
      evidence: [`Reason: ${r.reason}. ${r.detail ? `Detail: ${trunc(r.detail, 140)}` : '(no detail)'}`, `Reported ${r.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`],
      suggestion: 'A student flagged this question — re-verify the key, options and explanation, then resolve the report with a decision note.',
    })
  }

  // 9) fail-after-read — measured on THIS account, labelled as such
  const reads = await db.learnProgress.findMany({
    where: { kind: 'concept', status: { in: ['completed', 'mastered'] } },
    select: { entityId: true, updatedAt: true },
  })
  if (reads.length > 0) {
    const wrongAfter = await db.questionAttempt.findMany({
      where: { profileId: (await db.studentProfile.findFirst({ select: { id: true } }))?.id ?? '', correct: false },
      select: { question: { select: { conceptId: true } }, createdAt: true },
    })
    for (const r of reads) {
      const wrongs = wrongAfter.filter((w) => w.question.conceptId === r.entityId && w.createdAt > r.updatedAt)
      if (wrongs.length >= 2) {
        const c = ctx.concepts.find((x) => x.id === r.entityId)
        push({
          kind: 'fail-after-read', severity: 'warning', entityType: 'concept', entityId: r.entityId,
          label: `Fail after read — ${c?.name ?? r.entityId}`,
          evidence: [
            `This account completed the lesson, then answered ${num(wrongs.length)} questions on the concept incorrectly (measured on this account only).`,
            `Latest wrong attempt: ${wrongs[0].createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
          ],
          suggestion: 'The lesson explains but does not transfer — review it for a simpler explanation, a worked example or a figure, then publish the improvement as a new version.',
        })
      }
    }
  }

  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.kind.localeCompare(b.kind))
  const counts: FacultyQualityPayload['counts'] = { all: items.length, open: items.filter((i) => !settled.has(`${i.kind}:${i.entityType}:${i.entityId}`)).length }
  for (const k of QUALITY_KINDS) counts[k] = items.filter((i) => i.kind === k).length

  return {
    payload: {
      generatedAt: new Date().toISOString(),
      answerKeyDist,
      answerKeySkew,
      counts,
      items: items.slice(0, ITEMS_CAP),
      openReports: { questions: reports.length, resources: resReports.length },
      flaggedForHumanReview: openFlags.size,
      disclaimer: QUALITY_DISCLAIMER,
      note: `${num(counts.all)} findings measured (list capped at ${ITEMS_CAP}, most severe first); ${counts.open} remain open — ${settled.size} ${settled.size === 1 ? 'is' : 'are'} already resolved or dismissed by a reviewer. Flagging sends a finding to the human queue; the engine never declares content correct on its own.`,
    },
    critical: items.filter((i) => i.severity === 'critical').length,
  }
}

export async function getQuality(): Promise<FacultyQualityPayload> {
  return (await computeQuality()).payload
}

// ── DRAFTS ───────────────────────────────────────────────────────────────────

type DraftRow = {
  id: string; kind: string; entityType: string; entityId: string; entityLabel: string
  title: string; status: string; aiAssisted: boolean; grounded: boolean
  changeNote: string; reviewerNote: string; reviewedBy: string
  publishedVersion: number; createdAt: Date; updatedAt: Date; body: unknown
}

export function toDraftView(row: DraftRow): FacultyDraftView {
  return {
    id: row.id,
    kind: row.kind as FacultyDraftKind,
    entityType: row.entityType as FacultyEntityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    title: row.title,
    status: row.status as FacultyDraftStatus,
    aiAssisted: row.aiAssisted,
    grounded: row.grounded,
    changeNote: row.changeNote,
    reviewerNote: row.reviewerNote,
    reviewedBy: row.reviewedBy,
    publishedVersion: row.publishedVersion > 0 ? row.publishedVersion : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    body: (row.body ?? {}) as FacultyDraftBody,
  }
}

export async function listDrafts(): Promise<FacultyDraftsPayload> {
  const rows = await db.facultyDraft.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 })
  const views = rows.map(toDraftView)
  const counts: FacultyDraftsPayload['counts'] = { all: views.length }
  for (const s of ['draft', 'in-review', 'published', 'rejected'] as const) counts[s] = views.filter((d) => d.status === s).length
  return {
    generatedAt: new Date().toISOString(),
    counts,
    drafts: views,
    note: 'Drafts are the workspace\'s working copies — AI-assisted ones carry the badge and none is authoritative until a reviewer publishes it as a version.',
  }
}

export async function resolveEntityLabel(entityType: string, entityId: string): Promise<string> {
  if (entityId === '__bank__') return 'Question bank (whole bank)'
  try {
    if (entityType === 'concept') {
      const c = await db.concept.findUnique({ where: { id: entityId }, select: { name: true } })
      if (c) return c.name
    } else if (entityType === 'question') {
      const q = await db.question.findUnique({ where: { id: entityId }, select: { stem: true } })
      if (q) return trunc(q.stem, 80)
    } else if (entityType === 'topic') {
      const t = await db.topic.findUnique({ where: { id: entityId }, select: { name: true } })
      if (t) return t.name
    } else if (entityType === 'flashcard') {
      const f = await db.flashcard.findUnique({ where: { id: entityId }, select: { front: true } })
      if (f) return trunc(f.front, 80)
    } else if (entityType === 'resource') {
      const row = EXTERNAL_CATALOG.find((x) => x.id === entityId)
      if (row) return row.title
    }
  } catch { /* fall through to the raw id */ }
  return entityId
}

export interface CreateDraftInput {
  profileId: string
  entityType: FacultyEntityType
  entityId: string
  kind: FacultyDraftKind
  title: string
  body: FacultyDraftBody
  changeNote?: string
  aiAssisted?: boolean
  grounded?: boolean
}

export async function createDraft(input: CreateDraftInput): Promise<FacultyDraftView> {
  // the entity must exist — no drafts anchored to nothing
  const label = await resolveEntityLabel(input.entityType, input.entityId)
  const exists = label !== input.entityId
  if (!exists && ['concept', 'question', 'topic'].includes(input.entityType)) {
    throw new FacultyHttpError(404, `${input.entityType} “${input.entityId}” was not found — drafts must anchor to real content.`)
  }
  const row = await db.facultyDraft.create({
    data: {
      profileId: input.profileId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: label === input.entityId ? input.title : label,
      title: input.title,
      body: input.body as unknown as object,
      status: 'draft',
      aiAssisted: input.aiAssisted ?? false,
      grounded: input.grounded ?? false,
      changeNote: input.changeNote ?? '',
    },
  })
  await audit('draft-created', input.entityType, input.entityId, {
    draftId: row.id, title: row.title, kind: row.kind, aiAssisted: row.aiAssisted,
  })
  return toDraftView(row)
}

export interface PatchDraftInput {
  action: 'submit' | 'publish' | 'reject'
  changeNote?: string
  reviewerNote?: string
  applyLesson?: boolean
}

export async function patchDraft(id: string, input: PatchDraftInput): Promise<{ draft: FacultyDraftView; version: FacultyVersionView | null; note: string }> {
  const row = await db.facultyDraft.findUnique({ where: { id } })
  if (!row) throw new FacultyHttpError(404, 'Draft not found.')

  if (input.action === 'submit') {
    if (row.status !== 'draft') {
      throw new FacultyHttpError(409, `Only drafts can be sent for review — this one is ${row.status}.`)
    }
    const note = (input.changeNote ?? '').trim()
    if (!note) throw new FacultyHttpError(400, 'A change note is required to send a draft for review.')
    const updated = await db.facultyDraft.update({
      where: { id }, data: { status: 'in-review', changeNote: note.slice(0, 280) },
    })
    await audit('draft-submitted', row.entityType, row.entityId, { draftId: id, title: row.title, note: note.slice(0, 280) })
    return { draft: toDraftView(updated), version: null, note: 'Sent for review — a human reviewer decides the next step.' }
  }

  if (input.action === 'publish') {
    if (row.status !== 'in-review') {
      throw new FacultyHttpError(409, `Only drafts in review can be published — this one is ${row.status}. The reviewer gate exists so AI output is never self-published.`)
    }
    const reviewerNote = (input.reviewerNote ?? '').trim()
    if (!reviewerNote) throw new FacultyHttpError(400, 'A reviewer note is required to publish — the note is the audit trail.')

    const result = await db.$transaction(async (tx) => {
      const last = await tx.facultyContentVersion.findFirst({
        where: { entityType: row.entityType, entityId: row.entityId },
        orderBy: { version: 'desc' }, select: { version: true },
      })
      const versionNo = (last?.version ?? 0) + 1
      const body = (row.body ?? {}) as FacultyDraftBody
      const references = Array.isArray(body.references) ? body.references.filter((r) => typeof r === 'string').slice(0, 12) : []
      const verRow = await tx.facultyContentVersion.create({
        data: {
          entityType: row.entityType,
          entityId: row.entityId,
          entityLabel: row.entityLabel,
          version: versionNo,
          // verified requires references — publishing without them stays unverified
          verificationStatus: references.length > 0 ? 'verified' : 'unverified',
          reviewer: FACULTY_ACTOR,
          summary: reviewerNote.slice(0, 400),
          references,
          body: body as unknown as object,
          lastReviewedAt: new Date(),
        },
      })
      const updated = await tx.facultyDraft.update({
        where: { id },
        data: { status: 'published', reviewerNote: reviewerNote.slice(0, 280), reviewedBy: FACULTY_ACTOR, publishedVersion: versionNo },
      })
      return { verRow, updated }
    })

    let note = `Published as v${result.verRow.version}${result.verRow.verificationStatus === 'verified' ? ' — verified (references recorded)' : ' — unverified (no references recorded yet)'}. Learning history was not touched.`
    let versionView = toVersionView(result.verRow)

    // explicit reviewer opt-in: merge the draft body additively into the lesson
    if (input.applyLesson === true && row.entityType === 'concept') {
      const applied = await applyLessonRevision(row.entityId, result.verRow.version, reviewerNote)
      note = applied
        ? `${note} Lesson body updated additively (facultyRevision block + lastReviewed).`
        : `${note} Lesson application skipped — the concept has no existing structured lesson to extend.`
    }

    await audit('draft-published', row.entityType, row.entityId, { draftId: id, title: row.title, reviewerNote: reviewerNote.slice(0, 280) })
    await audit('version-created', row.entityType, row.entityId, {
      version: result.verRow.version, verificationStatus: result.verRow.verificationStatus, draftId: id,
    })
    return { draft: toDraftView(result.updated), version: versionView, note }
  }

  // reject
  const reviewerNote = (input.reviewerNote ?? '').trim()
  if (!reviewerNote) throw new FacultyHttpError(400, 'A reviewer note is required to reject a draft — nothing is silently dropped.')
  if (row.status !== 'in-review' && row.status !== 'draft') {
    throw new FacultyHttpError(409, `Only drafts or in-review items can be rejected — this one is ${row.status}.`)
  }
  const updated = await db.facultyDraft.update({
    where: { id },
    data: { status: 'rejected', reviewerNote: reviewerNote.slice(0, 280), reviewedBy: FACULTY_ACTOR },
  })
  await audit('draft-rejected', row.entityType, row.entityId, { draftId: id, title: row.title, reviewerNote: reviewerNote.slice(0, 280) })
  return { draft: toDraftView(updated), version: null, note: 'Rejected with a recorded note — the draft stays out of the published library.' }
}

/** Explicit reviewer action: ADD a facultyRevision block to the concept's
 *  lesson JSON and refresh lastReviewed. Never removes or rewrites existing
 *  lesson content, and never touches KnowledgeState/attempt history. */
async function applyLessonRevision(conceptId: string, version: number, reviewerNote: string): Promise<boolean> {
  const concept = await db.concept.findUnique({ where: { id: conceptId }, select: { lesson: true } })
  if (!concept) return false
  const lesson = (concept.lesson ?? null) as Record<string, unknown> | null
  if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) return false
  const next = {
    ...lesson,
    facultyRevision: {
      version,
      reviewer: FACULTY_ACTOR,
      note: reviewerNote.slice(0, 400),
      appliedAt: new Date().toISOString(),
    },
    lastReviewed: new Date().toISOString().slice(0, 10),
  }
  await db.concept.update({ where: { id: conceptId }, data: { lesson: next as unknown as object } })
  return true
}

// ── REVIEW QUEUE ─────────────────────────────────────────────────────────────

export async function getReviewQueue(): Promise<FacultyReviewQueuePayload> {
  const [rows, draftsInReview] = await Promise.all([
    db.facultyReviewItem.findMany({
      where: { status: { in: ['open', 'in-review'] } },
      orderBy: [{ severity: 'asc' }, { updatedAt: 'desc' }],
      take: 100,
    }),
    db.facultyDraft.findMany({ where: { status: 'in-review' }, orderBy: { updatedAt: 'desc' }, take: 50 }),
  ])
  const open = await Promise.all(rows.map(async (r) => ({
    id: r.id,
    kind: r.kind,
    severity: r.severity as FacultySeverity,
    entityType: r.entityType as FacultyEntityType,
    entityId: r.entityId,
    label: await resolveEntityLabel(r.entityType, r.entityId),
    evidence: Array.isArray(r.evidence) ? (r.evidence as string[]) : [],
    suggestion: r.suggestion,
    status: r.status as 'open' | 'in-review',
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })))
  open.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  return {
    generatedAt: new Date().toISOString(),
    open,
    draftsInReview: draftsInReview.map(toDraftView),
    note: 'Everything here waits on a human: resolve or dismiss with a note, and every action lands in the audit trail attributed to its reviewer.',
  }
}

export interface ReviewActionInput {
  action: 'flag' | 'resolve' | 'dismiss'
  itemId?: string
  kind?: string
  entityType?: FacultyEntityType
  entityId?: string
  severity?: FacultySeverity
  evidence?: string[]
  suggestion?: string
  reviewerNote?: string
}

export async function reviewAction(input: ReviewActionInput): Promise<{ ok: true; item?: FacultyReviewItemView; note: string }> {
  if (input.action === 'flag') {
    if (!input.kind || !input.entityType || !input.entityId) {
      throw new FacultyHttpError(400, 'Flagging requires kind, entityType and entityId.')
    }
    if (![...GAP_KINDS, ...QUALITY_KINDS].includes(input.kind as FacultyGapKind | FacultyQualityKind)) {
      throw new FacultyHttpError(400, `kind must be a published gap or quality kind — got “${input.kind}”.`)
    }
    const severity: FacultySeverity = input.severity ?? 'warning'
    const evidence = (input.evidence ?? []).filter((e) => typeof e === 'string').slice(0, 8).map((e) => e.slice(0, 300))
    const suggestion = (input.suggestion ?? '').slice(0, 400)
    // idempotent upsert: one OPEN row per (entityType, entityId, kind) — re-flags
    // refresh evidence instead of spamming duplicates
    const existing = await db.facultyReviewItem.findFirst({
      where: { entityType: input.entityType, entityId: input.entityId, kind: input.kind, status: { in: ['open', 'in-review'] } },
    })
    const row = existing
      ? await db.facultyReviewItem.update({
          where: { id: existing.id },
          data: { severity, evidence, suggestion, status: 'open' },
        })
      : await db.facultyReviewItem.create({
          data: {
            entityType: input.entityType,
            entityId: input.entityId,
            kind: input.kind,
            severity,
            status: 'open',
            evidence,
            suggestion,
          },
        })
    await audit('item-flagged', input.entityType, input.entityId, {
      itemId: row.id, kind: row.kind, severity, refreshed: Boolean(existing),
    })
    return {
      ok: true,
      item: {
        id: row.id, kind: row.kind, severity: row.severity as FacultySeverity,
        entityType: row.entityType as FacultyEntityType, entityId: row.entityId,
        label: await resolveEntityLabel(row.entityType, row.entityId),
        evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
        suggestion: row.suggestion, status: row.status as 'open',
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      },
      note: existing ? 'Existing open item refreshed with the latest evidence — nothing was duplicated.' : 'Flagged for human review — it now waits in the queue.',
    }
  }

  // resolve | dismiss — reviewer note required, nothing silently dropped
  if (!input.itemId) throw new FacultyHttpError(400, `${input.action} requires itemId.`)
  const note = (input.reviewerNote ?? '').trim()
  if (!note) throw new FacultyHttpError(400, 'A reviewer note is required — nothing is resolved or dismissed silently.')
  const row = await db.facultyReviewItem.findUnique({ where: { id: input.itemId } })
  if (!row) throw new FacultyHttpError(404, 'Review item not found.')
  if (row.status === 'resolved' || row.status === 'dismissed') {
    throw new FacultyHttpError(409, `This item is already ${row.status}.`)
  }
  const status = input.action === 'resolve' ? 'resolved' : 'dismissed'
  const updated = await db.facultyReviewItem.update({
    where: { id: row.id },
    data: { status, reviewerNote: note.slice(0, 280), resolvedBy: FACULTY_ACTOR },
  })
  await audit(input.action === 'resolve' ? 'item-resolved' : 'item-dismissed', row.entityType, row.entityId, {
    itemId: row.id, kind: row.kind, note: note.slice(0, 280),
  })
  return {
    ok: true,
    item: {
      id: updated.id, kind: updated.kind, severity: updated.severity as FacultySeverity,
      entityType: updated.entityType as FacultyEntityType, entityId: updated.entityId,
      label: await resolveEntityLabel(updated.entityType, updated.entityId),
      evidence: Array.isArray(updated.evidence) ? (updated.evidence as string[]) : [],
      suggestion: updated.suggestion, status: status,
      createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(),
    },
    note: input.action === 'resolve' ? 'Resolved — recorded with your note and attributed.' : 'Dismissed — recorded with your note so the decision is auditable.',
  }
}

// ── VERSIONS ─────────────────────────────────────────────────────────────────

export function toVersionView(row: {
  id: string; entityType: string; entityId: string; entityLabel: string; version: number
  verificationStatus: string; reviewer: string; summary: string; references: unknown
  lastReviewedAt: Date | null; createdAt: Date
}): FacultyVersionView {
  return {
    id: row.id,
    entityType: row.entityType as FacultyEntityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    version: row.version,
    verificationStatus: row.verificationStatus as FacultyVersionView['verificationStatus'],
    reviewer: row.reviewer,
    summary: row.summary,
    references: Array.isArray(row.references) ? (row.references as string[]) : [],
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listVersions(params: { entityType?: string; entityId?: string }): Promise<FacultyVersionsPayload> {
  const where: { entityType?: string; entityId?: string } = {}
  if (params.entityType) where.entityType = params.entityType
  if (params.entityId) where.entityId = params.entityId
  const rows = await db.facultyContentVersion.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
  const verified = rows.filter((r) => r.verificationStatus === 'verified').length
  return {
    generatedAt: new Date().toISOString(),
    versions: rows.map(toVersionView),
    note: 'The library of record: one row per published revision with its reviewer, references and verification status. Corrections move forward — the learning history attached to earlier versions is never rewritten.',
  }
}

// ── PERSONALIZED RECOMMENDATIONS ─────────────────────────────────────────────

export async function getRecommend(): Promise<FacultyRecommendPayload> {
  const profile = await db.studentProfile.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  const ctx = await loadContentContext()
  const topicById = new Map(ctx.topics.map((t) => [t.id, t]))
  const subjectById = new Map(ctx.subjects.map((s) => [s.id, s]))

  const states = profile
    ? await db.knowledgeState.findMany({ where: { profileId: profile.id } })
    : []

  const candidates = states
    .filter((k) => k.score < 70 || k.status === 'weak' || k.status === 'unstable')
    .sort((a, b) => b.priority - a.priority || a.score - b.score)
    .slice(0, 6)

  const items: FacultyRecommendItem[] = []
  for (const k of candidates) {
    const c = ctx.concepts.find((x) => x.id === k.conceptId)
    if (!c) continue
    const topic = topicById.get(c.topicId)
    const subject = topic ? subjectById.get(topic.subjectId) : undefined
    const d = ctx.demandByConcept.get(c.id) ?? { attempts: 0, correct: 0, wrong: 0, mistakes: 0, revisionItems: 0, learnWeight: 0, ksAttempts: 0 }
    const acc = d.attempts > 0 ? pct(d.correct, d.attempts) : null
    const qCount = ctx.questionCountByConcept.get(c.id) ?? 0
    const fCount = ctx.flashcardCountByConcept.get(c.id) ?? 0
    const caseCount = topic ? (ctx.caseCountByTopic.get(topic.id) ?? 0) : 0

    const weaknessParts = [`${acc ?? 0}% over ${num(d.attempts)} attempts`]
    if (d.mistakes > 0) weaknessParts.push(`${num(d.mistakes)} mistakes`)
    weaknessParts.push(`${Math.round(k.score)}% mastery (${k.status})`, `recall est. ${Math.round(k.estRecall * 100)}%`)

    const recommended: FacultyRecommendResource[] = []
    if (c.hasLesson) {
      recommended.push({
        kind: 'lesson', label: `Re-read the structured lesson`,
        why: 'Measured recall is low — a targeted re-read is the cheapest fix before more practice.',
        handoff: { view: 'learn', label: 'Open lesson', focus: c.id },
      })
    } else {
      recommended.push({
        kind: 'understand', label: 'No lesson exists yet — the Studio should draft one',
        why: 'Students cannot re-read what was never written; this is a content gap, not a study gap.',
        handoff: { view: 'faculty', label: 'Open Studio' },
      })
    }
    if (qCount > 0) {
      recommended.push({
        kind: 'questions', count: qCount, label: `${num(qCount)} practice question${qCount === 1 ? '' : 's'} linked`,
        why: 'Practice against the exact measured weakness — accuracy here is the proof of transfer.',
        handoff: { view: 'questions', label: 'Practise', focus: c.id },
      })
    } else {
      recommended.push({
        kind: 'questions', label: 'No practice pool — draft MCQs in the Studio',
        why: 'Weakness without questions cannot be retested; the practice gap is the bottleneck.',
        handoff: { view: 'faculty', label: 'Open Studio' },
      })
    }
    if (fCount > 0) {
      recommended.push({
        kind: 'flashcards', count: fCount, label: `${num(fCount)} flashcard${fCount === 1 ? '' : 's'} for spaced repetition`,
        why: 'Scheduling exists for this concept — let revision carry the retention load.',
        handoff: { view: 'revise', label: 'Revise', focus: c.id },
      })
    }
    if (caseCount > 0) {
      recommended.push({
        kind: 'case', label: 'Apply it in a clinical case',
        why: 'A linked case exercises the concept the way the exam asks it — applied, not recalled.',
        handoff: { view: 'cases', label: 'Open Cases' },
      })
    }

    items.push({
      conceptId: c.id,
      conceptName: c.name,
      topicName: topic?.name ?? c.topicId,
      subjectName: subject?.name ?? topic?.subjectName ?? '',
      examWeight: c.examWeight ?? topic?.importance ?? 3,
      weaknessLine: weaknessParts.join(' · '),
      recommended,
      note: 'Ranked by exam weight × measured weakness on this account — the same priority rule the gap engine publishes.',
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    items,
    dataBasis: 'This account\'s knowledge states (mastery score, status, estimated recall), attempts, mistakes and open revision items — measured, labelled, never peer-derived.',
    note: items.length === 0
      ? 'No weak concepts measured yet — recommendations appear as soon as this account attempts questions against the library.'
      : 'Each row is where faculty effort (a clearer lesson, better practice, targeted flashcards) pays off first for this learner.',
  }
}

// ── HOME ─────────────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  'Every number in this workspace is measured from the real content tables and this account\'s learning activity — nothing is estimated, sampled or invented.',
  'AI assist only drafts: grounded in existing platform content, badged AI-ASSISTED, and never authoritative on its own.',
  'Publishing is a human decision — a reviewer note is required, and the action mints a content version attributed to its reviewer.',
  'Quality findings are flagged for human review; the engine never declares content correct or incorrect by itself.',
  'Versioning keeps learning history intact: corrections take the record forward, while past attempts stay attributable to the content they were made against.',
  'External resources keep their license and attribution lines — a missing attribution is itself a finding, not a silent omission.',
]

export async function getHome(): Promise<FacultyHomePayload> {
  const [inv, gapsC, qualityC, drafts, rec] = await Promise.all([
    getInventory(), computeGaps(), computeQuality(), listDrafts(), getRecommend(),
  ])
  const gaps = gapsC.payload
  const quality = qualityC.payload
  const versions = await listVersions({})
  const recentVersions = versions.versions.slice(0, 4)

  const pipeline: FacultyHomePayload['pipeline'] = [
    {
      stage: 'collected',
      headline: 'Everything the platform teaches, counted live',
      detail: `${num(inv.totals.concepts)} concepts across ${num(inv.totals.subjects)} subjects, with questions, flashcards, cases and images inventoried on every load.`,
    },
    {
      stage: 'organized',
      headline: 'How the shelf is arranged — and where links are missing',
      detail: `${num(inv.totals.lessons)} structured lessons, ${num(inv.totals.flashcards)} flashcards and ${num(inv.totals.edges)} verified concept edges; ${num(inv.organization.questionsWithoutConcept)} questions still have no concept link.`,
    },
    {
      stage: 'understood',
      headline: 'Where the library falls short of student demand',
      detail: `${num(gaps.counts.all)} measured gaps, ranked by exam weight × learner demand — not by raw library thinness.`,
    },
    {
      stage: 'validated',
      headline: 'What a human reviewer still needs to decide',
      detail: `${num(quality.counts.all)} QC findings flagged for review; ${num(quality.flaggedForHumanReview)} currently wait in the human queue.`,
    },
    {
      stage: 'personalized',
      headline: 'Where faculty effort pays off first',
      detail: `${num(rec.items.length)} recommended focus items from this account\'s measured weaknesses, each with the resources to close it.`,
    },
  ]

  const draftCounts: Partial<Record<FacultyDraftStatus, number>> = {}
  for (const s of ['draft', 'in-review', 'published', 'rejected'] as const) draftCounts[s] = drafts.counts[s] ?? 0

  return {
    generatedAt: new Date().toISOString(),
    pipeline,
    inventory: inv.totals,
    gaps: {
      all: gaps.counts.all,
      critical: gapsC.critical,
      top: gaps.items.slice(0, 3),
    },
    quality: {
      all: quality.counts.all,
      open: quality.counts.open,
      critical: qualityC.critical,
      top: quality.items.slice(0, 3),
    },
    drafts: { counts: draftCounts, recent: drafts.drafts.slice(0, 4) },
    versions: { verified: versions.versions.filter((v) => v.verificationStatus === 'verified').length, recent: recentVersions },
    recommendations: rec.items.slice(0, 2),
    howItWorks: HOW_IT_WORKS,
    dataBasis: 'Live counts from the content tables (Subject, Topic, Concept, Question, Flashcard, ClinicalCase, SimCase, LabImage, LearningModule, ConceptEdge) plus this account\'s measured attempts, mistakes, knowledge states and lesson marks.',
    workspaceNote: 'Single faculty workspace on the demo profile — drafts, review decisions and versions are recorded in the audit trail as Faculty (demo).',
    honestNote: 'The engine measures coverage, linkage, key balance, explanation depth, reports and this account\'s fail-after-read pattern. Clinical correctness of individual facts still requires a human expert — no automated check can certify medical accuracy.',
  }
}

// ── AUDIT ────────────────────────────────────────────────────────────────────

export async function audit(action: string, entityType: string, entityId: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await db.facultyAuditLog.create({ data: { actor: FACULTY_ACTOR, action, entityType, entityId, detail: detail as unknown as object } })
  } catch {
    // the audit trail must never break the user-facing action
  }
}
