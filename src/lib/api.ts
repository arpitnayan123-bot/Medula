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
  tutor: (body: { messages: { role: 'user' | 'assistant'; content: string }[]; mode: string; conceptId?: string; pairId?: string }) =>
    post<{ reply: string }>('/api/tutor', body),
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
}
