'use client'

// ─── MOCK TEST (spec §46-lite) ───
// Exam-condition simulation: countdown timer, no immediate feedback,
// question palette + mark-for-review, auto-submit at 0, full review report.
// Attempts feed the same knowledge engine as practice (via /api/attempts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Brain,
  CheckCircle2,
  ChevronDown,
  Crown,
  Dices,
  EyeOff,
  FilePenLine,
  FlaskConical,
  GraduationCap,
  Landmark,
  ListFilter,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Star,
  Stethoscope,
  Target,
  Timer,
  XCircle,
  Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { QuestionClient, SubjectSummary } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { ScrollReveal, Stagger, StaggerItem, Pop } from '@/components/primitives/motion'
import { Sheen } from '@/components/primitives/aura'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type Phase = 'config' | 'run' | 'submitting' | 'results'

interface MockAnswer {
  questionId: string
  selected: string
  timeMs: number
  correct?: boolean
  answer?: string
  explanation?: string
  teaching?: string
}

const SIZES = [10, 15, 20, 50, 100] as const
const SEC_PER_Q = 60 // NEET-PG pace: ~1 min per question

// Paper-mix presets — how the question set is composed
const MIXES = [
  { id: 'high-yield', label: 'High-Yield Mix', icon: Star, desc: 'Weighted to the big NEET-PG subjects — Medicine, Surgery, OBGY get more seats' },
  { id: 'weak', label: 'Weak-Areas Focus', icon: Target, desc: 'Pulled from concepts your knowledge map flags as weak or unstable' },
  { id: 'random', label: 'Mixed Bag', icon: Dices, desc: 'A uniform draw across the whole bank — good for surprises' },
  { id: 'custom', label: 'Build My Paper', icon: FlaskConical, desc: 'Pick your own subject mix — your personal mock, your rules' },
] as const

// One-tap quick starts — jump straight into a run without touching the config
const QUICK_STARTS = [
  { label: 'Full Mock 50', icon: Landmark, desc: 'The real-feel paper — 50 questions weighted across the whole bank', size: 50, mix: 'high-yield' },
  { label: 'Grand Mock 100', icon: Crown, desc: 'The biggest paper in MEDULA — 100 questions, 100 minutes, every subject in play', size: 100, mix: 'high-yield' },
  { label: 'Rapid Fire 20', icon: Zap, desc: 'A 20-minute mixed bag at exam pace', size: 20, mix: 'random' },
  { label: 'Weak-Spot 10', icon: Target, desc: 'Ten questions aimed at your flagged weak concepts', size: 10, mix: 'weak' },
] as const

// Quick-pick bundles for the custom paper builder (codes must match seeded subjects)
const BUNDLE_CLINICAL_CORE = ['MED', 'SURG', 'OBGY', 'PEDS'] as const
const BUNDLE_FINAL_YEAR = ['PATHO', 'PHARM', 'MICRO', 'FMT', 'CM'] as const

function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function resolveAnswerText(q: QuestionClient, answerId: string): string {
  return q.options.find((o) => o.id === answerId)?.text ?? answerId
}

export function MockTestView() {
  const reduce = useReducedMotion()
  const logSession = useCallback(() => {}, [])
  void logSession

  const [phase, setPhase] = useState<Phase>('config')
  const [size, setSize] = useState<(typeof SIZES)[number]>(10)
  const [mix, setMix] = useState<(typeof MIXES)[number]['id']>('high-yield')
  const [questions, setQuestions] = useState<QuestionClient[]>([])
  const [answers, setAnswers] = useState<Record<string, MockAnswer>>({})
  const [qIndex, setQIndex] = useState(0)
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')

  // Custom paper builder — subjects + picked codes (fetched lazily on first open)
  const [subjects, setSubjects] = useState<SubjectSummary[]>([])
  const [subjectStatus, setSubjectStatus] = useState<'idle' | 'ready' | 'error'>('idle')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const timerRef = useRef<number | null>(null)
  const questionStartRef = useRef<number>(0)
  const submittingRef = useRef(false)

  const q = questions[qIndex]
  const currentAnswer = q ? answers[q.id]?.selected ?? null : null
  const answeredCount = Object.keys(answers).length

  const customActive = mix === 'custom'
  const canStart = !customActive || picked.size > 0

  // ── Countdown + auto-submit ──
  const submitAll = useCallback(
    async (auto = false) => {
      if (submittingRef.current) return
      submittingRef.current = true
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      setSubmitOpen(false)
      setPhase('submitting')
      const totalSec = questions.length * SEC_PER_Q - secondsLeft
      // Post every attempt (sequential — engine updates knowledge states)
      const entries = Object.values(answers)
      for (const a of entries) {
        try {
          const res = await api.attempt({ questionId: a.questionId, selected: a.selected, timeMs: a.timeMs, confidence: 3 })
          a.correct = res.correct
          a.answer = res.answer
          a.explanation = res.explanation
          a.teaching = res.teaching
        } catch {
          /* keep the mock result local even if the engine fails */
          a.correct = false
        }
      }
      api.logSession({ minutes: Math.max(1, Math.round(totalSec / 60)), kind: 'questions', label: auto ? 'Mock test (auto-submitted)' : 'Mock test' }).catch(() => {})
      setPhase('results')
      submittingRef.current = false
    },
    [answers, secondsLeft, questions],
  )

  useEffect(() => {
    if (phase !== 'run') return
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          void submitAll(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [phase, submitAll])

  const startTest = (override?: { size?: (typeof SIZES)[number]; mix?: (typeof MIXES)[number]['id'] }) => {
    const useSize = override?.size ?? size
    const useMix = override?.mix ?? mix
    setLoadState('loading')
    api
      .questions({
        count: useSize,
        // Custom papers draw from the picked subjects, weighted by NEET yield
        mix: useMix === 'custom' ? 'high-yield' : useMix,
        ...(useMix === 'custom' && picked.size > 0 ? { subjects: [...picked].join(',') } : {}),
      })
      .then((res) => {
        if (!res.questions.length) {
          setLoadState('error')
          return
        }
        setQuestions(res.questions)
        setAnswers({})
        setMarked(new Set())
        setQIndex(0)
        setSecondsLeft(res.questions.length * SEC_PER_Q)
        questionStartRef.current = Date.now()
        setLoadState('idle')
        setPhase('run')
      })
      .catch(() => setLoadState('error'))
  }

  // Retry only what went wrong — wrong AND skipped questions from the last paper,
  // rebuilt client-side (no fetch needed; the full question objects are still here)
  const retryWrong = () => {
    const retryRows = questions.filter((qq) => {
      const a = answers[qq.id]
      return !a || a.correct === false
    })
    if (!retryRows.length) return
    setQuestions(retryRows)
    setAnswers({})
    setMarked(new Set())
    setQIndex(0)
    setSecondsLeft(retryRows.length * SEC_PER_Q)
    questionStartRef.current = Date.now()
    setPhase('run')
  }

  const pick = (optionId: string) => {
    if (!q) return
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        ...prev[q.id],
        questionId: q.id,
        selected: optionId,
        timeMs: prev[q.id]?.timeMs ?? Date.now() - questionStartRef.current,
      },
    }))
  }

  const goTo = (i: number) => {
    if (i < 0 || i >= questions.length) return
    setQIndex(i)
    questionStartRef.current = Date.now()
  }

  const toggleMark = () => {
    if (!q) return
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(q.id)) next.delete(q.id)
      else next.add(q.id)
      return next
    })
  }

  // ── Custom paper builder helpers ──
  const toggleSubject = (code: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }
  const pickAllSubjects = () => setPicked(new Set(subjects.map((s) => s.code)))
  const clearSubjects = () => setPicked(new Set())
  const pickBundle = (codes: readonly string[]) => {
    const known = new Set(subjects.map((s) => s.code))
    setPicked(new Set(codes.filter((c) => known.has(c))))
  }

  // Lazy-load subjects the first time the picker is opened (async setState only)
  useEffect(() => {
    if (mix !== 'custom' || subjectStatus !== 'idle') return
    let cancelled = false
    api.subjects().then(
      (res) => {
        if (cancelled) return
        setSubjects(res.subjects)
        setSubjectStatus('ready')
      },
      () => {
        if (cancelled) return
        setSubjectStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [mix, subjectStatus])

  // ── Results derivation ──
  const results = useMemo(() => {
    const rows = questions.map((qq) => {
      const a = answers[qq.id]
      return { q: qq, a }
    })
    return rows
  }, [questions, answers])

  const graded = results.filter((r) => r.a?.correct !== undefined)
  const correctCount = graded.filter((r) => r.a?.correct).length
  const accuracy = graded.length ? Math.round((correctCount / graded.length) * 100) : 0
  // wrong + skipped — exactly what "retry my wrong ones" re-serves
  const retryCount = results.filter((r) => !r.a || r.a.correct === false).length

  const bySubject = useMemo(() => {
    const m = new Map<string, { total: number; correct: number }>()
    for (const r of graded) {
      const key = r.q.subjectCode
      const e = m.get(key) ?? { total: 0, correct: 0 }
      e.total++
      if (r.a?.correct) e.correct++
      m.set(key, e)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [graded])

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-sev-warn/10">
              <GraduationCap className="size-5 text-sev-warn" />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">MOCK TEST</h1>
          </div>
          <p className="text-sm text-ink-soft md:text-base">
            Exam conditions: a countdown clock, no answers revealed until you submit, and a full review report.
          </p>
        </header>

        <section className="clay space-y-6 rounded-2xl p-5 md:p-7">
          {/* Quick starts — one tap, straight into the run */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Start straight away
            </label>
            <Stagger className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_STARTS.map((qk) => (
                <StaggerItem key={qk.label}>
                  <button
                    type="button"
                    disabled={loadState === 'loading'}
                    onClick={() => startTest({ size: qk.size, mix: qk.mix })}
                    className="clay-btn h-full min-h-11 w-full border border-line bg-surface-2/40 p-3 text-left transition-colors hover:border-primary/40 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary shadow-well">
                        <qk.icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="whitespace-nowrap">{qk.label}</span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-ink-soft">{qk.desc}</span>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Test length</label>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSize(n)}
                  aria-pressed={size === n}
                  className={cn(
                    'clay-btn min-h-11 rounded-full! border px-5 py-2 text-sm font-medium',
                    size === n
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  {n} questions · {n} min
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Paper mix</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {MIXES.map((m) => {
                const active = mix === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMix(m.id)}
                    aria-pressed={active}
                    className={cn(
                      'clay-btn min-h-11 border p-3 text-left',
                      active
                        ? 'border-primary bg-primary/10'
                        : 'border-line bg-surface-2/40 hover:border-primary/40',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary shadow-well">
                        <m.icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="whitespace-nowrap">{m.label}</span>
                      {m.id === 'high-yield' && (
                        <span className="rounded-full bg-sev-warn/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sev-warn">recommended</span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-ink-soft">{m.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {mix === 'custom' && (
              <motion.div
                key="custom-picker"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.26, ease: EASE }}
                className="overflow-hidden"
              >
                <div
                  role="group"
                  aria-label="Subjects in your custom paper"
                  className="clay-in space-y-3 rounded-2xl p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Subjects in your paper</span>
                    <span className="text-xs font-semibold text-primary" aria-live="polite">
                      {picked.size} subject{picked.size === 1 ? '' : 's'} selected
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {([
                      { label: `All ${subjects.length || 19}`, on: pickAllSubjects, disabled: subjectStatus !== 'ready' },
                      { label: 'Clinical Core', icon: Stethoscope, on: () => pickBundle(BUNDLE_CLINICAL_CORE), disabled: subjectStatus !== 'ready' },
                      { label: 'Final-Year Gateway', icon: GraduationCap, on: () => pickBundle(BUNDLE_FINAL_YEAR), disabled: subjectStatus !== 'ready' },
                      { label: 'Clear', icon: null, on: clearSubjects, disabled: picked.size === 0 },
                    ]).map((qk) => (
                      <button
                        key={qk.label}
                        type="button"
                        onClick={qk.on}
                        disabled={qk.disabled}
                        className="clay-btn inline-flex min-h-9 items-center gap-1.5 rounded-full! border border-line bg-surface-2/50 px-3.5 text-xs font-medium text-ink-soft hover:border-primary/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {qk.icon && <qk.icon className="size-3.5 text-primary" aria-hidden />}
                        {qk.label}
                      </button>
                    ))}
                  </div>

                  {subjectStatus === 'error' ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sev-crit/30 bg-sev-crit/5 px-3.5 py-3">
                      <p className="text-xs text-sev-crit" role="alert">Couldn&apos;t load subjects — check your connection.</p>
                      <Button size="sm" variant="outline" className="min-h-9 shrink-0" onClick={() => setSubjectStatus('idle')}>
                        Retry
                      </Button>
                    </div>
                  ) : subjectStatus === 'ready' ? (
                    <div className="med-scroll max-h-72 overflow-y-auto rounded-xl border border-line/70 bg-background/30 p-2">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {subjects.map((s) => {
                          const on = picked.has(s.code)
                          return (
                            <button
                              key={s.code}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleSubject(s.code)}
                              style={
                                on
                                  ? { borderColor: s.color, background: `color-mix(in oklab, ${s.color} 16%, transparent)` }
                                  : undefined
                              }
                              className={cn(
                                'clay-btn flex min-h-11 flex-col items-start gap-1.5 border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                on ? 'border-line' : 'border-line bg-surface-2/40 hover:border-primary/40',
                              )}
                            >
                              <span className="flex w-full min-w-0 items-center gap-1.5">
                                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{s.name}</span>
                              </span>
                              <span className="flex w-full items-center justify-between gap-1.5 text-[10px] font-medium text-ink-soft">
                                <span className="rounded-full border border-line px-1.5 py-px">{s.code}</span>
                                <span className="rounded-full bg-sev-warn/15 px-1.5 py-px font-bold text-sev-warn" title={`NEET-PG weight ${s.neetWeight}`}>
                                  ×{s.neetWeight}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="med-scroll max-h-72 overflow-y-auto rounded-xl border border-line/70 bg-background/30 p-2">
                      <p className="sr-only">Loading subjects…</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-hidden>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <Skeleton key={i} className="h-[58px] rounded-xl" />
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] leading-snug text-ink-soft">
                    Questions are drawn only from your subjects — bigger NEET-yield subjects get more seats. The paper fills with whatever your bank has.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ul className="space-y-2.5 rounded-xl border border-line bg-surface-2/50 p-4 text-sm text-ink-soft">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-background/60 text-ink-soft shadow-well"><Timer className="size-3.5" aria-hidden /></span>
              <span><strong className="text-foreground">1 minute per question</strong> — the clock auto-submits when it hits zero.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-background/60 text-ink-soft shadow-well"><EyeOff className="size-3.5" aria-hidden /></span>
              <span><strong className="text-foreground">No feedback during the test</strong> — just like the real NEET-PG hall.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-background/60 text-ink-soft shadow-well"><Bookmark className="size-3.5" aria-hidden /></span>
              <span>Mark questions for review and jump around with the palette.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-background/60 text-ink-soft shadow-well"><Brain className="size-3.5" aria-hidden /></span>
              <span>Every attempt still updates your knowledge map and spaced-repetition schedule.</span>
            </li>
          </ul>

          <Button size="lg" className="min-h-12 w-full text-base font-semibold" onClick={() => startTest()} disabled={loadState === 'loading' || !canStart}>
            <Sheen className="w-full justify-center gap-2">
              {loadState === 'loading' ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
              BEGIN MOCK TEST
            </Sheen>
          </Button>
          {mix === 'custom' && picked.size === 0 && (
            <p className="text-center text-xs font-medium text-sev-warn">Pick at least one subject to build your paper.</p>
          )}
          {loadState === 'error' && (
            <p className="text-center text-sm text-sev-crit">Couldn&apos;t load questions — check your connection and try again.</p>
          )}
        </section>
      </div>
    )
  }

  if (phase === 'submitting') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 p-4 py-24 text-center md:p-6">
        <Loader2 className="size-8 animate-spin text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">Grading your paper…</h2>
        <p className="text-sm text-ink-soft">Updating your knowledge map with every answer.</p>
      </div>
    )
  }

  if (phase === 'run' && q) {
    const urgent = secondsLeft <= 60
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        {/* Exam top bar */}
        <div className="glass sticky top-16 z-20 flex items-center gap-3 rounded-2xl px-4 py-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums',
              urgent ? 'animate-pulse bg-sev-crit/15 text-sev-crit' : 'bg-primary/10 text-primary',
            )}
            role="timer"
            aria-label={`Time remaining ${fmtTime(secondsLeft)}`}
          >
            <Timer className="size-4" />
            {fmtTime(secondsLeft)}
          </span>
          <div className="min-w-0 flex-1" role="group" aria-label="Question palette">
            {/* Two-row horizontally scrollable grid: 100 questions stay usable
                and every cell keeps a 36px touch target (min-h-9 min-w-9). */}
            <div className="med-scroll grid auto-cols-9 grid-flow-col grid-rows-2 gap-1 overflow-x-auto pb-1">
              {questions.map((qq, i) => {
                const answered = !!answers[qq.id]
                const isMarked = marked.has(qq.id)
                return (
                  <button
                    key={qq.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Question ${i + 1}${answered ? ' — answered' : ''}${isMarked ? ' — marked for review' : ''}`}
                    className={cn(
                      'relative min-h-9 w-9 rounded-md border text-[9px] font-semibold transition-colors',
                      i === qIndex
                        ? 'border-primary bg-primary text-primary-foreground'
                        : answered
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
          </div>
          <Button size="sm" className="min-h-9 shrink-0 gap-1" onClick={() => setSubmitOpen(true)}>
            <Send className="size-3.5" /> Submit
          </Button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            <section className="clay space-y-5 rounded-2xl p-5 md:p-7">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                    Q{qIndex + 1}/{questions.length}
                  </span>
                  <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-soft">{q.subjectCode}</span>
                </div>
                <button
                  type="button"
                  onClick={toggleMark}
                  aria-pressed={marked.has(q.id)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    marked.has(q.id)
                      ? 'border-sev-warn/50 bg-sev-warn/10 text-sev-warn'
                      : 'border-line text-ink-soft hover:text-foreground',
                  )}
                >
                  {marked.has(q.id) ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
                  {marked.has(q.id) ? 'Marked' : 'Mark for review'}
                </button>
              </div>

              <p className="text-base font-medium leading-relaxed md:text-lg">{q.stem}</p>

              <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
                {q.options.map((o, i) => {
                  const active = currentAnswer === o.id
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => pick(o.id)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all',
                        active
                          ? 'border-primary bg-primary/10 shadow-sm'
                          : 'border-line bg-surface-2/40 hover:border-primary/40',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold',
                          active ? 'border-primary bg-primary text-primary-foreground' : 'border-line text-ink-soft',
                        )}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="leading-snug">{o.text}</span>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button variant="outline" className="min-h-11" disabled={qIndex === 0} onClick={() => goTo(qIndex - 1)}>
                  <ArrowLeft className="size-4" /> Prev
                </Button>
                <span className="text-xs text-ink-soft">
                  {answeredCount}/{questions.length} answered
                </span>
                {qIndex + 1 < questions.length ? (
                  <Button className="min-h-11" onClick={() => goTo(qIndex + 1)}>
                    Next <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Button className="min-h-11 gap-1" onClick={() => setSubmitOpen(true)}>
                    <Send className="size-4" /> Submit test
                  </Button>
                )}
              </div>
            </section>
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-[11px] text-muted-foreground">
          Answers stay hidden until submission · marked questions show an amber dot · the clock never pauses
        </p>

        <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit the mock test?</AlertDialogTitle>
              <AlertDialogDescription>
                {questions.length - answeredCount} of {questions.length} questions are unanswered — unanswered questions score zero.
                Explanations reveal immediately after grading.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction onClick={() => void submitAll(false)}>Submit &amp; grade</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  if (phase === 'results') {
    const scorePct = accuracy
    const verdict =
      scorePct >= 80 ? 'Outstanding — exam-ready pace.' : scorePct >= 60 ? 'Solid — polish the misses and it clicks.' : scorePct >= 40 ? 'Building — review the explanations below.' : 'Early days — this is exactly what mocks are for.'
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Pop>
              <span className="grid size-10 place-items-center rounded-xl bg-sev-warn/10">
                <GraduationCap className="size-5 text-sev-warn" />
              </span>
            </Pop>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Mock report</h1>
              <p className="text-xs text-ink-soft">{questions.length} questions · {fmtTime(questions.length * SEC_PER_Q - secondsLeft)} used</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => setPhase('config')}>
              <FilePenLine className="size-4" /> Change paper
            </Button>
            {retryCount > 0 && (
              <Button
                variant="outline"
                className="min-h-11 gap-2 border-sev-crit/40 text-sev-crit hover:bg-sev-crit/10 hover:text-sev-crit"
                onClick={retryWrong}
              >
                <ListFilter className="size-4" /> Retry my wrong ones ({retryCount})
              </Button>
            )}
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => startTest()}>
              <RotateCcw className="size-4" /> Retry same paper
            </Button>
          </div>
        </header>

        {/* Score card */}
        <section className="clay flex flex-col items-center gap-4 rounded-2xl p-6 sm:flex-row sm:gap-8">
          <div className="relative grid size-32 shrink-0 place-items-center">
            <svg viewBox="0 0 128 128" className="absolute inset-0 -rotate-90">
              <circle cx="64" cy="64" r="56" fill="none" strokeWidth="10" className="stroke-surface-2" />
              <motion.circle
                cx="64" cy="64" r="56" fill="none" strokeWidth="10" strokeLinecap="round"
                stroke={accuracy >= 60 ? 'var(--sev-ok)' : accuracy >= 40 ? 'var(--sev-warn)' : 'var(--sev-crit)'}
                strokeDasharray={2 * Math.PI * 56}
                initial={reduce ? false : { strokeDashoffset: 2 * Math.PI * 56 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - scorePct / 100) }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
              />
            </svg>
            <div className="text-center">
              <p className="text-3xl font-semibold tabular-nums tracking-tight">{correctCount}<span className="text-lg text-ink-soft">/{graded.length}</span></p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">score</p>
            </div>
          </div>
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <p className="text-sm font-medium">{verdict}</p>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-ok/10 px-3 py-1 text-xs font-semibold text-sev-ok">
                <CheckCircle2 className="size-3.5" /> {correctCount} correct
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-crit/10 px-3 py-1 text-xs font-semibold text-sev-crit">
                <XCircle className="size-3.5" /> {graded.length - correctCount} wrong
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-soft">
                <AlertTriangle className="size-3.5" /> {questions.length - answeredCount} skipped
              </span>
            </div>
          </div>
        </section>

        {/* Per-subject breakdown */}
        {bySubject.length > 0 && (
          <ScrollReveal>
          <section className="clay rounded-2xl p-5 md:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">Subject breakdown</h2>
            <ul className="mt-3 space-y-2.5">
              {bySubject.map(([code, s]) => (
                <li key={code} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs font-semibold">{code}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.span
                      className={cn('block h-full rounded-full', s.correct / s.total >= 0.6 ? 'bg-sev-ok' : s.correct / s.total >= 0.4 ? 'bg-sev-warn' : 'bg-sev-crit')}
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${Math.round((s.correct / s.total) * 100)}%` }}
                      transition={{ duration: 1, ease: EASE, delay: 0.2 }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                    {s.correct}/{s.total}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          </ScrollReveal>
        )}

        {/* Review list */}
        <ScrollReveal>
        <section className="clay rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">Review every question</h2>
          <div className="mt-3 space-y-2">
            {results.map(({ q: qq, a }, i) => {
              const unanswered = !a
              const correct = a?.correct
              return (
                <details
                  key={qq.id}
                  className={cn(
                    'group rounded-xl border transition-colors',
                    unanswered ? 'border-line bg-surface-2/40' : correct ? 'border-sev-ok/30 bg-sev-ok/5' : 'border-sev-crit/30 bg-sev-crit/5',
                  )}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                        unanswered ? 'bg-surface-2 text-ink-soft' : correct ? 'bg-sev-ok/15 text-sev-ok' : 'bg-sev-crit/15 text-sev-crit',
                      )}
                    >
                      {unanswered ? '—' : correct ? '✓' : '✕'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{qq.stem}</span>
                    <span className="hidden shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-ink-soft sm:block">{qq.subjectCode}</span>
                    <ChevronDown className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-2.5 border-t border-line/60 p-4 pt-3 text-sm">
                    <p className="font-medium leading-snug">{qq.stem}</p>
                    <p className={cn('text-xs', correct ? 'text-sev-ok' : unanswered ? 'text-ink-soft' : 'text-sev-crit')}>
                      {unanswered
                        ? 'Not attempted — the clock won.'
                        : `You chose: ${resolveAnswerText(qq, a.selected)}`}
                      {!unanswered && !correct && ` · Correct: ${resolveAnswerText(qq, a.answer ?? '')}`}
                    </p>
                    {a?.explanation && <p className="text-xs leading-relaxed text-ink-soft">{a.explanation}</p>}
                    {a?.teaching && (
                      <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-medium leading-snug text-primary">
                        <Target className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>{a.teaching}</span>
                      </p>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
        </ScrollReveal>

        <p className="text-center text-[11px] text-muted-foreground">
          Every attempt — even skipped-to-submit — feeds your spaced repetition schedule on the Revise tab.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Skeleton className="shimmer h-64 rounded-2xl" />
    </div>
  )
}
