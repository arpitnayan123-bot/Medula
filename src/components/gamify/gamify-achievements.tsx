'use client'

// ─── MOTIVATION · ACHIEVEMENTS (PRODUCT 17) ──────────────────────────────────
// A curated set (~14) — no badge clutter, no vanity counters. Unlocked cards
// carry the measured earnedAt; locked cards carry an honest progress line
// ('78 / 100 MCQs solved'). Tapping a badge features it on the Motivation
// header strip (max 3, enforced here and by the server) with an optimistic
// update — failures roll back and say so.

import { useMemo, useState } from 'react'
import { Award, Star, Unlock } from 'lucide-react'
import type { GamifyAchievementView } from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Pop, Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import {
  Bar, ErrorState, FootNote, GAMIFY_ICON_MAP, useAccent, useGamifyPayload,
} from './gamify-shared'

const GROUP_ORDER: GamifyAchievementView['group'][] = ['starters', 'practice', 'consistency', 'mocks', 'repair', 'mastery']

const GROUP_LABEL: Record<GamifyAchievementView['group'], string> = {
  starters: 'Starters',
  practice: 'Practice',
  consistency: 'Consistency',
  mocks: 'Mocks',
  repair: 'Repair',
  mastery: 'Mastery',
}

const FEATURED_MAX = 3

export function GamifyAchievements() {
  const { data, state, stale, reload } = useGamifyPayload(api.gamifyAchievements)

  const [featured, setFeatured] = useState<string[] | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const list = useMemo(() => {
    if (!data) return []
    return data.achievements.map((a) => ({ ...a, featured: (featured ?? data.featured).includes(a.id) }))
  }, [data, featured])

  const toggleFeature = async (a: GamifyAchievementView & { featured: boolean }) => {
    if (!data || pendingId) return
    const current = featured ?? data.featured
    let next: string[]
    if (current.includes(a.id)) {
      next = current.filter((id) => id !== a.id)
    } else {
      if (current.length >= FEATURED_MAX) {
        toast({
          title: 'Three badges fit on the header',
          description: 'Un-feature one first — a quiet header beats a crowded one.',
        })
        return
      }
      next = [...current, a.id]
    }
    // optimistic — roll back on failure
    setFeatured(next)
    setPendingId(a.id)
    try {
      const res = await api.gamifyAchievementsFeatured(next)
      setFeatured(res.featured ?? next)
      toast({
        title: 'Featured badges updated',
        description: next.length > 0 ? `${next.length} of ${FEATURED_MAX} shown on your Motivation header.` : 'Your Motivation header is clear again.',
      })
    } catch {
      setFeatured(current)
      toast({
        title: "Couldn't update featured badges",
        description: 'The engine didn\u2019t respond — your selection rolled back. Try again in a moment.',
        variant: 'destructive',
      })
    } finally {
      setPendingId(null)
    }
  }

  if (state === 'loading') return <AchievementsSkeleton />
  if (state === 'error') {
    return (
      <ErrorState
        title="Achievements didn't load"
        hint="The gamify engine did not respond — your unlocks are safe and recorded server-side. Retry below."
        onRetry={reload}
      />
    )
  }
  if (!data) return null

  const grouped = GROUP_ORDER
    .map((g) => ({ group: g, items: list.filter((a) => a.group === g) }))
    .filter((g) => g.items.length > 0)

  const unlockedCount = list.filter((a) => a.unlocked).length
  const currentFeatured = featured ?? data.featured
  // quiet celebration: the first two unlocked badges pop in (rest stay calm)
  const popIds = new Set(list.filter((a) => a.unlocked).slice(0, 2).map((a) => a.id))

  return (
    <div className="space-y-4">
      <header className="clay rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight">Achievements</h1>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {unlockedCount} of {list.length} unlocked — a curated set, measured from your real activity. Tap a badge to feature up to {FEATURED_MAX} on your Motivation header.
            </p>
          </div>
          <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold tabular-nums', currentFeatured.length >= FEATURED_MAX ? 'border-primary/40 bg-primary/12 text-primary' : 'border-line bg-surface-2/60 text-ink-soft')}>
            {currentFeatured.length} / {FEATURED_MAX} featured
          </span>
        </div>
      </header>

      {grouped.map((g) => (
        <section key={g.group} aria-label={GROUP_LABEL[g.group]}>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{GROUP_LABEL[g.group]}</p>
          <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((a) => (
              <StaggerItem key={a.id} className="h-full">
                <AchievementCard a={a} pending={pendingId === a.id} pop={popIds.has(a.id)} onToggle={() => toggleFeature(a)} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      ))}

      <FootNote>{data.note}</FootNote>
      <Button variant="ghost" size="sm" className="min-h-9 rounded-full px-3 text-xs text-ink-soft" onClick={reload}>
        {stale ? 'Re-measuring…' : 'Re-measure'}
      </Button>
    </div>
  )
}

function AchievementCard({ a, pending, pop, onToggle }: {
  a: GamifyAchievementView & { featured: boolean }
  pending: boolean
  pop: boolean
  onToggle: () => void
}) {
  const accent = useAccent()
  const Icon = GAMIFY_ICON_MAP[a.icon] ?? Award
  const unlocked = a.unlocked
  const iconTile = (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl',
        unlocked ? accent.chipBg : 'bg-surface-2',
      )}
      aria-hidden
    >
      <Icon className={cn('size-5', unlocked ? accent.chipText : 'text-ink-soft/60')} />
    </span>
  )

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={a.featured}
      title={unlocked ? `Unlocked${a.earnedAt ? ` · ${new Date(a.earnedAt).toLocaleDateString('en-IN')}` : ''} — tap to ${a.featured ? 'un-feature' : 'feature'}` : `${a.progressNote ?? 'In progress'} — tap to ${a.featured ? 'un-feature' : 'feature'}`}
      className={cn(
        'group relative flex h-full min-h-44 flex-col items-start gap-2 rounded-2xl border p-3.5 text-left outline-none ring-primary/50 transition-all focus-visible:ring-2 disabled:opacity-70',
        unlocked
          ? cn('clay', a.featured && accent.chipBorder)
          : 'border-dashed border-line bg-surface-2/30 hover:border-line',
      )}
    >
      {/* featured star */}
      <span
        className={cn(
          'absolute right-2.5 top-2.5 transition-colors',
          a.featured ? 'text-gold' : 'text-ink-soft/25 group-hover:text-ink-soft/50',
        )}
        aria-hidden
      >
        <Star className={cn('size-3.5', a.featured && 'fill-gold')} />
      </span>

      {pop ? <Pop className="shrink-0" delay={0.35}>{iconTile}</Pop> : iconTile}

      <span className={cn('text-xs font-semibold leading-snug', !unlocked && 'text-ink-soft')}>
        {a.title}
      </span>
      <span className="text-[10px] leading-relaxed text-ink-soft line-clamp-2">{a.description}</span>

      {unlocked ? (
        <span className="mt-auto inline-flex items-center gap-1 text-[10px] font-medium text-ink-soft" title={a.earnedAt ? new Date(a.earnedAt).toLocaleString('en-IN') : undefined}>
          <Unlock className="size-3 shrink-0" aria-hidden />
          {a.earnedAt ? new Date(a.earnedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Unlocked'}
        </span>
      ) : (
        <span className="mt-auto w-full space-y-1">
          <Bar value={a.progress} label={`${a.title} progress`} />
          <span className="block text-[10px] tabular-nums text-ink-soft">{a.progressNote ?? 'Not started yet'}</span>
        </span>
      )}

      {a.featured && (
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide', accent.chipBg, accent.chipText)}>
          featured
        </span>
      )}
    </button>
  )
}

function AchievementsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading achievements">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="clay rounded-2xl p-3.5" aria-hidden>
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="mt-2.5 h-3 w-3/4" />
            <Skeleton className="mt-1.5 h-3 w-full" />
            <Skeleton className="mt-2.5 h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 text-[11px] text-ink-soft">
        <Award className="size-3.5 shrink-0" aria-hidden /> Fetching your measured unlocks…
      </p>
    </div>
  )
}
