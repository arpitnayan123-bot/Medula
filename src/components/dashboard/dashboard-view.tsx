'use client'

// ─── HOMEPAGE — strict redesign: calm sky-blue, one clear job per screen ────
// Order: greeting → today's mission (the one hero) → 4 quick numbers →
// focus now (3 weak spots) → all subjects → internship (yr ≥5) → source line.
// Removed in the redesign: knowledge-split mega panel, readiness component
// tables, the old next-best-action card, decorative trust strip.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  Clock3,
  History,
  Layers,
  Play,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Command,
  Timer,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { PREP_STAGE_LABELS } from '@/lib/types'
import type { DashboardPayload, PlanSegment } from '@/lib/types'
import type { MapInsights } from '@/app/api/map-insights/route'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SubjectIndex } from '@/components/dashboard/subject-index'
import { InternshipPanel } from '@/components/dashboard/internship-panel'
import { HeroAnatomy } from '@/components/brand/hero-anatomy'
import { Magnetic, ScrollReveal, Stagger, StaggerItem } from '@/components/primitives/motion'
import { BlobField } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LoadState = 'loading' | 'ready' | 'error'
type ReadinessPayload = Awaited<ReturnType<typeof api.readiness>>

// ─── Primitives ──────────────────────────────────────────────────────────────

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (reduce) return
    const controls = animate(0, value, {
      duration: 0.9,
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
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
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

// Compact number tile — icon, value, one-line label. 4 of these max.
function StatTile({
  icon: Icon,
  value,
  label,
  suffix,
  tone,
  children,
}: {
  icon: typeof Timer
  value: number
  label: string
  suffix?: string
  tone: 'sky' | 'warn' | 'crit' | 'ok'
  children?: ReactNode
}) {
  const tones = {
    sky: 'bg-primary/10 text-primary',
    warn: 'bg-sev-warn/12 text-sev-warn',
    crit: 'bg-sev-crit/10 text-sev-crit',
    ok: 'bg-sev-ok/10 text-sev-ok',
  } as const
  return (
    <div className="clay clay-hover flex items-center gap-3 rounded-2xl p-3.5">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl shadow-well', tones[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold tabular-nums leading-tight tracking-tight">
          <AnimatedNumber value={value} />
          {suffix && <span className="ml-0.5 text-sm font-medium text-ink-soft">{suffix}</span>}
        </p>
        <p className="truncate text-[11px] leading-snug text-ink-soft">{label}</p>
      </div>
      {children}
    </div>
  )
}

function SegmentRow({ index, seg }: { index: number; seg: PlanSegment }) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-card/70">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary shadow-well">
        {index + 1}
      </span>
      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{seg.minutes} min</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{seg.activity}</p>
        <p className="truncate text-xs text-ink-soft">{seg.detail}</p>
      </div>
    </div>
  )
}

// ─── Loading / Error states ──────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6" aria-busy="true" role="status">
      <Skeleton className="shimmer h-10 w-3/4 rounded-lg md:w-1/2" />
      <Skeleton className="shimmer h-64 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="shimmer h-44 rounded-2xl" />
      <Skeleton className="shimmer h-56 rounded-2xl" />
    </div>
  )
}

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card/70 p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <AlertTriangle className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your dashboard</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The learning engine did not respond. Check your connection and try again — your progress data is safe.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

// Time-aware human greeting — the campus door, not a dashboard label.
function useGreeting() {
  const profile = useAppStore((s) => s.profile)
  // This view only renders after the profile hydrates client-side (page.tsx
  // gates on profile), so reading the clock during init is hydration-safe.
  const [hour] = useState(() => new Date().getHours())
  const first = profile?.name?.trim()?.split(/\s+/)[0]
  const word = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const line =
    hour < 12
      ? 'Ready to understand medicine a little deeper today?'
      : hour < 17
        ? 'Let\u2019s continue your journey through medicine.'
        : 'One quiet hour with medicine tonight goes a long way.'
  return { title: first ? `${word}, ${first}.` : `${word}, Doctor.`, line }
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function DashboardView() {
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const setAuditOpen = useAppStore((s) => s.setAuditOpen)
  const setMapScope = useAppStore((s) => s.setMapScope)
  // Hooks stay above every early return — greeting reads the clock + profile.
  const greeting = useGreeting()

  const [data, setData] = useState<DashboardPayload | null>(null)
  const [insights, setInsights] = useState<MapInsights | null>(null)
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.dashboard(), api.mapInsights().catch(() => null), api.readiness().catch(() => null)]).then(
      ([d, ins, rdy]) => {
        if (cancelled) return
        setData(d)
        setInsights(ins)
        setReadiness(rdy)
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

  if (status === 'loading') return <DashboardSkeleton />
  if (status === 'error' || !data) return <DashboardError onRetry={retry} />

  const { stageLabel, prepStage, brainScore, stats, knowledgeSplit, revisionDebt, nextAction, todayPlan, heatToday } = data

  const stageLabelText = PREP_STAGE_LABELS[prepStage] ?? prepStage
  const missionTotal = todayPlan.reduce((a, s) => a + s.minutes, 0)
  const missionPct =
    stats.recommendedMinutes > 0 ? Math.min(100, Math.round((heatToday.minutes / stats.recommendedMinutes) * 100)) : 0
  const conceptsMapped = knowledgeSplit.strong + knowledgeSplit.unstable + knowledgeSplit.weak + knowledgeSplit.new
  const needsAudit = conceptsMapped === 0

  const startMission = () => {
    if (nextAction) {
      setQuizPreset({ conceptId: nextAction.conceptId, count: 5 })
      setView('questions')
    } else {
      setView('progress')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 overflow-x-clip p-4 md:p-6">
      {/* 1+2 · THE PORCH — greeting + today's mission on one porcelain podium,
          watched over by the anatomical hero */}
      <ScrollReveal>
        <section
          className="podium relative overflow-hidden rounded-3xl p-5 md:p-7"
          aria-label="Today's mission"
        >
          <BlobField className="opacity-60" />
          <div className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full bg-[#f3d5a4]/40 blur-3xl scene-float" aria-hidden />
          <div className="pointer-events-none absolute -left-12 -bottom-4 size-44 rounded-full bg-[#c9e8d4]/35 blur-3xl scene-float" aria-hidden />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              {/* the human greeting */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  {greeting.title}
                </h1>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line/80 bg-card/80 px-3 py-1.5 text-xs font-medium text-ink-soft shadow-sm">
                  <Timer className="size-3.5 text-gold" aria-hidden />
                  {stats.streak}-day streak
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {greeting.line} <span className="text-ink-soft/60">·</span> {stageLabel} · {stageLabelText}
              </p>

              {/* the day's mission */}
              <div className="mt-5 rounded-2xl border border-white/50 bg-card/60 p-4 shadow-raised backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Today&apos;s mission</p>
                    <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                      {missionTotal > 0 ? `${missionTotal} minutes to stay on track` : 'Your plan is ready'}
                    </h2>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                    {heatToday.minutes}/{stats.recommendedMinutes} min done
                  </span>
                </div>

                {/* progress */}
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2 shadow-well">
                    <Bar pct={missionPct} className="bg-gradient-to-r from-primary via-primary to-[oklch(0.62_0.105_158)]" delay={0.25} />
                  </div>
                </div>

                {/* plan segments */}
                {todayPlan.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {todayPlan.slice(0, 4).map((seg, i) => (
                      <SegmentRow key={`${seg.activity}-${i}`} index={i} seg={seg} />
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Magnetic>
                    <Button size="lg" className="clay-btn min-h-11 flex-1 sm:flex-none sm:px-8" onClick={startMission}>
                      <Play className="size-4" /> Start today&apos;s mission
                    </Button>
                  </Magnetic>
                  <Button size="lg" variant="outline" className="clay-btn-soft min-h-11 border-0 bg-transparent" onClick={() => setView('revise')}>
                    Open in Revise
                  </Button>
                </div>
              </div>
            </div>

            {/* the anatomical presence — the campus emblem */}
            <div className="mx-auto w-full max-w-[260px] shrink-0 self-end md:mx-0 md:max-w-[330px]">
              <HeroAnatomy />
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* 3 · Four quick numbers — the whole day at a glance */}
      <ScrollReveal className="space-y-3">
        <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StaggerItem className="h-full">
            <StatTile
              icon={Brain}
              value={readiness?.overall ?? brainScore}
              suffix="%"
              label="NEET-PG readiness"
              tone="sky"
            />
          </StaggerItem>
          <StaggerItem className="h-full">
            <StatTile icon={BookOpen} value={stats.dueQuestions} label="questions due" tone="sky" />
          </StaggerItem>
          <StaggerItem className="h-full">
            <StatTile icon={Layers} value={stats.dueFlashcards} label="flashcards due" tone="warn" />
          </StaggerItem>
          <StaggerItem className="h-full">
            <StatTile icon={History} value={revisionDebt.count} label="topics need revision" tone={revisionDebt.count > 0 ? 'crit' : 'ok'} />
          </StaggerItem>
        </Stagger>
        {revisionDebt.count > 0 && (
          <p className="px-1 text-xs text-ink-soft">
            Revision debt ≈ {revisionDebt.minutes} min ·{' '}
            <button type="button" onClick={() => setView('revise')} className="font-medium text-primary hover:underline">
              clear it now
            </button>
          </p>
        )}
        <p className="px-1 text-xs text-ink-soft">
          Full picture — what limits you and what to do next ·{' '}
          <button type="button" onClick={() => setView('performance')} className="font-medium text-primary hover:underline">
            open Performance Intelligence
          </button>
        </p>
      </ScrollReveal>

      {/* 3b · First-run audit banner — only when nothing is mapped yet */}
      {needsAudit && (
        <ScrollReveal>
          <section className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center md:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
              <ScanSearch className="size-5 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight">Take the 3-minute knowledge audit</h3>
              <p className="mt-0.5 text-sm text-ink-soft">
                A short diagnostic maps what you know — every recommendation gets sharper.
              </p>
            </div>
            <Button className="min-h-11" onClick={() => setAuditOpen(true)}>
              Start audit
            </Button>
          </section>
        </ScrollReveal>
      )}

      {/* 4 · One system pointer — the OS command center owns "what next" and
          the weak-topic ranking; this page owns the plan, subjects, internship.
          No second arbiter, no duplicated weak-spots list. */}
      {!needsAudit && (
        <ScrollReveal>
          <button
            type="button"
            onClick={() => setView('os')}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-line bg-card/60 px-3.5 py-2.5 text-left transition-colors hover:border-primary/40"
            aria-label="Open your command center — what to do next, weak topics and today's plan in one place"
          >
            <Command className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 text-xs text-ink-soft">
              <span className="font-medium text-foreground">What should I do next?</span>{' '}
              Your command center ranks revision, practice, mistakes and mocks in one place.
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
          </button>
        </ScrollReveal>
      )}

      {/* 5 · All subjects — crisp grid; tap → Doubt Search scoped to the subject */}
      <ScrollReveal>
        <SubjectIndex insights={insights} />
      </ScrollReveal>

      {/* 6 · Internship mode — rotation-based plan (renders only for year ≥ 5) */}
      <InternshipPanel />

      {/* 7 · Source line — one quiet sentence, no banner */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-sev-ok" aria-hidden />
          NMC CBME 2024 aligned · NBEMS blueprint · WHO ICD-11 terms · original content only
        </span>
        <span>
          Doubts? Tap <Clock3 className="inline size-3" aria-hidden /> Search — type any topic.
        </span>
      </p>
    </div>
  )
}
