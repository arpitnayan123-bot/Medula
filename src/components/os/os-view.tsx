'use client'

// ─── Medical Education OS — command center view (PRODUCT 20) ────────────────
// «Discover → Learn → Practice → Analyze → Revise → Improve»
//
// One personalized command center that unifies the entire platform: the
// hero answers "What should I do next?" from the published priority rule,
// the today sections carry the measured daily detail, and the connections
// map shows every feature as part of one ecosystem. Conventions follow the
// Brain section (frozen contract in types.ts, one GET, honest empty states,
// no chain-of-thought anywhere).

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import type { OsCommandCenter } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MicroLabel, FootNote } from '@/components/os/os-shared'
import { OsHero } from '@/components/os/os-hero'
import { OsTodaySections } from '@/components/os/os-sections'
import { OsConnections } from '@/components/os/os-connections'
import { Command, RefreshCcw, TriangleAlert } from 'lucide-react'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function OsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading your command center">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="size-[84px] rounded-full" />
      </div>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    </div>
  )
}

export function OsView() {
  const [data, setData] = useState<OsCommandCenter | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  // Fetch transitions happen inside promise callbacks — never synchronously
  // within the effect body (avoids cascading renders on mount).
  useEffect(() => {
    let cancelled = false
    api.osHome().then(
      (payload) => {
        if (cancelled) return
        setData(payload)
        setState('ready')
      },
      () => {
        if (cancelled) return
        setState('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Retry is a user action — show the spinner immediately, then fetch.
  const retry = useCallback(() => {
    setState('loading')
    setReloadKey((k) => k + 1)
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-7">
      {/* header */}
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex size-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Command className="size-5 text-primary" aria-hidden />
          <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <MicroLabel>Education OS</MicroLabel>
          <p className="truncate text-[12px] text-ink-soft">
            Discover → Learn → Practice → Analyze → Revise → Improve
          </p>
        </div>
      </div>

      {state === 'loading' && <OsSkeleton />}

      {state === 'error' && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <TriangleAlert className="mx-auto size-6 text-destructive" aria-hidden />
          <p className="mt-2 text-sm font-medium">Your command center could not be loaded.</p>
          <p className="mt-1 text-xs text-ink-soft">Check your connection and try again — nothing was lost.</p>
          <Button size="sm" variant="outline" className="mt-3 rounded-xl" onClick={retry}>
            <RefreshCcw className="size-3.5" aria-hidden /> Retry
          </Button>
        </div>
      )}

      {state === 'ready' && data && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="space-y-3"
        >
          <OsHero data={data} />
          <OsTodaySections data={data} />
          <OsConnections data={data} />

          {/* honesty footer */}
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-3.5">
            <MicroLabel>Why you can trust this page</MicroLabel>
            <FootNote>
              {data.honestNote} Measured from {data.dataBasis.ledgers.length} ledger families ({data.dataBasis.ledgers.slice(0, 8).join(', ')}…) over {data.dataBasis.window}. Peers: {data.dataBasis.peers}.
              {data.insufficientData ? ' Right now there is not enough activity for full recommendations — start below and this page fills with measured guidance.' : ''}
            </FootNote>
          </div>
        </motion.div>
      )}
    </div>
  )
}
