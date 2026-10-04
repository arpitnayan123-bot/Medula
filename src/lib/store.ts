'use client'

import { create } from 'zustand'
import type { Profile, View } from './types'

// ── Last-view memory + hash deep links ─────────────────────────────────
// App views (inside the shell) persist to localStorage so sign-in can drop
// the doctor back where they left off, and mirror to the URL hash (#/map)
// so a reload keeps the same view.
export const APP_VIEWS: readonly View[] = [
  'home', 'map', 'explore', 'research', 'understand', 'learn', 'questions', 'cases', 'revise', 'tutor', 'progress', 'roadmap', 'profile',
] as const

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
  const m = /^#\/([a-z]+)$/.exec(h)
  return isAppView(m?.[1] ?? null) ? (m![1] as View) : null
}

export function viewToLabel(v: View): string {
  const labels: Partial<Record<View, string>> = {
    home: 'Home', map: 'Doubt Search', explore: 'Explore Medicine', research: 'the Research Hub', understand: 'Understand Your Topic', learn: 'Learn', questions: 'the Question Lab',
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
  searchOpen: boolean
  auditOpen: boolean
  shortcutsOpen: boolean // keyboard cheat-sheet overlay (?)
  mapScope: string | null // pending scope to apply in the map view (e.g. "subject:anatomy")
  quizPreset: { subjectCode?: string; system?: string; conceptId?: string; count?: number; pairId?: string; pairLabel?: string } | null
  researchSeedQuery: string | null // query handed from Explore → Research Hub
  setView: (v: View) => void
  setProfile: (p: Profile | null) => void
  setHydrated: (v: boolean) => void
  openConcept: (id: string) => void
  closeConcept: () => void
  openLearn: (kind: 'subject' | 'topic', id: string) => void
  closeLearn: () => void
  setSearchOpen: (v: boolean) => void
  setAuditOpen: (v: boolean) => void
  setShortcutsOpen: (v: boolean) => void
  setMapScope: (s: string | null) => void
  setQuizPreset: (p: AppState['quizPreset']) => void
  setResearchSeedQuery: (q: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'landing',
  profile: null,
  hydrated: false,
  loadingProfile: true,
  conceptFocus: null,
  learnFocus: null,
  searchOpen: false,
  auditOpen: false,
  shortcutsOpen: false,
  mapScope: null,
  quizPreset: null,
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
  setSearchOpen: (v) => set({ searchOpen: v }),
  setAuditOpen: (v) => set({ auditOpen: v }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  setMapScope: (s) => set({ mapScope: s }),
  setQuizPreset: (p) => set({ quizPreset: p }),
  setResearchSeedQuery: (q) => set({ researchSeedQuery: q }),
}))
