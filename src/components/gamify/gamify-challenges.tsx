'use client'

// ─── MOTIVATION · CHALLENGES (PRODUCT 17) ────────────────────────────────────
// Adaptive targets from the measured baseline — never fixed pressure. Active
// enrollments show honest progress and an easy way out (leaving is fine —
// challenges are tools, not obligations). Completed challenges keep their
// badge. The catalog explains WHY each target was suggested.

import { useState } from 'react'
import { Award, BadgeCheck, CalendarDays, Flag, Info, Loader2, Target } from 'lucide-react'
import type { GamifyChallengeView } from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  Bar, EmptyState, ErrorState, FootNote, GAMIFY_ICON_MAP, useAccent, useGamifyPayload,
} from './gamify-shared'

export function GamifyChallenges() {
  const { data, state, stale, reload } = useGamifyPayload(api.gamifyChallenges)

  // local overlay so enroll/abandon reflect instantly; cleared when the
  // post-action refetch lands (server truth takes over)
  const [challenges, setChallenges] = useState<GamifyChallengeView[] | null>(null)
  const [lastData, setLastData] = useState(data)
  if (data !== lastData) {
    setLastData(data)
    if (challenges !== null) setChallenges(null)
  }
  const [busyId, setBusyId] = useState<string | null>(null)
  const [abandonTarget, setAbandonTarget] = useState<GamifyChallengeView | null>(null)

  const list = challenges ?? data?.challenges ?? []

  const applyChallenge = (updated: GamifyChallengeView) => {
    setChallenges((prev) => {
      const base = prev ?? data?.challenges ?? []
      return base.map((c) => (c.id === updated.id ? updated : c))
    })
  }

  const act = async (challengeId: string, action: 'enroll' | 'abandon') => {
    if (busyId) return
    setBusyId(challengeId)
    try {
      const res = await api.gamifyChallengeAction(challengeId, action)
      applyChallenge(res.challenge)
      // reconcile counts with a quiet refetch
      reload()
      if (action === 'enroll') {
        toast({
          title: 'Challenge started',
          description: res.challenge.adaptedNote,
        })
      } else {
        toast({
          title: 'Challenge closed',
          description: 'Leaving is fine — challenges are tools, not obligations.',
        })
      }
    } catch {
      toast({
        title: action === 'enroll' ? "Couldn't start the challenge" : "Couldn't close the challenge",
        description: 'The engine didn\u2019t respond — nothing changed. Try again in a moment.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  if (state === 'loading' && !data) return <ChallengesSkeleton />
  if (state === 'error' && !data) {
    return (
      <ErrorState
        title="Challenges didn't load"
        hint="The gamify engine did not respond — your enrollments are safe and recorded server-side. Retry below."
        onRetry={reload}
      />
    )
  }
  if (!data) return null

  const active = list.filter((c) => c.status === 'active')
  const completed = list.filter((c) => c.status === 'completed')
  const catalog = list.filter((c) => c.status === 'not-enrolled' || c.status === 'abandoned')

  return (
    <div className="space-y-4">
      {/* ── active enrollments first ── */}
      {active.length > 0 && (
        <section aria-label="Active challenges" className="space-y-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Active — {active.length}</p>
          {active.map((c) => <ActiveChallengeCard key={c.id} c={c} busy={busyId === c.id} onAbandon={() => setAbandonTarget(c)} />)}
        </section>
      )}

      {/* ── completed — badges kept ── */}
      {completed.length > 0 && (
        <section aria-label="Completed challenges" className="space-y-3">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Completed — {completed.length}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {completed.map((c) => <CompletedBadgeCard key={c.id} c={c} />)}
          </div>
        </section>
      )}

      {/* ── catalog ── */}
      <section aria-label="Challenge catalog" className="space-y-3">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Catalog</p>
        {catalog.length === 0 ? (
          <EmptyState
            icon={Target}
            title="You're in everything that fits right now"
            hint="New suggestions appear as your measured activity changes — nothing is pushed before it's useful."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {catalog.map((c) => (
              <CatalogCard key={c.id} c={c} busy={busyId === c.id} onEnroll={() => act(c.id, 'enroll')} />
            ))}
          </div>
        )}
      </section>

      {list.length === 0 && (
        <EmptyState
          icon={Target}
          title="No challenges yet"
          hint="Suggestions appear as your measured baseline builds — targets adapt to you, never the reverse."
        />
      )}

      <FootNote>
        Targets adapt to your measured baseline — never fixed pressure.{'\u00a0'}{data.note}
      </FootNote>

      {/* ── abandon confirm — non-shaming by contract ── */}
      <Dialog open={abandonTarget !== null} onOpenChange={(open) => { if (!open) setAbandonTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Flag className="size-4 text-primary" aria-hidden />
              Close “{abandonTarget?.title}”?
            </DialogTitle>
            <DialogDescription>
              Leaving is fine — challenges are tools, not obligations. Your progress so far stays recorded, and you can re-enroll any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="min-h-11 flex-1" onClick={() => setAbandonTarget(null)}>
              Keep going
            </Button>
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              disabled={busyId !== null}
              onClick={() => {
                if (abandonTarget) act(abandonTarget.id, 'abandon')
                setAbandonTarget(null)
              }}
            >
              {busyId !== null && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Close challenge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* keep the refetch state honest but invisible while stale data is shown */}
      {stale && <span className="sr-only" role="status">Updating…</span>}
    </div>
  )
}

// ── completed badge card (own component so useAccent stays rule-of-hooks safe)

function CompletedBadgeCard({ c }: { c: GamifyChallengeView }) {
  const accent = useAccent()
  const Icon = GAMIFY_ICON_MAP[c.icon] ?? Award
  return (
    <div className="clay flex items-center gap-3 rounded-2xl p-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', accent.chipBg)} aria-hidden>
        <Icon className={cn('size-5', accent.chipText)} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{c.title}</p>
        <p className="mt-0.5 text-[10px] text-ink-soft">
          {c.completedAt ? `Completed ${new Date(c.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Completed'}
          {' '}· bonus +{c.bonusXp} XP
        </p>
      </div>
      <BadgeCheck className="size-5 shrink-0 text-sev-ok" aria-label="Completed" />
    </div>
  )
}

// ── active enrollment card ──

function ActiveChallengeCard({ c, busy, onAbandon }: { c: GamifyChallengeView; busy: boolean; onAbandon: () => void }) {
  const accent = useAccent()
  const Icon = GAMIFY_ICON_MAP[c.icon] ?? Award
  return (
    <article className="clay rounded-2xl p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', accent.chipBg)} aria-hidden>
          <Icon className={cn('size-5', accent.chipText)} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">{c.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{c.description}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9 shrink-0 rounded-full px-3 text-xs text-ink-soft"
          disabled={busy}
          onClick={onAbandon}
        >
          Abandon
        </Button>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium tabular-nums">
            {c.progress ?? 0} {c.unit}
          </span>
          <span className="text-ink-soft tabular-nums">{c.percent ?? 0}% · target {c.target} {c.unit}</span>
        </div>
        <Bar value={c.percent} label={`${c.title} progress`} />
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3 shrink-0" aria-hidden />
            {c.daysLeft != null ? `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left` : `${c.durationDays}-day challenge`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Info className="size-3 shrink-0" aria-hidden />
            Bonus +{c.bonusXp} XP on completion
          </span>
        </div>
      </div>
    </article>
  )
}

function CatalogCard({ c, busy, onEnroll }: { c: GamifyChallengeView; busy: boolean; onEnroll: () => void }) {
  const accent = useAccent()
  const Icon = GAMIFY_ICON_MAP[c.icon] ?? Award
  return (
    <article className="clay flex flex-col gap-2.5 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', accent.chipBg)} aria-hidden>
          <Icon className={cn('size-5', accent.chipText)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold tracking-tight">{c.title}</h3>
            {c.suggested && (
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide', accent.chipBg, accent.chipText)}>
                Suggested for you
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{c.description}</p>
        </div>
      </div>

      <p className="rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
        {c.adaptedNote}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft">
          <span className="rounded-full border border-line bg-surface-2/70 px-2 py-0.5 font-semibold">{c.durationDays} days</span>
          <span className="rounded-full border border-line bg-surface-2/70 px-2 py-0.5">target {c.target} {c.unit}</span>
          <span className="rounded-full border border-line bg-surface-2/70 px-2 py-0.5">+{c.bonusXp} XP</span>
        </div>
        <Button size="sm" className="min-h-11 shrink-0 rounded-xl px-4 text-xs" disabled={busy} onClick={onEnroll}>
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Enroll
        </Button>
      </div>
      {c.suggested && c.suggestReason && (
        <p className="text-[10px] leading-relaxed text-ink-soft">Why this one: {c.suggestReason}</p>
      )}
    </article>
  )
}

function ChallengesSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading challenges">
      <div className="clay rounded-2xl p-5" aria-hidden>
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </div>
        <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="clay rounded-2xl p-4" aria-hidden>
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
            <Skeleton className="mt-3 h-8 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
