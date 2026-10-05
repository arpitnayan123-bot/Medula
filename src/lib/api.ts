'use client'

// Client-side API helpers — always relative paths (gateway-safe)

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.json()
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}`)
  return res.json()
}

import type {
  Profile, DashboardPayload, GraphPayload, ConceptDetail, QuestionClient, AttemptResult,
  RevisionPayload, ProgressPayload, RoadmapPayload, SearchResults,
  LearnHomeClient, CurriculumBrowsePayload, SubjectTopicsPayload,
  AtlasListPayload, PapersListPayload,
  TopicStudyPayload, SubjectStudyPayload, TopicProgressPayload, LearnStatus,
  HubTopicPayload, HubHomePayload,
  TutorContextPayload, TutorSessionSummary, TutorSessionDetail,
  AdaptiveConfig, AdaptiveHomePayload, AdaptiveSessionStart, AdaptiveAnswerFeedback,
  AdaptiveNextQuestion, AdaptiveReport,
  MistakeGenomePayload, MistakeListPayload, MistakeDetailPayload,
  MistakeMode, MistakeRetestQuestion, MistakeRetestResult, MistakeStatus,
  RevisionMode, RevisionBlockKind, RevisionSmartHome, RevisionSessionStart,
  RevisionSessionResume, RevisionBlockResult, RevisionSessionSummary, RevisionAiResponse,
  PlannerHome, PlannerPlanSaveResult, PlannerAiResponse,
  GraphHome, GraphSearchResult, GraphHub, GraphPath, GraphExplorePayload,
  GraphAiResponse, GraphFeedbackBody, GraphAiAction,
  SimHome, SimCaseDetail, SimActResponse, SimDebrief, SimAiResponse, SimAiMessage,
  LabHome, LabImageDetail, LabAttemptStart, LabActResponse, LabRapidStart, LabDebrief, LabAiResponse, LabMode, LabPin,
  VoiceHome, VoiceMode, VoiceStartResult, VoiceTurnResult, VoiceDebrief,
  ExamMode, ExamConfig, ExamHome, ExamStartResult, ExamAttemptState,
  ExamAnalysis, ExamReviewPayload, ExamAiAction, ExamAiResponse, ExamHistoryPayload,
  PerformancePayload, PerformanceAiAction, PerformanceAiResponse,
} from './types'

export const api = {
  getProfile: () => get<{ profile: Profile | null }>('/api/profile'),
  saveProfile: (p: Record<string, unknown>) => post<{ profile: Profile }>('/api/profile', p),
  dashboard: () => get<DashboardPayload>('/api/dashboard'),
  readiness: () => get<{
    overall: number
    band: string
    components: { key: string; label: string; weight: number; value: number; note: string; suggestion: string }[]
    focusSubjects: { code: string; name: string; readiness: number }[]
    dataBasis: { concepts: number; engaged: number; attemptsConsidered: number; activeDaysLast14: number }
    methodology: string
    disclaimer: string
  }>('/api/readiness'),
  understandComplete: (body: { topicId: string; title: string }) => post<{ ok: boolean }>('/api/understand/complete', body),
  graph: (scope: string) => get<GraphPayload>(`/api/graph?scope=${encodeURIComponent(scope)}`),
  concept: (id: string) => get<ConceptDetail>(`/api/concepts/${id}`),
  subjects: () => get<{ subjects: import('./types').SubjectSummary[] }>('/api/subjects'),
  subject: (id: string) => get<{ subject: import('./types').SubjectSummary; topics: import('./types').TopicSummary[] }>(`/api/subjects/${id}`),
  questions: (params: { subjectCode?: string; subjects?: string; system?: string; conceptId?: string; topicId?: string; count?: number; qtype?: string; mode?: string; mix?: 'random' | 'high-yield' | 'weak'; pair?: string }) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString()
    return get<{ questions: QuestionClient[] }>(`/api/questions?${q}`)
  },
  attempt: (body: { questionId: string; selected: string; timeMs?: number; confidence?: number }) =>
    post<AttemptResult>('/api/attempts', body),
  confusionPair: (id: string) =>
    get<{ pair: { id: string; a: string; b: string; aCode: string; bCode: string; aPoints: string[]; bPoints: string[]; mnemonic: string; subjectCode: string } }>(`/api/confusion-pairs?id=${encodeURIComponent(id)}`),
  logErrorType: (body: { questionId: string; errorType: string }) =>
    post<{ ok: boolean }>('/api/attempts/error-type', body),
  revision: () => get<RevisionPayload>('/api/revision'),
  reviewFlashcard: (body: { flashcardId: string; grade: number }) => post<{ ok: boolean }>('/api/revision/review', body),
  clearRevisionItem: (body: { conceptId: string; minutes: number }) => post<{ ok: boolean }>('/api/revision/clear', body),
  logSession: (body: { minutes: number; kind: string; label?: string }) => post<{ ok: boolean }>('/api/sessions', body),
  cases: () => get<{ cases: { id: string; title: string; specialty: string; system: string; difficulty: number; patient: { age: string; sex: string; occupation: string; complaint: string }; attempted: boolean; lastScore: number | null }[] }>('/api/cases'),
  caseDetail: (id: string) => get<{ id: string; title: string; specialty: string; system: string; difficulty: number; patient: Record<string, string>; steps: { id: string; phase: string; title: string; content: string[]; question?: string; options?: string[] }[]; learning: string[]; attempted: boolean; lastScore: number | null }>(`/api/cases/${id}`),
  caseStep: (id: string, body: { stepId: string; choice: number }) =>
    post<{ correct: boolean; answerId: number; teaching: string }>(`/api/cases/${id}/step`, body),
  caseComplete: (id: string, body: { correctSteps: number; totalSteps: number; detail: unknown[] }) =>
    post<{ score: number }>(`/api/cases/${id}/complete`, body),

  // ── Clinical Case Simulator (PRODUCT 09) ──
  simHome: () => get<SimHome>('/api/sim/home'),
  simCase: (id: string) =>
    get<{ case: SimCaseDetail; resume: { attemptId: string; stageIndex: number; mode: string; startedAt: string; events: unknown[] } | null }>(`/api/sim/cases/${id}`),
  simStart: (caseId: string, mode: 'guided' | 'ai') =>
    post<{ attemptId: string }>(`/api/sim/cases/${caseId}/attempt`, { mode }),
  simAct: (attemptId: string, body: { stageId: string; interactionId: string; chosen: string[] }) =>
    post<SimActResponse>(`/api/sim/attempt/${attemptId}/act`, body),
  simAdvance: (attemptId: string, body: { stageIndex: number }) =>
    post<{ ok: true }>(`/api/sim/attempt/${attemptId}/stage`, body),
  simComplete: (attemptId: string) =>
    post<SimDebrief>(`/api/sim/attempt/${attemptId}/complete`, {}),
  simAbandon: (attemptId: string) =>
    post<{ ok: true }>(`/api/sim/attempt/${attemptId}/abandon`, {}),
  simAi: (attemptId: string, body: { message: string; messages: SimAiMessage[] }) =>
    post<SimAiResponse>('/api/sim/ai', body),
  tutor: (body: { messages: { role: 'user' | 'assistant'; content: string }[]; mode: string; conceptId?: string; pairId?: string; topicId?: string; depth?: string }) =>
    post<{ reply: string; grounded?: { concepts: number; questions: number; cases: number } | null }>('/api/tutor', body),
  // ── AI Tutor (PRODUCT 03) ──
  // What the tutor knows about this student — weak areas, mistake patterns,
  // due revision, optional active-topic teaching context.
  tutorContext: (topicId?: string | null) =>
    get<TutorContextPayload>(`/api/tutor/context${topicId ? `?topicId=${encodeURIComponent(topicId)}` : ''}`),
  tutorSessions: () => get<{ sessions: TutorSessionSummary[] }>('/api/tutor/sessions'),
  tutorSession: (id: string) =>
    get<{ session: TutorSessionDetail }>(`/api/tutor/sessions?id=${encodeURIComponent(id)}`),
  saveTutorSession: (body: { id?: string; title: string; mode: string; topicId?: string; messages: { role: 'user' | 'assistant'; content: string }[] }) =>
    post<{ id: string }>('/api/tutor/sessions', body),
  deleteTutorSession: (id: string) =>
    fetch(`/api/tutor/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => r.json()) as Promise<{ ok: boolean }>,
  // Save AI-generated flashcards into the real SRS (Flashcard + due review).
  saveTutorFlashcards: (body: { cards: { front: string; back: string }[]; subjectCode?: string; conceptId?: string }) =>
    post<{ saved: number; reason?: string }>('/api/tutor/flashcards', body),
  drillComplete: (body: { pairId: string; probes: number }) =>
    post<{ ok: boolean; reason?: string; updated: { conceptId: string; mastery: number; status: string }[]; minutes?: number; label?: string }>('/api/tutor-drill', body),
  auditStart: () => post<import('./types').AuditPayload>('/api/audit', {}),
  auditSubmit: (body: { results: { questionId: string; selected: string }[] }) =>
    post<import('./types').AuditResultPayload>('/api/audit/submit', body),
  logbook: () => get<{ entries: import('./types').LogbookEntryClient[] }>('/api/logbook'),
  logbookCreate: (body: { caseType: string; system: string; diagnosis: string; learned: string }) =>
    post<{ entry: import('./types').LogbookEntryClient }>('/api/logbook', body),
  logbookDelete: (id: string) => fetch(`/api/logbook?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => r.json()) as Promise<{ ok: boolean }>,
  roadmap: () => get<RoadmapPayload>('/api/roadmap'),
  progress: () => get<ProgressPayload>('/api/progress'),
  mapInsights: () => get<import('@/app/api/map-insights/route').MapInsights>('/api/map-insights'),
  internship: () => get<import('@/app/api/internship/route').InternshipPayload>('/api/internship'),
  search: (q: string) => get<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),

  // ── LEARN engine ──
  // Learn homepage: personalized state + registry totals (never 500s — degraded
  // payloads carry `degraded: true`).
  learnHome: () => get<LearnHomeClient>('/api/learn/home'),
  // Without subjectId → full curriculum browse map; with subjectId → that
  // subject's topics with lesson coverage.
  learnCurriculum: (subjectId?: string): Promise<CurriculumBrowsePayload | SubjectTopicsPayload> =>
    subjectId
      ? get<SubjectTopicsPayload>(`/api/learn/curriculum?subject=${encodeURIComponent(subjectId)}`)
      : get<CurriculumBrowsePayload>('/api/learn/curriculum'),
  // 3D atlas assets (optional organ-system filter).
  learnAtlas: (system?: string) =>
    get<AtlasListPayload>(`/api/learn/atlas${system ? `?system=${encodeURIComponent(system)}` : ''}`),
  // Grounded research-paper explainers (optional field filter).
  learnPapers: (field?: string) =>
    get<PapersListPayload>(`/api/learn/papers${field ? `?field=${encodeURIComponent(field)}` : ''}`),
  // ── Learn study surfaces (PRODUCT 01) ──
  learnTopic: (id: string) => get<TopicStudyPayload>(`/api/learn/topic/${encodeURIComponent(id)}`),
  learnSubject: (id: string) => get<SubjectStudyPayload>(`/api/learn/subject/${encodeURIComponent(id)}`),
  learnTopicProgress: (topicId: string) => get<TopicProgressPayload>(`/api/learn/progress?topicId=${encodeURIComponent(topicId)}`),
  learnConceptProgress: (conceptId: string) =>
    get<{ conceptId: string; name: string; marked: string | null; markedAt: string | null; status: LearnStatus }>(`/api/learn/progress?conceptId=${encodeURIComponent(conceptId)}`),
  setLearnProgress: (body: { kind: 'topic' | 'concept'; entityId: string; status: string | null }) =>
    post<{ ok: boolean; status: string | null; cleared?: boolean }>('/api/learn/progress', body),

  // ── Topic Hub (PRODUCT 02 — ONE TOPIC, EVERYTHING) ──
  hubTopic: (id: string, conceptId?: string | null) =>
    get<HubTopicPayload>(`/api/hub/topic/${encodeURIComponent(id)}${conceptId ? `?concept=${encodeURIComponent(conceptId)}` : ''}`),
  hubHome: () => get<HubHomePayload>('/api/hub/home'),

  // ── Adaptive MCQ Engine (PRODUCT 04) ──
  // Shapes are the frozen contract in types.ts (Adaptive*). Saved-question and
  // AI payloads are typed defensively — the backend ships in parallel.
  adaptiveHome: () => get<AdaptiveHomePayload>('/api/adaptive/home'),
  startAdaptiveSession: (body: { config: AdaptiveConfig }) =>
    post<AdaptiveSessionStart>('/api/adaptive/session', body),
  answerAdaptive: (body: { sessionId: string; questionId: string; selected: string; timeMs: number; confidence: number; marked?: boolean }) =>
    post<AdaptiveAnswerFeedback>('/api/adaptive/answer', body),
  adaptiveAnswerType: (body: { sessionId: string; questionId: string; errorType: string }) =>
    post<{ ok: boolean }>('/api/adaptive/answer-type', body),
  nextAdaptive: (body: { sessionId: string }) =>
    post<AdaptiveNextQuestion>('/api/adaptive/next', body),
  completeAdaptive: (body: { sessionId: string }) =>
    post<AdaptiveReport>('/api/adaptive/complete', body),
  adaptiveAi: (body: { action: 'explain' | 'simplify' | 'similar' | 'harder' | 'easier' | 'weakness'; questionId?: string; conceptId?: string }) =>
    post<AdaptiveAiResponse>('/api/adaptive/ai', body),
  getSavedQuestions: () =>
    get<AdaptiveSavedPayload>('/api/adaptive/saved'),
  saveQuestion: (body: { questionId: string }) =>
    post<{ ok?: boolean; saved?: boolean }>('/api/adaptive/saved', body),
  // DELETE carries both id and questionId — the backend keys bookmarks by
  // profile+question, so questionId is the natural key; id kept as fallback.
  unsaveQuestion: (id: string) =>
    fetch(`/api/adaptive/saved?id=${encodeURIComponent(id)}&questionId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.json()) as Promise<{ ok?: boolean }>,
  reportAdaptiveQuestion: (body: { questionId: string; reason: string; detail?: string }) =>
    post<{ ok?: boolean }>('/api/adaptive/report-question', body),

  // ── Mistake Intelligence (PRODUCT 05) ──
  mistakeHome: () => get<MistakeGenomePayload>('/api/mistakes-intel/home'),
  mistakeList: (params: { mode: MistakeMode; subject?: string; type?: string; difficulty?: string }) => {
    const qs = new URLSearchParams({ mode: params.mode })
    if (params.subject) qs.set('subject', params.subject)
    if (params.type) qs.set('type', params.type)
    if (params.difficulty) qs.set('difficulty', params.difficulty)
    return get<MistakeListPayload>(`/api/mistakes-intel/list?${qs.toString()}`)
  },
  mistakeDetail: (id: string) =>
    get<MistakeDetailPayload>(`/api/mistakes-intel/detail?id=${encodeURIComponent(id)}`),
  mistakeAction: (body: { recordId: string; action: 'resolve' | 'revising' | 'reopen' }) =>
    post<{ ok: boolean; status: MistakeStatus }>('/api/mistakes-intel/action', body),
  mistakeRetest: (body: { recordId: string }) =>
    post<MistakeRetestQuestion>('/api/mistakes-intel/retest', body),
  mistakeRetestAnswer: (body: { recordId: string; selected: string; timeMs: number }) =>
    post<MistakeRetestResult>('/api/mistakes-intel/retest/answer', body),

  // ── Smart Revision Engine (PRODUCT 06) ──
  // Shapes are the frozen contract in types.ts (Revision*). The plan carries
  // ids only; block content is hydrated once per session (RevisionSessionContent).
  revisionHome: () => get<RevisionSmartHome>('/api/revision/smart/home'),
  startRevisionSession: (body: { mode: RevisionMode; minutes?: number; subjects?: string[]; kinds?: RevisionBlockKind[] }) =>
    post<RevisionSessionStart>('/api/revision/smart/session', body),
  resumeRevisionSession: (id: string) =>
    get<RevisionSessionResume>(`/api/revision/smart/session?id=${encodeURIComponent(id)}`),
  completeRevisionBlock: (body: { sessionId: string; blockId: string; minutes?: number }) =>
    post<RevisionBlockResult>('/api/revision/smart/block', body),
  completeRevisionSession: (body: { sessionId: string }) =>
    post<RevisionSessionSummary>('/api/revision/smart/complete', body),
  revisionAi: (body: { action: 'rapid-notes' | 'recall' | 'compare'; conceptId?: string; pairId?: string }) =>
    post<RevisionAiResponse>('/api/revision/smart/ai', body),

  // ── AI Personalized Study Planner (PRODUCT 07) ──
  plannerHome: (mode?: string) =>
    get<PlannerHome>(`/api/planner/home${mode ? `?mode=${encodeURIComponent(mode)}` : ''}`),
  savePlannerPlan: (body: {
    examDate?: string | null; examLabel?: string; targetNote?: string
    dailyMinutes?: number; weekdayMinutes?: number; weekendMinutes?: number; offDays?: string[]
  }) => post<PlannerPlanSaveResult>('/api/planner/plan', body),
  completePlannerTask: (body: { taskId: string; status: 'done' | 'skipped' }) =>
    post<{ ok: boolean }>('/api/planner/task', body),
  plannerAi: (action: 'why' | 'rebalance' | 'shrink' | 'realism' | 'next') =>
    post<PlannerAiResponse>('/api/planner/ai', { action }),

  // ── Medical Knowledge Graph (PRODUCT 08) ──
  graphHome: (recentIds?: string[]) =>
    get<GraphHome>(`/api/graph/home${recentIds?.length ? `?recent=${encodeURIComponent(recentIds.join(','))}` : ''}`),
  graphSearch: (q: string) =>
    get<GraphSearchResult>(`/api/graph/search?q=${encodeURIComponent(q)}`),
  graphHub: (id: string) =>
    get<GraphHub>(`/api/graph/hub?id=${encodeURIComponent(id)}`),
  graphPath: (id: string) =>
    get<GraphPath>(`/api/graph/path?id=${encodeURIComponent(id)}`),
  graphExplore: (subject?: string) =>
    get<GraphExplorePayload>(`/api/graph/explore${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`),
  graphAi: (body: { action: GraphAiAction; conceptId?: string; otherId?: string; edgeType?: string }) =>
    post<GraphAiResponse>('/api/graph/ai', body),
  graphFeedback: (body: GraphFeedbackBody) =>
    post<{ ok: boolean }>('/api/graph/feedback', body),

  // ── Medical Image Learning Lab (PRODUCT 10) ──
  labHome: () => get<LabHome>('/api/lab/home'),
  labImage: (id: string) =>
    get<LabImageDetail>(`/api/lab/images/${encodeURIComponent(id)}`),
  labStart: (imageId: string, mode: LabMode) =>
    post<LabAttemptStart>(`/api/lab/images/${encodeURIComponent(imageId)}/attempt`, { mode }),
  labAct: (attemptId: string, body: { stepId: string; chosen?: string | string[]; pin?: LabPin | null; aspect?: number; timeMs?: number }) =>
    post<LabActResponse>(`/api/lab/attempt/${encodeURIComponent(attemptId)}/act`, body),
  labStage: (attemptId: string, body: { stepIndex: number }) =>
    post<{ ok: boolean }>(`/api/lab/attempt/${encodeURIComponent(attemptId)}/stage`, body),
  labComplete: (attemptId: string) =>
    post<LabDebrief>(`/api/lab/attempt/${encodeURIComponent(attemptId)}/complete`, {}),
  labAbandon: (attemptId: string) =>
    post<{ ok: boolean }>(`/api/lab/attempt/${encodeURIComponent(attemptId)}/abandon`, {}),
  labRapidStart: (body: { modality?: string; subjectCode?: string }) =>
    post<LabRapidStart>('/api/lab/rapid', body),
  labAi: (body: { imageId: string; question: string }) =>
    post<LabAiResponse>('/api/lab/ai', body),

  // ── Medical Voice Tutor (PRODUCT 11) ──
  // Audio endpoints return raw bytes / plain JSON — fetched outside `get()`
  // so the TTS blob can be played directly.
  voiceHome: () => get<VoiceHome>('/api/voice/home'),
  voiceStart: (body: { mode: VoiceMode; topicId?: string } | { sessionId: string }) =>
    post<VoiceStartResult & { transcript?: { role: 'tutor' | 'student'; text: string; at: string }[] }>('/api/voice/session', body),
  voiceTurn: (sessionId: string, text: string) =>
    post<VoiceTurnResult>('/api/voice/turn', { sessionId, text }),
  voiceComplete: (sessionId: string) =>
    post<VoiceDebrief>('/api/voice/complete', { sessionId }),
  voiceTts: async (text: string): Promise<Blob> => {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`POST /api/voice/tts → ${res.status}`)
    return res.blob()
  },
  voiceAsr: async (audioBase64: string): Promise<string> => {
    const res = await fetch('/api/voice/asr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64 }),
    })
    if (!res.ok) throw new Error(`POST /api/voice/asr → ${res.status}`)
    const data = (await res.json()) as { text?: string }
    return (data.text ?? '').trim()
  },

  // ── Exam Simulator & Mock Test Lab (PRODUCT 12) ──
  // Grading and the answer key stay server-side until submit (contract in
  // types.ts). Bookmark + report-issue reuse the Adaptive Engine routes.
  examHome: () => get<ExamHome>('/api/exam/home'),
  examStart: (body: { config: ExamConfig }) => post<ExamStartResult>('/api/exam/start', body),
  examAttempt: (id: string) => get<ExamAttemptState>(`/api/exam/attempt/${encodeURIComponent(id)}`),
  examAnswer: (id: string, body: { questionId: string; selected: string | null; timeMs: number }) =>
    post<{ ok: true; answered: number }>(`/api/exam/attempt/${encodeURIComponent(id)}/answer`, body),
  examMark: (id: string, body: { questionId: string; marked: boolean }) =>
    post<{ ok: true; marked: boolean }>(`/api/exam/attempt/${encodeURIComponent(id)}/mark`, body),
  examSubmit: (id: string, body: { auto?: boolean }) =>
    post<ExamAnalysis>(`/api/exam/attempt/${encodeURIComponent(id)}/submit`, body),
  examAbandon: (id: string) =>
    post<{ ok: true }>(`/api/exam/attempt/${encodeURIComponent(id)}/abandon`, {}),
  examAnalysis: (id: string) => get<ExamAnalysis>(`/api/exam/analysis/${encodeURIComponent(id)}`),
  examReview: (id: string) => get<ExamReviewPayload>(`/api/exam/review/${encodeURIComponent(id)}`),
  examAi: (body: { action: ExamAiAction; attemptId: string }) => post<ExamAiResponse>('/api/exam/ai', body),
  examHistory: () => get<ExamHistoryPayload>('/api/exam/history'),

  // ── Performance & Readiness Intelligence (PRODUCT 13) ──
  // The unified performance profile (indicators · readiness · trends ·
  // weaknesses · strengths · insights · exam readiness) and its grounded
  // AI Analyst.
  performanceHome: () => get<PerformancePayload>('/api/performance/home'),
  performanceAi: (body: { action: PerformanceAiAction; question?: string }) =>
    post<PerformanceAiResponse>('/api/performance/ai', body),
}

// ── Adaptive Engine aux payloads (defined here — types.ts is frozen) ──
export interface AdaptiveAiTextResponse { text?: string }
export interface AdaptiveAiQuestionOption { id?: string; text: string }
export interface AdaptiveAiQuestionResult {
  stem: string
  options: (string | AdaptiveAiQuestionOption)[]
  answer: string
  explanation: string
  teaching: string
  difficulty: number
}
export interface AdaptiveAiQuestionResponse {
  question?: AdaptiveAiQuestionResult
  aiGenerated?: boolean
  disclaimer?: string
}
export type AdaptiveAiResponse = AdaptiveAiTextResponse & AdaptiveAiQuestionResponse

export interface AdaptiveSavedItem {
  id?: string
  questionId?: string
  stem?: string
  conceptName?: string
  subjectCode?: string
  savedAt?: string
  question?: { id?: string; stem?: string; conceptName?: string; subjectCode?: string }
}
export interface AdaptiveSavedPayload {
  saved?: AdaptiveSavedItem[]
  questions?: AdaptiveSavedItem[]
  items?: AdaptiveSavedItem[]
}
