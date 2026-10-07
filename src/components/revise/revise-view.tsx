'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Brain, CheckCircle2, Loader2, RefreshCw, Sparkles, Timer, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { RevisionPayload } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/primitives/kit'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LoadState = 'loading' | 'ready' | 'error'
type DueFlashcard = RevisionPayload['dueFlashcards'][number]
type DueConcept = RevisionPayload['dueConcepts'][number]

// ─── Primitives ──────────────────────────────────────────────────────────────

function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : 0.06 * index, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

function Bar({ pct, className, delay = 0 }: { pct: number; className?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={cn('h-full shrink-0 rounded-full', className)}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      transition={{ duration: 0.8, delay: reduce ? 0 : delay, ease: EASE }}
    />
  )
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (reduce) return
    const controls = animate(0, value, {
      duration: 1,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span className={className}>{reduce ? value : display}</span>
}

function DebtChip({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2">
      <span className={cn('size-2 shrink-0 rounded-full', dot)} />
      <span className="text-lg font-semibold leading-none tabular-nums">{value}</span>
      <span className="text-[11px] leading-tight text-ink-soft">{label}</span>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  body,
  pop,
}: {
  icon: LucideIcon
  title: string
  body: string
  pop?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-card/50 px-5 py-7 text-center">
      <motion.span
        className="mb-0.5 grid size-10 place-items-center rounded-2xl bg-surface-2 text-ink-soft shadow-well"
        initial={reduce || !pop ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <Icon className="size-5 text-sev-ok" />
      </motion.span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-ink-soft text-pretty">{body}</p>
    </div>
  )
}

// ─── Grade buttons ───────────────────────────────────────────────────────────

const GRADES: { label: string; sub: string; grade: number; classes: string }[] = [
  {
    label: 'AGAIN',
    sub: 'seen again today',
    grade: 0,
    classes: 'border-sev-crit/40 bg-sev-crit/10 text-sev-crit hover:bg-sev-crit/20',
  },
  {
    label: 'HARD',
    sub: 'short interval',
    grade: 1,
    classes: 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn hover:bg-sev-warn/20',
  },
  {
    label: 'GOOD',
    sub: 'solid',
    grade: 2,
    classes: 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20',
  },
  {
    label: 'EASY',
    sub: 'long interval',
    grade: 3,
    classes: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok hover:bg-sev-ok/20',
  },
]

function intervalLabel(days: number): string {
  if (days < 1) return `next review in ${Math.max(1, Math.round(days * 24))} hours`
  return `next review in ${days} ${days === 1 ? 'day' : 'days'}`
}

// ─── Flip card ───────────────────────────────────────────────────────────────

function FlipCard({ card, flipped, onFlip }: { card: DueFlashcard; flipped: boolean; onFlip: () => void }) {
  const reduce = useReducedMotion()
  return (
    <div className="[perspective:1400px]">
      <motion.div
        role="button"
        tabIndex={0}
        onClick={onFlip}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onFlip()
          }
        }}
        className="relative block min-h-56 w-full cursor-pointer select-none rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* front — question */}
        <div
          className="clay absolute inset-0 flex flex-col overflow-y-auto rounded-2xl p-5 md:p-6"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            <span>Question</span>
            <span className="text-muted-foreground">tap or press Space</span>
          </div>
          <div className="flex flex-1 items-center justify-center py-4">
            <p className="text-center text-xl font-medium leading-snug tracking-tight md:text-2xl">{card.front}</p>
          </div>
        </div>
        {/* back — answer + subject badge */}
        <div
          className="clay absolute inset-0 flex flex-col overflow-y-auto rounded-2xl border-primary/30 p-5 md:p-6"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            <span className="text-primary">Answer</span>
            <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
              {card.subjectCode}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center py-4">
            <p className="text-center text-base leading-relaxed md:text-lg">{card.back}</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Loading / Error states ──────────────────────────────────────────────────

function ReviseSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" aria-busy="true" role="status">
      <div className="space-y-3">
        <Skeleton className="shimmer h-9 w-40 rounded-lg" />
        <Skeleton className="shimmer h-4 w-3/4 rounded-md md:w-1/2" />
      </div>
      <Skeleton className="shimmer h-40 rounded-2xl" />
      <Skeleton className="shimmer h-11 w-72 rounded-xl" />
      <Skeleton className="shimmer h-64 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="shimmer h-14 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function ReviseError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center md:p-12">
        <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
          <RefreshCw className="size-6 text-sev-crit" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Couldn&apos;t load your revision queue</h2>
        <p className="max-w-sm text-sm text-ink-soft">
          The spaced-repetition engine did not respond. Nothing is lost — your deck and due concepts are waiting.
        </p>
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </div>
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function ReviseView() {
  const openConcept = useAppStore((s) => s.openConcept)

  const [data, setData] = useState<RevisionPayload | null>(null)
  const [status, setStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  // flashcard deck (local so reviewed cards stay gone between data refreshes)
  // fullDeck = every due card; deck = the ACTIVE QUEUE (respects subject filter);
  // graded = cards already reviewed this session (moves out of fullDeck).
  const [fullDeck, setFullDeck] = useState<DueFlashcard[] | null>(null)
  const [graded, setGraded] = useState<DueFlashcard[]>([])
  const [activeSub, setActiveSub] = useState<string | null>(null) // null = all subjects
  const [flipped, setFlipped] = useState(false)
  const [grading, setGrading] = useState(false)
  const [feedback, setFeedback] = useState<number | null>(null)
  const [gradeError, setGradeError] = useState(false)

  // concepts clearing
  const [clearingId, setClearingId] = useState<string | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)

  const [tab, setTab] = useState<'flashcards' | 'concepts'>('flashcards')

  useEffect(() => {
    let cancelled = false
    api.revision().then(
      (payload) => {
        if (cancelled) return
        setData(payload)
        setFullDeck(payload.dueFlashcards)
        setGraded([])
        setActiveSub(null)
        setStatus('ready')
      },
      () => {
        if (cancelled) return
        setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const retry = useCallback(() => {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }, [])

  // Active queue = full deck filtered by the chosen subject chip (null = all)
  const deck = useMemo(
    () =>
      fullDeck
        ? activeSub
          ? fullDeck.filter((c) => c.subjectCode === activeSub)
          : fullDeck
        : null,
    [fullDeck, activeSub],
  )

  // Remaining cards per subject → filter chips (only when >1 subject is due)
  const subjectChips = useMemo(() => {
    if (!fullDeck) return []
    const m = new Map<string, number>()
    for (const c of fullDeck) m.set(c.subjectCode, (m.get(c.subjectCode) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [fullDeck])

  const current = deck && deck.length > 0 ? deck[0] : null
  const gradedInScope = useMemo(
    () => (activeSub ? graded.filter((c) => c.subjectCode === activeSub) : graded),
    [graded, activeSub],
  )
  const scopeTotal = (deck?.length ?? 0) + gradedInScope.length
  const reviewed = gradedInScope.length

  // Switching subject filter resets the flip so the next card starts face-down
  useEffect(() => {
    setFlipped(false)
  }, [activeSub])

  const grade = useCallback(
    async (g: number) => {
      const card = deck?.[0]
      if (!card || !flipped || grading) return
      setGrading(true)
      setGradeError(false)
      try {
        const res = (await api.reviewFlashcard({ flashcardId: card.id, grade: g })) as {
          ok: boolean
          nextDueDays?: number
        }
        setFeedback(typeof res.nextDueDays === 'number' ? res.nextDueDays : null)
        setFlipped(false)
        setGraded((g) => [...g, card])
        setFullDeck((d) => (d ? d.filter((c) => c.id !== card.id) : d))
      } catch {
        setGradeError(true)
      } finally {
        setGrading(false)
      }
    },
    [deck, flipped, grading],
  )

  // keyboard: Space flips, 1-4 grades (only on flashcards tab)
  useEffect(() => {
    if (tab !== 'flashcards') return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.code === 'Space' || e.key === ' ') {
        if (current) {
          e.preventDefault()
          setFlipped((f) => !f)
        }
        return
      }
      const idx = ['1', '2', '3', '4'].indexOf(e.key)
      if (idx >= 0) {
        e.preventDefault()
        void grade(idx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, current, grade])

  const clearItem = useCallback(
    async (item: DueConcept) => {
      if (clearingId) return
      setClearingId(item.conceptId)
      setClearError(null)
      try {
        await api.clearRevisionItem({ conceptId: item.conceptId, minutes: item.minutes })
        void api.logSession({ minutes: item.minutes, kind: 'revision', label: 'Concept revision' }).catch(() => undefined)
        setData((d) => {
          if (!d) return d
          const c = d.counts
          // mirror backend buckets: recall <60% = due now, <80% = soon, else stable/mastered
          const counts =
            item.estRecall < 60
              ? { ...c, now: Math.max(0, c.now - 1), soon: c.soon + 1 }
              : item.estRecall < 80
                ? { ...c, soon: Math.max(0, c.soon - 1), stable: c.stable + 1 }
                : { ...c, stable: Math.max(0, c.stable - 1), mastered: c.mastered + 1 }
          return {
            ...d,
            dueConcepts: d.dueConcepts.filter((x) => x.conceptId !== item.conceptId),
            debt: {
              count: Math.max(0, d.debt.count - 1),
              minutes: Math.max(0, d.debt.minutes - item.minutes),
            },
            counts,
          }
        })
      } catch {
        setClearError(`Couldn't mark "${item.name}" as reviewed — try again.`)
      } finally {
        setClearingId(null)
      }
    },
    [clearingId],
  )

  if (status === 'loading') return <ReviseSkeleton />
  if (status === 'error' || !data) return <ReviseError onRetry={retry} />

  const { debt, counts, dueConcepts } = data
  const progressPct = scopeTotal > 0 ? Math.round((reviewed / scopeTotal) * 100) : 0
  const recallTone = (r: number) => (r < 50 ? 'bg-sev-crit' : r < 75 ? 'bg-sev-warn' : 'bg-sev-ok')

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <Reveal index={0}>
        <PageHeader
          eyebrow={
            <>
              <Timer className="mr-1 inline size-3" />
              Spaced repetition
            </>
          }
          title="Revise"
          intro="Spaced repetition protects what you've learned. Model estimates — never claims of permanent mastery."
        />
      </Reveal>

      {/* Revision debt summary band */}
      <Reveal index={1}>
        <section className="clay rounded-2xl p-5 md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Revision debt</p>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight">
                  <AnimatedNumber value={debt.count} />
                </span>
                <span className="pb-1 text-lg font-medium text-ink-soft">topics</span>
                <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  <Timer className="size-3.5" />≈ {debt.minutes} min
                </span>
              </div>
              <p className="mt-2 max-w-md text-xs italic leading-relaxed text-ink-soft">
                The engine never claims permanent mastery — medicine always deserves one more pass.
              </p>
            </div>
            <div className="shrink-0 space-y-3 lg:w-80">
              <div className="grid grid-cols-2 gap-2">
                <DebtChip dot="bg-sev-crit" label="due now" value={counts.now} />
                <DebtChip dot="bg-sev-warn" label="soon" value={counts.soon} />
                <DebtChip dot="bg-info" label="stable" value={counts.stable} />
                <DebtChip dot="bg-sev-ok" label="mastered for now" value={counts.mastered} />
              </div>
              <Button className="min-h-11 w-full" disabled={debt.count === 0} onClick={() => setTab('concepts')}>
                CLEAR DEBT <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </section>
      </Reveal>

      {/* Tabs */}
      <Reveal index={2}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'flashcards' | 'concepts')} className="gap-4">
          <TabsList className="clay-tray h-11 w-full justify-start rounded-xl p-1 sm:w-fit">
            <TabsTrigger
              value="flashcards"
              className="clay-tab min-h-9 gap-2 rounded-lg px-4 text-xs font-semibold uppercase tracking-[0.12em]"
            >
              Flashcards
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold tabular-nums text-primary">
                {fullDeck?.length ?? 0}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="concepts"
              className="clay-tab min-h-9 gap-2 rounded-lg px-4 text-xs font-semibold uppercase tracking-[0.12em]"
            >
              Concepts due
              <span className="rounded-full bg-sev-warn/20 px-1.5 text-[10px] font-bold tabular-nums text-sev-warn">
                {dueConcepts.length}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* ── FLASHCARDS ── */}
          <TabsContent value="flashcards" className="space-y-4">
            {/* subject filter chips (only when the deck spans >1 subject) */}
            {deck && fullDeck && fullDeck.length > 0 && subjectChips.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter deck by subject">
                <button
                  type="button"
                  aria-pressed={!activeSub}
                  onClick={() => setActiveSub(null)}
                  className={cn(
                    'min-h-11 rounded-full border px-3 py-1 text-[11px] font-semibold tabular-nums transition-colors',
                    !activeSub
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  All · {fullDeck.length}
                </button>
                {subjectChips.map(([code, n]) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={activeSub === code}
                    onClick={() => setActiveSub(code)}
                    className={cn(
                      'min-h-11 rounded-full border px-3 py-1 text-[11px] font-semibold tabular-nums transition-colors',
                      activeSub === code
                        ? 'border-primary/60 bg-primary/15 text-primary'
                        : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    {code} · {n}
                  </button>
                ))}
              </div>
            )}
            {current ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-ink-soft">
                    <span>
                      card <span className="font-semibold tabular-nums text-foreground">{reviewed + 1}</span>/
                      <span className="tabular-nums">{scopeTotal}</span>
                      {activeSub && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary">
                          {activeSub}
                        </span>
                      )}
                    </span>
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">
                      Space — flip · 1–4 — grade
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <Bar pct={progressPct} className="bg-primary" delay={0.2} />
                  </div>
                </div>

                <FlipCard
                  key={current.id}
                  card={current}
                  flipped={flipped}
                  onFlip={() => setFlipped((f) => !f)}
                />

                <AnimatePresence>
                  {gradeError && (
                    <motion.div
                      key="grade-error"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit"
                      role="alert"
                    >
                      <XCircle className="size-3.5 shrink-0" />
                      Couldn&apos;t save that review — check your connection and grade again.
                    </motion.div>
                  )}
                  {feedback !== null && !gradeError && (
                    <motion.div
                      key="grade-feedback"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      aria-live="polite"
                      className="flex items-center gap-2 rounded-lg border border-sev-ok/30 bg-sev-ok/10 px-3 py-2 text-xs font-medium text-sev-ok"
                    >
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span className="capitalize">{intervalLabel(feedback)}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADES.map((g) => (
                    <button
                      key={g.label}
                      type="button"
                      disabled={grading || !flipped}
                      onClick={() => void grade(g.grade)}
                      className={cn(
                        'flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2.5 transition-colors disabled:pointer-events-none disabled:opacity-40',
                        g.classes,
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
                        {grading && <Loader2 className="size-3.5 animate-spin" />}
                        {g.label}
                      </span>
                      <span className="text-[10px] leading-tight opacity-75">{g.sub}</span>
                    </button>
                  ))}
                </div>
                {!flipped && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Recall the answer before revealing — retrieval is what strengthens memory.
                  </p>
                )}
              </>
            ) : fullDeck && fullDeck.length > 0 ? (
              /* filter exhausted but cards remain elsewhere */
              <div
                className="flex flex-col items-center gap-3 rounded-2xl border border-line/60 bg-surface-2/30 px-4 py-10 text-center"
                role="status"
              >
                <CheckCircle2 className="size-8 text-sev-ok" aria-hidden />
                <p className="text-sm font-semibold">All {activeSub} cards graded this session.</p>
                <Button size="sm" variant="outline" className="min-h-9" onClick={() => setActiveSub(null)}>
                  Show the {fullDeck.length} remaining card{fullDeck.length === 1 ? '' : 's'}
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                pop
                title="Deck clear — nothing due."
                body="The engine will resurface cards at the right moment."
              />
            )}
          </TabsContent>

          {/* ── CONCEPTS DUE ── */}
          <TabsContent value="concepts" className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Estimated recall is a model estimate of what you still remember — not a guarantee.
            </p>

            <AnimatePresence>
              {clearError && (
                <motion.div
                  key="clear-error"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit"
                  role="alert"
                >
                  <XCircle className="size-3.5 shrink-0" />
                  {clearError}
                </motion.div>
              )}
            </AnimatePresence>

            {dueConcepts.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                pop
                title="Queue clear — every concept is inside its safety window."
                body="New revision items surface here automatically as memory naturally fades. That is the system working, not slacking."
              />
            ) : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {dueConcepts.map((c) => (
                    <motion.li
                      key={c.conceptId}
                      layout
                      initial={false}
                      exit={{ opacity: 0, x: 40, transition: { duration: 0.28, ease: EASE } }}
                    >
                      <div className="flex flex-col gap-2 rounded-xl border border-line/60 bg-surface-2/40 p-3 sm:flex-row sm:items-center sm:gap-3">
                        <span
                          title={c.priority >= 3 ? 'High priority' : c.priority === 2 ? 'Medium priority' : 'Low priority'}
                          className={cn(
                            'size-2.5 shrink-0 rounded-full sm:ml-1',
                            c.priority >= 3 ? 'bg-sev-crit' : c.priority === 2 ? 'bg-sev-warn' : 'bg-info',
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => openConcept(c.conceptId)}
                          className="min-h-11 min-w-0 flex-1 rounded-lg text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-ink-soft">{c.reason}</span>
                        </button>
                        <div className="flex shrink-0 items-center gap-2 sm:w-40">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 sm:max-w-20">
                            <Bar pct={c.estRecall} delay={0.3} className={recallTone(c.estRecall)} />
                          </span>
                          <span className="w-9 text-right text-xs font-semibold tabular-nums text-ink-soft">
                            {c.estRecall}%
                          </span>
                        </div>
                        <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                          <Timer className="size-3" />
                          {c.minutes} min
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 shrink-0 font-semibold"
                          disabled={clearingId === c.conceptId}
                          onClick={() => void clearItem(c)}
                        >
                          {clearingId === c.conceptId && <Loader2 className="size-3.5 animate-spin" />}
                          REVIEWED
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            {dueConcepts.length > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Brain className="size-3.5" />
                Marking a concept reviewed strengthens its memory trace and shortens the next interval.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </Reveal>
    </div>
  )
}
