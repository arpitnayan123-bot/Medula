import { db } from '@/lib/db'
import { DAY, estimatedRecall } from '@/lib/engine'
import { weaknessConceptIds } from '@/lib/adaptive'
import { recordAttempt } from '@/lib/attempt-record'
import { EXAM_MODES } from '@/lib/types'
import type { Prisma } from '@prisma/client'
import type {
  ExamAnalysis, ExamConfig, ExamHome, ExamHistoryPayload, ExamMode,
  ExamModeInfo, ExamQuestion, ExamReviewPayload, ExamReviewQuestion, ExamTrendPoint,
} from '@/lib/types'

// ─── EXAM ENGINE (PRODUCT 12, server-side) ──────────────────────────────────
// Deterministic, measured — NO LLM anywhere in this file. Paper generation is
// rule-based from the platform's own bank; grading is +4/−1 arithmetic; the
// analysis is computed from the attempt's own answer sheet + all-time attempt
// data. The answer key (answer/explanation/teaching/optionNotes) never leaves
// the server before submit.

export const CORRECT_MARKS = 4
export const WRONG_PENALTY = 1
export const EXAM_PACE_SEC = 63 // NEET-PG-style pace benchmark (~200 Q / 210 min)

const IMG_STEM_RE = /(X-ray|x-ray|shown in|figure|endoscop|ECG strip|scan|photograph)/i
const RECENT_WRONG_DAYS = 30
const RECENT_SEEN_DAYS = 7

export function modeInfo(mode: ExamMode): ExamModeInfo {
  return EXAM_MODES.find((m) => m.id === mode) ?? EXAM_MODES[0]
}

export function clampCount(n: number | undefined, mode: ExamMode): number {
  const fallback = modeInfo(mode).preset.count
  const raw = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback
  return Math.min(100, Math.max(5, raw))
}

export function clampMinutes(n: number | undefined, mode: ExamMode): number {
  const fallback = modeInfo(mode).preset.minutes
  const raw = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback
  return Math.min(240, Math.max(3, raw))
}

// ── Answer-sheet state (stored in ExamAttempt.responses Json) ────────────────
export interface ExamResponseEntry {
  questionId: string
  history: (string | null)[] // option ids in pick order; null = cleared; last = current
  timeMs: number // accumulated time on this question
  marked: boolean
  at: string // first pick time
}

export function parseResponses(raw: unknown): ExamResponseEntry[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: ExamResponseEntry[] = []
  for (const r of arr) {
    const e = r as Partial<ExamResponseEntry>
    if (!e || typeof e !== 'object' || typeof e.questionId !== 'string') continue
    const history = Array.isArray(e.history)
      ? e.history.filter((x): x is string | null => x === null || typeof x === 'string')
      : []
    out.push({
      questionId: e.questionId,
      history,
      timeMs: typeof e.timeMs === 'number' && Number.isFinite(e.timeMs) ? Math.max(0, Math.round(e.timeMs)) : 0,
      marked: e.marked === true,
      at: typeof e.at === 'string' ? e.at : new Date().toISOString(),
    })
  }
  return out
}

export function currentPick(entry: ExamResponseEntry): string | null {
  const last = entry.history[entry.history.length - 1]
  return last === undefined ? null : last
}

export function serializeResponses(entries: ExamResponseEntry[]): Prisma.InputJsonValue {
  return entries as unknown as Prisma.InputJsonValue
}

export interface ExamEvent {
  kind: 'start' | 'answer' | 'change' | 'clear' | 'mark' | 'unmark' | 'submit' | 'auto-submit' | 'resume' | 'abandon'
  questionId?: string
  at: string
}

export function parseEvents(raw: unknown): ExamEvent[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr.filter((e): e is ExamEvent => !!e && typeof e === 'object' && typeof (e as ExamEvent).kind === 'string')
}

export function appendEvent(raw: unknown, ev: ExamEvent): Prisma.InputJsonValue {
  const events = parseEvents(raw)
  events.push(ev)
  return events.slice(-500) as unknown as Prisma.InputJsonValue // bounded — exam sessions never need more
}

// ── Question rows + flags (same conventions as the adaptive engine) ─────────
interface QRow {
  id: string; stem: string; options: unknown; answer: string
  explanation: string; teaching: string
  difficulty: number; qtype: string; subjectCode: string; system: string
  topicId: string | null; conceptId: string | null
  tags: unknown; imageUrl: string | null; optionNotes: unknown
  concept: { name: string; topicId: string | null } | null
}

async function loadRows(): Promise<QRow[]> {
  const rows = await db.question.findMany({
    include: { concept: { select: { name: true, topicId: true } } },
  })
  return rows as unknown as QRow[]
}

/** The honest topic of a question: its own topicId, else its concept's. */
function topicIdOf(q: QRow): string | null {
  return q.topicId ?? q.concept?.topicId ?? null
}

function tagsOf(q: QRow): string[] {
  return Array.isArray(q.tags) ? (q.tags as string[]) : []
}
function isPyq(q: QRow): boolean { return tagsOf(q).includes('pyq-pattern') }
function isImage(q: QRow): boolean { return tagsOf(q).includes('image-based') || Boolean(q.imageUrl) || IMG_STEM_RE.test(q.stem) }
function isClinical(q: QRow): boolean { return q.qtype === 'vignette' || q.qtype === 'integrated' }
function isRapid(q: QRow): boolean { return q.qtype === 'rapid' || q.stem.length < 230 }

/** Client-safe projection — answer key stripped. */
function toExamQuestion(q: QRow): ExamQuestion {
  return {
    id: q.id,
    stem: q.stem,
    options: q.options as { id: string; text: string }[],
    difficulty: q.difficulty,
    subjectCode: q.subjectCode,
    system: q.system,
    conceptId: q.conceptId ?? undefined,
    conceptName: q.concept?.name ?? undefined,
    pyqPattern: isPyq(q) || undefined,
    imageBased: isImage(q) || undefined,
    imageUrl: q.imageUrl ?? undefined,
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** NEET-weight-proportional sampling across subjects (same logic as the
 *  adaptive engine's exam mode — mirrored here to keep that file frozen). */
async function examWeightedSample(pool: QRow[], count: number): Promise<QRow[]> {
  const subjects = await db.subject.findMany()
  const weightByCode = new Map(subjects.map((s) => [s.code, Math.max(1, s.neetWeight)]))
  const buckets = new Map<string, QRow[]>()
  for (const q of shuffle(pool)) {
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

interface StateLite { conceptId: string; score: number; stability: number; estRecall: number; attemptCount: number; lastReviewed: Date | null }

/** Weakness-ranked selection for the adaptive paper (same weight family as
 *  the adaptive engine; no staircase — an exam paper is fixed at start). */
async function adaptiveRanked(pool: QRow[], profileId: string, count: number): Promise<QRow[]> {
  const [states, concepts, attempts] = await Promise.all([
    db.knowledgeState.findMany({ where: { profileId } }),
    db.concept.findMany({ select: { id: true, examRelevance: true } }),
    db.questionAttempt.findMany({
      where: { profileId, createdAt: { gte: new Date(Date.now() - RECENT_WRONG_DAYS * DAY) } },
      select: { correct: true, question: { select: { conceptId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    }),
  ])
  const stateByConcept = new Map<string, StateLite>(
    states.map((s) => [s.conceptId, s as unknown as StateLite]),
  )
  const relevance = new Map(concepts.map((c) => [c.id, c.examRelevance]))
  const wrongs = new Map<string, number>()
  const seenQuestions = new Set<string>()
  for (const a of attempts) {
    if (!a.correct && a.question.conceptId) {
      wrongs.set(a.question.conceptId, (wrongs.get(a.question.conceptId) ?? 0) + 1)
    }
  }
  const priorAttempts = await db.questionAttempt.findMany({
    where: { profileId },
    select: { questionId: true },
    orderBy: { createdAt: 'desc' },
    take: 3000,
  })
  for (const a of priorAttempts) seenQuestions.add(a.questionId)

  const scored = shuffle(pool).map((q) => {
    const state = q.conceptId ? stateByConcept.get(q.conceptId) : undefined
    const mastery = state && state.attemptCount > 0 ? state.score : null
    const weakness = mastery === null ? 1 : 1 - mastery / 100
    let recallRisk = 0
    if (state && state.attemptCount > 0 && state.lastReviewed) {
      const days = (Date.now() - state.lastReviewed.getTime()) / DAY
      if (days > 0) recallRisk = 1 - estimatedRecall(days, state.stability)
    }
    const errorHistory = Math.min(1, (q.conceptId ? (wrongs.get(q.conceptId) ?? 0) : 0) / 3)
    const examRelevance = q.conceptId ? (relevance.get(q.conceptId) ?? 3) / 5 : 0.6
    const fresh = seenQuestions.has(q.id) ? 0 : 1
    const score = weakness * 0.35 + recallRisk * 0.25 + errorHistory * 0.20 + examRelevance * 0.10 + fresh * 0.10
    return { q, score: Math.round(score * 100) / 100 }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.min(count, scored.length)).map((s) => s.q)
}

// ── PUBLIC: paper generation ─────────────────────────────────────────────────
export interface GeneratedPaper {
  questionIds: string[]
  questions: ExamQuestion[]
  label: string
  minutes: number
  negativeMark: boolean
  note?: string
}

export async function generatePaper(profileId: string, config: ExamConfig): Promise<GeneratedPaper> {
  const mode = config.mode
  const info = modeInfo(mode)
  const negativeMark = config.negativeMark ?? info.preset.negativeMark
  const requested = clampCount(config.count, mode)
  const rows = await loadRows()

  // ── Config filters (custom/subject/topic/hand-off) ──
  let pool = rows
  if (mode === 'subject') {
    const codes = (config.subjectCodes ?? []).filter((c) => typeof c === 'string' && c.trim())
    if (codes.length) pool = pool.filter((q) => codes.includes(q.subjectCode))
  }
  if (mode === 'topic' || (mode === 'custom' && config.topicIds?.length)) {
    const tids = config.topicIds ?? []
    const conceptsByTopic = tids.length
      ? await db.concept.findMany({ where: { topicId: { in: tids } }, select: { id: true } })
      : []
    const conceptSet = new Set(conceptsByTopic.map((c) => c.id))
    pool = pool.filter((q) => {
      const tid = topicIdOf(q)
      return (tid && tids.includes(tid)) || (q.conceptId && conceptSet.has(q.conceptId))
    })
  }
  if (config.conceptId) {
    pool = pool.filter((q) => q.conceptId === config.conceptId)
  }
  if (mode === 'custom' && typeof config.difficulty === 'number') {
    pool = pool.filter((q) => q.difficulty === config.difficulty)
  }
  if (mode === 'custom' && config.subjectCodes?.length) {
    pool = pool.filter((q) => config.subjectCodes!.includes(q.subjectCode))
  }

  // ── Mode pools ──
  if (mode === 'pyq') pool = pool.filter(isPyq)
  if (mode === 'image') pool = pool.filter(isImage)
  if (mode === 'rapid') pool = pool.filter(isRapid)
  if (mode === 'weak') {
    const { weak, recentWrong } = await weaknessConceptIds(profileId)
    const weakSet = new Set([...weak, ...recentWrong])
    pool = pool.filter((q) => q.conceptId !== null && weakSet.has(q.conceptId))
  }

  let picked: QRow[]
  let note: string | undefined
  if (pool.length === 0) {
    return { questionIds: [], questions: [], label: '', minutes: clampMinutes(config.minutes, mode), negativeMark, note: 'No questions matched this test yet — the bank does not cover that combination. Try a wider filter.' }
  }

  switch (mode) {
    case 'full':
      picked = await examWeightedSample(pool, Math.min(requested, pool.length))
      break
    case 'adaptive':
      picked = await adaptiveRanked(pool, profileId, Math.min(requested, pool.length))
      break
    case 'weak':
      // Weakest first, but keep a mixed order so the paper still feels like a test.
      picked = shuffle(await adaptiveRanked(pool, profileId, Math.min(requested, pool.length)))
      break
    case 'rapid': {
      const rapid = shuffle(pool.filter((q) => q.qtype === 'rapid'))
      const have = new Set(rapid.map((q) => q.id))
      const shortStems = shuffle(pool.filter((q) => !have.has(q.id) && q.stem.length < 230))
      picked = [...rapid, ...shortStems].slice(0, Math.min(requested, pool.length))
      break
    }
    case 'custom': {
      // Source bias: questions matching the requested sources sort to the front
      // of the shuffle; the rest of the paper tops up so it never under-fills.
      const wants = config.sources ?? []
      const sourceHit = (q: QRow) =>
        (wants.includes('pyq') && isPyq(q)) ||
        (wants.includes('image') && isImage(q)) ||
        (wants.includes('clinical') && isClinical(q)) ||
        (wants.includes('rapid') && isRapid(q))
      const shuffled = shuffle(pool)
      const hits = shuffled.filter(sourceHit)
      const rest = shuffled.filter((q) => !sourceHit(q))
      picked = [...hits, ...rest].slice(0, Math.min(requested, pool.length))
      break
    }
    default:
      // subject | topic | pyq | image — weighted-shuffle keeps the mix honest
      picked = mode === 'subject' || mode === 'topic'
        ? shuffle(pool).slice(0, Math.min(requested, pool.length))
        : shuffle(pool).slice(0, Math.min(requested, pool.length))
  }

  if (picked.length < requested) {
    note = `Bank has ${picked.length} question${picked.length === 1 ? '' : 's'} for this combination — the paper uses all of them instead of ${requested}.`
  }

  // Subject label for subject tests
  let label = `${info.name} · ${picked.length} question${picked.length === 1 ? '' : 's'}`
  if (mode === 'subject' && config.subjectCodes?.length === 1) {
    const subject = await db.subject.findUnique({ where: { code: config.subjectCodes[0] } })
    if (subject) label = `${subject.name} Test · ${picked.length} questions`
  }
  if (mode === 'pyq') label = `PYQ Test · ${picked.length} questions`
  if (mode === 'weak') label = `Weak-Area Test · ${picked.length} questions`

  const minutes = clampMinutes(config.minutes, mode)
  return {
    questionIds: picked.map((q) => q.id),
    questions: picked.map(toExamQuestion),
    label,
    minutes,
    negativeMark,
    note,
  }
}

// ── PUBLIC: deterministic grading + analysis ────────────────────────────────
interface AttemptLike {
  id: string
  profileId: string
  mode: string
  label: string
  config: unknown
  questionIds: unknown
  responses: unknown
  events: unknown
  status: string
  total: number
  timeMs: number
  autoSubmitted: boolean
  startedAt: Date
}

export async function gradeAndAnalyze(
  attempt: AttemptLike,
  opts: { auto?: boolean; submittedAt?: Date },
): Promise<ExamAnalysis> {
  const profileId = attempt.profileId
  const questionIds = (Array.isArray(attempt.questionIds) ? attempt.questionIds : []).filter((x): x is string => typeof x === 'string')
  const responses = parseResponses(attempt.responses)
  const submittedAt = opts.submittedAt ?? new Date()

  const questions = questionIds.length
    ? await db.question.findMany({
        where: { id: { in: questionIds } },
        include: {
          concept: {
            select: {
              id: true, name: true, topicId: true,
              topic: { select: { id: true, name: true, subject: { select: { code: true, name: true } } } },
            },
          },
          subject: { select: { code: true, name: true } },
        },
      })
    : []
  const qById = new Map(questions.map((q) => [q.id, q] as const))
  const ordered = questionIds.map((id) => qById.get(id)).filter((q): q is NonNullable<typeof q> => Boolean(q))

  const attemptStartedAt = attempt.startedAt
  const negativeMark = (attempt.config as ExamConfig)?.negativeMark ?? modeInfo(attempt.mode as ExamMode).preset.negativeMark

  // ── Per-question results ──
  const responseByQ = new Map(responses.map((r) => [r.questionId, r] as const))
  let correct = 0
  let wrong = 0
  let score = 0
  const answeredIds: string[] = []
  const wrongRows: { questionId: string; timeMs: number; changedToWrong: boolean; conceptId: string | null }[] = []

  // All-time repeated misses BEFORE this test (measured, not double-counted)
  const priorWrongs = await db.questionAttempt.findMany({
    where: { profileId, correct: false, createdAt: { lt: attemptStartedAt }, question: { conceptId: { not: null } } },
    select: { question: { select: { conceptId: true, concept: { select: { id: true, name: true } } } } },
  })
  const priorWrongMap = new Map<string, { conceptName: string; misses: number }>()
  for (const a of priorWrongs) {
    const c = a.question.concept
    if (!c) continue
    const entry = priorWrongMap.get(c.id) ?? { conceptName: c.name, misses: 0 }
    entry.misses += 1
    priorWrongMap.set(c.id, entry)
  }
  const repeatedOffenders = new Map([...priorWrongMap.entries()].filter(([, v]) => v.misses >= 2))

  const subjectMap = new Map<string, { name: string; correct: number; wrong: number; unattempted: number; score: number; attempted: number }>()
  const topicMap = new Map<string, { name: string; subjectCode: string; topicId: string; correct: number; total: number }>()
  const conceptMap = new Map<string, { name: string; correct: number; total: number }>()
  const difficultyMap = new Map<number, { correct: number; total: number }>()
  let pyqAttempted = 0
  let pyqCorrect = 0
  let hasPyq = false
  let changedToWrong = 0
  let changedToRight = 0
  let careless = 0
  let conceptual = 0
  let repeatedThisTest = 0
  let timeSum = 0
  let answeredCount = 0
  const buckets = { fast: 0, exam: 0, slow: 0 }
  const weakPool = await weaknessConceptIds(profileId)
  const weakSet = new Set([...weakPool.weak, ...weakPool.recentWrong])
  let weakTouched = 0
  let weakCorrect = 0

  for (const q of ordered) {
    const resp = responseByQ.get(q.id)
    const pick = resp ? currentPick(resp) : null
    const d = difficultyMap.get(q.difficulty) ?? { correct: 0, total: 0 }
    d.total += 1
    difficultyMap.set(q.difficulty, d)

    const subjectCode = q.subjectCode
    const sEntry = subjectMap.get(subjectCode) ?? {
      name: q.subject?.name ?? subjectCode, correct: 0, wrong: 0, unattempted: 0, score: 0, attempted: 0,
    }

    if (isPyq(q)) { hasPyq = true }

    const isWeakPick = q.conceptId !== null && weakSet.has(q.conceptId)
    if (isWeakPick) weakTouched += 1

    if (!pick) {
      sEntry.unattempted += 1
      subjectMap.set(subjectCode, sEntry)
      continue
    }
    answeredCount += 1
    answeredIds.push(q.id)
    sEntry.attempted += 1
    const t = resp!.timeMs
    timeSum += t
    if (t < 30_000) { buckets.fast += 1; if (isWeakPick) { /* counted below */ } }
    else if (t <= 90_000) buckets.exam += 1
    else buckets.slow += 1

    const isCorrect = pick === q.answer
    const changed = resp!.history.filter((x) => x !== null).length >= 2
    if (changed) {
      if (isCorrect) changedToRight += 1
      else changedToWrong += 1
    }

    if (isCorrect) {
      correct += 1
      score += CORRECT_MARKS
      sEntry.correct += 1
      sEntry.score += CORRECT_MARKS
      if (isWeakPick) weakCorrect += 1
      d.correct += 1
      if (isPyq(q)) pyqCorrect += 1
    } else {
      wrong += 1
      score -= negativeMark ? WRONG_PENALTY : 0
      sEntry.wrong += 1
      sEntry.score -= negativeMark ? WRONG_PENALTY : 0
      wrongRows.push({ questionId: q.id, timeMs: t, changedToWrong: changed, conceptId: q.conceptId })
      if (t < 30_000 || changed) careless += 1
      else if (t >= 45_000) conceptual += 1
      if (q.conceptId && repeatedOffenders.has(q.conceptId)) repeatedThisTest += 1
    }
    if (isPyq(q)) pyqAttempted += 1
    subjectMap.set(subjectCode, sEntry)

    const topic = q.concept?.topic
    if (topic) {
      const tEntry = topicMap.get(topic.id) ?? { name: topic.name, subjectCode: topic.subject.code, topicId: topic.id, correct: 0, total: 0 }
      tEntry.total += 1
      if (isCorrect) tEntry.correct += 1
      topicMap.set(topic.id, tEntry)
    }
    if (q.conceptId) {
      const cEntry = conceptMap.get(q.conceptId) ?? { name: q.concept?.name ?? q.conceptId, correct: 0, total: 0 }
      cEntry.total += 1
      if (isCorrect) cEntry.correct += 1
      conceptMap.set(q.conceptId, cEntry)
    }
  }

  const unattempted = attempt.total - answeredCount
  const maxScore = attempt.total * CORRECT_MARKS
  const percent = maxScore > 0 ? Math.round((Math.max(0, score) / maxScore) * 100) : 0
  const accuracy = answeredCount > 0 ? Math.round((correct / answeredCount) * 100) : 0
  const avgTimeMs = answeredCount > 0 ? Math.round(timeSum / answeredCount) : 0
  const avgSec = avgTimeMs / 1000
  const band: 'fast' | 'steady' | 'slow' = answeredCount === 0 ? 'steady' : avgSec < 45 ? 'fast' : avgSec <= 90 ? 'steady' : 'slow'

  const subjects = [...subjectMap.entries()]
    .map(([subjectCode, s]) => ({
      subjectCode,
      name: s.name,
      correct: s.correct,
      wrong: s.wrong,
      unattempted: s.unattempted,
      accuracy: s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : 0,
      score: s.score,
    }))
    .sort((a, b) => b.score - a.score)

  const topicInsights = [...topicMap.values()]
    .map((t) => ({ ...t, accuracy: Math.round((t.correct / t.total) * 100) }))
  const weakTopics = topicInsights.filter((t) => t.accuracy <= 50).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5)
  const strongTopics = topicInsights.filter((t) => t.accuracy >= 75).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5)

  const conceptRows = [...conceptMap.entries()].map(([conceptId, c]) => ({ conceptId, ...c }))
  const weakConceptsRaw = conceptRows.filter((c) => c.correct < c.total).sort((a, b) => (a.correct / a.total) - (b.correct / b.total)).slice(0, 8)
  const conceptStates = await db.knowledgeState.findMany({
    where: { profileId, conceptId: { in: weakConceptsRaw.map((c) => c.conceptId) } },
    select: { conceptId: true, score: true },
  })
  const masteryByConcept = new Map(conceptStates.map((s) => [s.conceptId, Math.round(s.score)]))
  const weakConcepts = weakConceptsRaw.map((c) => ({
    conceptId: c.conceptId,
    conceptName: c.name,
    correct: c.correct,
    total: c.total,
    mastery: masteryByConcept.get(c.conceptId) ?? null,
  }))

  const difficulty = [1, 2, 3, 4].filter((d) => difficultyMap.has(d)).map((d) => ({
    d, correct: difficultyMap.get(d)!.correct, total: difficultyMap.get(d)!.total,
  }))

  const repeatedWrong = [...priorWrongMap.entries()]
    .map(([conceptId, v]) => ({ conceptId, conceptName: v.conceptName, misses: v.misses }))
    .sort((a, b) => b.misses - a.misses)
    .slice(0, 5)

  // ── Improvement vs the previous submitted test ──
  const previous = await db.examAttempt.findFirst({
    where: { profileId, status: 'submitted', id: { not: attempt.id }, submittedAt: { lt: submittedAt } },
    orderBy: { submittedAt: 'desc' },
  })
  let improvement: ExamAnalysis['improvement'] = null
  if (previous) {
    const prevReport = previous.report as unknown as ExamAnalysis | null
    const prevPercent = prevReport?.totals?.percent ?? (previous.maxScore > 0 ? Math.round((Math.max(0, previous.score) / previous.maxScore) * 100) : 0)
    const prevAccuracy = prevReport?.totals?.accuracy ?? (previous.answered > 0 ? Math.round((previous.correct / previous.answered) * 100) : 0)
    const prevAvg = prevReport?.speed?.avgTimeMs ?? 0
    improvement = {
      vsLabel: previous.label,
      vsAt: (previous.submittedAt ?? previous.startedAt).toISOString(),
      scoreDelta: percent - prevPercent,
      accuracyDelta: accuracy - prevAccuracy,
      speedDeltaMs: prevAvg > 0 ? avgTimeMs - prevAvg : null,
    }
  }

  // ── Transparent readiness indicators (never a rank promise) ──
  const touchedConceptIds = [...conceptMap.keys()]
  const statesForReadiness = touchedConceptIds.length
    ? await db.knowledgeState.findMany({
        where: { profileId, conceptId: { in: touchedConceptIds } },
        select: { score: true, estRecall: true, attemptCount: true },
      })
    : []
  const engagedStates = statesForReadiness.filter((s) => s.attemptCount > 0)
  const knowledge = engagedStates.length
    ? Math.round(engagedStates.reduce((a, s) => a + s.score, 0) / engagedStates.length)
    : 0
  const recall = engagedStates.length
    ? Math.round((engagedStates.reduce((a, s) => a + s.estRecall, 0) / engagedStates.length) * 100)
    : 0
  const paceIndex = answeredCount > 0 && avgSec > 0 ? Math.min(100, Math.round((EXAM_PACE_SEC / avgSec) * 100)) : 0
  const recentTests = await db.examAttempt.findMany({
    where: { profileId, status: 'submitted', id: { not: attempt.id } },
    orderBy: { submittedAt: 'desc' },
    take: 3,
    select: { report: true, score: true, maxScore: true },
  })
  const recentPercents = recentTests.map((t) => {
    const r = t.report as unknown as ExamAnalysis | null
    return r?.totals?.percent ?? (t.maxScore > 0 ? Math.round((Math.max(0, t.score) / t.maxScore) * 100) : 0)
  })
  const allPercents = [percent, ...recentPercents]
  const spread = allPercents.length >= 2 ? Math.max(...allPercents) - Math.min(...allPercents) : null
  const consistency = spread === null ? 0 : Math.max(0, 100 - spread * 2)
  const readiness: ExamAnalysis['readiness'] = [
    { key: 'knowledge', label: 'Knowledge', value: Math.min(100, knowledge), note: engagedStates.length ? `Average mastery of the concepts this paper touched` : 'Concepts here were new to you — no measured mastery yet' },
    { key: 'accuracy', label: 'Accuracy', value: accuracy, note: answeredCount > 0 ? `${correct}/${answeredCount} attempted questions right` : 'Nothing attempted' },
    { key: 'recall', label: 'Recall', value: Math.min(100, recall), note: engagedStates.length ? 'Estimated recall on the concepts you exercised' : 'No recall data for these concepts yet' },
    { key: 'speed', label: 'Speed', value: paceIndex, note: answeredCount > 0 ? `${Math.round(avgSec)}s per question vs the ${EXAM_PACE_SEC}s exam pace` : 'No timing to measure' },
    { key: 'consistency', label: 'Consistency', value: Math.min(100, consistency), note: spread === null ? 'Take 2 more tests to measure consistency' : `${spread}-point spread across your last ${allPercents.length} tests` },
    { key: 'weakCoverage', label: 'Weak-area repair', value: weakTouched > 0 ? Math.round((weakCorrect / weakTouched) * 100) : 0, note: weakTouched > 0 ? `${weakCorrect}/${weakTouched} of your known weak spots answered right` : 'This paper did not reach your measured weak areas' },
  ]

  // ── Deterministic next-test recommendation ──
  const weakestSubject = subjects.length ? [...subjects].sort((a, b) => a.score - b.score)[0] : null
  const d3Share = answeredCount > 0 ? ordered.filter((q) => q.difficulty === 3).length / Math.max(1, ordered.length) : 0
  let recommended: ExamAnalysis['recommended'] = null
  if (attempt.total > 0) {
    if (accuracy < 55) {
      recommended = {
        mode: 'weak', config: { mode: 'weak', count: 15 },
        reason: `Accuracy ${accuracy}% — a weak-area repair pass before the next full paper`,
      }
    } else if (careless >= 3) {
      recommended = {
        mode: 'subject', config: { mode: 'subject', count: 15, subjectCodes: weakestSubject ? [weakestSubject.subjectCode] : undefined },
        reason: careless === changedToWrong
          ? 'Answer changes cost you marks — a shorter paper to rebuild a check-twice habit'
          : `Fast wrongs on ${weakestSubject ? weakestSubject.name : 'your weakest subject'} — slow down on a shorter paper`,
      }
    } else if (conceptual >= 4) {
      recommended = {
        mode: 'weak', config: { mode: 'weak', count: 15 },
        reason: 'Conceptual breaks — repair the concepts you worked long on and still missed',
      }
    } else if (accuracy >= 80 && d3Share >= 0.4) {
      recommended = {
        mode: 'full', config: { mode: 'full', count: 50 },
        reason: 'Accuracy holding at difficulty 3 — ready for a bigger paper',
      }
    } else if (weakestSubject && weakestSubject.accuracy < 70) {
      recommended = {
        mode: 'subject', config: { mode: 'subject', count: 20, subjectCodes: [weakestSubject.subjectCode] },
        reason: `Consolidate ${weakestSubject.name} (${weakestSubject.accuracy}% here)`,
      }
    } else {
      recommended = {
        mode: 'pyq', config: { mode: 'pyq', count: 20 },
        reason: 'Solid run — next, classic repeated exam themes',
      }
    }
  }

  return {
    attemptId: attempt.id,
    mode: attempt.mode as ExamMode,
    label: attempt.label,
    negativeMark,
    autoSubmitted: opts.auto === true || attempt.autoSubmitted,
    totals: {
      total: attempt.total,
      answered: answeredCount,
      correct,
      wrong,
      unattempted,
      score,
      maxScore,
      percent,
      accuracy,
      timeMs: attempt.timeMs,
    },
    speed: {
      avgTimeMs,
      band,
      buckets: [
        { label: '< 30 s', count: buckets.fast },
        { label: '30–90 s', count: buckets.exam },
        { label: '> 90 s', count: buckets.slow },
      ],
    },
    subjects,
    weakTopics,
    strongTopics,
    weakConcepts,
    difficulty,
    pyq: hasPyq ? { attempted: pyqAttempted, correct: pyqCorrect, accuracy: pyqAttempted > 0 ? Math.round((pyqCorrect / pyqAttempted) * 100) : 0 } : null,
    mistakes: {
      careless,
      conceptual,
      changedToWrong,
      changedToRight,
      repeated: repeatedThisTest,
      unattempted,
    },
    repeatedWrong,
    improvement,
    readiness,
    recommended,
    fed: { studySession: false, revisionItems: 0, attemptsRecorded: 0, reason: '' }, // filled by the submit route
  }
}

// ── PUBLIC: feeds (called by the submit route after analysis) ────────────────
export interface ExamFeeds {
  attemptsRecorded: number
  studySession: boolean
  revisionItems: number
  reason: string
}

export async function feedExamResults(
  profileId: string,
  analysis: ExamAnalysis,
  answeredIds: string[],
  minutes: number,
): Promise<ExamFeeds> {
  const reasons: string[] = []
  let attemptsRecorded = 0

  // 1. One QuestionAttempt per answered question (final selection) — this is
  //    what feeds KnowledgeState + MistakeRecord across the whole platform.
  const responseByQ = new Map(parseResponses(await currentResponses(analysis.attemptId)).map((r) => [r.questionId, r] as const))
  const questions = await db.question.findMany({
    where: { id: { in: answeredIds } },
    select: { id: true, answer: true },
  })
  const answerById = new Map(questions.map((q) => [q.id, q.answer] as const))
  for (const qid of answeredIds) {
    const resp = responseByQ.get(qid)
    const pick = resp ? currentPick(resp) : null
    if (!pick) continue
    try {
      await recordAttempt(profileId, qid, pick, Math.min(resp!.timeMs, 15 * 60_000), 3)
      attemptsRecorded += 1
    } catch {
      // one bad question must never fail the submission
    }
  }

  // 2. StudySession — Performance Analytics
  let studySession = false
  try {
    await db.studySession.create({
      data: { profileId, minutes: Math.max(1, minutes), kind: 'questions', label: analysis.label },
    })
    studySession = true
  } catch {
    reasons.push('Study-time log skipped.')
  }

  // 3. RevisionItems for the worst concepts of THIS test (max 3, deduped)
  let revisionItems = 0
  const worstConcepts = analysis.weakConcepts
    .filter((c) => c.total >= 2 && c.correct / c.total <= 0.5)
    .slice(0, 3)
  for (const c of worstConcepts) {
    try {
      const open = await db.revisionItem.findFirst({
        where: { profileId, conceptId: c.conceptId, cleared: false },
        select: { id: true },
      })
      if (open) continue
      await db.revisionItem.create({
        data: {
          profileId,
          conceptId: c.conceptId,
          reason: `Missed ${c.total - c.correct}/${c.total} in "${analysis.label}"`,
          priority: 3,
          minutes: 10,
        },
      })
      revisionItems += 1
    } catch {
      // additive feed — never blocks
    }
  }
  if (revisionItems > 0) reasons.push(`${revisionItems} weak concept${revisionItems === 1 ? '' : 's'} added to your revision queue.`)
  if (attemptsRecorded > 0) reasons.push(`${attemptsRecorded} answers recorded into your knowledge state and mistake bank.`)

  return { attemptsRecorded, studySession, revisionItems, reason: reasons.join(' ') || 'Results recorded.' }
}

async function currentResponses(attemptId: string): Promise<unknown> {
  const row = await db.examAttempt.findUnique({ where: { id: attemptId }, select: { responses: true } })
  return row?.responses ?? []
}

// ── PUBLIC: full review payload (answers included — post-submit only) ───────
export async function buildReview(attempt: {
  id: string
  profileId: string
  mode: string
  label: string
  questionIds: unknown
  responses: unknown
  report: unknown
}): Promise<ExamReviewPayload> {
  const analysis = attempt.report as unknown as ExamAnalysis
  const questionIds = (Array.isArray(attempt.questionIds) ? attempt.questionIds : []).filter((x): x is string => typeof x === 'string')
  const responses = parseResponses(attempt.responses)
  const responseByQ = new Map(responses.map((r) => [r.questionId, r] as const))

  const questions = questionIds.length
    ? await db.question.findMany({
        where: { id: { in: questionIds } },
        include: {
          concept: {
            select: {
              id: true, name: true, topicId: true,
              topic: { select: { id: true, name: true, subject: { select: { code: true, name: true } } } },
            },
          },
          subject: { select: { name: true } },
        },
      })
    : []
  const qById = new Map(questions.map((q) => [q.id, q] as const))

  const [mistakes, saved] = await Promise.all([
    db.mistakeRecord.findMany({
      where: { profileId: attempt.profileId, questionId: { in: questionIds } },
      select: { questionId: true, status: true, wrongCount: true },
    }),
    db.savedQuestion.findMany({
      where: { profileId: attempt.profileId, questionId: { in: questionIds } },
      select: { questionId: true },
    }),
  ])
  const mistakeByQ = new Map(mistakes.map((m) => [m.questionId, m] as const))
  const savedSet = new Set(saved.map((s) => s.questionId))

  const rows: ExamReviewQuestion[] = questionIds
    .map((id) => qById.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      const resp = responseByQ.get(q.id)
      const pick = resp ? currentPick(resp) : null
      const isCorrect = pick !== null && pick === q.answer
      const options = q.options as { id: string; text: string }[]
      const notes = q.optionNotes && typeof q.optionNotes === 'object' && !Array.isArray(q.optionNotes)
        ? (q.optionNotes as Record<string, string>)
        : undefined
      const mistake = mistakeByQ.get(q.id)
      return {
        questionId: q.id,
        stem: q.stem,
        options,
        answer: q.answer,
        answerText: options.find((o) => o.id === q.answer)?.text ?? q.answer,
        selected: pick,
        selectedText: pick ? (options.find((o) => o.id === pick)?.text ?? pick) : null,
        correct: isCorrect,
        unattempted: pick === null,
        explanation: q.explanation,
        teaching: q.teaching,
        optionNotes: notes,
        difficulty: q.difficulty,
        subjectCode: q.subjectCode,
        subjectName: q.subject?.name ?? q.subjectCode,
        conceptId: q.conceptId,
        conceptName: q.concept?.name ?? null,
        topicId: q.concept?.topicId ?? null,
        topicName: q.concept?.topic?.name ?? null,
        pyqPattern: isPyq(q as QRow) || undefined,
        imageBased: isImage(q as QRow) || undefined,
        imageUrl: q.imageUrl ?? undefined,
        timeMs: resp?.timeMs ?? 0,
        changed: (resp?.history.filter((x) => x !== null).length ?? 0) >= 2,
        marked: resp?.marked ?? false,
        mistakeStatus: mistake?.status ?? null,
        wrongCount: mistake?.wrongCount ?? 0,
        saved: savedSet.has(q.id),
      }
    })

  return {
    attemptId: attempt.id,
    label: attempt.label,
    mode: attempt.mode as ExamMode,
    analysis,
    questions: rows,
  }
}

// ── PUBLIC: performance history ──────────────────────────────────────────────
export async function buildHistory(profileId: string): Promise<ExamHistoryPayload> {
  const attempts = await db.examAttempt.findMany({
    where: { profileId, status: 'submitted' },
    orderBy: { submittedAt: 'desc' },
    take: 50,
  })

  const tests: ExamTrendPoint[] = attempts.map((a) => {
    const r = a.report as unknown as ExamAnalysis | null
    const percent = r?.totals?.percent ?? (a.maxScore > 0 ? Math.round((Math.max(0, a.score) / a.maxScore) * 100) : 0)
    const accuracy = r?.totals?.accuracy ?? (a.answered > 0 ? Math.round((a.correct / a.answered) * 100) : 0)
    return {
      attemptId: a.id,
      label: a.label,
      mode: a.mode as ExamMode,
      at: (a.submittedAt ?? a.startedAt).toISOString(),
      score: a.score,
      maxScore: a.maxScore,
      percent,
      accuracy,
      avgTimeMs: r?.speed?.avgTimeMs ?? 0,
    }
  })

  const testsAsc = [...tests].reverse()
  const totals = {
    tests: tests.length,
    questionsAnswered: attempts.reduce((a, t) => a + t.answered, 0),
    accuracy: null as number | null,
    avgPercent: null as number | null,
    bestPercent: null as number | null,
    minutes: Math.round(attempts.reduce((a, t) => a + t.timeMs, 0) / 60_000),
  }
  if (tests.length > 0) {
    totals.avgPercent = Math.round(tests.reduce((a, t) => a + t.percent, 0) / tests.length)
    totals.bestPercent = Math.max(...tests.map((t) => t.percent))
    const answeredAll = attempts.reduce((a, t) => a + t.answered, 0)
    const correctAll = attempts.reduce((a, t) => a + t.correct, 0)
    totals.accuracy = answeredAll > 0 ? Math.round((correctAll / answeredAll) * 100) : null
  }

  // Consistency over the last 4 tests
  let consistency: ExamHistoryPayload['consistency'] = null
  const last4 = tests.slice(0, 4).map((t) => t.percent)
  if (last4.length >= 3) {
    const spread = Math.max(...last4) - Math.min(...last4)
    consistency = {
      spread,
      band: spread <= 8 ? 'Steady' : spread <= 16 ? 'Mostly steady' : 'Swinging',
      note: spread <= 8
        ? `Last ${last4.length} tests within ${spread} points — reliable performance`
        : spread <= 16
          ? `${spread}-point spread — the ceiling is there, the floor moves`
          : `${spread}-point spread — results depend heavily on the paper; stabilise with weekly full-length tests`,
    }
  }

  // Subject aggregates across all submitted tests
  const subjectAgg = new Map<string, { name: string; tests: Set<string>; attempted: number; correct: number; percents: { at: number; acc: number }[] }>()
  for (const a of attempts) {
    const r = a.report as unknown as ExamAnalysis | null
    if (!r?.subjects) continue
    for (const s of r.subjects) {
      const entry = subjectAgg.get(s.subjectCode) ?? { name: s.name, tests: new Set<string>(), attempted: 0, correct: 0, percents: [] }
      entry.tests.add(a.id)
      entry.attempted += s.correct + s.wrong
      entry.correct += s.correct
      if (s.correct + s.wrong >= 3) entry.percents.push({ at: (a.submittedAt ?? a.startedAt).getTime(), acc: s.accuracy })
      subjectAgg.set(s.subjectCode, entry)
    }
  }
  const subjects = [...subjectAgg.entries()]
    .map(([subjectCode, s]) => {
      const sorted = s.percents.sort((a, b) => a.at - b.at)
      const recent = sorted.slice(-2)
      const older = sorted.slice(0, Math.max(0, sorted.length - 2))
      const avg = (arr: { acc: number }[]) => (arr.length ? arr.reduce((a, x) => a + x.acc, 0) / arr.length : null)
      const r = avg(recent)
      const o = avg(older)
      return {
        subjectCode,
        name: s.name,
        tests: s.tests.size,
        attempted: s.attempted,
        accuracy: s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : 0,
        trend: r !== null && o !== null ? Math.round(r - o) : null,
      }
    })
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10)

  // Revision impact: questions attempted in submitted tests whose concept had an
  // OPEN revision item created BEFORE that test, vs the rest. Measured only.
  const revisionItems = await db.revisionItem.findMany({
    where: { profileId, cleared: false },
    select: { conceptId: true, dueAt: true },
  })
  const openByConcept = new Map<string, Date>()
  for (const r of revisionItems) {
    const prev = openByConcept.get(r.conceptId)
    if (!prev || r.dueAt < prev) openByConcept.set(r.conceptId, r.dueAt)
  }
  let revisedA = 0; let revisedN = 0
  let unrevisedA = 0; let unrevisedN = 0
  const attemptQuestions = await db.questionAttempt.findMany({
    where: { profileId, createdAt: { lte: new Date() } },
    select: { correct: true, createdAt: true, question: { select: { conceptId: true } } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })
  for (const a of attemptQuestions) {
    const cid = a.question.conceptId
    if (!cid) continue
    const openedAt = openByConcept.get(cid)
    if (openedAt && openedAt <= a.createdAt) { revisedN += 1; if (a.correct) revisedA += 1 }
    else { unrevisedN += 1; if (a.correct) unrevisedA += 1 }
  }
  const pct = (c: number, n: number) => (n >= 10 ? Math.round((c / n) * 100) : null)
  const revisedAccuracy = pct(revisedA, revisedN)
  const unrevisedAccuracy = pct(unrevisedA, unrevisedN)
  const revisionImpact = revisedAccuracy !== null && unrevisedAccuracy !== null
    ? {
        revisedAccuracy,
        unrevisedAccuracy,
        sample: revisedN,
        note: revisedAccuracy > unrevisedAccuracy
          ? `Concepts with an open revision item: ${revisedAccuracy}% vs ${unrevisedAccuracy}% without — revision is paying off`
          : `Concepts with an open revision item: ${revisedAccuracy}% vs ${unrevisedAccuracy}% without — clear those items before the next test`,
      }
    : null

  return {
    tests,
    totals,
    consistency,
    subjects,
    revisionImpact,
    percentileNote: 'Percentile and rank predictions need a real cohort — this platform measures only against your own tests, never a promised rank.',
    insufficientData: tests.length < 2,
  }
}

// ── PUBLIC: home payload ─────────────────────────────────────────────────────
export async function buildExamHome(profileId: string): Promise<ExamHome> {
  const [submitted, activeAttempt, rows, subjects, states] = await Promise.all([
    db.examAttempt.findMany({ where: { profileId, status: 'submitted' }, orderBy: { submittedAt: 'desc' }, take: 6 }),
    db.examAttempt.findFirst({ where: { profileId, status: 'active' }, orderBy: { startedAt: 'desc' } }),
    loadRows(),
    db.subject.findMany({ orderBy: { neetWeight: 'desc' } }),
    db.knowledgeState.findMany({
      where: { profileId, attemptCount: { gt: 0 }, score: { lte: 45 } },
      orderBy: { score: 'asc' },
      take: 6,
      include: { concept: { select: { name: true } } },
    }),
  ])

  const percents = submitted.map((a) => {
    const r = a.report as unknown as ExamAnalysis | null
    return r?.totals?.percent ?? (a.maxScore > 0 ? Math.round((Math.max(0, a.score) / a.maxScore) * 100) : 0)
  })
  const answeredAll = submitted.reduce((a, t) => a + t.answered, 0)
  const correctAll = submitted.reduce((a, t) => a + t.correct, 0)

  const recent = submitted.map((a) => {
    const r = a.report as unknown as ExamAnalysis | null
    return {
      attemptId: a.id,
      label: a.label,
      mode: a.mode as ExamMode,
      percent: r?.totals?.percent ?? 0,
      accuracy: r?.totals?.accuracy ?? 0,
      score: a.score,
      maxScore: a.maxScore,
      at: (a.submittedAt ?? a.startedAt).toISOString(),
    }
  })

  // Weak subjects from exam data (this product's lens)
  const subjectAgg = new Map<string, { name: string; attempted: number; correct: number; tests: number }>()
  for (const a of submitted) {
    const r = a.report as unknown as ExamAnalysis | null
    if (!r?.subjects) continue
    for (const s of r.subjects) {
      const entry = subjectAgg.get(s.subjectCode) ?? { name: s.name, attempted: 0, correct: 0, tests: 0 }
      entry.attempted += s.correct + s.wrong
      entry.correct += s.correct
      entry.tests += 1
      subjectAgg.set(s.subjectCode, entry)
    }
  }
  const weakSubjects = [...subjectAgg.entries()]
    .map(([code, s]) => ({ code, name: s.name, tests: s.tests, accuracy: s.attempted >= 3 ? Math.round((s.correct / s.attempted) * 100) : null }))
    .filter((s) => s.accuracy !== null && s.accuracy < 60)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, 4)

  // Deterministic recommendation
  let recommended: ExamHome['recommended']
  if (submitted.length === 0) {
    recommended = { mode: 'full', config: { mode: 'full', count: 25 }, reason: 'Start with a baseline paper — 25 questions at exam pace' }
  } else {
    const lastReport = submitted[0].report as unknown as ExamAnalysis | null
    recommended = lastReport?.recommended ?? { mode: 'full', config: { mode: 'full', count: 25 }, reason: 'Keep the mock cadence going' }
  }

  const topicCounts = new Map<string, { id: string; name: string; subjectCode: string; count: number }>()
  for (const q of rows) {
    const tid = topicIdOf(q)
    if (!tid) continue
    const entry = topicCounts.get(tid) ?? { id: tid, name: '', subjectCode: q.subjectCode, count: 0 }
    entry.count += 1
    topicCounts.set(tid, entry)
  }
  const topicIds = [...topicCounts.keys()]
  const topicRows = topicIds.length ? await db.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true } }) : []
  const topicNameById = new Map(topicRows.map((t) => [t.id, t.name] as const))
  const topics = [...topicCounts.values()]
    .map((t) => ({ ...t, name: topicNameById.get(t.id) ?? t.id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60)

  return {
    modes: EXAM_MODES,
    stats: {
      tests: submitted.length,
      avgPercent: percents.length ? Math.round(percents.reduce((a, p) => a + p, 0) / percents.length) : null,
      bestPercent: percents.length ? Math.max(...percents) : null,
      accuracy: answeredAll > 0 ? Math.round((correctAll / answeredAll) * 100) : null,
      minutes: Math.round(submitted.reduce((a, t) => a + t.timeMs, 0) / 60_000),
      lastAt: submitted[0] ? (submitted[0].submittedAt ?? submitted[0].startedAt).toISOString() : null,
    },
    recent,
    resume: activeAttempt
      ? {
          attemptId: activeAttempt.id,
          label: activeAttempt.label,
          mode: activeAttempt.mode as ExamMode,
          total: activeAttempt.total,
          answered: parseResponses(activeAttempt.responses).filter((r) => currentPick(r) !== null).length,
          endsAt: new Date(activeAttempt.startedAt.getTime() + clampMinutes((activeAttempt.config as unknown as ExamConfig)?.minutes, activeAttempt.mode as ExamMode) * 60_000).toISOString(),
        }
      : null,
    weakSubjects,
    weakConcepts: states
      .filter((s) => s.concept)
      .map((s) => ({ conceptId: s.conceptId, conceptName: s.concept.name, mastery: Math.round(s.score) })),
    recommended,
    facets: {
      subjects: subjects.filter((s) => rows.some((q) => q.subjectCode === s.code)).map((s) => ({ code: s.code, name: s.name, count: rows.filter((q) => q.subjectCode === s.code).length })),
      topics,
    },
    bank: {
      total: rows.length,
      pyq: rows.filter(isPyq).length,
      image: rows.filter(isImage).length,
    },
    disclaimer: 'Papers are scaled to this platform\'s bank — a proportional simulation of the NEET-PG pattern, not a leaked or replica paper.',
  }
}
