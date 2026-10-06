'use client'

// ─── COMMUNITY · GROUPS SCREEN (PRODUCT 16) ──────────────────────────────────
// Browse | My groups tabs over the measured groups payload, GroupCard grid with
// busy join/leave toggles, an honest create-group dialog, and a measured hint
// to the open Doubt Clearance space for people who want broader discussion
// while they look for a group.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare, Plus, ShieldAlert, Users } from 'lucide-react'
import type { CommunityGroupSummary, CommunitySpaceSummary } from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { EmptyState, GroupCard, MicroLabel, Reveal, SectionSkeleton } from './community-shared'

type LoadState = 'loading' | 'ready' | 'error'
type Tab = 'browse' | 'mine'

const FOCUS_KINDS = [
  { value: 'subject', label: 'Subject — e.g. Medicine (focus ref: subject code, MED)' },
  { value: 'topic', label: 'Topic — e.g. Cardiac cycle (focus ref: topic id)' },
  { value: 'exam', label: 'Exam — NEET-PG / FMGE (focus ref: neetpg, fmge)' },
  { value: 'mixed', label: 'Mixed — a bit of everything' },
]

export function CommunityGroupsScreen({
  onOpenGroup, onOpenSpace, onGroupsChanged,
}: {
  onOpenGroup: (id: string) => void
  onOpenSpace: (id: string) => void
  onGroupsChanged: () => void
}) {
  const [payload, setPayload] = useState<{ groups: CommunityGroupSummary[]; mine: CommunityGroupSummary[] } | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<Tab>('browse')
  const [busyId, setBusyId] = useState<string | null>(null)

  // create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [gName, setGName] = useState('')
  const [gDesc, setGDesc] = useState('')
  const [gPrivacy, setGPrivacy] = useState<'public' | 'private'>('public')
  const [gFocusKind, setGFocusKind] = useState('subject')
  const [gFocusRef, setGFocusRef] = useState('')
  const [gGoal, setGGoal] = useState('')
  const [gCadence, setGCadence] = useState('')
  const [creating, setCreating] = useState(false)

  // measured hint: the open doubt space, for people browsing for a group
  const [doubtSpace, setDoubtSpace] = useState<CommunitySpaceSummary | null>(null)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    setState('loading')
    api.communityGroups().then(
      (p) => { if (alive) { setPayload(p); setState('ready') } },
      () => { if (alive) setState('error') },
    )
    return () => { alive = false }
  }, [reloadKey])

  useEffect(() => {
    let alive = true
    api.communitySpaces().then(
      (res) => { if (alive) setDoubtSpace(res.spaces.find((s) => s.kind === 'doubt') ?? null) },
      () => { /* the hint is optional — hide it when spaces don't load */ },
    )
    return () => { alive = false }
  }, [])

  const joinLeave = (group: CommunityGroupSummary) => {
    if (busyId) return
    const joining = !group.youMember
    setBusyId(group.id)
    api.communityGroupAction(group.id, { action: joining ? 'join' : 'leave' }).then(
      () => {
        toast({
          title: joining ? `Joined ${group.name}` : `Left ${group.name}`,
          description: joining
            ? 'The group\u2019s shared plan and challenges are on its page.'
            : 'Your progress stops being visible to the group.',
        })
        refetch()
        onGroupsChanged()
      },
      () => toast({ title: 'Could not update membership', description: 'Try again in a moment.', variant: 'destructive' }),
    ).finally(() => setBusyId(null))
  }

  const createGroup = async () => {
    if (!gName.trim() || creating) return
    setCreating(true)
    try {
      const res = await api.communityGroupCreate({
        name: gName.trim(),
        description: gDesc.trim(),
        privacy: gPrivacy,
        focusKind: gFocusKind,
        focusRef: gFocusRef.trim(),
        goalText: gGoal.trim(),
        meetCadence: gCadence.trim(),
      })
      setCreateOpen(false)
      toast({ title: 'Group created', description: `“${res.group?.name ?? gName.trim()}” is live — you are the owner.` })
      setGName(''); setGDesc(''); setGFocusRef(''); setGGoal(''); setGCadence(''); setGPrivacy('public')
      refetch()
      onGroupsChanged()
      setTab('mine')
    } catch {
      toast({ title: 'Could not create the group', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  if (state === 'error') {
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
        <ShieldAlert className="size-6 text-ink-soft" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">Study groups didn&apos;t load</h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
          The community engine did not respond — it may still be warming up. Nothing is lost; retry below.
        </p>
        <Button variant="outline" className="min-h-11" onClick={refetch}>Retry</Button>
      </div>
    )
  }

  const groups = payload?.groups ?? []
  const mine = payload?.mine ?? []

  return (
    <div className="space-y-6">
      <Reveal index={0}>
        <header className="space-y-2.5">
          <MicroLabel>Accountability, together</MicroLabel>
          <h1 className="text-xl font-bold leading-snug tracking-tight md:text-2xl">Study groups</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
            Small groups with a shared plan, a meeting cadence and challenges. Your progress stays private unless you
            switch sharing on for a specific group — and peer numbers you see are labelled demo.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <TabPill active={tab === 'browse'} onClick={() => setTab('browse')}>Browse</TabPill>
            <TabPill active={tab === 'mine'} onClick={() => setTab('mine')}>My groups{mine.length > 0 ? ` (${mine.length})` : ''}</TabPill>
            <Button className="ml-auto min-h-11 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden /> Create group
            </Button>
          </div>
        </header>
      </Reveal>

      {/* measured pointer to the open doubt space */}
      {doubtSpace && tab === 'browse' && (
        <button
          type="button"
          onClick={() => onOpenSpace(doubtSpace.id)}
          className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-left text-xs outline-none ring-primary/50 transition-colors focus-visible:ring-2 hover:bg-surface-2"
        >
          <MessageSquare className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 leading-relaxed text-ink-soft">
            Groups are for accountability. For open discussion anyone can join, the{' '}
            <span className="font-semibold text-foreground">{doubtSpace.name}</span> space is always open.
          </span>
          <span className="shrink-0 font-semibold text-primary">{doubtSpace.posts} posts</span>
        </button>
      )}

      {state === 'loading' || !payload ? (
        <SectionSkeleton cards={6} kind="group" />
      ) : tab === 'browse' ? (
        groups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No groups yet"
            hint="Start the first one — a name, a goal, a cadence. Groups work best at 3–8 people."
            action={<Button className="min-h-11" onClick={() => setCreateOpen(true)}>Create a study group</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onOpen={onOpenGroup}
                onJoinLeave={joinLeave}
                busy={busyId === g.id}
                mine={g.youMember}
              />
            ))}
          </div>
        )
      ) : mine.length === 0 ? (
        <EmptyState
          icon={Users}
          title="You haven't joined a group yet"
          hint="Browse the open groups, or start your own — you'll set the goal, the cadence and the challenges."
          action={<Button className="min-h-11" onClick={() => setTab('browse')}>Browse groups</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              onOpen={onOpenGroup}
              onJoinLeave={joinLeave}
              busy={busyId === g.id}
              mine
            />
          ))}
        </div>
      )}

      {/* ── create-group dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Create a study group</DialogTitle>
            <DialogDescription>
              Keep it small and specific — a clear goal and an honest cadence beat a big silent group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name" value={gName} onChange={(e) => setGName(e.target.value)}
                placeholder="e.g. Renal sprint — NEET-PG May" maxLength={80} className="min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-desc">Description</Label>
              <Textarea
                id="group-desc" value={gDesc} onChange={(e) => setGDesc(e.target.value)}
                placeholder="Who is it for, and how it runs." className="min-h-20" maxLength={500}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="group-privacy">Privacy</Label>
                <Select value={gPrivacy} onValueChange={(v) => setGPrivacy(v as 'public' | 'private')}>
                  <SelectTrigger id="group-privacy" aria-label="Group privacy" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — anyone can join</SelectItem>
                    <SelectItem value="private">Private — invite only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-focus">Focus</Label>
                <Select value={gFocusKind} onValueChange={setGFocusKind}>
                  <SelectTrigger id="group-focus" aria-label="Group focus kind" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOCUS_KINDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-focusref">Focus reference</Label>
              <Input
                id="group-focusref" value={gFocusRef} onChange={(e) => setGFocusRef(e.target.value)}
                placeholder={gFocusKind === 'subject' ? 'e.g. MED' : gFocusKind === 'topic' ? 'e.g. t-phys-cardcycle' : gFocusKind === 'exam' ? 'e.g. neetpg' : 'e.g. NEET-PG + FMGE'}
                className="min-h-11" maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-goal">Group goal</Label>
              <Input
                id="group-goal" value={gGoal} onChange={(e) => setGGoal(e.target.value)}
                placeholder="e.g. Finish renal + cardio MCQs before May" className="min-h-11" maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-cadence">Meeting cadence</Label>
              <Input
                id="group-cadence" value={gCadence} onChange={(e) => setGCadence(e.target.value)}
                placeholder="e.g. Weekly · Sundays 8 pm IST" className="min-h-11" maxLength={60}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="min-h-11" onClick={() => void createGroup()} disabled={!gName.trim() || creating}>
              {creating && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {creating ? 'Creating…' : 'Create group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── tab pill ─────────────────────────────────────────────────────────────────

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-h-11 items-center rounded-full border px-4 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
        active ? 'border-primary/40 bg-primary/12 text-primary' : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
