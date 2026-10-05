import { db } from '@/lib/db'
import { DAY, estimatedRecall } from '@/lib/engine'
import { ADAPTIVE_MODES } from '@/lib/types'
import type { AdaptiveConfig, AdaptiveMode, AdaptiveQuestion } from '@/lib/types'

// ─── ADAPTIVE MCQ ENGINE (PRODUCT 04, server-side) ─────────────────────────
// Deterministic, MEASURED selection — no LLM anywhere in this file. The model
// never chooses questions; it only answers on-demand "explain/similar" actions
// in /api/adaptive/ai. The engine never exposes its scoring math — only short
// honest "whyThis" notes built from the weights that actually won.

// Weights (fixed, documented for maintainers — never surfaced to students):
//   weakness      0.30  (1 − mastery/100 of the linked concept)
//   recallRisk    0.25  (1 − live Ebbinghaus recall of the concept)
//   errorHistory  0.20  (recent wrongs on the concept, capped)
//   examRelevance 0.15  (concept exam yield / 5)
//   novelty       0.10  (never-attempted bonus; −0.35 penalty if seen <7d,
//                        except weakness mode where a retry is the point)
//   focusBoost    +0.25 (after a miss: candidates on the same or an adjacent topic)

const IMG_STEM_RE = /(X-ray|x-ray|shown in|figure|endoscop|ECG strip|scan|photograph)/i
const RECENT_WRONG_DAYS = 30
const RECENT_SEEN_DAYS = 7

export function startTargetFor(mode: AdaptiveMode): number {
  return mode === 'rapid' ? 1 : 2 // weakness starts at 2, rapid at 1, everything else 2
}

// ── Session state (stored in AdaptiveSession.state Json) ────────────────────
export interface SessionAnswerEntry {
  questionId: string
  correct: boolean
  timeMs: number
  errorType?: string | null
}

export interface SessionState {
  queue: string[] // unanswered question ids, head = next up
  answered: SessionAnswerEntry[]
  markedIds: string[]
  missedConcepts: string[] // concepts missed this session (drives focus lock)
  target: number // current difficulty staircase target 1..3
  focus: { conceptId: string; topicId: string } | null // one-shot focus lock
}

export function parseSessionState(raw: unknown): SessionState {
  const s = (raw ?? {}) as Partial<SessionState>
  return {
    queue: Array.isArray(s.queue) ? s.queue.filter((x): x is string => typeof x === 'string') : [],
    answered: Array.isArray(s.answered) ? (s.answered as SessionAnswerEntry[]) : [],
    markedIds: Array.isArray(s.markedIds) ? (s.markedIds as string[]) : [],
    missedConcepts: Array.isArray(s.missedConcepts) ? (s.missedConcepts as string[]) : [],
    target: typeof s.target === 'number' ? s.target : 2,
    focus: s.focus && typeof s.focus === 'object' ? (s.focus as SessionState['focus']) : null,
  }
}

// ── Difficulty staircase: every 3 answered, ≥80% steps up, ≤40% steps down ──
export interface StairStep {
  direction: 'up' | 'down' | null
  blockCorrect: number
  blockSize: number
}

export function recomputeTarget(entries: SessionAnswerEntry[], start: number): { target: number; step: StairStep } {
  let target = start
  let last: StairStep = { direction: null, blockCorrect: 0, blockSize: 0 }
  for (let i = 0; i + 3 <= entries.length; i += 3) {
    const block = entries.slice(i, i + 3)
    const c = block.filter((b) => b.correct).length
    const acc = c / 3
    if (acc >= 0.8 && target < 3) target += 1
    else if (acc <= 0.4 && target > 1) target -= 1
    last = { direction: acc >= 0.8 ? 'up' : acc <= 0.4 ? 'down' : null, blockCorrect: c, blockSize: 3 }
  }
  return { target: Math.min(3, Math.max(1, target)), step: last }
}

// ── Loaded context (one profile read, reused across every scoring pass) ─────
interface StateLite { conceptId: string; score: number; stability: number; estRecall: number; status: string; attemptCount: number; lastReviewed: Date | null }

interface AttemptLite { questionId: string; correct: boolean; createdAt: Date; conceptId: string | null }

interface EngineContext {
  states: Map<string, StateLite> // by conceptId
  lastAttemptByQuestion: Map<string, Date> // questionId → most recent attempt
  recentWrongsByConcept: Map<string, number> // conceptId → wrongs in last 30d
  conceptTopic: Map<string, string> // conceptId → topicId
  topicName: Map<string, string> // topicId → name
  adjacentTopics: Map<string, Set<string>> // topicId → neighbor topicIds via ConceptEdge (both directions)
  conceptExamRelevance: Map<string, number>
  conceptName: Map<string, string>
  edgesFrom: Map<string, Set<string>> // fromId → toIds (for concept-filter expansion)
}

async function loadContext(): Promise<EngineContext> {
  const [states, attempts, edges, concepts] = await Promise.all([
    db.knowledgeState.findMany(),
    db.questionAttempt.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3000, // generous window: recency maps only need the latest per question
      select: { questionId: true, correct: true, createdAt: true, question: { select: { conceptId: true } } },
    }),
    db.conceptEdge.findMany({ select: { fromId: true, toId: true } }),
    db.concept.findMany({ select: { id: true, topicId: true, examRelevance: true, name: true } }),
  ])

  const statesMap = new Map<string, StateLite>()
  for (const s of states) statesMap.set(s.conceptId, s)

  const now = Date.now()
  const lastAttemptByQuestion = new Map<string, Date>()
  const recentWrongsByConcept = new Map<string, number>()
  for (const a of attempts) {
    if (!lastAttemptByQuestion.has(a.questionId)) lastAttemptByQuestion.set(a.questionId, a.createdAt)
    const conceptId = a.question.conceptId
    if (!a.correct && conceptId && now - a.createdAt.getTime() <= RECENT_WRONG_DAYS * DAY) {
      recentWrongsByConcept.set(conceptId, (recentWrongsByConcept.get(conceptId) ?? 0) + 1)
    }
  }

  const conceptTopic = new Map<string, string>()
  const topicName = new Map<string, string>()
  const conceptExamRelevance = new Map<string, number>()
  const conceptName = new Map<string, string>()
  for (const c of concepts) {
    conceptTopic.set(c.id, c.topicId)
    conceptExamRelevance.set(c.id, c.examRelevance)
    conceptName.set(c.id, c.name)
  }
  const topicRows = await db.topic.findMany({ select: { id: true, name: true } })
  for (const t of topicRows) topicName.set(t.id, t.name)

  const adjacentTopics = new Map<string, Set<string>>()
  for (const e of edges) {
    const fromTopic = conceptTopic.get(e.fromId)
    const toTopic = conceptTopic.get(e.toId)
    if (!fromTopic || !toTopic || fromTopic === toTopic) continue
    if (!adjacentTopics.has(fromTopic)) adjacentTopics.set(fromTopic, new Set())
    if (!adjacentTopics.has(toTopic)) adjacentTopics.set(toTopic, new Set())
    adjacentTopics.get(fromTopic)!.add(toTopic)
    adjacentTopics.get(toTopic)!.add(fromTopic)
  }

  const edgesFrom = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!edgesFrom.has(e.fromId)) edgesFrom.set(e.fromId, new Set())
    edgesFrom.get(e.fromId)!.add(e.toId)
  }

  return { states: statesMap, lastAttemptByQuestion, recentWrongsByConcept, conceptTopic, topicName, adjacentTopics, conceptExamRelevance, conceptName, edgesFrom }
}

// ── Question rows + shape helpers ───────────────────────────────────────────
interface QRow {
  id: string; stem: string; options: unknown; answer: string
  difficulty: number; qtype: string; subjectCode: string; system: string; topicId: string | null; conceptId: string | null
  tags: unknown
  imageUrl?: string | null
  optionNotes?: unknown
  concept: { name: string } | null
}

async function loadRows(): Promise<QRow[]> {
  const rows = await db.question.findMany({
    include: { concept: { select: { name: true } } },
  })
  return rows as unknown as QRow[]
}

function tagsOf(q: QRow): string[] {
  return Array.isArray(q.tags) ? (q.tags as string[]) : []
}

function isPyq(q: QRow): boolean { return tagsOf(q).includes('pyq-pattern') }
function isImage(q: QRow): boolean { return tagsOf(q).includes('image-based') || IMG_STEM_RE.test(q.stem) }

function optionNotesOf(q: QRow): Record<string, string> | undefined {
  if (!q.optionNotes || typeof q.optionNotes !== 'object' || Array.isArray(q.optionNotes)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(q.optionNotes as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function toAdaptiveQuestion(q: QRow, whyThis?: string): AdaptiveQuestion {
  return {
    id: q.id, stem: q.stem,
    options: (q.options as { id: string; text: string }[]),
    difficulty: q.difficulty, qtype: q.qtype, subjectCode: q.subjectCode, system: q.system,
    conceptId: q.conceptId ?? undefined,
    conceptName: q.concept?.name ?? undefined,
    whyThis,
    pyqPattern: isPyq(q) || undefined,
    imageBased: isImage(q) || undefined,
    imageUrl: q.imageUrl ?? undefined,
    optionNotes: optionNotesOf(q),
  }
}

// Flag helper for rows re-served outside a full selection pass (e.g. /next resume).
export function flagsFor(q: { tags: unknown; stem: string }): { pyqPattern?: boolean; imageBased?: boolean } {
  const tags = Array.isArray(q.tags) ? (q.tags as string[]) : []
  return {
    pyqPattern: tags.includes('pyq-pattern') || undefined,
    imageBased: tags.includes('image-based') || IMG_STEM_RE.test(q.stem) || undefined,
  }
}

// ── Config filters (compose with every mode) ────────────────────────────────
function applyConfigFilters(rows: QRow[], config: AdaptiveConfig, ctx: EngineContext): QRow[] {
  let pool = rows
  if (config.subjectCode) pool = pool.filter((q) => q.subjectCode === config.subjectCode)
  if (config.system) pool = pool.filter((q) => q.system === config.system)
  if (config.conceptId) {
    const cid = config.conceptId
    const related = ctx.edgesFrom.get(cid) ?? new Set<string>()
    pool = pool.filter((q) => q.conceptId === cid || (q.conceptId !== null && related.has(q.conceptId)))
  }
  if (config.topicId) {
    // Mirror the /api/questions topic resolution: direct topicId string match OR
    // the question's concept belongs to the topic (Question.topicId is unkeyed,
    // so the concept relation is the honest source of truth).
    const tid = config.topicId
    pool = pool.filter((q) => q.topicId === tid || (q.conceptId !== null && ctx.conceptTopic.get(q.conceptId) === tid))
  }
  if (typeof config.difficulty === 'number') pool = pool.filter((q) => q.difficulty === config.difficulty)
  return pool
}

function modePool(rows: QRow[], mode: AdaptiveMode, ctx: EngineContext, profileId: string, wrongConcepts: Set<string>): QRow[] {
  switch (mode) {
    case 'pyq':
      return rows.filter(isPyq)
    case 'image':
      return rows.filter(isImage)
    case 'clinical':
      return rows.filter((q) => q.qtype === 'vignette' || q.qtype === 'integrated')
    case 'rapid': {
      // Rapid-fire questions first, topped up with short stems (<230 chars).
      const rapid = rows.filter((q) => q.qtype === 'rapid')
      const have = new Set(rapid.map((q) => q.id))
      const shortStems = rows.filter((q) => !have.has(q.id) && q.stem.length < 230)
      return [...rapid, ...shortStems]
    }
    case 'weakness': {
      // Weak/unstable KnowledgeStates OR concepts with ≥1 recent wrong attempt.
      return rows.filter((q) => q.conceptId !== null && (ctx.states.get(q.conceptId)?.status === 'weak' || ctx.states.get(q.conceptId)?.status === 'unstable' || wrongConcepts.has(q.conceptId)))
    }
    default:
      // 'adaptive' | 'ai-adaptive' | 'exam' | 'custom' → full (filtered) pool
      return rows
  }
}

// Weak/unstable concept ids + concepts with a recent wrong attempt (for the
// weakness pool and the home counts). Exported for the measured home payload.
export async function weaknessConceptIds(profileId: string): Promise<{ weak: Set<string>; recentWrong: Set<string> }> {
  const [states, attempts] = await Promise.all([
    db.knowledgeState.findMany({ where: { profileId } }),
    db.questionAttempt.findMany({
      where: { profileId, correct: false, createdAt: { gte: new Date(Date.now() - RECENT_WRONG_DAYS * DAY) } },
      select: { question: { select: { conceptId: true } } },
    }),
  ])
  const weak = new Set(states.filter((s) => s.status === 'weak' || s.status === 'unstable').map((s) => s.conceptId))
  const recentWrong = new Set(attempts.map((a) => a.question.conceptId).filter((c): c is string => Boolean(c)))
  return { weak, recentWrong }
}

// ── Scoring ──────────────────────────────────────────────────────────────────
interface Scored {
  q: QRow
  score: number
  focusApplied: boolean
  recentWrongs: number
  mastery: number | null // null = never attempted concept
  recall: number | null
  fresh: boolean // question never attempted by this profile
  examRelevance: number
}

function liveRecall(s: StateLite | undefined): number {
  if (!s || s.attemptCount === 0 || !s.lastReviewed) return 1 // nothing decayed yet
  const days = (Date.now() - s.lastReviewed.getTime()) / DAY
  if (days <= 0) return 1
  return estimatedRecall(days, s.stability)
}

function scoreQuestion(q: QRow, mode: AdaptiveMode, ctx: EngineContext, focus: SessionState['focus'], wrongConcepts: Set<string>): Scored {
  const state = q.conceptId ? ctx.states.get(q.conceptId) : undefined
  const mastery = state && state.attemptCount > 0 ? state.score : null
  const weakness = mastery === null ? 1 : 1 - mastery / 100
  const recall = state && state.attemptCount > 0 ? liveRecall(state) : null
  const recallRisk = recall === null ? 0 : 1 - recall
  const recentWrongs = q.conceptId ? (ctx.recentWrongsByConcept.get(q.conceptId) ?? 0) : 0
  const errorHistory = Math.min(1, recentWrongs / 3)
  const examRelevance = q.conceptId ? (ctx.conceptExamRelevance.get(q.conceptId) ?? 3) : 3
  const lastAttempt = ctx.lastAttemptByQuestion.get(q.id)
  const fresh = !lastAttempt

  let novelty: number
  if (fresh) novelty = 1
  else if (Date.now() - lastAttempt!.getTime() <= RECENT_SEEN_DAYS * DAY) {
    // Weakness mode flips the freshness penalty into a retry boost — a recently
    // missed concept is exactly what that mode should re-serve.
    novelty = mode === 'weakness' && q.conceptId !== null && (wrongConcepts.has(q.conceptId) || recentWrongs > 0) ? 1 : -0.35
  } else novelty = 0.3

  let score = weakness * 0.30 + recallRisk * 0.25 + errorHistory * 0.20 + (examRelevance / 5) * 0.15 + novelty * 0.10

  // Focus lock: after a miss on concept C, boost candidates on C's topic or an
  // adjacent topic (+0.25) so the run stays coherent instead of topic-hopping.
  let focusApplied = false
  if (focus) {
    const topicId = q.conceptId ? ctx.conceptTopic.get(q.conceptId) : null
    if (topicId && (topicId === focus.topicId || (ctx.adjacentTopics.get(focus.topicId)?.has(topicId) ?? false))) {
      score += 0.25
      focusApplied = true
    }
  }

  return { q, score, focusApplied, recentWrongs, mastery, recall, fresh, examRelevance }
}

// ── whyThis: one honest mechanical reason from the weights that won ─────────
function whyThisFor(s: Scored, ctx: EngineContext, stair: StairStep | null, mode: AdaptiveMode): string {
  if (s.focusApplied) {
    const topicId = s.q.conceptId ? ctx.conceptTopic.get(s.q.conceptId) : null
    const topicName = topicId ? ctx.topicName.get(topicId) : null
    if (topicName) return `Stays on ${topicName} after that miss`
  }
  if (stair?.direction === 'up' && mode !== 'exam') {
    return `You're ${stair.blockCorrect}/${stair.blockSize} at this level — stepping up`
  }
  if (stair?.direction === 'down' && mode !== 'exam') {
    return 'Dropping a level to rebuild accuracy first'
  }
  if (s.recentWrongs >= 2) return `Missed ${s.recentWrongs}× recently`
  if (s.mastery !== null && s.mastery <= 45) return `Mastery ${Math.round(s.mastery)}% — due for repair`
  if (s.recall !== null && s.recall < 0.55) return `Estimated recall ${Math.round(s.recall * 100)}% — due for reinforcement`
  if (s.fresh) return s.q.conceptId ? 'New concept — first exposure' : 'Fresh question — first look'
  if (isPyq(s.q)) return 'Classic repeated exam theme'
  if (s.examRelevance >= 4) return 'High-yield exam topic'
  return 'Balanced pick for this run'
}

function focusNoteFor(s: Scored, ctx: EngineContext): string | undefined {
  if (!s.focusApplied) return undefined
  const topicId = s.q.conceptId ? ctx.conceptTopic.get(s.q.conceptId) : null
  const topicName = topicId ? ctx.topicName.get(topicId) : null
  return topicName ? `Stays on ${topicName} — one more angle` : undefined
}

// ── Ordering ────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Prefer candidates at the staircase target, then by score. Stable on the
// pre-shuffled array so equal keys keep their random spread.
function orderAtTarget<T>(items: T[], difficultyOf: (t: T) => number, target: number): T[] {
  return items
    .map((item, i) => ({ item, i, dist: Math.abs(difficultyOf(item) - target) }))
    .sort((a, b) => a.dist - b.dist || a.i - b.i)
    .map((x) => x.item)
}

// NEET-weight-proportional sampling across subjects (mirrors the mix=high-yield
// logic in /api/questions) — used by exam mode.
async function examWeightedSample(pool: QRow[], count: number): Promise<QRow[]> {
  const subjects = await db.subject.findMany()
  const weightByCode = new Map(subjects.map((s) => [s.code, Math.max(1, s.neetWeight)]))
  const buckets = new Map<string, QRow[]>()
  for (const q of shuffle([...pool])) {
    const arr = buckets.get(q.subjectCode) ?? []
    arr.push(q)
    buckets.set(q.subjectCode, arr)
  }
  const picked: QRow[] = []
  while (picked.length < count) {
    const remaining = [...buckets.entries()].filter(([, arr]) => arr.length > 0)
    if (!remaining.length) break
    const totalWeight = remaining.reduce((a, [code, arr]) => a + (weightByCode.get(code) ?? 1) * arr.length, 0)
    let ticket = Math.random() * totalWeight
    let chosen = remaining[0]
    for (const entry of remaining) {
      ticket -= (weightByCode.get(entry[0]) ?? 1) * entry[1].length
      if (ticket <= 0) { chosen = entry; break }
    }
    const [code, arr] = chosen
    picked.push(arr.pop()!)
    if (arr.length === 0) buckets.delete(code)
  }
  return picked
}

// ── Mode metadata ────────────────────────────────────────────────────────────
function modeLabel(mode: AdaptiveMode): string {
  return ADAPTIVE_MODES.find((m) => m.id === mode)?.label ?? 'Custom'
}
function modeBlurb(mode: AdaptiveMode): string {
  return ADAPTIVE_MODES.find((m) => m.id === mode)?.blurb ?? 'Your own paper, your filters'
}

// ── PUBLIC: initial selection for a new session ─────────────────────────────
export interface AdaptiveSelection {
  questions: AdaptiveQuestion[]
  label: string
  blurb: string
  timed: boolean
  secondsPerQuestion?: number
  totalSeconds?: number
  target: number
}

export async function selectAdaptiveQuestions(profileId: string, config: AdaptiveConfig): Promise<AdaptiveSelection> {
  const mode = config.mode
  const count = Math.min(100, Math.max(5, Math.round(config.count)))
  const target = startTargetFor(mode)
  const timed = mode === 'rapid' || mode === 'exam'
  const secondsPerQuestion = mode === 'rapid' ? 45 : undefined
  const totalSeconds = mode === 'exam' ? ((config.minutes ?? Math.round((count * 65) / 60)) * 60) : undefined

  const label = `${modeLabel(mode)} · ${count} question${count === 1 ? '' : 's'}`
  let blurb = `${modeBlurb(mode)}. Starts at difficulty ${target}`
  if (mode === 'exam' && totalSeconds) blurb += ` · ${Math.round(totalSeconds / 60)} min total budget`
  if (mode === 'rapid') blurb += ' · 45 s per question'
  blurb += '.'

  const [ctx, rows] = await Promise.all([loadContext(), loadRows()])
  const { weak, recentWrong } = await weaknessConceptIds(profileId)
  const wrongConcepts = new Set([...weak, ...recentWrong])

  const filtered = applyConfigFilters(rows, config, ctx)
  const pool = modePool(filtered, mode, ctx, profileId, wrongConcepts)
  if (pool.length === 0) return { questions: [], label, blurb, timed, secondsPerQuestion, totalSeconds, target }

  let picked: QRow[]
  if (mode === 'exam') {
    picked = await examWeightedSample(pool, Math.min(count, pool.length))
  } else if (mode === 'rapid') {
    // Rapid-fire first (shuffled), topped up with short-stem items — the
    // ordering IS the mode. Scoring still feeds whyThis below.
    const rapid = shuffle(pool.filter((q) => q.qtype === 'rapid'))
    const have = new Set(rapid.map((q) => q.id))
    const shortStems = shuffle(pool.filter((q) => !have.has(q.id) && q.stem.length < 230))
    picked = [...rapid, ...shortStems].slice(0, Math.min(count, pool.length))
  } else {
    const scored = shuffle(pool).map((q) => scoreQuestion(q, mode, ctx, null, wrongConcepts))
    const ordered = scored
      .map((s, i) => ({ s, i }))
      .sort((a, b) => Math.abs(a.s.q.difficulty - target) - Math.abs(b.s.q.difficulty - target) || b.s.score - a.s.score || a.i - b.i)
      .map((x) => x.s)
    picked = ordered.slice(0, Math.min(count, pool.length)).map((s) => s.q)
  }

  const questions = picked.map((q) => {
    const s = scoreQuestion(q, mode, ctx, null, wrongConcepts)
    return toAdaptiveQuestion(q, whyThisFor(s, ctx, null, mode))
  })

  return { questions, label, blurb, timed, secondsPerQuestion, totalSeconds, target }
}

// ── PUBLIC: ai-adaptive re-selection + staircase recomputation ──────────────
// Returns the next question from the live pool (excluding everything already
// served), with the current difficulty target applied and any active focus
// lock honored. question === null when the pool is exhausted.
export interface NextPick {
  question: AdaptiveQuestion | null
  focusNote?: string
  target: number
}

export async function selectNextQuestion(
  session: { mode: string; config: unknown; state: unknown },
  profileId: string,
): Promise<NextPick> {
  const config = session.config as AdaptiveConfig
  const mode = config.mode
  const state = parseSessionState(session.state)
  const { target, step } = recomputeTarget(state.answered, startTargetFor(mode))
  const stair = step

  const [ctx, rows] = await Promise.all([loadContext(), loadRows()])
  const { weak, recentWrong } = await weaknessConceptIds(profileId)
  const wrongConcepts = new Set([...weak, ...recentWrong])

  const excluded = new Set<string>([...state.answered.map((a) => a.questionId), ...state.queue])
  const filtered = applyConfigFilters(rows, config, ctx)
  const pool = modePool(filtered, mode, ctx, profileId, wrongConcepts).filter((q) => !excluded.has(q.id))
  if (pool.length === 0) return { question: null, target }

  const scored = pool.map((q) => scoreQuestion(q, mode, ctx, state.focus, wrongConcepts))
  const best = scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Math.abs(a.s.q.difficulty - target) - Math.abs(b.s.q.difficulty - target) || b.s.score - a.s.score || a.i - b.i)[0].s

  return {
    question: toAdaptiveQuestion(best.q, whyThisFor(best, ctx, stair, mode)),
    focusNote: focusNoteFor(best, ctx),
    target,
  }
}

// ── PUBLIC: static-mode queue reorder (staircase + focus) ───────────────────
// After each answer the remaining queue is re-ordered: focus-locked topics
// first (same topic OR adjacent via ConceptEdge), then candidates at the
// recomputed difficulty target, then original (score-ordered) position.
// Returns the focus note when the new head honors the lock.
export async function reorderRemaining(
  queue: string[],
  answered: SessionAnswerEntry[],
  startTarget: number,
  focus: SessionState['focus'],
): Promise<{ queue: string[]; focusNote?: string; target: number }> {
  const { target } = recomputeTarget(answered, startTarget)
  if (queue.length === 0) return { queue, target }

  const [ctx, rows] = await Promise.all([loadContext(), loadRows()])
  const byId = new Map(rows.map((r) => [r.id, r]))
  const indexed = queue
    .filter((id) => byId.has(id))
    .map((id, i) => {
      const q = byId.get(id)!
      const topicId = q.conceptId ? ctx.conceptTopic.get(q.conceptId) ?? null : null
      const focusHit = focus && topicId && (topicId === focus.topicId || (ctx.adjacentTopics.get(focus.topicId)?.has(topicId) ?? false)) ? 0 : 1
      return { id, i, focusHit, dist: Math.abs(q.difficulty - target) }
    })
    .sort((a, b) => a.focusHit - b.focusHit || a.dist - b.dist || a.i - b.i)
  const ordered = indexed.map((x) => x.id)

  let focusNote: string | undefined
  if (focus && ordered.length > 0) {
    const head = byId.get(ordered[0])
    const headTopic = head?.conceptId ? ctx.conceptTopic.get(head.conceptId) ?? null : null
    if (headTopic && (headTopic === focus.topicId || (ctx.adjacentTopics.get(focus.topicId)?.has(headTopic) ?? false))) {
      const topicName = ctx.topicName.get(focus.topicId)
      focusNote = topicName ? `Stays on ${topicName} — one more angle` : 'Staying on this topic for one more angle'
    }
  }
  return { queue: ordered, focusNote, target }
}

// ── PUBLIC: measured pool counts for the adaptive home payload ──────────────
export async function measureAdaptiveCounts(): Promise<{ pyqPattern: number; imageBased: number; clinical: number; rapid: number; weaknessQuestions: number }> {
  const [rows, ctx] = await Promise.all([loadRows(), loadContext()])
  const pyq = rows.filter(isPyq).length
  const img = rows.filter(isImage).length
  const clinical = rows.filter((q) => q.qtype === 'vignette' || q.qtype === 'integrated').length
  const rapid = rows.filter((q) => q.qtype === 'rapid').length
  const weakSet = new Set([...ctx.states.values()].filter((s) => s.status === 'weak' || s.status === 'unstable').map((s) => s.conceptId))
  const wrongSet = new Set([...ctx.recentWrongsByConcept.keys()])
  const weakness = new Set(rows.filter((q) => q.conceptId && (weakSet.has(q.conceptId) || wrongSet.has(q.conceptId))).map((q) => q.id))
  return { pyqPattern: pyq, imageBased: img, clinical, rapid, weaknessQuestions: weakness.size }
}
