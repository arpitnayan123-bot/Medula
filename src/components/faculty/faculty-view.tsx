'use client'

// ─── AI FACULTY & CONTENT INTELLIGENCE · ROOT (PRODUCT 19) ───────────────────
// Section shell + tab machine: overview | gaps | quality | studio | library.
// The shell fetches the home payload ONCE (shared with the overview tab so the
// sticky header never double-fetches); every other tab fetches its own payload
// with skeletons and honest retry. Deep links: #/faculty?tab=<id> (parsed on
// mount) + in-app hand-offs via store.facultyFocus (openFaculty nonce pattern —
// store hand-offs take priority over the hash). Honesty rules: everything here
// is reviewer-gated — nothing authored in this workspace is authoritative until
// a human publishes it.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Lock } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  FACULTY_TABS, FacultyErrorState, MicroLabel, useFacultyHome,
} from './faculty-shared'
import type { FacultyTab } from './faculty-shared'
import { FacultyOverview } from './faculty-overview'
import { FacultyGaps } from './faculty-gaps'
import { FacultyQuality } from './faculty-quality'
import { FacultyStudio } from './faculty-studio'
import { FacultyLibrary } from './faculty-library'

/** Parse #/faculty?tab=<overview|gaps|quality|studio|library>. */
function parseFacultyHash(hash?: string): FacultyTab | null {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  if (!h.startsWith('#/faculty')) return null
  try {
    const qs = h.slice('#/faculty'.length).replace(/^\?/, '')
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=')
      const val = v ? decodeURIComponent(v) : null
      if (k === 'tab' && val && FACULTY_TABS.some((t) => t.id === val)) return val as FacultyTab
    }
  } catch { /* malformed hash — ignore */ }
  return null
}

function writeFacultyHash(tab: FacultyTab): void {
  if (typeof window === 'undefined') return
  const target = tab === 'overview' ? '#/faculty' : `#/faculty?tab=${tab}`
  try { window.history.replaceState(null, '', target) } catch { /* private mode */ }
}

export function FacultyView() {
  const facultyFocus = useAppStore((s) => s.facultyFocus)
  const closeFaculty = useAppStore((s) => s.closeFaculty)

  // ── shared home payload (header strip + overview tab; fetched once) ──
  const homeHook = useFacultyHome()

  // ── deep-link bootstrap (hash) — in-app hand-offs re-fire via the nonce ──
  const [initialTab] = useState(() => parseFacultyHash())
  const [tab, setTab] = useState<FacultyTab>(initialTab ?? 'overview')

  // ── in-app hand-offs: re-apply whenever openFaculty() bumps the nonce.
  // Render-time state adjustment (react.dev/learn/you-might-not-need-an-effect). ──
  const [lastFocus, setLastFocus] = useState(facultyFocus)
  if (facultyFocus !== lastFocus) {
    setLastFocus(facultyFocus)
    if (facultyFocus?.tab) setTab(facultyFocus.tab)
  }

  // Clear the external focus channel once consumed.
  useEffect(() => {
    if (facultyFocus) closeFaculty()
  }, [facultyFocus, closeFaculty])

  // ── keep the URL hash honest with the visible tab (shareable links) ──
  useEffect(() => {
    writeFacultyHash(tab)
  }, [tab])

  const goTab = (t: FacultyTab) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  const home = homeHook.data
  const homeReady = home !== null

  // Header mini-strip numbers — measured, from the home payload only.
  const inv = home?.inventory
  const gaps = home?.gaps
  const quality = home?.quality

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 pb-10 md:px-6 md:py-7">
      {/* ── sticky header: identity strip + tab bar ── */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-background/90 px-4 pb-2 pt-3 backdrop-blur-xl md:-mx-6 md:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12" aria-hidden>
            <GraduationCap className="size-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <MicroLabel>AI Faculty &amp; Content Intelligence</MicroLabel>
            <h1 className="truncate text-base font-bold tracking-tight" data-testid="faculty-header-title">Faculty Studio</h1>
            <p className="truncate text-[11px] text-ink-soft" aria-hidden>
              Collect → Organize → Understand → Validate → Personalize
            </p>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-2.5 py-1 text-[10px] font-semibold text-primary"
            title="Nothing authored here is authoritative until a human publishes it."
          >
            <Lock className="size-3 shrink-0" aria-hidden />
            Reviewer-gated
          </span>
        </div>

        {/* inventory mini-strip — measured counts, honest dashes when unmeasured */}
        {homeReady ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="faculty-mini-strip">
            <MiniStat value={inv?.concepts ?? 0} label="concepts" dot="bg-primary" />
            <MiniStat value={inv?.lessons ?? 0} label="lessons" dot="bg-teal-500" />
            <MiniStat value={inv?.questions ?? 0} label="questions" dot="bg-emerald-500" />
            <MiniStat value={gaps?.all ?? 0} label="gaps open" dot="bg-amber-500" />
            <MiniStat value={quality?.open ?? 0} label="findings open" dot="bg-rose-500" />
          </div>
        ) : homeHook.state === 'error' ? (
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-soft">The workspace didn&apos;t load — nothing is lost, retry below or here.</p>
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
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        )}

        <nav className="mt-2.5 flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Faculty Studio sections">
          {FACULTY_TABS.map((t) => {
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
            <FacultyOverview home={home} stale={homeHook.stale} reload={homeHook.reload} onGoto={goTab} />
          ) : homeHook.state === 'error' ? (
            <FacultyErrorState
              title="The workspace didn't load"
              hint="The faculty engine did not respond — it may still be warming up. Nothing is lost; retry below."
              onRetry={homeHook.reload}
            />
          ) : (
            <OverviewSkeleton />
          )
        )}
        {tab === 'gaps' && <FacultyGaps />}
        {tab === 'quality' && <FacultyQuality onGoto={goTab} />}
        {tab === 'studio' && <FacultyStudio />}
        {tab === 'library' && <FacultyLibrary />}
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
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading the faculty overview">
      <Skeleton className="h-44 rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )
}
