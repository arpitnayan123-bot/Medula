import { db } from '@/lib/db'
import { DAY, estimatedRecall, istDayKey, computeStreak, examClock } from '@/lib/engine'
import { EXAM_PACE_SEC } from '@/lib/exam'
import { getDemoProfile } from '@/lib/profile'
import type {
  PerformanceDirection,
  PerformanceExamReadiness,
  PerformanceHandoff,
  PerformanceIndicators,
  PerformanceInsight,
  PerformancePayload,
  PerformanceReadiness,
  PerformanceStrengthItem,
  PerformanceSubjectRow,
  PerformanceTrend,
  PerformanceTrendPoint,
  PerformanceWeakItem,
} from './types'

// ─── PERFORMANCE & READINESS INTELLIGENCE (PRODUCT 13) ──────────────────────
// One deterministic engine that reads EVERY learning signal the platform
// already records (KnowledgeState, QuestionAttempt, ExamAttempt, MistakeRecord,
// RevisionItem, FlashcardReview, StudySession) and turns it into:
//   measure (indicators) → understand (trends) → predict (readiness) → improve
//   (insights + hand-offs).
//
// Rules baked into this file:
//   • every number is measured from real rows — never invented
//   • every score exposes its formula, basis and "how to move it"
//   • data-poor dimensions are EXCLUDED and renormalised, not zeroed
//   • weaknesses are ranked by exam importance × weakness × decay — not dumps
//   • every insight carries at least one action hand-off
//   • the output is a learning-analytics estimate — never a rank prediction

export const TREND_BUCKETS = 6 // rolling 7-day IST buckets (oldest → newest)
export const ACCURACY_WINDOW = 200 // attempts for headline accuracy
export const SPEED_WINDOW = 100 // attempts for pace
export const MIN_TIMED_MS = 3000 // ignore sub-3s answers when judging pace
export const MAX_ATTEMPT_FEED = 1200

// ── small math helpers ──────────────────────────────────────────────────────
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const r1 = (n: number) => Math.round(n * 10) / 10
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const istLabel = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/** Whole days between two IST day keys (a − b). */
function daysBetweenKeys(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0
  return Math.round((ta - tb) / DAY)
}

function directionFor(delta: number | null, tol: number): PerformanceDirection {
  if (delta == null) return 'flat'
  if (delta > tol) return 'up'
  if (delta < -tol) return 'down'
  return 'flat'
}

// ── loading ─────────────────────────────────────────────────────────────────
type AttemptRow = {
  correct: boolean
  timeMs: number
  errorType: string | null
  createdAt: Date
  subjectCode: string
  topicId: string | null
  conceptId: string | null
}

export type PerformanceContext = Awaited<ReturnType<typeof loadPerformanceContext>>

async function loadPerformanceContext() {
  const profile = await getDemoProfile()
  const now = new Date()
  const since120 = new Date(now.getTime() - 120 * DAY)

  const [states, concepts, topics, attemptRows, attemptTotal, sessions, exams, mistakes, revisionItems, cardReviews, revisionSessions, errorPatterns] =
    await Promise.all([
      db.knowledgeState.findMany({
        where: { profileId: profile.id },
        include: { concept: { include: { topic: { include: { subject: true } } } } },
      }),
      db.concept.findMany({
        select: {
          id: true, name: true, examRelevance: true, topicId: true,
          topic: { select: { id: true, name: true, subject: { select: { id: true, code: true, name: true, color: true, neetWeight: true } } } },
        },
      }),
      db.topic.findMany({
        select: { id: true, name: true, importance: true, subject: { select: { code: true, name: true, neetWeight: true } } },
      }),
      db.questionAttempt.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: MAX_ATTEMPT_FEED,
        select: {
          correct: true, timeMs: true, errorType: true, createdAt: true,
          question: { select: { subjectCode: true, topicId: true, conceptId: true } },
        },
      }),
      db.questionAttempt.count({ where: { profileId: profile.id } }),
      db.studySession.findMany({
        where: { profileId: profile.id, date: { gte: since120 } },
        select: { date: true, minutes: true, kind: true },
      }),
      db.examAttempt.findMany({
        where: { profileId: profile.id, status: 'submitted' },
        orderBy: { submittedAt: 'desc' },
        take: 50,
        select: { id: true, mode: true, label: true, score: true, maxScore: true, submittedAt: true },
      }),
      db.mistakeRecord.findMany({
        where: { profileId: profile.id },
        select: { conceptId: true, wrongCount: true, status: true, firstWrongAt: true, lastWrongAt: true, resolvedAt: true },
      }),
      db.revisionItem.findMany({
        where: { profileId: profile.id, cleared: false },
        select: { conceptId: true, minutes: true, dueAt: true, priority: true },
      }),
      db.flashcardReview.findMany({
        where: { profileId: profile.id },
        select: { dueAt: true, reviewedAt: true },
      }),
      db.revisionSession.findMany({
        where: { profileId: profile.id },
        select: { createdAt: true, completedAt: true, done: true, minutes: true },
      }),
      db.errorPattern.findMany({
        where: { profileId: profile.id },
        orderBy: { count: 'desc' },
        take: 10,
        select: { errorType: true, count: true },
      }),
    ])

  const attempts: AttemptRow[] = attemptRows.map((a) => ({
    correct: a.correct,
    timeMs: a.timeMs,
    errorType: a.errorType,
    createdAt: a.createdAt,
    subjectCode: a.question.subjectCode,
    topicId: a.question.topicId,
    conceptId: a.question.conceptId,
  }))

  return {
    profile, now, states, concepts, topics, attempts, attemptTotal,
    sessions, exams, mistakes, revisionItems, cardReviews, revisionSessions, errorPatterns,
  }
}

// ── per-concept fresh recall (never trust stale estRecall) ──────────────────
type ConceptSignal = {
  conceptId: string
  name: string
  topicId: string | null
  topicName: string
  subjectId: string
  subjectCode: string
  subjectName: string
  subjectColor: string
  neetWeight: number
  examRelevance: number
  score: number
  stability: number
  lastReviewed: Date | null
  recall: number
  attemptCount: number
  correctCount: number
  engaged: boolean
}

function conceptSignals(ctx: PerformanceContext): Map<string, ConceptSignal> {
  const now = ctx.now
  const map = new Map<string, ConceptSignal>()
  for (const c of ctx.concepts) {
    const subj = c.topic.subject
    map.set(c.id, {
      conceptId: c.id, name: c.name, topicId: c.topicId, topicName: c.topic.name,
      subjectId: subj.id, subjectCode: subj.code, subjectName: subj.name, subjectColor: subj.color,
      neetWeight: subj.neetWeight, examRelevance: c.examRelevance,
      score: 0, stability: 1, lastReviewed: null, recall: 0,
      attemptCount: 0, correctCount: 0, engaged: false,
    })
  }
  for (const s of ctx.states) {
    const sig = map.get(s.conceptId)
    if (!sig) continue
    const days = s.lastReviewed ? (now.getTime() - s.lastReviewed.getTime()) / DAY : 999
    sig.score = s.score
    sig.stability = s.stability
    sig.lastReviewed = s.lastReviewed
    sig.recall = clamp(estimatedRecall(days, s.stability), 0, 1)
    sig.attemptCount = s.attemptCount
    sig.correctCount = s.correctCount
    sig.engaged = s.attemptCount > 0 || s.score > 0
  }
  return map
}

// ── IST rolling-week buckets ────────────────────────────────────────────────
type Bucket = { index: number; label: string; start: Date; end: Date }

function istBuckets(now: Date, count: number): Bucket[] {
  const buckets: Bucket[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getTime() - (i * 7 + 6) * DAY)
    const end = new Date(now.getTime() - i * 7 * DAY)
    buckets.push({ index: count - 1 - i, label: istLabel(start), start, end })
  }
  return buckets
}
const bucketOf = (d: Date, now: Date, count: number): number => {
  const days = daysBetweenKeys(istDayKey(now), istDayKey(d))
  if (days < 0) return -1
  const idx = Math.floor(days / 7)
  return idx >= 0 && idx < count ? count - 1 - idx : -1
}

// ── trends ──────────────────────────────────────────────────────────────────
function accuracyTrend(ctx: PerformanceContext, buckets: Bucket[]): PerformanceTrend {
  const hits = new Array(buckets.length).fill(0)
  const totals = new Array(buckets.length).fill(0)
  for (const a of ctx.attempts) {
    const b = bucketOf(a.createdAt, ctx.now, buckets.length)
    if (b >= 0) { totals[b]++; if (a.correct) hits[b]++ }
  }
  const series: PerformanceTrendPoint[] = buckets.map((bk, i) => ({
    label: bk.label,
    value: totals[i] >= 3 ? pctOf(hits[i], totals[i]) : null,
  }))
  const last = series[series.length - 1]?.value ?? null
  const prev = series[series.length - 2]?.value ?? null
  const delta = last != null && prev != null ? last - prev : null
  const withData = series.filter((p) => p.value != null).length
  return {
    key: 'accuracy', label: 'Question accuracy', unit: '%',
    direction: directionFor(delta, 2),
    delta: delta != null ? Math.round(delta) : null,
    improved: delta == null ? null : delta >= 2 ? true : delta <= -2 ? false : null,
    series, insufficient: withData < 2,
    note: delta == null
      ? 'Not enough answered questions in the last two weeks to read a direction.'
      : `Last-week accuracy ${last}% vs ${prev}% the week before (${delta >= 0 ? '+' : '−'}${Math.abs(Math.round(delta))}pp over ${totals[totals.length - 1]} attempts).`,
  }
}

function speedTrend(ctx: PerformanceContext, buckets: Bucket[]): PerformanceTrend {
  const times: number[][] = buckets.map(() => [])
  for (const a of ctx.attempts) {
    if (a.timeMs < MIN_TIMED_MS) continue
    const b = bucketOf(a.createdAt, ctx.now, buckets.length)
    if (b >= 0) times[b].push(a.timeMs)
  }
  const series: PerformanceTrendPoint[] = buckets.map((bk, i) => ({
    label: bk.label,
    value: times[i].length >= 3 ? Math.round(median(times[i]) / 1000) : null,
  }))
  const last = series[series.length - 1]?.value ?? null
  const prev = series[series.length - 2]?.value ?? null
  const delta = last != null && prev != null ? last - prev : null
  const withData = series.filter((p) => p.value != null).length
  return {
    key: 'speed', label: 'Solving speed', unit: 's',
    direction: directionFor(delta, 2),
    delta: delta != null ? Math.round(delta) : null,
    improved: delta == null ? null : delta <= -2 ? true : delta >= 2 ? false : null,
    series, insufficient: withData < 2,
    note: delta == null
      ? 'Fewer than 3 timed answers in each of the last two weeks.'
      : `Median time per question is ${last}s this week vs ${prev}s before — lower is better (target ${EXAM_PACE_SEC}s).`,
  }
}

function coverageTrend(ctx: PerformanceContext, buckets: Bucket[]): PerformanceTrend {
  const sets: Set<string>[] = buckets.map(() => new Set())
  for (const a of ctx.attempts) {
    const b = bucketOf(a.createdAt, ctx.now, buckets.length)
    if (b >= 0 && a.conceptId) sets[b].add(a.conceptId)
  }
  const series: PerformanceTrendPoint[] = buckets.map((bk, i) => ({ label: bk.label, value: sets[i].size }))
  const last = series[series.length - 1]?.value ?? 0
  const prev = series[series.length - 2]?.value ?? 0
  const delta = last - prev
  const withData = series.filter((p) => p.value != null && p.value > 0).length
  return {
    key: 'coverage', label: 'Syllabus widening', unit: 'concepts',
    direction: directionFor(delta, 1),
    delta,
    improved: withData < 2 ? null : delta > 0 ? true : delta < 0 ? false : null,
    series, insufficient: withData < 2,
    note: withData < 2
      ? 'Start attempting questions — distinct concepts touched per week will chart here.'
      : `${last} distinct concepts touched this week vs ${prev} last week.`,
  }
}

function revisionTrend(ctx: PerformanceContext, buckets: Bucket[]): PerformanceTrend {
  const counts = new Array(buckets.length).fill(0)
  for (const r of ctx.cardReviews) {
    if (!r.reviewedAt) continue
    const b = bucketOf(r.reviewedAt, ctx.now, buckets.length)
    if (b >= 0) counts[b]++
  }
  for (const s of ctx.revisionSessions) {
    const b = bucketOf(s.createdAt, ctx.now, buckets.length)
    if (b >= 0 && s.done > 0) counts[b] += 1
  }
  const series: PerformanceTrendPoint[] = buckets.map((bk, i) => ({ label: bk.label, value: counts[i] }))
  const last = series[series.length - 1]?.value ?? 0
  const prev = series[series.length - 2]?.value ?? 0
  const delta = last - prev
  const withData = series.filter((p) => p.value != null && p.value > 0).length
  return {
    key: 'revision', label: 'Revision consistency', unit: 'actions',
    direction: directionFor(delta, 1),
    delta,
    improved: withData < 2 ? null : delta > 0 ? true : delta < 0 ? false : null,
    series, insufficient: withData < 2,
    note: withData < 2
      ? 'No revision actions logged yet — card reviews and smart-revision blocks will chart here.'
      : `${last} revision actions this week vs ${prev} the week before (card reviews + revision blocks).`,
  }
}

function mistakeTrend(ctx: PerformanceContext, buckets: Bucket[]): PerformanceTrend {
  const counts = new Array(buckets.length).fill(0)
  for (const m of ctx.mistakes) {
    const b = bucketOf(m.firstWrongAt, ctx.now, buckets.length)
    if (b >= 0) counts[b]++
  }
  const series: PerformanceTrendPoint[] = buckets.map((bk, i) => ({ label: bk.label, value: counts[i] }))
  const last = series[series.length - 1]?.value ?? 0
  const prev = series[series.length - 2]?.value ?? 0
  const delta = last - prev
  const withData = series.filter((p) => p.value != null && p.value > 0).length
  return {
    key: 'mistakes', label: 'New mistakes per week', unit: 'items',
    direction: directionFor(delta, 1), // raw metric direction; `improved` carries the semantic (fewer = better)
    delta,
    improved: withData < 2 ? null : delta < 0 ? true : delta > 0 ? false : null,
    series, insufficient: withData < 2,
    note: withData < 2
      ? 'Mistakes register once you answer questions — fewer new mistakes per week is the goal.'
      : `${last} new mistakes this week vs ${prev} the week before — fewer is better.`,
  }
}

function mockTrend(ctx: PerformanceContext): PerformanceTrend {
  const chrono = [...ctx.exams]
    .filter((e) => e.submittedAt && e.maxScore > 0)
    .sort((a, b) => (a.submittedAt!.getTime()) - (b.submittedAt!.getTime()))
    .slice(-12)
  const series: PerformanceTrendPoint[] = chrono.map((e) => ({
    label: e.submittedAt ? istLabel(e.submittedAt) : '—',
    value: Math.round((e.score / e.maxScore) * 100),
  }))
  const last = series.length ? series[series.length - 1].value : null
  const prev = series.length > 1 ? series[series.length - 2].value : null
  const delta = last != null && prev != null ? last - prev : null
  return {
    key: 'mock', label: 'Mock-test scores', unit: '%',
    direction: directionFor(delta, 2),
    delta: delta != null ? Math.round(delta) : null,
    improved: delta == null ? null : delta >= 2 ? true : delta <= -2 ? false : null,
    series, insufficient: series.length < 2,
    note: series.length === 0
      ? 'No submitted mock tests yet — the Exam Lab baseline is the single most valuable next data point.'
      : series.length < 2
        ? 'One test down — a second mock unlocks the score trend.'
        : `Latest mock ${last}% vs ${prev}% before (${delta! >= 0 ? '+' : '−'}${Math.abs(delta!)}pts, +4/−1 NEET-PG marking).`,
  }
}

// ── subjects ────────────────────────────────────────────────────────────────
function windowAccuracy(attempts: AttemptRow[], now: Date, fromDays: number, toDays: number): { acc: number | null; n: number } {
  const win = attempts.filter((a) => {
    const days = daysBetweenKeys(istDayKey(now), istDayKey(a.createdAt))
    return days >= fromDays && days < toDays
  })
  return { acc: win.length >= 5 ? pctOf(win.filter((a) => a.correct).length, win.length) : null, n: win.length }
}

function windowSize(attempts: AttemptRow[], now: Date, fromDays: number, toDays: number, subjectCode?: string): number {
  return attempts.filter((a) => {
    if (subjectCode && a.subjectCode !== subjectCode) return false
    const days = daysBetweenKeys(istDayKey(now), istDayKey(a.createdAt))
    return days >= fromDays && days < toDays
  }).length
}

function subjectRows(ctx: PerformanceContext, signals: Map<string, ConceptSignal>): PerformanceSubjectRow[] {
  const bySubject = new Map<string, {
    id: string; code: string; name: string; color: string; neetWeight: number
    total: number; engaged: number; scores: number[]; recalls: number[]
    attempts: number; correct: number
  }>()
  for (const sig of signals.values()) {
    const row = bySubject.get(sig.subjectCode) ?? {
      id: sig.subjectId, code: sig.subjectCode, name: sig.subjectName, color: sig.subjectColor,
      neetWeight: sig.neetWeight, total: 0, engaged: 0, scores: [], recalls: [], attempts: 0, correct: 0,
    }
    row.total++
    if (sig.engaged) { row.engaged++; row.scores.push(sig.score); row.recalls.push(sig.recall) }
    bySubject.set(sig.subjectCode, row)
  }
  for (const a of ctx.attempts) {
    const row = bySubject.get(a.subjectCode)
    if (row) { row.attempts++; if (a.correct) row.correct++ }
  }
  const rows: PerformanceSubjectRow[] = []
  for (const r of bySubject.values()) {
    if (r.engaged === 0 && r.attempts === 0) continue
    const recent = windowAccuracy(ctx.attempts.filter((a) => a.subjectCode === r.code), ctx.now, 0, 14)
    const prior = windowAccuracy(ctx.attempts.filter((a) => a.subjectCode === r.code), ctx.now, 14, 28)
    const mastery = r.scores.length ? Math.round(mean(r.scores)) : null
    const accuracy = r.attempts >= 5 ? pctOf(r.correct, r.attempts) : null
    const trend = recent.acc != null && prior.acc != null ? recent.acc - prior.acc : null
    rows.push({
      id: r.id, code: r.code, name: r.name, color: r.color,
      mastery, accuracy,
      recall: r.recalls.length ? r1(mean(r.recalls)) : null,
      coverage: pctOf(r.engaged, r.total),
      attempts: r.attempts, trend,
      status: r.engaged === 0 ? 'new' : mastery != null && mastery < 45 ? 'weak' : mastery != null && mastery < 70 ? 'developing' : 'strong',
    })
  }
  rows.sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0) || b.attempts - a.attempts)
  return rows
}

// ── weakness & strength intelligence ────────────────────────────────────────
function subjectHandoff(code: string, name: string): PerformanceHandoff {
  return { kind: 'quiz', label: `15 targeted ${name} MCQs`, quiz: { subjectCode: code, count: 15 } }
}

function weaknessIntel(ctx: PerformanceContext, signals: Map<string, ConceptSignal>, subjects: PerformanceSubjectRow[]) {
  type Cand = PerformanceWeakItem & { _importanceRaw?: number }
  const cands: Cand[] = []
  const examYieldOf = (neetWeight: number) => clamp(neetWeight / 12, 0.2, 1)

  // 1) weak subjects
  for (const s of subjects) {
    const sigs: PerformanceWeakItem['signals'] = []
    if (s.mastery != null && s.mastery < 45 && (s.coverage >= 15 || s.attempts >= 10)) sigs.push('weak-mastery')
    if (s.accuracy != null && s.accuracy < 55 && s.attempts >= 10) sigs.push('low-accuracy')
    if (s.trend != null && s.trend <= -5) sigs.push('declining')
    if (!sigs.length) continue
    const weakCore = s.mastery != null ? (100 - s.mastery) / 100 : 1
    // neetWeight lives on the concept signals — recover it from any concept of this subject
    const anySig = [...signals.values()].find((x) => x.subjectCode === s.code)
    const weight = anySig ? anySig.neetWeight : 5
    const importance = clamp(Math.round(
      40 * weakCore + 25 * examYieldOf(weight) +
      (s.accuracy != null ? 15 * (100 - s.accuracy) / 100 : 10) +
      (s.trend != null && s.trend <= -5 ? 15 : 0),
    ), 0, 100)
    cands.push({
      id: `subject:${s.id}`, kind: 'subject', label: s.name, signals: sigs,
      importance,
      examRelevance: clamp(Math.round(examYieldOf(weight) * 5), 1, 5),
      mastery: s.mastery, accuracy: s.accuracy, recall: s.recall, attempts: s.attempts, wrongs: 0,
      reason: `${s.mastery != null ? `Mastery ${s.mastery}%` : 'Not yet mastered'} across ${Math.round(s.coverage)}% of concepts${s.accuracy != null ? ` · ${s.accuracy}% accuracy on ${s.attempts} questions` : ''}${s.trend != null && s.trend <= -5 ? ` · accuracy down ${Math.abs(s.trend)}pp in 14 days` : ''}. Exam weight ≈${weight}%.`,
      action: subjectHandoff(s.code, s.name),
    })
  }

  // 2) weak topics
  const topicAgg = new Map<string, { id: string; name: string; subjectName: string; weight: number; total: number; engaged: number; scores: number[]; recalls: number[] }>()
  for (const sig of signals.values()) {
    if (!sig.topicId) continue
    const row = topicAgg.get(sig.topicId) ?? { id: sig.topicId, name: sig.topicName, subjectName: sig.subjectName, weight: sig.neetWeight, total: 0, engaged: 0, scores: [], recalls: [] }
    row.total++
    if (sig.engaged) { row.engaged++; row.scores.push(sig.score); row.recalls.push(sig.recall) }
    topicAgg.set(sig.topicId, row)
  }
  for (const t of topicAgg.values()) {
    if (t.engaged < 2 || !t.scores.length) continue
    const m = Math.round(mean(t.scores))
    if (m >= 40) continue
    const recall = t.recalls.length ? mean(t.recalls) : 0
    const importance = clamp(Math.round(
      30 * examYieldOf(t.weight) + 45 * (100 - m) / 100 + 25 * (1 - recall),
    ), 0, 100)
    cands.push({
      id: `topic:${t.id}`, kind: 'topic', label: t.name, parent: t.subjectName,
      signals: ['weak-mastery'], importance,
      examRelevance: clamp(Math.round(examYieldOf(t.weight) * 5), 1, 5),
      mastery: m, accuracy: null, recall: r1(recall), attempts: 0, wrongs: 0,
      reason: `${t.engaged} of ${t.total} concepts engaged at ${m}% mean mastery — recall ≈${Math.round(recall * 100)}%.`,
      action: { kind: 'hub', label: 'Open Topic Hub', hub: { topicId: t.id } },
    })
  }

  // 3) concepts: repeated mistakes / faded / high-yield gaps / low accuracy
  const attemptByConcept = new Map<string, { n: number; correct: number }>()
  for (const a of ctx.attempts) {
    if (!a.conceptId) continue
    const row = attemptByConcept.get(a.conceptId) ?? { n: 0, correct: 0 }
    row.n++; if (a.correct) row.correct++
    attemptByConcept.set(a.conceptId, row)
  }
  const openWrongsByConcept = new Map<string, { wrongs: number; records: number }>()
  for (const m of ctx.mistakes) {
    if (!m.conceptId || m.status === 'resolved') continue
    const row = openWrongsByConcept.get(m.conceptId) ?? { wrongs: 0, records: 0 }
    row.wrongs += m.wrongCount; row.records++
    openWrongsByConcept.set(m.conceptId, row)
  }

  for (const sig of signals.values()) {
    const wrongs = openWrongsByConcept.get(sig.conceptId)
    const att = attemptByConcept.get(sig.conceptId)
    const acc = att && att.n >= 6 ? pctOf(att.correct, att.n) : null
    const sigs: PerformanceWeakItem['signals'] = []
    let importance = 0
    const yieldN = clamp(sig.examRelevance / 5, 0.2, 1)
    const weakCore = sig.engaged ? (100 - sig.score) / 100 : 1

    if (wrongs && wrongs.wrongs >= 2) {
      sigs.push('repeated-mistakes')
      importance = Math.max(importance, clamp(Math.round(
        25 * yieldN + 25 * Math.min(1, wrongs.wrongs / 4) + 25 * weakCore + 25 * (1 - sig.recall),
      ), 0, 100))
    }
    if (sig.engaged && sig.score >= 50 && sig.recall < 0.4) {
      const days = sig.lastReviewed ? daysBetweenKeys(istDayKey(ctx.now), istDayKey(sig.lastReviewed)) : 999
      if (days >= 21) {
        sigs.push('faded')
        importance = Math.max(importance, clamp(Math.round(
          30 * yieldN + 30 * (1 - sig.recall) + 20 * sig.score / 100 + 20 * 0.5,
        ), 0, 100))
      }
    }
    if (sig.examRelevance >= 4 && (!sig.engaged || sig.score < 30)) {
      const feedEngaged = (att?.n ?? 0) > 0
      sigs.push(sig.engaged || feedEngaged ? 'high-yield-gap' : 'untouched', 'high-yield-gap')
      importance = Math.max(importance, clamp(Math.round(
        40 * yieldN + 30 * (sig.engaged ? (100 - sig.score) / 100 : 1) + 30 * (sig.engaged ? 1 - sig.recall : 1),
      ), 0, 100))
    }
    if (acc != null && acc < 50) {
      sigs.push('low-accuracy')
      importance = Math.max(importance, clamp(Math.round(
        25 * yieldN + 30 * (100 - acc) / 100 + 25 * weakCore + 20 * (1 - sig.recall),
      ), 0, 100))
    }
    if (!sigs.length) continue

    const uniqueSignals = [...new Set(sigs)]
    const reasons: string[] = []
    if (uniqueSignals.includes('repeated-mistakes')) reasons.push(`${wrongs!.wrongs} wrongs across ${wrongs!.records} questions still unresolved`)
    if (uniqueSignals.includes('faded')) reasons.push(`score was ${sig.score}% but estimated recall has decayed to ${Math.round(sig.recall * 100)}%`)
    if (uniqueSignals.includes('untouched')) reasons.push(`high-yield concept (relevance ${sig.examRelevance}/5) not yet engaged`)
    if (uniqueSignals.includes('high-yield-gap') && sig.engaged) reasons.push(`high-yield concept stuck at ${sig.score}% mastery`)
    if (uniqueSignals.includes('high-yield-gap') && !sig.engaged && (att?.n ?? 0) > 0) reasons.push(`high-yield concept (relevance ${sig.examRelevance}/5) barely engaged — ${att!.n} attempt${att!.n === 1 ? '' : 's'}, no mastery yet`)
    if (uniqueSignals.includes('low-accuracy')) reasons.push(`${acc}% accuracy over ${att!.n} attempts`)
    const action: PerformanceHandoff = uniqueSignals.includes('repeated-mistakes')
      ? { kind: 'mistakes', label: 'Open Mistake Intelligence' }
      : uniqueSignals.includes('faded')
        ? { kind: 'revision', label: 'Add to Smart Revision' }
        : sig.topicId
          ? { kind: 'hub', label: 'Open in Topic Hub', hub: { topicId: sig.topicId } }
          : subjectHandoff(sig.subjectCode, sig.subjectName)
    cands.push({
      id: `concept:${sig.conceptId}`, kind: 'concept', label: sig.name, parent: sig.subjectName,
      signals: uniqueSignals, importance,
      examRelevance: sig.examRelevance,
      mastery: sig.engaged ? sig.score : null, accuracy: acc, recall: sig.engaged ? r1(sig.recall) : null,
      attempts: att?.n ?? sig.attemptCount, wrongs: wrongs?.wrongs ?? 0,
      reason: reasons.join(' · ') + `.`,
      action,
    })
  }

  // merge duplicate ids (keep max importance, union signals)
  const merged = new Map<string, Cand>()
  for (const c of cands) {
    const prev = merged.get(c.id)
    if (!prev) merged.set(c.id, c)
    else {
      prev.signals = [...new Set([...prev.signals, ...c.signals])]
      prev.importance = Math.max(prev.importance, c.importance)
      prev.wrongs = Math.max(prev.wrongs, c.wrongs)
      if (c.accuracy != null && prev.accuracy == null) prev.accuracy = c.accuracy
      if (c.mastery != null && prev.mastery == null) prev.mastery = c.mastery
    }
  }
  const ranked = [...merged.values()].sort((a, b) => b.importance - a.importance)
  const weaknesses: PerformanceWeakItem[] = ranked.slice(0, 10).map(({ _importanceRaw, ...item }) => item)
  const focusNow = ranked.filter((c) => c.importance >= 40).slice(0, 3).map(({ _importanceRaw, ...item }) => item)
  return { weaknesses, focusNow }
}

function strengthIntel(ctx: PerformanceContext, signals: Map<string, ConceptSignal>, subjects: PerformanceSubjectRow[]): PerformanceStrengthItem[] {
  const items: PerformanceStrengthItem[] = []
  for (const s of subjects) {
    if (s.mastery != null && s.mastery >= 65 && s.accuracy != null && s.accuracy >= 65 && s.attempts >= 10) {
      items.push({
        id: `subject:${s.id}`, kind: 'subject', label: s.name, mastery: s.mastery,
        accuracy: s.accuracy, recall: s.recall, attempts: s.attempts,
        note: `Consistent performer (${s.accuracy}% accuracy on ${s.attempts} questions) — keep weekly top-ups, don't re-grind.`,
      })
    }
  }
  const strongConcepts = [...signals.values()]
    .filter((x) => x.engaged && x.score >= 70 && x.recall >= 0.65 && x.attemptCount >= 3)
    .sort((a, b) => b.score * b.recall - a.score * a.recall)
    .slice(0, 6)
  for (const c of strongConcepts) {
    items.push({
      id: `concept:${c.conceptId}`, kind: 'concept', label: c.name, parent: c.subjectName,
      mastery: c.score, accuracy: c.attemptCount ? pctOf(c.correctCount, c.attemptCount) : null,
      recall: r1(c.recall), attempts: c.attemptCount,
      note: c.recall >= 0.8
        ? `Mastered and holding (recall ≈${Math.round(c.recall * 100)}%) — needs only spaced reminders.`
        : `Mastered for now (recall ≈${Math.round(c.recall * 100)}%) — one light review before decay sets in.`,
    })
  }
  return items.slice(0, 8)
}

// ── insights (every insight → at least one action) ──────────────────────────
function buildInsights(
  ctx: PerformanceContext, subjects: PerformanceSubjectRow[], indicators: PerformanceIndicators,
  weaknesses: PerformanceWeakItem[], overall: number | null,
): PerformanceInsight[] {
  const insights: PerformanceInsight[] = []

  // 1) biggest subject accuracy drop
  const dropped = subjects
    .filter((s) => s.trend != null && s.trend <= -5 && s.attempts >= 15)
    .sort((a, b) => (a.trend ?? 0) - (b.trend ?? 0))[0]
  if (dropped) {
    const nNow = windowSize(ctx.attempts, ctx.now, 0, 14, dropped.code)
    const nPrior = windowSize(ctx.attempts, ctx.now, 14, 28, dropped.code)
    insights.push({
      id: `subject-drop-${dropped.code}`,
      severity: dropped.trend! <= -10 ? 'critical' : 'warning',
      title: `${dropped.name} accuracy dropped ${Math.abs(dropped.trend!)}%`,
      evidence: `Accuracy fell to ${dropped.accuracy ?? '—'}% over the last 14 days (${nNow} attempts) from the prior fortnight (${nPrior} attempts, ${dropped.attempts} logged in total). Sample sizes are small — read the direction, not the decimals.`,
      why: 'A dip this sharp usually means either rushed practice or an unrefreshed weak area — both fixable this week.',
      actions: [
        subjectHandoff(dropped.code, dropped.name),
        { kind: 'learn', label: `Review ${dropped.name} topics`, learn: { kind: 'subject', id: dropped.id } },
        { kind: 'mistakes', label: 'Revisit repeated mistakes' },
      ],
    })
  }

  // 2) rising subject worth protecting
  const rising = subjects
    .filter((s) => s.trend != null && s.trend >= 5 && s.attempts >= 15)
    .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))[0]
  if (rising) {
    insights.push({
      id: `subject-rise-${rising.code}`, severity: 'good',
      title: `${rising.name} accuracy is up ${rising.trend}%`,
      evidence: `Last-14-day accuracy ${rising.accuracy ?? '—'}% vs the prior window, over ${rising.attempts} questions.`,
      why: 'Whatever you changed here is working — protect it with spaced revision instead of re-reading.',
      actions: [
        { kind: 'adaptive', label: `Keep ${rising.name} warm (6 MCQs)`, adaptive: { subjectCode: rising.code, count: 6 } },
      ],
    })
  }

  // 3) revision debt
  if (indicators.revisionDebt.count >= 12) {
    insights.push({
      id: 'revision-debt', severity: indicators.revisionDebt.count >= 25 ? 'critical' : 'warning',
      title: `Revision debt: ${indicators.revisionDebt.count} concepts overdue`,
      evidence: `≈${indicators.revisionDebt.minutes} minutes of scheduled revision is pending; recall across touched concepts is ${indicators.recall ?? '—'}%.`,
      why: 'Uncleared debt compounds — every week it waits, more scored knowledge decays below the recall line.',
      actions: [
        { kind: 'revision', label: 'Start Smart Revision' },
        { kind: 'planner', label: 'Schedule it in the Planner' },
      ],
    })
  }

  // 4) fading high-yield memory
  const fadingHighYield = weaknesses.filter((w) => w.signals.includes('faded') && w.examRelevance >= 3).length
  if (fadingHighYield >= 3) {
    insights.push({
      id: 'fading-high-yield', severity: 'warning',
      title: `${fadingHighYield} high-yield concepts are fading`,
      evidence: 'Studied once, scored well — but estimated recall has now decayed below 40%.',
      why: 'These were your wins; a short revision pass recovers them far cheaper than relearning.',
      actions: [
        { kind: 'revision', label: 'Run a decay-clearing session' },
        { kind: 'map', label: 'See them on the map', map: { scope: 'weakest' } },
      ],
    })
  }

  // 5) mock baseline
  if (indicators.mock.tests === 0 && overall != null) {
    insights.push({
      id: 'no-mock', severity: 'info',
      title: 'No mock baseline yet',
      evidence: `Practice accuracy ${indicators.accuracy ?? '—'}% and readiness ${overall}% — but no timed, negatively-marked test on record.`,
      why: 'Mocks measure speed + marking discipline that practice never surfaces. One test reframes everything.',
      actions: [{ kind: 'exam', label: 'Take a short subject mock', exam: { mode: 'subject' } }],
    })
  }

  // 6) pace
  if (indicators.speed.medianSec != null && indicators.speed.medianSec > 90) {
    insights.push({
      id: 'slow-pace', severity: 'warning',
      title: `Solving pace is ${indicators.speed.medianSec}s per question`,
      evidence: `Median over your last timed attempts vs the ${EXAM_PACE_SEC}s NEET-PG target.`,
      why: 'At this pace you would leave a large share of a real paper unattempted — speed needs reps, not more theory.',
      actions: [
        { kind: 'quiz', label: '10 rapid-fire MCQs', quiz: { count: 10 } },
        { kind: 'exam', label: 'Timed rapid mock', exam: { mode: 'rapid' } },
      ],
    })
  }

  // 7) consistency
  if (indicators.consistency.activeDays14 <= 4) {
    insights.push({
      id: 'consistency', severity: indicators.consistency.activeDays14 <= 2 ? 'warning' : 'info',
      title: `Only ${indicators.consistency.activeDays14} active days in the last 14`,
      evidence: `Current streak: ${indicators.consistency.streak} day${indicators.consistency.streak === 1 ? '' : 's'}.`,
      why: 'The forgetting curve does not pause — short daily contact beats rare long sessions.',
      actions: [{ kind: 'planner', label: 'Build a realistic daily plan' }],
    })
  }

  // 8) untouched high-yield
  const untouchedHY = weaknesses.filter((w) => w.signals.includes('untouched')).length
  if (untouchedHY >= 3) {
    insights.push({
      id: 'high-yield-gaps', severity: 'info',
      title: `${untouchedHY} high-yield topics not started`,
      evidence: 'Concepts rated 4–5/5 for NEET-PG relevance with zero engagement so far.',
      why: 'Coverage first: untouched high-yield topics cost more marks than imperfect mastery of touched ones.',
      actions: [
        { kind: 'map', label: 'Open weakest-area map', map: { scope: 'weakest' } },
        { kind: 'planner', label: 'Fit them into the plan' },
      ],
    })
  }

  return insights.slice(0, 6)
}

// ── readiness ───────────────────────────────────────────────────────────────
function buildReadiness(
  ctx: PerformanceContext, signals: Map<string, ConceptSignal>,
  indicators: PerformanceIndicators, speedMedianSec: number | null, timedCount: number,
  mockPercents: number[],
): PerformanceReadiness {
  const now = ctx.now
  const touched = [...signals.values()].filter((s) => s.engaged)
  const totalYield = ctx.concepts.reduce((a, c) => a + c.examRelevance, 0) || 1
  const coveredYield = ctx.concepts.filter((c) => signals.get(c.id)?.engaged).reduce((a, c) => a + c.examRelevance, 0)
  const coverage = Math.round((coveredYield / totalYield) * 100)

  const recallMean = touched.length ? mean(touched.map((s) => s.recall)) : null
  const weakConcepts = touched.filter((s) => s.score < 45 || s.recall < 0.55)
  const coveredWeak = weakConcepts.filter((s) =>
    ctx.revisionItems.some((r) => r.conceptId === s.conceptId) ||
    (s.lastReviewed && daysBetweenKeys(istDayKey(now), istDayKey(s.lastReviewed)) <= 14),
  ).length
  const revisionCoverage = weakConcepts.length ? pctOf(coveredWeak, weakConcepts.length) : null

  const speedScore = speedMedianSec != null ? clamp(Math.round((100 * EXAM_PACE_SEC) / speedMedianSec), 0, 100) : null
  const revisionScore = revisionCoverage != null
    ? Math.round(0.6 * revisionCoverage + 0.4 * clamp(100 - indicators.revisionDebt.count * 4, 0, 100))
    : null
  const testScore = mockPercents.length
    ? Math.round(mean(mockPercents.slice(0, 3)))
    : null
  const accuracyScore = indicators.accuracy

  type DimDraft = Omit<PerformanceReadiness['dimensions'][number], 'effectiveWeight'>
  const raw: DimDraft[] = [
    {
      key: 'knowledge', label: 'Knowledge (coverage)', weight: 25,
      value: coverage,
      note: `${touched.length} of ${ctx.concepts.length} concepts engaged, weighted by NEET-PG yield.`,
      basis: 'full syllabus graph',
      suggestion: coverage < 60
        ? 'Widen the base — high-yield untouched topics first (Learn + Doubt Search map).'
        : 'Coverage is healthy — protect it with spaced revision, not more first reads.',
      lacksData: false,
    },
    {
      key: 'accuracy', label: 'Accuracy', weight: 20,
      value: accuracyScore,
      note: `Correct rate over your last ${Math.min(ACCURACY_WINDOW, ctx.attempts.length)} attempts.`,
      basis: 'last 200 attempts, all sources',
      suggestion: accuracyScore != null && accuracyScore < 60
        ? 'Slow down on stems, tag every error type — accuracy responds to error hygiene fast.'
        : 'Push into harder vignette mixes to keep the gain honest.',
      lacksData: ctx.attempts.length < 10,
    },
    {
      key: 'recall', label: 'Recall (retention)', weight: 15,
      value: recallMean != null ? Math.round(recallMean * 100) : null,
      note: 'Mean Ebbinghaus estimated recall across concepts you have studied.',
      basis: `${touched.length} touched concepts`,
      suggestion: recallMean != null && recallMean < 60
        ? 'Clear revision debt — due cards and decayed concepts first.'
        : 'Memory is holding; schedule light top-ups before decay.',
      lacksData: touched.length < 5,
    },
    {
      key: 'speed', label: 'Speed (pace)', weight: 10,
      value: speedScore,
      note: `Median ${speedMedianSec ?? '—'}s per question vs the ${EXAM_PACE_SEC}s NEET-PG pace.`,
      basis: `${timedCount} timed attempts`,
      suggestion: speedScore != null && speedScore < 60
        ? 'Do timed rapid sets weekly — pace is trained, not read.'
        : 'Pace is exam-ready — keep it warm with timed blocks.',
      lacksData: timedCount < 20,
    },
    {
      key: 'revision', label: 'Revision health', weight: 10,
      value: revisionScore,
      note: `60% coverage of weak concepts by active revision + 40% debt pressure (${indicators.revisionDebt.count} overdue).`,
      basis: 'revision queue + recent reviews',
      suggestion: revisionScore != null && revisionScore < 50
        ? 'Clear the oldest debt first — Smart Revision orders it for you.'
        : 'Revision is keeping pace with decay — sustain the rhythm.',
      lacksData: touched.length < 10,
    },
    {
      key: 'test', label: 'Test performance', weight: 15,
      value: testScore,
      note: mockPercents.length
        ? `Mean of your last ${Math.min(3, mockPercents.length)} mock${mockPercents.length === 1 ? '' : 's'} (+4/−1 marking).`
        : 'No submitted mocks yet.',
      basis: `${mockPercents.length} submitted tests`,
      suggestion: mockPercents.length === 0
        ? 'Take one short subject mock this week — it prices your speed and marking discipline.'
        : testScore != null && testScore < 50
          ? 'Review every mock: 30 minutes of review is worth more than another mock.'
          : 'Good floor — raise difficulty and length progressively.',
      lacksData: mockPercents.length === 0,
    },
    {
      key: 'consistency', label: 'Consistency', weight: 5,
      value: indicators.consistency.adherence,
      note: `${indicators.consistency.activeDays14} of the last 14 days had at least one logged session.`,
      basis: 'study-session feed, IST days',
      suggestion: indicators.consistency.adherence < 50
        ? 'Show up daily — even 20 focused minutes protects the curve.'
        : 'Routine is strong — guard it during busy rotations.',
      lacksData: false,
    },
  ]

  const usable = raw.filter((d) => !d.lacksData && d.value != null)
  const weightSum = usable.reduce((a, d) => a + d.weight, 0)
  const dimensions: PerformanceReadiness['dimensions'] = raw.map((d) => ({
    ...d,
    effectiveWeight: d.weight, // nominal; replaced below when usable
  }))
  if (weightSum > 0) {
    for (const d of dimensions) {
      const match = usable.find((u) => u.key === d.key)
      d.effectiveWeight = match ? Math.round((d.weight / weightSum) * 100) : 0
    }
  }
  const overall = weightSum > 0
    ? Math.round(usable.reduce((a, d) => a + (d.value as number) * (d.weight / weightSum), 0))
    : null
  const excluded = raw.filter((d) => d.lacksData || d.value == null).map((d) => d.label)
  const band = overall == null
    ? 'No data yet'
    : overall >= 75 ? 'Exam sharp' : overall >= 60 ? 'On track' : overall >= 40 ? 'Developing' : 'Building foundations'

  const weightNote = excluded.length
    ? `readiness = weighted mean of ${usable.length} of 7 dimensions (excluded: ${excluded.join(', ')})`
    : 'readiness = 0.25·knowledge + 0.20·accuracy + 0.15·recall + 0.15·test + 0.10·speed + 0.10·revision + 0.05·consistency'

  return {
    overall, band, dimensions,
    methodology: weightNote,
    excluded,
    disclaimer: 'A learning-analytics estimate of preparation coverage, stability and test form — not a rank prediction or a measure of clinical competence.',
  }
}

// ── the unified builder ─────────────────────────────────────────────────────
export async function buildPerformancePayload(): Promise<PerformancePayload> {
  const ctx = await loadPerformanceContext()
  const signals = conceptSignals(ctx)
  const buckets = istBuckets(ctx.now, TREND_BUCKETS)

  const touched = [...signals.values()].filter((s) => s.engaged)
  const touchedIds = new Set(touched.map((s) => s.conceptId))

  // indicators
  const lastN = ctx.attempts.slice(0, ACCURACY_WINDOW)
  const accuracy = lastN.length ? pctOf(lastN.filter((a) => a.correct).length, lastN.length) : null
  const w7 = windowAccuracy(ctx.attempts, ctx.now, 0, 7)
  const p7 = windowAccuracy(ctx.attempts, ctx.now, 7, 14)
  const accuracyDelta = w7.acc != null && p7.acc != null ? w7.acc - p7.acc : null

  const recallMean = touched.length ? mean(touched.map((s) => s.recall)) : null
  const debtCount = ctx.revisionItems.length
  const debtMinutes = ctx.revisionItems.reduce((a, r) => a + r.minutes, 0)

  const dueCards = ctx.cardReviews.filter((c) => c.dueAt.getTime() <= ctx.now.getTime()).length
  const weakConcepts = touched.filter((s) => s.score < 45 || s.recall < 0.55)
  const coveredWeak = weakConcepts.filter((s) =>
    ctx.revisionItems.some((r) => r.conceptId === s.conceptId) ||
    (s.lastReviewed && daysBetweenKeys(istDayKey(ctx.now), istDayKey(s.lastReviewed)) <= 14),
  ).length
  const revisionCoverage = weakConcepts.length ? pctOf(coveredWeak, weakConcepts.length) : null

  const mockPercents = ctx.exams
    .filter((e) => e.maxScore > 0)
    .map((e) => Math.round((e.score / e.maxScore) * 100))
  const last4 = mockPercents.slice(0, 4)
  const spread = last4.length >= 3 ? Math.max(...last4) - Math.min(...last4) : null
  const mockBand = spread == null ? null : spread <= 8 ? 'Steady' : spread <= 15 ? 'Mostly steady' : 'Swinging'

  const timed = ctx.attempts.filter((a) => a.timeMs >= MIN_TIMED_MS).slice(0, SPEED_WINDOW).map((a) => a.timeMs)
  const timedCount = timed.length
  const medianSec = timedCount ? Math.round(median(timed) / 1000) : null
  const speedBand = medianSec == null
    ? 'No timed data'
    : medianSec <= 45 ? 'Ahead of pace' : medianSec <= EXAM_PACE_SEC ? 'On pace' : medianSec <= 90 ? 'Slow' : 'Very slow'

  const activeDays14 = new Set(
    ctx.sessions
      .filter((s) => daysBetweenKeys(istDayKey(ctx.now), istDayKey(s.date)) < 14)
      .map((s) => istDayKey(s.date)),
  ).size
  const streak = computeStreak(ctx.sessions.map((s) => s.date))

  const openMistakes = ctx.mistakes.filter((m) => m.status !== 'resolved')
  const repeatedMistakes = openMistakes.filter((m) => m.wrongCount >= 2).length
  const weekAgo = ctx.now.getTime() - 7 * DAY
  const resolvedThisWeek = ctx.mistakes.filter((m) => m.resolvedAt && m.resolvedAt.getTime() >= weekAgo).length
  const wrongAttempts = ctx.attempts.filter((a) => !a.correct).length
  const mistakeRate = ctx.attempts.length >= 10 ? pctOf(wrongAttempts, ctx.attempts.length) : null
  const topError = ctx.errorPatterns[0] ?? null

  // topic mastery buckets
  const topicStates = new Map<string, { total: number; engaged: number; scores: number[] }>()
  for (const sig of signals.values()) {
    if (!sig.topicId) continue
    const row = topicStates.get(sig.topicId) ?? { total: 0, engaged: 0, scores: [] }
    row.total++
    if (sig.engaged) { row.engaged++; row.scores.push(sig.score) }
    topicStates.set(sig.topicId, row)
  }
  let topicsMastered = 0
  for (const t of topicStates.values()) {
    if (t.engaged >= Math.max(2, Math.ceil(t.total * 0.5)) && t.scores.length && mean(t.scores) >= 70) topicsMastered++
  }

  const indicators: PerformanceIndicators = {
    overallProgress: (() => {
      const totalYield = ctx.concepts.reduce((a, c) => a + c.examRelevance, 0) || 1
      const covered = ctx.concepts.filter((c) => touchedIds.has(c.id)).reduce((a, c) => a + c.examRelevance, 0)
      return Math.round((covered / totalYield) * 100)
    })(),
    knowledgeSplit: {
      strong: touched.filter((s) => s.score >= 70 && s.recall >= 0.55).length,
      unstable: touched.filter((s) => s.score >= 45 && (s.score < 70 || s.recall < 0.55)).length,
      weak: touched.filter((s) => s.score < 45).length,
      new: ctx.concepts.length - touched.length,
    },
    accuracy, accuracyDelta,
    recall: recallMean != null ? r1(recallMean) : null,
    revisionDebt: { count: debtCount, minutes: debtMinutes },
    revisionCoverage,
    mock: {
      tests: ctx.exams.length,
      meanPercent: mockPercents.length ? Math.round(mean(mockPercents)) : null,
      lastPercent: mockPercents[0] ?? null,
      bestPercent: mockPercents.length ? Math.max(...mockPercents) : null,
      spread, band: mockBand,
    },
    speed: {
      medianSec, pace: EXAM_PACE_SEC, band: speedBand,
      note: medianSec == null
        ? `Answer timed questions to calibrate against the ${EXAM_PACE_SEC}s NEET-PG pace.`
        : `Median ${medianSec}s per question against the ${EXAM_PACE_SEC}s target pace.`,
    },
    consistency: { streak, activeDays14, adherence: Math.min(100, Math.round((activeDays14 / 14) * 100)) },
    mistakes: {
      open: openMistakes.length, repeated: repeatedMistakes, resolvedThisWeek,
      mistakeRate,
      topErrorType: topError ? { type: topError.errorType, count: topError.count } : null,
    },
    weakCount: touched.filter((s) => s.score < 45 || s.recall < 0.55).length,
    strongCount: touched.filter((s) => s.score >= 70 && s.recall >= 0.55).length,
    topicsMastered,
    topicsTotal: topicStates.size,
  }

  const subjects = subjectRows(ctx, signals)
  const { weaknesses, focusNow } = weaknessIntel(ctx, signals, subjects)
  const strengths = strengthIntel(ctx, signals, subjects)
  const readiness = buildReadiness(ctx, signals, indicators, medianSec, timedCount, mockPercents)
  const insights = buildInsights(ctx, subjects, indicators, weaknesses, readiness.overall)
  const trends: PerformanceTrend[] = [
    accuracyTrend(ctx, buckets),
    mockTrend(ctx),
    speedTrend(ctx, buckets),
    revisionTrend(ctx, buckets),
    mistakeTrend(ctx, buckets),
    coverageTrend(ctx, buckets),
  ]

  // exam readiness
  const clock = examClock(ctx.profile.year, ctx.profile.gradYear, ctx.profile.dailyHours, ctx.profile.examDate ? new Date(ctx.profile.examDate) : null)
  const untouchedHighYield = ctx.concepts.filter((c) => c.examRelevance >= 4 && !signals.get(c.id)?.engaged).length
  const gaps: { label: string; detail: string }[] = []
  if (untouchedHighYield > 0) gaps.push({ label: 'Syllabus coverage', detail: `${untouchedHighYield} high-yield concepts (relevance 4–5) not yet engaged.` })
  if (debtCount > 0) gaps.push({ label: 'Revision debt', detail: `${debtCount} concepts overdue (≈${debtMinutes} min).` })
  if (ctx.exams.length === 0) gaps.push({ label: 'Mock baseline', detail: 'No timed, negatively-marked test on record yet.' })
  else if ((indicators.mock.meanPercent ?? 0) < 45) gaps.push({ label: 'Test form', detail: `Mock mean ${indicators.mock.meanPercent}% — below a comfortable NEET-PG buffer.` })
  if (readiness.excluded.length) gaps.push({ label: 'Thin signals', detail: `Not enough data yet for: ${readiness.excluded.join(', ')}.` })

  const testBand = mockPercents.length === 0
    ? null
    : (mockPercents[0] >= 60 ? 'Test-ready' : mockPercents[0] >= 45 ? 'Nearly there' : mockPercents[0] >= 30 ? 'Building' : 'Early stage')
  const testNote = mockPercents.length === 0
    ? 'No mock yet — one short subject test unlocks this reading.'
    : `Last mock ${mockPercents[0]}% · mean ${indicators.mock.meanPercent}% · best ${indicators.mock.bestPercent}%` +
      (mockBand ? ` · score swing: ${mockBand.toLowerCase()}` : '')

  const accTrend = trends[0]
  const mockTr = trends[1]
  let trajectory: PerformanceExamReadiness['trajectory'] = null
  const improvedSignals = [accTrend.improved, mockTr.improved].filter((x) => x != null) as boolean[]
  if (improvedSignals.length) {
    const ups = improvedSignals.filter(Boolean).length
    const direction: PerformanceDirection = ups === improvedSignals.length ? 'up' : ups === 0 ? 'down' : 'flat'
    const note = direction === 'up'
      ? 'Accuracy and mock form are both trending up over the recent windows.'
      : direction === 'down'
        ? 'Recent accuracy/mock form is below the prior window — arrest the slide before adding new material.'
        : 'Mixed recent signals — some series up, some down; stabilise before judging.'
    trajectory = { direction, note }
  }

  const examReadiness: PerformanceExamReadiness = {
    current: readiness.overall,
    band: readiness.band,
    gaps,
    highPriorityTopics: weaknesses.filter((w) => w.examRelevance >= 3).slice(0, 4),
    revisionDebt: indicators.revisionDebt,
    testReadiness: mockPercents.length === 0 ? null : {
      tests: ctx.exams.length,
      lastPercent: mockPercents[0] ?? null,
      meanPercent: indicators.mock.meanPercent,
      bestPercent: indicators.mock.bestPercent,
      band: testBand,
      note: testNote,
    },
    trajectory,
    examDate: ctx.profile.examDate ? new Date(ctx.profile.examDate).toISOString() : null,
    daysLeft: clock.daysLeft,
    disclaimer: 'Estimates from in-platform signals only — never a rank, score or selection guarantee.',
  }

  const totalAttemptsAllTime = ctx.attemptTotal
  const activeDays30 = new Set(
    ctx.sessions.filter((s) => daysBetweenKeys(istDayKey(ctx.now), istDayKey(s.date)) < 30).map((s) => istDayKey(s.date)),
  ).size
  const insufficientData = totalAttemptsAllTime < 5 && ctx.exams.length === 0

  return {
    generatedAt: ctx.now.toISOString(),
    indicators,
    readiness,
    trends,
    subjects,
    weaknesses,
    focusNow,
    strengths,
    insights,
    examReadiness,
    dataBasis: {
      attempts: totalAttemptsAllTime,
      exams: ctx.exams.length,
      activeDays30,
      conceptsTouched: touched.length,
      conceptsTotal: ctx.concepts.length,
      windowDays: TREND_BUCKETS * 7,
    },
    insufficientData,
    insufficientNote: insufficientData
      ? 'Fewer than 5 questions answered and no mocks yet — readiness will stay provisional until the engine sees real attempts.'
      : undefined,
    disclaimers: [
      'Readiness is a learning-analytics estimate — never a rank or outcome guarantee.',
      'Only in-platform activity is measured; external study is not counted.',
      'Dimension weights are fixed and published — they never adjust to flatter the number.',
    ],
  }
}

// ── AI grounding digest (shared by /api/performance/ai) ─────────────────────
export function buildPerformanceDigest(p: PerformancePayload): string {
  const i = p.indicators
  const lines: string[] = []
  lines.push(`GENERATED: ${p.generatedAt} · basis: ${p.dataBasis.attempts} attempts, ${p.dataBasis.exams} mocks, ${p.dataBasis.conceptsTouched}/${p.dataBasis.conceptsTotal} concepts touched`)
  lines.push(`READINESS: overall ${p.readiness.overall ?? 'n/a'} (${p.readiness.band})${p.readiness.excluded.length ? `, excluded for thin data: ${p.readiness.excluded.join(', ')}` : ''}`)
  for (const d of p.readiness.dimensions) {
    lines.push(`  ${d.label}: ${d.value ?? 'no data'} (weight ${d.effectiveWeight}) — ${d.note}`)
  }
  lines.push(`INDICATORS: engagement ${i.overallProgress}% · accuracy ${i.accuracy ?? 'n/a'}% (7d Δ ${i.accuracyDelta ?? 'n/a'}pp) · recall ${i.recall ?? 'n/a'}% · speed ${i.speed.medianSec ?? 'n/a'}s vs ${i.speed.pace}s (${i.speed.band}) · streak ${i.consistency.streak}d, active ${i.consistency.activeDays14}/14 · revision debt ${i.revisionDebt.count} items (~${i.revisionDebt.minutes}min) · mistakes open ${i.mistakes.open}, repeated ${i.mistakes.repeated}, resolved 7d ${i.mistakes.resolvedThisWeek}${i.mistakes.topErrorType ? `, top error type: ${i.mistakes.topErrorType.type} ×${i.mistakes.topErrorType.count}` : ''} · mocks ${i.mock.tests} (last ${i.mock.lastPercent ?? 'n/a'}%, mean ${i.mock.meanPercent ?? 'n/a'}%, swing ${i.mock.band ?? 'n/a'})`)
  lines.push(`TRENDS:`)
  for (const t of p.trends) {
    lines.push(`  ${t.label}: ${t.direction}${t.delta != null ? ` (Δ ${t.delta}${t.unit === 's' ? 's' : t.unit === '%' ? 'pp' : ''})` : ''}${t.insufficient ? ' [insufficient data]' : ''} — ${t.note}`)
  }
  if (p.subjects.length) {
    lines.push(`SUBJECTS (weakest first, max 8): ${p.subjects.slice(0, 8).map((s) => `${s.name} ${s.mastery ?? '—'}%${s.accuracy != null ? `/acc ${s.accuracy}%` : ''}${s.trend != null ? ` (Δ14d ${s.trend > 0 ? '+' : ''}${s.trend}pp)` : ''}`).join(' · ')}`)
  }
  if (p.weaknesses.length) {
    lines.push(`TOP WEAKNESSES (importance-ranked):`)
    for (const w of p.weaknesses.slice(0, 6)) lines.push(`  [${w.importance}] ${w.label} (${w.kind}${w.parent ? `, ${w.parent}` : ''}) — ${w.reason}`)
  }
  if (p.strengths.length) {
    lines.push(`STRENGTHS: ${p.strengths.slice(0, 4).map((s) => `${s.label} ${s.mastery}%`).join(' · ')}`)
  }
  if (p.insights.length) {
    lines.push(`ENGINE INSIGHTS: ${p.insights.map((x) => x.title).join(' | ')}`)
  }
  lines.push(`EXAM: ${p.examReadiness.daysLeft != null ? `~${p.examReadiness.daysLeft} days left · ` : ''}${p.examReadiness.trajectory ? `trajectory ${p.examReadiness.trajectory.direction} — ${p.examReadiness.trajectory.note}` : 'no trajectory yet'}`)
  return lines.join('\n')
}
