'use client'

// ─── MOTIVATION · BOARDS (PRODUCT 17) ────────────────────────────────────────
// Opt-in per study group (reuses the P16 shareData consent). Peer rows are
// labelled demo snapshots; your row is measured. Rank is NEVER the hero — the
// headline is always you vs your own last week. Sharing is explicit: off means
// you never appear, on means weekly XP, MCQs and accuracy with that group.

import { useState } from 'react'
import { Eye, EyeOff, Info, ShieldCheck, Users } from 'lucide-react'
import type { GamifyBoardRow } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DemoTag, EmptyState, ErrorState, FootNote, useAccent, useGamifyPayload } from './gamify-shared'

export function GamifyBoards() {
  const openCommunity = useAppStore((s) => s.openCommunity)

  // selected group — null = the payload's default; a pick refetches with ?groupId
  const [groupId, setGroupId] = useState<string | null>(null)
  const { data, state, stale, reload } = useGamifyPayload(
    () => api.gamifyLeaderboard(groupId ?? undefined),
    groupId,
  )

  if (state === 'loading' && !data) return <BoardsSkeleton />
  if (state === 'error' && !data) {
    return (
      <ErrorState
        title="The board didn't load"
        hint="The gamify engine did not respond — nothing is shared or changed by a failed load. Retry below."
        onRetry={reload}
      />
    )
  }
  if (!data) return null

  // ── no groups yet: honest hand-off to Community ──
  if (data.groups.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Users}
          title="No study groups yet"
          hint="Boards live inside your study groups. Join or create one in Community — then choose, per group, whether to share your weekly numbers."
          action={
            <Button className="min-h-11" onClick={() => openCommunity({ tab: 'groups' })}>
              Join a study group in Community
            </Button>
          }
        />
        <FootNote>{data.privacyNote}</FootNote>
      </div>
    )
  }

  const selected = data.groups.find((g) => g.id === groupId) ?? data.groups.find((g) => g.id === data.groupId) ?? data.groups[0]
  // the loaded payload must match the visible selection — otherwise skeleton
  const payloadMatches = data.groupId === selected.id
  const consentOn = data.consentOn
  const rows: GamifyBoardRow[] = consentOn ? data.rows : data.rows.filter((r) => !r.you)
  const you = data.rows.find((r) => r.you)
  const delta = data.yourThisWeekXp != null && data.yourLastWeekXp != null
    ? data.yourThisWeekXp - data.yourLastWeekXp
    : null

  return (
    <div className="space-y-4">
      {/* ── group switcher chips ── */}
      <nav className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Your study groups">
        {data.groups.map((g) => {
          const active = selected.id === g.id
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupId(g.id)}
              aria-pressed={active}
              className={cn(
                'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
                active ? 'border-primary/40 bg-primary/12 text-primary' : 'border-line bg-surface-2/50 text-ink-soft hover:text-foreground',
              )}
            >
              {g.name}
              <span className="text-[10px] font-normal tabular-nums opacity-80">{g.memberCount}</span>
              {g.demo && <DemoTag />}
            </button>
          )
        })}
      </nav>

      {payloadMatches ? (
        <>
          {/* ── headline: you vs your own last week — never the rank ── */}
          <header className="clay rounded-2xl p-4 md:p-5">
            <h1 className="text-sm font-semibold leading-relaxed tracking-tight md:text-base">
              This week — you vs your own last week:{' '}
              <span className="tabular-nums text-primary">{data.yourThisWeekXp ?? 0} XP</span>
              {delta != null && (
                <span className="text-xs font-medium text-ink-soft">
                  {' '}({delta > 0 ? `+${delta}` : delta === 0 ? 'level' : `${delta}`} vs {data.yourLastWeekXp} XP)
                </span>
              )}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">{data.framing}</p>
          </header>

          {/* ── privacy panel — explicit, per-group consent ── */}
          <ConsentPanel
            groupId={selected.id}
            groupName={selected.name}
            consentOn={consentOn}
            onChanged={() => reload()}
          />

          {/* ── privacy banner when sharing is off ── */}
          {!consentOn && (
            <p
              className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed text-ink-soft"
              role="note"
            >
              <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              You are not sharing with this group — your row stays private.
            </p>
          )}

          {/* ── rows ── */}
          <section aria-label="Weekly board" className="clay rounded-2xl p-2 md:p-3">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs leading-relaxed text-ink-soft">
                Nobody is sharing with this group yet — the board fills in as members choose to.
              </p>
            ) : (
              <ul className="divide-y divide-line/60">
                {rows.map((r) => <BoardRowView key={r.actorKey} r={r} />)}
              </ul>
            )}
            {!consentOn && you && (
              <p className="px-4 pb-2 pt-2 text-[10px] leading-relaxed text-ink-soft" role="note">
                Your measured week: {data.yourThisWeekXp ?? 0} XP{you.note ? ` · ${you.note}` : ''} — visible to you here even while private.
              </p>
            )}
          </section>

          <FootNote>
            {data.privacyNote} Rank is a quiet detail here — the comparison that matters is the one with your own last week.
          </FootNote>
        </>
      ) : (
        <BoardsBodySkeleton groupName={selected.name} />
      )}

      {stale && <span className="sr-only" role="status">Updating…</span>}
    </div>
  )
}

// ── consent switch — explicit opt-in per group (P16 shareData) ───────────────

function ConsentPanel({ groupId, groupName, consentOn, onChanged }: {
  groupId: string
  groupName: string
  consentOn: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const on = optimistic ?? consentOn

  const flip = async (next: boolean) => {
    if (busy) return
    setOptimistic(next)
    setBusy(true)
    try {
      const res = await api.gamifyConsent(groupId, next)
      setOptimistic(null)
      onChanged()
      toast({
        title: (res.consentOn ?? next) ? `Sharing on with ${groupName}` : `Sharing off with ${groupName}`,
        description: (res.consentOn ?? next)
          ? 'Your weekly XP, MCQ count and accuracy are now visible to this group.'
          : 'You never appear on this group\u2019s board while sharing is off.',
      })
    } catch {
      setOptimistic(null)
      toast({
        title: "Couldn't change sharing",
        description: 'The engine didn\u2019t respond — your setting is unchanged.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="clay rounded-2xl p-4" aria-label="Sharing settings">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-tight">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
            Sharing with {groupName}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
            Sharing ON shows your weekly XP, MCQ count and accuracy with this group. Off = you never appear.
          </p>
        </div>
        <Switch
          checked={on}
          disabled={busy}
          onCheckedChange={flip}
          aria-label={`Share my weekly numbers with ${groupName}`}
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-soft">
        {on ? <Eye className="size-3 shrink-0" aria-hidden /> : <EyeOff className="size-3 shrink-0" aria-hidden />}
        {on ? 'Your row appears on this group\u2019s board.' : 'Your row is hidden from this group\u2019s board.'}
      </p>
    </section>
  )
}

// ── row — rank muted, XP primary, your row carries the measured note ─────────

function BoardRowView({ r }: { r: GamifyBoardRow }) {
  const accent = useAccent()
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5',
        r.you && 'bg-primary/8 ring-1 ring-inset ring-primary/25',
      )}
    >
      <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-ink-soft/70" aria-label={`Rank ${r.rank}`}>
        {r.rank}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('truncate text-xs font-semibold', r.you && 'text-primary')}>{r.name}</span>
          {r.you && (
            <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide', accent.chipBg, accent.chipText)}>
              You
            </span>
          )}
          {r.demo && <DemoTag />}
        </div>
        {r.note && <span className="mt-0.5 block text-[10px] leading-tight text-ink-soft">{r.note}</span>}
      </div>

      <div className="shrink-0 text-right">
        <p className={cn('text-xs font-bold tabular-nums', r.you && 'text-primary')}>
          {r.weeklyXp != null ? `${r.weeklyXp} XP` : '—'}
        </p>
        <p className="text-[10px] tabular-nums text-ink-soft">
          {r.weeklyMcqs != null ? `${r.weeklyMcqs} MCQs` : '—'}
          {r.weeklyAccuracy != null ? ` · ${r.weeklyAccuracy}%` : ''}
        </p>
      </div>
    </li>
  )
}

function BoardsBodySkeleton({ groupName }: { groupName: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label={`Loading the board for ${groupName}`}>
      <Skeleton className="h-20 rounded-2xl" />
      <div className="clay space-y-3 rounded-2xl p-4" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-5" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

function BoardsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading the board">
      <div className="flex gap-2" aria-hidden>
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <Skeleton className="h-20 rounded-2xl" />
      <div className="clay space-y-3 rounded-2xl p-4" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-5" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 text-[11px] text-ink-soft">
        <Info className="size-3.5 shrink-0" aria-hidden /> Fetching your groups and the weekly board…
      </p>
    </div>
  )
}
