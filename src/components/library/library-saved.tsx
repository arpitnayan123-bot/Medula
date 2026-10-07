'use client'

// ─── RESOURCE HUB · SAVED LIST (PRODUCT 14) ──────────────────────────────────
// The student's personal shelf: every resource they bookmarked, newest first,
// with one-tap remove via the same save-toggle the detail panel uses. Empty
// state is honest — no fabricated suggestions.

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Bookmark, Loader2 } from 'lucide-react'
import type { LibrarySavedPayload } from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EASE } from './library-shared'
import { CardGrid, LibraryCard, MicroLabel, Reveal } from './library-shared'

type LoadState = 'loading' | 'ready' | 'error'

export function LibrarySavedScreen({
  onOpenResource, onSavedToggled,
}: {
  onOpenResource: (id: string) => void
  onSavedToggled?: () => void
}) {
  const [payload, setPayload] = useState<LibrarySavedPayload | null>(null)
  // The request key ties state to a specific fetch; staleness is derived at
  // render time so the effect never calls setState synchronously.
  const [meta, setMeta] = useState<{ key: number; state: LoadState }>({ key: 0, state: 'loading' })
  const [retryNonce, setRetryNonce] = useState(0)
  const [removing, setRemoving] = useState<string | null>(null)

  const stale = meta.key !== retryNonce

  useEffect(() => {
    let alive = true
    api.librarySaved().then(
      (p) => { if (alive) { setPayload(p); setMeta({ key: retryNonce, state: 'ready' }) } },
      () => { if (alive) setMeta({ key: retryNonce, state: 'error' }) },
    )
    return () => { alive = false }
  }, [retryNonce])

  const unsave = async (resourceId: string) => {
    if (removing) return
    const prev = payload
    setRemoving(resourceId)
    // optimistic — drop it from the list immediately
    setPayload((p) => p
      ? { ...p, resources: p.resources.filter((r) => r.id !== resourceId), total: Math.max(0, p.total - 1) }
      : p)
    try {
      await api.librarySavedToggle(resourceId)
      onSavedToggled?.()
    } catch {
      setPayload(prev) // revert on failure
      toast({ title: 'Could not remove it from your list', variant: 'destructive' })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-6">
      <Reveal index={0} className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          <Bookmark className="size-3.5 text-primary" aria-hidden /> Your shelf
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Saved resources</h1>
        {!stale && meta.state === 'ready' && payload && (
          <p className="text-sm text-ink-soft">
            {payload.total === 0
              ? 'Nothing here yet.'
              : `${payload.total} ${payload.total === 1 ? 'resource' : 'resources'} kept for later.`}
          </p>
        )}
      </Reveal>

      {stale || meta.state === 'loading' ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <Skeleton className="h-8 w-40 max-w-full rounded-md" />
          <CardGrid>
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </CardGrid>
        </div>
      ) : meta.state === 'error' || !payload ? (
        <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
          <h2 className="text-base font-semibold tracking-tight">Your saved list didn&apos;t load</h2>
          <p className="max-w-sm text-sm text-ink-soft">
            The catalog did not respond — nothing is lost. Saved resources stay saved.
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => setRetryNonce((n) => n + 1)}>
            <Loader2 className="size-4" aria-hidden /> Retry
          </Button>
        </div>
      ) : payload.resources.length === 0 ? (
        <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <span className="clay-in grid size-12 place-items-center rounded-2xl" aria-hidden>
            <Bookmark className="size-5 text-ink-soft" />
          </span>
          <h2 className="text-base font-semibold tracking-tight">Nothing saved yet</h2>
          <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
            Open any resource and tap <span className="font-semibold">«Save»</span> — everything you
            keep lands here, ready for the week before the exam.
          </p>
        </div>
      ) : (
        <motion.div
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <MicroLabel className="mb-3">Kept for later</MicroLabel>
          <CardGrid>
            {payload.resources.map((r) => (
              <div key={r.id} className="flex min-w-0 flex-col gap-1.5">
                <LibraryCard resource={r} onOpen={onOpenResource} />
                <Button
                  variant="ghost"
                  className="min-h-11 w-fit gap-1.5 px-3 text-xs text-ink-soft hover:text-sev-crit"
                  onClick={() => unsave(r.id)}
                  disabled={removing === r.id}
                >
                  {removing === r.id
                    ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    : <Bookmark className="size-3.5" aria-hidden />}
                  Remove from saved
                </Button>
              </div>
            ))}
          </CardGrid>
        </motion.div>
      )}
    </div>
  )
}
