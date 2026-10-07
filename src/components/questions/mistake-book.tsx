'use client'

// ─── MISTAKE BOOK 2.0 ───
// Personal mistake intelligence: error-type distribution, recurring confusion
// detection, and a re-conquer queue. Every number is computed from the
// profile's own attempts (via /api/mistakes) — no estimates, no fabrication.

import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  BookX,
  CheckCircle2,
  FlaskConical,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Swords,
  XCircle,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAppStore } from '@/lib/store'
import { ERROR_TYPE_LABELS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { MistakesPayload, MistakeConfusionRow, MistakeWrongQuestionRow } from '@/app/api/mistakes/route'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LoadState = 'loading' | 'ready' | 'error'

// ─── Primitives (revise-view patterns) ───────────────────────────────────────

function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : 0.06 * index, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

function Bar({ pct, className, delay = 0 }: { pct: number; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={cn('h-full shrink-0 rounded-full', className)}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      transition={{ duration: 0.8, delay: reduce ? 0 : delay, ease: EASE }}
    />
  )
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
      {children}
    </h2>
  )
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

// ─── Loading / error / empty states ──────────────────────────────────────────

function MistakeBookSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6" aria-busy="true" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="shimmer h-9 w-44 rounded-lg" />
        <Skeleton className="shimmer h-8 w-28 rounded-full" />
      </div>
      <Skeleton className="shimmer h-24 rounded-2xl" />
      <Skeleton className="shimmer h-40 rounded-2xl" />
      <Skeleton className="shimmer h-28 rounded-2xl" />
      <Skeleton className="shimmer h-64 rounded-2xl" />
    </div>
  )
}

function MistakeBookError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your mistake book</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The mistake engine did not respond. Nothing is lost — every attempt is still on record.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

function NoMistakesState({ attempts, onPractice }: { attempts: number; onPractice: () => void }) {
  return (
    <div className="clay flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-sev-ok/15">
        <CheckCircle2 className="size-7 text-sev-ok" />
      </span>
      <h3 className="text-lg font-semibold tracking-tight">
        {attempts > 0 ? 'No mistakes on record' : 'Your mistake book is empty'}
      </h3>
      <p className="max-w-sm text-sm text-ink-soft">
        {attempts > 0
          ? `Flawless so far — ${attempts} attempt${attempts === 1 ? '' : 's'}, zero wrong. Keep the streak honest: tougher mixes wait in Practice.`
          : 'Every wrong answer you log lands here with its error type, timing and a way to re-drill it. Attempt a few questions to open the book.'}
      </p>
      <Button className="mt-1 min-h-11 gap-2" onClick={onPractice}>
        <FlaskConical className="size-4" /> Start practice
      </Button>
    </div>
  )
}

// ─── Sub-sections ────────────────────────────────────────────────────────────

function InsightList({ insights }: { insights: string[] }) {
  return (
    <ul className="space-y-2.5">
      {insights.map((line, i) => (
        <li key={i} className="clay flex items-start gap-3 rounded-xl p-4">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent">
            <Sparkles className="size-3.5 text-sev-warn" aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed">{line}</p>
        </li>
      ))}
    </ul>
  )
}

const BAR_COLORS = ['bg-sev-crit', 'bg-sev-warn', 'bg-ink-soft/40']

function ErrorTypeBars({ data }: { data: MistakesPayload['errorTypeBreakdown'] }) {
  return (
    <ul className="clay space-y-3 rounded-2xl p-4 md:p-5" aria-label="Error type distribution">
      {data.map((row, i) => (
        <li key={row.errorType}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="font-semibold tracking-tight">{row.label}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">
              {row.count} · {row.share}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <Bar pct={row.share} delay={0.08 * i} className={BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)]} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ConfusionCard({
  pair,
  index,
  onDrill,
}: {
  pair: MistakeConfusionRow
  index: number
  onDrill: (pair: MistakeConfusionRow) => void
}) {
  return (
    <Reveal index={index}>
      <li className="clay rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-soft">
            {pair.subjectCode}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-crit/40 bg-sev-crit/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-sev-crit">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sev-crit opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-sev-crit" />
            </span>
            RECURRING
          </span>
        </div>

        {/* a vs b with per-side wrong counts */}
        <div className="mt-3 overflow-hidden rounded-lg border border-line/60">
          <div className="grid grid-cols-2">
            <div className="bg-primary/15 px-3 py-2 text-center text-xs font-bold leading-tight tracking-tight text-primary">
              {pair.a}
            </div>
            <div className="border-l border-line bg-sev-warn/15 px-3 py-2 text-center text-xs font-bold leading-tight tracking-tight text-sev-warn">
              {pair.b}
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-line border-t border-line text-center">
            <div className="px-3 py-1.5 text-[11px] tabular-nums text-ink-soft">
              {pair.aErrors} wrong {pair.aErrors === 1 ? 'attempt' : 'attempts'}
            </div>
            <div className="px-3 py-1.5 text-[11px] tabular-nums text-ink-soft">
              {pair.bErrors} wrong {pair.bErrors === 1 ? 'attempt' : 'attempts'}
            </div>
          </div>
        </div>

        {/* mnemonic strip */}
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-accent/60 px-3 py-2">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-sev-warn" aria-hidden="true" />
          <p className="text-[11px] italic leading-relaxed text-ink-soft">{pair.mnemonic}</p>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="mt-3 min-h-11 w-full gap-1.5 border-sev-crit/40 text-xs text-sev-crit hover:bg-sev-crit/10 sm:w-auto"
          onClick={() => onDrill(pair)}
          aria-label={`Drill the confusion pair ${pair.a} versus ${pair.b}`}
        >
          <Zap className="size-3.5" /> Drill this pair
        </Button>
      </li>
    </Reveal>
  )
}

function WrongQuestionRow({ q, index, onRedrill }: { q: MistakeWrongQuestionRow; index: number; onRedrill: (q: MistakeWrongQuestionRow) => void }) {
  const date = new Date(q.at)
  const dateLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const errorLabel = q.errorType ? (ERROR_TYPE_LABELS[q.errorType] ?? q.errorType) : 'Untagged'

  return (
    <Reveal index={index}>
      <li className="clay rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-wide">
          <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-ink-soft">{q.subjectCode}</span>
          <span className="rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2 py-0.5 text-sev-warn">{errorLabel}</span>
          {q.conceptName && <span className="text-ink-soft">{q.conceptName}</span>}
          <span className="ml-auto inline-flex items-center gap-2 text-ink-soft">
            {dateLabel && <span>{dateLabel}</span>}
            <DifficultyDots n={q.difficulty} />
          </span>
        </div>

        <p className="mt-2 text-sm font-medium leading-snug tracking-tight">{q.stem}</p>

        <div className="mt-2.5 space-y-1 text-xs">
          <p className="flex items-start gap-1.5 text-sev-crit">
            <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Your answer:</span> {q.selectedText}
            </span>
          </p>
          <p className="flex items-start gap-1.5 text-sev-ok">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Correct:</span> {q.answerText}
            </span>
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
          {q.teaching ? (
            <p className="flex items-start gap-1.5 text-[11px] italic leading-relaxed text-ink-soft">
              <Lightbulb className="mt-0.5 size-3 shrink-0 text-sev-warn" aria-hidden="true" />
              {q.teaching}
            </p>
          ) : (
            <span />
          )}
          {q.conceptId ? (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 shrink-0 gap-1.5 text-xs"
              onClick={() => onRedrill(q)}
              aria-label={`Re-drill practice questions for ${q.conceptName ?? 'this concept'}`}
            >
              <Swords className="size-3.5" /> Re-drill
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <span title="General revision — this question isn't tied to a concept, revisit it in broad practice.">
              <Button size="sm" variant="outline" disabled className="min-h-11 shrink-0 gap-1.5 text-xs" aria-label="Re-drill unavailable: general revision">
                <Swords className="size-3.5" /> Re-drill
              </Button>
            </span>
          )}
        </div>
      </li>
    </Reveal>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function MistakeBook({ onGoPractice }: { onGoPractice: () => void }) {
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)

  const [data, setData] = useState<MistakesPayload | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  const retry = useCallback(() => {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/mistakes', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/mistakes → ${res.status}`)
        return (await res.json()) as MistakesPayload
      })
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Quiz hand-offs — same mechanism the progress view + concept explorer use:
  // stage a quizPreset in the store, land on the questions view; quiz-view
  // auto-starts it. onGoPractice switches the Question Lab's internal tab so
  // QuizView actually mounts (Mistake Book lives inside the same view).
  const drillPair = useCallback(
    (pair: MistakeConfusionRow) => {
      setQuizPreset({ pairId: pair.id, pairLabel: `${pair.a} vs ${pair.b}`, count: 6 })
      onGoPractice()
      setView('questions')
    },
    [onGoPractice, setQuizPreset, setView],
  )

  const redrillConcept = useCallback(
    (q: MistakeWrongQuestionRow) => {
      if (!q.conceptId) return
      setQuizPreset({ conceptId: q.conceptId, count: 6 })
      onGoPractice()
      setView('questions')
    },
    [onGoPractice, setQuizPreset, setView],
  )

  if (status === 'loading') return <MistakeBookSkeleton />
  if (status === 'error' || !data) return <MistakeBookError onRetry={retry} />

  const { totals, errorTypeBreakdown, recurringConfusions, wrongQuestions, insights, insufficientData } = data
  const rateTone =
    totals.overallMistakeRate >= 40 ? 'sev-crit' : totals.overallMistakeRate >= 20 ? 'sev-warn' : 'sev-ok'

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      {/* Header */}
      <Reveal>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-sev-crit/10">
              <BookX className="size-5 text-sev-crit" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">MISTAKE BOOK</h1>
              <p className="text-xs text-ink-soft">
                <span className="tabular-nums font-semibold text-foreground">{totals.totalWrong}</span> wrong ·{' '}
                <span className="tabular-nums font-semibold text-foreground">{totals.totalAttempts}</span> attempts on record
              </p>
            </div>
          </div>
          <span
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-bold tabular-nums',
              rateTone === 'sev-crit' && 'border-sev-crit/40 bg-sev-crit/10 text-sev-crit',
              rateTone === 'sev-warn' && 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn',
              rateTone === 'sev-ok' && 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok',
            )}
            aria-label={`Overall mistake rate ${totals.overallMistakeRate}%`}
          >
            {totals.overallMistakeRate}% mistake rate
          </span>
        </header>
      </Reveal>

      {totals.totalWrong === 0 ? (
        <Reveal index={1}>
          <NoMistakesState attempts={totals.totalAttempts} onPractice={onGoPractice} />
        </Reveal>
      ) : (
        <>
          {/* Insights */}
          <Reveal index={1}>
            <section aria-labelledby="mb-insights" className="space-y-3">
              <SectionTitle id="mb-insights">Insights</SectionTitle>
              {insights.length > 0 ? (
                <>
                  <InsightList insights={insights} />
                  <p className="px-1 text-[10px] uppercase tracking-[0.14em] text-ink-soft/80">
                    Auto-generated from your attempts — computed, not estimated.
                  </p>
                </>
              ) : (
                <p className="clay rounded-xl p-4 text-sm text-ink-soft">
                  {insufficientData
                    ? `Not enough data yet — insights unlock after 5 attempts (${totals.totalAttempts}/5 so far).`
                    : 'No tagged patterns in these mistakes yet — tag your error types after practice to unlock insights.'}
                </p>
              )}
            </section>
          </Reveal>

          {/* Error-type distribution */}
          {errorTypeBreakdown.length > 0 && (
            <Reveal index={2}>
              <section aria-labelledby="mb-error-types" className="space-y-3">
                <SectionTitle id="mb-error-types">Error type distribution</SectionTitle>
                <ErrorTypeBars data={errorTypeBreakdown} />
              </section>
            </Reveal>
          )}

          {/* Recurring confusions */}
          {recurringConfusions.length > 0 && (
            <Reveal index={3}>
              <section aria-labelledby="mb-confusions" className="space-y-3">
                <SectionTitle id="mb-confusions">Recurring confusions</SectionTitle>
                <ul className="space-y-3">
                  {recurringConfusions.map((pair, i) => (
                    <ConfusionCard key={pair.id} pair={pair} index={i} onDrill={drillPair} />
                  ))}
                </ul>
              </section>
            </Reveal>
          )}

          {/* Wrong questions to re-conquer */}
          {wrongQuestions.length > 0 && (
            <Reveal index={4}>
              <section aria-labelledby="mb-wrong" className="space-y-3">
                <SectionTitle id="mb-wrong">Wrong questions to re-conquer</SectionTitle>
                <p className="px-1 text-[11px] text-ink-soft">
                  Latest mistake per question, newest first. Re-drill one and the concept goes straight into a focused practice run.
                </p>
                <ul className="med-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                  {wrongQuestions.map((q, i) => (
                    <WrongQuestionRow key={`${q.questionId}-${q.at}`} q={q} index={i} onRedrill={redrillConcept} />
                  ))}
                </ul>
              </section>
            </Reveal>
          )}
        </>
      )}
    </div>
  )
}
