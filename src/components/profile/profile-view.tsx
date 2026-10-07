'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpenCheck,
  Building2,
  CalendarDays,
  CalendarClock,
  Check,
  CloudOff,
  Flame,
  Gauge,
  GraduationCap,
  Hourglass,
  Info,
  LineChart,
  Loader2,
  LogOut,
  Palette,
  Pencil,
  Route,
  ShieldAlert,
  Target,
  TrendingUp,
  UserRound,
  ArrowRight,
  CircleHelp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { clearStoredSession, useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { useSWStatus, type SWStatus } from '@/hooks/use-sw-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Stagger, StaggerItem } from '@/components/primitives/motion'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ERROR_TYPE_LABELS, PREP_STAGE_LABELS, YEAR_LABELS } from '@/lib/types'
import type { DashboardPayload, Profile, ProgressPayload, RoadmapPayload } from '@/lib/types'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const SEMESTERS = Array.from({ length: 8 }, (_, i) => i + 1)

const YEAR_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: 'Final Year' },
  { value: 5, label: 'Intern' },
  { value: 6, label: 'Dedicated Prep' },
]

const COLLEGE_TYPES = ['Government', 'Private', 'Deemed'] as const
type CollegeType = (typeof COLLEGE_TYPES)[number]

const PREP_OPTIONS: { value: Profile['prepStage']; label: string; desc: string }[] = [
  { value: 'exploring', label: 'Exploring', desc: 'Getting oriented to what NEET-PG demands.' },
  { value: 'foundation', label: 'Building foundation', desc: 'Concepts and early-year basics, done properly.' },
  { value: 'regular', label: 'Regular preparation', desc: 'Consistent study alongside college.' },
  { value: 'serious', label: 'Serious preparation', desc: 'Structured prep with weekly question practice.' },
  { value: 'dedicated', label: 'Dedicated prep', desc: 'Full-time preparation for NEET-PG.' },
  { value: 'revision', label: 'Revision phase', desc: 'Cycles, mocks and gap-closing.' },
]

const STYLE_OPTIONS = ['Visual', 'Text', 'Questions', 'Clinical cases', 'Flashcards', 'Interactive models', 'Audio', 'Mixed']

const RESOURCE_OPTIONS = ['Marrow', 'PW', 'PrepLadder', 'DAMS', 'Cerebellum', 'Other']

const RESOURCE_NOTE =
  'MEDULA sits above your resources — it never copies their content. After a lecture, come here for the recall + questions that make it stick.'

const DISCLAIMER_BULLETS = [
  'Knowledge scores are learning-analytics indicators — not assessments of clinical competence.',
  'Content and structure align to the NMC CBME curriculum.',
  'Exam dates are estimates — always verify with NBEMS and official sources.',
  'MEDULA is for educational use only — never a substitute for clinical judgment.',
]

// Systematic hub ordering — each section is numbered and jump-linked.
const HUB_SECTIONS: { href: string; label: string }[] = [
  { href: '#pf-identity', label: '01 · Identity' },
  { href: '#pf-preparation', label: '02 · Preparation' },
  { href: '#pf-readiness', label: '03 · Readiness' },
  { href: '#pf-progress', label: '04 · Progress' },
  { href: '#pf-roadmap', label: '05 · Roadmap' },
  { href: '#pf-exam', label: 'Settings' },
]

type ReadinessPayload = Awaited<ReturnType<typeof api.readiness>>

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'DR'
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
  return letters || 'DR'
}

// ─── Card shell + small presentational helpers ──────────────────────────────

function Card({
  icon: Icon,
  title,
  index,
  id,
  action,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  index?: string
  id?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn('clay scroll-mt-20 rounded-2xl p-5', className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
          {index && (
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 font-mono text-[10px] font-bold text-primary"
            >
              {index}
            </span>
          )}
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: number; label: string }[]
  value: number
  onChange: (v: number) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-xl border px-3 text-sm font-medium transition-all',
            value === o.value
              ? 'border-primary/60 bg-primary/10 text-foreground shadow-[0_0_20px_-8px_var(--primary)]'
              : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-all',
        selected
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground',
      )}
    >
      {selected && <Check className="size-3.5 text-primary" aria-hidden />}
      {label}
    </button>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {value} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? min)}
        aria-label={label}
        className="mt-3"
      />
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, extra }: { icon: LucideIcon; label: string; value: string; extra?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
      {extra && <div className="ml-auto shrink-0">{extra}</div>}
    </div>
  )
}

function StatBlock({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-center">
      <p className={cn('text-lg font-semibold tabular-nums', accent ?? 'text-foreground')}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{label}</p>
    </div>
  )
}

function ChipRow({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-xs text-ink-soft">{emptyLabel}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-foreground">
          {s}
        </span>
      ))}
    </div>
  )
}

function ScoreRing({ value, band }: { value: number; band: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(100, value)) / 100
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid size-24 shrink-0 place-items-center">
        <svg viewBox="0 0 80 80" className="size-24 -rotate-90" role="img" aria-label={`Readiness ${value} out of 100`}>
          <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" className="text-line" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${filled * c} ${c}`}
          />
        </svg>
        <div className="absolute text-center">
          <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-[10px] uppercase tracking-wide text-ink-soft">/100</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">NEET-PG Readiness</p>
        <p className="mt-0.5 text-xs font-medium text-primary">{band}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
          A learning-analytics composite — not a rank or score prediction.
        </p>
      </div>
    </div>
  )
}

function MiniBar({ label, weight, value, pct, note }: { label: string; weight?: number; value: number; pct?: number; note?: string }) {
  const width = Math.max(0, Math.min(100, pct ?? value))
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          {label}
          {weight != null && <span className="text-ink-soft"> · {weight}%</span>}
        </span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${width}%` }} />
      </div>
      {note && <p className="mt-1 text-[11px] leading-snug text-ink-soft">{note}</p>}
    </div>
  )
}

function SectionCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    // whitespace-normal: shadcn Buttons ship with whitespace-nowrap — without
    // this, long CTA labels force a 430px+ min-content track on mobile grids.
    <Button
      variant="outline"
      onClick={onClick}
      className="mt-4 min-h-11 w-full gap-2 whitespace-normal text-left text-sm leading-snug"
    >
      {label}
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Button>
  )
}

function DigestSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-24 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 rounded-xl" />
      ))}
    </div>
  )
}

function DigestError({ hint, onOpen }: { hint: string; onOpen: () => void }) {
  return (
    <div className="rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-3.5 py-3">
      <p className="text-xs leading-relaxed text-sev-warn">
        This digest is unavailable right now — no numbers are shown rather than stale or invented ones.
      </p>
      <Button variant="outline" onClick={onOpen} className="mt-2.5 min-h-9 gap-2 text-xs">
        {hint}
        <ArrowRight className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}

// ─── 03 · Readiness snapshot (compiled from /api/readiness + /api/dashboard) ──

function ReadinessCard() {
  const setView = useAppStore((s) => s.setView)
  const openConcept = useAppStore((s) => s.openConcept)
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null)
  const [dash, setDash] = useState<DashboardPayload | null>(null)

  useEffect(() => {
    let ok = true
    Promise.all([api.readiness(), api.dashboard()])
      .then(([r, d]) => {
        if (!ok) return
        setReadiness(r)
        setDash(d)
        setState('ready')
      })
      .catch(() => {
        if (ok) setState('error')
      })
    return () => {
      ok = false
    }
  }, [])

  return (
    <Card
      icon={Gauge}
      index="03"
      id="pf-readiness"
      title="Readiness snapshot"
      action={
        <span className="inline-flex items-center gap-1">
          <button
            onClick={() => setView('performance')}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Performance <ArrowRight className="size-3.5" aria-hidden />
          </button>
          <button
            onClick={() => setView('progress')}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Full breakdown <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </span>
      }
    >
      {state === 'loading' && <DigestSkeleton rows={4} />}
      {state === 'error' && <DigestError hint="Open Progress" onOpen={() => setView('progress')} />}
      {state === 'ready' && readiness && dash && (
        <div className="space-y-5">
          <ScoreRing value={readiness.overall} band={readiness.band} />

          <Stagger className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StaggerItem><StatBlock value={String(dash.stats.streak)} label="Day streak" accent="text-primary" /></StaggerItem>
            <StaggerItem><StatBlock value={String(dash.stats.dueQuestions)} label="Due questions" /></StaggerItem>
            <StaggerItem><StatBlock value={String(dash.stats.dueFlashcards)} label="Due flashcards" /></StaggerItem>
            <StaggerItem><StatBlock value={String(dash.stats.topicsAtRisk)} label="Topics at risk" accent="text-sev-warn" /></StaggerItem>
          </Stagger>

          <div className="space-y-3">
            {readiness.components.map((c) => (
              <MiniBar key={c.key} label={c.label} weight={c.weight} value={Math.round(c.value)} note={c.note} />
            ))}
          </div>

          {readiness.focusSubjects.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Focus subjects</p>
              <div className="flex flex-wrap gap-1.5">
                {readiness.focusSubjects.slice(0, 4).map((s) => (
                  <span key={s.code} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-foreground">
                    {s.name} · <span className="tabular-nums text-primary">{s.readiness}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {dash.nextAction && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-ink-soft">Next best action</p>
                <p className="truncate text-sm font-medium text-foreground">{dash.nextAction.conceptName}</p>
              </div>
              <Button
                size="sm"
                onClick={() => openConcept(dash.nextAction!.conceptId)}
                className="min-h-9 gap-1.5"
              >
                Open <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-ink-soft">
            Basis: {readiness.dataBasis.engaged}/{readiness.dataBasis.concepts} concepts engaged ·{' '}
            {readiness.dataBasis.attemptsConsidered} attempts · {readiness.dataBasis.activeDaysLast14} active days (last 14).
          </p>

          <details className="group rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <summary className="cursor-pointer list-none text-xs font-medium text-foreground marker:hidden">
              Methodology <span className="text-ink-soft group-open:hidden">(tap to expand)</span>
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">{readiness.methodology}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{readiness.disclaimer}</p>
          </details>
        </div>
      )}
    </Card>
  )
}

// ─── 04 · Progress digest (compiled from /api/progress) ─────────────────────

function ProgressDigestCard() {
  const setView = useAppStore((s) => s.setView)
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [data, setData] = useState<ProgressPayload | null>(null)

  useEffect(() => {
    let ok = true
    api
      .progress()
      .then((d) => {
        if (!ok) return
        setData(d)
        setState('ready')
      })
      .catch(() => {
        if (ok) setState('error')
      })
    return () => {
      ok = false
    }
  }, [])

  const maxError = useMemo(
    () => (data ? Math.max(1, ...data.errorPatterns.map((e) => e.count)) : 1),
    [data],
  )

  return (
    <Card
      icon={LineChart}
      index="04"
      id="pf-progress"
      title="Progress digest"
      action={
        <button
          onClick={() => setView('progress')}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Full view <ArrowRight className="size-3.5" aria-hidden />
        </button>
      }
    >
      {state === 'loading' && <DigestSkeleton rows={3} />}
      {state === 'error' && <DigestError hint="Open Progress" onOpen={() => setView('progress')} />}
      {state === 'ready' && data && (
        <div className="space-y-5">
          <Stagger className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StaggerItem><StatBlock value={`${data.overall.accuracy}%`} label="Accuracy" accent="text-primary" /></StaggerItem>
            <StaggerItem><StatBlock value={`${data.overall.mastery}%`} label="Avg mastery" /></StaggerItem>
            <StaggerItem>
              <StatBlock
                value={`${data.overall.trend >= 0 ? '+' : ''}${data.overall.trend} pts`}
                label="Trend"
                accent={data.overall.trend >= 0 ? 'text-sev-ok' : 'text-sev-crit'}
              />
            </StaggerItem>
            <StaggerItem><StatBlock value={`${data.weeklyReport.consistency}%`} label="Consistency (14d)" /></StaggerItem>
          </Stagger>

          <div className="grid gap-2 sm:grid-cols-2">
            <InfoRow icon={TrendingUp} label="This week vs last" value={`${data.weeklyReport.accuracyNow}% vs ${data.weeklyReport.accuracyPrev}%`} />
            <InfoRow icon={CircleHelp} label="Top mistake pattern" value={data.weeklyReport.topMistake || 'Not enough attempts yet'} />
          </div>

          {data.weeklyReport.narrative.length > 0 && (
            <blockquote className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed text-foreground">
              “{data.weeklyReport.narrative[0]}”
            </blockquote>
          )}

          {data.errorPatterns.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Error patterns (all-time counts)</p>
              {data.errorPatterns.slice(0, 3).map((e) => (
                <MiniBar
                  key={e.errorType}
                  label={ERROR_TYPE_LABELS[e.errorType] ?? e.errorType}
                  value={e.count}
                  pct={Math.round((e.count / maxError) * 100)}
                  note={e.examples.length > 0 ? `e.g. ${e.examples[0].concept}` : undefined}
                />
              ))}
            </div>
          )}
          <SectionCta label="Open full Progress — subjects, heatmap & confusions" onClick={() => setView('progress')} />
        </div>
      )}
    </Card>
  )
}

// ─── 05 · Roadmap digest (compiled from /api/roadmap) ───────────────────────

function RoadmapDigestCard() {
  const setView = useAppStore((s) => s.setView)
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [data, setData] = useState<RoadmapPayload | null>(null)

  useEffect(() => {
    let ok = true
    api
      .roadmap()
      .then((d) => {
        if (!ok) return
        setData(d)
        setState('ready')
      })
      .catch(() => {
        if (ok) setState('error')
      })
    return () => {
      ok = false
    }
  }, [])

  const weekHours = useMemo(
    () => (data ? Math.round(data.weekPlan.reduce((sum, d) => sum + d.hours, 0) * 10) / 10 : 0),
    [data],
  )

  return (
    <Card
      icon={Route}
      index="05"
      id="pf-roadmap"
      title="Roadmap digest"
      action={
        <button
          onClick={() => setView('roadmap')}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Full roadmap <ArrowRight className="size-3.5" aria-hidden />
        </button>
      }
    >
      {state === 'loading' && <DigestSkeleton rows={3} />}
      {state === 'error' && <DigestError hint="Open Roadmap" onOpen={() => setView('roadmap')} />}
      {state === 'ready' && data && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {data.currentStageLabel}
            </span>
            <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-ink-soft">
              {data.horizonYears}-year horizon
            </span>
            {data.isEstimate && (
              <span className="rounded-full border border-sev-warn/40 bg-sev-warn/10 px-3 py-1 text-[11px] font-medium text-sev-warn">
                Estimates — verify with NBEMS
              </span>
            )}
          </div>

          <Stagger className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StaggerItem><StatBlock value={String(data.neetClock.daysLeft)} label="Days to exam (est.)" accent="text-primary" /></StaggerItem>
            <StaggerItem><StatBlock value={String(data.neetClock.weeksLeft)} label="Weeks left" /></StaggerItem>
            <StaggerItem><StatBlock value={`${data.neetClock.weeklyTarget}`} label="Questions / week target" /></StaggerItem>
            <StaggerItem><StatBlock value={String(data.neetClock.revisionCyclesLeft)} label="Revision cycles left" /></StaggerItem>
          </Stagger>

          {data.phases.length > 0 && (
            <div className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-soft">Plan start · {data.phases[0].timeframe}</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{data.phases[0].phase}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">Milestone: {data.phases[0].milestone}</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Weekly split</p>
            {data.weeklySplit.map((w) => (
              <MiniBar key={w.label} label={w.label} value={w.pct} />
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-ink-soft">
            This week&apos;s plan: ≈ {weekHours} h across {data.weekPlan.length} days.
          </p>

          <SectionCta label="Open full Roadmap — phases, weekly planner & actions" onClick={() => setView('roadmap')} />
        </div>
      )}
    </Card>
  )
}

// ─── Exam mode card (own state so it initializes from the loaded profile) ───

function ExamModeCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const { toast } = useToast()
  const [examMode, setExamMode] = useState(profile.examMode)
  const [examLabel, setExamLabel] = useState(profile.examLabel)
  const [examDate, setExamDate] = useState(profile.examDate ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await api.saveProfile({
        examMode,
        examLabel: examLabel.trim(),
        examDate: examMode && examDate ? examDate : null,
      })
      onSaved(res.profile)
      toast({
        title: examMode ? 'Exam mode on' : 'Exam mode off',
        description: examMode
          ? "Today's plan now leans toward your college syllabus and internals."
          : 'Back to your regular NEET-PG priority.',
      })
    } catch {
      toast({ title: 'Could not save exam mode', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card icon={CalendarClock} index="06" id="pf-exam" title="Exam mode">
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-medium text-foreground">College exam priority</span>
          <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
            Temporarily reprioritizes today&apos;s plan toward your college syllabus and internal assessments.
          </span>
        </span>
        <Switch checked={examMode} onCheckedChange={setExamMode} className="mt-1 shrink-0" aria-label="College exam priority" />
      </label>
      {examMode && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="mt-4 space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="pf-exam-label">Exam name</Label>
            <Input
              id="pf-exam-label"
              value={examLabel}
              onChange={(e) => setExamLabel(e.target.value)}
              placeholder="e.g. 2nd internal — Pathology"
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-exam-date">Exam date (optional)</Label>
            <Input
              id="pf-exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="min-h-11"
            />
          </div>
        </motion.div>
      )}
      <Button onClick={() => void save()} disabled={saving} className="mt-4 min-h-11 w-full gap-2">
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
        Save exam mode
      </Button>
    </Card>
  )
}

// ─── Offline & install status ───────────────────────────────────────────────

const SW_STATUS_META: Record<SWStatus, { label: string; detail: string; ok: boolean }> = {
  checking: { label: 'Checking…', detail: 'Reading the offline-shell status.', ok: true },
  active: { label: 'Offline shell active', detail: 'MEDULA opens even without a connection — questions you already loaded stay available.', ok: true },
  registering: { label: 'Offline shell ready', detail: 'Fully offline on your next visit after this one.', ok: true },
  dev: { label: 'Dev preview — shell dormant', detail: 'The offline shell ships with production builds so edited code always stays fresh here.', ok: true },
  unsupported: { label: 'Not available here', detail: 'This browser does not support offline shells.', ok: false },
}

function OfflineCard() {
  const status = useSWStatus()
  const meta = SW_STATUS_META[status]
  return (
    <Card icon={CloudOff} title="Offline & install">
      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          {status === 'checking' ? (
            <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
          ) : (
            <Check
              className={`mt-0.5 size-3.5 shrink-0 ${meta.ok ? 'text-sev-ok' : 'text-sev-warn'}`}
              aria-hidden
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold" aria-live="polite">{meta.label}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{meta.detail}</p>
          </div>
        </div>
        <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          To install MEDULA as an app: open your browser menu and choose
          {' '}<span className="font-semibold">“Add to Home Screen”</span> (mobile) or
          {' '}<span className="font-semibold">“Install app”</span> (desktop Chrome/Edge).
        </p>
      </div>
    </Card>
  )
}

// ─── ProfileView ─────────────────────────────────────────────────────────────

export function ProfileView() {
  const setStoreProfile = useAppStore((s) => s.setProfile)
  const setView = useAppStore((s) => s.setView)
  const { toast } = useToast()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Explicit sign-out: drop the client session, clear the store profile and
  // return to the sign-in screen. The stored last view is intentionally kept
  // — the next sign-in resumes right where the doctor left off.
  const signOut = () => {
    clearStoredSession()
    setStoreProfile(null)
    setView('signin')
    toast({
      title: 'Signed out',
      description: 'Your map remembers where you left off — sign in to resume.',
    })
  }

  // Editable form state (hydrated from the loaded profile when edit starts)
  const [form, setForm] = useState({
    name: '',
    year: 1,
    semester: 1,
    collegeName: '',
    collegeType: 'Government' as CollegeType,
    gradYear: new Date().getFullYear() + 3,
    pastScore: '',
    prepStage: 'serious' as Profile['prepStage'],
    dailyHours: 4,
    weekdayHours: 5,
    weekendHours: 8,
    learningStyles: [] as string[],
    resources: [] as string[],
  })

  // Pull the truth from the API; fall back to the store snapshot if offline.
  useEffect(() => {
    let cancelled = false
    api
      .getProfile()
      .then((res) => {
        if (cancelled) return
        setProfile(res.profile)
        setStoreProfile(res.profile)
        setLoadError(false)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        const fallback = useAppStore.getState().profile
        if (fallback) {
          setProfile(fallback)
          setLoading(false)
        } else {
          setLoadError(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey, setStoreProfile])

  const startEdit = (p: Profile) => {
    setForm({
      name: p.name,
      year: p.year,
      semester: p.semester,
      collegeName: p.collegeName,
      collegeType: (COLLEGE_TYPES as readonly string[]).includes(p.collegeType)
        ? (p.collegeType as CollegeType)
        : 'Government',
      gradYear: p.gradYear,
      pastScore: p.pastScore,
      prepStage: p.prepStage,
      dailyHours: p.dailyHours,
      weekdayHours: p.weekdayHours,
      weekendHours: p.weekendHours,
      learningStyles: [...p.learningStyles],
      resources: [...p.resources],
    })
    setSaveError(null)
    setEditing(true)
  }

  // Year change auto-derives semester + grad year (same rules as onboarding).
  const chooseYear = (y: number) => {
    setForm((f) => ({
      ...f,
      year: y,
      semester: Math.min((y - 1) * 2 + 1, 8),
      gradYear: new Date().getFullYear() + (y <= 4 ? 5 - y : 1),
    }))
  }

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const gradSane = form.gradYear >= new Date().getFullYear() && form.gradYear <= new Date().getFullYear() + 12
  const editValid =
    form.name.trim().length > 0 && form.learningStyles.length >= 1 && gradSane

  const weeklyFormHours = useMemo(
    () => Math.round((form.weekdayHours * 5 + form.weekendHours * 2) * 10) / 10,
    [form.weekdayHours, form.weekendHours],
  )

  const saveEdit = async () => {
    if (!editValid || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api.saveProfile({
        name: form.name.trim(),
        year: form.year,
        semester: form.semester,
        collegeName: form.collegeName.trim(),
        collegeType: form.collegeType,
        gradYear: form.gradYear,
        pastScore: form.pastScore.trim(),
        prepStage: form.prepStage,
        dailyHours: form.dailyHours,
        weekdayHours: form.weekdayHours,
        weekendHours: form.weekendHours,
        learningStyles: form.learningStyles,
        resources: form.resources,
      })
      setProfile(res.profile)
      setStoreProfile(res.profile)
      setEditing(false)
      toast({ title: 'Profile updated', description: 'Your plan, tutor depth and roadmap now match.' })
    } catch {
      setSaveError('Could not save your profile. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const onExamSaved = (p: Profile) => {
    setProfile(p)
    setStoreProfile(p)
  }

  // ── Loading / error / empty states ──
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 md:px-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-5 md:col-span-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (loadError || !profile) {
    const noneYet = !loadError
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-6">
        <div className="clay mx-auto max-w-md rounded-2xl p-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl border border-primary/20 bg-primary/10">
            <UserRound className="size-6 text-primary" aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">
            {noneYet ? 'No profile yet' : 'Could not load your profile'}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {noneYet
              ? 'Tell MEDULA who you are and where you are in MBBS — everything else personalizes from there.'
              : 'Check your connection, then retry.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={() => setView('onboarding')} className="min-h-11">
              {noneYet ? 'Start onboarding' : 'Go to onboarding'}
            </Button>
            <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)} className="min-h-11">
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const stageLabel = PREP_STAGE_LABELS[profile.prepStage] ?? profile.prepStage
  const primaryResource = profile.resources[0] ?? null
  const profileWeeklyHours = Math.round((profile.weekdayHours * 5 + profile.weekendHours * 2) * 10) / 10

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      {/* Page header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Profile · Progress · Roadmap</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Your Medical Profile Hub</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
            Who you are, how you&apos;re preparing, and where you stand — arranged in one systematic view.
          </p>
        </div>
        {!editing && (
          <Button variant="outline" onClick={() => startEdit(profile)} className="min-h-11 gap-2">
            <Pencil className="size-4" aria-hidden />
            Edit profile
          </Button>
        )}
      </div>

      {/* Hub quick-nav — numbered jump links, mirrors the section order below */}
      <nav aria-label="Profile sections" className="mb-6 flex flex-wrap gap-2">
        {HUB_SECTIONS.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface-2 px-3.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* Edit action bar */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="glass-strong mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
        >
          <p className="text-sm font-medium text-foreground">Editing profile — plan, tutor depth and roadmap follow these answers.</p>
          <div className="flex items-center gap-2">
            <Button onClick={() => setEditing(false)} variant="ghost" className="min-h-11" disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} className="min-h-11 gap-2" disabled={saving || !editValid}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              Save
            </Button>
          </div>
        </motion.div>
      )}

      {saveError && (
        <p role="alert" className="mb-5 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-3.5 py-2.5 text-xs text-sev-crit">
          {saveError}
        </p>
      )}
      {editing && !editValid && (
        <p className="mb-5 text-xs text-ink-soft">
          Save needs a name, at least one learning style, and a graduation year within the next 12 years.
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {/* ── Main column: 01 → 05 ── */}
        <div className="space-y-5 md:col-span-2">
          {/* 01 · IDENTITY */}
          <Card icon={UserRound} index="01" id="pf-identity" title="Identity">
            {editing ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-name">Name</Label>
                  <Input
                    id="pf-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Dr. …"
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Year</Label>
                  <Segmented options={YEAR_OPTIONS} value={form.year} onChange={chooseYear} ariaLabel="MBBS year" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-sem">Semester</Label>
                    <Select value={String(form.semester)} onValueChange={(v) => setForm((f) => ({ ...f, semester: Number(v) }))}>
                      <SelectTrigger id="pf-sem" className="min-h-11 w-full">
                        <SelectValue placeholder="Semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEMESTERS.map((s) => (
                          <SelectItem key={s} value={String(s)}>
                            Semester {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-grad">Graduation year</Label>
                    <Input
                      id="pf-grad"
                      type="number"
                      inputMode="numeric"
                      min={new Date().getFullYear()}
                      max={new Date().getFullYear() + 12}
                      value={form.gradYear}
                      onChange={(e) => setForm((f) => ({ ...f, gradYear: Number(e.target.value) }))}
                      aria-invalid={!gradSane}
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-past">Past performance</Label>
                    <Input
                      id="pf-past"
                      value={form.pastScore}
                      onChange={(e) => setForm((f) => ({ ...f, pastScore: e.target.value }))}
                      placeholder="e.g. 62% in 1st internal"
                      className="min-h-11"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf-college">College</Label>
                    <Input
                      id="pf-college"
                      value={form.collegeName}
                      onChange={(e) => setForm((f) => ({ ...f, collegeName: e.target.value }))}
                      placeholder="Your medical college"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>College type</Label>
                    <div role="radiogroup" aria-label="College type" className="flex gap-2">
                      {COLLEGE_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={form.collegeType === t}
                          onClick={() => setForm((f) => ({ ...f, collegeType: t }))}
                          className={cn(
                            'min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium transition-all',
                            form.collegeType === t
                              ? 'border-primary/60 bg-primary/10 text-foreground'
                              : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground',
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-4">
                  <div className="grid size-16 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/15 text-lg font-semibold tracking-tight text-primary">
                    {initialsOf(profile.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xl font-semibold tracking-tight text-foreground">{profile.name}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {YEAR_LABELS[profile.year] ?? `Year ${profile.year}`} · Semester {profile.semester}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <InfoRow
                    icon={Building2}
                    label="College"
                    value={profile.collegeName || 'Not set'}
                    extra={
                      <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft">
                        {profile.collegeType}
                      </span>
                    }
                  />
                  <InfoRow icon={CalendarDays} label="Expected graduation" value={`Class of ${profile.gradYear}`} />
                  <InfoRow icon={GraduationCap} label="Past performance" value={profile.pastScore || 'Not shared'} />
                  <InfoRow icon={Hourglass} label="Weekly capacity" value={`≈ ${profileWeeklyHours} h/week`} />
                </div>
              </div>
            )}
          </Card>

          {/* 02 · PREPARATION */}
          <Card icon={Target} index="02" id="pf-preparation" title="Preparation">
            {editing ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Prep stage</Label>
                  <div role="radiogroup" aria-label="Preparation stage" className="grid gap-2 sm:grid-cols-2">
                    {PREP_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={form.prepStage === o.value}
                        onClick={() => setForm((f) => ({ ...f, prepStage: o.value }))}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-all',
                          form.prepStage === o.value
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-line bg-surface-2 hover:border-primary/40',
                        )}
                      >
                        <p className="text-sm font-medium text-foreground">{o.label}</p>
                        <p className="mt-0.5 text-xs leading-snug text-ink-soft">{o.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <SliderRow
                    label="Daily target"
                    value={form.dailyHours}
                    min={0.5}
                    max={12}
                    step={0.5}
                    unit="h/day"
                    onChange={(v) => setForm((f) => ({ ...f, dailyHours: v }))}
                  />
                  <SliderRow
                    label="Weekdays"
                    value={form.weekdayHours}
                    min={0}
                    max={14}
                    step={0.5}
                    unit="h/day"
                    onChange={(v) => setForm((f) => ({ ...f, weekdayHours: v }))}
                  />
                  <SliderRow
                    label="Weekends"
                    value={form.weekendHours}
                    min={0}
                    max={14}
                    step={0.5}
                    unit="h/day"
                    onChange={(v) => setForm((f) => ({ ...f, weekendHours: v }))}
                  />
                </div>
                <p className="text-xs text-ink-soft">≈ {weeklyFormHours} h/week total capacity</p>
                <div className="space-y-2">
                  <Label>Learning styles</Label>
                  <div className="flex flex-wrap gap-2">
                    {STYLE_OPTIONS.map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        selected={form.learningStyles.includes(s)}
                        onToggle={() => setForm((f) => ({ ...f, learningStyles: toggleIn(f.learningStyles, s) }))}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Resources you use</Label>
                  <div className="flex flex-wrap gap-2">
                    {RESOURCE_OPTIONS.map((r) => (
                      <Chip
                        key={r}
                        label={r}
                        selected={form.resources.includes(r)}
                        onToggle={() => setForm((f) => ({ ...f, resources: toggleIn(f.resources, r) }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {stageLabel}
                  </span>
                  {profile.examMode && profile.examLabel && (
                    <span className="rounded-full border border-sev-warn/40 bg-sev-warn/10 px-3 py-1 text-xs font-medium text-sev-warn">
                      Exam priority: {profile.examLabel}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <StatBlock value={`${profile.dailyHours} h`} label="Daily target" />
                  <StatBlock value={`${profile.weekdayHours} h`} label="Weekdays" />
                  <StatBlock value={`${profile.weekendHours} h`} label="Weekends" />
                </div>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
                    <Palette className="size-3.5" aria-hidden /> Learning styles
                  </p>
                  <ChipRow items={profile.learningStyles} emptyLabel="No learning styles selected yet." />
                </div>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
                    <Flame className="size-3.5" aria-hidden /> Weekly capacity
                  </p>
                  <p className="text-sm text-foreground">≈ {profileWeeklyHours} hours per week</p>
                </div>
              </div>
            )}
          </Card>

          {/* 03 · READINESS SNAPSHOT — compiled live from readiness + dashboard APIs */}
          <ReadinessCard />

          {/* 04 · PROGRESS DIGEST — compiled live from the progress API */}
          <ProgressDigestCard />

          {/* 05 · ROADMAP DIGEST — compiled live from the roadmap API */}
          <RoadmapDigestCard />
        </div>

        {/* ── Side column: 06 → settings & account ── */}
        <div className="space-y-5">
          <ExamModeCard profile={profile} onSaved={onExamSaved} />

          {/* 07 · RESOURCES */}
          <Card icon={BookOpenCheck} index="07" title="Resources">
            <ChipRow items={profile.resources} emptyLabel="No resources selected — edit profile to add them." />
            {primaryResource && (
              <p className="mt-3 text-xs text-ink-soft">
                Primary platform: <span className="font-semibold text-foreground">{primaryResource}</span>
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">{RESOURCE_NOTE}</p>
          </Card>

          {/* 08 · ACCOUNT SESSION */}
          <Card icon={UserRound} index="08" id="pf-account" title="Account session">
            <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 font-mono text-sm font-bold text-primary">
                M
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">MEDULA demo account</p>
                <p className="truncate font-mono text-[11px] text-ink-soft">doctor@medula.in</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sev-ok">
                Active
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
              Signing out returns you to the sign-in screen. Reloads while signed in keep you here — your progress stays on this device.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={signOut}
              className="mt-3 min-h-10 w-full gap-2 border-sev-crit/35 text-sm font-semibold text-sev-crit hover:bg-sev-crit/10"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </Card>

          {/* 09 · DATA & DISCLAIMER */}
          <Card icon={ShieldAlert} index="09" title="Data & disclaimer">
            <ul className="space-y-2.5">
              {DISCLAIMER_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-primary/80" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </Card>

          <OfflineCard />
        </div>
      </div>
    </div>
  )
}
