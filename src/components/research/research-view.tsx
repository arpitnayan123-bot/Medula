'use client'

// ─── RESEARCH — the source-first paper hub ──────────────────────────────────
// Real paper metadata via Europe PMC (EBI). Every card links to the original
// source, every number comes from the API response — we render only fields the
// upstream actually returned, and honestly show empty/error states when it
// can't be verified. Nothing here is fabricated.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import {
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  ExternalLink,
  FileText,
  FlaskConical,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { FEATURES } from '@/lib/feature-flags'
import { PageHeader } from '@/components/primitives/kit'
import { NoiseVeil } from '@/components/primitives/aura'
import { Stagger, StaggerItem } from '@/components/primitives/motion'
import { BlobField } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'

// ─── types (mirrors of the API responses) ───────────────────────────────────

interface Paper {
  pmid: string
  pmcid: string | null
  doi: string | null
  title: string
  authors: string
  journal: string
  pubYear: string
  pubDate: string
  abstractText: string
  pubType: string | null
  isOpenAccess: boolean
  citedByCount: number | null
  url: string
  sourceApi: string
  retrievedAt: string
}

interface PapersResponse {
  query: string
  page: number
  filter: string
  sort: string
  journal?: string
  hitCount: number
  papers: Paper[]
}

interface PodResponse {
  date: string
  topic: string
  paper: Paper | null
  note: string
}

interface SavedPaper {
  id: string
  pmid: string
  doi: string | null
  title: string
  journal: string
  pubYear: string
  authors: string
  abstractText: string
  url: string
  source: string
  tags: string[]
  note: string
  savedAt: string
}

type AnyPaper = Paper | SavedPaper

const PAGE_SIZE = 12
const QUERY_MAX = 120

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open access' },
  { id: 'india', label: 'India-affiliated' },
  { id: 'reviews', label: 'Reviews' },
] as const

const SORT_CHIPS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'date', label: 'Newest' },
] as const

// Top reputed journals / colleges — one tap → the latest papers, live from
// Europe PMC. Covers the world's leading journals plus India's best.
const JOURNAL_CHIPS = [
  { id: 'nejm', label: 'NEJM' },
  { id: 'lancet', label: 'The Lancet' },
  { id: 'jama', label: 'JAMA' },
  { id: 'bmj', label: 'BMJ' },
  { id: 'natmed', label: 'Nature Medicine' },
  { id: 'annals', label: 'Ann Intern Med' },
  { id: 'ijmr', label: 'Indian J Med Res' },
  { id: 'japi', label: 'JAPI' },
  { id: 'cochrane', label: 'Cochrane' },
] as const

const PROVENANCE =
  'Metadata & abstracts via Europe PMC (EBI). We link to the original source and never reproduce full papers.'

const EXPLAIN_DISCLAIMER =
  'AI interpretation of the abstract only — verify against the full paper at the original source.'

// ─── markdown styling (same convention as the tutor view) ───────────────────

const MD_COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="mt-3 text-sm font-semibold tracking-tight first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-3 text-sm font-semibold tracking-tight first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-2.5 text-sm font-semibold text-foreground/90 first:mt-0">{children}</h5>,
  h4: ({ children }) => <h6 className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-1.5 text-[13px] leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-4 text-[13px] leading-relaxed marker:text-primary/70">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-relaxed marker:text-primary/70">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="text-ink-soft">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-[13px] italic text-ink-soft">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
}

async function getJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

function formatIst(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── shared bits ────────────────────────────────────────────────────────────

function PaperBadges({ paper }: { paper: Paper }) {
  const isReview = !!paper.pubType && paper.pubType.includes('Review')
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {paper.isOpenAccess && (
        <Badge variant="outline" className="border-sev-ok/40 text-sev-ok">
          OPEN ACCESS
        </Badge>
      )}
      {isReview && <Badge variant="secondary">REVIEW</Badge>}
      {paper.citedByCount !== null && (
        <Badge variant="outline" className="font-normal text-ink-soft">
          cited ×{paper.citedByCount} (Europe PMC)
        </Badge>
      )}
    </div>
  )
}

function PaperByline({ paper }: { paper: AnyPaper }) {
  const line = [paper.journal, paper.pubYear].filter(Boolean).join(' · ')
  return (
    <>
      {paper.authors && <p className="mt-1 truncate text-xs text-ink-soft">{paper.authors}</p>}
      <p className="mt-0.5 text-xs text-ink-soft">
        {line || <span className="italic">Journal/year not stated by Europe PMC</span>}
      </p>
    </>
  )
}

function CardActions({ paper, saved, onToggleSave, onExplain, explainEnabled }: {
  paper: AnyPaper
  saved: boolean
  onToggleSave: (p: AnyPaper) => void
  onExplain?: (p: AnyPaper) => void
  explainEnabled?: boolean
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" className="min-h-11">
        <a href={paper.url} target="_blank" rel="noopener noreferrer" aria-label={`Open the original source of ${paper.title}`}>
          <ExternalLink className="size-4" />
          Original ↗
        </a>
      </Button>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => onToggleSave(paper)}
        aria-pressed={saved}
      >
        {saved ? <BookmarkCheck className="size-4 text-sev-ok" /> : <Bookmark className="size-4" />}
        {saved ? 'Saved' : 'Save'}
      </Button>
      {explainEnabled && onExplain && !!paper.abstractText && (
        <Button variant="outline" className="min-h-11" onClick={() => onExplain(paper)}>
          <Sparkles className="size-4" />
          Explain
        </Button>
      )}
    </div>
  )
}

function PaperCard({ paper, saved, onToggleSave, onExplain, explainEnabled }: {
  paper: Paper
  saved: boolean
  onToggleSave: (p: AnyPaper) => void
  onExplain: (p: AnyPaper) => void
  explainEnabled: boolean
}) {
  return (
    <article className="clay clay-hover rounded-2xl p-4 sm:p-5">
      <h3 className="text-sm font-medium leading-snug sm:text-[15px]">{paper.title}</h3>
      <PaperByline paper={paper} />
      <div className="mt-2">
        <PaperBadges paper={paper} />
      </div>
      <CardActions
        paper={paper}
        saved={saved}
        onToggleSave={onToggleSave}
        onExplain={onExplain}
        explainEnabled={explainEnabled}
      />
    </article>
  )
}

function SavedCard({ paper, onToggleSave }: { paper: SavedPaper; onToggleSave: (p: AnyPaper) => void }) {
  return (
    <article className="clay clay-hover rounded-2xl p-4 sm:p-5">
      <h3 className="text-sm font-medium leading-snug sm:text-[15px]">{paper.title}</h3>
      <PaperByline paper={paper} />
      {(paper.tags.length > 0 || !!paper.note) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {paper.tags.map((t) => (
            <Badge key={t} variant="secondary" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      )}
      {paper.note && (
        <p className="clay-in mt-2 flex items-start gap-1.5 rounded-xl p-2.5 text-xs leading-relaxed text-ink-soft">
          <FileText className="mt-0.5 size-3.5 shrink-0" />
          {paper.note}
        </p>
      )}
      <CardActions paper={paper} saved onToggleSave={onToggleSave} />
    </article>
  )
}

function LoadingCards({ n = 3 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="clay rounded-2xl p-4 sm:p-5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-3 h-3 w-1/3" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      ))}
    </>
  )
}

// ─── main view ──────────────────────────────────────────────────────────────

export function ResearchView({ initialQuery }: { initialQuery?: string }) {
  if (!FEATURES.ENABLE_RESEARCH_HUB) return null
  return <ResearchViewInner initialQuery={initialQuery} />
}

function ResearchViewInner({ initialQuery }: { initialQuery?: string }) {
  const { toast } = useToast()

  // bootstrap straight from props — no effect needed
  const bootQuery = (initialQuery ?? '').trim()
  const [input, setInput] = useState(bootQuery.length >= 2 ? bootQuery.slice(0, QUERY_MAX) : '')
  const [submittedQuery, setSubmittedQuery] = useState(bootQuery.length >= 2 ? bootQuery.slice(0, QUERY_MAX) : '')
  const [nonce, setNonce] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<(typeof FILTER_CHIPS)[number]['id']>('all')
  const [sort, setSort] = useState<(typeof SORT_CHIPS)[number]['id']>('relevance')
  const [journal, setJournal] = useState<string>('')
  const [inputHint, setInputHint] = useState<string | null>(null)

  const [result, setResult] = useState<PapersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState('discover')

  const [pod, setPod] = useState<PodResponse | null>(null)
  const [podLoading, setPodLoading] = useState(false)
  const [podError, setPodError] = useState<string | null>(null)

  const [savedPapers, setSavedPapers] = useState<SavedPaper[]>([])
  const [explainPaper, setExplainPaper] = useState<AnyPaper | null>(null)
  const [explanation, setExplanation] = useState('')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)

  const searchAbort = useRef<AbortController | null>(null)
  const podAbort = useRef<AbortController | null>(null)
  const savedAbort = useRef<AbortController | null>(null)
  const podLoaded = useRef(false)

  useEffect(() => {
    // abort every in-flight request when the view unmounts
    return () => {
      searchAbort.current?.abort()
      podAbort.current?.abort()
      savedAbort.current?.abort()
    }
  }, [])

  const runSearch = useCallback(async (q: string, f: string, s: string, p: number, j: string) => {
    searchAbort.current?.abort()
    const ctrl = new AbortController()
    searchAbort.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ q, page: String(p), filter: f, sort: s })
      if (j) params.set('journal', j)
      const res = await fetch(`/api/research/papers?${params.toString()}`, { signal: ctrl.signal })
      const data = await getJson<PapersResponse & { hint?: string }>(res)
      if (ctrl.signal.aborted) return
      if (!res.ok || !data) {
        setResult(null)
        setError(data?.hint ?? 'Search failed — check your connection and try again.')
      } else {
        setError(null)
        setResult(data)
      }
    } catch (err) {
      if ((err as Error | null)?.name === 'AbortError') return
      if (!ctrl.signal.aborted) {
        setResult(null)
        setError('Europe PMC is unreachable right now — try again shortly.')
      }
    } finally {
      if (searchAbort.current === ctrl) setLoading(false)
    }
  }, [])

  // the single fetcher for the Discover tab: submit, chips, sort, journal and
  // paging all just update state below — this effect does the actual request
  // ('*' is the Europe PMC wildcard used by journal-only feeds)
  useEffect(() => {
    if (submittedQuery.length >= 1) void runSearch(submittedQuery, filter, sort, page, journal)
  }, [submittedQuery, filter, sort, page, journal, nonce, runSearch])

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = input.trim()
    if (q.length < 2) {
      setInputHint('Type at least 2 characters — we search real Europe PMC records.')
      return
    }
    if (q.length > QUERY_MAX) {
      setInputHint(`Keep the query under ${QUERY_MAX} characters.`)
      return
    }
    setInputHint(null)
    setSubmittedQuery(q)
    setPage(1)
    setNonce((n) => n + 1)
  }

  const changeFilter = (f: (typeof FILTER_CHIPS)[number]['id']) => {
    setFilter(f)
    setPage(1)
  }

  const changeSort = (s: (typeof SORT_CHIPS)[number]['id']) => {
    setSort(s)
    setPage(1)
  }

  const changeJournal = (j: string) => {
    setJournal((cur) => (cur === j ? '' : j))
    // switching to a journal feed → newest first reads naturally
    setSort('date')
    setPage(1)
    // no query typed yet → wildcard so the journal feed still runs live
    if (submittedQuery.length < 2) setSubmittedQuery('*')
  }

  const maxPage = result ? Math.min(50, Math.max(1, Math.ceil(result.hitCount / PAGE_SIZE))) : 1

  const retrySearch = () => {
    if (submittedQuery.length >= 2) void runSearch(submittedQuery, filter, sort, page, journal)
  }

  // ── paper of the day (lazy-loaded on first tab open) ──
  const loadPod = useCallback(async () => {
    podAbort.current?.abort()
    const ctrl = new AbortController()
    podAbort.current = ctrl
    setPodLoading(true)
    setPodError(null)
    try {
      const res = await fetch('/api/research/paper-of-day', { signal: ctrl.signal })
      const data = await getJson<PodResponse & { hint?: string }>(res)
      if (ctrl.signal.aborted) return
      if (!res.ok || !data) {
        setPodError(data?.hint ?? "Could not load today's paper — try again shortly.")
      } else {
        setPodError(null)
        setPod(data)
      }
    } catch (err) {
      if ((err as Error | null)?.name === 'AbortError') return
      if (!ctrl.signal.aborted) setPodError('Europe PMC is unreachable right now — try again shortly.')
    } finally {
      if (podAbort.current === ctrl) setPodLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'today' && !podLoaded.current) {
      podLoaded.current = true
      void loadPod()
    }
  }, [tab, loadPod])

  // ── saved papers ──
  const refreshSaved = useCallback(async () => {
    savedAbort.current?.abort()
    const ctrl = new AbortController()
    savedAbort.current = ctrl
    try {
      const res = await fetch('/api/research/saved', { signal: ctrl.signal })
      const data = await getJson<{ papers?: SavedPaper[] }>(res)
      if (!ctrl.signal.aborted && res.ok && data && Array.isArray(data.papers)) {
        setSavedPapers(data.papers)
      }
    } catch {
      /* aborted or offline — keep whatever we already have */
    }
  }, [])

  useEffect(() => {
    void refreshSaved()
  }, [refreshSaved])

  const savedIds = useMemo(() => new Set(savedPapers.map((p) => p.pmid)), [savedPapers])

  const toggleSave = useCallback(
    async (paper: AnyPaper) => {
      const wasSaved = savedIds.has(paper.pmid)

      // optimistic update first — revert via refreshSaved() on failure
      if (wasSaved) {
        setSavedPapers((prev) => prev.filter((p) => p.pmid !== paper.pmid))
      } else {
        const optimistic: SavedPaper = {
          id: `optimistic-${paper.pmid}`,
          pmid: paper.pmid,
          doi: paper.doi ?? null,
          title: paper.title,
          journal: paper.journal,
          pubYear: paper.pubYear,
          authors: paper.authors,
          abstractText: paper.abstractText,
          url: paper.url,
          source: 'EUROPE_PMC',
          tags: [],
          note: '',
          savedAt: new Date().toISOString(),
        }
        setSavedPapers((prev) => [optimistic, ...prev.filter((p) => p.pmid !== paper.pmid)])
      }

      try {
        if (wasSaved) {
          const res = await fetch(`/api/research/saved?pmid=${encodeURIComponent(paper.pmid)}`, {
            method: 'DELETE',
          })
          const data = await getJson<{ deleted?: number }>(res)
          if (!res.ok || !data?.deleted) throw new Error('delete failed')
          toast({ title: 'Removed from saved papers' })
        } else {
          const res = await fetch('/api/research/saved', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              pmid: paper.pmid,
              title: paper.title,
              doi: paper.doi ?? undefined,
              journal: paper.journal,
              pubYear: paper.pubYear,
              authors: paper.authors,
              abstractText: paper.abstractText,
              url: paper.url,
            }),
          })
          const data = await getJson<{ paper?: SavedPaper }>(res)
          if (!res.ok || !data?.paper) throw new Error('save failed')
          const saved = data.paper
          setSavedPapers((prev) => [saved, ...prev.filter((p) => p.pmid !== paper.pmid)])
          toast({ title: 'Paper saved', description: 'Find it anytime in the Saved tab.' })
        }
      } catch {
        void refreshSaved() // authoritative revert
        toast({
          title: 'Could not update saved papers',
          description: 'Check your connection and try again.',
          variant: 'destructive',
        })
      }
    },
    [savedIds, refreshSaved, toast],
  )

  // ── explain dialog ──
  const openExplain = (paper: AnyPaper) => {
    setExplainPaper(paper)
    setExplanation('')
    setGeneratedAt(null)
    setExplainError(null)
  }

  const runExplain = async () => {
    if (!explainPaper) return
    setExplainLoading(true)
    setExplainError(null)
    try {
      const res = await fetch('/api/research/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: explainPaper.title, abstract: explainPaper.abstractText }),
      })
      const data = await getJson<{ explanation?: string; generatedAt?: string; error?: string }>(res)
      if (!res.ok || !data?.explanation) throw new Error(data?.error ?? 'AI_UNAVAILABLE')
      setExplanation(data.explanation)
      setGeneratedAt(data.generatedAt ?? null)
    } catch {
      setExplainError('The AI explainer is unavailable right now — try again shortly.')
    } finally {
      setExplainLoading(false)
    }
  }

  const explainEnabled = FEATURES.ENABLE_PAPER_EXPLAIN

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-4 md:px-6 md:pt-6">
      {/* header (scenery: one soft BlobField wash behind the title) */}
      <header className="relative">
        <BlobField className="opacity-50" />
        <NoiseVeil />
        <div className="relative z-10">
          <PageHeader
            eyebrow={
              <>
                <FlaskConical className="mr-1 inline size-3" />
                Source-first paper hub
              </>
            }
            title="Research"
            intro="Real papers. Real metadata. Always linked to the original source."
          />
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="h-auto w-full grid grid-cols-3">
          <TabsTrigger value="discover" className="min-h-11 px-2 sm:px-4">
            <Search className="size-4" aria-hidden="true" />
            Discover
          </TabsTrigger>
          <TabsTrigger value="today" className="min-h-11 px-2 sm:px-4">
            <CalendarDays className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Paper of the Day</span>
            <span className="sm:hidden">Today</span>
          </TabsTrigger>
          <TabsTrigger value="saved" className="min-h-11 px-2 sm:px-4">
            <Bookmark className="size-4" aria-hidden="true" />
            Saved ({savedPapers.length})
          </TabsTrigger>
        </TabsList>

        {/* ── DISCOVER ── */}
        <TabsContent value="discover" className="mt-4 space-y-4">
          <form onSubmit={submitSearch} role="search" className="clay rounded-2xl p-3 sm:p-4" aria-label="Search papers on Europe PMC">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search real papers — e.g. sepsis biomarkers"
                aria-label="Search papers"
                className="clay-field min-h-11 flex-1"
                maxLength={QUERY_MAX + 20}
              />
              <Button type="submit" className="min-h-11" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
                <span className="hidden sm:inline">Search</span>
              </Button>
            </div>
            {inputHint && (
              <p className="mt-2 text-xs text-sev-crit" role="alert">
                {inputHint}
              </p>
            )}

            {/* Top journals — live feeds from the world's best + India's finest */}
            <div className="mt-3" role="group" aria-label="Top journals (live)">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                Top journals
                <span className="inline-flex items-center gap-1 rounded-full bg-sev-ok/10 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-sev-ok">
                  <span className="size-1.5 animate-pulse rounded-full bg-sev-ok" aria-hidden />
                  live
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {JOURNAL_CHIPS.map((j) => {
                  const active = journal === j.id
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => changeJournal(j.id)}
                      aria-pressed={active}
                      className={cn(
                        'min-h-9 rounded-full border px-3 text-xs font-medium transition-all',
                        active
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-line bg-card/60 text-ink-soft hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {j.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter results">
              {FILTER_CHIPS.map((f) => {
                const active = filter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => changeFilter(f.id)}
                    aria-pressed={active}
                    className={cn(
                      'min-h-11 rounded-xl px-3 text-xs font-medium transition-all',
                      active ? 'clay-in text-foreground' : 'text-ink-soft hover:text-foreground',
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
              <span className="mx-1 hidden w-px self-stretch bg-line sm:block" aria-hidden="true" />
              <div className="flex gap-1.5" role="group" aria-label="Sort results">
                {SORT_CHIPS.map((s) => {
                  const active = sort === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => changeSort(s.id)}
                      aria-pressed={active}
                      className={cn(
                        'min-h-11 rounded-xl px-3 text-xs font-medium transition-all',
                        active ? 'clay-in text-foreground' : 'text-ink-soft hover:text-foreground',
                      )}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </form>

          {/* result meta line */}
          {result && !loading && !error && (
            <p className="text-xs text-ink-soft" aria-live="polite">
              {result.journal ? 'Live journal feed' : 'Europe PMC'} ·{' '}
              {result.hitCount.toLocaleString('en-IN')} results · showing {result.papers.length} ·
              page {result.page} of {maxPage}
            </p>
          )}

          {/* loading */}
          {loading && <LoadingCards />}

          {/* error */}
          {!loading && error && (
            <div className="clay rounded-2xl p-5 text-center" role="alert">
              <p className="text-sm text-ink-soft">{error}</p>
              <p className="mt-1 text-[11px] text-ink-soft">
                We never show placeholder papers — if Europe PMC can&apos;t be reached, we say so.
              </p>
              <Button variant="outline" className="min-h-11 mt-3" onClick={retrySearch}>
                <RefreshCcw className="size-4" />
                Retry
              </Button>
            </div>
          )}

          {/* empty */}
          {!loading && !error && result && result.papers.length === 0 && (
            <div className="clay rounded-2xl p-6 text-center">
              <FlaskConical className="mx-auto size-6 text-ink-soft" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">No papers found for this query — try a broader term.</p>
              <p className="mt-1 text-xs text-ink-soft">
                We only show what Europe PMC returns; we never fabricate results.
              </p>
            </div>
          )}

          {/* results */}
          {!loading && !error && result && result.papers.length > 0 && (
            <Stagger className="space-y-3">
              {result.papers.map((paper) => (
                <StaggerItem key={paper.pmid}>
                  <PaperCard
                    paper={paper}
                    saved={savedIds.has(paper.pmid)}
                    onToggleSave={(p) => void toggleSave(p)}
                    onExplain={openExplain}
                    explainEnabled={explainEnabled}
                  />
                </StaggerItem>
              ))}

              {/* pagination */}
              {maxPage > 1 && (
                <StaggerItem>
                <nav className="flex items-center justify-between gap-3 pt-1" aria-label="Search result pages">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </Button>
                  <span className="text-xs text-ink-soft">
                    page {page} / {maxPage}
                  </span>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={page >= maxPage}
                    onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                  >
                    Next →
                  </Button>
                </nav>
                </StaggerItem>
              )}
            </Stagger>
          )}
        </TabsContent>

        {/* ── PAPER OF THE DAY ── */}
        <TabsContent value="today" className="mt-4">
          {podLoading && (
            <div className="clay rounded-2xl p-5 sm:p-6">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-3 h-5 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-4 h-24 w-full" />
            </div>
          )}

          {!podLoading && podError && (
            <div className="clay rounded-2xl p-5 text-center" role="alert">
              <p className="text-sm text-ink-soft">{podError}</p>
              <Button variant="outline" className="min-h-11 mt-3" onClick={() => void loadPod()}>
                <RefreshCcw className="size-4" />
                Retry
              </Button>
            </div>
          )}

          {!podLoading && !podError && pod && !pod.paper && (
            <div className="clay rounded-2xl p-6 text-center">
              <CalendarDays className="mx-auto size-6 text-ink-soft" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">
                Europe PMC returned no open-access paper for today&apos;s topic ({pod.topic}).
              </p>
              <p className="mt-1 text-xs text-ink-soft">We never fabricate a stand-in — check back tomorrow.</p>
            </div>
          )}

          {!podLoading && !podError && pod?.paper && (
            <article className="clay clay-hover rounded-3xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  {pod.date} · IST
                </span>
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Sparkles className="size-3" aria-hidden="true" />
                  {pod.topic}
                </Badge>
              </div>

              <h2 className="mt-3 text-base font-semibold leading-snug sm:text-lg">{pod.paper.title}</h2>
              <PaperByline paper={pod.paper} />
              <div className="mt-2">
                <PaperBadges paper={pod.paper} />
              </div>

              {pod.paper.abstractText ? (
                <div className="clay-in med-scroll mt-3 max-h-64 overflow-y-auto rounded-xl p-3 text-sm leading-relaxed">
                  {pod.paper.abstractText}
                </div>
              ) : (
                <p className="clay-in mt-3 rounded-xl p-3 text-xs italic text-ink-soft">
                  No abstract text was returned by Europe PMC.
                </p>
              )}

              <CardActions
                paper={pod.paper}
                saved={savedIds.has(pod.paper.pmid)}
                onToggleSave={(p) => void toggleSave(p)}
                onExplain={openExplain}
                explainEnabled={explainEnabled}
              />

              <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">{pod.note}</p>
            </article>
          )}
        </TabsContent>

        {/* ── SAVED ── */}
        <TabsContent value="saved" className="mt-4 space-y-3">
          {savedPapers.length === 0 ? (
            <div className="clay rounded-2xl p-6 text-center">
              <Bookmark className="mx-auto size-6 text-ink-soft" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Nothing saved yet — save papers as you discover them.</p>
            </div>
          ) : (
            <Stagger className="space-y-3">
              {savedPapers.map((paper) => (
                <StaggerItem key={paper.id}>
                  <SavedCard paper={paper} onToggleSave={(p) => void toggleSave(p)} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </TabsContent>
      </Tabs>

      {/* provenance */}
      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {PROVENANCE}
      </p>

      {/* explain dialog */}
      <Dialog open={!!explainPaper} onOpenChange={(open) => { if (!open) setExplainPaper(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-left text-base leading-snug">Explain this abstract</DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed">
              {explainPaper?.title}
            </DialogDescription>
          </DialogHeader>

          {explainPaper && (
            <div className="space-y-3">
              <div className="clay-in med-scroll max-h-48 overflow-y-auto rounded-xl p-3 text-xs leading-relaxed text-ink-soft">
                {explainPaper.abstractText || 'No abstract text available.'}
              </div>

              {explanation && (
                <div className="rounded-xl border border-line p-3">
                  <Markdown components={MD_COMPONENTS}>{explanation}</Markdown>
                </div>
              )}

              {explainLoading && (
                <p className="flex items-center gap-2 text-sm text-ink-soft" aria-live="polite">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Reading the abstract carefully…
                </p>
              )}

              {explainError && (
                <p className="text-xs text-sev-crit" role="alert">
                  {explainError}
                </p>
              )}

              <Button
                className="min-h-11 w-full"
                onClick={() => void runExplain()}
                disabled={explainLoading || !explainPaper.abstractText}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {explanation ? 'Re-explain' : 'Explain this abstract'}
              </Button>

              <p className="text-[11px] leading-relaxed text-ink-soft">
                <TriangleAlert className="mr-1 inline size-3 text-sev-warn" aria-hidden />
                {EXPLAIN_DISCLAIMER}
                {generatedAt ? ` Generated ${formatIst(generatedAt)} IST.` : ''}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
