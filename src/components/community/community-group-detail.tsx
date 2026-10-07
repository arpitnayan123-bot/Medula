'use client'

// ─── COMMUNITY · GROUP DETAIL (PRODUCT 16) ───────────────────────────────────
// Privacy first: a private group shows a non-member ONLY the lock card (name,
// description, focus, member count). Everything else — challenges with your
// MEASURED progress and labelled demo peer snapshots, the shared plan, members,
// the share-my-progress opt-in and group discussions — lives behind membership.
// Owner-only controls: create/archive challenges. Honesty copy throughout.

import { useCallback, useEffect, useState } from 'react'
import {
  Archive, CalendarDays, CheckCircle2, Flag, Loader2, Lock, MessageSquarePlus, Plus,
  ShieldAlert, Target, Trophy, Users,
} from 'lucide-react'
import type {
  CommunityChallengeView, CommunityCreatePostResult, CommunityGroupDetail, CommunityPostSummary,
  CommunitySpaceSummary,
} from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  ActorChip, BlockedPanel, EmptyState, MicroLabel, PostCard, ProgressMeter, Reveal,
  RelativeTime,
} from './community-shared'

type LoadState = 'loading' | 'ready' | 'error'

const CHALLENGE_KINDS: { value: string; label: string; unit: string }[] = [
  { value: 'mcq', label: 'MCQs — solved questions', unit: 'mcqs' },
  { value: 'mock', label: 'Mocks — full / sectional tests', unit: 'mocks' },
  { value: 'revision', label: 'Revision — cleared revision sessions', unit: 'sessions' },
  { value: 'case', label: 'Cases — simulated cases completed', unit: 'cases' },
]

const CHALLENGE_STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'border-primary/40 bg-primary/10 text-primary' },
  complete: { label: 'Complete', cls: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok' },
  archived: { label: 'Archived', cls: 'border-line bg-surface-2 text-ink-soft' },
}

export function CommunityGroupDetailScreen({
  groupId, onOpenThread, onBack, onOpenAccountability,
}: {
  groupId: string
  onOpenThread: (id: string) => void
  onBack: () => void
  onOpenAccountability: () => void
}) {
  const openHub = useAppStore((s) => s.openHub)

  const [detail, setDetail] = useState<CommunityGroupDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [busyAction, setBusyAction] = useState(false)
  const [busyChallengeId, setBusyChallengeId] = useState<string | null>(null)

  // shared plan
  const [planLine, setPlanLine] = useState('')
  const [planAdding, setPlanAdding] = useState(false)

  // challenge dialog
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [cKind, setCKind] = useState('mcq')
  const [cTitle, setCTitle] = useState('')
  const [cDetail, setCDetail] = useState('')
  const [cTarget, setCTarget] = useState('100')
  const [cDue, setCDue] = useState('')
  const [creatingChallenge, setCreatingChallenge] = useState(false)

  // discussion composer
  const [spaces, setSpaces] = useState<CommunitySpaceSummary[]>([])
  const [discOpen, setDiscOpen] = useState(false)
  const [dSpace, setDSpace] = useState('')
  const [dKind, setDKind] = useState('discussion')
  const [dTitle, setDTitle] = useState('')
  const [dBody, setDBody] = useState('')
  const [discBlocked, setDiscBlocked] = useState<{ reasons: CommunityCreatePostResult['reasons']; guidance: string | null } | null>(null)
  const [posting, setPosting] = useState(false)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    setState('loading')
    setDetail(null)
    api.communityGroup(groupId).then(
      (g) => { if (alive) { setDetail(g); setState('ready') } },
      () => { if (alive) setState('error') },
    )
    return () => { alive = false }
  }, [groupId, reloadKey])

  // spaces for the discussion composer (fetched once — a light measured list)
  useEffect(() => {
    api.communitySpaces().then(
      (res) => {
        setSpaces(res.spaces)
        setDSpace((cur) => cur || res.spaces[0]?.id || '')
      },
      () => { /* composer hides the select when spaces don't load */ },
    )
  }, [])

  // ── mutations ──────────────────────────────────────────────────────────────
  const applyDetail = (group?: CommunityGroupDetail) => {
    if (group) setDetail(group)
    else refetch()
  }

  const joinLeave = () => {
    if (!detail || busyAction || detail.youOwner) return
    const joining = !detail.youMember
    setBusyAction(true)
    api.communityGroupAction(groupId, { action: joining ? 'join' : 'leave' }).then(
      () => {
        toast({
          title: joining ? `Joined ${detail.name}` : `Left ${detail.name}`,
          description: joining
            ? 'The shared plan and challenges are below.'
            : 'Your progress stops being visible to the group.',
        })
        refetch()
      },
      () => toast({ title: 'Could not update membership', description: 'Try again in a moment.', variant: 'destructive' }),
    ).finally(() => setBusyAction(false))
  }

  const setShare = (on: boolean) => {
    if (!detail || busyAction) return
    setBusyAction(true)
    api.communityGroupAction(groupId, { action: 'share', on }).then(
      (res) => {
        toast({
          title: on ? 'Progress sharing is on for this group' : 'Progress sharing is off for this group',
          description: on
            ? 'Your measured numbers are visible to members until you switch this off.'
            : 'Your numbers are private again.',
        })
        applyDetail(res.group)
      },
      () => toast({ title: 'Could not update sharing', description: 'Try again in a moment.', variant: 'destructive' }),
    ).finally(() => setBusyAction(false))
  }

  const addPlanLine = async () => {
    if (!detail || !planLine.trim() || planAdding) return
    setPlanAdding(true)
    try {
      const res = await api.communityGroupAction(groupId, { action: 'plan-add', line: planLine.trim() })
      setPlanLine('')
      toast({ title: 'Added to the shared plan' })
      applyDetail(res.group)
    } catch {
      toast({ title: 'Could not add the line', description: 'Try again in a moment.', variant: 'destructive' })
    } finally {
      setPlanAdding(false)
    }
  }

  const createChallenge = async () => {
    if (!detail || !cTitle.trim() || creatingChallenge) return
    const meta = CHALLENGE_KINDS.find((k) => k.value === cKind) ?? CHALLENGE_KINDS[0]
    const target = Math.max(1, Math.round(Number(cTarget) || 0))
    setCreatingChallenge(true)
    try {
      const res = await api.communityGroupAction(groupId, {
        action: 'challenge-create',
        kind: cKind,
        title: cTitle.trim(),
        detail: cDetail.trim(),
        target,
        unit: meta.unit,
        dueAt: cDue ? new Date(`${cDue}T23:59:59+05:30`).toISOString() : null,
      })
      setChallengeOpen(false)
      setCTitle(''); setCDetail(''); setCTarget('100'); setCDue('')
      toast({ title: 'Challenge posted', description: 'Members see it on the group page and in their accountability tab.' })
      applyDetail(res.group)
    } catch {
      toast({ title: 'Could not create the challenge', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setCreatingChallenge(false)
    }
  }

  const archiveChallenge = (c: CommunityChallengeView) => {
    if (busyChallengeId) return
    toast({
      title: 'Archive this challenge?',
      description: `“${c.title}” moves out of the active list. Progress history is kept.`,
      action: (
        <ToastAction
          altText="Archive challenge"
          onClick={() => {
            setBusyChallengeId(c.id)
            api.communityGroupAction(groupId, { action: 'challenge-archive', challengeId: c.id }).then(
              (res) => { toast({ title: 'Challenge archived' }); applyDetail(res.group) },
              () => toast({ title: 'Could not archive', description: 'Try again in a moment.', variant: 'destructive' }),
            ).finally(() => setBusyChallengeId(null))
          }}
        >
          Archive
        </ToastAction>
      ),
    })
  }

  const submitDiscussion = async () => {
    if (!dTitle.trim() || !dBody.trim() || posting) return
    setPosting(true)
    try {
      const res = await api.communityPostCreate({
        // group discussions are scoped to the group; a mirrored space keeps the
        // frozen create contract (spaceId) satisfied and shows it in that feed too
        spaceId: dSpace,
        groupId,
        kind: dKind,
        title: dTitle.trim(),
        body: dBody.trim(),
      })
      if (res.blocked) {
        setDiscBlocked({ reasons: res.reasons, guidance: res.guidance })
        toast({ title: 'Not posted', description: 'The scan found identifying details — see the composer.', variant: 'destructive' })
        return
      }
      if (res.post) {
        setDiscOpen(false)
        setDTitle(''); setDBody(''); setDiscBlocked(null)
        toast({ title: 'Posted to the group', description: 'It is in the group discussions now.' })
        refetch()
      } else {
        toast({ title: 'Could not post', description: 'The server did not return the post. Try again.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not post', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setPosting(false)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
        <ShieldAlert className="size-6 text-ink-soft" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">This group didn&apos;t load</h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
          The community engine did not respond — it may still be warming up. Nothing is lost; retry below.
        </p>
        <Button variant="outline" className="min-h-11" onClick={refetch}>Retry</Button>
        <Button variant="ghost" className="min-h-11 text-xs text-ink-soft" onClick={onBack}>Back to groups</Button>
      </div>
    )
  }

  if (state === 'loading' || !detail) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-3/4 max-w-md rounded-lg" />
        <div className="clay space-y-3 rounded-2xl p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-11 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-3 w-40" />
        <div className="clay space-y-3 rounded-2xl p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-3/4 rounded-full" />
        </div>
      </div>
    )
  }

  // ── privacy gate: private + non-member ⇒ lock card ONLY ────────────────────
  if (detail.privacyLocked) {
    return (
      <div className="clay mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl p-8 text-center">
        <span className="clay-in grid size-12 place-items-center rounded-2xl" aria-hidden>
          <Lock className="size-5 text-ink-soft" />
        </span>
        <h1 className="text-lg font-bold tracking-tight">{detail.name}</h1>
        <p className="text-sm leading-relaxed text-ink-soft">{detail.description}</p>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
            <Lock className="size-3" aria-hidden /> Private group
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
            <Users className="size-3" aria-hidden /> {memberCountOf(detail.members)} member{memberCountOf(detail.members) === 1 ? '' : 's'}
          </span>
          {detail.focusLabel && (
            <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
              {detail.focusLabel}
            </span>
          )}
        </div>
        <p className="rounded-xl border border-sev-warn/40 bg-sev-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-sev-warn" role="note">
          Private group — ask the owner for an invite. Nothing inside is shown to non-members: not the plan, not the
          challenges, not the members.
        </p>
        {detail.joinRequestNote && (
          <p className="text-xs leading-relaxed text-ink-soft">{detail.joinRequestNote}</p>
        )}
        <Button variant="outline" className="min-h-11" onClick={onBack}>Back to groups</Button>
      </div>
    )
  }

  const activeChallenges = detail.challenges.filter((c) => c.status !== 'archived')
  const archivedChallenges = detail.challenges.filter((c) => c.status === 'archived')

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <Reveal index={0}>
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                detail.privacy === 'private'
                  ? 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn'
                  : 'border-line bg-surface-2 text-ink-soft',
              )}
            >
              <Lock className="size-3" aria-hidden /> {detail.privacy === 'private' ? 'Private' : 'Public'}
            </span>
            {detail.seeded && (
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft" title="Seeded demo group">
                demo
              </span>
            )}
            <MicroLabel>{detail.focusLabel || detail.focusKind}</MicroLabel>
          </div>
          <h1 className="text-xl font-bold leading-snug tracking-tight md:text-2xl">{detail.name}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{detail.description}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
              <Users className="size-3" aria-hidden /> {memberCountOf(detail.members)} member{memberCountOf(detail.members) === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
              <CalendarDays className="size-3" aria-hidden /> {detail.meetCadence || 'flexible cadence'}
            </span>
            {detail.activeToday > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                {detail.activeToday} active today
              </span>
            )}
          </div>
          {detail.goalText && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-3">
              <Target className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p className="text-sm leading-relaxed"><span className="font-semibold">Group goal — </span>{detail.goalText}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!detail.youOwner && (
              <Button
                variant={detail.youMember ? 'outline' : 'default'}
                className="min-h-11"
                onClick={joinLeave}
                disabled={busyAction}
              >
                {busyAction && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {detail.youMember ? 'Leave group' : 'Join group'}
              </Button>
            )}
            {detail.youOwner && (
              <>
                <Button className="min-h-11 gap-1.5" onClick={() => setChallengeOpen(true)}>
                  <Plus className="size-4" aria-hidden /> Create challenge
                </Button>
                <span className="inline-flex items-center gap-1 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2.5 py-1 text-[10px] font-bold text-sev-ok">
                  You own this group
                </span>
              </>
            )}
          </div>
        </header>
      </Reveal>

      {/* ── your privacy switch ── */}
      {detail.youMember && (
        <Reveal index={1}>
          <div className="clay flex items-center gap-3.5 rounded-2xl p-4">
            <Switch
              checked={detail.youShareData}
              onCheckedChange={setShare}
              disabled={busyAction}
              aria-label="Share my progress with this group"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Share my progress with this group</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                Off by default. Your numbers stay private unless you switch this on.
              </p>
            </div>
            <span
              className={cn(
                'ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                detail.youShareData
                  ? 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok'
                  : 'border-line bg-surface-2 text-ink-soft',
              )}
            >
              {detail.youShareData ? 'sharing' : 'private'}
            </span>
          </div>
        </Reveal>
      )}

      {/* ── challenges ── */}
      <Reveal index={1}>
        <section aria-labelledby="group-challenges">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 id="group-challenges" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Trophy className="size-4 text-primary" aria-hidden /> Challenges
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-9 gap-1 rounded-full px-3 text-xs"
              onClick={onOpenAccountability}
            >
              Your goals &amp; challenges <ArrowRightSmall />
            </Button>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-ink-soft">
            Your line is measured from your real study activity. Peer counts are a seeded community demo snapshot — not real classmates.
          </p>
          {activeChallenges.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No active challenges"
              hint={detail.youOwner
                ? 'Create one — a target, a kind (MCQs, mocks, revision, cases) and an optional due date.'
                : 'The owner hasn\u2019t posted a challenge yet. The shared plan below is the day-to-day rhythm.'}
              action={detail.youOwner ? (
                <Button className="min-h-11" onClick={() => setChallengeOpen(true)}>Create challenge</Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-3">
              {activeChallenges.map((c) => (
                <ChallengeRow
                  key={c.id}
                  challenge={c}
                  canArchive={detail.youOwner}
                  onArchive={archiveChallenge}
                  busy={busyChallengeId === c.id}
                />
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* ── shared plan ── */}
      <Reveal index={2}>
        <section aria-labelledby="group-plan" className="clay rounded-2xl p-4">
          <h2 id="group-plan" className="text-sm font-semibold tracking-tight">Shared plan</h2>
          <p className="mt-0.5 text-[11px] text-ink-soft">Member-added lines, newest first. The plan keeps the latest 20 lines.</p>
          {detail.plan.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-line bg-surface-2/40 px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
              Nothing on the plan yet{detail.youMember ? ' — add the first line below.' : '.'}
            </p>
          ) : (
            <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-label="Shared plan lines">
              {detail.plan.map((line) => (
                <li key={line.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-sev-ok" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs leading-relaxed">{line.line}</span>
                    <span className="mt-0.5 block text-[10px] text-ink-soft">added by {line.addedBy}</span>
                  </span>
                  <RelativeTime iso={line.at} className="shrink-0" />
                </li>
              ))}
            </ul>
          )}
          {detail.youMember && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={planLine}
                onChange={(e) => setPlanLine(e.target.value)}
                placeholder="e.g. Sunday: GI upper-mid module together"
                className="min-h-11 flex-1"
                maxLength={160}
                aria-label="Add a plan line"
              />
              <Button className="min-h-11 shrink-0" onClick={() => void addPlanLine()} disabled={!planLine.trim() || planAdding}>
                {planAdding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                Add line
              </Button>
            </div>
          )}
        </section>
      </Reveal>

      {/* ── members ── */}
      <Reveal index={2}>
        <section aria-labelledby="group-members" className="clay rounded-2xl p-4">
          <h2 id="group-members" className="text-sm font-semibold tracking-tight">
            Members <span className="text-ink-soft">({memberCountOf(detail.members)})</span>
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-soft">Peers are seeded demo members. Only your own sharing state is shown.</p>
          <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-label="Group members">
            {(Array.isArray(detail.members) ? detail.members : []).map((m) => {
              const isYou = m.actor.kind === 'you'
              return (
                <li key={m.actor.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/40 px-3 py-2">
                  <ActorChip actor={m.actor} size="sm" className="min-w-0 flex-1" />
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                      m.role === 'owner'
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-line bg-surface-2 text-ink-soft',
                    )}
                  >
                    {m.role}
                  </span>
                  {isYou && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                        m.sharesData
                          ? 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok'
                          : 'border-line bg-surface-2 text-ink-soft',
                      )}
                    >
                      {m.sharesData ? 'shares progress' : 'progress private'}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </Reveal>

      {/* ── discussions ── */}
      <Reveal index={3}>
        <section aria-labelledby="group-discussions">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 id="group-discussions" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Flag className="size-4 text-primary" aria-hidden /> Discussions
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="min-h-9 gap-1 rounded-full px-3 text-xs"
              onClick={() => { setDiscBlocked(null); setDiscOpen(true) }}
            >
              <MessageSquarePlus className="size-3.5" aria-hidden /> New discussion
            </Button>
          </div>
          {detail.discussions.length === 0 ? (
            <EmptyState
              icon={MessageSquarePlus}
              title="No discussions in this group yet"
              hint="Group discussions stay inside the group — ask a doubt, share a plan check-in, or dissect a question together."
              action={detail.youMember ? (
                <Button className="min-h-11" onClick={() => { setDiscBlocked(null); setDiscOpen(true) }}>Start one</Button>
              ) : (
                <Button className="min-h-11" onClick={joinLeave} disabled={busyAction}>
                  {busyAction && <Loader2 className="size-4 animate-spin" aria-hidden />}Join to post
                </Button>
              )}
            />
          ) : (
            <div className="space-y-3">
              {detail.discussions.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onOpen={onOpenThread}
                  showSpace
                  onOpenTopic={(post) => openHub(post.topicId)}
                />
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {archivedChallenges.length > 0 && (
        <section aria-labelledby="group-archived">
          <h2 id="group-archived" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Archived ({archivedChallenges.length})
          </h2>
          <div className="space-y-2">
            {archivedChallenges.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{c.title}</span>
                <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft">
                  archived
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div>
        <Button variant="ghost" className="min-h-11 text-xs text-ink-soft" onClick={onBack}>Back to groups</Button>
      </div>

      {/* ── challenge dialog (owner) ── */}
      <Dialog open={challengeOpen} onOpenChange={setChallengeOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Create a challenge</DialogTitle>
            <DialogDescription>
              A shared target with an optional due date. Each member&apos;s progress is measured from their own real activity — never estimated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="challenge-kind">Kind</Label>
              <Select value={cKind} onValueChange={setCKind}>
                <SelectTrigger id="challenge-kind" aria-label="Challenge kind" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHALLENGE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="challenge-title">Title</Label>
              <Input
                id="challenge-title" value={cTitle} onChange={(e) => setCTitle(e.target.value)}
                placeholder="e.g. 300 renal MCQs before the mock" className="min-h-11" maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="challenge-detail">Detail</Label>
              <Textarea
                id="challenge-detail" value={cDetail} onChange={(e) => setCDetail(e.target.value)}
                placeholder="Scope, sources, how to count it." className="min-h-20" maxLength={500}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="challenge-target">Target ({CHALLENGE_KINDS.find((k) => k.value === cKind)?.unit})</Label>
                <Input
                  id="challenge-target" type="number" inputMode="numeric" min={1} step={1}
                  value={cTarget} onChange={(e) => setCTarget(e.target.value)} className="min-h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="challenge-due">Due date (optional)</Label>
                <Input
                  id="challenge-due" type="date" value={cDue} onChange={(e) => setCDue(e.target.value)} className="min-h-11"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => setChallengeOpen(false)}>Cancel</Button>
            <Button className="min-h-11" onClick={() => void createChallenge()} disabled={!cTitle.trim() || creatingChallenge}>
              {creatingChallenge && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {creatingChallenge ? 'Posting…' : 'Post challenge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── discussion composer ── */}
      <Dialog open={discOpen} onOpenChange={(v) => { setDiscOpen(v); if (!v) setDiscBlocked(null) }}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">New discussion in {detail.name}</DialogTitle>
            <DialogDescription>
              Scoped to this group. De-identify everything: no names, MRD numbers, dates or faces.
            </DialogDescription>
          </DialogHeader>
          {discBlocked && (
            <div className="space-y-2">
              <BlockedPanel reasons={discBlocked.reasons} guidance={discBlocked.guidance} />
              <p className="text-[11px] text-ink-soft">Your text is kept below — edit it and post again once it&apos;s de-identified.</p>
            </div>
          )}
          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="disc-kind">Kind</Label>
                <Select value={dKind} onValueChange={setDKind}>
                  <SelectTrigger id="disc-kind" aria-label="Discussion kind" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discussion">Discussion</SelectItem>
                    <SelectItem value="question">Question</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {spaces.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="disc-space">Mirrored space</Label>
                  <Select value={dSpace} onValueChange={setDSpace}>
                    <SelectTrigger id="disc-space" aria-label="Mirrored space" className="min-h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {spaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] leading-relaxed text-ink-soft">Also appears in that space&apos;s feed.</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disc-title">Title</Label>
              <Input
                id="disc-title" value={dTitle} onChange={(e) => setDTitle(e.target.value)}
                placeholder="One clear line" className="min-h-11" maxLength={140}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disc-body">Details</Label>
              <Textarea
                id="disc-body" value={dBody} onChange={(e) => setDBody(e.target.value)}
                placeholder="Context, what you tried, what you're stuck on." className="min-h-28" maxLength={4000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => { setDiscOpen(false); setDiscBlocked(null) }}>Cancel</Button>
            <Button className="min-h-11" onClick={() => void submitDiscussion()} disabled={!dTitle.trim() || !dBody.trim() || posting}>
              {posting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {posting ? 'Posting…' : 'Post to group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── challenge row ────────────────────────────────────────────────────────────

function ChallengeRow({
  challenge, canArchive, onArchive, busy,
}: {
  challenge: CommunityChallengeView
  canArchive: boolean
  onArchive: (c: CommunityChallengeView) => void
  busy: boolean
}) {
  const status = CHALLENGE_STATUS_META[challenge.status] ?? CHALLENGE_STATUS_META.active
  return (
    <article className="clay space-y-2.5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          {challenge.kind}
        </span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', status.cls)}>
          {status.label}
        </span>
        {challenge.youJoined && (
          <span className="rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
            Joined
          </span>
        )}
        <span className="text-[10px] font-semibold text-ink-soft">{challenge.groupName}</span>
        {challenge.dueAt && (
          <RelativeTime iso={challenge.dueAt} className="ml-auto" />
        )}
        {canArchive && challenge.status === 'active' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onArchive(challenge)}
            disabled={busy}
            aria-label={`Archive ${challenge.title}`}
            title="Archive this challenge"
            className="size-9 rounded-lg text-ink-soft hover:text-foreground"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
          </Button>
        )}
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
        {challenge.peerCounts.length > 0
          ? challenge.peerCounts.map((p) => `${p.label} ${p.count}`).join(' · ')
          : 'no peer data yet'}
      </p>
    </article>
  )
}

// ── tiny icon helper ─────────────────────────────────────────────────────────

function ArrowRightSmall() {
  return <span aria-hidden className="text-ink-soft">→</span>
}

/**
 * The frozen contract shadows CommunityGroupSummary.members (count) with the
 * detail's member rows. Server detail payloads send rows — but if a payload
 * ever carries the bare count, still render it honestly instead of crashing.
 */
function memberCountOf(members: CommunityGroupDetail['members']): number {
  return Array.isArray(members) ? members.length : (members as unknown as number)
}
