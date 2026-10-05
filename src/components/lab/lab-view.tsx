'use client'

// ─── MEDICAL IMAGE LEARNING LAB · ROOT (PRODUCT 10) ───
// «See → Identify → Interpret → Reason → Learn → Practice.» State machine:
// home (library dashboard) → study (one image: viewer + guided reveal + AI
// panel + mode launchers) → player (the five graded runners) → debrief.
// Guided mode never leaves the study screen — it is the study screen's
// sequential reveal. Rapid Fire is scoped on the home banner and handed to
// the player as a rapidScope (the player owns the labRapidStart call, the
// timer and the quit-confirm). Every number is measured from this profile's
// LabAttempt rows by the deterministic engine — the answer key never reaches
// the client.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, RefreshCw } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { LabDebrief, LabImageDetail, LabHome, LabMode } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EASE } from './lab-shared'
import { LabHomeScreen } from './lab-home'
import { LabStudyScreen } from './lab-study'
import { LabPlayer } from './lab-player'
import type { LabPlayerMode } from './lab-player'
import { LabDebriefScreen } from './lab-debrief'

type Phase = 'home' | 'study' | 'player' | 'debrief'
type LoadState = 'loading' | 'ready' | 'error'

/** The four modes launched from the study screen (guided lives there, rapid is scoped). */
type GradedMode = Exclude<LabMode, 'guided' | 'rapid'>

type RapidScope = { modality?: string; subjectCode?: string }

interface PlaySession {
  key: number // bumps on every launch → fresh LabPlayer mount (no stale attempt state)
  mode: LabPlayerMode
  detail: LabImageDetail | null // graded modes carry the study detail; rapid carries null
  rapidScope: RapidScope | null
}

export function LabView() {
  const closeLab = useAppStore((s) => s.closeLab)

  const [phase, setPhase] = useState<Phase>('home')
  const [home, setHome] = useState<LabHome | null>(null)
  const [homeState, setHomeState] = useState<LoadState>('loading')
  const [homeKey, setHomeKey] = useState(0)
  const [rapidSignal, setRapidSignal] = useState(false)

  const [studyDetail, setStudyDetail] = useState<LabImageDetail | null>(null)
  const [studyState, setStudyState] = useState<LoadState>('loading')
  // Pending image fetch {imageId, nonce} — nonce re-fetches the same image
  // after a player round-trip (resume state changed server-side).
  const [pending, setPending] = useState<{ imageId: string; nonce: number } | null>(null)

  const [play, setPlay] = useState<PlaySession | null>(null)
  const [debrief, setDebrief] = useState<LabDebrief | null>(null)

  // ── Data: home payload (silent refresh — stale data stays visible) ──
  useEffect(() => {
    let alive = true
    api.labHome().then(
      (payload) => { if (alive) { setHome(payload); setHomeState('ready') } },
      () => { if (alive) setHomeState('error') },
    )
    return () => { alive = false }
  }, [homeKey])

  // ── Data: image detail for the study surface ──
  useEffect(() => {
    if (!pending) return
    let alive = true
    api.labImage(pending.imageId).then(
      (detail) => { if (alive) { setStudyDetail(detail); setStudyState('ready') } },
      () => { if (alive) setStudyState('error') },
    )
    return () => { alive = false }
  }, [pending])

  // ── Open one image → study (also used for replay + similar-image hand-offs).
  // Only setState here — the fetch lives in the effect above so the event,
  // retry and deep-link paths share one code path. ──
  const openImage = useCallback((imageId: string) => {
    setRapidSignal(false)
    setDebrief(null)
    setPlay(null)
    setStudyDetail(null)
    setStudyState('loading')
    setPhase('study')
    setPending((p) => ({ imageId, nonce: (p?.nonce ?? 0) + 1 }))
  }, [])

  // ── Deep-link hand-off (from Topic Hub / Knowledge Graph / Adaptive …):
  // implemented as a SUBSCRIPTION on the zustand store (the sanctioned
  // external-system pattern — no synchronous setState in the effect body,
  // which would cascade renders). A scheduled microtask covers the
  // mount-time case where openLab() fired before this screen existed.
  // The ref sentinel resets when the channel clears, so focusing the SAME
  // image again after consumption still fires. ──
  const lastFocusRef = useRef<string | null>(null)
  useEffect(() => {
    const consume = (id: string | null) => {
      if (id && id !== lastFocusRef.current) {
        lastFocusRef.current = id
        openImage(id)
        closeLab()
      } else if (!id) {
        lastFocusRef.current = null
      }
    }
    const t = window.setTimeout(() => {
      consume(useAppStore.getState().labFocus?.imageId ?? null)
    }, 0)
    const unsub = useAppStore.subscribe((s) => {
      consume(s.labFocus?.imageId ?? null)
    })
    return () => {
      window.clearTimeout(t)
      unsub()
    }
  }, [openImage, closeLab])

  // ── Navigation ──
  const goHome = useCallback(() => {
    setPlay(null)
    setDebrief(null)
    setStudyDetail(null)
    setPhase('home')
    setHomeKey((k) => k + 1) // attempts may have started/completed — remeasure
  }, [])

  const launchMode = useCallback((mode: GradedMode) => {
    if (!studyDetail) return
    setDebrief(null)
    setPlay((p) => ({ key: (p?.key ?? 0) + 1, mode, detail: studyDetail, rapidScope: null }))
    setPhase('player')
  }, [studyDetail])

  const resumeAttempt = useCallback(() => {
    const r = studyDetail?.resume
    if (!r || r.mode === 'rapid' || r.mode === 'guided') return
    const mode: LabPlayerMode = r.mode
    setDebrief(null)
    setPlay((p) => ({ key: (p?.key ?? 0) + 1, mode, detail: studyDetail, rapidScope: null }))
    setPhase('player')
  }, [studyDetail])

  // Rapid Fire from the home banner: the PLAYER performs labRapidStart with
  // this scope — the machine only threads it through (timer + quit-confirm
  // also live inside the player).
  const startRapid = useCallback((scope: RapidScope) => {
    setRapidSignal(false)
    setDebrief(null)
    setPlay((p) => ({ key: (p?.key ?? 0) + 1, mode: 'rapid', detail: null, rapidScope: scope }))
    setPhase('player')
  }, [])

  // Rapid Fire card on the study screen → back to the library with the rapid
  // banner highlighted (the scope picker lives on the banner).
  const requestRapidScope = useCallback(() => {
    setRapidSignal(true)
    setPhase('home')
    setHomeKey((k) => k + 1)
  }, [])

  const exitPlayer = useCallback(() => {
    if (play?.detail) {
      // Graded run → back to this image's study surface, refreshed (the
      // attempt was abandoned or completed server-side).
      openImage(play.detail.summary.id)
    } else {
      goHome() // rapid session → library
    }
  }, [play, openImage, goHome])

  // ── Phase: player ──
  if (phase === 'player' && play) {
    return (
      <div className="min-h-[60vh]">
        <motion.div
          key={`player-${play.key}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <LabPlayer
            detail={play.detail}
            mode={play.mode}
            resume={play.detail?.resume ?? null}
            rapidScope={play.rapidScope}
            onComplete={(d) => { setDebrief(d); setPlay(null); setPhase('debrief') }}
            onExit={exitPlayer}
          />
        </motion.div>
      </div>
    )
  }

  // ── Phase: study ──
  if (phase === 'study') {
    return (
      <div className="min-h-[60vh]">
        {studyState === 'loading' && <StudySkeleton />}
        {studyState === 'error' && (
          <StudyErrorCard
            onBack={goHome}
            onRetry={pending ? () => openImage(pending.imageId) : goHome}
          />
        )}
        {studyState === 'ready' && studyDetail && (
          <motion.div
            key={`study-${pending?.nonce ?? 0}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <LabStudyScreen
              detail={studyDetail}
              onBack={goHome}
              onLaunchMode={launchMode}
              onRapid={requestRapidScope}
              onResume={resumeAttempt}
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
        <motion.div
          key={`debrief-${debrief.attemptId}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <LabDebriefScreen
            debrief={debrief}
            onReplay={() => openImage(debrief.imageId)}
            onBackHome={goHome}
            onOpenImage={openImage}
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
        <motion.div key="lab-home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
          <LabHomeScreen
            home={home}
            onOpenImage={openImage}
            onStartRapid={startRapid}
            rapidSignal={rapidSignal}
          />
        </motion.div>
      )}
    </div>
  )
}

// ─── Loading / error states (same pattern as the Case Simulator) ─────────────

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-4 w-44 rounded-md" />
        <Skeleton className="shimmer h-9 w-80 max-w-full rounded-lg" />
        <Skeleton className="shimmer h-4 w-full max-w-md rounded-md" />
      </div>
      <Skeleton className="shimmer h-40 rounded-2xl" />
      <div className="flex flex-wrap gap-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-16 min-w-36 flex-1 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="shimmer h-10 rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function StudySkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-4 w-24 rounded-md" />
        <Skeleton className="shimmer h-8 w-full max-w-sm rounded-lg" />
        <div className="flex gap-1.5">
          <Skeleton className="shimmer h-5 w-20 rounded-full" />
          <Skeleton className="shimmer h-5 w-24 rounded-full" />
          <Skeleton className="shimmer h-5 w-16 rounded-full" />
        </div>
      </div>
      <Skeleton className="shimmer h-64 max-w-full rounded-2xl" />
      <Skeleton className="shimmer h-24 rounded-2xl" />
      <Skeleton className="shimmer h-36 rounded-2xl" />
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
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load the image library</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The lab service did not respond — it may still be warming up. Nothing is lost; your measured stats
          rebuild the moment it&apos;s back.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

function StudyErrorCard({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t open this image</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The image record did not arrive. Any attempt in progress is saved — you can pick it up from the
          library resume banner once the service responds.
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
