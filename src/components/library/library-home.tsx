'use client'

// ─── RESOURCE HUB · HOME (PRODUCT 14) ────────────────────────────────────────
// The hub landing: measured stat chips, honest personalisation (only when the
// payload carries a signal — never fabricated), kind/subject/source jumps into
// the browser, and a small featured shelf. Low-clutter by design: sections
// stack, resource cards max out at two columns on desktop.

import { useState } from 'react'
import { ArrowRight, BookMarked, Compass, ExternalLink, Landmark, Search, Sparkles } from 'lucide-react'
import type { LibraryHomePayload, LibraryQuery } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  CardGrid, DisclaimerFootnote, KindIcon, LibraryCard, MicroLabel, Reveal,
  StatChip, kindLabel,
} from './library-shared'

export function LibraryHomeScreen({
  home, onSearch, onBrowse, onOpenResource, onOpenTopic,
}: {
  home: LibraryHomePayload
  onSearch: (q: string) => void
  onBrowse: (patch: Partial<LibraryQuery>) => void
  onOpenResource: (id: string) => void
  onOpenTopic: (topicId: string) => void
}) {
  const [heroQuery, setHeroQuery] = useState('')
  const { stats } = home

  const submitSearch = () => {
    const q = heroQuery.trim()
    if (q) onSearch(q)
  }

  return (
    <div className="space-y-9">
      {/* ── hero ── */}
      <Reveal index={0} className="space-y-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          <BookMarked className="size-3.5 text-primary" aria-hidden /> MEDULA Library
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Resource Hub</h1>
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          Discover <span aria-hidden>→</span> Learn <span aria-hidden>→</span> Compare{' '}
          <span aria-hidden>→</span> Practice <span aria-hidden>→</span> Save — one organised
          ecosystem of platform lessons and hand-curated external resources.
        </p>

        {/* search — explicit, never autofocuses */}
        <form
          role="search"
          className="flex max-w-xl items-center gap-2 pt-1"
          onSubmit={(e) => { e.preventDefault(); submitSearch() }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <Input
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
              placeholder="Search the library — topics, sources, resource types…"
              aria-label="Search the resource hub"
              className="clay-field h-11 pl-9"
              enterKeyHint="search"
            />
          </div>
          <Button type="submit" className="clay-btn h-11 shrink-0" disabled={heroQuery.trim().length === 0}>
            Search
          </Button>
        </form>

        <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
          <StatChip label="platform surfaces" value={stats.platform} icon={Compass} />
          <StatChip label="external curated" value={stats.external} icon={ExternalLink} />
          <StatChip label="verified sources" value={stats.verifiedExternal} icon={Sparkles} />
          <StatChip label="saved" value={stats.saved} icon={BookMarked} />
        </div>
      </Reveal>

      {/* ── for you — only when the payload carries a real signal ── */}
      {home.forYou ? (
        <Reveal index={1}>
          <section className="space-y-3" aria-label="For you">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicroLabel>For you</MicroLabel>
              <p className="text-[11px] font-medium text-ink-soft">{home.forYou.reason}</p>
            </div>
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
                {home.forYou.basis.weakConcepts} weak concepts
              </span>
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
                {home.forYou.basis.dueRevision} due revision
              </span>
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
                {home.forYou.basis.recentTopics} recent topics
              </span>
            </p>
            <CardGrid>
              {home.forYou.resources.slice(0, 4).map((r) => (
                <LibraryCard key={r.id} resource={r} onOpen={onOpenResource} reasonTag={r.reasonTag} />
              ))}
            </CardGrid>
          </section>
        </Reveal>
      ) : (
        <Reveal index={1}>
          <p
            className={cn(
              'rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs leading-relaxed text-ink-soft',
            )}
            role="note"
          >
            {home.hasSignal
              ? 'Your learning history is in — personalised picks appear here as soon as resources match it. Search and filters below always work.'
              : 'Search and filters below — personalisation appears once you have learning history.'}
          </p>
        </Reveal>
      )}

      {/* ── browse by kind ── */}
      {home.kinds.length > 0 && (
        <Reveal index={2}>
          <section className="space-y-3" aria-label="Browse by resource type">
            <MicroLabel>Every kind of resource</MicroLabel>
            <div className="flex flex-wrap gap-2">
              {home.kinds.map(({ kind, count }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onBrowse({ kind })}
                  aria-label={`Browse ${kindLabel(kind)} — ${count} resources`}
                  className="clay clay-hover flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-medium outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
                >
                  <KindIcon kind={kind} />
                  {kindLabel(kind)}
                  <span className="text-xs font-bold tabular-nums text-ink-soft">{count}</span>
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── top subjects ── */}
      {home.subjects.length > 0 && (
        <Reveal index={3}>
          <section className="space-y-3" aria-label="Browse by subject">
            <MicroLabel>Top subjects</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {home.subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onBrowse({ subject: s.id })}
                  aria-label={`Browse ${s.name} — ${s.count} resources`}
                  className="clay clay-hover flex min-h-14 min-w-0 items-center gap-2.5 rounded-xl px-3 text-left outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color || 'var(--primary)' }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-ink-soft">{s.count}</span>
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── verified sources ── */}
      {home.sources.length > 0 && (
        <Reveal index={4}>
          <section className="space-y-3" aria-label="Browse by source">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicroLabel>Sources we index</MicroLabel>
              <span className="text-[10px] text-ink-soft">shield = domain verified in a live session</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {home.sources.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => onBrowse({ source: s.slug })}
                  aria-label={`Browse resources from ${s.name}${s.verified ? ' — domain verified' : ' — verification pending'}`}
                  className={cn(
                    'flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
                    s.verified
                      ? 'border-sev-ok/35 bg-sev-ok/10 text-sev-ok hover:border-sev-ok/60'
                      : 'border-sev-warn/35 bg-sev-warn/10 text-sev-warn hover:border-sev-warn/60',
                  )}
                  title={s.name}
                >
                  <Landmark className="size-3.5 shrink-0" aria-hidden />
                  <span className="max-w-52 truncate">{s.name}</span>
                  <span className="shrink-0 font-bold tabular-nums">{s.count}</span>
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* ── featured ── */}
      {home.featured.length > 0 && (
        <Reveal index={5}>
          <section className="space-y-3" aria-label="Featured resources">
            <MicroLabel>Featured</MicroLabel>
            <CardGrid>
              {home.featured.slice(0, 6).map((r) => (
                <LibraryCard key={r.id} resource={r} onOpen={onOpenResource} />
              ))}
            </CardGrid>
          </section>
        </Reveal>
      )}

      {/* ── studying right now? topic quick-links ── */}
      {home.recentTopics.length > 0 && (
        <Reveal index={6}>
          <section className="space-y-3" aria-label="Resources for topics you study">
            <MicroLabel>Studying right now?</MicroLabel>
            <div className="flex flex-wrap gap-2">
              {home.recentTopics.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTopic(t.id)}
                  aria-label={`Open resources for ${t.name}`}
                  className="clay clay-hover flex min-h-11 max-w-full items-center gap-2 rounded-xl px-3.5 text-left text-sm font-medium outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{t.name}</span>
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                      {t.subjectName}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      <DisclaimerFootnote text={home.disclaimer} />
    </div>
  )
}
