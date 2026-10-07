'use client'

// ─── PORCELAIN KIT — the one canonical set of shared UI primitives ──────────
// Every view composes from here: page headers, section titles, eyebrows,
// empty states, content callouts, reveal choreography, animated numbers,
// and the subject-identity glyph. Nothing here changes behavior — these are
// presentation primitives only.

import { useEffect, useState, type ReactNode } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  Baby,
  Bone,
  Bug,
  Dna,
  FlaskConical,
  HeartPulse,
  Leaf,
  Pill,
  Scissors,
  Sparkles,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// ── Motion ───────────────────────────────────────────────────────────────────

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
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

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
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

  return <span className={cn('tabular-nums', className)}>{reduce ? value : display}</span>
}

// ── Type ─────────────────────────────────────────────────────────────────────

/** Tiny uppercase eyebrow — the editorial label above sections. */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft', className)}>{children}</p>
  )
}

/** Canonical page header — serif display title + soft intro line. */
export function PageHeader({
  eyebrow,
  title,
  intro,
  right,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  intro?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('space-y-1.5', className)}>
      {eyebrow && <MicroLabel>{eyebrow}</MicroLabel>}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </div>
      {intro && <p className="max-w-2xl text-sm leading-relaxed text-ink-soft text-pretty">{intro}</p>}
    </header>
  )
}

/** Section title — quiet serif heading for in-page sections. */
export function SectionTitle({
  icon: Icon,
  children,
  right,
  className,
}: {
  icon?: LucideIcon
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
        {children}
      </h2>
      {right}
    </div>
  )
}

// ── Empty / human states ─────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-card/50 px-5 py-7 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="mb-0.5 grid size-10 place-items-center rounded-2xl bg-surface-2 text-ink-soft shadow-well">
          <Icon className="size-4.5" aria-hidden />
        </span>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-ink-soft text-pretty">{hint}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}

// ── Content callouts — medical info is never a wall of text ─────────────────

export type CalloutTone = 'pearl' | 'key' | 'exam' | 'easy' | 'warn'

const CALLOUT_TONES: Record<CalloutTone, { cls: string; label: string; icon: LucideIcon; iconCls: string }> = {
  pearl: { cls: 'callout-pearl', label: 'Clinical pearl', icon: Sparkles, iconCls: 'text-gold' },
  key: { cls: 'callout-key', label: 'Key point', icon: Stethoscope, iconCls: 'text-primary' },
  exam: { cls: 'callout-exam', label: 'Exam focus', icon: Activity, iconCls: 'text-sev-crit' },
  easy: { cls: 'callout-easy', label: 'In simple words', icon: Leaf, iconCls: 'text-sev-ok' },
  warn: { cls: 'callout-warn', label: 'Caution', icon: FlaskConical, iconCls: 'text-sev-warn' },
}

export function Callout({
  tone = 'key',
  title,
  children,
  className,
}: {
  tone?: CalloutTone
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  const t = CALLOUT_TONES[tone]
  return (
    <aside className={cn('callout', t.cls, className)}>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
        <t.icon className={cn('size-3.5', t.iconCls)} aria-hidden />
        <span className={t.iconCls}>{t.label}</span>
      </p>
      {title && <p className="mb-0.5 text-sm font-semibold text-foreground">{title}</p>}
      <div className="text-sm leading-relaxed text-ink-soft">{children}</div>
    </aside>
  )
}

// ── Subject identity — every subject is a world, subtly different ────────────

type SubjectIdentity = { icon: LucideIcon; color: string; tint: string }

const SUBJECT_IDENTITIES: { keys: string[]; identity: SubjectIdentity }[] = [
  { keys: ['anatomy', 'morpho'], identity: { icon: Bone, color: 'var(--subj-anatomy)', tint: 'oklch(0.64 0.10 40 / 12%)' } },
  { keys: ['physio'], identity: { icon: HeartPulse, color: 'var(--subj-physiology)', tint: 'oklch(0.60 0.085 200 / 12%)' } },
  { keys: ['biochem', 'chem'], identity: { icon: Dna, color: 'var(--subj-biochemistry)', tint: 'oklch(0.70 0.10 85 / 13%)' } },
  { keys: ['patho'], identity: { icon: FlaskConical, color: 'var(--subj-pathology)', tint: 'oklch(0.62 0.10 18 / 11%)' } },
  { keys: ['pharma'], identity: { icon: Pill, color: 'var(--subj-pharmacology)', tint: 'oklch(0.60 0.09 150 / 12%)' } },
  { keys: ['micro'], identity: { icon: Bug, color: 'var(--subj-microbiology)', tint: 'oklch(0.62 0.075 130 / 12%)' } },
  { keys: ['medicine', 'internal'], identity: { icon: Stethoscope, color: 'var(--subj-medicine)', tint: 'oklch(0.56 0.075 235 / 11%)' } },
  { keys: ['surgery', 'surgical'], identity: { icon: Scissors, color: 'var(--subj-surgery)', tint: 'oklch(0.55 0.065 212 / 11%)' } },
  { keys: ['paed', 'ped'], identity: { icon: Baby, color: 'var(--subj-paediatrics)', tint: 'oklch(0.72 0.085 50 / 14%)' } },
  { keys: ['obg', 'obstet', 'gynae'], identity: { icon: HeartPulse, color: 'var(--subj-obgyn)', tint: 'oklch(0.64 0.09 350 / 11%)' } },
]

const DEFAULT_IDENTITY: SubjectIdentity = { icon: Stethoscope, color: 'var(--primary)', tint: 'oklch(0.505 0.078 197 / 10%)' }

/** Resolve a subject's visual identity from any code/name string. */
export function subjectIdentity(code: string | null | undefined): SubjectIdentity {
  const s = (code ?? '').toLowerCase()
  for (const row of SUBJECT_IDENTITIES) {
    if (row.keys.some((k) => s.includes(k))) return row.identity
  }
  return DEFAULT_IDENTITY
}

/** Soft porcelain tile carrying the subject's glyph + identity tint. */
export function SubjectGlyph({
  code,
  name,
  size = 'md',
  className,
}: {
  code?: string | null
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const id = subjectIdentity(code ?? name)
  const sizes = { sm: 'size-8 rounded-lg', md: 'size-10 rounded-xl', lg: 'size-12 rounded-2xl' } as const
  const iconSizes = { sm: 'size-4', md: 'size-5', lg: 'size-6' } as const
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center border border-white/60 shadow-raised', sizes[size], className)}
      style={{ backgroundColor: id.tint, color: id.color }}
    >
      <id.icon className={iconSizes[size]} />
    </span>
  )
}
