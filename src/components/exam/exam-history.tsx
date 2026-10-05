'use client'

// ─── EXAM LAB · PERFORMANCE HISTORY (PRODUCT 12) ───
// Honest tracking across submitted tests: totals, score trend, consistency,
// subject aggregates with trend, revision impact and a no-percentile note.
// One test is a datapoint, not a trend — the UI says so.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Award, ClipboardList, Flame, ListChecks, RefreshCw, Target, Timer, TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { api } from '@/lib/api'
import type { ExamHistoryPayload } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  EASE, Reveal, SectionTitle, StatTile, accuracyText, accuracyTone, relTime, signed, toneClass,
} from './exam-shared'

interface Props {
  onBack: () => void
  onOpenAnalysis: (attemptId: string) => void
}

type LoadState = 'loading' | 'ready' | 'error'

export function ExamHistoryView({ onBack, onOpenAnalysis }: Props) {
  const [payload, setPayload] = useState<ExamHistoryPayload | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    api.examHistory().then(
      (res) => { if (alive) { setPayload(res); setState('ready') } },
      () => { if (alive) setState('error') },
    )
    return () => { alive = false }
  }, [reloadKey])

  if (state === 'loading') return <HistorySkeleton />
  if (state === 'error' || !payload) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
          <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
            <RefreshCw className="size-6 text-sev-crit" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your performance history</h2>
          <p className="max-w-sm text-sm text-ink-soft">
            The tracking service did not respond. Nothing is lost — every submitted test rebuilds this page.
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
        </div>
      </div>
    )
  }

  const totals = payload.totals
  const trendTests = payload.tests.slice(-20)
  const bestPercent = totals.bestPercent

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Reveal index={0} className="min-w-0 space-y-3">
        <Button variant="ghost" size="sm" className="min-h-9 gap-1 text-xs text-ink-soft" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden /> Back to Exam Lab
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Performance History</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every submitted test, measured. Trends appear from your own papers — never a promised rank.
        </p>
      </Reveal>

      {payload.insufficientData ? (
        <Reveal index={1}>
          <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/10">
              <Target className="size-7 text-primary" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold tracking-tight">One test is not a trend</h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-soft">
              {totals.tests > 0
                ? `You have ${totals.tests} ${totals.tests === 1 ? 'test' : 'tests'} on record — take two more to unlock tracking, consistency and subject trends.`
                : 'Take your first test in the Exam Lab and this page fills with measured history.'}
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          {/* ── Totals ── */}
          <Reveal index={1} className="flex flex-wrap gap-2.5">
            <StatTile icon={ClipboardList} value={String(totals.tests)} label="tests" accent />
            <StatTile icon={ListChecks} value={String(totals.questionsAnswered)} label="questions answered" />
            <StatTile icon={Target} value={accuracyText(totals.accuracy)} label="overall accuracy" />
            <StatTile icon={TrendingUp} value={accuracyText(totals.avgPercent)} label="average score" />
            <StatTile icon={Award} value={accuracyText(totals.bestPercent)} label="best score" />
            <StatTile icon={Timer} value={String(Math.round(totals.minutes))} label="minutes in exams" />
          </Reveal>

          {/* ── Score trend ── */}
          {trendTests.length > 0 && (
            <Reveal index={2} className="space-y-3">
              <SectionTitle>Score trend — last {trendTests.length} {trendTests.length === 1 ? 'test' : 'tests'}</SectionTitle>
              <div className="glass rounded-2xl p-4 md:p-5">
                <div
                  className={cn('flex min-w-max items-end gap-2 overflow-x-auto pb-1 pt-2', '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line')}
                  role="img"
                  aria-label="Vertical bars of score percent per test"
                >
                  {trendTests.map((t, i) => {
                    const isBest = bestPercent != null && Math.round(t.percent) >= Math.round(bestPercent) && t.percent === Math.max(...trendTests.map((x) => x.percent))
                    const h = Math.max(8, Math.round((Math.max(0, Math.min(100, t.percent)) / 100) * 128))
                    return (
                      <motion.button
                        key={t.attemptId}
                        type="button"
                        onClick={() => onOpenAnalysis(t.attemptId)}
                        title={`${t.label} — ${Math.round(t.percent)}% (${relTime(t.at)})`}
                        aria-label={`${t.label}, score ${Math.round(t.percent)} percent, ${relTime(t.at)}`}
                        className="group flex w-9 shrink-0 flex-col items-center justify-end gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isBest && <span className="size-1.5 rounded-full bg-sev-warn" aria-label="best score" />}
                        <motion.span
                          className="w-full rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary"
                          style={{ height: h }}
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: EASE }}
                        />
                      </motion.button>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/70 pt-3">
                  {trendTests.map((t) => (
                    <button
                      key={`acc-${t.attemptId}`}
                      type="button"
                      onClick={() => onOpenAnalysis(t.attemptId)}
                      title={`${t.label} — accuracy ${accuracyText(t.accuracy)}`}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        accuracyTone(t.accuracy) === 'ok' && 'border-sev-ok/30 bg-sev-ok/10 text-sev-ok',
                        accuracyTone(t.accuracy) === 'warn' && 'border-sev-warn/30 bg-sev-warn/10 text-sev-warn',
                        accuracyTone(t.accuracy) === 'crit' && 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit',
                      )}
                    >
                      {Math.round(t.accuracy)}%
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>
          )}

          {/* ── Consistency ── */}
          {payload.consistency && (
            <Reveal index={3} className="space-y-3">
              <SectionTitle>Consistency</SectionTitle>
              <div className="glass space-y-2 rounded-2xl p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    <Flame className="size-3.5" aria-hidden /> {payload.consistency.band}
                  </span>
                  {payload.consistency.spread != null && (
                    <span className="text-xs tabular-nums text-ink-soft">spread {Math.round(payload.consistency.spread)} pts</span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-ink-soft">{payload.consistency.note}</p>
              </div>
            </Reveal>
          )}

          {/* ── Subject performance ── */}
          {payload.subjects.length > 0 && (
            <Reveal index={4} className="space-y-3">
              <SectionTitle>Subject performance</SectionTitle>
              <div className="glass space-y-3.5 rounded-2xl p-4 md:p-5">
                {payload.subjects.map((s) => {
                  const tone = accuracyTone(s.accuracy)
                  return (
                    <div key={s.subjectCode} className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                        <span className="text-[11px] tabular-nums text-ink-soft">{s.tests} {s.tests === 1 ? 'test' : 'tests'}</span>
                        <TrendChip trend={s.trend} />
                        <span className={cn('shrink-0 text-xs font-bold tabular-nums', toneClass(tone))}>
                          {accuracyText(s.accuracy)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="presentation">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            tone === 'ok' ? 'bg-sev-ok' : tone === 'warn' ? 'bg-sev-warn' : 'bg-sev-crit',
                          )}
                          style={{ width: `${Math.max(0, Math.min(100, s.accuracy))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Reveal>
          )}

          {/* ── Revision impact ── */}
          {payload.revisionImpact && (
            <Reveal index={5} className="space-y-3">
              <SectionTitle>Revision impact</SectionTitle>
              <div className="glass space-y-3 rounded-2xl p-4 md:p-5">
                <div className="grid grid-cols-2 gap-2.5 sm:max-w-sm">
                  <div className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Revised topics</p>
                    <p className="text-lg font-semibold tabular-nums text-sev-ok">{accuracyText(payload.revisionImpact.revisedAccuracy)}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Unrevised</p>
                    <p className="text-lg font-semibold tabular-nums text-ink-soft">{accuracyText(payload.revisionImpact.unrevisedAccuracy)}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-ink-soft">{payload.revisionImpact.note}</p>
                <p className="text-[11px] text-ink-soft">measured on {payload.revisionImpact.sample} {payload.revisionImpact.sample === 1 ? 'question' : 'questions'}</p>
              </div>
            </Reveal>
          )}
        </>
      )}

      {/* ── Honest percentile note ── */}
      <Reveal index={6}>
        <p className="rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-[11px] leading-relaxed text-ink-soft">
          {payload.percentileNote}
        </p>
      </Reveal>
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function TrendChip({ trend }: { trend: number | null }) {
  if (trend == null || trend === 0) {
    return <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">—</span>
  }
  const up = trend > 0
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums',
        up ? 'border-sev-ok/30 bg-sev-ok/10 text-sev-ok' : 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit',
      )}
    >
      {up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
      {signed(trend)}
    </span>
  )
}

function HistorySkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-4 w-36 rounded-md" />
        <Skeleton className="shimmer h-9 w-64 max-w-full rounded-lg" />
        <Skeleton className="shimmer h-4 w-full max-w-md rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="shimmer h-56 rounded-2xl" />
      <Skeleton className="shimmer h-40 rounded-2xl" />
    </div>
  )
}
