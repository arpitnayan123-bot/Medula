'use client'

// ─── TOPIC HUB VIEW (PRODUCT 02 — ONE TOPIC, EVERYTHING) ────────────────────
// The view layer for `view === 'hub'`. Two states:
//   • Hub home — search-first landing: type anything (medical terms, common
//     words, abbreviations, natural language) → resolves to a topic and opens
//     the unified hub. Plus continue/suggested topics.
//   • Topic hub — the one-topic experience (see topic-hub.tsx).
// Deep links: #/hub?topic=<id>&concept=<id> and sessionStorage mirrors, so a
// reload (or the sign-in resume) lands back on the same topic.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight, BookMarked, ChevronRight, Clock, Loader2, Search, Sparkles, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { readHubKeys, useAppStore, writeHubKeys } from '@/lib/store'
import { TopicHub } from '@/components/hub/topic-hub'
import type { HubHomePayload, SearchResults } from '@/lib/types'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const RECENT_KEY = 'medula:hub-recent'
const MAX_RECENT = 6

interface RecentTopic { id: string; name: string }

function readRecent(): RecentTopic[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as RecentTopic[]) : []
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string') : []
  } catch { return [] }
}

function pushRecent(topic: RecentTopic): void {
  try {
    const next = [topic, ...readRecent().filter((r) => r.id !== topic.id)].slice(0, MAX_RECENT)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* private mode */ }
}

export function HubView() {
  const hubFocus = useAppStore((s) => s.hubFocus)
  const openHub = useAppStore((s) => s.openHub)
  const closeHub = useAppStore((s) => s.closeHub)

  // Deep-link recovery: #/hub?topic=… or sessionStorage mirror (set by openHub,
  // by the sign-in hand-off, or by a previous visit in this tab).
  useEffect(() => {
    if (hubFocus) return
    const { topicId, conceptId } = readHubKeys()
    if (topicId) openHub(topicId, conceptId)
    else {
      // A view switch to #/hub without a topic must clear any stale target.
      writeHubKeys(null, null)
    }
  }, [hubFocus, openHub])

  if (hubFocus) {
    return <TopicHub topicId={hubFocus.topicId} conceptId={hubFocus.conceptId} onClose={closeHub} />
  }
  return <HubHome onOpen={openHub} />
}

// ── HUB HOME — search first ─────────────────────────────────────────────────
function HubHome({ onOpen }: { onOpen: (topicId: string, conceptId?: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState<{ topicId: string; label: string; sub: string; conceptId: string | null } | null>(null)
  const [home, setHome] = useState<HubHomePayload | null>(null)
  // localStorage is client-only and this view mounts after hydration — lazy
  // init is safe and avoids a setState-in-effect cascade.
  const [recent, setRecent] = useState<RecentTopic[]>(() => readRecent())

  useEffect(() => {
    let cancelled = false
    api.hubHome().then(
      (d) => { if (!cancelled) setHome(d) },
      () => { if (!cancelled) setHome({ suggested: [], continueTopics: [], totals: { topics: 0, concepts: 0, questions: 0, flashcards: 0, cases: 0 } }) },
    )
    return () => { cancelled = true }
  }, [])

  // debounced search → topic resolution (all state writes deferred to the
  // timer callback — never synchronous in the effect body)
  useEffect(() => {
    const q = query.trim()
    const timer = window.setTimeout(() => {
      if (q.length < 2) {
        setResults(null)
        setResolved(null)
        setSearching(false)
        return
      }
      setSearching(true)
      api.search(q).then(
        (res) => {
          setResults(res)
          setSearching(false)
          setResolved(resolveTopic(res, q))
        },
        () => setSearching(false),
      )
    }, q.length < 2 ? 0 : 260)
    return () => window.clearTimeout(timer)
  }, [query])

  const open = useCallback((topicId: string, name: string, conceptId?: string | null) => {
    pushRecent({ id: topicId, name })
    onOpen(topicId, conceptId ?? null)
  }, [onOpen])

  return (
    <div className="pb-safe-nav">
      {/* hero */}
      <div className="podium relative overflow-hidden rounded-3xl p-5 md:p-8">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <BookMarked className="size-3.5" /> Topic Hub
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-4xl">
            One topic. Everything.
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-ink-soft md:text-[15px]">
            Search any medical topic and get what you need to understand, watch, read, practice, revise and track it — in one place. No section-hopping.
          </p>

          {/* the search bar — the product */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try "Nephrotic Syndrome", "HF", "why does the heart fail"…'
              aria-label="Search for a medical topic"
              className="h-12 rounded-2xl border-line bg-card pl-11 pr-10 text-base shadow-sm focus-visible:ring-primary/40"
              autoCapitalize="words"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {searching && (
            <p className="flex items-center justify-center gap-2 text-xs text-ink-soft" role="status">
              <Loader2 className="size-3.5 animate-spin" /> Searching…
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* resolved topic — the primary result */}
        {resolved && (
          <motion.section
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
            aria-label="Best topic match"
          >
            <button
              type="button"
              onClick={() => open(resolved.topicId, resolved.label, resolved.conceptId)}
              className="flex w-full items-center gap-4 rounded-2xl border border-primary/40 bg-primary/5 p-5 text-left shadow-sm shadow-primary/5 transition-colors hover:bg-primary/10"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
                <BookMarked className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Open the Topic Hub</span>
                <span className="mt-0.5 block truncate text-lg font-semibold tracking-tight">{resolved.label}</span>
                <span className="block truncate text-xs text-ink-soft">{resolved.sub}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-primary" />
            </button>
          </motion.section>
        )}

        {/* other topic matches */}
        {results && results.topics.length > (resolved ? 1 : 0) && (
          <section aria-label="More topic matches" className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">More topics</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {results.topics
                .filter((tp) => tp.id !== resolved?.topicId)
                .slice(0, 4)
                .map((tp) => (
                  <button
                    key={tp.id}
                    type="button"
                    onClick={() => open(tp.id, tp.name)}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl clay p-3 text-left transition-colors clay-hover"
                  >
                    <BookMarked className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{tp.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{tp.subject}</span>
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* continue */}
        {home && home.continueTopics.length > 0 && (
          <section aria-label="Continue" className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
              <Clock className="size-3.5" /> Continue where you left off
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {home.continueTopics.map((ct) => (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => open(ct.id, ct.name)}
                  className="w-52 shrink-0 rounded-2xl clay p-3.5 text-left transition-colors clay-hover"
                >
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: ct.subjectColor }} aria-hidden />
                    <span className="truncate text-[11px] text-ink-soft">{ct.subjectName}</span>
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold">{ct.name}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] capitalize text-primary">
                    <Sparkles className="size-2.5" /> {ct.status.replace('-', ' ')}
                  </span>
                </button>
              ))}
              {recent.filter((r) => !home.continueTopics.some((ct) => ct.id === r.id)).slice(0, 3).map((r) => (
                <button
                  key={`recent-${r.id}`}
                  type="button"
                  onClick={() => open(r.id, r.name)}
                  className="w-52 shrink-0 rounded-2xl clay-in p-3.5 text-left transition-colors clay-hover"
                >
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">recent</span>
                  <span className="mt-1 block truncate text-sm font-semibold">{r.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* suggested */}
        <section aria-label="Suggested topics" className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
            {home ? 'Rich topics — full hub experience' : 'Suggested topics'}
          </h2>
          {!home ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {home.suggested.map((s, i) => (
                <motion.button
                  key={s.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE, delay: i * 0.03 }}
                  onClick={() => open(s.id, s.name)}
                  className="group flex min-w-0 items-center gap-3 rounded-2xl clay p-3.5 text-left transition-all clay-hover"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: s.subjectColor }}>
                    {s.importance}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold group-hover:text-primary">{s.name}</span>
                    <span className="block truncate text-[11px] text-ink-soft">
                      {s.subjectName}{s.systemLabel ? ` · ${s.systemLabel}` : ''}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{s.reason}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </motion.button>
              ))}
            </div>
          )}
        </section>

        {/* library totals */}
        {home && (
          <p className="text-center text-[11px] text-muted-foreground">
            {home.totals.topics} topics · {home.totals.concepts} concepts · {home.totals.questions} questions · {home.totals.flashcards} flashcards · {home.totals.cases} cases — every count measured, nothing padded.
          </p>
        )}
      </div>
    </div>
  )
}

// ── topic resolution: best topic for a free-text query ──────────────────────
// Priority: exact/substring topic-name match → concept's parent topic
// (carries the ?concept focus) → nothing (honest: no fake match).
function resolveTopic(res: SearchResults, query: string): { topicId: string; label: string; sub: string; conceptId: string | null } | null {
  const q = query.toLowerCase()
  const norm = (s: string) => s.toLowerCase()

  // 1) topic name contains the whole query → strongest
  const exactTopic = res.topics.find((t) => norm(t.name) === q)
    ?? res.topics.find((t) => norm(t.name).includes(q))
  if (exactTopic) {
    return { topicId: exactTopic.id, label: exactTopic.name, sub: `${exactTopic.subject} · complete topic hub`, conceptId: null }
  }

  // 2) concept match → its parent topic, focused on the concept
  const concept = res.concepts.find((c) => c.topicId && (norm(c.name) === q || norm(c.name).includes(q)))
    ?? res.concepts.find((c) => c.topicId)
  if (concept?.topicId) {
    const parent = res.topics.find((t) => t.id === concept.topicId)
    return {
      topicId: concept.topicId,
      label: parent?.name ?? 'Topic hub',
      sub: `Matched “${concept.name}” — focused inside the hub`,
      conceptId: concept.id,
    }
  }

  // 3) topic token overlap (multi-word queries like "why does heart fail")
  const qTokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
  if (qTokens.length > 0) {
    let best: { id: string; name: string; subject: string; score: number } | null = null
    for (const t of res.topics) {
      const name = norm(t.name)
      let score = 0
      for (const tok of qTokens) if (name.includes(tok)) score += 1
      if (score > 0 && (!best || score > best.score)) {
        best = { id: t.id, name: t.name, subject: t.subject, score }
      }
    }
    if (best) {
      return { topicId: best.id, label: best.name, sub: `${best.subject} · complete topic hub`, conceptId: null }
    }
  }
  return null
}
