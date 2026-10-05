import { db } from '@/lib/db'
import { DAY, estimatedRecall } from '@/lib/engine'
import { GRAPH_GROUP_META } from '@/lib/types'
import type {
  GraphExplorePayload,
  GraphGroup,
  GraphGroupKind,
  GraphHome,
  GraphHub,
  GraphNeighbor,
  GraphPath,
  GraphPathStep,
  GraphSearchResult,
} from '@/lib/types'

// ─── MEDICAL KNOWLEDGE GRAPH ENGINE (PRODUCT 08) ─────────────────────────────
// Deterministic, measured, honest. One-pass context load, then pure builders.
//
// Every number in every payload is MEASURED from real rows (KnowledgeState,
// MistakeRecord, ConfusionPair, Question, Flashcard, ClinicalCase,
// ConceptEdge) — never invented. Legacy edge-direction noise is resolved HERE
// in the engine: the UI only ever sees the normalised GraphGroupKind. No
// chain-of-thought anywhere — conclusions and measured facts only.
//
// Honesty rules:
//  - edges flagged verified=false are hidden from ALL outputs until reviewed
//  - no state row → mastery 0, status 'new' (never a guess)
//  - empty results are empty (never padded), thin data → insufficientData
//  - confusion-pair links that have no edge are labelled 'confusion_pair',
//    never dressed up as a curated relationship

// ─── CONTEXT TYPES ───────────────────────────────────────────────────────────

type KnowledgeStatus = 'new' | 'weak' | 'unstable' | 'strong'

export interface GraphConceptCtx {
  id: string
  name: string
  kind: string
  summary: string
  whyMatters: string
  mnemonic: string
  difficulty: number
  examRelevance: number
  clinicalRelevance: number
  topicId: string
  topicName: string
  topicSystem: string | null
  subjectId: string
  subjectCode: string
  subjectName: string
  subjectColor: string
  degree: number // verified edges touching this concept
  questionCount: number
  pyqCount: number
  flashcardCount: number
}

export interface GraphStateCtx {
  mastery: number // rounded 0..100 (0 when no state row exists)
  rawScore: number
  status: KnowledgeStatus
  estRecall: number // 0..1 recomputed from the forgetting curve
  attemptCount: number
  lastReviewed: string | null // ISO
  engaged: boolean // a KnowledgeState row exists for this profile
}

interface GraphEdgeCtx {
  id: string
  fromId: string
  toId: string
  type: string
  label: string
  source: string
}
export type { GraphEdgeCtx }

export interface GraphPairCtx {
  pairId: string
  aId: string
  bId: string
  mnemonic: string
}

interface GraphTopicCtx {
  id: string
  name: string
  system: string | null
  subjectId: string
  subjectName: string
  subjectCode: string
  conceptCount: number
}

interface GraphSubjectCtx {
  id: string
  code: string
  name: string
  color: string
  neetWeight: number
  conceptCount: number
  edgeCount: number
}

/** A neighbour of a hub concept after direction-noise normalisation. */
export interface GraphNeighborCtx {
  otherId: string
  group: GraphGroupKind
  edgeType: string
  edgeLabel: string
  edgeSource: string
  pairIds: string[] // ConfusionPair ids backing this link (may be empty)
}

export interface GraphContext {
  profileId: string
  concepts: Map<string, GraphConceptCtx>
  conceptOrder: string[] // stable iteration order (DB order)
  edges: GraphEdgeCtx[] // verified only
  crossSubjectEdges: number // verified edges whose endpoints sit in different subjects
  stateOf: (conceptId: string) => GraphStateCtx
  neighborsOf: (conceptId: string) => Map<GraphGroupKind, GraphNeighborCtx[]>
  openMistakeMaxWrong: Map<string, number> // conceptId → max wrongCount among open records
  hasOpenMistake: (conceptId: string) => boolean
  learnMarkOf: (conceptId: string) => string | null
  topicById: Map<string, GraphTopicCtx>
  subjects: GraphSubjectCtx[]
  pairsResolved: GraphPairCtx[] // ConfusionPairs with both sides resolving to concepts
  caseCountBySystem: Map<string, number>
  caseSpecialtyCount: Map<string, number> // lowercased specialty → count
  caseTotal: number
  questionTotal: number
  synonyms: { term: string; kind: string; refId: string; weight: number }[]
  insufficientData: boolean // zero KnowledgeStates for this profile
}

// ─── EDGE → GROUP NORMALISATION ──────────────────────────────────────────────
// The stored conventions are: prerequisite_of prereq→advanced, causes
// cause→effect, caused_by effect→cause, treated_by drug→disease, diagnosed_by
// disease→investigation, complication_of disease→complication, differential_of
// either side, mechanism_of mechanism→explained, manifestation_of sign→disease.
// Legacy rows may violate these — resolving that noise is the ENGINE's job.

function groupForEdge(type: string, hubIsFrom: boolean): GraphGroupKind | null {
  switch (type) {
    case 'prerequisite_of':
      return hubIsFrom ? 'unlocks' : 'prerequisite'
    case 'causes':
      return hubIsFrom ? 'causes' : 'caused_by'
    case 'caused_by':
      return hubIsFrom ? 'caused_by' : 'causes'
    case 'treated_by':
      return 'treatment'
    case 'diagnosed_by':
      return 'investigation'
    case 'complication_of':
      return 'complication'
    case 'differential_of':
      return 'confusable'
    case 'mechanism_of':
      return 'mechanism'
    case 'manifestation_of':
      return 'manifestation'
    case 'clinical_application_of':
      return 'application'
    case 'commonly_tested_with':
      return 'related'
    case 'related_to':
      return 'related'
    default:
      return null // unknown legacy type — honest skip, never mislabelled
  }
}

const GROUP_ORDER: GraphGroupKind[] = [
  'prerequisite', 'confusable', 'mechanism', 'caused_by', 'manifestation',
  'investigation', 'treatment', 'complication', 'causes', 'related', 'unlocks', 'application',
]

const MINIMAP_PRIORITY: GraphGroupKind[] = [
  'prerequisite', 'confusable', 'treatment', 'investigation', 'mechanism', 'related',
]

// ─── CONTEXT LOADER (one pass) ───────────────────────────────────────────────

const MASTERY_WEAK = 45
const MASTERY_STRONG = 70

export async function loadGraphContext(profileId: string): Promise<GraphContext> {
  const [
    conceptRows,
    edgeRows,
    stateRows,
    openMistakeRows,
    pairRows,
    questionRows,
    flashcardGroups,
    caseRows,
    learnRows,
    synonymRows,
    topicRows,
    subjectRows,
  ] = await Promise.all([
    db.concept.findMany({ include: { topic: { include: { subject: true } } } }),
    db.conceptEdge.findMany({ select: { id: true, fromId: true, toId: true, type: true, label: true, source: true, verified: true } }),
    db.knowledgeState.findMany({ where: { profileId } }),
    db.mistakeRecord.findMany({
      where: { profileId, status: { not: 'resolved' } },
      select: { conceptId: true, wrongCount: true },
    }),
    db.confusionPair.findMany({ select: { id: true, aCode: true, bCode: true, mnemonic: true } }),
    db.question.findMany({ select: { id: true, conceptId: true, tags: true } }),
    db.flashcard.groupBy({ by: ['conceptId'], _count: { _all: true }, where: { conceptId: { not: null } } }),
    db.clinicalCase.findMany({ select: { id: true, system: true, specialty: true } }),
    db.learnProgress.findMany({ where: { profileId, kind: 'concept' }, select: { entityId: true, status: true } }),
    db.graphSynonym.findMany({ orderBy: [{ weight: 'desc' }, { term: 'asc' }] }),
    db.topic.findMany({ select: { id: true, name: true, system: true, subjectId: true } }),
    db.subject.findMany(),
  ])

  const now = new Date()

  // ── knowledge states (recall/status math mirrors /api/concepts/[id]) ──
  const stateRowsByConcept = new Map(stateRows.map((s) => [s.conceptId, s]))
  const stateOf = (conceptId: string): GraphStateCtx => {
    const s = stateRowsByConcept.get(conceptId)
    if (!s) return { mastery: 0, rawScore: 0, status: 'new', estRecall: 0, attemptCount: 0, lastReviewed: null, engaged: false }
    const days = s.lastReviewed ? (now.getTime() - s.lastReviewed.getTime()) / DAY : 999
    const estRecall = estimatedRecall(days, s.stability)
    const status: KnowledgeStatus = s.score <= 0 ? 'new' : s.score < MASTERY_WEAK ? 'weak' : estRecall < 0.55 ? 'unstable' : 'strong'
    return {
      mastery: Math.round(s.score),
      rawScore: s.score,
      status,
      estRecall,
      attemptCount: s.attemptCount,
      lastReviewed: s.lastReviewed ? s.lastReviewed.toISOString() : null,
      engaged: true,
    }
  }

  // ── concepts (with measured per-concept question / PYQ / flashcard counts) ──
  const questionCountByConcept = new Map<string, number>()
  const pyqCountByConcept = new Map<string, number>()
  for (const q of questionRows) {
    if (!q.conceptId) continue
    questionCountByConcept.set(q.conceptId, (questionCountByConcept.get(q.conceptId) ?? 0) + 1)
    if (Array.isArray(q.tags) && (q.tags as unknown[]).includes('pyq-pattern')) {
      pyqCountByConcept.set(q.conceptId, (pyqCountByConcept.get(q.conceptId) ?? 0) + 1)
    }
  }
  const flashcardCountByConcept = new Map(
    flashcardGroups.map((g) => [g.conceptId as string, g._count._all]),
  )

  const concepts = new Map<string, GraphConceptCtx>()
  for (const c of conceptRows) {
    concepts.set(c.id, {
      id: c.id,
      name: c.name,
      kind: c.kind,
      summary: c.summary,
      whyMatters: c.whyMatters,
      mnemonic: c.mnemonic,
      difficulty: c.difficulty,
      examRelevance: c.examRelevance,
      clinicalRelevance: c.clinicalRelevance,
      topicId: c.topicId,
      topicName: c.topic.name,
      topicSystem: c.topic.system,
      subjectId: c.topic.subjectId,
      subjectCode: c.topic.subject.code,
      subjectName: c.topic.subject.name,
      subjectColor: c.topic.subject.color,
      degree: 0,
      questionCount: questionCountByConcept.get(c.id) ?? 0,
      pyqCount: pyqCountByConcept.get(c.id) ?? 0,
      flashcardCount: flashcardCountByConcept.get(c.id) ?? 0,
    })
  }

  // ── edges (verified only — flagged edges stay hidden until reviewed) ──
  const edges: GraphEdgeCtx[] = edgeRows
    .filter((e) => e.verified && e.fromId !== e.toId && concepts.has(e.fromId) && concepts.has(e.toId))
    .map((e) => ({ id: e.id, fromId: e.fromId, toId: e.toId, type: e.type, label: e.label, source: e.source }))
  const degreeByConcept = new Map<string, number>()
  let crossSubjectEdges = 0
  for (const e of edges) {
    degreeByConcept.set(e.fromId, (degreeByConcept.get(e.fromId) ?? 0) + 1)
    degreeByConcept.set(e.toId, (degreeByConcept.get(e.toId) ?? 0) + 1)
    if (concepts.get(e.fromId)!.subjectId !== concepts.get(e.toId)!.subjectId) crossSubjectEdges += 1
  }
  for (const c of concepts.values()) c.degree = degreeByConcept.get(c.id) ?? 0

  // ── open mistakes per concept ──
  const openMistakeMaxWrong = new Map<string, number>()
  for (const m of openMistakeRows) {
    if (!m.conceptId) continue
    openMistakeMaxWrong.set(m.conceptId, Math.max(openMistakeMaxWrong.get(m.conceptId) ?? 0, m.wrongCount))
  }

  // ── confusion pairs (both sides must resolve to two DIFFERENT concepts) ──
  // Several seeded rows map both sides to the same coarse concept (e.g. cf-11
  // "Prerenal AKI vs ATN" → c-aki/c-aki) because the platform models the pair
  // inside one concept. Those cannot express a graph edge — "X vs X" would be
  // medically meaningless — so they are skipped here. The rows stay untouched
  // for the Confusion Bank compare surface, which uses the full a/b text.
  const pairsResolved: GraphPairCtx[] = pairRows
    .filter((p) => p.aCode && p.bCode && p.aCode !== p.bCode && concepts.has(p.aCode) && concepts.has(p.bCode))
    .map((p) => ({ pairId: p.id, aId: p.aCode, bId: p.bCode, mnemonic: p.mnemonic }))

  // adjacency list (verified edges, both directions)
  const adjacency = new Map<string, GraphEdgeCtx[]>()
  for (const e of edges) {
    if (!adjacency.has(e.fromId)) adjacency.set(e.fromId, [])
    if (!adjacency.has(e.toId)) adjacency.set(e.toId, [])
    adjacency.get(e.fromId)!.push(e)
    adjacency.get(e.toId)!.push(e)
  }

  const neighborsOf = (conceptId: string): Map<GraphGroupKind, GraphNeighborCtx[]> => {
    const groups = new Map<GraphGroupKind, GraphNeighborCtx[]>()
    for (const e of adjacency.get(conceptId) ?? []) {
      const hubIsFrom = e.fromId === conceptId
      const group = groupForEdge(e.type, hubIsFrom)
      if (!group) continue
      const otherId = hubIsFrom ? e.toId : e.fromId
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push({
        otherId,
        group,
        edgeType: e.type,
        edgeLabel: e.label,
        edgeSource: e.source,
        pairIds: [],
      })
    }
    // ConfusionPairs add the OTHER side to 'confusable' (deduped by concept id —
    // when an edge already connects them the edge keeps its type and the pair
    // rides along via pairIds, which surface in hub personal.repeatedConfusion).
    for (const p of pairsResolved) {
      if (p.aId !== conceptId && p.bId !== conceptId) continue
      const otherId = p.aId === conceptId ? p.bId : p.aId
      if (!groups.has('confusable')) groups.set('confusable', [])
      const confusables = groups.get('confusable')!
      const existing = confusables.find((n) => n.otherId === otherId)
      if (existing) {
        existing.pairIds.push(p.pairId)
      } else {
        confusables.push({
          otherId,
          group: 'confusable',
          edgeType: 'confusion_pair',
          edgeLabel: p.mnemonic.slice(0, 160),
          edgeSource: 'curated',
          pairIds: [p.pairId],
        })
      }
    }
    // dedupe within each group by other id (keep first — stable DB order)
    for (const [kind, items] of groups) {
      const seen = new Set<string>()
      groups.set(
        kind,
        items.filter((n) => (seen.has(n.otherId) ? false : (seen.add(n.otherId), true))),
      )
    }
    return groups
  }

  // ── topics / subjects (measured from the concept graph) ──
  const subjectRowById = new Map(subjectRows.map((s) => [s.id, s]))
  const topicById = new Map<string, GraphTopicCtx>()
  for (const t of topicRows) {
    const subj = subjectRowById.get(t.subjectId)
    topicById.set(t.id, {
      id: t.id,
      name: t.name,
      system: t.system,
      subjectId: t.subjectId,
      subjectName: subj?.name ?? t.subjectId,
      subjectCode: subj?.code ?? t.subjectId,
      conceptCount: 0,
    })
  }
  for (const c of concepts.values()) {
    const t = topicById.get(c.topicId)
    if (t) t.conceptCount += 1
  }

  // edgeCount per subject: a verified edge touches a subject when either
  // endpoint belongs to it (counted once even when both ends are inside).
  const subjectEdgeCount = new Map<string, number>()
  for (const e of edges) {
    const sIds = new Set([concepts.get(e.fromId)!.subjectId, concepts.get(e.toId)!.subjectId])
    for (const sId of sIds) subjectEdgeCount.set(sId, (subjectEdgeCount.get(sId) ?? 0) + 1)
  }
  const subjectConceptCount = new Map<string, number>()
  for (const c of concepts.values()) {
    subjectConceptCount.set(c.subjectId, (subjectConceptCount.get(c.subjectId) ?? 0) + 1)
  }
  const subjects: GraphSubjectCtx[] = subjectRows
    .filter((s) => (subjectConceptCount.get(s.id) ?? 0) > 0)
    .map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      color: s.color,
      neetWeight: s.neetWeight,
      conceptCount: subjectConceptCount.get(s.id) ?? 0,
      edgeCount: subjectEdgeCount.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.edgeCount - a.edgeCount || b.conceptCount - a.conceptCount || a.name.localeCompare(b.name))

  const caseCountBySystem = new Map<string, number>()
  const caseSpecialtyCount = new Map<string, number>()
  for (const c of caseRows) {
    caseCountBySystem.set(c.system, (caseCountBySystem.get(c.system) ?? 0) + 1)
    const spec = c.specialty.trim().toLowerCase()
    if (spec) caseSpecialtyCount.set(spec, (caseSpecialtyCount.get(spec) ?? 0) + 1)
  }

  const learnMarks = new Map(learnRows.map((r) => [r.entityId, r.status]))

  return {
    profileId,
    concepts,
    conceptOrder: [...concepts.keys()],
    edges,
    crossSubjectEdges,
    stateOf,
    neighborsOf,
    openMistakeMaxWrong,
    hasOpenMistake: (conceptId: string) => openMistakeMaxWrong.has(conceptId),
    learnMarkOf: (conceptId: string) => learnMarks.get(conceptId) ?? null,
    topicById,
    subjects,
    pairsResolved,
    caseCountBySystem,
    caseSpecialtyCount,
    caseTotal: caseRows.length,
    questionTotal: questionRows.length,
    synonyms: synonymRows.map((s) => ({ term: s.term, kind: s.kind, refId: s.refId, weight: s.weight })),
    insufficientData: stateRows.length === 0,
  }
}

// ─── SHARED INTERNAL HELPERS ─────────────────────────────────────────────────

function neighborSortKey(ctx: GraphContext, otherId: string): [number, number, number, string] {
  const concept = ctx.concepts.get(otherId)
  const st = ctx.stateOf(otherId)
  const weakFirst = ctx.hasOpenMistake(otherId) || st.mastery < MASTERY_WEAK ? 0 : 1
  return [weakFirst, -(concept?.degree ?? 0), st.mastery, concept?.name ?? '']
}

function toNeighbor(ctx: GraphContext, n: GraphNeighborCtx): GraphNeighbor {
  const other = ctx.concepts.get(n.otherId)!
  const st = ctx.stateOf(n.otherId)
  return {
    id: other.id,
    name: other.name,
    kind: other.kind,
    summary: other.summary,
    subjectCode: other.subjectCode,
    subjectName: other.subjectName,
    subjectColor: other.subjectColor,
    edgeType: n.edgeType,
    edgeLabel: n.edgeLabel,
    edgeSource: n.edgeSource,
    mastery: st.mastery,
    status: st.status,
    questionCount: other.questionCount,
  }
}

const GROUP_ITEM_CAP = 6

function buildGroups(ctx: GraphContext, conceptId: string): GraphGroup[] {
  const raw = ctx.neighborsOf(conceptId)
  const groups: GraphGroup[] = []
  for (const kind of GROUP_ORDER) {
    const items = raw.get(kind)
    if (!items || items.length === 0) continue
    const sorted = [...items].sort((a, b) => {
      const ka = neighborSortKey(ctx, a.otherId)
      const kb = neighborSortKey(ctx, b.otherId)
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || ka[3].localeCompare(kb[3])
    })
    groups.push({
      kind,
      label: GRAPH_GROUP_META[kind].label,
      blurb: GRAPH_GROUP_META[kind].blurb,
      items: sorted.slice(0, GROUP_ITEM_CAP).map((n) => toNeighbor(ctx, n)),
      hidden: Math.max(0, sorted.length - GROUP_ITEM_CAP),
    })
  }
  return groups
}

function capText(s: string, max: number): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function dedupeKeepOrder(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const t = id.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

// ─── GRAPH HOME ──────────────────────────────────────────────────────────────

export function buildGraphHome(ctx: GraphContext, recentIds: string[]): GraphHome {
  const connected = [...ctx.concepts.values()].filter((c) => c.degree > 0).length

  const topHubs = [...ctx.concepts.values()]
    .filter((c) => c.degree >= 3)
    .sort((a, b) => b.degree - a.degree || b.examRelevance - a.examRelevance || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((c) => {
      const st = ctx.stateOf(c.id)
      return {
        id: c.id, name: c.name, kind: c.kind, degree: c.degree,
        subjectCode: c.subjectCode, subjectName: c.subjectName, subjectColor: c.subjectColor,
        mastery: st.mastery, status: st.status, questionCount: c.questionCount,
      }
    })

  // missing prerequisites: prerequisite_of edges where the ADVANCED side is
  // engaged (any KnowledgeState) but the PREREQ side is below 45% mastery.
  const missingPrerequisites = ctx.edges
    .filter((e) => e.type === 'prerequisite_of')
    .map((e) => ({
      e,
      from: ctx.concepts.get(e.fromId)!,
      to: ctx.concepts.get(e.toId)!,
      fromState: ctx.stateOf(e.fromId),
      toState: ctx.stateOf(e.toId),
    }))
    .filter((r) => r.toState.engaged && r.fromState.mastery < MASTERY_WEAK)
    .sort((a, b) => {
      // advanced-side engagement × prereq weakness (measured numbers both)
      const engA = 1 + a.toState.attemptCount
      const engB = 1 + b.toState.attemptCount
      const weakA = MASTERY_WEAK - a.fromState.mastery
      const weakB = MASTERY_WEAK - b.fromState.mastery
      return engB * weakB - engA * weakA || a.fromState.mastery - b.fromState.mastery || a.from.name.localeCompare(b.from.name)
    })
    .slice(0, 6)
    .map((r) => ({
      fromId: r.from.id,
      fromName: r.from.name,
      toId: r.to.id,
      toName: r.to.name,
      mastery: r.fromState.mastery,
      reason: `Before ${r.to.name} fully clicks, ${r.from.name} is at ${r.fromState.mastery}% — build it first`,
    }))

  // confusion hotspots: both sides weak, or a repeated open mistake (≥2 misses)
  const confusionHotspots: GraphHome['personal']['confusionHotspots'] = []
  for (const p of ctx.pairsResolved) {
    const aState = ctx.stateOf(p.aId)
    const bState = ctx.stateOf(p.bId)
    const wrongA = ctx.openMistakeMaxWrong.get(p.aId) ?? 0
    const wrongB = ctx.openMistakeMaxWrong.get(p.bId) ?? 0
    const bothWeak = aState.mastery < MASTERY_WEAK && bState.mastery < MASTERY_WEAK
    const repeated = wrongA >= 2 || wrongB >= 2
    if (!bothWeak && !repeated) continue
    confusionHotspots.push({
      pairId: p.pairId,
      aId: p.aId,
      aName: ctx.concepts.get(p.aId)!.name,
      bId: p.bId,
      bName: ctx.concepts.get(p.bId)!.name,
      mnemonic: p.mnemonic,
      bothWeak,
    })
  }
  confusionHotspots
    .sort((a, b) => {
      const repA = (ctx.openMistakeMaxWrong.get(a.aId) ?? 0) >= 2 || (ctx.openMistakeMaxWrong.get(a.bId) ?? 0) >= 2 ? 0 : 1
      const repB = (ctx.openMistakeMaxWrong.get(b.aId) ?? 0) >= 2 || (ctx.openMistakeMaxWrong.get(b.bId) ?? 0) >= 2 ? 0 : 1
      const sumA = ctx.stateOf(a.aId).mastery + ctx.stateOf(a.bId).mastery
      const sumB = ctx.stateOf(b.aId).mastery + ctx.stateOf(b.bId).mastery
      return repA - repB || sumA - sumB || a.pairId.localeCompare(b.pairId)
    })
    .splice(6)

  // isolated weak: degree 0 AND engaged AND below 45 — honest: often empty
  const isolatedWeak = [...ctx.concepts.values()]
    .filter((c) => c.degree === 0 && ctx.stateOf(c.id).engaged && ctx.stateOf(c.id).mastery < MASTERY_WEAK)
    .sort((a, b) => ctx.stateOf(a.id).mastery - ctx.stateOf(b.id).mastery || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((c) => ({
      id: c.id, name: c.name, mastery: ctx.stateOf(c.id).mastery,
      subjectCode: c.subjectCode, subjectName: c.subjectName,
    }))

  const strongZones = [...ctx.concepts.values()]
    .filter((c) => ctx.stateOf(c.id).mastery >= MASTERY_STRONG && c.degree >= 2)
    .sort((a, b) => ctx.stateOf(b.id).mastery - ctx.stateOf(a.id).mastery || b.degree - a.degree || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, mastery: ctx.stateOf(c.id).mastery, degree: c.degree }))

  // recommended today: weak prerequisites first, then weak hubs — deduped, measured reasons
  const recommendedToday: GraphHome['personal']['recommendedToday'] = []
  const seenRec = new Set<string>()
  for (const m of missingPrerequisites) {
    if (recommendedToday.length >= 5) break
    if (seenRec.has(m.fromId)) continue
    seenRec.add(m.fromId)
    recommendedToday.push({
      id: m.fromId,
      name: m.fromName,
      kind: ctx.concepts.get(m.fromId)?.kind ?? 'concept',
      reason: `Prerequisite for ${m.toName} — your mastery here is ${m.mastery}%`,
    })
  }
  for (const h of topHubs) {
    if (recommendedToday.length >= 5) break
    if (seenRec.has(h.id) || h.mastery >= MASTERY_WEAK) continue
    seenRec.add(h.id)
    recommendedToday.push({
      id: h.id,
      name: h.name,
      kind: h.kind,
      reason: `Hub concept — ${h.degree} connections and your mastery is ${h.mastery}%`,
    })
  }

  return {
    stats: {
      concepts: ctx.concepts.size,
      connected,
      edges: ctx.edges.length,
      crossSubject: ctx.crossSubjectEdges,
      subjects: ctx.subjects.length,
      topics: [...ctx.topicById.values()].filter((t) => t.conceptCount > 0).length,
      questions: ctx.questionTotal,
      cases: ctx.caseTotal,
    },
    topHubs,
    personal: {
      missingPrerequisites,
      confusionHotspots,
      isolatedWeak,
      strongZones,
      recommendedToday,
    },
    subjects: ctx.subjects.map((s) => ({
      code: s.code, name: s.name, color: s.color, conceptCount: s.conceptCount, edgeCount: s.edgeCount,
    })),
    recentIds: dedupeKeepOrder(recentIds).filter((id) => ctx.concepts.has(id)).slice(0, 6),
    insufficientData: ctx.insufficientData,
  }
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────

export function searchGraph(ctx: GraphContext, rawQuery: string): GraphSearchResult {
  const query = rawQuery.trim()
  const q = query.toLowerCase()
  if (!q) return { query, concepts: [], topics: [], subjects: [], synonymHits: [] }

  const exactSynonym = ctx.synonyms.find((s) => s.term === q)
  const exactSynonymConceptId =
    exactSynonym && exactSynonym.kind === 'concept' && ctx.concepts.has(exactSynonym.refId)
      ? exactSynonym.refId
      : null

  interface Hit {
    id: string
    tier: number // 0 exact (name or synonym) · 1 startsWith · 2 contains · 3 summary
    via: 'name' | 'synonym' | 'summary'
    matchedTerm?: string
  }
  const hits = new Map<string, Hit>()
  for (const c of ctx.concepts.values()) {
    const name = c.name.toLowerCase()
    let hit: Hit | null = null
    if (name === q) hit = { id: c.id, tier: 0, via: 'name' }
    else if (name.startsWith(q)) hit = { id: c.id, tier: 1, via: 'name' }
    else if (name.includes(q)) hit = { id: c.id, tier: 2, via: 'name' }
    else if (c.summary.toLowerCase().includes(q)) hit = { id: c.id, tier: 3, via: 'summary' }
    if (hit) hits.set(c.id, hit)
  }
  if (exactSynonymConceptId && exactSynonym) {
    // the synonym hit is the first-class result — it outranks everything
    hits.set(exactSynonymConceptId, { id: exactSynonymConceptId, tier: 0, via: 'synonym', matchedTerm: exactSynonym.term })
  }

  const concepts = [...hits.values()]
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      const ca = ctx.concepts.get(a.id)!
      const cb = ctx.concepts.get(b.id)!
      return cb.degree - ca.degree || cb.examRelevance - ca.examRelevance || ca.name.localeCompare(cb.name)
    })
    .slice(0, 12)
    .map((h) => {
      const c = ctx.concepts.get(h.id)!
      const st = ctx.stateOf(c.id)
      return {
        id: c.id, name: c.name, kind: c.kind, summary: c.summary,
        subjectCode: c.subjectCode, subjectName: c.subjectName, subjectColor: c.subjectColor,
        mastery: st.mastery, status: st.status,
        degree: c.degree, questionCount: c.questionCount,
        matchedVia: h.via,
        ...(h.matchedTerm ? { matchedTerm: h.matchedTerm } : {}),
      }
    })

  const topics = [...ctx.topicById.values()]
    .filter((t) => t.name.toLowerCase().includes(q))
    .sort((a, b) => b.conceptCount - a.conceptCount || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((t) => ({ id: t.id, name: t.name, subjectCode: t.subjectCode, subjectName: t.subjectName, conceptCount: t.conceptCount }))

  const subjects = ctx.subjects
    .filter((s) => s.name.toLowerCase().includes(q))
    .sort((a, b) => b.conceptCount - a.conceptCount || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map((s) => ({ id: s.id, name: s.name, color: s.color, conceptCount: s.conceptCount }))

  const refName = (kind: string, refId: string): string | null => {
    if (kind === 'concept') return ctx.concepts.get(refId)?.name ?? null
    if (kind === 'topic') return ctx.topicById.get(refId)?.name ?? null
    if (kind === 'subject') return ctx.subjects.find((s) => s.id === refId)?.name ?? null
    return null
  }
  const synonymHits = ctx.synonyms
    .filter((s) => s.term.includes(q))
    .slice(0, 6)
    .map((s) => ({ term: s.term, refId: s.refId, name: refName(s.kind, s.refId) }))
    .filter((s): s is { term: string; refId: string; name: string } => !!s.name)

  return { query, concepts, topics, subjects, synonymHits }
}

// ─── CONCEPT HUB ─────────────────────────────────────────────────────────────

export function buildGraphHub(ctx: GraphContext, conceptId: string): GraphHub | null {
  const concept = ctx.concepts.get(conceptId)
  if (!concept) return null

  const groups = buildGroups(ctx, conceptId)
  const st = ctx.stateOf(conceptId)

  // ── minimap: center + up to 12 nodes by group priority, deduped by id ──
  const raw = ctx.neighborsOf(conceptId)
  const minimapNodes: GraphHub['minimap']['nodes'] = []
  const seenMini = new Set<string>([conceptId])
  for (const kind of MINIMAP_PRIORITY) {
    const items = [...(raw.get(kind) ?? [])].sort((a, b) => {
      const ka = neighborSortKey(ctx, a.otherId)
      const kb = neighborSortKey(ctx, b.otherId)
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[3].localeCompare(kb[3])
    })
    for (const n of items) {
      if (minimapNodes.length >= 12) break
      if (seenMini.has(n.otherId)) continue
      seenMini.add(n.otherId)
      const other = ctx.concepts.get(n.otherId)!
      const ost = ctx.stateOf(n.otherId)
      minimapNodes.push({
        id: other.id, name: other.name, kind: other.kind, group: kind,
        mastery: ost.mastery, status: ost.status, subjectColor: other.subjectColor,
      })
    }
    if (minimapNodes.length >= 12) break
  }

  // ── personal layer (measured only) ──
  const prereqGroup = groups.find((g) => g.kind === 'prerequisite')
  const confusableGroup = groups.find((g) => g.kind === 'confusable')
  const unlocksGroup = groups.find((g) => g.kind === 'unlocks')

  const missingPrerequisites = (prereqGroup?.items ?? [])
    .filter((n) => n.mastery < MASTERY_WEAK)
    .map((n) => ({
      id: n.id, name: n.name, mastery: n.mastery, status: n.status,
      reason: `Prerequisite at ${n.mastery}% mastery${n.edgeLabel ? ` — ${capText(n.edgeLabel, 80)}` : ''}`,
    }))

  const weakNeighbors = groups
    .filter((g) => g.kind !== 'prerequisite')
    .flatMap((g) => g.items)
    .filter((n) => n.mastery < MASTERY_WEAK)
    .sort((a, b) => a.mastery - b.mastery || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map((n) => ({
      id: n.id, name: n.name, mastery: n.mastery, edgeType: n.edgeType,
      reason: `Sits at ${n.mastery}% mastery right next to ${concept.name}`,
    }))

  const repeatedConfusion: GraphHub['personal']['repeatedConfusion'] = []
  const confusableRaw = raw.get('confusable') ?? []
  for (const n of confusableGroup?.items ?? []) {
    const wrong = ctx.openMistakeMaxWrong.get(n.id) ?? 0
    if (wrong < 2) continue
    repeatedConfusion.push({
      pairId: confusableRaw.find((r) => r.otherId === n.id)?.pairIds[0] ?? null,
      otherId: n.id,
      otherName: n.name,
      wrongCount: wrong,
      reason: `You have missed this ${wrong} times — the pair is your repeat zone`,
    })
  }

  const recommendedNext: GraphHub['personal']['recommendedNext'] = []
  const seenRec = new Set<string>()
  const pushRec = (id: string, name: string, kind: string, reason: string) => {
    if (seenRec.has(id) || recommendedNext.length >= 5) return
    seenRec.add(id)
    recommendedNext.push({ id, name, kind, reason })
  }
  for (const m of missingPrerequisites) {
    pushRec(m.id, m.name, ctx.concepts.get(m.id)?.kind ?? 'concept', 'Learn this before pushing on')
  }
  for (const n of unlocksGroup?.items ?? []) {
    if (n.mastery >= MASTERY_WEAK) continue
    pushRec(n.id, n.name, n.kind, 'You are ready for this')
  }
  for (const w of weakNeighbors) {
    pushRec(w.id, w.name, ctx.concepts.get(w.id)?.kind ?? 'concept', `Mastery ${w.mastery}% — tighten it while it is adjacent`)
  }

  const strongZones = groups
    .flatMap((g) => g.items)
    // a concept can appear in several groups (e.g. ACEI as treatment AND
    // related) — the "strong foundations" strip names each concept once
    .filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i)
    .filter((n) => n.mastery >= MASTERY_STRONG)
    .sort((a, b) => b.mastery - a.mastery || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((n) => ({ id: n.id, name: n.name, mastery: n.mastery }))

  // ── measured counts ──
  const questionStats = { total: concept.questionCount, pyq: concept.pyqCount }
  const systemCases = concept.topicSystem ? (ctx.caseCountBySystem.get(concept.topicSystem) ?? 0) : 0
  const caseCount = systemCases > 0 ? systemCases : (ctx.caseSpecialtyCount.get(concept.subjectCode.toLowerCase()) ?? 0)

  return {
    concept: {
      id: concept.id, name: concept.name, kind: concept.kind, summary: concept.summary,
      whyMatters: concept.whyMatters, mnemonic: concept.mnemonic,
      difficulty: concept.difficulty, examRelevance: concept.examRelevance, clinicalRelevance: concept.clinicalRelevance,
    },
    topic: { id: concept.topicId, name: concept.topicName, system: concept.topicSystem },
    subject: { code: concept.subjectCode, name: concept.subjectName, color: concept.subjectColor },
    mastery: st.engaged
      ? {
          score: st.mastery,
          status: st.status,
          estRecall: Math.round(st.estRecall * 100) / 100,
          attemptCount: st.attemptCount,
          lastReviewed: st.lastReviewed,
        }
      : null,
    learnStatus: ctx.learnMarkOf(conceptId),
    groups,
    questionStats,
    caseCount,
    flashcardCount: concept.flashcardCount,
    minimap: {
      center: { id: concept.id, name: concept.name, mastery: st.mastery, status: st.status },
      nodes: minimapNodes,
    },
    personal: {
      missingPrerequisites,
      weakNeighbors,
      repeatedConfusion,
      recommendedNext,
      strongZones,
    },
    insufficientData: groups.length === 0 && questionStats.total === 0,
  }
}

// ─── KNOWLEDGE PATH ──────────────────────────────────────────────────────────

const PATH_STAGES: { stage: GraphPathStep['stage']; label: string; question: string; from: GraphGroupKind[] }[] = [
  { stage: 'why', label: 'Why', question: 'Why does this happen?', from: ['caused_by', 'prerequisite'] },
  { stage: 'mechanism', label: 'Mechanism', question: 'What is the underlying mechanism?', from: ['mechanism'] },
  { stage: 'clinical', label: 'Clinical picture', question: 'What does it do to the patient?', from: ['manifestation', 'causes'] },
  { stage: 'diagnosis', label: 'Diagnosis', question: 'How is it confirmed?', from: ['investigation'] },
  { stage: 'treatment', label: 'Treatment', question: 'How is it treated?', from: ['treatment'] },
]

export function buildGraphPath(ctx: GraphContext, conceptId: string): GraphPath | null {
  const concept = ctx.concepts.get(conceptId)
  if (!concept) return null

  const raw = ctx.neighborsOf(conceptId)
  const steps: GraphPathStep[] = []
  for (const stage of PATH_STAGES) {
    const seen = new Set<string>()
    const items: GraphPathStep['items'] = []
    for (const kind of stage.from) {
      const neighbours = [...(raw.get(kind) ?? [])].sort((a, b) => {
        const ka = neighborSortKey(ctx, a.otherId)
        const kb = neighborSortKey(ctx, b.otherId)
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[3].localeCompare(kb[3])
      })
      for (const n of neighbours) {
        if (seen.has(n.otherId)) continue
        seen.add(n.otherId)
        const other = ctx.concepts.get(n.otherId)!
        const ost = ctx.stateOf(n.otherId)
        items.push({
          id: other.id, name: other.name, kind: other.kind, summary: other.summary,
          edgeType: n.edgeType, edgeLabel: n.edgeLabel,
          mastery: ost.mastery, status: ost.status,
          subjectCode: other.subjectCode, subjectColor: other.subjectColor,
        })
      }
    }
    if (items.length > 0) steps.push({ stage: stage.stage, label: stage.label, question: stage.question, items })
  }

  // narrative: strictly mechanical measured sentences — "${from} leads to ${to}"
  // + the real edge label. Label-less related edges are skipped (no pretence).
  const narrativePriority = (type: string): number => {
    if (type === 'causes' || type === 'caused_by') return 0
    if (type === 'prerequisite_of') return 1
    if (type === 'mechanism_of' || type === 'manifestation_of' || type === 'complication_of') return 2
    if (type === 'diagnosed_by' || type === 'treated_by' || type === 'clinical_application_of' || type === 'differential_of') return 3
    return 4 // related_to / commonly_tested_with — only when they carry a label
  }
  const narrative: string[] = []
  const seenSentences = new Set<string>()
  const edgesAround = ctx.edges
    .filter((e) => e.fromId === conceptId || e.toId === conceptId)
    .filter((e) => narrativePriority(e.type) < 4 || e.label.trim().length > 0)
    .sort((a, b) => narrativePriority(a.type) - narrativePriority(b.type) || a.id.localeCompare(b.id))
  for (const e of edgesAround) {
    if (narrative.length >= 8) break
    const key = `${e.fromId}->${e.toId}`
    if (seenSentences.has(key)) continue
    seenSentences.add(key)
    const fromName = ctx.concepts.get(e.fromId)!.name
    const toName = ctx.concepts.get(e.toId)!.name
    const sentence = `${fromName} leads to ${toName}${e.label ? ` — ${capText(e.label, 110)}` : ''}.`
    narrative.push(sentence.charAt(0).toUpperCase() + sentence.slice(1))
  }

  return {
    concept: { id: concept.id, name: concept.name, kind: concept.kind, summary: concept.summary, whyMatters: concept.whyMatters },
    subject: { code: concept.subjectCode, name: concept.subjectName, color: concept.subjectColor },
    steps,
    narrative,
  }
}

// ─── EXPLORE ─────────────────────────────────────────────────────────────────

export function buildExplore(
  ctx: GraphContext,
  subjectParam?: string | null,
): { payload: GraphExplorePayload; subjectFound: boolean } {
  let subject: GraphSubjectCtx | null = null
  if (subjectParam && subjectParam.trim()) {
    const p = subjectParam.trim()
    const pl = p.toLowerCase()
    const pu = p.toUpperCase()
    subject = ctx.subjects.find((s) => s.id.toLowerCase() === pl || s.code === pu) ?? null
    if (!subject) return { payload: { subject: null, systems: [] }, subjectFound: false }
  }

  // bucket concepts by topic; count verified edges touching each topic's concepts
  const conceptsByTopic = new Map<string, string[]>()
  for (const c of ctx.concepts.values()) {
    if (!conceptsByTopic.has(c.topicId)) conceptsByTopic.set(c.topicId, [])
    conceptsByTopic.get(c.topicId)!.push(c.id)
  }
  const edgeCountByTopic = new Map<string, number>()
  for (const e of ctx.edges) {
    const fromTopic = ctx.concepts.get(e.fromId)!.topicId
    const toTopic = ctx.concepts.get(e.toId)!.topicId
    edgeCountByTopic.set(fromTopic, (edgeCountByTopic.get(fromTopic) ?? 0) + 1)
    if (toTopic !== fromTopic) edgeCountByTopic.set(toTopic, (edgeCountByTopic.get(toTopic) ?? 0) + 1)
  }

  const topicsOfSubject = [...ctx.topicById.values()].filter((t) =>
    subject ? t.subjectId === subject.id : t.conceptCount > 0,
  )

  const systemGroups = new Map<string, GraphExplorePayload['systems'][number]['topics']>()
  for (const t of topicsOfSubject) {
    const system = t.system ?? 'General'
    if (!systemGroups.has(system)) systemGroups.set(system, [])
    const topicConceptIds = conceptsByTopic.get(t.id) ?? []
    const topicConcepts = topicConceptIds
      .map((id) => ctx.concepts.get(id)!)
      .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))
      .map((c) => {
        const s = ctx.stateOf(c.id)
        return { id: c.id, name: c.name, kind: c.kind, mastery: s.mastery, status: s.status, degree: c.degree }
      })
    const engagedStates = topicConceptIds.map((id) => ctx.stateOf(id)).filter((s) => s.engaged)
    systemGroups.get(system)!.push({
      id: t.id,
      name: t.name,
      conceptCount: topicConcepts.length,
      edgeCount: edgeCountByTopic.get(t.id) ?? 0,
      mastery: engagedStates.length
        ? Math.round(engagedStates.reduce((sum, s) => sum + s.rawScore, 0) / engagedStates.length)
        : 0,
      concepts: topicConcepts,
    })
  }

  const systems = [...systemGroups.entries()]
    .map(([system, topics]) => ({
      system,
      topics: topics.sort((a, b) => b.edgeCount - a.edgeCount || b.conceptCount - a.conceptCount || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const conceptsA = a.topics.reduce((sum, t) => sum + t.conceptCount, 0)
      const conceptsB = b.topics.reduce((sum, t) => sum + t.conceptCount, 0)
      return conceptsB - conceptsA || a.system.localeCompare(b.system)
    })

  return {
    payload: {
      subject: subject
        ? { code: subject.code, name: subject.name, color: subject.color, neetWeight: subject.neetWeight }
        : null,
      systems,
    },
    subjectFound: true,
  }
}
