'use client'

// ─── PERSONAL MEDICAL BRAIN · ROOT (PRODUCT 18) ──────────────────────────────
// Section shell + tab machine: overview | knowledge | path | memory | strategy
// | privacy. The shell fetches the home payload ONCE (shared with the overview
// tab so the sticky header never double-fetches); every other tab fetches its
// own payload with skeletons and honest retry. Deep links: #/brain?tab=<id>
// (parsed on mount) + in-app hand-offs via store.brainFocus (openBrain nonce
// pattern — store hand-offs take priority over the hash). Honesty rules: the
// brain shows insights + actions (never raw dumps), every number is measured,
// and the section is private by default.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Lock } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  BRAIN_TABS, BrainErrorState, MicroLabel, useBrainHome,
} from './brain-shared'
import type { BrainTab } from './brain-shared'
import type { BrainConceptStatus } from '@/lib/types'
import { BrainOverview } from './brain-overview'
import { BrainKnowledge } from './brain-knowledge'
import { BrainPath } from './brain-path'
import { BrainMemory } from './brain-memory'
import { BrainStrategy } from './brain-strategy'
import { BrainPrivacy } from './brain-privacy'

export interface BrainKnowledgeSeed {
  state: BrainConceptStatus | 'all'
  nonce: number
}

/** Parse #/brain?tab=<overview|knowledge|path|memory|strategy|privacy>. */
function parseBrainHash(hash?: string): BrainTab | null {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!h.startsWith('#/brain')) return null
  try {
    const qs = h.slice('#/brain'.length).replace(/^\?/, '')
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=')
      const val = v ? decodeURIComponent(v) : null
      if (k === 'tab' && val && BRAIN_TABS.some((t) => t.id === val)) return val as BrainTab
    }
  } catch { /* malformed hash — ignore */ }
  return null
}

function writeBrainHash(tab: BrainTab): void {
  if (typeof window === 'undefined') return
  const target = tab === 'overview' ? '#/brain' : `#/brain?tab=${tab}`
  try { window.history.replaceState(null, '', target) } catch { /* private mode */ }
}

export function BrainView() {
  const brainFocus = useAppStore((s) => s.brainFocus)
  const closeBrain = useAppStore((s) => s.closeBrain)

  // ── shared home payload (header strip + overview tab; fetched once) ──
  const homeHook = useBrainHome()

  // ── deep-link bootstrap (hash) — in-app hand-offs re-fire via the nonce ──
  const [initialTab] = useState(() => parseBrainHash())
  const [tab, setTab] = useState<BrainTab>(initialTab ?? 'overview')

  // ── in-app hand-offs: re-apply whenever openBrain() bumps the nonce.
  // Render-time state adjustment (react.dev/learn/you-might-not-need-an-effect). ──
  const [lastFocus, setLastFocus] = useState(brainFocus)
  if (brainFocus !== lastFocus) {
    setLastFocus(brainFocus)
    if (brainFocus?.tab) setTab(brainFocus.tab)
  }

  // Clear the external focus channel once consumed.
  useEffect(() => {
    if (brainFocus) closeBrain()
  }, [brainFocus, closeBrain])

  // ── keep the URL hash honest with the visible tab (shareable links) ──
  useEffect(() => {
    writeBrainHash(tab)
  }, [tab])

  const goTab = (t: BrainTab) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  // Cross-tab jump: a state segment anywhere asks Knowledge to pre-filter.
  const [knowledgeSeed, setKnowledgeSeed] = useState<BrainKnowledgeSeed | null>(null)
  const goKnowledge = (state: BrainConceptStatus | 'all' = 'all') => {
    setKnowledgeSeed({ state, nonce: Date.now() })
    goTab('knowledge')
  }

  const home = homeHook.data
  const homeReady = home !== null

  // Header mini-strip numbers — measured, from the home payload only.
  const counts = home?.profile.conceptsByState
  const needsAttention = counts ? counts['at-risk'] + counts['needs-revision'] : null

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 pb-10 md:px-6 md:py-7">
      {/* ── sticky header: identity strip + tab bar ── */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-background/90 px-4 pb-2 pt-3 backdrop-blur-xl md:-mx-6 md:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12" aria-hidden>
            <Brain className="size-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <MicroLabel>Personal Medical Brain</MicroLabel>
            <h1 className="truncate text-base font-bold tracking-tight" data-testid="brain-header-title">Medical Brain</h1>
            <p className="truncate text-[11px] text-ink-soft" aria-hidden>
              Observe → Understand → Personalize → Predict → Improve
            </p>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-2.5 py-1 text-[10px] font-semibold text-primary"
            title="Your learning intelligence is visible to no one — there is no sharing surface."
          >
            <Lock className="size-3 shrink-0" aria-hidden />
            Private by default
          </span>
        </div>

        {/* profile mini-strip — measured counts, honest dashes when unmeasured */}
        {homeReady ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="brain-mini-strip">
            <MiniStat value={counts?.mastered ?? 0} label="mastered" dot="bg-emerald-500" />
            <MiniStat value={counts?.strong ?? 0} label="strong" dot="bg-teal-500" />
            <MiniStat value={needsAttention ?? 0} label="need attention" dot="bg-rose-500" />
            <MiniStat
              value={home.profile.questionAccuracy == null ? '—' : `${Math.round(home.profile.questionAccuracy)}%`}
              label="accuracy"
              dot="bg-primary"
            />
          </div>
        ) : homeHook.state === 'error' ? (
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-soft">The brain didn&apos;t load — nothing is lost, retry below or here.</p>
            <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={homeHook.reload}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="mt-2.5 flex gap-1.5" role="status" aria-busy="true">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        )}

        <nav className="mt-2.5 flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Medical Brain sections">
          {BRAIN_TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
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

      {/* ── tabs — subtle fade/slide on switch, matching section conventions ── */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        {tab === 'overview' && (
          homeReady ? (
            <BrainOverview home={home} stale={homeHook.stale} reload={homeHook.reload} onGoto={goTab} onJumpKnowledge={goKnowledge} />
          ) : homeHook.state === 'error' ? (
            <BrainErrorState
              title="Your brain didn't load"
              hint="The brain engine did not respond — it may still be warming up. Nothing is lost; retry below."
              onRetry={homeHook.reload}
            />
          ) : (
            <OverviewSkeleton />
          )
        )}
        {tab === 'knowledge' && <BrainKnowledge seed={knowledgeSeed} />}
        {tab === 'path' && <BrainPath />}
        {tab === 'memory' && <BrainMemory />}
        {tab === 'strategy' && <BrainStrategy />}
        {tab === 'privacy' && <BrainPrivacy refreshHome={homeHook.reload} />}
      </motion.div>
    </div>
  )
}

function MiniStat({ value, label, dot }: { value: number | string; label: string; dot: string }) {
  return (
    <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-0.5 text-[11px]">
      <span className={cn('size-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-ink-soft">{label}</span>
    </span>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading your brain overview">
      <Skeleton className="h-44 rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )
}
