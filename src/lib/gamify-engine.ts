// ─── GAMIFIED MEDICAL LEARNING & MOTIVATION ENGINE (PRODUCT 17) ──────────────
// «Learn → Practice → Improve → Achieve → Continue»
//
// HONESTY RULES (frozen with the contract in types.ts — binding):
//   · Every XP point, streak day, achievement and challenge percent is
//     MEASURED from real study activity: QuestionAttempt, StudySession,
//     RevisionSession (completed), submitted ExamAttempt, SimCaseAttempt
//     (completed), FlashcardReview, KnowledgeState mastery, resolved
//     MistakeRecord. Opening the app earns NOTHING; raw screen time earns
//     NOTHING. There is no reward for showing up — only for studying.
//   · The XP table + level curve are PUBLISHED (types.ts XP_TABLE /
//     GAMIFY_TIERS; mirrored below and imported — no hidden numbers).
//   · Streaks are healthy: RECOVERY_RULE below is the published sentence,
//     shown verbatim. Copy is never guilt-based.
//   · Leaderboards reuse the P16 GroupMembership.shareData per-group consent.
//     Peer rows are deterministic DEMO snapshots (pure function of the peer
//     handle); your row is measured from your real week.
//   · Motivation cards are deterministic rules over measured signals — no AI,
//     no chain-of-thought, max 4, one hand-off each, never guilt-based.
//   · Every grant is idempotent via XpEvent @@unique([profileId, kind, refId]);
//     syncGamification is safe to call on every read.
//
// MASTERY BAR (same as P13 — published; UI must carry this note): a topic is
// MASTERED when  engaged concepts >= max(2, ceil(total * 0.5))  AND
// mean(engaged scores) >= 70.  "Engaged" = a KnowledgeState row exists for the
// concept. Mastery is a learning signal from the student's own attempts —
// not a measure of clinical competence.

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { DAY, istDayKey } from '@/lib/engine'
import {
  dayKeyStart, dayKeyOffset, todayKey, dayLabel, currentIstMondayKey,
  loadActivity, dayActivityOf, isDayActive,
  type ActivityLog, type DayActivity,
} from '@/lib/community-engine'
import { allSubjects } from '@/lib/curriculum/registry'
import { buildPerformancePayload } from '@/lib/performance'
import {
  XP_TABLE, GAMIFY_TIERS,
  type GamifyLevelInfo, type GamifyStreakState, type GamifyStreakLine,
  type GamifyStreaks, type GamifyMotivationCard, type GamifyXpEventView,
  type GamifyAchievementView, type GamifyChallengeView, type GamifyBoardRow,
  type GamifyLeaderboardPayload, type GamifyJourneySubject,
  type GamifyJourneyPayload, type GamifyHomePayload,
  type GamifyAchievementsPayload, type GamifyChallengesPayload,
  type GamifyXpLedgerPayload, type GamifyRewardsPayload,
} from '@/lib/types'

// ── Published constants ──────────────────────────────────────────────────────

/** The published streak-recovery rule — shown verbatim in the UI. */
export const RECOVERY_RULE =
  'One missed day doesn\'t break a real habit — with 9+ active days in the last 14, your streak survives a single gap.'

const RECOVERY_MIN_DAYS = 9 // "9+ active days in the last 14"
const RECOVERY_WINDOW = 14
const ACTIVITY_LOOKBACK_DAYS = 60 // streak/weekly measurement horizon
const STUDY_DAILY_CAP = 3 // XP table: "max 3 sessions/day counted"
const MOCK_BASE_XP = 40
const MOCK_BONUS_CAP = 25
const PYQ_DAY_BAR = 10 // pyq-daily challenge: a "day" needs >= 10 PYQ attempts
const CHALLENGE_BONUS_XP = 60

/** XP per kind — derived from the PUBLISHED table (single source of truth). */
const XP_OF: Record<string, number> = Object.fromEntries(XP_TABLE.map((r) => [r.kind, r.xp]))

const MASTERY_MEAN_BAR = 70 // mean engaged-score bar for a MASTERED topic
const BLOCKER_SCORE = 45 // "blocking" concept threshold
const CLOSE_LOW = 60 // close-topic card mastery window
const CLOSE_HIGH = 84

export const HOME_HONEST_NOTE =
  'Every point here is measured from your real study activity. The XP table, the level curve and the one-day recovery rule are published — opening the app earns nothing; learning sessions earn everything.'
export const JOURNEY_HONEST_NOTE =
  'Mastery is a learning signal from your own attempts — not a clinical competence measure.'
const ACHIEVEMENTS_NOTE =
  'Fourteen curated achievements with honest progress lines — measured from your real activity, no vanity counters, no badge clutter.'
const CHALLENGES_NOTE =
  'Challenge targets adapt to your measured baseline, and progress only counts activity inside the enrollment window — nothing you did before enrolling counts.'
const REWARDS_NOTE =
  'Rewards are non-monetary — accent themes for this section, featured badges, challenge badges and group recognition, unlocked by measured XP.'
const LEADERBOARD_FRAMING = 'Compare with consent. Compete with yourself.'
const LEADERBOARD_PRIVACY_NOTE =
  'Only members who turned sharing ON appear here. Your row appears in a group only after you enable sharing for that group.'
const MEASURED_SOURCES = [
  'QuestionAttempt', 'StudySession', 'RevisionSession', 'ExamAttempt',
  'SimCaseAttempt', 'FlashcardReview', 'KnowledgeState', 'MistakeRecord',
]

// ── Level curve (published: total XP for level L = 50 · (L−1) · L) ───────────

export function totalXpForLevel(level: number): number {
  return 50 * (level - 1) * level
}

export function levelForXp(xp: number): number {
  let level = 1
  while (level < 100 && totalXpForLevel(level + 1) <= xp) level += 1
  return level
}

function tierFor(level: number): string {
  return GAMIFY_TIERS.find((t) => level <= t.upTo)?.name ?? 'Mastery'
}

function levelInfoOf(xp: number): GamifyLevelInfo {
  const level = levelForXp(xp)
  const base = totalXpForLevel(level)
  const next = totalXpForLevel(level + 1)
  return {
    level,
    tier: tierFor(level),
    xp,
    xpIntoLevel: xp - base,
    xpForNextLevel: next - base,
    xpToNext: Math.max(0, next - xp),
  }
}

// ── Topic mastery aggregation (MASTERY BAR above) ────────────────────────────

export interface TopicAgg {
  topicId: string
  total: number // concepts in the topic (DB Concept rows)
  engaged: number // concepts with a KnowledgeState row
  scores: number[] // engaged scores 0..100
  mean: number | null
}

function meanOf(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** A topic crosses the MASTERY BAR when enough of it is engaged AND the mean is >= 70. */
export function isTopicMastered(agg: TopicAgg): boolean {
  if (agg.total <= 0) return false
  const need = Math.max(2, Math.ceil(agg.total * 0.5))
  const mean = meanOf(agg.scores)
  return agg.engaged >= need && agg.scores.length > 0 && mean != null && mean >= MASTERY_MEAN_BAR
}

async function topicAggregates(profileId: string): Promise<Map<string, TopicAgg>> {
  const [concepts, states] = await Promise.all([
    db.concept.findMany({ select: { id: true, topicId: true } }),
    db.knowledgeState.findMany({ where: { profileId }, select: { conceptId: true, score: true } }),
  ])
  const topicOf = new Map(concepts.map((c) => [c.id, c.topicId]))
  const agg = new Map<string, TopicAgg>()
  for (const c of concepts) {
    let a = agg.get(c.topicId)
    if (!a) { a = { topicId: c.topicId, total: 0, engaged: 0, scores: [], mean: null }; agg.set(c.topicId, a) }
    a.total += 1
  }
  for (const s of states) {
    const topicId = topicOf.get(s.conceptId)
    if (!topicId) continue
    const a = agg.get(topicId)
    if (!a) continue
    a.engaged += 1
    a.scores.push(s.score)
  }
  for (const a of agg.values()) a.mean = meanOf(a.scores)
  return agg
}

/** Topic display meta from the DB Topic table (names), registry importance preferred. */
async function topicMetaMap(): Promise<Map<string, { name: string; importance: number; subjectId: string }>> {
  const [rows, registry] = await Promise.all([
    db.topic.findMany({ select: { id: true, name: true, importance: true, subjectId: true } }),
    import('@/lib/curriculum/registry').then((m) => m.allTopics()),
  ])
  const regImp = new Map(registry.map((t) => [t.id, t.importance]))
  return new Map(rows.map((t) => [t.id, {
    name: t.name,
    importance: regImp.get(t.id) ?? t.importance,
    subjectId: t.subjectId,
  }]))
}

// ── Streaks (healthy, measured, with the published 1-day recovery) ───────────

type StreakKind = 'learning' | 'revision' | 'mcq'

function dayActiveBy(a: DayActivity, kind: StreakKind): boolean {
  if (kind === 'mcq') return a.mcqs > 0
  if (kind === 'revision') return a.revisionSessions > 0 || a.flashcards > 0
  return isDayActive(a) // learning = any measured activity
}

function streakLine(log: ActivityLog, kind: StreakKind, activeDays14: number): GamifyStreakLine {
  const today = todayKey()
  const todayActive = dayActiveBy(dayActivityOf(log, today), kind)
  let state: GamifyStreakState = todayActive ? 'intact' : 'open'
  let days = 0
  let gapUsed = false
  // Walk backwards from today (or yesterday when today is still open — the day
  // is not over, so it is never counted as "missed").
  let cursor = todayActive ? today : dayKeyOffset(today, -1)
  for (let guard = 0; guard < 400; guard++) {
    if (dayActiveBy(dayActivityOf(log, cursor), kind)) {
      days += 1
      cursor = dayKeyOffset(cursor, -1)
      continue
    }
    // The ONE recovery: skip a single gap day when the habit is real
    // (9+ active days in the trailing 14) and there is a streak to protect.
    if (!gapUsed && days > 0 && activeDays14 >= RECOVERY_MIN_DAYS) {
      gapUsed = true
      state = 'recovered'
      cursor = dayKeyOffset(cursor, -1)
      continue
    }
    break
  }
  if (days < 1) state = 'none'
  let note: string
  if (state === 'none') note = 'No measured activity yet — your first session starts the streak.'
  else if (state === 'recovered') note = 'Recovered — one missed day, habit intact.'
  else if (state === 'open') note = days >= 3 ? 'Today is still open — any session counts.' : 'A session today keeps it going.'
  else note = days >= 3 ? `${days}-day streak — measured from real sessions.` : 'Streak started — measured from real sessions.'
  return { days, state, todayActive, note }
}

function computeStreaks(log: ActivityLog): GamifyStreaks {
  const keys: string[] = []
  for (let i = 0; i < RECOVERY_WINDOW; i++) keys.push(dayKeyOffset(todayKey(), -i))
  const activeDays14 = keys.filter((k) => isDayActive(dayActivityOf(log, k))).length
  const monday = currentIstMondayKey()
  const weekly: GamifyStreaks['weekly'] = []
  for (let w = 5; w >= 0; w--) {
    const weekStart = dayKeyOffset(monday, -7 * w)
    let activeDays = 0
    for (let d = 0; d < 7; d++) if (isDayActive(dayActivityOf(log, dayKeyOffset(weekStart, d)))) activeDays += 1
    weekly.push({ weekStart, activeDays, total: 7 })
  }
  return {
    learning: streakLine(log, 'learning', activeDays14),
    revision: streakLine(log, 'revision', activeDays14),
    mcq: streakLine(log, 'mcq', activeDays14),
    weekly,
    activeDays14,
    recoveryRule: RECOVERY_RULE,
  }
}

// ── Measured context (one snapshot reused by sync + every payload) ───────────

interface GamifyMeasured {
  now: Date
  log: ActivityLog
  streaks: GamifyStreaks
  totalXp: number
  level: GamifyLevelInfo
  events: number
  attempts: number
  revCompleted: number
  flashcardsReviewed: number
  mocks: number
  cases: number
  mistakesResolved: number
  studySessions: number
  topicAgg: Map<string, TopicAgg>
  topicMeta: Map<string, { name: string; importance: number; subjectId: string }>
  topicsMasteredIds: string[]
  bestTopicMastery: number | null // best mean mastery among engaged topics
  hardTopicsBest: number | null // same, restricted to importance >= 4
  accThis7: number | null // rolling 7d accuracy
  accPrior7: number | null // the 7d window before it
  nThis7: number
  nPrior7: number
  dueItems: number // due RevisionItems (uncleared, due <= now)
  dueMinutes: number
}

async function measuredContext(profileId: string, now = new Date()): Promise<GamifyMeasured> {
  const since = new Date(now.getTime() - ACTIVITY_LOOKBACK_DAYS * DAY)
  const [
    log, xpAgg, evCount, attempts, revCompleted, cards, mocks, cases,
    mistakesResolved, studySessions, topicAgg, topicMeta, accRows, dueRows,
  ] = await Promise.all([
    loadActivity(profileId, since),
    db.xpEvent.aggregate({ where: { profileId }, _sum: { xp: true } }),
    db.xpEvent.count({ where: { profileId } }),
    db.questionAttempt.count({ where: { profileId } }),
    db.revisionSession.count({ where: { profileId, status: 'completed' } }),
    db.flashcardReview.count({ where: { profileId } }),
    db.examAttempt.count({ where: { profileId, status: 'submitted' } }),
    db.simCaseAttempt.count({ where: { profileId, status: 'completed' } }),
    db.mistakeRecord.count({ where: { profileId, status: 'resolved' } }),
    db.studySession.count({ where: { profileId } }),
    topicAggregates(profileId),
    topicMetaMap(),
    db.questionAttempt.findMany({
      where: { profileId, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } },
      select: { correct: true, createdAt: true },
    }),
    db.revisionItem.findMany({
      where: { profileId, cleared: false, dueAt: { lte: now } },
      select: { minutes: true },
    }),
  ])

  const totalXp = xpAgg._sum.xp ?? 0
  const streaks = computeStreaks(log)
  const topicsMasteredIds = [...topicAgg.values()].filter(isTopicMastered).map((a) => a.topicId)

  let bestTopicMastery: number | null = null
  let hardTopicsBest: number | null = null
  for (const a of topicAgg.values()) {
    if (a.engaged === 0 || a.mean == null) continue
    const rounded = Math.round(a.mean)
    if (bestTopicMastery == null || rounded > bestTopicMastery) bestTopicMastery = rounded
    if ((topicMeta.get(a.topicId)?.importance ?? 0) >= 4) {
      if (hardTopicsBest == null || rounded > hardTopicsBest) hardTopicsBest = rounded
    }
  }

  // Rolling accuracy windows: this-7d = [now−7d, now], prior-7d = [now−14d, now−7d).
  const cut = now.getTime() - 7 * DAY
  let nThis7 = 0, cThis7 = 0, nPrior7 = 0, cPrior7 = 0
  for (const r of accRows) {
    if (r.createdAt.getTime() >= cut) { nThis7 += 1; if (r.correct) cThis7 += 1 }
    else { nPrior7 += 1; if (r.correct) cPrior7 += 1 }
  }

  return {
    now,
    log,
    streaks,
    totalXp,
    level: levelInfoOf(totalXp),
    events: evCount,
    attempts,
    revCompleted,
    flashcardsReviewed: cards,
    mocks,
    cases,
    mistakesResolved,
    studySessions,
    topicAgg,
    topicMeta,
    topicsMasteredIds,
    bestTopicMastery,
    hardTopicsBest,
    accThis7: nThis7 > 0 ? Math.round((cThis7 / nThis7) * 100) : null,
    accPrior7: nPrior7 > 0 ? Math.round((cPrior7 / nPrior7) * 100) : null,
    nThis7,
    nPrior7,
    dueItems: dueRows.length,
    dueMinutes: dueRows.reduce((a, r) => a + r.minutes, 0),
  }
}

// ── Idempotent XP grants ─────────────────────────────────────────────────────

interface GrantRow {
  kind: string
  refId: string
  dayKey: string
  xp: number
  meta?: Record<string, number | string>
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002'
}

/** Insert grant rows; P2002 (already granted) is swallowed — idempotency. */
async function grantEvents(profileId: string, rows: GrantRow[]): Promise<number> {
  if (!rows.length) return 0
  const data = rows.map((r) => ({
    profileId, kind: r.kind, refId: r.refId, dayKey: r.dayKey, xp: r.xp,
    meta: (r.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  }))
  try {
    await db.xpEvent.createMany({ data })
    return rows.length
  } catch {
    // Overlap re-scan: some rows already exist — fall back to per-row creates.
    let granted = 0
    for (const d of data) {
      try { await db.xpEvent.create({ data: d }); granted += 1 } catch (e) { if (!isUniqueViolation(e)) throw e }
    }
    return granted
  }
}

/** PYQ detection: question.tags is a Json array — match any tag containing 'pyq'. */
function tagsArePyq(tags: unknown): boolean {
  return Array.isArray(tags) && tags.some((t) => String(t).toLowerCase().includes('pyq'))
}

// ── syncGamification: idempotent XP + achievement materializer ───────────────

/**
 * Re-measure real activity since the last sync (with a 24h overlap) and
 * materialize XpEvent rows + achievement unlocks. Unique constraints make
 * every grant idempotent; re-running never double-counts. Never throws on
 * conflicts. Returns how many NEW xp events were granted in this pass.
 */
export async function syncGamification(profileId: string): Promise<{ granted: number }> {
  const { granted } = await gamifySyncMeasured(profileId)
  return { granted }
}

/** syncGamification + the measured snapshot its payload builders reuse. */
async function gamifySyncMeasured(profileId: string): Promise<{ granted: number; m: GamifyMeasured }> {
  const now = new Date()

  // 1. `since`: last grant time minus a 24h overlap (epoch on the first run).
  const last = await db.xpEvent.findFirst({
    where: { profileId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const since = last ? new Date(last.createdAt.getTime() - 24 * 3600 * 1000) : new Date(0)
  let granted = 0

  // 2. MCQ grants — first attempt at a question vs redos, in createdAt order.
  const attempts = await db.questionAttempt.findMany({
    where: { profileId, createdAt: { gte: since } },
    select: { id: true, questionId: true, correct: true, createdAt: true, question: { select: { subjectCode: true } } },
    orderBy: { createdAt: 'asc' },
  })
  if (attempts.length) {
    const mins = await db.questionAttempt.groupBy({
      by: ['questionId'], where: { profileId }, _min: { createdAt: true },
    })
    const firstAt = new Map(mins.map((m) => [m.questionId, m._min.createdAt?.getTime()]))
    const rows: GrantRow[] = []
    for (const a of attempts) {
      const dayKey = istDayKey(a.createdAt)
      if (firstAt.get(a.questionId) === a.createdAt.getTime()) {
        rows.push({
          kind: a.correct ? 'mcq-correct' : 'mcq-attempt', refId: a.id, dayKey,
          xp: a.correct ? XP_OF['mcq-correct'] : XP_OF['mcq-attempt'],
          meta: { subjectCode: a.question.subjectCode },
        })
      } else if (a.correct) {
        rows.push({ kind: 'mcq-repeat-correct', refId: a.id, dayKey, xp: XP_OF['mcq-repeat-correct'], meta: { subjectCode: a.question.subjectCode } })
      } // later wrong attempts earn nothing — the honest miss was already paid once
    }
    granted += await grantEvents(profileId, rows)
  }

  // 3. Flashcards — +1 per card per day (refId carries the IST day).
  const cards = await db.flashcardReview.findMany({
    where: { profileId, reviewedAt: { gte: since } },
    select: { flashcardId: true, reviewedAt: true },
  })
  granted += await grantEvents(profileId, cards.filter((c) => c.reviewedAt).map((c) => ({
    kind: 'flashcards',
    refId: `${c.flashcardId}:${istDayKey(c.reviewedAt as Date)}`,
    dayKey: istDayKey(c.reviewedAt as Date),
    xp: XP_OF['flashcards'],
  })))

  // 4. Revision — completed sessions only.
  const revs = await db.revisionSession.findMany({
    where: { profileId, createdAt: { gte: since }, status: 'completed' },
    select: { id: true, createdAt: true },
  })
  granted += await grantEvents(profileId, revs.map((r) => ({
    kind: 'revision', refId: r.id, dayKey: istDayKey(r.createdAt), xp: XP_OF['revision'],
  })))

  // 5. Study — first 3 sessions per IST day (published cap), honoring grants
  //    from earlier syncs so an overlap window cannot exceed the cap.
  const studyRows = await db.studySession.findMany({
    where: { profileId, date: { gte: since } },
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
  })
  if (studyRows.length) {
    const prior = await db.xpEvent.findMany({ where: { profileId, kind: 'study' }, select: { dayKey: true } })
    const perDay = new Map<string, number>()
    for (const p of prior) perDay.set(p.dayKey, (perDay.get(p.dayKey) ?? 0) + 1)
    const rows: GrantRow[] = []
    for (const s of studyRows) {
      const dayKey = istDayKey(s.date)
      const used = perDay.get(dayKey) ?? 0
      if (used >= STUDY_DAILY_CAP) continue
      perDay.set(dayKey, used + 1)
      rows.push({ kind: 'study', refId: s.id, dayKey, xp: XP_OF['study'] })
    }
    granted += await grantEvents(profileId, rows)
  }

  // 6. Mocks — submitted papers + accuracy bonus (published: 40 + min(25, acc/4)).
  const mocks = await db.examAttempt.findMany({
    where: { profileId, status: 'submitted', submittedAt: { gte: since } },
    select: { id: true, correct: true, total: true, submittedAt: true },
  })
  granted += await grantEvents(profileId, mocks.filter((m) => m.submittedAt).map((m) => {
    const accuracy = m.total > 0 ? (m.correct / m.total) * 100 : 0
    return {
      kind: 'mock', refId: m.id, dayKey: istDayKey(m.submittedAt as Date),
      xp: MOCK_BASE_XP + Math.min(MOCK_BONUS_CAP, Math.round(accuracy * 0.25)),
      meta: { accuracy: Math.round(accuracy) },
    }
  }))

  // 7. Clinical cases — completed attempts.
  const caseRows = await db.simCaseAttempt.findMany({
    where: { profileId, status: 'completed', completedAt: { gte: since } },
    select: { id: true, completedAt: true },
  })
  granted += await grantEvents(profileId, caseRows.filter((c) => c.completedAt).map((c) => ({
    kind: 'case', refId: c.id, dayKey: istDayKey(c.completedAt as Date), xp: XP_OF['case'],
  })))

  // 8. Topic mastery — one-time +50 per topic crossing the MASTERY BAR.
  const [topicAgg, topicMeta, masteredEvents] = await Promise.all([
    topicAggregates(profileId),
    topicMetaMap(),
    db.xpEvent.findMany({ where: { profileId, kind: 'topic-mastered' }, select: { refId: true } }),
  ])
  const alreadyMastered = new Set(masteredEvents.map((e) => e.refId))
  const topicRows: GrantRow[] = []
  for (const agg of topicAgg.values()) {
    if (!isTopicMastered(agg) || alreadyMastered.has(agg.topicId)) continue
    topicRows.push({
      kind: 'topic-mastered', refId: agg.topicId, dayKey: todayKey(), xp: XP_OF['topic-mastered'],
      meta: { mastery: Math.round(agg.mean ?? 0) },
    })
  }
  granted += await grantEvents(profileId, topicRows)

  // 9. Mistake corrections — mistakes resolved for good.
  const fixed = await db.mistakeRecord.findMany({
    where: { profileId, status: 'resolved', resolvedAt: { gte: since } },
    select: { id: true, resolvedAt: true },
  })
  granted += await grantEvents(profileId, fixed.filter((f) => f.resolvedAt).map((f) => ({
    kind: 'mistake-corrected', refId: f.id, dayKey: istDayKey(f.resolvedAt as Date), xp: XP_OF['mistake-corrected'],
  })))

  // 10. Challenges — evaluate active enrollments; complete + one-time bonus
  //     when live progress (window-only, see measureProgress) reaches target.
  const activeEnrollments = await db.challengeEnrollment.findMany({ where: { profileId, status: 'active' } })
  for (const enrollment of activeEnrollments) {
    const def = CHALLENGE_DEFS.find((d) => d.id === enrollment.challengeId)
    if (!def) continue
    const snap = parseSnap(enrollment.startSnap)
    const target = snap.target > 0 ? snap.target : def.durationDays // sane fallback
    try {
      const progress = await measureProgress(def, profileId, enrollment.startedAt, snap, now)
      if (progress < target) continue
      let bonusEventId = enrollment.bonusXpEvent
      if (!bonusEventId) {
        try {
          const ev = await db.xpEvent.create({
            data: {
              profileId, kind: 'challenge-completed', refId: enrollment.id,
              dayKey: todayKey(), xp: CHALLENGE_BONUS_XP,
              meta: { challengeId: def.id } as Prisma.InputJsonValue,
            },
          })
          bonusEventId = ev.id
          granted += 1
        } catch (e) { if (!isUniqueViolation(e)) throw e }
      }
      await db.challengeEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'completed', completedAt: now, bonusXpEvent: bonusEventId,
          startSnap: { ...snap, finalProgress: progress } as unknown as Prisma.InputJsonValue,
        },
      })
    } catch (e) { if (!isUniqueViolation(e)) throw e }
  }

  // 11. Achievements — evaluate the measured context and materialize unlocks.
  const m = await measuredContext(profileId, now)
  const unlocked = ACHIEVEMENT_DEFS.filter((a) => {
    try { return a.evaluate(m) } catch { return false }
  })
  for (const def of unlocked) {
    try {
      await db.achievementUnlock.upsert({
        where: { profileId_achievementId: { profileId, achievementId: def.id } },
        update: {}, // keep the FIRST earnedAt — unlocks never re-date
        create: {
          profileId, achievementId: def.id,
          meta: {
            xp: m.totalXp, level: m.level.level, attempts: m.attempts,
            streakDays: m.streaks.learning.days,
          } as Prisma.InputJsonValue,
        },
      })
    } catch (e) { if (!isUniqueViolation(e)) throw e }
  }

  return { granted, m }
}

// ── Event labels (human one-liners, built at read time) ──────────────────────

const KIND_LABELS: Record<string, string> = {
  'mcq-correct': 'First-hit correct answers',
  'mcq-repeat-correct': 'Redo wins',
  'mcq-attempt': 'Honest misses reviewed',
  revision: 'Revision blocks',
  flashcards: 'Flashcard reviews',
  study: 'Study blocks',
  mock: 'Mock papers',
  case: 'Clinical cases',
  'topic-mastered': 'Topics mastered',
  'mistake-corrected': 'Mistakes fixed',
  'challenge-completed': 'Challenges completed',
}

function stemSlice(stem: string): string {
  const clean = stem.replace(/\s+/g, ' ').trim()
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean
}

type XpEventRow = { id: string; kind: string; refId: string; xp: number; dayKey: string; createdAt: Date; meta: unknown }

/** Build a human label per event (stems/topic names resolved at read time). */
async function labelEvents(events: XpEventRow[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  if (!events.length) return labels
  const mcqIds = events.filter((e) => e.kind.startsWith('mcq-')).map((e) => e.refId)
  const attemptRows = mcqIds.length
    ? await db.questionAttempt.findMany({ where: { id: { in: mcqIds } }, select: { id: true, question: { select: { stem: true } } } })
    : []
  const stemOf = new Map(attemptRows.map((a) => [a.id, stemSlice(a.question.stem)]))
  const topicMeta = events.some((e) => e.kind === 'topic-mastered') ? await topicMetaMap() : null
  const challengeIds = events.filter((e) => e.kind === 'challenge-completed').map((e) => e.refId)
  const enrollmentRows = challengeIds.length
    ? await db.challengeEnrollment.findMany({ where: { id: { in: challengeIds } }, select: { id: true, challengeId: true } })
    : []
  const challengeTitle = new Map(enrollmentRows.map((r) => [r.id, CHALLENGE_DEFS.find((d) => d.id === r.challengeId)?.title]))

  for (const e of events) {
    const stem = stemOf.get(e.refId)
    const meta = (e.meta ?? {}) as { accuracy?: number; challengeId?: string }
    switch (e.kind) {
      case 'mcq-correct': labels.set(e.id, `Correct — ${stem ?? 'question'}`); break
      case 'mcq-attempt': labels.set(e.id, `Missed — ${stem ?? 'question'}`); break
      case 'mcq-repeat-correct': labels.set(e.id, `Redo correct — ${stem ?? 'question'}`); break
      case 'revision': labels.set(e.id, 'Completed a revision block'); break
      case 'flashcards': labels.set(e.id, 'Reviewed flashcards'); break
      case 'study': labels.set(e.id, 'Logged a study block'); break
      case 'mock': labels.set(e.id, typeof meta.accuracy === 'number' ? `Submitted a mock — ${meta.accuracy}% accuracy` : 'Submitted a mock'); break
      case 'case': labels.set(e.id, 'Completed a clinical case'); break
      case 'topic-mastered': labels.set(e.id, `Topic mastered — ${topicMeta?.get(e.refId)?.name ?? e.refId}`); break
      case 'mistake-corrected': labels.set(e.id, 'Fixed a repeated mistake for good'); break
      case 'challenge-completed': labels.set(e.id, `Challenge complete — ${challengeTitle.get(e.refId) ?? meta.challengeId ?? 'challenge'}`); break
      default: labels.set(e.id, KIND_LABELS[e.kind] ?? e.kind)
    }
  }
  return labels
}

function toEventView(e: XpEventRow, labels: Map<string, string>): GamifyXpEventView {
  return { id: e.id, kind: e.kind, label: labels.get(e.id) ?? e.kind, xp: e.xp, dayKey: e.dayKey, at: e.createdAt.toISOString() }
}

// ── Challenge definitions (code-versioned, adaptive, window-only progress) ──

interface ChallengeSnapTopic { topicId: string; name: string; mastery: number }
interface ChallengeSnap {
  target: number
  baseline: number
  topics?: ChallengeSnapTopic[] // weak-topic freeze
  finalProgress?: number // recorded at completion
  [k: string]: unknown
}

function parseSnap(raw: unknown): ChallengeSnap {
  const snap: ChallengeSnap = { target: 0, baseline: 0 }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (typeof o.target === 'number' && Number.isFinite(o.target)) snap.target = o.target
    if (typeof o.baseline === 'number' && Number.isFinite(o.baseline)) snap.baseline = o.baseline
    if (typeof o.finalProgress === 'number') snap.finalProgress = o.finalProgress
    if (Array.isArray(o.topics)) {
      snap.topics = o.topics
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .filter((t) => typeof t.topicId === 'string' && typeof t.mastery === 'number')
        .map((t) => ({ topicId: t.topicId as string, name: typeof t.name === 'string' ? t.name : t.topicId as string, mastery: t.mastery as number }))
    }
  }
  return snap
}

const round10 = (v: number) => Math.round(v / 10) * 10
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export interface GamifyChallengeDef {
  id: string
  title: string
  description: string
  icon: string
  durationDays: number
  unit: string
  bonusXp: number
  /** LIVE adaptive target + the measured baseline it adapts to (catalog view). */
  liveTarget: (profileId: string, now: Date) => Promise<{ target: number; baseline: number }>
  liveNote: (baseline: number, target: number) => string
  frozenNote: (snap: ChallengeSnap) => string
  suggest: (profileId: string, now: Date) => Promise<{ ok: boolean; reason: string }>
}

/** Weak engaged topics sorted weakest-first (importance-weighted tiebreak). */
async function weakestEngagedTopics(profileId: string, take: number): Promise<ChallengeSnapTopic[]> {
  const [agg, meta] = await Promise.all([topicAggregates(profileId), topicMetaMap()])
  return [...agg.values()]
    .filter((a) => a.engaged > 0 && a.mean != null)
    .sort((a, b) =>
      (a.mean as number) - (b.mean as number) ||
      (meta.get(b.topicId)?.importance ?? 0) - (meta.get(a.topicId)?.importance ?? 0) ||
      a.topicId.localeCompare(b.topicId))
    .slice(0, take)
    .map((a) => ({ topicId: a.topicId, name: meta.get(a.topicId)?.name ?? a.topicId, mastery: Math.round(a.mean as number) }))
}

/**
 * LIVE progress for an ACTIVE enrollment — counts activity INSIDE the
 * enrollment window only (startedAt → now). Nothing from before you enrolled
 * counts; that is the honesty rule for every challenge percent.
 */
async function measureProgress(
  def: GamifyChallengeDef, profileId: string, startedAt: Date, snap: ChallengeSnap, now: Date,
): Promise<number> {
  switch (def.id) {
    case 'revision-7': {
      const log = await loadActivity(profileId, startedAt)
      let days = 0
      let key = istDayKey(startedAt)
      const lastKey = todayKey()
      for (let guard = 0; guard < 60 && key <= lastKey; guard++) {
        const a = dayActivityOf(log, key)
        if (a.revisionSessions > 0 || a.flashcards >= 5) days += 1
        key = dayKeyOffset(key, 1)
      }
      return days
    }
    case 'mcq-100':
      return db.questionAttempt.count({ where: { profileId, createdAt: { gte: startedAt, lte: now } } })
    case 'pharm-week':
      return db.questionAttempt.count({ where: { profileId, createdAt: { gte: startedAt, lte: now }, question: { subjectCode: 'PHARM' } } })
    case 'pyq-daily': {
      const rows = await db.questionAttempt.findMany({
        where: { profileId, createdAt: { gte: startedAt, lte: now } },
        select: { createdAt: true, question: { select: { tags: true } } },
      })
      const perDay = new Map<string, number>()
      for (const r of rows) {
        if (!tagsArePyq(r.question.tags)) continue
        const k = istDayKey(r.createdAt)
        perDay.set(k, (perDay.get(k) ?? 0) + 1)
      }
      return [...perDay.values()].filter((n) => n >= PYQ_DAY_BAR).length
    }
    case 'mock-2':
      return db.examAttempt.count({ where: { profileId, status: 'submitted', submittedAt: { gte: startedAt, lte: now } } })
    case 'weak-topic': {
      if (!snap.topics?.length) return 0
      const agg = await topicAggregates(profileId)
      return snap.topics.filter((t) => {
        const a = agg.get(t.topicId)
        return !!a && a.mean != null && a.mean >= 60
      }).length
    }
    default:
      return 0
  }
}

export const CHALLENGE_DEFS: GamifyChallengeDef[] = [
  {
    id: 'revision-7',
    title: '7-Day Revision Challenge',
    description: 'Five days with revision-family activity (a revision block, or five flashcards) inside your 7-day window.',
    icon: 'RefreshCcw',
    durationDays: 7,
    unit: 'days',
    bonusXp: CHALLENGE_BONUS_XP,
    liveTarget: async (profileId, now) => {
      const due = await db.revisionItem.count({ where: { profileId, cleared: false, dueAt: { lte: now } } })
      return { target: 5, baseline: due }
    },
    liveNote: (baseline) => `Fixed target — five days with revision-family activity. Measured now: ${baseline} items due.`,
    frozenNote: () => 'Fixed target — five days with revision-family activity inside your 7-day window. Progress counts this window only.',
    suggest: async (profileId, now) => {
      const due = await db.revisionItem.count({ where: { profileId, cleared: false, dueAt: { lte: now } } })
      return due >= 5
        ? { ok: true, reason: `You have ${due} items due — five focused days clears the backlog.` }
        : { ok: false, reason: '' }
    },
  },
  {
    id: 'mcq-100',
    title: '100 MCQ Challenge',
    description: 'Solve the adaptive MCQ target inside your 7-day window. The target freezes at enroll from your trailing week.',
    icon: 'CircleHelp',
    durationDays: 7,
    unit: 'mcqs',
    bonusXp: CHALLENGE_BONUS_XP,
    liveTarget: async (profileId) => {
      const baseline = await db.questionAttempt.count({
        where: { profileId, createdAt: { gte: new Date(Date.now() - 7 * DAY) } },
      })
      return { target: clamp(round10(baseline * 1.2), 80, 250), baseline }
    },
    liveNote: (baseline, target) => `Target adapts to your last-7-day volume: ${baseline} attempts → ${target}.`,
    frozenNote: (snap) => `Target frozen at enroll — your last-7-day volume was ${snap.baseline} attempts → ≈${snap.target} MCQs. Progress counts this window only.`,
    suggest: async (profileId) => {
      const n = await db.questionAttempt.count({ where: { profileId, createdAt: { gte: new Date(Date.now() - 7 * DAY) } } })
      return n >= 15
        ? { ok: true, reason: `You solved ${n} this week — +20% is a stretch that fits.` }
        : { ok: false, reason: '' }
    },
  },
  {
    id: 'pharm-week',
    title: 'Pharmacology Week',
    description: 'Seven days of focused Pharmacology MCQs — the adaptive target freezes at enroll from your trailing two weeks.',
    icon: 'Pill',
    durationDays: 7,
    unit: 'mcqs',
    bonusXp: CHALLENGE_BONUS_XP,
    liveTarget: async (profileId) => {
      const rows = await db.questionAttempt.findMany({
        where: { profileId, createdAt: { gte: new Date(Date.now() - 14 * DAY) }, question: { subjectCode: 'PHARM' } },
        select: { correct: true },
      })
      return { target: clamp(round10(rows.length * 1.25), 30, 120), baseline: rows.length }
    },
    liveNote: (baseline, target) => `Target adapts to your last-14-day PHARM volume: ${baseline} attempts → ${target}.`,
    frozenNote: (snap) => `Target frozen at enroll — ${snap.baseline} PHARM attempts in the trailing 14 days → ${snap.target} MCQs. Progress counts this window only.`,
    suggest: async (profileId) => {
      const rows = await db.questionAttempt.findMany({
        where: { profileId, question: { subjectCode: 'PHARM' } },
        select: { correct: true },
      })
      if (!rows.length) return { ok: false, reason: '' }
      const acc = Math.round((rows.filter((r) => r.correct).length / rows.length) * 100)
      return { ok: true, reason: `You have ${rows.length} PHARM attempts at ${acc}% accuracy — a focused week compounds it.` }
    },
  },
  {
    id: 'pyq-daily',
    title: 'Daily PYQ Challenge',
    description: `Five days with at least ${PYQ_DAY_BAR} previous-year-question (PYQ) attempts inside your 7-day window.`,
    icon: 'FileQuestion',
    durationDays: 7,
    unit: 'days',
    bonusXp: CHALLENGE_BONUS_XP,
    liveTarget: async (profileId) => {
      const rows = await db.questionAttempt.findMany({ where: { profileId }, select: { question: { select: { tags: true } } } })
      return { target: 5, baseline: rows.filter((r) => tagsArePyq(r.question.tags)).length }
    },
    liveNote: (baseline) => `Fixed target — five days with ${PYQ_DAY_BAR}+ PYQ attempts. Measured: ${baseline} PYQ attempts logged so far.`,
    frozenNote: () => `Fixed target — five days with ${PYQ_DAY_BAR}+ PYQ attempts inside your 7-day window. Progress counts this window only.`,
    suggest: async (profileId) => {
      const rows = await db.questionAttempt.findMany({ where: { profileId }, select: { question: { select: { tags: true } } } })
      const n = rows.filter((r) => tagsArePyq(r.question.tags)).length
      return n >= 15
        ? { ok: true, reason: `You have ${n} PYQ attempts logged — build the pattern-recognition habit.` }
        : { ok: false, reason: '' }
    },
  },
  {
    id: 'mock-2',
    title: 'Mock-Test Challenge',
    description: 'Two submitted, full timed mock papers inside your 14-day window.',
    icon: 'ClipboardList',
    durationDays: 14,
    unit: 'mocks',
    bonusXp: CHALLENGE_BONUS_XP,
    liveTarget: async (profileId) => {
      const mocks30 = await db.examAttempt.count({
        where: { profileId, status: 'submitted', submittedAt: { gte: new Date(Date.now() - 30 * DAY) } },
      })
      return { target: 2, baseline: mocks30 }
    },
    liveNote: (baseline) => `Fixed target — two submitted mocks in 14 days. Your last-30-day count: ${baseline}.`,
    frozenNote: () => 'Fixed target — two submitted mocks inside your 14-day window. Progress counts this window only.',
    suggest: async (profileId) => {
      const mocks30 = await db.examAttempt.count({
        where: { profileId, status: 'submitted', submittedAt: { gte: new Date(Date.now() - 30 * DAY) } },
      })
      return mocks30 === 0
        ? { ok: true, reason: 'No mock in the last 30 days — two timed papers rebuild the stamina.' }
        : { ok: false, reason: '' }
    },
  },
  {
    id: 'weak-topic',
    title: 'Weak-Topic Challenge',
    description: 'Lift the three weakest topics you have engaged (frozen at enroll) to 60% mastery within 14 days.',
    icon: 'Mountain',
    durationDays: 14,
    unit: 'topics',
    bonusXp: CHALLENGE_BONUS_XP,
    liveTarget: async (profileId) => {
      const agg = await topicAggregates(profileId)
      const weak = [...agg.values()].filter((a) => a.engaged > 0 && a.mean != null && a.mean < 50).length
      return { target: 3, baseline: weak }
    },
    liveNote: (baseline) => `Target — three weak topics lifted to 60% mastery. Measured now: ${baseline} engaged topics below 50%.`,
    frozenNote: (snap) => {
      const names = (snap.topics ?? []).map((t) => t.name).join(', ')
      return `Frozen at enroll — the three weakest engaged topics: ${names || 'none measured'}. Lift them to 60% mastery. Progress counts this window only.`
    },
    suggest: async (profileId) => {
      const agg = await topicAggregates(profileId)
      const weak = [...agg.values()].filter((a) => a.engaged > 0 && a.mean != null && a.mean < 50).length
      return weak >= 3
        ? { ok: true, reason: `${weak} weak topics — pick three and lift them.` }
        : { ok: false, reason: '' }
    },
  },
]

/** The measured baseline snapshot frozen at enroll time. */
async function buildStartSnap(profileId: string, def: GamifyChallengeDef, now: Date): Promise<ChallengeSnap> {
  const { target, baseline } = await def.liveTarget(profileId, now)
  const snap: ChallengeSnap = { target, baseline }
  if (def.id === 'weak-topic') snap.topics = await weakestEngagedTopics(profileId, 3)
  return snap
}

type EnrollmentRow = {
  id: string; challengeId: string; status: string; startSnap: unknown
  startedAt: Date; completedAt: Date | null; bonusXpEvent: string
}

async function challengeView(
  profileId: string, def: GamifyChallengeDef, enrollment: EnrollmentRow | null, now: Date,
  suggestBudget?: { used: number },
): Promise<GamifyChallengeView> {
  const base = {
    id: def.id, title: def.title, description: def.description, icon: def.icon,
    durationDays: def.durationDays, unit: def.unit, bonusXp: def.bonusXp,
    enrolled: !!enrollment,
  }
  if (!enrollment) {
    const { target, baseline } = await def.liveTarget(profileId, now)
    let suggested = false
    let suggestReason: string | null = null
    if (suggestBudget && suggestBudget.used < 2) {
      const s = await def.suggest(profileId, now)
      if (s.ok) { suggested = true; suggestReason = s.reason; suggestBudget.used += 1 }
    }
    return {
      ...base, status: 'not-enrolled', target, adaptedNote: def.liveNote(baseline, target),
      progress: null, percent: null, daysLeft: null, startedAt: null, completedAt: null,
      suggested, suggestReason,
    }
  }
  const snap = parseSnap(enrollment.startSnap)
  const target = snap.target > 0 ? snap.target : 0
  const startedAt = enrollment.startedAt
  if (enrollment.status === 'completed') {
    const progress = snap.finalProgress ?? target
    return {
      ...base, status: 'completed', target, adaptedNote: def.frozenNote(snap),
      progress, percent: 100, daysLeft: 0,
      startedAt: startedAt.toISOString(),
      completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
      suggested: false, suggestReason: null,
    }
  }
  // Abandoned enrollments are re-enrollable: show them honestly as 'abandoned'
  // with a FRESH adaptive target (a new enroll restarts the measured window).
  if (enrollment.status === 'abandoned') {
    const { target: liveTarget, baseline } = await def.liveTarget(profileId, now)
    return {
      ...base, enrolled: false, status: 'abandoned', target: liveTarget,
      adaptedNote: `${def.liveNote(baseline, liveTarget)} Re-enrolling starts a fresh window.`,
      progress: null, percent: null, daysLeft: null, startedAt: null, completedAt: null,
      suggested: false, suggestReason: null,
    }
  }
  const progress = await measureProgress(def, profileId, startedAt, snap, now)
  const endsAt = startedAt.getTime() + def.durationDays * DAY
  const daysLeft = Math.max(0, Math.ceil((endsAt - now.getTime()) / DAY))
  return {
    ...base, status: 'active', target, adaptedNote: def.frozenNote(snap),
    progress, percent: target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0,
    daysLeft, startedAt: startedAt.toISOString(), completedAt: null,
    suggested: false, suggestReason: null,
  }
}

/** Refreshed single-challenge view (routes use it after enroll/abandon). */
export async function refreshChallengeView(profileId: string, challengeId: string): Promise<GamifyChallengeView | null> {
  const def = CHALLENGE_DEFS.find((d) => d.id === challengeId)
  if (!def) return null
  const [enrollment] = await db.challengeEnrollment.findMany({
    where: { profileId, challengeId }, take: 1,
  })
  return challengeView(profileId, def, enrollment ?? null, new Date())
}

// ── Achievement definitions (curated 14, code-versioned) ─────────────────────

export interface GamifyAchievementDef {
  id: string
  title: string
  description: string
  icon: string
  group: 'starters' | 'practice' | 'consistency' | 'mocks' | 'repair' | 'mastery'
  evaluate: (m: GamifyMeasured) => boolean
  progress: (m: GamifyMeasured) => { pct: number | null; note: string | null }
}

const ratioPct = (n: number, d: number) => Math.min(100, Math.round((n / d) * 100))

export const ACHIEVEMENT_DEFS: GamifyAchievementDef[] = [
  {
    id: 'first-topic', title: 'BookMarked', description: 'Master your first topic.', icon: 'BookMarked',
    group: 'starters',
    evaluate: (m) => m.topicsMasteredIds.length >= 1,
    progress: (m) => m.bestTopicMastery != null
      ? { pct: m.bestTopicMastery, note: `Best engaged topic: ${m.bestTopicMastery}% mastery (bar: 70%)` }
      : { pct: null, note: null },
  },
  {
    id: 'mcq-100', title: 'Century — 100 MCQs', description: 'Solve 100 MCQs.', icon: 'CircleHelp',
    group: 'practice',
    evaluate: (m) => m.attempts >= 100,
    progress: (m) => ({ pct: ratioPct(m.attempts, 100), note: `${m.attempts} / 100 MCQs solved` }),
  },
  {
    id: 'mcq-1000', title: 'Thousand Questions', description: 'Solve 1,000 MCQs.', icon: 'CircleHelp',
    group: 'practice',
    evaluate: (m) => m.attempts >= 1000,
    progress: (m) => ({ pct: ratioPct(m.attempts, 1000), note: `${m.attempts} / 1000 MCQs solved` }),
  },
  {
    id: 'streak-7', title: 'Seven Straight', description: 'A 7-day learning streak (recovered days count).', icon: 'Flame',
    group: 'consistency',
    evaluate: (m) => m.streaks.learning.days >= 7,
    progress: (m) => ({ pct: ratioPct(m.streaks.learning.days, 7), note: `${m.streaks.learning.days} / 7 days` }),
  },
  {
    id: 'streak-30', title: 'Month of Momentum', description: 'A 30-day learning streak (recovered days count).', icon: 'Flame',
    group: 'consistency',
    evaluate: (m) => m.streaks.learning.days >= 30,
    progress: (m) => ({ pct: ratioPct(m.streaks.learning.days, 30), note: `${m.streaks.learning.days} / 30 days` }),
  },
  {
    id: 'first-mock', title: 'First Paper', description: 'Submit your first mock test.', icon: 'ClipboardList',
    group: 'mocks',
    evaluate: (m) => m.mocks >= 1,
    progress: (m) => ({ pct: ratioPct(m.mocks, 1), note: `${m.mocks} / 1 mocks submitted` }),
  },
  {
    id: 'mock-5', title: 'Paper Veteran', description: 'Submit five mock tests.', icon: 'ClipboardList',
    group: 'mocks',
    evaluate: (m) => m.mocks >= 5,
    progress: (m) => ({ pct: ratioPct(m.mocks, 5), note: `${m.mocks} / 5 mocks submitted` }),
  },
  {
    id: 'accuracy-up', title: 'Turning the Trend', description: 'Weekly accuracy up 8+ points (20+ attempts in both weeks).', icon: 'TrendingUp',
    group: 'practice',
    evaluate: (m) => m.accThis7 != null && m.accPrior7 != null && m.nThis7 >= 20 && m.nPrior7 >= 20 && m.accThis7 - m.accPrior7 >= 8,
    progress: (m) => {
      if (m.accThis7 == null || m.accPrior7 == null) return { pct: null, note: null }
      const delta = m.accThis7 - m.accPrior7
      return { pct: clamp(Math.round(((delta + 8) / 8) * 100), 0, 100), note: `This week ${m.accThis7}% vs last ${m.accPrior7}%` }
    },
  },
  {
    id: 'mistake-fixer', title: 'Closed Loops', description: 'Resolve 5 repeated mistakes for good.', icon: 'Bandage',
    group: 'repair',
    evaluate: (m) => m.mistakesResolved >= 5,
    progress: (m) => ({ pct: ratioPct(m.mistakesResolved, 5), note: `${m.mistakesResolved} / 5 mistakes resolved` }),
  },
  {
    id: 'revision-cycle', title: 'Revision Habit', description: 'Complete 20 revision sessions.', icon: 'RefreshCcw',
    group: 'consistency',
    evaluate: (m) => m.revCompleted >= 20,
    progress: (m) => ({ pct: ratioPct(m.revCompleted, 20), note: `${m.revCompleted} / 20 revision sessions` }),
  },
  {
    id: 'flashcard-100', title: 'Active Recall', description: 'Review 100 flashcards.', icon: 'Layers',
    group: 'practice',
    evaluate: (m) => m.flashcardsReviewed >= 100,
    progress: (m) => ({ pct: ratioPct(m.flashcardsReviewed, 100), note: `${m.flashcardsReviewed} / 100 cards reviewed` }),
  },
  {
    id: 'case-10', title: 'Ward Rounds', description: 'Complete 10 clinical cases.', icon: 'Stethoscope',
    group: 'practice',
    evaluate: (m) => m.cases >= 10,
    progress: (m) => ({ pct: ratioPct(m.cases, 10), note: `${m.cases} / 10 cases completed` }),
  },
  {
    id: 'hard-topic', title: 'High Ground', description: 'Master a high-importance topic (NEET-PG yield 4+).', icon: 'Mountain',
    group: 'mastery',
    evaluate: (m) => m.topicsMasteredIds.some((id) => (m.topicMeta.get(id)?.importance ?? 0) >= 4),
    progress: (m) => m.hardTopicsBest != null
      ? { pct: m.hardTopicsBest, note: `Best high-importance topic: ${m.hardTopicsBest}% mastery (bar: 70%)` }
      : { pct: null, note: null },
  },
  {
    id: 'level-5', title: 'Clinical Grade', description: 'Reach level 5.', icon: 'Trophy',
    group: 'mastery',
    evaluate: (m) => m.level.level >= 5,
    progress: (m) => ({ pct: ratioPct(m.level.level, 5), note: `Level ${m.level.level} (target 5)` }),
  },
]

async function achievementViews(profileId: string, m: GamifyMeasured): Promise<GamifyAchievementView[]> {
  const unlocks = await db.achievementUnlock.findMany({ where: { profileId } })
  const byId = new Map(unlocks.map((u) => [u.achievementId, u]))
  return ACHIEVEMENT_DEFS.map((def) => {
    const u = byId.get(def.id)
    const p = def.progress(m)
    return {
      id: def.id, title: def.title, description: def.description, icon: def.icon, group: def.group,
      unlocked: !!u,
      earnedAt: u ? u.earnedAt.toISOString() : null,
      progress: u ? 100 : p.pct,
      progressNote: p.note,
      featured: false, // filled from MotivationSettings by the caller
    }
  })
}

// ── Motivation cards (deterministic, measured, max 4, no AI, no guilt) ───────

async function buildMotivationCards(m: GamifyMeasured, profileId: string): Promise<GamifyMotivationCard[]> {
  const cards: GamifyMotivationCard[] = []
  const now = m.now

  // 1. Blockers — engaged concepts sitting below 45%.
  const weak = await db.knowledgeState.findMany({
    where: { profileId, score: { lt: BLOCKER_SCORE } },
    select: { score: true, concept: { select: { name: true } } },
    orderBy: { score: 'asc' },
    take: 3,
  })
  const weakCount = weak.length >= 3
    ? await db.knowledgeState.count({ where: { profileId, score: { lt: BLOCKER_SCORE } } })
    : 0
  if (weakCount >= 3) {
    const top = weak.map((w) => `“${w.concept.name}” (${Math.round(w.score)}%)`).join(', ')
    cards.push({
      id: 'blockers:knowledge', kind: 'blockers',
      title: `${weakCount} concepts are blocking your progress`,
      detail: `Lowest three: ${top}. Retie them and the rest of the ladder loosens up.`,
      action: { label: 'Open Mistake Intelligence', view: 'mistakes' },
    })
  }

  // 2. Revision backlog — due items measured from RevisionItem.
  if (m.dueItems >= 5) {
    cards.push({
      id: 'revision-backlog:items', kind: 'revision-backlog',
      title: 'You have a revision backlog',
      detail: `${m.dueItems} items due, about ${m.dueMinutes} min.`,
      action: { label: 'Open Revision', view: 'revision' },
    })
  }

  // 3. Close-topic — engaged topics sitting at 60–84% mean mastery.
  const close = [...m.topicAgg.values()]
    .filter((a) => a.engaged >= 2 && a.mean != null && a.mean >= CLOSE_LOW && a.mean <= CLOSE_HIGH)
    .sort((a, b) => (b.mean as number) - (a.mean as number))
    .slice(0, 2)
  for (const a of close) {
    const meta = m.topicMeta.get(a.topicId)
    cards.push({
      id: `close-topic:${a.topicId}`, kind: 'close-topic',
      title: `You are close to completing ${meta?.name ?? a.topicId}`,
      detail: `${Math.round(a.mean as number)}% mastered — ${Math.max(0, a.total - a.engaged)} concepts to go.`,
      action: { label: 'Open Topic Hub', view: 'hub', topicId: a.topicId },
    })
  }

  // 4. Accuracy-up — real weekly delta, both windows measured.
  if (m.accThis7 != null && m.accPrior7 != null && m.nThis7 >= 15 && m.nPrior7 >= 15) {
    const delta = m.accThis7 - m.accPrior7
    if (delta >= 5) {
      cards.push({
        id: 'accuracy-up:week', kind: 'accuracy-up',
        title: `Your accuracy improved ${delta} points this week`,
        detail: `${m.accThis7}% this week vs ${m.accPrior7}% last.`,
        action: { label: 'Open Performance', view: 'performance' },
      })
    }
  }

  // 5. Streak — exactly one, only when there is something real to show.
  if (cards.length < 4) {
    const s = m.streaks.learning
    const detail = `${s.days}-day streak · ${m.streaks.activeDays14} active days in the last 14.`
    if (s.state === 'recovered' && s.days >= 2) {
      cards.push({
        id: 'streak:learning', kind: 'streak',
        title: 'Streak recovered — one missed day, habit intact.',
        detail, action: { label: 'Practice now', view: 'questions' },
      })
    } else if (s.todayActive && s.days >= 3) {
      cards.push({
        id: 'streak:learning', kind: 'streak',
        title: `${s.days}-day streak — today is already locked in.`,
        detail, action: { label: 'Practice now', view: 'questions' },
      })
    } else if (!s.todayActive && s.days >= 3) {
      cards.push({
        id: 'streak:learning', kind: 'streak',
        title: `Your ${s.days}-day streak is still open today — any session counts.`,
        detail, action: { label: 'Practice now', view: 'questions' },
      })
    }
  }

  return cards.slice(0, 4)
}

// ── Payload builders (typed to the frozen contract) ──────────────────────────

export async function loadGamifyHome(profileId: string): Promise<GamifyHomePayload> {
  const { m } = await gamifySyncMeasured(profileId)
  const today = todayKey()
  const monday = currentIstMondayKey()
  const mondayStart = dayKeyStart(monday)
  const lastMonday = dayKeyOffset(monday, -7)

  const [dayXpAgg, weekXpAgg, lastWeekXpAgg, recentRows, unlockRows, enrollmentRows] = await Promise.all([
    db.xpEvent.aggregate({ where: { profileId, dayKey: today }, _sum: { xp: true } }),
    db.xpEvent.aggregate({ where: { profileId, dayKey: { gte: monday } }, _sum: { xp: true } }),
    db.xpEvent.aggregate({ where: { profileId, dayKey: { gte: lastMonday, lte: dayKeyOffset(monday, -1) } }, _sum: { xp: true } }),
    db.xpEvent.findMany({ where: { profileId }, orderBy: { createdAt: 'desc' }, take: 12 }),
    db.achievementUnlock.findMany({ where: { profileId }, orderBy: { earnedAt: 'desc' } }),
    db.challengeEnrollment.findMany({ where: { profileId }, orderBy: { startedAt: 'asc' } }),
  ])
  const labels = await labelEvents(recentRows)

  const todayActivity = dayActivityOf(m.log, today)
  const todayRevCompleted = await db.revisionSession.count({
    where: { profileId, status: 'completed', createdAt: { gte: dayKeyStart(today) } },
  })

  const achievements = await achievementViews(profileId, m)
  const featured = await loadFeatured(profileId)
  for (const a of achievements) a.featured = featured.includes(a.id)

  const enrollments = new Map(enrollmentRows.map((e) => [e.challengeId, e]))
  const challengeViews: GamifyChallengeView[] = []
  for (const def of CHALLENGE_DEFS) {
    const e = enrollments.get(def.id) ?? null
    if (!e) continue // home only summarizes enrolled challenges
    challengeViews.push(await challengeView(profileId, def, e, m.now))
  }

  const latestUnlock = unlockRows[0]
  const latestDef = latestUnlock ? ACHIEVEMENT_DEFS.find((d) => d.id === latestUnlock.achievementId) : undefined
  const latest: GamifyAchievementView | null = latestUnlock && latestDef
    ? (achievements.find((a) => a.id === latestDef.id) ?? null)
    : null
  const nextActive = challengeViews.find((c) => c.status === 'active') ?? null

  const todayUnits = {
    mcqs: todayActivity.mcqs,
    revision: todayRevCompleted,
    studyMinutes: todayActivity.studyMinutes,
    mocks: todayActivity.mocks,
    xp: dayXpAgg._sum.xp ?? 0,
    active: isDayActive(todayActivity),
  }

  return {
    generatedAt: m.now.toISOString(),
    level: m.level,
    streaks: m.streaks,
    today: todayUnits,
    weekXp: weekXpAgg._sum.xp ?? 0,
    lastWeekXp: lastWeekXpAgg._sum.xp ?? 0,
    recent: recentRows.map((e) => toEventView(e, labels)),
    totals: {
      mcqsSolved: m.attempts,
      revisionSessions: m.revCompleted,
      mocksSubmitted: m.mocks,
      casesCompleted: m.cases,
      flashcardsReviewed: m.flashcardsReviewed,
      topicsMastered: m.topicsMasteredIds.length,
      mistakesResolved: m.mistakesResolved,
      studySessions: m.studySessions,
    },
    achievements: { unlocked: unlockRows.length, total: ACHIEVEMENT_DEFS.length, latest },
    challenges: {
      active: challengeViews.filter((c) => c.status === 'active').length,
      completed: challengeViews.filter((c) => c.status === 'completed').length,
      next: nextActive,
    },
    motivation: await buildMotivationCards(m, profileId),
    dataBasis: { events: m.events, measuredSources: MEASURED_SOURCES },
    honestNote: HOME_HONEST_NOTE,
  }
}

export async function buildJourney(profileId: string): Promise<GamifyJourneyPayload> {
  const { m } = await gamifySyncMeasured(profileId)

  // Per-subject aggregation over DB topics (the space concepts live in).
  const subjectIds = new Set(m.topicMeta.values().map((t) => t.subjectId))
  const engagedSubjects = new Set(
    [...m.topicAgg.values()].filter((a) => a.engaged > 0).map((a) => m.topicMeta.get(a.topicId)?.subjectId).filter(Boolean),
  )
  const topicsPerSubject = new Map<string, { total: number; engaged: number; mastered: number; means: number[] }>()
  for (const [topicId, meta] of m.topicMeta) {
    let row = topicsPerSubject.get(meta.subjectId)
    if (!row) { row = { total: 0, engaged: 0, mastered: 0, means: [] }; topicsPerSubject.set(meta.subjectId, row) }
    row.total += 1
    const agg = m.topicAgg.get(topicId)
    if (!agg || agg.engaged === 0) continue
    row.engaged += 1
    if (agg.mean != null) row.means.push(Math.round(agg.mean))
    if (isTopicMastered(agg)) row.mastered += 1
  }

  const subjects: GamifyJourneySubject[] = []
  for (const s of allSubjects()) {
    const row = topicsPerSubject.get(s.id)
    if (!row || row.total === 0) continue // "registry subjects with topics"
    const engagedPct = Math.round((row.engaged / row.total) * 100)
    const masteryPct = row.means.length ? Math.round(meanOf(row.means) as number) : null
    subjects.push({
      id: s.id, code: s.code, name: s.name, color: s.color, neetWeight: s.neetWeight,
      topicsTotal: row.total, topicsMastered: row.mastered, engagedPct, masteryPct,
      status: engagedPct === 0 ? 'new' : masteryPct != null && masteryPct >= MASTERY_MEAN_BAR ? 'strong' : 'developing',
    })
  }
  subjects.sort((a, b) => b.neetWeight - a.neetWeight || ((a.masteryPct ?? Infinity) - (b.masteryPct ?? Infinity)))

  const engagedConcepts = [...m.topicAgg.values()].reduce((a, t) => a + t.engaged, 0)
  const engagedScores = [...m.topicAgg.values()].flatMap((t) => t.scores)
  const meanMastery = engagedScores.length ? Math.round(meanOf(engagedScores) as number) : 0
  const unlockedRows = await db.achievementUnlock.findMany({ where: { profileId }, orderBy: { earnedAt: 'desc' } })
  const milestonesTotal = ACHIEVEMENT_DEFS.length

  // Exam Readiness — P13 composite, called here only (journey route).
  const perf = await buildPerformancePayload()

  const ladder: GamifyJourneyPayload['ladder'] = [
    { label: 'Subjects engaged', detail: `${engagedSubjects.size} of ${subjectIds.size} subjects have engaged concepts`, percent: subjectIds.size ? Math.round((engagedSubjects.size / subjectIds.size) * 100) : 0 },
    { label: 'Topics engaged', detail: `${[...m.topicAgg.values()].filter((a) => a.engaged > 0).length} of ${m.topicMeta.size} topics started`, percent: m.topicMeta.size ? Math.round(([...m.topicAgg.values()].filter((a) => a.engaged > 0).length / m.topicMeta.size) * 100) : 0 },
    { label: 'Mastery — engaged concepts', detail: `${meanMastery}% mean mastery across ${engagedConcepts} engaged concepts`, percent: meanMastery },
    { label: 'Milestones unlocked', detail: `${unlockedRows.length} of ${milestonesTotal} achievements earned`, percent: Math.round((unlockedRows.length / milestonesTotal) * 100) },
    {
      label: 'Exam readiness',
      detail: perf.readiness.overall != null ? `${perf.readiness.overall} / 100 — ${perf.readiness.band}` : 'Not enough measured data yet',
      percent: perf.readiness.overall ?? 0,
    },
  ]

  const conceptsTotal = await db.concept.count()

  return {
    generatedAt: m.now.toISOString(),
    ladder,
    subjects,
    milestones: {
      unlocked: unlockedRows.length,
      total: milestonesTotal,
      recent: unlockedRows.slice(0, 3).map((u) => {
        const def = ACHIEVEMENT_DEFS.find((d) => d.id === u.achievementId)
        return { id: u.achievementId, title: def?.title ?? u.achievementId, earnedAt: u.earnedAt.toISOString() }
      }),
    },
    readiness: { current: perf.readiness.overall, band: perf.readiness.band, note: perf.readiness.disclaimer },
    insufficientData: m.attempts < 5 && engagedConcepts < 3,
    dataBasis: { conceptsTouched: engagedConcepts, conceptsTotal, attempts: m.attempts, mocks: m.mocks },
    honestNote: JOURNEY_HONEST_NOTE,
  }
}

async function loadFeatured(profileId: string): Promise<string[]> {
  const settings = await db.motivationSettings.findUnique({ where: { profileId } })
  const raw = settings?.featured
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string')
    .filter((id) => ACHIEVEMENT_DEFS.some((d) => d.id === id))
    .slice(0, 3)
}

export async function buildAchievements(profileId: string): Promise<GamifyAchievementsPayload> {
  const { m } = await gamifySyncMeasured(profileId)
  const featured = await loadFeatured(profileId)
  const achievements = await achievementViews(profileId, m)
  for (const a of achievements) a.featured = featured.includes(a.id)
  return { achievements, featured, note: ACHIEVEMENTS_NOTE }
}

/** Upsert the featured-badge preferences (validated + deduped + capped by the route). */
export async function setFeatured(profileId: string, featured: string[]): Promise<string[]> {
  const capped = featured.slice(0, 3)
  await db.motivationSettings.upsert({
    where: { profileId },
    update: { featured: capped as Prisma.InputJsonValue },
    create: { profileId, featured: capped as Prisma.InputJsonValue },
  })
  return capped
}

export async function buildChallenges(profileId: string): Promise<GamifyChallengesPayload> {
  const { m } = await gamifySyncMeasured(profileId)
  const rows = await db.challengeEnrollment.findMany({ where: { profileId } })
  const byChallenge = new Map(rows.map((r) => [r.challengeId, r]))
  const budget = { used: 0 }
  const challenges: GamifyChallengeView[] = []
  for (const def of CHALLENGE_DEFS) {
    challenges.push(await challengeView(profileId, def, byChallenge.get(def.id) ?? null, m.now, budget))
  }
  return {
    challenges,
    activeCount: challenges.filter((c) => c.status === 'active').length,
    completedCount: challenges.filter((c) => c.status === 'completed').length,
    note: CHALLENGES_NOTE,
  }
}

export async function enrollChallenge(profileId: string, challengeId: string): Promise<GamifyChallengeView> {
  const def = CHALLENGE_DEFS.find((d) => d.id === challengeId)
  if (!def) throw new Error('unknown challenge')
  const now = new Date()
  // Re-enrolling after abandon starts a clean slate: drop the abandoned row so
  // the unique (profileId, challengeId) constraint accepts the fresh window.
  await db.challengeEnrollment.deleteMany({ where: { profileId, challengeId, status: 'abandoned' } })
  const snap = await buildStartSnap(profileId, def, now)
  await db.challengeEnrollment.create({
    data: {
      profileId, challengeId, status: 'active',
      startSnap: snap as Prisma.InputJsonValue, startedAt: now,
    },
  })
  const view = await refreshChallengeView(profileId, challengeId)
  if (!view) throw new Error('challenge view missing')
  return view
}

export async function abandonChallenge(profileId: string, challengeId: string): Promise<GamifyChallengeView> {
  await db.challengeEnrollment.updateMany({
    where: { profileId, challengeId, status: 'active' },
    data: { status: 'abandoned' },
  })
  const view = await refreshChallengeView(profileId, challengeId)
  if (!view) throw new Error('challenge view missing')
  return view
}

// ── Leaderboard (P16 shareData consent; peers are deterministic demo rows) ───

/** FNV-1a — stable per handle, so peer snapshots never change between loads. */
function peerHash(handle: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export async function buildLeaderboard(profileId: string, groupId: string | null): Promise<GamifyLeaderboardPayload> {
  const now = new Date()
  const monday = currentIstMondayKey()
  const [memberships, thisWeekAgg, lastWeekAgg] = await Promise.all([
    db.groupMembership.findMany({ where: { actorKey: 'you' } }),
    db.xpEvent.aggregate({ where: { profileId, dayKey: { gte: monday } }, _sum: { xp: true } }),
    db.xpEvent.aggregate({ where: { profileId, dayKey: { gte: dayKeyOffset(monday, -7), lte: dayKeyOffset(monday, -1) } }, _sum: { xp: true } }),
  ])
  const yourThisWeekXp = thisWeekAgg._sum.xp ?? 0
  const yourLastWeekXp = lastWeekAgg._sum.xp ?? 0

  const groupIds = [...new Set(memberships.map((m) => m.groupId))]
  const groupsMeta = groupIds.length ? await db.studyGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true, seeded: true } }) : []
  const memberCounts = groupIds.length
    ? await db.groupMembership.groupBy({ by: ['groupId'], where: { groupId: { in: groupIds } }, _count: true })
    : []
  const countOf = new Map(memberCounts.map((c) => [c.groupId, c._count]))
  const groups = groupsMeta.map((g) => ({
    id: g.id, name: g.name,
    shareData: memberships.find((m) => m.groupId === g.id)?.shareData ?? false,
    memberCount: countOf.get(g.id) ?? 0,
    demo: g.seeded,
  }))

  const selected = groupId && groupIds.includes(groupId) ? groupId : (groupIds[0] ?? null)
  const yourMembership = selected ? memberships.find((m) => m.groupId === selected) ?? null : null
  const consentOn = yourMembership?.shareData ?? false

  const rows: GamifyBoardRow[] = []
  let streak = 0
  let weeklyMcqs: number | null = null
  let weeklyAccuracy: number | null = null
  if (selected) {
    const peerMemberships = await db.groupMembership.findMany({
      where: { groupId: selected, shareData: true, actorKey: { not: 'you' } },
    })
    const peerIds = peerMemberships.map((p) => p.actorKey)
    const peers = peerIds.length ? await db.communityMember.findMany({ where: { id: { in: peerIds } }, select: { id: true, name: true, handle: true } }) : []
    const peerById = new Map(peers.map((p) => [p.id, p]))
    for (const pm of peerMemberships) {
      const peer = peerById.get(pm.actorKey)
      if (!peer) continue
      const h = peerHash(peer.handle)
      rows.push({
        actorKey: pm.actorKey, name: peer.name, demo: true, you: false,
        weeklyXp: 90 + (h % 331), // 90..420 — deterministic demo snapshot
        weeklyMcqs: 30 + (Math.floor(h / 8) % 141), // 30..170
        weeklyAccuracy: 48 + (Math.floor(h / 64) % 39), // 48..86
        streak: 1 + (Math.floor(h / 512) % 24), // 1..24
        rank: 0, note: null,
      })
    }
    if (consentOn) {
      const weekAttempts = await db.questionAttempt.findMany({
        where: { profileId, createdAt: { gte: dayKeyStart(monday) } },
        select: { correct: true },
      })
      weeklyMcqs = weekAttempts.length
      weeklyAccuracy = weeklyMcqs > 0 ? Math.round((weekAttempts.filter((a) => a.correct).length / weeklyMcqs) * 100) : null
      const log = await loadActivity(profileId, new Date(now.getTime() - ACTIVITY_LOOKBACK_DAYS * DAY))
      streak = computeStreaks(log).learning.days
      const diff = yourThisWeekXp - yourLastWeekXp
      const note = yourLastWeekXp > 0
        ? `${diff >= 0 ? '+' : ''}${diff} XP vs your last week`
        : 'First measured week — your baseline starts now.'
      rows.push({
        actorKey: 'you', name: 'You', demo: false, you: true,
        weeklyXp: yourThisWeekXp, weeklyMcqs, weeklyAccuracy, streak, rank: 0, note,
      })
    }
  }

  rows.sort((a, b) => (b.weeklyXp ?? -1) - (a.weeklyXp ?? -1) || (a.you === b.you ? 0 : a.you ? -1 : 1))
  rows.forEach((r, i) => { r.rank = i + 1 })

  return {
    groups, groupId: selected, consentOn, rows,
    yourLastWeekXp, yourThisWeekXp,
    framing: LEADERBOARD_FRAMING, privacyNote: LEADERBOARD_PRIVACY_NOTE,
  }
}

/** Flip YOUR per-group share consent (reuses the P16 GroupMembership column). */
export async function setConsent(profileId: string, groupId: string, on: boolean): Promise<boolean> {
  const membership = await db.groupMembership.findUnique({
    where: { groupId_actorKey: { groupId, actorKey: 'you' } },
  })
  if (!membership) throw new Error('not-a-member')
  await db.groupMembership.update({ where: { id: membership.id }, data: { shareData: on } })
  return on
}

// ── XP ledger ────────────────────────────────────────────────────────────────

export async function buildXpLedger(profileId: string, limit = 120): Promise<GamifyXpLedgerPayload> {
  const [total, totalAgg, events] = await Promise.all([
    db.xpEvent.count({ where: { profileId } }),
    db.xpEvent.aggregate({ where: { profileId }, _sum: { xp: true } }),
    db.xpEvent.findMany({ where: { profileId }, orderBy: { createdAt: 'desc' }, take: limit }),
  ])
  const labels = await labelEvents(events)
  const byDay = new Map<string, GamifyXpLedgerPayload['days'][number]>()
  for (const e of events) {
    let day = byDay.get(e.dayKey)
    if (!day) { day = { dayKey: e.dayKey, label: dayLabel(e.dayKey), xp: 0, events: [] }; byDay.set(e.dayKey, day) }
    day.xp += e.xp
    day.events.push({ kind: e.kind, label: labels.get(e.id) ?? e.kind, xp: e.xp, at: e.createdAt.toISOString() })
  }
  const byKindAgg = await db.xpEvent.groupBy({ by: ['kind'], where: { profileId }, _sum: { xp: true } })
  const byKind = byKindAgg
    .map((k) => ({ kind: k.kind, label: KIND_LABELS[k.kind] ?? k.kind, xp: k._sum.xp ?? 0 }))
    .sort((a, b) => b.xp - a.xp)
  return {
    days: [...byDay.values()].sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1)),
    byKind,
    totalXp: totalAgg._sum.xp ?? 0,
    hasMore: total > events.length,
  }
}

// ── Rewards (non-monetary) ───────────────────────────────────────────────────

const ACCENTS = [
  { id: 'clinical-cyan', name: 'Clinical Cyan', unlockLevel: 1, description: 'The default — calm and clinical' },
  { id: 'mint-rounds', name: 'Mint Rounds', unlockLevel: 3, description: 'Rounded mint notes — for a steady month of measured practice' },
  { id: 'amber-clinical', name: 'Amber Grand Rounds', unlockLevel: 5, description: 'Warm amber — grand-rounds energy' },
  { id: 'slate-attending', name: 'Slate Attending', unlockLevel: 7, description: 'Quiet slate — the attending have seen it all' },
]

export async function buildRewards(profileId: string): Promise<GamifyRewardsPayload> {
  const { m } = await gamifySyncMeasured(profileId)
  const [featured, unlockedCount, completed, memberships] = await Promise.all([
    loadFeatured(profileId),
    db.achievementUnlock.count({ where: { profileId } }),
    db.challengeEnrollment.findMany({ where: { profileId, status: 'completed' }, orderBy: { completedAt: 'desc' } }),
    db.groupMembership.findMany({ where: { actorKey: 'you' } }),
  ])
  const groupIds = [...new Set(memberships.map((gm) => gm.groupId))]
  const groupRows = groupIds.length ? await db.studyGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } }) : []
  const groupNameOf = new Map(groupRows.map((g) => [g.id, g.name]))
  const groupChallenges = groupIds.length
    ? await db.groupChallenge.findMany({ where: { groupId: { in: groupIds }, status: { not: 'archived' } }, select: { groupId: true } })
    : []
  const perGroup = new Map<string, number>()
  for (const gc of groupChallenges) perGroup.set(gc.groupId, (perGroup.get(gc.groupId) ?? 0) + 1)

  return {
    accents: ACCENTS.map((a) => ({ ...a, unlocked: m.level.level >= a.unlockLevel })),
    featured,
    badges: {
      unlocked: unlockedCount,
      total: ACHIEVEMENT_DEFS.length,
      challengeBadges: completed.map((c) => ({
        id: c.challengeId,
        title: CHALLENGE_DEFS.find((d) => d.id === c.challengeId)?.title ?? c.challengeId,
        completedAt: (c.completedAt ?? c.startedAt).toISOString(),
      })),
    },
    groupRecognition: [...perGroup.entries()].map(([gid, n]) => ({
      groupName: groupNameOf.get(gid) ?? gid,
      note: `${n} group challenge${n === 1 ? '' : 's'} — join from Community`,
    })),
    note: REWARDS_NOTE,
  }
}
