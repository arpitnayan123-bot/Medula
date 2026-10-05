// ─── PRODUCT 10 · MEDICAL IMAGE LEARNING LAB — deterministic engine ──────────
// Everything measurable is MEASURED from LabAttempt rows; grading is
// DETERMINISTIC against the curated brief (the LLM never grades) and the
// brief's answer key NEVER reaches the client: payloads carry {id,label}
// option projections, guided reveal steps (teaching content) and counts only —
// never verdicts, whys, correct-option ids, pin regions or aiBrief. Pin
// grading happens SERVER-SIDE. No chain-of-thought anywhere — feedback is
// conclusions + explanations only.
//
// Event log shape (LabAttempt.answers, append-only JSON):
//   { type:'session', imageIds[], ts }                          (rapid only)
//   { type:'answer', stepId, chosen?, pin?, aspect?, correct,
//     score, timeMs, ts, hits?, total?, missedIds? }            (graded steps)
//
// Binding grading rules (worklog Task 10):
//   identify/diagnose = 100 correct / 60 acceptable / 0 wrong
//   interpret locate  = pin hit if hypot(((dx/100)·aspect)² + (dy/100)²) ≤ r/100
//                       (aspect = natural w/h from client, clamped 0.2..5),
//                       locate score = 100·hits/locatable
//   interpret labels  = 100·presentPicked/presentTotal − 20·absentPicked (clamp 0-100)
//   interpret step    = mean(locate, labels)  → attempt total = mean over steps
//   quiz              = per-question 100/60/0 → mean
//   rapid per item    = correct → clamp(100 − 4·floor(timeMs/1000), 40, 100)
//                       (server clamps reported timeMs to 300..30000), else 0;
//                       session = mean over items
//   attempt.correct   = total ≥ 60 (the "acceptable" bar on the 100/60/0 scale)

import { db } from '@/lib/db'
import { loadGraphContext } from '@/lib/knowledge-graph'
import { GRAPH_GROUP_META, LAB_MODALITIES } from '@/lib/types'
import type {
  LabBrief,
  LabDebrief,
  LabFeedback,
  LabFindingBrief,
  LabGuidedStep,
  LabHome,
  LabImageDetail,
  LabImageSummary,
  LabMode,
  LabPin,
  LabPinResult,
} from '@/lib/types'
import type { GraphGroupKind } from '@/lib/types'

// ─── INTERNAL AUTHORING TYPES (mirror prisma/seed-lab-*.ts) ──────────────────

export type LabVerdict = 'correct' | 'acceptable' | 'wrong'

export interface LabOptionBrief {
  id: string
  label: string
  verdict: LabVerdict
  why: string
}

// LabBrief / LabFindingBrief are the FROZEN shapes in @/lib/types — the seed
// packs author against them verbatim; this engine only re-validates the Json.

// ─── EVENT TYPES ─────────────────────────────────────────────────────────────

export interface LabAnswerEvent {
  type: 'answer'
  stepId: string
  chosen?: string[] // option ids (identify/diagnose/quiz/labels/rapid)
  pin?: { x: number; y: number } | null // locate step (%, clamped) — legacy single-pin shape
  pins?: { x: number; y: number }[] // locate step — every pin placed so far (multi-pin locate)
  aspect?: number // locate step — natural w/h reported by the client
  correct: boolean
  score: number
  timeMs: number
  ts: number
  hits?: number // locate steps — regions the pin fell inside
  total?: number // locate steps — locatable region count
  missedIds?: string[] // finding ids missed (locate misses + unpicked present labels)
}

export interface LabSessionEvent {
  type: 'session'
  imageIds: string[] // rapid-fire item order, fixed at session start
  ts: number
}

export type LabEvent = LabAnswerEvent | LabSessionEvent

// ─── MODES ───────────────────────────────────────────────────────────────────

/** The five modes the player engine grades; 'guided' is a non-graded study view. */
export const GRADED_LAB_MODES: LabMode[] = ['identify', 'interpret', 'diagnose', 'quiz', 'rapid']

export const isGradedMode = (mode: string): mode is LabMode =>
  (GRADED_LAB_MODES as string[]).includes(mode)

// ─── PARSERS (stored Json → typed shapes; defensive, never throws) ───────────

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

const VERDICTS: LabVerdict[] = ['correct', 'acceptable', 'wrong']

function parseOptions(raw: unknown): LabOptionBrief[] {
  if (!Array.isArray(raw)) return []
  const out: LabOptionBrief[] = []
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue
    const v = o as Record<string, unknown>
    const id = asString(v.id)
    const label = asString(v.label)
    if (!id || !label) continue
    const verdict = VERDICTS.includes(v.verdict as LabVerdict) ? (v.verdict as LabVerdict) : 'wrong'
    out.push({ id, label, verdict, why: asString(v.why) })
  }
  return out
}

function parseRegion(raw: unknown): { x: number; y: number; r: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const v = raw as Record<string, unknown>
  const x = typeof v.x === 'number' && Number.isFinite(v.x) ? v.x : NaN
  const y = typeof v.y === 'number' && Number.isFinite(v.y) ? v.y : NaN
  const r = typeof v.r === 'number' && Number.isFinite(v.r) ? v.r : NaN
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return undefined
  return { x, y, r }
}

function parseFindings(raw: unknown): LabFindingBrief[] {
  if (!Array.isArray(raw)) return []
  const out: LabFindingBrief[] = []
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue
    const v = f as Record<string, unknown>
    const id = asString(v.id)
    const label = asString(v.label)
    if (!id || !label) continue
    out.push({
      id,
      label,
      description: asString(v.description),
      why: asString(v.why),
      ...(v.primary === true ? { primary: true } : {}),
      ...(v.present === false ? { present: false } : {}),
      ...(typeof v.commonMiss === 'string' && v.commonMiss ? { commonMiss: v.commonMiss } : {}),
      ...(parseRegion(v.region) ? { region: parseRegion(v.region)! } : {}),
    })
  }
  return out
}

/** Salvage the hidden answer key from the stored Json — shape-safe, never throws. */
export function parseBrief(raw: unknown): LabBrief {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const identify = (b.identify && typeof b.identify === 'object' ? b.identify : {}) as Record<string, unknown>
  const diagnosis = (b.diagnosis && typeof b.diagnosis === 'object' ? b.diagnosis : {}) as Record<string, unknown>
  const quizRaw = Array.isArray(b.quiz) ? b.quiz : []
  const quiz = quizRaw
    .map((q) => {
      if (!q || typeof q !== 'object') return null
      const v = q as Record<string, unknown>
      const id = asString(v.id)
      const qText = asString(v.q)
      if (!id || !qText) return null
      return { id, q: qText, options: parseOptions(v.options), teaching: asString(v.teaching) }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)
  const aiBrief = asString(b.aiBrief)
  return {
    identify: { prompt: asString(identify.prompt), options: parseOptions(identify.options) },
    findings: parseFindings(b.findings),
    diagnosis: {
      context: asString(diagnosis.context),
      prompt: asString(diagnosis.prompt),
      options: parseOptions(diagnosis.options),
    },
    quiz,
    guided: Array.isArray(b.guided) ? b.guided.filter((s): s is string => typeof s === 'string') : [],
    teaching: Array.isArray(b.teaching) ? b.teaching.filter((s): s is string => typeof s === 'string') : [],
    ...(aiBrief ? { aiBrief } : {}),
  }
}

export function parseEvents(raw: unknown): LabEvent[] {
  if (!Array.isArray(raw)) return []
  const out: LabEvent[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const v = e as Record<string, unknown>
    const ts = typeof v.ts === 'number' && Number.isFinite(v.ts) ? v.ts : 0
    if (v.type === 'session' && Array.isArray(v.imageIds)) {
      out.push({
        type: 'session',
        imageIds: v.imageIds.filter((i): i is string => typeof i === 'string'),
        ts,
      })
    } else if (v.type === 'answer' && typeof v.stepId === 'string') {
      const pinRaw = (v.pin && typeof v.pin === 'object' ? v.pin : null) as Record<string, unknown> | null
      out.push({
        type: 'answer',
        stepId: v.stepId,
        ...(Array.isArray(v.chosen)
          ? { chosen: v.chosen.filter((c): c is string => typeof c === 'string') }
          : {}),
        ...(pinRaw && typeof pinRaw.x === 'number' && typeof pinRaw.y === 'number'
          ? { pin: { x: pinRaw.x, y: pinRaw.y } }
          : {}),
        ...(Array.isArray(v.pins)
          ? {
              pins: v.pins
                .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
                .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
                .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
            }
          : {}),
        ...(typeof v.aspect === 'number' && Number.isFinite(v.aspect) ? { aspect: v.aspect } : {}),
        correct: v.correct === true,
        score: typeof v.score === 'number' && Number.isFinite(v.score) ? v.score : 0,
        timeMs: typeof v.timeMs === 'number' && Number.isFinite(v.timeMs) ? v.timeMs : 0,
        ts,
        ...(typeof v.hits === 'number' && Number.isFinite(v.hits) ? { hits: v.hits } : {}),
        ...(typeof v.total === 'number' && Number.isFinite(v.total) ? { total: v.total } : {}),
        ...(Array.isArray(v.missedIds)
          ? { missedIds: v.missedIds.filter((m): m is string => typeof m === 'string') }
          : {}),
      })
    }
  }
  return out
}

export function parseConceptIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : []
}

// ─── MATH HELPERS ────────────────────────────────────────────────────────────

const clampScore = (n: number): number => Math.min(100, Math.max(0, Math.round(n)))
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Server-side clamps (binding): reported per-item time 300..30000ms, aspect 0.2..5, pin 0..100%. */
export const clampReportedTimeMs = (v: unknown): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(30000, Math.max(300, n)) : 300
}
export const clampAspect = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.max(0.2, n)) : 1
}
export const clampPin = (v: unknown): { x: number; y: number } | null => {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  const x = Number(p.x)
  const y = Number(p.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) }
}

// ─── ROW LITES (minimal prisma row shapes the engine needs) ──────────────────

export interface LabImageRowLite {
  id: string
  title: string
  diagnosis: string
  modality: string
  system: string
  subjectCode: string
  conceptIds: unknown
  src: string
  provenance: string
  sourceNote: string
  difficulty: number
  examRelevance: number
  isNormal: boolean
  compareGroup: string | null
  brief: unknown
  aiReady: boolean
}

export interface LabAttemptRowLite {
  id: string
  imageId: string
  mode: string
  status: string
  stepIndex: number
  answers: unknown
  correct: boolean
  score: number
  findingsHit: number
  findingsTotal: number
  timeMs: number
  startedAt: Date
  completedAt: Date | null
}

// ─── GUIDED STEPS (public reveal content, derived from the findings) ─────────

/**
 * The client-safe guided reveal: one step per curated finding (present
 * findings first — primary first, then the deliberate NEGATIVE finding with
 * its teaching why and no region). This is teaching content, allowed to leave
 * the server; graded options/verdicts/whys still never do.
 */
export function guidedSteps(brief: LabBrief): LabGuidedStep[] {
  const present = brief.findings.filter((f) => f.present !== false)
  const absent = brief.findings.filter((f) => f.present === false)
  present.sort((a, b) => (b.primary === true ? 1 : 0) - (a.primary === true ? 1 : 0))
  return [...present, ...absent].map((f) => ({
    id: f.id,
    label: f.label,
    description: f.description,
    why: f.why,
    region: f.region ?? null,
  }))
}

// ─── CLIENT-SAFE PROJECTIONS (brief stripped — the key never leaves) ─────────

export interface LabImageSummaryAttemptLite {
  status: string
  score: number
  mode: string
  startedAt: Date
  completedAt: Date | null
}

/** Per-image measured summary — completed runs only for the score fields. */
export function summarizeImage(row: LabImageRowLite, attempts: LabAttemptRowLite[] = []): LabImageSummary {
  const relevant = attempts.filter((a) => a.status !== 'abandoned') // active or completed
  const completed = attempts
    .filter((a) => a.status === 'completed')
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const best = completed.length ? Math.max(...completed.map((a) => a.score)) : null
  const last = completed[completed.length - 1]
  return {
    id: row.id,
    title: row.title,
    diagnosis: row.diagnosis,
    modality: row.modality as LabImageSummary['modality'],
    system: row.system,
    subjectCode: row.subjectCode,
    difficulty: row.difficulty,
    examRelevance: row.examRelevance,
    src: row.src,
    provenance: row.provenance as LabImageSummary['provenance'],
    isNormal: row.isNormal,
    compareGroup: row.compareGroup,
    attemptCount: relevant.length,
    bestScore: best,
    lastScore: last ? last.score : null,
    lastMode: last ? last.mode : null,
    lastAt: last?.completedAt ? last.completedAt.toISOString() : null,
  }
}

/**
 * Strip the brief down to the client-safe LabImageDetail: options carry
 * {id,label} ONLY — no verdicts, no whys, no correct-option ids, no pin
 * regions, no quiz answers, no aiBrief, no teaching-answer lines. Guided
 * steps (teaching/reveal content) and counts are the sanctioned exceptions.
 */
export function clientImageDetail(
  row: LabImageRowLite,
  attempts: LabAttemptRowLite[],
  extra: {
    similar: LabImageSummary[]
    concepts: { id: string; name: string }[]
    resume: LabImageDetail['resume']
  },
): LabImageDetail {
  const brief = parseBrief(row.brief)
  const labelOptions = (opts: LabOptionBrief[]) => opts.map((o) => ({ id: o.id, label: o.label }))
  const locatable = brief.findings.filter((f) => f.present !== false && f.region)
  return {
    summary: summarizeImage(row, attempts),
    identifyPrompt: brief.identify.prompt,
    identifyOptions: labelOptions(brief.identify.options),
    interpretPrompt: 'Pin the primary finding on the image, then name every finding you see.',
    interpretOptions: brief.findings.map((f) => ({ id: f.id, label: f.label })), // labels only — regions/verdicts stay server-side
    locateCount: locatable.length,
    diagnoseContext: brief.diagnosis.context,
    diagnosePrompt: brief.diagnosis.prompt,
    diagnoseOptions: labelOptions(brief.diagnosis.options),
    quiz: brief.quiz.map((q) => ({ id: q.id, q: q.q, options: labelOptions(q.options) })),
    guided: guidedSteps(brief),
    concepts: extra.concepts,
    similar: extra.similar,
    resume: extra.resume,
  }
}

// ─── STEP PLANS (per mode, from the brief) ───────────────────────────────────

export interface LabPlanStep {
  stepId: string
  kind: 'identify' | 'locate' | 'labels' | 'diagnose' | 'quiz' | 'rapid'
  prompt: string
  options: LabOptionBrief[] // option steps ({} for locate)
  locatableIds: string[] // locate step: gradable finding ids
  quizIndex?: number
  imageId?: string // rapid items
  teaching?: string // quiz step teaching line
}

const LOCATE_PROMPT = 'Tap the image to place a pin on every finding you can locate — zoom for precision.'
const LABELS_PROMPT = 'Select every finding present on this image.'

/** Plan for one image in one graded mode. Rapid has its own builder. */
export function buildPlan(mode: Exclude<LabMode, 'rapid' | 'guided'>, brief: LabBrief): LabPlanStep[] {
  if (mode === 'identify') {
    return [
      {
        stepId: 'identify',
        kind: 'identify',
        prompt: brief.identify.prompt || 'What is this image showing?',
        options: brief.identify.options,
        locatableIds: [],
      },
    ]
  }
  if (mode === 'diagnose') {
    return [
      {
        stepId: 'diagnose',
        kind: 'diagnose',
        prompt: brief.diagnosis.prompt || 'What is the most likely diagnosis?',
        options: brief.diagnosis.options,
        locatableIds: [],
      },
    ]
  }
  if (mode === 'interpret') {
    const locatable = brief.findings.filter((f) => f.present !== false && f.region)
    return [
      {
        stepId: 'locate',
        kind: 'locate',
        prompt: LOCATE_PROMPT,
        options: [],
        locatableIds: locatable.map((f) => f.id),
      },
      {
        stepId: 'labels',
        kind: 'labels',
        prompt: LABELS_PROMPT,
        options: brief.findings.map((f) => ({ id: f.id, label: f.label, verdict: (f.present === false ? 'wrong' : 'correct') as LabVerdict, why: f.description })),
        locatableIds: [],
      },
    ]
  }
  // quiz — one step per question. stepId = the brief's own quiz id (the same
  // id the detail payload exposes), so clients never need positional math.
  return brief.quiz.map((q, i) => ({
    stepId: q.id || `quiz-${i}`,
    kind: 'quiz' as const,
    prompt: q.q,
    options: q.options,
    locatableIds: [],
    quizIndex: i,
    teaching: q.teaching,
  }))
}

/** Plan for a rapid-fire session — one identify item per session image. */
export function buildRapidPlan(items: { imageId: string; brief: LabBrief }[]): LabPlanStep[] {
  return items.map((it) => ({
    stepId: it.imageId, // step id = the image id — the same id LabRapidStart.items exposes
    kind: 'rapid' as const,
    prompt: it.brief.identify.prompt || 'Recognise this image — fast.',
    options: it.brief.identify.options,
    locatableIds: [],
    imageId: it.imageId,
  }))
}

/**
 * Rebuild the rapid plan from the stored session event. stepId = the item's
 * imageId (content-addressed — stable even if the library reorders); images
 * removed since the session started are skipped honestly.
 */
export function rapidPlanFromSession(
  imageIds: string[],
  imageMap: Map<string, LabImageRowLite>,
): LabPlanStep[] {
  const items = imageIds
    .map((imageId) => {
      const row = imageMap.get(imageId)
      if (!row) return null
      return { imageId, brief: parseBrief(row.brief) }
    })
    .filter((x): x is { imageId: string; brief: LabBrief } => x !== null)
  return items.map(({ imageId, brief }) => ({
    stepId: imageId,
    kind: 'rapid' as const,
    prompt: brief.identify.prompt || 'Recognise this image — fast.',
    options: brief.identify.options,
    locatableIds: [],
    imageId,
  }))
}

// ─── GRADING (deterministic, per step) ───────────────────────────────────────

export interface LabStepInput {
  chosen?: string[]
  pins?: LabPin[] // locate step — every pin placed so far (one NEW pin per act; graded cumulatively)
  aspect?: number
  timeMs: number // ALREADY clamped by the caller (rapid: 300..30000)
}

const VERDICT_HEADLINE: Record<LabVerdict, string> = {
  correct: 'Correct.',
  acceptable: 'Defensible — but not the strongest answer here.',
  wrong: 'Not the right answer.',
}

function missedWhy(f: LabFindingBrief): string {
  return f.commonMiss ? `${f.description} Commonly missed: ${f.commonMiss}` : f.description
}

function locateFeedback(brief: LabBrief, input: LabStepInput): LabFeedback {
  const locatable = brief.findings.filter((f) => f.present !== false && f.region)
  const pins = (input.pins ?? []).slice(-24)
  const aspect = clampAspect(input.aspect)
  const results: LabPinResult[] = []
  let hits = 0
  for (const f of locatable) {
    const region = f.region!
    const hit =
      pins.length > 0 &&
      pins.some(
        (p) => Math.hypot(((p.x - region.x) / 100) * aspect, (p.y - region.y) / 100) <= region.r / 100,
      )
    if (hit) hits += 1
    // Anti-cheese: a HIT's region is revealed immediately (green); a MISS
    // never reveals its location while the step is open — the student keeps
    // reading the image, not farming revealed answer boxes. The full reveal
    // lives in the Guided Explanation (study screen) after the attempt.
    results.push({ findingId: f.id, label: f.label, region: hit ? region : null, verdict: hit ? 'hit' : 'miss' })
  }
  const total = locatable.length
  const score = total === 0 ? 100 : clampScore((100 * hits) / total)
  const missed = results
    .filter((r) => r.verdict === 'miss')
    .map((r) => {
      const f = brief.findings.find((x) => x.id === r.findingId)!
      return { id: r.findingId, label: r.label, why: missedWhy(f) }
    })
  const headline =
    total === 0
      ? 'Nothing to locate on this image.'
      : hits === total
        ? 'Direct hit — every finding zone covered.'
        : hits > 0
          ? `${hits} of ${total} finding zones so far — keep pinning or move on.`
          : 'Not on a finding zone yet — study the image and pin again, or move on to naming.'
  return {
    correct: total > 0 && hits === total,
    score,
    headline,
    missed,
    pins: { student: pins.length ? pins[pins.length - 1] : null, results, hits, total },
  }
}

function labelsFeedback(brief: LabBrief, input: LabStepInput): LabFeedback {
  const options = brief.findings.map((f) => ({ id: f.id, label: f.label, verdict: (f.present === false ? 'wrong' : 'correct') as LabVerdict, why: f.description }))
  const chosen = (input.chosen ?? []).filter((id) => options.some((o) => o.id === id))
  const chosenSet = new Set(chosen)
  const present = options.filter((o) => o.verdict === 'correct')
  const presentPicked = present.filter((o) => chosenSet.has(o.id)).length
  const absentPicked = options.filter((o) => o.verdict === 'wrong' && chosenSet.has(o.id)).length
  const raw = present.length > 0 ? (100 * presentPicked) / present.length - 20 * absentPicked : absentPicked > 0 ? 0 : 100
  const score = clampScore(raw)
  const perOption = options.map((o) => ({
    id: o.id,
    label: o.label,
    verdict: o.verdict,
    why: missedWhy(brief.findings.find((f) => f.id === o.id)!),
  }))
  const missed = present
    .filter((o) => !chosenSet.has(o.id))
    .map((o) => {
      const f = brief.findings.find((f) => f.id === o.id)!
      return { id: o.id, label: o.label, why: missedWhy(f) }
    })
  const headline =
    score >= 100
      ? 'All findings named — nothing missed, nothing over-called.'
      : score >= 60
        ? `The core findings are named — ${missed.length + absentPicked} call${missed.length + absentPicked === 1 ? '' : 's'} to review.`
        : 'Key findings were missed or over-called — compare your picks with the reveal.'
  return {
    correct: score >= 100,
    score,
    headline,
    perOption,
    missed,
  }
}

function optionFeedback(options: LabOptionBrief[], chosenIds: string[]): LabFeedback {
  const chosen = chosenIds.filter((id) => options.some((o) => o.id === id))
  const picked = chosen.length ? options.find((o) => o.id === chosen[0]) : undefined
  const verdict: LabVerdict = picked?.verdict ?? 'wrong'
  const score = verdict === 'correct' ? 100 : verdict === 'acceptable' ? 60 : 0
  const perOption = options.map((o) => ({ id: o.id, label: o.label, verdict: o.verdict, why: o.why }))
  const missed =
    verdict === 'correct'
      ? []
      : options
          .filter((o) => o.verdict === 'correct')
          .map((o) => ({ id: o.id, label: o.label, why: o.why || 'The correct answer.' }))
  return {
    correct: verdict === 'correct',
    score,
    headline: VERDICT_HEADLINE[verdict],
    perOption,
    missed,
  }
}

function rapidFeedback(options: LabOptionBrief[], chosenIds: string[], timeMs: number): LabFeedback {
  const fb = optionFeedback(options, chosenIds)
  // Frozen rapid rule: verdict 'correct' → speed formula; everything else 0.
  const score = fb.correct ? Math.min(100, Math.max(40, 100 - 4 * Math.floor(timeMs / 1000))) : 0
  const seconds = (timeMs / 1000).toFixed(1)
  return {
    ...fb,
    score,
    headline: fb.correct
      ? `Clean recognition in ${seconds}s — the faster the call, the higher the score.`
      : 'Missed — in rapid fire a wrong or slow-unrecognised pattern scores zero.',
  }
}

/** Grade ONE step deterministically. `brief` is the brief of the step's image. */
export function gradeStep(step: LabPlanStep, brief: LabBrief, input: LabStepInput): LabFeedback {
  switch (step.kind) {
    case 'locate':
      return locateFeedback(brief, input)
    case 'labels':
      return labelsFeedback(brief, input)
    case 'identify':
    case 'diagnose':
      return optionFeedback(step.options, input.chosen ?? [])
    case 'quiz':
      return optionFeedback(step.options, input.chosen ?? [])
    case 'rapid':
      return rapidFeedback(step.options, input.chosen ?? [], input.timeMs)
  }
}

// ─── SCORING (per attempt, from the event log) ───────────────────────────────

export interface LabAttemptScores {
  total: number
  correct: boolean
  findingsHit: number
  findingsTotal: number
}

/** Mean step score over the plan steps that HAVE a graded event (sim precedent). */
export function scoreAttempt(plan: LabPlanStep[], events: LabEvent[]): LabAttemptScores {
  const graded = events.filter((e): e is LabAnswerEvent => e.type === 'answer')
  const answered = new Map(graded.map((e) => [e.stepId, e]))
  const stepScores: number[] = []
  for (const step of plan) {
    const ev = answered.get(step.stepId)
    if (ev) stepScores.push(clampScore(ev.score))
  }
  const total = clampScore(mean(stepScores))
  let findingsHit = 0
  let findingsTotal = 0
  for (const step of plan) {
    if (step.kind !== 'locate') continue
    const ev = answered.get(step.stepId)
    if (ev && typeof ev.hits === 'number' && typeof ev.total === 'number') {
      findingsHit += ev.hits
      findingsTotal += ev.total
    }
  }
  return { total, correct: stepScores.length > 0 && total >= 60, findingsHit, findingsTotal }
}

/** Index of the next unanswered plan step (plan.length when everything is answered). */
export function nextIndexFor(plan: LabPlanStep[], events: LabEvent[]): number {
  const answered = new Set(
    events.filter((e): e is LabAnswerEvent => e.type === 'answer').map((e) => e.stepId),
  )
  const idx = plan.findIndex((s) => !answered.has(s.stepId))
  return idx === -1 ? plan.length : idx
}

// ─── HOME (every number MEASURED from LabAttempt rows) ───────────────────────

/** Debrief group priority — mirrors knowledge-graph GROUP_ORDER (not exported there). */
const DEBRIEF_GROUP_ORDER: GraphGroupKind[] = [
  'prerequisite', 'confusable', 'mechanism', 'caused_by', 'manifestation',
  'investigation', 'treatment', 'complication', 'causes', 'related', 'unlocks', 'application',
]

/** Finding-miss bookkeeping for missedPatterns: findingId → label per image brief. */
function findingIndex(rows: LabImageRowLite[]): Map<string, { label: string; imageId: string; imageTitle: string }> {
  const idx = new Map<string, { label: string; imageId: string; imageTitle: string }>()
  for (const row of rows) {
    for (const f of parseBrief(row.brief).findings) {
      idx.set(f.id, { label: f.label, imageId: row.id, imageTitle: row.title })
    }
  }
  return idx
}

export async function loadLabHome(profileId: string): Promise<LabHome> {
  const [imageRows, attemptRows] = await Promise.all([
    db.labImage.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.labAttempt.findMany({
      where: { profileId },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    }),
  ])
  const rows = imageRows as unknown as LabImageRowLite[]
  const completed = attemptRows.filter((a) => a.status === 'completed') // chronological asc
  const imageById = new Map(rows.map((r) => [r.id, r]))

  // ── stats ──
  const studiedImageIds = new Set(attemptRows.filter((a) => a.status !== 'abandoned').map((a) => a.imageId))
  const accuracy = completed.length
    ? Math.round((100 * completed.filter((a) => a.correct).length) / completed.length)
    : null
  const pinsHit = completed.reduce((n, a) => n + a.findingsHit, 0)
  const pinsTotal = completed.reduce((n, a) => n + a.findingsTotal, 0)
  const rapidRuns = completed.filter((a) => a.mode === 'rapid')
  const stats = {
    imagesAvailable: rows.length,
    imagesStudied: studiedImageIds.size,
    attempts: attemptRows.length,
    accuracy,
    interpretationCoverage: pinsTotal > 0 ? Math.round((100 * pinsHit) / pinsTotal) : null,
    avgTimeMs: completed.length ? Math.round(mean(completed.map((a) => a.timeMs))) : null,
    rapidBest: rapidRuns.length ? Math.max(...rapidRuns.map((a) => a.score)) : null,
  }

  // ── modalities (platform order first, then any legacy labels) ──
  const present: string[] = []
  for (const m of LAB_MODALITIES) {
    if (rows.some((r) => r.modality === m)) present.push(m)
  }
  for (const r of rows) {
    if (!present.includes(r.modality)) present.push(r.modality)
  }
  const modalities = present.map((name) => {
    const modImageIds = new Set(rows.filter((r) => r.modality === name).map((r) => r.id))
    const modRuns = completed.filter((a) => modImageIds.has(a.imageId))
    return {
      name,
      count: rows.filter((r) => r.modality === name).length,
      attempts: modRuns.length,
      accuracy: modRuns.length
        ? Math.round((100 * modRuns.filter((a) => a.correct).length) / modRuns.length)
        : null,
    }
  })
  const modalityRunCounts = new Map(modalities.map((m) => [m.name, m.attempts]))

  // ── weak modalities (≥1 completed run and accuracy <70) ──
  const weakModalities = modalities
    .filter((m) => m.attempts > 0 && m.accuracy !== null && m.accuracy < 70)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .map((m) => ({ label: `${m.name} images`, accuracy: m.accuracy!, attempts: m.attempts }))

  // ── missed patterns: same finding label missed in ≥2 completed runs ──
  const fIdx = findingIndex(rows)
  const missMap = new Map<string, { runs: Set<string>; lastAt: number; imageId: string }>()
  for (const run of completed) {
    const missedIds = new Set<string>()
    for (const e of parseEvents(run.answers)) {
      if (e.type !== 'answer' || !e.missedIds) continue
      for (const id of e.missedIds) missedIds.add(id)
    }
    for (const fid of missedIds) {
      const meta = fIdx.get(fid)
      if (!meta) continue
      const entry = missMap.get(meta.label) ?? { runs: new Set<string>(), lastAt: 0, imageId: meta.imageId }
      entry.runs.add(run.id)
      entry.lastAt = Math.max(entry.lastAt, (run.completedAt ?? run.startedAt).getTime())
      entry.imageId = meta.imageId
      missMap.set(meta.label, entry)
    }
  }
  const missedPatterns = [...missMap.entries()]
    .filter(([, v]) => v.runs.size >= 2)
    .sort((a, b) => b[1].runs.size - a[1].runs.size || b[1].lastAt - a[1].lastAt)
    .slice(0, 6)
    .map(([label, v]) => ({
      label,
      count: v.runs.size,
      lastImageTitle: imageById.get(v.imageId)?.title ?? v.imageId,
    }))

  // ── recommended: unattempted in weakest modality → any unattempted → lowest last score ──
  const attemptedImageIds = studiedImageIds
  const unattempted = rows.filter((r) => !attemptedImageIds.has(r.id))
  const weakest = modalities
    .filter((m) => m.accuracy !== null && (modalityRunCounts.get(m.name) ?? 0) > 0)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100) || (modalityRunCounts.get(a.name) ?? 0) - (modalityRunCounts.get(b.name) ?? 0))[0]
  let recommended: LabHome['recommended'] = null
  const inWeakest = weakest ? unattempted.filter((r) => r.modality === weakest.name) : []
  const firstUnattempted = (inWeakest.length ? inWeakest : unattempted)[0]
  if (firstUnattempted) {
    const reason =
      inWeakest.length && weakest
        ? `Not attempted yet — targets your weakest measured area (${weakest.name} at ${weakest.accuracy}% accuracy).`
        : `Not attempted yet — ${unattempted.length} image${unattempted.length === 1 ? '' : 's'} still fresh for you.`
    recommended = { imageId: firstUnattempted.id, title: firstUnattempted.title, reason }
  } else if (rows.length) {
    // every image attempted → the one whose latest completed run scored lowest
    const lastCompletedScore = (imageId: string): number => {
      const runs = completed.filter((a) => a.imageId === imageId)
      return runs.length ? runs[runs.length - 1]!.score : -1
    }
    const worst = [...rows].sort(
      (a, b) => lastCompletedScore(a.id) - lastCompletedScore(b.id) || a.title.localeCompare(b.title),
    )[0]!
    const score = lastCompletedScore(worst.id)
    recommended = {
      imageId: worst.id,
      title: worst.title,
      reason:
        score >= 0
          ? `Your latest run here scored ${score}% — worth another pass to close the gap.`
          : 'Attempted but never completed — finish the run to bank the score.',
    }
  }

  // ── recent (last 5 completed, newest first) ──
  const recent = [...completed]
    .reverse()
    .slice(0, 5)
    .map((a) => ({
      imageId: a.imageId,
      title: imageById.get(a.imageId)?.title ?? a.imageId,
      mode: a.mode,
      score: a.score,
      correct: a.correct,
      at: (a.completedAt ?? a.startedAt).toISOString(),
    }))

  // ── resume (most recent active attempt) ──
  const activeRun = [...attemptRows].reverse().find((a) => a.status === 'active')
  const resume = activeRun
    ? {
        attemptId: activeRun.id,
        imageId: activeRun.imageId,
        imageTitle: imageById.get(activeRun.imageId)?.title ?? activeRun.imageId,
        mode: activeRun.mode,
      }
    : null

  const images = rows.map((r) => summarizeImage(r, attemptRows.filter((a) => a.imageId === r.id)))

  return {
    stats,
    modalities,
    images,
    weakModalities,
    missedPatterns,
    recommended,
    rapidPoolSize: rows.length,
    recent,
    resume,
  }
}

// ─── MISTAKE INTELLIGENCE FEED (on complete) ─────────────────────────────────

export interface LabMistakeFeed {
  errorPattern: boolean
  revisionItem: boolean
  reason: string
}

/**
 * Feed the shared mistake/revision intelligence from a COMPLETED graded run:
 *  - wrong graded identify/diagnose/rapid → ErrorPattern('visual', primary
 *    concept) + RevisionItem (priority 3, minutes 10)
 *  - interpret with pin coverage <50% → ErrorPattern only
 * Max 1 RevisionItem per run. Honest booleans for the debrief.
 */
export async function feedMistakes(
  profileId: string,
  image: { title: string; diagnosis: string; conceptIds: string[] },
  attempt: { mode: string; correct: boolean; findingsHit: number; findingsTotal: number },
): Promise<LabMistakeFeed | null> {
  const primary = image.conceptIds[0] ?? null
  const reasons: string[] = []
  let fedPattern = false
  let fedRevision = false

  const upsertPattern = async (): Promise<boolean> => {
    if (!primary) return false
    await db.errorPattern.upsert({
      where: { profileId_errorType_conceptId: { profileId, errorType: 'visual', conceptId: primary } },
      create: { profileId, errorType: 'visual', conceptId: primary, count: 1 },
      update: { count: { increment: 1 }, lastAt: new Date() },
    })
    return true
  }

  const coverage = attempt.findingsTotal > 0 ? (100 * attempt.findingsHit) / attempt.findingsTotal : null

  if (!attempt.correct && (attempt.mode === 'identify' || attempt.mode === 'diagnose' || attempt.mode === 'rapid')) {
    fedPattern = (await upsertPattern()) || fedPattern
    if (primary) {
      const concept = await db.concept.findUnique({ where: { id: primary }, select: { id: true } })
      if (concept) {
        const revisionReason = `Missed image "${image.title}" — answer was ${image.diagnosis}`
        await db.revisionItem.create({
          data: { profileId, conceptId: primary, reason: revisionReason, priority: 3, minutes: 10 },
        })
        fedRevision = true
        reasons.push(`${revisionReason} — added to your revision queue.`)
      } else {
        reasons.push('Image missed — no valid linked concept to feed to revision.')
      }
    } else {
      reasons.push('Image missed — it has no linked concept to feed to revision.')
    }
  } else if (attempt.mode === 'interpret' && coverage !== null && coverage < 50) {
    fedPattern = (await upsertPattern()) || fedPattern
    reasons.push(`Only ${Math.round(coverage)}% of the pin targets were located — logged as a visual-recognition pattern.`)
  }

  if (!fedPattern && !fedRevision) return null
  return { errorPattern: fedPattern, revisionItem: fedRevision, reason: reasons.join(' ') }
}

// ─── DEBRIEF ─────────────────────────────────────────────────────────────────

export interface LabCompletedAttemptLite {
  id: string
  mode: string
  score: number
  correct: boolean
  findingsHit: number
  findingsTotal: number
  timeMs: number
}

/**
 * Build the full LabDebrief. `mistakeFed` comes from feedMistakes — pass it to
 * avoid double-feeding. `planSource` supplies the graded briefs: the attempt
 * image's brief, plus (rapid) every session image's brief.
 */
export async function buildDebrief(
  profileId: string,
  image: LabImageRowLite,
  attempt: LabCompletedAttemptLite,
  events: LabEvent[],
  plan: LabPlanStep[],
  briefOf: (imageId: string) => LabBrief | undefined,
  mistakeFed?: LabMistakeFeed | null,
): Promise<LabDebrief> {
  // ── timeline (chronological, brief-resolved feedback) ──
  const graded = events.filter((e): e is LabAnswerEvent => e.type === 'answer')
  const byStepId = new Map(graded.map((e) => [e.stepId, e]))
  const steps: LabDebrief['steps'] = []
  for (const step of plan) {
    const ev = byStepId.get(step.stepId)
    if (!ev) continue // never-answered step — nothing to reveal honestly
    const brief = briefOf(step.imageId ?? image.id)
    if (!brief) continue // stale event for removed content — skip honestly
    const evPins = ev.pins ?? (ev.pin ? [ev.pin] : [])
    const fb = gradeStep(step, brief, {
      chosen: ev.chosen,
      pins: evPins,
      aspect: ev.aspect,
      timeMs: ev.timeMs,
    })
    steps.push({
      prompt: step.prompt,
      chosenLabels:
        step.kind === 'locate'
          ? evPins.length
            ? evPins.map((p) => `Pin ${Math.round(p.x)}%, ${Math.round(p.y)}%`)
            : ['No pin placed']
          : (ev.chosen ?? []).map(
              (id) =>
                (step.kind === 'labels'
                  ? brief.findings.find((f) => f.id === id)?.label
                  : step.options.find((o) => o.id === id)?.label) ?? id,
            ),
      correct: ev.correct,
      score: clampScore(ev.score),
      headline: fb.headline,
      perOption: fb.perOption ?? fb.missed?.map((m) => ({ id: m.id, label: m.label, verdict: 'wrong' as const, why: m.why })),
    })
  }

  // ── concepts (KnowledgeState lookup; null when no row) ──
  const conceptIds = parseConceptIds(image.conceptIds)
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
  const concepts = conceptIds.map((id) => {
    const st = stateOf.get(id)
    return {
      id,
      name: nameOf.get(id) ?? id,
      mastery: st ? Math.round(st.score) : null,
      status: st?.status ?? null,
    }
  })

  // ── related graph groups (verified edges only, via the P08 engine) ──
  const primary = conceptIds[0] ?? null
  let related: LabDebrief['related'] = null
  let topicId: string | null = null
  let subjectCode: string | null = null
  if (primary) {
    const ctx = await loadGraphContext(profileId)
    const hub = ctx.concepts.get(primary)
    if (hub) {
      topicId = hub.topicId
      subjectCode = hub.subjectCode
      const raw = ctx.neighborsOf(primary)
      const groups: NonNullable<LabDebrief['related']> = []
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

  return {
    attemptId: attempt.id,
    imageId: image.id,
    imageTitle: image.title,
    diagnosis: image.diagnosis,
    mode: attempt.mode as LabMode,
    scores: {
      total: attempt.score,
      timeMs: attempt.timeMs,
      findingsHit: attempt.findingsHit,
      findingsTotal: attempt.findingsTotal,
    },
    steps,
    teaching: parseBrief(image.brief).teaching,
    concepts,
    related,
    mistakeFed: mistakeFed !== undefined ? mistakeFed : null,
    handoffs: { conceptId: primary, topicId, subjectCode },
    nextImages: await nextImagesFor(profileId, image),
  }
}

/** «Practice similar images» — up to 6 same-modality images, least-attempted first. */
export async function nextImagesFor(profileId: string, image: LabImageRowLite): Promise<LabImageSummary[]> {
  const [rows, attemptRows] = await Promise.all([
    db.labImage.findMany({ where: { modality: image.modality, id: { not: image.id } } }),
    db.labAttempt.findMany({
      where: { profileId, imageId: { not: image.id } },
      select: { imageId: true, status: true },
    }),
  ])
  const attemptCount = new Map<string, number>()
  for (const a of attemptRows) {
    if (a.status === 'abandoned') continue
    attemptCount.set(a.imageId, (attemptCount.get(a.imageId) ?? 0) + 1)
  }
  return (rows as unknown as LabImageRowLite[])
    .sort(
      (a, b) =>
        (attemptCount.get(a.id) ?? 0) - (attemptCount.get(b.id) ?? 0) ||
        b.examRelevance - a.examRelevance ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 6)
    .map((r) => summarizeImage(r))
}

// ─── RAPID-SESSION POOL (least-attempted first, deterministic) ────────────────

export const RAPID_ITEM_COUNT = 10
export const RAPID_TIME_LIMIT_MS = 30000 // per-item soft limit (server clamps reported time)

export async function pickRapidPool(
  profileId: string,
  filter: { modality?: string; subjectCode?: string } = {},
): Promise<LabImageRowLite[]> {
  const where: Record<string, unknown> = {}
  if (filter.modality) where.modality = filter.modality
  if (filter.subjectCode) where.subjectCode = filter.subjectCode
  const [rows, counts] = await Promise.all([
    db.labImage.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.labAttempt.groupBy({
      by: ['imageId'],
      where: { profileId, status: { not: 'abandoned' } },
      _count: { _all: true },
    }),
  ])
  const attemptCount = new Map(counts.map((c) => [c.imageId, c._count._all]))
  return (rows as unknown as LabImageRowLite[])
    .sort(
      (a, b) =>
        (attemptCount.get(a.id) ?? 0) - (attemptCount.get(b.id) ?? 0) ||
        b.examRelevance - a.examRelevance ||
        a.id.localeCompare(b.id),
    )
    .slice(0, RAPID_ITEM_COUNT)
}
