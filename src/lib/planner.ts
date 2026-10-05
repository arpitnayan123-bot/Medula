// ─── AI STUDY PLANNER ENGINE (PRODUCT 07, server-side) ──────────────────────
// «Given my exam date, target, current preparation and available time — what
// exactly should I study today?»
//
// Design contract:
//  • DETERMINISTIC — the schedule is computed from measured signals; the LLM
//    never builds the plan, it only narrates/advices on top of it.
//  • DATE-WINDOWED PHASES — phases are day ranges, never task chains, so one
//    missed day can NEVER permanently break the schedule. Missed work is
//    capped and folded forward ("catch-up"), not piled up.
//  • HONEST ARITHMETIC — feasibility is required-hours vs available-hours
//    over the student's own data. No rank predictions, no outcome promises.
//  • NO CHAIN-OF-THOUGHT — reasons are short measured notes ("mastery 32%",
//    "6 topics left, 42% covered"), never scoring internals.
//
// Reuses PRODUCT 06's loadRevisionContext for the heavy signal aggregation
// (concepts, mistakes, due cards, accuracy, subject maps) — one knowledge
// engine feeds every section.

import { db } from '@/lib/db'
import { DAY, computeStreak, istDayKey } from '@/lib/engine'
import { loadRevisionContext, type RevisionConceptCtx } from '@/lib/revision-engine'
import { effectiveLearnStatus } from '@/lib/learn-status'
import { getDemoProfile } from '@/lib/profile'
import type {
  PlannerFeasibility, PlannerHandoff, PlannerIntelligenceNote, PlannerMode,
  PlannerPhase, PlannerPlanShape, PlannerProgress, PlannerSlot, PlannerSubjectRow,
  PlannerTask, PlannerToday, PlannerWeeklyGoal,
} from '@/lib/types'
import { PLANNER_MODES, PLANNER_SLOT_LABELS } from '@/lib/types'

// ─── SMALL HELPERS ───────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const pct = (n: number) => Math.round(n * 100)

export const PLANNER_OFF_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function istWeekdayShort(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(d)
}

function dayKeyOffset(todayKey: string, offsetDays: number): string {
  const base = new Date(`${todayKey}T00:00:00+05:30`).getTime()
  return istDayKey(new Date(base + offsetDays * DAY))
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00+05:30`).getTime()
  const b = new Date(`${toKey}T00:00:00+05:30`).getTime()
  return Math.round((b - a) / DAY)
}

/** First-pass study minutes for a concept — difficulty-scaled. */
function conceptMinutes(difficulty: number): number {
  return 20 + difficulty * 8 // d1≈28, d2≈36, d3≈44
}

// ─── CONTEXT ─────────────────────────────────────────────────────────────────

export interface PlannerConceptRow {
  id: string
  topicId: string
  subjectCode: string
  difficulty: number
  examRelevance: number
  status: 'not-started' | 'learning' | 'completed' | 'needs-revision' | 'mastered'
  score: number
  recall: number
}

export interface PlannerTopicRow {
  id: string
  name: string
  subjectCode: string
  importance: number
  conceptIds: string[]
  conceptsCovered: number
}

export interface PlannerContext {
  profileId: string
  todayKey: string
  weekday: string
  // profile / plan inputs
  dailyMinutes: number
  weekdayMinutes: number
  weekendMinutes: number
  offDays: string[]
  examDate: Date | null
  examLabel: string
  examIsEstimate: boolean
  daysLeft: number
  targetNote: string
  planId: string | null
  // signals (from the shared revision context — one knowledge engine)
  revision: Awaited<ReturnType<typeof loadRevisionContext>>
  // syllabus
  concepts: PlannerConceptRow[]
  topics: PlannerTopicRow[]
  subjectNames: Map<string, string>
  subjectColors: Map<string, string>
  subjectWeights: Map<string, number>
  // activity feeds
  studySessions30: { date: Date; minutes: number; kind: string }[]
  doneDayKeys: Set<string> // planner days with ≥1 completed task
  topicsDone7: number // topic completion marks in the last 7 days
  examRuns30: number // completed adaptive 'exam' sessions, last 30d
  lastExamRunDaysAgo: number | null
  questionsLast7: number
  attemptsTotal: number
  // planner rows
  todayTasks: Awaited<ReturnType<typeof db.plannerTask.findMany>>
  carryOver: Awaited<ReturnType<typeof db.plannerTask.findMany>>
}

/** Load everything the planner needs in one parallel pass. */
export async function loadPlannerContext(
  profileRow: { id: string; dailyHours: number; weekdayHours: number; weekendHours: number; examDate: Date | null; examMode: boolean; examLabel: string },
  opts: { planId: string | null; dailyMinutes: number; weekdayMinutes: number; weekendMinutes: number; offDays: string[]; targetNote: string },
): Promise<PlannerContext> {
  const now = new Date()
  const todayKey = istDayKey(now)
  const weekday = istWeekdayShort(now)

  const [
    revision,
    conceptRows,
    topicRows,
    subjects,
    learnMarks,
    studySessions30,
    doneLogs,
    examRuns,
    attemptCounts,
    todayTasks,
    carryRows,
  ] = await Promise.all([
    loadRevisionContext(profileRow.id),
    db.concept.findMany({ select: { id: true, topicId: true, difficulty: true, examRelevance: true } }),
    db.topic.findMany({ select: { id: true, name: true, subjectId: true, importance: true } }),
    db.subject.findMany({ select: { id: true, code: true, name: true, color: true, neetWeight: true } }),
    db.learnProgress.findMany({ where: { profileId: profileRow.id } }),
    db.studySession.findMany({
      where: { profileId: profileRow.id, date: { gte: new Date(now.getTime() - 30 * DAY) } },
      select: { date: true, minutes: true, kind: true },
    }),
    db.plannerDayLog.findMany({
      where: { profileId: profileRow.id, doneCount: { gt: 0 } },
      select: { dayKey: true },
    }),
    db.adaptiveSession.findMany({
      where: { profileId: profileRow.id, mode: 'exam', completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 5,
      select: { completedAt: true, createdAt: true },
    }),
    Promise.all([
      db.questionAttempt.count({ where: { profileId: profileRow.id, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
      db.questionAttempt.count({ where: { profileId: profileRow.id } }),
    ]),
    db.plannerTask.findMany({ where: { profileId: profileRow.id, dayKey: todayKey } }),
    db.plannerTask.findMany({
      where: { profileId: profileRow.id, dayKey: { lt: todayKey }, status: 'missed' },
      orderBy: [{ priority: 'desc' }, { dayKey: 'desc' }],
      take: 40,
    }),
  ])

  // concept-level effective status (user mark wins, analytics fill the gaps)
  const markByEntity = new Map(learnMarks.map((m) => [`${m.kind}:${m.entityId}`, m.status]))
  const stateByConcept = revision.concepts
  const concepts: PlannerConceptRow[] = conceptRows.map((c) => {
    const st = stateByConcept.get(c.id)
    const slice = st ? { score: st.mastery, attemptCount: st.attemptCount, estRecall: st.recall } : null
    const mark = markByEntity.get(`concept:${c.id}`) ?? null
    return {
      id: c.id, topicId: c.topicId, subjectCode: c.topicId.split(':')[0] ?? '', // replaced below
      difficulty: c.difficulty, examRelevance: c.examRelevance,
      status: effectiveLearnStatus(mark, slice),
      score: st?.mastery ?? 0,
      recall: st?.recallMeasured ? st.recall : 0.5,
    }
  })
  // subjectCode for a concept comes via its topic — map it properly
  const topicSubject = new Map(topicRows.map((t) => [t.id, t.subjectId]))
  for (const c of concepts) c.subjectCode = topicSubject.get(c.topicId) ?? ''

  // honest weekly-goal counter: topics marked completed/mastered in the last 7d
  const topicsDone7 = await db.learnProgress.count({
    where: {
      profileId: profileRow.id, kind: 'topic',
      status: { in: ['completed', 'mastered'] },
      updatedAt: { gte: new Date(now.getTime() - 7 * DAY) },
    },
  })

  const topics: PlannerTopicRow[] = topicRows.map((t) => ({
    id: t.id, name: t.name, subjectCode: t.subjectId, importance: t.importance,
    conceptIds: [], conceptsCovered: 0,
  }))
  const topicById = new Map(topics.map((t) => [t.id, t]))
  for (const c of concepts) {
    const t = topicById.get(c.topicId)
    if (!t) continue
    t.conceptIds.push(c.id)
    if (c.status === 'completed' || c.status === 'mastered') t.conceptsCovered += 1
  }

  const examRuns30 = examRuns.filter((r) => {
    const at = r.completedAt ?? r.createdAt
    return now.getTime() - at.getTime() <= 30 * DAY
  })
  const lastRun = examRuns[0]
  const lastExamRunDaysAgo = lastRun ? Math.floor((now.getTime() - (lastRun.completedAt ?? lastRun.createdAt).getTime()) / DAY) : null

  return {
    profileId: profileRow.id,
    todayKey,
    weekday,
    dailyMinutes: opts.dailyMinutes,
    weekdayMinutes: opts.weekdayMinutes,
    weekendMinutes: opts.weekendMinutes,
    offDays: opts.offDays,
    examDate: profileRow.examDate,
    examLabel: profileRow.examMode && profileRow.examLabel ? profileRow.examLabel : 'NEET-PG',
    examIsEstimate: !profileRow.examDate,
    daysLeft: profileRow.examDate ? Math.max(0, Math.ceil((profileRow.examDate.getTime() - now.getTime()) / DAY)) : 180,
    targetNote: opts.targetNote,
    planId: opts.planId,
    revision,
    concepts,
    topics,
    subjectNames: new Map(subjects.map((s) => [s.id, s.name])),
    subjectColors: new Map(subjects.map((s) => [s.id, s.color])),
    subjectWeights: new Map(subjects.map((s) => [s.id, s.neetWeight])),
    studySessions30,
    doneDayKeys: new Set(doneLogs.map((l) => l.dayKey)),
    topicsDone7,
    examRuns30: examRuns30.length,
    lastExamRunDaysAgo,
    questionsLast7: attemptCounts[0],
    attemptsTotal: attemptCounts[1],
    todayTasks,
    carryOver: carryRows,
  }
}

/** Convenience loader for API routes: profile + active plan + planner context. */
export async function loadPlannerForProfile(): Promise<{
  profile: Awaited<ReturnType<typeof getDemoProfile>>
  planRow: Awaited<ReturnType<typeof db.plannerPlan.findFirst>>
  ctx: PlannerContext
}> {
  const profile = await getDemoProfile()
  const planRow = await db.plannerPlan.findFirst({
    where: { profileId: profile.id, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  })
  const ctx = await loadPlannerContext(profile, {
    planId: planRow?.id ?? null,
    dailyMinutes: planRow?.dailyMinutes ?? Math.round(clamp(profile.dailyHours, 0.5, 14) * 60),
    weekdayMinutes: planRow?.weekdayMinutes ?? Math.round(clamp(profile.weekdayHours, 0.5, 14) * 60),
    weekendMinutes: planRow?.weekendMinutes ?? Math.round(clamp(profile.weekendHours, 0.5, 14) * 60),
    offDays: planRow ? (planRow.offDays as string[]) : [],
    targetNote: planRow?.targetNote ?? '',
  })
  return { profile, planRow, ctx }
}

// ─── SUBJECT URGENCY ─────────────────────────────────────────────────────────

/** Per-subject urgency 0..100 — weakness × exam weight × coverage gap × accuracy. */
export function subjectUrgency(ctx: PlannerContext): PlannerSubjectRow[] {
  const rows = new Map<string, {
    total: number; covered: number; sumScore: number; scoreN: number
  }>()
  for (const c of ctx.concepts) {
    const r = rows.get(c.subjectCode) ?? { total: 0, covered: 0, sumScore: 0, scoreN: 0 }
    r.total += c.examRelevance
    if (c.status === 'completed' || c.status === 'mastered') r.covered += c.examRelevance
    if (c.score > 0) { r.sumScore += c.score; r.scoreN += 1 }
    rows.set(c.subjectCode, r)
  }
  const out: PlannerSubjectRow[] = []
  for (const [code, r] of rows) {
    const name = ctx.subjectNames.get(code) ?? code
    const coverage = r.total ? Math.round((r.covered / r.total) * 100) : 0
    const mastery = r.scoreN ? Math.round(r.sumScore / r.scoreN) : 0
    const acc = ctx.revision.subjectAcc.get(code)
    const accuracy = acc && acc.total >= 3 ? Math.round((acc.correct / acc.total) * 100) : 0
    const weight = ctx.subjectWeights.get(code) ?? 3
    // urgency: coverage gap (0..1) weighted by NEET weight + weakness + accuracy gap
    const gap = 1 - coverage / 100
    const weakness = 1 - mastery / 100
    const accGap = acc && acc.total >= 3 ? 1 - accuracy / 100 : 0.5
    const examProx = ctx.daysLeft <= 30 ? 1.25 : ctx.daysLeft <= 90 ? 1.1 : 1
    const urgency = clamp(Math.round((gap * 0.45 * (weight / 10) + weakness * 0.3 + accGap * 0.25) * 100 * examProx), 0, 100)
    let reason: string
    if (coverage === 0) reason = `not started — NEET-PG weight ~${weight}%`
    else if (coverage < 50) reason = `${coverage}% covered · weight ~${weight}% — first pass open`
    else if (mastery < 50) reason = `covered but unstable (${mastery}% mastery)`
    else if (accuracy && accuracy < 60) reason = `accuracy ${accuracy}% last 30d — needs questions`
    else reason = `holding steady (${coverage}% covered, ${mastery}% mastery)`
    out.push({ code, name, color: ctx.subjectColors.get(code) ?? '#22d3ee', neetWeight: weight, conceptsTotal: ctx.topics.filter((t) => t.subjectCode === code).reduce((a, t) => a + t.conceptIds.length, 0), conceptsCovered: 0, coverage, mastery, accuracy, priority: urgency, reason })
  }
  // recompute conceptsCovered per subject properly
  const coveredBySubject = new Map<string, number>()
  for (const c of ctx.concepts) {
    if (c.status === 'completed' || c.status === 'mastered') coveredBySubject.set(c.subjectCode, (coveredBySubject.get(c.subjectCode) ?? 0) + 1)
  }
  for (const row of out) row.conceptsCovered = coveredBySubject.get(row.code) ?? 0
  return out.sort((a, b) => b.priority - a.priority)
}

// ─── FEASIBILITY ─────────────────────────────────────────────────────────────

/** Realized capacity: median active-day minutes over the last 30d (≥5 active days). */
export function realizedCapacity(ctx: PlannerContext): { median: number; days: number } {
  const byDay = new Map<string, number>()
  for (const s of ctx.studySessions30) {
    const k = istDayKey(s.date)
    byDay.set(k, (byDay.get(k) ?? 0) + s.minutes)
  }
  const values = [...byDay.values()].filter((v) => v >= 10).sort((a, b) => a - b)
  if (values.length < 5) return { median: 0, days: values.length }
  const mid = Math.floor(values.length / 2)
  return { median: values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2), days: values.length }
}

export function computeFeasibility(ctx: PlannerContext, capacityPerDay: number, realizedNote: string | null): PlannerFeasibility {
  // required: remaining first-pass + revision cycles over engaged concepts
  let firstPassMinutes = 0
  let remainingConcepts = 0
  const totalConcepts = ctx.concepts.length
  for (const c of ctx.concepts) {
    if (c.status === 'completed' || c.status === 'mastered') continue
    remainingConcepts += 1
    const base = conceptMinutes(c.difficulty)
    firstPassMinutes += c.status === 'learning' ? base * 0.4 : base
  }
  const engaged = ctx.revision.engagedCount
  const cycles = clamp(Math.floor(ctx.daysLeft / 45), 0, 3) || 1
  const revisionMinutes = engaged * 12 * Math.min(2, cycles)
  const requiredMinutes = firstPassMinutes + revisionMinutes

  // available: exam-day countdown × capacity, minus off days
  const offDaySet = new Set(ctx.offDays)
  let studyDays = 0
  for (let i = 0; i < ctx.daysLeft; i++) {
    const wd = istWeekdayShort(new Date(Date.now() + i * DAY))
    if (!offDaySet.has(wd)) studyDays += 1
  }
  const availableMinutes = studyDays * capacityPerDay
  const ratio = availableMinutes > 0 ? requiredMinutes / availableMinutes : 999

  const verdict: PlannerFeasibility['verdict'] = ratio <= 0.7 ? 'comfortable' : ratio <= 1.05 ? 'tight' : 'overcommitted'
  const requiredHours = Math.round(requiredMinutes / 60)
  const availableHours = Math.round(availableMinutes / 60)

  const notes: string[] = []
  notes.push(`Remaining first pass: ~${remainingConcepts} concepts (${Math.round(firstPassMinutes / 60)}h) + ~${Math.round(revisionMinutes / 60)}h of revision cycles over ${engaged} engaged concepts.`)
  notes.push(`Available: ${studyDays} study days × ${Math.round(capacityPerDay / 60)}h/day ≈ ${availableHours}h${realizedNote ?? ''}.`)
  if (verdict === 'overcommitted') {
    notes.push(`Honest math: at this pace the full first pass needs ~${Math.ceil(requiredMinutes / Math.max(1, capacityPerDay))} study days — more than the ${studyDays} days left.`)
    notes.push('Options that actually work: (1) increase daily time, (2) defer low-yield topics and let the planner prioritize by exam weight, (3) shorten revision cycles to one pass.')
  } else if (verdict === 'tight') {
    notes.push('The plan fits, but the buffer is thin — protect your study days and keep catch-up caps on missed work.')
  } else {
    notes.push('You have healthy buffer — the planner will keep pushing weakest subjects first and protect revision cycles.')
  }
  notes.push('This is pacing arithmetic over your own data — never a rank or outcome prediction.')

  return {
    verdict, headline: verdict === 'comfortable'
      ? `Plan fits with buffer — ${requiredHours}h of work in ${availableHours}h of time`
      : verdict === 'tight'
        ? `Plan is tight — ${requiredHours}h of work in ${availableHours}h of time`
        : `Overcommitted — ${requiredHours}h of work in ${availableHours}h of time`,
    requiredHours, availableHours, ratio: Math.round(ratio * 100) / 100, notes,
    basis: {
      remainingConcepts, totalConcepts,
      revisionCyclesPlanned: Math.min(2, cycles),
      questionsTarget: clamp(ctx.daysLeft * 8, 200, 15000),
      daysRemaining: ctx.daysLeft,
      capacityPerDay,
    },
  }
}

// ─── PLAN SHAPE ──────────────────────────────────────────────────────────────

export function buildPlanShape(ctx: PlannerContext, feasibility: PlannerFeasibility): PlannerPlanShape {
  const days = ctx.daysLeft
  const urgency = subjectUrgency(ctx)
  const focusNames = urgency.slice(0, 4).map((s) => s.name)
  const revisionFocus = urgency.filter((s) => s.coverage >= 50).slice(0, 3).map((s) => s.name)
  const last30 = days <= 30

  const mk = (id: string, label: string, goal: string, fromFrac: number, toFrac: number, focus: string[], actions: string[]): PlannerPhase => ({
    id, label, goal,
    fromDays: Math.round(days * fromFrac),
    toDays: Math.round(days * toFrac),
    focus, actions,
    current: ctx.daysLeft <= Math.round(days * (1 - fromFrac)) && ctx.daysLeft > Math.round(days * (1 - toFrac)),
  })

  const phases: PlannerPhase[] = last30
    ? [
        mk('p1', 'High-Yield Repair', 'Weak high-yield topics only — no new low-yield material', 0, 0.33, focusNames.slice(0, 3), ['One weak topic block daily', 'Mistake retests every day', 'Flashcards due — never skip']),
        mk('p2', 'PYQ & Pattern Pass', 'Repeated exam themes + second revision of covered material', 0.33, 0.66, revisionFocus.length ? revisionFocus : focusNames, ['PYQ-pattern sets daily', 'Confusion-pair comparisons', 'Mock every 2–3 days']),
        mk('p3', 'Mock Calibration', 'Exam temperament — mocks, review, error log', 0.66, 0.9, [], ['Mock every 2 days', 'Deep-review every mock the same day', 'Error notebook final pass']),
        mk('p4', 'Final Days', 'Light recall, rest, and logistics — protect the curve', 0.9, 1, [], ['Flashcards + key facts only', 'No new material 48h before', 'Sleep on schedule']),
      ]
    : days > 90
      ? [
          mk('p1', 'First Pass & Foundation', 'Cover the high-yield core subject by subject with same-day questions', 0, 0.45, focusNames, ['Study blocks on the top-urgency subjects', '10–20 linked MCQs after each topic', 'Flashcard habit from day one']),
          mk('p2', 'Integration & Question Ramp', 'Connect pre-clinical to clinical; question volume goes up', 0.45, 0.7, focusNames.slice(0, 3), ['Mixed-subject practice sets', 'Weekly case/vignette work', 'First full mock this phase']),
          mk('p3', 'Revision Cycles & Mocks', 'Cycles over everything covered — mocks on cadence', 0.7, 0.88, revisionFocus.length ? revisionFocus : focusNames.slice(0, 2), ['Revision queue daily', `Mock every ${days > 180 ? 2 : 1} week(s)`, 'Error-driven repair']),
          mk('p4', 'Final Sprint', 'High-yield only — PYQ, mistakes, flashcards', 0.88, 1, [], ['PYQ-pattern sets', 'Mistake bank retests', 'No new material last 3 days']),
        ]
      : [
          mk('p1', 'Weak-Subject First Pass', 'Biggest coverage gaps in high-weight subjects first', 0, 0.3, focusNames.slice(0, 3), ['Daily study blocks on gap subjects', 'Same-day MCQs to anchor', 'Cards for volatile facts']),
          mk('p2', 'High-Yield Consolidation', 'Cover remaining high-yield material + start revision', 0.3, 0.6, focusNames.slice(0, 3), ['Topic coverage by exam weight', 'Mid-phase mock', 'Revision queue opens']),
          mk('p3', 'Revision & Mock Cadence', 'Full revision cycle + mocks on schedule', 0.6, 0.85, revisionFocus.length ? revisionFocus : [], ['Revision queue daily', 'Weekly mock + same-day review', 'Mistake retests']),
          mk('p4', 'Final Sprint', 'PYQ, mistakes, flashcards — nothing new', 0.85, 1, [], ['PYQ sets', 'Error-log purge', 'Taper + sleep']),
        ]

  const currentPhase = phases.find((p) => p.current) ?? phases[0]

  // weekly goals — honest pace math
  const remainingTopics = ctx.topics.filter((t) => t.conceptsCovered < t.conceptIds.length).length
  const weeksLeft = Math.max(1, Math.round(days / 7))
  const paceTopics = Math.ceil(remainingTopics / weeksLeft)
  const goalSubjectNames = urgency.slice(0, 2).map((s) => s.name).join(' & ')
  const weeklyGoals: PlannerWeeklyGoal[] = [
    {
      id: 'coverage',
      label: paceTopics > 0 ? `Cover ~${paceTopics} topic${paceTopics > 1 ? 's' : ''}/week — focus: ${goalSubjectNames}` : 'Coverage complete — hold it with revision cycles',
      detail: `${remainingTopics} topics still open · ${weeksLeft} week${weeksLeft > 1 ? 's' : ''} left · current phase: ${currentPhase?.label ?? '—'}`,
      paceTopicsPerWeek: paceTopics,
      doneThisWeek: ctx.topicsDone7,
    },
    {
      id: 'revision',
      label: `Keep revision debt under control — clear the daily Revise block`,
      detail: `${ctx.revision.revisionConceptIds.size} concepts on the revision list · ${ctx.revision.dueCards.length} cards due today`,
      paceTopicsPerWeek: 0,
      doneThisWeek: 0,
    },
    {
      id: 'mock',
      label: days <= 14 ? 'Mock every 2–3 days with same-day review' : `Mock every ${days > 180 ? 2 : 1} week${days > 180 ? 's' : ''} — review the same day`,
      detail: `${ctx.examRuns30} timed exam run${ctx.examRuns30 === 1 ? '' : 's'} in the last 30 days`,
      paceTopicsPerWeek: 0,
      doneThisWeek: ctx.examRuns30,
    },
  ]

  const mockCadenceDays = days <= 14 ? 3 : days <= 60 ? 7 : days <= 180 ? 14 : 30

  const notes: string[] = [
    `Plan regenerated live from your data — phases shift with the exam clock (${days} days left).`,
    ctx.offDays.length ? `Protected off days: ${ctx.offDays.join(', ')}.` : 'No protected off days set — consider one to protect the streak.',
  ]
  if (feasibility.verdict === 'overcommitted') notes.push('Feasibility flag: current time vs syllabus does not close — the planner trims to high-yield automatically.')
  notes.push('The planner never promises ranks or scores — it only balances your time against your syllabus.')

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    examLabel: ctx.examLabel,
    examDate: ctx.examDate ? ctx.examDate.toISOString() : null,
    examIsEstimate: ctx.examIsEstimate,
    daysLeft: days,
    stageLabel: last30 ? 'LAST-30 MODE' : days > 90 ? 'LONG RUNWAY' : 'COMPRESSION',
    phases,
    weeklyGoals,
    mockCadenceDays,
    revisionCyclesLeft: Math.max(0, Math.floor(days / 45)),
    notes,
  }
}

// ─── CAPACITY & SLOT RATIOS ──────────────────────────────────────────────────

export function resolveMode(ctx: PlannerContext, requested: PlannerMode): { mode: PlannerMode; capacityMinutes: number; offDay: boolean } {
  const offDay = ctx.offDays.includes(ctx.weekday)
  if (requested === 'auto') {
    if (offDay) return { mode: 'auto', capacityMinutes: Math.round(ctx.dailyMinutes * 0.25), offDay: true }
    const isWeekend = ctx.weekday === 'Sat' || ctx.weekday === 'Sun'
    const minutes = isWeekend ? (ctx.weekendMinutes || ctx.dailyMinutes) : (ctx.weekdayMinutes || ctx.dailyMinutes)
    return { mode: 'auto', capacityMinutes: minutes, offDay: false }
  }
  const declared = ctx.weekday === 'Sat' || ctx.weekday === 'Sun' ? (ctx.weekendMinutes || ctx.dailyMinutes) : (ctx.weekdayMinutes || ctx.dailyMinutes)
  const fixed: Partial<Record<PlannerMode, number>> = { 'two-hour': 120, 'one-hour': 60, emergency: 30 }
  const capacity = fixed[requested] ?? declared
  return { mode: requested, capacityMinutes: capacity, offDay }
}

const SLOT_RATIOS: Record<Exclude<PlannerMode, 'auto'> | 'auto', Record<PlannerSlot, number>> = {
  auto: { study: 0.4, practice: 0.28, revise: 0.22, test: 0.1 },
  full: { study: 0.4, practice: 0.28, revise: 0.22, test: 0.1 },
  'two-hour': { study: 0.4, practice: 0.3, revise: 0.2, test: 0.1 },
  'one-hour': { study: 0.3, practice: 0.4, revise: 0.2, test: 0.1 },
  revision: { study: 0.1, practice: 0.2, revise: 0.6, test: 0.1 },
  mock: { study: 0.12, practice: 0.18, revise: 0.25, test: 0.45 },
  'catch-up': { study: 0.22, practice: 0.28, revise: 0.32, test: 0.18 },
  'last-30': { study: 0.18, practice: 0.3, revise: 0.34, test: 0.18 },
  emergency: { study: 0.3, practice: 0.35, revise: 0.35, test: 0 },
}

// ─── CANDIDATES ──────────────────────────────────────────────────────────────
// Every candidate is (task fields, priority). Reasons are measured one-liners.

interface Candidate {
  slot: PlannerSlot
  kind: string
  refId: string
  title: string
  detail: string
  reason: string
  minutes: number
  priority: number
  handoff: PlannerHandoff
}

function studyCandidates(ctx: PlannerContext, budgetMinutes: number): Candidate[] {
  const out: Candidate[] = []
  const urgency = subjectUrgency(ctx).slice(0, 4)
  const coveredSet = new Set(ctx.todayTasks.filter((t) => t.status === 'done' && (t.kind === 'topic-learn' || t.kind === 'concept-repair')).map((t) => t.refId))

  // (a) topic first-pass — ranked by subject urgency × topic importance
  const topicRows = ctx.topics
    .filter((t) => t.conceptIds.length > 0 && t.conceptsCovered < t.conceptIds.length)
    .map((t) => {
      const subj = urgency.find((s) => s.code === t.subjectCode)
      const subjPriority = subj?.priority ?? 40
      const progress = t.conceptIds.length ? t.conceptsCovered / t.conceptIds.length : 0
      // nearly-finished topics get a nudge (completion momentum)
      const score = clamp(subjPriority * 0.7 + t.importance * 6 + (progress > 0.5 ? 12 : 0), 0, 100)
      return { t, subj, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  for (const { t, subj, score } of topicRows) {
    if (coveredSet.has(t.id)) continue
    const left = t.conceptIds.length - t.conceptsCovered
    const minutes = clamp(Math.round(budgetMinutes / Math.max(1, topicRows.length)), 20, 45)
    out.push({
      slot: 'study', kind: 'topic-learn', refId: t.id,
      title: `Study: ${t.name}`,
      detail: subj ? `${subj.name} · ${left} concept${left > 1 ? 's' : ''} left in this topic` : `${left} concepts left`,
      reason: subj
        ? `${subj.reason}${t.importance >= 4 ? ` · high-yield topic (importance ${t.importance}/5)` : ''}`
        : `open topic · importance ${t.importance}/5`,
      minutes, priority: Math.round(score),
      handoff: { type: 'learn-topic', topicId: t.id, label: `Open ${t.name} in Learn` },
    })
  }

  // (b) weak-concept repair — measured weakness from the knowledge engine
  const weak: { c: RevisionConceptCtx; score: number; errN: number }[] = []
  for (const c of ctx.revision.concepts.values()) {
    if (c.attemptCount <= 0 || c.mastery >= 45) continue
    const acc = ctx.revision.acc30.get(c.conceptId)
    const errN = acc ? acc.total - acc.correct : 0
    const recallRisk = 1 - c.recall
    const score = clamp(Math.round((1 - c.mastery / 100) * 55 + recallRisk * 25 + Math.min(1, errN / 4) * 20), 0, 100)
    weak.push({ c, score, errN })
  }
  weak.sort((a, b) => b.score - a.score)
  for (const { c, score, errN } of weak.slice(0, 2)) {
    if (coveredSet.has(c.conceptId)) continue
    if (topicRows.some((r) => r.t.id === c.topicId && out.some((o) => o.refId === r.t.id))) continue // topic already covers it
    out.push({
      slot: 'study', kind: 'concept-repair', refId: c.conceptId,
      title: `Repair: ${c.name}`,
      detail: `${c.subjectName} · mastery ${Math.round(c.mastery)}%`,
      reason: errN > 0
        ? `mastery ${Math.round(c.mastery)}% · ${errN} wrong answer${errN > 1 ? 's' : ''} last 30d`
        : `mastery ${Math.round(c.mastery)}% · recall est ${pct(c.recall)}%`,
      minutes: 18, priority: score,
      handoff: { type: 'hub', topicId: c.topicId, conceptId: c.conceptId, label: `Open ${c.name} in Topic Hub` },
    })
  }
  return out
}

function practiceCandidates(ctx: PlannerContext, budgetMinutes: number): Candidate[] {
  const out: Candidate[] = []
  const openMistakes = ctx.revision.mistakes.filter((m) => m.status !== 'resolved')
  const urgency = subjectUrgency(ctx)
  const examNear = ctx.daysLeft <= 60

  // (a) mistake retest — the single highest-value practice when mistakes exist
  if (openMistakes.length > 0) {
    const oldest = openMistakes.reduce((a, m) => (m.lastWrongAt < a.lastWrongAt ? m : a), openMistakes[0])
    const daysOld = Math.floor((Date.now() - oldest.lastWrongAt.getTime()) / DAY)
    out.push({
      slot: 'practice', kind: 'mistake-retest', refId: 'mistakes',
      title: `Retest: ${openMistakes.length} open mistake${openMistakes.length > 1 ? 's' : ''}`,
      detail: 'Mistake Intelligence → retest chain',
      reason: `${openMistakes.length} unresolved · oldest missed ${daysOld === 0 ? 'today' : `${daysOld}d ago`}`,
      minutes: clamp(8 + openMistakes.length, 12, 25),
      priority: 92 + Math.min(6, openMistakes.length),
      handoff: { type: 'mistakes', label: 'Open Mistake Intelligence' },
    })
  }

  // (b) MCQ set on the weakest engaged subject (or PYQ mix when exam is near)
  const accRows = [...ctx.revision.subjectAcc.entries()]
    .filter(([, v]) => v.total >= 3)
    .map(([code, v]) => ({ code, acc: Math.round((v.correct / v.total) * 100), total: v.total }))
    .sort((a, b) => a.acc - b.acc)
  const weakestAcc = accRows[0]
  const count = clamp(Math.round(budgetMinutes / 1.6), 5, 20)
  if (examNear) {
    out.push({
      slot: 'practice', kind: 'pyq', refId: 'pyq-set',
      title: `PYQ-pattern set — ${count} questions`,
      detail: 'Adaptive Engine · PYQ Pattern mode',
      reason: `exam in ${ctx.daysLeft}d · repeated exam themes deserve the reps`,
      minutes: clamp(Math.round(count * 1.6), 10, 30), priority: 84,
      handoff: { type: 'adaptive', mode: 'pyq', count, label: 'Start PYQ-pattern set' },
    })
  }
  out.push({
    slot: 'practice', kind: 'mcq', refId: weakestAcc ? `weak:${weakestAcc.code}` : 'ai-adaptive',
    title: weakestAcc ? `MCQ set — ${count} questions in ${ctx.subjectNames.get(weakestAcc.code) ?? weakestAcc.code}` : `MCQ set — ${count} questions`,
    detail: 'Adaptive Engine · starts automatically',
    reason: weakestAcc
      ? `accuracy ${weakestAcc.acc}% last 30d in ${ctx.subjectNames.get(weakestAcc.code) ?? weakestAcc.code} (${weakestAcc.total} attempts)`
      : 'adaptive mix ordered by what you need most',
    minutes: clamp(Math.round(count * 1.6), 10, 30), priority: weakestAcc ? clamp(100 - weakestAcc.acc, 55, 88) : 70,
    handoff: { type: 'adaptive', mode: 'weakness', subjectCode: weakestAcc?.code, count, label: 'Start MCQ set' },
  })
  return out
}

function reviseCandidates(ctx: PlannerContext, budgetMinutes: number): Candidate[] {
  const out: Candidate[] = []
  const now = new Date()

  // (a) due flashcards
  const due = ctx.revision.dueCards
  if (due.length > 0) {
    const overdue = due.filter((c) => now.getTime() - c.dueAt.getTime() > 3 * DAY).length
    out.push({
      slot: 'revise', kind: 'flashcards', refId: 'flashcards',
      title: `Grade ${due.length} due flashcard${due.length > 1 ? 's' : ''}`,
      detail: 'Smart Revision · Flashcard mode',
      reason: overdue > 0 ? `${due.length} due · ${overdue} overdue by 3d+ — the curve is slipping` : `${due.length} due today`,
      minutes: clamp(Math.round(due.length * 0.5), 5, 20), priority: overdue > 0 ? 90 : 80,
      handoff: { type: 'revision', mode: 'flashcard', minutes: clamp(Math.round(due.length * 0.5), 5, 20), label: 'Start flashcard revision' },
    })
  }

  // (b) weak & overdue concepts — the revision engine's daily queue
  const onList = ctx.revision.revisionConceptIds.size
  const atRisk = [...ctx.revision.concepts.values()].filter((c) => c.recallMeasured && c.recall < 0.45).length
  if (onList > 0 || atRisk > 0) {
    const minutes = clamp(Math.round(budgetMinutes * 0.7), 10, 35)
    out.push({
      slot: 'revise', kind: 'revision-session', refId: 'weak-queue',
      title: 'Revision queue — weak & overdue concepts',
      detail: 'Smart Revision · Weak Topic mode',
      reason: [
        onList > 0 ? `${onList} on the revision list` : null,
        atRisk > 0 ? `${atRisk} concepts with recall est <45%` : null,
      ].filter(Boolean).join(' · ') || 'keeps the forgetting curve honest',
      minutes, priority: 86,
      handoff: { type: 'revision', mode: 'weak', minutes, label: 'Start weak-topic revision' },
    })
  }
  return out
}

function testCandidates(ctx: PlannerContext, mode: PlannerMode): Candidate[] {
  const out: Candidate[] = []
  const cadence = ctx.daysLeft <= 14 ? 3 : ctx.daysLeft <= 60 ? 7 : 14
  const dueMock = ctx.lastExamRunDaysAgo === null || ctx.lastExamRunDaysAgo >= (mode === 'last-30' ? 3 : cadence)
  const mockDay = mode === 'mock' || mode === 'last-30' || (ctx.daysLeft <= 30 && dueMock)

  if (mockDay) {
    out.push({
      slot: 'test', kind: 'mock', refId: 'mock-set',
      title: 'Timed mock run — 25 questions',
      detail: 'Adaptive Engine · Exam mode (timed)',
      reason: ctx.lastExamRunDaysAgo === null
        ? 'no timed run yet — calibrate your exam pacing today'
        : `last timed run ${ctx.lastExamRunDaysAgo}d ago · cadence ${mode === 'last-30' ? 3 : cadence}d`,
      minutes: 45, priority: 95,
      handoff: { type: 'adaptive', mode: 'exam', count: 25, label: 'Start timed mock run' },
    })
    out.push({
      slot: 'test', kind: 'mock', refId: 'mock-lab',
      title: 'Full mock in the Question Lab',
      detail: 'Questions → Mock Test tab',
      reason: 'full-length paper for stamina and pacing practice',
      minutes: 60, priority: 60,
      handoff: { type: 'mock-lab', label: 'Open Question Lab' },
    })
    return out
  }

  // light calibration set between mocks
  out.push({
    slot: 'test', kind: 'mcq', refId: 'calibration',
    title: 'Calibration set — 8 questions',
    detail: 'Adaptive Engine · AI Adaptive',
    reason: ctx.lastExamRunDaysAgo !== null ? `keeps the exam gauge honest between mocks (last run ${ctx.lastExamRunDaysAgo}d ago)` : 'short adaptive set to steer tomorrow\'s plan',
    minutes: 12, priority: 55,
    handoff: { type: 'adaptive', mode: 'ai-adaptive', count: 8, label: 'Start calibration set' },
  })
  return out
}

// ─── TODAY GENERATION ────────────────────────────────────────────────────────

function carryOverCandidates(ctx: PlannerContext, capacityMinutes: number, mode: PlannerMode): Candidate[] {
  const capShare = mode === 'catch-up' ? 0.45 : 0.25
  const budget = Math.round(capacityMinutes * capShare)
  const todayRefs = new Set(ctx.todayTasks.map((t) => `${t.slot}|${t.kind}|${t.refId}`))
  const seen = new Set<string>()
  const out: Candidate[] = []
  let used = 0
  for (const t of ctx.carryOver) {
    const key = `${t.slot}|${t.kind}|${t.refId}`
    if (seen.has(key) || todayRefs.has(key)) continue
    if (t.kind === 'mock' && t.refId === 'mock-lab') continue // hand-off only, don't nag
    if (used + t.minutes > budget) continue
    seen.add(key)
    used += t.minutes
    const age = daysBetweenKeys(t.dayKey, ctx.todayKey)
    out.push({
      slot: (t.slot as PlannerSlot) ?? 'study', kind: t.kind, refId: t.refId,
      title: t.title, detail: t.detail,
      reason: `carried over — missed ${age === 1 ? 'yesterday' : `${age}d ago`} · ${t.reason}`,
      minutes: t.minutes, priority: t.priority + 8, // small bump: it's been waiting
      handoff: (t.meta as PlannerHandoff | null) ?? { type: 'mistakes', label: 'Open' },
    })
  }
  return out
}

function fillSlot(cands: Candidate[], budget: number, exclude: Set<string>): Candidate[] {
  const picked: Candidate[] = []
  let used = 0
  for (const c of cands.sort((a, b) => b.priority - a.priority)) {
    const key = `${c.slot}|${c.kind}|${c.refId}`
    if (exclude.has(key)) continue
    if (used + c.minutes <= budget + 6) { // small overflow tolerance keeps slots useful
      picked.push(c)
      exclude.add(key)
      used += c.minutes
    }
    if (used >= budget - 8) break
  }
  return picked
}

/** Generate (or reuse) today's task set. Returns the client `PlannerToday`. */
export async function generateToday(
  ctx: PlannerContext,
  hasPlan: boolean,
  requestedMode: PlannerMode,
  feasibility: PlannerFeasibility | null,
): Promise<{ today: PlannerToday; ctx: PlannerContext }> {
  const { mode, capacityMinutes, offDay } = resolveMode(ctx, requestedMode)
  const ratios = SLOT_RATIOS[mode]

  // 1) mark stale pending tasks from earlier days as missed (honest bookkeeping)
  await db.plannerTask.updateMany({
    where: { profileId: ctx.profileId, dayKey: { lt: ctx.todayKey }, status: 'pending' },
    data: { status: 'missed' },
  })
  // refresh carry-over candidates — tasks that JUST aged into 'missed' must be
  // available for today's catch-up (miss yesterday → it shows up today).
  ctx.carryOver = await db.plannerTask.findMany({
    where: { profileId: ctx.profileId, dayKey: { lt: ctx.todayKey }, status: 'missed' },
    orderBy: [{ priority: 'desc' }, { dayKey: 'desc' }],
    take: 40,
  })

  // 2) reuse-or-regenerate: keep done/skipped tasks, drop pending ones when the
  //    mode changed or nothing was generated yet.
  const dayLog = await db.plannerDayLog.findUnique({
    where: { profileId_dayKey: { profileId: ctx.profileId, dayKey: ctx.todayKey } },
  })
  const existingPending = ctx.todayTasks.filter((t) => t.status === 'pending')
  const modeChanged = dayLog ? dayLog.mode !== requestedMode : requestedMode !== 'auto'
  if (existingPending.length > 0 && !modeChanged) {
    return { today: assembleToday(ctx, mode, capacityMinutes, offDay), ctx }
  }
  await db.plannerTask.deleteMany({ where: { profileId: ctx.profileId, dayKey: ctx.todayKey, status: 'pending' } })

  // 3) candidates
  const exclude = new Set<string>([
    ...ctx.todayTasks.filter((t) => t.status !== 'pending').map((t) => `${t.slot}|${t.kind}|${t.refId}`),
  ])
  const carry = hasPlan ? carryOverCandidates(ctx, capacityMinutes, mode) : []
  for (const c of carry) exclude.add(`${c.slot}|${c.kind}|${c.refId}`)

  const studyBudget = Math.round(capacityMinutes * ratios.study)
  const practiceBudget = Math.round(capacityMinutes * ratios.practice)
  const reviseBudget = Math.round(capacityMinutes * ratios.revise)
  const testBudget = Math.round(capacityMinutes * ratios.test)

  let study = fillSlot(studyCandidates(ctx, studyBudget), studyBudget, exclude)
  let practice = fillSlot(practiceCandidates(ctx, practiceBudget), practiceBudget, exclude)
  let revise = fillSlot(reviseCandidates(ctx, reviseBudget), reviseBudget, exclude)
  let test = fillSlot(testCandidates(ctx, mode), testBudget, exclude)

  // 4) special shapes
  if (mode === 'emergency') {
    // ~30 minutes: one revise + one practice, the top of each
    const bestRevise = [...carry, ...reviseCandidates(ctx, 20)].sort((a, b) => b.priority - a.priority)[0]
    const bestPractice = practiceCandidates(ctx, 20).sort((a, b) => b.priority - a.priority)[0]
    study = []
    test = []
    revise = bestRevise ? [bestRevise] : []
    practice = bestPractice ? [bestPractice] : []
    if (!bestRevise && !bestPractice && studyCandidates(ctx, 20).length) {
      study = [studyCandidates(ctx, 20)[0]]
    }
  }
  if (offDay && mode === 'auto') {
    // protected rest day: flashcards + light revision only
    study = []
    test = []
    practice = []
    revise = revise.filter((c) => c.kind === 'flashcards' || c.kind === 'revision-session').slice(0, 1)
  }

  // 5) persist tasks
  const rows: {
    profileId: string; dayKey: string; slot: PlannerSlot; kind: string; refId: string
    title: string; detail: string; reason: string; minutes: number; priority: number
    status: string; meta: PlannerHandoff
  }[] = []
  for (const c of [...study, ...practice, ...revise, ...test]) {
    rows.push({
      profileId: ctx.profileId, dayKey: ctx.todayKey, slot: c.slot, kind: c.kind, refId: c.refId,
      title: c.title, detail: c.detail, reason: c.reason, minutes: c.minutes, priority: c.priority,
      status: 'pending', meta: c.handoff,
    })
  }
  // carry-over tasks keep their original meta
  const carryKeys = new Set(carry.map((c) => `${c.slot}|${c.kind}|${c.refId}`))
  for (const c of [...study, ...practice, ...revise, ...test]) {
    const key = `${c.slot}|${c.kind}|${c.refId}`
    if (carryKeys.has(key)) {
      const orig = ctx.carryOver.find((t) => `${t.slot}|${t.kind}|${t.refId}` === key)
      if (orig?.meta) rows.find((r) => `${r.slot}|${r.kind}|${r.refId}` === key)!.meta = orig.meta as PlannerHandoff
    }
  }
  if (rows.length > 0) {
    await db.plannerTask.createMany({ data: rows as never })
  }

  // 6) day log upsert
  const plannedMinutes = rows.reduce((a, r) => a + r.minutes, 0)
  await db.plannerDayLog.upsert({
    where: { profileId_dayKey: { profileId: ctx.profileId, dayKey: ctx.todayKey } },
    create: { profileId: ctx.profileId, dayKey: ctx.todayKey, mode, plannedMinutes, status: offDay ? 'rest' : 'open' },
    update: { mode, plannedMinutes, status: offDay ? 'rest' : 'open' },
  })

  // 7) reload + assemble
  const fresh = await loadPlannerContextForToday(ctx)
  return { today: assembleToday(fresh.ctx, mode, capacityMinutes, offDay, carry.length), ctx: fresh.ctx }
}

/** Cheap re-load of just today's tasks after generation. */
async function loadPlannerContextForToday(ctx: PlannerContext): Promise<{ ctx: PlannerContext }> {
  const rows = await db.plannerTask.findMany({ where: { profileId: ctx.profileId, dayKey: ctx.todayKey } })
  return { ctx: { ...ctx, todayTasks: rows } }
}

function taskToClient(t: {
  id: string; slot: string; kind: string; refId: string; title: string; detail: string
  reason: string; minutes: number; priority: number; status: string; dayKey: string; meta: unknown
}, todayKey: string): PlannerTask {
  return {
    id: t.id, slot: (t.slot as PlannerSlot) ?? 'study', kind: t.kind, refId: t.refId,
    title: t.title, detail: t.detail, reason: t.reason, minutes: t.minutes, priority: t.priority,
    status: (t.status as PlannerTask['status']) ?? 'pending',
    carriedFrom: t.dayKey === todayKey ? 0 : daysBetweenKeys(t.dayKey, todayKey),
    handoff: (t.meta as PlannerHandoff | null) ?? null,
  }
}

function assembleToday(ctx: PlannerContext, mode: PlannerMode, capacityMinutes: number, offDay: boolean, carriedOverCount = 0): PlannerToday {
  const pendingOrDone = ctx.todayTasks.filter((t) => t.status !== 'missed')
  const bySlot = (slot: PlannerSlot) =>
    pendingOrDone.filter((t) => t.slot === slot).map((t) => taskToClient(t, ctx.todayKey)).sort((a, b) => b.priority - a.priority)
  const slots = (['study', 'practice', 'revise', 'test'] as PlannerSlot[]).map((slot) => {
    const tasks = bySlot(slot)
    return { slot, tasks, minutes: tasks.filter((t) => t.status === 'pending' || t.status === 'done').reduce((a, t) => a + t.minutes, 0) }
  })
  const all = pendingOrDone.map((t) => taskToClient(t, ctx.todayKey))
  const top = all.filter((t) => t.status === 'pending').sort((a, b) => b.priority - a.priority)[0]
  const modeLabel = PLANNER_MODES.find((m) => m.id === mode)?.label ?? 'Auto'
  const pendingIn = (slot: PlannerSlot) => slots.find((s) => s.slot === slot)!.tasks.filter((t) => t.status === 'pending')

  // measured headline — “3 study blocks · 15 MCQs · 12 due cards · mock run”
  const headlineParts: string[] = []
  const studyN = pendingIn('study').length
  if (studyN > 0) headlineParts.push(`${studyN} study block${studyN > 1 ? 's' : ''}`)
  const practiceTasks = pendingIn('practice')
  const mcqCount = practiceTasks.filter((t) => t.kind === 'mcq' || t.kind === 'pyq').length
  if (mcqCount > 0) {
    const q = practiceTasks.filter((t) => t.kind === 'mcq' || t.kind === 'pyq').reduce((a, t) => a + Math.round(t.minutes / 1.6), 0)
    headlineParts.push(`~${q} MCQs`)
  }
  if (practiceTasks.some((t) => t.kind === 'mistake-retest')) headlineParts.push('mistake retests')
  if (pendingIn('revise').length > 0) {
    if (ctx.revision.dueCards.length > 0) headlineParts.push(`${ctx.revision.dueCards.length} due cards`)
    else headlineParts.push('revision queue')
  }
  const testTop = pendingIn('test')[0]
  if (testTop) headlineParts.push(testTop.kind === 'mock' ? 'mock run' : 'calibration set')

  return {
    dayKey: ctx.todayKey,
    mode,
    modeLabel,
    capacityMinutes,
    plannedMinutes: all.filter((t) => t.status === 'pending').reduce((a, t) => a + t.minutes, 0),
    headline: headlineParts.length ? headlineParts.join(' · ') : 'all clear — nothing pending today',
    slots,
    priority: top ? { title: top.title, reason: top.reason, taskId: top.id } : null,
    carriedOverCount,
    offDay,
  }
}

// ─── INTELLIGENCE NOTES ──────────────────────────────────────────────────────

export function buildIntelligence(ctx: PlannerContext, today: PlannerToday | null): PlannerIntelligenceNote[] {
  const notes: PlannerIntelligenceNote[] = []
  const overdueItems = [...ctx.revision.concepts.values()].filter((c) => c.onRevisionList && c.daysSince !== null && (c.daysSince ?? 0) >= 3)
  if (overdueItems.length > 0) {
    notes.push({ id: 'overdue', tone: 'risk', text: `${overdueItems.length} revision item${overdueItems.length > 1 ? 's are' : ' is'} overdue — the oldest was last reviewed ${Math.max(...overdueItems.map((c) => Math.round(c.daysSince ?? 0)))}d ago.`, action: { label: 'Clear revision debt', view: 'revision' } })
  }
  const openMistakes = ctx.revision.mistakes.filter((m) => m.status !== 'resolved')
  if (openMistakes.length > 0) {
    const neverRetested = openMistakes.filter((m) => m.status === 'unresolved').length
    notes.push({ id: 'mistakes', tone: 'risk', text: `${openMistakes.length} open mistake${openMistakes.length > 1 ? 's' : ''}, ${neverRetested} never retested — retests are the fastest accuracy win you have.`, action: { label: 'Open Mistake Intelligence', view: 'mistakes' } })
  }
  const atRisk = [...ctx.revision.concepts.values()].filter((c) => c.recallMeasured && c.recall < 0.4)
  if (atRisk.length > 0) {
    notes.push({ id: 'forgetting', tone: 'risk', text: `${atRisk.length} concept${atRisk.length > 1 ? 's' : ''} with recall estimate below 40% — these are your most likely forgets.`, action: { label: 'Revise them now', view: 'revision' } })
  }
  if (ctx.lastExamRunDaysAgo === null) {
    notes.push({ id: 'mock-gap', tone: 'info', text: 'No timed exam run yet — one 25-question timed set calibrates your pacing honestly.', action: { label: 'Open Adaptive Engine', view: 'adaptive' } })
  } else if (ctx.lastExamRunDaysAgo >= 7 && ctx.daysLeft <= 60) {
    notes.push({ id: 'mock-gap', tone: 'risk', text: `Last timed run was ${ctx.lastExamRunDaysAgo}d ago — with ${ctx.daysLeft} days left, tighten the mock cadence.`, action: { label: 'Take a timed set', view: 'adaptive' } })
  }
  const urgencyTop = subjectUrgency(ctx)[0]
  if (urgencyTop && urgencyTop.coverage < 40) {
    notes.push({ id: 'pace', tone: 'info', text: `${urgencyTop.name} is your biggest open gap (${urgencyTop.coverage}% covered, weight ~${urgencyTop.neetWeight}%) — today's study block targets it first.`, action: { label: 'Open Learn', view: 'learn' } })
  }
  const doneDays = ctx.doneDayKeys.size
  if (doneDays >= 3) {
    notes.push({ id: 'streak', tone: 'good', text: `${doneDays} planner day${doneDays > 1 ? 's' : ''} completed so far — consistency is the compounding asset.`, action: { label: 'See Progress', view: 'progress' } })
  }
  return notes.slice(0, 4)
}

// ─── PROGRESS ────────────────────────────────────────────────────────────────

export async function buildProgress(ctx: PlannerContext): Promise<PlannerProgress> {
  const logs = await db.plannerDayLog.findMany({
    where: { profileId: ctx.profileId },
    orderBy: { dayKey: 'desc' },
    take: 30,
  })
  const logByKey = new Map(logs.map((l) => [l.dayKey, l]))

  const last14: PlannerProgress['last14'] = []
  for (let i = 13; i >= 0; i--) {
    const key = dayKeyOffset(ctx.todayKey, -i)
    const log = logByKey.get(key)
    last14.push({ dayKey: key, planned: log?.plannedMinutes ?? 0, done: log?.doneMinutes ?? 0 })
  }

  // consistency14: any planner completion OR any study session that day
  const activeDays = new Set<string>(ctx.doneDayKeys)
  for (const s of ctx.studySessions30) if (Date.now() - s.date.getTime() <= 14 * DAY) activeDays.add(istDayKey(s.date))
  let consistencyCount = 0
  for (let i = 0; i < 14; i++) if (activeDays.has(dayKeyOffset(ctx.todayKey, -i))) consistencyCount += 1

  // adherence over the last 7 days with a plan
  let planned = 0
  let done = 0
  for (let i = 0; i < 7; i++) {
    const log = logByKey.get(dayKeyOffset(ctx.todayKey, -i))
    if (log && log.plannedMinutes > 0) { planned += log.plannedMinutes; done += log.doneMinutes }
  }

  // coverage (readiness formula parity: high-yield-weighted engagement)
  const totalYield = ctx.concepts.reduce((a, c) => a + c.examRelevance, 0) || 1
  const coveredYield = ctx.concepts.filter((c) => c.status !== 'not-started').reduce((a, c) => a + c.examRelevance, 0)

  const streakDates: Date[] = ctx.studySessions30.map((s) => s.date)
  for (const key of ctx.doneDayKeys) streakDates.push(new Date(`${key}T12:00:00+05:30`))

  const todayLog = logByKey.get(ctx.todayKey)
  const todayTasks = ctx.todayTasks

  return {
    todayPlannedMinutes: todayLog?.plannedMinutes ?? todayTasks.reduce((a, t) => a + t.minutes, 0),
    todayDoneMinutes: todayLog?.doneMinutes ?? 0,
    todayPlannedCount: todayLog?.plannedCount ?? todayTasks.length,
    todayDoneCount: todayLog?.doneCount ?? todayTasks.filter((t) => t.status === 'done').length,
    streakDays: computeStreak(streakDates),
    consistency14: Math.round((consistencyCount / 14) * 100),
    adherence7: planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0,
    syllabusCoverage: Math.round((coveredYield / totalYield) * 100),
    revisionDebt: ctx.revision.revisionConceptIds.size,
    dueCards: ctx.revision.dueCards.length,
    openMistakes: ctx.revision.mistakes.filter((m) => m.status !== 'resolved').length,
    questionsLast7: ctx.questionsLast7,
    mocksLast30: ctx.examRuns30,
    last14,
  }
}

// ─── TASK COMPLETION ─────────────────────────────────────────────────────────

export async function completeTask(taskId: string, status: 'done' | 'skipped'): Promise<{ ok: boolean; error?: string }> {
  const task = await db.plannerTask.findUnique({ where: { id: taskId } })
  if (!task) return { ok: false, error: 'Task not found' }
  if (task.status === 'done') return { ok: true }
  await db.plannerTask.update({
    where: { id: taskId },
    data: { status, doneAt: status === 'done' ? new Date() : null },
  })

  if (status === 'done') {
    // log a study session for planner-owned kinds (MCQ/revision/mocks log their
    // own sessions from their surfaces — never double-count).
    const plannerLoggedKinds = new Set(['topic-learn', 'concept-repair', 'case', 'catch-up'])
    if (plannerLoggedKinds.has(task.kind)) {
      await db.studySession.create({
        data: { profileId: task.profileId, minutes: task.minutes, kind: 'study', label: `Planner: ${task.title}`.slice(0, 80) },
      })
    }
  }

  // recompute day totals from tasks
  const dayTasks = await db.plannerTask.findMany({ where: { profileId: task.profileId, dayKey: task.dayKey } })
  const doneRows = dayTasks.filter((t) => t.status === 'done')
  const pendingRows = dayTasks.filter((t) => t.status === 'pending')
  const doneMinutes = doneRows.reduce((a, t) => a + t.minutes, 0)
  const plannedMinutes = doneMinutes + pendingRows.reduce((a, t) => a + t.minutes, 0)
  const dayStatus = pendingRows.length === 0 && dayTasks.length > 0 ? 'done' : doneRows.length > 0 ? 'partial' : 'open'
  await db.plannerDayLog.upsert({
    where: { profileId_dayKey: { profileId: task.profileId, dayKey: task.dayKey } },
    create: {
      profileId: task.profileId, dayKey: task.dayKey, mode: 'auto',
      plannedMinutes, doneMinutes, plannedCount: dayTasks.length, doneCount: doneRows.length, status: dayStatus,
    },
    update: { doneMinutes, plannedMinutes, plannedCount: dayTasks.length, doneCount: doneRows.length, status: dayStatus },
  })
  return { ok: true }
}

// ─── AI CONTEXT DIGEST (grounded, measured — no CoT) ─────────────────────────

export function aiDigest(ctx: PlannerContext, plan: PlannerPlanShape | null, feasibility: PlannerFeasibility | null, today: PlannerToday | null, progress: PlannerProgress | null): string {
  const urgency = subjectUrgency(ctx)
  const lines: string[] = []
  lines.push(`EXAM: ${ctx.examLabel}, ${ctx.daysLeft} days left (${ctx.examIsEstimate ? 'estimated date' : 'user-set date'})`)
  if (ctx.targetNote) lines.push(`TARGET (pacing anchor only): ${ctx.targetNote}`)
  if (feasibility) lines.push(`FEASIBILITY: ${feasibility.verdict} — ${feasibility.headline}; ${feasibility.basis.remainingConcepts}/${feasibility.basis.totalConcepts} concepts still open; capacity ${Math.round(feasibility.basis.capacityPerDay / 60)}h/day × ${feasibility.basis.daysRemaining}d`)
  if (progress) lines.push(`PROGRESS: coverage ${progress.syllabusCoverage}%, consistency(14d) ${progress.consistency14}%, adherence(7d) ${progress.adherence7}%, streak ${progress.streakDays}d, questions(7d) ${progress.questionsLast7}, timed runs(30d) ${progress.mocksLast30}`)
  lines.push(`SUBJECT URGENCY (top 5): ${urgency.slice(0, 5).map((s) => `${s.name} [coverage ${s.coverage}%, mastery ${s.mastery}%, weight ~${s.neetWeight}%]`).join('; ')}`)
  lines.push(`REVISION: ${ctx.revision.revisionConceptIds.size} on revision list, ${ctx.revision.dueCards.length} cards due, ${ctx.revision.mistakes.filter((m) => m.status !== 'resolved').length} open mistakes`)
  if (today) {
    lines.push(`TODAY: mode ${today.modeLabel}, capacity ${today.capacityMinutes}min, headline: ${today.headline}`)
    for (const s of today.slots) {
      const pend = s.tasks.filter((t) => t.status === 'pending')
      if (pend.length) lines.push(`  ${PLANNER_SLOT_LABELS[s.slot]}: ${pend.map((t) => `${t.title} (${t.minutes}min — ${t.reason})`).join(' | ')}`)
    }
    if (today.carriedOverCount > 0) lines.push(`  carried over from missed days: ${today.carriedOverCount}`)
  }
  return lines.join('\n')
}

const PLANNER_AI_DISCLAIMER = 'AI planning advice based on your measured platform data — pacing arithmetic, never a rank or outcome prediction.'
