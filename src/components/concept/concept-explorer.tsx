'use client'

// ─── CONCEPT EXPLORER — full-screen slide-over for a single concept ───
// Opens via openConcept(id) from anywhere in the app (map nodes, chains, connections…).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowLeft, Biohazard, Bone, Box, Bug, ChevronDown, GraduationCap, Hand,
  Lightbulb, MessageCircle, Microscope, Pill, RotateCcw, Stethoscope, Syringe,
  Timer, TriangleAlert, X, Zap, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { KIND_META } from '@/lib/types'
import type { ConceptDetail } from '@/lib/types'
import { useAppStore } from '@/lib/store'
import { Concept3D } from '@/components/concept/concept-3d'
import { LessonSections } from '@/components/learn/lesson-sections'
import { ProgressMark } from '@/components/learn/learn-study'
import { ScrollReveal } from '@/components/primitives/motion'
import { ContourAtlas } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'
import type { LearnStatus } from '@/lib/types'

const KIND_ICONS: Record<string, LucideIcon> = {
  concept: Lightbulb,
  disease: Stethoscope,
  drug: Pill,
  investigation: Microscope,
  physiology: Activity,
  anatomy: Bone,
  pathology: Biohazard,
  pharmacology: Syringe,
  microbiology: Bug,
  clinical_skill: Hand,
}

const STATUS_COLORS: Record<string, string> = {
  strong: 'var(--sev-ok)',
  unstable: 'var(--sev-warn)',
  weak: 'var(--sev-crit)',
  new: 'var(--muted-foreground)',
}

function statusColor(s: string): string {
  return STATUS_COLORS[s] ?? 'var(--muted-foreground)'
}

function masteryColor(m: number): string {
  if (m <= 0) return 'var(--muted-foreground)'
  if (m < 45) return 'var(--sev-crit)'
  if (m < 70) return 'var(--sev-warn)'
  return 'var(--sev-ok)'
}

function prettyType(t: string): string {
  return t.replace(/_/g, ' ')
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">{children}</h3>
}

function KindBadge({ kind }: { kind: string }) {
  const meta = KIND_META[kind]
  const color = meta?.color ?? 'var(--muted-foreground)'
  const Icon = KIND_ICONS[kind]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
      }}
    >
      {Icon && <Icon className="size-3" />}
      {meta?.label ?? kind}
    </span>
  )
}

function MetaChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
      {label}
      <span className="font-semibold text-foreground">{value}/5</span>
    </span>
  )
}

function MasteryRing({ knowledge }: { knowledge: ConceptDetail['knowledge'] }) {
  const masteryPct = knowledge ? Math.max(0, Math.min(100, knowledge.score)) / 100 : 0
  const recallPct = knowledge ? Math.max(0, Math.min(1, knowledge.estRecall)) : 0
  const status = knowledge?.status ?? 'new'
  const color = statusColor(status)
  const R = 24
  const C = 2 * Math.PI * R
  return (
    <div className="flex w-[104px] shrink-0 flex-col items-center gap-1 text-center">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--muted)" strokeWidth="5" />
        <motion.circle
          cx="32" cy="32" r={R}
          fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - masteryPct) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--foreground)">
          {knowledge ? `${Math.round(masteryPct * 100)}%` : '—'}
        </text>
      </svg>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{status}</span>
      <span className="text-[9px] leading-tight text-muted-foreground">
        mastery {Math.round(masteryPct * 100)}% · recall est. {Math.round(recallPct * 100)}%
      </span>
    </div>
  )
}

function ChainCard({
  stage, currentId, onOpen,
}: { stage: ConceptDetail['whyChain'][number]; currentId: string; onOpen: (id: string) => void }) {
  const cid = stage.conceptId
  const clickable = Boolean(cid && cid !== currentId)
  const inner = (
    <>
      <span className={cn('text-[10px] font-semibold uppercase tracking-[0.16em]', clickable ? 'text-primary' : 'text-ink-soft')}>
        {stage.stage}
      </span>
      <p className="mt-1 text-sm leading-snug">{stage.label}</p>
    </>
  )
  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => cid && onOpen(cid)}
        className="block w-full rounded-xl border border-line bg-surface-2 p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 md:p-4"
      >
        {inner}
      </button>
    )
  }
  return (
    <div className={cn('rounded-xl border p-3 md:p-4', cid === currentId ? 'border-primary/40 bg-primary/5' : 'border-line bg-surface-2')}>
      {inner}
    </div>
  )
}

function EdgeList({
  title, edges, onOpen, emptyText,
}: {
  title: string
  edges: { id: string; name: string; type: string; kind: string; mastery: number }[]
  onOpen: (id: string) => void
  emptyText: string
}) {
  return (
    <div className="clay rounded-2xl p-3 md:p-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{title}</h4>
      <div className="mt-2 space-y-2">
        {edges.length === 0 && <p className="text-xs text-muted-foreground">{emptyText}</p>}
        {edges.map(e => {
          const color = KIND_META[e.kind]?.color ?? 'var(--muted-foreground)'
          return (
            <button
              key={`${e.id}-${e.type}`}
              type="button"
              onClick={() => onOpen(e.id)}
              className="block w-full rounded-xl border border-transparent bg-background/60 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="truncate text-sm font-medium">{e.name}</span>
                </span>
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-soft">
                  {prettyType(e.type)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, e.mastery))}%`, backgroundColor: masteryColor(e.mastery) }}
                  />
                </div>
                <span className="w-8 text-right text-[10px] text-muted-foreground">{e.mastery}%</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FlipCard({
  card, code, flipped, onFlip,
}: { card: ConceptDetail['flashcards'][number]; code: string; flipped: boolean; onFlip: () => void }) {
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label="Flip flashcard"
      className="group h-44 w-[270px] shrink-0 snap-start text-left [perspective:1200px]"
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
      >
        <div className="absolute inset-0 flex flex-col rounded-2xl border border-line bg-surface-2 p-4 [backface-visibility:hidden]">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">{code}</span>
          <p className="mt-2 flex-1 text-sm font-medium leading-snug">{card.front}</p>
          <span className="text-[10px] text-muted-foreground transition-colors group-hover:text-ink-soft">tap to flip</span>
        </div>
        <div className="absolute inset-0 flex flex-col rounded-2xl border border-primary/30 bg-primary/10 p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Answer</span>
          <p className="mt-2 flex-1 text-xs leading-relaxed">{card.back}</p>
          <span className="text-[10px] text-muted-foreground">tap to flip back</span>
        </div>
      </motion.div>
    </button>
  )
}

function ExplorerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="shimmer h-6 w-40 rounded-full" />
        <div className="shimmer h-9 w-3/4 rounded-lg" />
        <div className="shimmer h-4 w-full rounded" />
        <div className="shimmer h-4 w-5/6 rounded" />
        <div className="flex gap-2 pt-1">
          <div className="shimmer h-9 w-28 rounded-md" />
          <div className="shimmer h-9 w-36 rounded-md" />
        </div>
      </div>
      <div className="shimmer h-24 w-full rounded-2xl" />
      <div className="shimmer h-16 w-full rounded-xl" />
      <div className="shimmer h-16 w-11/12 rounded-xl" />
      <div className="shimmer h-40 w-full rounded-2xl" />
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
      <TriangleAlert className="size-8 text-sev-crit" />
      <p className="text-sm font-medium">Couldn&apos;t load this concept</p>
      <p className="max-w-xs truncate text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw className="size-4" /> Retry
      </Button>
    </div>
  )
}

export function ConceptExplorer() {
  const conceptFocus = useAppStore(s => s.conceptFocus)
  const closeConcept = useAppStore(s => s.closeConcept)
  const setView = useAppStore(s => s.setView)
  const openConcept = useAppStore(s => s.openConcept)
  const setQuizPreset = useAppStore(s => s.setQuizPreset)

  const [detail, setDetail] = useState<ConceptDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visited, setVisited] = useState<{ id: string; name: string }[]>([])
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  const [show3d, setShow3d] = useState(false)
  // 5-state study progress (Learn layer) — resolved from the progress API
  const [learnStatus, setLearnStatus] = useState<LearnStatus>('not-started')
  const [learnMarked, setLearnMarked] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<{ mode: 'push'; from: { id: string; name: string } } | { mode: 'pop' } | null>(null)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.concept(id)
      const nav = navRef.current
      navRef.current = null
      if (nav?.mode === 'push') setVisited(v => [...v, nav.from])
      else if (!nav) setVisited([])
      setDetail(d)
      setFlipped({})
      setShow3d(false)
      // resolved 5-state status (mark ?? analytics) — non-fatal if it fails
      api.learnConceptProgress(id)
        .then((p) => { setLearnStatus(p.status); setLearnMarked(p.marked !== null) })
        .catch(() => { /* explorer still renders without the mark */ })
    } catch (e) {
      navRef.current = null
      setError(e instanceof Error ? e.message : 'Failed to load concept')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (conceptFocus) {
      void load(conceptFocus)
      scrollRef.current?.scrollTo({ top: 0 })
    } else {
      setDetail(null)
      setError(null)
      setVisited([])
      navRef.current = null
    }
  }, [conceptFocus, load])

  // Escape closes · lock body scroll while open
  useEffect(() => {
    if (!conceptFocus) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeConcept() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [conceptFocus, closeConcept])

  const navigateTo = useCallback((id: string) => {
    if (!detail || id === detail.id) return
    navRef.current = { mode: 'push', from: { id: detail.id, name: detail.name } }
    openConcept(id)
  }, [detail, openConcept])

  const goBack = useCallback(() => {
    if (!visited.length) return
    const prev = visited[visited.length - 1]
    navRef.current = { mode: 'pop' }
    setVisited(v => v.slice(0, -1))
    openConcept(prev.id)
  }, [visited, openConcept])

  const quizMe = useCallback(() => {
    if (!detail) return
    setQuizPreset({ conceptId: detail.id, count: 6 })
    setView('questions')
    closeConcept()
  }, [detail, setQuizPreset, setView, closeConcept])

  const markConcept = useCallback((status: Exclude<LearnStatus, 'not-started'> | null) => {
    if (!detail) return
    setLearnMarked(status !== null)
    if (status) setLearnStatus(status)
    api.setLearnProgress({ kind: 'concept', entityId: detail.id, status }).catch(() => { /* silent — analytics state remains */ })
  }, [detail])

  // 'Test me' from the 30-second lesson card — 5 questions per the lesson spec
  const lessonQuizMe = useCallback(() => {
    if (!detail) return
    setQuizPreset({ conceptId: detail.id, count: 5 })
    setView('questions')
    closeConcept()
  }, [detail, setQuizPreset, setView, closeConcept])

  const practiceNow = useCallback(() => {
    if (!detail) return
    setQuizPreset({ conceptId: detail.id, count: 6 })
    closeConcept()
    setView('questions')
  }, [detail, setQuizPreset, setView, closeConcept])

  const askTutor = useCallback(() => {
    // Hand the concept over to the tutor so it opens with context, then close the explorer
    try {
      if (detail?.name) sessionStorage.setItem('medos:tutor-question', `Explain "${detail.name}" (${detail.kind}) — build it up from its foundation and show the clinical connections.`)
    } catch { /* storage unavailable */ }
    closeConcept()
    setView('tutor')
  }, [setView, detail, closeConcept])

  return (
    <AnimatePresence>
      {conceptFocus && (
        <div key="concept-explorer" className="fixed inset-0 z-50">
          {/* backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeConcept}
          />
          {/* panel */}
          <motion.div
            ref={scrollRef}
            role="dialog"
            aria-modal="true"
            aria-label={detail?.name ?? 'Concept explorer'}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="absolute inset-y-0 right-0 w-full max-w-3xl overflow-y-auto border-l border-line bg-background shadow-2xl"
          >
            {/* sticky close */}
            <div className="pointer-events-none sticky top-0 z-20 flex justify-end bg-gradient-to-b from-background via-background/85 to-transparent p-3 md:p-4">
              <Button
                variant="outline"
                size="icon"
                onClick={closeConcept}
                aria-label="Close explorer"
                className="pointer-events-auto rounded-full border-line bg-surface backdrop-blur"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="p-4 md:p-8 md:pt-2">
              {error ? (
                <ErrorState message={error} onRetry={() => conceptFocus && void load(conceptFocus)} />
              ) : loading || !detail ? (
                <ExplorerSkeleton />
              ) : (
                <div className="space-y-6 pb-6">
                  {/* breadcrumb trail of visited concepts */}
                  {visited.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                      <button
                        type="button"
                        onClick={goBack}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-medium transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        <ArrowLeft className="size-3" /> Back
                      </button>
                      <span className="text-muted-foreground">Trail:</span>
                      {visited.map((v, i) => (
                        <span key={`${v.id}-${i}`} className="inline-flex items-center gap-2">
                          {i > 0 && <span className="text-muted-foreground">·</span>}
                          <span className={cn('max-w-[150px] truncate', i === visited.length - 1 && 'font-medium text-foreground')}>
                            {v.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 1 · HEADER — Atlas contours drift under the title */}
                  <div className="relative">
                    <ContourAtlas opacity={0.4} />
                    <header className="relative z-10 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <KindBadge kind={detail.kind} />
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
                        <span className="size-2 rounded-full" style={{ backgroundColor: detail.topic.subject.color }} />
                        {detail.topic.subject.name} · {detail.topic.name}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{detail.name}</h1>
                      <MasteryRing knowledge={detail.knowledge} />
                    </div>
                    <p className="text-sm leading-relaxed text-ink-soft md:text-[15px]">{detail.summary}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={quizMe}>
                        <GraduationCap className="size-4" /> Quiz me
                      </Button>
                      <Button variant="outline" onClick={askTutor}>
                        <MessageCircle className="size-4" /> Ask AI Tutor
                      </Button>
                      <ProgressMark
                        status={learnStatus}
                        marked={learnMarked}
                        onSet={markConcept}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <MetaChip label="Difficulty" value={detail.difficulty} />
                      <MetaChip label="Exam relevance" value={detail.examRelevance} />
                      <MetaChip label="Clinical relevance" value={detail.clinicalRelevance} />
                    </div>
                  </header>
                  </div>

                  {/* 1b · 30-SECOND VERSION — pinned, from the full lesson */}
                  {detail.lesson && (
                    <section className="clay-in flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:gap-5 md:p-5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                          <Timer className="size-3" aria-hidden /> 30-second version
                        </p>
                        <p className="mt-2 text-sm leading-relaxed md:text-[15px]">{detail.lesson.explain30s}</p>
                      </div>
                      <Button onClick={lessonQuizMe} className="shrink-0 tracking-wide">
                        <Zap className="mr-1.5 size-4" /> Test me
                      </Button>
                    </section>
                  )}

                  {/* 1c · FULL LESSON — structured curriculum content (replaces the
                      legacy why-matters / detail / mnemonic sections when present) */}
                  {detail.lesson && (
                    <LessonSections lesson={detail.lesson} compact onOpenConcept={navigateTo} />
                  )}

                  {/* 2 · WHY THIS MATTERS — legacy rendering, kept when no lesson */}
                  {!detail.lesson && (
                    <section className="rounded-2xl border border-line border-l-4 border-l-primary bg-surface-2 p-4 md:p-5">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Why this matters</h3>
                      {detail.whyMatters ? (
                        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{detail.whyMatters}</p>
                      ) : (
                        <p className="mt-2 text-sm italic leading-relaxed text-muted-foreground">
                          Anchor concept of {detail.topic.name} — {detail.summary}
                        </p>
                      )}
                    </section>
                  )}

                  {/* 2b · 3D VISUAL — every topic as a layered 3D diagram */}
                  <ScrollReveal>
                  <section className="clay overflow-hidden rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setShow3d(v => !v)}
                      aria-expanded={show3d}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40 md:p-5"
                    >
                      <span aria-hidden className="clay-in grid size-11 shrink-0 place-items-center rounded-2xl text-primary">
                        <Box className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-primary">3D visual</span>
                        <span className="mt-0.5 block text-sm font-semibold">
                          {show3d ? 'Hide the 3D diagram' : 'See this topic as a 3D diagram'}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-soft">
                          Floating layers, simple one-line explanations — rotate and tap any layer.
                        </span>
                      </span>
                      <ChevronDown className={cn('size-5 shrink-0 text-ink-soft transition-transform', show3d && 'rotate-180')} />
                    </button>
                    {show3d && detail && (
                      <motion.div
                        initial={false}
                        animate={{ opacity: 1 }}
                        className="border-t border-line p-4 md:p-5"
                      >
                        <Concept3D key={detail.id} detail={detail} />
                      </motion.div>
                    )}
                  </section>
                  </ScrollReveal>

                  {/* 3 · HOW THIS CONNECTS */}
                  {detail.whyChain.length > 0 && (
                    <section>
                      <SectionTitle>How this connects</SectionTitle>
                      <div className="mt-3">
                        {detail.whyChain.map((stage, i) => (
                          <div key={`${stage.stage}-${i}`}>
                            {i > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-30px' }}
                                transition={{ duration: 0.25, delay: 0.04 * i }}
                                className="flex justify-center py-0.5 text-muted-foreground"
                              >
                                <ChevronDown className="size-4" />
                              </motion.div>
                            )}
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              whileInView={{ opacity: 1, y: 0 }}
                              viewport={{ once: true, margin: '-30px' }}
                              transition={{ duration: 0.3, delay: 0.04 * i }}
                            >
                              <ChainCard stage={stage} currentId={detail.id} onOpen={navigateTo} />
                            </motion.div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* 4 · DETAIL SECTIONS — legacy rendering, kept when no lesson */}
                  {!detail.lesson && detail.detail && detail.detail.length > 0 && (
                    <section className="space-y-5">
                      <SectionTitle>Deep dive</SectionTitle>
                      {detail.detail.map((sec, i) => (
                        <div key={`${sec.h}-${i}`}>
                          <h3 className="flex items-center gap-2 text-sm font-semibold md:text-[15px]">
                            <span className="inline-block size-1.5 rounded-full bg-primary" />
                            {sec.h}
                          </h3>
                          {sec.body && sec.body.length > 0 && (
                            <div className="medprose mt-2 text-sm text-ink-soft">
                              {sec.body.map((p, j) => <p key={j}>{p}</p>)}
                            </div>
                          )}
                          {sec.table && (
                            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                              <table className="w-full text-left text-xs md:text-sm">
                                <thead>
                                  <tr className="bg-surface-2">
                                    {sec.table.headers.map(h => (
                                      <th key={h} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sec.table.rows.map((row, ri) => (
                                    <tr key={ri} className="border-t border-line">
                                      {row.map((cell, ci) => (
                                        <td key={ci} className={cn('px-3 py-2 align-top', ci === 0 && 'font-medium')}>{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </section>
                  )}

                  {/* 5 · CONNECTIONS */}
                  <ScrollReveal className="space-y-3">
                  <section className="space-y-3">
                    <SectionTitle>Connections</SectionTitle>
                    <div className="grid gap-4 md:grid-cols-2">
                      <EdgeList
                        title="Foundation & inputs"
                        edges={detail.edgesIn.map(e => ({ id: e.from, name: e.fromName, type: e.type, kind: e.kind, mastery: e.mastery }))}
                        onOpen={navigateTo}
                        emptyText="No foundation links mapped yet."
                      />
                      <EdgeList
                        title="Leads to & applied in"
                        edges={detail.edgesOut.map(e => ({ id: e.to, name: e.toName, type: e.type, kind: e.kind, mastery: e.mastery }))}
                        onOpen={navigateTo}
                        emptyText="No forward links mapped yet."
                      />
                    </div>
                  </section>
                  </ScrollReveal>

                  {/* 6 · FLASHCARDS */}
                  {detail.flashcards.length > 0 && (
                    <ScrollReveal>
                    <section>
                      <SectionTitle>Flashcards · {detail.flashcards.length}</SectionTitle>
                      <div className="-mx-4 mt-3 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
                        {detail.flashcards.map(fc => (
                          <FlipCard
                            key={fc.id}
                            card={fc}
                            code={detail.topic.subject.code}
                            flipped={!!flipped[fc.id]}
                            onFlip={() => setFlipped(f => ({ ...f, [fc.id]: !f[fc.id] }))}
                          />
                        ))}
                      </div>
                    </section>
                    </ScrollReveal>
                  )}

                  {/* 7 · QUESTION BANK */}
                  <ScrollReveal>
                  <section className="clay flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between md:p-5">
                    <div>
                      <h3 className="text-sm font-semibold">Question bank</h3>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        This concept has {detail.questionCount} linked question{detail.questionCount === 1 ? '' : 's'}.
                      </p>
                    </div>
                    <Button onClick={practiceNow} className="shrink-0 tracking-wide">PRACTICE NOW</Button>
                  </section>
                  </ScrollReveal>

                  {/* 8 · MNEMONIC — legacy rendering, kept when no lesson */}
                  {!detail.lesson && detail.mnemonic && (
                    <ScrollReveal>
                    <section className="flex gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-gold" />
                      <div>
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Mnemonic</h3>
                        <p className="mt-1 text-sm leading-relaxed">{detail.mnemonic}</p>
                      </div>
                    </section>
                    </ScrollReveal>
                  )}

                  {/* 9 · DISCLAIMER */}
                  <footer className="border-t border-line pb-2 pt-4">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Learning analytics indicator — not a measure of clinical competence. Educational content — always verify against standard textbooks.
                    </p>
                  </footer>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
