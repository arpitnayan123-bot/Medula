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
  | 'mistakes'
  | 'revision'
  | 'planner'
  | 'cases' | 'revise' | 'tutor' | 'progress' | 'roadmap' | 'profile'

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
