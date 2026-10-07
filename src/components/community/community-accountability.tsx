'use client'

// ─── COMMUNITY · ACCOUNTABILITY (PRODUCT 16) ─────────────────────────────────
// Everything on this page is MEASURED from your real study activity (attempts,
// sessions, reviews, mocks) in IST day-windows — nothing is estimated. Peer
// numbers are labelled demo. The tone is deliberately gentle: goals are guides,
// not judgments, and rest is part of the plan.

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays, CheckCircle2, Flame, Info, ListTodo, Loader2, Pause, Play, Plus,
  ShieldAlert, Sparkles, Trash2, Trophy, Users,
} from 'lucide-react'
import type {
  CommunityAccountabilityPayload, CommunityChallengeView, CommunityGoalView,
} from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  EmptyState, MicroLabel, ProgressMeter, Reveal, RelativeTime, StreakFlame,
} from './community-shared'

type LoadState = 'loading' | 'ready' | 'error'
type GoalScope = 'daily' | 'weekly' | 'commitment'

const GOAL_KINDS: { value: string; label: string; unit: string }[] = [
  { value: 'mcqs', label: 'MCQs — questions solved', unit: 'mcqs' },
  { value: 'study', label: 'Study — minutes of logged study', unit: 'minutes' },
  { value: 'revision', label: 'Revision — revision sessions cleared', unit: 'sessions' },
  { value: 'mock', label: 'Mocks — full / sectional tests', unit: 'mocks' },
  { value: 'case', label: 'Cases — simulated cases', unit: 'cases' },
  { value: 'custom', label: 'Custom — your own metric', unit: 'times' },
]

export function CommunityAccountabilityScreen() {
  const [payload, setPayload] = useState<CommunityAccountabilityPayload | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [busyGoalId, setBusyGoalId] = useState<string | null>(null)

  // add-goal dialog
  const [addScope, setAddScope] = useState<GoalScope | null>(null)
  const [gKind, setGKind] = useState('mcqs')
  const [gTitle, setGTitle] = useState('')
  const [gTarget, setGTarget] = useState('20')
  const [gDue, setGDue] = useState('')
  const [adding, setAdding] = useState(false)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    setState('loading')
    api.communityAccountability().then(
      (p) => { if (alive) { setPayload(p); setState('ready') } },
      () => { if (alive) setState('error') },
    )
    return () => { alive = false }
  }, [reloadKey])

  const goalOp = (op: 'pause' | 'resume' | 'delete', goal: CommunityGoalView) => {
    if (busyGoalId) return
    setBusyGoalId(goal.id)
    api.communityGoal({ op, id: goal.id }).then(
      () => {
        toast({
          title: op === 'pause' ? 'Goal paused' : op === 'resume' ? 'Goal resumed' : 'Goal deleted',
          description: op === 'pause'
            ? 'It keeps its progress — resume whenever you\u2019re ready.'
            : op === 'delete'
              ? 'Removed. Pausing next time keeps the history.'
              : undefined,
        })
        refetch()
      },
      () => toast({ title: 'Could not update the goal', description: 'Try again in a moment.', variant: 'destructive' }),
    ).finally(() => setBusyGoalId(null))
  }

  const confirmDelete = (goal: CommunityGoalView) => {
    toast({
      title: 'Delete this goal?',
      description: `“${goal.title}” and its progress line are removed. This cannot be undone.`,
      action: <ToastAction altText="Delete goal" onClick={() => goalOp('delete', goal)}>Delete</ToastAction>,
    })
  }

  const openAdd = (scope: GoalScope) => {
    setGKind('mcqs'); setGTitle(''); setGTarget(scope === 'commitment' ? '10' : '20'); setGDue('')
    setAddScope(scope)
  }

  const addGoal = async () => {
    if (!addScope || !gTitle.trim() || adding) return
    const meta = GOAL_KINDS.find((k) => k.value === gKind) ?? GOAL_KINDS[0]
    const target = Math.max(1, Math.round(Number(gTarget) || 0))
    setAdding(true)
    try {
      await api.communityGoal({
        op: 'add',
        scope: addScope,
        kind: gKind,
        title: gTitle.trim(),
        target,
        unit: meta.unit,
        dueAt: addScope === 'commitment' && gDue ? new Date(`${gDue}T23:59:59+05:30`).toISOString() : null,
      })
      setAddScope(null)
      toast({ title: 'Goal set', description: 'Progress fills in as you study — measured, not estimated.' })
      refetch()
    } catch {
      toast({ title: 'Could not save the goal', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  if (state === 'error') {
    return (
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
        <ShieldAlert className="size-6 text-ink-soft" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">Accountability didn&apos;t load</h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
          The community engine did not respond — it may still be warming up. Nothing is lost; retry below.
        </p>
        <Button variant="outline" className="min-h-11" onClick={refetch}>Retry</Button>
      </div>
    )
  }

  if (state === 'loading' || !payload) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <div className="clay space-y-3 rounded-2xl p-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-3 w-full max-w-sm" />
        </div>
        <div className="clay space-y-3 rounded-2xl p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-3/4 rounded-full" />
        </div>
        <Skeleton className="h-3 w-32" />
        <div className="clay space-y-3 rounded-2xl p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
    )
  }

  const a = payload.accountability
  const daily = a.goals.filter((g) => g.scope === 'daily')
  const weekly = a.goals.filter((g) => g.scope === 'weekly')
  const commitments = payload.commitments.length > 0
    ? payload.commitments
    : a.goals.filter((g) => g.scope === 'commitment')
  const maxMinutes = Math.max(1, ...payload.history.map((d) => d.studyMinutes))

  return (
    <div className="space-y-6">
      {/* ── header strip: streak + gentle health note ── */}
      <Reveal index={0}>
        <header className="clay space-y-3 rounded-2xl p-4 sm:p-5">
          <MicroLabel>Your accountability, measured</MicroLabel>
          <StreakFlame current={a.streak.current} longest={a.streak.longest} todayActive={a.streak.todayActive} />
          <p className="text-xs leading-relaxed text-ink-soft" role="note">{a.healthNote}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <TodayStat value={a.today.mcqs} label="MCQs today" />
            <TodayStat value={a.today.studyMinutes} label="min today" />
            <TodayStat value={a.today.revisionSessions} label="revisions today" />
            <TodayStat value={a.today.mocks} label="mocks today" />
            <TodayStat value={a.today.cases} label="cases today" />
          </div>
        </header>
      </Reveal>

      {/* ── planned vs completed (measured from your planner tasks) ── */}
      <Reveal index={1}>
        <section aria-labelledby="acc-planned" className="clay rounded-2xl p-4 sm:p-5">
          <h2 id="acc-planned" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <ListTodo className="size-4 text-primary" aria-hidden /> Planned vs completed
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-soft">Measured from your planner tasks — nothing here is estimated.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ProgressMeter
              value={a.plannedVsCompleted.today.completed}
              target={Math.max(1, a.plannedVsCompleted.today.planned)}
              unit=""
              label={`Today — ${a.plannedVsCompleted.today.planned} planned, ${a.plannedVsCompleted.today.completed} completed`}
              tone={a.plannedVsCompleted.today.planned > 0 && a.plannedVsCompleted.today.completed >= a.plannedVsCompleted.today.planned ? 'emerald' : 'primary'}
            />
            <ProgressMeter
              value={a.plannedVsCompleted.week.completed}
              target={Math.max(1, a.plannedVsCompleted.week.planned)}
              unit=""
              label={`This week — ${a.plannedVsCompleted.week.planned} planned, ${a.plannedVsCompleted.week.completed} completed`}
              tone={a.plannedVsCompleted.week.planned > 0 && a.plannedVsCompleted.week.completed >= a.plannedVsCompleted.week.planned ? 'emerald' : 'primary'}
            />
          </div>
        </section>
      </Reveal>

      {/* ── goals: daily / weekly / commitments ── */}
      <GoalSection
        id="acc-daily"
        title="Daily goals"
        note="Reset every IST midnight — small and finishable beats ambitious and abandoned."
        scope="daily"
        goals={daily}
        busyGoalId={busyGoalId}
        onAdd={() => openAdd('daily')}
        onPauseResume={(g) => goalOp(g.active ? 'pause' : 'resume', g)}
        onDelete={confirmDelete}
      />
      <GoalSection
        id="acc-weekly"
        title="Weekly goals"
        note="A weekly window smooths out the noisy days — one honest push counts."
        scope="weekly"
        goals={weekly}
        busyGoalId={busyGoalId}
        onAdd={() => openAdd('weekly')}
        onPauseResume={(g) => goalOp(g.active ? 'pause' : 'resume', g)}
        onDelete={confirmDelete}
      />
      <GoalSection
        id="acc-commitments"
        title="Commitments"
        note="Longer promises with a due date — the kind you'd tell a study partner about."
        scope="commitment"
        goals={commitments}
        busyGoalId={busyGoalId}
        onAdd={() => openAdd('commitment')}
        onPauseResume={(g) => goalOp(g.active ? 'pause' : 'resume', g)}
        onDelete={confirmDelete}
      />

      {/* ── 14-day history ── */}
      <Reveal index={2}>
        <section aria-labelledby="acc-history" className="clay rounded-2xl p-4">
          <h2 id="acc-history" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Flame className="size-4 text-primary" aria-hidden /> Last 14 days
          </h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
            A dot marks an active day; darker dots mean more study minutes. Blank days are just rest.
          </p>
          {payload.history.length === 0 ? (
            <p className="mt-3 text-xs text-ink-soft">No history yet — it starts filling in as you study.</p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {[payload.history.slice(0, 7), payload.history.slice(7, 14)].map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {week.map((d) => {
                    const intensity = d.active ? 0.35 + 0.65 * (d.studyMinutes / maxMinutes) : 0
                    return (
                      <div
                        key={d.dayKey}
                        className="flex min-w-0 flex-col items-center gap-1"
                        title={`${d.label} — ${d.active ? `${d.mcqs} MCQs · ${d.studyMinutes} min · ${d.revisionSessions} revision` : 'rest day'}`}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'grid h-9 w-full max-w-11 place-items-center rounded-lg border',
                            d.active ? 'border-primary/40' : 'border-line bg-surface-2',
                          )}
                        >
                          {d.active ? (
                            <span className="size-2.5 rounded-full bg-primary" style={intensity < 1 ? { opacity: intensity } : undefined} />
                          ) : (
                            <span className="size-1.5 rounded-full bg-line" />
                          )}
                        </span>
                        <span className="w-full truncate text-center text-[9px] text-ink-soft">{d.label}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* ── group challenges ── */}
      <Reveal index={3}>
        <section aria-labelledby="acc-challenges">
          <h2 id="acc-challenges" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Trophy className="size-4 text-primary" aria-hidden /> Group challenges
          </h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
            Your line is measured from your real activity; peer counts are a seeded community demo snapshot.
          </p>
          {a.challenges.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No group challenges yet"
              hint="Join a study group and its owner can post challenges — your progress still comes from your own study."
            />
          ) : (
            <div className="mt-3 space-y-3">
              {a.challenges.map((c) => <AccChallengeRow key={c.id} challenge={c} />)}
            </div>
          )}
        </section>
      </Reveal>

      {/* ── gentle tip ── */}
      {payload.tip && (
        <Reveal index={4}>
          <p className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs leading-relaxed" role="note">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span><span className="font-semibold">Tip — </span>{payload.tip}</span>
          </p>
        </Reveal>
      )}

      {/* ── fixed gentle footer ── */}
      <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface-2/50 px-4 py-3.5 text-xs leading-relaxed text-ink-soft" role="note">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Goals are guides, not judgments. Rest is part of the plan.
      </p>

      {/* ── add-goal dialog ── */}
      <Dialog open={addScope !== null} onOpenChange={(v) => { if (!v) setAddScope(null) }}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize text-base">Add a {addScope} goal</DialogTitle>
            <DialogDescription>
              {addScope === 'daily' && 'Something finishable today — the meter fills from your real activity.'}
              {addScope === 'weekly' && 'A target for this week — it absorbs one bad day without breaking.'}
              {addScope === 'commitment' && 'A longer promise with a due date — optional, but naming it helps.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="goal-kind">What counts</Label>
              <Select value={gKind} onValueChange={setGKind}>
                <SelectTrigger id="goal-kind" aria-label="Goal kind" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-title">Title</Label>
              <Input
                id="goal-title" value={gTitle} onChange={(e) => setGTitle(e.target.value)}
                placeholder="e.g. Cardio revision before Friday" className="min-h-11" maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target ({GOAL_KINDS.find((k) => k.value === gKind)?.unit})</Label>
              <Input
                id="goal-target" type="number" inputMode="numeric" min={1} step={1}
                value={gTarget} onChange={(e) => setGTarget(e.target.value)} className="min-h-11"
              />
            </div>
            {addScope === 'commitment' && (
              <div className="space-y-1.5">
                <Label htmlFor="goal-due">Due date</Label>
                <Input id="goal-due" type="date" value={gDue} onChange={(e) => setGDue(e.target.value)} className="min-h-11" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => setAddScope(null)}>Cancel</Button>
            <Button className="min-h-11" onClick={() => void addGoal()} disabled={!gTitle.trim() || adding}>
              {adding && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {adding ? 'Saving…' : 'Set goal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── goal section ─────────────────────────────────────────────────────────────

function GoalSection({
  id, title, note, scope, goals, busyGoalId, onAdd, onPauseResume, onDelete,
}: {
  id: string
  title: string
  note: string
  scope: GoalScope
  goals: CommunityGoalView[]
  busyGoalId: string | null
  onAdd: () => void
  onPauseResume: (g: CommunityGoalView) => void
  onDelete: (g: CommunityGoalView) => void
}) {
  return (
    <Reveal index={1}>
      <section aria-labelledby={id} className="clay rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={id} className="text-sm font-semibold tracking-tight">{title}</h2>
          <Button
            variant="outline"
            size="sm"
            className="min-h-9 gap-1 rounded-full px-3 text-xs"
            onClick={onAdd}
          >
            <Plus className="size-3.5" aria-hidden /> Add {scope} goal
          </Button>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{note}</p>
        {goals.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line bg-surface-2/40 px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
            No {scope} goals yet — progress is measured from your real activity, so even a small target fills honestly.
          </p>
        ) : (
          <ul className="mt-3 max-h-96 space-y-2.5 overflow-y-auto pr-1" aria-label={title}>
            {goals.map((g) => (
              <GoalRow key={g.id} goal={g} busy={busyGoalId === g.id} onPauseResume={onPauseResume} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </section>
    </Reveal>
  )
}

function GoalRow({
  goal, busy, onPauseResume, onDelete,
}: {
  goal: CommunityGoalView
  busy: boolean
  onPauseResume: (g: CommunityGoalView) => void
  onDelete: (g: CommunityGoalView) => void
}) {
  const kindMeta = GOAL_KINDS.find((k) => k.value === goal.kind)
  return (
    <li className={cn('rounded-xl border border-line bg-surface-2/40 px-3.5 py-3', !goal.active && 'opacity-70')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft">
          {kindMeta?.label.split(' —')[0] ?? goal.kind}
        </span>
        {goal.done && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
            <CheckCircle2 className="size-3" aria-hidden /> Done
          </span>
        )}
        {!goal.active && (
          <span className="rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold text-sev-warn">
            Paused
          </span>
        )}
        {goal.dueAt && (
          <span className="inline-flex items-center gap-1 text-[10px] text-ink-soft">
            <CalendarDays className="size-3" aria-hidden /> due <RelativeTime iso={goal.dueAt} />
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost" size="icon"
            onClick={() => onPauseResume(goal)} disabled={busy}
            aria-label={goal.active ? `Pause ${goal.title}` : `Resume ${goal.title}`}
            title={goal.active ? 'Pause — progress is kept' : 'Resume'}
            className="size-9 rounded-lg text-ink-soft hover:text-foreground"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : goal.active ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={() => onDelete(goal)} disabled={busy}
            aria-label={`Delete ${goal.title}`}
            title="Delete goal"
            className="size-9 rounded-lg text-ink-soft hover:text-sev-crit"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </span>
      </div>
      <p className={cn('text-xs font-semibold leading-snug', goal.done && 'text-sev-ok')}>{goal.title}</p>
      <ProgressMeter
        className="mt-1.5"
        value={goal.progress}
        target={goal.target}
        unit={goal.unit}
        label="measured from your real activity"
        tone={goal.done ? 'emerald' : 'primary'}
      />
    </li>
  )
}

// ── accountability challenge row ─────────────────────────────────────────────

function AccChallengeRow({ challenge }: { challenge: CommunityChallengeView }) {
  return (
    <article className="clay space-y-2.5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          {challenge.kind}
        </span>
        {challenge.youJoined ? (
          <span className="rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
            Joined
          </span>
        ) : (
          <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft" title="Membership is managed on the group page">
            Not joined
          </span>
        )}
        <span className="text-[10px] font-semibold text-ink-soft">{challenge.groupName}</span>
        {challenge.dueAt && <RelativeTime iso={challenge.dueAt} className="ml-auto" />}
      </div>
      <div>
        <h3 className="text-sm font-semibold leading-snug">{challenge.title}</h3>
        {challenge.detail && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{challenge.detail}</p>}
      </div>
      <ProgressMeter
        value={challenge.youCount}
        target={challenge.target}
        unit={challenge.unit}
        label="your progress, measured from your real activity"
        tone={challenge.youCount >= challenge.target ? 'emerald' : 'primary'}
      />
      <p className="text-[10px] leading-relaxed text-ink-soft" title="Seeded demo snapshot — not real classmates">
        <span className="font-semibold uppercase tracking-wide">Community demo snapshot:</span>{' '}
        {challenge.peerCounts.length > 0 ? challenge.peerCounts.map((p) => `${p.label} ${p.count}`).join(' · ') : 'no peer data yet'}
      </p>
    </article>
  )
}

// ── tiny locals ──────────────────────────────────────────────────────────────

function TodayStat({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
      <span className="tabular-nums">{value}</span> {label}
    </span>
  )
}
