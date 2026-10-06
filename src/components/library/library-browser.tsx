'use client'

// ─── RESOURCE HUB · BROWSER (PRODUCT 14) ─────────────────────────────────────
// Sticky, low-clutter filter bar (search + Filters dialog + sort) over a
// paginated card grid. A bare topic filter switches to the curated topic
// feed (platform / external split) from /api/library/for-topic — adding any
// other filter narrows through the generic /api/library/resources query.
// Every trust badge (ownership, access, license, verification) comes from
// the frozen contract — nothing is invented client-side.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react'
import type {
  LibraryResourcesPayload, LibraryTopicFeedPayload, LibraryQuery,
  ResourceAccess, ResourceKind,
} from '@/lib/types'
import { RESOURCE_KIND_META } from '@/lib/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  CardGrid, DisclaimerFootnote, LibraryCard, MicroLabel, Reveal,
} from './library-shared'

export type LibraryFilters = Omit<LibraryQuery, 'page'> & { page: number }

type LoadState = 'loading' | 'ready' | 'error'

export interface SubjectOption { id: string; name: string; color?: string }
export interface SourceOption { slug: string; name: string; verified: boolean }

const DIFFICULTY_OPTIONS: { value: '1' | '2' | '3'; label: string }[] = [
  { value: '1', label: 'Foundational' },
  { value: '2', label: 'Core' },
  { value: '3', label: 'Advanced' },
]

const EXAM_OPTIONS = [
  { value: 'neetpg', label: 'NEET-PG' },
  { value: 'fmge', label: 'FMGE' },
  { value: 'mbbs', label: 'MBBS' },
]

const ACCESS_OPTIONS: { value: ResourceAccess; label: string }[] = [
  { value: 'PUBLIC', label: 'Free access' },
  { value: 'REGISTRATION', label: 'Free · sign-up' },
  { value: 'PAID', label: 'Paid' },
  { value: 'MIXED', label: 'Partly paid' },
  { value: 'UNKNOWN', label: 'Unknown' },
]

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'recent', label: 'Recently verified' },
]

const ALL = '__all__'

// A bare topic filter (nothing else active) renders the curated topic feed.
function isFeedFilters(f: LibraryFilters): boolean {
  return !!f.topic && !f.q && !f.kind && !f.subject && !f.source &&
    !f.difficulty && !f.exam && !f.ownership && !f.access
}

export function LibraryBrowser({
  filters, onFilters, onOpenResource, subjects, sources, onRetryHome,
}: {
  filters: LibraryFilters
  onFilters: (patch: Partial<LibraryFilters>) => void
  onOpenResource: (id: string) => void
  subjects: SubjectOption[]
  sources: SourceOption[]
  onRetryHome?: () => void
}) {
  const feedMode = isFeedFilters(filters)

  // Results are keyed by the exact request they belong to; staleness is
  // derived at render time, so the fetch effects never call setState
  // synchronously (only their promise callbacks do).
  const [list, setList] = useState<{ key: string; state: LoadState; payload: LibraryResourcesPayload | null }>({
    key: '', state: 'loading', payload: null,
  })
  const [feed, setFeed] = useState<{ key: string; state: LoadState; payload: LibraryTopicFeedPayload | null }>({
    key: '', state: 'loading', payload: null,
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  const filterKey = JSON.stringify(filters)
  const listRequestKey = `${filterKey}|${retryNonce}`
  const feedRequestKey = `${filters.topic ?? ''}|${retryNonce}`

  // ── debounced text search (300ms) ──
  const [searchInput, setSearchInput] = useState(filters.q ?? '')
  const committedQ = filters.q ?? ''
  // External q changes (clear-all, hand-offs) sync the input via render-time
  // state adjustment — no setState-in-effect.
  const [lastQ, setLastQ] = useState(committedQ)
  if (committedQ !== lastQ) {
    setLastQ(committedQ)
    setSearchInput(committedQ)
  }
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim()
      if (next !== committedQ) onFilters({ q: next || undefined, page: 1 })
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput, committedQ, onFilters])

  // ── topic feed (banner identity + curated split) ──
  useEffect(() => {
    if (!filters.topic) return
    let alive = true
    api.libraryTopicFeed(filters.topic).then(
      (p) => { if (alive) setFeed({ key: feedRequestKey, state: 'ready', payload: p }) },
      () => { if (alive) setFeed({ key: feedRequestKey, state: 'error', payload: null }) },
    )
    return () => { alive = false }
  }, [filters.topic, feedRequestKey])

  // ── generic filtered results ──
  useEffect(() => {
    if (feedMode) return
    let alive = true
    const f = JSON.parse(filterKey) as LibraryFilters
    api.libraryResources({
      q: f.q || undefined,
      subject: f.subject,
      topic: f.topic,
      kind: f.kind,
      source: f.source,
      difficulty: f.difficulty,
      exam: f.exam,
      ownership: f.ownership,
      access: f.access,
      sort: f.sort,
      page: f.page,
    }).then(
      (p) => { if (alive) setList({ key: listRequestKey, state: 'ready', payload: p }) },
      () => { if (alive) setList({ key: listRequestKey, state: 'error', payload: null }) },
    )
    return () => { alive = false }
  }, [filterKey, listRequestKey, feedMode])

  const listStale = list.key !== listRequestKey
  const feedStale = feed.key !== feedRequestKey
  const feedReady = filters.topic != null && !feedStale && feed.state === 'ready' && feed.payload !== null

  const activeCount = useMemo(() => ([
    filters.kind, filters.subject, filters.source, filters.difficulty,
    filters.exam, filters.ownership, filters.access,
  ].filter(Boolean).length), [filters])

  const subjectName = (id?: string) => (id ? subjects.find((s) => s.id === id)?.name ?? id : 'Subject')
  const sourceName = (slug?: string) => (slug ? sources.find((s) => s.slug === slug)?.name ?? slug : 'Source')

  const retry = () => setRetryNonce((n) => n + 1)

  const kindName = (v?: string) =>
    (Object.keys(RESOURCE_KIND_META) as ResourceKind[]).find((k) => k === v)
      ? RESOURCE_KIND_META[v as ResourceKind].label
      : v

  return (
    <div className="space-y-5">
      {/* ── sticky filter bar ── */}
      <div className="glass-strong sticky top-14 z-20 -mx-4 rounded-b-2xl border-b border-line px-4 py-2.5 md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search titles, subjects, sources…"
              aria-label="Search resources"
              className="clay-field h-11 pl-9"
              enterKeyHint="search"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className="clay-btn-soft h-11 shrink-0 gap-1.5"
            aria-label={`Open filters${activeCount > 0 ? ` — ${activeCount} active` : ''}`}
          >
            <Filter className="size-4" aria-hidden />
            <span className="hidden sm:inline">Filters</span>
            {activeCount > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </Button>
          <Select
            value={filters.sort ?? 'relevance'}
            onValueChange={(v) => onFilters({ sort: v === 'relevance' ? undefined : (v as LibraryQuery['sort']), page: 1 })}
          >
            <SelectTrigger
              aria-label="Sort results"
              className="h-11 w-28 shrink-0 sm:w-40 [&>span]:min-w-0 [&>span]:truncate"
              title="Sort results"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── topic banner (whenever a topic filter is on) ── */}
      {filters.topic && (
        <div className="clay flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl p-4" role="note">
          <div className="min-w-0 flex-1">
            {feedReady && feed.payload ? (
              <>
                <p className="truncate text-sm font-semibold">{feed.payload.topic.name}</p>
                <p className="truncate text-[11px] font-medium text-ink-soft">
                  {feed.payload.topic.subjectName}
                  {feed.payload.topic.system ? ` · ${feed.payload.topic.system}` : ''}
                  {feedMode ? ` · ${feed.payload.total} resources` : ''}
                </p>
              </>
            ) : !feedStale && feed.state === 'error' ? (
              <p className="truncate text-sm font-semibold">Topic {filters.topic}</p>
            ) : (
              <Skeleton className="h-9 w-52 max-w-full rounded-md" />
            )}
          </div>
          {!feedStale && feed.state === 'error' && (
            <Button variant="outline" className="min-h-11" onClick={retry}>
              Retry
            </Button>
          )}
          <Button
            variant="ghost"
            className="min-h-11 shrink-0 gap-1.5 text-ink-soft"
            onClick={() => onFilters({ topic: undefined, page: 1 })}
          >
            <X className="size-4" aria-hidden /> Clear topic
          </Button>
        </div>
      )}

      {/* ── results ── */}
      {feedMode ? (
        /* ── curated topic feed: platform / external split ── */
        feedStale || feed.state === 'loading' ? (
          <SectionLoading />
        ) : feed.state === 'error' || !feed.payload ? (
          <ErrorCard hint="The topic feed did not respond. Nothing is lost — try again." onRetry={retry} />
        ) : (
          <FeedResults feed={feed.payload} onOpenResource={onOpenResource} onClearTopic={() => onFilters({ topic: undefined, page: 1 })} />
        )
      ) : listStale || (list.state === 'loading') ? (
        <SectionLoading />
      ) : list.state === 'error' || !list.payload ? (
        <ErrorCard
          hint="The catalog did not respond. Nothing is lost — try again."
          onRetry={retry}
          extraHint={onRetryHome ? 'If this keeps failing, the hub itself may be offline.' : undefined}
        />
      ) : list.payload.resources.length === 0 ? (
        <EmptyState
          onClear={() => onFilters({
            q: undefined, kind: undefined, subject: undefined, source: undefined,
            difficulty: undefined, exam: undefined, ownership: undefined, access: undefined, page: 1,
          })}
        />
      ) : (
        <ListResults
          payload={list.payload}
          hasFilters={activeCount > 0 || !!filters.q}
          onOpenResource={onOpenResource}
          onPage={(page) => onFilters({ page })}
        />
      )}

      {/* ── filters dialog (all sizes — compact + scrollable) ── */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" role="dialog">
          <DialogHeader>
            <DialogTitle>Filter the library</DialogTitle>
            <DialogDescription>
              Narrow by type, subject, source, difficulty, exam, ownership or access. Filters combine.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FilterSelect
              label="Resource type"
              value={filters.kind ?? ALL}
              onChange={(v) => onFilters({ kind: v === ALL ? undefined : v, page: 1 })}
              options={(Object.keys(RESOURCE_KIND_META) as ResourceKind[]).map((k) => ({ value: k, label: RESOURCE_KIND_META[k].label }))}
            />
            {subjects.length > 0 && (
              <FilterSelect
                label="Subject"
                value={filters.subject ?? ALL}
                onChange={(v) => onFilters({ subject: v === ALL ? undefined : v, page: 1 })}
                options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              />
            )}
            {sources.length > 0 && (
              <FilterSelect
                label="Source"
                value={filters.source ?? ALL}
                onChange={(v) => onFilters({ source: v === ALL ? undefined : v, page: 1 })}
                options={sources.map((s) => ({ value: s.slug, label: s.name }))}
              />
            )}
            <FilterSelect
              label="Difficulty"
              value={filters.difficulty != null ? String(filters.difficulty) : ALL}
              onChange={(v) => onFilters({ difficulty: v === ALL ? undefined : (Number(v) as 1 | 2 | 3), page: 1 })}
              options={DIFFICULTY_OPTIONS}
            />
            <FilterSelect
              label="Exam"
              value={filters.exam ?? ALL}
              onChange={(v) => onFilters({ exam: v === ALL ? undefined : v, page: 1 })}
              options={EXAM_OPTIONS}
            />
            <FilterSelect
              label="Ownership"
              value={filters.ownership ?? ALL}
              onChange={(v) => onFilters({ ownership: v === ALL ? undefined : (v as 'platform' | 'external'), page: 1 })}
              options={[
                { value: 'platform', label: 'Platform-owned' },
                { value: 'external', label: 'External (link-out)' },
              ]}
            />
            <FilterSelect
              label="Access"
              value={filters.access ?? ALL}
              onChange={(v) => onFilters({ access: v === ALL ? undefined : (v as ResourceAccess), page: 1 })}
              options={ACCESS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => onFilters({
                kind: undefined, subject: undefined, source: undefined, difficulty: undefined,
                exam: undefined, ownership: undefined, access: undefined, page: 1,
              })}
              disabled={activeCount === 0}
            >
              Clear all
            </Button>
            <Button className="clay-btn min-h-11" onClick={() => setFiltersOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── active filter chips (below the sticky bar, in flow) ── */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {filters.kind && <Chip label={kindName(filters.kind) ?? filters.kind} onClear={() => onFilters({ kind: undefined, page: 1 })} />}
          {filters.subject && <Chip label={subjectName(filters.subject)} onClear={() => onFilters({ subject: undefined, page: 1 })} />}
          {filters.source && <Chip label={sourceName(filters.source)} onClear={() => onFilters({ source: undefined, page: 1 })} />}
          {filters.difficulty != null && (
            <Chip
              label={DIFFICULTY_OPTIONS.find((d) => String(d.value) === String(filters.difficulty))?.label ?? `Level ${filters.difficulty}`}
              onClear={() => onFilters({ difficulty: undefined, page: 1 })}
            />
          )}
          {filters.exam && <Chip label={EXAM_OPTIONS.find((e) => e.value === filters.exam)?.label ?? filters.exam} onClear={() => onFilters({ exam: undefined, page: 1 })} />}
          {filters.ownership && <Chip label={filters.ownership === 'platform' ? 'Platform' : 'External'} onClear={() => onFilters({ ownership: undefined, page: 1 })} />}
          {filters.access && <Chip label={ACCESS_OPTIONS.find((a) => a.value === filters.access)?.label ?? filters.access} onClear={() => onFilters({ access: undefined, page: 1 })} />}
          <button
            type="button"
            onClick={() => onFilters({
              kind: undefined, subject: undefined, source: undefined, difficulty: undefined,
              exam: undefined, ownership: undefined, access: undefined, page: 1,
            })}
            className="min-h-11 rounded-full px-2 text-[11px] font-semibold text-ink-soft underline-offset-2 outline-none ring-primary/50 hover:text-foreground hover:underline focus-visible:ring-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

// ── result renderers ─────────────────────────────────────────────────────────

function FeedResults({
  feed, onOpenResource, onClearTopic,
}: {
  feed: LibraryTopicFeedPayload
  onOpenResource: (id: string) => void
  onClearTopic: () => void
}) {
  if (feed.platform.length === 0 && feed.external.length === 0) {
    return <EmptyState onClear={onClearTopic} clearLabel="Clear topic" />
  }
  return (
    <div className="space-y-7">
      {feed.platform.length > 0 && (
        <Reveal index={0}>
          <section className="space-y-3" aria-label={`Platform resources for ${feed.topic.name}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicroLabel>Platform — practice where you are</MicroLabel>
              <span className="text-[10px] font-semibold tabular-nums text-ink-soft">{feed.platform.length}</span>
            </div>
            <CardGrid>
              {feed.platform.map((r) => <LibraryCard key={r.id} resource={r} onOpen={onOpenResource} />)}
            </CardGrid>
          </section>
        </Reveal>
      )}
      {feed.external.length > 0 && (
        <Reveal index={1}>
          <section className="space-y-3" aria-label={`External resources for ${feed.topic.name}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicroLabel>External — curated, metadata + link-out</MicroLabel>
              <span className="text-[10px] font-semibold tabular-nums text-ink-soft">{feed.external.length}</span>
            </div>
            <CardGrid>
              {feed.external.map((r) => <LibraryCard key={r.id} resource={r} onOpen={onOpenResource} />)}
            </CardGrid>
          </section>
        </Reveal>
      )}
      <p className="text-[11px] text-ink-soft">
        Want to narrow further? Add a type, difficulty or source filter — they combine with this topic.
      </p>
      <DisclaimerFootnote text={feed.disclaimer} />
    </div>
  )
}

function ListResults({
  payload, hasFilters, onOpenResource, onPage,
}: {
  payload: LibraryResourcesPayload
  hasFilters: boolean
  onOpenResource: (id: string) => void
  onPage: (page: number) => void
}) {
  return (
    <div className="space-y-5">
      <p className="text-xs font-medium text-ink-soft" role="status">
        {hasFilters
          ? `${payload.total} ${payload.total === 1 ? 'resource matches' : 'resources match'} your filters`
          : `${payload.total} ${payload.total === 1 ? 'resource' : 'resources'} in the catalog`}
      </p>
      <CardGrid>
        {payload.resources.map((r, i) => (
          <Reveal key={r.id} index={Math.min(i, 5)}>
            <LibraryCard resource={r} onOpen={onOpenResource} />
          </Reveal>
        ))}
      </CardGrid>
      <Pagination
        total={payload.total}
        page={payload.page}
        pageSize={payload.pageSize}
        onPage={onPage}
      />
      <DisclaimerFootnote text={payload.disclaimer} />
    </div>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="flex min-h-11 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-3 pr-1 text-xs font-semibold text-primary sm:min-h-0 sm:py-0">
      <span className="max-w-48 truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter ${label}`}
        className="grid size-7 shrink-0 place-items-center rounded-full outline-none ring-primary/50 hover:bg-primary/15 focus-visible:ring-2"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="min-w-0">
      <MicroLabel className="mb-1.5">{label}</MicroLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="clay-field h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function Pagination({
  total, page, pageSize, onPage,
}: {
  total: number
  page: number
  pageSize: number
  onPage: (page: number) => void
}) {
  if (total <= 0) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Result pages">
      <Button
        variant="outline"
        className="clay-btn-soft min-h-11 gap-1.5"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeft className="size-4" aria-hidden /> Prev
      </Button>
      <p className="text-xs font-semibold tabular-nums text-ink-soft" aria-live="polite">
        {from}–{to} of {total}
        {pages > 1 && <span className="hidden sm:inline"> · page {page}/{pages}</span>}
      </p>
      <Button
        variant="outline"
        className="clay-btn-soft min-h-11 gap-1.5"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
      >
        Next <ChevronRight className="size-4" aria-hidden />
      </Button>
    </nav>
  )
}

function EmptyState({ onClear, clearLabel = 'Clear all filters' }: { onClear: () => void; clearLabel?: string }) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
      <span className="clay-in grid size-12 place-items-center rounded-2xl" aria-hidden>
        <Search className="size-5 text-ink-soft" />
      </span>
      <h3 className="text-base font-semibold tracking-tight">No resources match</h3>
      <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
        Nothing in the catalog matches this combination — widen the filters or clear them to see everything.
      </p>
      <Button variant="outline" className="min-h-11" onClick={onClear}>{clearLabel}</Button>
    </div>
  )
}

export function ErrorCard({ hint, onRetry, extraHint }: { hint: string; onRetry: () => void; extraHint?: string }) {
  return (
    <div className={cn('glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center')} role="alert">
      <h3 className="text-base font-semibold tracking-tight">The library didn&apos;t load</h3>
      <p className="max-w-sm text-sm leading-relaxed text-ink-soft">{hint}</p>
      {extraHint && <p className="max-w-sm text-xs text-ink-soft">{extraHint}</p>}
      <Button variant="outline" className="min-h-11" onClick={onRetry}>Retry</Button>
    </div>
  )
}

function SectionLoading() {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <Skeleton className="h-5 w-44 max-w-full rounded-md" />
      <CardGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </CardGrid>
    </div>
  )
}
