'use client'

// ─── PERFORMANCE & READINESS INTELLIGENCE · ROOT (PRODUCT 13) ───
// «Measure → Understand → Predict → Improve.» An honest, explainable,
// action-oriented read of the student's real preparation signals. Every
// number is measured from the attempt feed, recall curves, revision ledger
// and mock tests — every score explains what moves it, every insight leads
// to an action. Never a rank or outcome prediction.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Bookmark,
  Brain, CalendarClock, CircleHelp, ClipboardList, Crosshair, Database, Dot,
  Flame, Gauge, History, Info, LayoutGrid, Minus, RefreshCcw, Send, ShieldCheck,
  Sparkles, Target, Timer, TrendingUp, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type {
  PerformanceAiAction, PerformanceAiResponse, PerformanceHandoff,
  PerformanceInsight, PerformancePayload, PerformanceTrend, PerformanceWeakItem,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, PageHeader } from '@/components/primitives/kit'
import { NoiseVeil } from '@/components/primitives/aura'
import { Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LoadState = 'loading' | 'ready' | 'error'
type PerfTab = 'overview' | 'readiness' | 'trends' | 'focus' | 'ai'

// Typed local shim — the backend endpoints land in parallel (task 13-a); the
// `unknown` cast keeps this file compiling standalone either way.
const perfApi = api as unknown as {
  performanceHome: () => Promise<PerformancePayload>
  performanceAi: (body: { action: PerformanceAiAction; question?: string }) => Promise<PerformanceAiResponse>
}

const TABS: { id: PerfTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'readiness', label: 'Readiness', icon: Gauge },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'focus', label: 'Focus', icon: Crosshair },
  { id: 'ai', label: 'AI Analyst', icon: Sparkles },
]

const AI_PRESETS: { action: PerformanceAiAction; label: string }[] = [
  { action: 'why_slow', label: 'Why am I improving slowly?' },
  { action: 'weakest_subject', label: 'What is my weakest subject?' },
  { action: 'weekly_focus', label: 'What should I focus on this week?' },
  { action: 'why_mistakes', label: 'Why am I making the same mistakes?' },
  { action: 'mock_ready', label: 'Am I ready for a mock test?' },
]

const SIGNAL_LABELS: Record<PerformanceWeakItem['signals'][number], string> = {
  'weak-mastery': 'Weak mastery',
  'low-accuracy': 'Low accuracy',
  declining: 'Declining',
  'repeated-mistakes': 'Repeated mistakes',
  faded: 'Fading memory',
  'high-yield-gap': 'High-yield gap',
  untouched: 'Not started',
}

const SEVERITY_CLS: Record<PerformanceInsight['severity'], { border: string; label: string; text: string }> = {
  critical: { border: 'border-l-sev-crit', label: 'Critical', text: 'text-sev-crit' },
  warning: { border: 'border-l-sev-warn', label: 'Warning', text: 'text-sev-warn' },
  info: { border: 'border-l-info', label: 'Worth knowing', text: 'text-info' },
  good: { border: 'border-l-sev-ok', label: 'On track', text: 'text-sev-ok' },
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n)}%`
}

/** '+8pp' / '−12s' / '0' — U+2212 minus, unit '%' renders as 'pp'. */
function fmtDelta(n: number | null, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const r = Math.round(n)
  if (r === 0) return '0'
  const u = unit === '%' ? 'pp' : unit
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}${u}`
}

/** Recall arrives as a 0..1 estimate in some contracts and 0..100 in others. */
function recallPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return v > 0 && v <= 1 ? Math.round(v * 100) : Math.round(v)
}

function fmtMins(m: number): string {
  if (m <= 0) return '0m'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function weightLabel(d: { weight: number; effectiveWeight: number }): string {
  return d.effectiveWeight !== d.weight ? `${d.effectiveWeight} of ${d.weight}` : `${d.weight}`
}

function directionChip(t: PerformanceTrend): { label: string; cls: string } {
  if (t.improved === null || t.insufficient) return { label: 'Too early', cls: 'border-line bg-surface-2 text-ink-soft' }
  if (t.direction === 'flat') return { label: 'Steady', cls: 'border-line bg-surface-2 text-ink-soft' }
  if (t.improved) return { label: 'Improving', cls: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok' }
  return { label: 'Declining', cls: 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn' }
}

function gapIsBlocking(g: { label: string; detail: string }): boolean {
  return /not |no |missing|none|never|untested|without|zero|low|lacking/.test(`${g.label} ${g.detail}`.toLowerCase())
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-24px' }}
      transition={{ duration: 0.5, delay: reduce ? 0 : 0.05 * index, ease: EASE }}
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
      duration: 0.9,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span className={className}>{reduce ? value : display}</span>
}

function ReadinessRing({ value, size, stroke, children }: { value: number; size: number; stroke: number; children?: ReactNode }) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-primary" strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.3, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

function SplitSeg({ pct, cls, delay }: { pct: number; cls: string; delay: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={cn('h-full', cls)}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      transition={{ duration: 0.9, delay: reduce ? 0 : delay, ease: EASE }}
    />
  )
}

/**
 * Pure-SVG sparkline with honest gaps: null points break the line into
 * segments (runs between non-null values). The path layer stretches
 * (preserveAspectRatio="none") with non-scaling strokes; dots render in a
 * separate unscaled layer so markers stay round.
 */
function TrendChart({ t, toneClass, ariaLabel }: { t: PerformanceTrend; toneClass: string; ariaLabel: string }) {
  const reduce = useReducedMotion()
  const W = 320
  const H = 84
  const PL = 8
  const PR = 8
  const PT = 10
  const PB = 6
  const isMock = t.key === 'mock'
  const series = t.series
  const n = series.length
  const isPct = t.unit === '%'

  const numeric = series.map((p) => p.value).filter((v): v is number => v != null)
  let lo = 0
  let hi = 100
  if (!isPct) {
    if (numeric.length >= 2) {
      const mn = Math.min(...numeric)
      const mx = Math.max(...numeric)
      const pad = Math.max((mx - mn) / 2, 1)
      lo = mn - pad
      hi = mx + pad
    } else if (numeric.length === 1) {
      lo = Math.max(0, numeric[0] - 10)
      hi = numeric[0] + 10
    } else {
      lo = 0
      hi = 1
    }
  }
  const span = hi - lo || 1

  const xAt = (i: number) => (n <= 1 ? (PL + (W - PL - PR) / 2) : PL + ((W - PL - PR) * i) / (n - 1))
  const yAt = (v: number) => PT + (H - PT - PB) * (1 - (v - lo) / span)

  // Runs of consecutive non-null points → one polyline per run.
  const runs: { x: number; y: number }[][] = []
  let cur: { x: number; y: number }[] | null = null
  series.forEach((p, i) => {
    if (p.value == null) {
      cur = null
      return
    }
    const pt = { x: xAt(i), y: yAt(p.value) }
    if (!cur) {
      cur = [pt]
      runs.push(cur)
    } else {
      cur.push(pt)
    }
  })

  const lineD = runs
    .map((run) => run.map((pt, j) => `${j === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' '))
    .join(' ')
  const base = H - PB
  const areaD = runs
    .filter((run) => run.length >= 2)
    .map((run) =>
      `${run.map((pt, j) => `${j === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ')} ` +
      `L${run[run.length - 1].x.toFixed(1)} ${base} L${run[0].x.toFixed(1)} ${base} Z`)
    .join(' ')

  return (
    <div className={cn('relative', toneClass)} role="img" aria-label={ariaLabel}>
      <svg className="block h-20 w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1={PL} y1={base} x2={W - PR} y2={base} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {isPct && (
          <line x1={PL} y1={yAt(50)} x2={W - PR} y2={yAt(50)} stroke="var(--line)" strokeDasharray="3 5" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        {areaD && <path d={areaD} fill="currentColor" opacity={0.08} stroke="none" />}
        <motion.path
          d={lineD}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={isMock && reduce ? '5 4' : undefined}
          initial={reduce ? false : isMock ? { opacity: 0 } : { pathLength: 0.001 }}
          animate={isMock ? { opacity: 1 } : { pathLength: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        />
      </svg>
      {/* Unscaled marker layer — dots stay round, mock tests get diamonds */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {series.map((p, i) => {
          if (p.value == null) return null
          const left = `${(xAt(i) / W) * 100}%`
          const top = `${(yAt(p.value) / H) * 100}%`
          return isMock ? (
            <span key={i} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" style={{ left, top }} />
          ) : (
            <span key={i} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" style={{ left, top }} />
          )
        })}
      </div>
    </div>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">{children}</h2>
}

function ThinBanner() {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-4 py-2.5 text-sm font-medium text-sev-warn" role="status">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>Thin data — these readings will sharpen as you practice.</span>
    </p>
  )
}

// ─── Loading / error states ──────────────────────────────────────────────────

function PerfSkeleton() {
  return (
    <div className="mt-5 space-y-4" role="status" aria-busy="true" aria-label="Loading performance intelligence">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-9 w-28 rounded-full" />
        ))}
      </div>
      <Skeleton className="shimmer h-56 w-full rounded-2xl" />
      <Skeleton className="shimmer h-36 w-full rounded-2xl" />
      <Skeleton className="shimmer h-44 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-24 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function PerfError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-5">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCcw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your performance profile</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The measurement engine did not respond. Your data is untouched — retry when ready.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCcw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

// ─── Shared cards ────────────────────────────────────────────────────────────

/** Compact "holding me back" row for the Overview tab. */
function FocusRow({ w, onHandoff }: { w: PerformanceWeakItem; onHandoff: (h: PerformanceHandoff) => void }) {
  return (
    <div className="clay flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-sev-crit/10 text-sm font-bold tabular-nums text-sev-crit"
        aria-label={`Priority ${Math.round(w.importance)} of 100`}
      >
        {Math.round(w.importance)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-semibold leading-snug">{w.label}</p>
          {w.parent && <p className="text-xs text-ink-soft">{w.parent}</p>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {w.signals.slice(0, 2).map((s) => (
            <span key={s} className="rounded-full bg-surface-2/80 px-2 py-0.5 text-[11px] text-ink-soft">
              {SIGNAL_LABELS[s]}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{w.reason}</p>
      </div>
      <Button size="sm" className="min-h-9 shrink-0 gap-1.5" onClick={() => onHandoff(w.action)}>
        <Zap className="size-3.5" /> {w.action.label}
      </Button>
    </div>
  )
}

function KindIcon({ kind }: { kind: PerformanceWeakItem['kind'] }) {
  const Icon = kind === 'subject' ? BookOpen : kind === 'topic' ? Bookmark : CircleHelp
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10">
      <Icon className="size-4 text-primary" />
    </span>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-surface-2/40 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/** Full weakness card for the Focus tab — ranked by exam importance × weakness × decay. */
function WeakCard({ w, pinned = false, onHandoff }: { w: PerformanceWeakItem; pinned?: boolean; onHandoff: (h: PerformanceHandoff) => void }) {
  return (
    <div className={cn('clay rounded-2xl p-4', pinned && 'border-sev-crit/40')}>
      <div className="flex items-start gap-3">
        <KindIcon kind={w.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold leading-snug">{w.label}</h3>
            {pinned && <Badge className="border-sev-crit/40 bg-sev-crit/10 text-sev-crit">Act now</Badge>}
          </div>
          {w.parent && <p className="text-xs text-ink-soft">{w.parent}</p>}
        </div>
        <div className="w-16 shrink-0 text-right" aria-label={`Priority ${Math.round(w.importance)} of 100`}>
          <p className="text-[10px] uppercase tracking-wider text-ink-soft">Priority</p>
          <p className="text-lg font-bold leading-none tabular-nums">{Math.round(w.importance)}</p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full clay-in">
            <div
              className={cn('h-full rounded-full', w.importance >= 66 ? 'bg-sev-crit' : w.importance >= 40 ? 'bg-sev-warn' : 'bg-sev-ok')}
              style={{ width: `${Math.max(0, Math.min(100, w.importance))}%` }}
            />
          </div>
        </div>
      </div>

      {w.signals.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {w.signals.map((s) => (
            <span key={s} className="rounded-full bg-surface-2/80 px-2.5 py-1 text-[11px] text-ink-soft">
              {SIGNAL_LABELS[s]}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <MiniStat label="Mastery" value={fmtPct(w.mastery)} />
        <MiniStat label="Accuracy" value={fmtPct(w.accuracy)} />
        <MiniStat label="Recall" value={fmtPct(recallPct(w.recall))} />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-soft">
        {w.attempts} {w.attempts === 1 ? 'attempt' : 'attempts'} · {w.wrongs} wrong
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{w.reason}</p>

      <div className="mt-3">
        <Button size="sm" className="min-h-9 gap-1.5" onClick={() => onHandoff(w.action)}>
          <ArrowUpRight className="size-3.5" /> {w.action.label}
        </Button>
      </div>
    </div>
  )
}

function StrengthCard({ s }: { s: PerformancePayload['strengths'][number] }) {
  return (
    <div className="clay h-full rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sev-ok/10">
          <ShieldCheck className="size-4 text-sev-ok" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug">{s.label}</h3>
          {s.parent && <p className="text-xs text-ink-soft">{s.parent}</p>}
        </div>
        <p className="shrink-0 text-xs text-ink-soft">
          {s.attempts} {s.attempts === 1 ? 'attempt' : 'attempts'}
        </p>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <MiniStat label="Mastery" value={fmtPct(s.mastery)} />
        <MiniStat label="Accuracy" value={fmtPct(s.accuracy)} />
        <MiniStat label="Recall" value={fmtPct(recallPct(s.recall))} />
      </div>
      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-sev-ok/5 p-2 text-xs leading-relaxed text-sev-ok">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        <span>{s.note}</span>
      </p>
    </div>
  )
}

function InsightCard({ ins, onHandoff }: { ins: PerformanceInsight; onHandoff: (h: PerformanceHandoff) => void }) {
  const sev = SEVERITY_CLS[ins.severity]
  return (
    <div className={cn('clay rounded-2xl border-l-4 p-4', sev.border)}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold leading-snug">{ins.title}</h3>
        <span className={cn('text-[10px] font-bold uppercase tracking-widest', sev.text)}>{sev.label}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{ins.evidence}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed">{ins.why}</p>
      {ins.actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {ins.actions.map((a, i) => (
            <Button
              key={`${a.kind}-${i}`}
              size="sm"
              variant={i === 0 ? 'default' : 'outline'}
              className="min-h-9 gap-1.5"
              onClick={() => onHandoff(a)}
            >
              <ArrowUpRight className="size-3.5" /> {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function IndicatorTile(props: {
  icon: LucideIcon
  label: string
  value: string
  sub?: ReactNode
  tab: PerfTab
  aria: string
  onTab: (t: PerfTab) => void
}) {
  const Icon = props.icon
  return (
    <button
      type="button"
      onClick={() => props.onTab(props.tab)}
      aria-label={props.aria}
      className="clay clay-hover group h-full rounded-xl px-3 py-2.5 text-left transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-ink-soft transition-colors group-hover:text-primary" />
        <p className="text-[11px] font-medium text-ink-soft">{props.label}</p>
      </div>
      <p className="mt-1 text-xl font-bold leading-none tabular-nums md:text-2xl">{props.value}</p>
      {props.sub != null && <div className="mt-1 text-[11px] leading-tight text-ink-soft">{props.sub}</div>}
    </button>
  )
}

// ─── Tab 1 · Overview ────────────────────────────────────────────────────────

function OverviewTab({ data, onTab, onHandoff }: { data: PerformancePayload; onTab: (t: PerfTab) => void; onHandoff: (h: PerformanceHandoff) => void }) {
  const { indicators: ind, readiness, focusNow, insights, weaknesses, examReadiness } = data
  const acc = ind.accuracy
  const accDelta = ind.accuracyDelta
  const accUp = (accDelta ?? 0) > 0
  const split = ind.knowledgeSplit
  const splitTotal = split.strong + split.unstable + split.weak + split.new

  return (
    <div className="space-y-6">
      {/* 1 · WHERE AM I */}
      <Reveal index={0} className="space-y-3">
        <SectionHeading>Where am I?</SectionHeading>
        <section className="clay rounded-2xl p-5 md:p-6" aria-label="Overall readiness">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            {readiness.overall != null ? (
              <ReadinessRing value={readiness.overall} size={148} stroke={12}>
                <span className="text-4xl font-semibold tabular-nums tracking-tight">
                  <AnimatedNumber value={Math.round(readiness.overall)} />
                </span>
                <span className="text-[10px] uppercase tracking-widest text-ink-soft">of 100</span>
              </ReadinessRing>
            ) : (
              <div className="grid size-36 shrink-0 place-items-center rounded-full border border-dashed border-line p-4 text-center">
                <p className="text-xs leading-snug text-ink-soft">Not enough data yet — answer a few questions and this fills in</p>
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-primary/30 bg-primary/10 text-primary">{readiness.band}</Badge>
                {data.insufficientData && (
                  <Badge variant="outline" className="border-sev-warn/40 bg-sev-warn/10 text-sev-warn">Thin data</Badge>
                )}
              </div>

              {data.insufficientData && (
                <p className="text-sm leading-relaxed text-ink-soft">
                  {data.insufficientNote ?? 'Not enough data yet — answer a few questions and this fills in.'}
                </p>
              )}

              {examReadiness.daysLeft != null && (
                <p className="flex items-center gap-2 text-sm">
                  <CalendarClock className="size-4 shrink-0 text-ink-soft" />
                  <span>
                    Approx. <span className="font-semibold tabular-nums">{examReadiness.daysLeft}</span> days to your exam
                  </span>
                </p>
              )}

              {acc != null && (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Target className="size-4 shrink-0 text-ink-soft" />
                  <span>
                    Accuracy <span className="font-semibold tabular-nums">{fmtPct(acc)}</span>
                  </span>
                  {accDelta != null && accDelta !== 0 && (
                    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', accUp ? 'bg-sev-ok/10 text-sev-ok' : 'bg-sev-crit/10 text-sev-crit')}>
                      {accUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                      {fmtDelta(accDelta, '%')} · 7d
                    </span>
                  )}
                </p>
              )}

              {ind.recall != null && (
                <p className="flex items-center gap-2 text-sm">
                  <Brain className="size-4 shrink-0 text-ink-soft" />
                  <span>
                    Mean recall <span className="font-semibold tabular-nums">{fmtPct(recallPct(ind.recall))}</span>
                  </span>
                </p>
              )}

              {data.insufficientData && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" className="min-h-9 gap-1.5" onClick={() => onHandoff({ kind: 'quiz', label: 'Quiz 10 questions', quiz: { count: 10 } })}>
                    <Zap className="size-3.5" /> Quiz 10 questions
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-9 gap-1.5" onClick={() => onHandoff({ kind: 'exam', label: 'Open Exam Lab', exam: {} })}>
                    <ClipboardList className="size-3.5" /> Open Exam Lab
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-9 gap-1.5" onClick={() => onHandoff({ kind: 'revision', label: 'Smart Revision' })}>
                    <History className="size-3.5" /> Smart Revision
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* knowledge split */}
          <div className="mt-5 border-t border-line pt-4">
            {splitTotal > 0 ? (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Knowledge split: ${split.strong} strong, ${split.unstable} unstable, ${split.weak} weak, ${split.new} untouched`}>
                  {split.strong > 0 && <SplitSeg pct={(split.strong / splitTotal) * 100} cls="bg-sev-ok" delay={0.1} />}
                  {split.unstable > 0 && <SplitSeg pct={(split.unstable / splitTotal) * 100} cls="bg-sev-warn" delay={0.2} />}
                  {split.weak > 0 && <SplitSeg pct={(split.weak / splitTotal) * 100} cls="bg-sev-crit" delay={0.3} />}
                  {split.new > 0 && <SplitSeg pct={(split.new / splitTotal) * 100} cls="bg-line" delay={0.4} />}
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sev-ok" />{split.strong} strong</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sev-warn" />{split.unstable} unstable</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sev-crit" />{split.weak} weak</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-line" />{split.new} untouched</span>
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-soft">No concept states measured yet — the split appears as you learn.</p>
            )}
          </div>
        </section>
      </Reveal>

      {/* 2 · WHAT'S HOLDING ME BACK */}
      <Reveal index={1} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading>What&apos;s holding me back?</SectionHeading>
          {weaknesses.length > 3 && (
            <button
              type="button"
              onClick={() => onTab('focus')}
              className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              See all {weaknesses.length} in Focus <ArrowRight className="size-3.5" />
            </button>
          )}
        </div>
        {focusNow.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing flagged right now"
            hint="keep practising and the engine re-ranks continuously."
          />
        ) : (
          <div className="space-y-2.5">
            {focusNow.slice(0, 3).map((w) => (
              <FocusRow key={w.id} w={w} onHandoff={onHandoff} />
            ))}
          </div>
        )}
      </Reveal>

      {/* 3 · WHAT SHOULD I DO NEXT */}
      <Reveal index={2} className="space-y-3">
        <SectionHeading>What should I do next?</SectionHeading>
        {insights.length === 0 ? (
          <div className="clay rounded-2xl border-l-4 border-l-sev-ok p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 shrink-0 text-sev-ok" />
              No red flags right now — keep the streak.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {insights.slice(0, 3).map((ins) => (
              <InsightCard key={ins.id} ins={ins} onHandoff={onHandoff} />
            ))}
          </div>
        )}
      </Reveal>

      {/* 4 · KEY INDICATORS */}
      <Reveal index={3} className="space-y-3">
        <SectionHeading>Key indicators</SectionHeading>
        <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StaggerItem className="h-full">
          <IndicatorTile
            icon={Target}
            label="Question accuracy"
            value={fmtPct(acc)}
            sub={
              accDelta != null && accDelta !== 0 ? (
                <span className={accUp ? 'font-semibold text-sev-ok' : 'font-semibold text-sev-crit'}>
                  {fmtDelta(accDelta, '%')} vs prior 7d
                </span>
              ) : (
                'last 200 attempts'
              )
            }
            tab="trends"
            aria="Question accuracy — open trends"
            onTab={onTab}
          />
          </StaggerItem>
          <StaggerItem className="h-full">
          <IndicatorTile
            icon={Brain}
            label="Recall"
            value={fmtPct(recallPct(ind.recall))}
            sub="mean across touched concepts"
            tab="readiness"
            aria="Recall — open readiness"
            onTab={onTab}
          />
          </StaggerItem>
          <StaggerItem className="h-full">
          <IndicatorTile
            icon={Timer}
            label="Speed"
            value={ind.speed.medianSec != null ? `${Math.round(ind.speed.medianSec)}s` : '—'}
            sub={`pace ${ind.speed.pace}s · ${ind.speed.band}`}
            tab="readiness"
            aria="Speed — open readiness"
            onTab={onTab}
          />
          </StaggerItem>
          <StaggerItem className="h-full">
          <IndicatorTile
            icon={Flame}
            label="Consistency"
            value={`${ind.consistency.streak}d`}
            sub={`${ind.consistency.activeDays14}/14 active days`}
            tab="trends"
            aria="Consistency — open trends"
            onTab={onTab}
          />
          </StaggerItem>
          <StaggerItem className="h-full">
          <IndicatorTile
            icon={History}
            label="Revision debt"
            value={`${ind.revisionDebt.count}`}
            sub={`${fmtMins(ind.revisionDebt.minutes)} of work due`}
            tab="focus"
            aria="Revision debt — open focus"
            onTab={onTab}
          />
          </StaggerItem>
          <StaggerItem className="h-full">
          <IndicatorTile
            icon={ClipboardList}
            label="Mocks"
            value={ind.mock.lastPercent != null ? `${Math.round(ind.mock.lastPercent)}%` : 'none yet'}
            sub={`${ind.mock.tests} ${ind.mock.tests === 1 ? 'test' : 'tests'}${ind.mock.band ? ` · ${ind.mock.band}` : ''}`}
            tab="trends"
            aria="Mock tests — open trends"
            onTab={onTab}
          />
          </StaggerItem>
        </Stagger>
      </Reveal>

      <p className="text-center text-[11px] leading-relaxed text-ink-soft">
        Measured from {data.dataBasis.attempts.toLocaleString('en-IN')} attempts · {data.dataBasis.exams} exams ·{' '}
        {data.dataBasis.activeDays30} active days · {data.dataBasis.conceptsTouched}/{data.dataBasis.conceptsTotal} concepts
        touched · {data.dataBasis.windowDays}-day window
      </p>
      {data.disclaimers.length > 0 && (
        <div className="space-y-1 text-center">
          {data.disclaimers.slice(0, 3).map((d, i) => (
            <p key={i} className="text-[10px] leading-relaxed text-ink-soft">{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab 2 · Readiness ───────────────────────────────────────────────────────

function DimensionCard({ d, index }: { d: PerformancePayload['readiness']['dimensions'][number]; index: number }) {
  return (
    <Reveal index={index}>
      <div className="clay rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold">{d.label}</h3>
          <Badge variant="outline" className="border-line text-ink-soft" title={d.effectiveWeight !== d.weight ? 'Renormalised after excluding data-poor dimensions' : undefined}>
            weight {weightLabel(d)}
          </Badge>
          <span className="ml-auto text-2xl font-semibold tabular-nums leading-none">{d.value != null ? `${Math.round(d.value)}%` : '—'}</span>
        </div>

        <div className="clay-in mt-3 h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
          {d.lacksData || d.value == null ? (
            <div className="h-full w-full rounded-full border border-dashed border-line" />
          ) : (
            <Bar
              pct={d.value}
              delay={0.1 + index * 0.05}
              className={d.value >= 70 ? 'bg-sev-ok' : d.value >= 45 ? 'bg-sev-warn' : 'bg-sev-crit'}
            />
          )}
        </div>

        <p className="mt-2.5 text-sm leading-relaxed">{d.note}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
          <Database className="size-3 shrink-0" />
          {d.basis}
        </p>
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-primary/5 p-2 text-xs leading-relaxed text-ink-soft">
          <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span><span className="font-medium text-foreground">How to move it:</span> {d.suggestion}</span>
        </p>
      </div>
    </Reveal>
  )
}

function ReadinessTab({ data }: { data: PerformancePayload }) {
  const r = data.readiness
  return (
    <div className="space-y-6">
      {data.insufficientData && <ThinBanner />}

      <Reveal index={0} className="space-y-3">
        <SectionHeading>What does the number mean?</SectionHeading>
        <section className="clay rounded-2xl p-5 md:p-6" aria-label="Overall readiness score">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            {r.overall != null ? (
              <ReadinessRing value={r.overall} size={104} stroke={10}>
                <span className="text-2xl font-semibold tabular-nums">
                  <AnimatedNumber value={Math.round(r.overall)} />
                </span>
                <span className="text-[9px] uppercase tracking-widest text-ink-soft">of 100</span>
              </ReadinessRing>
            ) : (
              <div className="grid size-24 shrink-0 place-items-center rounded-full border border-dashed border-line">
                <span className="text-2xl font-semibold text-ink-soft">—</span>
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <Badge className="border-primary/30 bg-primary/10 text-primary">{r.band}</Badge>
              <p className="rounded-xl border border-line bg-surface-2/60 p-3 text-xs leading-relaxed text-ink-soft">
                <Info className="mr-1.5 inline size-3.5 align-[-2px] text-primary" />
                {r.methodology}
              </p>
            </div>
          </div>
          {r.excluded.length > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 p-3 text-xs font-medium leading-relaxed text-sev-warn" role="status">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Excluded for missing data: {r.excluded.join(', ')} — the score renormalises around what you have.
              </span>
            </p>
          )}
        </section>
      </Reveal>

      <section aria-label="Readiness dimensions" className="space-y-3">
        <SectionHeading>Every dimension, in the open</SectionHeading>
        <div className="space-y-3">
          {r.dimensions.map((d, i) => (
            <DimensionCard key={d.key} d={d} index={i} />
          ))}
        </div>
      </section>

      <footer className="space-y-1 text-center">
        <p className="text-[11px] leading-relaxed text-ink-soft">{r.disclaimer}</p>
        <p className="text-[11px] leading-relaxed text-ink-soft">
          Weights are fixed by the engine — they never adapt to make the number look better.
        </p>
      </footer>
    </div>
  )
}

// ─── Tab 3 · Trends ──────────────────────────────────────────────────────────

function TrendCard({ t, index }: { t: PerformanceTrend; index: number }) {
  const chip = directionChip(t)
  const toneClass = t.improved === true ? 'text-sev-ok' : t.improved === false ? 'text-sev-warn' : 'text-primary'
  const vals = t.series.map((p) => p.value).filter((v): v is number => v != null)
  const ariaLabel = `${t.label} trend: ${vals.length > 0 ? vals.map((v) => Math.round(v)).join(', ') : 'no data'} ${t.unit === '%' ? 'percent' : t.unit}`
  return (
    <Reveal index={index}>
      <div className="clay rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{t.label}</h3>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', chip.cls)}>
            {chip.label}
          </span>
          {t.delta != null && (
            <span className="ml-auto text-xs font-semibold tabular-nums text-ink-soft">
              {fmtDelta(t.delta, t.unit)} latest week
            </span>
          )}
        </div>
        <div className="mt-3">
          <TrendChart t={t} toneClass={toneClass} ariaLabel={ariaLabel} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">{t.note}</p>
      </div>
    </Reveal>
  )
}

function TrendsTab({ data }: { data: PerformancePayload }) {
  const improving = data.trends.filter((t) => t.improved === true).length
  const declining = data.trends.filter((t) => t.improved === false).length
  const rising = data.subjects
    .filter((s) => s.trend != null && s.trend > 0)
    .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))
    .slice(0, 3)
  const slipping = data.subjects
    .filter((s) => s.trend != null && s.trend < 0)
    .sort((a, b) => (a.trend ?? 0) - (b.trend ?? 0))
    .slice(0, 3)

  return (
    <div className="space-y-6">
      {data.insufficientData && <ThinBanner />}

      <Reveal index={0} className="space-y-3">
        <SectionHeading>How am I changing?</SectionHeading>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-3 py-1.5 text-xs font-semibold text-sev-ok">
            <ArrowUpRight className="size-3.5" /> {improving} improving
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-3 py-1.5 text-xs font-semibold text-sev-warn">
            <ArrowDownRight className="size-3.5" /> {declining} declining
          </span>
          <span className="text-[11px] leading-tight text-ink-soft">
            measured weekly — direction respects the metric (fewer mistakes counts as improving)
          </span>
        </div>
        <div className="space-y-3">
          {data.trends.map((t, i) => (
            <TrendCard key={t.key} t={t} index={i} />
          ))}
        </div>
      </Reveal>

      <Reveal index={1} className="space-y-3">
        <SectionHeading>Subject movement — last 14 days</SectionHeading>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="clay rounded-2xl p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-sev-ok">
              <ArrowUpRight className="size-3.5" /> Rising
            </h3>
            {rising.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                className="mt-3 border-0 bg-transparent px-0"
                title="No measured risers yet"
                hint="movement shows after about two weeks of practice."
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {rising.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    <span className="min-w-0 truncate font-medium">{s.name}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-sev-ok/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sev-ok">
                      +{Math.round(s.trend ?? 0)}pp in 14d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="clay rounded-2xl p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-sev-warn">
              <ArrowDownRight className="size-3.5" /> Slipping
            </h3>
            {slipping.length === 0 ? (
              <EmptyState
                icon={ArrowDownRight}
                className="mt-3 border-0 bg-transparent px-0"
                title="Nothing slipping"
                hint="no subject lost ground in the last fortnight."
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {slipping.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    <span className="min-w-0 truncate font-medium">{s.name}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-sev-warn/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sev-warn">
                      −{Math.abs(Math.round(s.trend ?? 0))}pp in 14d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  )
}

// ─── Tab 4 · Focus (weakness & strength intelligence) ───────────────────────

function ExamReadinessCard({ data }: { data: PerformancePayload }) {
  const ex = data.examReadiness
  return (
    <div className="clay rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Exam readiness</h2>
        {ex.daysLeft != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <CalendarClock className="size-3" />
            Approx. {ex.daysLeft} days left{ex.examDate ? ` · ${new Date(ex.examDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-4xl font-bold tabular-nums leading-none tracking-tight">{fmtPct(ex.current)}</span>
        <Badge className="border-primary/30 bg-primary/10 text-primary">{ex.band}</Badge>
      </div>

      {ex.gaps.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Readiness gaps">
          {ex.gaps.map((g, i) => {
            const blocking = gapIsBlocking(g)
            const Icon = blocking ? AlertTriangle : Minus
            return (
              <li key={i} className="flex items-start gap-2.5">
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', blocking ? 'text-sev-warn' : 'text-ink-soft')} />
                <span className="min-w-0 text-[13px] leading-relaxed">
                  <span className="font-medium">{g.label}</span>{' '}
                  <span className="text-ink-soft">{g.detail}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {ex.highPriorityTopics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ex.highPriorityTopics.slice(0, 4).map((t) => (
            <Badge key={t.id} variant="outline" className="border-line text-ink-soft">
              {t.label}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[11px] text-ink-soft">
          <History className="size-3" />
          Revision debt: {ex.revisionDebt.count} items · {fmtMins(ex.revisionDebt.minutes)}
        </span>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        {ex.testReadiness == null ? (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            No mock tests yet — test readiness unlocks after your first full test in the Exam Lab.
          </p>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Test readiness</h3>
              {ex.testReadiness.band && (
                <Badge variant="outline" className="border-line text-ink-soft">{ex.testReadiness.band}</Badge>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MiniStat label="Last" value={fmtPct(ex.testReadiness.lastPercent)} />
              <MiniStat label="Mean" value={fmtPct(ex.testReadiness.meanPercent)} />
              <MiniStat label="Best" value={fmtPct(ex.testReadiness.bestPercent)} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{ex.testReadiness.note}</p>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {ex.trajectory == null ? (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Not enough test history for a trajectory yet — sit another mock and this appears.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-[13px] leading-relaxed">
            {ex.trajectory.direction === 'up' ? (
              <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-sev-ok" />
            ) : ex.trajectory.direction === 'down' ? (
              <ArrowDownRight className="mt-0.5 size-4 shrink-0 text-sev-warn" />
            ) : (
              <Minus className="mt-0.5 size-4 shrink-0 text-ink-soft" />
            )}
            <span>{ex.trajectory.note}</span>
          </p>
        )}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-soft">{ex.disclaimer}</p>
    </div>
  )
}

function FocusTab({ data, onHandoff }: { data: PerformancePayload; onHandoff: (h: PerformanceHandoff) => void }) {
  const { focusNow, weaknesses, strengths } = data
  const rest = weaknesses.filter((w) => !focusNow.some((f) => f.id === w.id))

  return (
    <div className="space-y-6">
      {data.insufficientData && <ThinBanner />}

      <Reveal index={0} className="space-y-3">
        <SectionHeading>Weakness intelligence</SectionHeading>
        <p className="text-sm leading-relaxed text-ink-soft">
          Ranked by exam importance × weakness × decay — not just wrong answers.
        </p>
        {focusNow.length === 0 && weaknesses.length === 0 ? (
          <EmptyState
            icon={Crosshair}
            title="No measured weaknesses yet"
            hint="the engine ranks these automatically as you practice."
          />
        ) : (
          <div className="space-y-3">
            {focusNow.map((w) => (
              <WeakCard key={w.id} w={w} pinned onHandoff={onHandoff} />
            ))}
            {rest.map((w) => (
              <WeakCard key={w.id} w={w} onHandoff={onHandoff} />
            ))}
          </div>
        )}
      </Reveal>

      <Reveal index={1} className="space-y-3">
        <SectionHeading>Strength intelligence</SectionHeading>
        <p className="text-sm leading-relaxed text-ink-soft">
          Protect these — don&apos;t over-study what already holds.
        </p>
        {strengths.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No marked strengths yet"
            hint="strengths appear once mastery holds across attempts."
          />
        ) : (
          <Stagger className="grid gap-3 md:grid-cols-2">
            {strengths.map((s) => (
              <StaggerItem key={s.id} className="h-full">
                <StrengthCard s={s} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </Reveal>

      <Reveal index={2}>
        <ExamReadinessCard data={data} />
      </Reveal>
    </div>
  )
}

// ─── Tab 5 · AI Analyst ──────────────────────────────────────────────────────

type AiEntry =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'analyst'; res: PerformanceAiResponse }
  | { id: number; role: 'error'; text: string; retry: { action: PerformanceAiAction; question?: string } }

function AnalystCard({ res, onHandoff }: { res: PerformanceAiResponse; onHandoff: (h: PerformanceHandoff) => void }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10">
          <Sparkles className="size-3.5 text-primary" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">AI Analyst · Grounded</span>
        {res.fallback && (
          <Badge variant="outline" className="border-sev-warn/40 bg-sev-warn/10 text-sev-warn">
            Engine summary (AI unavailable)
          </Badge>
        )}
      </div>
      <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed">{res.text}</p>
      {res.bullets.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {res.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[13px] leading-snug text-ink-soft">
              <Dot className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {res.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {res.actions.map((a, i) => (
            <Button
              key={`${a.kind}-${i}`}
              size="sm"
              variant={i === 0 ? 'default' : 'outline'}
              className="min-h-9 gap-1.5"
              onClick={() => onHandoff(a)}
            >
              <ArrowUpRight className="size-3.5" /> {a.label}
            </Button>
          ))}
        </div>
      )}
      <p className="mt-2.5 text-[10px] leading-relaxed text-ink-soft">{res.disclaimer}</p>
    </div>
  )
}

function AiTab({ onHandoff }: { onHandoff: (h: PerformanceHandoff) => void }) {
  const [entries, setEntries] = useState<AiEntry[]>([])
  const [pending, setPending] = useState<{ action: PerformanceAiAction; question?: string } | null>(null)
  const [draft, setDraft] = useState('')
  const idRef = useRef(1)
  const pendingRef = useRef(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [entries.length, pending, reduce])

  const send = useCallback((action: PerformanceAiAction, question?: string, withUserBubble = true) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending({ action, question })
    if (withUserBubble) {
      const text = question ?? AI_PRESETS.find((p) => p.action === action)?.label ?? ''
      const id = idRef.current++
      setEntries((e) => [...e, { id, role: 'user', text }])
    }
    perfApi
      .performanceAi({ action, question })
      .then((res) => {
        if (!res.ok) throw new Error('analyst unavailable')
        const id = idRef.current++
        setEntries((e) => [...e, { id, role: 'analyst', res }])
      })
      .catch(() => {
        const id = idRef.current++
        setEntries((e) => [
          ...e,
          {
            id,
            role: 'error',
            text: 'The analyst could not answer just now — the engine may be busy.',
            retry: { action, question },
          },
        ])
      })
      .finally(() => {
        pendingRef.current = false
        setPending(null)
      })
  }, [])

  return (
    <section aria-label="AI analyst" className="space-y-4">
      <p className="rounded-xl border border-line bg-surface-2/60 p-3 text-xs leading-relaxed text-ink-soft">
        Every answer is grounded in YOUR platform data — attempts, recall, revision, mocks. The analyst can only see
        what the engine measures.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Preset questions">
        {AI_PRESETS.map((p) => (
          <button
            key={p.action}
            type="button"
            disabled={pending != null}
            onClick={() => send(p.action)}
            className="min-h-9 rounded-full border border-line bg-surface-2/50 px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="sr-only" htmlFor="perf-ai-question">
          Ask your own question
        </label>
        <Textarea
          id="perf-ai-question"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything about your preparation…"
          className="min-h-11 flex-1 resize-none bg-background/60"
        />
        <Button
          className="min-h-11 gap-1.5"
          disabled={pending != null || draft.trim().length === 0}
          onClick={() => {
            const q = draft.trim()
            if (!q) return
            setDraft('')
            send('ask', q)
          }}
        >
          <Send className="size-4" /> Ask
        </Button>
      </div>

      <div className="space-y-3" aria-live="polite">
        {entries.map((en) =>
          en.role === 'user' ? (
            <div key={en.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5 text-sm font-medium leading-snug">
                {en.text}
              </p>
            </div>
          ) : en.role === 'error' ? (
            <div key={en.id} className="rounded-2xl border border-sev-crit/30 bg-sev-crit/5 p-3.5" role="alert">
              <p className="flex items-start gap-2 text-sm font-medium text-sev-crit">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {en.text}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 min-h-9 gap-1.5"
                onClick={() => send(en.retry.action, en.retry.question, false)}
              >
                <RefreshCcw className="size-3.5" /> Try again
              </Button>
            </div>
          ) : (
            <AnalystCard key={en.id} res={en.res} onHandoff={onHandoff} />
          ),
        )}

        {pending && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2/50 px-4 py-3" role="status">
            <Sparkles className="size-4 animate-pulse text-primary" />
            <span className="text-sm text-ink-soft">
              Analyzing your data<span className="animate-pulse">…</span>
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </section>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export function PerformanceView() {
  const [data, setData] = useState<PerformancePayload | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<PerfTab>('overview')

  useEffect(() => {
    let alive = true
    perfApi
      .performanceHome()
      .then((p) => {
        if (alive) {
          setData(p)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (alive) setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [reloadKey])

  const retry = useCallback(() => {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }, [])

  // ── hand-off runner (exact store mapping) ──
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)
  const openExam = useAppStore((s) => s.openExam)
  const openLearn = useAppStore((s) => s.openLearn)
  const openHub = useAppStore((s) => s.openHub)
  const openConcept = useAppStore((s) => s.openConcept)
  const setMapScope = useAppStore((s) => s.setMapScope)

  const runHandoff = useCallback(
    (h: PerformanceHandoff) => {
      switch (h.kind) {
        case 'adaptive':
          setAdaptivePreset({ ...(h.adaptive ?? {}), autoStart: true })
          setView('adaptive')
          break
        case 'quiz':
          setQuizPreset(h.quiz ?? { count: 10 })
          setView('questions')
          break
        case 'exam':
          openExam(h.exam ?? {})
          break
        case 'learn':
          if (h.learn) openLearn(h.learn.kind, h.learn.id)
          break
        case 'hub':
          if (h.hub) openHub(h.hub.topicId, h.hub.conceptId ?? null)
          break
        case 'concept':
          if (h.conceptId) openConcept(h.conceptId)
          break
        case 'map':
          setMapScope(h.map?.scope ?? null)
          setView('map')
          break
        case 'mistakes':
          setView('mistakes')
          break
        case 'revision':
          setView('revision')
          break
        case 'planner':
          setView('planner')
          break
      }
    },
    [setAdaptivePreset, setView, setQuizPreset, openExam, openLearn, openHub, openConcept, setMapScope],
  )

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24 md:p-6 md:pb-10">
      {/* Page header — paper-grain zone (the indicator tiles sit directly on
          the page background, so the header zone carries the one aura moment) */}
      <header className="relative overflow-hidden rounded-2xl">
        <NoiseVeil />
        <PageHeader
          className="relative z-10"
          eyebrow={
            <>
              <Gauge className="mr-1 inline size-3" />
              Performance &amp; readiness
            </>
          }
          title={
            <>
              Performance intelligence —{' '}
              <span className="text-primary">measured, explained, actionable.</span>
            </>
          }
          intro="Built from your real learning signals — attempts, recall curves, revision, and mock tests. Not a rank prediction."
        />
      </header>

      {status === 'loading' && <PerfSkeleton />}
      {status === 'error' && <PerfError onRetry={retry} />}

      {status === 'ready' && data && (
        <>
          {/* sticky section tabs */}
          <div className="sticky top-14 z-20 -mx-4 mt-5 bg-background/85 px-4 py-2 backdrop-blur-md md:-mx-6 md:px-6">
            <div
              role="tablist"
              aria-label="Performance sections"
              className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {TABS.map((t) => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`perf-tab-${t.id}`}
                    aria-selected={active}
                    aria-controls={`perf-panel-${t.id}`}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div
            key={tab}
            role="tabpanel"
            id={`perf-panel-${tab}`}
            aria-labelledby={`perf-tab-${tab}`}
            className="mt-4 space-y-6"
          >
            {tab === 'overview' && <OverviewTab data={data} onTab={setTab} onHandoff={runHandoff} />}
            {tab === 'readiness' && <ReadinessTab data={data} />}
            {tab === 'trends' && <TrendsTab data={data} />}
            {tab === 'focus' && <FocusTab data={data} onHandoff={runHandoff} />}
            {tab === 'ai' && <AiTab onHandoff={runHandoff} />}
          </div>
        </>
      )}
    </div>
  )
}
