'use client'

// ─── GAMIFIED MEDICAL LEARNING & MOTIVATION ENGINE · ROOT (PRODUCT 17) ───────
// Section shell + tab machine: overview | journey | achievements | challenges
// | boards | rewards. The shell fetches the home payload ONCE (shared with the
// overview tab so the sticky level header never double-fetches); every other
// tab fetches its own payload with skeletons and honest retry. Deep links:
// #/gamify?tab=<id> (parsed on mount) + in-app hand-offs via store.gamifyFocus
// (openGamify nonce pattern — store hand-offs take priority over the hash).
// Honesty rules: numbers are measured, no guilt copy, ranks secondary,
// rewards non-monetary, accent themes scoped to this section only.

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  GAMIFY_TABS, ErrorState, GamifyAccentProvider, MicroLabel, XpRing, accentForLevel, useGamifyHome,
} from './gamify-shared'
import type { GamifyAccentId, GamifyTab } from './gamify-shared'
import { GamifyOverview } from './gamify-overview'
import { GamifyJourney } from './gamify-journey'
import { GamifyAchievements } from './gamify-achievements'
import { GamifyChallenges } from './gamify-challenges'
import { GamifyBoards } from './gamify-boards'
import { GamifyRewards } from './gamify-rewards'

/** Parse #/gamify?tab=<overview|journey|achievements|challenges|boards|rewards>. */
function parseGamifyHash(hash?: string): GamifyTab | null {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!h.startsWith('#/gamify')) return null
  try {
    const qs = h.slice('#/gamify'.length).replace(/^\?/, '')
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=')
      const val = v ? decodeURIComponent(v) : null
      if (k === 'tab' && val && GAMIFY_TABS.some((t) => t.id === val)) return val as GamifyTab
    }
  } catch { /* malformed hash — ignore */ }
  return null
}

function writeGamifyHash(tab: GamifyTab): void {
  if (typeof window === 'undefined') return
  const target = tab === 'overview' ? '#/gamify' : `#/gamify?tab=${tab}`
  try { window.history.replaceState(null, '', target) } catch { /* private mode */ }
}

export function GamifyView() {
  const gamifyFocus = useAppStore((s) => s.gamifyFocus)
  const closeGamify = useAppStore((s) => s.closeGamify)

  // ── shared home payload (header strip + overview tab; fetched once) ──
  const homeHook = useGamifyHome()

  // ── deep-link bootstrap (hash) — in-app hand-offs re-fire via the nonce ──
  const [initialTab] = useState(() => parseGamifyHash())
  const [tab, setTab] = useState<GamifyTab>(initialTab ?? 'overview')

  // ── in-app hand-offs: re-apply whenever openGamify() bumps the nonce.
  // Render-time state adjustment (react.dev/learn/you-might-not-need-an-effect). ──
  const [lastFocus, setLastFocus] = useState(gamifyFocus)
  if (gamifyFocus !== lastFocus) {
    setLastFocus(gamifyFocus)
    if (gamifyFocus?.tab) setTab(gamifyFocus.tab)
  }

  // Clear the external focus channel once consumed.
  useEffect(() => {
    if (gamifyFocus) closeGamify()
  }, [gamifyFocus, closeGamify])

  // ── keep the URL hash honest with the visible tab (shareable links) ──
  useEffect(() => {
    writeGamifyHash(tab)
  }, [tab])

  const goTab = (t: GamifyTab) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  // ── accent: default follows the measured level; rewards can override for
  //    this session (explicitly labelled 'Applies to this section') ──
  const level = homeHook.data?.level.level ?? null
  const [accentOverride, setAccentOverride] = useState<GamifyAccentId | null>(null)
  const accentId: GamifyAccentId = accentOverride ?? accentForLevel(level ?? 0)

  const home = homeHook.data
  const homeReady = home !== null

  return (
    <GamifyAccentProvider value={accentId}>
      <div data-accent={accentId} className="mx-auto w-full max-w-5xl px-4 py-5 pb-10 md:px-6 md:py-7">
        {/* ── sticky header: level strip + tab bar (desktop + mobile chips) ── */}
        <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-background/90 px-4 pb-2 pt-3 backdrop-blur-xl md:-mx-6 md:px-6">
          <div className="flex items-center gap-3.5">
            {homeReady ? (
              <>
                <XpRing
                  level={home.level.level}
                  tier={home.level.tier}
                  xpIntoLevel={home.level.xpIntoLevel}
                  xpForNextLevel={home.level.xpForNextLevel}
                  size={44}
                  strokeWidth={4}
                  className="mb-4"
                />
                <div className="min-w-0">
                  <MicroLabel>Motivation</MicroLabel>
                  <p className="truncate text-sm font-semibold tracking-tight" data-testid="gamify-header-level">
                    {home.level.tier} · Level {home.level.level}
                  </p>
                  <p className="text-[11px] text-ink-soft">{home.level.xpToNext} XP to next level</p>
                </div>
              </>
            ) : homeHook.state === 'error' ? (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2" aria-hidden>
                  <Trophy className="size-5 text-ink-soft" />
                </span>
                <div className="min-w-0 flex-1">
                  <MicroLabel>Motivation</MicroLabel>
                  <p className="truncate text-sm font-semibold tracking-tight">Your level didn&apos;t load</p>
                  <p className="text-[11px] text-ink-soft">The engine didn&apos;t respond — retry below or here.</p>
                </div>
                <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={homeHook.reload}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <Skeleton className="size-11 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5" role="status" aria-busy="true">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3.5 w-36 max-w-full" />
                </div>
              </>
            )}
          </div>

          <nav className="mt-2.5 flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Motivation sections">
            {GAMIFY_TABS.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => goTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
                    active
                      ? 'border-primary/40 bg-primary/12 text-primary'
                      : 'border-transparent text-ink-soft hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <t.icon className="size-3.5" aria-hidden />
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* ── tabs ── */}
        {tab === 'overview' && (
          homeReady ? (
            <GamifyOverview home={home} stale={homeHook.stale} reload={homeHook.reload} />
          ) : homeHook.state === 'error' ? (
            <ErrorState
              title="The Motivation home didn't load"
              hint="The gamify engine did not respond — it may still be warming up. Nothing is lost; retry below."
              onRetry={homeHook.reload}
            />
          ) : (
            <OverviewSkeleton />
          )
        )}
        {tab === 'journey' && <GamifyJourney />}
        {tab === 'achievements' && <GamifyAchievements />}
        {tab === 'challenges' && <GamifyChallenges />}
        {tab === 'boards' && <GamifyBoards />}
        {tab === 'rewards' && (
          <GamifyRewards
            accentId={accentId}
            onAccentChange={(id) => setAccentOverride(id)}
          />
        )}
      </div>
    </GamifyAccentProvider>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading your motivation overview">
      <div className="clay flex items-center gap-5 rounded-2xl p-5">
        <Skeleton className="size-24 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-52 max-w-full" />
          <Skeleton className="h-3 w-36 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-52 rounded-2xl" />
    </div>
  )
}
