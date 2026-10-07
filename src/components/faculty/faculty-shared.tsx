'use client'

// ─── AI FACULTY & CONTENT INTELLIGENCE · SHARED PRIMITIVES (PRODUCT 19) ──────
// The faculty workspace manages the platform's content library: «Collect →
// Organize → Understand → Validate → Personalize». Binding rules for every
// component here: every number is MEASURED from the real content tables and
// learning activity (never client-faked), AI output is always badged AI-ASSISTED
// and never authoritative on its own, quality findings are flagged FOR human
// review (the engine never declares content correct), and there are no emojis,
// no chain-of-thought and no invented numbers anywhere.

import { useCallback, useEffect, useState } from 'react'
import {
  BadgeCheck, History, Info, LayoutDashboard, Lock, ShieldCheck, Sparkles, Star, Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FacultySeverity, FacultyVerificationStatus, FacultyDraftStatus, FacultyDraftKind, FacultyGapKind, FacultyQualityKind, FacultyHandoff } from '@/lib/types'
import { api } from '@/lib/api'
import { isAppView, useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

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

// ── Tab registry (the five Faculty Studio tabs) ──────────────────────────────

export type FacultyTab = 'overview' | 'gaps' | 'quality' | 'studio' | 'library'

export const FACULTY_TABS: { id: FacultyTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'gaps', label: 'Gaps', icon: Target },
  { id: 'quality', label: 'Quality & Review', icon: ShieldCheck },
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'library', label: 'Versions', icon: History },
]

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
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

// ── SeverityPill — info / warning / critical, non-alarm colors ───────────────
// Ink-soft (info), warn (warning), crit (critical) — matching the P18 semantics.

const SEVERITY_META: Record<FacultySeverity, { label: string; chip: string; dot: string }> = {
  info: { label: 'Info', chip: 'bg-ink-soft/12 text-ink-soft border-ink-soft/40', dot: 'bg-ink-soft/40' },
  warning: { label: 'Warning', chip: 'bg-sev-warn/12 text-sev-warn border-sev-warn/40', dot: 'bg-sev-warn' },
  critical: { label: 'Critical', chip: 'bg-sev-crit/10 text-sev-crit border-sev-crit/40', dot: 'bg-sev-crit' },
}

export function SeverityPill({ severity, className }: { severity: FacultySeverity; className?: string }) {
  const meta = SEVERITY_META[severity]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', meta.chip, className)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

// ── FacultyStatusPill — draft lifecycle + content verification states ────────
// draft (ink-soft) · in-review (warn) · published/verified (ok) ·
// rejected/flagged (crit) · unverified (ink-soft).

type StatusPillValue = FacultyDraftStatus | FacultyVerificationStatus

const STATUS_META: Record<StatusPillValue, { label: string; chip: string; dot: string }> = {
  draft: { label: 'Draft', chip: 'bg-ink-soft/12 text-ink-soft border-ink-soft/40', dot: 'bg-ink-soft/40' },
  'in-review': { label: 'In review', chip: 'bg-sev-warn/12 text-sev-warn border-sev-warn/40', dot: 'bg-sev-warn' },
  published: { label: 'Published', chip: 'bg-sev-ok/12 text-sev-ok border-sev-ok/40', dot: 'bg-sev-ok' },
  rejected: { label: 'Rejected', chip: 'bg-sev-crit/10 text-sev-crit border-sev-crit/40', dot: 'bg-sev-crit' },
  verified: { label: 'Verified', chip: 'bg-sev-ok/12 text-sev-ok border-sev-ok/40', dot: 'bg-sev-ok' },
  unverified: { label: 'Unverified', chip: 'bg-ink-soft/12 text-ink-soft border-ink-soft/40', dot: 'bg-ink-soft/40' },
  flagged: { label: 'Flagged', chip: 'bg-sev-crit/10 text-sev-crit border-sev-crit/40', dot: 'bg-sev-crit' },
}

export function FacultyStatusPill({ status, className }: { status: StatusPillValue; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', meta.chip, className)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

// ── AiAssistedBadge — always visible on AI-assisted drafts, warn-tinted ─────

export function AiAssistedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/12 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-sev-warn', className)}
      title="Drafted with AI assistance grounded in existing platform content — not authoritative until a reviewer publishes it."
    >
      <Sparkles className="size-3 shrink-0" aria-hidden />
      AI-ASSISTED
    </span>
  )
}

// ── VerifiedBadge — human-reviewed content version ───────────────────────────

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-ok/40 bg-sev-ok/12 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-sev-ok', className)}
      title="A human reviewer published this version — it is the verified content of record."
    >
      <BadgeCheck className="size-3 shrink-0" aria-hidden />
      Verified
    </span>
  )
}

// ── Humanized kind labels (published vocabulary, shown as-is) ────────────────

export const GAP_KIND_LABELS: Record<FacultyGapKind, string> = {
  'missing-lesson': 'Missing lessons',
  'missing-practice': 'No practice pool',
  'missing-revision': 'No revision material',
  'missing-case-correlation': 'No case correlation',
  'missing-prerequisite-lesson': 'Prereq without lesson',
  'unlinked-question': 'Unlinked questions',
  'unlinked-flashcard': 'Unlinked flashcards',
  'outdated-content': 'Outdated content',
}

export const QUALITY_KIND_LABELS: Record<FacultyQualityKind, string> = {
  'answer-key-skew': 'Answer-key skew',
  'duplicate-question': 'Duplicate question',
  'ambiguous-mcq': 'Ambiguous MCQ',
  'poor-explanation': 'Thin explanation',
  'missing-option-notes': 'Missing option notes',
  'missing-citation': 'Missing citation',
  'outdated-resource': 'Outdated resource',
  'fail-after-read': 'Fail after read',
  'open-report': 'Open report',
}

export const DRAFT_KIND_LABELS: Record<FacultyDraftKind, string> = {
  summary: 'Summary',
  simplify: 'Simplified explanation',
  'key-points': 'Key points',
  flashcards: 'Flashcards',
  mcq: 'MCQs',
  case: 'Clinical case',
  'revision-notes': 'Revision notes',
  'concept-links': 'Concept links',
  manual: 'Manual note',
}

// ── ExamWeightStars — curriculum exam weight as stars x/5 (published, not inferred)

export function ExamWeightStars({ weight, className }: { weight: number | null | undefined; className?: string }) {
  if (weight == null) return null
  const w = Math.max(1, Math.min(5, Math.round(weight)))
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5 text-[10px] leading-none', className)}
      role="img"
      aria-label={`Exam weight ${w} of 5`}
      title={`Exam weight ${w} of 5`}
    >
      <Star className="size-2.5 fill-current text-ink-soft" aria-hidden />
      <span className="font-semibold tabular-nums">{w}/5</span>
    </span>
  )
}

// ── PriorityBar — the published 0..100 priority score, as a thin bar ─────────

export function PriorityBar({ priority, className }: { priority: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(priority)))
  return (
    <span className={cn('inline-flex w-16 shrink-0 items-center gap-1.5', className)}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Priority ${pct} of 100`} title={`Priority ${pct}/100`}>
        <span
          className={cn('block h-full rounded-full', pct >= 70 ? 'bg-sev-crit' : pct >= 40 ? 'bg-sev-warn' : 'bg-ink-soft/40')}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-6 shrink-0 text-right text-[10px] font-semibold tabular-nums text-ink-soft">{pct}</span>
    </span>
  )
}

// ── MonoChip — a measured line rendered as a mono chip (demand lines, etc.) ──

export function MonoChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full shrink-0 items-center rounded-md border border-line bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10px] text-ink-soft', className)}>
      {children}
    </span>
  )
}

// ── StatChip — one compact measured inventory stat ───────────────────────────

export function StatChip({ value, label, className }: { value: number | string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11px]', className)}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-ink-soft">{label}</span>
    </span>
  )
}

// ── HandoffButton — dispatches the store hand-offs a FacultyHandoff asks for ─
// Only helpers that exist in the store are used: brain → openBrain (with the
// optional focus tab), learn/questions → setView, everything else falls back to
// setView when the target is a real app view.

export function HandoffButton({ handoff, className }: { handoff: FacultyHandoff; className?: string }) {
  const setView = useAppStore((s) => s.setView)
  const openBrain = useAppStore((s) => s.openBrain)

  const open = () => {
    if (handoff.view === 'brain') {
      const tab = handoff.focus
      openBrain(
        tab && ['overview', 'knowledge', 'path', 'memory', 'strategy', 'privacy'].includes(tab)
          ? { tab: tab as 'overview' | 'knowledge' | 'path' | 'memory' | 'strategy' | 'privacy' }
          : undefined,
      )
      return
    }
    if (isAppView(handoff.view)) setView(handoff.view)
  }

  return (
    <Button variant="outline" size="sm" className={cn('min-h-9 shrink-0 rounded-xl px-3 text-xs', className)} onClick={open}>
      {handoff.label}
    </Button>
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

// ── GateNote — the reviewer-gated trust line (Lock icon) ─────────────────────

export function GateNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft', className)} role="note">
      <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

// ── FacultyErrorState + SkeletonRow — honest loading / retry for every tab ───

export function FacultyErrorState({ title, hint, onRetry }: { title: string; hint: string; onRetry: () => void }) {
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

// Scroll classes for long lists (P18 convention).
export const SCROLL_LIST = 'max-h-[38rem] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5'

// ── Data hooks — async loads only (no synchronous setState in effects) ───────

export type LoadState = 'loading' | 'ready' | 'error'

export interface FacultyPayloadState<T> {
  data: T | null
  state: LoadState
  stale: boolean // a reload is in flight — stale data stays visible
  reload: () => void
}

export function useFaculty<T>(fetcher: () => Promise<T>, dep?: string | number | null): FacultyPayloadState<T> {
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

/** The faculty home payload — fetched ONCE by the section shell, shared with
 *  the overview tab so the sticky header and the body never double-fetch. */
export function useFacultyHome(): FacultyPayloadState<import('@/lib/types').FacultyHomePayload> {
  return useFaculty(api.facultyHome)
}
