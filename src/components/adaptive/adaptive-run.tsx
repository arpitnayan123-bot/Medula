'use client'

// ─── ADAPTIVE ENGINE · RUN SCREEN (PRODUCT 04) ───
// Minimal, exam-like, low-distraction. Practice modes grade instantly and
// surface explanation + error-intelligence + AI actions; ai-adaptive
// re-picks the NEXT question after every answer; exam mode hides feedback,
// runs a palette + mark-for-review, and grades on submit.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check, CheckCircle2,
  ChevronLeft, Flag, Landmark, Lightbulb, Loader2, ScanLine, Send, Sparkles, Target, Timer, XCircle,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { ADAPTIVE_MODES, ERROR_TYPES } from '@/lib/types'
import type { AdaptiveAnswerFeedback, AdaptiveQuestion, AdaptiveReport, AdaptiveSessionStart } from '@/lib/types'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AdaptiveAiPanel } from './adaptive-ai'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export interface RunExtras { markedIds: string[] }

interface AdaptiveRunProps {
  session: AdaptiveSessionStart
  startIndex: number // 0 for a fresh run; answered count when resumed
  totalOverride?: number // total from the home payload when resumed
  onComplete: (report: AdaptiveReport, extras: RunExtras) => void
  onQuit: () => void
  onDrillPyq: (conceptId: string) => void
}

function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function DifficultyDots({ n, className }: { n: number; className?: string }) {
  const d = Math.max(1, Math.min(3, n))
  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={`Difficulty ${d}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn('size-1.5 rounded-full', i <= d ? 'bg-foreground/70' : 'bg-foreground/15')} />
      ))}
    </span>
  )
}

// Small countdown ring for rapid-fire (per-question 45s)
function CountdownRing({ left, total }: { left: number; total: number }) {
  const size = 40
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, left / total))
  const urgent = left <= 10
  return (
    <span
      className={cn(
        'relative inline-grid size-10 place-items-center rounded-full text-xs font-bold tabular-nums',
        urgent ? 'animate-pulse bg-sev-crit/15 text-sev-crit' : 'bg-primary/10 text-primary',
      )}
      role="timer"
      aria-label={`${left} seconds left on this question`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-transparent" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={urgent ? 'stroke-sev-crit' : 'stroke-primary'}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      {left}
    </span>
  )
}

interface ExamAnswer { selected: string; correct?: boolean }
interface PendingAnswer { selected: string; timeMs: number }

export function AdaptiveRun({ session, startIndex, totalOverride, onComplete, onQuit, onDrillPyq }: AdaptiveRunProps) {
  const openConcept = useAppStore((s) => s.openConcept)
  const reduce = useReducedMotion()

  const isExam = session.mode === 'exam'
  const isRapid = session.mode === 'rapid'
  const isAiAdaptive = session.mode === 'ai-adaptive'
  const practice = !isExam

  const [queue, setQueue] = useState<AdaptiveQuestion[]>(session.questions)
  const [qIndex, setQIndex] = useState(startIndex)
  const [attempt, setAttempt] = useState<AdaptiveAnswerFeedback | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [errorType, setErrorType] = useState<string | null>(null)
  const [errorLogged, setErrorLogged] = useState(false)
  const [focusNote, setFocusNote] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)

  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [examAnswers, setExamAnswers] = useState<Record<string, ExamAnswer>>({})
  const [syncWarning, setSyncWarning] = useState(false)

  const [elapsed, setElapsed] = useState(0)
  const [rapidLeft, setRapidLeft] = useState(session.secondsPerQuestion ?? 45)
  const [examLeft, setExamLeft] = useState(session.totalSeconds ?? 0)

  const [quitOpen, setQuitOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [emptyQueue, setEmptyQueue] = useState(session.questions.length === 0)

  // Refs — stable across renders, used inside timers/effects
  const questionStartRef = useRef(Date.now())
  const attemptRef = useRef<AdaptiveAnswerFeedback | null>(null)
  const markedRef = useRef<Set<string>>(new Set())
  const pendingRef = useRef<Record<string, PendingAnswer>>({})
  const completingRef = useRef(false)
  const rapidLeftRef = useRef(session.secondsPerQuestion ?? 45)

  const total = totalOverride ?? queue.length
  const q = queue[qIndex]
  const modeLabel = ADAPTIVE_MODES.find((m) => m.id === session.mode)?.label ?? session.label

  const setMarkedBoth = (updater: (prev: Set<string>) => Set<string>) => {
    setMarked((prev) => {
      const next = updater(prev)
      markedRef.current = next
      return next
    })
  }

  const resetQuestionState = useCallback(() => {
    setAttempt(null)
    attemptRef.current = null
    setPickedId(null)
    setSubmitError(false)
    setErrorType(null)
    setErrorLogged(false)
    questionStartRef.current = Date.now()
    const perQ = session.secondsPerQuestion ?? 45
    setRapidLeft(perQ)
    rapidLeftRef.current = perQ
  }, [session.secondsPerQuestion])

  // ── Answering (practice: tap → immediate POST) ─────────────────────────────
  const answer = useCallback(
    async (question: AdaptiveQuestion, selectedId: string) => {
      if (attemptRef.current || submitting) return
      const timeMs = Date.now() - questionStartRef.current
      setSubmitting(true)
      setSubmitError(false)
      setPickedId(selectedId)
      try {
        const fb = await api.answerAdaptive({
          sessionId: session.sessionId,
          questionId: question.id,
          selected: selectedId,
          timeMs,
          confidence: 3,
          marked: markedRef.current.has(question.id),
        })
        attemptRef.current = fb
        setAttempt(fb)
        if (!fb.correct && fb.errorTypeSuggestion) setErrorType(fb.errorTypeSuggestion)
        if (fb.focusNote) setFocusNote(fb.focusNote)
        // TRUE adaptivity — replace the upcoming question from the engine
        if (isAiAdaptive && qIndex + 1 < queue.length) {
          try {
            const nxt = await api.nextAdaptive({ sessionId: session.sessionId })
            if (nxt.focusNote) setFocusNote(nxt.focusNote)
            if (nxt.question) {
              const replacement = nxt.question
              setQueue((prev) => prev.map((qq, i) => (i === qIndex + 1 ? replacement : qq)))
            }
          } catch {
            // replacement is best-effort — the pre-planned question stands
          }
        }
      } catch {
        setSubmitError(true)
      } finally {
        setSubmitting(false)
      }
    },
    [isAiAdaptive, qIndex, queue.length, session.sessionId, submitting],
  )

  // ── Exam: silent per-question sync on leave / submit ───────────────────────
  const flushOne = useCallback(
    async (questionId: string, pending: PendingAnswer) => {
      try {
        const fb = await api.answerAdaptive({
          sessionId: session.sessionId,
          questionId,
          selected: pending.selected,
          timeMs: pending.timeMs,
          confidence: 3,
          marked: markedRef.current.has(questionId),
        })
        setExamAnswers((prev) => (prev[questionId] ? { ...prev, [questionId]: { ...prev[questionId], correct: fb.correct } } : prev))
        delete pendingRef.current[questionId]
        setSyncWarning(false)
      } catch {
        setSyncWarning(true)
      }
    },
    [session.sessionId],
  )

  const flushAllPending = useCallback(async () => {
    const entries = Object.entries(pendingRef.current)
    for (const [qid, pending] of entries) {
      await flushOne(qid, pending)
    }
  }, [flushOne])

  const pickExam = (question: AdaptiveQuestion, selectedId: string) => {
    const timeMs = Date.now() - questionStartRef.current
    setExamAnswers((prev) => ({ ...prev, [question.id]: { selected: selectedId } }))
    pendingRef.current[question.id] = { selected: selectedId, timeMs }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  const complete = useCallback(async () => {
    if (completingRef.current) return
    completingRef.current = true
    setCompleting(true)
    setCompleteError(null)
    try {
      if (isExam) await flushAllPending()
      const report = await api.completeAdaptive({ sessionId: session.sessionId })
      onComplete(report, { markedIds: Array.from(markedRef.current) })
    } catch {
      setCompleteError("The engine couldn't grade this run — check your connection and submit again.")
      completingRef.current = false
      setCompleting(false)
    }
  }, [flushAllPending, isExam, onComplete, session.sessionId])

  const goToExam = (i: number) => {
    if (i === qIndex || !q) return
    if (pendingRef.current[q.id]) void flushOne(q.id, pendingRef.current[q.id])
    setQIndex(i)
    resetQuestionState()
  }

  const nextPractice = async () => {
    if (!q) return
    // Fresh runs carry the full queue — the end is local. Resumed runs and
    // exhausted queues ask the engine for the next question first.
    if (qIndex + 1 < queue.length) {
      setQIndex((i) => i + 1)
      resetQuestionState()
      return
    }
    if (!totalOverride) {
      void complete()
      return
    }
    setAdvancing(true)
    try {
      const nxt = await api.nextAdaptive({ sessionId: session.sessionId })
      if (nxt.question) {
        setQueue((prev) => [...prev, nxt.question!])
        setQIndex((i) => i + 1)
        resetQuestionState()
      } else {
        void complete()
      }
    } catch {
      setSubmitError(true)
    } finally {
      setAdvancing(false)
    }
  }

  const nextExam = () => {
    if (!q) return
    if (pendingRef.current[q.id]) void flushOne(q.id, pendingRef.current[q.id])
    if (qIndex + 1 >= queue.length) {
      setSubmitOpen(true)
      return
    }
    setQIndex((i) => i + 1)
    resetQuestionState()
  }

  const toggleMark = (questionId: string) => {
    setMarkedBoth((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const toggleSaved = (questionId: string) => {
    setSaved((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
        void api.unsaveQuestion(questionId).catch(() => {})
      } else {
        next.add(questionId)
        void api.saveQuestion({ questionId }).catch(() => {})
      }
      return next
    })
  }

  const pickErrorType = (question: AdaptiveQuestion, id: string) => {
    setErrorType(id)
    setErrorLogged(false)
    // Both surfaces: global error patterns + session-scoped report
    void api.logErrorType({ questionId: question.id, errorType: id }).catch(() => {})
    void api.adaptiveAnswerType({ sessionId: session.sessionId, questionId: question.id, errorType: id }).then(
      () => setErrorLogged(true),
      () => setErrorLogged(false),
    )
  }

  // ── Timers ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (emptyQueue || completing) return
    const iv = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(iv)
  }, [emptyQueue, completing])

  // Rapid: per-question countdown, auto-submit blank at zero
  useEffect(() => {
    if (!isRapid || emptyQueue || attempt || completing) return
    const iv = window.setInterval(() => {
      rapidLeftRef.current = Math.max(0, rapidLeftRef.current - 1)
      setRapidLeft(rapidLeftRef.current)
      if (rapidLeftRef.current === 0 && !attemptRef.current && q && !submitting) {
        void answer(q, '') // counts wrong — explanation still shows
      }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [isRapid, emptyQueue, attempt, completing, q, submitting, answer])

  // Exam: total countdown, auto-complete at zero
  useEffect(() => {
    if (!isExam || emptyQueue || completing) return
    const iv = window.setInterval(() => {
      setExamLeft((left) => {
        if (left <= 1) {
          void complete()
          return 0
        }
        return left - 1
      })
    }, 1000)
    return () => window.clearInterval(iv)
  }, [isExam, emptyQueue, completing, complete])

  // ── Keyboard: 1-4 / A-D pick · Enter next · Esc quit ──────────────────────
  // Handler lives in a ref (fresh every render) so the listener binds once —
  // no dep-array churn, and it always sees the latest state.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.isContentEditable)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setQuitOpen(true)
      return
    }
    if (!q || emptyQueue || completing) return
    const keys = ['1', '2', '3', '4', 'a', 'b', 'c', 'd']
    const idx = keys.indexOf(e.key.toLowerCase())
    if (idx >= 0) {
      const oi = idx % 4
      if (oi >= q.options.length) return
      const opt = q.options[oi]
      if (practice) {
        if (!attempt && !submitting) void answer(q, opt.id)
      } else {
        pickExam(q, opt.id)
      }
      return
    }
    if (e.key === 'Enter' && practice && attempt && !advancing) {
      void nextPractice()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const answeredCount = Object.keys(examAnswers).length
  const unanswered = Math.max(0, queue.length - answeredCount)

  // ─── RENDER: completing overlay ────────────────────────────────────────────
  if (completing) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 p-4 py-24 text-center md:p-6">
        <Loader2 className="size-8 animate-spin text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">Measuring your run…</h2>
        <p className="text-sm text-ink-soft">The engine is building your report.</p>
        {completeError && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-sev-crit">{completeError}</p>
            <Button className="min-h-11" onClick={() => void complete()}>
              Try grading again
            </Button>
          </div>
        )}
      </div>
    )
  }

  // ─── RENDER: empty queue (defensive — backend should never send one) ───────
  if (emptyQueue) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-sev-warn/10">
            <AlertTriangle className="size-6 text-sev-warn" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">No questions matched this run</h2>
          <p className="max-w-sm text-sm text-ink-soft">Try another mode or widen the filters — the bank grows as you unlock concepts.</p>
          <Button variant="outline" className="min-h-11" onClick={onQuit}>
            Back to the engine
          </Button>
        </div>
      </div>
    )
  }

  // ─── RENDER: run ───────────────────────────────────────────────────────────
  const progressLabel = total > 0 ? `Q ${Math.min(qIndex + 1, total)}/${total}` : `Q ${qIndex + 1}`

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      {/* ── Sticky top bar: quit · mode · progress · timer ── */}
      <div className="glass sticky top-16 z-20 space-y-2 rounded-2xl px-3 py-2.5 md:px-4">
        <div className="flex items-center gap-2">
          <AlertDialog open={quitOpen} onOpenChange={setQuitOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-9 shrink-0 gap-1 px-2 text-xs text-ink-soft">
                <ChevronLeft className="size-4" /> Quit
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave this run?</AlertDialogTitle>
                <AlertDialogDescription>
                  The run stays unfinished — answered questions and knowledge updates are already recorded, and the engine
                  will offer to resume from here.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep going</AlertDialogCancel>
                <AlertDialogAction onClick={onQuit}>Leave run</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              {modeLabel} · {total}
            </p>
            <p className="text-sm font-semibold tabular-nums">{progressLabel}</p>
          </div>

          {isExam ? (
            <>
              <button
                type="button"
                onClick={() => q && toggleMark(q.id)}
                aria-pressed={!!q && marked.has(q.id)}
                className={cn(
                  'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                  q && marked.has(q.id) ? 'border-sev-warn/50 bg-sev-warn/10 text-sev-warn' : 'border-line text-ink-soft hover:text-foreground',
                )}
              >
                <Flag className="size-3.5" />
                <span className="hidden sm:inline">{q && marked.has(q.id) ? 'Marked' : 'Mark'}</span>
              </button>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums',
                  examLeft <= 60 ? 'animate-pulse bg-sev-crit/15 text-sev-crit' : 'bg-primary/10 text-primary',
                )}
                role="timer"
                aria-label={`Time remaining ${fmtTime(examLeft)}`}
              >
                <Timer className="size-4" />
                {fmtTime(examLeft)}
              </span>
            </>
          ) : isRapid ? (
            <CountdownRing left={rapidLeft} total={session.secondsPerQuestion ?? 45} />
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs tabular-nums text-ink-soft">
              <Timer className="size-3.5" />
              {fmtTime(elapsed)}
            </span>
          )}
        </div>

        {/* Exam palette */}
        {isExam && (
          <div className="med-scroll grid auto-cols-9 grid-flow-col grid-rows-2 gap-1 overflow-x-auto pb-1" role="group" aria-label="Question palette">
            {queue.map((qq, i) => {
              const answeredQ = !!examAnswers[qq.id]
              const isMarked = marked.has(qq.id)
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => goToExam(i)}
                  aria-label={`Question ${i + 1}${answeredQ ? ' — answered' : ''}${isMarked ? ' — marked for review' : ''}`}
                  aria-current={i === qIndex ? 'true' : undefined}
                  className={cn(
                    'relative min-h-9 w-9 rounded-md border text-[9px] font-semibold transition-colors',
                    i === qIndex
                      ? 'border-primary bg-primary text-primary-foreground'
                      : answeredQ
                        ? 'border-sev-ok/50 bg-sev-ok/15 text-sev-ok'
                        : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40',
                  )}
                >
                  {i + 1}
                  {isMarked && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-sev-warn" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Focus note — quiet strip (ai-adaptive) */}
      {focusNote && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-xs font-medium text-ink-soft"
          role="status"
        >
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          {focusNote}
        </motion.p>
      )}

      {syncWarning && (
        <p className="flex items-center gap-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-4 py-2.5 text-xs font-medium text-sev-warn" role="alert">
          <AlertTriangle className="size-3.5 shrink-0" /> An answer didn&apos;t save — it will retry when you submit.
        </p>
      )}

      {/* ── Question card ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={q?.id ?? qIndex}
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {q && (
            <section className="clay space-y-5 rounded-2xl p-5 md:p-7">
              {/* WHY THIS ONE — the engine's honest reason */}
              {q.whyThis && (
                <p className="rounded-lg bg-surface-2/70 px-3.5 py-2.5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-ink-soft">
                  <span className="font-bold text-primary">Why this one</span>
                  {' — '}
                  {q.whyThis}
                </p>
              )}

              {/* Meta row + practice flag/bookmark */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <DifficultyDots n={q.difficulty} />
                {q.pyqPattern && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sev-warn">
                    <Landmark className="size-3" /> PYQ-pattern
                  </span>
                )}
                {q.imageBased && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-info">
                    <ScanLine className="size-3" /> Image-Based
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
                {practice && (
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSaved(q.id)}
                      aria-pressed={saved.has(q.id)}
                      aria-label={saved.has(q.id) ? 'Remove bookmark' : 'Bookmark this question'}
                      className={cn(
                        'grid size-9 place-items-center rounded-full border transition-colors',
                        saved.has(q.id) ? 'border-primary/50 bg-primary/10 text-primary' : 'border-line text-ink-soft hover:text-foreground',
                      )}
                    >
                      {saved.has(q.id) ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMark(q.id)}
                      aria-pressed={marked.has(q.id)}
                      aria-label={marked.has(q.id) ? 'Unflag question' : 'Flag for review'}
                      className={cn(
                        'grid size-9 place-items-center rounded-full border transition-colors',
                        marked.has(q.id) ? 'border-sev-warn/50 bg-sev-warn/10 text-sev-warn' : 'border-line text-ink-soft hover:text-foreground',
                      )}
                    >
                      <Flag className="size-4" />
                    </button>
                  </span>
                )}
              </div>

              {/* Stem */}
              <p className="text-lg font-medium leading-relaxed">{q.stem}</p>

              {/* Options */}
              <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
                {q.options.map((o, i) => {
                  const isSelected = !practice && examAnswers[q.id]?.selected === o.id
                  const isCorrectOne = attempt != null && o.id === attempt.answer
                  const isWrongPick = attempt != null && !attempt.correct && pickedId === o.id
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={(practice && (attempt != null || submitting)) || submitting}
                      onClick={() => (practice ? void answer(q, o.id) : pickExam(q, o.id))}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                        practice && attempt == null && !submitting && 'border-line bg-surface-2/40 hover:border-primary/50',
                        practice && submitting && 'border-line bg-surface-2/40 opacity-70',
                        isSelected && 'border-primary bg-primary/10',
                        isCorrectOne && 'border-sev-ok bg-sev-ok/10',
                        isWrongPick && 'border-sev-crit bg-sev-crit/10',
                        attempt != null && !isCorrectOne && !isWrongPick && 'border-line opacity-55',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                          isSelected && 'border-primary text-primary',
                          isCorrectOne && 'border-sev-ok text-sev-ok',
                          isWrongPick && 'border-sev-crit text-sev-crit',
                          !isSelected && !isCorrectOne && !isWrongPick && 'border-line text-ink-soft',
                        )}
                        title={`Shortcut: ${i + 1} or ${String.fromCharCode(65 + i)}`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">{o.text}</span>
                      {isCorrectOne && <CheckCircle2 className="size-4 shrink-0 text-sev-ok" />}
                      {isWrongPick && <XCircle className="size-4 shrink-0 text-sev-crit" />}
                    </button>
                  )
                })}
              </div>

              {/* ── Practice: verdict + explanation + error intelligence + AI ── */}
              {practice && (
                <>
                  {submitError && (
                    <p className="rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs text-sev-crit">
                      Couldn&apos;t record your attempt — check your connection and pick again.
                    </p>
                  )}

                  {attempt && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      {/* Verdict */}
                      <div
                        className={cn(
                          'flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold',
                          attempt.correct ? 'border-sev-ok/30 bg-sev-ok/10 text-sev-ok' : 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit',
                        )}
                      >
                        {attempt.correct ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
                        {attempt.correct ? 'Correct' : 'Incorrect'}
                        {!attempt.correct && (
                          <span className="font-normal text-ink-soft">
                            Correct answer: <span className="font-semibold text-foreground">{q.options.find((o) => o.id === attempt.answer)?.text ?? attempt.answer}</span>
                          </span>
                        )}
                      </div>

                      {/* Explanation + teaching */}
                      <div className="space-y-2.5 rounded-xl border border-line bg-surface-2/50 p-4">
                        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                          <CheckCircle2 className="size-4 text-primary" /> Explanation
                        </p>
                        <p className="text-sm leading-relaxed">{attempt.explanation}</p>
                        {attempt.teaching && (
                          <p className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm italic leading-relaxed">
                            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
                            <span>{attempt.teaching}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {q.conceptId && q.conceptName && (
                            <button
                              type="button"
                              onClick={() => openConcept(q.conceptId!)}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                            >
                              <Target className="size-3" /> Concept: {q.conceptName}
                            </button>
                          )}
                          {!!attempt.relatedPyqCount && attempt.relatedPyqCount > 0 && q.conceptId && (
                            <button
                              type="button"
                              onClick={() => onDrillPyq(q.conceptId!)}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-3 text-xs font-medium text-sev-warn transition-colors hover:bg-sev-warn/15"
                            >
                              <Landmark className="size-3" />
                              {attempt.relatedPyqCount} PYQ-pattern question{attempt.relatedPyqCount > 1 ? 's' : ''} on this concept → Practise
                            </button>
                          )}
                          {attempt.mastery != null && attempt.status && (
                            <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface-2 px-3 text-[11px] font-medium text-ink-soft">
                              mastery {attempt.mastery}% · <span className="ml-1 capitalize">{attempt.status}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Error intelligence — skippable */}
                      {!attempt.correct && (
                        <div className="space-y-3 rounded-xl border border-sev-crit/25 bg-sev-crit/5 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-sev-crit">Why did you miss this?</h4>
                            {errorLogged && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sev-ok">
                                <Check className="size-3" /> logged
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {ERROR_TYPES.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => pickErrorType(q, t.id)}
                                title={t.hint}
                                className={cn(
                                  'min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                  errorType === t.id
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-line bg-surface-2/60 text-ink-soft hover:border-primary/50 hover:text-foreground',
                                )}
                              >
                                {errorType === t.id && <Check className="mr-1 inline size-3" />}
                                {t.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-ink-soft">Optional — tagging builds your mistake profile. Skip if you prefer.</p>
                        </div>
                      )}

                      {/* AI actions */}
                      <AdaptiveAiPanel questionId={q.id} conceptId={q.conceptId} />

                      <Button size="lg" className="min-h-11 w-full font-semibold" disabled={advancing} onClick={() => void nextPractice()}>
                        {advancing ? (
                          <>
                            <Loader2 className="size-4 animate-spin" /> The engine is picking…
                          </>
                        ) : (
                          <>
                            NEXT <ArrowRight className="size-4" />
                          </>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </>
              )}

              {/* ── Exam: silent navigation ── */}
              {isExam && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button variant="outline" className="min-h-11" disabled={qIndex === 0} onClick={() => goToExam(qIndex - 1)}>
                    <ArrowLeft className="size-4" /> Prev
                  </Button>
                  <span className="text-xs text-ink-soft">{answeredCount}/{queue.length} answered</span>
                  {qIndex + 1 < queue.length ? (
                    <Button className="min-h-11" onClick={nextExam}>
                      Next <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <Button className="min-h-11 gap-1" onClick={() => setSubmitOpen(true)}>
                      <Send className="size-4" /> Submit
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Exam submit confirm */}
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this run?</AlertDialogTitle>
            <AlertDialogDescription>
              {unanswered > 0
                ? `${unanswered} of ${queue.length} questions are unanswered — unanswered questions score zero. The engine grades immediately.`
                : `All ${queue.length} questions answered. The engine grades immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={() => void complete()}>Submit &amp; grade</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Practice quit hint */}
      {practice && (
        <p className="text-center text-[11px] text-muted-foreground">
          Press <span className="font-semibold">1–4</span> or <span className="font-semibold">A–D</span> to answer,{' '}
          <span className="font-semibold">Enter</span> for the next question. Quitting keeps the run resumable.
        </p>
      )}
    </div>
  )
}
