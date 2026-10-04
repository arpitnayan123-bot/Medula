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
