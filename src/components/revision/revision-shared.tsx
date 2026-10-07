'use client'

// ─── SMART REVISION · SHARED PRIMITIVES (PRODUCT 06) ───
// Small pieces reused by the home screen and the block runner. Visual
// language follows Porcelain Atlas (clay panels, sev tones, uppercase
// micro-labels, Reveal-style entrances). No raw palette colors.

import { useEffect, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import {
  Bandage, CircleDashed, CircleHelp, GitCompareArrows, Landmark, Layers,
  Lightbulb, Stethoscope,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { RevisionBlockKind } from '@/lib/types'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Slim scrollbar utility for long scrollable lists (queue, chips, dialogs)
export const SCROLL_SLIM =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line ' +
  '[&::-webkit-scrollbar-track]:bg-transparent'

// ─── Motion primitives (pattern from revise-view / adaptive views) ───────────

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

// ─── Micro label ──────────────────────────────────────────────────────────────

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

// ─── Block kind metadata ──────────────────────────────────────────────────────

export const KIND_META: Record<RevisionBlockKind, { icon: LucideIcon; tone: string; dot: string }> = {
  concept: { icon: Lightbulb, tone: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  flashcards: { icon: Layers, tone: 'bg-sev-ok/10 text-sev-ok', dot: 'bg-sev-ok' },
  mcq: { icon: CircleHelp, tone: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  pyq: { icon: Landmark, tone: 'bg-sev-warn/15 text-sev-warn', dot: 'bg-sev-warn' },
  mistake: { icon: Bandage, tone: 'bg-sev-crit/10 text-sev-crit', dot: 'bg-sev-crit' },
  compare: { icon: GitCompareArrows, tone: 'bg-info/10 text-info', dot: 'bg-info' },
  case: { icon: Stethoscope, tone: 'bg-mint/20 text-sev-ok', dot: 'bg-mint' },
}

// ─── Difficulty dots (same convention as adaptive-run) ────────────────────────

export function DifficultyDots({ n, className }: { n: number; className?: string }) {
  const d = Math.max(1, Math.min(3, n))
  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={`Difficulty ${d}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn('size-1.5 rounded-full', i <= d ? 'bg-foreground/70' : 'bg-foreground/15')} />
      ))}
    </span>
  )
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

export function fmtRelative(iso: string | null | undefined): string {
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

export function intervalLabel(days: number): string {
  if (days < 1) return `next review in ${Math.max(1, Math.round(days * 24))} hours`
  return `next review in ${days} ${days === 1 ? 'day' : 'days'}`
}

// Intelligence numbers may arrive as 0..1 fractions or 0..100 percentages
// depending on the source table — normalise honestly without inventing data.
export function asPct(v: number): number {
  return Math.round(v <= 1 ? v * 100 : v)
}

// Pull a "missed N×" count out of a block's measured why-chips, if present.
export function missedCountFromWhy(why: { label: string; note: string }[] | undefined): number | null {
  for (const w of why ?? []) {
    const m = /(\d+)\s*×/.exec(`${w.label} ${w.note}`)
    if (m) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}
