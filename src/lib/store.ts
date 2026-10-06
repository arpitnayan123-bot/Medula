'use client'

import { create } from 'zustand'
import type { Profile, View } from './types'

// ── Last-view memory + hash deep links ─────────────────────────────────
// App views (inside the shell) persist to localStorage so sign-in can drop
// the doctor back where they left off, and mirror to the URL hash (#/map)
// so a reload keeps the same view.
export const APP_VIEWS: readonly View[] = [
  'home', 'map', 'explore', 'research', 'understand', 'learn', 'hub', 'questions', 'adaptive', 'exam', 'mistakes', 'revision', 'planner', 'graph', 'performance', 'cases', 'lab', 'voice', 'revise', 'tutor', 'progress', 'roadmap', 'profile', 'library', 'ask', 'community',
] as const

// ── Resource Hub deep links (PRODUCT 14) ──────────────────────────────
// The library supports shareable deep links of the form #/library?topic=<id>
// (&?q=<query>) so a student studying a topic lands directly on that topic's
// resources. The view re-reads the full hash on mount; store focus covers
// in-app hand-offs (Topic Hub, Learn, dashboard) without a page reload.
export const LIBRARY_TOPIC_KEY = 'medula:library-topic'
export const LIBRARY_Q_KEY = 'medula:library-q'

export function parseLibraryHash(hash?: string): { topicId: string | null; q: string | null } {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!h.startsWith('#/library')) return { topicId: null, q: null }
  let topicId: string | null = null
  let q: string | null = null
  try {
    const qs = h.slice('#/library'.length).replace(/^\?/, '')
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=')
      const val = v ? decodeURIComponent(v) : null
      if (k === 'topic' && val) topicId = val
      if (k === 'q' && val) q = val
    }
  } catch { /* malformed hash — ignore */ }
  return { topicId, q }
}

export function writeLibraryHash(topicId: string | null, q: string | null): void {
  if (typeof window === 'undefined') return
  const qs = new URLSearchParams()
  if (topicId) qs.set('topic', topicId)
  if (q) qs.set('q', q)
  const target = qs.toString() ? `#/library?${qs.toString()}` : '#/library'
  try { window.history.replaceState(null, '', target) } catch { /* private mode */ }
}

// ── Topic Hub deep links ────────────────────────────────────────────────
// The hub supports shareable deep links of the form #/hub?topic=<id> (and
// ?concept=<id> when a search resolved a concept). page.tsx normalises the
// hash to #/hub, so the Topic Hub view re-reads the full hash on mount and
// also mirrors the resolved target into sessionStorage for reloads.
export const HUB_TOPIC_KEY = 'medula:hub-topic'
export const HUB_CONCEPT_KEY = 'medula:hub-concept'

export function parseHubHash(hash?: string): { topicId: string | null; conceptId: string | null } {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!h.startsWith('#/hub')) return { topicId: null, conceptId: null }
  let topicId: string | null = null
  let conceptId: string | null = null
  try {
    const qs = h.slice('#/hub'.length).replace(/^\?/, '')
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=')
      const val = v ? decodeURIComponent(v) : null
      if (k === 'topic' && val) topicId = val
      if (k === 'concept' && val) conceptId = val
    }
  } catch { /* malformed hash — ignore */ }
  return { topicId, conceptId }
}

export function writeHubHash(topicId: string, conceptId: string | null): void {
  if (typeof window === 'undefined') return
  const qs = new URLSearchParams({ topic: topicId })
  if (conceptId) qs.set('concept', conceptId)
  try { window.history.replaceState(null, '', `#/hub?${qs.toString()}`) } catch { /* private mode */ }
}

export function readHubKeys(): { topicId: string | null; conceptId: string | null } {
  if (typeof window === 'undefined') return { topicId: null, conceptId: null }
  let topicId: string | null = null
  let conceptId: string | null = null
  try { topicId = window.sessionStorage.getItem(HUB_TOPIC_KEY) } catch { /* private mode */ }
  try { conceptId = window.sessionStorage.getItem(HUB_CONCEPT_KEY) } catch { /* private mode */ }
  if (!topicId) {
    const fromHash = parseHubHash()
    topicId = fromHash.topicId
    conceptId = conceptId ?? fromHash.conceptId
  }
  return { topicId, conceptId }
}

export function writeHubKeys(topicId: string | null, conceptId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (topicId) window.sessionStorage.setItem(HUB_TOPIC_KEY, topicId)
    else window.sessionStorage.removeItem(HUB_TOPIC_KEY)
    if (conceptId) window.sessionStorage.setItem(HUB_CONCEPT_KEY, conceptId)
    else window.sessionStorage.removeItem(HUB_CONCEPT_KEY)
  } catch { /* private mode */ }
}

export const LAST_VIEW_KEY = 'medos:last-view'
export const SESSION_KEY = 'medos:session'

// ── Session flag ───────────────────────────────────────────────────────
// The demo backend has no cookies — GET /api/profile always returns the
// seeded account. To keep sign-in meaningful, the client records an
// explicit "session" in localStorage only after the user actually signs
// in (or finishes onboarding). A stored session NEVER silently signs the
// doctor in: reloads and deep links land on the sign-in page's explicit
// "Welcome back — Continue" gate (one tap, no password). Sessions expire
// after 30 days of inactivity; sign-out (or a fresh browser) starts from
// the landing page.
export type StoredSession = { account: 'demo' | 'new'; at: number }

// 30 days of inactivity — sign-in is never assumed forever, even in a demo.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (parsed?.account !== 'demo' && parsed?.account !== 'new') return null
    const at = typeof parsed.at === 'number' ? parsed.at : 0
    // Expired (or timestamp-less) sessions are indistinguishable from no session.
    if (!at || Date.now() - at > SESSION_TTL_MS) {
      window.localStorage.removeItem(SESSION_KEY)
      return null
    }
    return { account: parsed.account, at }
  } catch { return null }
}

export function writeStoredSession(account: 'demo' | 'new'): void {
  try { window.localStorage.setItem(SESSION_KEY, JSON.stringify({ account, at: Date.now() })) } catch { /* private mode */ }
}

export function clearStoredSession(): void {
  try { window.localStorage.removeItem(SESSION_KEY) } catch { /* private mode */ }
}

export function isAppView(v: string | null): v is View {
  return !!v && (APP_VIEWS as readonly string[]).includes(v)
}

export function readStoredView(): View | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LAST_VIEW_KEY)
    return isAppView(v) ? v : null
  } catch { return null }
}

export function viewFromHash(hash?: string): View | null {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!h) return null
  // Tolerate query params (e.g. #/hub?topic=x) — the param payload is
  // recovered by the target view itself via parseHubHash/readHubKeys.
  const m = /^#\/([a-z]+)(\?.*)?$/.exec(h)
  return isAppView(m?.[1] ?? null) ? (m![1] as View) : null
}

export function viewToLabel(v: View): string {
  const labels: Partial<Record<View, string>> = {
    home: 'Home', map: 'Doubt Search', explore: 'Explore Medicine', research: 'the Research Hub', understand: 'Understand Your Topic', learn: 'Learn', hub: 'the Topic Hub', questions: 'the Question Lab',
    adaptive: 'the Adaptive Engine',
    mistakes: 'Mistake Intelligence',
    revision: 'Smart Revision',
    planner: 'the Study Planner',
    graph: 'the Knowledge Graph',
    performance: 'Performance Intelligence',
    cases: 'the Case Simulator', lab: 'the Image Lab', revise: 'Revise', tutor: 'the AI Tutor',
    progress: 'Progress', roadmap: 'Roadmap', profile: 'Profile',
    voice: 'the Voice Tutor', exam: 'the Exam Lab', library: 'the Resource Hub',
    ask: 'the Ask Engine', community: 'Community',
  }
  return labels[v] ?? v
}

interface AppState {
  view: View
  profile: Profile | null
  hydrated: boolean
  loadingProfile: boolean
  conceptFocus: string | null // concept explorer target
  learnFocus: { kind: 'subject' | 'topic'; id: string } | null // Learn study surfaces (PRODUCT 01)
  hubFocus: { topicId: string; conceptId: string | null } | null // Topic Hub target (PRODUCT 02)
  searchOpen: boolean
  auditOpen: boolean
  shortcutsOpen: boolean // keyboard cheat-sheet overlay (?)
  mapScope: string | null // pending scope to apply in the map view (e.g. "subject:anatomy")
  quizPreset: { subjectCode?: string; system?: string; conceptId?: string; topicId?: string; count?: number; pairId?: string; pairLabel?: string } | null
  adaptivePreset: { mode?: import('./types').AdaptiveMode; subjectCode?: string; topicId?: string; conceptId?: string; count?: number; autoStart?: boolean } | null // Adaptive Engine hand-off (PRODUCT 04)
  simFocus: { caseId: string } | null // Case Simulator deep-link hand-off (PRODUCT 09)
  labFocus: { imageId: string } | null // Image Lab deep-link hand-off (PRODUCT 10)
  voicePreset: { mode: import('./types').VoiceMode; topicId?: string } | null // Voice Tutor hand-off (PRODUCT 11)
  examPreset: { mode?: import('./types').ExamMode; subjectCode?: string; topicId?: string; conceptId?: string; autoStart?: boolean } | null // Exam Lab hand-off (PRODUCT 12)
  researchSeedQuery: string | null // query handed from Explore → Research Hub
  libraryFocus: { topicId?: string; q?: string; nonce?: number } | null // Resource Hub deep-link hand-off (PRODUCT 14)
  askFocus: { q?: string; threadId?: string; nonce?: number } | null // Ask Engine hand-off (PRODUCT 15)
  communityFocus: { spaceId?: string; postId?: string; tab?: 'home' | 'groups' | 'accountability'; nonce?: number } | null // Community hand-off (PRODUCT 16)
  setView: (v: View) => void
  setProfile: (p: Profile | null) => void
  setHydrated: (v: boolean) => void
  openConcept: (id: string) => void
  closeConcept: () => void
  openLearn: (kind: 'subject' | 'topic', id: string) => void
  closeLearn: () => void
  openHub: (topicId: string, conceptId?: string | null) => void
  closeHub: () => void
  setSearchOpen: (v: boolean) => void
  setAuditOpen: (v: boolean) => void
  setShortcutsOpen: (v: boolean) => void
  setMapScope: (s: string | null) => void
  setQuizPreset: (p: AppState['quizPreset']) => void
  setAdaptivePreset: (p: AppState['adaptivePreset']) => void
  openSim: (caseId: string) => void
  closeSim: () => void
  openLab: (imageId: string) => void
  closeLab: () => void
  openVoice: (mode: import('./types').VoiceMode, topicId?: string) => void
  clearVoicePreset: () => void
  openExam: (preset?: { mode?: import('./types').ExamMode; subjectCode?: string; topicId?: string; conceptId?: string; autoStart?: boolean }) => void
  clearExamPreset: () => void
  setResearchSeedQuery: (q: string | null) => void
  openLibrary: (focus?: { topicId?: string; q?: string }) => void
  closeLibrary: () => void
  openAsk: (focus?: { q?: string; threadId?: string }) => void
  closeAsk: () => void
  openCommunity: (focus?: { spaceId?: string; postId?: string; tab?: 'home' | 'groups' | 'accountability' }) => void
  closeCommunity: () => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'landing',
  profile: null,
  hydrated: false,
  loadingProfile: true,
  conceptFocus: null,
  learnFocus: null,
  hubFocus: null,
  searchOpen: false,
  auditOpen: false,
  shortcutsOpen: false,
  mapScope: null,
  quizPreset: null,
  adaptivePreset: null,
  simFocus: null,
  labFocus: null,
  voicePreset: null,
  examPreset: null,
  researchSeedQuery: null,
  libraryFocus: null,
  askFocus: null,
  communityFocus: null,
  setView: (v) => {
    if (isAppView(v)) {
      try { window.localStorage.setItem(LAST_VIEW_KEY, v) } catch { /* private mode */ }
    }
    set({ view: v })
  },
  setProfile: (p) => set({ profile: p }),
  setHydrated: (v) => set({ hydrated: v }),
  openConcept: (id) => set({ conceptFocus: id }),
  closeConcept: () => set({ conceptFocus: null }),
  openLearn: (kind, id) => set({ learnFocus: { kind, id } }),
  closeLearn: () => set({ learnFocus: null }),
  openHub: (topicId, conceptId = null) => {
    writeHubKeys(topicId, conceptId)
    writeHubHash(topicId, conceptId)
    try { window.localStorage.setItem(LAST_VIEW_KEY, 'hub') } catch { /* private mode */ }
    set({ view: 'hub', hubFocus: { topicId, conceptId } })
  },
  closeHub: () => {
    writeHubKeys(null, null)
    set({ hubFocus: null })
  },
  setSearchOpen: (v) => set({ searchOpen: v }),
  setAuditOpen: (v) => set({ auditOpen: v }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  setMapScope: (s) => set({ mapScope: s }),
  setQuizPreset: (p) => set({ quizPreset: p }),
  setAdaptivePreset: (p) => set({ adaptivePreset: p }),
  openSim: (caseId) => set({ simFocus: { caseId }, view: 'cases' }),
  closeSim: () => set({ simFocus: null }),
  openLab: (imageId) => set({ labFocus: { imageId }, view: 'lab' }),
  closeLab: () => set({ labFocus: null }),
  openVoice: (mode, topicId) => set({ voicePreset: { mode, topicId }, view: 'voice' }),
  clearVoicePreset: () => set({ voicePreset: null }),
  openExam: (preset) => set({ examPreset: preset ?? { autoStart: false }, view: 'exam' }),
  clearExamPreset: () => set({ examPreset: null }),
  setResearchSeedQuery: (q) => set({ researchSeedQuery: q }),
  openLibrary: (focus) => {
    try {
      if (focus?.topicId) window.sessionStorage.setItem(LIBRARY_TOPIC_KEY, focus.topicId)
      else window.sessionStorage.removeItem(LIBRARY_TOPIC_KEY)
      if (focus?.q) window.sessionStorage.setItem(LIBRARY_Q_KEY, focus.q)
      else window.sessionStorage.removeItem(LIBRARY_Q_KEY)
    } catch { /* private mode */ }
    writeLibraryHash(focus?.topicId ?? null, focus?.q ?? null)
    try { window.localStorage.setItem(LAST_VIEW_KEY, 'library') } catch { /* private mode */ }
    // nonce re-triggers the view's focus effect for repeat hand-offs
    set({ view: 'library', libraryFocus: { ...focus, nonce: Date.now() } })
  },
  closeLibrary: () => set({ libraryFocus: null }),
  openAsk: (focus) => {
    try { window.localStorage.setItem(LAST_VIEW_KEY, 'ask') } catch { /* private mode */ }
    // nonce re-triggers the view's focus effect for repeat hand-offs
    set({ view: 'ask', askFocus: { ...focus, nonce: Date.now() } })
  },
  closeAsk: () => set({ askFocus: null }),
  openCommunity: (focus) => {
    try { window.localStorage.setItem(LAST_VIEW_KEY, 'community') } catch { /* private mode */ }
    // nonce re-triggers the view's focus effect for repeat hand-offs
    set({ view: 'community', communityFocus: { ...focus, nonce: Date.now() } })
  },
  closeCommunity: () => set({ communityFocus: null }),
}))
