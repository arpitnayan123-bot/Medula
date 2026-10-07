'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  CalendarDays,
  Clock,
  History,
  Lightbulb,
  RefreshCw,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { ProgressPayload, SubjectSummary } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader } from '@/components/primitives/kit'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LoadState = 'loading' | 'ready' | 'error'
type HeatCell = { date: string; minutes: number; questions: number } | null

// ─── Primitives ──────────────────────────────────────────────────────────────

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
      transition={{ duration: 0.9, delay: reduce ? 0 : delay, ease: EASE }}
    />
  )
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (reduce) return
    const controls = animate(0, value, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span className={className}>{reduce ? value : display}</span>
}

function ProgressRing({
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
  children?: React.ReactNode
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
            <stop offset="0%" stopColor="#16788c" />
            <stop offset="100%" stopColor="#5cb491" />
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
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">{children}</h2>
}

function toneFor(v: number): string {
  if (v < 40) return 'bg-sev-crit'
  if (v < 70) return 'bg-sev-warn'
  return 'bg-sev-ok'
}

const STATUS_META: Record<SubjectSummary['status'], { label: string; cls: string }> = {
  strong: { label: 'Strong', cls: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok' },
  unstable: { label: 'Unstable', cls: 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn' },
  weak: { label: 'Weak', cls: 'border-sev-crit/40 bg-sev-crit/10 text-sev-crit' },
  new: { label: 'New', cls: 'border-line bg-surface-2 text-ink-soft' },
}

// ─── Loading / Error states ──────────────────────────────────────────────────

function ProgressSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-9 w-48 rounded-lg" />
        <Skeleton className="shimmer h-4 w-2/3 rounded-md md:w-1/3" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-44 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="shimmer h-56 rounded-2xl" />
      <Skeleton className="shimmer h-72 rounded-2xl" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function ProgressError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your progress</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The analytics engine did not respond. Your history is stored safely — retry when ready.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

const HEAT_COLORS = ['bg-surface-2', 'bg-sev-ok/25', 'bg-sev-ok/45', 'bg-sev-ok/70', 'bg-sev-ok'] as const

function StudyHeatmap({ heat }: { heat: ProgressPayload['heatmap'] }) {
  const { weeks, monthLabels, totals } = useMemo(() => {
    const cells: HeatCell[] = heat.map((d) => ({ date: d.date, minutes: d.minutes, questions: d.questions }))
    const firstCell = cells[0]
    if (!firstCell) return { weeks: [] as HeatCell[][], monthLabels: [] as { col: number; label: string }[], totals: { minutes: 0, questions: 0 } }

    const first = new Date(`${firstCell.date}T00:00:00`)
    const pad = (first.getDay() + 6) % 7 // Monday-first offset
    const padded: HeatCell[] = [...Array.from({ length: pad }, () => null), ...cells]
    while (padded.length % 7 !== 0) padded.push(null)

    const wk: HeatCell[][] = []
    for (let i = 0; i < padded.length; i += 7) wk.push(padded.slice(i, i + 7))

    const labels: { col: number; label: string }[] = []
    let lastMonth = -1
    wk.forEach((week, ci) => {
      const fd = week.find(Boolean)
      if (!fd) return
      const d = new Date(`${fd.date}T00:00:00`)
      if (d.getDate() <= 7 && d.getMonth() !== lastMonth) {
        labels.push({ col: ci, label: d.toLocaleString('en-GB', { month: 'short' }) })
        lastMonth = d.getMonth()
      }
    })

    const totals = heat.reduce(
      (acc, d) => ({ minutes: acc.minutes + d.minutes, questions: acc.questions + d.questions }),
      { minutes: 0, questions: 0 },
    )
    return { weeks: wk, monthLabels: labels, totals }
  }, [heat])

  const max = useMemo(() => Math.max(60, ...heat.map((d) => d.minutes + d.questions)), [heat])

  const levelFor = (cell: HeatCell): number => {
    if (!cell) return -1
    const v = cell.minutes + cell.questions
    if (v <= 0) return 0
    const r = v / max
    if (r < 0.25) return 1
    if (r < 0.5) return 2
    if (r < 0.75) return 3
    return 4
  }

  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-max">
        {/* month labels */}
        <div className="mb-1 flex gap-[3px] pl-8">
          {weeks.map((_, ci) => {
            const label = monthLabels.find((m) => m.col === ci)
            return (
              <div key={ci} className="w-3 whitespace-nowrap text-[9px] leading-none text-muted-foreground">
                {label ? label.label : ''}
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          {/* weekday labels M W F */}
          <div className="flex flex-col gap-[3px]">
            {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
              <div key={i} className="flex h-3 w-5 items-center justify-end text-[9px] leading-none text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          {/* weeks grid */}
          <div className="flex gap-[3px]">
            {weeks.map((week, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {week.map((cell, ri) => {
                  const lvl = levelFor(cell)
                  return (
                    <div
                      key={ri}
                      title={
                        cell
                          ? `${fmtDay(cell.date)} · ${cell.minutes} min · ${cell.questions} questions`
                          : undefined
                      }
                      className={cn('size-3 rounded-sm', lvl < 0 ? 'bg-transparent' : HEAT_COLORS[lvl])}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        {/* legend */}
        <div className="mt-3 flex items-center gap-2 pl-8 text-[10px] text-muted-foreground">
          <span>less</span>
          {HEAT_COLORS.map((c) => (
            <span key={c} className={cn('size-3 rounded-sm', c)} />
          ))}
          <span>more</span>
          <span className="ml-3 hidden sm:inline">
            {totals.minutes.toLocaleString('en-IN')} min · {totals.questions.toLocaleString('en-IN')} questions · last 120 days
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Weekly narrative ────────────────────────────────────────────────────────

function narrativeIcon(s: string): LucideIcon {
  const l = s.toLowerCase()
  if (l.includes('mistake') || l.includes('error')) return AlertTriangle
  if (l.includes('stable') || l.includes('least') || l.includes('weak')) return Target
  if (l.includes('accuracy')) return TrendingUp
  if (l.includes('time') || l.includes('day')) return Clock
  return BookOpen
}

function narrativeTone(s: string): string {
  const l = s.toLowerCase()
  if (l.includes('mistake') || l.includes('error')) return 'bg-sev-crit/10 text-sev-crit'
  if (l.includes('dipped') || l.includes('debt stands')) return 'bg-sev-warn/10 text-sev-warn'
  if (l.includes('accuracy') || l.includes('clear')) return 'bg-sev-ok/10 text-sev-ok'
  return 'bg-info/10 text-info'
}

function ReportChip({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/70 px-3 py-2 text-xs">
      <span className={cn('size-2 shrink-0 rounded-full', dot)} />
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}

// ─── Subject card ────────────────────────────────────────────────────────────

function SubjectCard({ s, maxWeight, index }: { s: ProgressPayload['subjects'][number]; maxWeight: number; index: number }) {
  const metrics: { label: string; value: number }[] = [
    { label: 'Progress', value: s.mastery },
    { label: 'Foundation', value: s.foundation },
    { label: 'Clinical application', value: s.clinical },
    { label: 'Question accuracy', value: s.accuracy },
  ]
  const status = STATUS_META[s.status]
  return (
    <motion.article
      className="clay rounded-2xl p-4 md:p-5"
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: (index % 2) * 0.06, ease: EASE }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
        <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight">{s.name}</h3>
        <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
          Year {s.year}
        </span>
        {s.debt > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md border border-sev-warn/40 bg-sev-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-sev-warn">
            <History className="size-3" />
            Revision debt: {s.debt}
          </span>
        )}
        <span className={cn('ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', status.cls)}>
          {status.label}
        </span>
      </div>

      {/* NEET weight */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>NEET-PG weight</span>
          <span className="font-semibold tabular-nums">~{s.neetWeight}%</span>
        </div>
        <div className="clay-in mt-1 h-1 w-full overflow-hidden rounded-full">
          <Bar
            pct={maxWeight > 0 ? (s.neetWeight / maxWeight) * 100 : 0}
            delay={0.15 + (index % 2) * 0.05}
            className="shrink-0 rounded-full"
          />
        </div>
      </div>

      {/* metrics */}
      <dl className="mt-4 space-y-2.5">
        {metrics.map((m, i) => (
          <div key={m.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <dt className="text-xs text-ink-soft">{m.label}</dt>
            <dd className="text-xs font-semibold tabular-nums">{m.value}%</dd>
            <div className="clay-in col-span-2 h-1.5 w-full overflow-hidden rounded-full">
              <Bar pct={m.value} delay={0.2 + i * 0.05} className={toneFor(m.value)} />
            </div>
          </div>
        ))}
      </dl>
    </motion.article>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function ProgressView() {
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const [data, setData] = useState<ProgressPayload | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.progress().then(
      (payload) => {
        if (cancelled) return
        setData(payload)
        setStatus('ready')
      },
      () => {
        if (cancelled) return
        setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const retry = useCallback(() => {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }, [])

  if (status === 'loading') return <ProgressSkeleton />
  if (status === 'error' || !data) return <ProgressError onRetry={retry} />

  const { overall, subjects, heatmap, weeklyReport, errorPatterns, confusions } = data
  // clinical vignette accuracy is optional — render the card only when the backend provides it
  const wr = weeklyReport as ProgressPayload['weeklyReport'] & { clinicalAccuracy?: number }
  const clinical = typeof wr.clinicalAccuracy === 'number' ? wr.clinicalAccuracy : null

  const trendUp = overall.trend >= 0
  const activeDays = Math.round((weeklyReport.consistency / 100) * 7)
  const maxWeight = Math.max(...subjects.map((s) => s.neetWeight), 1)

  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd.getTime() - 6 * 86400000)
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-6">
      {/* Header */}
      <Reveal index={0}>
        <PageHeader
          eyebrow={
            <>
              <TrendingUp className="mr-1 inline size-3" />
              Learning analytics
            </>
          }
          title="Progress"
          intro="Your past self is the only benchmark that matters here."
        />
      </Reveal>

      {/* 1 · Top stat row */}
      <Reveal index={1}>
        <div
          className={cn(
            'grid grid-cols-1 gap-3 sm:grid-cols-2',
            clinical !== null ? 'md:grid-cols-4' : 'md:grid-cols-3',
          )}
        >
          {/* Mastery ring */}
          <section className="clay flex flex-col items-center rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Mastery</p>
            <div className="my-3">
              <ProgressRing value={overall.mastery} size={132} stroke={11} gradientId="ring-progress-mastery">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">
                  <AnimatedNumber value={overall.mastery} />%
                </span>
              </ProgressRing>
            </div>
            <p className="text-center text-[11px] italic text-muted-foreground">learning analytics indicator</p>
          </section>

          {/* Accuracy + trend */}
          <section className="clay flex flex-col rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Accuracy</p>
            <p className="mt-3 text-5xl font-semibold leading-none tabular-nums tracking-tight">
              <AnimatedNumber value={overall.accuracy} />%
            </p>
            <span
              className={cn(
                'mt-auto inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold',
                trendUp ? 'bg-sev-ok/10 text-sev-ok' : 'bg-sev-crit/10 text-sev-crit',
              )}
            >
              {trendUp ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {trendUp ? '+' : ''}
              {overall.trend}% vs last week
            </span>
          </section>

          {/* Clinical questions — optional */}
          {clinical !== null && (
            <section className="clay flex flex-col rounded-2xl p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Clinical questions</p>
              <p className="mt-3 text-5xl font-semibold leading-none tabular-nums tracking-tight">
                <AnimatedNumber value={clinical} />%
              </p>
              <p className="mt-auto text-xs text-ink-soft">accuracy on vignette-style questions</p>
            </section>
          )}

          {/* Consistency */}
          <section className="clay flex flex-col rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Consistency</p>
            <p className="mt-3 text-5xl font-semibold leading-none tabular-nums tracking-tight">
              <AnimatedNumber value={weeklyReport.consistency} />%
            </p>
            <div className="mt-auto">
              <div className="flex gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'size-2.5 rounded-full border',
                      i < activeDays ? 'border-transparent bg-sev-ok' : 'border-line bg-surface-2',
                    )}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">{activeDays} of 7 active days this week</p>
            </div>
          </section>
        </div>
      </Reveal>

      {/* 2 · Study heatmap */}
      <Reveal index={2} className="space-y-3">
        <SectionHeading>Study heatmap</SectionHeading>
        <section className="clay rounded-2xl p-4 md:p-6">
          <StudyHeatmap heat={heatmap} />
        </section>
      </Reveal>

      {/* 3 · Weekly medical intelligence report */}
      <Reveal index={3} className="space-y-3">
        <SectionHeading>Weekly medical intelligence report</SectionHeading>
        <section className="clay rounded-2xl border-l-4 border-l-primary p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              <TrendingUp className="size-4" />
              This week&apos;s reading of your brain
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-soft">
              <CalendarDays className="size-3.5" />
              {fmt(rangeStart)} – {fmt(rangeEnd)}
            </span>
          </div>

          <ul className="mt-4 space-y-2.5">
            {weeklyReport.narrative.map((line, i) => {
              const Icon = narrativeIcon(line)
              return (
                <li key={i} className="flex items-start gap-3">
                  <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', narrativeTone(line))}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="text-sm leading-relaxed">{line}</span>
                </li>
              )
            })}
          </ul>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <ReportChip label="Weakest system" value={weeklyReport.weakest} dot="bg-sev-crit" />
            <ReportChip label="Strongest system" value={weeklyReport.strongest} dot="bg-sev-ok" />
            <ReportChip label="Top mistake" value={weeklyReport.topMistake} dot="bg-sev-warn" />
          </div>
        </section>
      </Reveal>

      {/* 4 · Subject dashboards */}
      <Reveal index={4} className="space-y-3">
        <SectionHeading>Subject dashboards</SectionHeading>
        <div className="grid gap-3 md:grid-cols-2">
          {subjects.map((s, i) => (
            <SubjectCard key={s.id} s={s} maxWeight={maxWeight} index={i} />
          ))}
        </div>
      </Reveal>

      {/* 5 · Error intelligence */}
      <Reveal index={5} className="space-y-3">
        <SectionHeading>Error intelligence</SectionHeading>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* left — error patterns */}
          <section className="clay rounded-2xl p-4 md:p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Error patterns</h3>
            {errorPatterns.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                className="mt-3 border-0 bg-transparent px-0 py-6"
                title="No error patterns recorded yet"
                hint="mistakes here become intelligence, not shame."
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {errorPatterns.map((p) => (
                  <li key={p.errorType} className="rounded-xl border border-line/60 bg-surface-2/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">{p.errorType}</span>
                      <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-soft">
                        {p.count}
                      </span>
                    </div>
                    {p.examples.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.examples.map((ex) => (
                          <span
                            key={ex.concept}
                            className="rounded-md border border-line/60 bg-background/40 px-2 py-0.5 text-[10px] text-ink-soft"
                          >
                            {ex.concept} ×{ex.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* right — confusion list */}
          <section className="clay rounded-2xl p-4 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Your confusion list</h3>
              <span className="text-[10px] text-muted-foreground">pairs the engine watches for you</span>
            </div>
            {confusions.length === 0 ? (
              <EmptyState
                icon={Brain}
                className="mt-3 border-0 bg-transparent px-0 py-6"
                title="No confusion pairs on your watchlist yet."
              />
            ) : (
              <ul className="mt-3 space-y-3">
                {confusions.map((c) => (
                  <li key={c.id} className="rounded-xl border border-line/60 bg-surface-2/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary">
                        {c.subjectCode}
                      </span>
                      {c.detected ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-crit/40 bg-sev-crit/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-sev-crit">
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sev-crit opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-sev-crit" />
                          </span>
                          DETECTED
                        </span>
                      ) : (
                        <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-soft">
                          Watchlist
                        </span>
                      )}
                    </div>

                    {/* a vs b */}
                    <div className="mt-2.5 overflow-hidden rounded-lg border border-line/60">
                      <div className="grid grid-cols-2">
                        <div className="bg-primary/15 px-3 py-2 text-center text-xs font-bold leading-tight tracking-tight text-primary">
                          {c.a}
                        </div>
                        <div className="border-l border-line bg-sev-warn/15 px-3 py-2 text-center text-xs font-bold leading-tight tracking-tight text-sev-warn">
                          {c.b}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
                        <ul className="space-y-1.5 p-3">
                          {c.aPoints.map((pt) => (
                            <li key={pt} className="flex gap-1.5 text-[11px] leading-snug text-ink-soft">
                              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/70" />
                              {pt}
                            </li>
                          ))}
                        </ul>
                        <ul className="space-y-1.5 p-3">
                          {c.bPoints.map((pt) => (
                            <li key={pt} className="flex gap-1.5 text-[11px] leading-snug text-ink-soft">
                              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-sev-warn/70" />
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* mnemonic strip */}
                    <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-accent/60 px-3 py-2">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-sev-warn" />
                      <p className="text-[11px] italic leading-relaxed text-ink-soft">{c.mnemonic}</p>
                    </div>

                    {/* pair drill hand-off */}
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setQuizPreset({ pairId: c.id, pairLabel: `${c.a} vs ${c.b}`, count: 6 })
                          setView('questions')
                        }}
                        className={cn(
                          'min-h-9 gap-1.5 text-xs',
                          c.detected && 'border-sev-crit/40 text-sev-crit hover:bg-sev-crit/10',
                        )}
                      >
                        <Zap className="size-3.5" />
                        {c.detected ? 'You mixed these up — drill now' : 'Drill this pair'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          try {
                            sessionStorage.setItem('medos:tutor-pair', c.id)
                          } catch {
                            /* storage unavailable — the tutor view simply won't auto-open the drill */
                          }
                          setView('tutor')
                        }}
                        className="min-h-9 gap-1.5 text-xs"
                      >
                        <Brain className="size-3.5" />
                        Socratic AI drill
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Reveal>
    </div>
  )
}
