'use client'

// ─── EXAM LAB · ROOT (PRODUCT 12) ───
// «Simulate → Perform → Analyze → Fix → Retest». State machine:
// home (measured dashboard) → builder (custom configurator) → runner (the
// exam) → analysis (post-test intelligence) → review (every question) →
// history (performance tracking). Grading is always server-side.

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ClipboardList, Loader2, RefreshCw } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { ExamAnalysis, ExamConfig, ExamHome, ExamReviewPayload, ExamStartResult } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EASE } from './exam-shared'
import { ExamHomeScreen } from './exam-home'
import { ExamBuilder } from './exam-builder'
import { ExamRunner } from './exam-runner'
import type { ExamRunnerResume } from './exam-runner'
import { ExamAnalysisView } from './exam-analysis'
import { ExamReviewView } from './exam-review'
import { ExamHistoryView } from './exam-history'

type Phase = 'home' | 'builder' | 'runner' | 'analysis' | 'review' | 'history'
type LoadState = 'loading' | 'ready' | 'error'

interface BuilderSeed {
  subjectCodes?: string[]
  topicIds?: string[]
  conceptId?: string
}

// sessionStorage keeps the last start payload so a resume can re-enter the
// same paper. If it's gone (reload, new tab), the runner degrades to an
// honest recovery card — the attempt state lives on the server regardless.
const EXAM_START_KEY = 'medula:exam-start'

function storeStart(attemptId: string, start: ExamStartResult) {
  try {
    sessionStorage.setItem(EXAM_START_KEY, JSON.stringify({ attemptId, start }))
  } catch { /* storage unavailable — resume falls back to the recovery card */ }
}

function readStoredStart(attemptId: string): ExamStartResult | null {
  try {
    const raw = sessionStorage.getItem(EXAM_START_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { attemptId?: string; start?: ExamStartResult }
    return parsed.attemptId === attemptId && parsed.start ? parsed.start : null
  } catch {
    return null
  }
}

function clearStoredStart() {
  try {
    sessionStorage.removeItem(EXAM_START_KEY)
  } catch { /* ignore */ }
}

export function ExamView() {
  const examPreset = useAppStore((s) => s.examPreset)
  const clearExamPreset = useAppStore((s) => s.clearExamPreset)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)
  const setView = useAppStore((s) => s.setView)
  const openConcept = useAppStore((s) => s.openConcept)

  const [phase, setPhase] = useState<Phase>('home')
  const [home, setHome] = useState<ExamHome | null>(null)
  const [homeState, setHomeState] = useState<LoadState>('loading')
  const [homeKey, setHomeKey] = useState(0)

  const [builderSeed, setBuilderSeed] = useState<BuilderSeed | null>(null)

  const [run, setRun] = useState<ExamStartResult | null>(null)
  const [resumeRun, setResumeRun] = useState<ExamRunnerResume | null>(null)
  const [startState, setStartState] = useState<'idle' | 'starting' | 'error'>('idle')
  const [startError, setStartError] = useState<'error' | 'conflict' | 'resume'>('error')
  // Last-started config for the runner error-card retry (state, not a ref:
  // beginStart fires from the guarded render-time preset adjustment below and
  // refs must not be touched during render — react-hooks/refs).
  const [lastConfig, setLastConfig] = useState<ExamConfig | null>(null)

  const [analysis, setAnalysis] = useState<ExamAnalysis | null>(null)
  const [analysisState, setAnalysisState] = useState<LoadState>('ready')
  const [analysisPending, setAnalysisPending] = useState<{ id: string; nonce: number } | null>(null)

  const [review, setReview] = useState<ExamReviewPayload | null>(null)
  const [reviewState, setReviewState] = useState<LoadState>('ready')

  // ── Data: home payload (state changes only inside promise callbacks) ──
  useEffect(() => {
    let alive = true
    api.examHome().then(
      (payload) => { if (alive) { setHome(payload); setHomeState('ready') } },
      () => { if (alive) setHomeState('error') },
    )
    return () => { alive = false }
  }, [homeKey])

  // ── Start a test (event handler + deep-link path share this) ──
  const beginStart = useCallback((config: ExamConfig) => {
    setLastConfig(config)
    setAnalysis(null)
    setReview(null)
    setRun(null)
    setResumeRun(null)
    setStartError('error')
    setStartState('starting')
    setPhase('runner')
    api.examStart({ config }).then(
      (res) => {
        storeStart(res.attemptId, res)
        setRun(res)
        setStartState('idle')
      },
      (err) => {
        setStartError(err instanceof Error && err.message.includes('409') ? 'conflict' : 'error')
        setStartState('error')
      },
    )
  }, [])

  // ── Resume an in-progress attempt: fresh state from the server + stored paper ──
  const beginResume = useCallback((attemptId: string) => {
    setAnalysis(null)
    setReview(null)
    setRun(null)
    setResumeRun(null)
    setStartError('error')
    setStartState('starting')
    setPhase('runner')
    api.examAttempt(attemptId).then(
      (state) => {
        setResumeRun({ state, start: readStoredStart(attemptId) })
        setStartState('idle')
      },
      () => {
        setStartError('resume')
        setStartState('error')
      },
    )
  }, [])

  // ── Analysis by attempt id (from recent tests / history) ──
  const openAnalysis = useCallback((attemptId: string) => {
    setAnalysis(null)
    setReview(null)
    setAnalysisState('loading')
    setPhase('analysis')
    setAnalysisPending((p) => ({ id: attemptId, nonce: (p?.nonce ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    if (!analysisPending) return
    let alive = true
    api.examAnalysis(analysisPending.id).then(
      (res) => { if (alive) { setAnalysis(res); setAnalysisState('ready') } },
      () => { if (alive) setAnalysisState('error') },
    )
    return () => { alive = false }
  }, [analysisPending])

  // ── Full review of the current analysis ──
  const openReview = useCallback(() => {
    if (!analysis) return
    setReview(null)
    setReviewState('loading')
    setPhase('review')
    api.examReview(analysis.attemptId).then(
      (res) => { setReview(res); setReviewState('ready') },
      () => { setReviewState('error') },
    )
  }, [analysis])

  // ── Deep-link hand-off (from Adaptive / Concept / Hub / dashboard):
  // render-time state adjustment against the last-seen preset, exactly like
  // sim-view. mode ≠ custom with autoStart fires immediately; filters seed
  // the builder. (Pure setState only — beginStart stores its config in
  // state, so no ref is touched during render.) ──
  const [lastFocus, setLastFocus] = useState(examPreset)
  if (examPreset !== lastFocus) {
    setLastFocus(examPreset)
    const p = examPreset
    if (p) {
      const hasFilters = !!(p.subjectCode || p.topicId || p.conceptId)
      if (p.mode && p.mode !== 'custom' && p.autoStart) {
        beginStart({
          mode: p.mode,
          subjectCodes: p.subjectCode ? [p.subjectCode] : undefined,
          topicIds: p.topicId ? [p.topicId] : undefined,
          conceptId: p.conceptId,
        })
      } else if (p.mode === 'custom' || hasFilters) {
        setBuilderSeed({
          subjectCodes: p.subjectCode ? [p.subjectCode] : undefined,
          topicIds: p.topicId ? [p.topicId] : undefined,
          conceptId: p.conceptId,
        })
        setPhase('builder')
      }
    }
  }

  // Clear the external preset channel once consumed (store update, effect-safe).
  useEffect(() => {
    if (examPreset) clearExamPreset()
  }, [examPreset, clearExamPreset])

  const backHome = useCallback(() => {
    setRun(null)
    setResumeRun(null)
    setAnalysis(null)
    setReview(null)
    setBuilderSeed(null)
    setPhase('home')
    setHomeKey((k) => k + 1) // attempts may have started/completed — remeasure
  }, [])

  // ── Runner completions ──
  const onSubmitted = useCallback((res: ExamAnalysis) => {
    clearStoredStart()
    setRun(null)
    setResumeRun(null)
    setAnalysis(res)
    setAnalysisState('ready')
    setAnalysisPending(null)
    setPhase('analysis')
    setHomeKey((k) => k + 1)
  }, [])

  const onExit = useCallback(() => {
    clearStoredStart()
    backHome()
  }, [backHome])

  // ── Phase: runner ──
  if (phase === 'runner') {
    return (
      <div className="min-h-[60vh]">
        {startState === 'starting' && <StartingPaper />}
        {startState === 'error' && (
          <StartErrorCard
            kind={startError}
            onBack={backHome}
            onRetry={() => {
              if (lastConfig) beginStart(lastConfig)
              else backHome()
            }}
          />
        )}
        {startState === 'idle' && run && (
          <motion.div key={`run-${run.attemptId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
            <ExamRunner start={run} onSubmitted={onSubmitted} onExit={onExit} />
          </motion.div>
        )}
        {startState === 'idle' && resumeRun && (
          <motion.div key={`resume-${resumeRun.state.attemptId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
            <ExamRunner resume={resumeRun} onSubmitted={onSubmitted} onExit={onExit} />
          </motion.div>
        )}
      </div>
    )
  }

  // ── Phase: builder ──
  if (phase === 'builder') {
    return (
      <div className="min-h-[60vh]">
        {homeState !== 'ready' && (
          homeState === 'loading'
            ? <HomeSkeleton />
            : <HomeError onRetry={() => setHomeKey((k) => k + 1)} />
        )}
        {homeState === 'ready' && home && (
          <motion.div key="exam-builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
            <ExamBuilder home={home} seed={builderSeed} onStart={beginStart} onBack={backHome} />
          </motion.div>
        )}
      </div>
    )
  }

  // ── Phase: analysis ──
  if (phase === 'analysis') {
    return (
      <div className="min-h-[60vh]">
        {analysisState === 'loading' && <AnalysisSkeleton />}
        {analysisState === 'error' && (
          <AnalysisErrorCard
            onBack={backHome}
            onRetry={analysisPending ? () => openAnalysis(analysisPending.id) : backHome}
          />
        )}
        {analysisState === 'ready' && analysis && (
          <motion.div key={`analysis-${analysis.attemptId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
            <ExamAnalysisView
              analysis={analysis}
              onOpenReview={openReview}
              onRetest={beginStart}
              onHome={backHome}
              onHistory={() => { setPhase('history') }}
              onDrillTopic={(topicId) => {
                setAdaptivePreset({ mode: 'weakness', topicId, count: 10 })
                setView('adaptive')
              }}
              onOpenConcept={openConcept}
            />
          </motion.div>
        )}
      </div>
    )
  }

  // ── Phase: review ──
  if (phase === 'review') {
    return (
      <div className="min-h-[60vh]">
        {reviewState === 'loading' && <AnalysisSkeleton title="Opening the answer key…" />}
        {reviewState === 'error' && (
          <ReviewErrorCard
            onBack={() => { setPhase('analysis') }}
            onRetry={openReview}
          />
        )}
        {reviewState === 'ready' && review && (
          <motion.div key={`review-${review.attemptId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
            <ExamReviewView payload={review} onBack={() => { setPhase('analysis') }} />
          </motion.div>
        )}
      </div>
    )
  }

  // ── Phase: history ──
  if (phase === 'history') {
    return (
      <div className="min-h-[60vh]">
        <ExamHistoryView onBack={backHome} onOpenAnalysis={openAnalysis} />
      </div>
    )
  }

  // ── Phase: home (dashboard) ──
  return (
    <div className="min-h-[60vh]">
      {homeState === 'loading' && <HomeSkeleton />}
      {homeState === 'error' && <HomeError onRetry={() => setHomeKey((k) => k + 1)} />}
      {homeState === 'ready' && home && (
        <motion.div key="exam-home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
          <ExamHomeScreen
            home={home}
            onStart={beginStart}
            onResume={beginResume}
            onOpenHistory={() => { setPhase('history') }}
            onOpenAnalysis={openAnalysis}
            onOpenBuilder={() => { setBuilderSeed(null); setPhase('builder') }}
          />
        </motion.div>
      )}
    </div>
  )
}

// ─── Loading / error skeletons (same pattern as the Case Simulator) ───────────

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-4 w-44 rounded-md" />
        <Skeleton className="shimmer h-9 w-56 max-w-full rounded-lg" />
        <Skeleton className="shimmer h-4 w-full max-w-md rounded-md" />
      </div>
      <Skeleton className="shimmer h-12 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-44 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function StartingPaper() {
  return (
    <div className="flex flex-col items-center gap-4 p-4 py-28 text-center" role="status" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <h2 className="text-lg font-semibold tracking-tight">Setting your paper…</h2>
      <p className="max-w-sm text-sm text-ink-soft">
        The engine is sampling questions, sealing the answer key and starting the clock.
      </p>
    </div>
  )
}

function AnalysisSkeleton({ title }: { title?: string }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="clay flex flex-col items-center gap-4 rounded-2xl p-6 md:flex-row md:p-8">
        <Skeleton className="shimmer size-32 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="shimmer h-4 w-40 rounded-md" />
          <Skeleton className="shimmer h-9 w-44 rounded-lg" />
          <Skeleton className="shimmer h-4 w-full max-w-sm rounded-md" />
          {title && <p className="text-xs text-ink-soft">{title}</p>}
        </div>
      </div>
      <Skeleton className="shimmer h-32 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function HomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load the Exam Lab</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The exam service did not respond — it may still be warming up. Nothing is lost; any attempt in progress
          is safe on the server.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden /> Retry
        </Button>
      </div>
    </div>
  )
}

function StartErrorCard({ kind, onBack, onRetry }: { kind: 'error' | 'conflict' | 'resume'; onBack: () => void; onRetry: () => void }) {
  const title = kind === 'conflict'
    ? 'You already have a test in progress'
    : kind === 'resume'
      ? 'Couldn\u2019t reopen that attempt'
      : 'Couldn\u2019t start the test'
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          {kind === 'conflict' ? <ClipboardList className="size-6 text-sev-crit" aria-hidden /> : <RefreshCw className="size-6 text-sev-crit" aria-hidden />}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          {kind === 'conflict'
            ? 'Only one paper can run at a time. Head back to the Exam Lab and resume it from the banner — or finish it first.'
            : 'The server didn\u2019t confirm. Nothing is graded and nothing is lost — try again.'}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="min-h-11" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden /> Back to Exam Lab
          </Button>
          {kind === 'error' && (
            <Button className="min-h-11" onClick={onRetry}>
              <RefreshCw className="size-4" aria-hidden /> Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function AnalysisErrorCard({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load this analysis</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The graded report did not arrive. Your score and every record of the test are safe on the server.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="min-h-11" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden /> Back to Exam Lab
          </Button>
          <Button className="min-h-11" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReviewErrorCard({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t open the answer key</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The review payload did not arrive. Your analysis is still available from the previous screen.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="outline" className="min-h-11" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden /> Back to analysis
          </Button>
          <Button className="min-h-11" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
        </div>
      </div>
    </div>
  )
}
