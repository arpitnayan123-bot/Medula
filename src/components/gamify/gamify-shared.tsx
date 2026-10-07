'use client'

// ─── MOTIVATION · SHARED PRIMITIVES (PRODUCT 17) ─────────────────────────────
// The gamified layer is deliberately quiet: every number is measured from real
// study activity, the XP table is published in-product, streaks are a healthy
// view of consistency (never guilt), ranks stay secondary, and rewards are
// non-monetary. No notification badges, no countdown pressure, no shaming —
// the copy rules below are binding for every component in this section.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity, Award, Bandage, BookOpen, Brain, CalendarCheck, CalendarDays, CheckCircle2, ChevronDown,
  ClipboardList, Compass, Crosshair, Crown, Flag, Flame, Footprints, Gem, GraduationCap, HeartPulse,
  Key, Layers, Lightbulb, Lock, Medal, Microscope, Minus, Mountain, Network, PenLine, Puzzle, Repeat,
  Rocket, ShieldCheck, Sparkles, Star, Stethoscope, Target, TrendingUp, Trophy, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GamifyStreakLine, GamifyStreakState } from '@/lib/types'
import { XP_TABLE } from '@/lib/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduce ? 0 : 0.05 * index, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

// ── Relative time (client-computed — app views render after hydration) ───────

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-soft', className)} title={new Date(iso).toLocaleString('en-IN')}>
      <CalendarDays className="size-3 shrink-0" aria-hidden />
      {relativeTime(iso)}
    </span>
  )
}

// ── Tab registry (the six Motivation tabs) ───────────────────────────────────

export type GamifyTab = 'overview' | 'journey' | 'achievements' | 'challenges' | 'boards' | 'rewards'

export const GAMIFY_TABS: { id: GamifyTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'journey', label: 'Journey', icon: Compass },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'challenges', label: 'Challenges', icon: Target },
  { id: 'boards', label: 'Boards', icon: Trophy },
  { id: 'rewards', label: 'Rewards', icon: Gem },
]

// ── Accent themes — scoped to THIS section only (rewards say so) ─────────────
// The section root carries data-accent; components pick classes from this map
// via useAccent(). Defaults follow the level: ≥7 slate, ≥5 amber, ≥3 mint,
// otherwise clinical cyan. Applied only inside the Motivation section.

export type GamifyAccentId = 'clinical-cyan' | 'mint-rounds' | 'amber-clinical' | 'slate-attending'

export interface GamifyAccentClasses {
  text: string // icon / value text
  soft: string // soft tinted background
  chipBg: string
  chipText: string
  chipBorder: string
  bar: string // progress-bar fill
  barTrack: string
  dot: string
  swatch: string // gradient swatch for the rewards preview
}

export const ACCENTS: Record<GamifyAccentId, GamifyAccentClasses> = {
  'clinical-cyan': {
    text: 'text-primary', soft: 'bg-primary/10', chipBg: 'bg-primary/12', chipText: 'text-primary',
    chipBorder: 'border-primary/40', bar: 'bg-primary', barTrack: 'bg-primary/15', dot: 'bg-primary',
    swatch: 'bg-gradient-to-br from-primary via-primary/70 to-primary/25',
  },
  'mint-rounds': {
    text: 'text-sev-ok', soft: 'bg-sev-ok/10', chipBg: 'bg-sev-ok/12', chipText: 'text-sev-ok',
    chipBorder: 'border-sev-ok/40', bar: 'bg-sev-ok', barTrack: 'bg-sev-ok/15', dot: 'bg-sev-ok',
    swatch: 'bg-gradient-to-br from-sev-ok via-sev-ok/70 to-mint/60',
  },
  'amber-clinical': {
    text: 'text-gold', soft: 'bg-gold/10', chipBg: 'bg-gold/12', chipText: 'text-gold',
    chipBorder: 'border-gold/40', bar: 'bg-gold', barTrack: 'bg-gold/15', dot: 'bg-gold',
    swatch: 'bg-gradient-to-br from-gold via-gold/70 to-gold/25',
  },
  'slate-attending': {
    text: 'text-ink-soft', soft: 'bg-ink-soft/10', chipBg: 'bg-ink-soft/12', chipText: 'text-ink-soft',
    chipBorder: 'border-ink-soft/40', bar: 'bg-ink-soft', barTrack: 'bg-ink-soft/15', dot: 'bg-ink-soft',
    swatch: 'bg-gradient-to-br from-ink-soft via-ink-soft/70 to-ink-soft/25',
  },
}

/** Published default: the section's accent follows the unlocked tier by level. */
export function accentForLevel(level: number): GamifyAccentId {
  if (level >= 7) return 'slate-attending'
  if (level >= 5) return 'amber-clinical'
  if (level >= 3) return 'mint-rounds'
  return 'clinical-cyan'
}

const AccentContext = createContext<GamifyAccentId>('clinical-cyan')

export function GamifyAccentProvider({ value, children }: { value: GamifyAccentId; children: React.ReactNode }) {
  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>
}

export function useAccent(): GamifyAccentClasses {
  return ACCENTS[useContext(AccentContext)]
}

export function useAccentId(): GamifyAccentId {
  return useContext(AccentContext)
}

// ── XpRing — measured level progress, level number centred, tier under ───────

export function XpRing({
  level, tier, xpIntoLevel, xpForNextLevel, size = 96, strokeWidth = 7, className,
}: {
  level: number; tier: string; xpIntoLevel: number; xpForNextLevel: number
  size?: number; strokeWidth?: number; className?: string
}) {
  const accent = useAccent()
  const pct = xpForNextLevel > 0 ? Math.max(0, Math.min(1, xpIntoLevel / xpForNextLevel)) : 0
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Level ${level} — ${Math.round(pct * 100)}% of the way to the next level`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-primary/15" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} stroke="currentColor"
          className={cn('transition-[stroke-dashoffset] duration-700', accent.text)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Level</span>
        <span className={cn('font-bold leading-none tracking-tight', accent.text)} style={{ fontSize: size * 0.26 }}>{level}</span>
      </div>
      {tier && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          {tier}
        </span>
      )}
    </div>
  )
}

// ── PercentRing — same visual language for journey stages / readiness ────────

export function PercentRing({ percent, size = 56, strokeWidth = 5, label, className }: {
  percent: number | null; size?: number; strokeWidth?: number; label?: string; className?: string
}) {
  const accent = useAccent()
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={pct == null ? 'No measurement yet' : `${Math.round(pct)} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-primary/15" />
        {pct != null && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} stroke="currentColor"
            className={cn('transition-[stroke-dashoffset] duration-700', accent.text)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className={cn('font-bold leading-none tracking-tight', pct == null ? 'text-ink-soft' : accent.text)} style={{ fontSize: size * 0.24 }}>
          {pct == null ? '—' : `${Math.round(pct)}%`}
        </span>
      </div>
      {label && <span className="sr-only">{label}</span>}
    </div>
  )
}

// ── LevelBadge / StreakChip / DemoTag / StatChip ─────────────────────────────

export function LevelBadge({ level, tier, className }: { level: number; tier?: string; className?: string }) {
  const accent = useAccent()
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', accent.chipBg, accent.chipText, accent.chipBorder, className)}>
      <Award className="size-3.5" aria-hidden />
      {tier ? `${tier} · Level ${level}` : `Level ${level}`}
    </span>
  )
}

const STREAK_DOT: Record<GamifyStreakState, string> = {
  intact: 'bg-primary',
  recovered: 'bg-gold',
  open: 'bg-transparent border border-line',
  none: 'bg-ink-soft/30',
}

export function StreakChip({ label, line, className }: { label: string; line: GamifyStreakLine; className?: string }) {
  return (
    <span
      className={cn('inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface-2/70 px-3 py-1.5 text-xs', className)}
      title={line.note}
    >
      <Flame className={cn('size-3.5 shrink-0', line.state === 'intact' || line.state === 'recovered' ? 'text-primary' : 'text-ink-soft/50')} aria-hidden />
      <span className="font-medium">{label}</span>
      <span className="font-semibold tabular-nums">{line.days}{line.state === 'none' ? '' : 'd'}</span>
      <span className={cn('size-2 shrink-0 rounded-full', STREAK_DOT[line.state])} aria-hidden />
      <span className="sr-only">{line.note}</span>
    </span>
  )
}

export function DemoTag({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft', className)}
      title="Seeded demo peer — not a real classmate"
    >
      demo
    </span>
  )
}

export function StatChip({ value, label, className }: { value: number | string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11px]', className)}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-ink-soft">{label}</span>
    </span>
  )
}

// ── SectionCard / SkeletonRow / EmptyState / Bar / FootNote ──────────────────

export function SectionCard({ title, icon: Icon, description, action, className, children }: {
  title?: string; icon?: LucideIcon; description?: string; action?: React.ReactNode
  className?: string; children: React.ReactNode
}) {
  return (
    <section className={cn('clay rounded-2xl p-4 md:p-5', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function SkeletonRow({ className, rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, hint, action, className }: {
  icon: LucideIcon; title: string; hint: string; action?: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center', className)} role="note">
      <span className="grid size-11 place-items-center rounded-2xl bg-surface-2" aria-hidden>
        <Icon className="size-5 text-ink-soft" />
      </span>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="max-w-sm text-xs leading-relaxed text-ink-soft">{hint}</p>
      {action}
    </div>
  )
}

export function ErrorState({ title, hint, onRetry }: { title: string; hint: string; onRetry: () => void }) {
  return (
    <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
      <span className="grid size-11 place-items-center rounded-2xl bg-surface-2" aria-hidden>
        <Activity className="size-5 text-ink-soft" />
      </span>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="max-w-sm text-xs leading-relaxed text-ink-soft">{hint}</p>
      <Button variant="outline" className="min-h-11" onClick={onRetry}>Try again</Button>
    </div>
  )
}

export function Bar({ value, className, label }: { value: number | null; className?: string; label?: string }) {
  const accent = useAccent()
  const pct = value == null ? null : Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full', accent.barTrack)} role="progressbar" aria-valuenow={pct == null ? undefined : Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {pct != null && <div className={cn('h-full rounded-full transition-[width] duration-700', accent.bar)} style={{ width: `${pct}%` }} />}
    </div>
  )
}

export function FootNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft', className)} role="note">
      <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

// ── 'How XP works' — the published table, transparent by design ──────────────

const XP_KIND_LABEL: Record<string, string> = {
  'mcq-correct': 'Correct answer',
  'mcq-repeat-correct': 'Correct on a redo',
  'mcq-attempt': 'Attempt reviewed',
  revision: 'Revision block',
  flashcards: 'Flashcards',
  study: 'Study block',
  mock: 'Mock exam',
  case: 'Clinical case',
  'topic-mastered': 'Topic mastered',
  'mistake-corrected': 'Mistake fixed',
  'challenge-completed': 'Challenge completed',
}

export function XpTableCard({ recoveryRule }: { recoveryRule?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="clay overflow-hidden rounded-2xl">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none ring-primary/50 focus-visible:ring-2 md:px-5">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <BookOpen className="size-4 shrink-0 text-primary" aria-hidden />
            How XP works
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-line px-4 py-4 md:px-5">
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Published XP table — every point comes from measured study activity</caption>
                <thead>
                  <tr className="bg-surface-2/70 text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                    <th scope="col" className="px-3 py-2 font-semibold">Activity</th>
                    <th scope="col" className="px-3 py-2 font-semibold">XP</th>
                    <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell">What counts</th>
                  </tr>
                </thead>
                <tbody>
                  {XP_TABLE.map((row) => (
                    <tr key={row.kind} className="border-t border-line align-top">
                      <td className="px-3 py-2">
                        <span className="block font-medium">{XP_KIND_LABEL[row.kind] ?? row.kind}</span>
                        <span className="text-[10px] text-ink-soft">{row.unit}</span>
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-primary">+{row.xp}</td>
                      <td className="hidden px-3 py-2 text-ink-soft sm:table-cell">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
              Level curve — total XP for level L is 50 · (L−1) · L: level 2 at 100 XP, level 3 at 300, level 5 at 1,000, level 10 at 4,500.
              {' '}Nothing is granted for opening the app or for screen time — only the measured activity above earns XP.
            </p>
            {recoveryRule && (
              <p className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft" role="note">
                <Flame className="mt-0.5 size-3 shrink-0" aria-hidden />
                {recoveryRule}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

// ── Icon registries — engine sends lucide icon hints / kind ids ──────────────

const GAMIFY_ICONS: Record<string, LucideIcon> = {
  award: Award, trophy: Trophy, target: Target, flame: Flame, 'book-open': BookOpen,
  stethoscope: Stethoscope, microscope: Microscope, brain: Brain, sparkles: Sparkles,
  'shield-check': ShieldCheck, 'clipboard-check': ClipboardList, activity: Activity,
  'heart-pulse': HeartPulse, zap: Zap, star: Star, medal: Medal, crown: Crown,
  'graduation-cap': GraduationCap, 'calendar-check': CalendarCheck, network: Network,
  flag: Flag, rocket: Rocket, puzzle: Puzzle, repeat: Repeat, clock: Trophy,
  'check-circle': CheckCircle2, 'circle-check': CheckCircle2, layers: Layers,
  'pen-line': PenLine, crosshair: Crosshair, footprints: Footprints, mountain: Mountain,
  key: Key, lightbulb: Lightbulb, gem: Gem, compass: Compass, bandage: Bandage,
}

/** Icon registry lookup — engines send lucide icon hints; unknown → Award. */
export const GAMIFY_ICON_MAP: Record<string, LucideIcon> = GAMIFY_ICONS

export const XP_KIND_META: Record<string, { icon: LucideIcon; label: string }> = {
  'mcq-correct': { icon: CheckCircle2, label: 'Correct answer' },
  'mcq-repeat-correct': { icon: Repeat, label: 'Correct on a redo' },
  'mcq-attempt': { icon: PenLine, label: 'Attempt reviewed' },
  revision: { icon: CalendarCheck, label: 'Revision block' },
  flashcards: { icon: Layers, label: 'Flashcards' },
  study: { icon: BookOpen, label: 'Study block' },
  mock: { icon: ClipboardList, label: 'Mock exam' },
  case: { icon: Stethoscope, label: 'Clinical case' },
  'topic-mastered': { icon: GraduationCap, label: 'Topic mastered' },
  'mistake-corrected': { icon: Bandage, label: 'Mistake fixed' },
  'challenge-completed': { icon: Trophy, label: 'Challenge completed' },
}

export function xpKindMeta(kind: string): { icon: LucideIcon; label: string } {
  return XP_KIND_META[kind] ?? { icon: Zap, label: kind.replace(/-/g, ' ') }
}

export const MOTIVATION_KIND_ICON: Record<string, LucideIcon> = {
  'close-topic': Flag,
  'accuracy-up': TrendingUp,
  blockers: ShieldCheck,
  'revision-backlog': Layers,
  streak: Flame,
}

// ── Data hooks — async writes only (no synchronous setState in effects) ──────

export type LoadState = 'loading' | 'ready' | 'error'

export interface GamifyPayloadState<T> {
  data: T | null
  state: LoadState
  stale: boolean // a reload is in flight — stale data stays visible
  reload: () => void
}

export function useGamifyPayload<T>(fetcher: () => Promise<T>, dep?: string | number | null): GamifyPayloadState<T> {
  const [data, setData] = useState<T | null>(null)
  const [meta, setMeta] = useState<{ key: number; state: LoadState }>({ key: 0, state: 'loading' })
  const [key, setKey] = useState(0)

  useEffect(() => {
    let alive = true
    fetcher().then(
      (p) => { if (alive) { setData(p); setMeta({ key, state: 'ready' }) } },
      () => { if (alive) setMeta({ key, state: 'error' }) },
    )
    return () => { alive = false }
  }, [key, dep])

  const reload = useCallback(() => setKey((k) => k + 1), [])
  return { data, state: meta.state, stale: meta.key !== key, reload }
}

/** The home payload — fetched ONCE by the section shell and shared with the
 *  overview tab so the sticky header and the body never double-fetch. */
export function useGamifyHome(): GamifyPayloadState<import('@/lib/types').GamifyHomePayload> {
  return useGamifyPayload(api.gamifyHome)
}

// ── Signed delta — neutral-positive phrasing only, never deficit framing ────

export function friendlyDelta(current: number | null, previous: number | null): { text: string; tone: 'up' | 'flat' | 'info' } | null {
  if (current == null || previous == null) return null
  const d = current - previous
  if (d > 0) return { text: `+${d} XP vs last week`, tone: 'up' }
  if (d === 0) return { text: 'level with last week', tone: 'flat' }
  // Below last week: state both numbers without any deficit language.
  return { text: `last week ${previous}`, tone: 'info' }
}

export function DeltaIcon({ tone }: { tone: 'up' | 'flat' | 'info' }) {
  if (tone === 'up') return <TrendingUp className="size-3 shrink-0" aria-hidden />
  if (tone === 'flat') return <Minus className="size-3 shrink-0" aria-hidden />
  return <Activity className="size-3 shrink-0" aria-hidden />
}

