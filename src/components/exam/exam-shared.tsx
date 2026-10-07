'use client'

// ─── EXAM LAB · SHARED PRIMITIVES (PRODUCT 12) ───
// Small building blocks reused across the Exam Lab screens. Visual language
// follows Porcelain Atlas: clay panels, shadow-well icon tiles, sev tones,
// uppercase micro-labels, Reveal entrances. All data comes from payloads.

import { useEffect, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExamMode } from '@/lib/types'
import { EXAM_MODES } from '@/lib/types'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Slim scrollbar utility for horizontally/vertically scrolling strips.
export const SCROLL_SLIM =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line ' +
  '[&::-webkit-scrollbar-track]:bg-transparent'

// ─── Motion primitives (same pattern as sim-shared) ──────────────────────────

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
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

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (reduce) return
    const controls = animate(0, value, {
      duration: 1,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span className={className}>{reduce ? value : display}</span>
}

// ─── Section header (uppercase micro label + optional right slot) ─────────────

export function SectionTitle({ children, right, className }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{children}</p>
      {right}
    </div>
  )
}

// ─── Stat tile (measured value + label; render '—' upstream for null) ─────────

export function StatTile({ icon: Icon, value, label, accent }: { icon: LucideIcon; value: string; label: string; accent?: boolean }) {
  return (
    <div className="clay flex min-h-16 min-w-0 flex-1 basis-36 items-center gap-3 rounded-2xl px-4 py-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl shadow-well', accent ? 'bg-primary/12 text-primary' : 'bg-surface-2 text-ink-soft')}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold tabular-nums leading-tight">{value}</span>
        <span className="block truncate text-[11px] font-medium text-ink-soft">{label}</span>
      </span>
    </div>
  )
}

// ─── Horizontal bar row: label + bar + value ──────────────────────────────────

export function BarRow({
  label,
  pct,
  valueText,
  tone = 'primary',
  sub,
}: {
  label: string
  pct: number // 0..100
  valueText?: string
  tone?: 'primary' | 'ok' | 'warn' | 'crit'
  sub?: string
}) {
  const reduce = useReducedMotion()
  const clamped = Math.max(0, Math.min(100, pct))
  const barTone =
    tone === 'ok'
      ? 'bg-sev-ok'
      : tone === 'warn'
        ? 'bg-sev-warn'
        : tone === 'crit'
          ? 'bg-sev-crit'
          : 'bg-gradient-to-r from-primary to-[oklch(0.62_0.105_158)]'
  const textTone =
    tone === 'ok' ? 'text-sev-ok' : tone === 'warn' ? 'text-sev-warn' : tone === 'crit' ? 'text-sev-crit' : 'text-foreground'
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
        {valueText != null && <span className={cn('shrink-0 text-xs font-bold tabular-nums', textTone)}>{valueText}</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="presentation">
        <motion.div
          className={cn('h-full rounded-full', barTone)}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
      {sub && <p className="mt-1 truncate text-[11px] text-ink-soft">{sub}</p>}
    </div>
  )
}

// ─── Difficulty dots (1..3) — same tone ladder as platform severity ───────────

export function DifficultyDots({ n, className }: { n: number; className?: string }) {
  const level = Math.max(1, Math.min(3, Math.round(n)))
  const tone = level === 1 ? 'bg-sev-ok' : level === 2 ? 'bg-sev-warn' : 'bg-sev-crit'
  const label = level === 1 ? 'Easy' : level === 2 ? 'Moderate' : 'Hard'
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={`Difficulty: ${label}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn('size-1.5 rounded-full', i <= level ? tone : 'bg-line')} aria-hidden />
      ))}
    </span>
  )
}

// ─── Mode badge (short honest label per exam mode) ────────────────────────────

const MODE_SHORT: Record<ExamMode, string> = {
  full: 'Full mock',
  subject: 'Subject',
  topic: 'Topic',
  pyq: 'PYQ',
  custom: 'Custom',
  weak: 'Weak-area',
  adaptive: 'Adaptive',
  image: 'Image-based',
  rapid: 'Rapid',
}

export function modeLabel(mode: ExamMode): string {
  return MODE_SHORT[mode] ?? mode
}

export function modeBadge(mode: ExamMode, className?: string) {
  const tone =
    mode === 'full'
      ? 'border-primary/40 bg-primary/12 text-primary'
      : mode === 'weak'
        ? 'border-sev-warn/30 bg-sev-warn/12 text-sev-warn'
        : mode === 'rapid'
          ? 'border-info/30 bg-info/10 text-info'
          : 'border-line bg-surface-2/70 text-ink-soft'
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider', tone, className)}>
      {MODE_SHORT[mode] ?? mode}
    </span>
  )
}

/** Mode metadata straight from the frozen registry (names/taglines/presets). */
export function modeInfo(mode: ExamMode) {
  return EXAM_MODES.find((m) => m.id === mode)
}

// ─── Time + number helpers ────────────────────────────────────────────────────

/** Countdown clock from whole seconds: mm:ss, or h:mm:ss past one hour. */
export function formatClock(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Human duration from milliseconds — «42s», «3m 12s», «1h 05m». */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'then'
  const diff = Date.now() - then
  if (diff < 0) return 'just now'
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

/** Mastery may arrive as 0..1 or 0..100 — normalise honestly. */
export function asPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.round(v <= 1 ? v * 100 : v)
}

/** Signed delta with explicit sign — «+7», «−4», «0». */
export function signed(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`
}

/** Accuracy tone — mirrors the platform's 70/50 severity bands. */
export function accuracyTone(pct: number | null | undefined): 'ok' | 'warn' | 'crit' | 'muted' {
  if (pct == null || !Number.isFinite(pct)) return 'muted'
  if (pct >= 70) return 'ok'
  if (pct >= 50) return 'warn'
  return 'crit'
}

export function accuracyText(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  return `${Math.round(pct)}%`
}

export function toneClass(tone: 'ok' | 'warn' | 'crit' | 'muted'): string {
  switch (tone) {
    case 'ok': return 'text-sev-ok'
    case 'warn': return 'text-sev-warn'
    case 'crit': return 'text-sev-crit'
    default: return 'text-ink-soft'
  }
}
