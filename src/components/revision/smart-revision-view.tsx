'use client'

// ─── SMART REVISION ENGINE · ROOT (PRODUCT 06) ───
// Answers "what should I revise today, and why?" One measured queue per day.
// Small state machine: home → run → summary. The run screen lives in
// revision-run.tsx; this file owns the home dashboard (queue, budget,
// intelligence panel, modes, custom builder, resume, recent, stats), the
// summary screen, and the session lifecycle. Every number shown is measured
// by the engine — reasons and notes render verbatim, no invented data.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, Bandage, Brain, CalendarClock, CheckCircle2, CircleDashed, Clock3, Compass,
  History, Home, ListChecks, Loader2, Play, RefreshCw, ShieldCheck, Shuffle, Timer, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import {
  REVISION_BLOCK_KIND_LABELS, REVISION_MODES,
} from '@/lib/types'
import type {
  RevisionBlock, RevisionBlockKind, RevisionIntelligence, RevisionMode,
  RevisionQueuePlan, RevisionSessionContent, RevisionSessionSummary, RevisionSmartHome,
  SubjectSummary,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { RevisionRun } from './revision-run'
import {
  AnimatedNumber, KIND_META, MicroLabel, Reveal, SCROLL_SLIM, asPct, fmtRelative,
} from './revision-shared'

type Phase = 'home' | 'run' | 'summary'
type LoadState = 'loading' | 'ready' | 'error'

interface ActiveSession {
  sessionId: string
  plan: RevisionQueuePlan
  content: RevisionSessionContent
}

const BUDGETS = [10, 15, 20, 30, 45]

const modeLabelOf = (m: RevisionMode) => REVISION_MODES.find((x) => x.id === m)?.label ?? m

// ─── Intelligence panel metadata ──────────────────────────────────────────────

type IntelKey = 'overdue' | 'forgotten' | 'repeated' | 'strong' | 'gaps' | 'highRisk'

const INTEL_CARDS: { key: IntelKey; label: string; icon: LucideIcon; tone: string }[] = [
  { key: 'overdue', label: 'Overdue', icon: Clock3, tone: 'bg-sev-crit/10 text-sev-crit' },
  { key: 'forgotten', label: 'Forgotten', icon: Brain, tone: 'bg-sev-warn/15 text-sev-warn' },
  { key: 'repeated', label: 'Repeated mistakes', icon: Bandage, tone: 'bg-sev-crit/10 text-sev-crit' },
  { key: 'strong', label: 'Strong', icon: ShieldCheck, tone: 'bg-sev-ok/10 text-sev-ok' },
  { key: 'gaps', label: 'Revision gaps', icon: CircleDashed, tone: 'bg-surface-2 text-ink-soft' },
  { key: 'highRisk', label: 'High-risk before exam', icon: AlertTriangle, tone: 'bg-sev-warn/15 text-sev-warn' },
]

interface IntelItem {
  id: string
  name: string
  sub: string
  conceptId?: string | null
  toMistakes?: boolean
}

function intelItems(intel: RevisionIntelligence, key: IntelKey): IntelItem[] {
  switch (key) {
    case 'overdue':
      return intel.overdue.map((i) => ({
        id: i.conceptId,
        name: i.name,
        sub: `recall est ${asPct(i.recall)}% · ${i.daysSince != null ? `${i.daysSince}d since last review` : 'no review logged yet'}`,
        conceptId: i.conceptId,
      }))
    case 'forgotten':
      return intel.forgotten.map((i) => ({
        id: i.conceptId,
        name: i.name,
        sub: `forgot ${i.forgotCount}× · recall est ${asPct(i.recall)}%`,
        conceptId: i.conceptId,
      }))
    case 'repeated':
      return intel.repeatedMistakes.map((i, idx) => ({
        id: i.questionId || String(idx),
        name: i.conceptName ?? i.topic,
        sub: `missed ${i.wrongCount}×${i.conceptName ? ` · ${i.topic}` : ''}`,
        toMistakes: true,
      }))
    case 'strong':
      return intel.strong.map((i) => ({
        id: i.conceptId,
        name: i.name,
        sub: `score ${asPct(i.score)}%`,
        conceptId: i.conceptId,
      }))
    case 'gaps':
      return intel.gaps.map((i) => ({
        id: i.conceptId,
        name: i.name,
        sub: `${i.attempts} attempts · last reviewed ${i.lastReviewed ? fmtRelative(i.lastReviewed) : 'never'}`,
        conceptId: i.conceptId,
      }))
    case 'highRisk':
      return intel.highRisk.map((i) => ({
        id: i.conceptId,
        name: i.name,
        sub: `mastery ${asPct(i.mastery)}% · exam weight ${i.examWeight}/5`,
        conceptId: i.conceptId,
      }))
  }
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function HeadlineChips({ headline }: { headline: string }) {
  const parts = headline.split('·').map((s) => s.trim()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((p, i) => {
        const m = /^(\d+)\s+(.+)$/.exec(p)
        return (
          <div key={i} className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            {m ? (
              <span className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums leading-none">
                  <AnimatedNumber value={Number(m[1])} />
                </span>
                <span className="text-[11px] font-medium leading-tight text-ink-soft">{m[2]}</span>
              </span>
            ) : (
              <span className="text-sm font-medium">{p}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BudgetPills({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Time budget in minutes">
      {BUDGETS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={cn(
            'min-h-9 rounded-full border px-3.5 text-xs font-semibold tabular-nums transition-colors',
            value === m
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-line bg-surface-2/60 text-ink-soft hover:border-primary/40 hover:text-foreground',
          )}
        >
          {m} min
        </button>
      ))}
    </div>
  )
}

function QueueRow({ b }: { b: RevisionBlock }) {
  const meta = KIND_META[b.kind]
  const Icon = meta.icon
  return (
    <li className="flex gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', meta.tone)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{b.title}</p>
          {b.done ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sev-ok">
              <CheckCircle2 className="size-3" /> done
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-line bg-background/60 px-2 py-0.5 text-[10px] font-bold tabular-nums text-ink-soft">
              {b.minutes}m
            </span>
          )}
        </div>
        <p className="truncate text-xs text-ink-soft">{b.subtitle}</p>
        <p className="text-xs leading-relaxed text-ink-soft">{b.reason}</p>
        {b.why.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {b.why.map((w, i) => (
              <span key={i} className="rounded-full border border-line bg-background/60 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                {w.label}{w.note ? ` · ${w.note}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function StatChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-ink-soft">
      <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
      {label}
    </span>
  )
}

function IntelRow({ item, onDrill, onMistakes }: { item: IntelItem; onDrill: (conceptId: string) => void; onMistakes: () => void }) {
  const actionable = item.toMistakes || !!item.conceptId
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        <span className="block truncate text-xs text-ink-soft">{item.sub}</span>
      </span>
      {actionable && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary">
          {item.toMistakes ? 'Review →' : 'Drill →'}
        </span>
      )}
    </>
  )
  if (!actionable) {
    return <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/40 p-3">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={() => (item.toMistakes ? onMistakes() : item.conceptId && onDrill(item.conceptId))}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/40 p-3 text-left transition-colors hover:border-primary/40"
    >
      {body}
    </button>
  )
}

// ─── Loading / error / empty states ──────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-4 w-36 rounded-md" />
        <Skeleton className="shimmer h-9 w-72 rounded-lg" />
        <Skeleton className="shimmer h-4 w-48 rounded-md" />
      </div>
      <Skeleton className="shimmer h-28 rounded-2xl" />
      <Skeleton className="shimmer h-72 rounded-2xl" />
      <Skeleton className="shimmer h-14 rounded-xl" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-24 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function HomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your revision plan</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The revision engine did not respond — it may still be warming up. Nothing is lost; your queue builds itself
          from your progress the moment it&apos;s back.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

function InsufficientData() {
  const reduce = useReducedMotion()
  return (
    <Reveal index={1}>
      <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
        <motion.span
          className="grid size-14 place-items-center rounded-full bg-primary/10"
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        >
          <Compass className="size-7 text-primary" aria-hidden />
        </motion.span>
        <h2 className="text-lg font-semibold tracking-tight">Not enough signal yet</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          Answer a few questions or review some cards and your queue will build itself — measured from what you
          actually know, not a fixed schedule.
        </p>
      </div>
    </Reveal>
  )
}

// ─── Summary ring ─────────────────────────────────────────────────────────────

function ProgressRing({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const size = 120
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-grid size-[7.5rem] place-items-center" role="img" aria-label={`${pct}% of blocks done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-line" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct / 100)))}
        />
      </svg>
      <span className="relative text-center">
        <span className="block text-2xl font-semibold tabular-nums leading-none">{label}</span>
        <span className="mt-1 block text-[10px] uppercase tracking-wider text-ink-soft">{sub}</span>
      </span>
    </span>
  )
}

// ─── Summary screen ───────────────────────────────────────────────────────────

function SummaryView({
  summary, starting, onStartNext, onHome,
}: {
  summary: RevisionSessionSummary
  starting: boolean
  onStartNext: () => void
  onHome: () => void
}) {
  const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0
  const acc = summary.accuracy && summary.accuracy.answered > 0 ? summary.accuracy : null
  const accPct = acc ? Math.round((acc.correct / acc.answered) * 100) : null
  const nextMeta = summary.next ? KIND_META[summary.next.kind] : null
  const NextIcon = nextMeta?.icon

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <Reveal index={0} className="space-y-1.5">
        <MicroLabel className="text-sev-ok">Session complete</MicroLabel>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{modeLabelOf(summary.mode)}</h1>
      </Reveal>

      <Reveal index={1}>
        <section className="glass flex flex-col items-center gap-6 rounded-2xl p-6 sm:flex-row sm:justify-between">
          <ProgressRing pct={pct} label={`${summary.done}/${summary.total}`} sub="blocks done" />
          <div className="space-y-2 text-center sm:text-right">
            <p className="text-3xl font-semibold tabular-nums leading-none">
              <AnimatedNumber value={summary.minutes} />
              <span className="ml-1.5 text-sm font-normal text-ink-soft">min planned</span>
            </p>
            {acc && accPct != null && (
              <p className={cn('text-sm font-medium', accPct >= 80 ? 'text-sev-ok' : 'text-ink-soft')}>
                {acc.correct}/{acc.answered} on revision questions — {accPct}%
                {accPct >= 80 && ' — strong work'}
              </p>
            )}
          </div>
        </section>
      </Reveal>

      {summary.message && (
        <Reveal index={2}>
          <p className="rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-sm italic leading-relaxed text-ink-soft">
            {summary.message}
          </p>
        </Reveal>
      )}

      {summary.next && nextMeta && NextIcon && (
        <Reveal index={3}>
          <section className="glass space-y-4 rounded-2xl p-5">
            <MicroLabel>Next</MicroLabel>
            <div className="flex items-start gap-3">
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', nextMeta.tone)}>
                <NextIcon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{summary.next.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{summary.next.reason}</p>
                <Badge variant="outline" className="mt-2 border-line text-[10px] uppercase tracking-wider text-ink-soft">
                  {REVISION_BLOCK_KIND_LABELS[summary.next.kind]}
                </Badge>
              </div>
            </div>
            <Button className="min-h-12 w-full" disabled={starting} onClick={onStartNext}>
              {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Start next session
            </Button>
          </section>
        </Reveal>
      )}

      <Reveal index={4}>
        <Button variant="outline" className="min-h-12 w-full" onClick={onHome}>
          <Home className="size-4" /> Back to revision home
        </Button>
      </Reveal>
    </div>
  )
}

// ─── Root view ────────────────────────────────────────────────────────────────

export function SmartRevisionView() {
  const setView = useAppStore((s) => s.setView)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  const [phase, setPhase] = useState<Phase>('home')
  const [home, setHome] = useState<RevisionSmartHome | null>(null)
  const [homeStatus, setHomeStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  const [session, setSession] = useState<ActiveSession | null>(null)
  const [summary, setSummary] = useState<RevisionSessionSummary | null>(null)

  const [budget, setBudget] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const [intelOpen, setIntelOpen] = useState<IntelKey | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customSubjects, setCustomSubjects] = useState<Set<string>>(new Set())
  const [customKinds, setCustomKinds] = useState<Set<RevisionBlockKind>>(new Set())
  const [subjects, setSubjects] = useState<SubjectSummary[] | null>(null)
  const [subjectsStatus, setSubjectsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const modesRef = useRef<HTMLElement>(null)
  const builderRef = useRef<HTMLElement>(null)
  const [dateLine] = useState(() =>
    new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  )

  // ── Data: home payload (state changes only inside promise callbacks) ──
  useEffect(() => {
    let cancelled = false
    api.revisionHome().then(
      (payload) => {
        if (cancelled) return
        setHome(payload)
        setBudget((b) => b ?? payload.today.minutes)
        setHomeStatus('ready')
      },
      () => {
        if (cancelled) return
        setHomeStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // ── Data: subject list for the custom builder (lazy, once) ──
  useEffect(() => {
    if (!customOpen || subjects || subjectsStatus !== 'idle') return
    let cancelled = false
    api.subjects().then(
      (res) => {
        if (cancelled) return
        setSubjects(res.subjects)
        setSubjectsStatus('ready')
      },
      () => {
        if (cancelled) return
        setSubjectsStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [customOpen, subjects, subjectsStatus])

  const retryHome = useCallback(() => {
    setHomeStatus('loading')
    setReloadKey((k) => k + 1)
  }, [])

  // ── Session lifecycle ──
  const startSession = useCallback(
    async (mode: RevisionMode, opts?: { minutes?: number; subjects?: string[]; kinds?: RevisionBlockKind[] }) => {
      setStarting(true)
      setStartError(null)
      try {
        const res = await api.startRevisionSession({
          mode,
          minutes: opts?.minutes ?? budget ?? undefined,
          subjects: opts?.subjects && opts.subjects.length > 0 ? opts.subjects : undefined,
          kinds: opts?.kinds && opts.kinds.length > 0 ? opts.kinds : undefined,
        })
        setSession({ sessionId: res.sessionId, plan: res.plan, content: res.content })
        setSummary(null)
        setPhase('run')
      } catch {
        setStartError(
          "The revision engine couldn't build this queue — the backend may still be warming up. Try again in a moment.",
        )
      } finally {
        setStarting(false)
      }
    },
    [budget],
  )

  const resumeSession = useCallback(async (id: string) => {
    setStarting(true)
    setStartError(null)
    try {
      const res = await api.resumeRevisionSession(id)
      setSession({ sessionId: res.session.id, plan: res.plan, content: res.content })
      setSummary(null)
      setPhase('run')
    } catch {
      setStartError("Couldn't resume that session — it may have expired. Start a fresh one instead.")
      setReloadKey((k) => k + 1)
    } finally {
      setStarting(false)
    }
  }, [])

  const handleComplete = useCallback((s: RevisionSessionSummary) => {
    setSummary(s)
    setSession(null)
    setPhase('summary')
  }, [])

  const backToHome = useCallback(() => {
    setPhase('home')
    setSession(null)
    setSummary(null)
    setStartError(null)
    setReloadKey((k) => k + 1)
  }, [])

  // ── Hand-offs from the intelligence panel ──
  const drillConcept = useCallback(
    (conceptId: string) => {
      setIntelOpen(null)
      setAdaptivePreset({ conceptId, autoStart: false })
      setView('adaptive')
    },
    [setAdaptivePreset, setView],
  )

  const reviewMistakes = useCallback(() => {
    setIntelOpen(null)
    setView('mistakes')
  }, [setView])

  const scrollToModes = useCallback(() => {
    modesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const openCustom = useCallback(() => {
    setCustomOpen(true)
    requestAnimationFrame(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [])

  // ── Derived ──
  const today = home?.today
  const estTotal = today ? today.blocks.reduce((s, b) => s + b.minutes, 0) : 0
  const intelKey = intelOpen
  const intelMeta = intelKey ? INTEL_CARDS.find((c) => c.key === intelKey) : null

  const toggleSubject = (id: string) => {
    setCustomSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleKind = (k: RevisionBlockKind) => {
    setCustomKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  // ── Phase: run ──
  if (phase === 'run' && session) {
    return (
      <div className="min-h-[60vh]">
        <RevisionRun
          key={session.sessionId}
          sessionId={session.sessionId}
          plan={session.plan}
          content={session.content}
          onComplete={handleComplete}
          onQuit={backToHome}
        />
      </div>
    )
  }

  // ── Phase: summary ──
  if (phase === 'summary' && summary) {
    return (
      <div className="min-h-[60vh]">
        <SummaryView
          summary={summary}
          starting={starting}
          onStartNext={() => void startSession('daily')}
          onHome={backToHome}
        />
      </div>
    )
  }

  // ── Phase: home ──
  return (
    <div className="min-h-[60vh]">
      {homeStatus === 'loading' && <HomeSkeleton />}
      {homeStatus === 'error' && <HomeError onRetry={retryHome} />}

      {homeStatus === 'ready' && home && (
        <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
          {/* Hero */}
          <Reveal index={0} className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <MicroLabel>Smart Revision</MicroLabel>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Your Revision for Today</h1>
              <p className="text-sm text-ink-soft">{dateLine}</p>
            </div>
            {home.today.exam && (
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums',
                    home.today.exam.near
                      ? 'bg-sev-warn/15 text-sev-warn'
                      : 'border border-line bg-surface-2/60 text-ink-soft',
                  )}
                >
                  <CalendarClock className="size-3.5" aria-hidden /> EXAM IN {home.today.exam.daysLeft}d
                </span>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-ink-soft">
                  {home.today.exam.label}
                  {home.today.exam.isEstimate ? ' (estimated)' : ''}
                </p>
              </div>
            )}
          </Reveal>

          {home.insufficientData ? (
            <>
              <InsufficientData />
              <Reveal index={2} className="flex flex-wrap gap-2">
                <StatChip icon={ListChecks} label={`${home.stats.blocksToday} blocks today`} />
                <StatChip icon={Timer} label={`${home.stats.minutesThisWeek} min this week`} />
                <StatChip
                  icon={History}
                  label={`last revised ${home.stats.lastRevisedAt ? fmtRelative(home.stats.lastRevisedAt) : 'never'}`}
                />
              </Reveal>
            </>
          ) : (
            <>
              {/* Headline band */}
              <Reveal index={1}>
                <section className="glass space-y-3 rounded-2xl p-5 md:p-6">
                  <HeadlineChips headline={home.today.headline} />
                  <p className="text-xs italic leading-relaxed text-ink-soft">{home.today.note}</p>
                </section>
              </Reveal>

              {/* Resume banner */}
              {home.resume && (
                <Reveal index={2}>
                  <div className="flex flex-col gap-3 rounded-xl border border-sev-warn/40 bg-sev-warn/10 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <History className="size-4 shrink-0 text-sev-warn" aria-hidden />
                      <p className="min-w-0 text-sm">
                        You have a <span className="font-semibold">{modeLabelOf(home.resume.mode)}</span> session in
                        progress —{' '}
                        <span className="font-semibold tabular-nums">
                          {home.resume.done}/{home.resume.total}
                        </span>{' '}
                        done.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="min-h-11 shrink-0"
                      disabled={starting}
                      onClick={() => home.resume && void resumeSession(home.resume.sessionId)}
                    >
                      {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Resume
                    </Button>
                  </div>
                </Reveal>
              )}

              {/* Queue + budget */}
              <Reveal index={3}>
                <section className="glass space-y-4 rounded-2xl p-5 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <MicroLabel>Today&apos;s queue</MicroLabel>
                    <BudgetPills value={budget ?? 20} onChange={setBudget} />
                  </div>
                  {home.today.blocks.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-ink-soft">
                      Nothing is due in this budget right now — a good day to get ahead.
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-ink-soft">
                        ≈ <span className="font-semibold tabular-nums">{estTotal}</span> min planned
                        {budget != null && estTotal > budget
                          ? ' — the queue re-plans to fit your budget when you start'
                          : ''}
                      </p>
                      <ul className={cn('max-h-[26rem] space-y-2 overflow-y-auto pr-1', SCROLL_SLIM)}>
                        {home.today.blocks.map((b) => (
                          <QueueRow key={b.id} b={b} />
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </Reveal>

              {/* CTA row */}
              <Reveal index={4} className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="lg"
                    className="min-h-12 flex-1 text-xs font-bold uppercase tracking-[0.08em]"
                    disabled={starting || home.today.blocks.length === 0}
                    onClick={() => void startSession('daily')}
                  >
                    {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    Start revision · {home.today.blocks.length} blocks · ~{estTotal} min
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="min-h-12 text-xs font-bold uppercase tracking-[0.08em]"
                    disabled={starting}
                    onClick={scrollToModes}
                  >
                    <Shuffle className="size-4" /> Shuffle focus
                  </Button>
                </div>
                {startError && (
                  <p className="flex items-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
                    <AlertTriangle className="size-3.5 shrink-0" /> {startError}
                  </p>
                )}
              </Reveal>

              {/* Intelligence strip */}
              <Reveal index={5} className="space-y-3">
                <MicroLabel>Revision intelligence</MicroLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {INTEL_CARDS.map((c) => {
                    const count = home.intelligence.counts[c.key]
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setIntelOpen(c.key)}
                        aria-haspopup="dialog"
                        className="glass flex items-center gap-3 rounded-xl p-3.5 text-left transition-colors hover:border-primary/40"
                      >
                        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', c.tone)}>
                          <c.icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-lg font-semibold leading-none tabular-nums">{count}</span>
                          <span className="block truncate text-[11px] text-ink-soft">{c.label}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Reveal>

              {/* Mode cards */}
              <Reveal index={6}>
                <section ref={modesRef} className="space-y-3 scroll-mt-20">
                  <MicroLabel>Revision modes</MicroLabel>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {home.modes.map((m) => {
                      const disabled = (m.count === 0 && m.id !== 'custom') || starting
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => (m.id === 'custom' ? openCustom() : void startSession(m.id))}
                          className="glass flex flex-col rounded-xl p-4 text-left transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          <span className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold leading-tight">{m.label}</h3>
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                                m.count > 0 ? 'bg-primary/10 text-primary' : 'bg-surface-2 text-ink-soft',
                              )}
                            >
                              {m.count} {m.count === 1 ? 'block' : 'blocks'}
                            </span>
                          </span>
                          <span className="mt-1.5 flex-1 text-xs leading-relaxed text-ink-soft">{m.blurb}</span>
                          {m.count === 0 && m.id !== 'custom' && (
                            <span className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                              Nothing due right now
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              </Reveal>

              {/* Custom builder */}
              {customOpen && (
                <Reveal index={7}>
                  <section ref={builderRef} className="glass space-y-4 rounded-2xl p-5 md:p-6 scroll-mt-20">
                    <div className="flex items-center justify-between gap-2">
                      <MicroLabel className="text-primary">Custom builder</MicroLabel>
                      <button
                        type="button"
                        onClick={() => setCustomOpen(false)}
                        aria-label="Close custom builder"
                        className="grid size-9 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <MicroLabel className="text-[10px]">Subjects</MicroLabel>
                      <p className="text-[11px] text-ink-soft">Leave empty to include everything.</p>
                      {subjectsStatus === 'loading' && (
                        <div className="flex flex-wrap gap-1.5" aria-busy="true">
                          {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="shimmer h-8 w-24 rounded-full" />
                          ))}
                        </div>
                      )}
                      {subjectsStatus === 'error' && (
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-sev-crit">Couldn&apos;t load subjects.</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-9"
                            onClick={() => setSubjectsStatus('idle')}
                          >
                            <RefreshCw className="size-3.5" /> Retry
                          </Button>
                        </div>
                      )}
                      {subjects && (
                        <div className={cn('flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1', SCROLL_SLIM)}>
                          {subjects.map((s) => {
                            const sel = customSubjects.has(s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                aria-pressed={sel}
                                onClick={() => toggleSubject(s.id)}
                                className={cn(
                                  'min-h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                                  sel
                                    ? 'border-primary/60 bg-primary/15 text-primary'
                                    : 'border-line bg-surface-2/60 text-ink-soft hover:border-primary/40',
                                )}
                              >
                                {s.name}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <MicroLabel className="text-[10px]">Block kinds</MicroLabel>
                      <div className={cn('flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1', SCROLL_SLIM)}>
                        {(Object.keys(REVISION_BLOCK_KIND_LABELS) as RevisionBlockKind[]).map((k) => {
                          const sel = customKinds.has(k)
                          return (
                            <button
                              key={k}
                              type="button"
                              aria-pressed={sel}
                              onClick={() => toggleKind(k)}
                              className={cn(
                                'min-h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                                sel
                                  ? 'border-primary/60 bg-primary/15 text-primary'
                                  : 'border-line bg-surface-2/60 text-ink-soft hover:border-primary/40',
                              )}
                            >
                              {REVISION_BLOCK_KIND_LABELS[k]}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <MicroLabel className="text-[10px]">Minutes</MicroLabel>
                      <BudgetPills value={budget ?? 20} onChange={setBudget} />
                    </div>

                    <Button
                      className="min-h-12 w-full text-xs font-bold uppercase tracking-[0.08em]"
                      disabled={starting}
                      onClick={() =>
                        void startSession('custom', {
                          minutes: budget ?? 20,
                          subjects: [...customSubjects],
                          kinds: [...customKinds],
                        })
                      }
                    >
                      {starting ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />}
                      Build my queue
                    </Button>
                  </section>
                </Reveal>
              )}

              {/* Recent runs */}
              <Reveal index={8} className="space-y-3">
                <MicroLabel>Recent runs</MicroLabel>
                {home.recent.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-xs text-ink-soft">
                    No sessions yet — your first one is one tap away.
                  </p>
                ) : (
                  <ul className="glass divide-y divide-line/60 rounded-2xl">
                    {home.recent.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{modeLabelOf(r.mode)}</span>
                        <span className="text-xs tabular-nums text-ink-soft">
                          {r.done}/{r.total} blocks · {r.minutes} min
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            r.status === 'completed' ? 'bg-sev-ok/10 text-sev-ok' : 'bg-sev-warn/15 text-sev-warn',
                          )}
                        >
                          {r.status === 'completed' ? fmtRelative(r.completedAt) : 'in progress'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Reveal>

              {/* Stats chips */}
              <Reveal index={9} className="flex flex-wrap gap-2">
                <StatChip icon={ListChecks} label={`${home.stats.blocksToday} blocks today`} />
                <StatChip icon={Timer} label={`${home.stats.minutesThisWeek} min this week`} />
                <StatChip
                  icon={History}
                  label={`last revised ${home.stats.lastRevisedAt ? fmtRelative(home.stats.lastRevisedAt) : 'never'}`}
                />
              </Reveal>
            </>
          )}
        </div>
      )}

      {/* Intelligence detail dialog */}
      <Dialog open={intelKey != null} onOpenChange={(o) => !o && setIntelOpen(null)}>
        <DialogContent className={cn('max-h-[80dvh] overflow-y-auto sm:max-w-md', SCROLL_SLIM)}>
          {intelKey && intelMeta && home && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{intelMeta.label}</DialogTitle>
                <DialogDescription className="text-left">
                  <span className="font-semibold tabular-nums">{home.intelligence.counts[intelKey]}</span> tracked ·
                  measured from your attempts, reviews and knowledge states.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {intelItems(home.intelligence, intelKey).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-ink-soft">
                    Nothing here right now — that&apos;s good news.
                  </p>
                ) : (
                  intelItems(home.intelligence, intelKey).map((item) => (
                    <IntelRow key={item.id} item={item} onDrill={drillConcept} onMistakes={reviewMistakes} />
                  ))
                )}
              </div>
              {intelItems(home.intelligence, intelKey).length > 0 && (
                <p className="text-[10px] text-ink-soft">
                  {intelKey === 'repeated'
                    ? 'Tap an item to open it in Mistake Intelligence.'
                    : 'Tap an item to drill it in the Adaptive Engine.'}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
