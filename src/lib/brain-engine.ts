// ─── PERSONAL MEDICAL BRAIN (PRODUCT 18) — deterministic engine ──────────────
// The brain is a continuously evolving learning-intelligence layer built ONLY
// from measured platform activity (KnowledgeState, QuestionAttempt,
// FlashcardReview, MistakeRecord, RevisionItem/Session, LearnProgress,
// StudySession, ExamAttempt, SimCaseAttempt, LabAttempt). NO AI/LLM calls
// anywhere in this file — every number, headline and recommendation is
// derived deterministically from the loaded context.
//
// Honesty contract (binding, mirrors the frozen P18 header in types.ts):
// - Every signal is MEASURED; nothing is invented or presented as data when
//   it is a heuristic. Thin data says so (honest notes everywhere).
// - Concept states derive from MULTIPLE signal families; the 7-state
//   derivation order is PUBLISHED and evaluated exactly as written.
// - Every recommendation carries its evidence ("why am I seeing this").
// - PRIVATE BY DEFAULT: no sharing surface; tutor context is transparency-
//   first and toggle-gated; exam strategy never predicts a rank.
// - Personalization toggles are respected: a disabled switch makes that
//   surface fall back to non-personalized behavior (honestly labelled).

import { db } from '@/lib/db'
import { DAY, estimatedRecall, examClock, computeStreak, istDayKey } from '@/lib/engine'
import { loadGraphContext, type GraphContext, type GraphPairCtx } from '@/lib/knowledge-graph'
import { MIN_TIMED_MS, buildPerformancePayload } from '@/lib/performance'
import { EXAM_PACE_SEC } from '@/lib/exam'
import type {
  BrainConceptState,
  BrainConceptStatus,
  BrainForgetRisk,
  BrainSignal,
  BrainStateCounts,
  BrainAction,
  BrainAnswerItem,
  BrainAnswer,
  BrainPathStage,
  BrainPathPayload,
  BrainMemoryRow,
  BrainMemoryPayload,
  BrainTutorPack,
  BrainPracticeQuestion,
  BrainPracticePayload,
  BrainContentRec,
  BrainContentPayload,
  BrainStrategyPayload,
  BrainInsight,
  BrainPrivacySettingsView,
  BrainPrivacyPayload,
  BrainExportSection,
  BrainExportPayload,
  BrainResetResult,
  BrainTimelinePoint,
  BrainTimelinePayload,
  BrainHomePayload,
  View,
} from '@/lib/types'

// ─── constants ───────────────────────────────────────────────────────────────

export const MAX_ATTEMPT_FEED = 1200 // newest QuestionAttempt rows loaded per context pass
export const MAX_EXAM_ATTEMPTS = 30 // submitted mocks inspected per context pass
export const MAX_SIM_ATTEMPTS = 50 // case attempts inspected per context pass
export const MAX_EXPORT_ROWS = 12 // per-section cap in the privacy export

const RISK_HIGH = 0.45
const RISK_MODERATE = 0.6
const RISK_LOW = 0.75
const MASTERY_BAR = 70 // "was strong/mastered" score bar in the published rules
const WEAK_BAR = 45
const RECALL_AT_RISK = 0.5
const RECALL_DUE = 0.6
const RECALL_STRONG = 0.55
const RECALL_OK = 0.75

// Published 7-state derivation, verbatim from the frozen P18 contract header.
export function howItWorksRules(): string[] {
  return [
    'not-started → zero measured signals',
    'at-risk → was strong/mastered (score ≥ 70) but estRecall < 0.5 now',
    'needs-revision → engaged but estRecall < 0.6 (due), or ≥ 2 open repeated mistakes',
    'mastered → attempts ≥ 3 ∧ accuracy ≥ 75 ∧ estRecall ≥ 0.6 ∧ 0 open mistakes',
    'strong → score ≥ 70 ∧ estRecall ≥ 0.55',
    'familiar → score ≥ 45 or (engaged ≥ 2 signal families ∧ accuracy ≥ 50)',
    'learning → any measured signal below the above bars',
    'estRecall = e^(−t / 1.6·stability) — the platform\u2019s published Ebbinghaus curve',
    'forgetRisk → high < 0.45 · moderate < 0.6 · low < 0.75 · none ≥ 0.75 (never-studied = none)',
    'Every state derives from multiple measured signal families — never a single quiz result',
  ]
}

// ─── small deterministic helpers ─────────────────────────────────────────────

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

function strArray(x: unknown): string[] {
  return asArray(x).filter((v): v is string => typeof v === 'string')
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function median(nums: number[]): number | null {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10
}

function pct(x: number): number {
  return Math.round(x * 100)
}

function daysSince(now: Date, d: Date): number {
  return Math.max(0, (now.getTime() - d.getTime()) / DAY)
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function emptyCounts(): BrainStateCounts {
  return { 'not-started': 0, learning: 0, familiar: 0, strong: 0, mastered: 0, 'at-risk': 0, 'needs-revision': 0 }
}

function countStates(states: BrainConceptState[]): BrainStateCounts {
  const c = emptyCounts()
  for (const s of states) c[s.status] += 1
  return c
}

const ERROR_LABELS: Record<string, string> = {
  didnt_know: 'did not know the fact',
  forgot: 'knew it once but forgot',
  misread: 'misread the question',
  confused: 'confused similar concepts',
  calculation: 'calculation slip',
  reasoning: 'reasoning error',
  changed: 'changed the right answer',
  time: 'ran out of time',
  guess: 'guessed',
}

// Exported for PRODUCT 20 (os-engine) — one tactic map across the platform.
export const MISTAKE_TACTICS: Record<string, string> = {
  misread: 'Slow down on stems — re-read the lead-in (""EXCEPT"", ""NOT"") before the options',
  confused: 'Discrimination drills on the confused pairs — contrast tables, side-by-side recall',
  forgot: 'Spaced revision — schedule the faded concepts, don\u2019t re-read passively',
  guess: 'Commit to a first-principles elimination before looking at the options',
  calculation: 'Practice the numbers — repeat the numeric questions you missed until fluent',
  didnt_know: 'Learn blocks first — these are gaps, not slips; read the lesson before retesting',
  changed: 'Trust your first instinct unless you find a concrete error on review',
  time: 'Pace drills — timed blocks of 20 questions at the 63-second target',
  reasoning: 'Why-based practice — after each question, write WHY each wrong option fails',
}

function errorLabel(t: string): string {
  return ERROR_LABELS[t] ?? t
}

// ─── context shapes ──────────────────────────────────────────────────────────

export interface BrainAttemptLite {
  id: string
  questionId: string
  conceptId: string | null
  topicId: string | null
  subjectCode: string
  difficulty: number
  correct: boolean
  errorType: string | null
  timeMs: number
  createdAt: Date
}

export interface BrainQuestionLite {
  id: string
  stem: string
  conceptId: string | null
  topicId: string | null
  subjectCode: string
  difficulty: number
  pyq: boolean
}

export interface BrainExamLite {
  id: string
  mode: string
  label: string
  score: number
  maxScore: number
  answered: number
  percent: number | null
  careless: number
  changedToWrong: number
  changedToRight: number
  submittedAt: Date | null
}

export interface BrainMistakeLite {
  id: string
  questionId: string
  conceptId: string | null
  stem: string
  wrongCount: number
  status: string
  lastErrorType: string | null
  lastWrongAt: Date
}

export interface BrainRevisionLite {
  id: string
  conceptId: string
  reason: string
  priority: number
  dueAt: Date
  cleared: boolean
  clearedAt: Date | null
}

export interface BrainConceptMeta {
  lesson: boolean
  examWeight: number
}

export interface BrainContext {
  profileId: string
  profile: {
    name: string
    year: number
    gradYear: number
    prepStage: string
    dailyHours: number
    examMode: boolean
    examLabel: string
    examDate: Date | null
    learningStyles: string[]
  }
  graph: GraphContext
  settings: BrainPrivacySettingsView
  // measured rows
  stateRows: { conceptId: string; score: number; attemptCount: number; correctCount: number; lastReviewed: Date | null; stability: number }[]
  attempts: BrainAttemptLite[] // capped newest-first feed
  attemptsTotal: number
  attemptsCorrect: number
  attempts30: number
  attemptsCorrect30: number
  flashReviews: { conceptId: string | null; reps: number; lapses: number; lastGrade: number; at: Date }[]
  mistakeRows: BrainMistakeLite[]
  revisionItems: BrainRevisionLite[]
  revisionSessions: { id: string; createdAt: Date; completedAt: Date | null; status: string }[]
  studyDates: Date[]
  examAttempts: BrainExamLite[] // submitted only, newest-first
  simAttempts: { caseId: string; conceptIds: string[]; completed: boolean }[]
  simCaseCount: number
  simCases: { id: string; conceptIds: string[] }[] // content availability (case → concept links)
  labImages: { id: string; conceptIds: string[] }[] // content availability (image → concept links)
  labRuns: { imageId: string; conceptIds: string[]; completed: boolean }[]
  errorPatterns: { errorType: string; conceptId: string | null; count: number }[]
  pairs: GraphPairCtx[]
  questions: BrainQuestionLite[] // full pool (lite projection)
  conceptMeta: Map<string, BrainConceptMeta>
  topicImportance: Map<string, number>
  snapshots: { dayKey: string; data: unknown }[]
  now: Date
}

// ─── settings (get-or-create + partial update) ──────────────────────────────

const SETTINGS_DEFAULTS: BrainPrivacySettingsView = {
  personalizationOn: true,
  tutorContextOn: true,
  questionPersonalizationOn: true,
  revisionPersonalizationOn: true,
  contentPersonalizationOn: true,
  historySnapshotsOn: true,
}

function settingsOf(row: { personalizationOn: boolean; tutorContextOn: boolean; questionPersonalizationOn: boolean; revisionPersonalizationOn: boolean; contentPersonalizationOn: boolean; historySnapshotsOn: boolean } | null): BrainPrivacySettingsView {
  return row
    ? {
        personalizationOn: row.personalizationOn,
        tutorContextOn: row.tutorContextOn,
        questionPersonalizationOn: row.questionPersonalizationOn,
        revisionPersonalizationOn: row.revisionPersonalizationOn,
        contentPersonalizationOn: row.contentPersonalizationOn,
        historySnapshotsOn: row.historySnapshotsOn,
      }
    : { ...SETTINGS_DEFAULTS }
}

/** Get-or-create the per-profile brain settings row (defaults all ON). */
export async function ensureBrainSettings(profileId: string): Promise<BrainPrivacySettingsView> {
  const existing = await db.brainSettings.findUnique({ where: { profileId } })
  if (existing) return settingsOf(existing)
  try {
    const created = await db.brainSettings.create({ data: { profileId } })
    return settingsOf(created)
  } catch {
    const retry = await db.brainSettings.findUnique({ where: { profileId } })
    return settingsOf(retry)
  }
}

const SETTINGS_KEYS = [
  'personalizationOn',
  'tutorContextOn',
  'questionPersonalizationOn',
  'revisionPersonalizationOn',
  'contentPersonalizationOn',
  'historySnapshotsOn',
] as const

/** Partial update of the brain settings — only the 6 whitelisted booleans. */
export async function setBrainPrivacy(profileId: string, patch: Partial<Record<(typeof SETTINGS_KEYS)[number], boolean>>): Promise<BrainPrivacySettingsView> {
  await ensureBrainSettings(profileId)
  const data: Record<string, boolean> = {}
  for (const k of SETTINGS_KEYS) {
    const v = patch[k]
    if (typeof v === 'boolean') data[k] = v
  }
  if (Object.keys(data).length > 0) {
    await db.brainSettings.update({ where: { profileId }, data })
  }
  const row = await db.brainSettings.findUnique({ where: { profileId } })
  return settingsOf(row)
}

// ─── A) loadBrainContext — ONE parallel pass (+ reusable graph context) ──────

export async function loadBrainContext(profileId: string): Promise<BrainContext> {
  const settings = await ensureBrainSettings(profileId)

  // Reuse the richest per-concept context loader (registry, verified edges,
  // states baseline, open mistakes, learn marks, pairs, per-concept question/
  // PYQ/flashcard counts, topic/subject maps) — no duplicate queries for those.
  const graphPromise = loadGraphContext(profileId)

  const since30 = new Date(Date.now() - 30 * DAY)

  const [
    graph,
    profileRow,
    stateRows,
    attemptFeed,
    attemptsTotal,
    attemptsCorrect,
    attempts30,
    attemptsCorrect30,
    flashReviewRows,
    mistakeRows,
    revisionItemRows,
    revisionSessionRows,
    studySessionRows,
    examRows,
    simAttemptRows,
    simCaseRows,
    labImageRows,
    labAttemptRows,
    errorPatternRows,
    conceptMetaRows,
    topicRows,
    questionRows,
    snapshotRows,
  ] = await Promise.all([
    graphPromise,
    db.studentProfile.findUnique({ where: { id: profileId } }),
    db.knowledgeState.findMany({
      where: { profileId },
      select: { conceptId: true, score: true, attemptCount: true, correctCount: true, lastReviewed: true, stability: true },
    }),
    db.questionAttempt.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: MAX_ATTEMPT_FEED,
      select: {
        id: true, questionId: true, correct: true, errorType: true, timeMs: true, createdAt: true,
        question: { select: { id: true, conceptId: true, topicId: true, subjectCode: true, difficulty: true } },
      },
    }),
    db.questionAttempt.count({ where: { profileId } }),
    db.questionAttempt.count({ where: { profileId, correct: true } }),
    db.questionAttempt.count({ where: { profileId, createdAt: { gte: since30 } } }),
    db.questionAttempt.count({ where: { profileId, createdAt: { gte: since30 }, correct: true } }),
    db.flashcardReview.findMany({
      where: { profileId },
      select: { reps: true, lapses: true, lastGrade: true, reviewedAt: true, dueAt: true, flashcard: { select: { conceptId: true } } },
    }),
    db.mistakeRecord.findMany({
      where: { profileId },
      orderBy: { lastWrongAt: 'desc' },
      select: { id: true, questionId: true, conceptId: true, wrongCount: true, status: true, lastErrorType: true, lastWrongAt: true, question: { select: { stem: true } } },
    }),
    db.revisionItem.findMany({
      where: { profileId },
      orderBy: { dueAt: 'asc' },
      select: { id: true, conceptId: true, reason: true, priority: true, dueAt: true, cleared: true, clearedAt: true },
    }),
    db.revisionSession.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, completedAt: true, status: true },
    }),
    db.studySession.findMany({ where: { profileId }, select: { date: true } }),
    db.examAttempt.findMany({
      where: { profileId, status: 'submitted' },
      orderBy: [{ submittedAt: 'desc' }, { startedAt: 'desc' }],
      take: MAX_EXAM_ATTEMPTS,
      select: { id: true, mode: true, label: true, score: true, maxScore: true, answered: true, report: true, submittedAt: true, startedAt: true },
    }),
    db.simCaseAttempt.findMany({
      where: { profileId },
      orderBy: { startedAt: 'desc' },
      take: MAX_SIM_ATTEMPTS,
      select: { caseId: true, status: true },
    }),
    db.simCase.findMany({ select: { id: true, brief: true } }),
    db.labImage.findMany({ select: { id: true, conceptIds: true } }),
    db.labAttempt.findMany({
      where: { profileId },
      select: { imageId: true, status: true },
    }),
    db.errorPattern.findMany({
      where: { profileId, count: { gt: 0 } },
      orderBy: { count: 'desc' },
      select: { errorType: true, conceptId: true, count: true },
    }),
    db.concept.findMany({ select: { id: true, lesson: true, examWeight: true, examRelevance: true } }),
    db.topic.findMany({ select: { id: true, importance: true } }),
    db.question.findMany({
      select: { id: true, stem: true, conceptId: true, topicId: true, subjectCode: true, difficulty: true, tags: true },
    }),
    db.brainSnapshot.findMany({ where: { profileId }, select: { dayKey: true, data: true }, orderBy: { dayKey: 'asc' } }),
  ])

  const now = new Date()

  const attempts: BrainAttemptLite[] = attemptFeed.map((a) => ({
    id: a.id,
    questionId: a.questionId,
    conceptId: a.question.conceptId,
    topicId: a.question.topicId,
    subjectCode: a.question.subjectCode,
    difficulty: a.question.difficulty,
    correct: a.correct,
    errorType: a.errorType,
    timeMs: a.timeMs,
    createdAt: a.createdAt,
  }))

  const flashReviews = flashReviewRows.map((r) => ({
    conceptId: r.flashcard.conceptId,
    reps: r.reps,
    lapses: r.lapses,
    lastGrade: r.lastGrade,
    at: r.reviewedAt ?? r.dueAt,
  }))

  const mistakeRows2: BrainMistakeLite[] = mistakeRows.map((m) => ({
    id: m.id,
    questionId: m.questionId,
    conceptId: m.conceptId,
    stem: m.question.stem,
    wrongCount: m.wrongCount,
    status: m.status,
    lastErrorType: m.lastErrorType,
    lastWrongAt: m.lastWrongAt,
  }))

  // Submitted mocks → measured percent + careless/changed counters from the
  // stored submit-time analysis (report.totals.percent, report.mistakes.*).
  const examAttempts: BrainExamLite[] = examRows.map((e) => {
    const report = (e.report ?? null) as { totals?: { percent?: unknown }; mistakes?: { careless?: unknown; changedToWrong?: unknown; changedToRight?: unknown } } | null
    const percentRaw = report?.totals?.percent
    const percent = isNum(percentRaw)
      ? percentRaw
      : e.maxScore > 0
        ? Math.round((Math.max(0, e.score) / e.maxScore) * 100)
        : null
    const mistakes = report?.mistakes
    return {
      id: e.id,
      mode: e.mode,
      label: e.label,
      score: e.score,
      maxScore: e.maxScore,
      answered: e.answered,
      percent,
      careless: isNum(mistakes?.careless) ? mistakes.careless : 0,
      changedToWrong: isNum(mistakes?.changedToWrong) ? mistakes.changedToWrong : 0,
      changedToRight: isNum(mistakes?.changedToRight) ? mistakes.changedToRight : 0,
      submittedAt: e.submittedAt ?? e.startedAt,
    }
  })

  // Sim cases join in memory; conceptIds come from the case brief (answer key).
  const simBriefConcepts = new Map(simCaseRows.map((c) => {
    const brief = (c.brief ?? null) as { conceptIds?: unknown } | null
    return [c.id, strArray(brief?.conceptIds)]
  }))
  const simAttempts = simAttemptRows.map((a) => ({
    caseId: a.caseId,
    conceptIds: simBriefConcepts.get(a.caseId) ?? [],
    completed: a.status === 'completed',
  }))
  const simCases = simCaseRows.map((c) => ({ id: c.id, conceptIds: simBriefConcepts.get(c.id) ?? [] }))

  const labConcepts = new Map(labImageRows.map((i) => [i.id, strArray(i.conceptIds)]))
  const labImages = labImageRows.map((i) => ({ id: i.id, conceptIds: labConcepts.get(i.id) ?? [] }))
  const labRuns = labAttemptRows.map((a) => ({
    imageId: a.imageId,
    conceptIds: labConcepts.get(a.imageId) ?? [],
    completed: a.status === 'completed',
  }))

  const conceptMeta = new Map<string, BrainConceptMeta>(
    conceptMetaRows.map((c) => [c.id, { lesson: c.lesson != null, examWeight: c.examWeight ?? c.examRelevance }]),
  )
  const topicImportance = new Map(topicRows.map((t) => [t.id, t.importance]))

  const questions: BrainQuestionLite[] = questionRows.map((q) => ({
    id: q.id,
    stem: q.stem,
    conceptId: q.conceptId,
    topicId: q.topicId,
    subjectCode: q.subjectCode,
    difficulty: q.difficulty,
    pyq: asArray(q.tags).includes('pyq-pattern'),
  }))

  return {
    profileId,
    profile: {
      name: profileRow?.name ?? 'Future Dr.',
      year: profileRow?.year ?? 1,
      gradYear: profileRow?.gradYear ?? 0,
      prepStage: profileRow?.prepStage ?? 'exploring',
      dailyHours: profileRow?.dailyHours ?? 2,
      examMode: profileRow?.examMode ?? false,
      examLabel: profileRow?.examLabel ?? '',
      examDate: profileRow?.examDate ?? null,
      learningStyles: Array.isArray(profileRow?.learningStyles) ? strArray(profileRow.learningStyles) : [],
    },
    graph,
    settings,
    stateRows,
    attempts,
    attemptsTotal,
    attemptsCorrect,
    attempts30,
    attemptsCorrect30,
    flashReviews,
    mistakeRows: mistakeRows2,
    revisionItems: revisionItemRows,
    revisionSessions: revisionSessionRows,
    studyDates: studySessionRows.map((s) => s.date),
    examAttempts,
    simAttempts,
    simCaseCount: simCaseRows.length,
    simCases,
    labImages,
    labRuns,
    errorPatterns: errorPatternRows,
    pairs: graph.pairsResolved,
    questions,
    conceptMeta,
    topicImportance,
    snapshots: snapshotRows,
    now,
  }
}

// ─── B) deriveConceptStates — every concept, multi-signal, published order ──

interface ConceptMetrics {
  id: string
  name: string
  topicId: string
  topicName: string
  subjectId: string
  subjectName: string
  examWeight: number
  inRegistry: boolean
  // measured families
  attempts: number
  correct: number
  accuracy: number | null
  meanTimeMs: number | null
  lastAttemptAt: Date | null
  lastAttemptCorrect: boolean | null
  flashReps: number
  flashLapses: number
  flashLastGrade: number | null
  flashLastAt: Date | null
  revisionTotal: number
  revisionCleared: number
  openMistakes: number
  repeatedOpen: number
  wrongCount: number
  lastWrongAt: Date | null
  caseRuns: number
  labRuns: number
  learnMark: string | null
  // state-derived
  score: number | null
  stabilityDays: number | null
  estRecall: number | null
  lastReviewedAt: Date | null
  families: number // measured signal families (engagement breadth)
}

function metricsFor(ctx: BrainContext): Map<string, ConceptMetrics> {
  const m = new Map<string, ConceptMetrics>()
  const graph = ctx.graph

  const ensure = (id: string): ConceptMetrics => {
    let e = m.get(id)
    if (e) return e
    const reg = graph.concepts.get(id)
    const meta = ctx.conceptMeta.get(id)
    e = {
      id,
      // best-effort identity for concepts outside the registry — never crash
      name: reg?.name ?? id,
      topicId: reg?.topicId ?? '',
      topicName: reg?.topicName ?? 'Unmapped topic',
      subjectId: reg?.subjectId ?? '',
      subjectName: reg?.subjectName ?? 'Unmapped subject',
      examWeight: meta?.examWeight ?? reg?.examRelevance ?? 3,
      inRegistry: !!reg,
      attempts: 0, correct: 0, accuracy: null, meanTimeMs: null, lastAttemptAt: null, lastAttemptCorrect: null,
      flashReps: 0, flashLapses: 0, flashLastGrade: null, flashLastAt: null,
      revisionTotal: 0, revisionCleared: 0,
      openMistakes: 0, repeatedOpen: 0, wrongCount: 0, lastWrongAt: null,
      caseRuns: 0, labRuns: 0, learnMark: null,
      score: null, stabilityDays: null, estRecall: null, lastReviewedAt: null,
      families: 0,
    }
    m.set(id, e)
    return e
  }

  // registry concepts first (stable DB order)
  for (const id of graph.conceptOrder) ensure(id)

  // MCQ attempt family (capped newest feed)
  const attemptAgg = new Map<string, { n: number; correct: number; timeSum: number; timeN: number; last: Date; lastCorrect: boolean }>()
  for (const a of ctx.attempts) {
    if (!a.conceptId) continue
    const agg = attemptAgg.get(a.conceptId) ?? { n: 0, correct: 0, timeSum: 0, timeN: 0, last: a.createdAt, lastCorrect: a.correct }
    agg.n += 1
    if (a.correct) agg.correct += 1
    if (a.timeMs > 0) { agg.timeSum += a.timeMs; agg.timeN += 1 }
    if (a.createdAt.getTime() > agg.last.getTime()) { agg.last = a.createdAt; agg.lastCorrect = a.correct }
    attemptAgg.set(a.conceptId, agg)
  }
  for (const [id, agg] of attemptAgg) {
    const e = ensure(id)
    e.attempts += agg.n
    e.correct += agg.correct
    e.accuracy = agg.n > 0 ? Math.round((agg.correct / agg.n) * 100) : null
    e.meanTimeMs = agg.timeN > 0 ? Math.round(agg.timeSum / agg.timeN) : null
    e.lastAttemptAt = agg.last
    e.lastAttemptCorrect = agg.lastCorrect
  }

  // KnowledgeState row (authoritative all-time score/recall/stability)
  for (const s of ctx.stateRows) {
    const e = ensure(s.conceptId)
    e.score = s.attemptCount > 0 || s.score > 0 ? s.score : null
    e.stabilityDays = s.stability
    e.lastReviewedAt = s.lastReviewed
    e.estRecall = s.lastReviewed ? clamp01(estimatedRecall(daysSince(ctx.now, s.lastReviewed), s.stability)) : null
    if (s.attemptCount > 0) {
      // all-time measured accuracy beats the capped-feed approximation
      e.accuracy = Math.round((s.correctCount / s.attemptCount) * 100)
      e.attempts = Math.max(e.attempts, s.attemptCount)
      e.correct = Math.max(e.correct, s.correctCount)
    }
  }

  // Flashcard family (reviews joined to cards in memory)
  for (const r of ctx.flashReviews) {
    if (!r.conceptId) continue
    const e = ensure(r.conceptId)
    e.flashReps += r.reps
    e.flashLapses += r.lapses
    if (e.flashLastAt == null || r.at.getTime() > e.flashLastAt.getTime()) {
      e.flashLastAt = r.at
      e.flashLastGrade = r.lastGrade
    }
  }

  // Revision family (RevisionItem rows carry the per-concept history)
  for (const r of ctx.revisionItems) {
    const e = ensure(r.conceptId)
    e.revisionTotal += 1
    if (r.cleared) e.revisionCleared += 1
  }

  // Mistake family
  for (const mk of ctx.mistakeRows) {
    if (!mk.conceptId) continue
    const e = ensure(mk.conceptId)
    e.wrongCount += mk.wrongCount
    if (mk.status !== 'resolved') {
      e.openMistakes += 1
      if (mk.wrongCount >= 2) e.repeatedOpen += 1
    }
    if (e.lastWrongAt == null || mk.lastWrongAt.getTime() > e.lastWrongAt.getTime()) e.lastWrongAt = mk.lastWrongAt
  }

  // Case family (SimCase brief.conceptIds)
  for (const run of ctx.simAttempts) {
    if (!run.completed) continue
    for (const cid of run.conceptIds) ensure(cid).caseRuns += 1
  }

  // Lab family (LabImage.conceptIds)
  for (const run of ctx.labRuns) {
    if (!run.completed) continue
    for (const cid of run.conceptIds) ensure(cid).labRuns += 1
  }

  // Learn marks (user-set progress marks)
  for (const id of graph.concepts.keys()) {
    const mark = graph.learnMarkOf(id)
    if (mark) ensure(id).learnMark = mark
  }

  // engagement breadth = number of measured signal families
  for (const e of m.values()) {
    let f = 0
    if (e.attempts > 0) f += 1
    if (e.flashReps > 0) f += 1
    if (e.revisionTotal > 0) f += 1
    if (e.wrongCount > 0) f += 1
    if (e.caseRuns > 0) f += 1
    if (e.labRuns > 0) f += 1
    if (e.learnMark) f += 1
    e.families = f
  }

  return m
}

function forgetRiskFor(recall: number | null): BrainForgetRisk {
  if (recall == null) return 'none' // never studied — honest 'none', not a guess
  if (recall < RISK_HIGH) return 'high'
  if (recall < RISK_MODERATE) return 'moderate'
  if (recall < RISK_LOW) return 'low'
  return 'none'
}

function daysToDecayFor(recall: number | null, stability: number | null): number | null {
  if (recall == null || stability == null) return null
  if (recall <= RISK_MODERATE) return 0
  return Math.round(stability * 1.6 * Math.log(recall / RISK_MODERATE) * 10) / 10
}

function signalsFor(e: ConceptMetrics): BrainSignal[] {
  const out: BrainSignal[] = []
  if (e.attempts > 0) {
    out.push({
      kind: 'mcq',
      label: `${plural(e.attempts, 'MCQ')} · ${e.accuracy ?? 0}% correct`,
      at: e.lastAttemptAt ? e.lastAttemptAt.toISOString() : undefined,
    })
  }
  if (e.flashReps > 0) {
    out.push({
      kind: 'flashcards',
      label: `${plural(e.flashReps, 'card rep')} · ${plural(e.flashLapses, 'lapse')}`,
      at: e.flashLastAt ? e.flashLastAt.toISOString() : undefined,
    })
  }
  if (e.revisionTotal > 0) {
    out.push({ kind: 'revision', label: `${plural(e.revisionTotal, 'revision item')} · ${e.revisionCleared} cleared`, at: undefined })
  }
  if (e.wrongCount > 0) {
    out.push({ kind: 'mistakes', label: `${plural(e.openMistakes, 'open mistake')} · wrong ${e.wrongCount}×`, at: e.lastWrongAt ? e.lastWrongAt.toISOString() : undefined })
  }
  if (e.caseRuns > 0) out.push({ kind: 'cases', label: `${plural(e.caseRuns, 'completed case run')}`, at: undefined })
  if (e.labRuns > 0) out.push({ kind: 'lab', label: `${plural(e.labRuns, 'lab run')}`, at: undefined })
  if (e.learnMark) out.push({ kind: 'learn-mark', label: `Marked ${e.learnMark}`, at: undefined })
  return out
}

export function deriveConceptStates(ctx: BrainContext): BrainConceptState[] {
  const metrics = metricsFor(ctx)
  const graph = ctx.graph

  // verified prerequisite edges: prereq → advanced (fromId is the prereq)
  const prereqsOf = new Map<string, string[]>() // advanced concept → [prereq ids]
  const unlocksCount = new Map<string, number>() // prereq concept → downstream count
  for (const e of graph.edges) {
    if (e.type !== 'prerequisite_of') continue
    const list = prereqsOf.get(e.toId) ?? []
    list.push(e.fromId)
    prereqsOf.set(e.toId, list)
    unlocksCount.set(e.fromId, (unlocksCount.get(e.fromId) ?? 0) + 1)
  }

  // phase 1: status per the PUBLISHED derivation order (mutually exclusive)
  const statusById = new Map<string, BrainConceptStatus>()
  for (const e of metrics.values()) {
    const engaged = e.families > 0
    let status: BrainConceptStatus
    if (!engaged) {
      status = 'not-started'
    } else if (e.score != null && e.score >= MASTERY_BAR && e.estRecall != null && e.estRecall < RECALL_AT_RISK) {
      status = 'at-risk'
    } else if ((e.estRecall != null && e.estRecall < RECALL_DUE) || e.repeatedOpen >= 2) {
      status = 'needs-revision'
    } else if (e.attempts >= 3 && e.accuracy != null && e.accuracy >= 75 && e.estRecall != null && e.estRecall >= RECALL_DUE && e.openMistakes === 0) {
      status = 'mastered'
    } else if (e.score != null && e.score >= MASTERY_BAR && e.estRecall != null && e.estRecall >= RECALL_STRONG) {
      status = 'strong'
    } else if ((e.score != null && e.score >= WEAK_BAR) || (e.families >= 2 && e.accuracy != null && e.accuracy >= 50)) {
      status = 'familiar'
    } else {
      status = 'learning'
    }
    statusById.set(e.id, status)
  }

  // phase 2: full state objects (+ prereqGap from unlearned prereqs)
  const states: BrainConceptState[] = []
  for (const e of metrics.values()) {
    const status = statusById.get(e.id) ?? 'not-started'
    const gap = (prereqsOf.get(e.id) ?? []).some((pid) => {
      const ps = statusById.get(pid) ?? 'not-started'
      return ps === 'not-started' || ps === 'learning'
    })
    states.push({
      conceptId: e.id,
      name: e.name,
      topicId: e.topicId,
      topicName: e.topicName,
      subjectId: e.subjectId,
      subjectName: e.subjectName,
      examWeight: e.examWeight,
      status,
      score: e.score != null ? Math.round(e.score) : null,
      estRecall: e.estRecall != null ? Math.round(e.estRecall * 1000) / 1000 : null,
      stabilityDays: e.stabilityDays,
      accuracy: e.accuracy,
      attempts: e.attempts,
      meanTimeMs: e.meanTimeMs,
      openMistakes: e.openMistakes,
      lastReviewedAt: e.lastReviewedAt ? e.lastReviewedAt.toISOString() : null,
      forgetRisk: forgetRiskFor(e.estRecall),
      daysToDecay: daysToDecayFor(e.estRecall, e.stabilityDays),
      signals: signalsFor(e),
      prereqGap: gap,
    })
  }

  // registry concepts first, then best-effort extras (stable order)
  states.sort((a, b) => {
    const ra = graph.concepts.has(a.conceptId) ? 0 : 1
    const rb = graph.concepts.has(b.conceptId) ? 0 : 1
    if (ra !== rb) return ra - rb
    return a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0
  })
  return states
}

// ─── shared derived views over states ────────────────────────────────────────

type StateMap = Map<string, BrainConceptState>

function stateMap(states: BrainConceptState[]): StateMap {
  return new Map(states.map((s) => [s.conceptId, s]))
}

function engagedOf(s: BrainConceptState): boolean {
  return s.status !== 'not-started'
}

/** Weak / at-risk pool: at-risk, needs-revision, or clearly weak mastery. */
function isWeakLike(s: BrainConceptState): boolean {
  if (s.status === 'at-risk' || s.status === 'needs-revision') return true
  return (s.status === 'learning' || s.status === 'familiar') && (s.score ?? 0) < WEAK_BAR
}

/** Impact = examWeight × weakness × decay (× mistake pressure). Deterministic. */
function impactOf(s: BrainConceptState, mistakes: number): number {
  const weakness = s.score != null ? 1 - s.score / 100 : 1
  const decay = s.estRecall != null ? 1 - s.estRecall : 1
  const mistakePressure = 1 + Math.min(mistakes, 4) * 0.25
  return (s.examWeight / 5) * (0.5 + 0.5 * weakness) * (0.4 + 0.6 * decay) * mistakePressure
}

function weakLikeStates(states: BrainConceptState[]): BrainConceptState[] {
  return states.filter(isWeakLike).sort((a, b) => impactOf(b, b.openMistakes) - impactOf(a, a.openMistakes))
}

function autoWeakness(states: BrainConceptState[]): BrainConceptState | null {
  const weak = weakLikeStates(states)
  return weak[0] ?? null
}

function stateOfMap(m: StateMap, id: string): BrainConceptState | undefined {
  return m.get(id)
}

// ─── C) buildBrainProfile — the measured student profile ────────────────────

export type BrainHomeProfile = BrainHomePayload['profile']

export function buildBrainProfile(ctx: BrainContext, states: BrainConceptState[]): BrainHomeProfile {
  const engagedTopics = new Set<string>()
  for (const s of states) {
    if (engagedOf(s) && s.topicId) engagedTopics.add(s.topicId)
  }
  const counts = countStates(states)

  const allTimeAccuracy = ctx.attemptsTotal > 0 ? Math.round((ctx.attemptsCorrect / ctx.attemptsTotal) * 100) : null
  const acc30 = ctx.attempts30 > 0 ? Math.round((ctx.attemptsCorrect30 / ctx.attempts30) * 100) : null

  const timeMsList = ctx.attempts.filter((a) => a.timeMs > 0).map((a) => a.timeMs)
  const medianSec = timeMsList.length ? Math.round((median(timeMsList) ?? 0) / 10) / 100 : null

  const percents = ctx.examAttempts.map((e) => e.percent).filter((p): p is number => p != null)
  const mockMean = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null
  const mockLast = percents.length ? percents[0]! : null // examAttempts are newest-first
  const mockBest = percents.length ? Math.max(...percents) : null

  // consistency: streak over every measured activity date
  const activityDates: Date[] = [
    ...ctx.attempts.map((a) => a.createdAt),
    ...ctx.studyDates,
    ...ctx.revisionSessions.map((r) => r.completedAt ?? r.createdAt),
    ...ctx.flashReviews.map((f) => f.at),
  ]
  const streakDays = computeStreak(activityDates)
  const cutoff = ctx.now.getTime() - 30 * DAY
  const activeDays30 = new Set(
    activityDates.filter((d) => d.getTime() >= cutoff).map((d) => istDayKey(d)),
  ).size

  return {
    topicsStudied: engagedTopics.size,
    topicsTotal: ctx.graph.topicById.size,
    conceptsByState: counts,
    questionAccuracy: allTimeAccuracy,
    accuracy30d: acc30,
    medianTimeSec: medianSec,
    revisionSessions: ctx.revisionSessions.length,
    mock: { attempts: ctx.examAttempts.length, meanScore: mockMean, lastScore: mockLast, bestScore: mockBest },
    consistency: { streakDays, activeDays30 },
    preferences: {
      prepStage: ctx.profile.prepStage,
      examLabel: ctx.profile.examMode ? ctx.profile.examLabel || 'College exam mode' : 'NEET-PG',
      dailyHours: ctx.profile.dailyHours,
      learningStyles: ctx.profile.learningStyles,
    },
  }
}

// ─── D) buildAnswers — the 7 deterministic intelligence answers ─────────────

function actionFor(view: View, opts: { conceptId?: string; topicId?: string; label: string; note?: string }): BrainAction {
  return { label: opts.label, view, conceptId: opts.conceptId, topicId: opts.topicId, note: opts.note }
}

function evidenceLine(s: BrainConceptState): string {
  const bits: string[] = []
  if (s.attempts > 0 && s.accuracy != null) bits.push(`${s.accuracy}% over ${plural(s.attempts, 'attempt')}`)
  if (s.score != null) bits.push(`mastery ${s.score}%`)
  if (s.estRecall != null) bits.push(`recall ${pct(s.estRecall)}%`)
  if (s.openMistakes > 0) bits.push(`${plural(s.openMistakes, 'open mistake')}`)
  return bits.join(' · ') || (s.signals[0]?.label ?? 'engaged')
}

export function buildAnswers(ctx: BrainContext, states: BrainConceptState[]): BrainAnswer[] {
  const byId = stateMap(states)
  const answers: BrainAnswer[] = []
  const measuredConcepts = states.filter(engagedOf).length

  // 1 — know
  {
    const strongish = states
      .filter((s) => s.status === 'mastered' || s.status === 'strong')
      .sort((a, b) => (b.score ?? 0) * (b.estRecall ?? 0) - (a.score ?? 0) * (a.estRecall ?? 0))
    const subjects = new Set(strongish.map((s) => s.subjectName))
    const items: BrainAnswerItem[] = strongish.slice(0, 6).map((s) => ({
      conceptId: s.conceptId,
      label: s.name,
      detail: `${s.subjectName} · ${s.topicName}`,
      evidence: evidenceLine(s),
      action: actionFor('graph', { conceptId: s.conceptId, label: 'View in Knowledge Graph' }),
    }))
    answers.push({
      id: 'know',
      question: 'What does this student know?',
      headline: strongish.length
        ? `${strongish.length} concept${strongish.length === 1 ? '' : 's'} strong or mastered across ${subjects.size} subject${subjects.size === 1 ? '' : 's'}`
        : 'No strong or mastered concepts yet — every expert started here',
      items,
      note: strongish.length >= 3 ? undefined : `Only ${measuredConcepts} concept${measuredConcepts === 1 ? '' : 's'} measured so far — this sharpens as you practice.`,
    })
  }

  // 2 — forget
  {
    const risky = states
      .filter((s) => engagedOf(s) && s.estRecall != null && s.estRecall < RISK_LOW)
      .sort((a, b) => (a.estRecall ?? 1) - (b.estRecall ?? 1))
      .slice(0, 5)
    const items: BrainAnswerItem[] = risky.map((s) => {
      const days = s.lastReviewedAt ? Math.round(daysSince(ctx.now, new Date(s.lastReviewedAt))) : null
      return {
        conceptId: s.conceptId,
        label: s.name,
        detail: `${s.subjectName} · ${s.topicName}`,
        evidence: `recall ${pct(s.estRecall ?? 0)}%${days != null ? ` · last reviewed ${plural(days, 'day')} ago` : ''}${s.daysToDecay != null && s.daysToDecay > 0 ? ` · ~${s.daysToDecay}d to the 0.6 line` : ' · past the 0.6 line'}`,
        action: actionFor('revision', { conceptId: s.conceptId, label: 'Revise now' }),
      }
    })
    answers.push({
      id: 'forget',
      question: 'What are they likely to forget?',
      headline: risky.length
        ? `${risky.length} concept${risky.length === 1 ? '' : 's'} below the safe-recall line`
        : 'Nothing at meaningful forgetting risk right now',
      items,
      note: risky.length ? undefined : measuredConcepts ? 'Your measured recall is holding above 0.75 across engaged concepts.' : 'No measured activity yet — recall estimates start after your first reviews.',
    })
  }

  // 3 — repeat
  {
    const sorted = [...ctx.mistakeRows].sort((a, b) => {
      const openA = a.status !== 'resolved' ? 1 : 0
      const openB = b.status !== 'resolved' ? 1 : 0
      if (openA !== openB) return openB - openA
      return b.wrongCount - a.wrongCount
    })
    const items: BrainAnswerItem[] = sorted.slice(0, 6).map((m) => {
      const name = (m.conceptId && stateOfMap(byId, m.conceptId)?.name) ?? m.stem.slice(0, 72)
      return {
        conceptId: m.conceptId ?? undefined,
        questionId: m.questionId,
        label: name,
        detail: m.conceptId ? stateOfMap(byId, m.conceptId)?.topicName ?? '' : 'Question-level mistake',
        evidence: `wrong ${m.wrongCount}× · ${m.status}${m.lastErrorType ? ` · ${errorLabel(m.lastErrorType)}` : ''}`,
        action: actionFor('mistakes', { conceptId: m.conceptId ?? undefined, label: 'Open mistake bank' }),
      }
    })
    answers.push({
      id: 'repeat',
      question: 'What are they repeatedly getting wrong?',
      headline: sorted.length
        ? `${sorted.filter((m) => m.status !== 'resolved').length} open mistake${sorted.filter((m) => m.status !== 'resolved').length === 1 ? '' : 's'} in the bank`
        : 'No mistakes recorded yet',
      items,
      note: sorted.length ? undefined : 'Mistakes appear here after your first wrong answers — the bank tracks repetition automatically.',
    })
  }

  // 4 — prereq
  {
    const graph = ctx.graph
    const prereqsOf = new Map<string, string[]>()
    for (const e of graph.edges) {
      if (e.type !== 'prerequisite_of') continue
      const list = prereqsOf.get(e.toId) ?? []
      list.push(e.fromId)
      prereqsOf.set(e.toId, list)
    }
    const unlearned = new Map<string, { name: string; blocks: string[]; weight: number }>()
    for (const s of states) {
      if (!isWeakLike(s)) continue
      for (const pid of prereqsOf.get(s.conceptId) ?? []) {
        const ps = stateOfMap(byId, pid)
        if (!ps || ps.status === 'not-started' || ps.status === 'learning') {
          const entry = unlearned.get(pid) ?? { name: ps?.name ?? pid, blocks: [], weight: 0 }
          entry.blocks.push(s.name)
          entry.weight = Math.max(entry.weight, s.examWeight)
          unlearned.set(pid, entry)
        }
      }
    }
    const ranked = [...unlearned.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, 6)
    const items: BrainAnswerItem[] = ranked.map(([pid, info]) => ({
      conceptId: pid,
      label: info.name,
      detail: info.blocks.length > 1 ? `blocks ${info.blocks.length} weak concepts` : `blocks ${info.blocks[0]}`,
      evidence: `blocks ${info.blocks.slice(0, 2).join(', ')}${info.blocks.length > 2 ? ` +${info.blocks.length - 2} more` : ''} · examWeight ${info.weight}`,
      action: actionFor('learn', { conceptId: pid, label: 'Learn this first' }),
    }))
    answers.push({
      id: 'prereq',
      question: 'Which prerequisites are missing?',
      headline: ranked.length
        ? `${ranked.length} unlearned prerequisite${ranked.length === 1 ? '' : 's'} sit under weak concepts`
        : 'No prerequisite gaps under your weak concepts',
      items,
      note: ranked.length ? 'Prerequisites come from verified concept edges — fixing the base first makes the weak concept stick.' : undefined,
    })
  }

  // 5 — next
  {
    const graph = ctx.graph
    const prereqsOf = new Map<string, string[]>()
    for (const e of graph.edges) {
      if (e.type !== 'prerequisite_of') continue
      const list = prereqsOf.get(e.toId) ?? []
      list.push(e.fromId)
      prereqsOf.set(e.toId, list)
    }
    const learned = (id: string) => {
      const s = stateOfMap(byId, id)
      return !!s && s.status !== 'not-started' && s.status !== 'learning'
    }
    const nexts = states
      .filter((s) => s.status === 'not-started' && graph.concepts.has(s.conceptId))
      .filter((s) => (prereqsOf.get(s.conceptId) ?? []).every(learned))
      .map((s) => {
        const importance = ctx.topicImportance.get(s.topicId) ?? 3
        const neetWeight = graph.subjects.find((sub) => sub.id === s.subjectId)?.neetWeight ?? 3
        return { s, rank: s.examWeight * importance * neetWeight }
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 6)
    const items: BrainAnswerItem[] = nexts.map(({ s }) => ({
      conceptId: s.conceptId,
      label: s.name,
      detail: `${s.subjectName} · ${s.topicName}`,
      evidence: `examWeight ${s.examWeight} · topic importance ${ctx.topicImportance.get(s.topicId) ?? 3}/5 · all prerequisites learned`,
      action: actionFor('hub', { topicId: s.topicId, label: 'Open topic hub' }),
    }))
    answers.push({
      id: 'next',
      question: 'What should they learn next?',
      headline: nexts.length
        ? `${nexts.length} high-yield concept${nexts.length === 1 ? '' : 's'} unlocked and unstarted`
        : 'Every unlocked concept has been started',
      items,
      note: nexts.length ? undefined : 'Start more concepts to unlock the next tier — prerequisites come from verified graph edges.',
    })
  }

  // 6 — revise
  {
    const nowMs = ctx.now.getTime()
    const openItems = ctx.revisionItems.filter((r) => !r.cleared)
    const due = openItems.filter((r) => r.dueAt.getTime() <= nowMs)
    const queued = new Set(openItems.map((r) => r.conceptId))
    const items: BrainAnswerItem[] = []
    for (const r of due.slice(0, 6)) {
      const s = stateOfMap(byId, r.conceptId)
      items.push({
        conceptId: r.conceptId,
        label: s?.name ?? r.conceptId,
        detail: r.reason || s?.topicName || 'Revision queue',
        evidence: `due ${istDayKey(r.dueAt)} · priority ${r.priority}${s?.estRecall != null ? ` · recall ${pct(s.estRecall)}%` : ''}`,
        action: actionFor('revision', { conceptId: r.conceptId, label: 'Open revision queue' }),
      })
    }
    let note: string | undefined
    if (ctx.settings.revisionPersonalizationOn) {
      const extra = states
        .filter((s) => engagedOf(s) && !queued.has(s.conceptId) && s.forgetRisk === 'high')
        .sort((a, b) => (a.estRecall ?? 1) - (b.estRecall ?? 1))
        .slice(0, Math.max(0, 6 - items.length))
      for (const s of extra) {
        items.push({
          conceptId: s.conceptId,
          label: s.name,
          detail: `${s.subjectName} · ${s.topicName}`,
          evidence: `recall ${pct(s.estRecall ?? 0)}% · high forgetting risk · not queued yet`,
          action: actionFor('revision', { conceptId: s.conceptId, label: 'Queue a revision' }),
        })
      }
      if (!items.length) note = 'Nothing due and nothing at high risk — your measured recall is holding.'
    } else {
      note = 'Revision personalization is off — showing your queued items only, no risk inference.'
    }
    answers.push({
      id: 'revise',
      question: 'What should they revise today?',
      headline: due.length
        ? `${due.length} revision item${due.length === 1 ? '' : 's'} due now`
        : items.length
          ? `${items.length} high-risk concept${items.length === 1 ? '' : 's'} worth revising today`
          : 'Revision queue is clear',
      items,
      note,
    })
  }

  // 7 — practice
  {
    const items: BrainAnswerItem[] = []
    let note: string | undefined
    if (ctx.settings.questionPersonalizationOn) {
      const pair = pickConfusionPair(ctx, byId)
      if (pair) {
        items.push({
          label: `${pair.aName} vs ${pair.bName}`,
          detail: 'Discrimination drill — contrast the two before answering',
          evidence: pair.wrongCount > 0
            ? `you have missed ${plural(pair.wrongCount, 'question')} across these two concepts`
            : 'verified confusable pair, both sides in your weak pool',
          action: actionFor('adaptive', { conceptId: pair.aId, label: 'Drill this pair', note: pair.pairId }),
        })
      }
      const weak = weakLikeStates(states).slice(0, 4)
      for (const s of weak) {
        const pool = ctx.graph.concepts.get(s.conceptId)?.questionCount ?? 0
        if (pool <= 0) continue
        items.push({
          conceptId: s.conceptId,
          label: s.name,
          detail: `${s.subjectName} · ${s.topicName}`,
          evidence: `${plural(pool, 'question')} in the pool · ${evidenceLine(s)}`,
          action: actionFor('adaptive', { conceptId: s.conceptId, label: 'Practice weak concept' }),
        })
      }
      if (!items.length) note = measuredConcepts
        ? 'No measured weakness yet — adaptive practice starts from the full pool.'
        : 'Answer your first questions to unlock measured practice targeting.'
    } else {
      const generic = states
        .filter((s) => s.status !== 'mastered' && ctx.graph.concepts.has(s.conceptId))
        .sort((a, b) => b.examWeight - a.examWeight)
        .slice(0, 3)
      for (const s of generic) {
        const pool = ctx.graph.concepts.get(s.conceptId)?.questionCount ?? 0
        items.push({
          conceptId: s.conceptId,
          label: s.name,
          detail: `${s.subjectName} · ${s.topicName}`,
          evidence: `high exam weight (${s.examWeight}/5) · ${plural(pool, 'question')} in the pool`,
          action: actionFor('adaptive', { conceptId: s.conceptId, label: 'Practice high-yield' }),
        })
      }
      note = 'Question personalization is off — showing high-yield curriculum picks, not your measured weaknesses.'
    }
    answers.push({
      id: 'practice',
      question: 'Which questions should they practice?',
      headline: items.length
        ? `${items.length} measured target${items.length === 1 ? '' : 's'} for the next practice block`
        : 'No practice targets yet',
      items,
      note,
    })
  }

  return answers
}

// ─── E) buildBrainPath — the 7-stage dynamic path ───────────────────────────

function feedForConcept(ctx: BrainContext, conceptId: string) {
  const attempts = ctx.attempts.filter((a) => a.conceptId === conceptId)
  const mistakes = ctx.mistakeRows.filter((m) => m.conceptId === conceptId)
  const lastWrongAt = mistakes.reduce<Date | null>((acc, m) => (!acc || m.lastWrongAt.getTime() > acc.getTime() ? m.lastWrongAt : acc), null)
  const lastCorrectAfterWrong = attempts
    .filter((a) => a.correct && lastWrongAt != null && a.createdAt.getTime() > lastWrongAt.getTime())
    .length
  return { attempts, mistakes, lastWrongAt, lastCorrectAfterWrong }
}

export function buildBrainPath(ctx: BrainContext, states: BrainConceptState[], conceptId?: string): BrainPathPayload {
  const byId = stateMap(states)
  const graph = ctx.graph

  let focus: BrainConceptState | null = null
  if (conceptId) focus = stateOfMap(byId, conceptId) ?? null
  if (!focus) focus = autoWeakness(states)
  if (!focus) {
    // no weakness at all → fall back to the first high-yield unstarted concept
    focus = states.find((s) => s.status === 'not-started' && graph.concepts.has(s.conceptId)) ?? states[0] ?? null
  }

  if (!focus) {
    return {
      focus: null,
      reason: 'No concepts in the curriculum registry yet.',
      stages: [],
      alternatives: [],
      insufficientData: true,
      note: 'The path starts once the curriculum registry is available.',
    }
  }

  const feed = feedForConcept(ctx, focus.conceptId)
  const impactLine = `${focus.attempts > 0 ? `${focus.accuracy ?? 0}% accuracy over ${plural(feed.attempts.length, 'attempt')}` : 'not attempted yet'}${focus.estRecall != null ? ` · recall at ${pct(focus.estRecall)}%` : ''} · examWeight ${focus.examWeight}`

  const alternatives = weakLikeStates(states)
    .filter((s) => s.conceptId !== focus!.conceptId)
    .slice(0, 3)
    .map((s) => ({
      conceptId: s.conceptId,
      name: s.name,
      reason: `${s.status === 'at-risk' ? 'was strong, now fading' : s.status === 'needs-revision' ? 'due for revision' : `${s.score ?? 0}% mastery`}${s.estRecall != null ? ` · recall ${pct(s.estRecall)}%` : ''} · examWeight ${s.examWeight}`,
    }))

  const insufficientData = feed.attempts.length === 0 && focus.signals.length === 0

  const openPool = ctx.graph.concepts.get(focus.conceptId)?.questionCount ?? 0
  const meta = ctx.conceptMeta.get(focus.conceptId)
  const revisionRows = ctx.revisionItems.filter((r) => r.conceptId === focus!.conceptId)
  const lastAttempt = feed.attempts[0] ?? null // feed is newest-first
  const unlocks = graph.edges.filter((e) => e.fromId === focus!.conceptId && e.type === 'prerequisite_of').length

  const lessonAction: BrainAction = actionFor('learn', { conceptId: focus.conceptId, label: meta?.lesson ? 'Open the lesson' : 'Open in Learn' })

  const stages: BrainPathStage[] = [
    {
      id: 'next',
      title: 'Next up',
      line: focus.status === 'not-started'
        ? `Start ${focus.name} — a high-yield concept in ${focus.topicName}.`
        : `${focus.name} is on your path (${focus.status.replace('-', ' ')}).`,
      done: focus.status !== 'not-started',
      current: false,
      evidence: [`examWeight ${focus.examWeight}/5`, unlocks > 0 ? `unlocks ${unlocks} downstream concept${unlocks === 1 ? '' : 's'}` : `part of ${focus.topicName}`],
      actions: [actionFor('hub', { topicId: focus.topicId, label: 'Open topic hub' }), lessonAction],
    },
    {
      id: 'learn',
      title: 'Learn',
      line: meta?.lesson
        ? 'Read the structured lesson, then close it and free-recall the core mechanism.'
        : 'Study from the concept map and summary — no structured lesson exists for this one yet.',
      done: focus.attempts > 0 || !!focus.signals.some((s) => s.kind === 'learn-mark'),
      current: false,
      evidence: meta?.lesson ? ['structured lesson available'] : ['summary + graph edges available'],
      actions: [lessonAction],
    },
    {
      id: 'practice',
      title: 'Practice',
      line: feed.attempts.length >= 3
        ? `${plural(feed.attempts.length, 'attempt')} logged — keep accuracy above 75% to build mastery.`
        : `Solve at least 3 questions to make the state measurable (${openPool} in the pool).`,
      done: feed.attempts.length >= 3,
      current: false,
      evidence: [`${openPool} question${openPool === 1 ? '' : 's'} in the pool`, feed.attempts.length ? `${focus.accuracy ?? 0}% so far` : 'no attempts yet'],
      actions: [actionFor('questions', { conceptId: focus.conceptId, label: 'Practice MCQs' }), actionFor('adaptive', { conceptId: focus.conceptId, label: 'Adaptive block' })],
    },
    {
      id: 'correct',
      title: 'Correct mistakes',
      line: feed.mistakes.length
        ? `${feed.mistakes.filter((m) => m.status !== 'resolved').length} open mistake${feed.mistakes.filter((m) => m.status !== 'resolved').length === 1 ? '' : 's'} to clear from the bank.`
        : 'No mistakes recorded here — clean run so far.',
      done: feed.attempts.length >= 3 && feed.mistakes.every((m) => m.status === 'resolved'),
      current: false,
      evidence: feed.mistakes.length
        ? [`${plural(feed.mistakes.length, 'mistake')} · wrong ${feed.mistakes.reduce((a, m) => a + m.wrongCount, 0)}× total`]
        : ['no wrong answers measured'],
      actions: [actionFor('mistakes', { conceptId: focus.conceptId, label: 'Open mistake bank' })],
    },
    {
      id: 'revise',
      title: 'Revise',
      line: revisionRows.length
        ? `${revisionRows.filter((r) => r.cleared).length}/${revisionRows.length} revision item${revisionRows.length === 1 ? '' : 's'} cleared.`
        : 'Schedule one spaced revision — stability only grows through spaced recall.',
      done: revisionRows.some((r) => r.cleared),
      current: false,
      evidence: focus.stabilityDays != null ? [`memory stability ${focus.stabilityDays}d`, focus.estRecall != null ? `recall now ${pct(focus.estRecall)}%` : 'recall unmeasured'] : ['no revision yet'],
      actions: [actionFor('revision', { conceptId: focus.conceptId, label: 'Open revision queue' })],
    },
    {
      id: 'retest',
      title: 'Retest',
      line: feed.lastWrongAt
        ? feed.lastCorrectAfterWrong > 0
          ? 'You retested correctly after your last mistake — the fix is holding.'
          : 'One clean retest after the last mistake closes the loop.'
        : 'Confirm with one more correct attempt from a fresh question.',
      done: feed.lastWrongAt
        ? feed.lastCorrectAfterWrong > 0
        : lastAttempt != null && lastAttempt.correct,
      current: false,
      evidence: feed.lastWrongAt
        ? [`last wrong ${istDayKey(feed.lastWrongAt)}`, feed.lastCorrectAfterWrong > 0 ? 'correct retest on record' : 'no clean retest yet']
        : [lastAttempt ? `last attempt ${lastAttempt.correct ? 'correct' : 'wrong'}` : 'no attempts yet'],
      actions: [actionFor('adaptive', { conceptId: focus.conceptId, label: 'Adaptive retest' })],
    },
    {
      id: 'mastery',
      title: 'Mastery',
      line: focus.status === 'mastered'
        ? 'Mastered — 3+ attempts at 75%+ with recall holding and no open mistakes. Do not grind it further.'
        : 'Mastery = attempts ≥ 3 · accuracy ≥ 75% · recall ≥ 0.6 · 0 open mistakes (the published bar).',
      done: focus.status === 'mastered',
      current: false,
      evidence: [evidenceLine(focus)],
      actions: [actionFor('graph', { conceptId: focus.conceptId, label: 'View in Knowledge Graph' })],
    },
  ]

  // current = first not-done stage; everything before it is done
  let currentIdx = stages.findIndex((s) => !s.done)
  if (currentIdx === -1) currentIdx = stages.length // all done
  stages.forEach((s, i) => {
    s.current = i === currentIdx
    if (i < currentIdx) s.done = true
  })

  const reason = insufficientData
    ? `${focus.name} has no measured signals yet — the path starts at first contact. examWeight ${focus.examWeight}.`
    : impactLine

  const note = insufficientData
    ? 'This path has no measured data for the focus concept yet — stages light up as you learn, practice and revise.'
    : focus.status === 'mastered'
      ? 'Focus concept is mastered — alternatives below carry the remaining risk.'
      : 'Every stage is computed from your measured activity — nothing here is a guess.'

  return { focus, reason, stages, alternatives, insufficientData, note }
}

// ─── F) buildMemory — the forgetting surface ────────────────────────────────

export function buildMemory(ctx: BrainContext, states: BrainConceptState[]): BrainMemoryPayload {
  const byId = stateMap(states)
  const nowMs = ctx.now.getTime()
  const dueNow = ctx.revisionItems.filter((r) => !r.cleared && r.dueAt.getTime() <= nowMs).length

  const rows: BrainMemoryRow[] = states
    .filter((s) => engagedOf(s))
    .map((s) => {
      const e = metricsLookup(ctx, s.conceptId)
      const correctRetests = s.attempts > 0 && s.accuracy != null ? Math.round((s.attempts * s.accuracy) / 100) : 0
      const success = Math.max(0, e.flashReps - e.flashLapses) + correctRetests
      const retrievalSuccess = success + e.flashLapses > 0 ? Math.round((success / (success + e.flashLapses)) * 100) : null
      const signals: string[] = []
      if (s.attempts > 0 && s.accuracy != null) signals.push(`${s.accuracy}% over ${plural(s.attempts, 'MCQ')}`)
      if (e.flashReps > 0) signals.push(`${plural(e.flashReps, 'card rep')} · ${plural(e.flashLapses, 'lapse')}`)
      if (e.revisionTotal > 0) signals.push(`${plural(e.revisionTotal, 'revision item')} (${e.revisionCleared} cleared)`)
      if (s.openMistakes > 0) signals.push(`${plural(s.openMistakes, 'open mistake')}`)
      if (e.caseRuns > 0) signals.push(`${plural(e.caseRuns, 'case run')}`)
      if (e.labRuns > 0) signals.push(`${plural(e.labRuns, 'lab run')}`)
      return {
        conceptId: s.conceptId,
        name: s.name,
        topicName: s.topicName,
        subjectName: s.subjectName,
        lastReviewedAt: s.lastReviewedAt,
        stabilityDays: s.stabilityDays,
        estRecall: s.estRecall,
        forgetRisk: s.forgetRisk,
        daysToDecay: s.daysToDecay,
        revisions: e.revisionTotal,
        flashcards: { reps: e.flashReps, lapses: e.flashLapses, lastGrade: e.flashLastGrade },
        wrongCount: s.openMistakes,
        retrievalSuccess,
        signals,
      }
    })
    .sort((a, b) => (a.estRecall ?? 2) - (b.estRecall ?? 2))

  const highRisk = rows.filter((r) => r.forgetRisk === 'high').length
  const moderateRisk = rows.filter((r) => r.forgetRisk === 'moderate').length
  const engagedCount = rows.length

  return {
    generatedAt: ctx.now.toISOString(),
    rows,
    summary: {
      highRisk,
      moderateRisk,
      dueNow,
      note: engagedCount
        ? `${engagedCount} engaged concept${engagedCount === 1 ? '' : 's'} tracked · recall = e^(−t/1.6·stability), recomputed on every load.`
        : 'No engaged concepts yet — memory tracking starts after your first questions, cards or revision passes.',
    },
  }
}

// metrics lookup shared by memory/content builders (recomputes from ctx rows;
// deterministic and cheap at this scale)
function metricsLookup(ctx: BrainContext, conceptId: string) {
  let flashReps = 0
  let flashLapses = 0
  let flashLastGrade: number | null = null
  let flashLastAt: Date | null = null
  for (const r of ctx.flashReviews) {
    if (r.conceptId !== conceptId) continue
    flashReps += r.reps
    flashLapses += r.lapses
    if (!flashLastAt || r.at.getTime() > flashLastAt.getTime()) {
      flashLastAt = r.at
      flashLastGrade = r.lastGrade
    }
  }
  let revisionTotal = 0
  let revisionCleared = 0
  for (const r of ctx.revisionItems) {
    if (r.conceptId !== conceptId) continue
    revisionTotal += 1
    if (r.cleared) revisionCleared += 1
  }
  let caseRuns = 0
  for (const run of ctx.simAttempts) {
    if (run.completed && run.conceptIds.includes(conceptId)) caseRuns += 1
  }
  let labRuns = 0
  for (const run of ctx.labRuns) {
    if (run.completed && run.conceptIds.includes(conceptId)) labRuns += 1
  }
  return { flashReps, flashLapses, flashLastGrade, revisionTotal, revisionCleared, caseRuns, labRuns }
}

// ─── G) buildTutorPack — transparency-first tutor context ───────────────────

export function buildTutorPack(ctx: BrainContext, states: BrainConceptState[]): BrainTutorPack {
  const enabled = ctx.settings.tutorContextOn && ctx.settings.personalizationOn
  if (!enabled) {
    return {
      enabled: false,
      blocks: [],
      masteredNotToRepeat: [],
      note: 'Tutor context is switched off — the AI tutor receives none of this. Toggle it in Privacy to enable measured personalization.',
    }
  }

  const byId = stateMap(states)
  const weak = weakLikeStates(states).slice(0, 6)
  const focus = weak[0] ?? null
  const forgetful = states
    .filter((s) => engagedOf(s) && s.estRecall != null && s.estRecall < RISK_LOW)
    .sort((a, b) => (a.estRecall ?? 1) - (b.estRecall ?? 1))
    .slice(0, 4)
  const errorTypes = ctx.errorPatterns.slice(0, 3)
  const strengths = states
    .filter((s) => s.status === 'mastered' || s.status === 'strong')
    .sort((a, b) => (b.score ?? 0) * (b.estRecall ?? 1) - (a.score ?? 0) * (a.estRecall ?? 1))
    .slice(0, 3)
  const openItems = ctx.revisionItems.filter((r) => !r.cleared)
  const due = openItems.filter((r) => r.dueAt.getTime() <= ctx.now.getTime())
  const mockPercents = ctx.examAttempts.map((e) => ({ label: e.label || e.mode, percent: e.percent })).slice(0, 2)
  const clock = ctx.profile.gradYear > 0
    ? examClock(ctx.profile.year, ctx.profile.gradYear, ctx.profile.dailyHours, ctx.profile.examDate)
    : null

  const blocks: { title: string; lines: string[] }[] = []

  if (focus) {
    blocks.push({
      title: 'CURRENT FOCUS',
      lines: [
        `${focus.name} (${focus.subjectName} · ${focus.topicName}) — ${evidenceLine(focus)}`,
      ],
    })
  }
  if (weak.length) {
    blocks.push({
      title: 'WEAK CONCEPTS',
      lines: weak.map((s) => `- ${s.name}: ${s.score != null ? `mastery ${s.score}%` : 'unmeasured score'}${s.estRecall != null ? `, recall ${pct(s.estRecall)}%` : ''}${s.openMistakes > 0 ? `, ${plural(s.openMistakes, 'open mistake')}` : ''}`),
    })
  }
  if (forgetful.length) {
    blocks.push({
      title: 'LIKELY TO FORGET',
      lines: forgetful.map((s) => {
        const days = s.lastReviewedAt ? Math.round(daysSince(ctx.now, new Date(s.lastReviewedAt))) : null
        return `- ${s.name}: recall ${pct(s.estRecall ?? 0)}%${days != null ? `, last reviewed ${plural(days, 'day')} ago` : ''}`
      }),
    })
  }
  if (errorTypes.length) {
    blocks.push({
      title: 'REPEATED MISTAKES',
      lines: errorTypes.map((e) => {
        const conceptName = e.conceptId ? stateOfMap(byId, e.conceptId)?.name : null
        return `- ${errorLabel(e.errorType)} ×${e.count}${conceptName ? ` (most on ${conceptName})` : ''}`
      }),
    })
  }
  if (strengths.length) {
    blocks.push({
      title: 'STRENGTHS — DO NOT RE-TEACH',
      lines: strengths.map((s) => `- ${s.name} (${s.score ?? 0}% mastery, recall ${s.estRecall != null ? pct(s.estRecall) : '—'}%)`),
    })
  }
  if (openItems.length) {
    const top3 = [...openItems]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3)
      .map((r) => stateOfMap(byId, r.conceptId)?.name ?? r.conceptId)
    blocks.push({
      title: 'REVISION DUE',
      lines: [`${due.length} of ${openItems.length} queued item${openItems.length === 1 ? '' : 's'} due now`, top3.length ? `Top priority: ${top3.join(', ')}` : 'Queue is empty of priorities'],
    })
  }
  if (mockPercents.length) {
    blocks.push({
      title: 'RECENT MOCKS',
      lines: mockPercents.map((m) => `- ${m.label}: ${m.percent != null ? `${m.percent}%` : 'score not analyzable'}`),
    })
  }
  if (clock) {
    blocks.push({
      title: 'EXAM CLOCK',
      lines: [`~${clock.daysLeft} days left (${clock.isEstimate ? 'estimated window — verify with official NBEMS announcements' : 'student-set date'}) · stage: ${clock.stage}`],
    })
  }

  return {
    enabled: true,
    blocks,
    masteredNotToRepeat: strengths.map((s) => s.name),
    note: 'These are the exact measured blocks the AI tutor receives. No chain-of-thought is ever shared — the tutor sees conclusions only.',
  }
}

/** Renders the pack as the compact prompt block appended to the tutor system prompt. */
export function serializeBrainTutorContext(pack: BrainTutorPack): string {
  if (!pack.enabled || pack.blocks.length === 0) return ''
  const body = pack.blocks
    .map((b) => `${b.title}:\n${b.lines.map((l) => `  ${l}`).join('\n')}`)
    .join('\n')
  return `${body}\n\nLEARNING-INTELLIGENCE RULES:\n- Use ONLY this measured data about the student; never invent history; skip re-teaching strengths unless asked; conclusions only, never your deliberation.`
}

// ─── H) buildPractice — measured question feed ──────────────────────────────

interface PairPick {
  pairId: string
  aId: string
  bId: string
  aName: string
  bName: string
  wrongCount: number
}

function pickConfusionPair(ctx: BrainContext, byId: StateMap): PairPick | null {
  for (const p of ctx.pairs) {
    const sa = stateOfMap(byId, p.aId)
    const sb = stateOfMap(byId, p.bId)
    const weakA = sa && (isWeakLike(sa) || (sa.score ?? 100) < WEAK_BAR)
    const weakB = sb && (isWeakLike(sb) || (sb.score ?? 100) < WEAK_BAR)
    if (!weakA && !weakB) continue
    const wrongCount = ctx.attempts.filter(
      (a) => !a.correct && a.conceptId && (a.conceptId === p.aId || a.conceptId === p.bId),
    ).length
    return {
      pairId: p.pairId,
      aId: p.aId,
      bId: p.bId,
      aName: sa?.name ?? p.aId,
      bName: sb?.name ?? p.bId,
      wrongCount,
    }
  }
  return null
}

function toPracticeQuestion(q: BrainQuestionLite, why: string): BrainPracticeQuestion {
  return { id: q.id, stem: q.stem, subjectCode: q.subjectCode, topicId: q.topicId, conceptId: q.conceptId, why }
}

export function buildPractice(ctx: BrainContext, states: BrainConceptState[]): BrainPracticePayload {
  const handoff: BrainAction = { label: 'Open adaptive practice', view: 'adaptive' }
  const measuredConcepts = states.filter(engagedOf).length

  if (!ctx.settings.questionPersonalizationOn) {
    return {
      generatedAt: ctx.now.toISOString(),
      focusLine: 'Question personalization is off — this feed stays generic until you switch it back on.',
      confusionPair: null,
      discriminationQuestions: [],
      weaknessQuestions: [],
      handoff,
      note: 'Toggle "Question feed" in Privacy to target your measured weak concepts and confusion pairs.',
    }
  }

  const byId = stateMap(states)
  const pair = pickConfusionPair(ctx, byId)
  const weak = weakLikeStates(states)

  const discriminationQuestions: BrainPracticeQuestion[] = []
  if (pair) {
    const pool = ctx.questions
      .filter((q) => q.conceptId === pair.aId || q.conceptId === pair.bId)
      .sort((a, b) => b.difficulty - a.difficulty || (a.id < b.id ? -1 : 1))
    for (const q of pool.slice(0, 5)) {
      discriminationQuestions.push(toPracticeQuestion(q, pair.wrongCount > 0
        ? `discriminates ${pair.aName} vs ${pair.bName} — you have missed ${plural(pair.wrongCount, 'question')} across these two`
        : `discriminates ${pair.aName} vs ${pair.bName} — the verified confusable pair in your weak pool`))
    }
  }

  const weaknessQuestions: BrainPracticeQuestion[] = []
  for (const s of weak.slice(0, 3)) {
    if (weaknessQuestions.length >= 5) break
    const pool = ctx.questions
      .filter((q) => q.conceptId === s.conceptId)
      .sort((a, b) => b.difficulty - a.difficulty || (a.id < b.id ? -1 : 1))
    const why = s.attempts > 0 && s.accuracy != null
      ? `${s.accuracy}% accuracy over ${plural(s.attempts, 'attempt')}${s.estRecall != null ? ` · recall ${pct(s.estRecall)}%` : ''}`
      : 'in your weak pool from mistakes and low recall'
    for (const q of pool.slice(0, Math.max(1, 5 - weaknessQuestions.length))) {
      if (weaknessQuestions.length >= 5) break
      if (discriminationQuestions.some((d) => d.id === q.id)) continue
      weaknessQuestions.push(toPracticeQuestion(q, `${s.name} — ${why}`))
    }
  }

  const focusLine = pair
    ? `Start with the ${pair.aName} vs ${pair.bName} discrimination — then clear your weakest concepts.`
    : weak.length
      ? `Targeting ${weak[0]!.name} and ${Math.min(weak.length - 1, 2)} more weak concept${weak.length === 2 ? '' : 's'} from your measured pool.`
      : measuredConcepts
        ? 'No measured weakness yet — adaptive practice will start broad and narrow down.'
        : 'No measured activity yet — your first questions teach the brain your baseline.'

  return {
    generatedAt: ctx.now.toISOString(),
    focusLine,
    confusionPair: pair
      ? {
          a: pair.aName,
          b: pair.bName,
          line: pair.wrongCount > 0
            ? `You have missed ${plural(pair.wrongCount, 'question')} across these two concepts — drill the discriminators.`
            : 'Verified confusable pair with both sides in your weak pool.',
          conceptIds: [pair.aId, pair.bId],
        }
      : null,
    discriminationQuestions,
    weaknessQuestions,
    handoff,
    note: 'Questions come from the real platform pool — answers and explanations stay hidden until you submit via the practice flow.',
  }
}

// ─── I) buildContent — measured platform content recommendations ────────────

export function buildContent(ctx: BrainContext, states: BrainConceptState[], conceptId?: string): BrainContentPayload {
  const byId = stateMap(states)
  let focus: BrainConceptState | null = conceptId ? stateOfMap(byId, conceptId) ?? null : null
  let note = 'Measured platform content for the focus concept — zero counts are honest zeros.'

  if (!focus) {
    if (ctx.settings.contentPersonalizationOn) {
      focus = autoWeakness(states)
      note = focus
        ? 'Focus auto-picked from your measured weakness — every rec below carries its measured count.'
        : 'No measured weakness yet — switch on personalization data by practicing, or pick a concept from the Knowledge tab.'
    } else {
      focus = states
        .filter((s) => s.status !== 'mastered' && ctx.graph.concepts.has(s.conceptId))
        .sort((a, b) => b.examWeight - a.examWeight)[0] ?? null
      note = 'Content personalization is off — showing the highest exam-weight concept from the curriculum, still measured.'
    }
  }
  if (!focus) {
    return {
      generatedAt: ctx.now.toISOString(),
      focus: null,
      recs: [],
      note: 'Nothing to recommend yet — the curriculum registry is empty.',
    }
  }

  const cid = focus.conceptId
  const meta = ctx.conceptMeta.get(cid)
  const graphC = ctx.graph.concepts.get(cid)
  const mcqCount = graphC?.questionCount ?? 0
  const pyqCount = graphC?.pyqCount ?? 0
  const cardCount = graphC?.flashcardCount ?? 0
  const caseCount = ctx.simCases.filter((c) => c.conceptIds.includes(cid)).length
  const imageCount = ctx.labImages.filter((i) => i.conceptIds.includes(cid)).length
  const revisionOpen = ctx.revisionItems.filter((r) => r.conceptId === cid && !r.cleared).length
  const revisionCleared = ctx.revisionItems.filter((r) => r.conceptId === cid && r.cleared).length

  const recs: BrainContentRec[] = [
    {
      kind: 'lesson',
      label: 'Structured lesson',
      count: meta?.lesson ? 1 : 0,
      detail: meta?.lesson
        ? 'Read → recall → detail sections, built for this concept'
        : 'No platform lesson yet — the concept map and summary carry it',
      action: actionFor('learn', { conceptId: cid, label: 'Open in Learn' }),
    },
    {
      kind: 'mcq',
      label: 'MCQs in pool',
      count: mcqCount,
      detail: mcqCount > 0 ? `Practice from ${plural(mcqCount, 'concept-linked question')}` : 'No questions tagged to this concept yet',
      action: actionFor('questions', { conceptId: cid, label: 'Practice MCQs' }),
    },
    {
      kind: 'pyq',
      label: 'PYQ-pattern questions',
      count: pyqCount,
      detail: pyqCount > 0 ? `${plural(pyqCount, 'question')} tagged pyq-pattern` : 'No PYQ-pattern tags on this concept',
      action: actionFor('questions', { conceptId: cid, label: 'Practice PYQs', note: 'pyq-pattern' }),
    },
    {
      kind: 'case',
      label: 'Clinical cases',
      count: caseCount,
      detail: caseCount > 0 ? `${plural(caseCount, 'simulator case')} touches this concept` : 'No simulator case maps to this concept',
      action: actionFor('cases', { conceptId: cid, label: 'Open case simulator' }),
    },
    {
      kind: 'image',
      label: 'Image lab',
      count: imageCount,
      detail: imageCount > 0 ? `${plural(imageCount, 'lab image')} linked to this concept` : 'No lab images link to this concept',
      action: actionFor('lab', { conceptId: cid, label: 'Open image lab' }),
    },
    {
      kind: 'flashcards',
      label: 'Flashcards',
      count: cardCount,
      detail: cardCount > 0 ? `${plural(cardCount, 'card')} in the spaced-repetition deck` : 'No flashcards for this concept',
      action: actionFor('revise', { conceptId: cid, label: 'Open flashcards' }),
    },
    {
      kind: 'revision',
      label: 'Revision items',
      count: revisionOpen,
      detail: revisionOpen + revisionCleared > 0
        ? `${revisionOpen} open · ${revisionCleared} cleared in your queue`
        : 'Nothing queued — schedule one spaced pass',
      action: actionFor('revision', { conceptId: cid, label: 'Open revision queue' }),
    },
  ]

  return {
    generatedAt: ctx.now.toISOString(),
    focus: { conceptId: cid, name: focus.name },
    recs,
    note,
  }
}

// ─── J) buildStrategy — evidence-based exam strategy (never a rank promise) ─

export async function buildStrategy(ctx: BrainContext, states: BrainConceptState[]): Promise<BrainStrategyPayload> {
  const clock = ctx.profile.gradYear > 0
    ? examClock(ctx.profile.year, ctx.profile.gradYear, ctx.profile.dailyHours, ctx.profile.examDate)
    : null

  // readiness reuses the P13 explainable composite (excluded dims = data-poor)
  let readiness: BrainStrategyPayload['readiness'] = null
  try {
    const perf = await buildPerformancePayload()
    if (perf.readiness) {
      readiness = {
        current: perf.readiness.overall,
        band: perf.readiness.band,
        dataPoorDims: perf.readiness.excluded,
      }
    }
  } catch { /* readiness is best-effort — strategy never breaks on it */ }

  const highImpactWeaknesses = weakLikeStates(states).slice(0, 5).map((s) => ({
    conceptId: s.conceptId,
    name: s.name,
    line: `${s.attempts > 0 ? `${s.accuracy ?? 0}% accuracy over ${plural(s.attempts, 'attempt')}` : 'no attempts measured'}${s.estRecall != null ? ` · recall ${pct(s.estRecall)}%` : ''}${s.openMistakes > 0 ? ` · ${plural(s.openMistakes, 'open mistake')}` : ''} · examWeight ${s.examWeight}`,
    examWeight: s.examWeight,
    action: actionFor('learn', { conceptId: s.conceptId, label: 'Repair this concept' }),
  }))

  const strongAreas = states
    .filter((s) => s.status === 'mastered' || s.status === 'strong')
    .sort((a, b) => (b.score ?? 0) * (b.estRecall ?? 0) - (a.score ?? 0) * (a.estRecall ?? 0))
    .slice(0, 4)
    .map((s) => ({
      conceptId: s.conceptId,
      name: s.name,
      line: `${s.score ?? 0}% mastery · recall ${s.estRecall != null ? pct(s.estRecall) : '—'}% — protect with spaced touches, don\u2019t grind`,
    }))

  // time management: median vs the 63s pace + timed-vs-untimed accuracy split
  const timed = ctx.attempts.filter((a) => a.timeMs >= MIN_TIMED_MS)
  const untimed = ctx.attempts.filter((a) => a.timeMs > 0 && a.timeMs < MIN_TIMED_MS)
  const medianMs = median(timed.map((a) => a.timeMs))
  const medianSec = medianMs != null ? Math.round(medianMs / 1000) : null
  const timedAccuracy = timed.length ? Math.round((timed.filter((a) => a.correct).length / timed.length) * 100) : null
  const untimedAccuracy = untimed.length ? Math.round((untimed.filter((a) => a.correct).length / untimed.length) * 100) : null
  let timeLine: string
  if (medianSec == null) {
    timeLine = 'No timed attempts measured yet — timing is judged on answers above 3s.'
  } else if (medianSec <= 45) {
    timeLine = `Median ${medianSec}s — ahead of the ${EXAM_PACE_SEC}s exam pace${timedAccuracy != null ? ` at ${timedAccuracy}% timed accuracy` : ''}; convert speed into volume.`
  } else if (medianSec <= EXAM_PACE_SEC) {
    timeLine = `Median ${medianSec}s — on the ${EXAM_PACE_SEC}s NEET-PG pace${timedAccuracy != null ? ` at ${timedAccuracy}% timed accuracy` : ''}.`
  } else {
    timeLine = `Median ${medianSec}s — ${medianSec - EXAM_PACE_SEC}s over the ${EXAM_PACE_SEC}s pace; run timed blocks of 20 to close it${timedAccuracy != null && untimedAccuracy != null && untimedAccuracy > timedAccuracy + 10 ? ` (untimed answers run ${untimedAccuracy - timedAccuracy}pts better — time pressure is costing accuracy)` : ''}.`
  }

  // ErrorPattern rows are per-(errorType, concept) — aggregate by errorType so
  // the student sees one measured pattern per error family (summed counts),
  // never duplicated rows with the same tactic.
  const patternTotals = new Map<string, number>()
  for (const e of ctx.errorPatterns) {
    patternTotals.set(e.errorType, (patternTotals.get(e.errorType) ?? 0) + e.count)
  }
  const mistakePatterns = [...patternTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([errorType, count]) => ({
      errorType,
      count,
      tactic: MISTAKE_TACTICS[errorType] ?? 'Review the question, write why the right answer wins, then retest',
    }))

  const engagedCount = states.filter(engagedOf).length
  const clearedConcepts = new Set(ctx.revisionItems.filter((r) => r.cleared).map((r) => r.conceptId)).size
  const coverage = engagedCount > 0 ? Math.round((clearedConcepts / engagedCount) * 100) : null
  const overdue = ctx.revisionItems.filter((r) => !r.cleared && r.dueAt.getTime() <= ctx.now.getTime()).length
  const revisionGaps = {
    coverage,
    overdue,
    line: engagedCount === 0
      ? 'No engaged concepts to cover yet.'
      : `${coverage}% of your engaged concepts have at least one cleared revision pass · ${overdue} item${overdue === 1 ? '' : 's'} overdue now`,
  }

  const answeredTotal = ctx.examAttempts.reduce((a, e) => a + e.answered, 0)
  const carelessTotal = ctx.examAttempts.reduce((a, e) => a + e.careless, 0)
  const changedTotal = ctx.examAttempts.reduce((a, e) => a + e.changedToWrong + e.changedToRight, 0)
  const changedWrongTotal = ctx.examAttempts.reduce((a, e) => a + e.changedToWrong, 0)
  const carelessRate = answeredTotal > 0 ? Math.round((carelessTotal / answeredTotal) * 100) : null
  const testTaking = {
    carelessRate,
    changedAnswers: changedTotal,
    line: answeredTotal === 0
      ? 'No submitted mocks yet — careless and answer-change signals arrive with your first timed paper.'
      : `${carelessTotal} careless-marked answer${carelessTotal === 1 ? '' : 's'} (${carelessRate}% of ${answeredTotal} answered) · ${changedTotal} answer change${changedTotal === 1 ? '' : 's'}, ${changedWrongTotal} of them turned wrong${changedTotal > 0 && changedWrongTotal / changedTotal > 0.5 ? ' — your changes are usually harmful; trust the first pass unless you find a concrete error' : ''}`,
  }

  const allTime = ctx.attemptsTotal > 0 ? Math.round((ctx.attemptsCorrect / ctx.attemptsTotal) * 100) : null
  const acc30 = ctx.attempts30 > 0 ? Math.round((ctx.attemptsCorrect30 / ctx.attempts30) * 100) : null
  const mockPercents = ctx.examAttempts.map((e) => e.percent).filter((p): p is number => p != null)

  const playbook: string[] = []
  if (highImpactWeaknesses.length) {
    playbook.push(`Put your first daily block into ${highImpactWeaknesses[0]!.name} — examWeight ${highImpactWeaknesses[0]!.examWeight} with ${highImpactWeaknesses[0]!.line.split(' · ')[0]}.`)
  }
  if (overdue > 0) {
    playbook.push(`Clear the ${overdue} overdue revision item${overdue === 1 ? '' : 's'} before starting anything new — debt compounds.`)
  }
  if (mistakePatterns.length) {
    playbook.push(`Dominant error pattern: ${errorLabel(mistakePatterns[0]!.errorType)} (${plural(mistakePatterns[0]!.count, 'occurrence')}) — ${mistakePatterns[0]!.tactic.split(' — ')[0]!.toLowerCase()}.`)
  }
  if (medianSec != null && medianSec > EXAM_PACE_SEC) {
    playbook.push(`Run one timed 20-question block per day at the ${EXAM_PACE_SEC}s pace until your median drops under it.`)
  }
  if (mockPercents.length < 2) {
    playbook.push(`Only ${plural(mockPercents.length, 'submitted mock')} on record — one timed, negatively-marked mock per month keeps calibration honest.`)
  }
  if (strongAreas.length) {
    playbook.push(`${strongAreas[0]!.name} is holding at ${strongAreas[0]!.line.split(' — ')[0]} — one spaced touch a week protects it; don\u2019t re-grind.`)
  }
  if (playbook.length < 4 && allTime != null) {
    playbook.push(`All-time accuracy ${allTime}%${acc30 != null ? ` (${acc30}% last 30 days)` : ''} — grow the attempted pool; small samples swing hard.`)
  }
  if (playbook.length === 0) {
    playbook.push('Answer your first questions and submit one mock — strategy lines build from measured activity only.')
  }

  return {
    generatedAt: ctx.now.toISOString(),
    examClock: clock ? { daysLeft: clock.daysLeft, stage: clock.stage, isEstimate: clock.isEstimate } : null,
    readiness,
    highImpactWeaknesses,
    strongAreas,
    timeManagement: { medianSec, paceSec: EXAM_PACE_SEC, timedAccuracy, untimedAccuracy, line: timeLine },
    mistakePatterns,
    revisionGaps,
    testTaking,
    playbook: playbook.slice(0, 6),
    disclaimer: 'Evidence-based suggestions from your measured activity. This is study guidance — it never predicts or guarantees a rank.',
  }
}

// ─── home insights (max 4, most actionable, one action each) ────────────────

export function buildInsights(ctx: BrainContext, states: BrainConceptState[]): BrainInsight[] {
  const insights: BrainInsight[] = []

  // 1 — decayed mastery
  const decayed = states
    .filter((s) => s.status === 'at-risk')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  if (decayed) {
    insights.push({
      title: 'Mastery is fading',
      line: `${decayed.name} held ${decayed.score}% but recall dropped to ${pct(decayed.estRecall ?? 0)}% — one spaced pass protects it.`,
      evidence: evidenceLine(decayed),
      action: actionFor('revision', { conceptId: decayed.conceptId, label: 'Revise it now' }),
    })
  }

  // 2 — repeated-mistake loop
  const looping = ctx.mistakeRows.filter((m) => m.status !== 'resolved' && m.wrongCount >= 2)
  if (looping.length) {
    const top = [...looping].sort((a, b) => b.wrongCount - a.wrongCount)[0]!
    const name = (top.conceptId && stateMap(states).get(top.conceptId)?.name) ?? top.stem.slice(0, 60)
    insights.push({
      title: 'A mistake is looping',
      line: `${looping.length} mistake${looping.length === 1 ? '' : 's'} repeats (2+ wrong). Worst: ${name} — wrong ${top.wrongCount}×.`,
      evidence: `status ${top.status}${top.lastErrorType ? ` · ${errorLabel(top.lastErrorType)}` : ''}`,
      action: actionFor('mistakes', { conceptId: top.conceptId ?? undefined, label: 'Clear the loop' }),
    })
  }

  // 3 — prerequisite blocking a high-yield topic
  const blocked = states
    .filter((s) => s.prereqGap && s.examWeight >= 4 && (isWeakLike(s) || s.status === 'not-started'))
    .sort((a, b) => b.examWeight - a.examWeight)[0]
  if (blocked) {
    insights.push({
      title: 'A prerequisite is blocking high yield',
      line: `${blocked.name} (examWeight ${blocked.examWeight}) has an unlearned prerequisite — the base first, then the concept sticks.`,
      evidence: `${blocked.topicName} · ${blocked.subjectName}`,
      action: actionFor('graph', { conceptId: blocked.conceptId, label: 'See the blocking edge' }),
    })
  }

  // 4 — revision backlog
  const overdue = ctx.revisionItems.filter((r) => !r.cleared && r.dueAt.getTime() <= ctx.now.getTime()).length
  if (overdue >= 3) {
    insights.push({
      title: 'Revision backlog building',
      line: `${overdue} revision item${overdue === 1 ? '' : 's'} overdue — recall decays while they wait.`,
      evidence: `${ctx.revisionItems.filter((r) => !r.cleared).length} open in queue`,
      action: actionFor('revision', { label: 'Open revision queue' }),
    })
  }

  // 5 — accuracy trending up
  const allTime = ctx.attemptsTotal > 0 ? Math.round((ctx.attemptsCorrect / ctx.attemptsTotal) * 100) : null
  const acc30 = ctx.attempts30 > 0 ? Math.round((ctx.attemptsCorrect30 / ctx.attempts30) * 100) : null
  if (allTime != null && acc30 != null && acc30 >= allTime + 5 && ctx.attempts30 >= 10) {
    insights.push({
      title: 'Accuracy is trending up',
      line: `${acc30}% over the last 30 days vs ${allTime}% all-time — the practice is compounding.`,
      evidence: `${plural(ctx.attempts30, 'attempt')} in the 30-day window`,
      action: actionFor('questions', { label: 'Keep the streak going' }),
    })
  }

  return insights.slice(0, 4)
}

// ─── K) privacy builders ────────────────────────────────────────────────────

export function buildPrivacy(ctx: BrainContext): BrainPrivacyPayload {
  return {
    generatedAt: ctx.now.toISOString(),
    settings: ctx.settings,
    storedData: [
      { section: 'Knowledge states', count: ctx.stateRows.length, description: 'Derived mastery, stability and recall per concept — recomputed on read, one row per concept you touched' },
      { section: 'Question attempts', count: ctx.attemptsTotal, description: 'Your raw MCQ answer log (option picked, correct, error type, time) — the source every signal derives from' },
      { section: 'Mistake records', count: ctx.mistakeRows.length, description: 'One aggregate per wrong question: repetition count, lifecycle status, last error type' },
      { section: 'Revision items', count: ctx.revisionItems.length, description: 'Your revision queue history — reason, priority, due date, cleared state' },
      { section: 'Flashcard reviews', count: ctx.flashReviews.length, description: 'Spaced-repetition history per card: reps, lapses, last grade' },
      { section: 'Brain snapshots', count: ctx.snapshots.length, description: 'Daily derived counters for the longitudinal timeline (no raw content)' },
      { section: 'Settings', count: 1, description: 'Your personalization and privacy switches for the brain' },
    ],
    privateByDefault: 'The brain is private by default: every number is computed from your own activity, stored only in your local database, and never exposed to other students. No sharing surface exists — community features never read brain data.',
    howItWorks: howItWorksRules(),
    note: 'Export shows everything stored about you; scoped reset deletes selected families while raw exam/attempt history stays unless you clear it explicitly.',
  }
}

export function buildExport(ctx: BrainContext, states: BrainConceptState[]): BrainExportPayload {
  const cap = (rows: { label: string; value: string }[]): { rows: { label: string; value: string }[]; more: number } => {
    if (rows.length <= MAX_EXPORT_ROWS) return { rows, more: 0 }
    return { rows: rows.slice(0, MAX_EXPORT_ROWS), more: rows.length - MAX_EXPORT_ROWS }
  }
  const byId = stateMap(states)

  const yearLabel = ctx.profile.year <= 4 ? `Year ${ctx.profile.year} MBBS` : ctx.profile.year === 5 ? 'Intern' : 'Dedicated prep'

  const profileRows = cap([
    { label: 'Name', value: ctx.profile.name },
    { label: 'Stage', value: `${yearLabel} · ${ctx.profile.prepStage}` },
    { label: 'Exam target', value: ctx.profile.examMode ? ctx.profile.examLabel || 'College exam mode' : 'NEET-PG' },
    { label: 'Daily hours', value: `${ctx.profile.dailyHours}h` },
    { label: 'Learning styles', value: ctx.profile.learningStyles.join(', ') || '—' },
    { label: 'Concepts engaged', value: String(states.filter(engagedOf).length) },
    { label: 'MCQ attempts', value: String(ctx.attemptsTotal) },
    { label: 'Submitted mocks', value: String(ctx.examAttempts.length) },
  ])

  const knowledgeRows = cap(
    [...states]
      .filter(engagedOf)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((s) => ({ label: `${s.name} (${s.subjectName})`, value: `${s.status} · score ${s.score ?? '—'} · recall ${s.estRecall != null ? pct(s.estRecall) : '—'}%` })),
  )

  const mistakeRows = cap(
    [...ctx.mistakeRows]
      .sort((a, b) => b.wrongCount - a.wrongCount)
      .map((m) => ({ label: (m.conceptId && byId.get(m.conceptId)?.name) || m.stem.slice(0, 64), value: `wrong ${m.wrongCount}× · ${m.status}` })),
  )

  const revisionRows = cap(
    [...ctx.revisionItems]
      .sort((a, b) => Number(a.cleared) - Number(b.cleared) || a.dueAt.getTime() - b.dueAt.getTime())
      .map((r) => ({ label: byId.get(r.conceptId)?.name ?? r.conceptId, value: `${r.cleared ? `cleared ${r.clearedAt ? istDayKey(r.clearedAt) : ''}` : `due ${istDayKey(r.dueAt)}`} · ${r.reason || 'queued'}` })),
  )

  const flashByConcept = new Map<string, { reps: number; lapses: number; lastGrade: number | null }>()
  for (const r of ctx.flashReviews) {
    if (!r.conceptId) continue
    const e = flashByConcept.get(r.conceptId) ?? { reps: 0, lapses: 0, lastGrade: null }
    e.reps += r.reps
    e.lapses += r.lapses
    e.lastGrade = r.lastGrade
    flashByConcept.set(r.conceptId, e)
  }
  const flashRows = cap(
    [...flashByConcept.entries()]
      .sort((a, b) => b[1].reps - a[1].reps)
      .map(([cid, f]) => ({ label: byId.get(cid)?.name ?? cid, value: `${f.reps} reps · ${f.lapses} lapses · last grade ${f.lastGrade ?? '—'}` })),
  )

  const mockRows = cap(
    [...ctx.examAttempts].map((e) => ({ label: e.label || e.mode, value: `${e.percent != null ? `${e.percent}%` : `${e.score}/${e.maxScore}`} · ${e.submittedAt ? istDayKey(e.submittedAt) : 'date unknown'}` })),
  )

  const allTime = ctx.attemptsTotal > 0 ? Math.round((ctx.attemptsCorrect / ctx.attemptsTotal) * 100) : null
  const activityRows = cap([
    { label: 'MCQ attempts', value: `${ctx.attemptsTotal} (${allTime ?? '—'}% correct)` },
    { label: 'Last 30 days', value: `${ctx.attempts30} attempts · ${ctx.attempts30 > 0 ? Math.round((ctx.attemptsCorrect30 / ctx.attempts30) * 100) : 0}% correct` },
    { label: 'Study sessions', value: String(ctx.studyDates.length) },
    { label: 'Revision sessions', value: String(ctx.revisionSessions.length) },
    { label: 'Flashcard reviews', value: String(ctx.flashReviews.length) },
    { label: 'Case attempts', value: String(ctx.simAttempts.length) },
    { label: 'Lab runs', value: String(ctx.labRuns.length) },
    { label: 'Activity streak', value: `${computeStreak([...ctx.attempts.map((a) => a.createdAt), ...ctx.studyDates, ...ctx.revisionSessions.map((r) => r.completedAt ?? r.createdAt), ...ctx.flashReviews.map((f) => f.at)])} days` },
  ])

  const settingsRows = cap([
    { label: 'Personalization', value: ctx.settings.personalizationOn ? 'on' : 'off' },
    { label: 'AI Tutor context', value: ctx.settings.tutorContextOn ? 'on' : 'off' },
    { label: 'Question feed', value: ctx.settings.questionPersonalizationOn ? 'on' : 'off' },
    { label: 'Revision feed', value: ctx.settings.revisionPersonalizationOn ? 'on' : 'off' },
    { label: 'Content feed', value: ctx.settings.contentPersonalizationOn ? 'on' : 'off' },
    { label: 'History snapshots', value: ctx.settings.historySnapshotsOn ? 'on' : 'off' },
  ])

  const sections: BrainExportSection[] = [
    { title: 'Profile', description: 'Your account-level preferences and headline counters.', rows: profileRows.rows },
    { title: 'Knowledge states', description: 'Derived per-concept state from all measured signal families.', rows: knowledgeRows.rows },
    { title: 'Repeated mistakes', description: 'The mistake bank — one row per wrong question, worst first.', rows: mistakeRows.rows },
    { title: 'Revision', description: 'Revision queue history with cleared/due state.', rows: revisionRows.rows },
    { title: 'Flashcards', description: 'Spaced-repetition history aggregated per concept.', rows: flashRows.rows },
    { title: 'Mocks', description: 'Submitted exam attempts with measured percent scores.', rows: mockRows.rows },
    { title: 'Activity', description: 'Raw activity counters across every measured surface.', rows: activityRows.rows },
    { title: 'Settings', description: 'Current brain privacy and personalization switches.', rows: settingsRows.rows },
  ]
  for (const [i, s] of sections.entries()) {
    const more = [profileRows, knowledgeRows, mistakeRows, revisionRows, flashRows, mockRows, activityRows, settingsRows][i]!.more
    if (more > 0) s.description += ` …and ${more} more rows not shown (export shows a capped view; nothing is hidden from the underlying data).`
  }

  return {
    generatedAt: ctx.now.toISOString(),
    profileLine: `${ctx.profile.name} · ${yearLabel} · ${ctx.profile.prepStage} · ${ctx.examAttempts.length} mocks · ${ctx.attemptsTotal} attempts`,
    sections,
    note: 'This is a readable view of everything the brain stores about you. Raw attempt history (QuestionAttempt, StudySession, ExamAttempt, XP events) is kept on reset unless you explicitly clear it — re-derivation rebuilds states from it as you keep studying.',
  }
}

// ─── snapshots + timeline ───────────────────────────────────────────────────

export async function materializeSnapshot(profileId: string, ctx: BrainContext, states: BrainConceptState[]): Promise<{ written: boolean; dayKey: string }> {
  const dayKey = istDayKey(ctx.now)
  if (!ctx.settings.historySnapshotsOn) return { written: false, dayKey }
  const counts = countStates(states)
  const accuracy = ctx.attemptsTotal > 0 ? Math.round((ctx.attemptsCorrect / ctx.attemptsTotal) * 100) : null
  const data = {
    mastered: counts.mastered,
    strong: counts.strong,
    atRisk: counts['at-risk'],
    needsRevision: counts['needs-revision'],
    accuracy,
    conceptsByState: counts,
  }
  try {
    await db.brainSnapshot.upsert({
      where: { profileId_dayKey: { profileId, dayKey } },
      update: { data: data as unknown as never },
      create: { profileId, dayKey, data: data as unknown as never },
    })
  } catch {
    // snapshot is best-effort — never fail the calling route
  }
  return { written: true, dayKey }
}

export async function buildTimeline(profileId: string): Promise<BrainTimelinePayload> {
  const rows = await db.brainSnapshot.findMany({
    where: { profileId },
    orderBy: { dayKey: 'asc' },
    select: { dayKey: true, data: true },
  })
  const points: BrainTimelinePoint[] = rows.map((r) => {
    const d = (r.data ?? {}) as { mastered?: unknown; strong?: unknown; atRisk?: unknown; needsRevision?: unknown; accuracy?: unknown }
    const num = (x: unknown): number => (isNum(x) ? x : 0)
    return {
      dayKey: r.dayKey,
      label: timelineLabel(r.dayKey),
      mastered: num(d.mastered),
      strong: num(d.strong),
      atRisk: num(d.atRisk),
      needsRevision: num(d.needsRevision),
      accuracy: isNum(d.accuracy) ? d.accuracy : null,
    }
  })
  return {
    generatedAt: new Date().toISOString(),
    points,
    note: points.length
      ? 'One snapshot per IST day (opt-in). Snapshots stop the moment you turn history off, and reset scope "snapshots" erases them.'
      : 'No snapshots yet — one materializes per day while history snapshots are on.',
  }
}

function timelineLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map((x) => Number(x))
  if (!y || !m || !d) return dayKey
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${MONTHS[m - 1]}`
}

// ─── scoped reset ───────────────────────────────────────────────────────────

export const RESET_SCOPES = ['knowledge', 'mistakes', 'revision', 'flashcards', 'snapshots', 'all-learning'] as const
export type BrainResetScope = (typeof RESET_SCOPES)[number]

/**
 * Deletes ONLY the derived/queued families in the requested scope. Raw
 * measured history (QuestionAttempt, StudySession, ExamAttempt, XpEvent,
 * community content) is NEVER touched — it stays as the student's record and
 * states re-derive from it as new activity arrives.
 */
export async function resetBrainData(profileId: string, scope: BrainResetScope): Promise<BrainResetResult> {
  const cleared: { table: string; count: number }[] = []
  const run = async (table: string, fn: () => Promise<{ count: number }>) => cleared.push({ table, count: (await fn()).count })

  const wantKnowledge = scope === 'knowledge' || scope === 'all-learning'
  const wantMistakes = scope === 'mistakes' || scope === 'all-learning'
  const wantRevision = scope === 'revision' || scope === 'all-learning'
  const wantFlashcards = scope === 'flashcards' || scope === 'all-learning'
  const wantSnapshots = scope === 'snapshots' || scope === 'all-learning'

  if (wantKnowledge) await run('KnowledgeState', () => db.knowledgeState.deleteMany({ where: { profileId } }))
  if (wantMistakes) {
    await run('MistakeRecord', () => db.mistakeRecord.deleteMany({ where: { profileId } }))
    await run('ErrorPattern', () => db.errorPattern.deleteMany({ where: { profileId } }))
  }
  if (wantRevision) {
    await run('RevisionItem', () => db.revisionItem.deleteMany({ where: { profileId } }))
    await run('RevisionSession', () => db.revisionSession.deleteMany({ where: { profileId } }))
  }
  if (wantFlashcards) await run('FlashcardReview', () => db.flashcardReview.deleteMany({ where: { profileId } }))
  if (wantSnapshots) await run('BrainSnapshot', () => db.brainSnapshot.deleteMany({ where: { profileId } }))

  const total = cleared.reduce((a, c) => a + c.count, 0)
  return {
    ok: true,
    scope,
    cleared,
    note: total === 0
      ? 'Nothing matched this scope — the tables were already empty.'
      : `Deleted ${plural(total, 'row')} in scope "${scope}". Raw measured history (QuestionAttempt, StudySession, ExamAttempt, XP events, community activity) is untouched — it is your record, and states re-derive from it as you keep studying.`,
  }
}

// ─── honest home note ───────────────────────────────────────────────────────

export function brainHonestNote(ctx: BrainContext, states: BrainConceptState[]): string {
  const engaged = states.filter(engagedOf).length
  const base = `${engaged} of ${states.length} concepts measured from ${ctx.attemptsTotal} attempts, ${ctx.flashReviews.length} flashcard reviews, ${ctx.revisionItems.length} revision items and ${ctx.examAttempts.length} submitted mocks. Every insight above derives only from this measured activity — nothing is invented.`
  if (engaged < 20) return `${base} Early data: the picture sharpens as you practice.`
  return base
}
