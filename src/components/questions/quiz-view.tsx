'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Crosshair,
  FlaskConical,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  Target,
  Timer,
  X,
  XCircle,
  Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { ERROR_TYPES, SYSTEMS } from '@/lib/types'
import type { AttemptResult, QuestionClient, SubjectSummary } from '@/lib/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

// ─── Local types ─────────────────────────────────────────────────────────────

type Phase = 'config' | 'run' | 'results'
type RunStatus = 'loading' | 'active' | 'empty' | 'error'
type LoadState = 'loading' | 'ready' | 'error'

interface RunParams {
  subjectCode?: string
  system?: string
  conceptId?: string
  topicId?: string
  count?: number
  qtype?: string
  pairId?: string
  pairLabel?: string
}

interface ResultEntry {
  questionId: string
  correct: boolean
  selected: string
  timeMs: number
  stem: string
  answerText: string
  teaching: string
  difficulty: number
  qtype: string
  conceptId?: string
}

interface QuizPresetParams {
  subjectCode?: string
  system?: string
  conceptId?: string
  topicId?: string
  count?: number
  pairId?: string
  pairLabel?: string
}

// Confusion-pair debrief payload (mirrors /api/confusion-pairs)
interface PairDebriefData {
  id: string
  a: string
  b: string
  aCode: string
  bCode: string
  aPoints: string[]
  bPoints: string[]
  mnemonic: string
  subjectCode: string
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const MODES: { value: '' | 'rapid' | 'vignette'; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'rapid', label: 'Rapid recall' },
  { value: 'vignette', label: 'Clinical vignettes' },
]

const DIFF_LABELS: Record<number, string> = { 1: 'Easy', 2: 'Moderate', 3: 'Hard' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function qtypeLabel(t: string): string {
  if (t === 'rapid') return 'Rapid recall'
  if (t === 'vignette') return 'Clinical vignette'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function resolveAnswerText(q: QuestionClient, answerId: string): string {
  return q.options.find((o) => o.id === answerId)?.text ?? answerId
}

// ─── Primitives ──────────────────────────────────────────────────────────────

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

function FocusBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
      <Target className="size-4 shrink-0 text-primary" />
      <p className="leading-snug">
        <span className="font-semibold text-primary">Focused practice</span>
        <span className="text-ink-soft"> — drilling questions linked to </span>
        <span className="font-medium">{label}</span>
      </p>
    </div>
  )
}

function PairBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-sev-warn/40 bg-sev-warn/10 px-4 py-3 text-sm">
      <Zap className="size-4 shrink-0 text-sev-warn" />
      <p className="leading-snug">
        <span className="font-semibold text-sev-warn">Confusion-pair drill</span>
        <span className="text-ink-soft"> — separating </span>
        <span className="font-medium">{label}</span>
      </p>
    </div>
  )
}

// Your-side error pattern: how the run's misses split across the pair's two halves
interface PairErrorPattern {
  aTotal: number
  aWrong: number
  bTotal: number
  bWrong: number
}

function PairDebrief({
  pair,
  errorPattern,
  onDrillAgain,
  onViewProgress,
  onSocraticDrill,
}: {
  pair: PairDebriefData
  errorPattern: PairErrorPattern | null
  onDrillAgain: () => void
  onViewProgress: () => void
  onSocraticDrill: () => void
}) {
  const hasTries = !!errorPattern && errorPattern.aTotal + errorPattern.bTotal > 0
  const aWrong = errorPattern?.aWrong ?? 0
  const bWrong = errorPattern?.bWrong ?? 0
  const diagnosis = !hasTries
    ? null
    : aWrong === 0 && bWrong === 0
      ? 'Both sides clean this run — the distinction is holding.'
      : aWrong > bWrong
        ? `Your slips lean toward the “${pair.a}” side — start the table from that column.`
        : bWrong > aWrong
          ? `Your slips lean toward the “${pair.b}” side — start the table from that column.`
          : 'Misses split evenly across both sides — drill the mnemonic below.'
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="clay space-y-4 rounded-2xl p-5 md:p-7"
      aria-label="Confusion-pair debrief"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="size-4 shrink-0 text-sev-warn" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">
          The distinction, side by side
        </h2>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary">
          {pair.subjectCode}
        </span>
      </div>

      {/* YOUR error pattern — which side of the pair actually hurts */}
      {hasTries && errorPattern && (
        <div className="rounded-xl border border-sev-warn/30 bg-sev-warn/5 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Crosshair className="size-3.5 shrink-0 text-sev-warn" />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sev-warn">
              Your error pattern — this run
            </p>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {(
              [
                { side: pair.a, total: errorPattern.aTotal, wrong: errorPattern.aWrong, dot: 'bg-primary/70', bar: 'bg-primary' },
                { side: pair.b, total: errorPattern.bTotal, wrong: errorPattern.bWrong, dot: 'bg-sev-warn/70', bar: 'bg-sev-warn' },
              ] as const
            ).map((row) => {
              const wrongPct = row.total > 0 ? Math.round((row.wrong / row.total) * 100) : 0
              return (
                <div key={row.side} className="rounded-lg bg-surface-2/60 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold leading-tight">
                    <span className={cn('size-1.5 shrink-0 rounded-full', row.dot)} />
                    <span className="truncate">{row.side}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-ink-soft">
                      {row.total > 0 ? `${row.total - row.wrong}/${row.total} clean` : 'not tested'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <motion.div
                      className={cn('h-full rounded-full', row.bar)}
                      initial={{ width: 0 }}
                      animate={{ width: `${wrongPct}%` }}
                      transition={{ duration: 0.7, ease: EASE }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] leading-tight text-ink-soft">
                    {row.total === 0
                      ? 'No questions from this side in this run'
                      : row.wrong === 0
                        ? 'No misses on this side'
                        : `${row.wrong} miss${row.wrong > 1 ? 'es' : ''} on this side`}
                  </p>
                </div>
              )
            })}
          </div>
          {diagnosis && (
            <p className="mt-2.5 text-xs font-medium leading-snug text-ink-soft">{diagnosis}</p>
          )}
        </div>
      )}

      {/* a vs b comparison */}
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-2">
          <div className="bg-primary/15 px-3 py-2.5 text-center text-sm font-bold leading-tight tracking-tight text-primary">
            {pair.a}
          </div>
          <div className="border-l border-line bg-sev-warn/15 px-3 py-2.5 text-center text-sm font-bold leading-tight tracking-tight text-sev-warn">
            {pair.b}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
          <ul className="space-y-2 p-3.5">
            {pair.aPoints.map((pt) => (
              <li key={pt} className="flex gap-2 text-xs leading-snug text-ink-soft">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
                {pt}
              </li>
            ))}
          </ul>
          <ul className="space-y-2 p-3.5">
            {pair.bPoints.map((pt) => (
              <li key={pt} className="flex gap-2 text-xs leading-snug text-ink-soft">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sev-warn/70" />
                {pt}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* mnemonic */}
      {pair.mnemonic && (
        <div className="flex items-start gap-2 rounded-lg bg-accent/60 px-3.5 py-2.5">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-sev-warn" />
          <p className="text-xs italic leading-relaxed text-ink-soft">{pair.mnemonic}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="min-h-10 gap-1.5 text-xs font-semibold" onClick={onSocraticDrill}>
          <Brain className="size-3.5" /> Socratic AI drill on this pair
        </Button>
        <Button variant="outline" className="min-h-10 gap-1.5 text-xs font-semibold" onClick={onDrillAgain}>
          <RefreshCw className="size-3.5" /> Drill this pair again
        </Button>
        <Button variant="outline" className="min-h-10 gap-1.5 text-xs font-semibold" onClick={onViewProgress}>
          <ArrowRight className="size-3.5" /> All pairs on Progress
        </Button>
      </div>
    </motion.section>
  )
}

function ScoreRing({
  value,
  size,
  stroke,
  gradientId,
  children,
}: {
  value: number
  size: number
  stroke: number
  gradientId: string
  children?: ReactNode
}) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5cb491" />
            <stop offset="100%" stopColor="#16788c" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.3, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ─── Loading / error / empty states ──────────────────────────────────────────

function ConfigSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" role="status">
      <Skeleton className="shimmer h-10 w-56 rounded-lg" />
      <Skeleton className="shimmer h-4 w-80 rounded-md" />
      <div className="clay space-y-6 rounded-2xl p-5 md:p-7">
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="shimmer h-16 rounded-xl" />
          <Skeleton className="shimmer h-16 rounded-xl" />
        </div>
        <Skeleton className="shimmer h-16 rounded-xl" />
        <Skeleton className="shimmer h-12 rounded-xl" />
        <Skeleton className="shimmer h-12 rounded-xl" />
      </div>
    </div>
  )
}

function RunSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" role="status">
      <Skeleton className="shimmer h-6 w-40 rounded-md" />
      <div className="clay space-y-5 rounded-2xl p-5 md:p-7">
        <Skeleton className="shimmer h-4 w-48 rounded-md" />
        <Skeleton className="shimmer h-6 w-full rounded-md" />
        <Skeleton className="shimmer h-6 w-4/5 rounded-md" />
        <div className="space-y-2.5 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="shimmer min-h-11 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="shimmer h-11 w-full rounded-lg" />
      </div>
    </div>
  )
}

function LoadErrorCard({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
        <AlertTriangle className="size-6 text-sev-crit" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{message}</h2>
      <p className="max-w-sm text-sm text-ink-soft">
        The engine did not respond. Check your connection and try again — nothing is lost.
      </p>
      <Button variant="outline" className="min-h-11" onClick={onRetry}>
        <RefreshCw className="size-4" /> Retry
      </Button>
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function QuizView() {
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)

  const [phase, setPhase] = useState<Phase>('config')

  // Config state
  const [subjects, setSubjects] = useState<SubjectSummary[]>([])
  const [subjectsStatus, setSubjectsStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [subjectCode, setSubjectCode] = useState('all')
  const [system, setSystem] = useState('all')
  const [count, setCount] = useState(10)
  const [qtype, setQtype] = useState<'' | 'rapid' | 'vignette'>('')

  // Run state
  const [runStatus, setRunStatus] = useState<RunStatus>('loading')
  const [pairLabel, setPairLabel] = useState<string | null>(null)
  const [activePairId, setActivePairId] = useState<string | null>(null)
  const [pairDebrief, setPairDebrief] = useState<PairDebriefData | null>(null)
  const [pairDebriefLoading, setPairDebriefLoading] = useState(false)
  const [questions, setQuestions] = useState<QuestionClient[]>([])
  const [qIndex, setQIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(3)
  const [attempt, setAttempt] = useState<AttemptResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [endOpen, setEndOpen] = useState(false) // "End session?" confirm dialog (Esc in run)
  const [errorType, setErrorType] = useState<string | null>(null)
  const [errorSaved, setErrorSaved] = useState(false)
  const [results, setResults] = useState<ResultEntry[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [focusLabel, setFocusLabel] = useState<string | null>(null)
  const [lastKnowledge, setLastKnowledge] = useState<{ mastery: number; status: string } | null>(null)
  const [exitOpen, setExitOpen] = useState(false)

  // Refs
  const sessionStartRef = useRef(0)
  const questionStartRef = useRef(0)
  const presetStartedRef = useRef(false)
  const sessionLoggedRef = useRef(false)
  const lastParamsRef = useRef<RunParams | null>(null)

  // Subjects fetch
  useEffect(() => {
    let cancelled = false
    api.subjects().then(
      (res) => {
        if (cancelled) return
        setSubjects(res.subjects)
        setSubjectsStatus('ready')
      },
      () => {
        if (cancelled) return
        setSubjectsStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // ── Run lifecycle ──
  const startRun = useCallback((params: RunParams) => {
    lastParamsRef.current = params
    sessionLoggedRef.current = false
    setPhase('run')
    setRunStatus('loading')
    setQuestions([])
    setQIndex(0)
    setSelected(null)
    setConfidence(3)
    setAttempt(null)
    setResults([])
    setElapsed(0)
    setSessionSeconds(0)
    setSubmitError(false)
    setErrorType(null)
    setErrorSaved(false)
    setLastKnowledge(null)
    setPairLabel(params.pairId ? (params.pairLabel ?? 'a confusable pair') : null)
    setActivePairId(params.pairId ?? null)
    setPairDebrief(null)
    setPairDebriefLoading(!!params.pairId)
    if (params.conceptId) {
      setFocusLabel('Focused concept')
      api.concept(params.conceptId).then(
        (res) => setFocusLabel(res.name),
        () => setFocusLabel('Focused concept'),
      )
    } else if (params.topicId) {
      // Topic-focused run (Topic Hub / Learn hand-off) — label from the topic.
      setFocusLabel('Focused topic')
      fetch(`/api/learn/topic/${encodeURIComponent(params.topicId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { topic?: { name?: string } } | null) => {
          if (d?.topic?.name) setFocusLabel(d.topic.name)
        })
        .catch(() => { /* label stays generic */ })
    } else {
      setFocusLabel(null)
    }
    const { pairId, pairLabel, ...rest } = params
    void pairLabel
    api.questions({ ...rest, pair: pairId, count: params.count ?? 10 }).then(
      (res) => {
        if (!res.questions.length) {
          setRunStatus('empty')
          return
        }
        setQuestions(res.questions)
        setRunStatus('active')
        const now = Date.now()
        sessionStartRef.current = now
        questionStartRef.current = now
      },
      () => setRunStatus('error'),
    )
  }, [])

  // Auto-start from quizPreset (focused practice from dashboard / concept explorer / cases)
  useEffect(() => {
    const preset: QuizPresetParams | null = useAppStore.getState().quizPreset
    if (!preset) return
    const t = window.setTimeout(() => {
      if (presetStartedRef.current) return
      presetStartedRef.current = true
      setQuizPreset(null)
      startRun({
        subjectCode: preset.subjectCode,
        system: preset.system,
        conceptId: preset.conceptId,
        topicId: preset.topicId,
        count: preset.count ?? 6,
        pairId: preset.pairId,
        pairLabel: preset.pairLabel,
      })
    }, 0)
    return () => window.clearTimeout(t)
  }, [startRun, setQuizPreset])

  // Pair-drill debrief — fetch the pair's comparison table once the run completes
  // (loading flag is armed in startRun; this effect only resolves it async — lint-clean)
  useEffect(() => {
    if (phase !== 'results' || !activePairId) return
    let cancelled = false
    api.confusionPair(activePairId)
      .then((res) => {
        if (!cancelled) setPairDebrief(res.pair)
      })
      .catch(() => {
        if (!cancelled) setPairDebrief(null)
      })
      .finally(() => {
        if (!cancelled) setPairDebriefLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [phase, activePairId])

  // Session timer (subtle tick while the run is active)
  useEffect(() => {
    if (phase !== 'run' || runStatus !== 'active') return
    const iv = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000))
    }, 1000)
    return () => window.clearInterval(iv)
  }, [phase, runStatus])

  // Keyboard shortcuts 1–4 / A–D
  useEffect(() => {
    if (phase !== 'run' || runStatus !== 'active') return
    const q = questions[qIndex]
    if (!q || attempt || submitting) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setExitOpen(true) // asks to confirm before abandoning the run
        return
      }
      const keys = ['1', '2', '3', '4', 'a', 'b', 'c', 'd']
      const idx = keys.indexOf(e.key.toLowerCase())
      if (idx < 0) return
      const oi = idx % 4
      if (oi >= q.options.length) return
      setSelected(q.options[oi].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, runStatus, questions, qIndex, attempt, submitting])

  // ── Actions ──
  const submit = () => {
    const q = questions[qIndex]
    if (!q || !selected || attempt || submitting) return
    const timeMs = Date.now() - questionStartRef.current
    setSubmitting(true)
    setSubmitError(false)
    api.attempt({ questionId: q.id, selected, timeMs, confidence }).then(
      (res) => {
        setAttempt(res)
        setSubmitting(false)
        setResults((prev) => [
          ...prev,
          {
            questionId: q.id,
            correct: res.correct,
            selected,
            timeMs,
            stem: q.stem,
            answerText: resolveAnswerText(q, res.answer),
            teaching: res.teaching,
            difficulty: q.difficulty,
            qtype: q.qtype,
            conceptId: q.conceptId,
          },
        ])
        if (!res.correct && res.errorTypeSuggestion) setErrorType(res.errorTypeSuggestion)
        if (res.mastery != null && res.status) setLastKnowledge({ mastery: res.mastery, status: res.status })
      },
      () => {
        setSubmitting(false)
        setSubmitError(true)
      },
    )
  }

  const pickErrorType = (id: string) => {
    const q = questions[qIndex]
    if (!q) return
    setErrorType(id)
    setErrorSaved(false)
    api.logErrorType({ questionId: q.id, errorType: id }).then(
      () => setErrorSaved(true),
      () => setErrorSaved(false),
    )
  }

  const finishSession = useCallback(() => {
    if (!sessionLoggedRef.current) {
      sessionLoggedRef.current = true
      const totalSec = sessionStartRef.current ? Math.round((Date.now() - sessionStartRef.current) / 1000) : 0
      setSessionSeconds(totalSec)
      api
        .logSession({ minutes: Math.max(1, Math.round(totalSec / 60)), kind: 'questions', label: 'Quiz session' })
        .catch(() => {})
    }
    setPhase('results')
  }, [])

  const nextQuestion = () => {
    if (qIndex + 1 >= questions.length) {
      finishSession()
      return
    }
    setQIndex((i) => i + 1)
    setSelected(null)
    setConfidence(3)
    setAttempt(null)
    setErrorType(null)
    setErrorSaved(false)
    setSubmitError(false)
    questionStartRef.current = Date.now()
  }

  const backToConfig = () => {
    setPhase('config')
    setRunStatus('loading')
    setQuestions([])
    setResults([])
    setQIndex(0)
    setSelected(null)
    setAttempt(null)
    setFocusLabel(null)
    setExitOpen(false)
  }

  const confirmExit = () => {
    setExitOpen(false)
    if (results.length > 0) finishSession()
    else backToConfig()
  }

  const retryRun = () => {
    if (lastParamsRef.current) startRun(lastParamsRef.current)
    else backToConfig()
  }

  const startFromConfig = () => {
    startRun({
      subjectCode: subjectCode === 'all' ? undefined : subjectCode,
      system: system === 'all' ? undefined : system,
      count,
      qtype: qtype || undefined,
    })
  }

  // ── Derived (results) ──
  const total = results.length
  const correctCount = results.filter((r) => r.correct).length
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0
  const avgSec = total > 0 ? Math.round(results.reduce((a, r) => a + r.timeMs, 0) / total / 1000) : 0
  const wrongs = results.filter((r) => !r.correct)
  // YOUR error pattern for the pair drill — misses split across the pair's two concepts
  const pairErrorPattern = useMemo<PairErrorPattern | null>(() => {
    if (!pairDebrief) return null
    const a = pairDebrief.aCode
    const b = pairDebrief.bCode
    if (!a && !b) return null
    const aQs = a ? results.filter((r) => r.conceptId === a) : []
    const bQs = b ? results.filter((r) => r.conceptId === b) : []
    if (!aQs.length && !bQs.length) return null
    return {
      aTotal: aQs.length,
      aWrong: aQs.filter((r) => !r.correct).length,
      bTotal: bQs.length,
      bWrong: bQs.filter((r) => !r.correct).length,
    }
  }, [pairDebrief, results])
  const byDiff = [1, 2, 3].map((d) => {
    const rows = results.filter((r) => r.difficulty === d)
    return {
      d,
      label: DIFF_LABELS[d] ?? `Level ${d}`,
      total: rows.length,
      correct: rows.filter((r) => r.correct).length,
    }
  })

  // ─── RENDER: CONFIG ────────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10">
              <FlaskConical className="size-5 text-primary" />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">QUESTION LAB</h1>
          </div>
          <p className="text-sm text-ink-soft md:text-base">
            Original NEET-PG-style questions with error intelligence.
          </p>
        </header>

        {pairLabel ? <PairBanner label={pairLabel} /> : focusLabel && <FocusBanner label={focusLabel} />}

        {subjectsStatus === 'loading' && <ConfigSkeleton />}
        {subjectsStatus === 'error' && (
          <LoadErrorCard message="Couldn't load the question bank" onRetry={() => setReloadKey((k) => k + 1)} />
        )}

        {subjectsStatus === 'ready' && (
          <section className="clay space-y-7 rounded-2xl p-5 md:p-7">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Subject</label>
                <Select value={subjectCode} onValueChange={setSubjectCode}>
                  <SelectTrigger className="min-h-11 w-full">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.code}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">System</label>
                <Select value={system} onValueChange={setSystem}>
                  <SelectTrigger className="min-h-11 w-full">
                    <SelectValue placeholder="All systems" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All systems</SelectItem>
                    {SYSTEMS.map((sys) => (
                      <SelectItem key={sys.id} value={sys.id}>
                        {sys.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Questions</label>
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{count}</span>
              </div>
              <Slider min={5} max={30} step={5} value={[count]} onValueChange={(v) => setCount(v[0] ?? 10)} />
              <div className="flex justify-between text-[11px] tabular-nums text-ink-soft">
                <span>5</span>
                <span>30</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Mode</label>
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => setQtype(m.value)}
                    className={cn(
                      'min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                      qtype === m.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <Button size="lg" className="min-h-12 w-full text-base font-semibold" onClick={startFromConfig}>
              <Play className="size-5" /> START SESSION
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              During a session, press <span className="font-semibold">1–4</span> or{' '}
              <span className="font-semibold">A–D</span> to pick an option.
            </p>
          </section>
        )}
      </div>
    )
  }

  // ─── RENDER: RUN ───────────────────────────────────────────────────────────
  if (phase === 'run') {
    const q = questions[qIndex]
    const isLast = qIndex + 1 >= questions.length
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
            Q{qIndex + 1}
            <span className="text-ink-soft">/{questions.length}</span>
          </span>
          <div className="flex min-w-0 flex-1 gap-1" aria-hidden="true">
            {questions.map((_, i) => {
              const r = results[i]
              return (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors duration-500',
                    r ? (r.correct ? 'bg-sev-ok' : 'bg-sev-crit') : i === qIndex ? 'bg-primary/60' : 'bg-surface-2',
                  )}
                />
              )
            })}
          </div>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums text-ink-soft">
            <Timer className="size-3.5" />
            {fmtTime(elapsed)}
          </span>
          <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="End session" className="size-9 shrink-0">
                <X className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End session?</AlertDialogTitle>
                <AlertDialogDescription>
                  Progress is saved per question. Attempts already submitted and their knowledge updates are recorded.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep going</AlertDialogCancel>
                <AlertDialogAction onClick={confirmExit}>End session</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {pairLabel ? <PairBanner label={pairLabel} /> : focusLabel && <FocusBanner label={focusLabel} />}

        {runStatus === 'loading' && <RunSkeleton />}
        {runStatus === 'error' && <LoadErrorCard message="Couldn't start this session" onRetry={retryRun} />}
        {runStatus === 'empty' && (
          <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-sev-warn/10">
              <AlertTriangle className="size-6 text-sev-warn" />
            </span>
            <h2 className="text-lg font-semibold tracking-tight">No questions matched this filter</h2>
            <p className="max-w-sm text-sm text-ink-soft">
              Try widening the subject, system or mode — the bank grows as you unlock concepts.
            </p>
            <Button variant="outline" className="min-h-11" onClick={backToConfig}>
              Back to the lab
            </Button>
          </div>
        )}

        {runStatus === 'active' && q && (
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <section className="clay space-y-5 rounded-2xl p-5 md:p-7">
                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <DifficultyDots n={q.difficulty} />
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    {qtypeLabel(q.qtype)}
                  </span>
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    {q.subjectCode}
                  </span>
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    {q.system}
                  </span>
                </div>

                {/* Stem */}
                <p className="text-lg font-medium leading-relaxed">{q.stem}</p>

                {/* Options */}
                <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
                  {q.options.map((o, i) => {
                    const isSelected = selected === o.id && attempt == null
                    const isCorrectOne = attempt != null && o.id === attempt.answer
                    const isWrongPick = attempt != null && !attempt.correct && o.id === selected
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={selected === o.id}
                        disabled={attempt != null || submitting}
                        onClick={() => setSelected(o.id)}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                          attempt == null && !isSelected && 'border-line bg-surface-2/40 hover:border-primary/50',
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

                {/* Confidence */}
                <div className={cn('space-y-2', attempt != null && 'pointer-events-none opacity-50')}>
                  <div className="flex items-center justify-between text-[11px] text-ink-soft">
                    <span>Guess</span>
                    <span className="font-semibold text-foreground">Confidence {confidence}/5</span>
                    <span>Certain</span>
                  </div>
                  <Slider
                    min={1}
                    max={5}
                    step={1}
                    value={[confidence]}
                    onValueChange={(v) => setConfidence(v[0] ?? 3)}
                    disabled={attempt != null}
                  />
                </div>

                {/* Submit */}
                {!attempt && (
                  <div className="space-y-2">
                    {submitError && (
                      <p className="rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs text-sev-crit">
                        Couldn&apos;t record your attempt — check your connection and submit again.
                      </p>
                    )}
                    <Button
                      size="lg"
                      className="min-h-11 w-full font-semibold"
                      disabled={!selected || submitting}
                      onClick={submit}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Checking…
                        </>
                      ) : (
                        'SUBMIT'
                      )}
                    </Button>
                  </div>
                )}

                {/* Verdict + explanation */}
                {attempt && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div
                      className={cn(
                        'flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold',
                        attempt.correct
                          ? 'border-sev-ok/30 bg-sev-ok/10 text-sev-ok'
                          : 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit',
                      )}
                    >
                      {attempt.correct ? (
                        <CheckCircle2 className="size-5 shrink-0" />
                      ) : (
                        <XCircle className="size-5 shrink-0" />
                      )}
                      {attempt.correct ? 'Correct' : 'Incorrect'}
                      {!attempt.correct && (
                        <span className="font-normal text-ink-soft">
                          Correct answer:{' '}
                          <span className="font-semibold text-foreground">{resolveAnswerText(q, attempt.answer)}</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5 rounded-xl border border-line bg-surface-2/50 p-4">
                      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                        <CheckCircle2 className="size-4 text-primary" /> Explanation
                      </p>
                      <p className="text-sm leading-relaxed">{attempt.explanation}</p>
                      <p className="rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm italic leading-relaxed">
                        {attempt.teaching}
                      </p>
                    </div>

                    {/* Error intelligence */}
                    {!attempt.correct && (
                      <div className="space-y-3 rounded-xl border border-sev-crit/25 bg-sev-crit/5 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-sev-crit">
                            Why did you miss this?
                          </h4>
                          {errorSaved && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sev-ok">
                              <Check className="size-3" /> logged
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-ink-soft">
                          Tagging the error builds your mistake profile — the engine uses it to schedule revision and
                          detect confusion pairs. Skip if you prefer.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {ERROR_TYPES.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => pickErrorType(t.id)}
                              className={cn(
                                'min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors',
                                errorType === t.id
                                  ? 'border-primary bg-primary/10'
                                  : 'border-line bg-surface-2/40 hover:border-primary/50',
                              )}
                            >
                              <span className="flex items-center gap-1.5 text-xs font-semibold">
                                {errorType === t.id && <Check className="size-3 text-primary" />}
                                {t.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-ink-soft">{t.hint}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button size="lg" className="min-h-11 w-full font-semibold" onClick={nextQuestion}>
                      {isLast ? 'SEE RESULTS' : 'NEXT QUESTION'} <ArrowRight className="size-4" />
                    </Button>
                  </motion.div>
                )}
              </section>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    )
  }

  // ─── RENDER: RESULTS ───────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10">
            <FlaskConical className="size-5 text-primary" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">SESSION COMPLETE</h1>
        </div>
        <p className="text-sm text-ink-soft md:text-base">
          Every submitted attempt already updated your knowledge model.
        </p>
      </header>

      {/* Score ring + stats */}
      <section className="clay rounded-2xl p-5 md:p-7">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <ScoreRing value={accuracy} size={168} stroke={12} gradientId="quiz-result-ring">
            <span className="text-4xl font-semibold tabular-nums tracking-tight">{accuracy}%</span>
            <span className="mt-1 text-xs text-ink-soft">accuracy</span>
          </ScoreRing>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
              <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <Target className="size-4 text-primary" /> Score
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {correctCount}/{total} correct
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
              <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <Timer className="size-4 text-primary" /> Avg time / question
              </span>
              <span className="text-sm font-semibold tabular-nums">{avgSec}s</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <Play className="size-4 text-primary" /> Session length
              </span>
              <span className="text-sm font-semibold tabular-nums">{fmtTime(sessionSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Breakdown by difficulty */}
        <div className="mt-6 space-y-2.5 border-t border-line pt-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">By difficulty</p>
          {byDiff.map((row) => {
            const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0
            return (
              <div key={row.d} className="flex items-center gap-3">
                <DifficultyDots n={row.d} />
                <span className="w-20 shrink-0 text-xs font-medium">{row.label}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: EASE }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                  {row.correct}/{row.total}
                </span>
              </div>
            )
          })}
        </div>

        {/* Knowledge note */}
        {lastKnowledge && (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm">
            <Brain className="size-4 shrink-0 text-info" />
            <span>
              Knowledge state updated: <span className="font-semibold tabular-nums">{lastKnowledge.mastery}%</span>
              <span className="mx-1.5 text-ink-soft">→</span>
              <span className="font-semibold capitalize">{lastKnowledge.status}</span>
            </span>
          </div>
        )}
      </section>

      {/* Pair-drill debrief — the distinction, side by side */}
      {activePairId &&
        (pairDebriefLoading ? (
          <section className="clay rounded-2xl p-5 md:p-7" aria-label="Loading pair debrief">
            <p className="flex items-center gap-2.5 text-sm text-ink-soft">
              <Loader2 className="size-4 animate-spin" /> Loading the pair breakdown…
            </p>
          </section>
        ) : pairDebrief ? (
          <PairDebrief
            pair={pairDebrief}
            errorPattern={pairErrorPattern}
            onDrillAgain={() =>
              startRun({
                pairId: activePairId,
                pairLabel: pairLabel ?? undefined,
                count: lastParamsRef.current?.count ?? 6,
              })
            }
            onSocraticDrill={() => {
              try {
                sessionStorage.setItem('medos:tutor-pair', activePairId)
              } catch {
                /* storage unavailable — the tutor view simply won't auto-open the drill */
              }
              setView('tutor')
            }}
            onViewProgress={() => setView('progress')}
          />
        ) : null)}

      {/* Missed questions + teaching */}
      <section className="clay space-y-4 rounded-2xl p-5 md:p-7">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">
          Missed questions &amp; teaching
        </h2>
        {wrongs.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-sev-ok/30 bg-sev-ok/10 px-4 py-3 text-sm text-sev-ok">
            <Zap className="size-4 shrink-0" />
            Flawless run — every question correct. The engine will raise the difficulty next time.
          </div>
        ) : (
          <ul className="space-y-3">
            {wrongs.map((r) => (
              <li key={r.questionId} className="rounded-xl border border-line bg-surface-2/40 p-4">
                <div className="flex items-start gap-2.5">
                  <DifficultyDots n={r.difficulty} className="mt-1.5" />
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{r.stem}</p>
                  <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                    {qtypeLabel(r.qtype)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-sev-ok">
                  Correct answer: <span className="font-semibold">{r.answerText}</span>
                </p>
                {r.teaching && (
                  <p className="mt-1.5 rounded-lg border-l-2 border-sev-warn bg-sev-warn/10 px-3 py-2 text-xs italic leading-relaxed">
                    {r.teaching}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="min-h-11 flex-1 font-semibold" onClick={backToConfig}>
          <RefreshCw className="size-4" /> RUN ANOTHER SET
        </Button>
        <Button size="lg" variant="outline" className="min-h-11 sm:flex-none" onClick={() => setView('os')}>
          BACK TO HOME
        </Button>
      </div>
    </div>
  )
}
