'use client'

// ─── MEDICAL IMAGE LEARNING LAB · SHARED PRIMITIVES (PRODUCT 10) ───
// Visual language matches the Case Simulator / Adaptive / Revision sections:
// glass + clay panels, sev tones, uppercase micro-labels, Reveal entrances.
// The API contract lives FROZEN in src/lib/types.ts — nothing here redefines
// it. This module must stay dependency-free (no viewer libs, no charts).

import { useEffect, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LAB_PROVENANCE_META } from '@/lib/types'
import type { LabFeedback, LabProvenance } from '@/lib/types'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Slim scrollbar utility for horizontally scrolling strips (chips, recents)
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

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

// ─── Time + number helpers ───────────────────────────────────────────────────

export function fmtClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
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

/** KnowledgeState mastery may arrive as 0..1 or 0..100 — normalise honestly. */
export function asPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.round(v <= 1 ? v * 100 : v)
}

/** Same status convention as the Knowledge Graph / Case Simulator. */
export function statusTone(s: string | null | undefined): string {
  switch (s) {
    case 'strong': return 'border-sev-ok/30 bg-sev-ok/12 text-sev-ok'
    case 'unstable': return 'border-sev-warn/30 bg-sev-warn/15 text-sev-warn'
    case 'weak': return 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit'
    default: return 'border-line bg-surface-2/60 text-ink-soft'
  }
}

// ─── Difficulty (1..3) — dots + label ────────────────────────────────────────

export const LAB_DIFFICULTY_META: Record<number, { label: string; tone: string }> = {
  1: { label: 'Foundation', tone: 'border-sev-ok/30 bg-sev-ok/12 text-sev-ok' },
  2: { label: 'Applied', tone: 'border-info/30 bg-info/12 text-info' },
  3: { label: 'Exam stretch', tone: 'border-sev-warn/30 bg-sev-warn/15 text-sev-warn' },
}

export function difficultyLabel(d: number): string {
  return LAB_DIFFICULTY_META[d]?.label ?? `Level ${d}`
}

/** 1..3 filled dots — compact difficulty marker for cards. */
export function DifficultyDots({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5', className)}
      role="img"
      aria-label={`Difficulty ${level} of 3 — ${difficultyLabel(level)}`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn('size-1.5 rounded-full', i <= level ? 'bg-primary' : 'bg-line')}
        />
      ))}
    </span>
  )
}

// ─── Provenance honesty chips (compact card form + full viewer form) ─────────

const PROV_COMPACT: Record<LabProvenance, { label: string; tone: string }> = {
  'owned-clinical': { label: 'Owned clinical', tone: 'border-sev-ok/30 bg-sev-ok/10 text-sev-ok' },
  'platform-diagram': { label: 'Platform diagram', tone: 'border-info/25 bg-info/10 text-info' },
  'ai-illustration': { label: 'AI illustration', tone: 'border-sev-warn/30 bg-sev-warn/10 text-sev-warn' },
}

export function ProvenanceChip({ provenance, full }: { provenance: LabProvenance; full?: boolean }) {
  if (full) {
    const meta = LAB_PROVENANCE_META[provenance]
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-ink-soft">
        {meta.badge}
      </span>
    )
  }
  const meta = PROV_COMPACT[provenance] ?? PROV_COMPACT['platform-diagram']
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider', meta.tone)}>
      {meta.label}
    </span>
  )
}

// ─── Exam relevance chip (1..5) ──────────────────────────────────────────────

export function RelevanceChip({ value }: { value: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary"
      aria-label={`Exam relevance ${value} of 5`}
    >
      exam {value}/5
    </span>
  )
}

// ─── Verdict semantics (deterministic engine output — lab has 3 verdicts) ────

type LabVerdict = NonNullable<LabFeedback['perOption']>[number]['verdict']

export const LAB_VERDICT_META: Record<LabVerdict, { icon: LucideIcon; label: string; chip: string }> = {
  correct: { icon: CheckCircle2, label: 'Correct', chip: 'border-sev-ok/30 bg-sev-ok/12 text-sev-ok' },
  acceptable: { icon: MinusCircle, label: 'Acceptable', chip: 'border-info/25 bg-info/10 text-info' },
  wrong: { icon: XCircle, label: 'Wrong', chip: 'border-sev-warn/30 bg-sev-warn/15 text-sev-warn' },
}

export function verdictTextTone(v: LabVerdict): string {
  return v === 'correct' ? 'text-sev-ok' : v === 'acceptable' ? 'text-info' : 'text-sev-warn'
}

// ─── Step-ID convention (client ↔ engine contract for /act payloads) ─────────
// The engine grades one step per act call; these are the stable step ids the
// client sends. Quiz steps use the seeded quiz item ids from LabImageDetail
// (q1, q2, …). Rapid-fire steps use the item's imageId.

export const LAB_STEP_IDS = {
  identify: 'identify',
  locate: 'locate',
  label: 'labels',
  diagnose: 'diagnose',
} as const

// ─── Rapid scope select chip ─────────────────────────────────────────────────

export function ScopeChip({
  active, onClick, children, ariaLabel,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'clay-in border-primary/40 bg-primary/12 text-primary'
          : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
