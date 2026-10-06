// ═══════════════════ MEDICAL EDUCATION OS (PRODUCT 20) ═══════════════════
// «Discover → Learn → Practice → Analyze → Revise → Improve»
//
// The single arbiter that answers "What should I do next?". Seven existing
// engines each already emit their own top action from the same ledgers —
// this module COMPOSES them into one ranked feed instead of adding an
// eighth competing engine. It reuses:
//   · brain-engine   loadBrainContext + deriveConceptStates (7-state
//                    knowledge derivation, Ebbinghaus estRecall)
//   · performance    buildPerformancePayload (P13 readiness + exam-weighted
//                    weakness ranking — reused verbatim, not recomputed)
//   · engine.ts      examClock, computeStreak, istDayKey, greetingFor
//   · brain-engine   MISTAKE_TACTICS (one tactic map platform-wide)
// and computes the two things genuinely missing platform-wide:
//   · a merged cross-feature activity feed (all learning ledgers)
//   · the published OS priority rule that turns signals into ONE next action
//
// HONESTY: every line is measured from the student's own rows. No peers, no
// seeds, no invented urgency. Insufficient data is stated, never papered
// over. No chain-of-thought anywhere — reasons are evidence one-liners.

import { db } from '@/lib/db'
import { loadBrainContext, deriveConceptStates, MISTAKE_TACTICS } from '@/lib/brain-engine'
import { buildPerformancePayload } from '@/lib/performance'
import { computeStreak, examClock, greetingFor, istDayKey, DAY } from '@/lib/engine'
import { ERROR_TYPE_LABELS, PREP_STAGE_LABELS } from '@/lib/types'
import type {
  OsAction,
  OsActivityItem,
  OsCommandCenter,
  OsConnection,
  OsMcqTarget,
  OsRevisionToday,
  OsStopSignal,
  OsTests,
  OsWeakItem,
} from '@/lib/types'

// ─── published priority rule (shown in the UI — transparency) ───────────────

const OS_RULE: string[] = [
  'Overdue revision first — those due dates were already promised to you.',
  'Repeated mistakes (wrong 2+ times, still open) before new practice.',
  'Exam within 3 weeks — a full-length mock beats new content.',
  "Today's due revision blocks before adding new ground.",
  'Fading memory (recall under 60%) — targeted practice on learned material.',
  'Concepts below the revision bar go back into revision.',
  'Continue the lesson you left mid-way.',
  'Exam-weighted weakest areas — practice where marks are actually lost.',
  'Nothing due? Explore new ground — graph, topics, cases.',
]

const OS_LEDGERS = [
  'QuestionAttempt', 'KnowledgeState', 'MistakeRecord', 'ErrorPattern',
  'RevisionItem', 'RevisionSession', 'StudySession', 'ExamAttempt',
  'LearnProgress', 'FlashcardReview', 'PlannerPlan', 'XpEvent',
  'SimCaseAttempt', 'LabAttempt', 'VoiceSession', 'TutorSession', 'AskThread', 'CommunityPost',
]

const OS_HONEST_NOTE =
  'Every line here is measured from your own learning activity — nothing is estimated about your peers and nothing is invented to make you open the app. When there is no data, the section says so instead of guessing.'

// ─── time helpers (IST day windows — platform convention) ───────────────────

function istDayStart(d: Date): Date {
  return new Date(`${istDayKey(d)}T00:00:00+05:30`)
}
function daysAgoStart(d: Date, days: number): Date {
  return new Date(istDayStart(d).getTime() - days * DAY)
}
function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function dateLineIst(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('weekday')}, ${get('day')} ${get('month')}`
}

function relTime(at: Date, now: Date): string {
  const diff = Math.max(0, now.getTime() - at.getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

// ─── the arbiter ─────────────────────────────────────────────────────────────

export async function buildOsCommandCenter(profileId: string): Promise<OsCommandCenter> {
  // IST windows are computed ONCE, before any query (no temporal coupling
  // with the context load below).
  const now = new Date()
  const dayStart = istDayStart(now)
  const dayEnd = new Date(dayStart.getTime() + DAY)
  const weekStart = daysAgoStart(now, 7)
  const days30Start = daysAgoStart(now, 30)
  const todayKey = istDayKey(now)

  // One composed pass: the brain context (one query set for every learning
  // ledger) + the P13 performance payload (readiness + weakness ranking).
  const [ctx, perf, learnRows, planRow, mistakeExtras] = await Promise.all([
    loadBrainContext(profileId),
    buildPerformancePayload().catch(() => null),
    db.learnProgress.findMany({ where: { profileId }, select: { kind: true, entityId: true, status: true, updatedAt: true } }),
    db.plannerPlan.findFirst({
      where: { profileId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      select: { examDate: true, examLabel: true },
    }),
    Promise.all([
      db.mistakeRecord.count({ where: { profileId, resolvedAt: { gte: weekStart } } }),
      db.studySession.aggregate({ where: { profileId, date: { gte: dayStart } }, _sum: { minutes: true } }),
      db.xpEvent.aggregate({ where: { profileId, dayKey: todayKey }, _sum: { xp: true } }),
      db.simCaseAttempt.findMany({
        where: { profileId }, orderBy: { startedAt: 'desc' }, take: 2,
        select: { id: true, status: true, score: true, startedAt: true, case: { select: { title: true } } },
      }),
      db.labAttempt.findMany({
        where: { profileId }, orderBy: { startedAt: 'desc' }, take: 2,
        select: { id: true, status: true, score: true, startedAt: true, image: { select: { title: true } } },
      }),
      db.voiceSession.findMany({
        where: { profileId }, orderBy: { startedAt: 'desc' }, take: 1,
        select: { id: true, mode: true, questions: true, startedAt: true },
      }),
      db.tutorSession.findMany({
        where: { profileId }, orderBy: { updatedAt: 'desc' }, take: 1,
        select: { id: true, title: true, updatedAt: true },
      }),
      db.askThread.findMany({
        where: { profileId }, orderBy: { updatedAt: 'desc' }, take: 1,
        select: { id: true, title: true, updatedAt: true },
      }),
      db.communityPost.findMany({
        where: { profileId }, orderBy: { createdAt: 'desc' }, take: 1,
        select: { id: true, title: true, createdAt: true },
      }),
      // FlashcardReview rows are upserted SRS state (one per card) — a row
      // with reviewedAt inside today's IST window means the card was reviewed.
      db.flashcardReview.findMany({
        where: { profileId, reviewedAt: { gte: dayStart } },
        select: { reviewedAt: true },
      }),
      db.tutorSession.count({ where: { profileId } }),
      db.askThread.count({ where: { profileId } }),
      db.communityPost.count({ where: { profileId } }),
    ]),
  ])

  const states = deriveConceptStates(ctx)
  const [
    resolvedThisWeek, minutesTodayAgg, xpTodayAgg,
    recentSims, recentLabs, recentVoice, recentTutor, recentAsk, recentCommunity, recentFlash,
    tutorCount, askCount, communityCount,
  ] = mistakeExtras

  const days30 = new Set<string>()

  // Name lookup from the derived states (studied concepts) — the derived
  // graph states are the single source of truth for names, never hardcoded.
  const stateByName = new Map(states.map((s) => [s.conceptId, s]))
  const conceptLabel = (conceptId: string | null | undefined): string =>
    (conceptId ? stateByName.get(conceptId)?.name : undefined) ?? 'a concept'

  // ── 1. Revision today (measured from due RevisionItem rows) ──────────────
  const dueItems = ctx.revisionItems.filter((r) => !r.cleared && r.dueAt.getTime() <= dayEnd.getTime())
  const overdueItems = dueItems.filter((r) => r.dueAt.getTime() < dayStart.getTime())
  const dueDbRows = dueItems.length
    ? await db.revisionItem.findMany({
        where: { profileId, cleared: false, dueAt: { lte: dayEnd } },
        select: { minutes: true },
      })
    : []
  const revisionMinutes = dueDbRows.reduce((sum, r) => sum + r.minutes, 0)
  const sessionsThisWeek = ctx.revisionSessions.filter((s) => {
    const at = s.completedAt ?? s.createdAt
    return at.getTime() >= weekStart.getTime()
  }).length
  const revisionToday: OsRevisionToday = {
    dueCount: dueItems.length,
    overdueCount: overdueItems.length,
    minutes: revisionMinutes,
    topItems: [...dueItems]
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || b.priority - a.priority)
      .slice(0, 5)
      .map((r) => {
        const st = stateByName.get(r.conceptId)
        return {
          conceptId: r.conceptId,
          conceptName: conceptLabel(r.conceptId),
          topicName: st?.topicName ?? null,
          reason: r.reason,
          dueAt: r.dueAt.toISOString(),
          overdue: r.dueAt.getTime() < dayStart.getTime(),
        }
      }),
    sessionsThisWeek,
  }

  // ── 2. Knowledge signals from the P18 derivation (reused, not recomputed) ─
  // Fading = LEARNED material decaying (familiar/strong/mastered). Learning
  // concepts with low recall are already captured as needs-revision/at-risk.
  const fading = states.filter(
    (s) => s.estRecall !== null && s.estRecall < 0.6 && ['familiar', 'strong', 'mastered'].includes(s.status),
  )
  const belowBar = states.filter((s) => s.status === 'needs-revision')
  const atRisk = states.filter((s) => s.status === 'at-risk')

  // ── 3. Mistakes (bank rows + one aggregated pattern pass, like strategy) ──
  const openMistakes = ctx.mistakeRows.filter((m) => m.status === 'unresolved' || m.status === 'revising')
  const repeatedMistakes = openMistakes.filter((m) => m.wrongCount >= 2)
  // ErrorPattern rows are per-(errorType, concept) — aggregate by errorType so
  // each pattern family appears once (same dedupe the brain strategy uses).
  const patternTotals = new Map<string, number>()
  for (const e of ctx.errorPatterns) {
    patternTotals.set(e.errorType, (patternTotals.get(e.errorType) ?? 0) + e.count)
  }
  const patterns = [...patternTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([errorType, count]) => ({
      errorType,
      label: ERROR_TYPE_LABELS[errorType] ?? errorType,
      count,
      tactic: MISTAKE_TACTICS[errorType] ?? 'Review the question, write why the right answer wins, then retest',
    }))
  const oldestOpen = openMistakes.reduce<Date | null>(
    (acc, m) => (acc === null || m.lastWrongAt.getTime() < acc.getTime() ? m.lastWrongAt : acc),
    null,
  )

  // ── 4. Tests & exam clock (estimate honestly labelled) ───────────────────
  const targetExamDate = planRow?.examDate ?? (ctx.profile.examDate ? new Date(ctx.profile.examDate) : null)
  const clock = examClock(ctx.profile.year, ctx.profile.gradYear, ctx.profile.dailyHours, targetExamDate)
  const examLabel = planRow?.examLabel || ctx.profile.examLabel || null
  const mocksLast30 = ctx.examAttempts.filter((e) => (e.submittedAt?.getTime() ?? 0) >= days30Start.getTime()).length
  const lastMock = ctx.examAttempts[0] ?? null
  const topWeakForMock = perf?.weaknesses.find((w) => w.kind === 'subject' || w.kind === 'topic') ?? null
  const tests: OsTests = {
    examLabel,
    daysLeft: clock.daysLeft,
    isEstimate: clock.isEstimate,
    stage: clock.stage,
    lastMock: lastMock
      ? { mode: lastMock.label || lastMock.mode, percent: lastMock.percent, submittedAt: iso(lastMock.submittedAt) ?? '' }
      : null,
    mocksLast30,
    suggested: topWeakForMock
      ? { title: `Subject mock — ${topWeakForMock.label}`, reason: topWeakForMock.reason }
      : ctx.examAttempts.length
        ? { title: 'Full-length mock', reason: `Last mock ${lastMock?.percent ?? '—'}% — keep the cadence at about one per week` }
        : null,
    note: 'The platform has no test calendar — dates come from your exam target and are shown as estimates, never promises.',
  }

  // ── 5. Weak areas (P13 importance ranking REUSED verbatim) ───────────────
  const weakTopics: OsWeakItem[] = (perf?.weaknesses ?? []).slice(0, 7).map((w) => {
    const a = w.action
    const view: OsWeakItem['view'] =
      a.kind === 'adaptive' ? 'adaptive'
      : a.kind === 'quiz' ? 'questions'
      : a.kind === 'learn' ? 'learn'
      : a.kind === 'hub' || a.kind === 'concept' ? 'hub'
      : a.kind === 'exam' ? 'exam'
      : a.kind === 'mistakes' ? 'mistakes'
      : a.kind === 'revision' ? 'revision'
      : 'performance'
    return {
      id: w.id,
      label: w.label,
      parent: w.parent,
      signals: w.signals,
      importance: w.importance,
      accuracy: w.accuracy,
      attempts: w.attempts,
      reason: w.reason,
      view,
      conceptId: a.conceptId ?? a.adaptive?.conceptId ?? a.quiz?.conceptId ?? a.hub?.conceptId ?? undefined,
      // learn handoffs can point at a SUBJECT id — only pass true topic ids
      topicId: a.adaptive?.topicId ?? a.quiz?.topicId ?? a.hub?.topicId
        ?? (a.learn?.kind === 'topic' ? a.learn.id : undefined),
    }
  })

  // ── 6. MCQ recommendations (weakness targets + measured pool size) ───────
  const mcqTargets: OsMcqTarget[] = weakTopics.slice(0, 4).map((w) => ({
    id: w.id,
    label: w.label,
    parent: w.parent,
    accuracy: w.accuracy,
    attempts: w.attempts,
    importance: w.importance,
    reason: w.reason,
    // practice targets always land on a practice engine, never a reader
    view: w.view === 'hub' || w.view === 'learn' ? 'adaptive' : w.view,
    conceptId: w.conceptId,
    topicId: w.topicId,
  }))

  // ── 7. In-progress learning (Learn study surfaces) ───────────────────────
  const learningRows = learnRows.filter((r) => r.status === 'learning')
  const learningTopic = learningRows.find((r) => r.kind === 'topic')
  const learningConcept = learningRows.find((r) => r.kind === 'concept')
  let learningLabel: string | null = null
  let learningTopicId: string | undefined
  let learningConceptId: string | undefined
  if (learningTopic) {
    const t = await db.topic.findUnique({ where: { id: learningTopic.entityId }, select: { name: true } })
    learningLabel = t?.name ?? 'your current topic'
    learningTopicId = learningTopic.entityId
  } else if (learningConcept) {
    const c = await db.concept.findUnique({
      where: { id: learningConcept.entityId },
      select: { name: true, topicId: true },
    })
    learningLabel = c?.name ?? 'your current concept'
    learningConceptId = learningConcept.entityId
    learningTopicId = c?.topicId ?? undefined
  }

  // ── 8. The ranked "now" feed (published rule → concrete actions) ─────────
  const candidates: OsAction[] = []
  if (overdueItems.length > 0) {
    candidates.push({
      id: 'revision-overdue', kind: 'revise', source: 'revision', priority: 100, ruleIndex: 1,
      title: 'Clear overdue revision',
      reason: `${overdueItems.length} block${overdueItems.length === 1 ? '' : 's'} past due · ${revisionMinutes} min scheduled`,
      cta: 'Start revision', view: 'revision',
    })
  }
  if (repeatedMistakes.length >= 3) {
    candidates.push({
      id: 'mistakes-repeated', kind: 'fix', source: 'mistakes', priority: 92, ruleIndex: 2,
      title: 'Fix repeated mistakes',
      reason: `${repeatedMistakes.length} questions wrong 2+ times are still open`,
      cta: 'Open mistake clinic', view: 'mistakes',
    })
  }
  if (clock.daysLeft !== null && clock.daysLeft <= 21) {
    candidates.push({
      id: 'exam-soon', kind: 'test', source: 'exam', priority: 90, ruleIndex: 3,
      title: 'Run a mock before the exam',
      reason: `${examLabel ?? 'Target exam'} in ${clock.daysLeft} day${clock.daysLeft === 1 ? '' : 's'} (estimate) · ${mocksLast30} mocks in the last 30 days`,
      cta: 'Open Exam Lab', view: 'exam',
    })
  }
  if (dueItems.length > 0 && overdueItems.length === 0) {
    candidates.push({
      id: 'revision-today', kind: 'revise', source: 'revision', priority: 84, ruleIndex: 4,
      title: "Today's revision",
      reason: `${dueItems.length} block${dueItems.length === 1 ? '' : 's'} due · ${revisionMinutes} min`,
      cta: 'Start revision', view: 'revision',
    })
  }
  if (fading.length > 0) {
    const top = [...fading].sort((a, b) => (a.estRecall ?? 1) - (b.estRecall ?? 1))[0]
    candidates.push({
      id: 'knowledge-fading', kind: 'practice', source: 'knowledge', priority: 78, ruleIndex: 5,
      title: 'Practice what is fading',
      reason: `${fading.length} learned concept${fading.length === 1 ? '' : 's'} below 60% recall — ${top.name} first`,
      cta: 'Targeted practice', view: 'adaptive', conceptId: top.conceptId, topicId: top.topicId,
    })
  }
  if (repeatedMistakes.length > 0 && openMistakes.length > repeatedMistakes.length) {
    candidates.push({
      id: 'mistakes-open', kind: 'fix', source: 'mistakes', priority: 72, ruleIndex: 2,
      title: 'Work through open mistakes',
      reason: `${openMistakes.length} open · oldest wrong since ${oldestOpen ? relTime(oldestOpen, now) : '—'}`,
      cta: 'Open mistake clinic', view: 'mistakes',
    })
  }
  if (belowBar.length > 0 || atRisk.length > 0) {
    const n = belowBar.length + atRisk.length
    const top = [...belowBar, ...atRisk].sort((a, b) => (a.estRecall ?? 1) - (b.estRecall ?? 1))[0]
    candidates.push({
      id: 'knowledge-below-bar', kind: 'revise', source: 'knowledge', priority: 68, ruleIndex: 6,
      title: 'Rebuild slipping concepts',
      reason: `${n} concept${n === 1 ? '' : 's'} below the revision bar — ${top.name} lowest`,
      cta: 'Revise these first', view: 'revision',
    })
  }
  if (learningLabel) {
    candidates.push({
      id: 'learn-continue', kind: 'learn', source: 'learn', priority: 64, ruleIndex: 7,
      title: `Continue ${learningLabel}`,
      reason: 'You left this lesson mid-way — finishing it unlocks the practice pool',
      cta: 'Continue learning', view: learningTopic ? 'learn' : 'hub',
      topicId: learningTopicId, conceptId: learningConceptId,
    })
  }
  const topWeakness = weakTopics[0]
  if (topWeakness) {
    candidates.push({
      id: 'weakness-practice', kind: 'practice', source: 'performance', priority: 60, ruleIndex: 8,
      title: `Practice ${topWeakness.label}`,
      reason: topWeakness.reason,
      cta: 'Start practice', view: topWeakness.view, conceptId: topWeakness.conceptId, topicId: topWeakness.topicId,
    })
  }
  if (ctx.attemptsTotal > 0 || ctx.revisionItems.length > 0) {
    candidates.push({
      id: 'explore', kind: 'explore', source: 'planner', priority: 40, ruleIndex: 9,
      title: 'Explore new ground',
      reason: 'Nothing overdue — use the time on high-weight topics in the Knowledge Graph',
      cta: 'Open the graph', view: 'graph',
    })
  } else {
    candidates.push({
      id: 'first-lesson', kind: 'learn', source: 'learn', priority: 40, ruleIndex: 9,
      title: 'Start your first lesson',
      reason: 'No learning data yet — this command center fills with measured recommendations as you study',
      cta: 'Pick a topic', view: 'learn',
    })
  }

  candidates.sort((a, b) => b.priority - a.priority)
  const primary = candidates[0]
  const alternates: OsAction[] = []
  for (const c of candidates.slice(1)) {
    if (alternates.length >= 2) break
    if (c.kind === primary.kind) continue
    if (alternates.some((a) => a.kind === c.kind)) continue
    alternates.push(c)
  }

  // ── 8b. Stop signals — what to STOP spending time on (personalization #4) ─
  // Two measured families, never a vibe:
  //   · over-drilled — concepts already mastered/strong that keep receiving
  //     attempts this week (time there buys almost nothing now)
  //   · saturated — topics holding ≥85% accuracy over ≥15 attempts, where
  //     extra questions have visibly stopped moving the marks
  // Each signal carries a redirect toward today's top weakness, so the time
  // has somewhere measured to go instead.
  const strongIds = new Set(
    states.filter((s) => s.status === 'mastered' || s.status === 'strong').map((s) => s.conceptId),
  )
  const drilledThisWeek = new Map<string, number>()
  for (const a of ctx.attempts) {
    if (a.createdAt.getTime() >= weekStart.getTime() && a.conceptId && strongIds.has(a.conceptId)) {
      drilledThisWeek.set(a.conceptId, (drilledThisWeek.get(a.conceptId) ?? 0) + 1)
    }
  }
  const stopSignals: OsStopSignal[] = []
  for (const [conceptId, n] of [...drilledThisWeek.entries()].sort((x, y) => y[1] - x[1])) {
    if (n < 4) continue // fewer than 4 repeats is incidental re-touch, not a habit
    const st = stateByName.get(conceptId)
    if (!st) continue
    stopSignals.push({
      id: `overdrilled-${conceptId}`,
      kind: 'over-drilled',
      label: st.name,
      parent: st.topicName,
      evidence: `${st.status === 'mastered' ? 'Mastered' : 'Strong'} · ${st.accuracy !== null ? `${st.accuracy}% accuracy` : 'recall holding'} — ${n} more attempts this week on ground you already hold`,
    })
  }
  const topicAgg = new Map<string, { name: string; attempts: number; correct: number }>()
  for (const s of states) {
    if (s.attempts < 15 || s.accuracy === null) continue
    const cur = topicAgg.get(s.topicId) ?? { name: s.topicName, attempts: 0, correct: 0 }
    cur.attempts += s.attempts
    cur.correct += Math.round((s.accuracy / 100) * s.attempts)
    topicAgg.set(s.topicId, cur)
  }
  for (const [topicId, t] of topicAgg) {
    const acc = Math.round((t.correct / t.attempts) * 100)
    if (acc < 85) continue
    stopSignals.push({
      id: `saturated-${topicId}`,
      kind: 'saturated',
      label: t.name,
      evidence: `${acc}% accuracy over ${t.attempts} attempts — extra questions here barely move your marks now`,
    })
  }
  stopSignals.sort((a, b) => (a.kind === 'over-drilled' ? 0 : 1) - (b.kind === 'over-drilled' ? 0 : 1))
  const stopCapped = stopSignals.slice(0, 4)
  if (stopCapped.length > 0 && topWeakness) {
    for (const s of stopCapped) {
      s.redirectView = topWeakness.view
      s.redirectLabel = topWeakness.label
      s.redirectConceptId = topWeakness.conceptId
      s.redirectTopicId = topWeakness.topicId
    }
  }

  // ── 9. Merged cross-feature activity feed (genuinely new — no engine has it)
  const feed: OsActivityItem[] = []
  for (const a of ctx.attempts.slice(0, 5)) {
    feed.push({
      id: `attempt-${a.id}`, kind: 'practice',
      label: conceptLabel(a.conceptId),
      detail: a.correct ? 'Answered correctly' : a.errorType ? `Wrong — ${ERROR_TYPE_LABELS[a.errorType] ?? a.errorType}` : 'Wrong',
      metric: a.correct ? '+correct' : undefined,
      at: a.createdAt.toISOString(),
    })
  }
  const recentRevision = await db.revisionSession.findMany({
    where: { profileId, status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 3,
    select: { id: true, mode: true, done: true, total: true, completedAt: true, createdAt: true },
  })
  for (const s of recentRevision) {
    feed.push({
      id: `revision-${s.id}`, kind: 'revision', label: 'Revision session',
      detail: `${s.mode} mode`, metric: `${s.done}/${s.total} blocks`,
      at: (s.completedAt ?? s.createdAt).toISOString(),
    })
  }
  const recentStudy = await db.studySession.findMany({
    where: { profileId }, orderBy: { date: 'desc' }, take: 3,
    select: { id: true, kind: true, label: true, minutes: true, date: true },
  })
  for (const s of recentStudy) {
    feed.push({
      id: `study-${s.id}`, kind: 'study', label: s.label || 'Study session',
      detail: s.kind, metric: `${s.minutes} min`, at: s.date.toISOString(),
    })
  }
  for (const e of ctx.examAttempts.slice(0, 2)) {
    feed.push({
      id: `mock-${e.id}`, kind: 'mock', label: e.label || e.mode,
      detail: 'Mock test', metric: e.percent !== null ? `${e.percent}%` : undefined,
      at: (e.submittedAt ?? now).toISOString(),
    })
  }
  for (const s of recentSims) {
    feed.push({
      id: `case-${s.id}`, kind: 'case', label: s.case.title,
      detail: s.status === 'completed' ? 'Case completed' : 'Case run',
      metric: s.status === 'completed' ? `${s.score}/100` : undefined,
      at: s.startedAt.toISOString(),
    })
  }
  for (const l of recentLabs) {
    feed.push({
      id: `lab-${l.id}`, kind: 'image', label: l.image.title,
      detail: 'Image lab', metric: l.status === 'completed' ? `${l.score}/100` : undefined,
      at: l.startedAt.toISOString(),
    })
  }
  if (recentVoice[0]) {
    feed.push({
      id: `voice-${recentVoice[0].id}`, kind: 'voice', label: 'Voice tutor',
      detail: `${recentVoice[0].mode} mode`, metric: `${recentVoice[0].questions} spoken answers`,
      at: recentVoice[0].startedAt.toISOString(),
    })
  }
  if (recentFlash.length > 0) {
    feed.push({
      id: `flash-${todayKey}`, kind: 'flashcards', label: 'Flashcards',
      detail: 'Reviewed today', metric: `${recentFlash.length} cards`,
      at: (recentFlash[0].reviewedAt ?? now).toISOString(),
    })
  }
  if (recentTutor[0]) {
    feed.push({
      id: `tutor-${recentTutor[0].id}`, kind: 'tutor', label: recentTutor[0].title || 'AI tutor session',
      at: recentTutor[0].updatedAt.toISOString(),
    })
  }
  if (recentAsk[0]) {
    feed.push({
      id: `ask-${recentAsk[0].id}`, kind: 'ask', label: recentAsk[0].title || 'Ask Engine question',
      at: recentAsk[0].updatedAt.toISOString(),
    })
  }
  if (recentCommunity[0]) {
    feed.push({
      id: `community-${recentCommunity[0].id}`, kind: 'community', label: recentCommunity[0].title,
      detail: 'Community post', at: recentCommunity[0].createdAt.toISOString(),
    })
  }
  feed.sort((a, b) => b.at.localeCompare(a.at))
  const activity = feed.slice(0, 12)

  // ── 10. Connections — what each feature knows today (measured one-liners) ─
  const studiedCount = states.filter((s) => s.status !== 'not-started').length
  const topRiskState = [...atRisk, ...belowBar].sort((a, b) => (a.estRecall ?? 1) - (b.estRecall ?? 1))[0]
  const accuracy30 = ctx.attempts30 > 0 ? Math.round((ctx.attemptsCorrect30 / ctx.attempts30) * 100) : null
  const bestMock = ctx.examAttempts.reduce<number | null>(
    (acc, e) => (e.percent !== null && (acc === null || e.percent > acc) ? e.percent : acc),
    null,
  )
  const plannerTasksToday = await db.plannerTask.findMany({
    where: { profileId, dayKey: todayKey }, select: { status: true },
  })
  const plannerDone = plannerTasksToday.filter((t) => t.status === 'done').length

  const connections: OsConnection[] = [
    { view: 'learn', label: 'Learn', status: learningRows.length > 0 ? 'active' : 'quiet',
      contribution: learningRows.length > 0
        ? `${learningRows.length} lesson${learningRows.length === 1 ? '' : 's'} in progress · ${learnRows.filter((r) => r.status === 'completed' || r.status === 'mastered').length} completed`
        : 'No lessons started yet' },
    { view: 'tutor', label: 'AI Tutor', status: tutorCount > 0 ? 'active' : 'quiet',
      contribution: tutorCount > 0 ? `${tutorCount} saved session${tutorCount === 1 ? '' : 's'}` : 'Not used yet — ask it anything' },
    { view: 'ask', label: 'Ask Engine', status: askCount > 0 ? 'active' : 'quiet',
      contribution: askCount > 0 ? `${askCount} question${askCount === 1 ? '' : 's'} answered` : 'Not used yet — search a doubt' },
    { view: 'questions', label: 'MCQs', status: ctx.attemptsTotal > 0 ? 'active' : 'quiet',
      contribution: ctx.attemptsTotal > 0
        ? `${ctx.attemptsTotal} attempts · ${accuracy30 !== null ? `${accuracy30}% 30-day accuracy` : 'accuracy pending'}`
        : 'No questions answered yet' },
    { view: 'mistakes', label: 'Mistakes', status: ctx.mistakeRows.length > 0 ? 'active' : 'quiet',
      contribution: ctx.mistakeRows.length > 0
        ? `${openMistakes.length} open · ${resolvedThisWeek} resolved this week`
        : 'No mistakes recorded — clean slate' },
    { view: 'revision', label: 'Revision', status: ctx.revisionItems.length > 0 || sessionsThisWeek > 0 ? 'active' : 'quiet',
      contribution: dueItems.length > 0
        ? `${dueItems.length} due today${overdueItems.length ? ` (${overdueItems.length} overdue)` : ''} · ${sessionsThisWeek} sessions this week`
        : sessionsThisWeek > 0 ? `${sessionsThisWeek} sessions this week · queue clear` : 'Queue builds from your activity' },
    { view: 'planner', label: 'Planner', status: planRow ? 'active' : 'quiet',
      contribution: planRow
        ? plannerTasksToday.length > 0
          ? `Today: ${plannerDone}/${plannerTasksToday.length} tasks done`
          : 'Plan active — no tasks for today'
        : 'No plan yet — generate one in minutes' },
    { view: 'graph', label: 'Knowledge Graph', status: studiedCount > 0 ? 'active' : 'quiet',
      contribution: `${ctx.conceptMeta.size} concepts mapped · ${ctx.pairs.length} confusion pairs tracked` },
    { view: 'cases', label: 'Cases', status: ctx.simAttempts.length > 0 ? 'active' : 'quiet',
      contribution: ctx.simAttempts.length > 0 ? `${ctx.simAttempts.length} case run${ctx.simAttempts.length === 1 ? '' : 's'}` : `${ctx.simCaseCount} cases waiting` },
    { view: 'lab', label: 'Images', status: ctx.labRuns.length > 0 ? 'active' : 'quiet',
      contribution: ctx.labRuns.length > 0 ? `${ctx.labRuns.length} image lab${ctx.labRuns.length === 1 ? '' : 's'}` : `${ctx.labImages.length} images available` },
    { view: 'exam', label: 'Mock Tests', status: ctx.examAttempts.length > 0 ? 'active' : 'quiet',
      contribution: ctx.examAttempts.length > 0
        ? `${ctx.examAttempts.length} test${ctx.examAttempts.length === 1 ? '' : 's'} · best ${bestMock ?? '—'}%`
        : 'No mocks yet — start with a subject test' },
    { view: 'performance', label: 'Analytics', status: perf ? 'active' : 'quiet',
      contribution: perf && perf.readiness.overall !== null
        ? `Readiness ${perf.readiness.overall}/100 · ${perf.readiness.band}`
        : 'Readiness needs more attempts' },
    { view: 'community', label: 'Community', status: communityCount > 0 ? 'active' : 'quiet',
      contribution: communityCount > 0 ? `${communityCount} post${communityCount === 1 ? '' : 's'} from you` : 'Lurking is fine — spaces are open' },
    { view: 'brain', label: 'Medical Brain', status: studiedCount > 0 ? 'active' : 'quiet',
      contribution: studiedCount > 0
        ? `${studiedCount} concepts tracked${topRiskState ? ` · top risk: ${topRiskState.name}` : ''}`
        : 'Tracks every concept you touch' },
  ]

  // ── 11. Stats (measured) ─────────────────────────────────────────────────
  for (const a of ctx.attempts) {
    if (a.createdAt.getTime() >= days30Start.getTime()) days30.add(istDayKey(a.createdAt))
  }
  for (const d of ctx.studyDates) if (d.getTime() >= days30Start.getTime()) days30.add(istDayKey(d))
  for (const s of ctx.revisionSessions) {
    const at = s.completedAt ?? s.createdAt
    if (at.getTime() >= days30Start.getTime()) days30.add(istDayKey(at))
  }
  for (const e of ctx.examAttempts) if (e.submittedAt && e.submittedAt.getTime() >= days30Start.getTime()) days30.add(istDayKey(e.submittedAt))
  for (const f of ctx.flashReviews) if (f.at.getTime() >= days30Start.getTime()) days30.add(istDayKey(f.at))
  const streakDates = [...days30].map((k) => new Date(`${k}T00:00:00+05:30`))
  const stats = {
    streakDays: computeStreak(streakDates),
    activeDays30: days30.size,
    minutesToday: minutesTodayAgg._sum.minutes ?? 0,
    questionsToday: ctx.attempts.filter((a) => a.createdAt.getTime() >= dayStart.getTime()).length,
    xpToday: xpTodayAgg._sum.xp ?? 0,
  }

  // ── 12. Greeting + readiness ─────────────────────────────────────────────
  const examLine = clock.daysLeft !== null
    ? `${examLabel ?? 'Target exam'} · ${clock.daysLeft} day${clock.daysLeft === 1 ? '' : 's'} left (${clock.isEstimate ? 'estimate' : 'your date'})`
    : null
  const stageLabel = PREP_STAGE_LABELS[ctx.profile.prepStage] ?? ctx.profile.prepStage

  const insufficientData = ctx.attemptsTotal === 0 && ctx.revisionItems.length === 0 && learnRows.length === 0

  return {
    generatedAt: now.toISOString(),
    greeting: { hello: greetingFor(now), dateLine: dateLineIst(now), examLine, stageLabel },
    now: { primary, alternates, rule: OS_RULE },
    today: {
      revision: revisionToday,
      mcqs: { suggestedCount: 10, bankSize: ctx.questions.length, targets: mcqTargets },
      mistakes: {
        open: openMistakes.length,
        repeated: repeatedMistakes.length,
        resolvedThisWeek,
        oldestOpenAt: iso(oldestOpen),
        patterns,
      },
      tests,
    },
    weakTopics,
    stopSignals: stopCapped,
    readiness: {
      overall: perf?.readiness.overall ?? null,
      band: perf?.readiness.band ?? '—',
      dimensions: (perf?.readiness.dimensions ?? [])
        .filter((d) => d.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .slice(0, 3)
        .map((d) => ({ label: d.label, value: d.value, note: d.note })),
      methodology: perf?.readiness.methodology ?? 'Readiness needs more measured activity before it can be computed honestly.',
      dataPoor: perf?.insufficientData ?? true,
    },
    activity,
    connections,
    stats,
    dataBasis: { ledgers: OS_LEDGERS, window: 'IST day windows', peers: 'none — everything here is measured from your own log' },
    honestNote: OS_HONEST_NOTE,
    insufficientData,
  }
}
