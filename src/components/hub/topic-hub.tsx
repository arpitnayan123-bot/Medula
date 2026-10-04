'use client'

// ─── TOPIC HUB — ONE TOPIC, EVERYTHING (PRODUCT 02) ─────────────────────────
// A single focused learning hub for one medical topic. Sections:
//   Overview · Learn · Watch · Read · Practice · Cases · Revise ·
//   Performance · AI · Connected
// Every count is measured; zero means zero. Watch embeds the platform's own
// living 3D scenes; external resources are honest search deep-links, never
// fabricated embeds. Future systems (AI Tutor, adaptive MCQs, mistake &
// revision engines, knowledge graph, planner) plug into the section rail.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, BookOpen, Boxes, BrainCircuit, CheckCircle2,
  ChevronRight, CircleDashed, FlaskConical, GraduationCap, Layers, Lightbulb,
  MonitorPlay, Pause, Play, RotateCcw, Scale, ShieldCheck, Sparkles, Stethoscope, Target,
  TriangleAlert, Zap, type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { LEARN_STATE_COLOR, ProgressMark } from '@/components/learn/learn-study'
import { useAppStore } from '@/lib/store'
import type { HubTopicPayload, LearnStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { LIVE_SCENES, type SceneId } from '@/components/understand/live-scenes'
import { ALL_UNDERSTAND } from '@/lib/understand-registry'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const TUTOR_QUESTION_KEY = 'medos:tutor-question'

type SectionKey =
  | 'overview' | 'learn' | 'watch' | 'read' | 'practice'
  | 'cases' | 'revise' | 'performance' | 'ai' | 'connected'

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: Target },
  { key: 'learn', label: 'Learn', icon: BookOpen },
  { key: 'watch', label: 'Watch', icon: MonitorPlay },
  { key: 'read', label: 'Read', icon: Layers },
  { key: 'practice', label: 'Practice', icon: GraduationCap },
  { key: 'cases', label: 'Cases', icon: Stethoscope },
  { key: 'revise', label: 'Revise', icon: RotateCcw },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'connected', label: 'Connected', icon: Boxes },
]

const STATE_LABEL: Record<LearnStatus, string> = {
  'not-started': 'Not started', learning: 'Learning', completed: 'Completed',
  'needs-revision': 'Needs revision', mastered: 'Mastered',
}

// The Understand catalog entry for an embedded Watch scene (client-side — the
// catalog is pure data shared with the Understand view).
const CATALOG_BY_ID = new Map(ALL_UNDERSTAND.map((t) => [t.id, t]))

export function TopicHub({ topicId, conceptId, onClose }: {
  topicId: string
  conceptId: string | null
  onClose: () => void
}) {
  const openConcept = useAppStore((s) => s.openConcept)
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const openHub = useAppStore((s) => s.openHub)

  const [data, setData] = useState<HubTopicPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<SectionKey>('overview')
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.hubTopic(topicId, conceptId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the topic hub')
    } finally {
      setLoading(false)
    }
  }, [topicId, conceptId])

  useEffect(() => {
    void load()
    window.scrollTo({ top: 0 })
  }, [load])

  const markTopic = useCallback(async (status: Exclude<LearnStatus, 'not-started'> | null) => {
    setData((prev) =>
      prev ? { ...prev, progress: { status, marked: status !== null, updatedAt: new Date().toISOString() } } : prev,
    )
    try {
      await api.setLearnProgress({ kind: 'topic', entityId: topicId, status })
    } catch {
      void load()
    }
  }, [topicId, load])

  const goToSection = useCallback((k: SectionKey) => {
    setSection(k)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const askTutor = useCallback((prompt: string) => {
    // The tutor consumes this key from sessionStorage on mount.
    try { window.sessionStorage.setItem(TUTOR_QUESTION_KEY, prompt) } catch { /* private mode */ }
    setView('tutor')
  }, [setView])

  const practice = useCallback((extra?: { qtype?: string; count?: number }) => {
    setQuizPreset({
      topicId,
      subjectCode: data?.topic.subject.code,
      system: data?.topic.system ?? undefined,
      count: extra?.count ?? 10,
      ...extra,
    })
    setView('questions')
  }, [setQuizPreset, setView, topicId, data])

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <TriangleAlert className="size-6 text-amber-500" />
        <p className="text-sm text-ink-soft">{error}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Back to hub home</Button>
          <Button size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      </div>
    )
  }
  if (loading || !data) return <HubSkeleton />

  const t = data.topic
  const atGlance = data.atGlance

  return (
    <div ref={scrollRef} className="pb-safe-nav px-4 md:px-8">
      {/* sticky hub bar — full-bleed via negative margin against the view padding */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-background/85 px-4 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="flex items-center gap-2 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ArrowLeft className="size-3" /> All topics
          </button>
          <span className="min-w-0 truncate text-xs text-ink-soft">
            {t.subject.name} <ChevronRight className="inline size-3" aria-hidden /> <span className="font-medium text-foreground">{t.name}</span>
          </span>
        </div>
        {/* section rail — the hub's spine */}
        <nav aria-label="Hub sections" className="scrollbar-none flex gap-1 overflow-x-auto py-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            const active = section === s.key
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => goToSection(s.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                    : 'text-ink-soft hover:bg-surface-2 hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {s.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="space-y-6 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {section === 'overview' && (
              <OverviewSection data={data} onGo={goToSection} onMark={markTopic} onOpenConcept={openConcept} />
            )}
            {section === 'learn' && <LearnSection data={data} onOpenConcept={openConcept} />}
            {section === 'watch' && <WatchSection data={data} />}
            {section === 'read' && <ReadSection data={data} onOpenConcept={openConcept} />}
            {section === 'practice' && <PracticeSection data={data} onPractice={practice} />}
            {section === 'cases' && (
              <CasesSection data={data} onOpenCases={() => { setView('cases') }} />
            )}
            {section === 'revise' && (
              <ReviseSection
                data={data}
                onDrillPair={(pairId) => { setQuizPreset({ pairId, count: 6 }); setView('questions') }}
              />
            )}
            {section === 'performance' && <PerformanceSection data={data} onPractice={() => practice({ count: 10 })} onGo={goToSection} />}
            {section === 'ai' && <AiSection data={data} onAsk={askTutor} onQuiz={() => practice({ count: 8 })} />}
            {section === 'connected' && <ConnectedSection data={data} onOpenHub={openHub} />}
          </motion.div>
        </AnimatePresence>

        {/* sources & evidence — always present, quiet */}
        <section aria-label="Sources and evidence" className="rounded-2xl border border-line bg-surface-2 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Sources &amp; reliability</h2>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {Object.entries(data.evidence.levels).map(([level, n]) => (
              <Badge key={level} variant="secondary" className="text-[10px]">{level} × {n}</Badge>
            ))}
            {data.evidence.lastReviewed && (
              <Badge variant="outline" className="text-[10px]">reviewed {data.evidence.lastReviewed}</Badge>
            )}
            <Badge variant="outline" className="text-[10px]">{data.evidence.sourcesCount} sources</Badge>
          </div>
          {data.evidence.sourceInstitutions.length > 0 && (
            <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
              Referenced from {data.evidence.sourceInstitutions.slice(0, 5).join(' · ')}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Content is independently synthesized for learning — external links open real libraries (StatPearls, Radiopaedia, Wikipedia) as searches, never copied text. Verify clinical decisions against current guidelines.
          </p>
        </section>

        {/* at-a-glance strip — sticky above the mobile nav, switches sections */}
        <div aria-label="Jump to section" className="sticky bottom-16 z-20 pb-3 lg:bottom-3">
          <div className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-background/92 p-1.5 shadow-lg shadow-primary/5 backdrop-blur-xl scrollbar-none">
            {(
              [
                { k: 'learn' as const, label: 'Learn', n: atGlance.concepts, icon: BookOpen },
                { k: 'watch' as const, label: 'Watch', n: atGlance.scenes, icon: MonitorPlay },
                { k: 'read' as const, label: 'Read', n: atGlance.notes, icon: Layers },
                { k: 'practice' as const, label: 'Practice', n: atGlance.questions, icon: GraduationCap },
                { k: 'cases' as const, label: 'Cases', n: atGlance.cases, icon: Stethoscope },
                { k: 'revise' as const, label: 'Revise', n: atGlance.flashcards, icon: RotateCcw },
              ] satisfies { k: SectionKey; label: string; n: number; icon: LucideIcon }[]
            ).map(({ k, label, n, icon: Icon }) => (
              <button
                key={k}
                type="button"
                onClick={() => goToSection(k)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <Icon className="size-3.5" />
                <span className="font-semibold tabular-nums text-foreground">{n}</span>
                <span className="hidden sm:inline">{label}</span>
                {k === 'revise' && atGlance.dueCards > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 text-[9px] font-bold tabular-nums text-amber-700">{atGlance.dueCards} due</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────
function OverviewSection({ data, onGo, onMark, onOpenConcept }: {
  data: HubTopicPayload
  onGo: (k: SectionKey) => void
  onMark: (s: Exclude<LearnStatus, 'not-started'> | null) => void
  onOpenConcept: (id: string) => void
}) {
  const t = data.topic
  const firstLesson = data.learn.concepts.find((c) => c.hasLesson)
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
            <span className="size-2 rounded-full" style={{ backgroundColor: t.subject.color }} />
            Year {t.subject.year > 0 ? t.subject.year : '1–4'} · {t.subject.name}
          </span>
          {t.systemLabel && <Badge variant="secondary" className="text-[10px]">{t.systemLabel}</Badge>}
          <Badge variant="outline" className="text-[10px]">Importance {t.importance}/5</Badge>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{t.name}</h1>
          <ProgressMark
            status={data.progress.status}
            marked={data.progress.marked}
            onSet={(s) => void onMark(s)}
          />
        </div>
        {t.description && <p className="max-w-2xl text-sm leading-relaxed text-ink-soft md:text-[15px]">{t.description}</p>}
        <div className="flex max-w-md items-center gap-2.5">
          <Progress value={data.mastery} className="h-1.5 flex-1" aria-label={`Mastery ${data.mastery}%`} />
          <span className="w-9 text-right text-xs font-semibold tabular-nums">{data.mastery}%</span>
        </div>
      </header>

      {data.focusConcept && (
        <div className="rounded-2xl border border-primary/35 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <Target className="size-3.5" /> Your search
          </div>
          <h2 className="mt-1.5 text-lg font-semibold">{data.focusConcept.name}</h2>
          {data.focusConcept.summary && (
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{data.focusConcept.summary}</p>
          )}
          {data.focusConcept.whyMatters && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{data.focusConcept.whyMatters}</p>
          )}
          <Button size="sm" className="mt-3" onClick={() => onOpenConcept(data.focusConcept!.id)}>
            Open the full lesson <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}

      {/* start-here row */}
      <div className="grid gap-2 sm:grid-cols-3">
        <StartCard
          icon={BookOpen} label="Understand it" sub={firstLesson ? 'Open the first lesson' : 'Explore the concepts'}
          enabled onClick={() => (firstLesson ? onOpenConcept(firstLesson.id) : onGo('learn'))}
        />
        <StartCard
          icon={GraduationCap} label="Practice it" sub={data.practice.questions > 0 ? `${data.practice.questions} questions ready` : 'questions coming soon'}
          enabled={data.practice.questions > 0} onClick={() => onGo('practice')}
        />
        <StartCard
          icon={RotateCcw} label="Revise it" sub={data.atGlance.dueCards > 0 ? `${data.atGlance.dueCards} cards due now` : `${data.revise.flashcards} flashcards`}
          enabled={data.revise.flashcards > 0} onClick={() => onGo('revise')}
        />
      </div>

      {/* high-yield teaser */}
      <HighYieldTeaser data={data} onGo={onGo} />
    </div>
  )
}

function StartCard({ icon: Icon, label, sub, enabled, onClick }: {
  icon: LucideIcon; label: string; sub: string; enabled: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-left transition-all',
        enabled ? 'hover:border-primary/45 hover:shadow-md hover:shadow-primary/5' : 'opacity-55',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10"><Icon className="size-4 text-primary" /></span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-[11px] text-ink-soft">{sub}</span>
      </span>
    </button>
  )
}

function HighYieldTeaser({ data, onGo }: { data: HubTopicPayload; onGo: (k: SectionKey) => void }) {
  const facts = data.read.keyFacts
  const hasAny = facts.numbers.length > 0 || facts.differentials.length > 0 || facts.mnemonics.length > 0 || facts.mistakes.length > 0
  if (!hasAny) return null
  return (
    <section aria-label="High-yield preview" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Zap className="size-4 text-amber-500" /> High-yield preview</h2>
        <button type="button" onClick={() => onGo('read')} className="ml-auto text-xs font-medium text-primary hover:underline">open Read <ChevronRight className="inline size-3" /></button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {facts.numbers.slice(0, 4).map((n) => (
          <div key={n.label} className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm">
            <span className="text-ink-soft">{n.label}</span>
            <span className="float-right font-semibold tabular-nums">{n.value}</span>
          </div>
        ))}
        {facts.differentials.slice(0, 4).map((d) => (
          <div key={d.name} className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm">
            <span className="font-medium">{d.name}</span>
            <span className="text-ink-soft"> — {d.key}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Learn ───────────────────────────────────────────────────────────────────
function LearnSection({ data, onOpenConcept }: {
  data: HubTopicPayload
  onOpenConcept: (id: string) => void
}) {
  const conceptById = useMemo(() => new Map(data.learn.concepts.map((c) => [c.id, c])), [data])
  return (
    <div className="space-y-5">
      <SectionIntro
        title="Learn"
        sub="Concepts in exam order — tap any to open the full lesson, mark your progress as you go."
      />
      {data.learn.groups.map((g) => (
        <div key={g.kind} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {g.label}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink-soft">{g.concepts.length}</span>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.concepts.map((cid) => {
              const c = conceptById.get(cid)
              if (!c) return null
              const isFocus = data.focusConcept?.id === c.id
              return (
                <ConceptHubCard
                  key={c.id}
                  concept={c}
                  isFocus={isFocus}
                  onOpen={() => onOpenConcept(c.id)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function ConceptHubCard({ concept: c, isFocus, onOpen }: {
  concept: HubTopicPayload['learn']['concepts'][number]
  isFocus: boolean
  onOpen: () => void
}) {
  const [optimistic, setOptimistic] = useState<LearnStatus | null>(null)
  const status = optimistic ?? c.learnStatus
  return (
    <div
      className={cn(
        'group min-w-0 rounded-xl border bg-card p-3.5 transition-all hover:border-primary/45 hover:shadow-md hover:shadow-primary/5',
        isFocus ? 'border-primary/50' : 'border-line',
      )}
    >
      <button type="button" onClick={onOpen} aria-label={`Open lesson ${c.name}`} className="w-full text-left">
        <span className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: status === 'not-started' ? undefined : LEARN_STATE_COLOR[status] }}
            aria-hidden
          />
          <span className="truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
          {isFocus && <Badge className="ml-auto shrink-0 text-[9px]">your search</Badge>}
          {!isFocus && c.examWeight >= 4 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
              <Zap className="size-2.5" /> High yield
            </span>
          )}
        </span>
        {c.oneLiner && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-ink-soft">{c.oneLiner}</span>}
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
        <span className="text-[10px] text-muted-foreground">{STATE_LABEL[status]}{c.marked || optimistic ? ' · marked' : ''}</span>
        <ProgressMark
          size="xs"
          status={status}
          marked={c.marked || !!optimistic}
          onSet={(s) => {
            setOptimistic(s)
            void api.setLearnProgress({ kind: 'concept', entityId: c.id, status: s }).catch(() => setOptimistic(null))
          }}
        />
      </div>
    </div>
  )
}

// ── Watch ───────────────────────────────────────────────────────────────────
function WatchSection({ data }: { data: HubTopicPayload }) {
  const reduce = useReducedMotion()
  const [sceneId, setSceneId] = useState<string | null>(data.watch.platform.find((p) => p.sceneId)?.id ?? null)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)

  const active = sceneId ? data.watch.platform.find((p) => p.id === sceneId) ?? null : null
  const catalog = active ? CATALOG_BY_ID.get(active.id) : undefined
  const Scene = catalog?.sceneId ? LIVE_SCENES[catalog.sceneId as SceneId] : null
  const stepCount = catalog?.steps.length ?? 0

  // scene selection resets narration state at the event source (no effect reset)
  const selectScene = useCallback((id: string) => {
    setSceneId(id)
    setStep(0)
  }, [])

  // gentle autoplay through narration steps (scenes never own step state)
  useEffect(() => {
    if (!playing || reduce || stepCount === 0 || !Scene) return
    const timer = setInterval(() => setStep((s) => (s + 1) % stepCount), 7000)
    return () => clearInterval(timer)
  }, [playing, reduce, stepCount, Scene])

  return (
    <div className="space-y-5">
      <SectionIntro title="Watch" sub="Living 3D scenes from MEDULA's Understand library, plus real external lecture libraries." />

      {data.watch.platform.length > 0 ? (
        <div className="space-y-3">
          {data.watch.platform.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Platform scenes">
              {data.watch.platform.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={sceneId === p.id}
                  onClick={() => selectScene(p.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    sceneId === p.id ? 'border-primary bg-primary/10 text-primary' : 'border-line text-ink-soft hover:border-primary/40',
                  )}
                >
                  {p.emoji} {p.title}
                </button>
              ))}
            </div>
          )}
          {Scene && catalog ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{catalog.emoji} {catalog.title}</p>
                  <p className="truncate text-[11px] text-ink-soft">{catalog.oneLiner}</p>
                </div>
                <Button size="xs" variant="outline" onClick={() => setPlaying((v) => !v)}>
                  {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
                  {playing ? 'Pause' : 'Play'}
                </Button>
              </div>
              <div className="bg-surface-2">
                <Scene step={step} playing={playing} reduce={!!reduce} focus={null} />
              </div>
              {stepCount > 0 && (
                <div className="space-y-2 border-t border-line p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-primary">{catalog.steps[step]?.title}</p>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{step + 1}/{stepCount}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-soft">{catalog.steps[step]?.text}</p>
                  <div className="flex items-center gap-1.5">
                    <Button size="xs" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Prev</Button>
                    <Button size="xs" variant="outline" onClick={() => setStep((s) => Math.min(stepCount - 1, s + 1))} disabled={step >= stepCount - 1}>Next</Button>
                    <span className="ml-auto text-[10px] text-muted-foreground">from the Understand library</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
              This library topic has no living scene — use the external lectures below.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          No platform scene matches this topic yet — the external lecture libraries below cover it.
        </p>
      )}

      <ResourceGrid resources={data.watch.external} />
    </div>
  )
}

// ── Read ────────────────────────────────────────────────────────────────────
function ReadSection({ data, onOpenConcept }: {
  data: HubTopicPayload
  onOpenConcept: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <SectionIntro title="Read" sub="Structured notes, key tables and reference material — everything written down." />

      {data.read.sections.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="text-sm font-semibold">Lesson coverage</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.read.sections.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Open any concept in Learn for the full structured lesson with these sections.
          </p>
        </div>
      )}

      {data.read.notes.length > 0 ? (
        <div className="space-y-3">
          {data.read.notes.map((n) => (
            <div key={`${n.conceptId}-${n.heading}`} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{n.heading}</h3>
                <button type="button" onClick={() => onOpenConcept(n.conceptId)} className="shrink-0 text-[11px] font-medium text-primary hover:underline">
                  {n.conceptName} lesson <ChevronRight className="inline size-3" />
                </button>
              </div>
              <ul className="mt-2 space-y-1.5">
                {n.bullets.map((b, i) => (
                  <li key={`${i}-${b.slice(0, 20)}`} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <span className="text-ink-soft">{b}</span>
                  </li>
                ))}
              </ul>
              {n.table && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                  <table className="w-full border-collapse text-xs [&_td]:border-b [&_td]:border-line/70 [&_td]:px-2 [&_td]:py-1.5 [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_tr:last-child_td]:border-b-0">
                    <thead>
                      <tr>{n.table.headers.map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {n.table.rows.map((row, ri) => (
                        <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          Structured notes for this topic are being written. The key facts below and the reference links cover the essentials today.
        </p>
      )}

      <KeyFactsBlock data={data} />

      <ResourceGrid resources={data.read.external} />
    </div>
  )
}

function KeyFactsBlock({ data }: { data: HubTopicPayload }) {
  const facts = data.read.keyFacts
  const hasAny = facts.numbers.length > 0 || facts.differentials.length > 0 || facts.mistakes.length > 0 || facts.mnemonics.length > 0
  if (!hasAny) return null
  return (
    <section aria-label="Key facts" className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">High-yield facts</h2>
      {facts.numbers.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="size-3.5 text-primary" /> Numbers to remember</h3>
          <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {facts.numbers.map((n) => (
              <div key={n.label} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5 text-sm last:border-0">
                <span className="text-ink-soft">{n.label}</span>
                <span className="text-right font-semibold tabular-nums">{n.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {facts.differentials.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="size-3.5 text-primary" /> Don&apos;t confuse with</h3>
          <ul className="mt-2.5 space-y-1.5">
            {facts.differentials.map((d) => (
              <li key={d.name} className="text-sm"><span className="font-medium">{d.name}</span><span className="text-ink-soft"> — {d.key}</span></li>
            ))}
          </ul>
        </div>
      )}
      {facts.mistakes.length > 0 && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><TriangleAlert className="size-3.5 text-amber-600" /> Common mistakes</h3>
          <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed">
            {facts.mistakes.map((m, i) => <li key={`${i}-${m.slice(0, 24)}`} className="flex gap-2"><span className="text-amber-600">•</span><span>{m}</span></li>)}
          </ul>
        </div>
      )}
      {facts.mnemonics.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="size-3.5 text-primary" /> Mnemonics</h3>
          <ul className="mt-2.5 space-y-2 text-sm">
            {facts.mnemonics.map((m) => (
              <li key={m.hook}><span className="font-semibold text-primary">{m.hook}</span><span className="text-ink-soft"> → {m.expands}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Practice ────────────────────────────────────────────────────────────────
function PracticeSection({ data, onPractice }: {
  data: HubTopicPayload
  onPractice: (extra?: { qtype?: string; count?: number }) => void
}) {
  const p = data.practice
  return (
    <div className="space-y-5">
      <SectionIntro title="Practice" sub="Every question tied to this topic, by type — with your history on them." />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-line bg-card p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums">{p.questions}</p>
          <p className="text-[10px] text-ink-soft">questions in pool</p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4 text-center">
          <p className="text-2xl font-semibold tabular-nums">{p.attempts.total}</p>
          <p className="text-[10px] text-ink-soft">attempted by you</p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4 text-center">
          <p className={cn('text-2xl font-semibold tabular-nums', p.attempts.accuracy !== null && p.attempts.accuracy < 60 && 'text-amber-600')}>
            {p.attempts.accuracy !== null ? `${p.attempts.accuracy}%` : '—'}
          </p>
          <p className="text-[10px] text-ink-soft">your accuracy</p>
        </div>
      </div>

      {p.questions > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onPractice({ count: 10 })}
            className="flex w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><GraduationCap className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Practice this topic</span>
              <span className="block text-xs text-ink-soft">Mixed set · {p.questions} available</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-primary" />
          </button>
          {p.byType.filter((bt) => bt.qtype !== 'sba').map((bt) => (
            <button
              key={bt.qtype}
              type="button"
              onClick={() => onPractice({ qtype: bt.qtype, count: Math.min(8, bt.count) })}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-left transition-colors hover:border-primary/45"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2"><FlaskConical className="size-4 text-primary" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{bt.label}</span>
                <span className="block text-[11px] text-ink-soft">{bt.count} available</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {p.highYield > 0 && <Badge variant="outline" className="text-[10px]"><Zap className="mr-1 size-2.5" /> {p.highYield} high-difficulty</Badge>}
            {p.imageBased > 0 && <Badge variant="outline" className="text-[10px]">{p.imageBased} image-based</Badge>}
            {p.attempts.lastAt && <Badge variant="outline" className="text-[10px]">last attempted {new Date(p.attempts.lastAt).toLocaleDateString()}</Badge>}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          No questions are tied to this topic yet. Practice the subject instead from the Question Lab.
        </p>
      )}
    </div>
  )
}

// ── Cases ───────────────────────────────────────────────────────────────────
function CasesSection({ data, onOpenCases }: {
  data: HubTopicPayload
  onOpenCases: () => void
}) {
  return (
    <div className="space-y-5">
      <SectionIntro title="Cases" sub="Clinical scenarios for this organ system — diagnose, decide, debrief." />
      {data.cases.length > 0 ? (
        <div className="space-y-2">
          {data.cases.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={onOpenCases}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-card p-3.5 text-left transition-all hover:border-primary/45"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10"><Stethoscope className="size-4 text-primary" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.title}</span>
                <span className="text-[11px] text-ink-soft">{c.specialty} · difficulty {c.difficulty}/3</span>
              </span>
              {c.attempted && c.bestScore !== null ? (
                <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">best {c.bestScore}%</Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 text-[10px]">not tried</Badge>
              )}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          No published cases for this system yet — the Case Simulator grows with the curriculum.
        </p>
      )}
    </div>
  )
}

// ── Revise ──────────────────────────────────────────────────────────────────
function ReviseSection({ data, onDrillPair }: {
  data: HubTopicPayload
  onDrillPair: (pairId: string) => void
}) {
  const setView = useAppStore((s) => s.setView)
  const r = data.revise
  return (
    <div className="space-y-5">
      <SectionIntro title="Revise" sub="Flashcards, revision queue, your misses and confusable pairs — the memory layer." />

      {r.flashcards > 0 && (
        <button
          type="button"
          onClick={() => setView('revise')}
          className="flex w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><RotateCcw className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{r.dueCards > 0 ? `Review ${r.dueCards} due card${r.dueCards > 1 ? 's' : ''}` : `${r.flashcards} flashcards — nothing due`}</span>
            <span className="block text-xs text-ink-soft">Spaced repetition picks up where you left off</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-primary" />
        </button>
      )}

      {r.revisionItems.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><CircleDashed className="size-4 text-amber-500" /> Revision queue</h3>
          <ul className="mt-2.5 space-y-2">
            {r.revisionItems.map((ri) => (
              <li key={ri.conceptId} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{ri.conceptName}</span>
                  <span className="block truncate text-[11px] text-ink-soft">{ri.reason}</span>
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">{ri.minutes} min</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.missedConcepts.length > 0 && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><TriangleAlert className="size-4 text-amber-600" /> You missed these here</h3>
          <ul className="mt-2.5 space-y-1.5 text-sm">
            {r.missedConcepts.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{m.name}</span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-amber-700">{m.misses} miss{m.misses > 1 ? 'es' : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.confusionPairs.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Scale className="size-4 text-primary" /> Don&apos;t mix up</h3>
          <ul className="mt-2.5 space-y-2">
            {r.confusionPairs.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{p.a}</span>
                  <span className="text-ink-soft"> vs </span>
                  <span className="font-medium">{p.b}</span>
                </span>
                <Button size="xs" variant="outline" onClick={() => onDrillPair(p.id)}>Drill</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.flashcards === 0 && r.revisionItems.length === 0 && r.missedConcepts.length === 0 && r.confusionPairs.length === 0 && (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          No cards or revision items for this topic yet — as you practice, misses surface here automatically.
        </p>
      )}
    </div>
  )
}

// ── Performance ─────────────────────────────────────────────────────────────
function PerformanceSection({ data, onPractice, onGo }: {
  data: HubTopicPayload
  onPractice: () => void
  onGo: (k: SectionKey) => void
}) {
  const perf = data.performance
  return (
    <div className="space-y-5">
      <SectionIntro title="Your performance" sub="Everything you've actually done on this topic — honest numbers only." />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PerfTile value={perf.attemptsTotal} label="questions attempted" />
        <PerfTile value={perf.accuracy !== null ? `${perf.accuracy}%` : '—'} label="accuracy" warn={perf.accuracy !== null && perf.accuracy < 60} />
        <PerfTile value={perf.dueCards} label="cards due" warn={perf.dueCards > 0} />
        <PerfTile value={perf.pendingRevision} label="revision items" warn={perf.pendingRevision > 0} />
      </div>

      {perf.weakConcepts.length > 0 ? (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Target className="size-4 text-amber-500" /> Weak areas</h3>
          <ul className="mt-3 space-y-2.5">
            {perf.weakConcepts.map((w) => (
              <li key={w.id} className="flex items-center gap-2.5 text-sm">
                <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-amber-600">{w.mastery}%</span>
                <Progress value={w.mastery} className="h-1.5 flex-1" aria-label={`${w.name} mastery ${w.mastery}%`} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{w.name}</span>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="mt-3" onClick={onPractice}>Fix them with a focused set</Button>
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          {perf.engagedConcepts > 0
            ? 'No weak areas flagged — keep the streak alive with a practice set.'
            : 'You haven\u2019t engaged with this topic yet. Start with Learn, then Practice.'}
        </p>
      )}

      {perf.recentActivity.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Activity className="size-4 text-primary" /> Recent activity</h3>
          <ul className="mt-2.5 space-y-2">
            {perf.recentActivity.map((a, i) => (
              <li key={`${i}-${a.at}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink-soft">{a.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(a.at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface-2 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="size-4 text-primary" /> Progress marks</h3>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(Object.entries(data.statusCounts) as [LearnStatus, number][]).map(([status, n]) => (
            <span key={status} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px]">
              <span className="size-2 rounded-full" style={{ backgroundColor: LEARN_STATE_COLOR[status] }} />
              {STATE_LABEL[status]} <span className="font-semibold tabular-nums">{n}</span>
            </span>
          ))}
        </div>
        <button type="button" onClick={() => onGo('learn')} className="mt-2.5 text-xs font-medium text-primary hover:underline">
          Mark concepts in Learn <ChevronRight className="inline size-3" />
        </button>
      </div>
    </div>
  )
}

// ── AI ──────────────────────────────────────────────────────────────────────
function AiSection({ data, onAsk, onQuiz }: {
  data: HubTopicPayload
  onAsk: (prompt: string) => void
  onQuiz: () => void
}) {
  return (
    <div className="space-y-5">
      <SectionIntro title="AI" sub="Contextual actions about this topic only — the tutor already knows where you are." />
      <div className="grid gap-2 sm:grid-cols-2">
        {data.ai.map((a) => (
          <button
            key={a.kind}
            type="button"
            onClick={() => (a.kind === 'quiz' ? onQuiz() : onAsk(a.prompt))}
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all',
              a.kind === 'quiz'
                ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                : 'border-line bg-card hover:border-primary/45 hover:shadow-md hover:shadow-primary/5',
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10">
              {a.kind === 'quiz' ? <GraduationCap className="size-4 text-primary" /> : <BrainCircuit className="size-4 text-primary" />}
            </span>
            <span className="min-w-0 truncate text-sm font-medium">{a.label}</span>
            <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
      <p className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
        The AI Tutor is a learning tool, not a clinical advisor — it can be wrong. Verify against standard textbooks. (Voice learning, adaptive MCQs and the mistake engine plug into this section as they ship.)
      </p>
    </div>
  )
}

// ── Connected ───────────────────────────────────────────────────────────────
function ConnectedSection({ data, onOpenHub }: {
  data: HubTopicPayload
  onOpenHub: (topicId: string, conceptId?: string | null) => void
}) {
  return (
    <div className="space-y-5">
      <SectionIntro title="Connected knowledge" sub="How this topic hooks into the rest of medicine — open any as its own hub." />
      {data.connected.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.connected.map((ct) => (
            <button
              key={ct.id}
              type="button"
              onClick={() => onOpenHub(ct.id)}
              className="group min-w-0 rounded-xl border border-line bg-card p-3.5 text-left transition-all hover:border-primary/45 hover:shadow-md hover:shadow-primary/5"
            >
              <span className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: ct.subjectColor }} aria-hidden />
                <span className="truncate text-sm font-medium group-hover:text-primary">{ct.name}</span>
                <ArrowRight className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block truncate text-[11px] text-ink-soft">
                {ct.subjectName} — {ct.reason}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          Cross-links appear here as this topic's concept edges grow.
        </p>
      )}
    </div>
  )
}

// ── shared bits ─────────────────────────────────────────────────────────────
function SectionIntro({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-xs text-ink-soft md:text-[13px]">{sub}</p>
    </div>
  )
}

function ResourceGrid({ resources }: { resources: HubTopicPayload['watch']['external'] }) {
  if (resources.length === 0) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {resources.map((r) => (
        <a
          key={r.url}
          href={r.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group min-w-0 rounded-xl border border-line bg-card p-3.5 transition-all hover:border-primary/45"
        >
          <span className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2">
              {r.kind === 'video' ? <MonitorPlay className="size-4 text-primary" /> : r.kind === 'imaging' ? <Boxes className="size-4 text-primary" /> : <BookOpen className="size-4 text-primary" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium group-hover:text-primary">{r.provider}</span>
              <span className="block truncate text-[11px] text-ink-soft">{r.note}</span>
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          </span>
        </a>
      ))}
    </div>
  )
}

function PerfTile({ value, label, warn }: { value: number | string; label: string; warn?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-3.5 text-center', warn ? 'border-amber-300/60 bg-amber-50/60' : 'border-line bg-card')}>
      <p className={cn('text-xl font-semibold tabular-nums', warn && 'text-amber-700')}>{value}</p>
      <p className="text-[10px] text-ink-soft">{label}</p>
    </div>
  )
}

function HubSkeleton() {
  return (
    <div className="space-y-4 pt-6">
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid gap-2 sm:grid-cols-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  )
}
