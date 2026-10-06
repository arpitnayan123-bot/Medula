'use client'

// ─── RESOURCE HUB · ROOT (PRODUCT 14) ────────────────────────────────────────
// State machine: home (hub landing) → browse (filter + search + topic feed)
// → saved (personal shelf), with the resource detail sheet as an OVERLAY
// state (selectedId) above any of them — same pattern as the Concept
// Explorer. Deep links: #/library?topic=<id>&q=<q> (parsed on mount) and
// in-app hand-offs via store.libraryFocus (openLibrary nonce pattern).
// Trust rules stay visible everywhere: ownership, access, license,
// verification badges and the catalog disclaimer on every catalog surface.

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Bookmark, Compass, Library as LibraryIcon } from 'lucide-react'
import type { LibraryHomePayload } from '@/lib/types'
import { api } from '@/lib/api'
import {
  parseLibraryHash, useAppStore, writeLibraryHash,
} from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Reveal, SectionSkeleton } from './library-shared'
import { LibraryHomeScreen } from './library-home'
import { LibraryBrowser, type LibraryFilters } from './library-browser'
import { LibrarySavedScreen } from './library-saved'
import { LibraryDetailPanel } from './library-detail'

type Phase = 'home' | 'browse' | 'saved'
type LoadState = 'loading' | 'ready' | 'error'

export function LibraryView() {
  const libraryFocus = useAppStore((s) => s.libraryFocus)
  const closeLibrary = useAppStore((s) => s.closeLibrary)

  // ── deep-link bootstrap: the hash is mirrored by openLibrary(), so parsing
  // it on mount covers both shared links and in-app hand-offs. ──
  const [initial] = useState(() => parseLibraryHash())
  const [phase, setPhase] = useState<Phase>(initial.topicId || initial.q ? 'browse' : 'home')
  const [filters, setFilters] = useState<LibraryFilters>(() => ({
    page: 1,
    topic: initial.topicId ?? undefined,
    q: initial.q ?? undefined,
  }))

  const [home, setHome] = useState<LibraryHomePayload | null>(null)
  // Which homeKey the stored payload/state belongs to — staleness is derived at
  // render time, so no setState is needed inside the fetch effect itself.
  const [homeMeta, setHomeMeta] = useState<{ key: number; state: LoadState }>({ key: 0, state: 'loading' })
  const [homeKey, setHomeKey] = useState(0)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedDirty, setSavedDirty] = useState(false)

  const homeStale = homeMeta.key !== homeKey

  // ── home payload (subjects/sources feed the browser's filter options too) ──
  useEffect(() => {
    let alive = true
    api.libraryHome().then(
      (p) => { if (alive) { setHome(p); setHomeMeta({ key: homeKey, state: 'ready' }) } },
      () => { if (alive) setHomeMeta({ key: homeKey, state: 'error' }) },
    )
    return () => { alive = false }
  }, [homeKey])

  // ── in-app hand-offs: re-apply whenever openLibrary() bumps the nonce.
  // Render-time state adjustment (react.dev/learn/you-might-not-need-an-effect)
  // — comparing against the last-seen focus avoids setState-in-effect. ──
  const [lastFocus, setLastFocus] = useState(libraryFocus)
  if (libraryFocus !== lastFocus) {
    setLastFocus(libraryFocus)
    if (libraryFocus) {
      const focusTopic = libraryFocus.topicId ?? undefined
      const focusQ = libraryFocus.q ?? undefined
      setFilters((f) => ({ ...f, topic: focusTopic, q: focusQ, page: 1 }))
      setPhase('browse')
    }
  }

  // Clear the external focus channel once consumed (store update, effect-safe).
  useEffect(() => {
    if (libraryFocus) closeLibrary()
  }, [libraryFocus, closeLibrary])

  // ── keep the URL hash honest with the visible state (shareable links) ──
  useEffect(() => {
    if (phase === 'browse') writeLibraryHash(filters.topic ?? null, filters.q ?? null)
    else writeLibraryHash(null, null)
  }, [phase, filters.topic, filters.q])

  const updateFilters = useCallback((patch: Partial<LibraryFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }))
  }, [])

  const goHome = useCallback(() => {
    setPhase('home')
    if (savedDirty) {
      setSavedDirty(false)
      setHomeKey((k) => k + 1) // re-measure stats after save/unsave
    }
  }, [savedDirty])

  const goBrowse = useCallback(() => setPhase('browse'), [])
  const goSaved = useCallback(() => setPhase('saved'), [])
  const openResource = useCallback((id: string) => setSelectedId(id), [])
  const markSavedDirty = useCallback(() => setSavedDirty(true), [])

  const savedCount = home?.stats.saved ?? 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6 md:py-8">
      {/* ── section switch (home / browse / saved) ── */}
      <nav className="mb-6 flex flex-wrap items-center gap-1.5" aria-label="Resource hub sections">
        <SectionPill active={phase === 'home'} onClick={goHome} icon={LibraryIcon} label="Discover" />
        <SectionPill active={phase === 'browse'} onClick={goBrowse} icon={Compass} label="Browse" />
        <SectionPill
          active={phase === 'saved'}
          onClick={goSaved}
          icon={Bookmark}
          label={savedCount > 0 ? `Saved · ${savedCount}` : 'Saved'}
        />
      </nav>

      {/* ── phases ── */}
      {phase === 'home' && (
        home === null && (homeStale || homeMeta.state === 'loading') ? (
          <div className="space-y-6" role="status" aria-busy="true">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
              <Skeleton className="h-4 w-80 max-w-full rounded-md" />
              <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
            </div>
            <SectionSkeleton cards={2} />
          </div>
        ) : !home && !homeStale && homeMeta.state === 'error' ? (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
            <h1 className="text-lg font-semibold tracking-tight">The Resource Hub didn&apos;t load</h1>
            <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
              The catalog engine did not respond — it may still be warming up. Nothing is lost; retry below.
            </p>
            <Button variant="outline" className="min-h-11" onClick={() => setHomeKey((k) => k + 1)}>
              Retry
            </Button>
          </div>
        ) : home ? (
          <Reveal index={0}>
            <LibraryHomeScreen
              home={home}
              onSearch={(q) => { updateFilters({ q, page: 1 }); setPhase('browse') }}
              onBrowse={(patch) => { updateFilters(patch); setPhase('browse') }}
              onOpenResource={openResource}
              onOpenTopic={(topicId) => { updateFilters({ topic: topicId, page: 1 }); setPhase('browse') }}
            />
          </Reveal>
        ) : null
      )}

      {phase === 'browse' && (
        <LibraryBrowser
          filters={filters}
          onFilters={updateFilters}
          onOpenResource={openResource}
          subjects={home?.subjects ?? []}
          sources={home?.sources ?? []}
        />
      )}

      {phase === 'saved' && (
        <LibrarySavedScreen onOpenResource={openResource} onSavedToggled={markSavedDirty} />
      )}

      {/* ── detail overlay (the 'detail' state — sits above any phase) ── */}
      <AnimatePresence>
        {selectedId && (
          <LibraryDetailPanel
            key="library-detail"
            resourceId={selectedId}
            onClose={() => setSelectedId(null)}
            onOpenResource={openResource}
            onSavedToggled={markSavedDirty}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── section pill ─────────────────────────────────────────────────────────────

function SectionPill({
  active, onClick, icon: Icon, label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Compass
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
        active
          ? 'border-primary/40 bg-primary/12 text-primary'
          : 'border-line bg-surface-2/60 text-ink-soft hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  )
}
