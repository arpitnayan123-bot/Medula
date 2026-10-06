// ─── RESOURCE HUB ENGINE (PRODUCT 14) ───────────────────────────────────────
// The deterministic, measured, honest backend of the Medical Content &
// Resource Hub. Two catalog halves:
//   · EXTERNAL — the curated, code-versioned trust layer (resource-catalog.ts),
//     metadata + link-out only.
//   · PLATFORM — synthesized live from MEASURED database counts. A platform
//     resource only exists when its counts make it real (questions>0,
//     lessons>0, …) — every number in `counts` comes from a DB query, never
//     from a guess. Ids are stable ('platform:<kind>:<scopeId>') so saves,
//     reports and deep links survive re-synthesis.
//
// Trust rules inherited from the frozen contract (types.ts, P14):
//   · Platform-owned content is always distinguishable (ownership 'platform').
//   · External resources are never re-hosted; access ≠ license.
//   · urlVerified false is shown as "verification pending", never dressed up.
//   · Personalisation uses only real learning signals (KnowledgeState,
//     RevisionItem, LearnProgress, attempts); no signal → no forYou.

import { Prisma } from '@prisma/client'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from './db'
import {
  EXTERNAL_CATALOG,
  CATALOG_IDS,
  CATALOG_DISCLAIMER,
  externalById,
  scoreExternal,
  queryWords,
} from './resource-catalog'
import { allSubjects, allTopics, subjectOfTopic } from './curriculum/registry'
import type { SubjectTaxonomy, TopicTaxonomy } from './curriculum/types'
import { SOURCE_REGISTRY } from './institutions-registry'
import { ALL_UNDERSTAND } from './understand-registry'
import type {
  LibraryExternalResource,
  LibraryPlatformResource,
  LibraryResource,
  LibraryQuery,
  LibraryResourcesPayload,
  LibraryDetailPayload,
  LibraryHomePayload,
  LibraryTopicFeedPayload,
  LibrarySavedPayload,
  LibraryReportResult,
  LibraryAiResponse,
  ResourceKind,
  ResourceAccess,
} from './types'

// ── Registry indexes (pure, memoized per process) ───────────────────────────

let subjectIndex: {
  byId: Map<string, SubjectTaxonomy>
  byCode: Map<string, SubjectTaxonomy>
  subjects: SubjectTaxonomy[]
} | null = null

function subjectMaps() {
  if (!subjectIndex) {
    const subjects = allSubjects()
    subjectIndex = {
      subjects,
      byId: new Map(subjects.map((s) => [s.id, s])),
      byCode: new Map(subjects.map((s) => [s.code.toUpperCase(), s])),
    }
  }
  return subjectIndex
}

let topicIndex: { byId: Map<string, TopicTaxonomy>; topics: TopicTaxonomy[] } | null = null

function topicMaps() {
  if (!topicIndex) {
    const topics = allTopics()
    topicIndex = { topics, byId: new Map(topics.map((t) => [t.id, t])) }
  }
  return topicIndex
}

function subjectOfTopicId(topicId: string) {
  return subjectOfTopic(topicId)
}

/** Registry importance (1..5) → contract difficulty tier (1|2|3). */
function difficultyForImportance(importance: number): 1 | 2 | 3 {
  if (importance <= 2) return 1
  if (importance === 3) return 2
  return 3
}

const PLATFORM_EXAMS = ['neetpg', 'fmge', 'mbbs']
const PLATFORM_SOURCE_SLUG = 'medula'
const PLATFORM_SOURCE_NAME = 'MEDULA'
const MAX_SCOPE_TOPICS = 30

// ── Measured counts (one small set of queries per request, shared) ──────────

interface MeasuredCounts {
  /** concept rows per topic id (all concepts) */
  conceptsByTopic: Map<string, number>
  /** concept rows WITH a serialized lesson, per topic id */
  lessonsByTopic: Map<string, number>
  /** questions attributable to a topic: Question.topicId match OR concept→topic join */
  questionsByTopic: Map<string, number>
  /** flashcards attributable to a topic via concept→topic join */
  flashcardsByTopic: Map<string, number>
  /** SimCase rows per canonical system key */
  simsBySystem: Map<string, number>
  /** DB Topic rows (id → system), the measured system keys */
  dbTopicSystem: Map<string, string | null>
  /** DB topic id → DB subject id (slug, same namespace as the registry) */
  subjectOfDbTopic: Map<string, string>
  /** questions per subject code (Question.subjectCode) */
  questionsBySubjectCode: Map<string, number>
}

async function loadMeasured(): Promise<MeasuredCounts> {
  const [concepts, lessonConcepts, questionGroups, flashcards, sims, dbTopics, qBySubject] = await Promise.all([
    db.concept.findMany({ select: { id: true, topicId: true } }),
    db.concept.findMany({ where: { lesson: { not: Prisma.DbNull } }, select: { topicId: true } }),
    db.question.findMany({ select: { topicId: true, conceptId: true } }),
    db.flashcard.findMany({ select: { conceptId: true } }),
    db.simCase.groupBy({ by: ['system'], _count: { _all: true } }),
    db.topic.findMany({ select: { id: true, system: true, subjectId: true } }),
    db.question.groupBy({ by: ['subjectCode'], _count: { _all: true } }),
  ])

  const topicOfConcept = new Map(concepts.map((c) => [c.id, c.topicId]))

  const conceptsByTopic = new Map<string, number>()
  for (const c of concepts) conceptsByTopic.set(c.topicId, (conceptsByTopic.get(c.topicId) ?? 0) + 1)

  const lessonsByTopic = new Map<string, number>()
  for (const c of lessonConcepts) lessonsByTopic.set(c.topicId, (lessonsByTopic.get(c.topicId) ?? 0) + 1)

  const questionsByTopic = new Map<string, number>()
  for (const q of questionGroups) {
    const tid = q.topicId ?? (q.conceptId ? topicOfConcept.get(q.conceptId) : undefined)
    if (tid) questionsByTopic.set(tid, (questionsByTopic.get(tid) ?? 0) + 1)
  }

  const flashcardsByTopic = new Map<string, number>()
  for (const f of flashcards) {
    const tid = f.conceptId ? topicOfConcept.get(f.conceptId) : undefined
    if (tid) flashcardsByTopic.set(tid, (flashcardsByTopic.get(tid) ?? 0) + 1)
  }

  const simsBySystem = new Map(sims.map((s) => [s.system, s._count._all]))
  const dbTopicSystem = new Map(dbTopics.map((t) => [t.id, t.system]))
  const subjectOfDbTopic = new Map(dbTopics.map((t) => [t.id, t.subjectId]))
  const questionsBySubjectCode = new Map(qBySubject.map((g) => [g.subjectCode, g._count._all]))

  return { conceptsByTopic, lessonsByTopic, questionsByTopic, flashcardsByTopic, simsBySystem, dbTopicSystem, subjectOfDbTopic, questionsBySubjectCode }
}

/** Measured Understand-library scene count for a topic: the Understand catalog
 *  has no topic ids, so the honest join is subject code + system/domain match. */
function understandSceneCount(topicId: string): number {
  const topic = topicMaps().byId.get(topicId)
  if (!topic) return 0
  const subject = subjectMaps().byId.get(topic.subjectId)
  if (!subject) return 0
  const sysKey = topic.system.toLowerCase()
  const nameTokens = topic.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
  return ALL_UNDERSTAND.filter((u) => {
    if (u.subjectCode !== subject.code) return false
    if (u.system.toLowerCase() === sysKey) return true
    const titleTokens = `${u.title} ${u.system}`.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
    return titleTokens.some((t) => nameTokens.includes(t))
  }).length
}

// ── Platform synthesis (measured only — a zero-count resource never exists) ─

function platformBase(
  id: string,
  kind: ResourceKind,
  title: string,
  description: string,
  subjects: string[],
  topicIds: string[],
  difficulty: 1 | 2 | 3,
): LibraryPlatformResource {
  return {
    id,
    ownership: 'platform',
    kind,
    title,
    description,
    subjects,
    topicIds,
    difficulty,
    exams: [...PLATFORM_EXAMS],
    counts: {},
    view: 'hub',
    focus: null,
    preset: null,
  }
}

function topicResourcesFor(
  topicId: string,
  m: MeasuredCounts,
  dueByTopic: Map<string, number>,
): LibraryPlatformResource[] {
  const topic = topicMaps().byId.get(topicId)
  if (!topic) return []
  const subject = subjectMaps().byId.get(topic.subjectId)
  const subjectIds = subject ? [subject.id] : []
  const difficulty = difficultyForImportance(topic.importance)
  const out: LibraryPlatformResource[] = []

  const concepts = m.conceptsByTopic.get(topicId) ?? 0
  const lessons = m.lessonsByTopic.get(topicId) ?? 0
  const questions = m.questionsByTopic.get(topicId) ?? 0
  const flashcards = m.flashcardsByTopic.get(topicId) ?? 0
  const due = dueByTopic.get(topicId) ?? 0
  const scenes = understandSceneCount(topicId)
  const dbSystem = m.dbTopicSystem.get(topicId) ?? topic.system
  const cases = dbSystem ? (m.simsBySystem.get(dbSystem) ?? 0) : 0

  if (lessons > 0) {
    const r = platformBase(
      `platform:topic-lessons:${topicId}`,
      'lesson',
      `${topic.name} — concept lessons`,
      `${lessons} structured concept lesson${lessons === 1 ? '' : 's'} written for this topic, with ${flashcards} linked flashcard${flashcards === 1 ? '' : 's'} for active recall.`,
      subjectIds,
      [topicId],
      difficulty,
    )
    r.counts = { concepts: lessons, flashcards }
    r.view = 'learn'
    r.focus = { kind: 'topic', id: topicId }
    out.push(r)
  }

  if (questions > 0) {
    const r = platformBase(
      `platform:topic-mcqs:${topicId}`,
      'question-set',
      `${topic.name} — adaptive question set`,
      `${questions} MCQ${questions === 1 ? '' : 's'} measured against this topic — the adaptive engine drills your weakest concepts first.`,
      subjectIds,
      [topicId],
      difficulty,
    )
    r.counts = { questions }
    r.view = 'adaptive'
    r.focus = { kind: 'topic', id: topicId }
    r.preset = { topicId, count: Math.min(questions, 10) }
    out.push(r)
  }

  if (flashcards > 0) {
    const r = platformBase(
      `platform:topic-flashcards:${topicId}`,
      'revision',
      `${topic.name} — flashcard deck`,
      `${flashcards} spaced-repetition flashcard${flashcards === 1 ? '' : 's'} linked to this topic's concepts.`,
      subjectIds,
      [topicId],
      difficulty,
    )
    r.counts = { flashcards }
    r.view = 'revise'
    r.focus = { kind: 'topic', id: topicId }
    out.push(r)
  }

  if (concepts > 0 || questions > 0 || flashcards > 0) {
    const r = platformBase(
      `platform:topic-hub:${topicId}`,
      'reference',
      `${topic.name} — topic hub`,
      `One page for everything on ${topic.name}: concepts, questions, cases, revision and linked resources.`,
      subjectIds,
      [topicId],
      difficulty,
    )
    r.counts = { concepts, questions, flashcards }
    r.view = 'hub'
    r.focus = { kind: 'topic', id: topicId }
    out.push(r)
  }

  if (due > 0) {
    const r = platformBase(
      `platform:topic-revision:${topicId}`,
      'revision',
      `${topic.name} — due revision`,
      `${due} revision item${due === 1 ? '' : 's'} currently due on this topic's concepts — measured from your own queue.`,
      subjectIds,
      [topicId],
      difficulty,
    )
    r.counts = { due }
    r.view = 'revision'
    r.focus = { kind: 'topic', id: topicId }
    out.push(r)
  }

  if (scenes > 0) {
    const r = platformBase(
      `platform:topic-scenes:${topicId}`,
      'lesson',
      `${topic.name} — living 3D scenes`,
      `${scenes} narrated living-scene explanation${scenes === 1 ? '' : 's'} from the Understand library cover this topic.`,
      subjectIds,
      [topicId],
      difficulty,
    )
    r.counts = { scenes }
    r.view = 'understand'
    r.focus = { kind: 'topic', id: topicId }
    out.push(r)
  }

  if (dbSystem && cases > 0) {
    const r = platformBase(
      `platform:topic-cases:${topicId}`,
      'case',
      `${topic.name} — clinical case simulator`,
      `${cases} simulated case${cases === 1 ? '' : 's'} in the ${dbSystem} system — investigate, diagnose and decide with feedback.`,
      subjectIds,
      [topicId],
      difficulty,
    )
    r.counts = { cases }
    r.view = 'cases'
    r.focus = { kind: 'topic', id: topicId }
    out.push(r)
  }

  return out
}

function subjectResourcesFor(
  subjectId: string,
  m: MeasuredCounts,
): LibraryPlatformResource[] {
  const subject = subjectMaps().byId.get(subjectId)
  if (!subject) return []
  const out: LibraryPlatformResource[] = []
  const questions = m.questionsBySubjectCode.get(subject.code) ?? 0
  const topics = topicMaps().topics.filter((t) => t.subjectId === subjectId)
  let lessons = 0
  for (const t of topics) lessons += m.lessonsByTopic.get(t.id) ?? 0

  if (questions > 0) {
    const r = platformBase(
      `platform:subject-mcqs:${subject.code}`,
      'question-set',
      `${subject.name} — question bank`,
      `${questions} MCQ${questions === 1 ? '' : 's'} measured for ${subject.name} — practice with per-answer adaptive selection.`,
      [subject.id],
      [],
      difficultyForImportance(
        topics.length ? Math.round(topics.reduce((s, t) => s + t.importance, 0) / topics.length) : 3,
      ),
    )
    r.counts = { questions }
    r.view = 'adaptive'
    r.focus = { kind: 'subject', id: subject.id }
    r.preset = { subjectCode: subject.code, count: Math.min(questions, 10) }
    out.push(r)
  }

  if (lessons > 0) {
    const r = platformBase(
      `platform:subject-lessons:${subject.code}`,
      'lesson',
      `${subject.name} — concept lessons`,
      `${lessons} structured concept lesson${lessons === 1 ? '' : 's'} across ${topics.length} topic${topics.length === 1 ? '' : 's'} of ${subject.name}.`,
      [subject.id],
      [],
      difficultyForImportance(
        topics.length ? Math.round(topics.reduce((s, t) => s + t.importance, 0) / topics.length) : 3,
      ),
    )
    r.counts = { concepts: lessons, topics: topics.length }
    r.view = 'learn'
    r.focus = { kind: 'subject', id: subject.id }
    out.push(r)
  }

  if (topics.length > 0) {
    const conceptTotal = topics.reduce((s, t) => s + (m.conceptsByTopic.get(t.id) ?? 0), 0)
    const r = platformBase(
      `platform:subject-curriculum:${subject.code}`,
      'course',
      `${subject.name} — curriculum map`,
      `The full ${subject.name} track: ${topics.length} topic${topics.length === 1 ? '' : 's'} organised the way the curriculum teaches them.`,
      [subject.id],
      [],
      difficultyForImportance(
        topics.length ? Math.round(topics.reduce((s, t) => s + t.importance, 0) / topics.length) : 3,
      ),
    )
    r.counts = { topics: topics.length, concepts: conceptTotal }
    r.view = 'learn'
    r.focus = { kind: 'subject', id: subject.id }
    out.push(r)
  }

  return out
}

/** Platform resources for explicit topic/subject scopes.
 *  Topic-level entries only exist for topics whose measured counts make them
 *  real; scope topics are capped at MAX_SCOPE_TOPICS to bound the work.
 *  Both lists empty → subject-level entries for ALL subjects. */
export async function platformResourcesFor(
  topicIds: string[],
  subjectIds: string[],
): Promise<LibraryPlatformResource[]> {
  const m = await loadMeasured()
  return platformResourcesForMeasured(topicIds, subjectIds, m, new Map())
}

/** Internal: same as platformResourcesFor but reusing pre-loaded counts. */
function platformResourcesForMeasured(
  topicIds: string[],
  subjectIds: string[],
  m: MeasuredCounts,
  dueByTopic: Map<string, number>,
): LibraryPlatformResource[] {
  const out: LibraryPlatformResource[] = []
  const seenTopics = new Set<string>()
  for (const tid of topicIds.slice(0, MAX_SCOPE_TOPICS)) {
    if (seenTopics.has(tid)) continue
    seenTopics.add(tid)
    out.push(...topicResourcesFor(tid, m, dueByTopic))
  }
  const seenSubjects = new Set<string>()
  for (const sid of subjectIds) {
    if (seenSubjects.has(sid)) continue
    seenSubjects.add(sid)
    out.push(...subjectResourcesFor(sid, m))
  }
  return out
}

/** The full synthesizable platform catalog (subject-level + topic-level over
 *  every registry topic). Bounded and measured: ~101 registry topics against a
 *  handful of tiny aggregate queries, all in-memory after load. */
export async function allPlatformResources(): Promise<LibraryPlatformResource[]> {
  const m = await loadMeasured()
  const topics = topicMaps().topics.map((t) => t.id)
  const subjects = subjectMaps().subjects.map((s) => s.id)
  return platformResourcesForMeasured(topics, subjects, m, new Map())
}

// ── Unified catalog helpers ─────────────────────────────────────────────────

/** Internal search shape: the frozen contract resource plus engine-only
 *  filter/sort metadata (platform entries carry sourceSlug 'medula' so the
 *  source filter can express "platform only" without contract changes). */
interface CatalogEntry {
  resource: LibraryResource
  sourceSlug: string
  sourceName: string
  /** platform = always current (code-versioned); external uses its own stamp */
  lastVerified: string | null
  urlVerified: boolean
  access: ResourceAccess | null
}

function entryFor(r: LibraryResource): CatalogEntry {
  if (r.ownership === 'external') {
    return {
      resource: r,
      sourceSlug: r.sourceSlug,
      sourceName: r.sourceName,
      lastVerified: r.lastVerified,
      urlVerified: r.urlVerified,
      access: r.access,
    }
  }
  return {
    resource: r,
    sourceSlug: PLATFORM_SOURCE_SLUG,
    sourceName: PLATFORM_SOURCE_NAME,
    lastVerified: null,
    urlVerified: true,
    access: null,
  }
}

function scorePlatform(r: LibraryPlatformResource, words: string[]): number {
  if (words.length === 0) return 0
  const title = r.title.toLowerCase()
  const hay = [r.description, r.kind, r.subjects.join(' '), r.topicIds.join(' ').replace(/-/g, ' ')]
    .join(' ')
    .toLowerCase()
  let score = 0
  for (const w of words) {
    if (title.includes(w)) score += 3
    else if (hay.includes(w)) score += 2
  }
  return score
}

function cmpTitle(a: CatalogEntry, b: CatalogEntry): number {
  return a.resource.title.localeCompare(b.resource.title)
}

/** Deterministic personalisation score for one resource against measured signals. */
interface ProfileSignals {
  weakTopics: Map<string, string> // topicId → weakest concept name (for reason tags)
  weakSubjectIds: Set<string>
  dueTopicIds: Set<string>
  recentTopicIds: Set<string>
}

function personalScore(r: LibraryResource, s: ProfileSignals): number {
  let score = 0
  for (const tid of r.topicIds) {
    if (s.weakTopics.has(tid)) score += 4
    if (s.dueTopicIds.has(tid)) score += 2
    if (s.recentTopicIds.has(tid)) score += 1.5
  }
  for (const sid of r.subjects) if (s.weakSubjectIds.has(sid)) score += 2
  if (r.exams.includes('neetpg')) score += 0.5
  return score
}

function reasonTagFor(r: LibraryResource, s: ProfileSignals): string | null {
  for (const tid of r.topicIds) {
    const concept = s.weakTopics.get(tid)
    if (concept) return `Covers your weak concept ${concept}`
  }
  for (const tid of r.topicIds) {
    if (s.dueTopicIds.has(tid)) {
      const topic = topicMaps().byId.get(tid)
      if (topic) return `Strengthens ${topic.name}`
    }
  }
  for (const tid of r.topicIds) {
    if (s.recentTopicIds.has(tid)) {
      const topic = topicMaps().byId.get(tid)
      if (topic) return `Matches your recent topic ${topic.name}`
    }
  }
  for (const sid of r.subjects) {
    if (s.weakSubjectIds.has(sid)) {
      const subject = subjectMaps().byId.get(sid)
      if (subject) return `Builds on weak areas in ${subject.name}`
    }
  }
  return null
}

// ── searchLibrary ───────────────────────────────────────────────────────────

export const LIBRARY_PAGE_SIZE = 12

const KINDS: Set<string> = new Set([
  'lesson', 'notes', 'lecture-video', 'article', 'guideline', 'reference',
  'images', 'clinical', 'pyq', 'question-set', 'revision', 'course', 'case',
])
const ACCESSES: Set<string> = new Set(['PUBLIC', 'REGISTRATION', 'PAID', 'MIXED', 'UNKNOWN'])

export async function searchLibrary(q: LibraryQuery): Promise<LibraryResourcesPayload> {
  const words = q.q ? queryWords(q.q) : []

  // Scope resolution — topic filter wins; subject filter expands to its topics.
  let scopeTopicIds: string[] = []
  let scopeSubjectIds: string[] = []
  const hasScope = Boolean(q.topic || q.subject)
  if (q.topic) {
    scopeTopicIds = [q.topic]
    const t = topicMaps().byId.get(q.topic)
    if (t) scopeSubjectIds = [t.subjectId]
  } else if (q.subject) {
    scopeSubjectIds = [q.subject]
    scopeTopicIds = topicMaps().topics.filter((t) => t.subjectId === q.subject).map((t) => t.id)
  }

  const m = await loadMeasured()
  const platform = hasScope
    ? platformResourcesForMeasured(scopeTopicIds, scopeSubjectIds, m, new Map())
    : subjectMaps().subjects.flatMap((s) => subjectResourcesFor(s.id, m))

  const all: CatalogEntry[] = [...EXTERNAL_CATALOG, ...platform].map(entryFor)

  const kindCsv = (q.kind ?? '').split(',').map((k) => k.trim()).filter((k) => KINDS.has(k))
  const filtered = all.filter((e) => {
    const r = e.resource
    if (q.subject && !r.subjects.includes(q.subject)) return false
    if (q.topic && !r.topicIds.includes(q.topic)) return false
    if (kindCsv.length > 0 && !kindCsv.includes(r.kind)) return false
    if (q.source) {
      if (q.source === PLATFORM_SOURCE_SLUG) {
        if (r.ownership !== 'platform') return false
      } else if (!(r.ownership === 'external' && r.sourceSlug === q.source)) return false
    }
    if (q.difficulty && r.difficulty !== q.difficulty) return false
    if (q.exam && !r.exams.includes(q.exam)) return false
    if (q.ownership && r.ownership !== q.ownership) return false
    if (q.access && !(r.ownership === 'external' && r.access === q.access)) return false
    return true
  })

  const scored = filtered.map((e) => ({
    e,
    score: e.resource.ownership === 'external' ? scoreExternal(e.resource, words) : scorePlatform(e.resource, words),
  }))
  const matches = words.length > 0 ? scored.filter((s) => s.score > 0) : scored

  const sort = q.sort ?? 'relevance'
  if (sort === 'title') {
    matches.sort((a, b) => cmpTitle(a.e, b.e))
  } else if (sort === 'recent') {
    matches.sort((a, b) => {
      const av = a.e.lastVerified
      const bv = b.e.lastVerified
      if (av && bv) return bv.localeCompare(av)
      if (av) return -1
      if (bv) return 1
      return cmpTitle(a.e, b.e)
    })
  } else {
    // relevance: score desc → verified before unverified → title
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.e.urlVerified !== b.e.urlVerified) return a.e.urlVerified ? -1 : 1
      return cmpTitle(a.e, b.e)
    })
  }

  const total = matches.length
  const page = Math.max(1, Math.floor(q.page ?? 1))
  const start = (page - 1) * LIBRARY_PAGE_SIZE
  return {
    total,
    page,
    pageSize: LIBRARY_PAGE_SIZE,
    resources: matches.slice(start, start + LIBRARY_PAGE_SIZE).map((s) => s.e.resource),
    disclaimer: CATALOG_DISCLAIMER,
  }
}

// ── resourceDetail ──────────────────────────────────────────────────────────

const SIM_DIFFICULTY_NUM: Record<string, 1 | 2 | 3> = {
  beginner: 1,
  mbbs: 2,
  neetpg: 3,
  advanced: 3,
}

/** Resolve a 'platform:…' id against live measured counts (never cached — a
 *  save/report on a stale id must fail honestly when counts are zero). */
async function resolvePlatformById(id: string): Promise<LibraryPlatformResource | null> {
  const parts = id.split(':')
  if (parts.length !== 3 || parts[0] !== 'platform') return null
  const kind = parts[1]
  const scopeId = parts[2]
  const m = await loadMeasured()

  const topicKinds = new Set(['topic-lessons', 'topic-mcqs', 'topic-flashcards', 'topic-hub', 'topic-revision', 'topic-scenes', 'topic-cases'])
  const subjectKinds = new Set(['subject-mcqs', 'subject-lessons', 'subject-curriculum'])

  if (topicKinds.has(kind)) {
    const topic = topicMaps().byId.get(scopeId)
    if (!topic) return null
    const list = topicResourcesFor(scopeId, m, new Map())
    return list.find((r) => r.id === id) ?? null
  }
  if (subjectKinds.has(kind)) {
    const subject = subjectMaps().byCode.get(scopeId.toUpperCase())
    if (!subject) return null
    const list = subjectResourcesFor(subject.id, m)
    return list.find((r) => r.id === id) ?? null
  }
  return null
}

interface TopicIntegration {
  id: string
  name: string
  subjectId: string
  subjectName: string
  importance: number
  concepts: number
  questions: number
  mastery: number | null
}

async function buildIntegration(
  topicIds: string[],
  m: MeasuredCounts,
  profileId: string,
): Promise<{
  subjects: { id: string; name: string; color: string }[]
  topics: TopicIntegration[]
  concepts: { id: string; name: string; topicId: string; mastery: number | null }[]
  cases: { id: string; title: string; specialty: string; difficulty: number }[]
}> {
  const subjectsOut: { id: string; name: string; color: string }[] = []
  const seenSubjects = new Set<string>()
  const topicsOut: TopicIntegration[] = []

  for (const tid of topicIds) {
    const topic = topicMaps().byId.get(tid)
    if (!topic) continue
    const subject = subjectMaps().byId.get(topic.subjectId)
    if (subject && !seenSubjects.has(subject.id)) {
      seenSubjects.add(subject.id)
      subjectsOut.push({ id: subject.id, name: subject.name, color: subject.color })
    }
    const conceptIds = (await db.concept.findMany({ where: { topicId: tid }, select: { id: true } })).map((c) => c.id)
    let mastery: number | null = null
    if (conceptIds.length > 0) {
      const states = await db.knowledgeState.findMany({
        where: { profileId, conceptId: { in: conceptIds } },
        select: { score: true },
      })
      if (states.length > 0) {
        mastery = Math.round((states.reduce((s, st) => s + st.score, 0) / states.length) * 10) / 10
      }
    }
    topicsOut.push({
      id: tid,
      name: topic.name,
      subjectId: topic.subjectId,
      subjectName: subject?.name ?? topic.subjectId,
      importance: topic.importance,
      concepts: m.lessonsByTopic.get(tid) ?? 0,
      questions: m.questionsByTopic.get(tid) ?? 0,
      mastery,
    })
  }

  // Concepts + cases come from the FIRST integrated topic (the focus topic).
  const focusTopicId = topicsOut[0]?.id
  let concepts: { id: string; name: string; topicId: string; mastery: number | null }[] = []
  let cases: { id: string; title: string; specialty: string; difficulty: number }[] = []

  if (focusTopicId) {
    const rows = await db.concept.findMany({
      where: { topicId: focusTopicId },
      select: { id: true, name: true, topicId: true },
      orderBy: { id: 'asc' },
      take: 6,
    })
    const stateMap = new Map(
      (await db.knowledgeState.findMany({
        where: { profileId, conceptId: { in: rows.map((r) => r.id) } },
        select: { conceptId: true, score: true },
      })).map((s) => [s.conceptId, s.score]),
    )
    concepts = rows.map((r) => ({
      id: r.id,
      name: r.name,
      topicId: r.topicId,
      mastery: stateMap.has(r.id) ? stateMap.get(r.id) ?? null : null,
    }))

    const system = m.dbTopicSystem.get(focusTopicId) ?? topicMaps().byId.get(focusTopicId)?.system ?? null
    if (system) {
      const sims = await db.simCase.findMany({
        where: { system },
        select: { id: true, title: true, specialty: true, difficulty: true },
        orderBy: { createdAt: 'asc' },
        take: 4,
      })
      cases = sims.map((s) => ({ id: s.id, title: s.title, specialty: s.specialty, difficulty: SIM_DIFFICULTY_NUM[s.difficulty] ?? 2 }))
    }
  }

  return { subjects: subjectsOut, topics: topicsOut, concepts, cases }
}

/** Related siblings: same topics first, then same subject; same kind preferred;
 *  max 4. Platform candidates are bounded to the resource's own scope. */
async function buildRelated(r: LibraryResource, m: MeasuredCounts): Promise<LibraryResource[]> {
  const scopeTopics = r.topicIds
  const scopeSubjects = r.subjects
  const platformScope = platformResourcesForMeasured(
    scopeTopics,
    scopeSubjects,
    m,
    new Map(),
  )
  const candidates: CatalogEntry[] = [...EXTERNAL_CATALOG, ...platformScope]
    .filter((c) => c.id !== r.id)
    .map(entryFor)

  const scored = candidates.map((e) => {
    const c = e.resource
    let score = 0
    if (c.kind === r.kind) score += 2
    const sharedTopic = c.topicIds.filter((t) => scopeTopics.includes(t)).length
    if (sharedTopic > 0) score += 3
    else if (c.subjects.some((s) => scopeSubjects.includes(s))) score += 1
    return { e, score }
  })
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return cmpTitle(a.e, b.e)
  })
  return scored.slice(0, 4).map((s) => s.e.resource)
}

export async function resourceDetail(
  id: string,
  profileId: string,
): Promise<LibraryDetailPayload | null> {
  let resource: LibraryResource | null = null
  if (id.startsWith('ext:')) {
    resource = externalById(id)
  } else if (id.startsWith('platform:')) {
    resource = await resolvePlatformById(id)
  }
  if (!resource) return null

  const m = await loadMeasured()

  // Integration scope: platform topic resources focus their topic; externals
  // integrate their declared topic list (subject-level → the topics carrying
  // subject-level externals are none, so subjects carry the integration).
  const focusTopicIds = resource.topicIds.length > 0
    ? resource.topicIds
    : resource.ownership === 'platform' && resource.focus?.kind === 'subject'
      ? topicMaps().topics.filter((t) => t.subjectId === resource.focus!.id).slice(0, 3).map((t) => t.id)
      : []

  const integration = await buildIntegration(focusTopicIds, m, profileId)
  const related = await buildRelated(resource, m)

  const [saved, reported] = await Promise.all([
    db.savedResource.findFirst({ where: { profileId, resourceId: id }, select: { id: true } }),
    db.resourceReport.findFirst({ where: { profileId, resourceId: id }, select: { id: true } }),
  ])

  const firstTopic = focusTopicIds[0] ?? null
  return {
    resource,
    integration,
    related,
    saved: Boolean(saved),
    reported: Boolean(reported),
    handoffs: firstTopic
      ? {
          practice: { topicId: firstTopic },
          revision: { topicId: firstTopic },
          hub: { topicId: firstTopic },
        }
      : { practice: null, revision: null, hub: null },
    disclaimer: CATALOG_DISCLAIMER,
  }
}

// ── libraryHome ─────────────────────────────────────────────────────────────

async function loadProfileSignals(profileId: string): Promise<{
  signals: ProfileSignals
  basis: { weakConcepts: number; dueRevision: number; recentTopics: number }
  recentTopics: { id: string; name: string; subjectId: string; subjectName: string }[]
}> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)

  const [weakStates, dueItems, recentProgress] = await Promise.all([
    db.knowledgeState.findMany({
      where: { profileId, score: { lt: 60 } },
      select: { conceptId: true, score: true },
      orderBy: { score: 'asc' },
      take: 40,
    }),
    db.revisionItem.findMany({
      where: { profileId, cleared: false, dueAt: { lte: new Date() } },
      select: { conceptId: true },
    }),
    db.learnProgress.findMany({
      where: { profileId, kind: 'topic' },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: { entityId: true },
    }),
  ])

  // Measured fallback for recent topics: most-attempted question topics of the
  // last 7 days (questions link to topics through their concept).
  let recentEntityIds = recentProgress.map((r) => r.entityId)
  if (recentEntityIds.length === 0) {
    const attempts = await db.questionAttempt.findMany({
      where: { profileId, createdAt: { gte: since } },
      select: { question: { select: { concept: { select: { topicId: true } } } } },
      take: 200,
    })
    const counts = new Map<string, number>()
    for (const a of attempts) {
      const tid = a.question.concept?.topicId
      if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1)
    }
    recentEntityIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tid]) => tid)
  }

  const conceptIds = [...new Set([...weakStates.map((s) => s.conceptId), ...dueItems.map((d) => d.conceptId)])]
  const conceptRows = conceptIds.length
    ? await db.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, name: true, topicId: true } })
    : []
  const conceptById = new Map(conceptRows.map((c) => [c.id, c]))

  const signals: ProfileSignals = {
    weakTopics: new Map(),
    weakSubjectIds: new Set(),
    dueTopicIds: new Set(),
    recentTopicIds: new Set(),
  }
  for (const s of weakStates) {
    const c = conceptById.get(s.conceptId)
    if (c && !signals.weakTopics.has(c.topicId)) signals.weakTopics.set(c.topicId, c.name)
  }
  for (const d of dueItems) {
    const c = conceptById.get(d.conceptId)
    if (c) signals.dueTopicIds.add(c.topicId)
  }
  for (const tid of recentEntityIds) signals.recentTopicIds.add(tid)
  for (const tid of [...signals.weakTopics.keys()]) {
    const subject = subjectOfTopicId(tid)
    if (subject) signals.weakSubjectIds.add(subject.id)
  }

  const recentTopics = recentEntityIds
    .map((tid) => {
      const topic = topicMaps().byId.get(tid)
      if (!topic) return null
      const subject = subjectMaps().byId.get(topic.subjectId)
      return {
        id: topic.id,
        name: topic.name,
        subjectId: topic.subjectId,
        subjectName: subject?.name ?? topic.subjectId,
      }
    })
    .filter((t): t is { id: string; name: string; subjectId: string; subjectName: string } => t !== null)

  return {
    signals,
    basis: {
      weakConcepts: weakStates.length,
      dueRevision: dueItems.length,
      recentTopics: recentTopics.length,
    },
    recentTopics,
  }
}

export async function libraryHome(profileId: string): Promise<LibraryHomePayload> {
  const m = await loadMeasured()
  const platform = await allPlatformResourcesWithCounts(m)
  const { signals, basis, recentTopics } = await loadProfileSignals(profileId)

  const [savedCount] = await Promise.all([db.savedResource.count({ where: { profileId } })])

  // kinds: count per kind across the FULL combined catalog
  const kindCounts = new Map<ResourceKind, number>()
  for (const r of [...EXTERNAL_CATALOG, ...platform]) kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1)
  const kinds = [...kindCounts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))

  // subjects: top 12 by combined resource count
  const subjectCounts = new Map<string, number>()
  for (const r of [...EXTERNAL_CATALOG, ...platform]) {
    for (const sid of r.subjects) subjectCounts.set(sid, (subjectCounts.get(sid) ?? 0) + 1)
  }
  const subjects = subjectMaps().subjects
    .map((s) => ({ id: s.id, name: s.name, color: s.color, count: subjectCounts.get(s.id) ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 12)

  // sources: external grouped by sourceSlug (registry name, honest verified flag)
  const bySlug = new Map<string, { count: number; verified: boolean; fallbackName: string }>()
  for (const r of EXTERNAL_CATALOG) {
    const cur = bySlug.get(r.sourceSlug) ?? { count: 0, verified: true, fallbackName: r.sourceName }
    cur.count += 1
    cur.verified = cur.verified && r.urlVerified
    bySlug.set(r.sourceSlug, cur)
  }
  const registryByName = new Map(SOURCE_REGISTRY.map((s) => [s.slug, s.name]))
  const sources = [...bySlug.entries()]
    .map(([slug, v]) => ({ slug, name: registryByName.get(slug) ?? v.fallbackName, count: v.count, verified: v.verified }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  // featured: 6 stable hand-picked ids — first found by kind, deterministic
  const featured: LibraryResource[] = []
  const pickExternal = (kind: ResourceKind) => EXTERNAL_CATALOG.find((r) => r.kind === kind)
  for (const kind of ['guideline', 'course', 'images', 'reference', 'pyq'] as ResourceKind[]) {
    const pick = pickExternal(kind)
    if (pick) featured.push(pick)
  }
  const platformMcq = platform
    .filter((r) => r.kind === 'question-set' && r.topicIds.length === 1)
    .sort((a, b) => {
      const ta = topicMaps().byId.get(a.topicIds[0]!)
      const tb = topicMaps().byId.get(b.topicIds[0]!)
      const ia = ta?.importance ?? 0
      const ib = tb?.importance ?? 0
      if (ib !== ia) return ib - ia
      return (b.counts.questions ?? 0) - (a.counts.questions ?? 0) || a.id.localeCompare(b.id)
    })[0]
  if (platformMcq) featured.push(platformMcq)

  // forYou: ONLY from real signals — never fabricated
  const hasSignal = basis.weakConcepts >= 3 || basis.dueRevision >= 1 || basis.recentTopics >= 1
  let forYou: LibraryHomePayload['forYou'] = null
  if (hasSignal) {
    const entries = [...EXTERNAL_CATALOG, ...platform]
      .map((r) => ({ r, score: personalScore(r, signals), tag: reasonTagFor(r, signals) }))
      .filter((e) => e.score > 0 && e.tag)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        const av = a.r.ownership === 'external' ? a.r.urlVerified : true
        const bv = b.r.ownership === 'external' ? b.r.urlVerified : true
        if (av !== bv) return av ? -1 : 1
        return a.r.title.localeCompare(b.r.title)
      })
    const perKind = new Map<ResourceKind, number>()
    const picked: (LibraryResource & { reasonTag: string })[] = []
    for (const e of entries) {
      const used = perKind.get(e.r.kind) ?? 0
      if (used >= 2) continue
      perKind.set(e.r.kind, used + 1)
      picked.push({ ...e.r, reasonTag: e.tag! })
      if (picked.length === 5) break
    }
    if (picked.length > 0) {
      const reasonBits: string[] = []
      if (basis.weakConcepts > 0) reasonBits.push(`${basis.weakConcepts} weak concept${basis.weakConcepts === 1 ? '' : 's'}`)
      if (basis.dueRevision > 0) reasonBits.push(`${basis.dueRevision} due revision${basis.dueRevision === 1 ? '' : 's'}`)
      if (basis.recentTopics > 0) reasonBits.push(`${basis.recentTopics} recent topic${basis.recentTopics === 1 ? '' : 's'}`)
      forYou = {
        reason: `From your measured learning signals — ${reasonBits.join(', ')}`,
        basis,
        resources: picked,
      }
    }
  }

  const verifiedExternal = EXTERNAL_CATALOG.filter((r) => r.urlVerified).length
  return {
    stats: {
      platform: platform.length,
      external: EXTERNAL_CATALOG.length,
      saved: savedCount,
      verifiedExternal,
    },
    forYou,
    kinds,
    subjects,
    sources,
    featured,
    recentTopics,
    hasSignal: forYou !== null,
    disclaimer: CATALOG_DISCLAIMER,
  }
}

/** allPlatformResources with a shared measured-load (home calls it once). */
async function allPlatformResourcesWithCounts(m: MeasuredCounts): Promise<LibraryPlatformResource[]> {
  const topics = topicMaps().topics.map((t) => t.id)
  const subjects = subjectMaps().subjects.map((s) => s.id)
  return platformResourcesForMeasured(topics, subjects, m, new Map())
}

// ── topicFeed ───────────────────────────────────────────────────────────────

export async function topicFeed(topicId: string): Promise<LibraryTopicFeedPayload | null> {
  const topic = topicMaps().byId.get(topicId)
  if (!topic) return null
  const subject = subjectMaps().byId.get(topic.subjectId)

  const platform = await platformResourcesFor([topicId], [])
  const topicLinked = EXTERNAL_CATALOG.filter((r) => r.topicIds.includes(topicId))
  const subjectLevel = EXTERNAL_CATALOG.filter(
    (r) => !r.topicIds.includes(topicId) && r.subjects.includes(topic.subjectId),
  )
  const external = [...topicLinked, ...subjectLevel]

  return {
    topic: {
      id: topic.id,
      name: topic.name,
      subjectId: topic.subjectId,
      subjectName: subject?.name ?? topic.subjectId,
      system: topic.system || null,
    },
    platform,
    external,
    total: platform.length + external.length,
    disclaimer: CATALOG_DISCLAIMER,
  }
}

// ── saved ───────────────────────────────────────────────────────────────────

export function isExternalResourceId(id: string): boolean {
  return CATALOG_IDS.has(id)
}

/** A platform id is valid only when it resolves against the LIVE measured
 *  counts — you cannot bookmark (or report) a resource that does not exist. */
export async function isValidResourceId(id: string): Promise<boolean> {
  if (id.startsWith('ext:')) return CATALOG_IDS.has(id)
  if (id.startsWith('platform:')) return (await resolvePlatformById(id)) !== null
  return false
}

export async function savedList(profileId: string): Promise<LibrarySavedPayload> {
  const rows = await db.savedResource.findMany({
    where: { profileId },
    orderBy: { createdAt: 'desc' },
  })
  const resources: (LibraryResource & { savedAt: string })[] = []
  for (const row of rows) {
    let resolved: LibraryResource | null = null
    if (row.resourceId.startsWith('ext:')) {
      resolved = externalById(row.resourceId)
    } else if (row.resourceId.startsWith('platform:')) {
      resolved = await resolvePlatformById(row.resourceId)
    }
    if (resolved) resources.push({ ...resolved, savedAt: row.createdAt.toISOString() })
  }
  return { resources, total: resources.length }
}

export async function toggleSaved(
  profileId: string,
  resourceId: string,
): Promise<{ saved: boolean }> {
  if (!(await isValidResourceId(resourceId))) throw new Error('INVALID_ID')
  const existing = await db.savedResource.findUnique({
    where: { profileId_resourceId: { profileId, resourceId } },
    select: { id: true },
  })
  if (existing) {
    await db.savedResource.delete({ where: { id: existing.id } })
    return { saved: false }
  }
  await db.savedResource.create({ data: { profileId, resourceId } })
  return { saved: true }
}

// ── report ──────────────────────────────────────────────────────────────────

export const REPORT_REASONS = ['incorrect', 'broken', 'outdated', 'copyright', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export async function reportResource(
  profileId: string,
  resourceId: string,
  reason: ReportReason,
  details: string,
): Promise<LibraryReportResult> {
  if (!REPORT_REASONS.includes(reason)) throw new Error('INVALID_REASON')
  if (!(resourceId.startsWith('ext:') || resourceId.startsWith('platform:'))) throw new Error('INVALID_ID')
  const row = await db.resourceReport.create({
    data: { profileId, resourceId, reason, details: details.slice(0, 500) },
  })
  return {
    ok: true,
    reason,
    receivedAt: row.createdAt.toISOString(),
    note: 'Report recorded — it stays open until reviewed; the resource remains listed in the meantime.',
  }
}

// ── AI assistant (backend-only ZAI) ─────────────────────────────────────────

const AI_BADGE = 'AI-ASSISTED SUMMARY'
const AI_DISCLAIMER =
  'AI assistance is generated from our own catalog metadata and your learning signals — it never reproduces the external resource’s copyrighted content. Always verify against the original source.'

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact).'

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parseLooseJson(text: string): Record<string, unknown> | null {
  const direct = tryParse(text.trim())
  if (direct) return direct
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const fromFence = tryParse(fence[1]!.trim())
    if (fromFence) return fromFence
  }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const sliced = tryParse(text.slice(first, last + 1))
    if (sliced) return sliced
  }
  return null
}

function metaForAi(r: LibraryResource): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    subjects: r.subjects,
    difficulty: r.difficulty,
  }
  if (r.ownership === 'external') {
    base.source = r.sourceName
    base.access = r.access
    base.license = r.license
    base.verified = r.urlVerified
  } else {
    base.source = PLATFORM_SOURCE_NAME
    base.access = 'Included in MEDULA'
    base.counts = r.counts
  }
  return base
}

function accessHonesty(r: LibraryResource): string {
  if (r.ownership === 'platform') return 'included in the platform'
  switch (r.access) {
    case 'PUBLIC': return 'free public access'
    case 'REGISTRATION': return 'free but needs registration'
    case 'PAID': return 'paid'
    case 'MIXED': return 'mixed free/paid access'
    default: return 'access terms not confirmed'
  }
}

export interface LibraryAiBody {
  mode: 'recommend' | 'key-points' | 'compare'
  resourceIds?: string[]
  query?: string
}

export async function libraryAi(
  profileId: string,
  body: LibraryAiBody,
): Promise<LibraryAiResponse> {
  const mode = body.mode
  if (mode !== 'recommend' && mode !== 'key-points' && mode !== 'compare') throw new Error('INVALID_MODE')

  const m = await loadMeasured()
  const { signals } = await loadProfileSignals(profileId)

  const resolveAny = async (id: string): Promise<LibraryResource | null> => {
    if (id.startsWith('ext:')) return externalById(id)
    if (id.startsWith('platform:')) return resolvePlatformById(id)
    return null
  }

  if (mode === 'recommend') {
    // Grounded candidate list: top 12 by the SAME deterministic personalisation
    // scoring used on the home surface — the LLM only ever sees metadata.
    const platform = await allPlatformResourcesWithCounts(m)
    const candidates = [...EXTERNAL_CATALOG, ...platform]
      .map((r) => ({ r, score: personalScore(r, signals), tag: reasonTagFor(r, signals) }))
      .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title))
      .slice(0, 12)
    const candidateIds = new Set(candidates.map((c) => c.r.id))

    const listing = candidates
      .map((c, i) => `${i + 1}. ${JSON.stringify(metaForAi(c.r))}`)
      .join('\n')
    const profile = await db.studentProfile.findUnique({ where: { id: profileId }, select: { year: true, prepStage: true } })
    const context = [
      `Student: MBBS year ${profile?.year ?? '?'}, prep stage "${profile?.prepStage ?? 'unknown'}".`,
      `Signals: ${signals.weakTopics.size} weak topics, ${signals.dueTopicIds.size} topics with due revision, ${signals.recentTopicIds.size} recent topics.`,
      'CANDIDATES (the ONLY ids you may pick from):',
      listing,
    ].join('\n')

    let answer = ''
    let resourceIds: string[] = []
    let fallback = false
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are the study-resource guide inside MEDULA, a medical learning platform. From the candidate list, pick AT MOST 3 resources that best fit the student's signals and explain each in ONE short sentence (≤25 words). Only recommend from the list; never invent ids, titles or content details beyond the metadata shown. No chain-of-thought — conclusions only.\n\n${JSON_RULE} Shape: {"picks":[{"id":"<candidate id>","reason":"<one sentence>"}]}`,
          },
          { role: 'user', content: context },
        ],
        temperature: 0.3,
        maxTokens: 600,
      })
      const content = completion.choices[0]?.message?.content ?? ''
      const parsed = parseLooseJson(content)
      const picks = parsed && Array.isArray(parsed.picks) ? parsed.picks : []
      for (const p of picks) {
        if (resourceIds.length >= 3) break
        const pid = p && typeof p === 'object' && typeof (p as Record<string, unknown>).id === 'string'
          ? (p as Record<string, unknown>).id as string
          : null
        const why = p && typeof p === 'object' && typeof (p as Record<string, unknown>).reason === 'string'
          ? ((p as Record<string, unknown>).reason as string).trim().slice(0, 200)
          : ''
        if (pid && candidateIds.has(pid)) {
          resourceIds.push(pid)
          const title = candidates.find((c) => c.r.id === pid)!.r.title
          answer += `• ${title} — ${why || 'a strong match for your current signals'}\n`
        }
      }
      if (resourceIds.length === 0) throw new Error('no valid picks')
      answer = answer.trim()
    } catch {
      fallback = true
      const top = candidates.slice(0, 3)
      resourceIds = top.map((c) => c.r.id)
      answer = top
        .map((c) => `• ${c.r.title} — ${c.tag ?? 'matches your current learning signals'}`)
        .join('\n')
    }

    return { ok: true, mode, answer, resourceIds, fallback, aiBadge: AI_BADGE, disclaimer: AI_DISCLAIMER }
  }

  if (mode === 'key-points') {
    const ids = (body.resourceIds ?? []).filter((x) => typeof x === 'string')
    const r = ids.length > 0 ? await resolveAny(ids[0]!) : null
    if (!r) throw new Error('INVALID_RESOURCE')

    let answer = ''
    let fallback = false
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You write ORIGINAL study pointers about a learning resource, based ONLY on the metadata we provide. Give 3–4 points: what the resource covers and how a medical student should use it. Never invent specifics about the content that are not in the metadata. No chain-of-thought — conclusions only. 80 words or fewer.\n\n${JSON_RULE} Shape: {"points":["<point>","<point>","<point>"]}`,
          },
          { role: 'user', content: `RESOURCE METADATA: ${JSON.stringify(metaForAi(r))}` },
        ],
        temperature: 0.3,
        maxTokens: 500,
      })
      const content = completion.choices[0]?.message?.content ?? ''
      const parsed = parseLooseJson(content)
      const points = parsed && Array.isArray(parsed.points)
        ? parsed.points.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 4)
        : []
      if (points.length === 0) throw new Error('no points')
      answer = points.map((p) => `• ${p.trim().slice(0, 200)}`).join('\n')
    } catch {
      fallback = true
      answer = [
        `• ${r.description}`,
        `• Format: ${r.kind.replace('-', ' ')} — plan a focused sitting and take your own notes as you go.`,
        `• Difficulty tier ${r.difficulty} of 3; pair it with questions on the same topic to test what stuck.`,
        `• Access: ${accessHonesty(r)}${r.ownership === 'external' ? ' — open the original source to study the material itself.' : '.'}`,
      ].join('\n')
    }

    return { ok: true, mode, answer, resourceIds: [r.id], fallback, aiBadge: AI_BADGE, disclaimer: AI_DISCLAIMER }
  }

  // compare
  const ids = (body.resourceIds ?? []).filter((x) => typeof x === 'string').slice(0, 2)
  const [a, b] = await Promise.all([ids[0] ? resolveAny(ids[0]) : null, ids[1] ? resolveAny(ids[1]) : null])
  if (!a || !b || a.id === b.id) throw new Error('INVALID_RESOURCES')

  let answer = ''
  let fallback = false
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You compare two learning resources for a medical student using ONLY the metadata provided: 2–3 sentences covering type/format, depth, access or cost honestly, and who each resource fits best. Never invent content details. No chain-of-thought — conclusions only.\n\n${JSON_RULE} Shape: {"answer":"<comparison>"}`,
        },
        { role: 'user', content: `RESOURCE A: ${JSON.stringify(metaForAi(a))}\n\nRESOURCE B: ${JSON.stringify(metaForAi(b))}` },
      ],
      temperature: 0.3,
      maxTokens: 500,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    const text = parsed && typeof parsed.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : ''
    if (!text) throw new Error('no answer')
    answer = text.slice(0, 900)
  } catch {
    fallback = true
    answer = `${a.title} is ${accessHonesty(a)} and works as ${a.kind === b.kind ? `a ${a.kind.replace('-', ' ')} option` : `a ${a.kind.replace('-', ' ')}`}; ${b.title} is ${accessHonesty(b)} and works as a ${b.kind.replace('-', ' ')}. If you want guided, in-platform structure start with the MEDULA-owned option; if you want the source material itself, follow the external link and study from the original. Both map to the same curriculum subjects, so pick by how you like to study and what you can access today.`
  }

  return { ok: true, mode, answer, resourceIds: [a.id, b.id], fallback, aiBadge: AI_BADGE, disclaimer: AI_DISCLAIMER }
}
