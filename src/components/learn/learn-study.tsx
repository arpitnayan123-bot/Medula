'use client'

// ─── LEARN STUDY OVERLAY — subject & topic study surfaces (PRODUCT 01) ──────
// The focused study layer of the Learn section. Opens via openLearn(kind, id)
// from anywhere; keeps an internal stack (Subject → Topic) so navigation
// follows the MBBS hierarchy: Subject → System/Unit → Topic → Concept.
//
// Connected learning flow inside a topic:
//   Learn → Understand → Explore → Clinical Connection → Practice → Revise
// Each step is wired to an existing surface (concept explorer, question lab,
// case simulator, revise deck) and shows a measured count — 0 means the step
// is honestly disabled, never faked.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, BookOpen, Boxes, BrainCircuit, CheckCircle2, ChevronRight,
  CircleDashed, FlaskConical, GraduationCap, Layers, Lightbulb, RotateCcw, Scale,
  ShieldCheck, Sparkles, Star, Stethoscope, TriangleAlert, X, Zap, type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { LearnStatus, SubjectStudyPayload, TopicStudyPayload } from '@/lib/types'
import { Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'

// ── shared presentation helpers ─────────────────────────────────────────────

const MASTERED_COLOR = 'oklch(0.55 0.17 300)' // violet — distinct from sev-ok green

export const LEARN_STATE_COLOR: Record<LearnStatus, string> = {
  'not-started': 'var(--muted-foreground)',
  learning: 'var(--primary)',
  completed: 'var(--sev-ok)',
  'needs-revision': 'var(--sev-warn)',
  mastered: MASTERED_COLOR,
}

const LEARN_STATE_LABEL: Record<LearnStatus, string> = {
  'not-started': 'Not started',
  learning: 'Learning',
  completed: 'Completed',
  'needs-revision': 'Needs revision',
  mastered: 'Mastered',
}

const SETTABLE: Exclude<LearnStatus, 'not-started'>[] = [
  'learning', 'completed', 'needs-revision', 'mastered',
]

function StatusDot({ status, className }: { status: LearnStatus; className?: string }) {
  return (
    <span
      aria-label={LEARN_STATE_LABEL[status]}
      title={LEARN_STATE_LABEL[status]}
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: LEARN_STATE_COLOR[status] }}
    />
  )
}

/** Compact 5-state count chips — the shared progress legend. */
function StateChips({ counts, className }: { counts: Record<LearnStatus, number>; className?: string }) {
  const order: LearnStatus[] = ['learning', 'completed', 'needs-revision', 'mastered', 'not-started']
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!total) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {order.map((s) =>
        counts[s] > 0 ? (
          <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
            <StatusDot status={s} />
            {counts[s]} {LEARN_STATE_LABEL[s].toLowerCase()}
          </span>
        ) : null,
      )}
    </div>
  )
}

function ImportanceDots({ n }: { n: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" aria-label={`Importance ${n} of 5`} title={`Exam importance ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn('size-3', i <= n ? 'fill-gold text-gold' : 'text-muted-foreground/30')}
        />
      ))}
    </span>
  )
}

function SurfaceSkeleton() {
  return (
    <div className="space-y-5">
      <div className="shimmer h-4 w-40 rounded-full" />
      <div className="shimmer h-9 w-3/4 rounded-lg" />
      <div className="shimmer h-4 w-5/6 rounded" />
      <div className="flex gap-2"><div className="shimmer h-8 w-24 rounded-full" /><div className="shimmer h-8 w-28 rounded-full" /></div>
      <div className="shimmer h-24 w-full rounded-2xl" />
      <div className="shimmer h-16 w-full rounded-xl" />
      <div className="shimmer h-16 w-11/12 rounded-xl" />
      <div className="shimmer h-16 w-full rounded-xl" />
    </div>
  )
}

function SurfaceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <TriangleAlert className="size-8 text-sev-crit" />
      <p className="text-sm font-medium">Couldn&apos;t load this study surface</p>
      <p className="max-w-xs truncate text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}><RotateCcw className="size-4" /> Retry</Button>
    </div>
  )
}

// ── progress mark control ───────────────────────────────────────────────────

/** 5-state mark dropdown — shared with the ConceptExplorer footer. */
export function ProgressMark({ status, marked, onSet, size = 'sm' }: {
  status: LearnStatus | null
  marked: boolean
  onSet: (s: Exclude<LearnStatus, 'not-started'> | null) => void
  size?: 'sm' | 'xs'
}) {
  const [busy, setBusy] = useState(false)
  const current: LearnStatus = status ?? 'not-started'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        <Button
          variant="outline"
          size={size === 'xs' ? 'xs' : 'sm'}
          className={cn('gap-1.5 border-line bg-surface', size === 'xs' && 'min-h-7 px-2 text-[11px]')}
          aria-label="Set study progress"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: LEARN_STATE_COLOR[current] }} />
          {LEARN_STATE_LABEL[current]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {SETTABLE.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => { setBusy(true); onSet(s); setBusy(false) }}
            className="gap-2"
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: LEARN_STATE_COLOR[s] }} />
            Mark as {LEARN_STATE_LABEL[s].toLowerCase()}
            {current === s && <CheckCircle2 className="ml-auto size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        {marked && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setBusy(true); onSet(null); setBusy(false) }} className="gap-2 text-muted-foreground">
              <CircleDashed className="size-3.5" /> Clear mark (auto state)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── connected flow rail (Learn → … → Revise) ────────────────────────────────

interface FlowStep {
  key: string
  label: string
  icon: LucideIcon
  count: string
  note: string
  enabled: boolean
  onClick: () => void
}

function FlowRail({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="med-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {steps.map((s, i) => (
        <button
          key={s.key}
          type="button"
          disabled={!s.enabled}
          onClick={s.onClick}
          aria-label={`${s.label} — ${s.note}`}
          className={cn(
            'group relative flex min-w-[118px] flex-1 flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-all',
            s.enabled
              ? 'border-line bg-card hover:border-primary/45 hover:shadow-md hover:shadow-primary/5'
              : 'cursor-not-allowed border-line/70 bg-surface-2 opacity-60',
          )}
        >
          <span className="flex items-center gap-1.5">
            <s.icon className={cn('size-3.5', s.enabled ? 'text-primary' : 'text-muted-foreground')} />
            <span className="text-[11px] font-semibold tracking-tight">{s.label}</span>
            {i < steps.length - 1 && <ArrowRight className="ml-auto hidden size-3 text-muted-foreground/40 sm:block" aria-hidden />}
          </span>
          <span className="text-sm font-semibold tabular-nums">{s.count}</span>
          <span className="text-[10px] leading-tight text-ink-soft">{s.note}</span>
        </button>
      ))}
    </div>
  )
}

// ── TOPIC STUDY SURFACE ─────────────────────────────────────────────────────

function TopicStudy({ topicId, onBack, onOpenSubject, onOpenTopic }: {
  topicId: string
  onBack?: () => void
  onOpenSubject: (subjectId: string) => void
  onOpenTopic: (topicId: string) => void
}) {
  const openConcept = useAppStore((s) => s.openConcept)
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const closeLearn = useAppStore((s) => s.closeLearn)
  const openHub = useAppStore((s) => s.openHub)

  const [data, setData] = useState<TopicStudyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.learnTopic(topicId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load topic')
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    void load()
    scrollRef.current?.scrollTo({ top: 0 })
  }, [load])

  const conceptById = useMemo(
    () => new Map((data?.concepts ?? []).map((c) => [c.id, c])),
    [data],
  )

  const markConcept = useCallback(async (conceptId: string, status: Exclude<LearnStatus, 'not-started'> | null) => {
    // optimistic
    setData((prev) => {
      if (!prev) return prev
      const recalc = () => {
        const counts: Record<LearnStatus, number> = {
          'not-started': 0, learning: 0, completed: 0, 'needs-revision': 0, mastered: 0,
        }
        for (const c of prev.concepts) counts[c.learnStatus] += 1
        return counts
      }
      const concepts = prev.concepts.map((c) =>
        c.id === conceptId
          ? { ...c, learnStatus: (status ?? c.learnStatus) as LearnStatus, marked: status !== null }
          : c,
      )
      const next = { ...prev, concepts }
      next.statusCounts = recalc()
      return next
    })
    try {
      await api.setLearnProgress({ kind: 'concept', entityId: conceptId, status })
    } catch {
      void load() // honest rollback on failure
    }
  }, [load])

  const markTopic = useCallback(async (status: Exclude<LearnStatus, 'not-started'> | null) => {
    setData((prev) =>
      prev
        ? { ...prev, progress: { status, marked: status !== null, updatedAt: new Date().toISOString() } }
        : prev,
    )
    try {
      await api.setLearnProgress({ kind: 'topic', entityId: topicId, status })
    } catch {
      void load()
    }
  }, [topicId, load])

  if (error) return <SurfaceError message={error} onRetry={() => void load()} />
  if (loading || !data) return <SurfaceSkeleton />

  const t = data.topic
  const engaged = data.concepts.filter((c) => c.mastery > 0)
  const mastery = engaged.length
    ? Math.round(engaged.reduce((a, c) => a + c.mastery, 0) / engaged.length)
    : 0
  const firstLessonConcept = data.concepts.find((c) => c.hasLesson)
  const first3d = data.assets3d[0]
  const hasQuestions = data.flow.practice.questions > 0

  const flow: FlowStep[] = [
    {
      key: 'learn', label: 'Learn', icon: BookOpen,
      count: `${data.flow.learn.lessons}/${data.flow.learn.concepts}`,
      note: 'concepts with lessons',
      enabled: data.flow.learn.lessons > 0,
      onClick: () => document.getElementById('study-concepts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    {
      key: 'understand', label: 'Understand', icon: BrainCircuit,
      count: firstLessonConcept ? '30s' : '0',
      note: firstLessonConcept ? 'guided lesson walkthrough' : 'no lesson yet',
      enabled: !!firstLessonConcept,
      onClick: () => firstLessonConcept && openConcept(firstLessonConcept.id),
    },
    {
      key: 'explore', label: 'Explore', icon: Boxes,
      count: `${data.flow.explore.assets3d}`,
      note: '3D visualisations',
      enabled: !!first3d,
      onClick: () => first3d && first3d.conceptIds[0] && openConcept(first3d.conceptIds[0]),
    },
    {
      key: 'clinical', label: 'Clinical', icon: Stethoscope,
      count: `${data.flow.clinical.cases}`,
      note: data.flow.clinical.cases > 0
        ? 'case simulations'
        : data.flow.clinical.reasoningSteps > 0
          ? `${data.flow.clinical.reasoningSteps} reasoning steps in lessons`
          : 'no cases yet',
      enabled: data.flow.clinical.cases > 0,
      onClick: () => { closeLearn(); setView('cases') },
    },
    {
      key: 'practice', label: 'Practice', icon: GraduationCap,
      count: `${data.flow.practice.questions}`,
      note: hasQuestions ? 'exam-style questions' : 'questions coming soon',
      enabled: hasQuestions,
      onClick: () => {
        setQuizPreset({ subjectCode: t.subject.code, system: t.system ?? undefined, count: 10 })
        closeLearn()
        setView('questions')
      },
    },
    {
      key: 'revise', label: 'Revise', icon: RotateCcw,
      count: `${data.flow.revise.flashcards}`,
      note: data.flow.revise.flashcards > 0 ? 'flashcards in your deck' : 'no cards yet',
      enabled: data.flow.revise.flashcards > 0,
      onClick: () => { closeLearn(); setView('revise') },
    },
  ]

  return (
    <div ref={scrollRef} className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8 md:pt-2" id="topic-study-scroll">
        {/* breadcrumb */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
          {onBack && (
            <button type="button" onClick={onBack} className="mr-1 inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-medium transition-colors clay-hover">
              <ArrowLeft className="size-3" /> Topics
            </button>
          )}
          <button type="button" onClick={() => onOpenSubject(t.subject.id)} className="font-medium transition-colors hover:text-primary">
            {t.subject.name}
          </button>
          <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
          <span className="text-foreground">{t.name}</span>
        </div>

        {/* header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
              <span className="size-2 rounded-full" style={{ backgroundColor: t.subject.color }} />
              Year {t.subject.year > 0 ? t.subject.year : '1–4'} · {t.subject.name}
            </span>
            {t.systemLabel && <Badge variant="secondary" className="text-[10px]">{t.systemLabel}</Badge>}
            <Badge variant="outline" className="text-[10px]">{data.concepts.length} concepts</Badge>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{t.name}</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { closeLearn(); openHub(t.id) }}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                aria-label={`Open ${t.name} in the Topic Hub`}
              >
                <Sparkles className="size-3.5" /> Full hub
              </button>
              <ProgressMark
                status={data.progress.status}
                marked={data.progress.marked}
                onSet={(s) => void markTopic(s)}
              />
            </div>
          </div>
          {t.description && (
            <p className="max-w-2xl text-sm leading-relaxed text-ink-soft md:text-[15px]">{t.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-[180px] flex-1 items-center gap-2.5">
              <Progress value={mastery} className="h-1.5 flex-1" aria-label={`Mastery ${mastery}%`} />
              <span className="w-9 text-right text-xs font-semibold tabular-nums">{mastery}%</span>
            </div>
            <StateChips counts={data.statusCounts} />
          </div>
        </header>

        {/* connected flow */}
        <section aria-label="Learning flow">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">The connected flow</h2>
          <FlowRail steps={flow} />
        </section>

        {/* concepts by kind */}
        <section id="study-concepts" aria-label="Concepts" className="space-y-4 scroll-mt-20">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Concepts</h2>
            <span className="text-[11px] text-muted-foreground">tap to open the full lesson</span>
            <div className="h-px flex-1 bg-line" aria-hidden />
          </div>
          {data.groups.map((g) => (
            <div key={g.kind} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {g.label}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink-soft">{g.concepts.length}</span>
              </h3>
              <Stagger className="grid gap-2 sm:grid-cols-2">
                {g.concepts.map((cid) => {
                  const c = conceptById.get(cid)
                  if (!c) return null
                  return (
                    <StaggerItem key={c.id} className="min-w-0">
                    <div
                      className="group h-full min-w-0 rounded-xl clay p-3.5 text-left transition-all clay-hover"
                    >
                      <button
                        type="button"
                        onClick={() => openConcept(c.id)}
                        aria-label={`Open lesson ${c.name}`}
                        className="w-full text-left"
                      >
                        <span className="flex items-center gap-2">
                          <StatusDot status={c.learnStatus} />
                          <span className="truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
                          {c.examWeight >= 4 && (
                            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sev-warn">
                              <Zap className="size-2.5" /> High yield
                            </span>
                          )}
                        </span>
                        {c.oneLiner && (
                          <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-ink-soft">{c.oneLiner}</span>
                        )}
                      </button>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        {c.hasLesson && <span className="inline-flex items-center gap-0.5"><BookOpen className="size-3" /> lesson</span>}
                        {c.questionCount > 0 && <span className="inline-flex items-center gap-0.5"><GraduationCap className="size-3" /> {c.questionCount} Qs</span>}
                        {c.flashcardCount > 0 && <span className="inline-flex items-center gap-0.5"><Layers className="size-3" /> {c.flashcardCount}</span>}
                        <span className="ml-auto inline-flex items-center gap-1.5">
                          <span className="w-14"><Progress value={c.mastery} className="h-1" aria-label={`Mastery ${c.mastery}%`} /></span>
                          <span className="w-7 text-right tabular-nums">{c.mastery}%</span>
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                        <span className="text-[10px] text-muted-foreground">{LEARN_STATE_LABEL[c.learnStatus]}{c.marked ? ' · marked' : ''}</span>
                        <ProgressMark
                          size="xs"
                          status={c.learnStatus}
                          marked={c.marked}
                          onSet={(s) => void markConcept(c.id, s)}
                        />
                      </div>
                    </div>
                    </StaggerItem>
                  )
                })}
              </Stagger>
            </div>
          ))}
        </section>

        {/* key facts — aggregated only from existing lesson fields */}
        {(data.keyFacts.numbers.length > 0 || data.keyFacts.differentials.length > 0 || data.keyFacts.mistakes.length > 0 || data.keyFacts.mnemonics.length > 0) && (
          <section aria-label="Key facts" className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">High-yield facts</h2>
            {data.keyFacts.numbers.length > 0 && (
              <div className="rounded-2xl clay p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="size-3.5 text-primary" /> Numbers to remember</h3>
                <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {data.keyFacts.numbers.map((n) => (
                    <div key={n.label} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5 text-sm last:border-0">
                      <span className="text-ink-soft">{n.label}</span>
                      <span className="text-right font-semibold tabular-nums">{n.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.keyFacts.differentials.length > 0 && (
              <div className="rounded-2xl clay p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="size-3.5 text-primary" /> Don&apos;t confuse with</h3>
                <ul className="mt-2.5 space-y-1.5">
                  {data.keyFacts.differentials.map((d) => (
                    <li key={d.name} className="text-sm">
                      <span className="font-medium">{d.name}</span>
                      <span className="text-ink-soft"> — {d.key}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.keyFacts.mistakes.length > 0 && (
              <div className="callout callout-warn rounded-2xl p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><TriangleAlert className="size-3.5 text-sev-warn" /> Common mistakes</h3>
                <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed">
                  {data.keyFacts.mistakes.map((m, i) => <li key={`${i}-${m.slice(0, 24)}`} className="flex gap-2"><span className="text-sev-warn">•</span><span>{m}</span></li>)}
                </ul>
              </div>
            )}
            {data.keyFacts.mnemonics.length > 0 && (
              <div className="rounded-2xl clay p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="size-3.5 text-primary" /> Mnemonics</h3>
                <ul className="mt-2.5 space-y-2 text-sm">
                  {data.keyFacts.mnemonics.map((m) => (
                    <li key={m.hook}><span className="font-semibold text-primary">{m.hook}</span><span className="text-ink-soft"> → {m.expands}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* cases for this system */}
        {data.cases.length > 0 && (
          <section aria-label="Clinical cases" className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Clinical connection</h2>
            {data.cases.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { closeLearn(); setView('cases') }}
                className="flex w-full items-center gap-3 rounded-xl clay p-3.5 text-left transition-all hover:border-primary/45"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10"><Stethoscope className="size-4 text-primary" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.title}</span>
                  <span className="text-[11px] text-ink-soft">{c.specialty} · difficulty {c.difficulty}/3</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </section>
        )}

        {/* connected topics */}
        {data.connectedTopics.length > 0 && (
          <section aria-label="Connected topics" className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Connected topics</h2>
            <Stagger className="grid gap-2 sm:grid-cols-2">
              {data.connectedTopics.map((ct) => (
                <StaggerItem key={ct.id}>
                  <TopicLinkCard topic={ct} onOpen={() => onOpenTopic(ct.id)} />
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        )}

        {/* sources & evidence */}
        <section aria-label="Sources and evidence" className="rounded-2xl clay-in p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Sources &amp; reliability</h2>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {Object.entries(data.evidence.levels).map(([level, n]) => (
              <Badge key={level} variant="secondary" className="text-[10px]">{level} × {n}</Badge>
            ))}
            {data.evidence.lastReviewed && (
              <Badge variant="outline" className="text-[10px]">reviewed {data.evidence.lastReviewed}</Badge>
            )}
          </div>
          {data.evidence.sourceInstitutions.length > 0 && (
            <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
              Referenced from {data.evidence.sourceInstitutions.slice(0, 5).join(' · ')}
              {data.evidence.sourceInstitutions.length > 5 ? ` +${data.evidence.sourceInstitutions.length - 5} more` : ''}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Content is independently synthesized for learning — sources are attribution, never reproduction. Verify clinical decisions against current guidelines.
          </p>
        </section>
      </div>
    </div>
  )
}

function TopicLinkCard({ topic, onOpen }: {
  topic: TopicStudyPayload['connectedTopics'][number]
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full items-start gap-3 rounded-xl clay p-3.5 text-left transition-all clay-hover"
    >
      <span className="mt-0.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: topic.subjectColor }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium group-hover:text-primary">{topic.name}</span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-soft">{topic.reason}</span>
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

// ── SUBJECT STUDY SURFACE ───────────────────────────────────────────────────

function SubjectStudy({ subjectId, onOpenTopic }: {
  subjectId: string
  onOpenTopic: (topicId: string) => void
}) {
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const openLearn = useAppStore((s) => s.openLearn)

  const [data, setData] = useState<SubjectStudyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.learnSubject(subjectId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subject')
    } finally {
      setLoading(false)
    }
  }, [subjectId])

  useEffect(() => {
    void load()
    scrollRef.current?.scrollTo({ top: 0 })
  }, [load])

  if (error) return <SurfaceError message={error} onRetry={() => void load()} />
  if (loading || !data) return <SurfaceSkeleton />

  const s = data.subject
  // group topics by system for the System/Unit level of the hierarchy
  const bySystem = new Map<string, SubjectStudyPayload['topics']>()
  for (const t of data.topics) {
    const key = t.system ?? 'general'
    const list = bySystem.get(key) ?? []
    list.push(t)
    bySystem.set(key, list)
  }
  const systemOrder = [...bySystem.keys()].sort((a, b) => (a === 'general' ? 1 : b === 'general' ? -1 : 0))
  const sysLabel = (key: string) =>
    key === 'general' ? 'General' : (data.topics.find((t) => (t.system ?? 'general') === key)?.systemLabel ?? key)

  return (
    <div ref={scrollRef} className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8 md:pt-2">
        {/* header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              MBBS Year {s.year > 0 ? s.year : '1–4'} · {s.phase}
            </span>
            {s.neetWeight > 0 && <Badge variant="outline" className="text-[10px]">{s.neetWeight}% NEET-PG</Badge>}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{s.name}</h1>
              {s.latinName && <p className="mt-0.5 text-sm italic text-muted-foreground">{s.latinName}</p>}
            </div>
            <Button
              size="sm"
              className="min-h-9"
              onClick={() => { setQuizPreset({ subjectCode: s.code, count: 10 }); setView('questions') }}
            >
              <Sparkles className="mr-1.5 size-3.5" /> Quiz this subject
            </Button>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{s.blurb}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-[180px] flex-1 items-center gap-2.5">
              <Progress value={data.mastery} className="h-1.5 flex-1" aria-label={`Mastery ${data.mastery}%`} />
              <span className="w-9 text-right text-xs font-semibold tabular-nums">{data.mastery}%</span>
            </div>
            <span className="text-[11px] text-ink-soft">
              {data.counts.topics} topics · {data.counts.concepts} concepts · {data.counts.lessons} lessons
              {data.counts.questions > 0 ? ` · ${data.counts.questions} Qs` : ''}
            </span>
          </div>
          <StateChips counts={data.statusCounts} />
        </header>

        {/* topics by system/unit */}
        <section aria-label="Topics by system" className="space-y-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">Systems &amp; topics</h2>
            <div className="h-px flex-1 bg-line" aria-hidden />
          </div>
          {systemOrder.map((sysKey) => {
            const topics = bySystem.get(sysKey) ?? []
            return (
              <div key={sysKey} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  {sysLabel(sysKey)}
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink-soft">{topics.length}</span>
                </h3>
                <div className="space-y-2">
                  {topics.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenTopic(t.id)}
                      aria-label={`Open topic ${t.name}`}
                      className="group flex min-w-0 w-full items-center gap-3 rounded-xl clay p-3.5 text-left transition-all clay-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium group-hover:text-primary">{t.name}</span>
                          {t.marked && (
                            <span className="size-2 rounded-full" style={{ backgroundColor: LEARN_STATE_COLOR[(t.marked as LearnStatus)] ?? 'var(--muted-foreground)' }} title={`Marked ${t.marked}`} />
                          )}
                        </div>
                        {t.description && <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">{t.description}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span>{t.conceptCount} concepts</span>
                          {t.lessonCoverage > 0 && <span>{t.lessonCoverage} lessons</span>}
                          {t.questionCount > 0 && <span>{t.questionCount} Qs</span>}
                          {t.flashcardCount > 0 && <span>{t.flashcardCount} cards</span>}
                          <StateChips counts={t.statusCounts} className="hidden sm:flex" />
                        </div>
                      </div>
                      <ImportanceDots n={t.importance} />
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </section>

        {/* curriculum registry */}
        {data.registry.length > 0 && (
          <section aria-label="Curriculum alignment" className="rounded-2xl clay-in p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Curriculum alignment</h2>
            <ul className="mt-2.5 space-y-1.5 text-xs text-ink-soft">
              {data.registry.map((r) => (
                <li key={`${r.authority}-${r.scope}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{r.authority}</span>
                  <span>{r.scope}</span>
                  <Badge variant="outline" className="text-[9px] uppercase tracking-wide">{r.alignment}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* cross-links hint */}
        {data.topics.length === 0 && (
          <p className="rounded-xl clay-in p-4 text-sm text-ink-soft">
            Topics for this subject are being curated — check back soon.
          </p>
        )}
      </div>
    </div>
  )
}

// ── OVERLAY SHELL — focus stack + slide-over chrome ─────────────────────────

interface StackEntry { kind: 'subject' | 'topic'; id: string }

export function LearnStudyOverlay() {
  const learnFocus = useAppStore((s) => s.learnFocus)
  const closeLearn = useAppStore((s) => s.closeLearn)

  const [stack, setStack] = useState<StackEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // A new external focus resets the stack to a single base entry.
  // Render-time state adjustment (react.dev/learn/you-might-not-need-an-effect):
  // comparing against the last-seen focus avoids setState-in-effect entirely.
  const [lastFocus, setLastFocus] = useState(learnFocus)
  if (learnFocus !== lastFocus) {
    setLastFocus(learnFocus)
    setStack(learnFocus ? [{ kind: learnFocus.kind, id: learnFocus.id }] : [])
  }

  // Escape closes the whole overlay · lock body scroll while open
  useEffect(() => {
    if (!learnFocus) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLearn() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [learnFocus, closeLearn])

  const push = useCallback((kind: 'subject' | 'topic', id: string) => {
    setStack((prev) => [...prev.slice(-2), { kind, id }]) // cap depth at 3
  }, [])
  const pop = useCallback(() => setStack((prev) => prev.slice(0, -1)), [])

  const top = stack[stack.length - 1] ?? null

  const openSubject = useCallback((id: string) => push('subject', id), [push])
  const openTopic = useCallback((id: string) => push('topic', id), [push])

  return (
    <AnimatePresence>
      {learnFocus && (
        <div key="learn-study" className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeLearn}
          />
          <motion.div
            ref={scrollRef}
            role="dialog"
            aria-modal="true"
            aria-label="Learn study surface"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-line bg-background shadow-2xl"
          >
            {/* sticky chrome */}
            <div className="pointer-events-none sticky top-0 z-20 flex items-center justify-between bg-gradient-to-b from-background via-background/85 to-transparent p-3 md:p-4">
              <AnimatePresence initial={false}>
                {stack.length > 1 && (
                  <motion.span
                    key={`back-${top?.id}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    className="pointer-events-auto"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={pop}
                      className="rounded-full border-line bg-surface backdrop-blur"
                    >
                      <ArrowLeft className="size-3.5" /> Back
                    </Button>
                  </motion.span>
                )}
              </AnimatePresence>
              <Button
                variant="outline"
                size="icon"
                onClick={closeLearn}
                aria-label="Close study surface"
                className="pointer-events-auto ml-auto rounded-full border-line bg-surface backdrop-blur"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                {top && (
                  <motion.div
                    key={`${top.kind}-${top.id}`}
                    className="h-full"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.18 }}
                  >
                    {top.kind === 'subject' ? (
                      <SubjectStudy subjectId={top.id} onOpenTopic={openTopic} />
                    ) : (
                      <TopicStudy
                        topicId={top.id}
                        onBack={stack.length > 1 ? pop : undefined}
                        onOpenSubject={(sid) => {
                          // replace the topic with its subject (natural breadcrumb jump)
                          setStack((prev) => [...prev.slice(0, -1), { kind: 'subject', id: sid }])
                        }}
                        onOpenTopic={openTopic}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
