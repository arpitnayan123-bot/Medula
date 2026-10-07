'use client'

// ─── EXAM LAB · RUNNER (PRODUCT 12) ───
// The realistic exam experience: server-authoritative countdown, question
// palette, mark-for-review, answer changes (history kept server-side), and a
// deterministic +4/−1 grade at submit. Distraction-free BY DESIGN — no AI
// help, no explanations, no feedback until the paper is in.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Flag, Image as ImageIcon, Landmark, Loader2,
  LayoutGrid, LogOut, RefreshCw, ScanLine, Send, Timer, X,
} from 'lucide-react'

import { api } from '@/lib/api'
import type { ExamAnalysis, ExamAttemptState, ExamQuestion, ExamStartResult } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DifficultyDots, EASE, SCROLL_SLIM, formatClock } from './exam-shared'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ExamRunnerResume {
  state: ExamAttemptState
  /** Stored paper from sessionStorage. null → recovery card (paper is gone). */
  start: ExamStartResult | null
}

interface Props {
  start?: ExamStartResult | null
  resume?: ExamRunnerResume | null
  onSubmitted: (analysis: ExamAnalysis) => void
  onExit: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExamRunner({ start, resume, onSubmitted, onExit }: Props) {
  const reduce = useReducedMotion()
  const state = resume?.state ?? null
  const paper = start ?? resume?.start ?? null

  const attemptId = paper?.attemptId ?? state?.attemptId ?? ''
  const label = paper?.label ?? state?.label ?? 'Mock test'
  const negativeMark = paper?.negativeMark ?? state?.negativeMark ?? true
  const questions = paper?.questions ?? null
  const total = questions?.length ?? state?.total ?? 0
  const endsAtISO = paper?.endsAt ?? state?.endsAt ?? new Date().toISOString()

  // ── Answer sheet (seeded from a resume state when present) ──
  const [picks, setPicks] = useState<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {}
    for (const r of state?.responses ?? []) {
      const hist = Array.isArray(r.history) ? r.history : []
      out[r.questionId] = hist.length ? hist[hist.length - 1] : null
    }
    return out
  })
  const [marked, setMarked] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const r of state?.responses ?? []) if (r.marked) out[r.questionId] = true
    return out
  })
  const [visited, setVisited] = useState<Set<string>>(() => {
    const out = new Set<string>()
    for (const r of state?.responses ?? []) out.add(r.questionId)
    return out
  })

  const [qIndex, setQIndex] = useState(0)
  const [palettePanel, setPalettePanel] = useState(false) // desktop side panel
  const [paletteSheet, setPaletteSheet] = useState(false) // mobile bottom sheet
  const [submitOpen, setSubmitOpen] = useState(false)
  const [quitOpen, setQuitOpen] = useState(false)
  const [timeUpOpen, setTimeUpOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)
  const [syncError, setSyncError] = useState<{ retry: () => void } | null>(null)
  const [announce, setAnnounce] = useState('')

  const submittedRef = useRef(false)
  const lastAutoRef = useRef(false)
  const openedAtRef = useRef(Date.now())
  const announcedRef = useRef({ m5: false, m1: false })

  const q: ExamQuestion | null = questions?.[qIndex] ?? null
  const answeredCount = useMemo(() => Object.values(picks).filter((v) => v != null).length, [picks])
  const markedCount = useMemo(() => Object.values(marked).filter(Boolean).length, [marked])

  // ── Server-authoritative countdown ──
  const endsAtMs = useMemo(() => {
    const t = new Date(endsAtISO).getTime()
    return Number.isFinite(t) ? t : Date.now() + 60 * 60 * 1000
  }, [endsAtISO])
  const [leftSec, setLeftSec] = useState(() => Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000)))

  useEffect(() => {
    const iv = window.setInterval(() => {
      setLeftSec(Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000)))
    }, 1000)
    return () => window.clearInterval(iv)
  }, [endsAtMs])

  // Milestones announced once each — the visible timer is aria-live="off".
  useEffect(() => {
    if (leftSec <= 60 && !announcedRef.current.m1) {
      announcedRef.current.m1 = true
      setAnnounce('1 minute remaining')
    } else if (leftSec <= 300 && !announcedRef.current.m5) {
      announcedRef.current.m5 = true
      setAnnounce('5 minutes remaining')
    }
  }, [leftSec])

  // ── Submit (idempotent, guarded by ref) ──
  const doSubmit = useCallback(async (auto: boolean) => {
    if (submittedRef.current || !attemptId) return
    submittedRef.current = true
    lastAutoRef.current = auto
    setSubmitting(true)
    setSubmitFailed(false)
    try {
      const analysis = await api.examSubmit(attemptId, auto ? { auto: true } : {})
      onSubmitted(analysis)
    } catch {
      submittedRef.current = false
      setSubmitting(false)
      setSubmitFailed(true)
    }
  }, [attemptId, onSubmitted])

  // Auto-submit at zero — fires for expired resumes too (leftSec starts at 0).
  useEffect(() => {
    if (leftSec <= 0 && !submittedRef.current && attemptId) {
      setTimeUpOpen(true)
      void doSubmit(true)
    }
  }, [leftSec, doSubmit, attemptId])

  // ── Answer / clear / mark — recorded immediately, no feedback ──
  // (Local hoisted function declarations so the retry chain can re-invoke
  // itself without referencing the useCallback variable before declaration.)
  const attemptAnswer = useCallback((questionId: string, selected: string | null, timeMs: number) => {
    function send(): void {
      api.examAnswer(attemptId, { questionId, selected, timeMs }).catch(() => {
        setSyncError({
          retry: () => {
            setSyncError(null)
            send()
          },
        })
      })
    }
    send()
  }, [attemptId])

  const pick = useCallback((questionId: string, selected: string | null) => {
    const delta = Math.max(0, Date.now() - openedAtRef.current)
    setPicks((p) => ({ ...p, [questionId]: selected }))
    attemptAnswer(questionId, selected, delta)
  }, [attemptAnswer])

  const toggleMark = useCallback((questionId: string, current: boolean) => {
    function attempt(next: boolean): void {
      setMarked((m) => ({ ...m, [questionId]: next }))
      api.examMark(attemptId, { questionId, marked: next }).catch(() => {
        setMarked((m) => ({ ...m, [questionId]: current })) // honest revert
        setSyncError({ retry: () => { setSyncError(null); attempt(!current) } })
      })
    }
    attempt(!current)
  }, [attemptId])

  // ── Navigation: opening a question resets its clock + marks it visited ──
  useEffect(() => {
    openedAtRef.current = Date.now()
    const id = questions?.[qIndex]?.id
    if (id) setVisited((v) => (v.has(id) ? v : new Set(v).add(id)))
  }, [qIndex])

  const goTo = useCallback((i: number) => {
    setQIndex(Math.max(0, Math.min(total - 1, i)))
  }, [total])

  const step = useCallback((dir: 1 | -1) => {
    setQIndex((cur) => Math.max(0, Math.min(total - 1, cur + dir)))
  }, [total])

  const isLast = qIndex >= total - 1

  // ── Abandon ──
  const doAbandon = useCallback(async () => {
    try {
      await api.examAbandon(attemptId)
      onExit()
    } catch {
      setQuitOpen(false)
      setSyncError({ retry: () => { setSyncError(null); void doAbandon() } })
    }
  }, [attemptId, onExit])

  // ── Keyboard: ←/→ navigate · 1-4 pick (pattern from the adaptive engine) ──
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (submitOpen || quitOpen || timeUpOpen || submitting || paletteSheet) return
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.isContentEditable)) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); return }
    if (!q || !questions) return
    const keys = ['1', '2', '3', '4']
    const idx = keys.indexOf(e.key)
    if (idx >= 0 && idx < q.options.length) pick(q.id, q.options[idx].id)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const togglePalette = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setPalettePanel((v) => !v)
    } else {
      setPaletteSheet(true)
    }
  }, [])

  // ─── RENDER: recovery card (paper not in this browser — resume without it) ──
  if (!paper) {
    const recoveredAnswered = (state?.responses ?? []).filter((r) => (r.history ?? []).length > 0).length
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <RunnerBar
          label={label}
          qLabel={`— / ${total}`}
          leftSec={leftSec}
          negativeMark={negativeMark}
          markedCount={markedCount}
          onPalette={null}
        />
        <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-sev-warn/10">
            <AlertTriangle className="size-6 text-sev-warn" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">This attempt&apos;s paper is no longer in this browser</h2>
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            Your answers are safe on the server — {recoveredAnswered} of {total} answered. You can still submit
            this attempt for grading, or abandon it. Nothing will be graded if you abandon.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button className="clay-btn min-h-11" onClick={() => void doSubmit(leftSec <= 0)}>
              <Send className="size-4" aria-hidden /> Submit for grading
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => setQuitOpen(true)}>
              <LogOut className="size-4" aria-hidden /> Abandon
            </Button>
          </div>
          {syncError && <InlineError onRetry={syncError.retry} />}
        </div>
        <SubmitDialogs
          submitting={submitting}
          submitFailed={submitFailed}
          timeUpOpen={timeUpOpen}
          submitErrorRetry={() => void doSubmit(true)}
          onDismissFailure={() => setSubmitFailed(false)}
          onQuitOpenChange={setQuitOpen}
          quitOpen={quitOpen}
          onAbandon={() => void doAbandon()}
        />
      </div>
    )
  }

  if (!q || total === 0) return null

  // ─── RENDER: the paper ──
  const currentPick = picks[q.id] ?? null
  const currentMarked = !!marked[q.id]

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6 lg:max-w-6xl">
      <span className="sr-only" aria-live="polite">{announce}</span>

      <RunnerBar
        label={label}
        qLabel={`Q ${qIndex + 1}/${total}`}
        leftSec={leftSec}
        negativeMark={negativeMark}
        markedCount={markedCount}
        onPalette={togglePalette}
        onMark={() => toggleMark(q.id, currentMarked)}
        marked={currentMarked}
        onSubmit={() => setSubmitOpen(true)}
        onQuit={() => setQuitOpen(true)}
      />

      {paper.note && (
        <p className="rounded-xl border border-info/30 bg-info/10 px-4 py-2.5 text-xs font-medium text-info" role="status">
          {paper.note}
        </p>
      )}

      {syncError && <InlineError onRetry={syncError.retry} />}

      <div className={cn('grid gap-4', palettePanel && 'lg:grid-cols-[minmax(0,1fr)_280px]')}>
        {/* ── Question card ── */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={q.id}
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <section className="clay space-y-5 rounded-2xl p-5 md:p-7" aria-label={`Question ${qIndex + 1} of ${total}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <DifficultyDots n={q.difficulty} />
                  {q.pyqPattern && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sev-warn">
                      <Landmark className="size-3" aria-hidden /> PYQ pattern
                    </span>
                  )}
                  {q.imageBased && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-info">
                      <ScanLine className="size-3" aria-hidden /> Image-based
                    </span>
                  )}
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    {q.subjectCode}
                  </span>
                  {q.conceptName && (
                    <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                      {q.conceptName}
                    </span>
                  )}
                </div>

                <p className="text-lg font-medium leading-relaxed">{q.stem}</p>

                {q.imageUrl && (
                  <img
                    src={q.imageUrl}
                    alt="Question image"
                    className="max-h-64 w-full rounded-xl border border-line bg-surface-2/60 object-contain"
                    loading="lazy"
                  />
                )}

                <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
                  {q.options.map((o, i) => {
                    const selected = currentPick === o.id
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => pick(q.id, o.id)}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-line bg-surface-2/40 hover:border-primary/50',
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-line text-ink-soft',
                          )}
                          title={`Shortcut: ${i + 1}`}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{o.text}</span>
                        {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                      </button>
                    )
                  })}
                </div>

                {currentPick != null && (
                  <button
                    type="button"
                    onClick={() => pick(q.id, null)}
                    className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-ink-soft underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3.5" aria-hidden /> Clear response
                  </button>
                )}
              </section>
            </motion.div>
          </AnimatePresence>

          {/* ── Footer navigation ── */}
          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" className="min-h-11 gap-1" onClick={() => step(-1)} disabled={qIndex === 0}>
              <ChevronLeft className="size-4" aria-hidden /> Prev
            </Button>
            <Button
              className="clay-btn min-h-11 flex-1 gap-1"
              onClick={() => (isLast ? setSubmitOpen(true) : step(1))}
            >
              {isLast ? (
                <><Send className="size-4" aria-hidden /> Review &amp; Submit</>
              ) : (
                <>Save &amp; Next <ChevronRight className="size-4" aria-hidden /></>
              )}
            </Button>
          </div>
        </div>

        {/* ── Desktop palette side panel ── */}
        {palettePanel && (
          <aside className="sticky top-36 hidden self-start lg:block" aria-label="Question palette">
            <PaletteCard
              questions={questions!}
              picks={picks}
              marked={marked}
              visited={visited}
              qIndex={qIndex}
              onJump={(i) => goTo(i)}
              onClose={() => setPalettePanel(false)}
            />
          </aside>
        )}
      </div>

      {/* ── Mobile palette bottom sheet ── */}
      <Dialog open={paletteSheet} onOpenChange={setPaletteSheet}>
        <DialogContent
          className="bottom-0 top-auto left-0 h-auto max-h-[80dvh] w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl overflow-y-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Question palette</DialogTitle>
            <DialogDescription>Jump to any question</DialogDescription>
          </DialogHeader>
          <PaletteCard
            questions={questions!}
            picks={picks}
            marked={marked}
            visited={visited}
            qIndex={qIndex}
            onJump={(i) => { goTo(i); setPaletteSheet(false) }}
            onClose={() => setPaletteSheet(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Submit / quit / time-up dialogs + grading overlay ── */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Submit this test?</DialogTitle>
            <DialogDescription>
              {answeredCount} answered · {Math.max(0, total - answeredCount)} unattempted · {markedCount} marked for review
            </DialogDescription>
          </DialogHeader>
          <p className="flex items-start gap-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-sev-warn">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Unattempted and marked questions score 0{negativeMark ? ' — and wrong answers cost −1' : ''}.
          </p>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button className="clay-btn min-h-11" onClick={() => { setSubmitOpen(false); void doSubmit(false) }}>
              <Send className="size-4" aria-hidden /> Submit final
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubmitDialogs
        submitting={submitting}
        submitFailed={submitFailed}
        timeUpOpen={timeUpOpen}
        submitErrorRetry={() => void doSubmit(lastAutoRef.current)}
        onDismissFailure={() => setSubmitFailed(false)}
        quitOpen={quitOpen}
        onQuitOpenChange={setQuitOpen}
        onAbandon={() => void doAbandon()}
      />
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-2.5 text-xs font-medium text-sev-crit"
      role="alert"
    >
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">Something didn&apos;t reach the server — your answers are still on screen.</span>
      <Button variant="outline" size="sm" className="min-h-9 border-sev-crit/40 text-xs text-sev-crit" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

function RunnerBar({
  label, qLabel, leftSec, negativeMark, markedCount, onPalette, onMark, marked, onSubmit, onQuit,
}: {
  label: string
  qLabel: string
  leftSec: number
  negativeMark: boolean
  markedCount: number
  onPalette: (() => void) | null
  onMark?: () => void
  marked?: boolean
  onSubmit?: () => void
  onQuit?: () => void
}) {
  const tone = leftSec <= 60
    ? 'animate-pulse bg-sev-crit/15 text-sev-crit'
    : leftSec <= 300
      ? 'bg-sev-warn/12 text-sev-warn'
      : 'bg-primary/10 text-primary'
  return (
    <div className="glass sticky top-16 z-20 space-y-2 rounded-2xl px-3 py-2.5 md:px-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
          <p className="text-sm font-semibold tabular-nums">{qLabel}</p>
        </div>

        {negativeMark && (
          <span className="hidden shrink-0 rounded-full border border-sev-warn/30 bg-sev-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sev-warn sm:inline-flex">
            +4 / −1
          </span>
        )}
        {markedCount > 0 && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full border border-sev-warn/30 bg-sev-warn/10 px-2.5 py-1 text-[10px] font-bold tabular-nums text-sev-warn md:inline-flex">
            <Flag className="size-3" aria-hidden /> {markedCount}
          </span>
        )}

        {onMark && (
          <button
            type="button"
            onClick={onMark}
            aria-pressed={!!marked}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              marked ? 'border-sev-warn/50 bg-sev-warn/10 text-sev-warn' : 'border-line text-ink-soft hover:text-foreground',
            )}
          >
            <Flag className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{marked ? 'Marked' : 'Mark'}</span>
          </button>
        )}

        {onQuit && (
          <button
            type="button"
            onClick={onQuit}
            aria-label="Leave test"
            className="inline-grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:border-sev-crit/40 hover:text-sev-crit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        )}

        {onPalette && (
          <button
            type="button"
            onClick={onPalette}
            aria-label="Open question palette"
            className="inline-grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LayoutGrid className="size-4" aria-hidden />
          </button>
        )}

        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            aria-label="Submit test"
            className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Send className="size-4" aria-hidden />
          </button>
        )}

        <span
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums', tone)}
          role="timer"
          aria-label={`Time remaining ${formatClock(leftSec)}`}
          aria-live="off"
        >
          <Timer className="size-4" aria-hidden />
          {formatClock(leftSec)}
        </span>
      </div>
    </div>
  )
}

// ─── Palette (shared by side panel + bottom sheet) ────────────────────────────

type CellState = 'answered' | 'marked' | 'split' | 'visited' | 'unseen'

function PaletteCard({
  questions, picks, marked, visited, qIndex, onJump, onClose,
}: {
  questions: ExamQuestion[]
  picks: Record<string, string | null>
  marked: Record<string, boolean>
  visited: Set<string>
  qIndex: number
  onJump: (i: number) => void
  onClose: () => void
}) {
  const cellState = (i: number): CellState => {
    const qq = questions[i]
    const answered = picks[qq.id] != null
    const isMarked = !!marked[qq.id]
    if (answered && isMarked) return 'split'
    if (answered) return 'answered'
    if (isMarked) return 'marked'
    if (visited.has(qq.id)) return 'visited'
    return 'unseen'
  }

  const cellClass = (s: CellState) =>
    s === 'answered'
      ? 'border-primary bg-primary text-primary-foreground'
      : s === 'marked'
        ? 'border-sev-warn/60 bg-sev-warn/20 text-sev-warn'
        : s === 'visited'
          ? 'border-line bg-surface-2 text-foreground'
          : 'border-line/60 bg-surface-2/40 text-ink-soft/80'

  const LEGEND: { state: CellState; label: string }[] = [
    { state: 'answered', label: 'Answered' },
    { state: 'marked', label: 'Marked' },
    { state: 'split', label: 'Answered + marked' },
    { state: 'visited', label: 'Seen, unanswered' },
    { state: 'unseen', label: 'Not yet seen' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Question palette</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close palette"
          className="grid size-8 place-items-center rounded-full text-ink-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div
        className={cn('grid max-h-[46vh] grid-cols-6 gap-1.5 overflow-y-auto pb-1 sm:grid-cols-8 lg:max-h-[50vh] lg:grid-cols-5', SCROLL_SLIM)}
        role="group"
        aria-label="Jump to question"
      >
        {questions.map((qq, i) => {
          const s = cellState(i)
          const isCurrent = i === qIndex
          return (
            <button
              key={qq.id}
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}${s === 'answered' ? ' — answered' : s === 'marked' || s === 'split' ? ' — marked for review' : s === 'visited' ? ' — seen, unanswered' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'relative grid min-h-9 w-full min-w-9 place-items-center rounded-md border text-[10px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                cellClass(s),
                isCurrent && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
              )}
            >
              {i + 1}
              {s === 'split' && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-sev-warn" aria-hidden />}
            </button>
          )
        })}
      </div>
      <ul className="space-y-1.5 border-t border-line/70 pt-2.5" aria-label="Palette legend">
        {LEGEND.map((l) => (
          <li key={l.state} className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span className={cn('size-3 rounded-sm border', cellClass(l.state))} aria-hidden />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Submit-related dialogs + grading overlay (shared with recovery card) ─────

function SubmitDialogs({
  submitting, submitFailed, timeUpOpen, submitErrorRetry, onDismissFailure, quitOpen, onQuitOpenChange, onAbandon,
}: {
  submitting: boolean
  submitFailed: boolean
  timeUpOpen: boolean
  submitErrorRetry: () => void
  onDismissFailure: () => void
  quitOpen: boolean
  onQuitOpenChange: (v: boolean) => void
  onAbandon: () => void
}) {
  return (
    <>
      {/* Time is up — confirming dialog while auto-submit runs */}
      <Dialog open={timeUpOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Time is up — submitting your paper</DialogTitle>
            <DialogDescription>
              The server deadline passed. Your answer sheet is being handed in for grading exactly as it stands.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Grading failure */}
      <Dialog open={submitFailed && !submitting} onOpenChange={(v) => { if (!v) onDismissFailure() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grading didn&apos;t complete</DialogTitle>
            <DialogDescription>
              The server didn&apos;t confirm the submission. Nothing is lost — your answer sheet is intact. Try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="clay-btn min-h-11" onClick={submitErrorRetry}>
              <RefreshCw className="size-4" aria-hidden /> Submit again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grading overlay */}
      {submitting && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/85 p-4 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-lg font-semibold tracking-tight">Grading your paper…</p>
            <p className="max-w-xs text-sm text-ink-soft">
              The engine is recording attempts, updating knowledge states and building your analysis.
            </p>
          </div>
        </div>
      )}

      {/* Abandon confirmation */}
      <Dialog open={quitOpen} onOpenChange={onQuitOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abandon this test?</DialogTitle>
            <DialogDescription>Nothing will be graded. The attempt is closed and cannot be resumed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => onQuitOpenChange(false)}>Keep going</Button>
            <Button variant="destructive" className="min-h-11" onClick={onAbandon}>
              <LogOut className="size-4" aria-hidden /> Abandon test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
