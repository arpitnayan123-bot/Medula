'use client'

// ─── LEARN VIEW — the knowledge-engine homepage ─────────────────────────────
// Hero + continue learning + next-best-action + phased curriculum explorer +
// organ systems + 3D atlas + AI-in-medicine & research band + global
// perspective + recently studied. Every section: skeleton → content → honest
// empty → error + retry. Registry data via /api/learn/*; user state via the
// same demo profile the rest of the app uses. Concepts open in the global
// ConceptExplorer (which now renders the full lesson).

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BookOpen, BrainCircuit, ChevronDown, ChevronRight, CircleDot, Clock3,
  Globe2, GraduationCap, ListChecks, Orbit, PlayCircle, RefreshCcw, Sparkles,
  Target, TrendingDown, X, Zap,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type {
  AtlasListItem, CurriculumBrowsePayload, LearnHomeClient,
  PaperExplainer, PapersListPayload,
} from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  AnimatedNumber, EmptyState, MicroLabel, Reveal, SectionTitle, SubjectGlyph,
} from '@/components/primitives/kit'
import { ScrollReveal, Stagger, StaggerItem } from '@/components/primitives/motion'
import { ContourAtlas } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'

// ── presentation-only helpers ────────────────────────────────────────────────

// Canonical SYSTEMS keys (src/lib/curriculum/taxonomy.ts) — emoji only lives
// in the presentation layer.
const SYSTEM_EMOJI: Record<string, string> = {
  cardiovascular: '🫀', respiratory: '🫁', renal: '🫘', gastrointestinal: '🍽️',
  hepatic: '🫗', endocrine: '⚖️', reproductive: '🤰', nervous: '🧠',
  musculoskeletal: '🦴', integumentary: '🧴', haematology: '🩸',
  'immune-infection': '🦠', 'head-neck-special-senses': '👁️', multisystem: '🌐',
  'frontier-ai': '🤖',
}

function prettyKey(k: string): string {
  return k.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function MasteryBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress
        value={value}
        className="h-1.5 flex-1 bg-surface-2 shadow-well [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-primary [&>[data-slot=progress-indicator]]:to-[oklch(0.62_0.105_158)]"
        aria-label={`Mastery ${value}%`}
      />
      <span className="w-9 text-right text-xs tabular-nums text-ink-soft">{value}%</span>
    </div>
  )
}

function ImportanceDots({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Importance ${n} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <CircleDot key={i} className={cn('size-2.5', i < n ? 'text-primary' : 'text-muted-foreground/30')} />
      ))}
    </span>
  )
}

function SectionHeader({ icon: Icon, title, sub }: { icon: typeof BookOpen; title: string; sub?: string }) {
  return (
    <SectionTitle icon={Icon} right={sub ? <span className="text-xs text-muted-foreground">{sub}</span> : undefined}>
      {title}
    </SectionTitle>
  )
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sev-crit/30 bg-sev-crit/5 p-4">
      <p className="text-sm text-ink-soft">{message}</p>
      <Button variant="outline" size="sm" className="ml-auto min-h-9" onClick={onRetry}>
        <RefreshCcw className="mr-1.5 size-3.5" />Retry
      </Button>
    </div>
  )
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── main view ────────────────────────────────────────────────────────────────

export function LearnView() {
  const { openConcept, setQuizPreset, setView, openLearn } = useAppStore()
  const reduceMotion = useReducedMotion()

  // ── data states (each section owns its lifecycle) ──
  const [home, setHome] = useState<LearnHomeClient | null>(null)
  const [homeError, setHomeError] = useState(false)

  const [curriculum, setCurriculum] = useState<CurriculumBrowsePayload | null>(null)
  const [curricError, setCurricError] = useState(false)

  const [atlas, setAtlas] = useState<AtlasListItem[] | null>(null)
  const [atlasError, setAtlasError] = useState(false)

  const [papers, setPapers] = useState<PaperExplainer[] | null>(null)
  const [papersNote, setPapersNote] = useState<string | null>(null)
  const [papersError, setPapersError] = useState(false)

  // ── MBBS year filter — subjects open the focused study surface ──
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all')

  // ── organ-system dim filter ──
  const [activeSystem, setActiveSystem] = useState<string | null>(null)

  // ── atlas + papers disclosure ──
  const [openAsset, setOpenAsset] = useState<string | null>(null)
  const [openPaperId, setOpenPaperId] = useState<string | null>(null)

  const aiBandRef = useRef<HTMLDivElement>(null)

  // ── loaders — all setState happens in async callbacks (retry-safe) ──
  const loadHome = useCallback(() => {
    api.learnHome()
      .then((r) => { setHome(r); setHomeError(false) })
      .catch(() => setHomeError(true))
  }, [])

  const loadCurriculum = useCallback(() => {
    api.learnCurriculum()
      .then((r) => { setCurriculum(r as CurriculumBrowsePayload); setCurricError(false) })
      .catch(() => setCurricError(true))
  }, [])

  const loadAtlas = useCallback(() => {
    api.learnAtlas()
      .then((r) => { setAtlas(r.assets); setAtlasError(false) })
      .catch(() => setAtlasError(true))
  }, [])

  const loadPapers = useCallback(() => {
    api.learnPapers()
      .then((r) => { setPapers(r.papers); setPapersNote(r.note ?? null); setPapersError(false) })
      .catch(() => setPapersError(true))
  }, [])

  useEffect(() => {
    loadHome()
    loadCurriculum()
    loadAtlas()
    loadPapers()
  }, [loadHome, loadCurriculum, loadAtlas, loadPapers])

  const openPathway = () => {
    openLearn('subject', 'ai-medicine')
    scrollToId('learn-curriculum')
  }

  const quizConcept = (conceptId: string) => {
    setQuizPreset({ conceptId, count: 5 })
    setView('questions')
  }

  const openAiSubject = curriculum?.subjects.find((s) => s.id === 'ai-medicine')

  // Year filter applies across phases; subjects with year 0 (spanning) show in "All".
  const yearFilteredSubjects = (phase: string) =>
    (curriculum?.subjects ?? []).filter(
      (s) => s.phase === phase && (yearFilter === 'all' || s.year === yearFilter || s.year === 0),
    )

  // Group curriculum subjects into rendered phases (skip phases with no subjects).
  const phaseOrder = (curriculum?.phases ?? [])
    .map((p) => p.phase)
    .filter((phase) => yearFilteredSubjects(phase).length > 0)
  const phaseLabel: Record<string, string> = Object.fromEntries(
    (curriculum?.phases ?? []).map((p) => [p.phase, p.label]),
  )

  const statChips = home
    ? [
        { label: 'Subjects', value: home.totals.subjects },
        { label: 'Topics', value: home.totals.topics },
        { label: 'Concepts', value: home.totals.concepts },
        { label: 'Full lessons', value: home.totals.lessons },
        { label: '3D models', value: home.totals.diagrams3d },
        { label: 'Papers', value: home.totals.papers },
      ]
    : []

  return (
    <div className="mx-auto max-w-6xl space-y-12 p-4 md:space-y-16 md:p-6">
      {/* ── 1 · HERO ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="learn-hero-title" className="relative">
        <ContourAtlas className="opacity-50" />
        {!reduceMotion && (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <motion.div
              className="absolute -top-16 right-[8%] size-44 rounded-full bg-primary/15 blur-3xl"
              animate={{ y: [0, 16, 0], opacity: [0.6, 0.9, 0.6] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute top-10 left-[2%] size-36 rounded-full bg-mint/15 blur-3xl"
              animate={{ y: [0, -12, 0], opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        )}

        {homeError && !home ? (
          <InlineError message="Could not load the knowledge engine overview." onRetry={loadHome} />
        ) : !home ? (
          <div className="relative z-10 space-y-4">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-14 w-56 md:h-16" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="flex flex-wrap gap-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}
            </div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative z-10">
            <MicroLabel>Knowledge engine</MicroLabel>
            <h1 id="learn-hero-title" className="mt-2 font-display text-5xl font-semibold tracking-tight md:text-6xl">
              <span className="ink-gradient">LEARN</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
              The whole MBBS curriculum as one living map — build concepts from first principles, connect them across subjects, and keep them recall-ready.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {statChips.map((c, i) => (
                <motion.span
                  key={c.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.05 }}
                  className="inline-flex items-baseline gap-1.5 rounded-full clay-in px-3 py-1.5 text-xs text-ink-soft shadow-well"
                >
                  <AnimatedNumber value={c.value} className="text-sm font-bold text-foreground" />
                  {c.label}
                </motion.span>
              ))}
            </div>
            {home.degraded && (
              <p className="mt-4 rounded-xl border border-sev-warn/40 bg-sev-warn/5 px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
                Live study data is temporarily unavailable — showing the static curriculum overview. Your progress sections will rejoin automatically.
              </p>
            )}
          </motion.div>
        )}
      </section>

      {/* ── 2 · CONTINUE LEARNING ────────────────────────────────────────── */}
      {!homeError && (
        <section aria-label="Continue learning">
          <SectionHeader icon={PlayCircle} title="Continue learning" />
          {!home ? (
            <div className="mt-4 flex gap-4 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-64 shrink-0 rounded-2xl" />)}
            </div>
          ) : home.continueLearning.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={BookOpen}
              title="Start your first concept — pick a subject below."
              action={
                <Button variant="outline" size="sm" onClick={() => scrollToId('learn-curriculum')}>
                  Browse the curriculum <ChevronRight className="ml-1 size-3.5" />
                </Button>
              }
            />
          ) : (
            <div className="med-scroll -mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
              {home.continueLearning.map((c, i) => (
                <motion.button
                  key={c.conceptId}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => openConcept(c.conceptId)}
                  className="clay clay-hover group w-64 shrink-0 snap-start rounded-2xl p-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.subjectColor }} />
                    <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{c.subjectName}</span>
                    <span className="ml-auto rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] tabular-nums text-ink-soft">
                      recall {Math.round(c.estRecall * 100)}%
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold leading-snug group-hover:text-primary">{c.conceptName}</p>
                  <div className="mt-3"><MasteryBar value={c.mastery} /></div>
                  <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">{c.reason}</p>
                </motion.button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 3 · RECOMMENDED NEXT + WEAK CONCEPTS ─────────────────────────── */}
      {!homeError && (
        <section aria-label="Recommendations">
          <SectionHeader icon={Sparkles} title="Your next move" />
          {!home ? (
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
              <Skeleton className="h-44 rounded-2xl" />
              <Skeleton className="h-44 rounded-2xl" />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
              {/* Next-best-action */}
              <Card className="clay min-w-0 rounded-2xl">
                <CardContent className="p-5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    <Target className="size-3" aria-hidden /> Recommended next
                  </p>
                  {home.recommendedNext ? (
                    <>
                      <p className="mt-2.5 text-lg font-semibold leading-snug">{home.recommendedNext.conceptName}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">{home.recommendedNext.subjectName} · exam yield {home.recommendedNext.examWeight}/5</p>
                      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{home.recommendedNext.reason}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" className="min-h-9" onClick={() => openConcept(home.recommendedNext!.conceptId)}>
                          Open concept
                        </Button>
                        <Button size="sm" variant="outline" className="min-h-9" onClick={() => quizConcept(home.recommendedNext!.conceptId)}>
                          <GraduationCap className="mr-1.5 size-3.5" /> Quiz this concept
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                      No recommendation yet — study a few concepts and this tunes itself to your graph.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Weak concepts */}
              <Card className="clay min-w-0 rounded-2xl">
                <CardContent className="p-5">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sev-crit">
                    <TrendingDown className="size-3" aria-hidden /> Weak concepts
                  </p>
                  {home.weakConcepts.length === 0 ? (
                    <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                      Nothing weak right now — attempt more questions and weak spots surface here.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {home.weakConcepts.map((w) => (
                        <li key={w.conceptId}>
                          <button
                            type="button"
                            onClick={() => openConcept(w.conceptId)}
                            className="group block w-full text-left"
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="truncate text-sm font-medium group-hover:text-primary">{w.conceptName}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-ink-soft">{w.subjectName}</span>
                            </div>
                            <div className="mt-1"><MasteryBar value={w.mastery} /></div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      )}

      {/* ── 5 · ORGAN-SYSTEM EXPLORER (chips above the curriculum) ──────── */}
      {!homeError && home && home.systems.length > 0 && (
        <section aria-label="Explore by organ system">
          <SectionHeader
            icon={Globe2}
            title="Explore by organ system"
            sub={activeSystem ? 'non-matching subjects dimmed' : 'tap to highlight across phases'}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {home.systems.map((sys) => {
              const active = activeSystem === sys.system
              return (
                <button
                  key={sys.system}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveSystem(active ? null : sys.system)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm transition-all',
                    active
                      ? 'border-primary/60 bg-primary/10 font-semibold text-foreground'
                      : 'border-line bg-surface text-ink-soft hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <span aria-hidden>{SYSTEM_EMOJI[sys.system] ?? '🧩'}</span>
                  {sys.label}
                </button>
              )
            })}
          </div>
          <AnimatePresence>
            {activeSystem && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {(() => {
                  const sys = home.systems.find((s) => s.system === activeSystem)
                  if (!sys) return null
                  const names = sys.subjects
                    .map((id) => curriculum?.subjects.find((s) => s.id === id)?.name)
                    .filter(Boolean)
                  return (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
                      <p className="text-xs leading-relaxed text-ink-soft">
                        <span className="font-semibold text-foreground">{sys.label}</span>
                        {' · '}{sys.subjectCount} subjects · {sys.topicCount} topics · {sys.conceptCount} concepts
                        {names.length > 0 && <> — in {names.join(', ')}</>}
                      </p>
                      <Button variant="ghost" size="sm" className="ml-auto min-h-8 px-2" onClick={() => setActiveSystem(null)}>
                        <X className="mr-1 size-3" /> Clear
                      </Button>
                    </div>
                  )
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* ── 4 · CURRICULUM — MBBS YEARS → SUBJECTS → STUDY SURFACES ─────── */}
      <section id="learn-curriculum" aria-label="Curriculum by MBBS year">
        <SectionHeader icon={BookOpen} title="The curriculum" sub="pick a year, open a subject, study it properly" />

        {/* MBBS year filter */}
        <div className="med-scroll -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter subjects by MBBS year">
          {(['all', 1, 2, 3, 4] as const).map((y) => (
            <button
              key={String(y)}
              type="button"
              role="tab"
              aria-selected={yearFilter === y}
              onClick={() => setYearFilter(y)}
              className={cn(
                'min-h-9 shrink-0 rounded-full border px-4 text-xs font-semibold transition-all',
                yearFilter === y
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-line bg-card text-ink-soft hover:border-primary/40 hover:text-foreground',
              )}
            >
              {y === 'all' ? 'All years' : `Year ${y}`}
            </button>
          ))}
        </div>

        {curricError && !curriculum ? (
          <div className="mt-4"><InlineError message="Could not load the curriculum map." onRetry={loadCurriculum} /></div>
        ) : !curriculum ? (
          <div className="mt-4 space-y-8">
            {Array.from({ length: 2 }).map((_, p) => (
              <div key={p} className="space-y-3">
                <Skeleton className="h-5 w-44" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          phaseOrder.map((phase) => {
            const subjects = yearFilteredSubjects(phase)
            return (
              <Reveal key={phase} index={1} className="mt-8">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight">{phaseLabel[phase] ?? prettyKey(phase)}</h3>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{subjects.length} subjects</Badge>
                  <div className="h-px flex-1 bg-line" aria-hidden />
                </div>

                <Stagger className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {subjects.map((s) => {
                    const dimmed = activeSystem !== null && !s.systems.includes(activeSystem)
                    return (
                      <StaggerItem key={s.id}>
                      <button
                        type="button"
                        onClick={() => openLearn('subject', s.id)}
                        aria-label={`Open ${s.name} study page`}
                        className={cn(
                          'clay clay-hover group min-w-0 rounded-2xl p-5 text-left',
                          dimmed && 'opacity-35 saturate-50',
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <SubjectGlyph code={s.id} name={s.name} />
                          <span className="truncate font-medium group-hover:text-primary">{s.name}</span>
                          <Badge variant="outline" className="ml-auto shrink-0 text-[9px] uppercase tracking-wider">
                            {s.year > 0 ? `Y${s.year}` : 'all'}
                          </Badge>
                          <ChevronRight className="size-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
                        </div>
                        {s.latinName && <p className="mt-1 text-xs italic text-muted-foreground">{s.latinName}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                          <span>{s.topicCount} topics</span>
                          <span>{s.conceptCount} concepts</span>
                          {s.neetWeight > 0 && <span className="rounded-full border border-line px-1.5 py-0.5">{s.neetWeight}% NEET-PG</span>}
                        </div>
                        <div className="mt-3"><MasteryBar value={s.mastery} /></div>
                      </button>
                      </StaggerItem>
                    )
                  })}
                </Stagger>
              </Reveal>
            )
          })
        )}
      </section>

      {/* ── 6 · 3D ATLAS ──────────────────────────────────────────────────── */}
      <section aria-label="3D atlas">
        <SectionHeader icon={Orbit} title="3D atlas" sub={atlas ? `${atlas.length} interactive diagrams` : undefined} />
        {atlasError && !atlas ? (
          <div className="mt-4"><InlineError message="Could not load the 3D atlas." onRetry={loadAtlas} /></div>
        ) : !atlas ? (
          <div className="med-scroll mt-4 flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 w-60 shrink-0 rounded-2xl" />)}
          </div>
        ) : atlas.length === 0 ? (
          <EmptyState className="mt-4" icon={Orbit} title="The 3D atlas is empty right now." />
        ) : (
          <>
            <div className="med-scroll -mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
              {atlas.map((a, i) => {
                const openable = a.conceptIds.length > 0
                return (
                  <motion.button
                    key={a.diagramKey}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.03, 0.15) }}
                    onClick={() => {
                      if (openable) { openConcept(a.conceptIds[0]); return }
                      setOpenAsset((cur) => (cur === a.diagramKey ? null : a.diagramKey))
                    }}
                    className="clay clay-hover w-60 shrink-0 snap-start rounded-2xl p-4 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', a.handcrafted ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                        {a.handcrafted ? 'Interactive model' : 'Layered diagram'}
                      </span>
                      <span className="ml-auto truncate text-[10px] uppercase tracking-wider text-muted-foreground">{prettyKey(a.system)}</span>
                    </div>
                    <p className="mt-2.5 line-clamp-2 min-h-10 text-sm font-semibold leading-snug">{a.title}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {a.hasQuiz && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft">Quiz</span>}
                      {a.hasSteps && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft">Guided steps</span>}
                      {!openable && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft">
                          {openAsset === a.diagramKey ? 'Hide notes' : 'Teaching notes'}
                        </span>
                      )}
                    </div>
                  </motion.button>
                )
              })}
            </div>
            {/* inline teaching-notes expand for diagrams without concept links */}
            <AnimatePresence>
              {openAsset && (() => {
                const asset = atlas.find((a) => a.diagramKey === openAsset)
                if (!asset?.teachingAnswers) return null
                const rows: [string, string][] = [
                  ['What am I looking at?', asset.teachingAnswers.whatAmILookingAt],
                  ['What does it do?', asset.teachingAnswers.whatDoesItDo],
                  ['What if it fails?', asset.teachingAnswers.whatIfItFails],
                  ['Why it matters clinically', asset.teachingAnswers.clinicalImportance],
                  ['Exam angle', asset.teachingAnswers.examAngle],
                ]
                return (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="clay mt-3 rounded-2xl p-4 md:p-5">
                      <p className="text-sm font-semibold">{asset.title}</p>
                      <div className="mt-3 space-y-2.5">
                        {rows.map(([label, body]) => (
                          <div key={label} className="clay-in rounded-xl p-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">{label}</p>
                            <p className="mt-1 text-sm leading-relaxed">{body}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )
              })()}
            </AnimatePresence>
          </>
        )}
      </section>

      {/* ── 7 · AI IN MEDICINE + RESEARCH ───────────────────────────────── */}
      <section aria-label="AI in medicine" ref={aiBandRef}>
        <ScrollReveal>
        <div className="podium rounded-3xl p-5 md:p-7">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-soft">
              <Sparkles className="size-3.5 text-gold" aria-hidden /> Frontier
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">AI in Medicine</h2>
              {home && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/45 bg-gold/15 px-3 py-1 text-xs font-semibold text-foreground">
                  <BrainCircuit className="size-3.5" aria-hidden /> {home.totals.aiConcepts} concepts · 14 topics
                </span>
              )}
            </div>
            {openAiSubject && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{openAiSubject.blurb}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="min-h-11" onClick={openPathway}>
                <Zap className="mr-2 size-4" /> Open the pathway
              </Button>
            </div>

            {/* Research & Evidence sub-band */}
            <div className="mt-6 border-t border-line pt-5">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold uppercase tracking-widest text-ink-soft">Research &amp; evidence</h3>
                <div className="h-px flex-1 bg-line" aria-hidden />
                {papers && papers.length > 0 && <span className="text-xs text-muted-foreground">{papers.length} landmark papers</span>}
              </div>

              {papersError && !papers ? (
                <div className="mt-4"><InlineError message="Could not load the research library." onRetry={loadPapers} /></div>
              ) : !papers ? (
                <div className="mt-4 space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : papers.length === 0 ? (
                <EmptyState
                  className="mt-4"
                  icon={ListChecks}
                  title={papersNote ?? 'No research-paper explainers are stored yet — this list is deliberately empty.'}
                />
              ) : (
                <div className="mt-4 space-y-2.5">
                  {papers.map((p) => (
                    <PaperRow
                      key={p.id}
                      paper={p}
                      open={openPaperId === p.id}
                      onToggle={() => setOpenPaperId((cur) => (cur === p.id ? null : p.id))}
                    />
                  ))}
                </div>
              )}
            </div>
        </div>
        </ScrollReveal>
      </section>

      {/* ── 8 · GLOBAL PERSPECTIVE ───────────────────────────────────────── */}
      <section aria-label="Explore the world">
        <SectionHeader icon={Globe2} title="Explore the world" />
        <ScrollReveal>
        <Card className="clay mt-4 rounded-2xl">
          <CardContent className="p-5 md:p-6">
            <p className="max-w-2xl text-sm leading-relaxed text-ink-soft md:text-[15px]">
              Medicine is one science practiced many ways. Lessons that carry a global layer compare how the same
              topic is named, screened, diagnosed and managed across health systems — educational comparison,
              never a ranking.
            </p>
            <p className="mt-3 text-sm font-medium">Compare India · US · UK · WHO practice differences inside lessons.</p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { region: 'India', what: 'NMC CBME structure, Indian programmes & terminology' },
                { region: 'United States', what: 'USMLE-style framing, US guideline names' },
                { region: 'United Kingdom', what: 'GMC/NICE framing, UK terminology' },
                { region: 'WHO / Global', what: 'Global guidance & low-resource context' },
              ].map((r) => (
                <div key={r.region} className="clay-in rounded-xl p-3.5">
                  <p className="text-sm font-semibold">{r.region}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{r.what}</p>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-5 min-h-11" onClick={() => scrollToId('learn-curriculum')}>
              Find global sections in the curriculum <ChevronRight className="ml-1.5 size-4" />
            </Button>
          </CardContent>
        </Card>
        </ScrollReveal>
      </section>

      {/* ── 9 · RECENTLY STUDIED ─────────────────────────────────────────── */}
      {!homeError && home && home.recentlyStudied.length > 0 && (
        <section aria-label="Recently studied">
          <SectionHeader icon={Clock3} title="Recently studied" />
          <div className="mt-4 flex flex-wrap gap-2">
            {home.recentlyStudied.map((r) => (
              <button
                key={`${r.conceptId}-${r.at}`}
                type="button"
                onClick={() => openConcept(r.conceptId)}
                className="inline-flex min-h-9 items-center rounded-full clay-in px-3 text-sm text-ink-soft transition-colors clay-hover hover:text-foreground"
              >
                {r.conceptName}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 10 · FOOTER NOTE ─────────────────────────────────────────────── */}
      <footer className="border-t border-line pb-4 pt-6">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Educational platform — content is independently synthesized for learning and is not medical advice.
          Sources &amp; further reading are shown on every lesson; always verify clinical details against current
          guidelines and standard textbooks.
        </p>
      </footer>
    </div>
  )
}

// ── paper row + explainer expand ─────────────────────────────────────────────

const EVIDENCE_TINT: Record<PaperExplainer['evidenceLevel'], string> = {
  'systematic-review': 'text-sev-ok border-sev-ok/40 bg-sev-ok/10',
  'meta-analysis': 'text-sev-ok border-sev-ok/40 bg-sev-ok/10',
  rct: 'text-sev-ok border-sev-ok/40 bg-sev-ok/10',
  cohort: 'text-sev-warn border-sev-warn/40 bg-sev-warn/10',
  'landmark-study': 'text-primary border-primary/40 bg-primary/10',
  guideline: 'text-primary border-primary/40 bg-primary/10',
  'emerging-research': 'text-sev-warn border-sev-warn/40 bg-sev-warn/10',
}

function PaperRow({ paper, open, onToggle }: { paper: PaperExplainer; open: boolean; onToggle: () => void }) {
  const sourceUrl = paper.url ?? (paper.doi ? `https://doi.org/${paper.doi}` : null)
  return (
    <div className={cn('overflow-hidden rounded-xl border transition-colors', open ? 'border-primary/40' : 'border-line')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 bg-surface-2/60 p-3.5 text-left transition-colors hover:bg-accent/40"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{paper.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{paper.authors} · {paper.year} · {paper.journal}</p>
        </div>
        <span className={cn('hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline', EVIDENCE_TINT[paper.evidenceLevel])}>
          {paper.evidenceLevel}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24 }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 border-t border-line p-4">
              <div className="callout callout-easy rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sev-ok">Explain it simply</p>
                <p className="mt-1.5 text-sm leading-relaxed">{paper.simpleExplain}</p>
              </div>
              <div className="clay-in rounded-xl p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">The question</p>
                <p className="mt-1 text-sm leading-relaxed">{paper.question}</p>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2">
                <div className="clay-in rounded-xl p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">Dataset</p>
                  <p className="mt-1 text-sm leading-relaxed">{paper.dataset}</p>
                </div>
                <div className="clay-in rounded-xl p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">Method</p>
                  <p className="mt-1 text-sm leading-relaxed">{paper.method}</p>
                </div>
              </div>
              <div className="clay-in rounded-xl p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">Result</p>
                <p className="mt-1 text-sm leading-relaxed">{paper.result}</p>
              </div>
              <div className="clay-in rounded-xl p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">What it means</p>
                <p className="mt-1 text-sm leading-relaxed">{paper.meaning}</p>
              </div>
              <div className="clay-in rounded-xl p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">Why it matters</p>
                <p className="mt-1 text-sm leading-relaxed">{paper.whyMatters}</p>
              </div>
              {paper.limitations.length > 0 && (
                <div className="callout callout-warn rounded-xl">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sev-warn">Limitations</p>
                  <ul className="mt-1.5 space-y-1">
                    {paper.limitations.map((l, i) => (
                      <li key={i} className="text-sm leading-relaxed">· {l}</li>
                    ))}
                  </ul>
                </div>
              )}
              {paper.confidenceNote && (
                <p className="text-xs italic leading-relaxed text-muted-foreground">Note: {paper.confidenceNote}</p>
              )}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Open source ↗
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
