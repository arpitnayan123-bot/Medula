'use client'

// ─── DOUBT SEARCH — the productive replacement for the orbit galaxy ─────────
// One big search bar: type the topic you're confused about and get instant,
// actionable results from across MEDULA — concepts, topics, questions,
// flashcards and cases — plus one-tap hand-offs to the AI tutor and live
// journal search. Subject chips from the homepage land here pre-scoped.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Brain,
  CircleHelp,
  FlaskConical,
  Layers,
  Library,
  Loader2,
  Search,
  Sparkles,
  Stethoscope,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { SearchResults, TopicSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Natural-language question → offer the tutor hand-off.
const QUESTION_RE = /^(why|how|what|when|which|who|difference|compare)\b/i
// Session-storage key the tutor view consumes on mount (same contract as the
// global ⌘K search overlay).
const TUTOR_QUESTION_KEY = 'medos:tutor-question'
const RECENT_KEY = 'medula:recent-doubts'
const MAX_RECENT = 6

const QUICK_DOUBTS = ['RAAS', 'nephrotic syndrome', 'metformin', 'ECG', 'TB', 'shock']

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function pushRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((s) => s !== q)].slice(0, MAX_RECENT)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* private mode — recents are best-effort */
  }
}

// ─── small building blocks ───────────────────────────────────────────────────

function RowIcon({ icon: Icon, tone = 'muted' }: { icon: LucideIcon; tone?: 'muted' | 'primary' }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-xl border',
        tone === 'primary' ? 'border-primary/30 bg-primary/10' : 'border-line bg-surface-2',
      )}
      aria-hidden
    >
      <Icon className={cn('size-4', tone === 'primary' ? 'text-primary' : 'text-ink-soft')} />
    </span>
  )
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <p className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
      {label}
      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
    </p>
  )
}

function ResultRow({
  icon,
  title,
  sub,
  tag,
  tone,
  onClick,
  children,
}: {
  icon: LucideIcon
  title: string
  sub?: string
  tag?: string
  tone?: 'primary'
  onClick: () => void
  /** Optional sibling actions rendered NEXT to the main button (never nested
      inside it — nested <button> breaks hydration). */
  children?: React.ReactNode
}) {
  return (
    <div className="group flex min-h-12 w-full items-center gap-2 rounded-xl border border-line bg-card/70 py-1 pl-1 pr-3 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary/40 hover:bg-primary/5">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left focus-visible:outline-none"
      >
        <RowIcon icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{title}</span>
          {sub && <span className="mt-0.5 block truncate text-xs text-ink-soft">{sub}</span>}
        </span>
        {tag && (
          <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
            {tag}
          </span>
        )}
        <ArrowRight className="size-4 shrink-0 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </button>
      {children}
    </div>
  )
}

// ─── the view ────────────────────────────────────────────────────────────────

export function DoubtSearchView() {
  const setView = useAppStore((s) => s.setView)
  const openConcept = useAppStore((s) => s.openConcept)
  const openHub = useAppStore((s) => s.openHub)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const setResearchSeedQuery = useAppStore((s) => s.setResearchSeedQuery)
  const mapScope = useAppStore((s) => s.mapScope)
  const setMapScope = useAppStore((s) => s.setMapScope)
  const reduce = useReducedMotion()

  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [resultsFor, setResultsFor] = useState('') // query the current results belong to
  const [pending, setPending] = useState(false)
  const [errored, setErrored] = useState(false)
  const [recent, setRecent] = useState<string[]>(() => readRecent())
  const [retryNonce, setRetryNonce] = useState(0)

  // Subject scope (arrives from the homepage "All Subjects" grid). Stored with
  // its id so a scope change never shows a stale subject's topics.
  const [scopedData, setScopedData] = useState<{ id: string; name: string | null; topics: TopicSummary[] | null } | null>(null)

  const reqRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = q.trim()
  const active = query.length >= 2
  const isQuestion = QUESTION_RE.test(query)
  const scopedSubjectId = mapScope?.startsWith('subject:') ? mapScope.slice('subject:'.length) : null
  const scopedName = scopedData?.id === scopedSubjectId ? scopedData.name : null
  const scopedTopics = scopedData?.id === scopedSubjectId ? scopedData.topics : null

  // Focus the bar once on mount (desktop only — phones get no auto keyboard
  // popup). Recents are loaded by the lazy useState initializer above.
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) inputRef.current?.focus()
  }, [])

  // Resolve the scoped subject → name + topic list (a focused study menu).
  useEffect(() => {
    if (!scopedSubjectId) return
    let cancelled = false
    api
      .subject(scopedSubjectId)
      .then((res) => {
        if (cancelled) return
        setScopedData({ id: scopedSubjectId, name: res.subject.name, topics: res.topics })
      })
      .catch(() => {
        if (cancelled) return
        setScopedData(null)
      })
    return () => {
      cancelled = true
    }
  }, [scopedSubjectId])

  // Debounced search (280ms) once the query is at least 2 characters. Results
  // carry the query they belong to — no synchronous resets needed, rendering
  // simply gates on `resultsFor === query`.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      const id = ++reqRef.current
      setPending(true)
      api
        .search(query)
        .then((res) => {
          if (reqRef.current !== id) return
          setResults(res)
          setResultsFor(query)
          setErrored(false)
        })
        .catch(() => {
          if (reqRef.current !== id) return
          setErrored(true)
          setResultsFor('')
        })
        .finally(() => {
          if (reqRef.current === id) setPending(false)
        })
    }, 280)
    return () => clearTimeout(t)
  }, [query, active, retryNonce])

  const submitRecent = useCallback((term: string) => {
    setQ(term)
    pushRecent(term)
    setRecent(readRecent())
  }, [])

  const askTutor = useCallback(() => {
    if (query) {
      try {
        sessionStorage.setItem(TUTOR_QUESTION_KEY, query)
      } catch {
        /* tutor still opens — the student can retype */
      }
    }
    setView('tutor')
  }, [query, setView])

  const searchJournals = useCallback(() => {
    setResearchSeedQuery(query)
    setView('research')
  }, [query, setResearchSeedQuery, setView])

  const practiceOn = useCallback(
    (count = 8) => {
      setQuizPreset({ count })
      setView('questions')
    },
    [setQuizPreset, setView],
  )

  const totalResults = useMemo(() => {
    if (!results) return 0
    return (
      results.concepts.length +
      results.subjects.length +
      results.topics.length +
      results.questions.length +
      results.flashcards.length +
      results.cases.length
    )
  }, [results])

  const hasResults = totalResults > 0 && resultsFor === query
  const showScopedMenu = !active && scopedSubjectId !== null && scopedTopics !== null

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      {/* ── Hero: the one big doubt bar ── */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        aria-label="Search your doubt"
      >
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">What&apos;s your doubt?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Type any disease, drug, topic or full question — get the concept, practice and revision in one place.
        </p>

        <div className="clay mt-4 flex items-center gap-2 rounded-2xl bg-card/80 p-2 pl-4">
          <Search className="size-5 shrink-0 text-primary" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              if (!active) return
              if (isQuestion || (!hasResults && !pending)) askTutor()
            }}
            placeholder="e.g. Why does nephrotic syndrome cause edema?"
            aria-label="Search your doubt"
            enterKeyHint="search"
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-soft/70"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="grid size-9 shrink-0 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => (active ? (hasResults || pending ? undefined : askTutor()) : inputRef.current?.focus())}
            className="hidden h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-px sm:flex"
          >
            Search
          </button>
        </div>

        {/* scope chip */}
        {scopedSubjectId && (
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Library className="size-3.5" aria-hidden />
              {scopedName ?? 'Subject'} only
              <button
                type="button"
                onClick={() => setMapScope(null)}
                aria-label="Remove subject filter"
                className="ml-0.5 grid size-5 place-items-center rounded-full hover:bg-primary/20"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          </div>
        )}
      </motion.section>

      {/* ── Question → tutor hand-off ── */}
      {active && isQuestion && (
        <motion.button
          type="button"
          onClick={askTutor}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="clay-btn-soft flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
        >
          <RowIcon icon={Sparkles} tone="primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">Ask the AI tutor: “{query}”</span>
            <span className="block truncate text-xs text-ink-soft">Full explanation, step by step — educational only</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
        </motion.button>
      )}

      {/* ── Loading / error / empty / results ── */}
      {active && pending && (
        <p className="flex items-center gap-2 px-1 text-sm text-ink-soft" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Searching your library…
        </p>
      )}

      {active && errored && !pending && (
        <div className="rounded-2xl border border-sev-crit/30 bg-sev-crit/5 p-4">
          <p className="flex items-center gap-2 text-sm text-sev-crit">
            <TriangleAlert className="size-4 shrink-0" aria-hidden /> Search is unavailable right now.
          </p>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="mt-3 min-h-10 rounded-xl border border-line bg-card px-4 text-sm font-medium transition-colors hover:border-primary/40"
          >
            Retry
          </button>
        </div>
      )}

      {active && !pending && !errored && resultsFor === query && results && totalResults === 0 && (
        <div className="rounded-2xl border border-line bg-card/70 p-5 text-center">
          <p className="text-sm text-ink-soft">
            Nothing in the library matches “{query}” yet — the AI tutor can still explain it.
          </p>
          <button
            type="button"
            onClick={askTutor}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-px"
          >
            <Sparkles className="size-4" aria-hidden /> Ask the tutor
          </button>
        </div>
      )}

      {active && !pending && !errored && results && totalResults > 0 && resultsFor === query && (
        <motion.div
          key={query}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="space-y-5"
        >
          {results.concepts.length > 0 && (
            <section className="space-y-2">
              <GroupHeader label="Concepts" count={results.concepts.length} />
              {results.concepts.slice(0, 6).map((c) => (
                <ResultRow
                  key={c.id}
                  icon={Brain}
                  tone="primary"
                  title={c.name}
                  sub={`${c.kind.replace('_', ' ')} · ${c.subject} — ${c.summary}`}
                  onClick={() => {
                    openConcept(c.id)
                  }}
                >
                  {c.topicId && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openHub(c.topicId!, c.id) }}
                      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15"
                      aria-label={`Open ${c.name} in the Topic Hub`}
                    >
                      <BookMarked className="size-3" aria-hidden /> Topic Hub
                    </button>
                  )}
                </ResultRow>
              ))}
            </section>
          )}

          {results.topics.length > 0 && (
            <section className="space-y-2">
              <GroupHeader label="Topics" count={results.topics.length} />
              {results.topics.slice(0, 4).map((t) => (
                <ResultRow
                  key={t.id}
                  icon={BookMarked}
                  title={t.name}
                  sub={`${t.subject} — everything for this topic in one hub`}
                  tag="Topic Hub"
                  onClick={() => openHub(t.id)}
                />
              ))}
            </section>
          )}

          {results.subjects.length > 0 && (
            <section className="space-y-2">
              <GroupHeader label="Subjects" count={results.subjects.length} />
              {results.subjects.slice(0, 4).map((s) => (
                <ResultRow key={s.id} icon={Library} title={s.name} sub={s.blurb} tag={s.code} onClick={() => setView('learn')} />
              ))}
            </section>
          )}

          {results.questions.length > 0 && (
            <section className="space-y-2">
              <GroupHeader label="Practice questions" count={results.questions.length} />
              {results.questions.slice(0, 3).map((qq) => (
                <ResultRow
                  key={qq.id}
                  icon={CircleHelp}
                  title={qq.stem}
                  tag="Practice"
                  onClick={() => {
                    setQuizPreset({ count: 8 })
                    setView('questions')
                  }}
                />
              ))}
            </section>
          )}

          {results.flashcards.length > 0 && (
            <section className="space-y-2">
              <GroupHeader label="Flashcards" count={results.flashcards.length} />
              {results.flashcards.slice(0, 3).map((f) => (
                <ResultRow key={f.id} icon={Layers} title={f.front} tag={f.subjectCode} onClick={() => setView('revise')} />
              ))}
            </section>
          )}

          {results.cases.length > 0 && (
            <section className="space-y-2">
              <GroupHeader label="Clinical cases" count={results.cases.length} />
              {results.cases.slice(0, 3).map((cs) => (
                <ResultRow key={cs.id} icon={Stethoscope} title={cs.title} sub={cs.specialty} tag="Case" onClick={() => setView('cases')} />
              ))}
            </section>
          )}

          {/* productive follow-through */}
          <section className="grid gap-2 sm:grid-cols-2" aria-label="Dig deeper">
            <button
              type="button"
              onClick={() => practiceOn(8)}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card/70 px-3 text-left transition-colors hover:border-primary/40"
            >
              <RowIcon icon={Timer} />
              <span className="min-w-0 flex-1 text-sm font-medium">Practice 8 questions on this</span>
              <ArrowRight className="size-4 text-ink-soft" aria-hidden />
            </button>
            <button
              type="button"
              onClick={searchJournals}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card/70 px-3 text-left transition-colors hover:border-primary/40"
            >
              <RowIcon icon={FlaskConical} />
              <span className="min-w-0 flex-1 text-sm font-medium">
                “{query}” in live research papers
              </span>
              <ArrowRight className="size-4 text-ink-soft" aria-hidden />
            </button>
          </section>
        </motion.div>
      )}

      {/* ── Subject-scoped study menu (no query, scope set) ── */}
      {showScopedMenu && scopedTopics && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="space-y-2"
          aria-label={`${scopedName} topics`}
        >
          <GroupHeader label={`${scopedName} — study topics`} count={scopedTopics.length} />
          <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {scopedTopics.map((t) => (
              <ResultRow
                key={t.id}
                icon={BookOpen}
                title={t.name}
                sub={`${t.conceptCount} concepts · ${t.mastery}% mastery`}
                onClick={() => setView('learn')}
              />
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Empty state: recents + quick doubts ── */}
      {!active && !showScopedMenu && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.06 }}
          className="space-y-5"
        >
          {recent.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <GroupHeader label="Recent doubts" count={recent.length} />
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.localStorage.removeItem(RECENT_KEY)
                    } catch {
                      /* ignore */
                    }
                    setRecent([])
                  }}
                  className="min-h-8 rounded-lg px-2 text-xs text-ink-soft transition-colors hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => submitRecent(r)}
                    className="min-h-10 rounded-full border border-line bg-card/70 px-4 text-sm text-foreground transition-colors hover:border-primary/40"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <GroupHeader label="Common doubts" count={QUICK_DOUBTS.length} />
            <div className="flex flex-wrap gap-2">
              {QUICK_DOUBTS.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => submitRecent(term)}
                  className="min-h-10 rounded-full border border-line bg-card/70 px-4 text-sm text-foreground transition-colors hover:border-primary/40"
                >
                  {term}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-card/70 p-4 text-sm text-ink-soft">
            <p className="font-medium text-foreground">How this works</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Type a topic — get the concept page, practice questions and flashcards together.</li>
              <li>Ask a full “why / how” question and the AI tutor explains it step by step.</li>
              <li>Everything is NMC CBME aligned and cross-verified — no random internet answers.</li>
            </ul>
          </section>
        </motion.div>
      )}
    </div>
  )
}
