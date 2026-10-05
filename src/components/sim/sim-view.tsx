'use client'

// ─── CLINICAL CASE SIMULATOR · ROOT (PRODUCT 09) ───
// «Learn the concept → encounter the patient → reason through the case →
// decide what to do.» State machine: home (library dashboard) → player
// (immersive case runner, incl. AI Case Mode) → debrief. Every number shown
// is measured from this profile's SimCaseAttempt rows by the deterministic
// engine — the answer key never reaches the client.

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, RefreshCw } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { SimCaseDetail, SimDebrief, SimHome } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EASE } from './sim-shared'
import { SimHomeScreen } from './sim-home'
import { SimPlayer } from './sim-player'
import { SimDebriefView } from './sim-debrief'

type Phase = 'home' | 'player' | 'debrief'
type LoadState = 'loading' | 'ready' | 'error'

interface PlayerSession {
  detail: SimCaseDetail
  resume: { attemptId: string; stageIndex: number; mode: string; startedAt: string; events: unknown[] } | null
}

export function SimView() {
  const simFocus = useAppStore((s) => s.simFocus)
  const closeSim = useAppStore((s) => s.closeSim)

  const [phase, setPhase] = useState<Phase>('home')
  const [home, setHome] = useState<SimHome | null>(null)
  const [homeState, setHomeState] = useState<LoadState>('loading')
  const [homeKey, setHomeKey] = useState(0)

  const [session, setSession] = useState<PlayerSession | null>(null)
  const [caseState, setCaseState] = useState<LoadState>('loading')
  const [debrief, setDebrief] = useState<SimDebrief | null>(null)
  // Pending case fetch {id, nonce} — nonce re-fetches the same case for
  // "Run the case again" (fresh fetch, fresh attempt).
  const [pending, setPending] = useState<{ id: string; nonce: number } | null>(null)

  // ── Data: home payload (state changes only inside promise callbacks) ──
  useEffect(() => {
    let alive = true
    api.simHome().then(
      (payload) => { if (alive) { setHome(payload); setHomeState('ready') } },
      () => { if (alive) setHomeState('error') },
    )
    return () => { alive = false }
  }, [homeKey])

  // ── Open a case: enter the player and fetch detail (+ any resumable attempt).
  // Only setState here — the fetch lives in the effect below so both the
  // event-handler path and the deep-link path share one code path. ──
  const openCase = useCallback((caseId: string) => {
    setDebrief(null)
    setSession(null)
    setCaseState('loading')
    setPhase('player')
    setPending((p) => ({ id: caseId, nonce: (p?.nonce ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    if (!pending) return
    let alive = true
    api.simCase(pending.id).then(
      (res) => { if (alive) { setSession({ detail: res.case, resume: res.resume }); setCaseState('ready') } },
      () => { if (alive) setCaseState('error') },
    )
    return () => { alive = false }
  }, [pending])

  // ── Deep-link hand-off (from Topic Hub / Knowledge Graph / Revision …):
  // render-time state adjustment (react.dev/learn/you-might-not-need-an-effect)
  // — comparing against the last-seen focus avoids setState-in-effect. ──
  const [lastFocus, setLastFocus] = useState(simFocus)
  if (simFocus !== lastFocus) {
    setLastFocus(simFocus)
    const caseId = simFocus?.caseId
    if (caseId) openCase(caseId)
  }

  // Clear the external focus channel once consumed (store update, effect-safe).
  useEffect(() => {
    if (simFocus) closeSim()
  }, [simFocus, closeSim])

  const backHome = useCallback(() => {
    setSession(null)
    setDebrief(null)
    setPhase('home')
    setHomeKey((k) => k + 1) // attempts may have started/completed — remeasure
  }, [])

  const runAgain = useCallback((caseId: string) => {
    openCase(caseId)
  }, [openCase])

  // ── Phase: player ──
  if (phase === 'player') {
    return (
      <div className="min-h-[60vh]">
        {caseState === 'loading' && <PlayerSkeleton caseTitle={undefined} />}
        {caseState === 'error' && (
          <CaseErrorCard
            onBack={backHome}
            onRetry={pending ? () => openCase(pending.id) : backHome}
          />
        )}
        {caseState === 'ready' && session && (
          <motion.div
            key={`player-${pending?.nonce ?? 0}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <SimPlayer
              detail={session.detail}
              resume={session.resume}
              onComplete={(d) => { setDebrief(d); setPhase('debrief') }}
              onExit={backHome}
            />
          </motion.div>
        )}
      </div>
    )
  }

  // ── Phase: debrief ──
  if (phase === 'debrief' && debrief) {
    return (
      <div className="min-h-[60vh]">
        <motion.div key={`debrief-${debrief.attemptId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
          <SimDebriefView
            debrief={debrief}
            onRunAgain={() => runAgain(debrief.caseId)}
            onBackToLibrary={backHome}
          />
        </motion.div>
      </div>
    )
  }

  // ── Phase: home (library) ──
  return (
    <div className="min-h-[60vh]">
      {homeState === 'loading' && <HomeSkeleton />}
      {homeState === 'error' && <HomeError onRetry={() => setHomeKey((k) => k + 1)} />}
      {homeState === 'ready' && home && (
        <motion.div key="sim-home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
          <SimHomeScreen home={home} onOpenCase={openCase} />
        </motion.div>
      )}
    </div>
  )
}

// ─── Loading / error skeletons (same pattern as Smart Revision) ───────────────

export function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-4 w-44 rounded-md" />
        <Skeleton className="shimmer h-9 w-80 max-w-full rounded-lg" />
        <Skeleton className="shimmer h-4 w-full max-w-md rounded-md" />
      </div>
      <Skeleton className="shimmer h-16 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="shimmer h-10 rounded-xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function PlayerSkeleton({ caseTitle }: { caseTitle?: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-4 w-36 rounded-md" />
        <Skeleton className="shimmer h-8 w-full max-w-sm rounded-lg" />
      </div>
      <Skeleton className="shimmer h-12 rounded-xl" />
      <Skeleton className="shimmer h-44 rounded-2xl" />
      {caseTitle === undefined && <Skeleton className="shimmer h-24 rounded-2xl" />}
    </div>
  )
}

function HomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load the case library</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The simulator service did not respond — it may still be warming up. Nothing is lost; your measured
          stats rebuild the moment it&apos;s back.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

function CaseErrorCard({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t open this case</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The case file did not arrive. Any attempt in progress is saved — you can pick it up from the library
          resume banner once the service responds.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="min-h-11" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back to library
          </Button>
          <Button className="min-h-11" onClick={onRetry}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </div>
      </div>
    </div>
  )
}
