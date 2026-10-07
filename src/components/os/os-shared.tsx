'use client'

// ─── Medical Education OS — shared primitives (PRODUCT 20) ──────────────────
// Same conventions as the Brain components: glass cards, micro labels,
// measured evidence lines, and hand-offs that reuse each feature's existing
// entry point (store presets / direct view switches). The OS never
// re-implements a feature — every button lands on the real one, in context.

import { useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { SpringBar } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import type { View } from '@/lib/types'
import {
  BookOpen, Target, CalendarCheck, Bandage, ClipboardList, Gauge, Compass,
  CircleHelp, Stethoscope, ScanEye, Mic, Layers, Users, Sparkles, ScanSearch,
  Brain, CalendarClock, Network,
} from 'lucide-react'

// ── kind → icon (one map for actions, feed rows and stat cards) ─────────────

export const OS_KIND_ICON = {
  learn: BookOpen,
  practice: Target,
  revise: CalendarCheck,
  fix: Bandage,
  test: ClipboardList,
  analyze: Gauge,
  explore: Compass,
} as const

export const OS_ACTIVITY_ICON = {
  practice: CircleHelp,
  revision: CalendarCheck,
  study: BookOpen,
  mock: ClipboardList,
  case: Stethoscope,
  image: ScanEye,
  voice: Mic,
  flashcards: Layers,
  community: Users,
  tutor: Sparkles,
  ask: ScanSearch,
} as const

export const OS_CONNECTION_ICON = {
  learn: BookOpen, tutor: Sparkles, ask: ScanSearch, questions: CircleHelp,
  mistakes: Bandage, revision: CalendarCheck, planner: CalendarClock,
  graph: Network, cases: Stethoscope, lab: ScanEye, exam: ClipboardList,
  performance: Gauge, community: Users, brain: Brain,
} as const

// ── navigation: hand-off through the EXISTING per-feature entry points ──────

export function useOsNavigate() {
  const setView = useAppStore((s) => s.setView)
  const openHub = useAppStore((s) => s.openHub)
  const openLearn = useAppStore((s) => s.openLearn)
  const openExam = useAppStore((s) => s.openExam)
  const openLibrary = useAppStore((s) => s.openLibrary)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  return useCallback((view: View, conceptId?: string, topicId?: string) => {
    switch (view) {
      case 'hub':
        if (topicId) openHub(topicId, conceptId ?? null)
        else setView('hub')
        return
      case 'learn':
        if (topicId) openLearn('topic', topicId)
        else setView('learn')
        return
      case 'questions':
        if (conceptId || topicId) setQuizPreset({ conceptId, topicId })
        setView('questions')
        return
      case 'adaptive':
        if (conceptId || topicId) setAdaptivePreset({ conceptId, topicId })
        setView('adaptive')
        return
      case 'exam':
        openExam()
        return
      case 'library':
        openLibrary(topicId ? { topicId } : undefined)
        return
      default:
        setView(view)
    }
  }, [setView, openHub, openLearn, openExam, openLibrary, setQuizPreset, setAdaptivePreset])
}

// ── small building blocks ────────────────────────────────────────────────────

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft', className)}>
      {children}
    </span>
  )
}

export function OsCard({ children, className, onClick, ariaLabel }: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  ariaLabel?: string
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'clay rounded-2xl p-4 text-left',
        onClick && 'clay-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
    >
      {children}
    </Comp>
  )
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-card/50 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
      {children}
    </p>
  )
}

export function FootNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-ink-soft">
      {children}
    </p>
  )
}

export function MiniBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return <SpringBar value={pct} className={cn('h-1.5', className)} />
}

export function StatusDot({ status }: { status: 'active' | 'quiet' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        status === 'active' ? 'bg-sev-ok' : 'bg-muted-foreground/30',
      )}
    />
  )
}

// Button wrapper that lands on the real feature with context attached.
export function OsGoButton({ view, conceptId, topicId, children, variant = 'outline', size = 'sm', className, onAfter }: {
  view: View
  conceptId?: string
  topicId?: string
  children: React.ReactNode
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
  onAfter?: () => void
}) {
  const go = useOsNavigate()
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('rounded-xl text-xs', className)}
      onClick={() => { go(view, conceptId, topicId); onAfter?.() }}
    >
      {children}
    </Button>
  )
}
