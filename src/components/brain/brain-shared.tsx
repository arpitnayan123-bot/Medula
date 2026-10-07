'use client'

// ─── PERSONAL MEDICAL BRAIN · SHARED PRIMITIVES (PRODUCT 18) ─────────────────
// The brain is the intelligence layer over daily study: «Observe → Understand →
// Personalize → Predict → Improve». Binding rules for every component here:
// every number is MEASURED from real learning activity (never client-faked),
// every recommendation carries its evidence ("why am I seeing this" is always
// one tap away), the layer is PRIVATE BY DEFAULT, and there are no emojis,
// no chain-of-thought and no rank predictions anywhere.

import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Bandage, BookMarked, BookOpen, CalendarCheck, CircleHelp, ClipboardList, Info, Layers, Lock,
  Mic, ScanEye, Stethoscope,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BrainAction, BrainConceptStatus, BrainForgetRisk, BrainSignal, BrainStateCounts } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
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

// ── Tab registry (the six Medical Brain tabs) ────────────────────────────────

export type BrainTab = 'overview' | 'knowledge' | 'path' | 'memory' | 'strategy' | 'privacy'

export const BRAIN_TABS: { id: BrainTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'knowledge', label: 'Knowledge', icon: Layers },
  { id: 'path', label: 'Path', icon: BookMarked },
  { id: 'memory', label: 'Memory', icon: CalendarCheck },
  { id: 'strategy', label: 'Strategy', icon: ClipboardList },
  { id: 'privacy', label: 'Privacy', icon: Lock },
]

// ── StatusPill — the 7 published concept states, color-coded ─────────────────
// Ink-soft (not-started), warn (learning), teal (familiar/strong),
// ok (mastered), crit (at-risk), gold (needs-revision). Tokens only.

export const STATUS_META: Record<BrainConceptStatus, { label: string; chip: string; dot: string; bar: string }> = {
  'not-started': { label: 'Not started', chip: 'bg-ink-soft/12 text-ink-soft border-ink-soft/40', dot: 'bg-ink-soft/40', bar: 'bg-ink-soft/40' },
  learning: { label: 'Learning', chip: 'bg-sev-warn/12 text-sev-warn border-sev-warn/40', dot: 'bg-sev-warn', bar: 'bg-sev-warn' },
  familiar: { label: 'Familiar', chip: 'bg-primary/12 text-primary border-primary/40', dot: 'bg-primary', bar: 'bg-primary' },
  strong: { label: 'Strong', chip: 'bg-primary/10 text-primary border-primary/40', dot: 'bg-primary', bar: 'bg-primary' },
  mastered: { label: 'Mastered', chip: 'bg-sev-ok/12 text-sev-ok border-sev-ok/40', dot: 'bg-sev-ok', bar: 'bg-sev-ok' },
  'at-risk': { label: 'At risk', chip: 'bg-sev-crit/10 text-sev-crit border-sev-crit/40', dot: 'bg-sev-crit', bar: 'bg-sev-crit' },
  'needs-revision': { label: 'Needs revision', chip: 'bg-gold/12 text-gold border-gold/40', dot: 'bg-gold', bar: 'bg-gold' },
}

export const ALL_STATUSES = Object.keys(STATUS_META) as BrainConceptStatus[]

export function StatusPill({ status, className }: { status: BrainConceptStatus; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold whitespace-nowrap', meta.chip, className)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

// ── RiskPill — forgetting risk (none / low / moderate / high) ────────────────

const RISK_META: Record<BrainForgetRisk, { label: string; chip: string }> = {
  none: { label: 'No risk', chip: 'border-line bg-surface-2/60 text-ink-soft' },
  low: { label: 'Low risk', chip: 'bg-primary/12 text-primary border-primary/40' },
  moderate: { label: 'Moderate', chip: 'bg-sev-warn/12 text-sev-warn border-sev-warn/40' },
  high: { label: 'High', chip: 'bg-sev-crit/10 text-sev-crit border-sev-crit/40' },
}

export function RiskPill({ risk, className }: { risk: BrainForgetRisk; className?: string }) {
  const meta = RISK_META[risk]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', meta.chip, className)}>
      {meta.label}
    </span>
  )
}

// ── StateDistribution — one stacked bar across the 7 published states ────────
// Tapping a segment (or legend chip) jumps to the Knowledge tab pre-filtered.

export function StateDistribution({ counts, onJump, className }: {
  counts: BrainStateCounts
  onJump?: (state: BrainConceptStatus) => void
  className?: string
}) {
  const total = ALL_STATUSES.reduce((sum, s) => sum + counts[s], 0)
  return (
    <div className={className}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`Concept states: ${ALL_STATUSES.map((s) => `${STATUS_META[s].label} ${counts[s]}`).join(', ')}`}
      >
        {total > 0 && ALL_STATUSES.map((s) => {
          const n = counts[s]
          if (n === 0) return null
          const interactive = onJump != null
          return (
            <button
              key={s}
              type="button"
              onClick={interactive ? () => onJump!(s) : undefined}
              disabled={!interactive}
              aria-label={`Show ${STATUS_META[s].label.toLowerCase()} concepts — ${n}`}
              title={`${STATUS_META[s].label} · ${n}`}
              className={cn('h-full transition-opacity first:rounded-l-full last:rounded-r-full hover:opacity-80', STATUS_META[s].bar, !interactive && 'cursor-default')}
              style={{ width: `${(n / total) * 100}%` }}
            />
          )
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((s) => (
          <span
            key={s}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums',
              onJump ? 'cursor-pointer hover:opacity-80' : '',
              STATUS_META[s].chip,
            )}
            onClick={onJump ? () => onJump(s) : undefined}
            role={onJump ? 'button' : undefined}
            title={onJump ? `Filter Knowledge by ${STATUS_META[s].label.toLowerCase()}` : undefined}
          >
            <span className={cn('size-1.5 rounded-full', STATUS_META[s].dot)} aria-hidden />
            {counts[s]} {STATUS_META[s].label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── RecallBar — measured estRecall (0..1) as a thin 0–100% bar ───────────────

export function recallColor(recall: number | null): string {
  if (recall == null) return 'bg-transparent'
  if (recall >= 0.7) return 'bg-sev-ok'
  if (recall >= 0.5) return 'bg-sev-warn'
  return 'bg-sev-crit'
}

export function RecallBar({ recall, className, label }: { recall: number | null; className?: string; label?: string }) {
  const pct = recall == null ? null : Math.max(0, Math.min(100, Math.round(recall * 100)))
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}
      role="progressbar"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? (pct == null ? 'Recall not measured yet' : `Estimated recall ${pct}%`)}
    >
      {pct != null && (
        <div className={cn('h-full rounded-full transition-[width] duration-700', recallColor(recall))} style={{ width: `${pct}%` }} />
      )}
    </div>
  )
}

export function recallPct(recall: number | null | undefined): string {
  return recall == null ? '—' : `${Math.round(Math.max(0, Math.min(1, recall)) * 100)}%`
}

// ── WeightDots — curriculum exam weight 1..5 (published, not inferred) ───────

export function WeightDots({ weight, className }: { weight: number; className?: string }) {
  const w = Math.max(1, Math.min(5, weight))
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5', className)} role="img" aria-label={`Exam weight ${w} of 5`} title={`Exam weight ${w} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={cn('size-1.5 rounded-full', i < w ? 'bg-primary' : 'bg-primary/15')} aria-hidden />
      ))}
    </span>
  )
}

// ── EvidenceList — measured signal chips (the "why" behind every state) ──────

const SIGNAL_ICON: Record<BrainSignal['kind'], LucideIcon> = {
  mcq: CircleHelp,
  flashcards: Layers,
  revision: CalendarCheck,
  mistakes: Bandage,
  cases: Stethoscope,
  lesson: BookOpen,
  'learn-mark': BookMarked,
  lab: ScanEye,
  voice: Mic,
  mock: ClipboardList,
}

export function EvidenceList({ signals, className }: { signals: BrainSignal[]; className?: string }) {
  if (signals.length === 0) {
    return (
      <p className={cn('text-[11px] text-ink-soft', className)} role="note">
        No measured signals yet — the first solved question, flashcard or lesson read will appear here.
      </p>
    )
  }
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Measured signals">
      {signals.map((sig, i) => {
        const Icon = SIGNAL_ICON[sig.kind] ?? Info
        return (
          <li
            key={`${sig.kind}-${i}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[10px] text-ink-soft"
            title={sig.label}
          >
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{sig.label}</span>
            {sig.at && <span className="shrink-0 text-[9px] text-ink-soft/70">{relativeTime(sig.at)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

// ── WhyLine — "Why am I seeing this?" evidence row ───────────────────────────

export function WhyLine({ text, className }: { text?: string; className?: string }) {
  if (!text) return null
  return (
    <p className={cn('flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft', className)} role="note">
      <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span><span className="font-medium">Why this: </span>{text}</span>
    </p>
  )
}

// ── ActionButton — dispatches the store hand-offs a BrainAction asks for ─────
// Only actions that exist in the store are used: openHub (topic+concept),
// openLearn (topic), setQuizPreset+setView('questions'), setAdaptivePreset+
// setView('adaptive'), openExam, openLibrary({topicId}); every other view falls
// back to setView (revision, mistakes, tutor, graph, cases, lab, performance…).

export function ActionButton({ action, onOpen, variant = 'outline', size = 'sm', className }: {
  action: BrainAction
  onOpen?: () => void
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
}) {
  const setView = useAppStore((s) => s.setView)
  const openHub = useAppStore((s) => s.openHub)
  const openLearn = useAppStore((s) => s.openLearn)
  const openExam = useAppStore((s) => s.openExam)
  const openLibrary = useAppStore((s) => s.openLibrary)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  const open = () => {
    const a = action
    switch (a.view) {
      case 'hub':
        if (a.topicId) openHub(a.topicId, a.conceptId ?? null)
        else setView('hub')
        return
      case 'learn':
        if (a.topicId) openLearn('topic', a.topicId)
        else setView('learn')
        return
      case 'questions':
        if (a.conceptId || a.topicId) setQuizPreset({ conceptId: a.conceptId, topicId: a.topicId })
        setView('questions')
        return
      case 'adaptive':
        setAdaptivePreset({ conceptId: a.conceptId, topicId: a.topicId })
        setView('adaptive')
        return
      case 'exam':
        openExam()
        return
      case 'library':
        openLibrary(a.topicId ? { topicId: a.topicId } : undefined)
        return
      default:
        setView(a.view)
    }
  }

  return (
    <Button variant={variant} size={size} className={cn('rounded-xl text-xs', className)} onClick={() => { open(); onOpen?.() }} title={action.note}>
      {action.label}
    </Button>
  )
}

// ── SectionCard — the one porcelain card every tab builds on ────────────────;

export function SectionCard({ title, subtitle, icon: Icon, action, className, children }: {
  title?: string
  subtitle?: string
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('clay rounded-2xl p-4 md:p-6', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
                {title}
              </h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

// ── EmptyNote — honest thin-data note (never a fake zero) ────────────────────

export function EmptyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft', className)} role="note">
      <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

// ── ErrorState + SkeletonRow — honest loading / retry for every tab ──────────

export function BrainErrorState({ title, hint, onRetry }: { title: string; hint: string; onRetry: () => void }) {
  return (
    <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
      <span className="grid size-11 place-items-center rounded-2xl bg-surface-2" aria-hidden>
        <Info className="size-5 text-ink-soft" />
      </span>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="max-w-sm text-xs leading-relaxed text-ink-soft">{hint}</p>
      <Button variant="outline" className="min-h-11" onClick={onRetry}>Try again</Button>
    </div>
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

export function FootNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft', className)} role="note">
      <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

// ── Data hooks — async loads only (no synchronous setState in effects) ───────

export type LoadState = 'loading' | 'ready' | 'error'

export interface BrainPayloadState<T> {
  data: T | null
  state: LoadState
  stale: boolean // a reload is in flight — stale data stays visible
  reload: () => void
}

export function useBrainPayload<T>(fetcher: () => Promise<T>, dep?: string | number | null): BrainPayloadState<T> {
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

/** The home payload — fetched ONCE by the section shell, shared with the
 *  overview tab so the sticky header and the body never double-fetch. */
export function useBrainHome(): BrainPayloadState<import('@/lib/types').BrainHomePayload> {
  return useBrainPayload(api.brainHome)
}
