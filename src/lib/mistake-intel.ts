import { db } from '@/lib/db'
import { DAY, estimatedRecall } from '@/lib/engine'
import { ERROR_TYPE_LABELS } from '@/lib/types'
import type {
  MistakeFactor,
  MistakePatternCard,
  MistakeRow,
  MistakeStatus,
} from '@/lib/types'

// ─── MISTAKE INTELLIGENCE ENGINE (PRODUCT 05) ────────────────────────────────
// Deterministic, measured, honest. Three jobs:
//   1. ensureMistakeRecords — keep the MistakeRecord bank in sync with the
//      attempt feed (backfills history, so every past wrong answer counts).
//   2. priorityFor — a 0..100 score built ONLY from measurable factors, each
//      with a human note. No model, no hidden weights, no chain-of-thought —
//      the factors are returned so the UI can show exactly why a mistake
//      ranks where it does.
//   3. detectPatterns — concept-level weaknesses, curated confusion pairs,
//      subject×error-type paradoxes, speed/overconfidence/difficulty signals.

export interface MistakeQuestionMeta {
  id: string
  stem: string
  options: unknown
  answer: string
  subjectCode: string
  subjectName?: string | null
  topicName?: string | null
  conceptId: string | null
  conceptName: string | null
  difficulty: number
  qtype: string
  pyqPattern: boolean
  imageUrl: string | null
}

export interface MistakeStateMeta {
  score: number // 0..100 mastery
  estRecall: number // 0..1 (at last review)
  stability: number // memory stability in days (SRS model)
  lastReviewed: Date | null
}

const FAST_MISS_MS = 15_000
const TODAY_MS = 24 * 3600_000

// ─── 1 · SYNC THE BANK FROM THE ATTEMPT FEED ─────────────────────────────────
// groupBy gives counts + first/last per question in one query; a second pass
// fills lastSelected/lastErrorType from each question's latest wrong attempt.
export async function ensureMistakeRecords(profileId: string): Promise<void> {
  const grouped = await db.questionAttempt.groupBy({
    by: ['questionId'],
    where: { profileId, correct: false },
    _count: { _all: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
  })
  if (grouped.length === 0) return

  const questionIds = grouped.map((g) => g.questionId)
  const [questions, latestWrongs, existing] = await Promise.all([
    db.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, conceptId: true },
    }),
    db.questionAttempt.findMany({
      where: { profileId, correct: false, questionId: { in: questionIds } },
      orderBy: { createdAt: 'desc' },
      select: { questionId: true, selected: true, errorType: true, createdAt: true },
    }),
    db.mistakeRecord.findMany({
      where: { profileId, questionId: { in: questionIds } },
      select: { id: true, questionId: true, wrongCount: true, lastWrongAt: true },
    }),
  ])

  const conceptByQuestion = new Map(questions.map((q) => [q.id, q.conceptId]))
  const latestByQuestion = new Map<string, { selected: string; errorType: string | null }>()
  for (const a of latestWrongs) {
    if (!latestByQuestion.has(a.questionId)) {
      latestByQuestion.set(a.questionId, { selected: a.selected, errorType: a.errorType })
    }
  }
  const existingByQuestion = new Map(existing.map((r) => [r.questionId, r]))

  for (const g of grouped) {
    const count = g._count._all
    const lastAt = g._max.createdAt ?? new Date()
    const firstAt = g._min.createdAt ?? lastAt
    const latest = latestByQuestion.get(g.questionId)
    const existingRow = existingByQuestion.get(g.questionId)
    if (!existingRow) {
      await db.mistakeRecord.create({
        data: {
          profileId,
          questionId: g.questionId,
          conceptId: conceptByQuestion.get(g.questionId) ?? null,
          wrongCount: count,
          firstWrongAt: firstAt,
          lastWrongAt: lastAt,
          lastSelected: latest?.selected ?? '',
          lastErrorType: latest?.errorType ?? null,
        },
      })
    } else if (existingRow.wrongCount < count || existingRow.lastWrongAt < lastAt) {
      await db.mistakeRecord.update({
        where: { id: existingRow.id },
        data: {
          wrongCount: count,
          lastWrongAt: lastAt,
          lastSelected: latest?.selected ?? '',
          lastErrorType: latest?.errorType ?? null,
        },
      })
    }
  }
}

// ─── 2 · MEASURED PRIORITY (0..100) ──────────────────────────────────────────
export function priorityFor(
  wrongCount: number,
  lastWrongAt: Date,
  question: MistakeQuestionMeta,
  state: MistakeStateMeta | null,
  lastTimeMs: number,
  lastConfidence: number,
): { priority: number; factors: MistakeFactor[] } {
  const factors: MistakeFactor[] = []
  const now = Date.now()
  const hoursSince = Math.max(0, (now - lastWrongAt.getTime()) / 3600_000)

  // frequency (25) — repeated mistakes deserve the most attention
  const freq = Math.min(wrongCount, 4) / 4
  factors.push({
    id: 'frequency',
    label: 'Frequency',
    note: wrongCount >= 2 ? `missed ${wrongCount}×` : 'first miss',
    points: Math.round(freq * 25),
  })

  // exam relevance (15) — measured from the platform's own tags, nothing invented
  const exam =
    question.pyqPattern ? 15 : question.difficulty === 3 ? 9 : (question.qtype === 'vignette' || question.qtype === 'integrated') ? 6 : 3
  factors.push({
    id: 'exam',
    label: 'Exam relevance',
    note: question.pyqPattern
      ? 'repeated exam theme (PYQ-pattern)'
      : question.difficulty === 3
        ? 'hard stem (difficulty 3)'
        : question.qtype === 'vignette' || question.qtype === 'integrated'
          ? 'clinical-vignette style'
          : 'standard stem',
    points: exam,
  })

  // topic weakness (20) — the concept's own measured mastery
  const mastery = state?.score
  const weaknessPts =
    mastery === undefined ? 12 : Math.round((1 - Math.min(100, Math.max(0, mastery)) / 100) * 20)
  factors.push({
    id: 'weakness',
    label: 'Topic weakness',
    note:
      mastery === undefined
        ? question.conceptName
          ? 'concept not yet measured'
          : 'no linked concept to measure'
        : `mastery ${mastery}%`,
    points: weaknessPts,
  })

  // recency (10) — a miss from today outranks one from three weeks ago
  const recencyPts = hoursSince <= 24 ? 10 : Math.max(0, Math.round(10 * (1 - hoursSince / (21 * 24))))
  factors.push({
    id: 'recency',
    label: 'Recency',
    note: hoursSince < 1 ? 'missed minutes ago' : hoursSince <= 24 ? 'missed today' : `last missed ${Math.round(hoursSince / 24)}d ago`,
    points: recencyPts,
  })

  // forgetting risk (20) — estimated recall from the SRS model when known
  let forgettingPts: number
  let forgettingNote: string
  if (state && state.lastReviewed) {
    const days = Math.max(0, (now - state.lastReviewed.getTime()) / DAY)
    const recall = estimatedRecall(days, Math.max(0.2, state.stability))
    forgettingPts = Math.round((1 - recall) * 20)
    forgettingNote = `estimated recall ${Math.round(recall * 100)}%`
  } else {
    forgettingPts = hoursSince > 7 * 24 ? 10 : 4
    forgettingNote = hoursSince > 7 * 24 ? 'unreviewed for over a week' : 'recall not yet measured'
  }
  factors.push({ id: 'forgetting', label: 'Forgetting risk', note: forgettingNote, points: forgettingPts })

  // careless-signal (10) — very fast or overconfident misses
  const fast = lastTimeMs > 0 && lastTimeMs < FAST_MISS_MS
  const overconfident = lastConfidence >= 4
  factors.push({
    id: 'careless',
    label: 'Careless risk',
    note: fast && overconfident
      ? `answered in ${Math.round(lastTimeMs / 1000)}s at confidence ${lastConfidence}`
      : fast
        ? `answered in ${Math.round(lastTimeMs / 1000)}s`
        : overconfident
          ? `was sure (confidence ${lastConfidence})`
          : 'no rush/overconfidence signal',
    points: fast || overconfident ? 10 : 0,
  })

  const priority = Math.min(100, factors.reduce((s, f) => s + f.points, 0))
  return { priority, factors }
}

export function flagsFor(
  wrongCount: number,
  lastWrongAt: Date,
  question: MistakeQuestionMeta,
  state: MistakeStateMeta | null,
  lastTimeMs: number,
  lastConfidence: number,
): string[] {
  const flags: string[] = []
  if (wrongCount >= 2) flags.push('repeated')
  if (lastTimeMs > 0 && lastTimeMs < FAST_MISS_MS) flags.push('fast-miss')
  if (lastConfidence >= 4) flags.push('overconfident')
  if (Date.now() - lastWrongAt.getTime() <= TODAY_MS) flags.push('today')
  if (state && state.lastReviewed) {
    const days = Math.max(0, (Date.now() - state.lastReviewed.getTime()) / DAY)
    if (estimatedRecall(days, Math.max(0.2, state.stability)) < 0.5) flags.push('forgotten')
  }
  if (question.pyqPattern || question.difficulty === 3) flags.push('exam')
  return flags
}

// ─── 3 · ROW ASSEMBLY ────────────────────────────────────────────────────────
export function optionText(options: unknown, id: string): string {
  if (!Array.isArray(options)) return id
  const opt = options.find(
    (o) => o && typeof o === 'object' && (o as { id?: unknown }).id === id,
  ) as { text?: unknown } | undefined
  return typeof opt?.text === 'string' && opt.text ? opt.text : id
}

export interface BuildRowsInput {
  records: {
    id: string
    questionId: string
    wrongCount: number
    firstWrongAt: Date
    lastWrongAt: Date
    lastSelected: string
    lastErrorType: string | null
    status: string
    resolvedAt: Date | null
    resolvedBy: string | null
  }[]
  questions: Map<string, MistakeQuestionMeta>
  states: Map<string, MistakeStateMeta> // by conceptId
  revisionConceptIds: Set<string>
  latestAttempt: Map<string, { timeMs: number; confidence: number }> // by questionId
}

export function buildMistakeRows(input: BuildRowsInput): MistakeRow[] {
  const rows: MistakeRow[] = []
  for (const rec of input.records) {
    const q = input.questions.get(rec.questionId)
    if (!q) continue
    const state = q.conceptId ? (input.states.get(q.conceptId) ?? null) : null
    const last = input.latestAttempt.get(rec.questionId)
    const lastTimeMs = last?.timeMs ?? 0
    const lastConfidence = last?.confidence ?? 0
    const { priority, factors } = priorityFor(
      rec.wrongCount, rec.lastWrongAt, q, state, lastTimeMs, lastConfidence,
    )
    rows.push({
      recordId: rec.id,
      questionId: rec.questionId,
      stem: q.stem,
      subjectCode: q.subjectCode,
      subjectName: q.subjectName ?? q.subjectCode,
      topicName: q.topicName ?? null,
      conceptId: q.conceptId,
      conceptName: q.conceptName,
      difficulty: q.difficulty,
      qtype: q.qtype,
      pyqPattern: q.pyqPattern,
      imageUrl: q.imageUrl,
      wrongCount: rec.wrongCount,
      firstWrongAt: rec.firstWrongAt.toISOString(),
      lastWrongAt: rec.lastWrongAt.toISOString(),
      lastSelected: rec.lastSelected,
      lastSelectedText: optionText(q.options, rec.lastSelected || '?'),
      answerText: optionText(q.options, q.answer),
      errorType: rec.lastErrorType,
      errorLabel: rec.lastErrorType ? (ERROR_TYPE_LABELS[rec.lastErrorType] ?? rec.lastErrorType) : null,
      confidence: lastConfidence,
      timeMs: lastTimeMs,
      status: rec.status as MistakeStatus,
      revisionPending: q.conceptId ? input.revisionConceptIds.has(q.conceptId) : false,
      resolvedAt: rec.resolvedAt ? rec.resolvedAt.toISOString() : null,
      resolvedBy: rec.resolvedBy,
      priority,
      factors,
      flags: flagsFor(rec.wrongCount, rec.lastWrongAt, q, state, lastTimeMs, lastConfidence),
    })
  }
  return rows
}

// ─── 4 · PATTERN DETECTION (concept-level, not just counts) ──────────────────
export interface PatternContext {
  rows: MistakeRow[] // enriched rows (status unresolved/revising/retested)
  wrongAttempts: { questionId: string; conceptId: string | null; subjectCode: string; errorType: string | null; timeMs: number; confidence: number }[]
  questionById: Map<string, { subjectCode: string; conceptId: string | null; difficulty: number }>
  pairs: {
    id: string; a: string; b: string; aCode: string; bCode: string
    mnemonic: string; subjectCode: string
  }[]
  wrongByConcept: Map<string, number>
  masteryByConcept: Map<string, number>
}

export function detectPatterns(ctx: PatternContext): MistakePatternCard[] {
  const cards: MistakePatternCard[] = []
  const openRows = ctx.rows.filter((r) => r.status !== 'resolved')

  // 1 · curated confusion pairs — both sides appear in this profile's mistakes
  for (const pair of ctx.pairs) {
    if (cards.length >= 3) break
    if (!pair.aCode || !pair.bCode) continue
    const aErr = ctx.wrongByConcept.get(pair.aCode) ?? 0
    const bErr = ctx.wrongByConcept.get(pair.bCode) ?? 0
    if (aErr < 1 || bErr < 1) continue
    const aMastery = ctx.masteryByConcept.get(pair.aCode)
    cards.push({
      id: `confusion-${pair.id}`,
      kind: 'confusion',
      title: `You keep mixing up ${pair.a} and ${pair.b}`,
      detail: `Both sides of this classic pair show up in your wrong answers — ${pair.a} ${aErr}× and ${pair.b} ${bErr}×. This is a discrimination problem, not a knowledge gap.` +
        (pair.mnemonic ? ` Anchor: ${pair.mnemonic}` : ''),
      evidence: [
        { label: `${pair.a} misses`, value: `${aErr}×` },
        { label: `${pair.b} misses`, value: `${bErr}×` },
        { label: 'Anchor', value: pair.mnemonic || 'side-by-side compare' },
      ],
      action: { kind: 'compare', label: 'Compare the pair', pairId: pair.id, conceptId: pair.aCode },
    })
  }

  // 2 · repeated single concepts (wrongCount ≥ 2, open)
  const repeatedConcepts = new Map<string, { name: string; misses: number }>()
  for (const r of openRows) {
    if (!r.conceptId || !r.conceptName || r.wrongCount < 2) continue
    const cur = repeatedConcepts.get(r.conceptId)
    if (!cur || r.wrongCount > cur.misses) {
      repeatedConcepts.set(r.conceptId, { name: r.conceptName, misses: r.wrongCount })
    }
  }
  const topRepeated = [...repeatedConcepts.entries()].sort((a, b) => b[1].misses - a[1].misses).slice(0, 3)
  for (const [conceptId, c] of topRepeated) {
    if (cards.length >= 5) break
    const mastery = ctx.masteryByConcept.get(conceptId)
    cards.push({
      id: `concept-${conceptId}`,
      kind: 'concept',
      title: `${c.name} keeps coming back`,
      detail: `${c.misses} separate misses on this concept${mastery !== undefined ? ` at ${mastery}% measured mastery` : ''}. That is a pattern, not bad luck — the next fix is a focused re-teach, then a retest.`,
      evidence: [
        { label: 'Misses', value: `${c.misses}×` },
        ...(mastery !== undefined ? [{ label: 'Mastery', value: `${mastery}%` }] : []),
      ],
      action: { kind: 'drill', label: 'Drill this concept', mode: 'weakness', conceptId },
    })
  }

  return cards
}

// Paradox detection needs BOTH correct and wrong attempts per subject, so it is
// a separate function fed by the routes (which already load the attempt feed).
export function detectParadox(
  subjectStats: Map<string, { total: number; wrong: number }>,
  wrongBySubjectType: Map<string, Map<string, number>>, // subjectCode → errorType → count
  subjectNames: Map<string, string>,
): MistakePatternCard[] {
  const cards: MistakePatternCard[] = []
  for (const [code, st] of subjectStats) {
    if (cards.length >= 2) break
    if (st.total < 6 || st.wrong < 3) continue
    const accuracy = 1 - st.wrong / st.total
    if (accuracy < 0.65) continue
    const types = wrongBySubjectType.get(code)
    if (!types) continue
    const [topType, topCount] = [...types.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    if (!topType || topCount < 2 || topCount / st.wrong < 0.5) continue
    const label = ERROR_TYPE_LABELS[topType] ?? topType
    cards.push({
      id: `paradox-${code}`,
      kind: 'paradox',
      title: `${subjectNames.get(code) ?? code}: strong overall, one leaking slip type`,
      detail: `Your accuracy in ${subjectNames.get(code) ?? code} is ${Math.round(accuracy * 100)}% — the content is holding. But ${topCount} of your ${st.wrong} misses there were tagged “${label}”. Fix the habit, not the topic.`,
      evidence: [
        { label: 'Accuracy', value: `${Math.round(accuracy * 100)}%` },
        { label: 'Misses', value: `${st.wrong} of ${st.total}` },
        { label: `Top slip`, value: `${label} ×${topCount}` },
      ],
      action: { kind: 'slow', label: 'Practise this subject slowly', subjectCode: code },
    })
  }
  return cards
}

// Speed / confidence / difficulty signals over the recent wrong-attempt feed.
export function detectBehaviourPatterns(
  wrongAttempts: { questionId: string; subjectCode: string; timeMs: number; confidence: number }[],
  questionById: Map<string, { subjectCode: string; conceptId: string | null; difficulty: number }>,
  correctByDifficulty: Map<number, { correct: number; total: number }>,
): MistakePatternCard[] {
  const cards: MistakePatternCard[] = []

  const fastWrong = wrongAttempts.filter((a) => a.timeMs > 0 && a.timeMs < FAST_MISS_MS)
  if (fastWrong.length >= 3) {
    const med = fastWrong.map((a) => a.timeMs).sort((a, b) => a - b)[Math.floor(fastWrong.length / 2)]
    cards.push({
      id: 'pattern-speed',
      kind: 'speed',
      title: 'You rush the stems you get wrong',
      detail: `${fastWrong.length} of your misses were answered in under 15 s (median ${Math.round(med / 1000)} s). Slow down on familiar-looking stems — speed is part of this pattern.`,
      evidence: [
        { label: 'Fast misses', value: `${fastWrong.length}` },
        { label: 'Median time', value: `${Math.round(med / 1000)} s` },
      ],
      action: { kind: 'slow', label: 'Practise with no rush' },
    })
  }

  const confidentWrong = wrongAttempts.filter((a) => a.confidence >= 4)
  if (confidentWrong.length >= 3) {
    cards.push({
      id: 'pattern-confidence',
      kind: 'confidence',
      title: 'Overconfidence is part of the pattern',
      detail: `${confidentWrong.length} misses carried confidence 4–5 — you were sure and still slipped. Retest these once, calmly.`,
      evidence: [{ label: 'Sure-but-wrong', value: `${confidentWrong.length}` }],
      action: { kind: 'retest', label: 'Retest the sure misses' },
    })
  }

  const hardWrong = wrongAttempts.filter((a) => questionById.get(a.questionId)?.difficulty === 3).length
  const easyState = correctByDifficulty.get(1)
  const modState = correctByDifficulty.get(2)
  const lowerOk =
    (!easyState || easyState.total === 0 || easyState.correct / easyState.total >= 0.5) &&
    (!modState || modState.total === 0 || modState.correct / modState.total >= 0.5)
  if (hardWrong >= 4 && lowerOk) {
    cards.push({
      id: 'pattern-difficulty',
      kind: 'difficulty',
      title: 'Misses cluster on hard stems',
      detail: `${hardWrong} misses sit on difficulty-3 questions while your easy/moderate accuracy holds. Solid base — now build the hard tier deliberately.`,
      evidence: [
        { label: 'Hard misses', value: `${hardWrong}` },
        { label: 'Base', value: 'easy/moderate holding' },
      ],
      action: { kind: 'drill', label: 'Build up gradually', mode: 'adaptive' },
    })
  }

  return cards
}

// ─── 5 · REVIEW MODE PREDICATES ───────────────────────────────────────────────
export function modePredicate(mode: string): (r: MistakeRow) => boolean {
  switch (mode) {
    case 'today':
      return (r) => Date.now() - new Date(r.lastWrongAt).getTime() <= TODAY_MS
    case 'repeated':
      return (r) => r.wrongCount >= 2
    case 'impact':
      return (r) => r.status !== 'resolved'
    case 'unresolved':
      return (r) => r.status === 'unresolved' || r.status === 'revising'
    case 'forgotten':
      return (r) => r.flags.includes('forgotten')
    case 'exam':
      return (r) => r.flags.includes('exam')
    default:
      return () => true
  }
}

export function modeSort(mode: string): (a: MistakeRow, b: MistakeRow) => number {
  switch (mode) {
    case 'repeated':
      return (a, b) => b.wrongCount - a.wrongCount || b.priority - a.priority
    case 'today':
      return (a, b) => new Date(b.lastWrongAt).getTime() - new Date(a.lastWrongAt).getTime()
    default:
      return (a, b) => b.priority - a.priority
  }
}

// ─── 6 · SHARED CONTEXT LOADER (used by every /api/mistakes-intel route) ─────
export interface MistakeContext {
  rows: MistakeRow[]
  questionById: Map<string, MistakeQuestionMeta>
  states: Map<string, MistakeStateMeta>
  pairs: { id: string; a: string; b: string; aCode: string; bCode: string; mnemonic: string; subjectCode: string }[]
  wrongAttempts: { questionId: string; conceptId: string | null; subjectCode: string; errorType: string | null; timeMs: number; confidence: number }[]
  wrongByConcept: Map<string, number>
  masteryByConcept: Map<string, number>
  correctByDifficulty: Map<number, { correct: number; total: number }>
  subjectStats: Map<string, { total: number; wrong: number }>
  wrongBySubjectType: Map<string, Map<string, number>>
  subjectNames: Map<string, string>
  totalAttempts: number
}

export async function loadMistakeContext(profileId: string): Promise<MistakeContext> {
  await ensureMistakeRecords(profileId)

  const [records, attempts, states, openRevisions, pairs, subjects] = await Promise.all([
    db.mistakeRecord.findMany({
      where: { profileId },
      orderBy: { lastWrongAt: 'desc' },
      take: 400,
    }),
    db.questionAttempt.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: 600,
      select: {
        questionId: true, correct: true, errorType: true, timeMs: true,
        confidence: true, createdAt: true,
        question: { select: { id: true, subjectCode: true, conceptId: true, difficulty: true } },
      },
    }),
    db.knowledgeState.findMany({ where: { profileId } }),
    db.revisionItem.findMany({ where: { profileId, cleared: false }, select: { conceptId: true } }),
    db.confusionPair.findMany(),
    db.subject.findMany({ select: { code: true, name: true } }),
  ])

  const questionIds = [...new Set(records.map((r) => r.questionId))]
  const questionRows = await db.question.findMany({
    where: { id: { in: questionIds } },
    include: {
      concept: { select: { id: true, name: true } },
      subject: { select: { code: true, name: true } },
    },
  })
  // Question.topicId is a loose id (no relation) — resolve names separately.
  const topicIds = [...new Set(questionRows.map((q) => q.topicId).filter((t): t is string => !!t))]
  const topicRows = topicIds.length
    ? await db.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true } })
    : []
  const topicNameById = new Map(topicRows.map((t) => [t.id, t.name]))
  const questionById = new Map<string, MistakeQuestionMeta>(
    questionRows.map((q) => [
      q.id,
      {
        id: q.id, stem: q.stem, options: q.options, answer: q.answer,
        subjectCode: q.subjectCode,
        subjectName: q.subject?.name ?? q.subjectCode,
        topicName: q.topicId ? (topicNameById.get(q.topicId) ?? null) : null,
        conceptId: q.conceptId,
        conceptName: q.concept?.name ?? null,
        difficulty: q.difficulty, qtype: q.qtype,
        pyqPattern: JSON.stringify(q.tags ?? []).includes('pyq-pattern'),
        imageUrl: q.imageUrl ?? null,
      },
    ]),
  )
  const attemptQuestionMeta = new Map(
    attempts.map((a) => [a.questionId, {
      subjectCode: a.question.subjectCode,
      conceptId: a.question.conceptId,
      difficulty: a.question.difficulty,
    }]),
  )

  const stateMap = new Map<string, MistakeStateMeta>(
    states.map((s) => [s.conceptId, { score: s.score, estRecall: s.estRecall, stability: s.stability, lastReviewed: s.lastReviewed }]),
  )
  const revisionConceptIds = new Set(openRevisions.map((r) => r.conceptId).filter((c): c is string => !!c))

  // latest WRONG attempt per question (timing/confidence feed the careless flags)
  const latestAttempt = new Map<string, { timeMs: number; confidence: number }>()
  const wrongAttempts: MistakeContext['wrongAttempts'] = []
  const subjectStats = new Map<string, { total: number; wrong: number }>()
  const wrongBySubjectType = new Map<string, Map<string, number>>()
  const correctByDifficulty = new Map<number, { correct: number; total: number }>()
  const seenWrongQuestion = new Set<string>()
  for (const a of attempts) {
    const meta = attemptQuestionMeta.get(a.questionId)
    const code = meta?.subjectCode ?? a.question.subjectCode
    const st = subjectStats.get(code) ?? { total: 0, wrong: 0 }
    st.total += 1
    const dState = correctByDifficulty.get(meta?.difficulty ?? a.question.difficulty) ?? { correct: 0, total: 0 }
    dState.total += 1
    if (a.correct) {
      dState.correct += 1
    } else {
      st.wrong += 1
      if (!seenWrongQuestion.has(a.questionId)) {
        seenWrongQuestion.add(a.questionId)
        latestAttempt.set(a.questionId, { timeMs: a.timeMs, confidence: a.confidence })
      }
      wrongAttempts.push({
        questionId: a.questionId,
        conceptId: meta?.conceptId ?? a.question.conceptId,
        subjectCode: code,
        errorType: a.errorType,
        timeMs: a.timeMs,
        confidence: a.confidence,
      })
      if (a.errorType) {
        const tMap = wrongBySubjectType.get(code) ?? new Map<string, number>()
        tMap.set(a.errorType, (tMap.get(a.errorType) ?? 0) + 1)
        wrongBySubjectType.set(code, tMap)
      }
    }
    subjectStats.set(code, st)
    correctByDifficulty.set(meta?.difficulty ?? a.question.difficulty, dState)
  }

  const wrongByConcept = new Map<string, number>()
  for (const a of wrongAttempts) {
    if (a.conceptId) wrongByConcept.set(a.conceptId, (wrongByConcept.get(a.conceptId) ?? 0) + 1)
  }
  const masteryByConcept = new Map<string, number>(
    states.map((s) => [s.conceptId, Math.round(s.score)]),
  )

  const rows = buildMistakeRows({
    records,
    questions: questionById,
    states: stateMap,
    revisionConceptIds,
    latestAttempt,
  })

  return {
    rows,
    questionById,
    states: stateMap,
    pairs: pairs.map((p) => ({
      id: p.id, a: p.a, b: p.b, aCode: p.aCode, bCode: p.bCode,
      mnemonic: p.mnemonic, subjectCode: p.subjectCode,
    })),
    wrongAttempts,
    wrongByConcept,
    masteryByConcept,
    correctByDifficulty,
    subjectStats,
    wrongBySubjectType,
    subjectNames: new Map(subjects.map((s) => [s.code, s.name])),
    totalAttempts: attempts.length,
  }
}
