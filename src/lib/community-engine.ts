// ─── COMMUNITY & ACCOUNTABILITY ENGINE (PRODUCT 16) ──────────────────────────
// Server-side engine for the Medical Learning Community. Honesty rules frozen
// with the contract (types.ts, P16):
//   · "You" = the single demo StudentProfile (getDemoProfile). Peers are SEEDED
//     CommunityMember rows — their posts/progress are demo data, labelled.
//   · Accountability (streaks, goal/challenge progress) is MEASURED from real
//     study activity (QuestionAttempt / StudySession / RevisionSession /
//     submitted ExamAttempt / SimCaseAttempt / FlashcardReview) in IST
//     day-windows — never self-reported, never invented.
//   · Patient-identifying content is blocked deterministically at write time.
//   · AI modes (summarize/explain/moderate) are badged, grounded, fallback-safe,
//     final-text-only (no chain-of-thought). Suggest is fully MEASURED.
//   · Private-group content is gated to members; personal progress is only
//     shared with a group after the explicit per-group shareData opt-in.

import { Prisma } from '@prisma/client'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { DAY, istDayKey, computeStreak } from '@/lib/engine'
import { allTopics, subjectOfTopic } from '@/lib/curriculum/registry'
import { EXTERNAL_CATALOG, scoreExternal, queryWords } from '@/lib/resource-catalog'
import { loadGraphContext } from '@/lib/knowledge-graph'
import { normalizeAskQuery, resolveAskQuery } from '@/lib/ask-engine'
import type {
  CommunityActor, CommunityBadge, CommunityContribution, CommunityGoalView,
  CommunitySpaceSummary, CommunityPostSummary, CommunityReplySummary,
  AccountabilitySnapshot, CommunityChallengeView, CommunityHomePayload,
  CommunityGroupSummary, CommunityGroupDetail, CommunityThreadPayload,
  CommunityAiResponse,
} from '@/lib/types'

// ── Fixed strings ────────────────────────────────────────────────────────────

export const GLOBAL_COMMUNITY_GUIDELINES: string[] = [
  'Educational use only — this community is for learning, not for clinical advice. Never treat this as patient-care guidance.',
  'No patient identifiers, ever: no names, MRN/UHID, hospital or bed numbers, ward details, phone numbers or dates of birth — discuss de-identified findings only.',
  'Be kind and constructive. Critique ideas, not people; juniors learn here — bullying and mockery are removed.',
  'Cite when you can: name the textbook, guideline or question source you are drawing from so others can verify.',
  'No spam, promotions or referral links. Selling courses, Telegram channels and crypto talk get flagged automatically.',
  'Report misuse with the report button — privacy and misinformation reports hold the content for review.',
  'AI-assisted answers are unverified study aids, not medical advice; always confirm against standard textbooks.',
  'This is a demo community: every other member is a seeded demo peer, labelled as such — your own numbers are always measured from your real activity.',
]

export const DEMO_NOTICE =
  'Demo community — every other member, their posts, replies, votes and peer progress are seeded demo data for realistic practice. Your own posts and accountability numbers are always measured from your real study log.'

export const AI_BADGE = 'AI-ASSISTED — not verified medical advice'
export const AI_DISCLAIMER =
  'AI output can be wrong or incomplete. Verify against standard textbooks and your faculty before relying on it. Never paste patient-identifying information anywhere in the community.'

export const PHI_GUIDANCE =
  'Remove patient identifiers — discuss de-identified findings only. See Community Guidelines.'

const REVIEW_GUIDANCE =
  'Held for review — this content was auto-flagged and stays out of feeds until a moderator checks it.'
const CLEAN_GUIDANCE =
  'No policy issues detected. De-identified educational discussion is encouraged.'

// ── IST day-window helpers (same convention as planner/engine) ───────────────

/** UTC instant of 00:00 IST for a 'YYYY-MM-DD' day key (IST = UTC+5:30, no DST). */
export function dayKeyStart(key: string): Date {
  return new Date(`${key}T00:00:00+05:30`)
}

export function dayKeyOffset(key: string, offsetDays: number): string {
  return istDayKey(new Date(dayKeyStart(key).getTime() + offsetDays * DAY))
}

export function todayKey(): string {
  return istDayKey(new Date())
}

/** Newest-first list of the last n IST day keys (including today). */
export function lastNDayKeys(n: number): string[] {
  const t = todayKey()
  const keys: string[] = []
  for (let i = 0; i < n; i++) keys.push(dayKeyOffset(t, -i))
  return keys
}

const IST_WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' })

/** 'Mon 12' style label for a day key. */
export function dayLabel(key: string): string {
  const weekday = IST_WEEKDAY.format(dayKeyStart(key))
  const day = Number(key.slice(8, 10))
  return `${weekday} ${day}`
}

/** Current IST Mon–Sun week: Monday's day key. */
export function currentIstMondayKey(): string {
  const t = todayKey()
  const wd = IST_WEEKDAY.format(dayKeyStart(t)) // 'Mon'…'Sun'
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd)
  return dayKeyOffset(t, idx < 0 ? 0 : -idx)
}

// ── MEASURED activity log (single source for streaks/goals/challenges) ───────

export interface DayActivity {
  mcqs: number
  studyMinutes: number
  revisionSessions: number
  mocks: number
  cases: number
  flashcards: number // counts toward active days only — never a goal unit
}

export interface ActivityLog {
  since: Date
  entries: {
    mcqs: Date[]
    study: { at: Date; minutes: number }[]
    revision: Date[]
    mocks: Date[]
    cases: Date[]
    flashcards: Date[]
  }
  days: Map<string, DayActivity>
}

const EMPTY_DAY: DayActivity = { mcqs: 0, studyMinutes: 0, revisionSessions: 0, mocks: 0, cases: 0, flashcards: 0 }

function dayBucket(log: ActivityLog, at: Date): DayActivity {
  const key = istDayKey(at)
  let d = log.days.get(key)
  if (!d) { d = { ...EMPTY_DAY }; log.days.set(key, d) }
  return d
}

/**
 * Load real study activity since `since` and bucket it into IST days.
 * Sources: QuestionAttempt.createdAt (mcqs), StudySession.date summed minutes
 * (study), RevisionSession.createdAt count (revision), submitted ExamAttempt
 * by submittedAt (mocks), SimCaseAttempt by completedAt??startedAt (cases),
 * FlashcardReview.reviewedAt (active-day signal only — the model has no
 * createdAt; a review row only exists once the card was actually reviewed).
 */
export async function loadActivity(profileId: string, since: Date): Promise<ActivityLog> {
  const [mcqRows, studyRows, revRows, examRows, caseRows, cardRows] = await Promise.all([
    db.questionAttempt.findMany({ where: { profileId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.studySession.findMany({ where: { profileId, date: { gte: since } }, select: { date: true, minutes: true } }),
    db.revisionSession.findMany({ where: { profileId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.examAttempt.findMany({ where: { profileId, status: 'submitted', submittedAt: { gte: since } }, select: { submittedAt: true } }),
    db.simCaseAttempt.findMany({ where: { profileId, startedAt: { gte: since } }, select: { status: true, completedAt: true, startedAt: true } }),
    db.flashcardReview.findMany({ where: { profileId, reviewedAt: { gte: since } }, select: { reviewedAt: true } }),
  ])

  const log: ActivityLog = {
    since,
    entries: { mcqs: [], study: [], revision: [], mocks: [], cases: [], flashcards: [] },
    days: new Map(),
  }

  for (const r of mcqRows) { log.entries.mcqs.push(r.createdAt); dayBucket(log, r.createdAt).mcqs += 1 }
  for (const r of studyRows) { log.entries.study.push({ at: r.date, minutes: r.minutes }); dayBucket(log, r.date).studyMinutes += r.minutes }
  for (const r of revRows) { log.entries.revision.push(r.createdAt); dayBucket(log, r.createdAt).revisionSessions += 1 }
  for (const r of examRows) { if (r.submittedAt) { log.entries.mocks.push(r.submittedAt); dayBucket(log, r.submittedAt).mocks += 1 } }
  for (const r of caseRows) {
    // a case attempt that produced any record is real activity; measured at its
    // completion when it has one, otherwise at its start
    const at = r.completedAt ?? r.startedAt
    log.entries.cases.push(at)
    dayBucket(log, at).cases += 1
  }
  for (const r of cardRows) { if (r.reviewedAt) { log.entries.flashcards.push(r.reviewedAt); dayBucket(log, r.reviewedAt).flashcards += 1 } }

  return log
}

export function dayActivityOf(log: ActivityLog, key: string): DayActivity {
  return log.days.get(key) ?? EMPTY_DAY
}

/** Inclusive sum over the IST day keys [startKey..endKey] (endKey defaults to today). */
export function sumDays(log: ActivityLog, startKey: string, endKey = todayKey()): DayActivity {
  const out: DayActivity = { ...EMPTY_DAY }
  let cur = startKey
  let guard = 0
  while (guard++ < 400) {
    const d = log.days.get(cur)
    if (d) {
      out.mcqs += d.mcqs; out.studyMinutes += d.studyMinutes; out.revisionSessions += d.revisionSessions
      out.mocks += d.mocks; out.cases += d.cases; out.flashcards += d.flashcards
    }
    if (cur === endKey) break
    cur = dayKeyOffset(cur, 1)
  }
  return out
}

/** Sum of raw entries with timestamp >= at (commitment goals / challenges). */
export function sumSince(log: ActivityLog, at: Date): DayActivity {
  const out: DayActivity = { ...EMPTY_DAY }
  for (const t of log.entries.mcqs) if (t >= at) out.mcqs += 1
  for (const s of log.entries.study) if (s.at >= at) out.studyMinutes += s.minutes
  for (const t of log.entries.revision) if (t >= at) out.revisionSessions += 1
  for (const t of log.entries.mocks) if (t >= at) out.mocks += 1
  for (const t of log.entries.cases) if (t >= at) out.cases += 1
  for (const t of log.entries.flashcards) if (t >= at) out.flashcards += 1
  return out
}

export function isDayActive(a: DayActivity): boolean {
  return a.mcqs > 0 || a.studyMinutes > 0 || a.revisionSessions > 0 || a.mocks > 0 || a.cases > 0 || a.flashcards > 0
}

/** Goal-kind → unit (frozen by the goals route spec). */
export function unitForKind(kind: string): string {
  switch (kind) {
    case 'mcqs': return 'mcqs'
    case 'study': return 'minutes'
    case 'revision': return 'sessions'
    case 'mock': return 'mocks'
    case 'case': return 'cases'
    default: return 'sessions' // custom → sessions
  }
}

/** Challenge-kind → unit. */
export function unitForChallengeKind(kind: string): string {
  switch (kind) {
    case 'mcq': return 'mcqs'
    case 'mock': return 'mocks'
    case 'revision': return 'sessions'
    case 'case': return 'cases'
    default: return 'sessions'
  }
}

function metricForUnit(a: DayActivity, unit: string): number {
  switch (unit) {
    case 'mcqs': return a.mcqs
    case 'minutes': return a.studyMinutes
    case 'sessions': return a.revisionSessions
    case 'mocks': return a.mocks
    case 'cases': return a.cases
    default: return 0
  }
}

// ── Deterministic moderation scan (posts + replies, at create time) ──────────

export interface ScanReason { kind: string; note: string }
export type ScanAction = 'allow' | 'flag' | 'violation'
export interface ScanVerdict { action: ScanAction; reasons: ScanReason[]; flagged: '' | 'spam' | 'abuse' }

const PHI_PATTERNS: { re: RegExp; note: string }[] = [
  { re: /\b(mrn|uhid|medical record (?:no|number)|hospital (?:no|number)|ip (?:no|number)|ward|bed no)\b/i, note: 'possible hospital/ward/record identifier' },
  // "patient" itself is case-flexible, the NAME stays capitalized on purpose
  { re: /[Pp]atient\s+(?:named|called)\s+[A-Z]/, note: 'patient referred to by name' },
  { re: /(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/, note: 'phone-number-like digits' },
  { re: /\b(dob|date of birth)\b/i, note: 'date of birth reference' },
]

const PROMO_WORDS = ['buy now', 'offer', 'discount', 'crypto', 'telegram', 'join our channel']
const ABUSE_WORDS = ['idiot', 'stupid', 'moron', 'dumbass', 'loser', 'shut up', 'pathetic', 'trash human']

/** Deterministic content scan — PHI is a hard violation; spam/abuse is a review flag. */
export function scanContent(text: string): ScanVerdict {
  const reasons: ScanReason[] = []

  for (const p of PHI_PATTERNS) {
    if (p.re.test(text)) reasons.push({ kind: 'phi', note: `Possible patient identifier detected (${p.note}).` })
  }

  const spam: string[] = []
  const urlCount = (text.match(/https?:\/\//g) ?? []).length
  if (urlCount > 3) spam.push(`${urlCount} links in one post`)
  const letters = text.replace(/[^a-zA-Z]/g, '')
  if (letters.length > 60) {
    const caps = letters.replace(/[^A-Z]/g, '').length / letters.length
    if (caps > 0.7) spam.push('shouting (mostly capital letters)')
  }
  const lower = text.toLowerCase()
  for (const w of PROMO_WORDS) if (lower.includes(w)) spam.push(`promo keyword “${w}”`)
  const abuse: string[] = []
  for (const w of ABUSE_WORDS) if (lower.includes(w)) abuse.push(`“${w}”`)

  for (const s of spam) reasons.push({ kind: 'spam', note: `Spam signal: ${s}.` })
  for (const a of abuse) reasons.push({ kind: 'abuse', note: `Unkind language ${a} — critique ideas, not people.` })

  if (reasons.some((r) => r.kind === 'phi')) return { action: 'violation', reasons, flagged: '' }
  if (abuse.length > 0) return { action: 'flag', reasons, flagged: 'abuse' }
  if (spam.length > 0) return { action: 'flag', reasons, flagged: 'spam' }
  return { action: 'allow', reasons: [], flagged: '' }
}

// ── Deterministic similar-thread scan (token-overlap Jaccard — NOT AI) ───────

const SIM_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'why', 'does', 'what', 'how', 'this', 'that', 'from', 'your', 'you',
  'are', 'was', 'but', 'not', 'can', 'out', 'has', 'get', 'one', 'two', 'when', 'who', 'its', 'his',
  'her', 'him', 'they', 'them', 'their', 'have', 'had', 'will', 'would', 'could', 'should', 'into',
  'than', 'then', 'more', 'most', 'some', 'any', 'all', 'about', 'which', 'while', 'there', 'here',
])

export function contentTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !SIM_STOPWORDS.has(t)),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

export interface SimilarHit { id: string; title: string; score: number; resolved: boolean }

/** Deterministic duplicate detection over open posts (min score, top n). */
export function similarPosts(
  source: { title: string; body: string },
  candidates: { id: string; title: string; body: string; resolved: boolean }[],
  min = 0.25,
  top = 5,
): SimilarHit[] {
  const src = contentTokens(`${source.title} ${source.body}`)
  return candidates
    .map((c) => ({ id: c.id, title: c.title, resolved: c.resolved, score: Math.round(jaccard(src, contentTokens(`${c.title} ${c.body}`)) * 100) / 100 }))
    .filter((h) => h.score >= min)
    .sort((x, y) => y.score - x.score || x.title.localeCompare(y.title))
    .slice(0, top)
}

// ── Contribution score (peer learning, not popularity) ───────────────────────

export function badgeForScore(score: number): CommunityBadge {
  if (score >= 100) return 'mentor'
  if (score >= 40) return 'guide'
  if (score >= 12) return 'contributor'
  return 'newcomer'
}

function contributionFromCounts(posts: number, replies: number, answers: number, resolvedThreads: number, upvotes: number): CommunityContribution {
  const score = 5 * answers + 3 * resolvedThreads + 2 * upvotes + posts + replies
  return { score, answers, resolvedThreads, upvotesReceived: upvotes, posts, replies, badge: badgeForScore(score) }
}

/** Measured contribution for the signed-in student (profileId rows). */
export async function youContribution(profileId: string): Promise<CommunityContribution> {
  const [posts, replies, answers, resolvedThreads, postUps, replyUps] = await Promise.all([
    db.communityPost.count({ where: { profileId, status: { not: 'removed' } } }),
    db.communityReply.count({ where: { profileId, status: { not: 'removed' } } }),
    db.communityReply.count({ where: { profileId, isAnswer: true, status: { not: 'removed' } } }),
    db.communityPost.count({ where: { profileId, resolved: true, status: { not: 'removed' } } }),
    db.communityPost.aggregate({ where: { profileId, status: { not: 'removed' } }, _sum: { upvotes: true } }),
    db.communityReply.aggregate({ where: { profileId, status: { not: 'removed' } }, _sum: { upvotes: true } }),
  ])
  return contributionFromCounts(posts, replies, answers, resolvedThreads, (postUps._sum.upvotes ?? 0) + (replyUps._sum.upvotes ?? 0))
}

/** Measured contribution for a seeded demo peer (authorMemberId rows). */
export async function peerContribution(memberId: string): Promise<CommunityContribution> {
  const [posts, replies, answers, resolvedThreads, postUps, replyUps] = await Promise.all([
    db.communityPost.count({ where: { authorMemberId: memberId, status: { not: 'removed' } } }),
    db.communityReply.count({ where: { authorMemberId: memberId, status: { not: 'removed' } } }),
    db.communityReply.count({ where: { authorMemberId: memberId, isAnswer: true, status: { not: 'removed' } } }),
    db.communityPost.count({ where: { authorMemberId: memberId, resolved: true, status: { not: 'removed' } } }),
    db.communityPost.aggregate({ where: { authorMemberId: memberId, status: { not: 'removed' } }, _sum: { upvotes: true } }),
    db.communityReply.aggregate({ where: { authorMemberId: memberId, status: { not: 'removed' } }, _sum: { upvotes: true } }),
  ])
  return contributionFromCounts(posts, replies, answers, resolvedThreads, (postUps._sum.upvotes ?? 0) + (replyUps._sum.upvotes ?? 0))
}

// ── Request context (identity, blocks, votes, labels) ────────────────────────

export interface CommunityCtx {
  profileId: string
  profileName: string
  profileYear: number
  examLabel: string
  members: Map<string, { id: string; handle: string; name: string; year: number; bio: string }>
  muted: Set<string>
  blocked: Set<string>
  votedPosts: Set<string>
  votedReplies: Set<string>
  saved: Set<string>
  spaces: Map<string, { id: string; kind: string; name: string; subjectCode: string }>
  groups: Map<string, { id: string; name: string; privacy: string }>
  topics: Map<string, string> // topicId → topic name (registry)
  youBadge: CommunityBadge
}

export async function buildCommunityCtx(profileId: string): Promise<CommunityCtx> {
  const profile = await db.studentProfile.findUnique({ where: { id: profileId }, select: { name: true, year: true, examLabel: true } })
  const [memberRows, blockRows, postVotes, replyVotes, savedRows, spaceRows, groupRows, contrib, dbTopics] = await Promise.all([
    db.communityMember.findMany(),
    db.memberBlock.findMany({ where: { profileId } }),
    db.communityVote.findMany({ where: { profileId, targetType: 'post' }, select: { targetId: true } }),
    db.communityVote.findMany({ where: { profileId, targetType: 'reply' }, select: { targetId: true } }),
    db.savedDiscussion.findMany({ where: { profileId }, select: { postId: true } }),
    db.communitySpace.findMany(),
    db.studyGroup.findMany(),
    youContribution(profileId),
    // registry topics + DB topics (seed ids live only in the DB) — one small map
    db.topic.findMany({ select: { id: true, name: true } }),
  ])

  const topics = new Map<string, string>()
  for (const t of dbTopics) topics.set(t.id, t.name)
  for (const t of allTopics()) topics.set(t.id, t.name)

  return {
    profileId,
    profileName: profile?.name ?? 'You',
    profileYear: profile?.year ?? 1,
    examLabel: profile?.examLabel ?? '',
    members: new Map(memberRows.map((m) => [m.id, { id: m.id, handle: m.handle, name: m.name, year: m.year, bio: m.bio }])),
    muted: new Set(blockRows.filter((b) => b.kind === 'mute').map((b) => b.memberId)),
    blocked: new Set(blockRows.filter((b) => b.kind === 'block').map((b) => b.memberId)),
    votedPosts: new Set(postVotes.map((v) => v.targetId)),
    votedReplies: new Set(replyVotes.map((v) => v.targetId)),
    saved: new Set(savedRows.map((s) => s.postId)),
    spaces: new Map(spaceRows.map((s) => [s.id, { id: s.id, kind: s.kind, name: s.name, subjectCode: s.subjectCode }])),
    groups: new Map(groupRows.map((g) => [g.id, { id: g.id, name: g.name, privacy: g.privacy }])),
    topics,
    youBadge: contrib.badge,
  }
}

export function youActor(ctx: CommunityCtx): CommunityActor {
  return { kind: 'you', id: ctx.profileId, name: ctx.profileName, handle: 'you', year: ctx.profileYear, badge: ctx.youBadge }
}

export function actorForAuthor(ctx: CommunityCtx, profileId: string, authorMemberId: string): CommunityActor {
  if (profileId && profileId === ctx.profileId) return youActor(ctx)
  const m = authorMemberId ? ctx.members.get(authorMemberId) : undefined
  if (!m) {
    return { kind: 'peer', id: authorMemberId || 'unknown', name: 'Former member', handle: 'removed', year: 0, badge: 'newcomer' }
  }
  const score = peerBadgeCache(ctx, authorMemberId)
  return {
    kind: 'peer', id: m.id, name: m.name, handle: m.handle, year: m.year, badge: score,
    bio: m.bio || undefined,
    muted: ctx.muted.has(m.id) || undefined,
    blocked: ctx.blocked.has(m.id) || undefined,
  }
}

// Peer badge is derived from the SAME contribution formula — memoized per ctx
// so list rendering doesn't recount per row.
const peerBadgeMemo = new WeakMap<CommunityCtx, Map<string, CommunityBadge>>()
function peerBadgeCache(ctx: CommunityCtx, memberId: string): CommunityBadge {
  let memo = peerBadgeMemo.get(ctx)
  if (!memo) { memo = new Map(); peerBadgeMemo.set(ctx, memo) }
  const hit = memo.get(memberId)
  if (hit) return hit
  // synchronous approximation is NOT allowed — badges come from measured rows,
  // so this must have been prefilled by `prefillPeerBadges`
  const pre = memo.get(memberId) ?? 'newcomer'
  return pre
}

/** Pre-compute peer badges (measured) once per request for actor building. */
export async function prefillPeerBadges(ctx: CommunityCtx, memberIds: string[]): Promise<void> {
  let memo = peerBadgeMemo.get(ctx)
  if (!memo) { memo = new Map(); peerBadgeMemo.set(ctx, memo) }
  const unique = [...new Set(memberIds.filter((id) => id && !memo!.has(id)))]
  for (const id of unique) {
    const c = await peerContribution(id)
    memo.set(id, c.badge)
  }
}

/** True when a peer-authored row must be hidden because you blocked them. */
export function authorBlocked(ctx: CommunityCtx, profileId: string, authorMemberId: string): boolean {
  return !profileId && !!authorMemberId && ctx.blocked.has(authorMemberId)
}

// ── Summary builders ─────────────────────────────────────────────────────────

type PostRow = {
  id: string; profileId: string; authorMemberId: string; spaceId: string; groupId: string
  kind: string; title: string; body: string; tags: unknown; subjectCode: string; topicId: string
  questionRef: string; upvotes: number; views: number; replyCount: number; resolved: boolean
  answeredReplyId: string; status: string; flagged: string; createdAt: Date
}

export function postSummary(ctx: CommunityCtx, p: PostRow, lastActivityAt: Date): CommunityPostSummary {
  return {
    id: p.id,
    spaceId: p.spaceId,
    spaceName: ctx.spaces.get(p.spaceId)?.name ?? '',
    groupId: p.groupId,
    groupName: p.groupId ? ctx.groups.get(p.groupId)?.name ?? '' : '',
    kind: p.kind as CommunityPostSummary['kind'],
    title: p.title,
    body: p.body,
    author: actorForAuthor(ctx, p.profileId, p.authorMemberId),
    tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
    subjectCode: p.subjectCode,
    topicId: p.topicId,
    topicName: p.topicId ? ctx.topics.get(p.topicId) ?? '' : '',
    questionRef: p.questionRef,
    upvotes: p.upvotes,
    replies: p.replyCount,
    views: p.views,
    resolved: p.resolved,
    answered: p.answeredReplyId !== '',
    status: p.status as CommunityPostSummary['status'],
    flagged: p.flagged,
    createdAt: p.createdAt.toISOString(),
    lastActivityAt: lastActivityAt.toISOString(),
    votedByYou: ctx.votedPosts.has(p.id),
    savedByYou: ctx.saved.has(p.id),
    mine: p.profileId === ctx.profileId,
  }
}

type ReplyRow = {
  id: string; postId: string; profileId: string; authorMemberId: string; body: string
  upvotes: number; isAnswer: boolean; aiAssisted: boolean; status: string; createdAt: Date
}

export function replySummary(ctx: CommunityCtx, r: ReplyRow): CommunityReplySummary {
  return {
    id: r.id,
    postId: r.postId,
    author: actorForAuthor(ctx, r.profileId, r.authorMemberId),
    body: r.body,
    upvotes: r.upvotes,
    isAnswer: r.isAnswer,
    aiAssisted: r.aiAssisted,
    status: r.status as CommunityReplySummary['status'],
    createdAt: r.createdAt.toISOString(),
    votedByYou: ctx.votedReplies.has(r.id),
    mine: r.profileId === ctx.profileId,
  }
}

/** lastActivityAt = post createdAt bumped by the latest open reply (measured). */
export async function lastActivityMap(postIds: string[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>()
  if (postIds.length === 0) return map
  const groups = await db.communityReply.groupBy({
    by: ['postId'],
    _max: { createdAt: true },
    where: { postId: { in: postIds }, status: { not: 'removed' } },
  })
  for (const g of groups) if (g._max.createdAt) map.set(g.postId, g._max.createdAt)
  return map
}

/** Posts a list builder may show: open, or review when you authored it. */
function visibleStatusWhere(profileId: string) {
  return { OR: [{ status: 'open' }, { status: 'review', profileId }] }
}

// ── Spaces (measured counts + optional personalisation) ──────────────────────

export async function spaceSummaries(profileId: string): Promise<CommunitySpaceSummary[]> {
  const [spaces, postGroups, allOpenPosts, groupRows] = await Promise.all([
    db.communitySpace.findMany({ orderBy: { createdAt: 'asc' } }),
    db.communityPost.groupBy({ by: ['spaceId'], _count: { _all: true }, where: { groupId: '', status: 'open' } }),
    db.communityPost.findMany({
      where: { groupId: '', status: 'open' },
      select: { id: true, spaceId: true, kind: true, resolved: true, createdAt: true },
    }),
    db.studyGroup.findMany({ where: { status: 'open', focusKind: 'subject' }, select: { focusRef: true } }),
  ])

  // CommunityReply is a standalone table (no relation to CommunityPost) —
  // join replies to their space through the open-post id list here.
  const openIds = allOpenPosts.map((p) => p.id)
  const replyRows = openIds.length
    ? await db.communityReply.findMany({
        where: { status: 'open', postId: { in: openIds } },
        select: { postId: true, createdAt: true },
      })
    : []
  const spaceOfPost = new Map(allOpenPosts.map((p) => [p.id, p.spaceId]))

  const postCount = new Map(postGroups.map((g) => [g.spaceId, g._count._all]))
  const todayStart = dayKeyStart(todayKey())

  const repliesBySpace = new Map<string, number>()
  const todayReplies = new Map<string, number>()
  for (const r of replyRows) {
    const sid = spaceOfPost.get(r.postId)
    if (!sid) continue
    repliesBySpace.set(sid, (repliesBySpace.get(sid) ?? 0) + 1)
    if (r.createdAt >= todayStart) todayReplies.set(sid, (todayReplies.get(sid) ?? 0) + 1)
  }

  const unresolvedBySpace = new Map<string, number>()
  const todayPosts = new Map<string, number>()
  for (const p of allOpenPosts) {
    if (p.kind === 'question' && !p.resolved) unresolvedBySpace.set(p.spaceId, (unresolvedBySpace.get(p.spaceId) ?? 0) + 1)
    if (p.createdAt >= todayStart) todayPosts.set(p.spaceId, (todayPosts.get(p.spaceId) ?? 0) + 1)
  }

  const groupsByRef = new Map<string, number>()
  for (const g of groupRows) groupsByRef.set(g.focusRef, (groupsByRef.get(g.focusRef) ?? 0) + 1)

  return spaces.map((s) => ({
    id: s.id,
    kind: s.kind as CommunitySpaceSummary['kind'],
    name: s.name,
    description: s.description,
    subjectCode: s.subjectCode,
    topicId: '', // spaces map to subjects, not single topics
    posts: postCount.get(s.id) ?? 0,
    replies: repliesBySpace.get(s.id) ?? 0,
    unresolved: unresolvedBySpace.get(s.id) ?? 0,
    activeToday: (todayPosts.get(s.id) ?? 0) + (todayReplies.get(s.id) ?? 0),
    groupCount: s.subjectCode ? groupsByRef.get(s.subjectCode) ?? 0 : 0,
    reasonTag: null,
  }))
}

// ── Learning signals (measured — mirror resource-hub personalisation) ────────

export interface LearningSignals {
  weakSubjects: { subjectId: string; code: string; name: string; avgScore: number }[]
  recentTopicIds: string[]
  examLabel: string
}

export async function loadLearningSignals(profileId: string): Promise<LearningSignals> {
  const [weakStates, recentProgress] = await Promise.all([
    db.knowledgeState.findMany({
      where: { profileId, score: { lt: 60 } },
      select: { score: true, concept: { select: { topicId: true } } },
      take: 200,
      orderBy: { score: 'asc' },
    }),
    db.learnProgress.findMany({
      where: { profileId, kind: 'topic' },
      orderBy: { updatedAt: 'desc' },
      take: 3,
      select: { entityId: true },
    }),
  ])

  // weak concepts → subject-level average (Concept → topic → subject)
  const acc = new Map<string, { sum: number; n: number }>()
  for (const s of weakStates) {
    const subject = subjectOfTopic(s.concept.topicId)
    if (!subject) continue
    const cur = acc.get(subject.id) ?? { sum: 0, n: 0 }
    cur.sum += s.score; cur.n += 1
    acc.set(subject.id, cur)
  }
  const weakSubjects = [...acc.entries()]
    .map(([subjectId, v]) => ({
      subjectId,
      code: subjectOfTopicCode(subjectId),
      name: subjectOfTopicName(subjectId),
      avgScore: Math.round((v.sum / v.n) * 10) / 10,
    }))
    .sort((a, b) => a.avgScore - b.avgScore)

  const profile = await db.studentProfile.findUnique({ where: { id: profileId }, select: { examLabel: true } })
  return {
    weakSubjects,
    recentTopicIds: recentProgress.map((r) => r.entityId).filter((id) => typeof id === 'string' && id),
    examLabel: profile?.examLabel ?? '',
  }
}

function subjectOfTopicCode(subjectId: string): string {
  return subjectOfTopic(subjectId)?.code ?? ''
}
function subjectOfTopicName(subjectId: string): string {
  return subjectOfTopic(subjectId)?.name ?? subjectId
}

/** Attach measured reasonTags to personalized spaces (only those get a tag). */
export function personalizeSpaces(
  signals: LearningSignals, spaces: CommunitySpaceSummary[],
): CommunitySpaceSummary[] {
  const personalizedIds = new Set<string>()

  for (const w of signals.weakSubjects) {
    const s = spaces.find((x) => x.kind === 'subject' && x.subjectCode === w.code)
    if (s) {
      s.reasonTag = `Your ${w.name} mastery is ${w.avgScore} — revise with peers`
      personalizedIds.add(s.id)
    }
  }
  for (const tid of signals.recentTopicIds) {
    const subject = subjectOfTopic(tid)
    if (!subject) continue
    const s = spaces.find((x) => x.kind === 'subject' && x.subjectCode === subject.code)
    if (s && !personalizedIds.has(s.id)) {
      const topic = allTopics().find((t) => t.id === tid)
      s.reasonTag = `Matches your recent topic ${topic?.name ?? tid}`
      personalizedIds.add(s.id)
    }
  }
  if (signals.examLabel) {
    const examSpace = spaces.find((x) => x.id === (signals.examLabel.toUpperCase().includes('FMGE') ? 'c-space-fmge' : 'c-space-neetpg'))
    if (examSpace && !personalizedIds.has(examSpace.id)) {
      examSpace.reasonTag = `Your ${signals.examLabel} target space`
      personalizedIds.add(examSpace.id)
    }
  }
  return spaces
}

/** forYou block — ≤2 spaces + ≤2 groups from measured signals; null when none. */
function buildForYou(
  ctx: CommunityCtx, signals: LearningSignals,
  spaces: CommunitySpaceSummary[],
  groupRows: (GroupRowLike & { memberCount?: number; challengeCount?: number; activeToday?: number })[],
): CommunityHomePayload['forYou'] {
  const pickedSpaces: CommunitySpaceSummary[] = []
  const pickedGroups: CommunityGroupSummary[] = []

  const pushSpace = (s: CommunitySpaceSummary | undefined) => {
    if (s && !pickedSpaces.some((p) => p.id === s.id) && pickedSpaces.length < 2) pickedSpaces.push(s)
  }
  const pushGroup = (g: (typeof groupRows)[number] | undefined) => {
    if (g && !pickedGroups.some((p) => p.id === g.id) && pickedGroups.length < 2) {
      pickedGroups.push(groupSummaryFromRow(ctx, g, { youMember: false, youOwner: false }))
    }
  }

  // weak subjects → their subject space + focused public groups
  for (const w of signals.weakSubjects) {
    pushSpace(spaces.find((x) => x.kind === 'subject' && x.subjectCode === w.code))
    pushGroup(groupRows.find((g) => g.privacy === 'public' && g.focusKind === 'subject' && g.focusRef === w.code))
  }
  // recent topics → subject space + topic-focused groups
  for (const tid of signals.recentTopicIds) {
    const subject = subjectOfTopic(tid)
    if (subject) pushSpace(spaces.find((x) => x.kind === 'subject' && x.subjectCode === subject.code))
    pushGroup(groupRows.find((g) => g.privacy === 'public' && g.focusKind === 'topic' && g.focusRef === tid))
  }
  // exam label → exam hub space + exam groups
  if (signals.examLabel) {
    const examId = signals.examLabel.toUpperCase().includes('FMGE') ? 'c-space-fmge' : 'c-space-neetpg'
    pushSpace(spaces.find((x) => x.id === examId))
    pushGroup(groupRows.find((g) => g.privacy === 'public' && g.focusKind === 'exam' && g.focusRef.toUpperCase() === signals.examLabel.toUpperCase()))
  }
  // top up with public groups focused on any weak subject code
  if (pickedGroups.length < 2) {
    for (const w of signals.weakSubjects) {
      if (pickedGroups.length >= 2) break
      pushGroup(groupRows.find((g) => g.privacy === 'public' && g.focusKind === 'subject' && g.focusRef === w.code))
    }
  }

  if (pickedSpaces.length === 0 && pickedGroups.length === 0) return null

  const bits: string[] = []
  if (signals.weakSubjects.length) bits.push(`${signals.weakSubjects.length} weak subject${signals.weakSubjects.length > 1 ? 's' : ''}`)
  if (signals.recentTopicIds.length) bits.push('recent topics')
  if (signals.examLabel) bits.push(`your ${signals.examLabel} target`)
  return {
    spaces: pickedSpaces,
    groups: pickedGroups,
    note: `From measured signals: ${bits.join(', ')}.`,
  }
}

// ── Group summaries ──────────────────────────────────────────────────────────

function focusLabelFor(focusKind: string, focusRef: string): string {
  if (!focusRef) return 'Mixed focus'
  if (focusKind === 'subject') return subjectNameByCode(focusRef) ?? focusRef
  if (focusKind === 'topic') {
    const t = allTopics().find((x) => x.id === focusRef)
    return t?.name ?? focusRef
  }
  return focusRef // exam / mixed carry their own label
}

const subjectNameCache = new Map<string, string>()
function subjectNameByCode(code: string): string | null {
  if (subjectNameCache.has(code)) return subjectNameCache.get(code)!
  // registry subjects carry code + name; resolve via a topic's subject chain
  for (const t of allTopics()) {
    const s = subjectOfTopic(t.id)
    if (s && s.code === code) { subjectNameCache.set(code, s.name); return s.name }
  }
  subjectNameCache.set(code, '')
  return null
}

interface GroupRowLike {
  id: string; name: string; slug: string; description: string; privacy: string
  focusKind: string; focusRef: string; goalText: string; meetCadence: string
  ownerProfileId: string; ownerMemberId: string; seeded: boolean; createdAt: Date
}

function groupSummaryFromRow(
  ctx: CommunityCtx, g: GroupRowLike,
  opts: { youMember: boolean; youOwner: boolean },
  extra?: { memberCount?: number; challengeCount?: number; activeToday?: number },
): CommunityGroupSummary {
  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    description: g.description,
    privacy: g.privacy as CommunityGroupSummary['privacy'],
    focusKind: g.focusKind,
    focusRef: g.focusRef,
    focusLabel: focusLabelFor(g.focusKind, g.focusRef),
    goalText: g.goalText,
    meetCadence: g.meetCadence,
    members: extra?.memberCount ?? 0,
    youMember: opts.youMember,
    youOwner: opts.youOwner,
    challengeCount: extra?.challengeCount ?? 0,
    activeToday: extra?.activeToday ?? 0,
    seeded: g.seeded,
    createdAt: g.createdAt.toISOString(),
  }
}

async function groupActivityToday(groupId: string, todayStart: Date): Promise<number> {
  const [posts, group] = await Promise.all([
    db.communityPost.count({ where: { groupId, status: { not: 'removed' }, createdAt: { gte: todayStart } } }),
    db.studyGroup.findUnique({ where: { id: groupId }, select: { plan: true } }),
  ])
  let planToday = 0
  if (group && Array.isArray(group.plan)) {
    for (const line of group.plan as { at?: string }[]) {
      if (typeof line.at === 'string' && new Date(line.at) >= todayStart) planToday += 1
    }
  }
  return posts + planToday
}

async function groupSummaries(profileId: string, ctx: CommunityCtx, rows: GroupRowLike[]): Promise<CommunityGroupSummary[]> {
  const ids = rows.map((r) => r.id)
  const [memberCounts, challengeCounts, myMemberships] = await Promise.all([
    db.groupMembership.groupBy({ by: ['groupId'], _count: { _all: true }, where: { groupId: { in: ids } } }),
    db.groupChallenge.groupBy({ by: ['groupId'], _count: { _all: true }, where: { groupId: { in: ids }, status: { not: 'archived' } } }),
    db.groupMembership.findMany({ where: { profileId, actorKey: 'you', groupId: { in: ids } }, select: { groupId: true } }),
  ])
  const memberMap = new Map(memberCounts.map((m) => [m.groupId, m._count._all]))
  const challengeMap = new Map(challengeCounts.map((c) => [c.groupId, c._count._all]))
  const mine = new Set(myMemberships.map((m) => m.groupId))
  const todayStart = dayKeyStart(todayKey())

  return Promise.all(rows.map(async (g) => groupSummaryFromRow(
    ctx, g,
    { youMember: mine.has(g.id), youOwner: g.ownerProfileId === profileId },
    {
      memberCount: memberMap.get(g.id) ?? 0,
      challengeCount: challengeMap.get(g.id) ?? 0,
      activeToday: await groupActivityToday(g.id, todayStart),
    },
  )))
}

// ── Accountability snapshot (MEASURED — never self-reported) ─────────────────

export async function buildAccountabilitySnapshot(profileId: string): Promise<{ snapshot: AccountabilitySnapshot; log: ActivityLog }> {
  const since = new Date(Date.now() - 95 * DAY)
  const log = await loadActivity(profileId, since)

  const tKey = todayKey()
  const today = dayActivityOf(log, tKey)
  const weekStart = dayKeyOffset(tKey, -6)
  const week = sumDays(log, weekStart)

  // streaks: current via the shared engine helper (union of activity dates);
  // longest = longest consecutive active run over the last 90 days
  const allDates = [
    ...log.entries.mcqs, ...log.entries.study.map((s) => s.at), ...log.entries.revision,
    ...log.entries.mocks, ...log.entries.cases, ...log.entries.flashcards,
  ]
  const current = computeStreak(allDates)
  const activeKeys = [...log.days.entries()].filter(([, d]) => isDayActive(d)).map(([k]) => k)
    .filter((k) => k >= dayKeyOffset(tKey, -89)).sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const k of activeKeys) {
    run = prev && dayKeyOffset(prev, 1) === k ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = k
  }

  // goals — progress measured per window
  const goalRows = await db.accountabilityGoal.findMany({ where: { profileId }, orderBy: { createdAt: 'asc' } })
  const mondayKey = currentIstMondayKey()
  const goals: CommunityGoalView[] = goalRows.map((g) => {
    let progress = 0
    if (g.scope === 'daily') progress = metricForUnit(today, g.unit)
    else if (g.scope === 'weekly') progress = metricForUnit(sumDays(log, mondayKey), g.unit)
    else progress = metricForUnit(sumSince(log, g.createdAt), g.unit) // commitment → cumulative since createdAt
    return {
      id: g.id,
      scope: g.scope as CommunityGoalView['scope'],
      kind: g.kind,
      title: g.title,
      target: g.target,
      unit: g.unit,
      progress,
      done: g.active && progress >= g.target,
      dueAt: g.dueAt ? g.dueAt.toISOString() : null,
      active: g.active,
      createdAt: g.createdAt.toISOString(),
    }
  })

  // planned-vs-completed from the planner (dayKey strings, IST convention)
  const weekKeys: string[] = []
  for (let i = 0; i < 7; i++) weekKeys.push(dayKeyOffset(mondayKey, i))
  const [plannedToday, completedToday, plannedWeek, completedWeek] = await Promise.all([
    db.plannerTask.count({ where: { profileId, dayKey: tKey } }),
    db.plannerTask.count({ where: { profileId, dayKey: tKey, status: 'done' } }),
    db.plannerTask.count({ where: { profileId, dayKey: { in: weekKeys } } }),
    db.plannerTask.count({ where: { profileId, dayKey: { in: weekKeys }, status: 'done' } }),
  ])

  // challenges of groups you belong to — your line measured since challenge start
  const myMemberships = await db.groupMembership.findMany({ where: { profileId, actorKey: 'you' }, select: { groupId: true } })
  const myGroupIds = myMemberships.map((m) => m.groupId)
  const challengeRows = myGroupIds.length
    ? await db.groupChallenge.findMany({ where: { groupId: { in: myGroupIds }, status: { not: 'archived' } }, orderBy: { createdAt: 'desc' } })
    : []
  const groupRows = myGroupIds.length ? await db.studyGroup.findMany({ where: { id: { in: myGroupIds } } }) : []
  const groupName = new Map(groupRows.map((g) => [g.id, g.name]))
  const challenges: CommunityChallengeView[] = challengeRows.map((c) => {
    const unit = unitForChallengeKind(c.kind)
    const sinceCount = sumSince(log, c.createdAt)
    const peerCounts = Array.isArray(c.progress)
      ? (c.progress as { label?: string; count?: number }[]).map((p) => ({ label: typeof p.label === 'string' ? p.label : 'Peer', count: typeof p.count === 'number' ? p.count : 0 }))
      : []
    return {
      id: c.id,
      groupId: c.groupId,
      groupName: groupName.get(c.groupId) ?? '',
      kind: c.kind as CommunityChallengeView['kind'],
      title: c.title,
      detail: c.detail,
      target: c.target,
      unit,
      dueAt: c.dueAt ? c.dueAt.toISOString() : null,
      status: c.status as CommunityChallengeView['status'],
      youJoined: true,
      youCount: metricForUnit(sinceCount, unit), // raw measured count — UI may cap for display
      peerCounts,
      seeded: c.seeded,
    }
  })

  const todayActive = isDayActive(today)
  let healthNote: string
  if (todayActive) healthNote = 'Activity logged today — these numbers are measured from your real study log.'
  else if (current >= 3) healthNote = `${current}-day measured study rhythm going.`
  else if (allDates.length > 0) healthNote = 'No activity today — your numbers update only from real study sessions.'
  else healthNote = 'No study activity recorded yet — this page measures, never guesses.'

  const snapshot: AccountabilitySnapshot = {
    streak: { current, longest, todayActive },
    today: {
      mcqs: today.mcqs, studyMinutes: today.studyMinutes, revisionSessions: today.revisionSessions,
      mocks: today.mocks, cases: today.cases, active: todayActive,
    },
    week: {
      mcqs: week.mcqs, studyMinutes: week.studyMinutes, revisionSessions: week.revisionSessions,
      mocks: week.mocks, cases: week.cases, daysActive: activeKeys.filter((k) => k > weekStart).length,
    },
    goals,
    plannedVsCompleted: {
      today: { planned: plannedToday, completed: completedToday },
      week: { planned: plannedWeek, completed: completedWeek },
    },
    challenges,
    healthNote,
  }
  return { snapshot, log }
}

// ── HOME payload ─────────────────────────────────────────────────────────────

export async function communityHome(profileId: string): Promise<CommunityHomePayload> {
  const ctx = await buildCommunityCtx(profileId)
  const [{ snapshot }, spacesRaw, stats, contrib] = await Promise.all([
    buildAccountabilitySnapshot(profileId),
    spaceSummaries(profileId),
    Promise.all([
      db.communitySpace.count(),
      db.communityPost.count({ where: { status: { not: 'removed' } } }),
      db.communityReply.count({ where: { status: 'open' } }),
      db.communityPost.count({ where: { status: 'open', resolved: true } }),
      db.communityPost.count({ where: { status: 'open', kind: 'question', resolved: false } }),
      db.studyGroup.count({ where: { status: 'open' } }),
    ]),
    youContribution(profileId),
  ])

  const [openPosts, groupRows, myMemberships, settings, blockRows] = await Promise.all([
    db.communityPost.findMany({ where: { status: 'open', groupId: '' }, orderBy: { createdAt: 'desc' } }),
    db.studyGroup.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'desc' } }),
    db.groupMembership.findMany({ where: { profileId, actorKey: 'you' }, select: { groupId: true } }),
    db.communitySettings.findUnique({ where: { profileId } }),
    db.memberBlock.findMany({ where: { profileId } }),
  ])

  // peer badges for featured posts + block-filtered lists
  const visible = openPosts.filter((p) => !authorBlocked(ctx, p.profileId, p.authorMemberId))
  await prefillPeerBadges(ctx, visible.map((p) => p.authorMemberId))
  const lActivity = await lastActivityMap(visible.map((p) => p.id))
  const summaries = visible.map((p) => postSummary(ctx, p, lActivity.get(p.id) ?? p.createdAt))

  const unresolvedSorted = [...summaries].filter((p) => p.kind === 'question' && !p.resolved)
    .sort((a, b) => b.upvotes - a.upvotes || b.lastActivityAt.localeCompare(a.lastActivityAt))
  const activeSorted = [...summaries].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))

  const signals = await loadLearningSignals(profileId)
  const spaces = personalizeSpaces(signals, spacesRaw)

  const myGroupIds = new Set(myMemberships.map((m) => m.groupId))
  const allGroupSummaries = await groupSummaries(profileId, ctx, groupRows)
  const myGroups = allGroupSummaries.filter((g) => myGroupIds.has(g.id))
  // forYou groups carry MEASURED chips (members/challenges/active-today) — the
  // measured summaries computed for myGroups are reused, never zeros.
  const measuredById = new Map(allGroupSummaries.map((s) => [s.id, s]))
  const forYou = buildForYou(ctx, signals, spaces, groupRows.filter((g) => g.privacy === 'public').map((g) => ({
    ...g,
    memberCount: measuredById.get(g.id)?.members ?? 0,
    challengeCount: measuredById.get(g.id)?.challengeCount ?? 0,
    activeToday: measuredById.get(g.id)?.activeToday ?? 0,
  })))

  return {
    stats: {
      spaces: stats[0]!,
      posts: stats[1]!,
      replies: stats[2]!,
      resolved: stats[3]!,
      unresolved: stats[4]!,
      groups: stats[5]!,
      you: contrib,
    },
    accountability: snapshot,
    featured: { unresolved: unresolvedSorted.slice(0, 4), active: activeSorted.slice(0, 4) },
    spaces,
    forYou,
    myGroups,
    guidelinesAccepted: settings?.guidelinesAccepted ?? false,
    demoNotice: DEMO_NOTICE,
    blocks: {
      muted: blockRows.filter((b) => b.kind === 'mute').length,
      blocked: blockRows.filter((b) => b.kind === 'block').length,
    },
  }
}

// ── Space detail ─────────────────────────────────────────────────────────────

const SPACE_FILTERS = new Set(['open', 'resolved', 'question', 'pyq', 'mcq', 'case', 'discussion'])

export async function spaceDetail(profileId: string, spaceId: string, filter: string, sort: string) {
  const space = await db.communitySpace.findUnique({ where: { id: spaceId } })
  if (!space) return null
  const ctx = await buildCommunityCtx(profileId)

  const rows = await db.communityPost.findMany({
    where: { spaceId, groupId: '', ...visibleStatusWhere(profileId) },
    orderBy: { createdAt: 'desc' },
  })
  const visible = rows.filter((p) => !authorBlocked(ctx, p.profileId, p.authorMemberId))
  await prefillPeerBadges(ctx, visible.map((p) => p.authorMemberId))
  const lActivity = await lastActivityMap(visible.map((p) => p.id))

  let posts = visible.map((p) => postSummary(ctx, p, lActivity.get(p.id) ?? p.createdAt))
  if (SPACE_FILTERS.has(filter)) {
    posts = posts.filter((p) => {
      if (filter === 'open') return !p.resolved
      if (filter === 'resolved') return p.resolved
      return p.kind === filter
    })
  }

  // pinned unresolved-first, then the chosen sort within each band
  const bySort = (a: CommunityPostSummary, b: CommunityPostSummary) =>
    sort === 'top'
      ? b.upvotes - a.upvotes || b.lastActivityAt.localeCompare(a.lastActivityAt)
      : b.lastActivityAt.localeCompare(a.lastActivityAt)
  const unresolvedBand = posts.filter((p) => p.kind === 'question' && !p.resolved).sort(bySort)
  const restBand = posts.filter((p) => !(p.kind === 'question' && !p.resolved)).sort(bySort)

  const rules = Array.isArray(space.rules) && (space.rules as string[]).length > 0
    ? (space.rules as string[])
    : GLOBAL_COMMUNITY_GUIDELINES

  const summaries = await spaceSummaries(profileId)
  const summary = summaries.find((s) => s.id === spaceId)!
  return { space: summary, rules, posts: [...unresolvedBand, ...restBand] }
}

// ── Post feeds + creation ────────────────────────────────────────────────────

export async function listPosts(
  profileId: string, feed: string, q: string, topicId: string, spaceId = '',
): Promise<{ posts: CommunityPostSummary[]; feed: string }> {
  const ctx = await buildCommunityCtx(profileId)
  let rows: Awaited<ReturnType<typeof db.communityPost.findMany>>

  if (feed === 'mine') {
    rows = await db.communityPost.findMany({ where: { profileId, status: { not: 'removed' } }, orderBy: { createdAt: 'desc' } })
  } else if (feed === 'saved') {
    const saved = await db.savedDiscussion.findMany({ where: { profileId }, select: { postId: true } })
    rows = saved.length
      ? await db.communityPost.findMany({ where: { id: { in: saved.map((s) => s.postId) }, status: 'open' }, orderBy: { createdAt: 'desc' } })
      : []
  } else if (feed === 'unresolved') {
    rows = await db.communityPost.findMany({ where: { status: 'open', groupId: '', kind: 'question', resolved: false }, orderBy: { createdAt: 'desc' } })
  } else if (feed === 'topic' && topicId) {
    rows = await db.communityPost.findMany({ where: { status: 'open', groupId: '', topicId }, orderBy: { createdAt: 'desc' } })
  } else {
    feed = 'recent'
    rows = await db.communityPost.findMany({ where: { status: 'open', groupId: '' }, orderBy: { createdAt: 'desc' } })
  }

  let visible = rows.filter((p) => !authorBlocked(ctx, p.profileId, p.authorMemberId))
  if (spaceId) visible = visible.filter((p) => p.spaceId === spaceId)
  if (feed !== 'mine') visible = visible.filter((p) => p.status === 'open')
  if (q) {
    const needle = q.toLowerCase()
    visible = visible.filter((p) =>
      p.title.toLowerCase().includes(needle) || p.body.toLowerCase().includes(needle) ||
      (Array.isArray(p.tags) && (p.tags as string[]).some((t) => t.toLowerCase().includes(needle))),
    )
  }
  await prefillPeerBadges(ctx, visible.map((p) => p.authorMemberId))
  const lActivity = await lastActivityMap(visible.map((p) => p.id))
  return {
    posts: visible.map((p) => postSummary(ctx, p, lActivity.get(p.id) ?? p.createdAt)),
    feed,
  }
}

export const POST_KINDS = new Set(['question', 'discussion', 'pyq', 'mcq', 'case'])

export interface CreatePostInput {
  spaceId?: string; groupId?: string; kind: string; title: string; body: string
  tags?: string[]; subjectCode?: string; topicId?: string; questionRef?: string
}

export interface CreateResult {
  ok: boolean
  status: number
  post: CommunityPostSummary | null
  blocked: boolean
  reasons: ScanReason[]
  guidance: string | null
  error?: string
}

export async function createPost(profileId: string, input: CreatePostInput): Promise<CreateResult> {
  // moderation scan FIRST — violations never touch the database
  const verdict = scanContent(`${input.title}\n${input.body}`)
  if (verdict.action === 'violation') {
    return { ok: false, status: 400, post: null, blocked: true, reasons: verdict.reasons, guidance: PHI_GUIDANCE }
  }

  const profile = await db.studentProfile.findUnique({ where: { id: profileId }, select: { name: true, year: true, examLabel: true } })
  let groupId = ''
  let spaceId = input.spaceId ?? ''

  if (input.groupId) {
    const group = await db.studyGroup.findUnique({ where: { id: input.groupId } })
    if (!group || group.status !== 'open') return { ok: false, status: 400, post: null, blocked: false, reasons: [], guidance: null, error: 'Study group not found' }
    const membership = await db.groupMembership.findFirst({ where: { groupId: group.id, actorKey: 'you', profileId } })
    if (!membership) return { ok: false, status: 403, post: null, blocked: false, reasons: [], guidance: null, error: 'Join the group before posting in it' }
    groupId = group.id
  } else {
    if (!spaceId) return { ok: false, status: 400, post: null, blocked: false, reasons: [], guidance: null, error: 'spaceId is required' }
    const space = await db.communitySpace.findUnique({ where: { id: spaceId } })
    if (!space) return { ok: false, status: 400, post: null, blocked: false, reasons: [], guidance: null, error: 'Space not found' }
  }

  // subject derivation: explicit → topic registry → space
  let subjectCode = input.subjectCode ?? ''
  const topicId = input.topicId ?? ''
  if (!subjectCode && topicId) {
    const subject = subjectOfTopic(topicId)
    if (subject) subjectCode = subject.code
  }
  if (!subjectCode && !groupId) {
    const space = await db.communitySpace.findUnique({ where: { id: spaceId }, select: { subjectCode: true } })
    if (space) subjectCode = space.subjectCode
  }

  const created = await db.communityPost.create({
    data: {
      profileId,
      authorMemberId: '',
      spaceId: groupId && !spaceId ? '' : spaceId,
      groupId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      tags: (input.tags ?? []).slice(0, 8).map((t) => String(t).slice(0, 40)),
      subjectCode,
      topicId,
      questionRef: input.questionRef ?? '',
      status: verdict.action === 'flag' ? 'review' : 'open',
      flagged: verdict.flagged,
    },
  })

  const ctx = await buildCommunityCtx(profileId)
  return {
    ok: true, status: 201, blocked: false,
    post: postSummary(ctx, created, created.createdAt),
    reasons: verdict.reasons,
    guidance: verdict.action === 'flag' ? REVIEW_GUIDANCE : null,
  }
}

// ── Thread payload ───────────────────────────────────────────────────────────

/** MEASURED question-pool count via topicId OR conceptId→Concept.topicId join
 *  (Question.topicId is mostly NULL — the concept join is the honest path). */
export async function measuredMcqPool(topicId: string, subjectCode: string): Promise<{ count: number; subjectCode: string; topicId: string; topicName: string } | null> {
  if (topicId) {
    const topic = await db.topic.findUnique({ where: { id: topicId }, select: { id: true, name: true, subjectId: true } })
    if (!topic) return null
    const concepts = await db.concept.findMany({ where: { topicId }, select: { id: true } })
    const conceptIds = concepts.map((c) => c.id)
    const [byTopic, byConcept] = await Promise.all([
      db.question.count({ where: { topicId } }),
      conceptIds.length ? db.question.count({ where: { conceptId: { in: conceptIds } } }) : Promise.resolve(0),
    ])
    const subject = await db.subject.findUnique({ where: { id: topic.subjectId }, select: { code: true } })
    // dedupe: a question can carry both topicId and conceptId
    const overlap = byTopic > 0 && byConcept > 0
      ? await db.question.count({ where: { OR: [{ topicId }, { AND: [{ conceptId: { in: conceptIds } }, { topicId: null }] }] } })
      : byTopic + byConcept
    return { count: overlap, subjectCode: subject?.code ?? '', topicId, topicName: topic.name }
  }
  if (subjectCode) {
    const count = await db.question.count({ where: { subjectCode } })
    if (count === 0) return null
    return { count, subjectCode, topicId: '', topicName: '' }
  }
  return null
}

export async function threadPayload(profileId: string, postId: string): Promise<CommunityThreadPayload | null | 'blocked' | 'removed'> {
  const post = await db.communityPost.findUnique({ where: { id: postId } })
  if (!post) return null
  if (post.status === 'removed') return 'removed'
  const ctx = await buildCommunityCtx(profileId)
  if (authorBlocked(ctx, post.profileId, post.authorMemberId)) return 'blocked'

  // honest measured view counter — one GET is one view
  await db.communityPost.update({ where: { id: postId }, data: { views: { increment: 1 } } })

  const [replyRows, lActivity, otherOpen] = await Promise.all([
    db.communityReply.findMany({ where: { postId, ...visibleStatusWhere(profileId) } }),
    lastActivityMap([postId]),
    db.communityPost.findMany({
      where: { status: 'open', id: { not: postId } },
      select: { id: true, title: true, body: true, resolved: true, profileId: true, authorMemberId: true },
    }),
  ])
  await prefillPeerBadges(ctx, [post.authorMemberId, ...replyRows.map((r) => r.authorMemberId)])

  const replies = replyRows
    .filter((r) => !authorBlocked(ctx, r.profileId, r.authorMemberId))
    .sort((a, b) =>
      Number(b.isAnswer) - Number(a.isAnswer) || b.upvotes - a.upvotes || a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .map((r) => replySummary(ctx, r))

  const similar = similarPosts(
    { title: post.title, body: post.body },
    otherOpen.filter((p) => !authorBlocked(ctx, p.profileId, p.authorMemberId)).map((p) => ({ id: p.id, title: p.title, body: p.body, resolved: p.resolved })),
  )

  const relatedMcqs = await measuredMcqPool(post.topicId, post.subjectCode)

  return {
    post: postSummary(ctx, post, lActivity.get(postId) ?? post.createdAt),
    replies,
    similar,
    relatedMcqs,
    youCanResolve: post.profileId === profileId,
  }
}

// ── Replies + resolve ────────────────────────────────────────────────────────

export interface ReplyResult {
  ok: boolean; status: number
  reply: CommunityReplySummary | null
  blocked?: boolean; reasons?: ScanReason[]; guidance?: string | null; error?: string
}

export async function createReply(profileId: string, postId: string, body: string, aiAssisted: boolean): Promise<ReplyResult> {
  const post = await db.communityPost.findUnique({ where: { id: postId } })
  if (!post) return { ok: false, status: 404, reply: null, error: 'Post not found' }
  if (post.status !== 'open') return { ok: false, status: 400, reply: null, error: 'This post is not open for replies' }

  const verdict = scanContent(body)
  if (verdict.action === 'violation') {
    return { ok: false, status: 400, reply: null, blocked: true, reasons: verdict.reasons, guidance: PHI_GUIDANCE }
  }

  const created = await db.communityReply.create({
    data: {
      postId,
      profileId,
      authorMemberId: '',
      body,
      aiAssisted,
      status: verdict.action === 'flag' ? 'review' : 'open',
    },
  })
  // replyCount sync (open replies only — review ones stay out until cleared)
  const openCount = await db.communityReply.count({ where: { postId, status: 'open' } })
  await db.communityPost.update({ where: { id: postId }, data: { replyCount: openCount } })

  const ctx = await buildCommunityCtx(profileId)
  return { ok: true, status: 201, reply: replySummary(ctx, created) }
}

export async function resolvePost(profileId: string, postId: string, replyId?: string) {
  const post = await db.communityPost.findUnique({ where: { id: postId } })
  if (!post) return { ok: false, status: 404, error: 'Post not found' }
  if (post.profileId !== profileId) return { ok: false, status: 403, error: 'Only the post author can mark an answer' }

  if (replyId) {
    const reply = await db.communityReply.findUnique({ where: { id: replyId } })
    if (!reply || reply.postId !== postId) return { ok: false, status: 400, error: 'Reply does not belong to this post' }
    await db.communityReply.updateMany({ where: { postId, isAnswer: true }, data: { isAnswer: false } })
    await db.communityReply.update({ where: { id: replyId }, data: { isAnswer: true } })
    await db.communityPost.update({ where: { id: postId }, data: { resolved: true, answeredReplyId: replyId } })
    return { ok: true, resolved: true, answeredReplyId: replyId }
  }

  // toggle without a chosen reply
  const nextResolved = !post.resolved
  await db.communityPost.update({
    where: { id: postId },
    data: { resolved: nextResolved, answeredReplyId: nextResolved ? post.answeredReplyId : '' },
  })
  if (!nextResolved) await db.communityReply.updateMany({ where: { postId, isAnswer: true }, data: { isAnswer: false } })
  return { ok: true, resolved: nextResolved, answeredReplyId: nextResolved ? post.answeredReplyId : '' }
}

// ── Actions (vote / save / report / block / guidelines) ──────────────────────

export async function toggleVote(profileId: string, targetType: 'post' | 'reply', targetId: string) {
  const row = targetType === 'post'
    ? await db.communityPost.findUnique({ where: { id: targetId } })
    : await db.communityReply.findUnique({ where: { id: targetId } })
  if (!row) return { ok: false, status: 404, error: `${targetType} not found` }
  if (row.profileId === profileId) return { ok: false, status: 400, error: `You cannot upvote your own ${targetType}` }

  const existing = await db.communityVote.findUnique({
    where: { profileId_targetType_targetId: { profileId, targetType, targetId } },
  })
  let voted: boolean
  if (existing) {
    await db.communityVote.delete({ where: { id: existing.id } })
    await (targetType === 'post'
      ? db.communityPost.update({ where: { id: targetId }, data: { upvotes: { decrement: 1 } } })
      : db.communityReply.update({ where: { id: targetId }, data: { upvotes: { decrement: 1 } } }))
    voted = false
  } else {
    await db.communityVote.create({ data: { profileId, targetType, targetId } })
    await (targetType === 'post'
      ? db.communityPost.update({ where: { id: targetId }, data: { upvotes: { increment: 1 } } })
      : db.communityReply.update({ where: { id: targetId }, data: { upvotes: { increment: 1 } } }))
    voted = true
  }
  const fresh = targetType === 'post'
    ? await db.communityPost.findUnique({ where: { id: targetId }, select: { upvotes: true } })
    : await db.communityReply.findUnique({ where: { id: targetId }, select: { upvotes: true } })
  return { ok: true, voted, upvotes: fresh?.upvotes ?? 0 }
}

export async function toggleSave(profileId: string, postId: string) {
  const existing = await db.savedDiscussion.findUnique({ where: { profileId_postId: { profileId, postId } } })
  if (existing) {
    await db.savedDiscussion.delete({ where: { id: existing.id } })
    return { ok: true, saved: false }
  }
  const post = await db.communityPost.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) return { ok: false, status: 404, error: 'Post not found' }
  await db.savedDiscussion.create({ data: { profileId, postId } })
  return { ok: true, saved: true }
}

export const REPORT_REASONS = new Set(['spam', 'abuse', 'misinformation', 'privacy', 'other'])

export async function reportTarget(profileId: string, targetType: 'post' | 'reply' | 'member', targetId: string, reason: string, details: string) {
  if (!REPORT_REASONS.has(reason)) return { ok: false, status: 400, error: 'reason must be one of: spam, abuse, misinformation, privacy, other' }
  await db.communityReport.create({ data: { profileId, targetType, targetId, reason, details } })

  // privacy / misinformation reports hold the content for review (deterministic)
  if (reason === 'privacy' || reason === 'misinformation') {
    if (targetType === 'post') await db.communityPost.updateMany({ where: { id: targetId }, data: { status: 'review' } })
    if (targetType === 'reply') await db.communityReply.updateMany({ where: { id: targetId }, data: { status: 'review' } })
  }
  return { ok: true, reported: true }
}

export async function toggleBlock(profileId: string, memberId: string, kind: 'block' | 'mute') {
  const member = await db.communityMember.findUnique({ where: { id: memberId } })
  if (!member) return { ok: false, status: 404, error: 'Member not found' }
  const existing = await db.memberBlock.findUnique({
    where: { profileId_memberId_kind: { profileId, memberId, kind } },
  })
  if (existing) {
    await db.memberBlock.delete({ where: { id: existing.id } })
    return { ok: true, active: false }
  }
  await db.memberBlock.create({ data: { profileId, memberId, kind } })
  return { ok: true, active: true }
}

export async function acceptGuidelines(profileId: string) {
  await db.communitySettings.upsert({
    where: { profileId },
    create: { profileId, guidelinesAccepted: true, acceptedAt: new Date() },
    update: { guidelinesAccepted: true, acceptedAt: new Date() },
  })
  return { ok: true, guidelinesAccepted: true }
}

// ── Groups ───────────────────────────────────────────────────────────────────

export async function listGroups(profileId: string, mineOnly: boolean): Promise<CommunityGroupsPayloadPlus> {
  const ctx = await buildCommunityCtx(profileId)
  const [rows, myMemberRows] = await Promise.all([
    db.studyGroup.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'desc' } }),
    db.groupMembership.findMany({ where: { profileId, actorKey: 'you' }, select: { groupId: true } }),
  ])
  const myIds = new Set(myMemberRows.map((m) => m.groupId))
  const summaries = await groupSummaries(profileId, ctx, rows)
  const mine = summaries.filter((g) => myIds.has(g.id))
  if (mineOnly) return { groups: mine, mine }
  // visible: public groups + private groups you're already in
  const visible = summaries.filter((g) => g.privacy === 'public' || myIds.has(g.id))
  return { groups: visible, mine }
}

export interface CommunityGroupsPayloadPlus {
  groups: CommunityGroupSummary[]
  mine: CommunityGroupSummary[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'group'
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base
  let n = 2
  while (await db.studyGroup.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

export interface CreateGroupInput {
  name: string; description: string; privacy: string; focusKind: string
  focusRef: string; goalText: string; meetCadence: string
}

export async function createGroup(profileId: string, input: CreateGroupInput) {
  const dup = await db.studyGroup.findFirst({ where: { name: { equals: input.name } }, select: { id: true } })
  // name dedupe is case-insensitive and trim-tolerant
  const allNames = await db.studyGroup.findMany({ select: { name: true } })
  if (dup || allNames.some((g) => g.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    return { ok: false, status: 409, error: 'A group with this name already exists' }
  }
  const group = await db.studyGroup.create({
    data: {
      slug: await uniqueSlug(slugify(input.name)),
      name: input.name,
      description: input.description,
      privacy: input.privacy,
      focusKind: input.focusKind,
      focusRef: input.focusRef,
      goalText: input.goalText,
      meetCadence: input.meetCadence,
      plan: [] as unknown as Prisma.InputJsonValue,
      ownerProfileId: profileId,
      ownerMemberId: '',
      seeded: false,
      status: 'open',
    },
  })
  await db.groupMembership.create({
    data: { groupId: group.id, actorKey: 'you', profileId, role: 'owner', shareData: false },
  })
  const detail = await groupDetail(profileId, group.id)
  return { ok: true, status: 201, group: detail?.group ?? null }
}

export async function groupDetail(profileId: string, groupId: string) {
  const group = await db.studyGroup.findUnique({ where: { id: groupId } })
  if (!group) return null
  const ctx = await buildCommunityCtx(profileId)

  const memberships = await db.groupMembership.findMany({ where: { groupId }, orderBy: { createdAt: 'asc' } })
  const youMember = memberships.some((m) => m.actorKey === 'you' && m.profileId === profileId)
  const privacyLocked = group.privacy === 'private' && !youMember
  await prefillPeerBadges(ctx, memberships.filter((m) => m.actorKey !== 'you').map((m) => m.actorKey))

  const memberCount = memberships.length
  const challengeCount = await db.groupChallenge.count({ where: { groupId, status: { not: 'archived' } } })
  const todayStart = dayKeyStart(todayKey())
  const activeToday = await groupActivityToday(groupId, todayStart)

  const summary = groupSummaryFromRow(
    ctx, group,
    { youMember, youOwner: group.ownerProfileId === profileId },
    { memberCount, challengeCount, activeToday },
  )

  if (privacyLocked) {
    // name/description/focus/members-count only — content gated honestly
    return {
      group: {
        ...summary,
        privacyLocked: true,
        members: [],
        challenges: [],
        plan: [],
        discussions: [],
        youShareData: false,
        joinRequestNote: 'Private group — ask the owner for an invite',
      } satisfies CommunityGroupDetail,
    }
  }

  const [challengeRows, postRows, planRaw] = await Promise.all([
    db.groupChallenge.findMany({ where: { groupId, status: { not: 'archived' } }, orderBy: { createdAt: 'desc' } }),
    db.communityPost.findMany({ where: { groupId, ...visibleStatusWhere(profileId) }, orderBy: { createdAt: 'desc' } }),
    Promise.resolve(Array.isArray(group.plan) ? group.plan : []),
  ])
  await prefillPeerBadges(ctx, postRows.map((p) => p.authorMemberId))
  const lActivity = await lastActivityMap(postRows.map((p) => p.id))

  const log = await loadActivity(profileId, new Date(Date.now() - 95 * DAY))
  const challenges: CommunityChallengeView[] = challengeRows.map((c) => {
    const unit = unitForChallengeKind(c.kind)
    const peerCounts = Array.isArray(c.progress)
      ? (c.progress as { label?: string; count?: number }[]).map((p) => ({ label: typeof p.label === 'string' ? p.label : 'Peer', count: typeof p.count === 'number' ? p.count : 0 }))
      : []
    return {
      id: c.id,
      groupId: c.groupId,
      groupName: group.name,
      kind: c.kind as CommunityChallengeView['kind'],
      title: c.title,
      detail: c.detail,
      target: c.target,
      unit,
      dueAt: c.dueAt ? c.dueAt.toISOString() : null,
      status: c.status as CommunityChallengeView['status'],
      youJoined: youMember,
      youCount: metricForUnit(sumSince(log, c.createdAt), unit),
      peerCounts,
      seeded: c.seeded,
    }
  })

  const myMembership = memberships.find((m) => m.actorKey === 'you' && m.profileId === profileId)
  const members = memberships.map((m) => ({
    actor: m.actorKey === 'you' ? youActor(ctx) : actorForAuthor(ctx, '', m.actorKey),
    role: m.role as 'owner' | 'member',
    joinedAt: m.createdAt.toISOString(),
    sharesData: m.shareData,
  }))

  const plan = (planRaw as { id?: string; line?: string; addedBy?: string; at?: string }[])
    .slice(0, 20)
    .map((p, i) => ({ id: typeof p.id === 'string' ? p.id : `plan-${i}`, line: typeof p.line === 'string' ? p.line : '', addedBy: typeof p.addedBy === 'string' ? p.addedBy : '', at: typeof p.at === 'string' ? p.at : '' }))

  const discussions = postRows
    .filter((p) => !authorBlocked(ctx, p.profileId, p.authorMemberId))
    .map((p) => postSummary(ctx, p, lActivity.get(p.id) ?? p.createdAt))

  const detail: CommunityGroupDetail = {
    ...summary,
    privacyLocked: false,
    members,
    challenges,
    plan,
    discussions,
    youShareData: myMembership?.shareData ?? false,
    joinRequestNote: null,
  }
  return { group: detail }
}

export interface GroupActionInput { action: string; line?: string; kind?: string; title?: string; detail?: string; target?: number; dueAt?: string }

export async function groupAction(profileId: string, groupId: string, input: GroupActionInput) {
  const group = await db.studyGroup.findUnique({ where: { id: groupId } })
  if (!group) return { ok: false, status: 404, error: 'Group not found' }
  const membership = await db.groupMembership.findFirst({ where: { groupId, actorKey: 'you', profileId } })
  const youOwner = group.ownerProfileId === profileId

  if (input.action === 'join') {
    if (group.status !== 'open') return { ok: false, status: 400, error: 'This group is archived' }
    if (membership) return { ok: false, status: 400, error: 'Already a member' }
    if (group.privacy === 'private') {
      return { ok: false, status: 403, error: 'Private group — ask the owner for an invite', joinRequestNote: 'Private group — ask the owner for an invite' }
    }
    await db.groupMembership.create({ data: { groupId, actorKey: 'you', profileId, role: 'member', shareData: false } })
    return { ok: true, joined: true }
  }

  if (input.action === 'leave') {
    if (!membership) return { ok: false, status: 400, error: 'You are not a member' }
    if (youOwner || membership.role === 'owner') return { ok: false, status: 400, error: 'Transfer or archive first' }
    await db.groupMembership.delete({ where: { id: membership.id } })
    return { ok: true, left: true }
  }

  if (input.action === 'share') {
    if (!membership) return { ok: false, status: 400, error: 'Join the group first' }
    const next = !membership.shareData
    await db.groupMembership.update({ where: { id: membership.id }, data: { shareData: next } })
    return { ok: true, shareData: next }
  }

  if (input.action === 'challenge') {
    if (!youOwner) return { ok: false, status: 403, error: 'Only the group owner can create challenges' }
    const kind = input.kind ?? ''
    if (!['mcq', 'mock', 'revision', 'case'].includes(kind)) return { ok: false, status: 400, error: 'kind must be one of: mcq, mock, revision, case' }
    const target = Math.max(1, Math.min(500, Math.round(Number(input.target ?? 0)) || 0))
    if (!input.target || target < 1) return { ok: false, status: 400, error: 'target must be between 1 and 500' }
    let dueAt: Date | null = null
    if (input.dueAt) {
      const d = new Date(input.dueAt)
      if (Number.isNaN(d.getTime())) return { ok: false, status: 400, error: 'dueAt must be an ISO date string' }
      dueAt = d
    }
    const created = await db.groupChallenge.create({
      data: {
        groupId, kind, title: input.title ?? 'Challenge', detail: input.detail ?? '',
        target, unit: unitForChallengeKind(kind), dueAt, status: 'active',
        progress: [] as unknown as Prisma.InputJsonValue, seeded: false,
      },
    })
    return { ok: true, challenge: { id: created.id, kind: created.kind, title: created.title, target: created.target, unit: created.unit } }
  }

  if (input.action === 'plan') {
    if (!membership) return { ok: false, status: 403, error: 'Members only' }
    const profile = await db.studentProfile.findUnique({ where: { id: profileId }, select: { name: true } })
    const plan = Array.isArray(group.plan) ? [...(group.plan as { id?: string; line?: string; addedBy?: string; at?: string }[])] : []
    if (plan.length >= 20) return { ok: false, status: 400, error: 'Plan is capped at 20 lines — archive a line first' }
    const line = {
      id: crypto.randomUUID(),
      line: input.line ?? '',
      addedBy: profile?.name ?? 'You',
      at: new Date().toISOString(),
    }
    plan.push(line)
    await db.studyGroup.update({ where: { id: groupId }, data: { plan: plan.slice(0, 20) as unknown as Prisma.InputJsonValue } })
    return { ok: true, plan: plan.slice(0, 20) }
  }

  if (input.action === 'archive') {
    if (!youOwner) return { ok: false, status: 403, error: 'Only the group owner can archive' }
    await db.studyGroup.update({ where: { id: groupId }, data: { status: 'archived' } })
    return { ok: true, archived: true }
  }

  return { ok: false, status: 400, error: 'action must be one of: join, leave, share, challenge, plan, archive' }
}

// ── Accountability route payload ─────────────────────────────────────────────

export async function accountabilityPayload(profileId: string) {
  const { snapshot, log } = await buildAccountabilitySnapshot(profileId)

  const history = lastNDayKeys(14).map((key) => {
    const d = dayActivityOf(log, key)
    return {
      dayKey: key,
      label: dayLabel(key),
      mcqs: d.mcqs,
      studyMinutes: d.studyMinutes,
      revisionSessions: d.revisionSessions,
      active: isDayActive(d),
    }
  })

  const commitments = snapshot.goals.filter((g) => g.scope === 'commitment' && g.active)

  // one gentle measured coaching line — never shaming, never invented
  const dailyGoals = snapshot.goals.filter((g) => g.scope === 'daily' && g.active)
  const tip = (() => {
    if (dailyGoals.length > 0 && dailyGoals.every((g) => g.done)) return 'Daily goals complete — rest is part of the plan.'
    if (!snapshot.streak.todayActive) return 'Nothing due right now — a short recall session keeps the rhythm.'
    if (snapshot.streak.current >= 3) return `${snapshot.streak.current}-day study rhythm going — protect it lightly.`
    if (snapshot.week.daysActive > 0) return `${snapshot.week.daysActive} of the last 7 days active — every measured session counts.`
    return null
  })()

  return { accountability: snapshot, history, commitments, tip }
}

// ── Goals route ──────────────────────────────────────────────────────────────

function goalView(g: { id: string; scope: string; kind: string; title: string; target: number; unit: string; dueAt: Date | null; active: boolean; createdAt: Date }, progress: number): CommunityGoalView {
  return {
    id: g.id,
    scope: g.scope as CommunityGoalView['scope'],
    kind: g.kind,
    title: g.title,
    target: g.target,
    unit: g.unit,
    progress,
    done: g.active && progress >= g.target,
    dueAt: g.dueAt ? g.dueAt.toISOString() : null,
    active: g.active,
    createdAt: g.createdAt.toISOString(),
  }
}

async function allGoalViews(profileId: string): Promise<CommunityGoalView[]> {
  const { snapshot } = await buildAccountabilitySnapshot(profileId)
  return snapshot.goals
}

export interface GoalInput { action: string; scope?: string; kind?: string; title?: string; target?: number; dueAt?: string; id?: string; active?: boolean }

export async function goalsAction(profileId: string, input: GoalInput) {
  if (input.action === 'add') {
    const scope = input.scope ?? ''
    const kind = input.kind ?? ''
    if (!['daily', 'weekly', 'commitment'].includes(scope)) return { ok: false, status: 400, error: 'scope must be one of: daily, weekly, commitment', goal: null, goals: await allGoalViews(profileId) }
    if (!['mcqs', 'study', 'revision', 'mock', 'case', 'custom'].includes(kind)) return { ok: false, status: 400, error: 'kind must be one of: mcqs, study, revision, mock, case, custom', goal: null, goals: await allGoalViews(profileId) }
    const target = Math.round(Number(input.target))
    if (!Number.isFinite(target) || target < 1 || target > 1000) return { ok: false, status: 400, error: 'target must be between 1 and 1000', goal: null, goals: await allGoalViews(profileId) }

    // honest dedupe: reject an identical ACTIVE scope+kind goal
    const dup = await db.accountabilityGoal.findFirst({ where: { profileId, scope, kind, active: true } })
    if (dup) return { ok: false, status: 400, error: `You already have an active ${scope} ${kind} goal — update or pause it first`, goal: null, goals: await allGoalViews(profileId) }

    let dueAt: Date | null = null
    if (input.dueAt) {
      const d = new Date(input.dueAt)
      if (Number.isNaN(d.getTime())) return { ok: false, status: 400, error: 'dueAt must be an ISO date string', goal: null, goals: await allGoalViews(profileId) }
      dueAt = d
    }
    const created = await db.accountabilityGoal.create({
      data: { profileId, scope, kind, title: input.title ?? '', target, unit: unitForKind(kind), dueAt },
    })
    const goals = await allGoalViews(profileId)
    return { ok: true, status: 201, goal: goals.find((g) => g.id === created.id) ?? null, goals }
  }

  if (input.action === 'update') {
    const id = input.id ?? ''
    const goal = await db.accountabilityGoal.findUnique({ where: { id } })
    if (!goal || goal.profileId !== profileId) return { ok: false, status: 404, error: 'Goal not found', goal: null, goals: await allGoalViews(profileId) }
    if (typeof input.active === 'boolean') await db.accountabilityGoal.update({ where: { id }, data: { active: input.active } })
    const goals = await allGoalViews(profileId)
    return { ok: true, status: 200, goal: goals.find((g) => g.id === id) ?? null, goals }
  }

  if (input.action === 'delete') {
    const id = input.id ?? ''
    const goal = await db.accountabilityGoal.findUnique({ where: { id } })
    if (!goal || goal.profileId !== profileId) return { ok: false, status: 404, error: 'Goal not found', goal: null, goals: await allGoalViews(profileId) }
    await db.accountabilityGoal.delete({ where: { id } })
    return { ok: true, status: 200, goal: null, goals: await allGoalViews(profileId) }
  }

  return { ok: false, status: 400, error: 'action must be one of: add, update, delete', goal: null, goals: await allGoalViews(profileId) }
}

// ── Similar pre-ask scan ─────────────────────────────────────────────────────

export async function similarSearch(q: string): Promise<SimilarHit[]> {
  const rows = await db.communityPost.findMany({
    where: { status: 'open' },
    select: { id: true, title: true, body: true, resolved: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  // For a short search phrase the TITLE is the better duplicate signal (bodies
  // dilute token overlap), so score = max(title match, title+body match).
  const src = contentTokens(q)
  return rows
    .map((r) => {
      const titleScore = jaccard(src, contentTokens(r.title))
      const fullScore = jaccard(src, contentTokens(`${r.title} ${r.body}`))
      return { id: r.id, title: r.title, resolved: r.resolved, score: Math.round(Math.max(titleScore, fullScore) * 100) / 100 }
    })
    .filter((h) => h.score >= 0.25)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 5)
}

// ── AI modes (backend-only ZAI; badge + disclaimer always; fallback-safe) ────

function parseLooseJson(text: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s)
      return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
    } catch { return null }
  }
  const direct = tryParse(text.trim())
  if (direct) return direct
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) { const f = tryParse(fenced[1].trim()); if (f) return f }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) { const s = tryParse(text.slice(start, end + 1)); if (s) return s }
  return null
}

function strArray(v: unknown, cap: number, maxLen = 300): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, maxLen))
    .slice(0, cap)
}

function firstSentences(text: string, n: number, maxChars = 280): string {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)
  return parts.slice(0, n).join(' ').slice(0, maxChars)
}

function capWords(text: string, words: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  const parts = t.split(' ')
  return parts.length <= words ? t : `${parts.slice(0, words).join(' ')}…`
}

interface AiThreadInput {
  title: string
  body: string
  replies: { body: string; upvotes: number }[]
}

async function aiSummarize(input: AiThreadInput): Promise<Pick<CommunityAiResponse, 'summary' | 'fallback'>> {
  const thread = [
    `POST TITLE: ${input.title}`,
    `POST BODY: ${input.body.slice(0, 1500)}`,
    ...input.replies.slice(0, 30).map((r, i) => `REPLY ${i + 1} (${r.upvotes} upvotes): ${r.body.slice(0, 500)}`),
  ].join('\n')

  let fallback = false
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You summarize a peer discussion thread inside MEDULA, a medical learning platform. Use ONLY the thread content — never add outside medical facts, never correct the medicine, never give advice. Overview: at most 2 sentences. keyPoints: at most 5 short grounded observations. openQuestions: at most 3 questions the thread leaves open. No chain-of-thought — final text only.\n\nRespond with ONLY JSON: {"overview":"<≤2 sentences>","keyPoints":["…"],"openQuestions":["…"]}',
        },
        { role: 'user', content: thread },
      ],
      temperature: 0.3,
      maxTokens: 600,
    })
    const parsed = parseLooseJson(completion.choices[0]?.message?.content ?? '')
    const overview = parsed && typeof parsed.overview === 'string' ? parsed.overview.trim() : ''
    const keyPoints = parsed ? strArray(parsed.keyPoints, 5, 220) : []
    const openQuestions = parsed ? strArray(parsed.openQuestions, 3, 220) : []
    if (!overview) throw new Error('empty summary')
    return { summary: { overview: capWords(overview, 70), keyPoints, openQuestions }, fallback }
  } catch {
    fallback = true
  }

  // deterministic extract: first sentences of the post + top reply bodies
  const topReplies = [...input.replies].sort((a, b) => b.upvotes - a.upvotes)
  return {
    summary: {
      overview: firstSentences(input.body, 2) || input.title,
      keyPoints: topReplies.slice(0, 5).map((r) => firstSentences(r.body, 1, 180)).filter(Boolean),
      openQuestions: [input.body, ...input.replies.map((r) => r.body)]
        .join(' ')
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.includes('?'))
        .slice(0, 3)
        .map((s) => capWords(s, 30)),
    },
    fallback,
  }
}

interface ExplainResult { grounded: boolean; text: string; keyPoints: string[]; uncertain: boolean; conceptId?: string; conceptName?: string; topicId?: string; practiceCount?: number }

const NOT_GROUNDED_TEXT = (q: string) =>
  `I couldn't ground “${q}” in MEDULA's curriculum, so I won't improvise a medical explanation. Try the Ask Engine — it resolves concepts, drugs and comparisons against platform lessons with sources.`

async function aiExplain(profileId: string, query: string): Promise<{ explanation: ExplainResult; fallback: boolean }> {
  // reuse the ask-engine resolver when importable (it is) — never improvise
  let conceptId: string | null = null
  let topicId: string | null = null
  let conceptName = ''
  try {
    const ctx = await loadGraphContext(profileId)
    const normalized = normalizeAskQuery(query)
    const resolution = resolveAskQuery(ctx, normalized)
    if (resolution.kind !== 'none') {
      conceptId = resolution.conceptId
      topicId = resolution.topicId
    }
  } catch {
    // resolver unavailable — fall through to a simple db concept/topic match
    const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
    if (tokens.length) {
      const concept = await db.concept.findFirst({
        where: { OR: tokens.map((t) => ({ name: { contains: t } })) },
        select: { id: true, name: true, topicId: true },
        orderBy: { examRelevance: 'desc' },
      })
      if (concept) { conceptId = concept.id; topicId = concept.topicId }
    }
  }

  // resolve topic → best concept when only a topic matched
  if (!conceptId && topicId) {
    const c = await db.concept.findFirst({
      where: { topicId, lesson: { not: Prisma.DbNull } },
      orderBy: [{ examRelevance: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    })
    if (c) { conceptId = c.id; conceptName = c.name }
  }

  if (!conceptId) {
    return {
      explanation: { grounded: false, text: NOT_GROUNDED_TEXT(query), keyPoints: [], uncertain: true },
      fallback: true,
    }
  }

  const concept = await db.concept.findUnique({
    where: { id: conceptId },
    select: { id: true, name: true, topicId: true, lesson: true, summary: true },
  })
  if (!concept) {
    return { explanation: { grounded: false, text: NOT_GROUNDED_TEXT(query), keyPoints: [], uncertain: true }, fallback: true }
  }
  conceptName = conceptName || concept.name
  const lesson = (concept.lesson && typeof concept.lesson === 'object' ? concept.lesson : null) as Record<string, unknown> | null
  const oneLiner = typeof lesson?.oneLiner === 'string' ? lesson.oneLiner : ''
  const explain30s = typeof lesson?.explain30s === 'string' ? lesson.explain30s : ''
  const grounded = !!(oneLiner || explain30s || concept.summary)
  const pool = await measuredMcqPool(concept.topicId, '')

  const lessonBlock = [
    oneLiner && `WHAT: ${oneLiner}`,
    explain30s && `30-SECOND EXPLANATION: ${explain30s}`,
    concept.summary && `SUMMARY: ${concept.summary}`,
    Array.isArray(lesson?.firstPrinciples) && `FIRST PRINCIPLES: ${(lesson!.firstPrinciples as string[]).slice(0, 4).join(' | ')}`,
    Array.isArray(lesson?.presentation) && `PRESENTATION: ${(lesson!.presentation as string[]).slice(0, 4).join(' | ')}`,
    Array.isArray(lesson?.diagnosis) && `DIAGNOSIS: ${(lesson!.diagnosis as string[]).slice(0, 4).join(' | ')}`,
    typeof lesson?.examRelevance === 'string' && lesson!.examRelevance && `EXAMS: ${lesson!.examRelevance}`,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0).join('\n')

  const deterministicKeyPoints = (): string[] => {
    const fromLesson = (key: string, cap: number) =>
      Array.isArray(lesson?.[key]) ? (lesson![key] as string[]).slice(0, cap) : []
    return [
      ...fromLesson('firstPrinciples', 2),
      ...fromLesson('presentation', 1),
      ...fromLesson('diagnosis', 1),
    ].map((s) => capWords(s, 22)).filter(Boolean).slice(0, 4)
  }

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are the community explain assistant inside MEDULA. Explain a concept to a medical student using ONLY the grounded lesson content below. At most 90 words, at most 4 key points. If the grounded content is too thin to answer well, say so honestly in the text and mark uncertain=true. Never add outside medical facts. No chain-of-thought — final text only.\n\nRespond with ONLY JSON: {"text":"<≤90 words>","keyPoints":["…"],"uncertain":false}\n\nGROUNDED LESSON:\n${lessonBlock || '(lesson content unavailable — only a name match)'}`,
        },
        { role: 'user', content: `Question: ${query}\nConcept: ${conceptName}` },
      ],
      temperature: 0.3,
      maxTokens: 500,
    })
    const parsed = parseLooseJson(completion.choices[0]?.message?.content ?? '')
    const text = parsed && typeof parsed.text === 'string' ? parsed.text.trim() : ''
    if (!text) throw new Error('empty explanation')
    const aiUncertain = parsed?.uncertain === true
    return {
      explanation: {
        grounded,
        text: capWords(text, 95),
        keyPoints: strArray(parsed?.keyPoints, 4, 180),
        uncertain: aiUncertain || !grounded,
        conceptId: concept.id,
        conceptName,
        topicId: concept.topicId,
        practiceCount: pool?.count ?? 0,
      },
      fallback: false,
    }
  } catch {
    return {
      explanation: {
        grounded,
        text: capWords(`${oneLiner || concept.summary} ${explain30s}`.trim() || `${conceptName} — see the concept page for the full lesson.`, 90),
        keyPoints: deterministicKeyPoints(),
        uncertain: !grounded,
        conceptId: concept.id,
        conceptName,
        topicId: concept.topicId,
        practiceCount: pool?.count ?? 0,
      },
      fallback: true,
    }
  }
}

export interface SuggestInput { topicId?: string; subjectCode?: string; postId?: string }

async function aiSuggest(input: SuggestInput): Promise<Pick<CommunityAiResponse, 'suggestions' | 'fallback'>> {
  let topicIds: string[] = []
  let subjectCode = input.subjectCode ?? ''

  if (input.postId) {
    const post = await db.communityPost.findUnique({ where: { id: input.postId }, select: { topicId: true, subjectCode: true } })
    if (post) { if (post.topicId) topicIds.push(post.topicId); if (!subjectCode) subjectCode = post.subjectCode }
  }
  if (input.topicId) topicIds = [input.topicId]
  if (!topicIds.length && subjectCode) {
    // subject basis: the topics of that subject with measured lessons
    const concepts = await db.concept.findMany({
      where: { lesson: { not: Prisma.DbNull }, topic: { subject: { code: subjectCode } } },
      select: { topicId: true },
    })
    const counts = new Map<string, number>()
    for (const c of concepts) counts.set(c.topicId, (counts.get(c.topicId) ?? 0) + 1)
    topicIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)
  }

  if (!topicIds.length && !subjectCode) {
    return {
      suggestions: {
        lessons: [], resources: [], mcqs: null,
        note: 'Nothing to suggest yet — pass a topicId, subjectCode or postId so suggestions stay measured, not invented.',
      },
      fallback: true,
    }
  }

  // lessons: Concepts with a serialized lesson, per topic (MEASURED)
  const topicRows = topicIds.length
    ? await db.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true } })
    : []
  const lessons: { topicId: string; topicName: string; lessonCount: number }[] = []
  for (const t of topicRows) {
    const lessonCount = await db.concept.count({ where: { topicId: t.id, lesson: { not: Prisma.DbNull } } })
    if (lessonCount > 0) lessons.push({ topicId: t.id, topicName: t.name, lessonCount })
  }
  lessons.sort((a, b) => b.lessonCount - a.lessonCount)

  // resources: external catalog matches on topic/subject words (top ≤3)
  const searchWords = new Set<string>()
  for (const t of topicRows) for (const w of queryWords(t.name)) searchWords.add(w)
  if (subjectCode) {
    for (const t of allTopics()) {
      const s = subjectOfTopic(t.id)
      if (s && s.code === subjectCode) { for (const w of queryWords(s.name)) searchWords.add(w); break }
    }
  }
  const resources = [...searchWords].length
    ? EXTERNAL_CATALOG
        .map((r) => ({ r, score: scoreExternal(r, [...searchWords]) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title))
        .slice(0, 3)
        .map((x) => ({ id: x.r.id, title: x.r.title, sourceName: x.r.sourceName, url: x.r.url, urlVerified: x.r.urlVerified, kind: x.r.kind }))
    : []

  // mcqs: measured pool for the primary topic, else the subject
  const mcqs = await measuredMcqPool(topicIds[0] ?? '', topicIds.length ? '' : subjectCode)

  const basis: string[] = []
  if (lessons.length) basis.push(`${lessons.reduce((n, l) => n + l.lessonCount, 0)} platform lessons`)
  if (mcqs) basis.push(`${mcqs.count} measured MCQs`)
  if (resources.length) basis.push(`${resources.length} catalog resource matches`)
  return {
    suggestions: {
      lessons,
      resources,
      mcqs,
      note: basis.length
        ? `Measured from this platform: ${basis.join(' · ')}.`
        : 'No measurable content found for this basis yet — nothing invented in its place.',
    },
    fallback: false, // deterministic-by-design: every number is a DB count
  }
}

interface ModerateAiOpinion { verdict: 'clean' | 'flag' | 'violation'; reasons: { kind: string; note: string }[]; guidance: string }

const VERDICT_RANK: Record<string, number> = { clean: 0, flag: 1, violation: 2 }

export async function communityAi(
  profileId: string,
  input: { mode: string; postId?: string; query?: string; topicId?: string; subjectCode?: string; content?: string },
): Promise<{ status: number; payload?: CommunityAiResponse; error?: string }> {
  const mode = input.mode

  if (mode === 'summarize') {
    if (!input.postId) return { status: 400, error: 'postId is required for summarize' }
    const post = await db.communityPost.findUnique({ where: { id: input.postId } })
    if (!post) return { status: 404, error: 'Post not found' }
    const replyRows = await db.communityReply.findMany({
      where: { postId: post.id, status: 'open' },
      orderBy: { upvotes: 'desc' },
      take: 30,
      select: { body: true, upvotes: true },
    })
    const { summary, fallback } = await aiSummarize({ title: post.title, body: post.body, replies: replyRows })
    return {
      status: 200,
      payload: { mode, aiBadge: AI_BADGE, disclaimer: AI_DISCLAIMER, fallback, summary },
    }
  }

  if (mode === 'explain') {
    const query = (input.query ?? '').trim()
    if (query.length < 2) return { status: 400, error: 'query is required for explain (min 2 chars)' }
    const { explanation, fallback } = await aiExplain(profileId, query)
    return {
      status: 200,
      payload: { mode, aiBadge: AI_BADGE, disclaimer: AI_DISCLAIMER, fallback, explanation },
    }
  }

  if (mode === 'suggest') {
    if (!input.topicId && !input.subjectCode && !input.postId) {
      return { status: 400, error: 'provide one of: topicId, subjectCode, postId' }
    }
    const { suggestions, fallback } = await aiSuggest({
      topicId: input.topicId, subjectCode: input.subjectCode, postId: input.postId,
    })
    return {
      status: 200,
      payload: { mode, aiBadge: AI_BADGE, disclaimer: AI_DISCLAIMER, fallback, suggestions },
    }
  }

  if (mode === 'moderate') {
    const content = (input.content ?? '').trim()
    if (!content) return { status: 400, error: 'content text is required for moderate' }
    const verdict = scanContent(content)
    const detVerdict: 'clean' | 'flag' | 'violation' = verdict.action === 'violation' ? 'violation' : verdict.action === 'flag' ? 'flag' : 'clean'
    const detGuidance = detVerdict === 'violation' ? PHI_GUIDANCE : detVerdict === 'flag' ? REVIEW_GUIDANCE : CLEAN_GUIDANCE

    let aiOpinion: ModerateAiOpinion | null = null
    let fallback = false
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a moderation assistant for a MEDICAL LEARNING community (educational only, de-identified cases). Classify the text: "clean" = fine for an educational forum; "flag" = spam, promotion, unkind but not dangerous; "violation" = contains patient-identifying information (names, MRN/UHID, ward/bed/hospital numbers, phone, DOB) or clearly harmful content. Give short reasons. Guidance: one actionable sentence. No chain-of-thought — final verdict only.\n\nRespond with ONLY JSON: {"verdict":"clean|flag|violation","reasons":[{"kind":"spam|abuse|privacy|other","note":"…"}],"guidance":"…"}',
          },
          { role: 'user', content: `TEXT TO REVIEW:\n${content.slice(0, 3000)}` },
        ],
        temperature: 0.3,
        maxTokens: 400,
      })
      const parsed = parseLooseJson(completion.choices[0]?.message?.content ?? '')
      const v = parsed && typeof parsed.verdict === 'string' ? parsed.verdict : ''
      if (v === 'clean' || v === 'flag' || v === 'violation') {
        aiOpinion = {
          verdict: v,
          reasons: parsed
            ? (Array.isArray(parsed.reasons) ? parsed.reasons as unknown[] : []).map((r) => {
                const o = (r ?? {}) as { kind?: unknown; note?: unknown }
                return { kind: typeof o.kind === 'string' ? o.kind : 'other', note: typeof o.note === 'string' ? o.note.slice(0, 200) : '' }
              }).filter((r) => r.note)
            : [],
          guidance: parsed && typeof parsed.guidance === 'string' && parsed.guidance.trim() ? parsed.guidance.trim().slice(0, 300) : CLEAN_GUIDANCE,
        }
      } else {
        throw new Error('no verdict')
      }
    } catch {
      fallback = true
    }

    // the DETERMINISTIC verdict wins when stricter
    let finalVerdict: 'clean' | 'flag' | 'violation' = detVerdict
    let finalReasons = verdict.reasons
    let finalGuidance = detGuidance
    if (aiOpinion && VERDICT_RANK[aiOpinion.verdict]! > VERDICT_RANK[detVerdict]!) {
      finalVerdict = aiOpinion.verdict
      finalReasons = [...verdict.reasons, ...aiOpinion.reasons]
      finalGuidance = aiOpinion.verdict === 'violation' ? PHI_GUIDANCE : aiOpinion.guidance
    }
    return {
      status: 200,
      payload: {
        mode, aiBadge: AI_BADGE, disclaimer: AI_DISCLAIMER, fallback,
        moderation: { verdict: finalVerdict, reasons: finalReasons, guidance: finalGuidance },
      },
    }
  }

  return { status: 400, error: 'mode must be one of: summarize, explain, suggest, moderate' }
}
