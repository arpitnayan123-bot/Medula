'use client'

// ─── AI PERSONALIZED STUDY PLANNER · ROOT (PRODUCT 07) ───
// Answers: «Given my exam date, target, current preparation and available
// time — what exactly should I study today?» The dashboard opens straight on
// TODAY (Study / Practice / Revise / Test + the single priority), then the
// plan overview (phases, weekly goals, honest feasibility), measured
// progress, intelligence notes and an AI coach that narrates the deterministic
// engine's output. Every reason shown is measured by the engine — no
// chain-of-thought, no rank predictions, ever.

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, Ban, Brain, CalendarClock, CalendarDays, CheckCircle2, ChevronDown,
  Clock3, Compass, Flame, Gauge, Loader2, Pencil, RefreshCw, Sparkles, Target, TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { isAppView, useAppStore } from '@/lib/store'
import { PLANNER_MODES, PLANNER_SLOT_HINTS, PLANNER_SLOT_LABELS } from '@/lib/types'
import type { PlannerAiResponse, PlannerHome, PlannerMode, PlannerSlot, PlannerTask } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/primitives/kit'
import { SpotlightCard } from '@/components/primitives/aura'
import { Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import {
  MicroLabel, MiniStat, PhaseTimeline, Reveal, SLOT_META, SubjectBar, TaskRow, slotLabel,
} from './planner-parts'

type LoadState = 'loading' | 'ready' | 'error'
type AiAction = 'why' | 'rebalance' | 'shrink' | 'realism' | 'next'

const AI_BUTTONS: { id: AiAction; label: string; icon: LucideIcon }[] = [
  { id: 'why', label: 'Why this plan?', icon: Compass },
  { id: 'next', label: 'What next?', icon: Target },
  { id: 'shrink', label: '1-hour version', icon: Clock3 },
  { id: 'rebalance', label: 'Rebalance missed', icon: RefreshCw },
  { id: 'realism', label: 'Reality check', icon: Gauge },
]

const todayIst = () =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date())

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`)

// ═════════════════════════════════════════════════════════════════════════════

export function PlannerView() {
  const setView = useAppStore((s) => s.setView)
  const openLearn = useAppStore((s) => s.openLearn)
  const openHub = useAppStore((s) => s.openHub)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  const [state, setState] = useState<LoadState>('loading')
  const [home, setHome] = useState<PlannerHome | null>(null)
  const [mode, setMode] = useState<PlannerMode>('auto')
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [aiBusy, setAiBusy] = useState<AiAction | null>(null)
  const [aiResults, setAiResults] = useState<Partial<Record<AiAction, PlannerAiResponse>>>({})
  const [aiOpen, setAiOpen] = useState<AiAction | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (m?: PlannerMode) => {
    // state updates only ever fire after the await boundary — never
    // synchronously inside the effect body (react-hooks/set-state-in-effect).
    try {
      const data = await api.plannerHome(m)
      setHome(data)
      if (m) setMode(m)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    // Initial load follows the house pattern: the promise resolves into state
    // setters (async), nothing is set synchronously inside the effect body.
    let cancelled = false
    api.plannerHome().then(
      (payload) => {
        if (cancelled) return
        setHome(payload)
        setState('ready')
      },
      () => {
        if (cancelled) return
        setState('error')
      },
    )
    return () => { cancelled = true }
  }, [reloadKey])

  // ── hand-off: start the task where the work actually lives ──
  const startTask = useCallback(async (t: PlannerTask) => {
    const h = t.handoff
    if (!h) return
    if (h.type === 'learn-topic') { openLearn('topic', h.topicId); return }
    if (h.type === 'hub') { openHub(h.topicId, h.conceptId ?? null); return }
    if (h.type === 'mistakes') { setView('mistakes'); return }
    if (h.type === 'mock-lab') { setView('questions'); return }
    if (h.type === 'adaptive') {
      setAdaptivePreset({ mode: h.mode, subjectCode: h.subjectCode, topicId: h.topicId, conceptId: h.conceptId, count: h.count, autoStart: true })
      setView('adaptive')
      return
    }
    if (h.type === 'revision') {
      setBusyTask(t.id)
      try { await api.startRevisionSession({ mode: h.mode, minutes: h.minutes }) } catch { /* the revision home still opens */ }
      setBusyTask(null)
      setView('revision')
    }
  }, [openHub, openLearn, setAdaptivePreset, setView])

  // ── done / skip: optimistic status, then a quiet re-sync ──
  const setTaskStatus = useCallback(async (t: PlannerTask, status: 'done' | 'skipped') => {
    setBusyTask(t.id)
    setHome((prev) => prev && prev.today ? {
      ...prev,
      today: {
        ...prev.today,
        slots: prev.today.slots.map((s) => ({
          ...s,
          tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, status } : x)),
        })),
      },
      progress: prev.progress ? {
        ...prev.progress,
        todayDoneCount: prev.progress.todayDoneCount + (status === 'done' ? 1 : 0),
        todayDoneMinutes: prev.progress.todayDoneMinutes + (status === 'done' ? t.minutes : 0),
      } : prev.progress,
    } : prev)
    try { await api.completePlannerTask({ taskId: t.id, status }) } catch { /* keep optimistic state; next load re-syncs */ }
    setBusyTask(null)
    void load(mode)
  }, [load, mode])

  const runAi = useCallback(async (action: AiAction) => {
    setAiOpen(action)
    setAiBusy(action)
    try {
      const res = await api.plannerAi(action)
      setAiResults((prev) => ({ ...prev, [action]: res }))
    } catch {
      setAiResults((prev) => ({
        ...prev,
        [action]: { ok: false, action, text: 'Could not reach the AI coach. The deterministic plan above still stands.', bullets: [], fallback: true, disclaimer: '' },
      }))
    }
    setAiBusy(null)
  }, [])

  // ═══ RENDER ═══

  if (state === 'loading' && !home) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-3 p-4 pb-28">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="flex gap-2 overflow-hidden">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />)}</div>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
      </div>
    )
  }

  if (state === 'error' || !home) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 p-8 pb-28 text-center">
        <AlertTriangle className="size-8 text-sev-warn" />
        <p className="text-sm font-semibold">The planner could not load right now.</p>
        <Button size="sm" variant="outline" className="min-h-10 gap-2" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      </div>
    )
  }

  // ── setup: no plan yet ──
  if (!home.hasPlan || !home.today || !home.plan || !home.feasibility || !home.progress || !home.settings) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 pb-28">
        <Reveal>
          <PlannerSetup
            initial={{
              examDate: home.settings?.examDate ?? null,
              examLabel: home.settings?.examLabel ?? '',
              targetNote: home.settings?.targetNote ?? '',
              dailyMinutes: home.settings?.dailyMinutes ?? 240,
              weekdayMinutes: home.settings?.weekdayMinutes ?? 0,
              weekendMinutes: home.settings?.weekendMinutes ?? 0,
              offDays: home.settings?.offDays ?? [],
            }}
            subjects={(home.subjects ?? []).slice(0, 4)}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
        </Reveal>
      </div>
    )
  }

  const { today, plan, feasibility, progress, settings } = home
  const plannedDone = progress.todayDoneMinutes
  const plannedTotal = progress.todayPlannedMinutes || today.capacityMinutes

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-28">
      {/* ── header ── */}
      <Reveal>
        <PageHeader
          eyebrow={<>AI Study Planner · {todayIst()}</>}
          title={plan.examLabel || 'NEET-PG'}
          intro={
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-foreground">{plan.daysLeft > 0 ? `${plan.daysLeft} days left` : 'exam day'}</span>
              {plan.examIsEstimate && <Badge variant="outline" className="text-[9px]">estimated date</Badge>}
              <span className="inline-flex items-center gap-1"><Flame className="size-3 text-sev-warn" /> {progress.streakDays}d streak</span>
              <span>· {progress.consistency14}% consistency</span>
            </span>
          }
          right={
            <Button size="sm" variant="outline" className="min-h-9 shrink-0 gap-1.5 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" /> Edit plan
            </Button>
          }
        />
      </Reveal>

      {/* ── priority banner ── */}
      {today.priority && (
        <Reveal delay={0.03}>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Target className="size-4.5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <MicroLabel>If you do only one thing today</MicroLabel>
                <p className="mt-0.5 text-sm font-bold leading-snug">{today.priority.title}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-soft">{today.priority.reason}</p>
              </div>
            </div>
          </div>
        </Reveal>
      )}
      {today.offDay && (
        <Reveal delay={0.03}>
          <div className="flex items-center gap-2 rounded-2xl border border-sev-ok/30 bg-sev-ok/5 p-3 text-xs font-semibold text-sev-ok">
            <CalendarDays className="size-4" /> Protected rest day — light recall only. Rest is part of the plan.
          </div>
        </Reveal>
      )}

      {/* ── mode chips ── */}
      <Reveal delay={0.05}>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PLANNER_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => void load(m.id)}
              title={m.blurb}
              className={cn(
                'min-h-9 shrink-0 rounded-full border px-3.5 text-xs font-bold transition-colors',
                today.mode === m.id && m.id !== 'auto' ? 'border-primary bg-primary text-primary-foreground'
                  : m.id === 'auto' && today.mode === m.id ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-ink-soft hover:border-primary/40 hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* ── TODAY board ── */}
      <Reveal delay={0.07}>
        <SpotlightCard className="clay rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <MicroLabel>Today · {today.modeLabel}</MicroLabel>
              <p className="mt-0.5 truncate text-sm font-bold">{today.headline}</p>
            </div>
            <Badge variant="secondary" className="gap-1 text-[10px] font-bold">
              <Clock3 className="size-3" /> {fmtMin(progress.todayPlannedMinutes)} planned · {fmtMin(today.capacityMinutes)} budget
            </Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, plannedTotal > 0 ? (plannedDone / plannedTotal) * 100 : 0)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-soft">
            {progress.todayDoneCount}/{progress.todayPlannedCount || today.slots.reduce((a, s) => a + s.tasks.length, 0)} tasks done · {fmtMin(plannedDone)} of {fmtMin(plannedTotal)} completed
            {today.carriedOverCount > 0 && <span className="ml-1 font-semibold text-sev-warn">· {today.carriedOverCount} carried over from missed days</span>}
          </p>
          {home.realized && (
            <p className="mt-1 text-[10px] leading-snug text-ink-soft">{home.realized.note}</p>
          )}
        </SpotlightCard>
      </Reveal>

      {/* ── slots ── */}
      {today.slots.map((slot, i) => {
        const meta = SLOT_META[slot.slot]
        const Icon = meta.icon
        const pending = slot.tasks.filter((t) => t.status === 'pending')
        const done = slot.tasks.filter((t) => t.status === 'done')
        return (
          <Reveal key={slot.slot} delay={0.09 + i * 0.02}>
            <section className="clay rounded-2xl p-4" aria-label={`${slotLabel(slot.slot)} tasks`}>
              <div className="flex items-center gap-2.5">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', meta.tone)}>
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight">{slotLabel(slot.slot)}</p>
                  <p className="truncate text-[11px] text-ink-soft">{PLANNER_SLOT_HINTS[slot.slot]}</p>
                </div>
                {slot.tasks.length > 0 && (
                  <Badge variant="outline" className="shrink-0 text-[10px] font-bold">
                    {done.length}/{slot.tasks.length} · {fmtMin(slot.minutes)}
                  </Badge>
                )}
              </div>
              <Stagger className="mt-3 space-y-2.5">
                {slot.tasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border/70 p-3 text-center text-[11px] text-ink-soft">
                    Nothing needed here today — {PLANNER_SLOT_HINTS[slot.slot].toLowerCase()} is already covered.
                  </p>
                )}
                {slot.tasks.map((t) => (
                  <StaggerItem key={t.id}>
                    <TaskRow task={t} busy={busyTask === t.id} onStart={(x) => void startTask(x)} onDone={(x) => void setTaskStatus(x, 'done')} onSkip={(x) => void setTaskStatus(x, 'skipped')} />
                  </StaggerItem>
                ))}
                {pending.length === 0 && slot.tasks.length > 0 && (
                  <p className="text-center text-[11px] font-semibold text-sev-ok">All clear in this slot ✓</p>
                )}
              </Stagger>
            </section>
          </Reveal>
        )
      })}

      {/* ── plan overview ── */}
      <Reveal delay={0.2}>
        <section className="clay rounded-2xl p-4" aria-label="Plan overview">
          <div className="flex items-center justify-between gap-2">
            <MicroLabel>Plan overview · {plan.stageLabel}</MicroLabel>
            <Badge variant="secondary" className="text-[9px] font-bold">mock every {plan.mockCadenceDays}d</Badge>
          </div>
          <div className="mt-3">
            <PhaseTimeline phases={plan.phases} daysLeft={plan.daysLeft} />
          </div>
          <div className="mt-3 space-y-1.5">
            {plan.weeklyGoals.map((g) => (
              <div key={g.id} className="rounded-xl bg-muted/40 p-2.5">
                <p className="text-xs font-semibold leading-snug">{g.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-ink-soft">{g.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── feasibility ── */}
      <Reveal delay={0.22}>
        <details className="clay group rounded-2xl p-4" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Gauge className={cn('size-4', feasibility.verdict === 'comfortable' ? 'text-sev-ok' : feasibility.verdict === 'tight' ? 'text-sev-warn' : 'text-sev-crit')} />
              <MicroLabel className="text-foreground">Feasibility</MicroLabel>
            </span>
            <span className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] font-bold',
                  feasibility.verdict === 'comfortable' && 'border-sev-ok/40 text-sev-ok',
                  feasibility.verdict === 'tight' && 'border-sev-warn/50 text-sev-warn',
                  feasibility.verdict === 'overcommitted' && 'border-sev-crit/40 text-sev-crit',
                )}
              >
                {feasibility.verdict}
              </Badge>
              <ChevronDown className="size-4 text-ink-soft transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <p className="mt-2.5 text-xs font-semibold leading-snug">{feasibility.headline}</p>
          <ul className="mt-2 space-y-1">
            {feasibility.notes.map((n, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-ink-soft"><span className="text-primary">·</span>{n}</li>
            ))}
          </ul>
        </details>
      </Reveal>

      {/* ── subjects ── */}
      {home.subjects.length > 0 && (
        <Reveal delay={0.24}>
          <section className="clay rounded-2xl p-4" aria-label="Priority subjects">
            <MicroLabel>Where the time goes · top subjects by urgency</MicroLabel>
            <div className="mt-3 space-y-3">
              {home.subjects.map((s) => <SubjectBar key={s.code} row={s} />)}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── intelligence ── */}
      {home.intelligence.length > 0 && (
        <Reveal delay={0.26}>
          <section className="clay rounded-2xl p-4" aria-label="Planner intelligence">
            <MicroLabel>What the engine noticed</MicroLabel>
            <div className="mt-3 space-y-2">
              {home.intelligence.map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 rounded-xl border border-border/70 p-2.5">
                  {n.tone === 'risk' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sev-crit" />
                    : n.tone === 'good' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sev-ok" />
                    : <Brain className="mt-0.5 size-4 shrink-0 text-primary" />}
                  <p className="min-w-0 flex-1 text-[11px] leading-snug">{n.text}</p>
                  {n.action && isAppView(n.action.view) && (
                    <Button size="sm" variant="ghost" className="min-h-8 shrink-0 gap-1 px-2 text-[11px] font-bold text-primary" onClick={() => setView(n.action!.view as never)}>
                      {n.action.label} →
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── progress ── */}
      <Reveal delay={0.28}>
        <section className="clay rounded-2xl p-4" aria-label="Progress">
          <div className="flex items-center justify-between gap-2">
            <MicroLabel>Progress · planned vs done</MicroLabel>
            <span className="text-[10px] font-semibold text-ink-soft">last 14 days</span>
          </div>
          <div className="mt-3 flex h-16 items-end gap-1">
            {progress.last14.map((d) => {
              const max = Math.max(60, d.planned)
              const hPct = Math.round((Math.max(d.planned, d.done) / max) * 100)
              const donePct = d.planned > 0 ? Math.round((d.done / d.planned) * 100) : 0
              return (
                <div key={d.dayKey} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.dayKey}: planned ${d.planned}m, done ${d.done}m`}>
                  <div className="flex h-12 w-full items-end justify-center">
                    <div className="relative w-full max-w-3.5 overflow-hidden rounded-full bg-muted" style={{ height: `${Math.max(6, hPct)}%` }}>
                      <div className="absolute bottom-0 w-full bg-primary" style={{ height: `${Math.min(100, donePct)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            <MiniStat label="Coverage" value={`${progress.syllabusCoverage}%`} />
            <MiniStat label="Streak" value={`${progress.streakDays}d`} tone={progress.streakDays >= 3 ? 'ok' : undefined} />
            <MiniStat label="Adherence 7d" value={`${progress.adherence7}%`} tone={progress.adherence7 >= 70 ? 'ok' : progress.adherence7 > 0 ? 'warn' : undefined} />
            <MiniStat label="Rev. debt" value={progress.revisionDebt} tone={progress.revisionDebt > 10 ? 'crit' : undefined} />
            <MiniStat label="Open mistakes" value={progress.openMistakes} tone={progress.openMistakes > 5 ? 'warn' : undefined} />
            <MiniStat label="Due cards" value={progress.dueCards} />
            <MiniStat label="Qs (7d)" value={progress.questionsLast7} />
            <MiniStat label="Mocks (30d)" value={progress.mocksLast30} />
            <MiniStat label="Today" value={`${progress.todayDoneCount}/${progress.todayPlannedCount || 0}`} tone={progress.todayPlannedCount > 0 && progress.todayDoneCount >= progress.todayPlannedCount ? 'ok' : undefined} />
            <MiniStat label="Done today" value={fmtMin(progress.todayDoneMinutes)} />
          </div>
        </section>
      </Reveal>

      {/* ── AI coach ── */}
      <Reveal delay={0.3}>
        <section className="clay rounded-2xl p-4" aria-label="AI coach">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <MicroLabel>AI coach · narrates the engine's numbers</MicroLabel>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {AI_BUTTONS.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant={aiOpen === b.id ? 'default' : 'outline'}
                className="min-h-9 gap-1.5 text-xs font-semibold"
                disabled={aiBusy !== null}
                onClick={() => void runAi(b.id)}
              >
                {aiBusy === b.id ? <Loader2 className="size-3.5 animate-spin" /> : <b.icon className="size-3.5" />}
                {b.label}
              </Button>
            ))}
          </div>
          {aiOpen && aiResults[aiOpen] && (
            <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <p className="text-xs leading-relaxed">{aiResults[aiOpen]!.text}</p>
              {aiResults[aiOpen]!.bullets.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {aiResults[aiOpen]!.bullets.map((b, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-ink-soft"><span className="text-primary">·</span>{b}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 flex items-start gap-1 text-[10px] leading-snug text-ink-soft">
                <Ban className="mt-0.5 size-3 shrink-0" />
                {aiResults[aiOpen]!.disclaimer}
                {aiResults[aiOpen]!.fallback && <span className="ml-1 font-semibold">(deterministic fallback — engine rules, no AI)</span>}
              </p>
            </div>
          )}
        </section>
      </Reveal>

      {/* ── plan notes ── */}
      <Reveal delay={0.32}>
        <section className="clay rounded-2xl border-dashed p-4" aria-label="Plan notes">
          <MicroLabel>Plan notes</MicroLabel>
          <ul className="mt-2 space-y-1">
            {plan.notes.map((n, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-ink-soft"><TrendingUp className="mt-0.5 size-3 shrink-0 text-ink-soft" />{n}</li>
            ))}
          </ul>
        </section>
      </Reveal>

      {/* ── edit dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Adjust the plan</DialogTitle>
            <DialogDescription className="text-xs">
              Changes rebuild the phases and today's queue immediately — the exam date drives every section.
            </DialogDescription>
          </DialogHeader>
          <PlannerSetup
            compact
            initial={settings}
            subjects={[]}
            onSaved={() => { setEditOpen(false); setReloadKey((k) => k + 1) }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════

interface SetupValues {
  examDate: string | null
  examLabel: string
  targetNote: string
  dailyMinutes: number
  weekdayMinutes: number
  weekendMinutes: number
  offDays: string[]
}

const OFF_DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MINUTE_PRESETS = [60, 120, 180, 240, 360, 480]

function PlannerSetup({
  initial, onSaved, compact, subjects,
}: {
  initial: SetupValues
  onSaved: () => void
  compact?: boolean
  subjects: { code: string; name: string; reason: string }[]
}) {
  const [v, setV] = useState<SetupValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.savePlannerPlan({
        examDate: v.examDate || null,
        examLabel: v.examLabel || undefined,
        targetNote: v.targetNote || undefined,
        dailyMinutes: v.dailyMinutes,
        weekdayMinutes: v.weekdayMinutes,
        weekendMinutes: v.weekendMinutes,
        offDays: v.offDays,
      })
      onSaved()
    } catch {
      setError('Could not save the plan — try again.')
    }
    setSaving(false)
  }

  const toggleOff = (d: string) =>
    setV((p) => ({ ...p, offDays: p.offDays.includes(d) ? p.offDays.filter((x) => x !== d) : [...p.offDays, d] }))

  const minutesField = (label: string, key: 'dailyMinutes' | 'weekdayMinutes' | 'weekendMinutes', hint: string) => (
    <div>
      <MicroLabel>{label}</MicroLabel>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {MINUTE_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setV((p) => ({ ...p, [key]: m }))}
            className={cn(
              'min-h-9 rounded-lg border px-3 text-xs font-bold transition-colors',
              v[key] === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-ink-soft hover:border-primary/40',
            )}
          >
            {m / 60}h
          </button>
        ))}
        <Input
          type="number"
          min={15}
          max={900}
          value={v[key] || ''}
          placeholder="min/day"
          onChange={(e) => setV((p) => ({ ...p, [key]: Math.max(0, Math.min(900, Number(e.target.value) || 0)) }))}
          className="min-h-9 w-24 text-xs"
          aria-label={label}
        />
      </div>
      <p className="mt-1 text-[10px] text-ink-soft">{hint}</p>
    </div>
  )

  return (
    <div className={cn('clay rounded-2xl p-5', compact ? '!border-0 !bg-transparent p-1' : '')}>
      {!compact && (
        <>
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <CalendarClock className="size-5 text-primary" />
            </span>
            <div>
              <h2 className="text-base font-bold leading-tight">Build your personal study plan</h2>
              <p className="text-xs text-ink-soft">Five honest inputs — the planner does the rest, every day.</p>
            </div>
          </div>
          {subjects.length > 0 && (
            <div className="mt-3 space-y-1 rounded-xl bg-muted/40 p-3">
              <MicroLabel>What the engine already sees</MicroLabel>
              {subjects.map((s) => (
                <p key={s.code} className="text-[11px] leading-snug text-ink-soft">· <span className="font-semibold text-foreground">{s.name}</span> — {s.reason}</p>
              ))}
            </div>
          )}
        </>
      )}

      <div className={cn('space-y-4', compact ? '' : 'mt-4')}>
        <div>
          <MicroLabel>Target exam date</MicroLabel>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={v.examDate ? v.examDate.slice(0, 10) : ''}
              onChange={(e) => setV((p) => ({ ...p, examDate: e.target.value || null }))}
              className="min-h-10 w-auto flex-1 text-sm"
              aria-label="Exam date"
            />
            <Input
              value={v.examLabel}
              onChange={(e) => setV((p) => ({ ...p, examLabel: e.target.value.slice(0, 60) }))}
              placeholder="NEET-PG / INI-CET…"
              className="min-h-10 w-auto flex-1 text-sm"
              aria-label="Exam label"
            />
          </div>
          <p className="mt-1 text-[10px] text-ink-soft">No date set? The planner uses an estimated NEET-PG window and marks it as an estimate.</p>
        </div>

        {minutesField('Daily study time', 'dailyMinutes', 'Your normal day — the auto mode builds around this.')}
        {minutesField('Weekday time', 'weekdayMinutes', '0 = same as daily. Weekends can differ below.')}
        {minutesField('Weekend time', 'weekendMinutes', '0 = same as daily.')}

        <div>
          <MicroLabel>Protected off days</MicroLabel>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {OFF_DAY_KEYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleOff(d)}
                className={cn(
                  'min-h-9 rounded-lg border px-3 text-xs font-bold transition-colors',
                  v.offDays.includes(d) ? 'border-sev-ok bg-sev-ok/10 text-sev-ok' : 'border-border bg-card text-ink-soft hover:border-primary/40',
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-ink-soft">Rest days get light recall only — they protect the streak instead of breaking it.</p>
        </div>

        <div>
          <MicroLabel>Target (optional pacing anchor)</MicroLabel>
          <Textarea
            value={v.targetNote}
            onChange={(e) => setV((p) => ({ ...p, targetNote: e.target.value.slice(0, 140) }))}
            placeholder='e.g. "Top government college" — used for pacing, never for rank predictions.'
            className="min-h-16 text-sm"
            aria-label="Target note"
          />
        </div>

        {error && <p className="text-xs font-semibold text-sev-crit">{error}</p>}

        <Button className="min-h-11 w-full gap-2 text-sm font-bold" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {compact ? 'Save changes' : 'Build my plan'}
        </Button>
        {!compact && (
          <p className="text-center text-[10px] leading-snug text-ink-soft">
            The planner balances your time against your syllabus. It never promises ranks or outcomes — that honesty is the feature.
          </p>
        )}
      </div>
    </div>
  )
}
