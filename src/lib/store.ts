'use client'

import { create } from 'zustand'
import type { Profile, View } from './types'

// ── Last-view memory + hash deep links ─────────────────────────────────
// App views (inside the shell) persist to localStorage so sign-in can drop
// the doctor back where they left off, and mirror to the URL hash (#/map)
// so a reload keeps the same view.
export const APP_VIEWS: readonly View[] = [
  'home', 'map', 'explore', 'research', 'understand', 'learn', 'hub', 'questions', 'adaptive', 'mistakes', 'revision', 'planner', 'graph', 'cases', 'revise', 'tutor', 'progress', 'roadmap', 'profile',
] as const

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
    cases: 'the Case Simulator', revise: 'Revise', tutor: 'the AI Tutor',
    progress: 'Progress', roadmap: 'Roadmap', profile: 'Profile',
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
  researchSeedQuery: string | null // query handed from Explore → Research Hub
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
  setResearchSeedQuery: (q: string | null) => void
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
  researchSeedQuery: null,
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
  setResearchSeedQuery: (q) => set({ researchSeedQuery: q }),
}))
