import { db } from '@/lib/db'
import { DAY, estimatedRecall, updateKnowledge, statusFor } from '@/lib/engine'
import type {
  RevisionBlock,
  RevisionBlockKind,
  RevisionConceptContent,
  RevisionExamClock,
  RevisionFlashcardContent,
  RevisionIntelligence,
  RevisionPairContent,
  RevisionQueuePlan,
  RevisionQuestionContent,
  RevisionSessionContent,
  RevisionCaseContent,
  RevisionWhy,
  RevisionMode,
} from '@/lib/types'

// ─── SMART REVISION ENGINE (PRODUCT 06) ──────────────────────────────────────
// Deterministic, measured, honest. Answers "what should I revise today, and
// why?" from DB rows only: knowledge states (forgetting risk), the attempt
// feed (accuracy + 'forgot' errors), open revision items, due flashcards,
// topic exam weight and exam proximity. Every block carries a human, measured
// reason + why chips. No chain-of-thought anywhere — conclusions only.
//
// Honesty rules:
//  - no invented exam dates (clock is null without a real examDate)
//  - recall is a MODEL estimate and always labelled "recall est"
//  - thin data → the block simply does not exist (or insufficientData: true)

// ─── CONTEXT TYPES ───────────────────────────────────────────────────────────

export interface RevisionConceptCtx {
  conceptId: string
  name: string
  topicId: string
  topicName: string
  topicImportance: number
  topicSystem: string | null
  subjectCode: string
  subjectName: string
  examRelevance: number
  summary: string
  whyMatters: string
  mnemonic: string
  detail: unknown // Concept.detail Json — parsed at hydration time
  mastery: number // 0..100 (0 when the concept has no KnowledgeState yet)
  attemptCount: number
  status: string
  lastReviewed: Date | null
  daysSince: number | null
  recall: number // 0..1; 0.5 placeholder when never reviewed (recallMeasured false)
  recallMeasured: boolean
  onRevisionList: boolean
  revisionItemReason: string | null
}

export interface RevisionMistakeCtx {
  recordId: string
  questionId: string
  conceptId: string | null
  conceptName: string | null
  topicName: string | null
  subjectCode: string
  subjectName: string
  difficulty: number
  qtype: string
  pyqPattern: boolean
  wrongCount: number
  lastWrongAt: Date
  status: string
}

export interface RevisionFlashcardCtx {
  cardId: string
  front: string
  back: string
  subjectCode: string
  conceptId: string | null
  dueAt: Date
}

export interface RevisionQuestionPoolEntry {
  id: string
  conceptId: string
  subjectCode: string
  difficulty: number
  qtype: string
  pyqPattern: boolean
}

export interface RevisionCaseMeta {
  id: string
  title: string
  specialty: string
  system: string
  difficulty: number
}

export interface RevisionContext {
  profileId: string
  dailyHours: number
  examDate: Date | null
  examMode: boolean
  examLabel: string
  concepts: Map<string, RevisionConceptCtx> // every known/known-of concept
  conceptNames: Map<string, string> // any concept id seen (states, revision items, mistakes)
  revisionConceptIds: Set<string>
  mistakes: RevisionMistakeCtx[]
  openMistakeQuestionIds: Set<string>
  dueCards: RevisionFlashcardCtx[] // sorted dueAt asc
  questions: RevisionQuestionPoolEntry[]
  pairs: Array<{ id: string; a: string; b: string; aCode: string; bCode: string; aPoints: unknown; bPoints: unknown; mnemonic: string; subjectCode: string }>
  cases: RevisionCaseMeta[]
  acc30: Map<string, { total: number; correct: number }> // per concept, last 30d
  forgot30: Map<string, number> // per concept, errorType 'forgot' last 30d
  subjectAcc: Map<string, { total: number; correct: number }> // per subject, last 30d
  subjectNames: Map<string, string>
  engagedCount: number // states with attemptCount > 0
}

// Internal candidate wrapper — RevisionBlock itself has no subject field, so
// subject filtering (custom mode) happens before the block is finalized.
interface Candidate {
  block: RevisionBlock
  subjectCode: string
}

// ─── SMALL HELPERS ───────────────────────────────────────────────────────────

const pct = (n: number) => Math.round(n * 100)

function daysLabel(days: number | null): string {
  if (days === null) return 'never'
  if (days < 1) return 'today'
  return `${Math.round(days)}d ago`
}

function daysLabelFrom(date: Date, now: Date): string {
  return daysLabel((now.getTime() - date.getTime()) / DAY)
}

function normalizeSystem(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

// ─── CONTEXT LOADER ──────────────────────────────────────────────────────────
// ONE parallel pass over the DB, then a tiny follow-up for topic names
// (Question.topicId is a bare id — no relation to join on).

export async function loadRevisionContext(profileId: string): Promise<RevisionContext> {
  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * DAY)

  const [profile, states, revItems, mistakeRows, dueReviews, attempts30, pairs, cases, qBank, subjects] =
    await Promise.all([
      db.studentProfile.findUnique({
        where: { id: profileId },
        select: { dailyHours: true, examDate: true, examMode: true, examLabel: true },
      }),
      db.knowledgeState.findMany({
        where: { profileId },
        include: {
          concept: {
            include: { topic: { include: { subject: { select: { name: true } } } } },
          },
        },
      }),
      db.revisionItem.findMany({
        where: { profileId, cleared: false },
        orderBy: { priority: 'desc' },
        include: {
          concept: {
            include: { topic: { include: { subject: { select: { name: true } } } } },
          },
        },
      }),
      db.mistakeRecord.findMany({
        where: { profileId, status: { not: 'resolved' } },
        orderBy: { lastWrongAt: 'desc' },
        include: { question: { include: { concept: { select: { name: true } } } } },
      }),
      db.flashcardReview.findMany({
        where: { profileId, dueAt: { lte: now } },
        orderBy: { dueAt: 'asc' },
        include: { flashcard: true },
      }),
      db.questionAttempt.findMany({
        where: { profileId, createdAt: { gte: since30 } },
        select: { correct: true, errorType: true, question: { select: { conceptId: true, subjectCode: true } } },
      }),
      db.confusionPair.findMany(),
      db.clinicalCase.findMany({ select: { id: true, title: true, specialty: true, system: true, difficulty: true } }),
      db.question.findMany({
        where: { conceptId: { not: null } },
        select: { id: true, conceptId: true, subjectCode: true, difficulty: true, qtype: true, tags: true },
      }),
      db.subject.findMany({ select: { code: true, name: true } }),
    ])

  const subjectNames = new Map(subjects.map((s) => [s.code, s.name]))

  // ── 30d attempt aggregates (per concept / per subject / 'forgot' errors) ──
  const acc30 = new Map<string, { total: number; correct: number }>()
  const forgot30 = new Map<string, number>()
  const subjectAcc = new Map<string, { total: number; correct: number }>()
  for (const a of attempts30) {
    const cid = a.question.conceptId
    if (cid) {
      const c = acc30.get(cid) ?? { total: 0, correct: 0 }
      c.total += 1
      if (a.correct) c.correct += 1
      acc30.set(cid, c)
      if (a.errorType === 'forgot') forgot30.set(cid, (forgot30.get(cid) ?? 0) + 1)
    }
    const sc = a.question.subjectCode
    const s = subjectAcc.get(sc) ?? { total: 0, correct: 0 }
    s.total += 1
    if (a.correct) s.correct += 1
    subjectAcc.set(sc, s)
  }

  // ── concepts map: knowledge states first, then revision-item-only concepts ──
  const concepts = new Map<string, RevisionConceptCtx>()
  const conceptNames = new Map<string, string>()
  const revisionConceptIds = new Set<string>()

  for (const s of states) {
    const c = s.concept
    const daysSince = s.lastReviewed ? (now.getTime() - s.lastReviewed.getTime()) / DAY : null
    const recallMeasured = !!s.lastReviewed
    concepts.set(c.id, {
      conceptId: c.id,
      name: c.name,
      topicId: c.topicId,
      topicName: c.topic.name,
      topicImportance: c.topic.importance,
      topicSystem: normalizeSystem(c.topic.system),
      subjectCode: c.topic.subjectId,
      subjectName: c.topic.subject.name,
      examRelevance: c.examRelevance,
      summary: c.summary,
      whyMatters: c.whyMatters,
      mnemonic: c.mnemonic,
      detail: c.detail,
      mastery: s.score,
      attemptCount: s.attemptCount,
      status: s.status,
      lastReviewed: s.lastReviewed,
      daysSince,
      recall: recallMeasured ? estimatedRecall(Math.max(0, daysSince ?? 0), Math.max(0.2, s.stability)) : 0.5,
      recallMeasured,
      onRevisionList: false,
      revisionItemReason: null,
    })
    conceptNames.set(c.id, c.name)
  }

  for (const item of revItems) {
    const c = item.concept
    revisionConceptIds.add(c.id)
    conceptNames.set(c.id, c.name)
    const existing = concepts.get(c.id)
    if (existing) {
      existing.onRevisionList = true
      existing.revisionItemReason = existing.revisionItemReason ?? item.reason
    } else {
      // Engaged only via the revision list — no measured state yet.
      concepts.set(c.id, {
        conceptId: c.id,
        name: c.name,
        topicId: c.topicId,
        topicName: c.topic.name,
        topicImportance: c.topic.importance,
        topicSystem: normalizeSystem(c.topic.system),
        subjectCode: c.topic.subjectId,
        subjectName: c.topic.subject.name,
        examRelevance: c.examRelevance,
        summary: c.summary,
        whyMatters: c.whyMatters,
        mnemonic: c.mnemonic,
        detail: c.detail,
        mastery: 0,
        attemptCount: 0,
        status: 'new',
        lastReviewed: null,
        daysSince: null,
        recall: 0.5,
        recallMeasured: false,
        onRevisionList: true,
        revisionItemReason: item.reason || 'open revision item',
      })
    }
  }

  // ── open mistakes ──
  const topicIds = [...new Set(mistakeRows.map((m) => m.question.topicId).filter((t): t is string => !!t))]
  const topicNames = topicIds.length
    ? new Map((await db.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]))
    : new Map<string, string>()

  const mistakes: RevisionMistakeCtx[] = mistakeRows.map((m) => {
    const q = m.question
    let pyq = false
    if (Array.isArray(q.tags)) pyq = (q.tags as unknown[]).some((t) => t === 'pyq-pattern')
    if (m.conceptId) conceptNames.set(m.conceptId, m.question.concept?.name ?? conceptNames.get(m.conceptId) ?? m.conceptId)
    return {
      recordId: m.id,
      questionId: m.questionId,
      conceptId: m.conceptId,
      conceptName: m.question.concept?.name ?? null,
      topicName: q.topicId ? topicNames.get(q.topicId) ?? null : null,
      subjectCode: q.subjectCode,
      subjectName: subjectNames.get(q.subjectCode) ?? q.subjectCode,
      difficulty: q.difficulty,
      qtype: q.qtype,
      pyqPattern: pyq,
      wrongCount: m.wrongCount,
      lastWrongAt: m.lastWrongAt,
      status: m.status,
    }
  })

  // ── due flashcards ──
  const dueCards: RevisionFlashcardCtx[] = dueReviews.map((r) => ({
    cardId: r.flashcardId,
    front: r.flashcard.front,
    back: r.flashcard.back,
    subjectCode: r.flashcard.subjectCode,
    conceptId: r.flashcard.conceptId,
    dueAt: r.dueAt,
  }))

  // ── question pool meta ──
  const questions: RevisionQuestionPoolEntry[] = qBank
    .filter((q): q is typeof q & { conceptId: string } => !!q.conceptId)
    .map((q) => {
      let pyq = false
      if (Array.isArray(q.tags)) pyq = (q.tags as unknown[]).some((t) => t === 'pyq-pattern')
      return { id: q.id, conceptId: q.conceptId, subjectCode: q.subjectCode, difficulty: q.difficulty, qtype: q.qtype, pyqPattern: pyq }
    })

  return {
    profileId,
    dailyHours: profile?.dailyHours ?? 2,
    examDate: profile?.examDate ?? null,
    examMode: profile?.examMode ?? false,
    examLabel: profile?.examLabel ?? '',
    concepts,
    conceptNames,
    revisionConceptIds,
    mistakes,
    openMistakeQuestionIds: new Set(mistakes.map((m) => m.questionId)),
    dueCards,
    questions,
    pairs: pairs.map((p) => ({
      id: p.id, a: p.a, b: p.b, aCode: p.aCode, bCode: p.bCode,
      aPoints: p.aPoints, bPoints: p.bPoints, mnemonic: p.mnemonic, subjectCode: p.subjectCode,
    })),
    cases: cases.map((c) => ({ id: c.id, title: c.title, specialty: c.specialty, system: normalizeSystem(c.system), difficulty: c.difficulty })),
    acc30,
    forgot30,
    subjectAcc,
    subjectNames,
    engagedCount: [...concepts.values()].filter((c) => c.attemptCount > 0).length,
  }
}

// ─── EXAM CLOCK ──────────────────────────────────────────────────────────────
// Never invents an exam date: without a real examDate the clock is null.

export function examClockFor(profile: { examDate: Date | null; examMode: boolean; examLabel: string }): RevisionExamClock | null {
  if (!profile.examDate) return null
  const daysLeft = Math.max(0, Math.ceil((profile.examDate.getTime() - Date.now()) / DAY))
  return {
    daysLeft,
    label: profile.examLabel || 'Exam',
    isEstimate: false,
    near: daysLeft <= 60 || profile.examMode,
  }
}

// ─── DEFAULT BUDGET ──────────────────────────────────────────────────────────
// round(dailyHours * 60 * 0.5) clamped to [10, 45], snapped DOWN to the
// 10/15/20/30/45 ladder the UI offers.

export function defaultBudgetMinutes(dailyHours: number): number {
  const clamped = Math.min(45, Math.max(10, Math.round(dailyHours * 60 * 0.5)))
  let budget = 10
  for (const step of [10, 15, 20, 30, 45]) if (clamped >= step) budget = step
  return budget
}

// ─── CONCEPT SCORING ─────────────────────────────────────────────────────────
// Weights are fixed and visible; every term is measured from DB rows.

function mistakePressure(ctx: RevisionContext, conceptId: string): number {
  return Math.min(1, (ctx.forgot30.get(conceptId) ?? 0) / 2)
}

function conceptScore(ctx: RevisionContext, c: RevisionConceptCtx, examNear: boolean): number {
  let s =
    0.3 * (1 - c.recall) +
    0.25 * (1 - c.mastery / 100) +
    0.15 * (c.examRelevance / 5) +
    0.15 * mistakePressure(ctx, c.conceptId) +
    0.1 * (c.topicImportance / 5)
  // Exam proximity shifts priorities toward high exam weight (keeps the
  // plan's "priorities shifted" note honest).
  if (examNear) s += 0.1 * (c.examRelevance / 5)
  return s
}

// ─── TARGET CONCEPTS (weak / wrong) ──────────────────────────────────────────
// Measured pool for MCQ / PYQ / compare / case blocks: concepts with open
// mistakes, or engaged concepts that are weak by mastery, 30d accuracy or
// 'forgot' errors.

function isTargetConcept(ctx: RevisionContext, c: RevisionConceptCtx): boolean {
  if (c.attemptCount <= 0) return false
  const acc = ctx.acc30.get(c.conceptId)
  const lowAcc = acc !== undefined && acc.total >= 2 && acc.correct / acc.total < 0.7
  return c.mastery < 60 || lowAcc || (ctx.forgot30.get(c.conceptId) ?? 0) >= 1
}

function targetScore(ctx: RevisionContext, conceptId: string): number {
  const c = ctx.concepts.get(conceptId)
  // Wrong but never revised → fixed high priority (deterministic, honest:
  // there is no measured state yet).
  if (!c) return 0.65
  return conceptScore(ctx, c, false)
}

function targetConceptIds(ctx: RevisionContext): string[] {
  const ids = new Set<string>()
  for (const m of ctx.mistakes) if (m.conceptId) ids.add(m.conceptId)
  for (const c of ctx.concepts.values()) if (isTargetConcept(ctx, c)) ids.add(c.conceptId)
  return [...ids].sort((a, b) => targetScore(ctx, b) - targetScore(ctx, a) || a.localeCompare(b))
}

// ─── CANDIDATE BUILDERS ──────────────────────────────────────────────────────

function conceptCandidates(ctx: RevisionContext, now: Date, examNear: boolean): Candidate[] {
  const out: Candidate[] = []
  for (const c of ctx.concepts.values()) {
    const engaged = c.attemptCount > 0
    if (!engaged && !c.onRevisionList) continue
    if (c.recall > 0.9 && c.mastery >= 75) continue // solid — revision not needed now

    const forgot = ctx.forgot30.get(c.conceptId) ?? 0
    const why: RevisionWhy[] = [
      { label: 'Recall', note: c.recallMeasured ? `recall est ${pct(c.recall)}%` : 'recall unmeasured — never revised' },
      { label: 'Mastery', note: `mastery ${Math.round(c.mastery)}%` },
    ]
    if (forgot > 0) why.push({ label: 'Misses', note: `missed ${forgot}× (forgot)` })
    if (c.examRelevance >= 4) why.push({ label: 'Exam weight', note: `exam weight ${c.examRelevance}/5` })
    if (c.onRevisionList) why.push({ label: 'Revision list', note: 'on your revision list' })

    const parts: string[] = []
    if (c.onRevisionList && c.revisionItemReason) parts.push(`open revision item: ${c.revisionItemReason}`)
    else if (!c.recallMeasured) parts.push('practiced but never revised — recall unmeasured')
    else if (c.recall >= 0.85 && c.mastery < 60)
      parts.push(`mastery ${Math.round(c.mastery)}% — recall is fresh, mastery is not — one more pass`)
    else parts.push(`estimated recall ${pct(c.recall)}% — last revised ${daysLabel(c.daysSince)}`)
    if (forgot >= 2) parts.push(`mastery ${Math.round(c.mastery)}% with ${forgot} 'forgot' errors in the last month`)

    out.push({
      subjectCode: c.subjectCode,
      block: {
        id: `concept:${c.conceptId}`,
        kind: 'concept',
        title: c.name,
        subtitle: `${c.subjectName} · ${c.topicName}`,
        minutes: 5,
        reason: parts.join(' · '),
        why,
        conceptId: c.conceptId,
        topicId: c.topicId,
        done: false,
      },
    })
  }
  return out.sort(
    (a, b) =>
      conceptScore(ctx, ctx.concepts.get(a.block.conceptId!)!, examNear) -
        conceptScore(ctx, ctx.concepts.get(b.block.conceptId!)!, examNear) ||
      a.block.id.localeCompare(b.block.id),
  )
}

function mistakeCandidates(ctx: RevisionContext, now: Date): Candidate[] {
  return [...ctx.mistakes]
    .sort(
      (a, b) =>
        b.wrongCount - a.wrongCount ||
        b.lastWrongAt.getTime() - a.lastWrongAt.getTime() ||
        a.recordId.localeCompare(b.recordId),
    )
    .map((m) => {
      const why: RevisionWhy[] = [{ label: 'Misses', note: `missed ${m.wrongCount}×` }]
      const state = m.conceptId ? ctx.concepts.get(m.conceptId) : undefined
      if (state?.recallMeasured) why.push({ label: 'Recall', note: `recall est ${pct(state.recall)}%` })
      if (m.pyqPattern) why.push({ label: 'PYQ', note: 'PYQ-pattern' })

      let statusHint = ''
      if (m.status === 'revising') statusHint = ' · revision item open'
      else if (m.status === 'retested') statusHint = ' · one more correct retest resolves it'

      return {
        subjectCode: m.subjectCode,
        block: {
          id: `mistake:${m.recordId}`,
          kind: 'mistake' as const,
          title: m.conceptName ?? m.topicName ?? m.subjectName,
          subtitle: `${m.subjectName}${m.topicName ? ` · ${m.topicName}` : ''}`,
          minutes: 2,
          reason: `missed ${m.wrongCount}× — last ${daysLabelFrom(m.lastWrongAt, now)}${statusHint}`,
          why,
          recordId: m.recordId,
          questionIds: [m.questionId],
          conceptId: m.conceptId ?? undefined,
          done: false,
        },
      }
    })
}

function flashcardCandidates(ctx: RevisionContext, now: Date, batchSize: number): Candidate[] {
  const chunks: RevisionFlashcardCtx[][] = []
  for (let i = 0; i < ctx.dueCards.length; i += batchSize) chunks.push(ctx.dueCards.slice(i, i + batchSize))
  return chunks.map((chunk) => {
    const counts = new Map<string, number>()
    for (const card of chunk) counts.set(card.subjectCode, (counts.get(card.subjectCode) ?? 0) + 1)
    // insertion order (first-seen subject) breaks ties — deterministic
    let dominant = chunk[0]!.subjectCode
    let max = 0
    for (const [code, n] of counts) if (n > max) { max = n; dominant = code }

    const oldestAge = Math.max(...chunk.map((c) => (now.getTime() - c.dueAt.getTime()) / DAY))
    const oldestLabel = oldestAge < 1 ? 'due today' : `oldest due ${Math.round(oldestAge)}d ago`
    const n = chunk.length
    return {
      subjectCode: dominant,
      block: {
        id: `flashcards:${chunk[0]!.cardId}`,
        kind: 'flashcards' as const,
        title: `${n} due flashcards`,
        subtitle: ctx.subjectNames.get(dominant) ?? dominant,
        minutes: Math.max(2, Math.ceil(n * 0.7)),
        reason: `${n} cards due in your deck — ${oldestLabel}`,
        why: [
          { label: 'Due', note: `${n} cards due` },
          { label: 'Oldest', note: oldestLabel },
        ],
        flashcardIds: chunk.map((c) => c.cardId),
        done: false,
      },
    }
  })
}

function buildMcqBlock(
  ctx: RevisionContext,
  kind: 'mcq' | 'pyq',
  conceptId: string,
  pool: RevisionQuestionPoolEntry[],
): Candidate | null {
  if (!pool.length) return null
  const name = ctx.conceptNames.get(conceptId) ?? conceptId
  const meta = ctx.concepts.get(conceptId)
  const subjectCode = meta?.subjectCode ?? pool[0]!.subjectCode
  const subjectName = ctx.subjectNames.get(subjectCode) ?? subjectCode
  const subtitle = meta ? `${subjectName} · ${meta.topicName}` : subjectName

  const why: RevisionWhy[] = []
  if (meta) why.push({ label: 'Mastery', note: `mastery ${Math.round(meta.mastery)}%` })
  const acc = ctx.acc30.get(conceptId)
  if (acc && acc.total >= 2) why.push({ label: 'Accuracy', note: `accuracy ${pct(acc.correct / acc.total)}% last 30d` })
  if (kind === 'pyq') why.push({ label: 'PYQ', note: 'PYQ-pattern' })

  const accText = acc && acc.total >= 2 ? `, accuracy ${pct(acc.correct / acc.total)}% last 30d` : ''
  const reason =
    kind === 'pyq'
      ? `PYQ-pattern practice on ${name} — ${pool.length} repeated-exam-theme question${pool.length > 1 ? 's' : ''} available`
      : meta
        ? `targeted practice — mastery ${Math.round(meta.mastery)}%${accText}`
        : 'targeted practice — you have logged mistakes on this concept'

  return {
    subjectCode,
    block: {
      id: `${kind}:${conceptId}`,
      kind,
      title: name,
      subtitle,
      minutes: 5,
      reason,
      why,
      questionIds: pool.map((q) => q.id),
      conceptId,
      done: false,
    },
  }
}

function mcqCandidates(ctx: RevisionContext, qtype?: string): Candidate[] {
  const out: Candidate[] = []
  for (const cid of targetConceptIds(ctx)) {
    const pool = ctx.questions
      .filter((q) => q.conceptId === cid && !ctx.openMistakeQuestionIds.has(q.id) && (!qtype || q.qtype === qtype))
      .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))
      .slice(0, 4)
    const candidate = buildMcqBlock(ctx, 'mcq', cid, pool)
    if (candidate) out.push(candidate)
  }
  return out
}

function pyqCandidates(ctx: RevisionContext): Candidate[] {
  const out: Candidate[] = []
  for (const cid of targetConceptIds(ctx)) {
    const pool = ctx.questions
      .filter((q) => q.conceptId === cid && q.pyqPattern && !ctx.openMistakeQuestionIds.has(q.id))
      .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))
      .slice(0, 4)
    const candidate = buildMcqBlock(ctx, 'pyq', cid, pool)
    if (candidate) out.push(candidate)
  }
  return out
}

function weakerCompareSide(ctx: RevisionContext, pair: { aCode: string; bCode: string }, wrongSet: Set<string>): string {
  if (wrongSet.has(pair.aCode) && !wrongSet.has(pair.bCode)) return pair.aCode
  if (wrongSet.has(pair.bCode) && !wrongSet.has(pair.aCode)) return pair.bCode
  const a = ctx.concepts.get(pair.aCode)
  const b = ctx.concepts.get(pair.bCode)
  if (a && b) return a.mastery <= b.mastery ? pair.aCode : pair.bCode
  if (a) return pair.aCode
  if (b) return pair.bCode
  return pair.aCode
}

function compareCandidates(ctx: RevisionContext): Candidate[] {
  const valid = ctx.pairs.filter((p) => p.aCode && p.bCode)
  if (!valid.length) return []
  const wrongSet = new Set(targetConceptIds(ctx))
  const matched = valid
    .filter((p) => wrongSet.has(p.aCode) || wrongSet.has(p.bCode))
    .sort((a, b) => targetScore(ctx, weakerCompareSide(ctx, a, wrongSet)) - targetScore(ctx, weakerCompareSide(ctx, b, wrongSet)) || a.id.localeCompare(b.id))

  let pair = matched[0]
  let matchedByMistakes = true
  if (!pair) {
    // Fallback: the subject with the lowest measured 30d accuracy (>= 2 attempts).
    const measured = [...ctx.subjectAcc.entries()]
      .filter(([, a]) => a.total >= 2)
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total || a[0].localeCompare(b[0]))
    for (const [code] of measured) {
      const inSubject = valid.filter((p) => p.subjectCode === code).sort((a, b) => a.id.localeCompare(b.id))
      if (inSubject.length) {
        pair = inSubject[0]
        matchedByMistakes = false
        break
      }
    }
  }
  if (!pair) return [] // no measured basis — honest skip

  const why: RevisionWhy[] = [
    { label: 'Confusion', note: matchedByMistakes ? 'both sides in your recent mistakes' : 'weakest subject pair' },
  ]
  if (pair.mnemonic) why.push({ label: 'Mnemonic', note: pair.mnemonic })

  return [
    {
      subjectCode: pair.subjectCode,
      block: {
        id: `compare:${pair.id}`,
        kind: 'compare',
        title: `${pair.a} vs ${pair.b}`,
        subtitle: ctx.subjectNames.get(pair.subjectCode) ?? pair.subjectCode,
        minutes: 4,
        reason: matchedByMistakes ? 'both sides appeared in your recent mistakes' : 'weakest subject pair',
        why,
        pairId: pair.id,
        conceptId: weakerCompareSide(ctx, pair, wrongSet),
        done: false,
      },
    },
  ]
}

function caseCandidates(ctx: RevisionContext): Candidate[] {
  const weakSystems = new Map<string, { mastery: number | null }>()
  for (const cid of targetConceptIds(ctx)) {
    const c = ctx.concepts.get(cid)
    if (c?.topicSystem && !weakSystems.has(c.topicSystem)) {
      weakSystems.set(c.topicSystem, { mastery: c.attemptCount > 0 ? Math.round(c.mastery) : null })
    }
  }
  if (!weakSystems.size) return []
  const match = ctx.cases
    .filter((c) => weakSystems.has(c.system))
    .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))[0]
  if (!match) return []
  const sys = weakSystems.get(match.system)!
  return [
    {
      subjectCode: '', // cases carry specialty/system, not a subject — excluded by subject filters
      block: {
        id: `case:${match.id}`,
        kind: 'case',
        title: match.title,
        subtitle: `${match.specialty}${match.system ? ` · ${match.system}` : ''}`,
        minutes: 12,
        reason: `clinical case on ${match.system} — one of your weaker systems`,
        why: [
          {
            label: 'Weak system',
            note: sys.mastery !== null ? `${match.system} — mastery ${sys.mastery}%` : `${match.system} — logged mistakes`,
          },
        ],
        caseId: match.id,
        done: false,
      },
    },
  ]
}

// ─── MODE ASSEMBLY ───────────────────────────────────────────────────────────

function interleave(a: Candidate[], b: Candidate[]): Candidate[] {
  const out: Candidate[] = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]!)
    if (i < b.length) out.push(b[i]!)
  }
  return out
}

function assembleCandidates(
  ctx: RevisionContext,
  mode: RevisionMode,
  minutes: number,
  examNear: boolean,
): Candidate[] {
  switch (mode) {
    case 'daily': {
      const mistakes = mistakeCandidates(ctx, new Date()).slice(0, 3)
      const concepts = conceptCandidates(ctx, new Date(), examNear).slice(0, 4)
      const flash = flashcardCandidates(ctx, new Date(), 10).slice(0, 1)
      const mcq = mcqCandidates(ctx).slice(0, 1)
      const compare = compareCandidates(ctx).slice(0, 1)
      const pyq = pyqCandidates(ctx).slice(0, 1)
      const cases = minutes >= 20 ? caseCandidates(ctx).slice(0, 1) : []
      return [...interleave(mistakes, concepts), ...flash, ...mcq, ...compare, ...pyq, ...cases]
    }
    case 'rapid': {
      const top = conceptCandidates(ctx, new Date(), examNear)[0]
      const concept: Candidate[] = top
        ? [
            {
              ...top,
              block: {
                ...top.block,
                reason: `highest forgetting risk — ${top.block.why[0]?.note ?? 'recall unmeasured'}`,
              },
            },
          ]
        : []
      const flash = flashcardCandidates(ctx, new Date(), 8).slice(0, 1)
      const mcq = mcqCandidates(ctx, 'rapid').slice(0, 1)
      return [...concept, ...flash, ...mcq]
    }
    case 'weak': {
      const concepts = conceptCandidates(ctx, new Date(), examNear).slice(0, 8)
      const weakestId = concepts[0]?.block.conceptId
      const mcq = weakestId ? mcqCandidates(ctx).filter((c) => c.block.conceptId === weakestId).slice(0, 1) : []
      return [...concepts, ...mcq]
    }
    case 'mistake':
      return mistakeCandidates(ctx, new Date()).slice(0, 12)
    case 'pyq': {
      const pyq = pyqCandidates(ctx)
      const mistakePyq = mistakeCandidates(ctx, new Date()).filter((m) => m.block.why.some((w) => w.note === 'PYQ-pattern'))
      return [...pyq, ...mistakePyq]
    }
    case 'flashcard':
      return flashcardCandidates(ctx, new Date(), 10)
    case 'high-yield': {
      const concepts = conceptCandidates(ctx, new Date(), examNear)
        .filter((c) => {
          const meta = ctx.concepts.get(c.block.conceptId!)
          return !!meta && (meta.topicImportance >= 4 || meta.examRelevance >= 4)
        })
        .slice(0, 6)
      const pyq = pyqCandidates(ctx).slice(0, 1)
      const mistakes = mistakeCandidates(ctx, new Date()).slice(0, 2)
      const cases = caseCandidates(ctx).slice(0, 1)
      return [...concepts, ...pyq, ...mistakes, ...cases]
    }
    case 'custom':
      return [
        ...mistakeCandidates(ctx, new Date()),
        ...conceptCandidates(ctx, new Date(), examNear),
        ...flashcardCandidates(ctx, new Date(), 10),
        ...mcqCandidates(ctx),
        ...compareCandidates(ctx),
        ...pyqCandidates(ctx),
        ...caseCandidates(ctx),
      ]
  }
}

function greedyFill(candidates: Candidate[], minutes: number): RevisionBlock[] {
  const blocks: RevisionBlock[] = []
  let total = 0
  for (const c of candidates) {
    if (blocks.length === 0) {
      // Always offer at least the top candidate, even if it overshoots.
      blocks.push(c.block)
      total += c.block.minutes
      continue
    }
    if (total + c.block.minutes <= minutes) {
      blocks.push(c.block)
      total += c.block.minutes
    }
  }
  return blocks
}

// ─── PLAN BUILDER (pure + deterministic) ─────────────────────────────────────

const PLAN_NOTE = 'Built from your knowledge states, mistakes and due cards — not a fixed schedule.'

function noteFor(exam: RevisionExamClock | null): string {
  return PLAN_NOTE + (exam?.near ? ` Exam in ${exam.daysLeft}d — priorities shifted to weak topics, mistakes and PYQs.` : '')
}

export function headlineFromBlocks(blocks: RevisionBlock[]): string {
  if (!blocks.length) return 'Nothing queued right now'
  const concepts = blocks.filter((b) => b.kind === 'concept').length
  const mistakes = blocks.filter((b) => b.kind === 'mistake').length
  const cards = blocks.filter((b) => b.kind === 'flashcards').reduce((a, b) => a + (b.flashcardIds?.length ?? 0), 0)
  const mcqQ = blocks.filter((b) => b.kind === 'mcq').reduce((a, b) => a + (b.questionIds?.length ?? 0), 0)
  const pyqQ = blocks.filter((b) => b.kind === 'pyq').reduce((a, b) => a + (b.questionIds?.length ?? 0), 0)
  const compares = blocks.filter((b) => b.kind === 'compare').length
  const cases = blocks.filter((b) => b.kind === 'case').length
  const parts: string[] = []
  if (concepts) parts.push(`${concepts} concept${concepts > 1 ? 's' : ''} at forgetting risk`)
  if (mistakes) parts.push(`${mistakes} mistake${mistakes > 1 ? 's' : ''}`)
  if (cards) parts.push(`${cards} due cards`)
  if (mcqQ) parts.push(`${mcqQ} MCQs`)
  if (compares) parts.push(`${compares} confusion pair${compares > 1 ? 's' : ''}`)
  if (pyqQ) parts.push(`${pyqQ} PYQs`)
  if (cases) parts.push(`${cases} clinical case${cases > 1 ? 's' : ''}`)
  return parts.join(' · ') || 'Nothing queued right now'
}

export function buildPlan(
  ctx: RevisionContext,
  mode: RevisionMode,
  minutes: number,
  filters?: { subjects?: string[]; kinds?: RevisionBlockKind[] },
): RevisionQueuePlan {
  const now = new Date()
  const exam = examClockFor(ctx)
  const near = exam?.near ?? false
  let candidates = assembleCandidates(ctx, mode, minutes, near)
  if (filters?.subjects?.length) {
    const subjects = new Set(filters.subjects)
    candidates = candidates.filter((c) => c.subjectCode && subjects.has(c.subjectCode))
  }
  if (filters?.kinds?.length) {
    const kinds = new Set(filters.kinds)
    candidates = candidates.filter((c) => kinds.has(c.block.kind))
  }
  const blocks = greedyFill(candidates, minutes)
  return {
    mode,
    minutes,
    blocks,
    generatedAt: now.toISOString(),
    headline: headlineFromBlocks(blocks),
    exam,
    note: noteFor(exam),
  }
}

// Real queue size per mode (used for the home mode counts).
export function countModeBlocks(ctx: RevisionContext, mode: RevisionMode): number {
  return buildPlan(ctx, mode, 20).blocks.length
}

// ─── INTELLIGENCE PANEL ──────────────────────────────────────────────────────

export function buildIntelligence(ctx: RevisionContext): RevisionIntelligence {
  const concepts = [...ctx.concepts.values()]
  const byId = (a: RevisionConceptCtx, b: RevisionConceptCtx) => a.conceptId.localeCompare(b.conceptId)

  const overdue = concepts.filter((c) => c.lastReviewed && c.recall < 0.6).sort((a, b) => a.recall - b.recall || byId(a, b))
  const forgotten = concepts
    .filter((c) => (ctx.forgot30.get(c.conceptId) ?? 0) >= 2 && c.recall < 0.75)
    .sort((a, b) => a.recall - b.recall || byId(a, b))
  const repeatedMistakes = ctx.mistakes
    .filter((m) => m.wrongCount >= 2)
    .sort(
      (a, b) =>
        b.wrongCount - a.wrongCount ||
        b.lastWrongAt.getTime() - a.lastWrongAt.getTime() ||
        a.recordId.localeCompare(b.recordId),
    )
  const strong = concepts
    .filter((c) => c.status === 'strong' && c.mastery >= 75 && c.recall > 0.8)
    .sort((a, b) => b.mastery - a.mastery || byId(a, b))
  const gaps = concepts
    .filter((c) => c.attemptCount > 0 && !c.lastReviewed)
    .sort((a, b) => b.attemptCount - a.attemptCount || byId(a, b))
  const highRisk = concepts
    .filter((c) => c.mastery < 50 && c.examRelevance >= 4)
    .sort((a, b) => a.mastery - b.mastery || byId(a, b))

  return {
    overdue: overdue.slice(0, 8).map((c) => ({
      conceptId: c.conceptId,
      name: c.name,
      recall: Math.round(c.recall * 100) / 100,
      daysSince: c.daysSince === null ? null : Math.round(c.daysSince),
    })),
    forgotten: forgotten.slice(0, 8).map((c) => ({
      conceptId: c.conceptId,
      name: c.name,
      forgotCount: ctx.forgot30.get(c.conceptId) ?? 0,
      recall: Math.round(c.recall * 100) / 100,
    })),
    repeatedMistakes: repeatedMistakes.slice(0, 8).map((m) => ({
      questionId: m.questionId,
      conceptId: m.conceptId,
      conceptName: m.conceptName,
      topic: m.topicName ?? m.subjectName,
      wrongCount: m.wrongCount,
    })),
    strong: strong.slice(0, 8).map((c) => ({ conceptId: c.conceptId, name: c.name, score: Math.round(c.mastery) })),
    gaps: gaps.slice(0, 8).map((c) => ({
      conceptId: c.conceptId,
      name: c.name,
      attempts: c.attemptCount,
      lastReviewed: null, // gaps are defined by never having been revised
    })),
    highRisk: highRisk.slice(0, 8).map((c) => ({
      conceptId: c.conceptId,
      name: c.name,
      mastery: Math.round(c.mastery),
      examWeight: c.examRelevance,
    })),
    counts: {
      overdue: overdue.length,
      forgotten: forgotten.length,
      repeated: repeatedMistakes.length,
      strong: strong.length,
      gaps: gaps.length,
      highRisk: highRisk.length,
    },
  }
}

// ─── STORED PLAN (session snapshots) ─────────────────────────────────────────
// The DB stores the RevisionBlock[] snapshot only (ids + reasons, never
// answers). The plan shell (headline/note/exam) is rebuilt from the stored
// blocks + the current context on resume.

export function parseStoredBlocks(raw: unknown): RevisionBlock[] {
  let data = raw
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  return data.filter(
    (b): b is RevisionBlock =>
      !!b && typeof b === 'object' && typeof (b as RevisionBlock).id === 'string' && typeof (b as RevisionBlock).kind === 'string',
  )
}

export function planFromStored(
  session: { mode: string; config: unknown; minutes: number; createdAt: Date },
  storedBlocks: RevisionBlock[],
  ctx: RevisionContext,
): RevisionQueuePlan {
  let storedMinutes = session.minutes
  if (typeof session.config === 'string') {
    try {
      const cfg = JSON.parse(session.config) as { minutes?: unknown }
      if (typeof cfg.minutes === 'number' && Number.isFinite(cfg.minutes)) storedMinutes = cfg.minutes
    } catch {
      /* keep session.minutes */
    }
  } else if (session.config && typeof session.config === 'object') {
    const cfg = session.config as { minutes?: unknown }
    if (typeof cfg.minutes === 'number' && Number.isFinite(cfg.minutes)) storedMinutes = cfg.minutes
  }
  const exam = examClockFor(ctx)
  return {
    mode: session.mode as RevisionMode,
    minutes: storedMinutes,
    blocks: storedBlocks,
    generatedAt: session.createdAt.toISOString(),
    headline: headlineFromBlocks(storedBlocks),
    exam,
    note: noteFor(exam),
  }
}

// ─── CONTENT HYDRATION ───────────────────────────────────────────────────────
// Answers/explanations are NEVER included — grading always goes through
// /api/attempts (recordAttempt = one shared knowledge engine).

export interface ConceptDetailSection {
  h: string
  body: string[]
  table?: { head: string[]; rows: string[][] }
}

export function parseConceptDetail(raw: unknown): ConceptDetailSection[] | null {
  if (!Array.isArray(raw)) return null
  const out: ConceptDetailSection[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const h = typeof o.h === 'string' ? o.h : ''
    const body = Array.isArray(o.body) ? o.body.filter((b): b is string => typeof b === 'string') : []
    if (!h && !body.length) continue
    let table: ConceptDetailSection['table'] | undefined
    if (o.table && typeof o.table === 'object') {
      const t = o.table as Record<string, unknown>
      const head = Array.isArray(t.head) ? t.head.filter((x): x is string => typeof x === 'string') : []
      const rows = Array.isArray(t.rows)
        ? t.rows
            .filter((r): r is unknown[] => Array.isArray(r))
            .map((r) => r.filter((x): x is string => typeof x === 'string'))
        : []
      if (head.length && rows.length) table = { head, rows }
    }
    out.push({ h, body, ...(table ? { table } : {}) })
  }
  return out.length ? out : null
}

// Up to 6 short bullets: prefer lines that carry a ':' or a number (they read
// as facts); fall back to the first sentence of each section.
export function keyFactsFromDetail(sections: ConceptDetailSection[] | null, summary: string): string[] {
  if (!sections || !sections.length) return summary ? [summary] : []
  const facts: string[] = []
  for (const s of sections) {
    for (const line of s.body) {
      if (facts.length >= 6) break
      const trimmed = line.trim()
      if (trimmed && trimmed.length <= 160 && /[:\d]/.test(trimmed) && !facts.includes(trimmed)) facts.push(trimmed)
    }
    if (facts.length >= 6) break
  }
  if (facts.length < 6) {
    for (const s of sections) {
      if (facts.length >= 6) break
      const raw = s.body[0]?.trim() || s.h
      const firstSentence = raw.split('. ')[0] ?? raw
      if (firstSentence && !facts.includes(firstSentence)) facts.push(firstSentence)
    }
  }
  return facts.slice(0, 6)
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}

export async function hydrateContent(ctx: RevisionContext, plan: { blocks: RevisionBlock[] }): Promise<RevisionSessionContent> {
  const blocks = plan.blocks
  const questionIds = [...new Set(blocks.flatMap((b) => b.questionIds ?? []))]
  const conceptIds = [...new Set(blocks.filter((b) => b.kind === 'concept' && b.conceptId).map((b) => b.conceptId!))]
  const flashcardIds = [...new Set(blocks.flatMap((b) => b.flashcardIds ?? []))]
  const pairIds = [...new Set(blocks.filter((b) => b.kind === 'compare' && b.pairId).map((b) => b.pairId!))]
  const caseIds = [...new Set(blocks.filter((b) => b.kind === 'case' && b.caseId).map((b) => b.caseId!))]

  const [questionRows, conceptRows, flashcardRows, pairRows, caseRows] = await Promise.all([
    questionIds.length
      ? db.question.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true, stem: true, options: true, difficulty: true, qtype: true,
            subjectCode: true, conceptId: true, imageUrl: true, tags: true,
            concept: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    conceptIds.length
      ? db.concept.findMany({
          where: { id: { in: conceptIds } },
          include: { topic: { select: { name: true, subject: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
    flashcardIds.length
      ? db.flashcard.findMany({ where: { id: { in: flashcardIds } } })
      : Promise.resolve([]),
    pairIds.length ? db.confusionPair.findMany({ where: { id: { in: pairIds } } }) : Promise.resolve([]),
    caseIds.length
      ? db.clinicalCase.findMany({
          where: { id: { in: caseIds } },
          select: { id: true, title: true, specialty: true, system: true, difficulty: true },
        })
      : Promise.resolve([]),
  ])

  const questions: Record<string, RevisionQuestionContent> = {}
  for (const q of questionRows) {
    let pyq = false
    if (Array.isArray(q.tags)) pyq = (q.tags as unknown[]).some((t) => t === 'pyq-pattern')
    questions[q.id] = {
      id: q.id,
      stem: q.stem,
      options: (Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : []).filter(
        (o) => o && typeof o.id === 'string' && typeof o.text === 'string',
      ),
      difficulty: q.difficulty,
      qtype: q.qtype,
      subjectCode: q.subjectCode,
      conceptId: q.conceptId,
      conceptName: q.concept?.name ?? null,
      imageUrl: q.imageUrl,
      pyqPattern: pyq,
    }
  }

  const concepts: Record<string, RevisionConceptContent> = {}
  for (const c of conceptRows) {
    const sections = parseConceptDetail(c.detail)
    concepts[c.id] = {
      id: c.id,
      name: c.name,
      summary: c.summary,
      whyMatters: c.whyMatters,
      mnemonic: c.mnemonic,
      examRelevance: c.examRelevance,
      topicId: c.topicId,
      topicName: c.topic.name,
      subjectName: c.topic.subject.name,
      detail: sections,
      keyFacts: keyFactsFromDetail(sections, c.summary),
    }
  }

  const flashcards: Record<string, RevisionFlashcardContent> = {}
  for (const f of flashcardRows) {
    flashcards[f.id] = { id: f.id, front: f.front, back: f.back, subjectCode: f.subjectCode }
  }

  const pairs: Record<string, RevisionPairContent> = {}
  for (const p of pairRows) {
    pairs[p.id] = {
      id: p.id,
      a: p.a,
      b: p.b,
      aPoints: stringArray(p.aPoints),
      bPoints: stringArray(p.bPoints),
      mnemonic: p.mnemonic,
      subjectCode: p.subjectCode,
    }
  }

  const cases: Record<string, RevisionCaseContent> = {}
  for (const c of caseRows) {
    cases[c.id] = { id: c.id, title: c.title, specialty: c.specialty, system: c.system, difficulty: c.difficulty }
  }

  return { questions, concepts, flashcards, pairs, cases }
}

// ─── CONCEPT STRENGTHENING (shared with block completion) ────────────────────
// Same semantics as POST /api/revision/clear: clear the concept's open
// RevisionItems, strengthen the KnowledgeState, log one StudySession.
// Best-effort — a failure here must never fail the block request.

export async function touchConceptReview(
  profileId: string,
  conceptId: string,
  minutes: number,
  label: string,
): Promise<boolean> {
  try {
    // updateMany is scoped to this profile, so a foreign conceptId no-ops.
    await db.revisionItem.updateMany({
      where: { profileId, conceptId, cleared: false },
      data: { cleared: true, clearedAt: new Date() },
    })
    let touched = false
    const state = await db.knowledgeState.findUnique({
      where: { profileId_conceptId: { profileId, conceptId } },
    })
    if (state) {
      const now = new Date()
      const days = state.lastReviewed ? (now.getTime() - state.lastReviewed.getTime()) / DAY : 999
      const recall = estimatedRecall(days, state.stability)
      const blended = state.score * recall + state.score * (1 - recall) * 0.5
      const upd = updateKnowledge(blended, state.stability, true, 2)
      await db.knowledgeState.update({
        where: { id: state.id },
        data: {
          score: Math.min(100, upd.score + 4),
          stability: Math.min(180, upd.stability * 1.15),
          estRecall: Math.min(1, recall + 0.3),
          lastReviewed: now,
          lastCorrect: now,
          status: statusFor(upd.score, Math.min(1, recall + 0.3)),
        },
      })
      touched = true
    }
    await db.studySession.create({
      data: { profileId, minutes, kind: 'revision', label },
    })
    return touched
  } catch (err) {
    console.error('touchConceptReview failed:', err)
    return false
  }
}
