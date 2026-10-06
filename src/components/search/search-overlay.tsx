'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Brain,
  CircleHelp,
  FileText,
  Layers,
  Library,
  Loader2,
  ScanSearch,
  Sparkles,
  Stethoscope,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { SearchResults } from '@/lib/types'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const TRIGGER_HINT =
  "Search concepts, diseases, drugs, questions… or ask 'Why does nephrotic syndrome cause edema?'"

const QUICK_TERMS = ['RAAS', 'nephrotic', 'metformin', 'ECG', 'TB']

const NO_RESULTS =
  'No matches — try an abbreviation (HTN, AKI) or ask the tutor.'

// Natural-language question → offer the tutor hand-off.
const QUESTION_RE = /\b(why|how|what)\b/i

// Session-storage key the tutor view consumes on mount.
const TUTOR_QUESTION_KEY = 'medos:tutor-question'

const MAX_PER_GROUP = { concepts: 6, subjects: 4, topics: 4, questions: 4, flashcards: 4, cases: 3 } as const

function totalOf(r: SearchResults): number {
  return r.concepts.length + r.subjects.length + r.topics.length + r.questions.length + r.flashcards.length + r.cases.length
}

// ─── Reusable row bits ───────────────────────────────────────────────────────

function RowIcon({ icon: Icon, tone = 'muted' }: { icon: LucideIcon; tone?: 'muted' | 'primary' }) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg border',
        tone === 'primary' ? 'border-primary/30 bg-primary/10' : 'border-line bg-surface-2',
      )}
      aria-hidden
    >
      <Icon className={cn('size-4', tone === 'primary' ? 'text-primary' : 'text-ink-soft')} />
    </span>
  )
}

function TwoLine({ title, sub }: { title: string; sub?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-foreground">{title}</span>
      {sub && <span className="mt-0.5 block truncate text-xs text-ink-soft">{sub}</span>}
    </span>
  )
}

function Tag({ children }: { children: string }) {
  return (
    <span className="ml-auto shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
      {children}
    </span>
  )
}

// ─── SearchOverlay ───────────────────────────────────────────────────────────

export function SearchOverlay() {
  const searchOpen = useAppStore((s) => s.searchOpen)
  const setSearchOpen = useAppStore((s) => s.setSearchOpen)
  const setView = useAppStore((s) => s.setView)
  const openConcept = useAppStore((s) => s.openConcept)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const openAsk = useAppStore((s) => s.openAsk)

  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [pending, setPending] = useState(false)
  const [errored, setErrored] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  const reqRef = useRef(0)

  const query = q.trim()
  const active = query.length >= 2
  const isQuestion = QUESTION_RE.test(query)

  // Debounced search (250ms) once the query is at least 2 characters.
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
          setErrored(false)
        })
        .catch(() => {
          if (reqRef.current !== id) return
          setErrored(true)
        })
        .finally(() => {
          if (reqRef.current === id) setPending(false)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [query, active, retryNonce])

  const close = () => {
    setSearchOpen(false)
    setQ('')
    setResults(null)
    setPending(false)
    setErrored(false)
  }

  const askTutor = () => {
    try {
      sessionStorage.setItem(TUTOR_QUESTION_KEY, query)
    } catch {
      // Session storage unavailable — the tutor still opens; the student can retype.
    }
    setView('tutor')
    close()
  }

  const goTo = (view: 'learn' | 'questions' | 'revise' | 'cases') => {
    setView(view)
    close()
  }

  const hasResults = results && totalOf(results) > 0

  return (
    <Dialog open={searchOpen} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-2xl border-line/80 p-0 shadow-2xl glass-strong sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search Medicine</DialogTitle>
        <DialogDescription className="sr-only">
          Search concepts, subjects, topics, questions, flashcards and clinical cases across MEDULA.
        </DialogDescription>

        <Command shouldFilter={false} className="w-full">
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder={TRIGGER_HINT}
            aria-label="Search medicine"
            className="h-12 text-sm"
          />

          <CommandList className="max-h-[min(58vh,430px)] p-1.5">
            {/* Empty query → quick-start chips */}
            {!active && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="px-2.5 py-4"
              >
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-soft">Try</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {QUICK_TERMS.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQ(term)}
                      className="min-h-11 rounded-full border border-line bg-surface-2 px-4 text-sm font-medium text-ink-soft transition-all hover:border-primary/40 hover:text-foreground"
                    >
                      {term}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                  Concepts, subjects, questions, flashcards and cases — or ask a full question and the tutor takes over.
                </p>
              </motion.div>
            )}

            {/* Searching indicator */}
            {active && pending && (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-ink-soft" role="status">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Searching…
              </div>
            )}

            {/* Ask the tutor — natural-language hand-off */}
            {active && isQuestion && !errored && (
              <CommandGroup heading="Ask the tutor">
                <CommandItem
                  value="ask-the-tutor"
                  onSelect={askTutor}
                  className="min-h-11 gap-2.5 rounded-xl border border-primary/25 bg-primary/5 data-[selected=true]:border-primary/40"
                >
                  <RowIcon icon={Sparkles} tone="primary" />
                  <TwoLine title={`Ask the tutor: “${query}”`} sub="Full explanation in tutor mode — educational only" />
                </CommandItem>
                {/* Ask Engine (PRODUCT 15) — grounded answer + sources + practice */}
                <CommandItem
                  value="ask-the-engine"
                  onSelect={() => {
                    setSearchOpen(false)
                    openAsk({ q: query })
                  }}
                  className="min-h-11 gap-2.5 rounded-xl border border-primary/25 bg-primary/5 data-[selected=true]:border-primary/40"
                >
                  <RowIcon icon={ScanSearch} tone="primary" />
                  <TwoLine title={`Ask the engine: “${query}”`} sub="Grounded answer with levels, verified sources and practice" />
                </CommandItem>
              </CommandGroup>
            )}

            {/* Error state */}
            {active && errored && !pending && (
              <div className="flex flex-col items-start gap-2 px-3 py-4">
                <p className="flex items-center gap-2 text-xs text-sev-crit">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  Search is unavailable right now — check your connection.
                </p>
                <button
                  type="button"
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="min-h-9 rounded-lg border border-line px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
                >
                  Retry search
                </button>
              </div>
            )}

            {/* No results */}
            {active && !pending && !errored && !hasResults && (
              <div className="px-3 py-5 text-center">
                <p className="text-sm text-ink-soft">{NO_RESULTS}</p>
                {!isQuestion && (
                  <button
                    type="button"
                    onClick={askTutor}
                    className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    Ask the tutor instead
                  </button>
                )}
              </div>
            )}

            {/* Grouped results */}
            {active && results && hasResults && !pending && (
              <motion.div
                key={query}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {results.concepts.length > 0 && (
                  <CommandGroup heading="Concepts">
                    {results.concepts.slice(0, MAX_PER_GROUP.concepts).map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`concept-${c.id}`}
                        onSelect={() => {
                          openConcept(c.id)
                          close()
                        }}
                        className="min-h-11 gap-2.5 rounded-xl"
                      >
                        <RowIcon icon={Brain} tone="primary" />
                        <TwoLine title={c.name} sub={`${c.kind.replace('_', ' ')} · ${c.subject} — ${c.summary}`} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {results.subjects.length > 0 && (
                  <CommandGroup heading="Subjects">
                    {results.subjects.slice(0, MAX_PER_GROUP.subjects).map((s) => (
                      <CommandItem
                        key={s.id}
                        value={`subject-${s.id}`}
                        onSelect={() => goTo('learn')}
                        className="min-h-11 gap-2.5 rounded-xl"
                      >
                        <RowIcon icon={Library} />
                        <TwoLine title={s.name} sub={s.blurb} />
                        <Tag>{s.code}</Tag>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {results.topics.length > 0 && (
                  <CommandGroup heading="Topics">
                    {results.topics.slice(0, MAX_PER_GROUP.topics).map((t) => (
                      <CommandItem
                        key={t.id}
                        value={`topic-${t.id}`}
                        onSelect={() => goTo('learn')}
                        className="min-h-11 gap-2.5 rounded-xl"
                      >
                        <RowIcon icon={FileText} />
                        <TwoLine title={t.name} sub={t.subject} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {results.questions.length > 0 && (
                  <CommandGroup heading="Questions">
                    {results.questions.slice(0, MAX_PER_GROUP.questions).map((qq) => (
                      <CommandItem
                        key={qq.id}
                        value={`question-${qq.id}`}
                        onSelect={() => {
                          setQuizPreset({ count: 8 })
                          goTo('questions')
                        }}
                        className="min-h-11 gap-2.5 rounded-xl"
                      >
                        <RowIcon icon={CircleHelp} />
                        <TwoLine title={qq.stem} />
                        <Tag>Practice</Tag>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {results.flashcards.length > 0 && (
                  <CommandGroup heading="Flashcards">
                    {results.flashcards.slice(0, MAX_PER_GROUP.flashcards).map((f) => (
                      <CommandItem
                        key={f.id}
                        value={`flashcard-${f.id}`}
                        onSelect={() => goTo('revise')}
                        className="min-h-11 gap-2.5 rounded-xl"
                      >
                        <RowIcon icon={Layers} />
                        <TwoLine title={f.front} />
                        <Tag>{f.subjectCode}</Tag>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {results.cases.length > 0 && (
                  <CommandGroup heading="Clinical cases">
                    {results.cases.slice(0, MAX_PER_GROUP.cases).map((cs) => (
                      <CommandItem
                        key={cs.id}
                        value={`case-${cs.id}`}
                        onSelect={() => goTo('cases')}
                        className="min-h-11 gap-2.5 rounded-xl"
                      >
                        <RowIcon icon={Stethoscope} />
                        <TwoLine title={cs.title} sub={cs.specialty} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </motion.div>
            )}
          </CommandList>

          {/* Keyboard hints */}
          <div className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
              navigate
              <kbd className="ml-1.5 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">esc</kbd>
              close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
