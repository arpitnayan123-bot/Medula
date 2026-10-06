// ─── MEDOS shared types ───

// Lesson content contracts live in the curriculum layer; the client mirrors
// them here (type-only re-export — no runtime import cycle).
import type {
  ConceptLesson as ConceptLessonContract,
  PaperExplainer as PaperExplainerContract,
  Asset3DRecord as Asset3DRecordContract,
  SubjectTaxonomy as SubjectTaxonomyContract,
  CurriculumRecord as CurriculumRecordContract,
} from './curriculum/types'

export type ConceptLesson = ConceptLessonContract
export type PaperExplainer = PaperExplainerContract
export type Asset3DRecord = Asset3DRecordContract
export type SubjectTaxonomy = SubjectTaxonomyContract
export type CurriculumRecord = CurriculumRecordContract
export type Phase = SubjectTaxonomyContract['phase']

export type View =
  | 'landing' | 'signin' | 'onboarding' | 'home' | 'map' | 'explore' | 'research' | 'understand' | 'learn' | 'hub' | 'questions'
  | 'adaptive'
  | 'exam'
  | 'mistakes'
  | 'revision'
  | 'planner'
  | 'graph'
  | 'performance'
  | 'cases' | 'lab' | 'voice' | 'revise' | 'tutor' | 'progress' | 'roadmap' | 'profile'
  | 'library'
  | 'ask' // PRODUCT 15 — AI Medical Search & Answer Engine
  | 'community' // PRODUCT 16 — Medical Learning Community & Accountability
  | 'gamify' // PRODUCT 17 — Gamified Medical Learning & Motivation Engine
  | 'brain' // PRODUCT 18 — Personal Medical Brain
  | 'faculty' // PRODUCT 19 — AI Faculty & Content Intelligence

export interface Profile {
  id: string
  name: string
  year: number // 1..4 MBBS, 5 intern, 6 dedicated
  semester: number
  collegeName: string
  collegeType: string
  gradYear: number
  internshipDone: boolean
  pastScore: string
  prepStage: 'exploring' | 'foundation' | 'regular' | 'serious' | 'dedicated' | 'revision'
  dailyHours: number
  weekdayHours: number
  weekendHours: number
  learningStyles: string[]
  resources: string[]
  examMode: boolean
  examLabel: string
  examDate: string | null
  onboarded: boolean
}

export interface SubjectSummary {
  id: string; code: string; name: string; year: number; color: string
  neetWeight: number; blurb: string
  topicCount: number; conceptCount: number
  mastery: number // 0..100 (avg of knowledge states or 0)
  status: 'new' | 'weak' | 'unstable' | 'strong'
}

export interface TopicSummary {
  id: string; subjectId: string; name: string; system: string | null
  importance: number; description: string
  conceptCount: number; mastery: number
}

export interface ConceptNode {
  id: string; name: string; kind: string; summary: string
  mastery: number; status: 'new' | 'weak' | 'unstable' | 'strong'
  estRecall: number; examRelevance: number; difficulty: number
}

export interface GraphPayload {
  nodes: (ConceptNode & { topicId: string; subjectCode: string; subjectColor: string })[]
  edges: { from: string; to: string; type: string; label: string }[]
}

export interface Section { h: string; body?: string[]; table?: { headers: string[]; rows: string[][] } }

export interface ConceptDetail {
  id: string; name: string; kind: string; summary: string; whyMatters: string
  mnemonic: string; difficulty: number; examRelevance: number; clinicalRelevance: number
  detail: Section[] | null
  topic: { id: string; name: string; subject: { code: string; name: string; color: string; year: number } }
  knowledge: { score: number; status: string; estRecall: number; attemptCount: number; correctCount: number; lastReviewed: string | null; stability: number } | null
  edgesOut: { to: string; toName: string; type: string; label: string; kind: string; mastery: number }[]
  edgesIn: { from: string; fromName: string; type: string; label: string; kind: string; mastery: number }[]
  whyChain: { stage: string; label: string; conceptId?: string }[]
  flashcards: { id: string; front: string; back: string }[]
  questionCount: number
  /** Full structured lesson (curriculum packs) — null when the concept has none. */
  lesson?: ConceptLesson | null
}

export interface QuestionClient {
  id: string; stem: string
  options: { id: string; text: string }[]
  difficulty: number; qtype: string; subjectCode: string; system: string
  conceptId?: string
  conceptName?: string
}

export interface AttemptResult {
  correct: boolean
  answer: string
  explanation: string
  teaching: string
  errorTypeSuggestion?: string
  knowledgeUpdated: boolean
  mastery?: number
  status?: string
}

// ─── ADAPTIVE MCQ ENGINE (PRODUCT 04) ─────────────────────────────
// Selection is deterministic and measured — the engine never exposes its
// chain of scoring, only honest human-readable "why this question" notes.
export type AdaptiveMode =
  | 'ai-adaptive' | 'adaptive' | 'weakness' | 'pyq' | 'rapid' | 'clinical' | 'image' | 'exam' | 'custom'

export const ADAPTIVE_MODES: { id: AdaptiveMode; label: string; blurb: string }[] = [
  { id: 'ai-adaptive', label: 'AI Adaptive', blurb: 'The engine picks every next question from your live performance' },
  { id: 'adaptive', label: 'Adaptive Practice', blurb: 'Mixed set ordered by what you need most' },
  { id: 'weakness', label: 'Weakness', blurb: 'Only your weak and missed concepts' },
  { id: 'pyq', label: 'PYQ Pattern', blurb: 'Classic repeated exam themes' },
  { id: 'rapid', label: 'Rapid Fire', blurb: '45 seconds a question — go on instinct' },
  { id: 'clinical', label: 'Clinical', blurb: 'Case-vignette reasoning questions' },
  { id: 'image', label: 'Image-Based', blurb: 'X-ray, ECG and visual-reasoning stems' },
  { id: 'exam', label: 'Exam Mode', blurb: 'Timed NEET-PG-style paper — feedback at the end' },
]

export interface AdaptiveConfig {
  mode: AdaptiveMode
  count: number // 5..100
  minutes?: number // total time budget (exam mode)
  subjectCode?: string
  system?: string
  topicId?: string
  conceptId?: string
  difficulty?: number // exact filter (custom builder only)
}

export interface AdaptiveQuestion extends QuestionClient {
  whyThis?: string // honest engine reason, shown on the question card
  pyqPattern?: boolean
  imageBased?: boolean
  imageUrl?: string // schematic illustration for image-based stems
  optionNotes?: Record<string, string> // {optionId: why this option is wrong} — curated platform notes
}

// ── Mistake families (brief's five patterns) ────────────────────────────
// Granular self-reported error types roll up into five families so the
// report speaks the language of the Mistake Engine, not tag ids.
export type ErrorFamily = 'conceptual' | 'recall' | 'careless' | 'misinterpretation' | 'repeated'

export const ERROR_FAMILY_OF: Record<string, Exclude<ErrorFamily, 'repeated'>> = {
  reasoning: 'conceptual', confused: 'conceptual', calculation: 'conceptual',
  didnt_know: 'recall', forgot: 'recall', guess: 'recall',
  changed: 'careless', time: 'careless',
  misread: 'misinterpretation',
}

export const ERROR_FAMILY_META: Record<ErrorFamily, { label: string; hint: string }> = {
  conceptual: { label: 'Conceptual', hint: 'The chain of reasoning itself broke' },
  recall: { label: 'Recall', hint: 'Knew it once — memory did not hold' },
  careless: { label: 'Careless', hint: 'Knew it and still lost the mark' },
  misinterpretation: { label: 'Misinterpretation', hint: 'Read the stem or options wrong' },
  repeated: { label: 'Repeated', hint: 'Missed again after missing before' },
}

export interface AdaptiveSessionStart {
  sessionId: string
  mode: AdaptiveMode
  label: string // "AI Adaptive · 20 questions"
  blurb: string // measured plan description
  questions: AdaptiveQuestion[]
  timed: boolean // rapid (per-question) / exam (total)
  secondsPerQuestion?: number // rapid = 45
  totalSeconds?: number // exam budget
}

export interface AdaptiveAnswerFeedback extends AttemptResult {
  sessionAnswered: number
  sessionCorrect: number
  avgTimeMs: number
  focusNote?: string // "Staying on Glomerular Diseases — one more angle"
  relatedPyqCount?: number // other PYQ-pattern questions on this concept
  relatedPyqs?: { id: string; stem: string; subjectCode: string }[] // up to 3 inline for review
}

export interface AdaptiveNextQuestion {
  question: AdaptiveQuestion | null
  focusNote?: string
}

export interface AdaptiveTopicInsight {
  name: string
  subjectCode: string
  correct: number
  total: number
  accuracy: number
  topicId?: string | null
}

export interface AdaptiveReport {
  sessionId: string
  mode: AdaptiveMode
  total: number
  answered: number
  correct: number
  accuracy: number
  avgTimeMs: number
  speedBand: 'fast' | 'steady' | 'slow' // vs a 65 s/question exam benchmark
  difficulty: { d: number; correct: number; total: number }[]
  strongTopics: AdaptiveTopicInsight[]
  weakTopics: AdaptiveTopicInsight[]
  mistakes: { errorType: string; count: number }[] // self-reported types logged in this run
  errorFamilies?: { family: ErrorFamily; count: number }[] // granular types rolled into the five families
  topPatterns?: { errorType: string; count: number; conceptName?: string }[] // all-time ErrorPattern records
  repeatedWrong: { conceptId: string; conceptName: string; misses: number }[] // all-time, measured
  recommended: { mode: AdaptiveMode; config: AdaptiveConfig; reason: string } | null
  wrongQuestions: { id: string; stem: string; conceptName?: string }[]
}

export interface AdaptiveHomePayload {
  counts: {
    bank: number
    pyqPattern: number
    imageBased: number
    clinical: number
    rapid: number
    weaknessQuestions: number
    dueConcepts: number
  }
  personalization: {
    topWeak?: { conceptId: string; conceptName: string; mastery: number } | null
    topMissed?: { conceptId: string; conceptName: string; misses: number } | null
  }
  recent: {
    id: string
    mode: AdaptiveMode
    total: number
    answered: number
    correct: number
    createdAt: string
    completedAt: string | null
  }[]
  resumeId: string | null // incomplete session worth finishing
  // Measured filter facets for the custom-run builder (subject select is fed
  // by /api/subjects; systems/topics/concepts come from the live bank).
  facets?: {
    systems: { name: string; count: number }[]
    topics: { id: string; name: string; subjectCode: string; system: string }[]
    concepts: { id: string; name: string; topicId: string }[]
  }
}

// ─────────────────────── PRODUCT 05 · MISTAKE INTELLIGENCE ───────────────────────
// «Things I must stop getting wrong.» One aggregate per question the student
// has ever answered wrong, plus a measured priority and a lifecycle. Every
// number below is computed from the attempt feed / knowledge states — nothing
// estimated, nothing fabricated. Where evidence is thin we say so.

export type MistakeStatus = 'unresolved' | 'revising' | 'retested' | 'resolved'

export const MISTAKE_STATUS_LABELS: Record<MistakeStatus, string> = {
  unresolved: 'Unresolved',
  revising: 'Revising',
  retested: 'Retested — once right',
  resolved: 'Resolved',
}

export type MistakeMode = 'today' | 'repeated' | 'impact' | 'unresolved' | 'forgotten' | 'exam'

export const MISTAKE_MODES: { id: MistakeMode; label: string; blurb: string }[] = [
  { id: 'today', label: 'Today', blurb: 'Mistakes made in the last 24 hours' },
  { id: 'repeated', label: 'Most repeated', blurb: 'Missed more than once — the genome core' },
  { id: 'impact', label: 'High impact', blurb: 'Highest measured priority first' },
  { id: 'unresolved', label: 'Unresolved', blurb: 'Not yet fixed by a retest' },
  { id: 'forgotten', label: 'Forgotten', blurb: 'Estimated recall has dropped since the miss' },
  { id: 'exam', label: 'Exam relevant', blurb: 'Repeated exam themes and hard stems' },
]

// Why a mistake ranks where it does — one honest note per factor.
export interface MistakeFactor {
  id: 'frequency' | 'exam' | 'weakness' | 'recency' | 'forgetting' | 'careless'
  label: string
  note: string // human sentence, e.g. "missed 4×" — measured, never modelled
  points: number // contribution to the 0..100 priority
}

export interface MistakeRow {
  recordId: string
  questionId: string
  stem: string
  subjectCode: string
  subjectName: string
  topicName: string | null
  conceptId: string | null
  conceptName: string | null
  difficulty: number
  qtype: string
  pyqPattern: boolean
  imageUrl: string | null
  wrongCount: number
  firstWrongAt: string
  lastWrongAt: string
  lastSelected: string
  lastSelectedText: string
  answerText: string
  errorType: string | null
  errorLabel: string | null
  confidence: number
  timeMs: number
  status: MistakeStatus
  revisionPending: boolean // an open revision item exists for the concept
  resolvedAt: string | null
  resolvedBy: string | null // 'retest' | 'manual'
  priority: number // 0..100 measured score
  factors: MistakeFactor[]
  flags: string[] // 'repeated' | 'fast-miss' | 'overconfident' | 'today' | 'forgotten' | 'exam'
}

export interface MistakePatternCard {
  id: string
  kind: 'confusion' | 'concept' | 'paradox' | 'speed' | 'confidence' | 'difficulty'
  title: string
  detail: string // one measured sentence — evidence first
  evidence: { label: string; value: string }[]
  action: {
    kind: 'drill' | 'compare' | 'slow' | 'retest'
    label: string
    mode?: AdaptiveMode // drill hand-off (Adaptive Engine)
    conceptId?: string
    subjectCode?: string
    pairId?: string // ConfusionPair id for the compare view
  }
}

export interface MistakeGenomePayload {
  totals: {
    open: number
    resolved: number
    repeated: number
    todayCount: number
    mistakeRate: number // % of all attempts that were wrong
    resolvedThisWeek: number
  }
  doNext: MistakeRow | null // single highest-priority open mistake
  patterns: MistakePatternCard[]
  counts: Record<MistakeMode, number>
  filters: {
    subjects: { code: string; name: string; count: number }[]
    types: { id: string; label: string; count: number }[]
    difficulties: { level: number; count: number }[]
  }
  insufficientData: boolean
}

export interface MistakeListPayload {
  rows: MistakeRow[]
  total: number // after filters
  mode: MistakeMode
}

export interface MistakeDetailPayload {
  record: MistakeRow
  options: { id: string; text: string; isAnswer?: boolean; isWrongPick?: boolean; note?: string }[]
  answer: string
  explanation: string
  teaching: string
  attempts: {
    at: string
    selectedText: string
    correct: boolean
    errorType: string | null
    errorLabel: string | null
    timeMs: number
    confidence: number
  }[]
  confusionPair: { a: string; b: string; mnemonic: string; aPoints: string[]; bPoints: string[] } | null
  drillAvailable: number // more platform questions on the same concept
}

export interface MistakeRetestQuestion {
  recordId: string
  questionId: string
  stem: string
  options: { id: string; text: string }[]
  difficulty: number
  qtype: string
  subjectCode: string
  imageUrl: string | null
  attemptNo: number // which retest this is (1 = first)
}

export interface MistakeRetestResult {
  correct: boolean
  answerText: string
  selectedText: string
  explanation: string
  status: MistakeStatus
  resolvedNow: boolean
  wrongCount: number
}

// ─────────────────────── PRODUCT 06 · SMART REVISION ENGINE ───────────────────────
// «What should I revise today, and why?» One adaptive queue per day, assembled
// from measured signals only: knowledge states (forgetting risk), the attempt
// feed (accuracy, mistakes), open revision items, due flashcards, topic exam
// weight and exam proximity. No fixed schedule for everyone — every block
// carries a human, measured reason. No chain-of-thought anywhere.

export type RevisionMode =
  | 'daily' | 'rapid' | 'weak' | 'mistake' | 'pyq' | 'flashcard' | 'high-yield' | 'custom'

export const REVISION_MODES: { id: RevisionMode; label: string; blurb: string }[] = [
  { id: 'daily', label: 'Daily Revision', blurb: 'Your mixed queue for today — chosen by the engine' },
  { id: 'rapid', label: 'Rapid Revision', blurb: '10-minute sprint: key facts, due cards, rapid MCQs' },
  { id: 'weak', label: 'Weak Topic Revision', blurb: 'Only weak and decaying concepts' },
  { id: 'mistake', label: 'Mistake Revision', blurb: 'Retest the mistakes you keep making' },
  { id: 'pyq', label: 'PYQ Revision', blurb: 'Repeated exam themes you have missed or not touched' },
  { id: 'flashcard', label: 'Flashcard Revision', blurb: 'Everything due in your card deck' },
  { id: 'high-yield', label: 'High-Yield Revision', blurb: 'Highest exam-weight topics at risk first' },
  { id: 'custom', label: 'Custom Revision', blurb: 'Pick subjects, block kinds and time yourself' },
]

export type RevisionBlockKind =
  | 'concept'    // key facts + short explanation for one concept
  | 'flashcards' // batch of due flashcards, graded AGAIN/HARD/GOOD/EASY
  | 'mcq'        // 3-5 platform MCQs on weak topics
  | 'pyq'        // PYQ-pattern MCQs
  | 'mistake'    // one previous mistake, re-tested inline
  | 'compare'    // curated confusion pair A vs B
  | 'case'       // clinical case hand-off on a weak system

export const REVISION_BLOCK_KIND_LABELS: Record<RevisionBlockKind, string> = {
  concept: 'Concept',
  flashcards: 'Flashcards',
  mcq: 'MCQs',
  pyq: 'PYQs',
  mistake: 'Mistake',
  compare: 'Compare',
  case: 'Clinical case',
}

// Why a block was selected — one measured chip per factor, honest notes only.
export interface RevisionWhy {
  label: string
  note: string // e.g. "recall est 41%", "missed 3×", "PYQ-pattern", "mastery 22%"
}

export interface RevisionBlock {
  id: string // stable within the plan: `${kind}:${refId}`
  kind: RevisionBlockKind
  title: string
  subtitle: string // e.g. "Pathology · Renal"
  minutes: number // estimated minutes
  reason: string // one measured sentence — why this was selected
  why: RevisionWhy[]
  conceptId?: string
  topicId?: string // hub deep link for concept blocks
  flashcardIds?: string[]
  questionIds?: string[]
  recordId?: string // mistake record for kind 'mistake'
  pairId?: string // ConfusionPair id for kind 'compare'
  caseId?: string
  done: boolean
}

export interface RevisionExamClock {
  daysLeft: number
  label: string // exam label or "NEET-PG (estimated)"
  isEstimate: boolean
  near: boolean // <= 60 days — priorities shift toward weak/high-yield/PYQ
}

export interface RevisionQueuePlan {
  mode: RevisionMode
  minutes: number // requested budget
  blocks: RevisionBlock[]
  generatedAt: string
  headline: string // "5 concepts at high forgetting risk · 8 mistakes · 15 high-yield MCQs"
  exam: RevisionExamClock | null
  note: string // one honest line about how the queue was built
}

// ── Materialised content for a session (ids only in the plan; the runner
//    renders from this map. Answers/explanations are NOT included — grading
//    always goes through /api/attempts.) ──
export interface RevisionQuestionContent {
  id: string
  stem: string
  options: { id: string; text: string }[]
  difficulty: number
  qtype: string
  subjectCode: string
  conceptId: string | null
  conceptName: string | null
  imageUrl: string | null
  pyqPattern: boolean
}

export interface RevisionConceptContent {
  id: string
  name: string
  summary: string
  whyMatters: string
  mnemonic: string
  examRelevance: number
  topicId: string
  topicName: string
  subjectName: string
  detail: { h: string; body: string[]; table?: { head: string[]; rows: string[][] } }[] | null
  keyFacts: string[] // derived from detail sections (short bullets, max 6)
}

export interface RevisionFlashcardContent {
  id: string
  front: string
  back: string
  subjectCode: string
}

export interface RevisionPairContent {
  id: string
  a: string
  b: string
  aPoints: string[]
  bPoints: string[]
  mnemonic: string
  subjectCode: string
}

export interface RevisionCaseContent {
  id: string
  title: string
  specialty: string
  system: string
  difficulty: number
}

export interface RevisionSessionContent {
  questions: Record<string, RevisionQuestionContent>
  concepts: Record<string, RevisionConceptContent>
  flashcards: Record<string, RevisionFlashcardContent>
  pairs: Record<string, RevisionPairContent>
  cases: Record<string, RevisionCaseContent>
}

// Concept-level Revision Status — the intelligence panel
export interface RevisionIntelligence {
  overdue: { conceptId: string; name: string; recall: number; daysSince: number | null }[]
  forgotten: { conceptId: string; name: string; forgotCount: number; recall: number }[]
  repeatedMistakes: { questionId: string; conceptId: string | null; conceptName: string | null; topic: string; wrongCount: number }[]
  strong: { conceptId: string; name: string; score: number }[]
  gaps: { conceptId: string; name: string; attempts: number; lastReviewed: string | null }[]
  highRisk: { conceptId: string; name: string; mastery: number; examWeight: number }[]
  counts: { overdue: number; forgotten: number; repeated: number; strong: number; gaps: number; highRisk: number }
}

export interface RevisionSmartHome {
  today: RevisionQueuePlan
  modes: { id: RevisionMode; label: string; blurb: string; count: number }[]
  intelligence: RevisionIntelligence
  resume: { sessionId: string; mode: RevisionMode; done: number; total: number } | null
  recent: { id: string; mode: RevisionMode; done: number; total: number; minutes: number; status: string; createdAt: string; completedAt: string | null }[]
  stats: { blocksToday: number; minutesThisWeek: number; lastRevisedAt: string | null }
  insufficientData: boolean
}

export interface RevisionSessionStart {
  sessionId: string
  plan: RevisionQueuePlan
  content: RevisionSessionContent
}

export interface RevisionSessionResume {
  session: { id: string; mode: RevisionMode; minutes: number; done: number; total: number; status: string; createdAt: string }
  plan: RevisionQueuePlan
  content: RevisionSessionContent
}

export interface RevisionBlockResult {
  ok: boolean
  done: number
  total: number
  knowledgeTouched: boolean // concept/compare blocks strengthened the SRS state
}

export interface RevisionSessionSummary {
  sessionId: string
  mode: RevisionMode
  done: number
  total: number
  minutes: number
  accuracy: { answered: number; correct: number } | null // measured from attempts in the session window
  next: { title: string; reason: string; kind: RevisionBlockKind } | null
  message: string
}

export interface RevisionAiResponse {
  text?: string
  questions?: { question: string; answer: string }[]
  aiGenerated?: boolean
  disclaimer?: string
}

export interface PlanSegment { minutes: number; activity: string; detail: string }

export interface NextAction {
  conceptId: string
  conceptName: string
  reason: string
  duration: number
  priority: number
  plan: PlanSegment[]
  activityType: string
}

export interface DashboardPayload {
  greeting: string
  name: string
  prepStage: string
  stageLabel: string
  brainScore: number // overall preparation %
  stats: {
    topicsAtRisk: number; recurringMistakes: number; dueQuestions: number
    dueFlashcards: number; recommendedMinutes: number; streak: number
  }
  knowledgeSplit: { strong: number; unstable: number; weak: number; new: number }
  revisionDebt: { count: number; minutes: number }
  weaknesses: { conceptId: string; name: string; subject: string; mastery: number; reason: string }[]
  nextAction: NextAction | null
  todayPlan: PlanSegment[]
  weeklyDelta: { lastWeek: number; thisWeek: number }
  examClock: {
    daysLeft: number; weeksLeft: number; monthsLeft: number
    examYear: number; stage: string; weeklyTarget: number
    revisionCyclesLeft: number; questionTarget: number; mockTarget: number
    isEstimate: boolean
  }
  heatToday: { questions: number; minutes: number }
}

export interface RoadmapPhase {
  phase: string; timeframe: string; goal: string
  focus: string[]; actions: string[]; milestone: string
  intensity: number // 1..5
}

// Weekly planner (spec §42/§43): how one real week should look, computed from
// the profile's declared study hours and stage. kind ∈ college | questions |
// revision | flashcards | mocks | weakness | rest
export interface WeekBlock { label: string; minutes: number; kind: string }
export interface WeekDayPlan { day: string; short: string; hours: number; blocks: WeekBlock[]; isWeekend: boolean }

export interface RoadmapPayload {
  horizonYears: number
  currentStageLabel: string
  stageLabel: string
  phases: RoadmapPhase[]
  neetClock: DashboardPayload['examClock']
  weeklySplit: { label: string; pct: number }[]
  weekPlan: WeekDayPlan[]
  isEstimate: boolean
}

export interface ProgressPayload {
  overall: { mastery: number; accuracy: number; trend: number }
  subjects: (SubjectSummary & { accuracy: number; foundation: number; clinical: number; debt: number })[]
  heatmap: { date: string; minutes: number; questions: number; revision: number }[]
  weeklyReport: {
    topicsStudied: number; accuracyNow: number; accuracyPrev: number
    weakest: string; strongest: string; topMistake: string
    consistency: number; timeSpent: number; revisionDebt: number
    clinicalAccuracy: number
    narrative: string[]
  }
  errorPatterns: { errorType: string; count: number; examples: { concept: string; count: number }[] }[]
  confusions: {
    id: string; a: string; b: string; aCode: string; bCode: string
    aPoints: string[]; bPoints: string[]; mnemonic: string; subjectCode: string
    detected: boolean
  }[]
}

export interface RevisionPayload {
  dueFlashcards: { id: string; front: string; back: string; subjectCode: string; conceptId: string | null }[]
  dueConcepts: { conceptId: string; name: string; reason: string; priority: number; minutes: number; estRecall: number }[]
  debt: { count: number; minutes: number }
  counts: { now: number; soon: number; stable: number; mastered: number }
}

export interface SearchResults {
  concepts: { id: string; name: string; kind: string; summary: string; subject: string; topicId?: string }[]
  subjects: { id: string; name: string; code: string; blurb: string }[]
  questions: { id: string; stem: string }[]
  flashcards: { id: string; front: string; subjectCode: string }[]
  cases: { id: string; title: string; specialty: string }[]
  topics: { id: string; name: string; subject: string }[]
}

export const ERROR_TYPES: { id: string; label: string; hint: string }[] = [
  { id: 'didnt_know', label: "Didn't know the concept", hint: 'New or never learned properly' },
  { id: 'forgot', label: 'Forgot the concept', hint: 'Knew it once — memory decayed' },
  { id: 'confused', label: 'Confused two concepts', hint: 'Mixed up similar topics' },
  { id: 'misread', label: 'Misread the question', hint: 'Skipped a keyword or negation' },
  { id: 'calculation', label: 'Calculation error', hint: 'Right idea, wrong arithmetic' },
  { id: 'reasoning', label: 'Clinical reasoning error', hint: 'Wrong step in the chain' },
  { id: 'visual', label: 'Visual recognition error', hint: 'Missed or misread the image finding' },
  { id: 'changed', label: 'Changed the right answer', hint: 'Second-guessed correctly-known fact' },
  { id: 'time', label: 'Time pressure', hint: 'Rushed and slipped' },
  { id: 'guess', label: 'Guessed', hint: 'No real basis for the choice' },
]

export const ERROR_TYPE_LABELS: Record<string, string> = Object.fromEntries(ERROR_TYPES.map(e => [e.id, e.label]))

export const YEAR_LABELS: Record<number, string> = {
  1: 'First Year MBBS', 2: 'Second Year MBBS', 3: 'Third Year MBBS',
  4: 'Final Year MBBS', 5: 'Intern', 6: 'Dedicated NEET-PG Preparation',
}

export const PREP_STAGE_LABELS: Record<string, string> = {
  exploring: 'Exploring', foundation: 'Building Foundation', regular: 'Regular Preparation',
  serious: 'Serious Preparation', dedicated: 'Dedicated NEET-PG Prep', revision: 'Revision Phase',
}

export const KIND_META: Record<string, { label: string; color: string; icon: string }> = {
  concept: { label: 'Concept', color: '#22d3ee', icon: 'Lightbulb' },
  disease: { label: 'Disease', color: '#f87171', icon: 'Stethoscope' },
  drug: { label: 'Drug', color: '#a78bfa', icon: 'Pill' },
  investigation: { label: 'Investigation', color: '#fbbf24', icon: 'Microscope' },
  physiology: { label: 'Physiology', color: '#34d399', icon: 'Activity' },
  anatomy: { label: 'Anatomy', color: '#38bdf8', icon: 'Bone' },
  pathology: { label: 'Pathology', color: '#f472b6', icon: 'Biohazard' },
  pharmacology: { label: 'Pharmacology', color: '#c084fc', icon: 'Syringe' },
  microbiology: { label: 'Microbiology', color: '#facc15', icon: 'Bug' },
  clinical_skill: { label: 'Clinical Skill', color: '#4ade80', icon: 'Hand' },
}

export interface AuditPayload {
  questions: QuestionClient[]
  subjects: { code: string; name: string; color: string }[]
}

export interface AuditSubjectResult {
  code: string; name: string; color: string
  correct: number; total: number; accuracy: number
  mastery: number // pre-existing knowledge-state average (0 if unmapped)
  band: 'strong' | 'moderate' | 'weak' | 'unmapped'
}

export interface AuditResultPayload {
  overall: { correct: number; total: number; accuracy: number }
  subjects: AuditSubjectResult[]
  weakest: { code: string; name: string } | null
  strongest: { code: string; name: string } | null
  recommendation: string
}

export interface LogbookEntryClient {
  id: string; caseType: string; system: string; diagnosis: string
  learned: string; createdAt: string
}

// ─── LEARN client payloads (mirror the /api/learn/* response shapes) ───

export interface LearnHomeSubject {
  id: string; code: string; name: string; color: string; year: number
  topicCount: number; conceptCount: number; mastery: number
  neetWeight: number; systems: string[]
}

export interface LearnHomePhase { phase: Phase; label: string; subjects: LearnHomeSubject[] }

export interface LearnHomeSystem {
  system: string; label: string
  subjectCount: number; topicCount: number; conceptCount: number
  subjects: string[]
}

export interface LearnHomeTotals {
  subjects: number; topics: number; concepts: number; lessons: number
  diagrams3d: number; papers: number; aiConcepts: number
}

/** /api/learn/home — LearnHomePayload + optional `degraded` flag. */
export interface LearnHomeClient {
  continueLearning: {
    conceptId: string; conceptName: string; subjectName: string; subjectColor: string
    mastery: number; estRecall: number; reason: string
  }[]
  recommendedNext: {
    conceptId: string; conceptName: string; subjectName: string
    reason: string; examWeight: number
  } | null
  weakConcepts: { conceptId: string; conceptName: string; subjectName: string; mastery: number }[]
  recentlyStudied: { conceptId: string; conceptName: string; at: string }[]
  phases: LearnHomePhase[]
  systems: LearnHomeSystem[]
  hasLessonCoverage: number
  totals: LearnHomeTotals
  degraded?: boolean
}

/** /api/learn/curriculum (no params) — full curriculum browse map. */
export interface CurriculumBrowsePayload {
  phases: { phase: Phase; label: string; description: string }[]
  subjects: (SubjectTaxonomy & {
    topicCount: number; conceptCount: number; mastery: number
  })[]
  systems: LearnHomeSystem[]
  registry: CurriculumRecord[]
  totals: LearnHomeTotals
}

/** /api/learn/curriculum?subject=<id> — one subject's topics with coverage. */
export interface SubjectTopicsPayload {
  subject: {
    id: string; code: string; name: string; phase: Phase; year: number
    color: string; blurb: string; neetWeight: number; systems: string[]
    topicCount: number; conceptCount: number; mastery: number
  }
  topics: {
    id: string; name: string; system: string | null; importance: number
    description: string; conceptCount: number; lessonCoverage: number
  }[]
}

/** /api/learn/atlas — 3D atlas list item (honest labels, teaching answers). */
export interface AtlasListItem {
  diagramKey: string; title: string; system: string; handcrafted: boolean
  conceptIds: string[]
  teachingAnswers: Asset3DRecord['teachingAnswers'] | null
  hasQuiz: boolean; hasSteps: boolean; layerCount: number
}

export interface AtlasListPayload { source: string; total: number; assets: AtlasListItem[] }

/** /api/learn/papers — grounded research-paper explainers. */
export interface PapersListPayload { papers: PaperExplainer[]; total: number; note?: string }

export const SYSTEMS = [
  { id: 'cardiovascular', label: 'Cardiovascular', icon: 'HeartPulse' },
  { id: 'respiratory', label: 'Respiratory', icon: 'Wind' },
  { id: 'renal', label: 'Renal', icon: 'Droplets' },
  { id: 'gastrointestinal', label: 'Gastrointestinal', icon: 'Utensils' },
  { id: 'endocrine', label: 'Endocrine', icon: 'Sparkles' },
  { id: 'neurology', label: 'Neurology', icon: 'Brain' },
  { id: 'hematology', label: 'Haematology', icon: 'Droplet' },
  { id: 'infectious', label: 'Infectious Disease', icon: 'Bug' },
  { id: 'musculoskeletal', label: 'Musculoskeletal', icon: 'Bone' },
]

// ───────────────── LEARN STUDY SURFACES (PRODUCT 01) ─────────────────

/** The five user-facing study states. Resolution: user mark ?? auto-derived. */
export type LearnStatus =
  | 'not-started' | 'learning' | 'completed' | 'needs-revision' | 'mastered'

export type LearnStatusCounts = Record<LearnStatus, number>

/** GET /api/learn/topic/<id> — the topic study surface payload. */
export interface TopicStudyPayload {
  topic: {
    id: string; name: string
    system: string | null; systemLabel: string | null
    importance: number; description: string
    subject: { id: string; code: string; name: string; color: string; year: number; phase: string }
  }
  concepts: {
    id: string; name: string; kind: string; oneLiner: string
    hasLesson: boolean; mnemonic: string
    examWeight: number; difficulty: number
    mastery: number; learnStatus: LearnStatus; marked: boolean
    questionCount: number; flashcardCount: number
  }[]
  groups: { kind: string; label: string; concepts: string[] }[]
  statusCounts: LearnStatusCounts
  flow: {
    learn: { concepts: number; lessons: number }
    understand: { lessons: number }
    explore: { assets3d: number }
    clinical: { cases: number; reasoningSteps: number; crossLinks: number }
    practice: { questions: number }
    revise: { flashcards: number }
  }
  assets3d: { id: string; title: string; handcrafted: boolean; conceptIds: string[] }[]
  cases: { id: string; title: string; specialty: string; difficulty: number }[]
  keyFacts: {
    numbers: { label: string; value: string; note?: string }[]
    differentials: { name: string; key: string }[]
    mistakes: string[]
    mnemonics: { hook: string; expands: string }[]
  }
  sections: {
    mechanism: boolean; presentation: boolean; diagnosis: boolean; management: boolean
    differentials: boolean; complications: boolean; reasoning: boolean; global: boolean
    numbers: boolean; drugs: boolean; procedures: boolean; imaging: boolean; firstPrinciples: boolean
  }
  connectedTopics: {
    id: string; name: string; subjectName: string; subjectColor: string
    system: string | null; reason: string
  }[]
  evidence: {
    levels: Record<string, number>
    lastReviewed: string | null
    sourcesCount: number
    sourceInstitutions: string[]
  }
  progress: { status: LearnStatus | null; marked: boolean; updatedAt: string | null }
}

/** GET /api/learn/subject/<id> — the subject study surface payload. */
export interface SubjectStudyPayload {
  subject: {
    id: string; code: string; name: string; latinName: string | null
    year: number; phase: string; color: string; blurb: string
    neetWeight: number; systems: string[]; systemsCovered: string[]
  }
  topics: {
    id: string; name: string; system: string | null; systemLabel: string | null
    importance: number; description: string
    conceptCount: number; lessonCoverage: number
    questionCount: number; flashcardCount: number
    mastery: number
    statusCounts: LearnStatusCounts
    marked: string | null
  }[]
  statusCounts: LearnStatusCounts
  mastery: number
  counts: {
    topics: number; concepts: number; lessons: number
    questions: number; flashcards: number; assets3d: number
  }
  registry: { authority: string; country: string; scope: string; version: string; alignment: string; lastReviewed: string }[]
}

/** GET /api/learn/progress — resolved statuses inside a topic. */
export interface TopicProgressPayload {
  topicId: string
  topicMark: { status: string; updatedAt: string } | null
  statusCounts: LearnStatusCounts
  concepts: Record<string, LearnStatus>
}

/** GET /api/learn/progress (no params) — all explicit marks. */
export interface AllProgressPayload {
  topics: Record<string, { status: string; updatedAt: string }>
  concepts: Record<string, { status: string; updatedAt: string }>
}

// ───────────────── TOPIC HUB (PRODUCT 02 — ONE TOPIC, EVERYTHING) ─────────────────

/** One honest external entry point — always a real search/deep link, never a fabricated embed. */
export interface HubExternalResource {
  label: string
  provider: string
  kind: 'video' | 'reference' | 'imaging'
  url: string
  note: string
}

/** A living-scene item matched from the platform's Understand library. */
export interface HubWatchPlatform {
  id: string
  title: string
  emoji: string
  oneLiner: string
  sceneId: string | null
  anchor: boolean // true = the organ-system's primary scene
}

/** Concept.detail structured section surfaced as a note block. */
export interface HubNoteSection {
  conceptId: string
  conceptName: string
  heading: string
  bullets: string[]
  table?: { headers: string[]; rows: string[][] } | null
}

/** GET /api/hub/topic/<id> — the unified one-topic hub payload. */
export interface HubTopicPayload {
  topic: TopicStudyPayload['topic']
  focusConcept: { id: string; name: string; summary: string; whyMatters: string } | null
  progress: TopicStudyPayload['progress']
  statusCounts: LearnStatusCounts
  mastery: number
  atGlance: {
    concepts: number; lessons: number; scenes: number
    notes: number; questions: number; cases: number
    flashcards: number; dueCards: number; revisionItems: number
  }
  learn: {
    concepts: TopicStudyPayload['concepts']
    groups: TopicStudyPayload['groups']
  }
  watch: {
    platform: HubWatchPlatform[]
    external: HubExternalResource[]
  }
  read: {
    sections: string[] // available lesson section keys, human labels
    notes: HubNoteSection[] // concept.detail structured notes (max 6)
    keyFacts: TopicStudyPayload['keyFacts']
    external: HubExternalResource[]
  }
  practice: {
    questions: number
    byType: { qtype: string; label: string; count: number }[]
    highYield: number // difficulty 3 questions
    imageBased: number // questions tagged imaging/x-ray/ecg etc.
    attempts: { total: number; correct: number; accuracy: number | null; lastAt: string | null }
  }
  cases: {
    id: string; title: string; specialty: string; difficulty: number
    attempted: boolean; bestScore: number | null
  }[]
  revise: {
    flashcards: number
    dueCards: number
    revisionItems: { conceptId: string; conceptName: string; reason: string; dueAt: string; minutes: number }[]
    confusionPairs: { id: string; a: string; b: string; mnemonic: string }[]
    missedConcepts: { id: string; name: string; misses: number }[] // wrong answers on this topic's questions
  }
  performance: {
    attemptsTotal: number
    attemptsCorrect: number
    accuracy: number | null
    engagedConcepts: number
    weakConcepts: { id: string; name: string; mastery: number }[]
    dueCards: number
    pendingRevision: number
    recentActivity: { kind: string; label: string; at: string }[]
  }
  connected: TopicStudyPayload['connectedTopics']
  evidence: TopicStudyPayload['evidence']
  ai: { label: string; prompt: string; kind: 'ask' | 'explain' | 'analogy' | 'quiz' | 'cases' | 'summarize' | 'revise' }[]
}

/** GET /api/hub/home — hub landing suggestions. */
export interface HubHomePayload {
  suggested: {
    id: string; name: string; systemLabel: string | null
    subjectName: string; subjectColor: string
    importance: number
    concepts: number; questions: number; flashcards: number; cases: number
    reason: string
  }[]
  continueTopics: {
    id: string; name: string; subjectName: string; subjectColor: string
    status: string; updatedAt: string
  }[]
  totals: { topics: number; concepts: number; questions: number; flashcards: number; cases: number }
}

// ─── AI MEDICAL TUTOR (PRODUCT 03) ───

/** Teaching modes per the AI Tutor spec. Legacy ids ('simple'|'deep') map onto explain+depth. */
export type TutorMode = 'explain' | 'socratic' | 'quiz' | 'clinical' | 'rapid' | 'exam' | 'eli5' | 'hinglish'
export type TutorDepth = 'simple' | 'mbbs' | 'deep'

/** GET /api/tutor/context — what the tutor knows about THIS student (measured data only). */
export interface TutorContextPayload {
  profile: { yearLabel: string; prepStage: string; learningStyles: string[]; attemptsTotal: number }
  weak: { conceptId: string; name: string; mastery: number; attempts: number; status: string }[]
  missed: { conceptId: string | null; name: string; count: number }[]
  errorTypes: { type: string; count: number }[]
  revision: { due: number; top: string[] }
  drills: number
  topic?: {
    id: string; name: string; subjectName: string; subjectCode: string
    system: string | null; importance: number
    mark: string | null
    questions: number; cases: number; cards: number
    weak?: { conceptId: string; name: string; mastery: number } | null
  }
}

/** GET /api/tutor/sessions — persisted tutoring threads (list view). */
export interface TutorSessionSummary {
  id: string; title: string; mode: string; topicId: string
  messageCount: number; updatedAt: string
}

/** GET /api/tutor/sessions?id= — full thread for resume. */
export interface TutorSessionDetail extends TutorSessionSummary {
  createdAt: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

// ─────────────────────── PRODUCT 07 · AI PERSONALIZED STUDY PLANNER ───────────────────────
// «Given my exam date, target, current preparation and available time — what
// exactly should I study today?» The plan is per-profile, regenerated from
// live signals (never a fixed timetable): phases are date-windowed so one
// missed day NEVER permanently breaks the schedule — missed work is capped
// and re-balanced into the next days instead. Every task carries a measured
// why-this reason. No chain-of-thought, no rank predictions — feasibility
// and pace are honest arithmetic over the student's own data.

export type PlannerMode =
  | 'auto' | 'full' | 'two-hour' | 'one-hour' | 'revision' | 'mock' | 'catch-up' | 'last-30' | 'emergency'

export const PLANNER_MODES: { id: PlannerMode; label: string; blurb: string; minutes: number }[] = [
  { id: 'auto', label: 'Auto', blurb: "Engine picks today's shape from your weekday rhythm", minutes: 0 },
  { id: 'full', label: 'Full Study Day', blurb: 'Your full declared time — learn, practice, revise, test', minutes: 0 },
  { id: 'two-hour', label: '2-Hour Day', blurb: 'Compressed day: top priorities only', minutes: 120 },
  { id: 'one-hour', label: '1-Hour Day', blurb: 'One focused hour — highest-risk items first', minutes: 60 },
  { id: 'revision', label: 'Revision Day', blurb: 'Clear due revision and flashcards, minimal new material', minutes: 0 },
  { id: 'mock', label: 'Mock-Test Day', blurb: 'Timed exam run + deep review of what it exposed', minutes: 0 },
  { id: 'catch-up', label: 'Catch-Up Day', blurb: 'Fold missed work back in — one off-day never breaks the plan', minutes: 0 },
  { id: 'last-30', label: 'Last-30-Days', blurb: 'Exam-proximity shape: high-yield, PYQ, mistakes, mocks', minutes: 0 },
  { id: 'emergency', label: 'Emergency (Low Time)', blurb: '~30 minutes: the one thing that matters most today', minutes: 30 },
]

export type PlannerSlot = 'study' | 'practice' | 'revise' | 'test'

export const PLANNER_SLOT_LABELS: Record<PlannerSlot, string> = {
  study: 'Study',
  practice: 'Practice',
  revise: 'Revise',
  test: 'Test',
}

export const PLANNER_SLOT_HINTS: Record<PlannerSlot, string> = {
  study: 'What to learn',
  practice: 'What questions to solve',
  revise: 'What to revisit',
  test: 'What assessment to complete',
}

/** Client view of a PlannerTask row — reasons are measured, never CoT. */
export interface PlannerTask {
  id: string
  slot: PlannerSlot
  kind: string
  refId: string
  title: string
  detail: string
  reason: string
  minutes: number
  priority: number
  status: 'pending' | 'done' | 'skipped' | 'missed'
  carriedFrom: number // days since its original dayKey (0 = today)
  handoff: PlannerHandoff | null
}

/** Deep-link payload the planner UI consumes to start the task where the work lives. */
export type PlannerHandoff =
  | { type: 'learn-topic'; topicId: string; label: string }
  | { type: 'hub'; topicId: string; conceptId?: string; label: string }
  | { type: 'adaptive'; mode: AdaptiveMode; subjectCode?: string; topicId?: string; conceptId?: string; count: number; label: string }
  | { type: 'mistakes'; label: string }
  | { type: 'revision'; mode: RevisionMode; minutes: number; label: string }
  | { type: 'mock-lab'; label: string }

/** One phase of the long-term plan — date-windowed, not task-chained. */
export interface PlannerPhase {
  id: string
  label: string
  goal: string
  fromDays: number // day offset from today (0 = today)
  toDays: number
  focus: string[] // up to 4 subject names ranked by need
  actions: string[]
  current: boolean
}

/** Weekly goal computed from remaining work ÷ weeks — recomputed live. */
export interface PlannerWeeklyGoal {
  id: string
  label: string // "Cover ~6 topics in Pathology & Medicine"
  detail: string
  paceTopicsPerWeek: number
  doneThisWeek: number
}

/** Honest feasibility arithmetic — never a rank promise. */
export interface PlannerFeasibility {
  verdict: 'comfortable' | 'tight' | 'overcommitted'
  headline: string
  requiredHours: number
  availableHours: number
  ratio: number // required / available
  notes: string[]
  basis: {
    remainingConcepts: number
    totalConcepts: number
    revisionCyclesPlanned: number
    questionsTarget: number
    daysRemaining: number
    capacityPerDay: number
  }
}

export interface PlannerPlanShape {
  version: number
  generatedAt: string
  examLabel: string
  examDate: string | null
  examIsEstimate: boolean
  daysLeft: number
  stageLabel: string
  phases: PlannerPhase[]
  weeklyGoals: PlannerWeeklyGoal[]
  mockCadenceDays: number // e.g. every 7 days take a mock
  revisionCyclesLeft: number
  notes: string[]
}

/** Per-subject coverage + pace row for the plan overview. */
export interface PlannerSubjectRow {
  code: string
  name: string
  color: string
  neetWeight: number
  conceptsTotal: number
  conceptsCovered: number
  coverage: number // 0..100
  mastery: number // 0..100 avg (0 when untouched)
  accuracy: number // 0..100 last-30d attempts (0 when none)
  priority: number // 0..100 planner urgency
  reason: string
}

/** Measured progress feeds — planned vs completed, consistency, coverage. */
export interface PlannerProgress {
  todayPlannedMinutes: number
  todayDoneMinutes: number
  todayPlannedCount: number
  todayDoneCount: number
  streakDays: number
  consistency14: number // % of last 14 IST days with any completed planner task or study session
  adherence7: number // doneMinutes / plannedMinutes over last 7 logged days (%)
  syllabusCoverage: number // 0..100 high-yield-weighted
  revisionDebt: number // open revision items
  dueCards: number
  openMistakes: number
  questionsLast7: number
  mocksLast30: number
  last14: { dayKey: string; planned: number; done: number }[]
}

/** One plain-language, measured observation about today's plan. */
export interface PlannerIntelligenceNote {
  id: string
  tone: 'risk' | 'good' | 'info'
  text: string
  action?: { label: string; view: string } // view: adaptive|mistakes|revision|questions|learn|progress
}

export interface PlannerToday {
  dayKey: string
  mode: PlannerMode
  modeLabel: string
  capacityMinutes: number
  plannedMinutes: number
  headline: string // "3 study blocks · 15 MCQs · 12 due cards · mock review"
  slots: { slot: PlannerSlot; tasks: PlannerTask[]; minutes: number }[]
  priority: { title: string; reason: string; taskId: string | null } | null
  carriedOverCount: number
  offDay: boolean
}

/** GET /api/planner/home — the whole planner dashboard. */
export interface PlannerHome {
  hasPlan: boolean
  plan: PlannerPlanShape | null
  settings: {
    examDate: string | null
    examLabel: string
    targetNote: string
    dailyMinutes: number
    weekdayMinutes: number
    weekendMinutes: number
    offDays: string[]
  } | null
  feasibility: PlannerFeasibility | null
  today: PlannerToday | null
  progress: PlannerProgress | null
  subjects: PlannerSubjectRow[] // top 6 by planner urgency
  intelligence: PlannerIntelligenceNote[]
  realized: { medianMinutesPerDay: number; daysSampled: number; note: string } | null
}

/** POST /api/planner/plan — settings upsert response. */
export interface PlannerPlanSaveResult {
  ok: boolean
  plan: PlannerPlanShape
  feasibility: PlannerFeasibility
}

/** POST /api/planner/ai — grounded AI helper actions. */
export interface PlannerAiResponse {
  ok: boolean
  action: string
  text: string
  bullets: string[]
  fallback: boolean
  disclaimer: string
}

// ─── MEDICAL KNOWLEDGE GRAPH (PRODUCT 08) ───────────────────────────────
// The intelligence layer connecting Subject → System → Topic → Concept →
// Condition → Investigation → Treatment → Drug → Case → MCQ → PYQ. The
// student-facing contract stays small and calm; the underlying graph can
// be complex. All numbers are measured — never invented.

/** Normalised display grouping for an edge — direction noise in legacy data
 *  is resolved by the engine, the UI only ever sees these groups. */
export type GraphGroupKind =
  | 'prerequisite' | 'unlocks' | 'related' | 'confusable' | 'causes' | 'caused_by'
  | 'mechanism' | 'manifestation' | 'investigation' | 'treatment' | 'complication' | 'application'

export const GRAPH_GROUP_META: Record<GraphGroupKind, { label: string; blurb: string }> = {
  prerequisite: { label: 'Prerequisites', blurb: 'Understand these first — they make this concept click' },
  unlocks: { label: 'Unlocks', blurb: 'Concepts this opens the door to' },
  related: { label: 'Related', blurb: 'Worth seeing side by side' },
  confusable: { label: 'Often confused', blurb: 'Classic exam mix-ups — learn the differences' },
  causes: { label: 'Causes / leads to', blurb: 'What this produces downstream' },
  caused_by: { label: 'Caused by', blurb: 'What explains why this happens' },
  mechanism: { label: 'Mechanisms', blurb: 'How it actually works' },
  manifestation: { label: 'Clinical features', blurb: 'How it shows up in a patient' },
  investigation: { label: 'Investigations', blurb: 'How it is confirmed' },
  treatment: { label: 'Treatments & drugs', blurb: 'What is done about it' },
  complication: { label: 'Complications', blurb: 'What can go wrong if missed' },
  application: { label: 'Clinical application', blurb: 'Where the theory meets the ward' },
}

export interface GraphNeighbor {
  id: string
  name: string
  kind: string
  summary: string
  subjectCode: string
  subjectName: string
  subjectColor: string
  edgeType: string
  edgeLabel: string
  edgeSource: string // curated | ai-suggested | imported
  mastery: number // 0..100, 0 = not started
  status: 'new' | 'weak' | 'unstable' | 'strong'
  questionCount: number
}

export interface GraphGroup {
  kind: GraphGroupKind
  label: string
  blurb: string
  items: GraphNeighbor[]
  hidden: number // items beyond the cap — UI shows "+N more"
}

export interface GraphHub {
  concept: {
    id: string; name: string; kind: string; summary: string; whyMatters: string
    mnemonic: string; difficulty: number; examRelevance: number; clinicalRelevance: number
  }
  topic: { id: string; name: string; system: string | null }
  subject: { code: string; name: string; color: string }
  mastery: { score: number; status: string; estRecall: number; attemptCount: number; lastReviewed: string | null } | null
  learnStatus: string | null // LearnProgress mark, if any
  groups: GraphGroup[]
  questionStats: { total: number; pyq: number }
  caseCount: number
  flashcardCount: number
  minimap: {
    center: { id: string; name: string; mastery: number; status: string }
    nodes: { id: string; name: string; kind: string; group: GraphGroupKind; mastery: number; status: string; subjectColor: string }[]
  }
  personal: {
    missingPrerequisites: { id: string; name: string; mastery: number; status: string; reason: string }[]
    weakNeighbors: { id: string; name: string; mastery: number; edgeType: string; reason: string }[]
    repeatedConfusion: { pairId: string | null; otherId: string; otherName: string; wrongCount: number; reason: string }[]
    recommendedNext: { id: string; name: string; kind: string; reason: string }[]
    strongZones: { id: string; name: string; mastery: number }[]
  }
  insufficientData: boolean
}

export type GraphPathStage = 'why' | 'mechanism' | 'clinical' | 'diagnosis' | 'treatment'

export interface GraphPathStep {
  stage: GraphPathStage
  label: string
  question: string // the question this stage answers ("Why does this happen?")
  items: {
    id: string; name: string; kind: string; summary: string
    edgeType: string; edgeLabel: string
    mastery: number; status: string
    subjectCode: string; subjectColor: string
  }[]
}

/** Concept → Why? → Mechanism → Clinical effect → Diagnosis → Treatment. */
export interface GraphPath {
  concept: { id: string; name: string; kind: string; summary: string; whyMatters: string }
  subject: { code: string; name: string; color: string }
  steps: GraphPathStep[]
  narrative: string[] // measured cause→effect sentences built from edges + labels
}

export interface GraphHome {
  stats: {
    concepts: number
    connected: number
    edges: number
    crossSubject: number
    subjects: number
    topics: number
    questions: number
    cases: number
  }
  topHubs: {
    id: string; name: string; kind: string; degree: number
    subjectCode: string; subjectName: string; subjectColor: string
    mastery: number; status: string; questionCount: number
  }[]
  personal: {
    missingPrerequisites: { fromId: string; fromName: string; toId: string; toName: string; mastery: number; reason: string }[]
    confusionHotspots: { pairId: string; aId: string; aName: string; bId: string; bName: string; mnemonic: string; bothWeak: boolean }[]
    isolatedWeak: { id: string; name: string; mastery: number; subjectCode: string; subjectName: string }[]
    strongZones: { id: string; name: string; mastery: number; degree: number }[]
    recommendedToday: { id: string; name: string; kind: string; reason: string }[]
  }
  subjects: { code: string; name: string; color: string; conceptCount: number; edgeCount: number }[]
  recentIds: string[] // last hubs opened this device (client supplies storage; server echoes ids it knows)
  insufficientData: boolean
}

export interface GraphSearchResult {
  query: string
  concepts: {
    id: string; name: string; kind: string; summary: string
    subjectCode: string; subjectName: string; subjectColor: string
    mastery: number; status: string
    degree: number; questionCount: number
    matchedVia: 'name' | 'synonym' | 'summary'
    matchedTerm?: string
  }[]
  topics: { id: string; name: string; subjectCode: string; subjectName: string; conceptCount: number }[]
  subjects: { id: string; name: string; color: string; conceptCount: number }[]
  synonymHits: { term: string; refId: string; name: string }[]
}

export interface GraphExplorePayload {
  subject: { code: string; name: string; color: string; neetWeight: number } | null
  systems: {
    system: string
    topics: {
      id: string; name: string; conceptCount: number; edgeCount: number
      mastery: number
      concepts: { id: string; name: string; kind: string; mastery: number; status: string; degree: number }[]
    }[]
  }[]
}

/** POST /api/graph/ai — grounded AI actions over the graph. */
export type GraphAiAction = 'explain-relationship' | 'why-path' | 'study-order'

export interface GraphAiResponse {
  ok: boolean
  action: GraphAiAction
  text: string
  fallback: boolean
  disclaimer: string
}

/** POST /api/graph/feedback — student review of a relationship. */
export interface GraphFeedbackBody {
  fromId: string
  toId: string
  type: string
  vote: 'wrong' | 'helpful' | 'unsure'
  note?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT 09 — CLINICAL CASE SIMULATOR («Learn → encounter → reason → decide»)
// Contract FROZEN for Task 9-a (backend engine + /api/sim/**) and 9-b (UI).
// Grading is always DETERMINISTIC against the curated brief — the AI never
// grades, and the brief's answer key never reaches the client.
// ═══════════════════════════════════════════════════════════════════════════

export type SimDifficulty = 'beginner' | 'mbbs' | 'neetpg' | 'advanced'

export const SIM_DIFFICULTY_META: Record<SimDifficulty, { label: string; blurb: string }> = {
  beginner: { label: 'Beginner', blurb: 'Pattern recognition — guided reasoning' },
  mbbs: { label: 'MBBS', blurb: 'Final-year ward-level reasoning' },
  neetpg: { label: 'NEET-PG', blurb: 'Exam-level traps, timing and sequencing' },
  advanced: { label: 'Advanced', blurb: 'Advanced clinical reasoning under pressure' },
}

export const SIM_SPECIALTIES = [
  'Medicine', 'Surgery', 'Paediatrics', 'Obstetrics & Gynaecology', 'Psychiatry',
  'Dermatology', 'Ophthalmology', 'ENT', 'Orthopaedics', 'Radiology', 'Pathology',
  'Emergency Medicine', 'Cardiology',
] as const

export type SimStageKind =
  | 'patient' | 'history' | 'exam' | 'investigations'
  | 'differential' | 'diagnosis' | 'management' | 'followup'

export type SimInteractionKind = 'explore' | 'key' | 'choice' | 'multi'

/** Client-safe option — verdict/why/finding/key/cost are stripped by the engine. */
export interface SimOptionPublic {
  id: string
  label: string
}

export interface SimInteractionPublic {
  id: string
  kind: SimInteractionKind
  prompt: string
  instruction?: string // e.g. "Pick up to four domains — you cannot ask everything."
  options: SimOptionPublic[]
  minSelect?: number
  maxSelect?: number
  imageKey?: string // key into the platform-owned clinical image set
  imageCaption?: string
}

export interface SimStagePublic {
  id: string
  kind: SimStageKind
  label: string
  intro: string[]
  interactions: SimInteractionPublic[]
}

export interface SimPatient {
  age: string
  sex: string
  occupation: string
  complaint: string
  scene: string // one-paragraph opening vignette
}

export interface SimCaseSummary {
  id: string
  title: string
  specialty: string
  system: string
  difficulty: SimDifficulty
  minutes: number
  imageKey: string | null
  aiReady: boolean
  stageCount: number
  interactionCount: number
  attempted: boolean
  bestScore: number | null
  lastScore: number | null
  lastAt: string | null
  diagnosisCorrect: boolean | null
  source: string // curated | imported-legacy
}

export interface SimCaseDetail {
  summary: SimCaseSummary
  patient: SimPatient
  stages: SimStagePublic[]
}

/** GET /api/sim/home */
export interface SimHome {
  stats: {
    completed: number
    attempted: number
    diagnosticAccuracy: number | null // % of completed runs with the right diagnosis
    avgScore: number | null
    minutesPractised: number
  }
  specialties: { name: string; count: number; completed: number; accuracy: number | null }[]
  cases: SimCaseSummary[]
  weakAreas: { label: string; detail: string; accuracy: number | null }[] // measured <70% areas
  repeatedErrors: { label: string; count: number; lastCaseTitle: string }[] // same miss ≥2 runs
  recommended: { caseId: string; title: string; reason: string } | null
  recommendedDifficulty: SimDifficulty
  recent: { caseId: string; title: string; specialty: string; score: number; diagnosisCorrect: boolean; at: string; mode: string }[]
  resume: { attemptId: string; caseId: string; caseTitle: string; stageIndex: number; mode: string } | null
}

/** POST …/act — deterministic feedback for ONE interaction. */
export interface SimFeedbackOption {
  id: string
  label: string
  verdict: 'correct' | 'acceptable' | 'wrong' | 'harmful'
  why: string
  finding?: string // explore: what the item revealed when pursued
}
export interface SimFeedback {
  correct: boolean
  score: number // 0..100 for this interaction
  headline: string
  perOption: SimFeedbackOption[] // chosen items (+ keys always explained)
  missed: { id: string; label: string; why: string }[] // essential items not chosen
}

export interface SimActResponse {
  ok: true
  feedback: SimFeedback
  stageIndex: number
  stageDone: boolean
  allDone: boolean
}

/** POST …/complete */
export interface SimDebriefTimelineItem {
  stageId: string
  stageLabel: string
  stageKind: SimStageKind
  interactionId: string
  prompt: string
  chosenLabels: string[]
  correct: boolean
  score: number
  headline: string
  verdicts: SimFeedbackOption[]
  missed: { id: string; label: string; why: string }[]
}

export interface SimDebrief {
  attemptId: string
  caseId: string
  caseTitle: string
  specialty: string
  difficulty: SimDifficulty
  mode: string // guided | ai
  diagnosis: string
  diagnosisCorrect: boolean
  scores: {
    total: number
    diagnosis: number
    reasoning: number
    investigations: number
    management: number
    timeMs: number
    estimateMinutes: number
  }
  timeline: SimDebriefTimelineItem[]
  learning: string[]
  concepts: { id: string; name: string; primary: boolean; mastery: number | null; status: string | null }[]
  related: { kind: string; label: string; blurb: string; items: { id: string; name: string; edgeLabel: string }[] }[] | null
  mistakeFed: { errorPattern: boolean; revisionItem: boolean; reason: string } | null
  handoffs: { conceptId: string | null; topicId: string | null; subjectCode: string | null }
  aiNote?: string
}

/** POST /api/sim/ai — grounded AI Case Mode (patient roleplay). */
export interface SimAiMessage {
  role: 'user' | 'assistant'
  content: string
}
export interface SimAiResponse {
  ok: boolean
  reply: string
  fallback: boolean
  disclaimer: string
  aiBadge: string
}

// ═══════════════════════════════════════════════════════════════════════
// PRODUCT 10 · MEDICAL IMAGE LEARNING LAB — FROZEN CONTRACT
// «See → Identify → Interpret → Reason → Learn → Practice»
// The `brief` (identify answers, finding regions/verdicts, quiz answers,
// guided whys, aiBrief) is the HIDDEN answer key — it NEVER leaves the
// server raw. Routes strip it to {id,label} projections exactly like the
// Case Simulator strips the sim brief. Pin grading happens server-side.
// ═══════════════════════════════════════════════════════════════════════

export type LabModality =
  | 'X-ray' | 'CT' | 'MRI' | 'ECG' | 'Histology' | 'Pathology'
  | 'Dermatology' | 'Ophthalmology' | 'Anatomy' | 'Microbiology'
  | 'Ultrasound' | 'Clinical'

export const LAB_MODALITIES: readonly LabModality[] = [
  'X-ray', 'CT', 'MRI', 'ECG', 'Histology', 'Pathology',
  'Dermatology', 'Ophthalmology', 'Anatomy', 'Microbiology',
  'Ultrasound', 'Clinical',
]

/** The six image learning modes. */
export type LabMode = 'identify' | 'interpret' | 'diagnose' | 'quiz' | 'guided' | 'rapid'

export const LAB_MODE_META: Record<LabMode, { label: string; blurb: string; graded: boolean }> = {
  identify: { label: 'Identify', blurb: '«What is this?» — recognise the image', graded: true },
  interpret: { label: 'Interpret', blurb: 'Locate the findings and name them', graded: true },
  diagnose: { label: 'Diagnose', blurb: 'Image + clinical context → diagnosis', graded: true },
  quiz: { label: 'Image Quiz', blurb: 'Targeted questions around the image', graded: true },
  guided: { label: 'Guided Explanation', blurb: 'Step-by-step reveal of the findings', graded: false },
  rapid: { label: 'Rapid Fire', blurb: 'Fast image recognition drill', graded: true },
}

/** HIDDEN — server-only answer key shape (never serialised to the client). */
export interface LabBrief {
  identify: {
    prompt: string
    options: { id: string; label: string; verdict: 'correct' | 'acceptable' | 'wrong'; why: string }[]
  }
  findings: LabFindingBrief[]
  diagnosis: {
    context: string // short clinical vignette shown with the image
    prompt: string
    options: { id: string; label: string; verdict: 'correct' | 'acceptable' | 'wrong'; why: string }[]
  }
  quiz: { id: string; q: string; options: { id: string; label: string; verdict: 'correct' | 'acceptable' | 'wrong'; why: string }[]; teaching: string }[]
  guided: string[] // ordered reveal steps — each names and explains one finding
  teaching: string[]
  aiBrief?: string // grounding paragraph for the AI tutor route
}

export interface LabFindingBrief {
  id: string
  label: string
  description: string // what it is / what it looks like
  why: string // why it matters clinically
  primary?: boolean // headline finding — drives the locate step
  present?: boolean // default true; false = curated NEGATIVE finding (interpret distractor with teaching why)
  commonMiss?: string // why students commonly miss it
  region?: { x: number; y: number; r: number } // % of natural width/height; r = hit radius in % of height
}

/** Region hit-test convention: student pins arrive as {x,y} in % of the
 *  natural image size + `aspect` (w/h). Hit: dist(√(((dx/100)·aspect)² + (dy/100)²)) ≤ r/100. */

export interface LabPin {
  x: number
  y: number
}
export interface LabOptionPublic {
  id: string
  label: string
}
export interface LabGuidedStep {
  id: string
  label: string
  description: string
  why: string
  region: { x: number; y: number; r: number } | null
}

export type LabProvenance = 'owned-clinical' | 'platform-diagram' | 'ai-illustration'
export const LAB_PROVENANCE_META: Record<LabProvenance, { badge: string; note: string }> = {
  'owned-clinical': { badge: 'PLATFORM-OWNED CLINICAL IMAGE', note: 'Owned by this platform for educational use' },
  'platform-diagram': { badge: 'PLATFORM EDUCATIONAL DIAGRAM', note: 'Schematic diagram drawn for teaching — not a real patient image' },
  'ai-illustration': { badge: 'AI-GENERATED EDUCATIONAL ILLUSTRATION', note: 'AI-created illustration — not a real patient image' },
}

/** Library card + list row. */
export interface LabImageSummary {
  id: string
  title: string
  diagnosis: string
  modality: LabModality
  system: string
  subjectCode: string
  difficulty: number // 1..3
  examRelevance: number // 1..5
  src: string
  provenance: LabProvenance
  isNormal: boolean
  compareGroup: string | null
  attemptCount: number
  bestScore: number | null
  lastScore: number | null
  lastMode: string | null
  lastAt: string | null
}

/** GET /api/lab/images/[id] — client-safe detail. Answers stripped. */
export interface LabImageDetail {
  summary: LabImageSummary
  identifyPrompt: string
  identifyOptions: LabOptionPublic[]
  interpretPrompt: string
  interpretOptions: LabOptionPublic[] // finding labels — regions/verdicts stay server-side
  locateCount: number // primary findings the student will pin
  diagnoseContext: string
  diagnosePrompt: string
  diagnoseOptions: LabOptionPublic[]
  quiz: { id: string; q: string; options: LabOptionPublic[] }[]
  guided: LabGuidedStep[] // teaching content — powers Guided Explanation + reveal
  concepts: { id: string; name: string }[]
  similar: LabImageSummary[] // compare pool (same compareGroup or curated similarIds)
  resume: { attemptId: string; mode: LabMode; startedAt: string } | null
}

/** GET /api/lab/home — every number measured from LabAttempt rows. */
export interface LabHome {
  stats: {
    imagesAvailable: number
    imagesStudied: number
    attempts: number
    accuracy: number | null // graded attempts correct %
    interpretationCoverage: number | null // located pins hit %
    avgTimeMs: number | null
    rapidBest: number | null
  }
  modalities: { name: string; count: number; attempts: number; accuracy: number | null }[]
  images: LabImageSummary[]
  weakModalities: { label: string; accuracy: number; attempts: number }[] // measured <70% ≥1 graded attempt
  missedPatterns: { label: string; count: number; lastImageTitle: string }[] // same finding missed ≥2 runs
  recommended: { imageId: string; title: string; reason: string } | null
  rapidPoolSize: number
  recent: { imageId: string; title: string; mode: string; score: number; correct: boolean; at: string }[]
  resume: { attemptId: string; imageId: string; imageTitle: string; mode: string } | null
}

/** POST /api/lab/images/[id]/attempt */
export interface LabAttemptStart {
  ok: true
  attemptId: string
  mode: LabMode
}

/** POST …/act — deterministic feedback for ONE step (server-graded). */
export interface LabPinResult {
  findingId: string
  label: string
  region: { x: number; y: number; r: number } | null
  verdict: 'hit' | 'miss'
}
export interface LabFeedback {
  correct: boolean
  score: number // 0..100 for this step
  headline: string
  perOption?: { id: string; label: string; verdict: 'correct' | 'acceptable' | 'wrong'; why: string }[]
  missed?: { id: string; label: string; why: string }[]
  pins?: { student: LabPin | null; results: LabPinResult[]; hits: number; total: number }
  teaching?: string // quiz step teaching line
}
export interface LabActResponse {
  ok: true
  feedback: LabFeedback
  nextIndex: number
  done: boolean
}

/** POST /api/lab/rapid — build a rapid-fire session (10 images from the pool). */
export interface LabRapidStart {
  ok: true
  attemptId: string
  timeLimitMs: number // per-item soft limit (server clamps reported time)
  items: { imageId: string; src: string; modality: LabModality; prompt: string; options: LabOptionPublic[] }[]
}

/** POST …/complete — debrief. */
export interface LabDebrief {
  attemptId: string
  imageId: string
  imageTitle: string
  diagnosis: string
  mode: LabMode
  scores: {
    total: number
    timeMs: number
    findingsHit: number
    findingsTotal: number
  }
  steps: { prompt: string; chosenLabels: string[]; correct: boolean; score: number; headline: string; perOption: LabFeedback['perOption'] }[]
  teaching: string[]
  concepts: { id: string; name: string; mastery: number | null; status: string | null }[]
  related: { kind: string; label: string; blurb: string; items: { id: string; name: string; edgeLabel: string }[] }[] | null
  mistakeFed: { errorPattern: boolean; revisionItem: boolean; reason: string } | null
  handoffs: { conceptId: string | null; topicId: string | null; subjectCode: string | null }
  nextImages: LabImageSummary[] // «practice similar images» — same modality pool
}

/** POST /api/lab/ai — grounded image tutor. */
export interface LabAiResponse {
  ok: boolean
  reply: string
  fallback: boolean
  disclaimer: string
  aiBadge: string
}

// ──────────────── MEDICAL VOICE TUTOR (PRODUCT 11) ────────────────
// Frozen client↔server contract for hands-free conversational learning.
// «Listen → Speak → Answer → Get feedback → Learn»
// The tutor speaks; the client always mirrors supporting text. Graded-answer
// verdicts arrive ONLY as structured evals — the tutor's internal grading
// block is stripped server-side and never shipped (no chain-of-thought).

export type VoiceMode = 'listen' | 'rapid' | 'viva' | 'revision' | 'clinical' | 'doubt'

export interface VoiceModeInfo {
  id: VoiceMode
  name: string
  tagline: string
  speak: string // what the student says to start it (voice-first affordance)
  expectsAnswer: boolean // modes where the tutor asks and waits for spoken answers
}

/** One measured «why this now» suggestion on the voice home. */
export interface VoiceSuggestion {
  mode: VoiceMode
  line: string
  topicId: string | null
}

/** GET /api/voice/home — measured home (stats, modes, suggestions, resume). */
export interface VoiceHome {
  modes: VoiceModeInfo[]
  stats: {
    sessions: number
    minutes: number // total spoken study time
    questions: number // graded spoken answers
    accuracy: number | null // correct/questions, null when nothing graded yet
    lastSessionAt: string | null
  }
  suggestions: VoiceSuggestion[] // measured «why this now»
  revisionDue: number
  weak: { name: string; mastery: number }[] // top weak concepts (measured)
  resume: { sessionId: string; mode: VoiceMode; topicLabel: string; startedAt: string } | null
  micSupported: boolean // client overrides after capability probe (SSR-safe default)
}

/** POST /api/voice/session — start (or resume) a spoken session. */
export interface VoiceStartResult {
  ok: true
  sessionId: string
  mode: VoiceMode
  resumed: boolean
  greeting: string // tutor's opening line — speak it
  display: string // optional longer supporting text (may equal greeting)
  state: VoiceSessionState
}

export interface VoiceSessionState {
  turns: number // tutor+student exchanges so far
  questions: number
  correct: number
}

/** One transcript entry (mirrored under the orb, always text-visible). */
export interface VoiceTranscriptEntry {
  role: 'tutor' | 'student'
  text: string
  at: string
}

/** POST /api/voice/turn — one spoken (or typed) student turn. */
export interface VoiceTurnResult {
  ok: true
  reply: string // speakable reply — the tutor says this
  display: string // supporting text (may include structure; never eval blocks)
  transcript: VoiceTranscriptEntry[] // full session transcript (server-owned)
  state: VoiceSessionState
  ended: boolean // tutor signalled the session arc is complete (viva/rapid sets)
}

/** POST /api/voice/complete — debrief + honest feed report. */
export interface VoiceDebrief {
  sessionId: string
  mode: VoiceMode
  topicLabel: string
  durationMs: number
  turns: number
  questions: number
  correct: number
  accuracy: number | null
  concepts: { name: string; verdict: 'correct' | 'partial' | 'missed'; note: string }[]
  weakTouched: { name: string; mastery: number }[] // measured weak areas revisited this session
  fed: { studySession: boolean; errorPattern: boolean; revisionItem: boolean; reason: string }
  handoffs: { revision: boolean; mistakes: boolean; planner: boolean }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT 12 — EXAM SIMULATOR & MOCK TEST LAB («Simulate → Perform → Analyze
// → Fix → Retest»). Contract FROZEN for 12-a (engine + /api/exam/**) and
// 12-b (UI). Grading is always DETERMINISTIC server-side (+4/−1 where
// negative marking applies) — the answer key never reaches the client before
// submit, and no AI touches selection or scoring. The AI Test Analyst only
// narrates the measured analysis — it never grades and never exposes its
// chain of thought.
// ═══════════════════════════════════════════════════════════════════════════

export type ExamMode =
  | 'full' | 'subject' | 'topic' | 'pyq' | 'custom'
  | 'weak' | 'adaptive' | 'image' | 'rapid'

export interface ExamModeInfo {
  id: ExamMode
  name: string
  tagline: string
  preset: { count: number; minutes: number; negativeMark: boolean }
  builtFrom: string // honest one-line description of how the paper is generated
}

export const EXAM_MODES: ExamModeInfo[] = [
  { id: 'full', name: 'Full-Length Mock', tagline: 'A NEET-PG-pattern paper across every subject', preset: { count: 50, minutes: 50, negativeMark: true }, builtFrom: 'Subject weights matched to the real exam mix' },
  { id: 'subject', name: 'Subject Test', tagline: 'One subject, exam conditions', preset: { count: 25, minutes: 25, negativeMark: true }, builtFrom: 'All platform questions in the chosen subject' },
  { id: 'topic', name: 'Topic Test', tagline: 'One topic or system, end to end', preset: { count: 10, minutes: 10, negativeMark: true }, builtFrom: 'Questions on the chosen topic and its concepts' },
  { id: 'pyq', name: 'PYQ Test', tagline: 'Classic repeated exam themes only', preset: { count: 20, minutes: 20, negativeMark: true }, builtFrom: 'PYQ-pattern questions tagged by the platform' },
  { id: 'custom', name: 'Custom Test', tagline: 'Your subjects, topics, difficulty and time', preset: { count: 20, minutes: 20, negativeMark: true }, builtFrom: 'Exactly the filters you set — nothing else' },
  { id: 'weak', name: 'Weak-Area Test', tagline: 'Only what you are measured-weak at', preset: { count: 15, minutes: 15, negativeMark: false }, builtFrom: 'Weak concepts and recent mistakes — no penalty, it is practice' },
  { id: 'adaptive', name: 'Adaptive Test', tagline: 'The engine ranks the paper for you', preset: { count: 20, minutes: 20, negativeMark: true }, builtFrom: 'Weakness, recall risk and exam relevance ranked at start' },
  { id: 'image', name: 'Image-Based Test', tagline: 'X-rays, ECGs and visual stems', preset: { count: 10, minutes: 12, negativeMark: true }, builtFrom: 'Image-based questions from the platform bank' },
  { id: 'rapid', name: 'Rapid Test', tagline: '45 seconds a question — instinct mode', preset: { count: 10, minutes: 8, negativeMark: false }, builtFrom: 'Rapid and short-stem questions, no negative marking' },
]

export interface ExamConfig {
  mode: ExamMode
  count?: number // 5..100 (clamped server-side)
  minutes?: number // total time budget (clamped server-side)
  subjectCodes?: string[] // subject / custom builder
  topicIds?: string[] // topic / custom builder
  difficulty?: number | null // custom only — exact 1..3(+4) filter
  sources?: ('pyq' | 'image' | 'clinical' | 'rapid')[] // custom bias flags
  negativeMark?: boolean // default per-mode preset
  conceptId?: string // hand-off filter (single-concept focus)
}

/** Client-safe exam question — NO answer/explanation before submit. */
export interface ExamQuestion {
  id: string
  stem: string
  options: { id: string; text: string }[]
  difficulty: number
  subjectCode: string
  system: string
  conceptId?: string
  conceptName?: string
  pyqPattern?: boolean
  imageBased?: boolean
  imageUrl?: string
}

/** POST /api/exam/start */
export interface ExamStartResult {
  ok: true
  attemptId: string
  label: string
  mode: ExamMode
  negativeMark: boolean
  total: number
  endsAt: string // server-authoritative deadline (ISO)
  startedAt: string
  questions: ExamQuestion[]
  note?: string // honest shortfall / reshuffle note
}

/** GET /api/exam/attempt/[id] — resume state (answers stay server-side). */
export interface ExamAttemptState {
  attemptId: string
  mode: ExamMode
  label: string
  negativeMark: boolean
  total: number
  endsAt: string
  status: string
  expired: boolean // deadline passed while away — client offers auto-submit
  responses: { questionId: string; history: string[]; timeMs: number; marked: boolean }[]
}

export interface ExamScoreRow {
  subjectCode: string
  name: string
  correct: number
  wrong: number
  unattempted: number
  accuracy: number // % of attempted
  score: number // includes negative marking
}

export interface ExamAnalysis {
  attemptId: string
  mode: ExamMode
  label: string
  negativeMark: boolean
  autoSubmitted: boolean
  totals: {
    total: number
    answered: number
    correct: number
    wrong: number
    unattempted: number
    score: number
    maxScore: number
    percent: number // score / maxScore
    accuracy: number // correct / answered
    timeMs: number
  }
  speed: {
    avgTimeMs: number
    band: 'fast' | 'steady' | 'slow' // vs 65 s/question exam benchmark
    buckets: { label: string; count: number }[] // <30 s / 30–90 s / >90 s
  }
  subjects: ExamScoreRow[]
  weakTopics: { name: string; subjectCode: string; correct: number; total: number; accuracy: number; topicId?: string | null }[]
  strongTopics: { name: string; subjectCode: string; correct: number; total: number; accuracy: number; topicId?: string | null }[]
  weakConcepts: { conceptId: string; conceptName: string; correct: number; total: number; mastery: number | null }[]
  difficulty: { d: number; correct: number; total: number }[]
  pyq: { attempted: number; correct: number; accuracy: number } | null // null when the paper had no PYQ-pattern rows
  mistakes: {
    careless: number // wrong in <30 s, or changed-to-wrong
    conceptual: number // wrong after ≥45 s of work
    changedToWrong: number
    changedToRight: number
    repeated: number // wrongs on concepts already missed ≥2× all-time
    unattempted: number
  }
  repeatedWrong: { conceptId: string; conceptName: string; misses: number }[] // all-time measured
  improvement: {
    vsLabel: string
    vsAt: string
    scoreDelta: number | null
    accuracyDelta: number | null
    speedDeltaMs: number | null // negative = faster
  } | null
  readiness: { key: string; label: string; value: number; note: string }[] // transparent 0..100 indicators
  recommended: { mode: ExamMode; config: ExamConfig; reason: string } | null
  fed: { studySession: boolean; revisionItems: number; attemptsRecorded: number; reason: string }
}

export interface ExamReviewQuestion {
  questionId: string
  stem: string
  options: { id: string; text: string }[]
  answer: string
  answerText: string
  selected: string | null
  selectedText: string | null
  correct: boolean
  unattempted: boolean
  explanation: string
  teaching: string
  optionNotes?: Record<string, string> // why each other option is wrong
  difficulty: number
  subjectCode: string
  subjectName: string
  conceptId: string | null
  conceptName: string | null
  topicId: string | null
  topicName: string | null
  pyqPattern?: boolean
  imageBased?: boolean
  imageUrl?: string
  timeMs: number
  changed: boolean // answer was changed at least once
  marked: boolean
  mistakeStatus: string | null // all-time MistakeRecord lifecycle for this question
  wrongCount: number
  saved: boolean
}

/** GET /api/exam/review/[id] — full post-test review (answers included). */
export interface ExamReviewPayload {
  attemptId: string
  label: string
  mode: ExamMode
  analysis: ExamAnalysis
  questions: ExamReviewQuestion[]
}

/** POST /api/exam/ai — AI Test Analyst, grounded on the measured analysis. */
export type ExamAiAction = 'what-went-wrong' | 'study-next' | 'important-mistakes' | 'revise' | 'next-test'
export interface ExamAiResponse {
  ok: boolean
  action: ExamAiAction
  text: string
  fallback: boolean
  disclaimer: string
  aiBadge: string
}

/** GET /api/exam/history — performance tracking across submitted tests. */
export interface ExamTrendPoint {
  attemptId: string
  label: string
  mode: ExamMode
  at: string
  score: number
  maxScore: number
  percent: number
  accuracy: number
  avgTimeMs: number
}
export interface ExamHistoryPayload {
  tests: ExamTrendPoint[]
  totals: {
    tests: number
    questionsAnswered: number
    accuracy: number | null
    avgPercent: number | null
    bestPercent: number | null
    minutes: number
  }
  consistency: { band: string; note: string; spread: number | null } | null // null when <3 tests
  subjects: { subjectCode: string; name: string; tests: number; attempted: number; accuracy: number; trend: number | null }[]
  revisionImpact: { note: string; revisedAccuracy: number | null; unrevisedAccuracy: number | null; sample: number } | null
  percentileNote: string // honest: no cohort data → no percentile claims
  insufficientData: boolean
}

/** GET /api/exam/home — measured dashboard. */
export interface ExamHome {
  modes: ExamModeInfo[]
  stats: {
    tests: number
    avgPercent: number | null
    bestPercent: number | null
    accuracy: number | null
    minutes: number
    lastAt: string | null
  }
  recent: { attemptId: string; label: string; mode: ExamMode; percent: number; accuracy: number; score: number; maxScore: number; at: string }[]
  resume: { attemptId: string; label: string; mode: ExamMode; total: number; answered: number; endsAt: string } | null
  weakSubjects: { code: string; name: string; accuracy: number | null; tests: number }[]
  weakConcepts: { conceptId: string; conceptName: string; mastery: number }[]
  recommended: { mode: ExamMode; config: ExamConfig; reason: string } | null
  facets: {
    subjects: { code: string; name: string; count: number }[]
    topics: { id: string; name: string; subjectCode: string; count: number }[]
  }
  bank: { total: number; pyq: number; image: number }
  disclaimer: string
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE & READINESS INTELLIGENCE (PRODUCT 13)
// «Measure → Understand → Predict → Improve» — an honest, explainable,
// action-oriented read of the student's real preparation signals.
// Every number is measured, every score explains what moves it, every
// insight leads to an action. Never a rank or outcome prediction.
// ═══════════════════════════════════════════════════════════════════════════

/** Direction of a measured change. */
export type PerformanceDirection = 'up' | 'down' | 'flat'

/** One weekly bucket in a trend series (value null = no data in that bucket). */
export interface PerformanceTrendPoint {
  label: string // e.g. "Nov 24"
  value: number | null
}

/** A measured time-series with honest semantics (improved respects the metric: fewer mistakes = improved). */
export interface PerformanceTrend {
  key: 'accuracy' | 'mock' | 'revision' | 'mistakes' | 'speed' | 'coverage'
  label: string
  unit: string // '%' | 'pts' | 'items' | 's'
  direction: PerformanceDirection
  delta: number | null // latest vs previous bucket, same unit
  improved: boolean | null // null = not enough data to judge
  series: PerformanceTrendPoint[]
  note: string // one measured sentence explaining the change
  insufficient: boolean // true when <2 buckets have data
}

/** Cross-section action hand-off — the client maps `kind` to store setters. */
export interface PerformanceHandoff {
  kind: 'adaptive' | 'quiz' | 'exam' | 'learn' | 'hub' | 'mistakes' | 'revision' | 'planner' | 'map' | 'concept'
  label: string
  detail?: string
  adaptive?: { mode?: AdaptiveMode; subjectCode?: string; topicId?: string; conceptId?: string; count?: number }
  quiz?: { subjectCode?: string; conceptId?: string; topicId?: string; count?: number; pairId?: string; pairLabel?: string }
  exam?: { mode?: ExamMode; subjectCode?: string; topicId?: string; conceptId?: string }
  learn?: { kind: 'subject' | 'topic'; id: string }
  hub?: { topicId: string; conceptId?: string | null }
  map?: { scope: string }
  conceptId?: string
}

/** One readiness dimension — transparent weight, basis and "how to move it". */
export interface PerformanceDimension {
  key: 'knowledge' | 'accuracy' | 'recall' | 'speed' | 'revision' | 'test' | 'consistency'
  label: string
  weight: number // nominal weight in the composite (points of 100)
  effectiveWeight: number // after renormalising out data-poor dimensions
  value: number | null // 0..100 (null = not enough data → excluded)
  note: string // what the number is made of
  basis: string // measured basis, e.g. "last 200 attempts"
  suggestion: string // concrete way to move it
  lacksData: boolean
}

/** The explainable NEET-PG readiness composite. */
export interface PerformanceReadiness {
  overall: number | null
  band: string
  dimensions: PerformanceDimension[]
  methodology: string // formula sentence with actual weights used
  excluded: string[] // dimension labels excluded for missing data
  disclaimer: string
}

/** A prioritized weakness — importance-ranked, never a flat dump. */
export interface PerformanceWeakItem {
  id: string
  kind: 'subject' | 'topic' | 'concept'
  label: string
  parent?: string // subject name
  signals: ('weak-mastery' | 'low-accuracy' | 'declining' | 'repeated-mistakes' | 'faded' | 'high-yield-gap' | 'untouched')[]
  importance: number // 0..100 — exam-weighted priority, not raw wrongness
  examRelevance: number // 1..5
  mastery: number | null
  accuracy: number | null
  recall: number | null // 0..1 estimated
  attempts: number
  wrongs: number
  reason: string // human one-liner built from measured facts
  action: PerformanceHandoff
}

/** A strength — with guidance to protect it, not re-grind it. */
export interface PerformanceStrengthItem {
  id: string
  kind: 'subject' | 'topic' | 'concept'
  label: string
  parent?: string
  mastery: number
  accuracy: number | null
  recall: number | null
  attempts: number
  note: string
}

/** An insight always carries at least one action — never charts without advice. */
export interface PerformanceInsight {
  id: string
  severity: 'critical' | 'warning' | 'info' | 'good'
  title: string // "Pharmacology accuracy dropped 8%"
  evidence: string // the measured numbers behind it
  why: string // one line on what it means
  actions: PerformanceHandoff[]
}

/** Per-subject measured row for the mastery / movement tables. */
export interface PerformanceSubjectRow {
  id: string
  code: string
  name: string
  color: string
  mastery: number | null // mean mastery of engaged concepts
  accuracy: number | null // accuracy on this subject's questions (all-time)
  recall: number | null
  coverage: number // % of the subject's concepts engaged
  attempts: number
  trend: number | null // accuracy Δ last-14d vs prior-14d (pp)
  status: 'new' | 'weak' | 'developing' | 'strong'
}

/** Realistic exam-preparation overview — estimates only, never guarantees. */
export interface PerformanceExamReadiness {
  current: number | null
  band: string
  gaps: { label: string; detail: string }[]
  highPriorityTopics: PerformanceWeakItem[]
  revisionDebt: { count: number; minutes: number }
  testReadiness: {
    tests: number
    lastPercent: number | null
    meanPercent: number | null
    bestPercent: number | null
    band: string | null
    note: string
  } | null
  trajectory: { direction: PerformanceDirection; note: string } | null
  examDate: string | null
  daysLeft: number | null
  disclaimer: string
}

/** Core indicator block — meaningful signals only, no vanity metrics. */
export interface PerformanceIndicators {
  overallProgress: number // % of high-yield-weighted syllabus engaged
  knowledgeSplit: { strong: number; unstable: number; weak: number; new: number }
  accuracy: number | null // last 200 attempts
  accuracyDelta: number | null // last-7d vs prior-7d (pp)
  recall: number | null // mean estimated recall across touched concepts
  revisionDebt: { count: number; minutes: number }
  revisionCoverage: number | null // % of weak concepts actively covered by revision
  mock: { tests: number; meanPercent: number | null; lastPercent: number | null; bestPercent: number | null; spread: number | null; band: string | null }
  speed: { medianSec: number | null; pace: number; band: string; note: string }
  consistency: { streak: number; activeDays14: number; adherence: number }
  mistakes: { open: number; repeated: number; resolvedThisWeek: number; mistakeRate: number | null; topErrorType: { type: string; count: number } | null }
  weakCount: number
  strongCount: number
  topicsMastered: number
  topicsTotal: number
}

/** GET /api/performance/home — the unified performance profile. */
export interface PerformancePayload {
  generatedAt: string
  indicators: PerformanceIndicators
  readiness: PerformanceReadiness
  trends: PerformanceTrend[]
  subjects: PerformanceSubjectRow[]
  weaknesses: PerformanceWeakItem[] // prioritized, capped
  focusNow: PerformanceWeakItem[] // top slice — "requires immediate attention"
  strengths: PerformanceStrengthItem[]
  insights: PerformanceInsight[]
  examReadiness: PerformanceExamReadiness
  dataBasis: { attempts: number; exams: number; activeDays30: number; conceptsTouched: number; conceptsTotal: number; windowDays: number }
  insufficientData: boolean
  insufficientNote?: string
  disclaimers: string[]
}

/** POST /api/performance/ai — AI Analyst, grounded ONLY in the measured payload. */
export type PerformanceAiAction = 'weekly_focus' | 'weakest_subject' | 'why_slow' | 'why_mistakes' | 'mock_ready' | 'ask'
export interface PerformanceAiResponse {
  ok: boolean
  action: PerformanceAiAction
  question?: string // echoed for 'ask'
  text: string
  bullets: string[]
  actions: PerformanceHandoff[] // server-attached measured actions (never AI-invented)
  fallback: boolean
  disclaimer: string
}

// ═══════════════════ MEDICAL CONTENT & RESOURCE HUB (PRODUCT 14) ═══════════════════
// «Discover → Learn → Compare → Practice → Save» — one organised, searchable
// ecosystem of learning resources. TRUST RULES (binding for every consumer):
//   · Platform-owned content is clearly distinguished from external resources.
//   · External resources are METADATA + LINK-OUT ONLY. We never re-host,
//     re-distribute or scrape copyrighted material.
//   · Every external record carries source, original URL, license/permission
//     status (where known), attribution note, access type and last-verified.
//   · urlVerified === false means exactly that: shown honestly as
//     "verification pending", never dressed up as verified.

/** Resource type buckets (spec: lessons/notes/lectures/videos/articles/guidelines/…). */
export type ResourceKind =
  | 'lesson' | 'notes' | 'lecture-video' | 'article' | 'guideline' | 'reference'
  | 'images' | 'clinical' | 'pyq' | 'question-set' | 'revision' | 'course' | 'case'

export const RESOURCE_KIND_META: Record<ResourceKind, { label: string; icon: string }> = {
  lesson: { label: 'Lessons', icon: 'BookOpen' },
  notes: { label: 'Notes', icon: 'NotebookPen' },
  'lecture-video': { label: 'Video lectures', icon: 'MonitorPlay' },
  article: { label: 'Articles & papers', icon: 'ScrollText' },
  guideline: { label: 'Guidelines', icon: 'Scale' },
  reference: { label: 'References', icon: 'Library' },
  images: { label: 'Image libraries', icon: 'Images' },
  clinical: { label: 'Clinical tools', icon: 'Stethoscope' },
  pyq: { label: 'Past exam papers', icon: 'FileQuestion' },
  'question-set': { label: 'Question sets', icon: 'CircleHelp' },
  revision: { label: 'Revision', icon: 'RefreshCcw' },
  course: { label: 'Courses', icon: 'GraduationCap' },
  case: { label: 'Cases', icon: 'ClipboardList' },
}

export type ResourceOwnership = 'platform' | 'external'
export type ResourceAccess = 'PUBLIC' | 'REGISTRATION' | 'PAID' | 'MIXED' | 'UNKNOWN'

/** One curated external resource — metadata only, always links out. */
export interface LibraryExternalResource {
  id: string // 'ext:…'
  ownership: 'external'
  kind: ResourceKind
  title: string
  description: string // our OWN original summary — never scraped copy
  sourceName: string
  sourceSlug: string // SOURCE_REGISTRY slug when the institution is registered
  url: string // ORIGINAL location — the only place the content lives
  urlVerified: boolean
  lastVerified: string | null
  access: ResourceAccess
  license: string // honest license/permission status, 'See site terms' when unknown
  attribution: string // attribution requirements or 'Not required for link-out'
  subjects: string[] // subject ids from the curriculum registry
  topicIds: string[] // topic ids from the curriculum registry
  difficulty: 1 | 2 | 3 // 1=foundational 2=core 3=advanced
  exams: string[] // 'neetpg' | 'fmge' | 'mbbs'
  language: 'en' | 'hi' | 'en-hi'
  minutes?: number // typical study time estimate when we can justify one
}

/** One platform-owned resource, generated from MEASURED counts (never invented). */
export interface LibraryPlatformResource {
  id: string // 'platform:…'
  ownership: 'platform'
  kind: ResourceKind
  title: string
  description: string
  subjects: string[]
  topicIds: string[]
  difficulty: 1 | 2 | 3
  exams: string[]
  /** measured backing counts + navigation target */
  counts: Record<string, number>
  view: View // where «Open» goes
  focus?: { kind: 'subject' | 'topic'; id: string } | null
  preset?: Record<string, unknown> | null // e.g. adaptivePreset payload
}

export type LibraryResource = LibraryExternalResource | LibraryPlatformResource

/** GET /api/library/resources — filter + search contract. */
export interface LibraryQuery {
  q?: string
  subject?: string
  topic?: string
  kind?: string // ResourceKind or csv
  source?: string // institution slug
  difficulty?: 1 | 2 | 3
  exam?: string
  ownership?: ResourceOwnership
  access?: ResourceAccess
  sort?: 'relevance' | 'title' | 'recent'
  page?: number
}

export interface LibraryResourcesPayload {
  total: number
  page: number
  pageSize: number
  resources: LibraryResource[]
  /** honesty note about external linking — always shown in UI footer */
  disclaimer: string
}

/** GET /api/library/resources/[id] — topic-integrated detail. */
export interface LibraryDetailPayload {
  resource: LibraryResource
  /** Subject → Topic → Concept → Questions → Cases → Revision chain */
  integration: {
    subjects: { id: string; name: string; color: string }[]
    topics: { id: string; name: string; subjectId: string; subjectName: string; importance: number; concepts: number; questions: number; mastery: number | null }[]
    concepts: { id: string; name: string; topicId: string; mastery: number | null }[]
    cases: { id: string; title: string; specialty: string; difficulty: number }[]
  }
  related: LibraryResource[] // same subject/topic siblings (max 4)
  saved: boolean
  reported: boolean
  handoffs: {
    practice: { conceptId?: string; topicId?: string } | null
    revision: { topicId?: string } | null
    hub: { topicId: string } | null
  }
  disclaimer: string
}

/** GET /api/library/home — the hub landing (measured, personalised). */
export interface LibraryHomePayload {
  stats: {
    platform: number // platform resource surfaces available now
    external: number // curated external resources in the catalog
    saved: number
    verifiedExternal: number // external entries with verified source domains
  }
  /** «Start where you are» — personalisation from real learning signals */
  forYou: {
    reason: string // honest data-basis line, e.g. 'From your 3 weakest topics'
    basis: { weakConcepts: number; dueRevision: number; recentTopics: number }
    resources: (LibraryResource & { reasonTag: string })[]
  } | null // null when there is no signal yet (never fabricated)
  kinds: { kind: ResourceKind; count: number }[]
  subjects: { id: string; name: string; color: string; count: number }[]
  sources: { slug: string; name: string; count: number; verified: boolean }[]
  featured: LibraryResource[]
  recentTopics: { id: string; name: string; subjectId: string; subjectName: string }[] // «studying X? jump to its resources»
  hasSignal: boolean // whether enough profile data exists for personalisation
  disclaimer: string
}

/** GET /api/library/for-topic/[topicId] — topic integration feed. */
export interface LibraryTopicFeedPayload {
  topic: { id: string; name: string; subjectId: string; subjectName: string; system: string | null }
  platform: LibraryPlatformResource[]
  external: LibraryExternalResource[]
  total: number
  disclaimer: string
}

/** GET/POST /api/library/saved */
export interface LibrarySavedPayload {
  resources: (LibraryResource & { savedAt: string })[]
  total: number
}

/** POST /api/library/report */
export interface LibraryReportResult {
  ok: boolean
  reason: string
  receivedAt: string
  note: string
}

/** POST /api/library/ai — grounded assistant over OUR catalog metadata. */
export interface LibraryAiResponse {
  ok: boolean
  mode: 'recommend' | 'key-points' | 'compare'
  answer: string
  resourceIds: string[] // referenced catalog ids (validated — never invented)
  fallback: boolean // true when the deterministic path answered
  aiBadge: string
  disclaimer: string
}

// ─── PRODUCT 15 — AI MEDICAL SEARCH & ANSWER ENGINE (Ask Engine) ─────────────
// Search → Understand → Verify → Explore → Learn. The engine ALWAYS grounds on
// platform content (concepts + structured lessons + verified graph edges +
// measured questions/cases + curated resource metadata). It never fabricates
// citations: every source row below is assembled deterministically in code;
// when grounding is insufficient the answer says so instead of inventing.

export type AskLevel = 'eli5' | 'mbbs' | 'neetpg' | 'detailed'
export type AskResolutionKind = 'concept' | 'topic' | 'compare' | 'none'
export type AskSourceKind = 'platform' | 'lesson-ref' | 'question-pool' | 'external'

/** One deterministically-assembled source row — never written by the LLM. */
export interface AskSource {
  kind: AskSourceKind
  label: string
  detail?: string // e.g. institution + year, or "worked explanations on platform"
  url?: string // external link-out only (verified status carried separately)
  verified?: boolean // urlVerified for external rows
  lastVerified?: string | null
  license?: string
  access?: ResourceAccess
}

/** Curated external resource — METADATA ONLY, always links out (P14 rules). */
export interface AskResource {
  id: string
  kind: ResourceKind
  title: string
  description: string
  sourceName: string
  url: string
  urlVerified: boolean
  lastVerified: string | null
  access: ResourceAccess
  license: string
  difficulty: 1 | 2 | 3
}

/** One graph neighbour grouped for the knowledge page. */
export interface AskConnection {
  group: string // GraphGroupKind
  items: { id: string; name: string; mastery: number; status: string }[]
}

/** The student's own measured mistakes on the resolved concept. */
export interface AskMistakeItem {
  questionId: string
  stem: string
  wrongCount: number
  lastErrorType: string | null
  teaching: string
}

/** A self-check MCQ drawn from the MEASURED platform pool (never AI-invented). */
export interface AskQuizItem {
  id: string
  stem: string
  options: { id: string; text: string }[]
  answer: string
  explanation: string
  teaching: string
  pyqPattern: boolean
  conceptName?: string
}

/** Serializable grounding/knowledge-page snapshot persisted on AskThread. */
export interface AskAnswerPayload {
  threadId: string
  query: string
  /** shown when Hinglish/fuzzy normalisation fired, e.g. «understood as …» */
  understoodAs?: string
  level: AskLevel
  resolution: {
    kind: AskResolutionKind
    conceptId?: string
    conceptName?: string
    conceptSummary?: string
    secondaryId?: string
    secondaryName?: string
    topicId?: string
    topicName?: string
    subjectName?: string
    subjectColor?: string
    matchedVia?: string
  }
  answer: {
    text: string
    keyPoints: string[]
    uncertain: boolean // engine could not fully ground the answer
    uncertainNote?: string
    fallback: boolean // deterministic compose (AI unavailable)
    aiBadge: string
    disclaimer: string
  }
  personalNote?: string // e.g. "renal physiology is a current weak area — we start there"
  connections: AskConnection[]
  highYield: string[] // measured numbers/mnemonics/mistake-warnings from the platform lesson
  personal: {
    mastery: number | null
    status: string | null
    missingPrerequisites: { id: string; name: string; mastery: number }[]
    mistakeOpen: number
    mistakeMaxWrong: number
  }
  questions: { total: number; pyq: number }
  cases: { id: string; title: string; specialty: string }[]
  resources: AskResource[]
  sources: AskSource[]
  suggestions: string[] // follow-up chips
}

/** POST /api/ask/followup — intent-dispatched reply inside a thread. */
export type AskFollowKind = 'text' | 'quiz' | 'mistakes' | 'revision' | 'compare'
export interface AskFollowPayload {
  ok: boolean
  kind: AskFollowKind
  reply: string
  quiz?: AskQuizItem[]
  quizNote?: string
  mistakes?: AskMistakeItem[]
  related?: { id: string; name: string; group: string }[]
  fallback?: boolean
  aiBadge?: string
  disclaimer?: string
}

/** POST /api/ask/quiz */
export interface AskQuizPayload {
  items: AskQuizItem[]
  note?: string // honest empty-state note when the pool is dry
}

/** POST /api/ask/revision */
export interface AskRevisionResult {
  ok: boolean
  queued: boolean // false when an open item already existed (dedupe)
  due: number // measured due count after the write
}

/** GET /api/ask/thread/[id] — reopen a past thread. */
export interface AskThreadDetail {
  id: string
  title: string
  rootQuery: string
  level: AskLevel
  createdAt: string
  updatedAt: string
  page: AskAnswerPayload
  messages: { role: 'user' | 'assistant'; kind: AskFollowKind; text: string; payload?: AskFollowPayload }[]
}

/** GET /api/ask/home */
export interface AskHomePayload {
  threads: { id: string; title: string; rootQuery: string; resolvedKind: string; updatedAt: string }[]
  stats: { concepts: number; questions: number; pyq: number; lessons: number; cases: number; resources: number }
  personal: {
    yearLabel: string
    prepStage: string
    weak: { conceptId: string; name: string; mastery: number }[]
    missed: { conceptId: string | null; name: string; count: number }[]
    dueRevision: number
  }
  examples: string[] // measured, resolvable starters (concept-name templated)
}

// ═══════════════════ MEDICAL LEARNING COMMUNITY & ACCOUNTABILITY (PRODUCT 16) ═══════════════════
// «Learn Together → Discuss → Stay Accountable → Improve» — a focused, moderated,
// educational community (NOT a social network). Honesty rules frozen with the contract:
//  • "You" is the real signed-in profile; every other member is a SEEDED DEMO PEER —
//    peers, peer posts and peer progress are demo data and are labelled as such in the UI.
//  • AI assistance (summarize/explain) is always badged AI-ASSISTED, grounded in thread
//    content or platform lessons, never presented as verified medical advice, never CoT.
//  • Suggested content (lessons/resources/MCQs) is MEASURED from the platform, never invented.
//  • Accountability numbers (streaks, goal progress, planned-vs-completed, challenges) are
//    MEASURED from real study activity (QuestionAttempt / StudySession / RevisionSession /
//    ExamAttempt / FlashcardReview) in IST day-windows. Peer numbers are labelled demo.
//  • Privacy: private-group content is only visible to members; personal performance is
//    never shared with a group without the explicit per-group `shareData` opt-in.
//  • Patient-identifying content is blocked at post/reply time by deterministic scans.

export type CommunitySpaceKind = 'exam' | 'subject' | 'doubt' | 'pyq' | 'case' | 'revision'
export type CommunityPostKind = 'question' | 'discussion' | 'pyq' | 'mcq' | 'case'
export type CommunityBadge = 'newcomer' | 'contributor' | 'guide' | 'mentor'
export type CommunityPostStatus = 'open' | 'review' | 'removed'

export interface CommunityActor {
  kind: 'you' | 'peer'
  id: string // profileId when 'you', CommunityMember id when peer
  name: string
  handle: string
  year: number
  badge: CommunityBadge
  bio?: string
  muted?: boolean
  blocked?: boolean
}

export interface CommunitySpaceSummary {
  id: string
  kind: CommunitySpaceKind
  name: string
  description: string
  subjectCode: string
  topicId: string
  posts: number // measured
  replies: number // measured
  unresolved: number // measured open questions
  activeToday: number // measured posts+replies since IST midnight
  groupCount: number // measured open study groups focused here
  reasonTag?: string | null // personalised why-this (measured), null when no signal
}

export interface CommunityPostSummary {
  id: string
  spaceId: string
  spaceName: string
  groupId: string
  groupName: string
  kind: CommunityPostKind
  title: string
  body: string
  author: CommunityActor
  tags: string[]
  subjectCode: string
  topicId: string
  topicName: string
  questionRef: string
  upvotes: number
  replies: number
  views: number
  resolved: boolean
  answered: boolean // has a reply marked as the answer
  status: CommunityPostStatus
  flagged: string // '' | 'spam' | 'abuse' — held for review note when set
  createdAt: string
  lastActivityAt: string
  votedByYou: boolean
  savedByYou: boolean
  mine: boolean
}

export interface CommunityReplySummary {
  id: string
  postId: string
  author: CommunityActor
  body: string
  upvotes: number
  isAnswer: boolean
  aiAssisted: boolean
  status: CommunityPostStatus
  createdAt: string
  votedByYou: boolean
  mine: boolean
}

/** Measured accountability snapshot — shared by community home + accountability view. */
export interface AccountabilitySnapshot {
  streak: { current: number; longest: number; todayActive: boolean }
  today: { mcqs: number; studyMinutes: number; revisionSessions: number; mocks: number; cases: number; active: boolean }
  week: { mcqs: number; studyMinutes: number; revisionSessions: number; mocks: number; cases: number; daysActive: number }
  goals: CommunityGoalView[]
  plannedVsCompleted: { today: { planned: number; completed: number }; week: { planned: number; completed: number } }
  challenges: CommunityChallengeView[]
  healthNote: string
}

export interface CommunityGoalView {
  id: string
  scope: 'daily' | 'weekly' | 'commitment'
  kind: string // mcqs | study | revision | mock | case | custom
  title: string
  target: number
  unit: string // mcqs | minutes | sessions | mocks | cases
  progress: number // measured for the current window
  done: boolean
  dueAt: string | null
  active: boolean
  createdAt: string
}

export interface CommunityChallengeView {
  id: string
  groupId: string
  groupName: string
  kind: 'mcq' | 'mock' | 'revision' | 'case'
  title: string
  detail: string
  target: number
  unit: string // mcqs | mocks | sessions | cases
  dueAt: string | null
  status: 'active' | 'complete' | 'archived'
  youJoined: boolean
  youCount: number // MEASURED from your real activity since the challenge started
  peerCounts: { label: string; count: number }[] // seeded demo snapshot — labelled in UI
  seeded: boolean
}

export interface CommunityContribution {
  score: number // 5×resolved answers + 3×resolved threads + 2×upvotes + posts/replies
  answers: number // replies marked as the answer
  resolvedThreads: number // your question threads resolved
  upvotesReceived: number
  posts: number
  replies: number
  badge: CommunityBadge
}

/** GET /api/community/home */
export interface CommunityHomePayload {
  stats: {
    spaces: number
    posts: number
    replies: number
    resolved: number
    unresolved: number
    groups: number
    you: CommunityContribution
  }
  accountability: AccountabilitySnapshot
  featured: { unresolved: CommunityPostSummary[]; active: CommunityPostSummary[] }
  spaces: CommunitySpaceSummary[]
  forYou: { spaces: CommunitySpaceSummary[]; groups: CommunityGroupSummary[]; note: string } | null // null when no learning signal
  myGroups: CommunityGroupSummary[]
  guidelinesAccepted: boolean
  demoNotice: string
  blocks: { muted: number; blocked: number }
}

/** GET /api/community/spaces and /api/community/spaces/[id] */
export interface CommunitySpaceDetail {
  space: CommunitySpaceSummary
  rules: string[]
  posts: CommunityPostSummary[]
}

/** GET /api/community/posts (feed=mine|saved|unresolved|topic&q=) */
export interface CommunityPostsPayload {
  posts: CommunityPostSummary[]
  feed: string
}

/** POST /api/community/posts — creation result; blocked carries the deterministic scan verdict. */
export interface CommunityCreatePostResult {
  post: CommunityPostSummary | null
  blocked: boolean
  reasons: { kind: string; note: string }[]
  guidance: string | null
}

/** GET /api/community/posts/[id] — thread page with grounded side rails. */
export interface CommunityThreadPayload {
  post: CommunityPostSummary
  replies: CommunityReplySummary[]
  similar: { id: string; title: string; score: number; resolved: boolean }[] // deterministic similarity scan
  relatedMcqs: { count: number; subjectCode: string; topicId: string; topicName: string } | null // measured pool
  youCanResolve: boolean
}

/** GET /api/community/groups */
export interface CommunityGroupsPayload {
  groups: CommunityGroupSummary[]
  mine: CommunityGroupSummary[]
}

export interface CommunityGroupSummary {
  id: string
  name: string
  slug: string
  description: string
  privacy: 'public' | 'private'
  focusKind: string // subject | topic | exam | mixed
  focusRef: string
  focusLabel: string
  goalText: string
  meetCadence: string
  members: number // measured
  youMember: boolean
  youOwner: boolean
  challengeCount: number
  activeToday: number // measured posts+plan activity today
  seeded: boolean
  createdAt: string
}

export interface CommunityGroupDetail extends Omit<CommunityGroupSummary, 'members'> {
  privacyLocked: boolean // private && !youMember — members/plan/challenges hidden
  members: { actor: CommunityActor; role: 'owner' | 'member'; joinedAt: string; sharesData: boolean }[]
  challenges: CommunityChallengeView[]
  plan: { id: string; line: string; addedBy: string; at: string }[]
  discussions: CommunityPostSummary[]
  youShareData: boolean // YOUR explicit per-group opt-in (default false)
  joinRequestNote: string | null
}

/** GET /api/community/accountability */
export interface CommunityAccountabilityPayload {
  accountability: AccountabilitySnapshot
  history: { dayKey: string; label: string; mcqs: number; studyMinutes: number; revisionSessions: number; active: boolean }[] // last 14 IST days, measured
  commitments: CommunityGoalView[]
  tip: string | null // one gentle, measured coaching line (never shaming)
}

/** POST /api/community/goals — add/update/pause/delete. */
export interface CommunityGoalResult {
  ok: boolean
  goal: CommunityGoalView | null
  goals: CommunityGoalView[]
}

/** POST /api/community/ai — modes frozen here; every mode carries badge+disclaimer. */
export interface CommunityAiResponse {
  mode: 'summarize' | 'explain' | 'suggest' | 'moderate'
  aiBadge: string
  disclaimer: string
  fallback: boolean
  summary?: { overview: string; keyPoints: string[]; openQuestions: string[] }
  explanation?: {
    grounded: boolean
    text: string
    keyPoints: string[]
    uncertain: boolean
    conceptId?: string
    conceptName?: string
    topicId?: string
    practiceCount?: number
  }
  suggestions?: {
    lessons: { topicId: string; topicName: string; lessonCount: number }[]
    resources: { id: string; title: string; sourceName: string; url: string; urlVerified: boolean; kind: string }[]
    mcqs: { count: number; subjectCode: string; topicId: string; topicName: string } | null
    note: string
  }
  moderation?: { verdict: 'clean' | 'flag' | 'violation'; reasons: { kind: string; note: string }[]; guidance: string }
}

// ═══════════════ GAMIFIED MEDICAL LEARNING & MOTIVATION ENGINE (PRODUCT 17) ═══════════════
// «Learn → Practice → Improve → Achieve → Continue»
// HONESTY & SAFETY RULES (binding for every consumer of these types):
//   · Every XP point, streak day, level, achievement and challenge percent is
//     MEASURED from real study activity (QuestionAttempt / StudySession /
//     RevisionSession / submitted ExamAttempt / SimCaseAttempt /
//     FlashcardReview / KnowledgeState mastery / resolved MistakeRecord) —
//     never granted for opening the app, never for raw screen time.
//   · The XP table, level curve and streak-recovery rule are PUBLISHED
//     in-product. No loot boxes, no random rewards, no engagement loops,
//     no notification pressure.
//   · Streaks are a healthy view of consistency: one missed day with a real
//     habit (9+ active days in the trailing 14) shows RECOVERED, not broken.
//     Copy is never guilt-based; there is no "you missed X days" shaming.
//   · Achievements are a curated set (~14) with honest progress lines — no
//     badge clutter, no vanity counters.
//   · Leaderboards are opt-in per study group (reuses the P16 shareData
//     consent). Peer rows are labelled demo snapshots; your row is measured.
//     Rank is secondary — the headline is always you vs your own last week.
//   · Challenge targets adapt to the student's measured baseline.
//   · Motivation cards are deterministic rules over measured signals (no AI,
//     no chain-of-thought), capped at 4, each carrying one hand-off action.
//   · Rewards are non-monetary: accent themes for this section, featured
//     badges, challenge badges, group recognition.

/** The full published XP table — mirrors src/lib/gamify-engine.ts. */
export const XP_TABLE: { kind: string; xp: number; unit: string; note: string }[] = [
  { kind: 'mcq-correct', xp: 10, unit: 'per question', note: 'First correct answer at a question' },
  { kind: 'mcq-repeat-correct', xp: 3, unit: 'per question', note: 'Correct on a redo — the win is remembering, not the first hit' },
  { kind: 'mcq-attempt', xp: 2, unit: 'per question', note: 'An honest wrong attempt reviewed is practice too' },
  { kind: 'revision', xp: 8, unit: 'per session', note: 'A completed revision block' },
  { kind: 'flashcards', xp: 1, unit: 'per card/day', note: 'Active recall — counted once per card per day' },
  { kind: 'study', xp: 5, unit: 'per session', note: 'A logged study block — max 3 counted per day' },
  { kind: 'mock', xp: 40, unit: '+ accuracy bonus', note: 'Submitted mock + up to +25 by accuracy' },
  { kind: 'case', xp: 15, unit: 'per case', note: 'Completed clinical case' },
  { kind: 'topic-mastered', xp: 50, unit: 'one-time', note: 'A topic crosses the mastery bar' },
  { kind: 'mistake-corrected', xp: 15, unit: 'one-time', note: 'A repeated mistake you fixed for good' },
  { kind: 'challenge-completed', xp: 60, unit: 'one-time', note: 'Challenge bonus on completion' },
]

/** Level curve: total XP needed for level L = 50 · (L−1) · L (L2=100, L3=300, L4=600, L5=1000…). */
export const GAMIFY_TIERS: { upTo: number; name: string }[] = [
  { upTo: 2, name: 'Foundation' },
  { upTo: 4, name: 'Core' },
  { upTo: 6, name: 'Clinical' },
  { upTo: 8, name: 'Advanced' },
  { upTo: 10, name: 'Exam-Ready' },
  { upTo: Infinity, name: 'Mastery' },
]

export interface GamifyLevelInfo {
  level: number
  tier: string
  xp: number // total measured XP
  xpIntoLevel: number
  xpForNextLevel: number // XP needed at this level (next threshold − previous threshold)
  xpToNext: number
}

export type GamifyStreakState = 'intact' | 'recovered' | 'open' | 'none'

export interface GamifyStreakLine {
  days: number
  state: GamifyStreakState
  todayActive: boolean
  note: string // honest one-liner (never guilt)
}

export interface GamifyStreaks {
  learning: GamifyStreakLine
  revision: GamifyStreakLine
  mcq: GamifyStreakLine
  weekly: { weekStart: string; activeDays: number; total: number }[] // last 6 IST weeks, oldest → newest
  activeDays14: number
  recoveryRule: string // the published recovery rule, verbatim
}

/** Deterministic, measured motivation card — capped at 4, one hand-off each. */
export interface GamifyMotivationCard {
  id: string // '<kind>:<ref>'
  kind: 'close-topic' | 'accuracy-up' | 'blockers' | 'revision-backlog' | 'streak'
  title: string
  detail: string // the measured numbers behind it
  action: { label: string; view: import('./types').View; topicId?: string; subjectCode?: string }
}

export interface GamifyXpEventView {
  id: string
  kind: string
  label: string // human one-liner, e.g. "Correct answer — nephrotic syndrome"
  xp: number
  dayKey: string
  at: string
}

export interface GamifyAchievementView {
  id: string
  title: string
  description: string
  icon: string // lucide icon hint
  group: 'starters' | 'practice' | 'consistency' | 'mocks' | 'repair' | 'mastery'
  unlocked: boolean
  earnedAt: string | null
  progress: number | null // 0..100 for locked achievements with a measurable line
  progressNote: string | null // "78 / 100 MCQs solved"
  featured: boolean
}

export interface GamifyChallengeView {
  id: string
  title: string
  description: string
  icon: string
  durationDays: number
  target: number // adaptive final target (measured baseline → suggestion)
  unit: string
  adaptedNote: string // why this target — measured baseline sentence
  enrolled: boolean
  status: 'not-enrolled' | 'active' | 'completed' | 'abandoned'
  progress: number | null
  percent: number | null
  daysLeft: number | null
  startedAt: string | null
  completedAt: string | null
  suggested: boolean
  suggestReason: string | null
  bonusXp: number
}

export interface GamifyBoardRow {
  actorKey: string
  name: string
  demo: boolean
  you: boolean
  weeklyXp: number | null
  weeklyMcqs: number | null
  weeklyAccuracy: number | null // 0..100, null when not shared
  streak: number | null
  rank: number
  note: string | null // e.g. "+38 XP vs your last week"
}

export interface GamifyLeaderboardPayload {
  groups: { id: string; name: string; shareData: boolean; memberCount: number; demo: boolean }[]
  groupId: string | null
  consentOn: boolean // your shareData for the selected group
  rows: GamifyBoardRow[]
  yourLastWeekXp: number | null
  yourThisWeekXp: number | null
  framing: string // non-shaming framing sentence
  privacyNote: string
}

export interface GamifyJourneySubject {
  id: string
  code: string
  name: string
  color: string
  neetWeight: number
  topicsTotal: number
  topicsMastered: number
  engagedPct: number // % of topics engaged (any mastery signal)
  masteryPct: number | null // mean engaged-topic mastery 0..100
  status: 'new' | 'developing' | 'strong'
}

export interface GamifyJourneyPayload {
  generatedAt: string
  ladder: { label: string; detail: string; percent: number }[] // Subjects → Topics → Mastery → Milestones → Exam Readiness
  subjects: GamifyJourneySubject[]
  milestones: { unlocked: number; total: number; recent: { id: string; title: string; earnedAt: string }[] }
  readiness: { current: number | null; band: string; note: string }
  insufficientData: boolean
  dataBasis: { conceptsTouched: number; conceptsTotal: number; attempts: number; mocks: number }
  honestNote: string
}

export interface GamifyHomePayload {
  generatedAt: string
  level: GamifyLevelInfo
  streaks: GamifyStreaks
  today: { mcqs: number; revision: number; studyMinutes: number; mocks: number; xp: number; active: boolean }
  weekXp: number
  lastWeekXp: number
  recent: GamifyXpEventView[] // newest 12
  totals: { mcqsSolved: number; revisionSessions: number; mocksSubmitted: number; casesCompleted: number; flashcardsReviewed: number; topicsMastered: number; mistakesResolved: number; studySessions: number }
  achievements: { unlocked: number; total: number; latest: GamifyAchievementView | null }
  challenges: { active: number; completed: number; next: GamifyChallengeView | null }
  motivation: GamifyMotivationCard[]
  dataBasis: { events: number; measuredSources: string[] }
  honestNote: string
}

export interface GamifyAchievementsPayload {
  achievements: GamifyAchievementView[]
  featured: string[]
  note: string
}

export interface GamifyChallengesPayload {
  challenges: GamifyChallengeView[]
  activeCount: number
  completedCount: number
  note: string
}

export interface GamifyXpLedgerPayload {
  days: { dayKey: string; label: string; xp: number; events: { kind: string; label: string; xp: number; at: string }[] }[]
  byKind: { kind: string; label: string; xp: number }[]
  totalXp: number
  hasMore: boolean
}

export interface GamifyRewardsPayload {
  accents: { id: string; name: string; unlockLevel: number; unlocked: boolean; description: string }[]
  featured: string[]
  badges: { unlocked: number; total: number; challengeBadges: { id: string; title: string; completedAt: string }[] }
  groupRecognition: { groupName: string; note: string }[]
  note: string
}

// ═════════════ PERSONAL MEDICAL BRAIN (PRODUCT 18) ═════════════
// A continuously evolving personal learning intelligence layer:
// «Observe → Understand → Personalize → Predict → Improve»
//
// Honesty & privacy rules (binding for every P18 route/component):
// - Every signal is MEASURED from real learning activity (KnowledgeState,
//   QuestionAttempt, FlashcardReview, MistakeRecord, RevisionItem/Session,
//   LearnProgress, StudySession, ExamAttempt, SimCaseAttempt). Nothing is
//   invented, nothing is a guess presented as data.
// - Concept states derive from MULTIPLE signal families, never a single
//   quiz result. The derivation rule is published below and rendered in the
//   UI ("How your brain works").
// - Every recommendation carries its evidence (signals) — "why am I seeing
//   this" is always answerable in one tap.
// - The brain is PRIVATE BY DEFAULT: no sharing surface exists. AI Tutor
//   context is transparency-first (the student can see exactly what the
//   tutor sees) and controlled by a toggle. No chain-of-thought anywhere —
//   AI outputs are final text only, badged and grounded.
// - Exam strategy is evidence-based and NEVER promises or predicts a rank.
// - Personalization toggles are respected everywhere; disabling a switch
//   means that surface falls back to its non-personalized behavior.
//
// PUBLISHED 7-state derivation (evaluated in this order, mutually exclusive):
//   not-started    → zero measured signals
//   at-risk        → was strong/mastered (score ≥ 70) but estRecall < 0.5 now
//   needs-revision → engaged but estRecall < 0.6 (due), or ≥ 2 open repeated mistakes
//   mastered       → attempts ≥ 3 ∧ accuracy ≥ 75 ∧ estRecall ≥ 0.6 ∧ 0 open mistakes
//   strong         → score ≥ 70 ∧ estRecall ≥ 0.55
//   familiar       → score ≥ 45 or (engaged ≥ 2 ∧ accuracy ≥ 50)
//   learning       → any measured signal below the above bars
// estRecall = e^(−t / 1.6·stability) — the platform's published Ebbinghaus curve.

export type BrainConceptStatus =
  | 'not-started'
  | 'learning'
  | 'familiar'
  | 'strong'
  | 'mastered'
  | 'at-risk'
  | 'needs-revision'

export type BrainForgetRisk = 'none' | 'low' | 'moderate' | 'high'

export interface BrainSignal {
  kind: 'mcq' | 'flashcards' | 'revision' | 'mistakes' | 'cases' | 'lesson' | 'learn-mark' | 'lab' | 'voice' | 'mock'
  label: string // "34 MCQs · 71% correct" — measured, human-readable
  at?: string // ISO timestamp of the last measurement in this family
}

export interface BrainConceptState {
  conceptId: string
  name: string
  topicId: string
  topicName: string
  subjectId: string
  subjectName: string
  examWeight: number // 1..5 curriculum exam relevance (published, not inferred)
  status: BrainConceptStatus
  score: number | null // KnowledgeState score 0..100 (null = never measured)
  estRecall: number | null // e^(−t/1.6·stability), null = never studied
  stabilityDays: number | null
  accuracy: number | null // MCQ accuracy %
  attempts: number
  meanTimeMs: number | null
  openMistakes: number
  lastReviewedAt: string | null
  forgetRisk: BrainForgetRisk
  daysToDecay: number | null // days until estRecall < 0.6 at current stability
  signals: BrainSignal[] // every measured signal family — the "why"
  prereqGap: boolean // an unlearned prerequisite blocks this concept
}

export interface BrainStateCounts {
  'not-started': number
  learning: number
  familiar: number
  strong: number
  mastered: number
  'at-risk': number
  'needs-revision': number
}

export interface BrainAction {
  label: string
  view: View // hand-off target (existing views only)
  conceptId?: string
  topicId?: string
  note?: string
}

export interface BrainAnswerItem {
  conceptId?: string
  questionId?: string
  label: string
  detail: string
  evidence?: string
  action?: BrainAction
}

export interface BrainAnswer {
  id: 'know' | 'forget' | 'repeat' | 'prereq' | 'next' | 'revise' | 'practice'
  question: string
  headline: string
  items: BrainAnswerItem[]
  note?: string
}

export interface BrainPathStage {
  id: 'next' | 'learn' | 'practice' | 'correct' | 'revise' | 'retest' | 'mastery'
  title: string
  line: string
  done: boolean
  current: boolean
  evidence: string[]
  actions: BrainAction[]
}

export interface BrainPathPayload {
  focus: BrainConceptState | null
  reason: string // why this focus was chosen (measured signals)
  stages: BrainPathStage[] // Next Concept → Learn → Practice → Correct → Revise → Retest → Mastery
  alternatives: { conceptId: string; name: string; reason: string }[]
  insufficientData: boolean
  note: string
}

export interface BrainMemoryRow {
  conceptId: string
  name: string
  topicName: string
  subjectName: string
  lastReviewedAt: string | null
  stabilityDays: number | null
  estRecall: number | null
  forgetRisk: BrainForgetRisk
  daysToDecay: number | null
  revisions: number
  flashcards: { reps: number; lapses: number; lastGrade: number | null }
  wrongCount: number
  retrievalSuccess: number | null // successful retrievals / (retrievals + lapses) %
  signals: string[]
}

export interface BrainTutorPack {
  enabled: boolean // BrainSettings.tutorContextOn
  blocks: { title: string; lines: string[] }[] // exactly what the tutor receives
  masteredNotToRepeat: string[] // tutor is told NOT to re-teach these
  note: string
}

export interface BrainPracticeQuestion {
  id: string
  stem: string
  subjectCode: string
  topicId: string | null
  conceptId: string | null
  why: string // measured reason this question was picked
}

export interface BrainPracticePayload {
  generatedAt: string
  focusLine: string
  confusionPair: { a: string; b: string; line: string; conceptIds: string[] } | null
  discriminationQuestions: BrainPracticeQuestion[]
  weaknessQuestions: BrainPracticeQuestion[]
  handoff: BrainAction
  note: string
}

export interface BrainContentRec {
  kind: 'lesson' | 'mcq' | 'pyq' | 'case' | 'image' | 'flashcards' | 'revision'
  label: string
  count: number
  detail: string
  action: BrainAction
}

export interface BrainContentPayload {
  generatedAt: string
  focus: { conceptId: string; name: string } | null
  recs: BrainContentRec[]
  note: string
}

export interface BrainStrategyPayload {
  generatedAt: string
  examClock: { daysLeft: number | null; stage: string; isEstimate: boolean } | null
  readiness: { current: number | null; band: string; dataPoorDims: string[] } | null
  highImpactWeaknesses: { conceptId: string; name: string; line: string; examWeight: number; action: BrainAction }[]
  strongAreas: { conceptId: string; name: string; line: string }[]
  timeManagement: { medianSec: number | null; paceSec: number; timedAccuracy: number | null; untimedAccuracy: number | null; line: string }
  mistakePatterns: { errorType: string; count: number; tactic: string }[]
  revisionGaps: { coverage: number | null; overdue: number; line: string }
  testTaking: { carelessRate: number | null; changedAnswers: number; line: string }
  playbook: string[] // evidence-based strategy lines — never a rank promise
  disclaimer: string
}

export interface BrainInsight {
  title: string
  line: string
  evidence?: string
  action?: BrainAction
}

export interface BrainPrivacySettingsView {
  personalizationOn: boolean
  tutorContextOn: boolean
  questionPersonalizationOn: boolean
  revisionPersonalizationOn: boolean
  contentPersonalizationOn: boolean
  historySnapshotsOn: boolean
}

export interface BrainHomePayload {
  generatedAt: string
  profile: {
    topicsStudied: number
    topicsTotal: number
    conceptsByState: BrainStateCounts
    questionAccuracy: number | null
    accuracy30d: number | null
    medianTimeSec: number | null
    revisionSessions: number
    mock: { attempts: number; meanScore: number | null; lastScore: number | null; bestScore: number | null }
    consistency: { streakDays: number; activeDays30: number }
    preferences: { prepStage: string; examLabel: string; dailyHours: number | null; learningStyles: string[] }
  }
  answers: BrainAnswer[] // the 7 intelligence questions, condensed items
  path: BrainPathPayload
  insights: BrainInsight[] // max 4 — insights + actions, never a data dump
  forgetting: { atRisk: number; needsRevision: number; topRisks: { conceptId: string; name: string; recall: number }[] }
  privacy: BrainPrivacySettingsView
  howItWorks: string[] // published derivation rules
  dataBasis: { conceptsMeasured: number; attempts: number; flashcardReviews: number; revisionItems: number; mocks: number }
  honestNote: string
}

export interface BrainKnowledgePayload {
  generatedAt: string
  counts: BrainStateCounts
  states: BrainConceptState[]
  note: string
}

export interface BrainMemoryPayload {
  generatedAt: string
  rows: BrainMemoryRow[]
  summary: { highRisk: number; moderateRisk: number; dueNow: number; note: string }
}

export interface BrainTimelinePoint {
  dayKey: string
  label: string
  mastered: number
  strong: number
  atRisk: number
  needsRevision: number
  accuracy: number | null
}

export interface BrainTimelinePayload {
  generatedAt: string
  points: BrainTimelinePoint[]
  note: string
}

export interface BrainPrivacyPayload {
  generatedAt: string
  settings: BrainPrivacySettingsView
  storedData: { section: string; count: number; description: string }[]
  privateByDefault: string
  howItWorks: string[]
  note: string
}

export interface BrainExportSection {
  title: string
  description: string
  rows: { label: string; value: string }[]
}

export interface BrainExportPayload {
  generatedAt: string
  profileLine: string
  sections: BrainExportSection[]
  note: string
}

export interface BrainResetResult {
  ok: boolean
  scope: string
  cleared: { table: string; count: number }[]
  note: string
}

// ═════════════ AI FACULTY & CONTENT INTELLIGENCE (PRODUCT 19) ═════════════
// A separate first-class faculty workspace + content intelligence layer:
// «Collect → Organize → Understand → Validate → Personalize»
//
// Binding rules for every P19 route/component:
// - MEASURED ONLY: every gap, finding, coverage number and recommendation is
//   computed live from the real content tables (Subject/Topic/Concept/lesson,
//   Question/Flashcard/ClinicalCase/SimCase/LabImage/LearningModule, P14
//   resource catalog) and real learning activity (KnowledgeState,
//   QuestionAttempt, LearnProgress, MistakeRecord). Nothing is invented.
// - AI NEVER SELF-PUBLISHES: assistance (summarize, simplify, key points,
//   flashcards, MCQs, cases, revision notes, concept links) is grounded in
//   EXISTING platform content, produces a FacultyDraft with aiAssisted=true,
//   and can only reach "published" through an explicit human reviewer step
//   (reviewerNote required). Unverified AI output is NEVER authoritative.
// - FLAG, DON'T DECLARE: quality-control findings (answer-key skew, ambiguity,
//   duplicates, missing citations, outdated content, fail-after-read) are
//   flagged FOR HUMAN REVIEW — the engine never auto-resolves them as correct.
// - ATTRIBUTION & LICENSING: external resources keep their license/attribution
//   lines from the P14 catalog; missing attribution is itself a QC finding.
// - VERSIONING: published drafts become FacultyContentVersion rows (version,
//   summary, reviewer, references, verification status, lastReviewedAt).
//   Applying a lesson body is an explicit reviewer action and is additive —
//   KnowledgeState/attempt history keyed by conceptId is never rewritten.
// - PRIVACY: the fail-after-read signal is measured on THIS account's activity
//   (labelled as such). No private performance data leaves the platform.
// - No chain-of-thought anywhere: AI outputs are final text, AI-ASSISTED
//   badged, grounded, with deterministic fallbacks.
//
// Priority rule (published): gaps are ranked by exam weight × learner demand
// (attempts + mistakes + learn-status) so faculty effort lands where students
// struggle most — not where the library is merely thin.

export type FacultyEntityType = 'concept' | 'question' | 'flashcard' | 'case' | 'resource' | 'topic' | 'module'

export type FacultyGapKind =
  | 'missing-lesson'
  | 'missing-practice'
  | 'missing-revision'
  | 'missing-case-correlation'
  | 'missing-prerequisite-lesson'
  | 'unlinked-question'
  | 'unlinked-flashcard'
  | 'outdated-content'

export type FacultyQualityKind =
  | 'answer-key-skew'
  | 'duplicate-question'
  | 'ambiguous-mcq'
  | 'poor-explanation'
  | 'missing-option-notes'
  | 'missing-citation'
  | 'outdated-resource'
  | 'fail-after-read'
  | 'open-report'

export type FacultySeverity = 'info' | 'warning' | 'critical'

export type FacultyVerificationStatus = 'unverified' | 'in-review' | 'verified' | 'flagged'

export type FacultyDraftStatus = 'draft' | 'in-review' | 'published' | 'rejected'

export type FacultyDraftKind =
  | 'summary'
  | 'simplify'
  | 'key-points'
  | 'flashcards'
  | 'mcq'
  | 'case'
  | 'revision-notes'
  | 'concept-links'
  | 'manual'

export type FacultyAssistAction = Exclude<FacultyDraftKind, 'manual'>

export interface FacultyHandoff {
  view: string // target view id (e.g. 'learn', 'questions', 'brain')
  label: string // button copy
  focus?: string // optional focus payload (conceptId, tab…)
}

export interface FacultyGapItem {
  id: string // deterministic: `${kind}:${entityType}:${entityId}`
  kind: FacultyGapKind
  severity: FacultySeverity
  entityType: FacultyEntityType
  entityId: string
  label: string // human-readable target ("Abruptio Placentae — ObGy")
  subjectName?: string
  topicName?: string
  examWeight?: number | null
  demandLine?: string // "34 attempts · 41% correct · 8 mistakes" (measured)
  evidence: string[] // measured lines, each traceable
  suggestion: string
  priority: number // 0..100 published score: examWeight × demand × severity
  handoff?: FacultyHandoff
}

export interface FacultyGapsPayload {
  generatedAt: string
  counts: { all: number } & Partial<Record<FacultyGapKind, number>>
  items: FacultyGapItem[] // priority-ranked, capped (client can filter)
  prioritizedBy: string // published priority rule
  dataBasis: string
  note: string
}

export interface FacultyQualityItem {
  id: string // deterministic: `${kind}:${entityType}:${entityId}`
  kind: FacultyQualityKind
  severity: FacultySeverity
  entityType: FacultyEntityType
  entityId: string
  label: string
  evidence: string[]
  suggestion: string
  flagged: boolean // open FacultyReviewItem exists
  reviewItemId?: string
}

export interface FacultyQualityPayload {
  generatedAt: string
  answerKeyDist: { option: string; count: number; sharePct: number }[]
  answerKeySkew: { skewPct: number; line: string } | null
  counts: { all: number; open: number } & Partial<Record<FacultyQualityKind, number>>
  items: FacultyQualityItem[]
  openReports: { questions: number; resources: number }
  flaggedForHumanReview: number
  disclaimer: string
  note: string
}

export interface FacultyInventorySubject {
  id: string
  name: string
  topics: number
  concepts: number
  lessons: number
  questions: number
  flashcards: number
  cases: number
  lessonCoveragePct: number | null
}

export interface FacultyInventoryPayload {
  generatedAt: string
  totals: {
    subjects: number
    topics: number
    concepts: number
    lessons: number
    questions: number
    pyqPatternQuestions: number
    flashcards: number
    cases: number
    simCases: number
    labImages: number
    learningModules: number
    edges: number
    verifiedEdges: number
  }
  subjects: FacultyInventorySubject[]
  organization: {
    unlinkedQuestions: { count: number; sample: { id: string; stem: string; subjectCode: string }[] }
    questionsWithoutConcept: number
    unlinkedFlashcards: { count: number; sample: { id: string; front: string; subjectCode: string }[] }
  }
  note: string
}

export interface FacultyDraftBody {
  text?: string // summaries, simplified explanations, revision notes
  bullets?: string[] // key points, structured outlines
  cards?: { front: string; back: string }[]
  mcqs?: { stem: string; options: { id: string; text: string }[]; answer: string; explanation: string; teaching: string }[]
  case?: { title: string; specialty: string; patient: string; steps: string[]; learning: string[] }
  links?: { fromId: string; toId: string; type: string; label: string; why: string }[]
  references?: string[]
}

export interface FacultyDraftView {
  id: string
  kind: FacultyDraftKind
  entityType: FacultyEntityType
  entityId: string
  entityLabel: string
  title: string
  status: FacultyDraftStatus
  aiAssisted: boolean
  grounded: boolean
  changeNote: string
  reviewerNote: string
  reviewedBy: string
  publishedVersion: number | null
  createdAt: string
  updatedAt: string
  body: FacultyDraftBody
}

export interface FacultyDraftsPayload {
  generatedAt: string
  counts: { all: number } & Partial<Record<FacultyDraftStatus, number>>
  drafts: FacultyDraftView[]
  note: string
}

export interface FacultyAssistResult {
  draft: FacultyDraftView
  sources: { kind: string; label: string }[] // what the assist grounded on
  aiAssisted: boolean
  disclaimer: string
  note: string
}

export interface FacultyReviewItemView {
  id: string
  kind: string
  severity: FacultySeverity
  entityType: FacultyEntityType
  entityId: string
  label: string
  evidence: string[]
  suggestion: string
  status: 'open' | 'in-review' | 'resolved' | 'dismissed'
  createdAt: string
  updatedAt: string
}

export interface FacultyReviewQueuePayload {
  generatedAt: string
  open: FacultyReviewItemView[]
  draftsInReview: FacultyDraftView[]
  note: string
}

export interface FacultyRecommendResource {
  kind: 'lesson' | 'questions' | 'flashcards' | 'case' | 'lab' | 'module' | 'understand'
  label: string
  count?: number
  why: string
  handoff?: FacultyHandoff
}

export interface FacultyRecommendItem {
  conceptId: string
  conceptName: string
  topicName: string
  subjectName: string
  examWeight: number
  weaknessLine: string // measured (attempts, accuracy, mistakes, recall)
  recommended: FacultyRecommendResource[]
  note: string
}

export interface FacultyRecommendPayload {
  generatedAt: string
  items: FacultyRecommendItem[]
  dataBasis: string
  note: string
}

export interface FacultyVersionView {
  id: string
  entityType: FacultyEntityType
  entityId: string
  entityLabel: string
  version: number
  verificationStatus: FacultyVerificationStatus
  reviewer: string
  summary: string
  references: string[]
  lastReviewedAt: string | null
  createdAt: string
}

export interface FacultyVersionsPayload {
  generatedAt: string
  versions: FacultyVersionView[]
  note: string
}

export interface FacultyHomePayload {
  generatedAt: string
  pipeline: { stage: 'collected' | 'organized' | 'understood' | 'validated' | 'personalized'; headline: string; detail: string }[]
  inventory: {
    subjects: number
    topics: number
    concepts: number
    lessons: number
    questions: number
    pyqPatternQuestions: number
    flashcards: number
    cases: number
    simCases: number
    labImages: number
    learningModules: number
    edges: number
  }
  gaps: { all: number; critical: number; top: FacultyGapItem[] }
  quality: { all: number; open: number; critical: number; top: FacultyQualityItem[] }
  drafts: { counts: Partial<Record<FacultyDraftStatus, number>>; recent: FacultyDraftView[] }
  versions: { verified: number; recent: FacultyVersionView[] }
  recommendations: FacultyRecommendItem[]
  howItWorks: string[]
  dataBasis: string
  workspaceNote: string
  honestNote: string
}
