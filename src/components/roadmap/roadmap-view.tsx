'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Flag,
  GraduationCap,
  Leaf,
  ListChecks,
  RefreshCw,
  Repeat,
  RotateCcw,
  Target,
  Timer,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { RoadmapPayload, RoadmapPhase, WeekDayPlan } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/primitives/kit'
import { SpringNumber, Stagger, StaggerItem } from '@/components/primitives/motion'
import { DotMatrix } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LoadState = 'loading' | 'ready' | 'error'

const SPLIT_COLORS = ['bg-primary', 'bg-sev-ok', 'bg-sev-warn', 'bg-info', 'bg-muted-foreground/50'] as const

// Week-planner block palette (kind → icon + chip classes)
const BLOCK_KIND: Record<string, { icon: LucideIcon; chip: string; bar: string; label: string }> = {
  college: { icon: GraduationCap, chip: 'bg-info/10 text-info', bar: 'bg-info', label: 'College' },
  questions: { icon: ListChecks, chip: 'bg-primary/10 text-primary', bar: 'bg-primary', label: 'Questions' },
  revision: { icon: RotateCcw, chip: 'bg-sev-warn/10 text-sev-warn', bar: 'bg-sev-warn', label: 'Revision' },
  flashcards: { icon: Zap, chip: 'bg-sev-ok/10 text-sev-ok', bar: 'bg-sev-ok', label: 'Recall' },
  mocks: { icon: Timer, chip: 'bg-sev-crit/10 text-sev-crit', bar: 'bg-sev-crit', label: 'Mocks' },
  weakness: { icon: Wrench, chip: 'bg-sev-crit/10 text-sev-crit', bar: 'bg-sev-crit', label: 'Repair' },
  rest: { icon: Leaf, chip: 'bg-surface-2 text-ink-soft', bar: 'bg-muted-foreground/50', label: 'Rest' },
}

// Per-kind CTA in the day detail panel (college / rest get no action)
const BLOCK_ACTION_LABEL: Record<string, string> = {
  questions: 'Practice now',
  mocks: 'Start a mock',
  revision: 'Open Revise',
  flashcards: 'Recall drill',
  weakness: 'Repair weakest on the Map',
}

function fmtDur(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

// Small pulsing "Today" dot — sev-ok, respects reduced motion
function TodayBadge({ reduce }: { reduce: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sev-ok/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sev-ok">
      <span className="relative flex size-1.5">
        {!reduce && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sev-ok opacity-75" />
        )}
        <span className="relative inline-flex size-1.5 rounded-full bg-sev-ok" />
      </span>
      Today
    </span>
  )
}

function DayCard({
  plan,
  index,
  reduce,
  isToday,
  isOpen,
  onToggle,
}: {
  plan: WeekDayPlan
  index: number
  reduce: boolean
  isToday: boolean
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : index * 0.06, ease: EASE }}
      onClick={onToggle}
      className="flex w-[172px] shrink-0 cursor-pointer sm:w-auto"
    >
      {/* Clay surface sits on a static child so framer's transform never fights the CSS */}
      <div
        className={cn(
          'relative flex flex-1 flex-col rounded-2xl p-3',
          isToday ? 'clay border-primary/40!' : 'clay-in',
        )}
      >
        {plan.isWeekend && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-gold/20 via-gold/5 to-transparent"
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-expanded={isOpen}
          aria-controls={`day-panel-${plan.day}`}
          className="relative flex w-full items-center justify-between gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide">{plan.short}</span>
            {isToday && <TodayBadge reduce={reduce} />}
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-soft">{plan.hours}h</span>
            <ChevronDown className={cn('size-3.5 shrink-0 text-ink-soft transition-transform', isOpen && 'rotate-180')} />
          </span>
        </button>
        <ul className="relative mt-2 flex-1 space-y-2">
          {plan.blocks.map((b, i) => {
            const s = BLOCK_KIND[b.kind] ?? BLOCK_KIND.rest
            return (
              <li key={`${b.label}-${i}`} className="flex items-start gap-1.5">
                <span aria-hidden className={cn('mt-0.5 h-4 w-1 shrink-0 rounded-full', s.bar)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium leading-snug">{b.label}</span>
                  <span className={cn('mt-0.5 inline-block rounded-full px-1.5 text-[9px] font-bold tabular-nums', s.chip)}>{fmtDur(b.minutes)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </motion.li>
  )
}

// Expanded day detail — clay-in recessed panel with per-block actions
function DayDetailPanel({
  plan,
  onClose,
  onAction,
}: {
  plan: WeekDayPlan
  onClose: () => void
  onAction: (kind: string) => void
}) {
  const totalMinutes = plan.blocks.reduce((sum, b) => sum + b.minutes, 0)
  return (
    <div
      id={`day-panel-${plan.day}`}
      role="region"
      aria-label={`${plan.day} — detailed plan`}
      className="clay-in mt-3 rounded-2xl border-gold/40! p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">{plan.day}</h3>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-ink-soft">
              {plan.hours}h target
            </span>
            {plan.isWeekend && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
                Weekend
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">
            {fmtDur(totalMinutes)} of planned work · {plan.blocks.length} blocks
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close day details"
          className="size-9 shrink-0 rounded-full text-ink-soft hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      <ul className="mt-4 space-y-2">
        {plan.blocks.map((b, i) => {
          const s = BLOCK_KIND[b.kind] ?? BLOCK_KIND.rest
          const Icon = s.icon
          const actionLabel = BLOCK_ACTION_LABEL[b.kind]
          return (
            <li
              key={`${b.label}-${i}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3"
            >
              <span aria-hidden className={cn('grid size-9 shrink-0 place-items-center rounded-xl', s.chip)}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{b.label}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', s.chip)}>
                    {s.label}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-ink-soft">{fmtDur(b.minutes)}</span>
                </div>
              </div>
              {actionLabel && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto min-h-9 shrink-0"
                  onClick={() => onAction(b.kind)}
                >
                  {actionLabel}
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function MetricChip({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface-2/70 px-3.5 py-2 text-xs">
      <Icon className={cn('size-4 shrink-0', tone)} />
      <span className="font-semibold">{value}</span>
      <span className="text-ink-soft">{label}</span>
    </span>
  )
}

function IntensityDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`Intensity ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'size-1.5 rounded-full',
            i < level ? 'bg-primary' : 'bg-surface-2 border border-line',
          )}
        />
      ))}
    </span>
  )
}

// ─── Phase timeline node ─────────────────────────────────────────────────────

function PhaseNode({ phase, index }: { phase: RoadmapPhase; index: number }) {
  return (
    <li className="relative">
      {/* node dot */}
      <span className="absolute -left-[31px] top-7 flex size-3 items-center justify-center">
        {index === 0 && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        )}
        <span className={cn('relative size-3 rounded-full', index === 0 ? 'bg-primary' : 'bg-muted-foreground/50')} />
      </span>

      <StaggerItem>
        <article
          className={cn(
            'clay rounded-2xl p-4 md:p-5',
            index === 0 && 'border-primary/40 shadow-lg shadow-primary/20',
          )}
        >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight md:text-lg">{phase.phase}</h3>
          <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            {phase.timeframe}
          </span>
          {index === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-ok/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sev-ok">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sev-ok opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-sev-ok" />
              </span>
              You are here
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <span className="hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">intensity</span>
            <IntensityDots level={phase.intensity} />
          </span>
        </div>

        <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-ink-soft">{phase.goal}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {phase.focus.map((f) => (
            <span key={f} className="rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-ink-soft">
              {f}
            </span>
          ))}
        </div>

        <ul className="mt-3 space-y-1.5">
          {phase.actions.map((a) => (
            <li key={a} className="flex items-start gap-2 text-sm leading-snug">
              <Check className="mt-0.5 size-4 shrink-0 text-sev-ok" />
              {a}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-sev-warn/30 bg-sev-warn/10 p-3">
          <Flag className="mt-0.5 size-4 shrink-0 text-sev-warn" />
          <p className="text-xs leading-relaxed">
            <span className="font-bold uppercase tracking-wide text-sev-warn">Milestone · </span>
            {phase.milestone}
          </p>
        </div>
        </article>
      </StaggerItem>
    </li>
  )
}

// ─── Loading / Error states ──────────────────────────────────────────────────

function RoadmapSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-9 w-44 rounded-lg" />
        <Skeleton className="shimmer h-4 w-3/4 rounded-md md:w-1/2" />
      </div>
      <Skeleton className="shimmer h-72 rounded-3xl" />
      <Skeleton className="shimmer h-40 rounded-2xl" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function RoadmapError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your roadmap</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The planning engine did not respond. Your profile is intact — retry to rebuild the plan.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function RoadmapView() {
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const setMapScope = useAppStore((s) => s.setMapScope)

  const [data, setData] = useState<RoadmapPayload | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    let cancelled = false
    api.roadmap().then(
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

  // Block-kind → view hand-off (questions also seeds a small practice preset)
  const runBlockAction = useCallback(
    (kind: string) => {
      switch (kind) {
        case 'questions':
          setQuizPreset({ count: 8 })
          setView('questions')
          break
        case 'mocks':
          setView('questions')
          break
        case 'revision':
        case 'flashcards':
          setView('revise')
          break
        case 'weakness':
          // Hand off to the Medical Map: opens the single weakest concept when
          // there's a clear #1, otherwise auto-runs the struggle-zone tour.
          setMapScope('weakest')
          setView('map')
          break
      }
    },
    [setQuizPreset, setView, setMapScope],
  )

  if (status === 'loading') return <RoadmapSkeleton />
  if (status === 'error' || !data) return <RoadmapError onRetry={retry} />

  const { neetClock, weeklySplit, phases, currentStageLabel, weekPlan } = data

  // Today's weekday — Monday = 0 … Sunday = 6 (weekPlan is built Monday-first)
  const todayIdx = (new Date().getDay() + 6) % 7
  const plannedDays = weekPlan.filter((d) => !d.isWeekend).length
  const plannedMinutes = weekPlan.reduce((sum, d) => sum + d.hours * 60, 0)
  const openPlan = openDay ? (weekPlan.find((p) => p.day === openDay) ?? null) : null

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6">
      {/* Header */}
      <motion.header
        className="space-y-2"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <PageHeader
          eyebrow={
            <>
              <Timer className="mr-1 inline size-3" />
              Your NEET-PG journey
            </>
          }
          title="Roadmap"
          intro="From your classroom today to your NEET-PG attempt — dynamically computed from your profile."
        />
      </motion.header>

      {/* 1 · NEET-PG clock hero */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: reduce ? 0 : 0.08, ease: EASE }}
        className="clay relative overflow-hidden rounded-3xl p-5 md:p-8"
      >
        <DotMatrix />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              <Timer className="size-4 text-primary" />
              NEET-PG clock
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              <Activity className="size-3.5" />
              {neetClock.stage}
            </span>
          </div>

          {/* countdown blocks */}
          <div className="mt-5 grid max-w-xl grid-cols-3 gap-3">
            {[
              { v: neetClock.daysLeft, label: 'days' },
              { v: neetClock.weeksLeft, label: 'weeks' },
              { v: neetClock.monthsLeft, label: 'months' },
            ].map((b) => (
              <div key={b.label} className="rounded-2xl border border-line bg-surface-2/50 p-3 text-center md:p-4">
                <p className="text-4xl font-semibold leading-none tabular-nums tracking-tight md:text-5xl">
                  <SpringNumber value={b.v} />
                </p>
                <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">{b.label}</p>
              </div>
            ))}
          </div>

          {/* exam window */}
          <div className="mt-4">
            <p className="text-sm font-medium">
              Expected exam window: <span className="text-primary">≈ June {neetClock.examYear}</span>
            </p>
            {data.isEstimate && neetClock.isEstimate ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Estimated from typical NBEMS scheduling — verify with official announcements.
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Based on the exam date on your profile.
              </p>
            )}
          </div>

          {/* metric chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            <MetricChip icon={Clock3} value={`≈ ${neetClock.weeklyTarget} h/week`} label="required workload" tone="text-primary" />
            <MetricChip icon={Repeat} value={`${neetClock.revisionCyclesLeft}`} label="revision cycles left" tone="text-info" />
            <MetricChip
              icon={Target}
              value={`${neetClock.questionTarget.toLocaleString('en-IN')}`}
              label="question target"
              tone="text-sev-warn"
            />
            <MetricChip icon={ListChecks} value={`${neetClock.mockTarget}`} label="mock target" tone="text-sev-ok" />
          </div>
        </div>
      </motion.section>

      {/* 2 · Weekly split */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: EASE }}
        className="clay rounded-2xl p-4 md:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">Weekly split</h2>
          <span className="text-[11px] text-muted-foreground">how your hours should divide each week</span>
        </div>
        <div className="mt-4 flex h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
          {weeklySplit.map((seg, i) => (
            <motion.div
              key={seg.label}
              className={cn('h-full', SPLIT_COLORS[i % SPLIT_COLORS.length])}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, seg.pct))}%` }}
              transition={{ duration: 0.8, delay: reduce ? 0 : 0.15 + i * 0.1, ease: EASE }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {weeklySplit.map((seg, i) => (
            <span key={seg.label} className="inline-flex items-center gap-2 text-xs">
              <span className={cn('size-2 shrink-0 rounded-full', SPLIT_COLORS[i % SPLIT_COLORS.length])} />
              <span className="text-ink-soft">{seg.label}</span>
              <span className="font-semibold tabular-nums">{seg.pct}%</span>
            </span>
          ))}
        </div>
      </motion.section>

      {/* 2b · Your week, planned (spec §42/§43) */}
      {weekPlan.length > 0 && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="clay rounded-2xl p-4 md:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">
              Your week, planned
              <CalendarDays aria-hidden className="ml-1.5 inline size-3.5 text-primary" />
            </h2>
            <span className="text-[11px] text-muted-foreground">
              built from the {data.neetClock.stage.toLowerCase()} stage and your declared hours — Sunday evening is mock night
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-3 py-1 text-[11px] font-semibold">
              <CalendarCheck aria-hidden className="size-3.5 text-sev-ok" />
              <span className="tabular-nums">{plannedDays} days planned</span>
              <span aria-hidden className="text-ink-soft">·</span>
              <span className="tabular-nums text-primary">{fmtDur(plannedMinutes)} total</span>
            </p>
            <span className="text-[11px] text-ink-soft">tap a day to see every block</span>
          </div>
          <ul className="med-scroll mt-3 flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-7 md:overflow-visible">
            {weekPlan.map((p, i) => (
              <DayCard
                key={p.day}
                plan={p}
                index={i}
                reduce={reduce ?? false}
                isToday={i === todayIdx}
                isOpen={openDay === p.day}
                onToggle={() => setOpenDay((cur) => (cur === p.day ? null : p.day))}
              />
            ))}
          </ul>
          <AnimatePresence initial={false}>
            {openPlan && (
              <motion.div
                key="day-detail"
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.25, ease: EASE }}
              >
                <DayDetailPanel
                  plan={openPlan}
                  onClose={() => setOpenDay(null)}
                  onAction={runBlockAction}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[10px] text-ink-soft">
            {Object.entries(BLOCK_KIND).map(([kind, s]) => (
              <span key={kind} className="inline-flex items-center gap-1">
                <span aria-hidden className={cn('size-2 rounded-full', s.bar)} />
                {s.label}
              </span>
            ))}
            <span className="ml-auto">Saturday evening stays protected — burnout is a real syllabus risk</span>
          </div>
        </motion.section>
      )}

      {/* 3 · Phases timeline */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">Phases timeline</h2>
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold tracking-wide text-ink-soft">
            {currentStageLabel}
          </span>
        </div>
        <Stagger>
          <ol className="relative ml-2 space-y-4 border-l border-line pl-6 md:ml-4 md:pl-8">
            {phases.map((p, i) => (
              <PhaseNode key={p.phase} phase={p} index={i} />
            ))}
          </ol>
        </Stagger>
      </section>

      {/* 4 · CTA band */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: EASE }}
        className="clay flex flex-col gap-4 rounded-2xl border-l-4 border-l-primary p-5 sm:flex-row sm:items-center md:p-6"
      >
        <div className="flex-1">
          <h2 className="text-lg font-semibold tracking-tight md:text-xl">
            Every phase adapts as your knowledge state changes.
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            This plan is regenerated from your live mastery, revision debt and error patterns — not a fixed syllabus.
          </p>
        </div>
        <Button size="lg" className="min-h-11 shrink-0" onClick={() => setView('home')}>
          SEE TODAY&apos;S MISSION <ArrowRight className="size-4" />
        </Button>
      </motion.section>
    </div>
  )
}
