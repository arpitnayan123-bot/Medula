// ─── PRODUCT 09 · CLINICAL CASE SIMULATOR — deterministic engine ─────────────
// Everything measurable is MEASURED from SimCaseAttempt events; grading is
// DETERMINISTIC against the curated brief (the LLM never grades) and the
// brief's answer key NEVER reaches the client (clientCase strips verdicts,
// whys, findings, keys and costs). No chain-of-thought anywhere — feedback is
// conclusions + explanations only.
//
// Event log shape (SimCaseAttempt.events, append-only JSON):
//   { type:'interaction', stageId, interactionId, chosen[], correct, score, ts }
//   { type:'stage', stageIndex, ts }
//   { type:'chat', role:'user'|'assistant', content, ts }   (AI Case Mode)

import { db } from '@/lib/db'
import { loadGraphContext } from '@/lib/knowledge-graph'
import { GRAPH_GROUP_META } from '@/lib/types'
import type {
  GraphGroupKind,
  SimCaseDetail,
  SimCaseSummary,
  SimDebrief,
  SimDifficulty,
  SimFeedback,
  SimFeedbackOption,
  SimHome,
  SimPatient,
  SimStageKind,
  SimStagePublic,
} from '@/lib/types'

// ─── INTERNAL AUTHORING TYPES (mirror prisma/seed-sim-cases-*.ts) ────────────

export type SimVerdict = 'correct' | 'acceptable' | 'wrong' | 'harmful'

export interface SimBriefOption {
  id: string
  label: string
  verdict?: SimVerdict
  why?: string
  finding?: string // explore: revealed when pursued
  key?: boolean // explore: essential item
  cost?: string // explore (investigations): display chip — NEVER sent to the client
}

export interface SimBriefInteraction {
  id: string
  kind: 'explore' | 'key' | 'choice' | 'multi'
  prompt: string
  instruction?: string
  minSelect?: number
  maxSelect?: number
  imageKey?: string
  imageCaption?: string
  options: SimBriefOption[]
}

export interface SimBriefStage {
  id: string
  kind: SimStageKind
  label: string
  intro: string[]
  interactions: SimBriefInteraction[]
}

export interface SimAiBrief {
  persona: string
  intro: string
  hidden: { ask: string; reveal: string }[]
  exam: { ask: string; reveal: string }[]
  investigations: { ask: string; result: string }[]
  style: string
}

export interface SimBrief {
  diagnosis: string
  learning: string[]
  conceptIds: string[]
  stages: SimBriefStage[]
  aiBrief?: SimAiBrief
}

// ─── EVENT TYPES ─────────────────────────────────────────────────────────────

export interface SimInteractionEvent {
  type: 'interaction'
  stageId: string
  interactionId: string
  chosen: string[]
  correct: boolean
  score: number
  ts: number
}
export interface SimStageEvent {
  type: 'stage'
  stageIndex: number
  ts: number
}
export interface SimChatEvent {
  type: 'chat'
  role: 'user' | 'assistant'
  content: string
  ts: number
}
export type SimEvent = SimInteractionEvent | SimStageEvent | SimChatEvent

// ─── PARSERS (stored Json → typed shapes; defensive, never throws) ───────────

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

export function parseBrief(raw: unknown): SimBrief {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const stages = Array.isArray(b.stages) ? (b.stages as SimBriefStage[]) : []
  const aiBrief = b.aiBrief && typeof b.aiBrief === 'object' ? (b.aiBrief as SimAiBrief) : undefined
  return {
    diagnosis: asString(b.diagnosis),
    learning: Array.isArray(b.learning) ? b.learning.filter((x): x is string => typeof x === 'string') : [],
    conceptIds: Array.isArray(b.conceptIds) ? b.conceptIds.filter((x): x is string => typeof x === 'string') : [],
    stages,
    ...(aiBrief ? { aiBrief } : {}),
  }
}

export function parsePatient(raw: unknown): SimPatient {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    age: asString(p.age),
    sex: asString(p.sex),
    occupation: asString(p.occupation),
    complaint: asString(p.complaint),
    scene: asString(p.scene),
  }
}

export function parseEvents(raw: unknown): SimEvent[] {
  if (!Array.isArray(raw)) return []
  const out: SimEvent[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const v = e as Record<string, unknown>
    const ts = typeof v.ts === 'number' ? v.ts : 0
    if (v.type === 'interaction' && typeof v.stageId === 'string' && typeof v.interactionId === 'string' && Array.isArray(v.chosen)) {
      out.push({
        type: 'interaction',
        stageId: v.stageId,
        interactionId: v.interactionId,
        chosen: v.chosen.filter((c): c is string => typeof c === 'string'),
        correct: v.correct === true,
        score: typeof v.score === 'number' && Number.isFinite(v.score) ? v.score : 0,
        ts,
      })
    } else if (v.type === 'stage') {
      out.push({ type: 'stage', stageIndex: typeof v.stageIndex === 'number' ? v.stageIndex : 0, ts })
    } else if (v.type === 'chat' && (v.role === 'user' || v.role === 'assistant') && typeof v.content === 'string') {
      out.push({ type: 'chat', role: v.role, content: v.content, ts })
    }
  }
  return out
}

export function findInteraction(
  brief: SimBrief,
  stageId: string,
  interactionId: string,
): { stage: SimBriefStage; interaction: SimBriefInteraction } | null {
  const stage = brief.stages.find((s) => s.id === stageId)
  if (!stage) return null
  const interaction = stage.interactions.find((i) => i.id === interactionId)
  if (!interaction) return null
  return { stage, interaction }
}

const clamp = (n: number): number => Math.min(100, Math.max(0, n))
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

// ─── CLIENT-SAFE CASE (brief stripped — the key never leaves the server) ─────

/** Minimal shape of a prisma SimCase row the engine needs. */
export interface SimCaseRowLite {
  id: string
  title: string
  specialty: string
  system: string
  difficulty: string
  patient: unknown
  brief: unknown
  estimateMinutes: number
  imageKey: string | null
  aiReady: boolean
  source: string
}

/** Minimal shape of a prisma SimCaseAttempt row the engine needs. */
export interface SimAttemptRowLite {
  id: string
  status: string
  score: number
  diagnosisCorrect: boolean
  startedAt: Date
  completedAt: Date | null
}

/** Per-case measured summary — completed runs only for score fields. */
export function summarizeCase(row: SimCaseRowLite, attempts: SimAttemptRowLite[] = []): SimCaseSummary {
  const brief = parseBrief(row.brief)
  const relevant = attempts.filter((a) => a.status !== 'abandoned') // active or completed
  const completed = attempts
    .filter((a) => a.status === 'completed')
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const best = completed.length ? Math.max(...completed.map((a) => a.score)) : null
  const last = completed[completed.length - 1]
  return {
    id: row.id,
    title: row.title,
    specialty: row.specialty,
    system: row.system,
    difficulty: row.difficulty as SimDifficulty,
    minutes: row.estimateMinutes,
    imageKey: row.imageKey ?? null,
    aiReady: row.aiReady,
    stageCount: brief.stages.length,
    interactionCount: brief.stages.reduce((n, s) => n + s.interactions.length, 0),
    attempted: relevant.length > 0,
    bestScore: best,
    lastScore: last ? last.score : null,
    lastAt: last?.completedAt ? last.completedAt.toISOString() : null,
    diagnosisCorrect: last ? last.diagnosisCorrect : null,
    source: row.source,
  }
}

/** Strip the brief down to the client-safe SimCaseDetail (no verdicts/whys/findings/keys/costs). */
export function clientCase(row: SimCaseRowLite, attempts: SimAttemptRowLite[] = []): SimCaseDetail {
  const brief = parseBrief(row.brief)
  const stages: SimStagePublic[] = brief.stages.map((st) => ({
    id: st.id,
    kind: st.kind,
    label: st.label,
    intro: Array.isArray(st.intro) ? st.intro : [],
    interactions: (st.interactions ?? []).map((it) => ({
      id: it.id,
      kind: it.kind,
      prompt: it.prompt,
      ...(it.instruction ? { instruction: it.instruction } : {}),
      options: (it.options ?? []).map((o) => ({ id: o.id, label: o.label })), // {id,label} ONLY
      ...(typeof it.minSelect === 'number' ? { minSelect: it.minSelect } : {}),
      ...(typeof it.maxSelect === 'number' ? { maxSelect: it.maxSelect } : {}),
      ...(it.imageKey ? { imageKey: it.imageKey } : {}),
      ...(it.imageCaption ? { imageCaption: it.imageCaption } : {}),
    })),
  }))
  return { summary: summarizeCase(row, attempts), patient: parsePatient(row.patient), stages }
}

// ─── GRADING (deterministic, per interaction) ────────────────────────────────

const VERDICT_HEADLINE: Record<SimVerdict, string> = {
  correct: 'Correct call.',
  acceptable: 'Defensible — but not the strongest move here.',
  wrong: 'Not the right call.',
  harmful: 'Dangerous choice — this could actively harm the patient.',
}

function exploreHeadline(score: number, keysTotal: number, keysHit: number, harmful: number): string {
  const harmNote = harmful > 0 ? ` ${plural(harmful, 'choice')} could actively harm the patient.` : ''
  if (keysTotal === 0) {
    return harmful > 0 ? `Nothing essential was required here, but caution was needed.${harmNote}` : 'Nothing essential was required here — handled well.'
  }
  if (keysHit === keysTotal) {
    return harmful > 0 ? `Every essential covered — but you also picked a dangerous item.${harmNote}` : 'Sharp — every essential piece of information gathered.'
  }
  if (keysHit / keysTotal >= 0.5) {
    return `Good instincts — ${plural(keysTotal - keysHit, 'essential item')} missed.${harmNote}`
  }
  return `Most of the essentials were missed — ${keysHit}/${keysTotal} found.${harmNote}`
}

function multiHeadline(score: number, missedCount: number, harmful: number): string {
  const harmNote = harmful > 0 ? ` ${plural(harmful, 'pick')} could actively harm the patient.` : ''
  if (score >= 100) return harmful > 0 ? `Complete on paper — but one of these picks is unsafe.${harmNote}` : 'Complete — nothing essential missed, nothing harmful.'
  if (score >= 60) return `The core is there — ${plural(missedCount, 'essential item')} missing.${harmNote}`
  return `Important items were missed.${harmNote}`
}

/**
 * Grade ONE interaction deterministically.
 *  explore: score = 100·keysHit/keysTotal − 25·harmfulPicked (clamp 0-100;
 *           no keys → 100 unless harmful picked → 60). perOption = CHOSEN
 *           items with verdict/why/finding; missed = unchosen key items.
 *  key/choice: chosen verdict → 100 correct / 60 acceptable / 0 wrong|harmful.
 *           perOption = ALL options with their verdict/why (this is the
 *           feedback moment where "why correct is correct" is delivered).
 *  multi:   score = 100·(correctPicked + 0.5·acceptablePicked)/correctTotal
 *           − 20·harmfulPicked (clamp; correctTotal counts ONLY verdict
 *           'correct'). perOption = ALL options; missed = unchosen correct.
 */
export function gradeInteraction(
  stage: SimBriefStage,
  interaction: SimBriefInteraction,
  chosenIds: string[],
): SimFeedback {
  const options = interaction.options ?? []
  const chosen = chosenIds.filter((id) => options.some((o) => o.id === id))
  const chosenSet = new Set(chosen)

  if (interaction.kind === 'explore') {
    const keys = options.filter((o) => o.key)
    const harmfulPicked = options.filter((o) => o.verdict === 'harmful' && chosenSet.has(o.id)).length
    const keysHit = keys.filter((o) => chosenSet.has(o.id)).length
    const score =
      keys.length === 0
        ? harmfulPicked > 0
          ? 60
          : 100
        : clamp(Math.round((100 * keysHit) / keys.length) - 25 * harmfulPicked)
    const perOption: SimFeedbackOption[] = chosen.map((id) => {
      const o = options.find((x) => x.id === id)!
      return {
        id,
        label: o.label,
        verdict: o.verdict ?? (o.key ? 'correct' : 'acceptable'),
        why: o.why ?? o.finding ?? '',
        ...(o.finding ? { finding: o.finding } : {}),
      }
    })
    const missed = keys
      .filter((o) => !chosenSet.has(o.id))
      .map((o) => ({ id: o.id, label: o.label, why: o.why ?? o.finding ?? 'An essential item you did not pursue.' }))
    return {
      correct: score >= 100,
      score,
      headline: exploreHeadline(score, keys.length, keysHit, harmfulPicked),
      perOption,
      missed,
    }
  }

  if (interaction.kind === 'key' || interaction.kind === 'choice') {
    const picked = chosen.length ? options.find((o) => o.id === chosen[0]) : undefined
    const verdict: SimVerdict = picked?.verdict ?? 'wrong'
    const score = verdict === 'correct' ? 100 : verdict === 'acceptable' ? 60 : 0
    const perOption: SimFeedbackOption[] = options.map((o) => ({
      id: o.id,
      label: o.label,
      verdict: o.verdict ?? 'wrong',
      why: o.why ?? '',
    }))
    const missed =
      verdict === 'correct'
        ? []
        : options
            .filter((o) => o.verdict === 'correct')
            .map((o) => ({ id: o.id, label: o.label, why: o.why ?? 'The correct choice.' }))
    return { correct: verdict === 'correct', score, headline: VERDICT_HEADLINE[verdict], perOption, missed }
  }

  // multi (differential shortlist / management bundle)
  const correctOptions = options.filter((o) => o.verdict === 'correct')
  const correctPicked = correctOptions.filter((o) => chosenSet.has(o.id)).length
  const acceptablePicked = options.filter((o) => o.verdict === 'acceptable' && chosenSet.has(o.id)).length
  const harmfulPicked = options.filter((o) => o.verdict === 'harmful' && chosenSet.has(o.id)).length
  const wrongPicked = options.filter((o) => o.verdict === 'wrong' && chosenSet.has(o.id)).length
  const raw =
    correctOptions.length > 0
      ? (100 * (correctPicked + 0.5 * acceptablePicked)) / correctOptions.length - 20 * harmfulPicked
      : harmfulPicked > 0
        ? 0
        : 100
  const score = clamp(Math.round(raw))
  const perOption: SimFeedbackOption[] = options.map((o) => ({
    id: o.id,
    label: o.label,
    verdict: o.verdict ?? 'wrong',
    why: o.why ?? '',
  }))
  const missed = correctOptions
    .filter((o) => !chosenSet.has(o.id))
    .map((o) => ({ id: o.id, label: o.label, why: o.why ?? 'An essential item you did not select.' }))
  return {
    correct: correctOptions.length > 0 && correctPicked === correctOptions.length && harmfulPicked === 0 && wrongPicked === 0,
    score,
    headline: multiHeadline(score, missed.length, harmfulPicked),
    perOption,
    missed,
  }
}

// ─── SCORING (per attempt, from the event log) ───────────────────────────────

/** Stage weights (binding engine rule): patient 0, history 15, exam 10,
 *  investigations 15, differential 15, diagnosis 25, management 15, followup 5. */
export const SIM_STAGE_WEIGHTS: Record<SimStageKind, number> = {
  patient: 0,
  history: 15,
  exam: 10,
  investigations: 15,
  differential: 15,
  diagnosis: 25,
  management: 15,
  followup: 5,
}

export interface SimAttemptScores {
  total: number
  diagnosis: number // diagnosis-stage mean (0 when the stage was never graded)
  reasoning: number // mean of history/exam/differential/followup stage scores
  investigations: number
  management: number
  diagnosisCorrect: boolean
}

export function scoreAttempt(brief: SimBrief, events: SimEvent[]): SimAttemptScores {
  const graded = events.filter((e): e is SimInteractionEvent => e.type === 'interaction')
  const stageById = new Map(brief.stages.map((s) => [s.id, s]))

  const byStage = new Map<string, number[]>()
  for (const e of graded) {
    if (!stageById.has(e.stageId)) continue
    const arr = byStage.get(e.stageId) ?? []
    arr.push(clamp(e.score))
    byStage.set(e.stageId, arr)
  }

  // weighted mean over stages that HAVE ≥1 graded event
  const stageMeanOf = new Map<string, number>()
  for (const [stageId, scores] of byStage) stageMeanOf.set(stageId, mean(scores))
  let wSum = 0
  let wTot = 0
  for (const [stageId, m] of stageMeanOf) {
    const st = stageById.get(stageId)
    if (!st) continue
    const w = SIM_STAGE_WEIGHTS[st.kind] ?? 0
    wSum += m * w
    wTot += w
  }
  const total = wTot > 0 ? Math.round(wSum / wTot) : Math.round(mean(graded.map((e) => clamp(e.score))))

  // sub-scores = mean of the STAGE scores (per-stage means) of that kind
  const kindMean = (kinds: SimStageKind[]): number => {
    const ids = brief.stages.filter((s) => kinds.includes(s.kind)).map((s) => s.id)
    return mean(ids.map((id) => stageMeanOf.get(id)).filter((v): v is number => typeof v === 'number'))
  }
  const reasoning = Math.round(kindMean(['history', 'exam', 'differential', 'followup']))
  const investigations = Math.round(kindMean(['investigations']))
  const management = Math.round(kindMean(['management']))
  const diagnosis = Math.round(kindMean(['diagnosis']))

  // diagnosisCorrect = the (last committed) diagnosis-stage interaction's
  // chosen option has verdict 'correct'
  const dxInteractions = new Map(
    brief.stages.filter((s) => s.kind === 'diagnosis').flatMap((s) => s.interactions).map((i) => [i.id, i]),
  )
  let diagnosisCorrect = false
  const dxEv = graded.filter((e) => dxInteractions.has(e.interactionId))
  if (dxEv.length) {
    const last = dxEv[dxEv.length - 1]!
    const opt = dxInteractions.get(last.interactionId)?.options.find((o) => o.id === last.chosen[0])
    diagnosisCorrect = opt?.verdict === 'correct'
  }

  return { total, diagnosis, reasoning, investigations, management, diagnosisCorrect }
}

// ─── HOME (every number MEASURED from SimCaseAttempt rows) ───────────────────

const DIFFICULTY_LADDER: SimDifficulty[] = ['beginner', 'mbbs', 'neetpg', 'advanced']

/** Debrief group priority — mirrors knowledge-graph GROUP_ORDER (not exported there). */
const DEBRIEF_GROUP_ORDER: GraphGroupKind[] = [
  'prerequisite', 'confusable', 'mechanism', 'caused_by', 'manifestation',
  'investigation', 'treatment', 'complication', 'causes', 'related', 'unlocks', 'application',
]

export async function loadSimHome(profileId: string): Promise<SimHome> {
  const [caseRows, attemptRows] = await Promise.all([
    db.simCase.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.simCaseAttempt.findMany({
      where: { profileId },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    }),
  ])
  const briefs = new Map(caseRows.map((c) => [c.id, parseBrief(c.brief)]))
  const caseById = new Map(caseRows.map((c) => [c.id, c]))

  const completedRuns = attemptRows.filter((a) => a.status === 'completed') // chronological asc

  // ── stats ──
  const attemptedCaseIds = new Set(attemptRows.filter((a) => a.status !== 'abandoned').map((a) => a.caseId))
  const completedCaseIds = new Set(completedRuns.map((a) => a.caseId))
  const accuracyRuns = completedRuns.length
    ? Math.round((100 * completedRuns.filter((a) => a.diagnosisCorrect).length) / completedRuns.length)
    : null
  const stats = {
    completed: completedCaseIds.size,
    attempted: attemptedCaseIds.size,
    diagnosticAccuracy: accuracyRuns,
    avgScore: completedRuns.length ? Math.round(mean(completedRuns.map((a) => a.score))) : null,
    minutesPractised: Math.round(completedRuns.reduce((n, a) => n + a.timeMs, 0) / 60000),
  }

  // ── specialties (platform order first, then any legacy labels) ──
  const seen = new Set<string>()
  const specialtyOrder: string[] = []
  for (const c of caseRows) {
    if (seen.has(c.specialty)) continue
    seen.add(c.specialty)
    specialtyOrder.push(c.specialty)
  }
  const specialties = specialtyOrder.map((name) => {
    const specCaseIds = new Set(caseRows.filter((c) => c.specialty === name).map((c) => c.id))
    const specRuns = completedRuns.filter((a) => specCaseIds.has(a.caseId))
    return {
      name,
      count: caseRows.filter((c) => c.specialty === name).length,
      completed: new Set(specRuns.map((a) => a.caseId)).size,
      accuracy: specRuns.length
        ? Math.round((100 * specRuns.filter((a) => a.diagnosisCorrect).length) / specRuns.length)
        : null,
    }
  })
  const specialtyRunCounts = new Map(specialties.map((s) => [s.name, completedRuns.filter((a) => {
    const spec = caseById.get(a.caseId)?.specialty
    return spec === s.name
  }).length]))

  // ── weak areas (specialties with ≥1 completed run and accuracy <70) ──
  const weakAreas = specialties
    .filter((s) => s.completed > 0 && s.accuracy !== null && s.accuracy < 70)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .map((s) => ({
      label: `${s.name} cases`,
      detail: `accuracy ${s.accuracy}% across ${specialtyRunCounts.get(s.name) ?? 0} runs`,
      accuracy: s.accuracy,
    }))

  // ── repeated errors: same decision point missed in ≥2 distinct completed runs.
  //    Keyed by caseId+interactionId — the same interaction id is reused across
  //    cases, and mixing different prompts under one key would be a lie.
  const missMap = new Map<string, { runs: Set<string>; lastAt: number; caseId: string }>()
  for (const run of completedRuns) {
    const missedIds = new Set(
      parseEvents(run.events)
        .filter((e): e is SimInteractionEvent => e.type === 'interaction' && !e.correct)
        .map((e) => e.interactionId),
    )
    for (const iid of missedIds) {
      const key = `${run.caseId}::${iid}`
      const entry = missMap.get(key) ?? { runs: new Set<string>(), lastAt: 0, caseId: run.caseId }
      entry.runs.add(run.id)
      entry.lastAt = Math.max(entry.lastAt, (run.completedAt ?? run.startedAt).getTime())
      missMap.set(key, entry)
    }
  }
  const promptOf = (caseId: string, interactionId: string): string => {
    const brief = briefs.get(caseId)
    if (!brief) return interactionId
    for (const st of brief.stages) {
      const it = st.interactions.find((i) => i.id === interactionId)
      if (it) return it.prompt
    }
    return interactionId
  }
  const repeatedErrors = [...missMap.entries()]
    .filter(([, v]) => v.runs.size >= 2)
    .sort((a, b) => b[1].runs.size - a[1].runs.size || b[1].lastAt - a[1].lastAt)
    .slice(0, 6)
    .map(([key, v]) => {
      const interactionId = key.split('::')[1] ?? key
      return {
        label: promptOf(v.caseId, interactionId).slice(0, 80),
        count: v.runs.size,
        lastCaseTitle: caseById.get(v.caseId)?.title ?? v.caseId,
      }
    })

  // ── recommended: unattempted in weakest specialty → any unattempted → lowest score ──
  const attemptedSet = attemptedCaseIds
  const unattempted = caseRows.filter((c) => !attemptedSet.has(c.id))
  const weakest = specialties
    .filter((s) => s.accuracy !== null && (specialtyRunCounts.get(s.name) ?? 0) > 0)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100) || (specialtyRunCounts.get(a.name) ?? 0) - (specialtyRunCounts.get(b.name) ?? 0))[0]
  let recommended: SimHome['recommended'] = null
  const pickIn = (list: typeof caseRows) => list[0]
  const inWeakest = weakest ? unattempted.filter((c) => c.specialty === weakest.name) : []
  const firstUnattempted = pickIn(inWeakest.length ? inWeakest : unattempted)
  if (firstUnattempted) {
    const reason = inWeakest.length && weakest
      ? `Not attempted yet — targets your weakest measured area (${weakest.name} at ${weakest.accuracy}% diagnostic accuracy).`
      : `Not attempted yet — ${unattempted.length} case${unattempted.length === 1 ? '' : 's'} still fresh for you.`
    recommended = { caseId: firstUnattempted.id, title: firstUnattempted.title, reason }
  } else if (caseRows.length) {
    // every case attempted → the one whose latest completed run scored lowest
    const lastCompletedScore = (caseId: string): number => {
      const runs = completedRuns.filter((a) => a.caseId === caseId)
      return runs.length ? runs[runs.length - 1]!.score : -1
    }
    const worst = [...caseRows].sort(
      (a, b) => lastCompletedScore(a.id) - lastCompletedScore(b.id) || a.title.localeCompare(b.title),
    )[0]!
    const score = lastCompletedScore(worst.id)
    recommended = {
      caseId: worst.id,
      title: worst.title,
      reason:
        score >= 0
          ? `Your latest run here scored ${score}% — worth another pass to close the gap.`
          : 'Attempted but never completed — finish the run to bank the score.',
    }
  }

  // ── recommended difficulty: ladder step from the last ≤5 completed runs ──
  const recentRuns = completedRuns.slice(-5)
  let recommendedDifficulty: SimDifficulty = 'beginner'
  if (recentRuns.length) {
    const avg = mean(recentRuns.map((a) => a.score))
    const lastCase = caseById.get(recentRuns[recentRuns.length - 1]!.caseId)
    const baseIdx = Math.max(0, DIFFICULTY_LADDER.indexOf((lastCase?.difficulty ?? 'beginner') as SimDifficulty))
    const idx = avg >= 70 ? Math.min(DIFFICULTY_LADDER.length - 1, baseIdx + 1) : avg < 50 ? Math.max(0, baseIdx - 1) : baseIdx
    recommendedDifficulty = DIFFICULTY_LADDER[idx] ?? 'mbbs'
  }

  // ── recent (last 5 completed, newest first) ──
  const recent = [...completedRuns]
    .reverse()
    .slice(0, 5)
    .map((a) => ({
      caseId: a.caseId,
      title: caseById.get(a.caseId)?.title ?? a.caseId,
      specialty: caseById.get(a.caseId)?.specialty ?? '',
      score: a.score,
      diagnosisCorrect: a.diagnosisCorrect,
      at: (a.completedAt ?? a.startedAt).toISOString(),
      mode: a.mode,
    }))

  // ── resume (most recent active attempt) ──
  const activeRun = [...attemptRows].reverse().find((a) => a.status === 'active')
  const resume = activeRun
    ? {
        attemptId: activeRun.id,
        caseId: activeRun.caseId,
        caseTitle: caseById.get(activeRun.caseId)?.title ?? activeRun.caseId,
        stageIndex: activeRun.stageIndex,
        mode: activeRun.mode,
      }
    : null

  const cases = caseRows.map((c) => summarizeCase(c, attemptRows.filter((a) => a.caseId === c.id)))

  return {
    stats,
    specialties,
    cases,
    weakAreas,
    repeatedErrors,
    recommended,
    recommendedDifficulty,
    recent,
    resume,
  }
}

// ─── MISTAKE INTELLIGENCE FEED (on complete) ─────────────────────────────────

export interface SimMistakeFeed {
  errorPattern: boolean
  revisionItem: boolean
  reason: string
}

function countHarmfulPicks(brief: SimBrief, events: SimEvent[]): number {
  let n = 0
  for (const e of events) {
    if (e.type !== 'interaction') continue
    const found = findInteraction(brief, e.stageId, e.interactionId)
    if (!found) continue
    for (const id of e.chosen) {
      if (found.interaction.options.find((o) => o.id === id)?.verdict === 'harmful') n += 1
    }
  }
  return n
}

/**
 * Feed the shared mistake/revision intelligence from a COMPLETED run:
 *  - wrong diagnosis → ErrorPattern('reasoning', primary concept) + RevisionItem
 *  - right diagnosis but reasoning <50 → ErrorPattern only
 *  - ≥2 harmful picks across the run → ErrorPattern('confused', primary concept)
 * Max 1 RevisionItem per run. Honest booleans for the debrief.
 */
export async function feedMistakes(
  profileId: string,
  simCase: { title: string },
  brief: SimBrief,
  attempt: { diagnosisCorrect: boolean; reasoning: number; events: SimEvent[] },
): Promise<SimMistakeFeed | null> {
  const primary = brief.conceptIds[0] ?? null
  const reasons: string[] = []
  let fedPattern = false
  let fedRevision = false

  const upsertPattern = async (errorType: string): Promise<boolean> => {
    if (!primary) return false
    await db.errorPattern.upsert({
      where: { profileId_errorType_conceptId: { profileId, errorType, conceptId: primary } },
      create: { profileId, errorType, conceptId: primary, count: 1 },
      update: { count: { increment: 1 }, lastAt: new Date() },
    })
    return true
  }

  if (!attempt.diagnosisCorrect) {
    fedPattern = (await upsertPattern('reasoning')) || fedPattern
    if (primary) {
      const concept = await db.concept.findUnique({ where: { id: primary }, select: { id: true } })
      if (concept) {
        const revisionReason = `Missed in case "${simCase.title}" — diagnosis was ${brief.diagnosis}`
        await db.revisionItem.create({
          data: {
            profileId,
            conceptId: primary,
            reason: revisionReason,
            priority: 3,
            minutes: 10,
          },
        })
        fedRevision = true
        reasons.push(`${revisionReason} — added to your revision queue.`)
      } else {
        reasons.push('Diagnosis missed — no valid linked concept to feed to revision.')
      }
    } else {
      reasons.push('Diagnosis missed — the case has no linked concept to feed to revision.')
    }
  } else if (attempt.reasoning < 50) {
    fedPattern = (await upsertPattern('reasoning')) || fedPattern
    reasons.push('Diagnosis right, but weak reasoning scores were logged as an error pattern.')
  }

  const harmfulPicks = countHarmfulPicks(brief, attempt.events)
  if (harmfulPicks >= 2) {
    fedPattern = (await upsertPattern('confused')) || fedPattern
    reasons.push(`${harmfulPicks} harmful choices were logged as a confusion pattern.`)
  }

  if (!fedPattern && !fedRevision) return null
  return { errorPattern: fedPattern, revisionItem: fedRevision, reason: reasons.join(' ') }
}

// ─── DEBRIEF ─────────────────────────────────────────────────────────────────

/** Minimal shape of an UPDATED (completed) SimCaseAttempt row. */
export interface SimCompletedAttemptLite {
  id: string
  mode: string
  score: number
  diagnosisCorrect: boolean
  reasoning: number
  investigations: number
  management: number
  timeMs: number
}

/**
 * Build the full SimDebrief. `mistakeFed` comes from feedMistakes — pass it to
 * avoid double-feeding; when omitted (other callers) it is computed here.
 */
export async function buildDebrief(
  profileId: string,
  simCase: SimCaseRowLite,
  attempt: SimCompletedAttemptLite,
  events: SimEvent[],
  mistakeFed?: SimMistakeFeed | null,
): Promise<SimDebrief> {
  const brief = parseBrief(simCase.brief)

  // ── timeline (chronological, brief-resolved feedback) ──
  const timeline: SimDebrief['timeline'] = []
  for (const e of events) {
    if (e.type !== 'interaction') continue
    const found = findInteraction(brief, e.stageId, e.interactionId)
    if (!found) continue // stale event for removed content — skip honestly
    const fb = gradeInteraction(found.stage, found.interaction, e.chosen)
    timeline.push({
      stageId: found.stage.id,
      stageLabel: found.stage.label,
      stageKind: found.stage.kind,
      interactionId: found.interaction.id,
      prompt: found.interaction.prompt,
      chosenLabels: e.chosen.map((id) => found.interaction.options.find((o) => o.id === id)?.label ?? id),
      correct: fb.correct,
      score: fb.score,
      headline: fb.headline,
      verdicts: fb.perOption,
      missed: fb.missed,
    })
  }

  // ── concepts (KnowledgeState lookup; null when no row) ──
  const conceptIds = brief.conceptIds
  const [conceptRows, stateRows] = await Promise.all([
    conceptIds.length
      ? db.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    conceptIds.length
      ? db.knowledgeState.findMany({
          where: { profileId, conceptId: { in: conceptIds } },
          select: { conceptId: true, score: true, status: true },
        })
      : Promise.resolve([] as { conceptId: string; score: number; status: string }[]),
  ])
  const nameOf = new Map(conceptRows.map((c) => [c.id, c.name]))
  const stateOf = new Map(stateRows.map((s) => [s.conceptId, s]))
  const concepts = conceptIds.map((id, i) => {
    const st = stateOf.get(id)
    return {
      id,
      name: nameOf.get(id) ?? id,
      primary: i === 0,
      mastery: st ? Math.round(st.score) : null,
      status: st?.status ?? null,
    }
  })

  // ── related graph groups (verified edges only, via the P08 engine) ──
  const primary = conceptIds[0] ?? null
  let related: SimDebrief['related'] = null
  let topicId: string | null = null
  let subjectCode: string | null = null
  if (primary) {
    const ctx = await loadGraphContext(profileId)
    const hub = ctx.concepts.get(primary)
    if (hub) {
      topicId = hub.topicId
      subjectCode = hub.subjectCode
      const raw = ctx.neighborsOf(primary)
      const groups: NonNullable<SimDebrief['related']> = []
      for (const kind of DEBRIEF_GROUP_ORDER) {
        const items = raw.get(kind)
        if (!items || items.length === 0) continue
        groups.push({
          kind,
          label: GRAPH_GROUP_META[kind].label,
          blurb: GRAPH_GROUP_META[kind].blurb,
          items: items.slice(0, 4).map((n) => ({
            id: n.otherId,
            name: ctx.concepts.get(n.otherId)?.name ?? n.otherId,
            edgeLabel: n.edgeLabel,
          })),
        })
        if (groups.length >= 4) break
      }
      if (groups.length) related = groups
    }
  }

  const scores: SimDebrief['scores'] = {
    total: attempt.score,
    diagnosis: scoreAttempt(brief, events).diagnosis,
    reasoning: attempt.reasoning,
    investigations: attempt.investigations,
    management: attempt.management,
    timeMs: attempt.timeMs,
    estimateMinutes: simCase.estimateMinutes,
  }

  return {
    attemptId: attempt.id,
    caseId: simCase.id,
    caseTitle: simCase.title,
    specialty: simCase.specialty,
    difficulty: simCase.difficulty as SimDifficulty,
    mode: attempt.mode,
    diagnosis: brief.diagnosis,
    diagnosisCorrect: attempt.diagnosisCorrect,
    scores,
    timeline,
    learning: brief.learning,
    concepts,
    related,
    mistakeFed: mistakeFed !== undefined ? mistakeFed : await feedMistakes(profileId, simCase, brief, {
      diagnosisCorrect: attempt.diagnosisCorrect,
      reasoning: attempt.reasoning,
      events,
    }),
    handoffs: { conceptId: primary, topicId, subjectCode },
    ...(attempt.mode === 'ai' ? { aiNote: 'Completed in AI Case Mode — AI-generated educational scenario.' } : {}),
  }
}
