'use client'

// ─── AI STUDY PLANNER · SHARED PARTS (PRODUCT 07) ───
// Small presentational pieces shared by the planner view: slot metadata,
// task rows, phase timeline, progress bars, subject rows. Everything renders
// measured data verbatim — reasons are engine-written, never invented here.

import { motion } from 'framer-motion'
import {
  BookOpen, CalendarClock, CheckCircle2, CircleDashed, GraduationCap, ListChecks,
  RefreshCcw, Sparkles, Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PLANNER_SLOT_LABELS } from '@/lib/types'
import type { PlannerHandoff, PlannerPhase, PlannerSlot, PlannerSubjectRow, PlannerTask } from '@/lib/types'

// ─── slot metadata ───────────────────────────────────────────────────────────

export const SLOT_META: Record<PlannerSlot, { icon: LucideIcon; tone: string }> = {
  study: { icon: BookOpen, tone: 'bg-primary/10 text-primary' },
  practice: { icon: Target, tone: 'bg-sev-warn/15 text-sev-warn' },
  revise: { icon: RefreshCcw, tone: 'bg-sev-ok/10 text-sev-ok' },
  test: { icon: GraduationCap, tone: 'bg-sev-crit/10 text-sev-crit' },
}

// Module-level handoff metadata — looked up (never constructed) during render.
export const HANDOFF_META: Record<PlannerHandoff['type'], { icon: LucideIcon; label: string }> = {
  'learn-topic': { icon: BookOpen, label: 'Learn' },
  hub: { icon: ListChecks, label: 'Topic Hub' },
  adaptive: { icon: Sparkles, label: 'Start set' },
  mistakes: { icon: CircleDashed, label: 'Mistakes' },
  revision: { icon: RefreshCcw, label: 'Revise' },
  'mock-lab': { icon: GraduationCap, label: 'Mock Lab' },
}

// ─── reveal (shared micro-animation) ─────────────────────────────────────────

export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

// ─── task row ────────────────────────────────────────────────────────────────

export function TaskRow({
  task, busy, onStart, onDone, onSkip,
}: {
  task: PlannerTask
  busy: boolean
  onStart: (t: PlannerTask) => void
  onDone: (t: PlannerTask) => void
  onSkip: (t: PlannerTask) => void
}) {
  const meta = task.handoff ? HANDOFF_META[task.handoff.type] : null
  const done = task.status === 'done'
  const skipped = task.status === 'skipped'
  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        done ? 'border-sev-ok/30 bg-sev-ok/5' : skipped ? 'border-border/60 bg-muted/30 opacity-70' : 'border-border bg-background',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold', done && 'line-through decoration-sev-ok/60')}>
            {task.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{task.detail}</p>
        </div>
        <Badge variant="outline" className="shrink-0 gap-1 text-[10px] font-semibold">
          <CalendarClock className="size-3" /> {task.minutes}m
        </Badge>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-soft">
        <span className="font-semibold text-foreground/70">Why: </span>{task.reason}
        {task.carriedFrom > 0 && !done && (
          <span className="ml-1 font-semibold text-sev-warn">(carried from {task.carriedFrom}d ago)</span>
        )}
      </p>
      {task.status === 'pending' && (
        <div className="mt-2.5 flex items-center gap-2">
          {meta && (
            <Button size="sm" className="min-h-9 flex-1 gap-1.5 text-xs font-semibold" disabled={busy} onClick={() => onStart(task)}>
              <meta.icon className="size-3.5" /> {meta.label}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="min-h-9 flex-1 gap-1.5 text-xs font-semibold"
            disabled={busy}
            onClick={() => onDone(task)}
          >
            <CheckCircle2 className="size-3.5 text-sev-ok" /> Done
          </Button>
          <Button size="sm" variant="ghost" className="min-h-9 gap-1.5 text-xs text-ink-soft" disabled={busy} onClick={() => onSkip(task)}>
            Skip
          </Button>
        </div>
      )}
      {task.status !== 'pending' && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
          {meta && <><meta.icon className="size-3.5 text-sev-ok" />{meta.label} · </>}
          {done ? 'completed' : 'skipped'}
        </div>
      )}
    </div>
  )
}

// ─── phase timeline ──────────────────────────────────────────────────────────

export function PhaseTimeline({ phases, daysLeft }: { phases: PlannerPhase[]; daysLeft: number }) {
  return (
    <div className="space-y-2">
      {phases.map((p, i) => (
        <div
          key={p.id}
          className={cn(
            'rounded-xl border p-3',
            p.current ? 'border-primary/40 bg-primary/5' : 'border-border/70',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-bold">
              {i + 1}. {p.label}
              {p.current && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">now</span>}
            </p>
            <span className="shrink-0 text-[10px] font-semibold text-ink-soft">
              {p.fromDays === 0 ? 'today' : `D-${p.fromDays}`} → {p.toDays >= daysLeft ? 'exam' : `D-${p.toDays}`}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-soft">{p.goal}</p>
          {(p.focus.length > 0 || p.actions.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p.focus.slice(0, 3).map((f) => (
                <Badge key={f} variant="secondary" className="text-[9px] font-semibold">{f}</Badge>
              ))}
              {p.actions.slice(0, 2).map((a) => (
                <span key={a} className="text-[10px] text-ink-soft">· {a}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── subject row ─────────────────────────────────────────────────────────────

export function SubjectBar({ row }: { row: PlannerSubjectRow }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-semibold">{row.name}</p>
        <p className="shrink-0 text-[10px] font-semibold text-ink-soft">
          {row.coverage}% covered · weight ~{row.neetWeight}%
        </p>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(2, row.coverage)}%`, backgroundColor: row.color }}
        />
      </div>
      <p className="mt-1 truncate text-[10px] text-ink-soft">{row.reason}</p>
    </div>
  )
}

// ─── mini stat ───────────────────────────────────────────────────────────────

export function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'crit' }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background p-2.5 text-center">
      <p className={cn(
        'truncate text-base font-bold',
        tone === 'ok' && 'text-sev-ok', tone === 'warn' && 'text-sev-warn', tone === 'crit' && 'text-sev-crit',
      )}>{value}</p>
      <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wider text-ink-soft">{label}</p>
    </div>
  )
}

export function slotLabel(s: PlannerSlot): string {
  return PLANNER_SLOT_LABELS[s]
}
