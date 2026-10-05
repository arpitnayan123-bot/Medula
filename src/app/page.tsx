'use client'

import { useEffect, useState } from 'react'
import { readStoredSession, useAppStore, isAppView } from '@/lib/store'
import { AppShell } from '@/components/app-shell'
import { RegisterSW } from '@/components/pwa/register-sw'
import { LandingPage } from '@/components/landing/landing-page'
import { SignInView } from '@/components/auth/signin-view'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { DashboardView } from '@/components/dashboard/dashboard-view'
import { DoubtSearchView } from '@/components/search/doubt-search-view'
import { UnderstandView } from '@/components/understand/understand-view'
import { LearnView } from '@/components/learn/learn-view'
import { HubView } from '@/components/hub/hub-view'
import { QuestionsIndex } from '@/components/questions/questions-index'
import { AdaptiveView } from '@/components/adaptive/adaptive-view'
import { MistakeIntelligenceView } from '@/components/mistakes/mistake-intelligence-view'
import { SmartRevisionView } from '@/components/revision/smart-revision-view'
import { PlannerView } from '@/components/planner/planner-view'
import { GraphView } from '@/components/graph/graph-view'
import { SimView } from '@/components/sim/sim-view'
import { LabView } from '@/components/lab/lab-view'
import { ReviseView } from '@/components/revise/revise-view'
import { TutorView } from '@/components/tutor/tutor-view'
import { ProgressView } from '@/components/progress/progress-view'
import { RoadmapView } from '@/components/roadmap/roadmap-view'
import { ProfileView } from '@/components/profile/profile-view'
import { ConceptExplorer } from '@/components/concept/concept-explorer'
import { LearnStudyOverlay } from '@/components/learn/learn-study'
import { SearchOverlay } from '@/components/search/search-overlay'
import { ShortcutsOverlay } from '@/components/shortcuts/shortcuts-overlay'
import { AuditView } from '@/components/audit/audit-view'
import { ExploreView } from '@/components/explore/explore-view'
import { ResearchView } from '@/components/research/research-view'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const { view, setView, profile, researchSeedQuery, setResearchSeedQuery } = useAppStore()

  // Explore → other surfaces: hand the query to the Research Hub (seeded
  // search) and route to any app view the Explore view requests.
  const handleExploreNav = (target: string, payload?: string) => {
    if (target === 'research' && payload) setResearchSeedQuery(payload)
    if (isAppView(target)) setView(target)
  }

  // Capture the deep-link hash synchronously on first client render — the
  // landing-state effect below strips the hash before hydration resolves.
  // (One-time state, not a ref: it's read during render when handing the
  // hash to the sign-in view. It's never rendered to DOM, so no mismatch.)
  const [initialHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''))

  // Reset scroll whenever the view changes (SPA views share one scroll context)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    // Mirror app views to the URL hash so reloads / shared links restore the view.
    if (view === 'landing' || view === 'signin' || view === 'onboarding') {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    } else {
      const target = `#/${view}`
      if (window.location.hash !== target) window.history.replaceState(null, '', target)
    }
  }, [view])

  // Sign-in is ALWAYS an explicit user action. A stored session never
  // silently signs the doctor in — reloads and deep links with an active
  // session land on the sign-in page's one-tap "Welcome back" resume card
  // instead. The captured deep-link hash (#/learn) is handed to SignInView
  // so Continue resumes the linked view.
  useEffect(() => {
    if (!readStoredSession()) return
    setView('signin')
  }, [setView])

  const loaded = profile !== null
  // Render-gate: an app view without an explicit session must NEVER spin forever —
  // it means a stale deep-link or a landing CTA fired before sign-in. Show sign-in.
  const hasSession = readStoredSession() !== null

  // ── Landing / onboarding (standalone pages without shell) ──
  if (view === 'landing') return <LandingPage />
  if (view === 'signin') return <SignInView initialHash={initialHash || undefined} />
  if (view === 'onboarding') return <OnboardingWizard />

  // Wait for profile hydration before entering the app — but only when a session
  // actually exists; otherwise route to sign-in instead of a dead-end spinner.
  if (!loaded) {
    if (!hasSession) return <SignInView />
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span className="relative flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
            <span className="font-mono text-xl font-bold text-primary">M</span>
            <span className="absolute -right-1 -top-1 size-2.5 animate-pulse rounded-full bg-primary" />
          </span>
          <Loader2 className="size-4 animate-spin text-ink-soft" />
        </div>
      </div>
    )
  }

  // ── App views inside the shell ──
  return (
    <AppShell>
      <RegisterSW />
      {view === 'home' && <DashboardView />}
      {view === 'map' && <DoubtSearchView />}
      {view === 'explore' && <ExploreView onNavigate={handleExploreNav} />}
      {view === 'research' && <ResearchView initialQuery={researchSeedQuery ?? undefined} />}
      {view === 'understand' && <UnderstandView />}
      {view === 'learn' && <LearnView />}
      {view === 'hub' && <HubView />}
      {view === 'questions' && <QuestionsIndex />}
      {view === 'adaptive' && <AdaptiveView />}
      {view === 'mistakes' && <MistakeIntelligenceView />}
      {view === 'revision' && <SmartRevisionView />}
      {view === 'planner' && <PlannerView />}
      {view === 'graph' && <GraphView />}
      {view === 'cases' && <SimView />}
      {view === 'lab' && <LabView />}
      {view === 'revise' && <ReviseView />}
      {view === 'tutor' && <TutorView />}
      {view === 'progress' && <ProgressView />}
      {view === 'roadmap' && <RoadmapView />}
      {view === 'profile' && <ProfileView />}
      {/* Global overlays — Learn study first so the concept explorer stacks above it */}
      <LearnStudyOverlay />
      <ConceptExplorer />
      <SearchOverlay />
      <AuditView />
      <ShortcutsOverlay />
    </AppShell>
  )
}
