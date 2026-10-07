'use client'

// ─── MEDICAL KNOWLEDGE GRAPH · ROOT (PRODUCT 08) ───
// «Here is how everything you are learning connects.» Three screens in a
// small state machine: home → hub → path. The underlying graph is complex;
// the UI stays calm — measured stat chips, honest empty states, capped
// lists, and one neighbour at a time. Every number comes from the frozen
// Graph* contract in types.ts; nothing is invented client-side.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookMarked, CircleDashed, CircleHelp, Compass,
  History, Landmark, Layers, Lightbulb, Loader2, Network, RefreshCw, Route, Search,
  Sparkles, Stethoscope, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type {
  GraphExplorePayload, GraphGroupKind, GraphHome, GraphHub, GraphNeighbor,
  GraphPath, GraphPathStage, GraphSearchResult,
} from '@/lib/types'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollReveal, Stagger, StaggerItem } from '@/components/primitives/motion'
import { Aurora } from '@/components/primitives/aura'
import { cn } from '@/lib/utils'
import {
  EASE, GROUP_COLORS, MicroLabel, Minimap, ExplainLinkDialog,
  FeedbackDialog, GroupSection, KindIcon, MasteryDot, MasteryRing, Reveal,
  SCROLL_SLIM, SubjectChip, WhyPathPanel, ExamDots, statusColor,
} from './graph-parts'

type Screen = 'home' | 'hub' | 'path'
type LoadState = 'loading' | 'ready' | 'error'

// ── Recent-hub memory (this device only) ──────────────────────────────────────
const RECENT_KEY = 'medos:graph-recent'
const RECENT_META_KEY = 'medos:graph-recent-meta'
const RECENT_MAX = 6

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const arr = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch { return [] }
}

function readRecentMeta(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const obj = JSON.parse(window.localStorage.getItem(RECENT_META_KEY) ?? '{}')
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {}
  } catch { return {} }
}

function writeRecent(ids: string[], meta: Record<string, string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids))
    window.localStorage.setItem(RECENT_META_KEY, JSON.stringify(meta))
  } catch { /* private mode */ }
}

// ── Group kinds that make a concept path worth following ─────────────────────
const PATH_GROUP_KINDS: GraphGroupKind[] = [
  'prerequisite', 'caused_by', 'causes', 'mechanism', 'manifestation', 'investigation', 'treatment',
]

// ─── Loading / error shells ───────────────────────────────────────────────────

function ScreenSkeleton({ variant }: { variant: 'home' | 'hub' | 'path' }) {
  return (
    <div className="space-y-5" aria-busy="true" role="status">
      <div className="space-y-2">
        <Skeleton className="shimmer h-4 w-40 rounded-md" />
        <Skeleton className="shimmer h-9 w-72 max-w-full rounded-lg" />
        <Skeleton className="shimmer h-4 w-56 max-w-full rounded-md" />
      </div>
      {variant === 'home' && (
        <>
          <Skeleton className="shimmer h-24 w-full rounded-2xl" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="shimmer h-9 w-28 rounded-full" />)}
          </div>
          <Skeleton className="shimmer h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="shimmer h-24 rounded-xl" />)}
          </div>
        </>
      )}
      {variant === 'hub' && (
        <>
          <Skeleton className="shimmer h-44 w-full rounded-2xl" />
          <Skeleton className="shimmer h-28 w-full rounded-2xl" />
          <Skeleton className="shimmer h-64 w-full rounded-2xl" />
        </>
      )}
      {variant === 'path' && (
        <>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="shimmer h-36 w-full rounded-2xl" />)}
        </>
      )}
    </div>
  )
}

function ScreenError({ title, hint, onRetry }: { title: string; hint: string; onRetry: () => void }) {
  return (
    <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
        <RefreshCw className="size-6 text-sev-crit" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="max-w-sm text-sm text-ink-soft">{hint}</p>
      <Button variant="outline" className="min-h-11" onClick={onRetry}>
        <RefreshCw className="size-4" aria-hidden /> Retry
      </Button>
    </div>
  )
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
      <p className="text-base font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink-soft">{label}</p>
    </div>
  )
}

// ─── Search (debounced live results) ──────────────────────────────────────────

function GraphSearch({ onOpenHub, onOpenTopicHub }: { onOpenHub: (id: string, name?: string) => void; onOpenTopicHub: (topicId: string) => void }) {
  const [q, setQ] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [results, setResults] = useState<GraphSearchResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const changeQuery = (v: string) => {
    setQ(v)
    if (v.trim().length < 2) {
      setState('idle')
      setResults(null)
    } else {
      setState('loading')
    }
  }

  const openFirst = () => {
    const first = results?.concepts?.[0]
    if (first) {
      onOpenHub(first.id, first.name)
      changeQuery('')
      inputRef.current?.blur()
    }
  }

  // Debounced live search — state changes happen in event handlers and promise
  // callbacks only (react-hooks/set-state-in-effect).
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      api.graphSearch(query)
        .then((r) => { if (!cancelled) { setResults(r); setState('ready') } })
        .catch(() => { if (!cancelled) setState('error') })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  const hasRows = !!results && (results.concepts.length > 0 || results.topics.length > 0 || results.subjects.length > 0)

  return (
    <div className="clay rounded-2xl p-3">
      <div className="flex min-h-11 items-center gap-2">
        <Search className="ml-1.5 size-4 shrink-0 text-ink-soft" aria-hidden />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => changeQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openFirst()
            if (e.key === 'Escape') { changeQuery(''); inputRef.current?.blur() }
          }}
          placeholder="Search a concept — “heart failure”, “HF”, “anion gap”…"
          aria-label="Search the knowledge graph"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
        />
        {q && (
          <button
            type="button"
            onClick={() => changeQuery('')}
            aria-label="Clear search"
            className="mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {state !== 'idle' && (
        <div className={cn('mt-2 max-h-96 overflow-y-auto rounded-xl border border-line bg-background/70 p-2 pb-1', SCROLL_SLIM)} aria-live="polite">
          {state === 'loading' && (
            <p className="flex items-center gap-2 px-2 py-3 text-xs text-ink-soft" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching the map…
            </p>
          )}
          {state === 'error' && (
            <p className="px-2 py-3 text-xs font-medium text-sev-crit">Search did not respond — check your connection and try again.</p>
          )}
          {state === 'ready' && !hasRows && (
            <p className="px-2 py-3 text-xs leading-relaxed text-ink-soft">
              No matches for “{q.trim()}” — try a disease, drug, investigation, or a shorthand like “HF” or “AKI”.
            </p>
          )}
          {state === 'ready' && results && results.concepts.length > 0 && (
            <div className="space-y-1">
              <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Concepts</p>
              {results.concepts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onOpenHub(c.id, c.name); changeQuery('') }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                >
                  <MasteryDot mastery={c.mastery} status={c.status} />
                  <KindIcon kind={c.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
                      {c.matchedVia === 'synonym' && c.matchedTerm && (
                        <span className="shrink-0 rounded-full bg-sev-warn/15 px-1.5 py-px text-[9px] font-bold text-sev-warn">matches “{c.matchedTerm}”</span>
                      )}
                      {c.matchedVia === 'summary' && (
                        <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[9px] font-semibold text-ink-soft">in summary</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-soft">{c.summary}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    <SubjectChip name={c.subjectName} color={c.subjectColor} />
                    <span className="rounded-full border border-line bg-surface-2/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-ink-soft">{c.degree} links</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {state === 'ready' && results && results.topics.length > 0 && (
            <div className="mt-1 space-y-1">
              <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Topics</p>
              {results.topics.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onOpenTopicHub(t.id); changeQuery('') }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                >
                  <BookMarked className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
                  <span className="shrink-0 text-[10px] text-ink-soft">{t.subjectName} · {t.conceptCount} concepts</span>
                </button>
              ))}
            </div>
          )}
          {state === 'ready' && results && results.subjects.length > 0 && (
            <div className="mt-1 px-2 pb-1.5">
              <p className="pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Subjects — browse them below</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {results.subjects.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-2 py-1 text-[11px] font-medium">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                    {s.name} · {s.conceptCount}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {state === 'idle' && (
        <p className="mt-2 px-1 text-[11px] leading-snug text-ink-soft">
          Try a shorthand — the map knows “HF”, “MI”, “AKI”, “RAAS”, “STEMI”…
        </p>
      )}
    </div>
  )
}

// ─── Browse by subject (lazy explore per subject) ─────────────────────────────

function SubjectExplorer({
  subjects, onOpenHub, onOpenTopicHub,
}: {
  subjects: GraphHome['subjects']
  onOpenHub: (id: string, name?: string) => void
  onOpenTopicHub: (topicId: string) => void
}) {
  const [cache, setCache] = useState<Record<string, GraphExplorePayload | 'error'>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const inflight = useRef<Record<string, boolean>>({})

  const load = useCallback((code: string) => {
    if (inflight.current[code]) return
    inflight.current[code] = true
    setLoading((l) => ({ ...l, [code]: true }))
    api.graphExplore(code)
      .then((p) => setCache((c) => ({ ...c, [code]: p })))
      .catch(() => setCache((c) => ({ ...c, [code]: 'error' })))
      .finally(() => {
        inflight.current[code] = false
        setLoading((l) => ({ ...l, [code]: false }))
      })
  }, [])

  return (
    <Accordion type="multiple" className="space-y-2" onValueChange={(v) => v.forEach(load)}>
      {subjects.map((s) => (
        <AccordionItem key={s.code} value={s.code} className="clay rounded-xl border border-line px-3">
          <AccordionTrigger className="min-h-11 py-3 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{s.name}</span>
              <span className="flex shrink-0 gap-1">
                <span className="rounded-full border border-line bg-surface-2/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-ink-soft">{s.conceptCount} concepts</span>
                <span className="hidden rounded-full border border-line bg-surface-2/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-ink-soft sm:inline">{s.edgeCount} links</span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-0 pb-3">
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar-track]:bg-transparent">
              {loading[s.code] && !cache[s.code] && (
                <p className="flex items-center gap-2 px-1 py-2 text-xs text-ink-soft" role="status">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Mapping {s.name}…
                </p>
              )}
              {cache[s.code] === 'error' && (
                <div className="flex items-center gap-2 px-1 py-1">
                  <p className="flex-1 text-xs font-medium text-sev-crit">Could not load {s.name}.</p>
                  <Button size="sm" variant="outline" className="min-h-9" onClick={() => load(s.code)}>
                    <RefreshCw className="size-3.5" aria-hidden /> Retry
                  </Button>
                </div>
              )}
              {cache[s.code] && cache[s.code] !== 'error' && (
                (cache[s.code] as GraphExplorePayload).systems.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-ink-soft">No topics seeded for this subject yet.</p>
                ) : (
                  (cache[s.code] as GraphExplorePayload).systems.map((sys) => (
                    <div key={sys.system}>
                      <p className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">{sys.system}</p>
                      <div className="mt-1 space-y-1.5">
                        {sys.topics.map((t) => (
                          <div key={t.id} className="rounded-xl border border-line bg-surface-2/40 p-2">
                            <button
                              type="button"
                              onClick={() => onOpenTopicHub(t.id)}
                              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-1 text-left transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                            >
                              <BookMarked className="size-3.5 shrink-0 text-primary" aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{t.name}</span>
                              <MasteryDot mastery={t.mastery} />
                              <span className="shrink-0 text-[9px] font-bold tabular-nums text-ink-soft">{t.conceptCount}c · {t.edgeCount}l</span>
                            </button>
                            <div className="mt-1 flex flex-wrap gap-1 pl-6">
                              {t.concepts.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => onOpenHub(c.id, c.name)}
                                  title={`${c.name} — ${c.degree} links, mastery ${c.mastery}%`}
                                  className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-line bg-background/70 px-2 py-1 text-[11px] font-medium transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                                >
                                  <MasteryDot mastery={c.mastery} status={c.status} className="size-1.5" />
                                  <span className="min-w-0 truncate">{c.name}</span>
                                  <span className="shrink-0 text-[9px] font-bold tabular-nums text-ink-soft">{c.degree}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

// ─── HOME screen ──────────────────────────────────────────────────────────────

function HomeScreen({
  home, homeState, onRetry, recent, recentMeta, onOpenHub, onOpenTopicHub,
}: {
  home: GraphHome | null
  homeState: LoadState
  onRetry: () => void
  recent: string[]
  recentMeta: Record<string, string>
  onOpenHub: (id: string, name?: string) => void
  onOpenTopicHub: (topicId: string) => void
}) {
  if (homeState === 'loading') return <ScreenSkeleton variant="home" />
  if (homeState === 'error' || !home) {
    return (
      <ScreenError
        title="The graph didn't load"
        hint="The knowledge-graph engine did not respond — it may still be warming up. Nothing is lost; the map is waiting."
        onRetry={onRetry}
      />
    )
  }

  const { stats } = home
  const crossPct = stats.edges > 0 ? Math.round((stats.crossSubject / stats.edges) * 100) : null
  const p = home.personal
  const hasPersonal = p.missingPrerequisites.length > 0 || p.confusionHotspots.length > 0 ||
    p.isolatedWeak.length > 0 || p.strongZones.length > 0
  const recentNamed = recent.filter((id) => recentMeta[id])

  return (
    <div className="space-y-6">
      {/* ── hero ── */}
      <Reveal index={0} className="relative">
        <Aurora intensity={0.6} />
        <div className="relative z-10 space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          <Network className="size-3.5 text-primary" aria-hidden /> Knowledge Graph
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Every concept connects.</h1>
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          Search a concept, see how it links to physiology, drugs, cases and questions.
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <StatChip label="concepts" value={stats.concepts} />
          <StatChip label="connections" value={stats.edges} />
          <StatChip label={crossPct != null ? 'cross-subject' : 'cross-subject links'} value={crossPct != null ? `${crossPct}%` : stats.crossSubject} />
          <StatChip label="questions" value={stats.questions} />
        </div>
        </div>
      </Reveal>

      {/* ── search ── */}
      <Reveal index={1}>
        <GraphSearch onOpenHub={onOpenHub} onOpenTopicHub={onOpenTopicHub} />
      </Reveal>

      {home.insufficientData && (
        <Reveal index={2}>
          <p className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            Personalized strips below appear as you answer questions and revise — the map itself is fully browsable right now.
          </p>
        </Reveal>
      )}

      {/* ── your connections (only sections with data) ── */}
      {hasPersonal && (
        <ScrollReveal>
          <section className="space-y-3" aria-label="Your connections">
            <div className="flex items-center justify-between gap-2">
              <MicroLabel>Your connections</MicroLabel>
              <span className="text-[10px] text-ink-soft">measured from your progress</span>
            </div>

            {p.missingPrerequisites.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-sev-warn">
                  <AlertTriangle className="size-3.5" aria-hidden /> Missing prerequisites
                </p>
                {p.missingPrerequisites.map((m) => (
                  <button
                    key={`${m.fromId}-${m.toId}`}
                    type="button"
                    onClick={() => onOpenHub(m.fromId, m.fromName)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-sev-warn/30 bg-sev-warn/10 p-3 text-left transition-colors hover:border-sev-warn/60 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        Before {m.toName} fully clicks, {m.fromName} is at {m.mastery}%
                      </span>
                      {m.reason && <span className="mt-0.5 block truncate text-[11px] text-ink-soft">{m.reason}</span>}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary">Start there →</span>
                  </button>
                ))}
              </div>
            )}

            {p.confusionHotspots.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-sev-crit">
                  <Sparkles className="size-3.5" aria-hidden /> Confusion hotspots
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {p.confusionHotspots.map((h) => (
                    <button
                      key={h.pairId}
                      type="button"
                      onClick={() => onOpenHub(h.aId, h.aName)}
                      className="flex min-h-11 w-full min-w-0 flex-col items-start gap-0.5 rounded-xl border border-sev-crit/25 bg-sev-crit/5 p-3 text-left transition-colors hover:border-sev-crit/50 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                    >
                      <span className="flex w-full min-w-0 items-center gap-1.5 text-sm font-semibold">
                        <span className="min-w-0 truncate">{h.aName}</span>
                        <span className="shrink-0 text-[10px] font-bold uppercase text-ink-soft">vs</span>
                        <span className="min-w-0 truncate">{h.bName}</span>
                      </span>
                      {h.mnemonic && <span className="max-w-full truncate text-[11px] italic text-ink-soft">mnemonic: {h.mnemonic}</span>}
                      {h.bothWeak && <span className="text-[10px] font-bold uppercase tracking-wider text-sev-crit">both weak for you</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {p.isolatedWeak.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-bold">
                  <CircleDashed className="size-3.5 text-ink-soft" aria-hidden /> Isolated &amp; weak
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {p.isolatedWeak.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => onOpenHub(i.id, i.name)}
                      title={`${i.subjectName} — mastery ${i.mastery}%`}
                      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                    >
                      <MasteryDot mastery={i.mastery} className="size-1.5" />
                      <span className="min-w-0 truncate">{i.name}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-ink-soft">{i.mastery}%</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink-soft">No graph links yet — study these standalone, they are also weak spots.</p>
              </div>
            )}

            {p.strongZones.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-bold text-sev-ok">
                  <Sparkles className="size-3.5" aria-hidden /> Strong zones
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {p.strongZones.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onOpenHub(s.id, s.name)}
                      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-sev-ok/30 bg-sev-ok/10 px-2.5 py-1.5 text-xs font-medium text-sev-ok transition-colors hover:border-sev-ok/60 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="shrink-0 text-[10px] font-bold tabular-nums">{s.mastery}%</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </ScrollReveal>
      )}

      {/* ── recommended today ── */}
      {p.recommendedToday.length > 0 && (
        <ScrollReveal>
          <section className="clay space-y-2.5 rounded-2xl p-4" aria-label="Recommended today">
            <MicroLabel>Recommended today</MicroLabel>
            {p.recommendedToday.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenHub(r.id, r.name)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-surface-2/40 p-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
              >
                <KindIcon kind={r.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  {r.reason && <span className="block truncate text-[11px] text-ink-soft">{r.reason}</span>}
                </span>
                <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
              </button>
            ))}
          </section>
        </ScrollReveal>
      )}

      {/* ── top hubs ── */}
      {home.topHubs.length > 0 && (
        <ScrollReveal className="space-y-2.5">
          <section className="space-y-2.5" aria-label="Top hubs">
            <MicroLabel>Top hubs · busiest crossroads on the map</MicroLabel>
            <Stagger className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {home.topHubs.map((h) => (
                <StaggerItem key={h.id}>
                <button
                  type="button"
                  onClick={() => onOpenHub(h.id, h.name)}
                  className="clay-hover flex min-h-24 w-full flex-col justify-between gap-2 rounded-xl border border-line border-l-[3px] bg-surface-2/40 p-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                  style={{ borderLeftColor: h.subjectColor }}
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <KindIcon kind={h.kind} className="size-3" />
                      <span className="min-w-0 truncate text-sm font-semibold">{h.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-ink-soft">{h.subjectName}</span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-full border border-line bg-background/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-ink-soft">{h.degree} links</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: statusColor(h.status) }}>
                      <MasteryDot mastery={h.mastery} status={h.status} className="size-1.5" />
                      {h.mastery}%
                    </span>
                    {h.questionCount > 0 && <span className="text-[9px] font-bold tabular-nums text-ink-soft">{h.questionCount}Q</span>}
                  </span>
                </button>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </ScrollReveal>
      )}

      {/* ── browse by subject ── */}
      {home.subjects.length > 0 && (
        <ScrollReveal>
          <section className="space-y-2.5" aria-label="Browse by subject">
            <MicroLabel>Browse by subject</MicroLabel>
            <SubjectExplorer subjects={home.subjects} onOpenHub={onOpenHub} onOpenTopicHub={onOpenTopicHub} />
          </section>
        </ScrollReveal>
      )}

      {/* ── recent hubs ── */}
      {recentNamed.length > 0 && (
        <ScrollReveal>
          <section className="space-y-1.5" aria-label="Recently opened hubs">
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
              <History className="size-3.5" aria-hidden /> Recently opened
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentNamed.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenHub(id, recentMeta[id])}
                  className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                >
                  <span className="min-w-0 truncate">{recentMeta[id]}</span>
                </button>
              ))}
            </div>
          </section>
        </ScrollReveal>
      )}
    </div>
  )
}

// ─── HUB screen ───────────────────────────────────────────────────────────────

function Callout({
  tone, icon: Icon, title, sub, actionLabel, onAction,
}: {
  tone: 'warn' | 'crit' | 'ok'
  icon: LucideIcon
  title: string
  sub?: string
  actionLabel?: string
  onAction?: () => void
}) {
  const tones = {
    warn: 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn',
    crit: 'border-sev-crit/35 bg-sev-crit/10 text-sev-crit',
    ok: 'border-sev-ok/35 bg-sev-ok/10 text-sev-ok',
  } as const
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3', tones[tone])}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>{title}</p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-ink-soft">{sub}</p>}
      </div>
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" className="min-h-9 shrink-0 border-line bg-background/70 text-[11px] font-bold" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

const STAGE_ICONS: Record<GraphPathStage, LucideIcon> = {
  why: CircleHelp,
  mechanism: Compass,
  clinical: Stethoscope,
  diagnosis: Lightbulb,
  treatment: Layers,
}

function HubScreen({
  hub, hubState, onRetry, onBack, backLabel, onOpenHub, onOpenTopicHub, onOpenPath,
  onStartMcqs, onStartPyqs, onGoCases, onGoRevise,
}: {
  hub: GraphHub | null
  hubState: LoadState
  onRetry: () => void
  onBack: () => void
  backLabel: string
  onOpenHub: (id: string, name?: string) => void
  onOpenTopicHub: (topicId: string) => void
  onOpenPath: () => void
  onStartMcqs: () => void
  onStartPyqs: () => void
  onGoCases: () => void
  onGoRevise: () => void
}) {
  const [flagTarget, setFlagTarget] = useState<{ fromId: string; neighbor: GraphNeighbor } | null>(null)
  const [explainTarget, setExplainTarget] = useState<{ conceptId: string; neighbor: GraphNeighbor } | null>(null)

  if (hubState === 'loading') return <ScreenSkeleton variant="hub" />
  if (hubState === 'error' || !hub) {
    return (
      <div className="space-y-4">
        <BackRow label={backLabel} onClick={onBack} />
        <ScreenError
          title="This hub didn't load"
          hint="The graph engine did not respond for this concept — it may still be warming up."
          onRetry={onRetry}
        />
      </div>
    )
  }

  const c = hub.concept
  const personal = hub.personal
  const hasPathGroups = hub.groups.some((g) => PATH_GROUP_KINDS.includes(g.kind) && g.items.length > 0)
  const resourceItems = [
    { key: 'mcq', label: 'Practice MCQs', count: hub.questionStats.total, icon: CircleHelp, onClick: onStartMcqs },
    { key: 'pyq', label: 'PYQs', count: hub.questionStats.pyq, icon: Landmark, onClick: onStartPyqs },
    { key: 'case', label: 'Cases', count: hub.caseCount, icon: Stethoscope, onClick: onGoCases },
    { key: 'card', label: 'Flashcards', count: hub.flashcardCount, icon: Layers, onClick: onGoRevise },
  ].filter((r) => r.count > 0)

  return (
    <div className="space-y-6">
      <BackRow label={backLabel} onClick={onBack} />

      {hub.insufficientData && (
        <p className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          Your personal layer here is still warming up — the connections below are real, your percentages fill in as you practise.
        </p>
      )}

      {/* ── header ── */}
      <Reveal index={0}>
        <section className="clay space-y-3 rounded-2xl p-4 md:p-5" aria-label={`${c.name} hub`}>
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10">
              <KindIcon kind={c.kind} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">{c.name}</h1>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                <SubjectChip name={hub.subject.name} color={hub.subject.color} />
                {hub.topic.name && (
                  <button
                    type="button"
                    onClick={() => onOpenTopicHub(hub.topic.id)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface-2/70 px-2 py-0.5 text-[10px] font-medium text-ink-soft transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                  >
                    <BookMarked className="size-3" aria-hidden />
                    <span className="max-w-[180px] truncate">{hub.topic.name}</span>
                  </button>
                )}
              </div>
            </div>
            {hub.mastery ? (
              <MasteryRing score={hub.mastery.score} status={hub.mastery.status} estRecall={hub.mastery.estRecall} />
            ) : (
              <div className="flex w-[96px] shrink-0 flex-col items-center gap-1 text-center">
                <span className="grid size-[60px] place-items-center rounded-full border-2 border-dashed border-line text-lg font-semibold text-ink-soft">—</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">not started</span>
              </div>
            )}
          </div>

          {c.summary && <p className="text-sm leading-relaxed text-ink-soft">{c.summary}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">exam relevance <ExamDots n={c.examRelevance} /></span>
            {hub.mastery?.attemptCount ? <span>{hub.mastery.attemptCount} attempts logged</span> : null}
            {hub.mastery?.lastReviewed ? <span>last reviewed {new Date(hub.mastery.lastReviewed).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span> : null}
          </div>

          {c.whyMatters && (
            <blockquote className="rounded-xl border-l-[3px] border-primary/50 bg-primary/5 px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Why this matters</p>
              <p className="mt-1 text-sm leading-relaxed">{c.whyMatters}</p>
            </blockquote>
          )}

          {c.mnemonic && (
            <p className="flex items-start gap-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-3.5 py-2.5 text-sm leading-relaxed">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-sev-warn" aria-hidden />
              <span><span className="font-bold">Mnemonic — </span>{c.mnemonic}</span>
            </p>
          )}
        </section>
      </Reveal>

      {/* ── related knowledge (personal callouts first, then server-ordered groups) ── */}
      <ScrollReveal>
        <section className="space-y-4" aria-label="Related knowledge">
          <MicroLabel>Related knowledge</MicroLabel>

          {personal.missingPrerequisites.length > 0 && (
            <div className="space-y-2">
              {personal.missingPrerequisites.map((m) => (
                <Callout
                  key={m.id}
                  tone="warn"
                  icon={AlertTriangle}
                  title={`Prerequisite gap: ${m.name} sits at ${m.mastery}% — it explains this concept. Start there.`}
                  sub={m.reason}
                  actionLabel="Open →"
                  onAction={() => onOpenHub(m.id, m.name)}
                />
              ))}
            </div>
          )}

          {personal.repeatedConfusion.length > 0 && (
            <div className="space-y-2">
              {personal.repeatedConfusion.map((r) => (
                <Callout
                  key={r.otherId}
                  tone="crit"
                  icon={AlertTriangle}
                  title={`${r.otherName} — you have missed this ${r.wrongCount}×. Learn the difference.`}
                  sub={r.reason}
                  actionLabel="Compare →"
                  onAction={() => onOpenHub(r.otherId, r.otherName)}
                />
              ))}
            </div>
          )}

          {personal.weakNeighbors.length > 0 && (
            <div className="rounded-xl border border-sev-warn/30 bg-sev-warn/5 p-3">
              <p className="text-xs font-bold text-sev-warn">Weak neighbours — tighten these first</p>
              <div className="mt-1.5 space-y-1">
                {personal.weakNeighbors.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onOpenHub(w.id, w.name)}
                    className="flex min-h-9 w-full items-center gap-2 rounded-lg px-1 text-left transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                  >
                    <MasteryDot mastery={w.mastery} className="size-1.5" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{w.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-ink-soft">{w.mastery}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {personal.strongZones.length > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-sev-ok/30 bg-sev-ok/10 px-3.5 py-2.5 text-xs font-medium text-sev-ok">
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              Strong foundations: {personal.strongZones.map((s) => s.name).join(', ')} — they anchor this concept.
            </p>
          )}

          {hub.groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
              No connections seeded for this concept yet — it&apos;s on the map, but its edges haven&apos;t been drawn.
            </p>
          ) : (
            <div className="space-y-5">
              {hub.groups.map((g) => (
                <GroupSection
                  key={g.kind}
                  group={g}
                  onOpen={(id, name) => onOpenHub(id, name)}
                  onExplain={(n) => setExplainTarget({ conceptId: c.id, neighbor: n })}
                  onFlag={(n) => setFlagTarget({ fromId: c.id, neighbor: n })}
                />
              ))}
              <p className="text-[10px] text-ink-soft">
                Something look off? Use the little flag on any link — a reviewer checks it.
              </p>
            </div>
          )}
        </section>
      </ScrollReveal>

      {/* ── minimap ── */}
      {hub.minimap.nodes.length > 0 && (
        <ScrollReveal>
          <section className="clay rounded-2xl p-4" aria-label="Neighbourhood map">
            <MicroLabel>The neighbourhood at a glance</MicroLabel>
            <div className="mt-1">
              <Minimap data={hub.minimap} onOpen={(id, name) => onOpenHub(id, name)} />
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {Array.from(new Set(hub.minimap.nodes.map((n) => n.group))).map((gk) => (
                <span key={gk} className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-ink-soft">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[gk] }} aria-hidden />
                  {gk.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* ── knowledge path CTA ── */}
      {hasPathGroups && (
        <ScrollReveal>
          <button
            type="button"
            onClick={onOpenPath}
            className="clay-hover flex min-h-11 w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10">
              <Route className="size-5 text-primary" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Follow the path</span>
              <span className="block truncate text-[11px] text-ink-soft">Why? → Mechanism → Clinical effect → Diagnosis → Treatment</span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-primary" aria-hidden />
          </button>
        </ScrollReveal>
      )}

      {/* ── resources (measured counts only) ── */}
      {(resourceItems.length > 0 || hub.topic.id) && (
        <ScrollReveal>
          <section className="clay space-y-2.5 rounded-2xl p-4" aria-label="Practice this concept elsewhere">
            <MicroLabel>Put it to work</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {resourceItems.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={r.onClick}
                  className="clay-hover flex min-h-16 flex-col justify-center gap-0.5 rounded-xl border border-line bg-surface-2/40 p-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                >
                  <span className="flex items-center gap-1.5 text-base font-semibold tabular-nums">
                    <r.icon className="size-4 text-primary" aria-hidden /> {r.count}
                  </span>
                  <span className="truncate text-[11px] text-ink-soft">{r.label}</span>
                </button>
              ))}
              {hub.topic.id && (
                <button
                  type="button"
                  onClick={() => onOpenTopicHub(hub.topic.id)}
                  className="clay-hover flex min-h-16 flex-col justify-center gap-0.5 rounded-xl border border-line bg-surface-2/40 p-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <BookMarked className="size-4 text-primary" aria-hidden /> Topic Hub
                  </span>
                  <span className="truncate text-[11px] text-ink-soft">Study {hub.topic.name}</span>
                </button>
              )}
            </div>
          </section>
        </ScrollReveal>
      )}

      {/* ── AI panel ── */}
      <ScrollReveal>
        <WhyPathPanel conceptId={c.id} triggerLabel="Why does this happen?" />
      </ScrollReveal>

      <FeedbackDialog key={flagTarget ? flagTarget.neighbor.id : 'fb-closed'} target={flagTarget} onClose={() => setFlagTarget(null)} />
      <ExplainLinkDialog key={explainTarget ? explainTarget.neighbor.id : 'ex-closed'} target={explainTarget} onClose={() => setExplainTarget(null)} />
    </div>
  )
}

function BackRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" className="-ml-2 min-h-11 gap-1.5 text-ink-soft" onClick={onClick}>
      <ArrowLeft className="size-4" aria-hidden /> {label}
    </Button>
  )
}

// ─── PATH screen ──────────────────────────────────────────────────────────────

function PathScreen({
  path, pathState, onRetry, onBack, onOpenHub, onStartMcqs, conceptId,
}: {
  path: GraphPath | null
  pathState: LoadState
  onRetry: () => void
  onBack: () => void
  onOpenHub: (id: string, name?: string) => void
  onStartMcqs: () => void
  conceptId: string
}) {
  if (pathState === 'loading') return <ScreenSkeleton variant="path" />
  if (pathState === 'error' || !path) {
    return (
      <div className="space-y-4">
        <BackRow label="Back to hub" onClick={onBack} />
        <ScreenError
          title="The path didn't load"
          hint="The graph engine did not respond for this concept — it may still be warming up."
          onRetry={onRetry}
        />
      </div>
    )
  }

  const stages = path.steps.filter((s) => s.items.length > 0)

  return (
    <div className="space-y-6">
      <BackRow label="Back to hub" onClick={onBack} />

      {/* ── header + top CTA ── */}
      <Reveal index={0} className="space-y-3">
        <div className="space-y-1.5">
          <MicroLabel>Knowledge path</MicroLabel>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{path.concept.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <SubjectChip name={path.subject.name} color={path.subject.color} />
            <KindIcon kind={path.concept.kind} />
          </div>
          {path.concept.summary && <p className="max-w-xl text-sm leading-relaxed text-ink-soft">{path.concept.summary}</p>}
        </div>
        <Button className="min-h-11 w-full sm:w-auto" onClick={onStartMcqs}>
          <CircleHelp className="size-4" aria-hidden /> Practice questions on {path.concept.name}
        </Button>
      </Reveal>

      {/* ── stage chain ── */}
      {stages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
          No path seeded for this concept yet — open its hub to explore the raw links.
        </p>
      ) : (
        <ScrollReveal>
          <div className="relative space-y-3 before:absolute before:bottom-3 before:left-[19px] before:top-3 before:w-px before:bg-line">
            {stages.map((stage, i) => {
              const StageIcon = STAGE_ICONS[stage.stage] ?? CircleHelp
              return (
                <ScrollReveal key={stage.stage} className="relative pl-11" delay={Math.min(i * 0.05, 0.25)}>
                  <span
                    className="absolute left-0 top-3 grid size-10 place-items-center rounded-xl border border-line bg-background"
                    style={{ color: GROUP_COLORS[stage.stage === 'why' ? 'caused_by' : stage.stage === 'mechanism' ? 'mechanism' : stage.stage === 'clinical' ? 'manifestation' : stage.stage === 'diagnosis' ? 'investigation' : 'treatment'] }}
                  >
                    <StageIcon className="size-4" aria-hidden />
                  </span>
                  <section className="clay space-y-2.5 rounded-2xl p-4" aria-label={stage.label}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em]">
                        {i + 1}. {stage.label}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-ink-soft">{stage.question}</p>
                    </div>
                    <div className="space-y-1.5">
                      {stage.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onOpenHub(item.id, item.name)}
                          className="block w-full rounded-xl border border-line bg-surface-2/40 p-2.5 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <MasteryDot mastery={item.mastery} />
                            <KindIcon kind={item.kind} className="size-3" />
                            <span className="min-w-0 truncate text-sm font-semibold">{item.name}</span>
                            <span className="ml-auto shrink-0 rounded-full border border-line bg-background/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft">
                              {item.edgeLabel}
                            </span>
                          </span>
                          {item.summary && (
                            <span className="mt-1 block line-clamp-2 text-[11px] leading-snug text-ink-soft">{item.summary}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                </ScrollReveal>
              )
            })}
          </div>
        </ScrollReveal>
      )}

      {/* ── narrative ── */}
      {path.narrative.length > 0 && (
        <ScrollReveal>
          <section className="clay space-y-2 rounded-2xl p-4" aria-label="The story in one pass">
            <MicroLabel>{path.concept.name} — the story in one pass</MicroLabel>
            <ol className="space-y-1.5">
              {path.narrative.map((line, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <span className="shrink-0 font-semibold tabular-nums text-primary">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>
        </ScrollReveal>
      )}

      {/* ── AI ── */}
      <ScrollReveal>
        <WhyPathPanel conceptId={conceptId} triggerLabel="Explain this path" />
      </ScrollReveal>
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export function GraphView() {
  const setView = useAppStore((s) => s.setView)
  const openTopicHub = useAppStore((s) => s.openHub)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  const [screen, setScreen] = useState<Screen>('home')
  const [hubId, setHubId] = useState<string | null>(null)
  const [hubHistory, setHubHistory] = useState<string[]>([])

  const [recent, setRecent] = useState<string[]>(() => readRecent())
  const [recentMeta, setRecentMeta] = useState<Record<string, string>>(() => readRecentMeta())
  // Refs mirror the hydrated recent list so the home effect can pass ids to the
  // server without re-reading storage inside the effect body.
  const recentRef = useRef<string[]>(recent)
  const metaRef = useRef<Record<string, string>>(recentMeta)

  const [home, setHome] = useState<GraphHome | null>(null)
  const [homeState, setHomeState] = useState<LoadState>('loading')
  const [homeKey, setHomeKey] = useState(0)

  const [hub, setHub] = useState<GraphHub | null>(null)
  const [hubState, setHubState] = useState<LoadState>('loading')
  const [hubKey, setHubKey] = useState(0)

  const [path, setPath] = useState<GraphPath | null>(null)
  const [pathState, setPathState] = useState<LoadState>('loading')
  const [pathKey, setPathKey] = useState(0)

  const pushRecent = useCallback((id: string, name?: string) => {
    const next = [id, ...recentRef.current.filter((x) => x !== id)].slice(0, RECENT_MAX)
    const meta = { ...metaRef.current }
    if (name) meta[id] = name
    recentRef.current = next
    metaRef.current = meta
    writeRecent(next, meta)
    setRecent(next)
    setRecentMeta(meta)
  }, [])

  // ── Home: fetch with this device's recent ids (server echoes them validated).
  // The lazy useState initializers read localStorage pre-mount (client-only
  // render — this view mounts after profile hydration, so no SSR mismatch).
  useEffect(() => {
    let cancelled = false
    api.graphHome(recentRef.current.length > 0 ? recentRef.current : undefined)
      .then((payload) => { if (!cancelled) { setHome(payload); setHomeState('ready') } })
      .catch(() => { if (!cancelled) setHomeState('error') })
    return () => { cancelled = true }
  }, [homeKey])

  // ── Hub fetch (per hubId; retry bumps hubKey). 'loading' is set by the
  // navigation/retry handlers — the effect body only fires the request.
  useEffect(() => {
    if (!hubId) return
    let cancelled = false
    api.graphHub(hubId)
      .then((payload) => { if (!cancelled) { setHub(payload); setHubState('ready') } })
      .catch(() => { if (!cancelled) setHubState('error') })
    return () => { cancelled = true }
  }, [hubId, hubKey])

  // ── Path fetch ('loading' set by the openPath handler) ──
  useEffect(() => {
    if (screen !== 'path' || !hubId) return
    let cancelled = false
    api.graphPath(hubId)
      .then((payload) => { if (!cancelled) { setPath(payload); setPathState('ready') } })
      .catch(() => { if (!cancelled) setPathState('error') })
    return () => { cancelled = true }
  }, [hubId, pathKey, screen])

  // ── Reset scroll on screen / hub change ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [screen, hubId])

  const openHub = useCallback((id: string, name?: string) => {
    if (!id) return
    pushRecent(id, name)
    if (hubId && hubId !== id) setHubHistory((h) => [...h, hubId])
    setHubState('loading')
    setHubId(id)
    setScreen('hub')
  }, [pushRecent, hubId])

  const backFromHub = useCallback(() => {
    const prev = hubHistory[hubHistory.length - 1]
    if (prev) {
      setHubHistory((h) => h.slice(0, -1))
      setHubState('loading')
      setHubId(prev)
    } else {
      setScreen('home')
      setHubId(null)
      setHubHistory([])
    }
  }, [hubHistory])

  const openPath = useCallback(() => {
    if (hubId) {
      setPathState('loading')
      setScreen('path')
    }
  }, [hubId])

  const startMcqs = useCallback((conceptId: string) => {
    setAdaptivePreset({ conceptId, autoStart: true })
    setView('adaptive')
  }, [setAdaptivePreset, setView])

  const startPyqs = useCallback((conceptId: string) => {
    setAdaptivePreset({ conceptId, mode: 'pyq', autoStart: true })
    setView('adaptive')
  }, [setAdaptivePreset, setView])

  const backLabel = hubHistory.length > 0 ? 'Back' : 'All connections'

  return (
    <div className="mx-auto w-full max-w-3xl p-4 pb-28 md:p-6">
      {screen === 'home' && (
        <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
          <HomeScreen
            home={home}
            homeState={homeState}
            onRetry={() => { setHomeState('loading'); setHomeKey((k) => k + 1) }}
            recent={recent}
            recentMeta={recentMeta}
            onOpenHub={openHub}
            onOpenTopicHub={(topicId) => openTopicHub(topicId)}
          />
        </motion.div>
      )}
      {screen === 'hub' && (
        <motion.div key={`hub-${hubId ?? ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
          <HubScreen
            hub={hub}
            hubState={hubState}
            onRetry={() => { setHubState('loading'); setHubKey((k) => k + 1) }}
            onBack={backFromHub}
            backLabel={backLabel}
            onOpenHub={openHub}
            onOpenTopicHub={(topicId) => openTopicHub(topicId)}
            onOpenPath={openPath}
            onStartMcqs={() => hubId && startMcqs(hubId)}
            onStartPyqs={() => hubId && startPyqs(hubId)}
            onGoCases={() => setView('cases')}
            onGoRevise={() => setView('revise')}
          />
        </motion.div>
      )}
      {screen === 'path' && (
        <motion.div key={`path-${hubId ?? ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
          <PathScreen
            path={path}
            pathState={pathState}
            onRetry={() => { setPathState('loading'); setPathKey((k) => k + 1) }}
            onBack={() => setScreen('hub')}
            onOpenHub={openHub}
            onStartMcqs={() => hubId && startMcqs(hubId)}
            conceptId={hubId ?? ''}
          />
        </motion.div>
      )}
    </div>
  )
}
