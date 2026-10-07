'use client'

// ─── UNDERSTAND YOUR TOPIC — the living 3D syllabus theatre ───
// The whole MBBS + NEET-PG syllabus as living diagrams: pick a topic, watch
// the scene move, walk the narration steps, and see exactly where students
// slip (weak points) and where exams bite (traps).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BrainCircuit, Brain, ChevronLeft, ChevronRight, CircleCheck, CircleCheckBig, Clapperboard, Lightbulb,
  Pause, Play, RotateCcw, Search, Sparkles, GraduationCap, Layers, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/primitives/kit'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { UNDERSTAND_SUBJECTS, SEVERITY_META, YIELD_META } from '@/lib/understand-types'
import type { UnderstandTopic, YieldTier } from '@/lib/understand-types'
import { BASE_TOPICS } from '@/lib/understand-catalog-base'
import { CATALOG_B } from '@/lib/understand-catalog-b'
import { CATALOG_C } from '@/lib/understand-catalog-c'
import { LIVE_SCENES, type SceneId } from './live-scenes'
import type { SceneProps } from './scene-contract'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const UNDERSTOOD_KEY = 'medos:understood'

const ALL_TOPICS: UnderstandTopic[] = [...BASE_TOPICS, ...CATALOG_B, ...CATALOG_C]

// ── understood-set persistence ──────────────────────────────────────────────
function readUnderstood(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(UNDERSTOOD_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch { return new Set() }
}

function StepTimer({ topic, playing, reduce, step, setStep }: {
  topic: UnderstandTopic | null
  playing: boolean
  reduce: boolean | null
  step: number
  setStep: (n: number) => void
}) {
  const count = topic?.steps.length ?? 0
  useEffect(() => {
    if (!playing || reduce || count === 0) return
    const t = setInterval(() => setStep((step + 1) % count), 7000)
    return () => clearInterval(t)
  }, [playing, reduce, count, step, setStep, topic?.id])
  return null
}

export function UnderstandView() {
  const reduce = useReducedMotion()
  const { toast } = useToast()

  const [subjectFilter, setSubjectFilter] = useState<string>('ALL')
  const [yieldFilter, setYieldFilter] = useState<YieldTier | 'ALL'>('ALL')
  const [liveOnly, setLiveOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [topicId, setTopicId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [focus, setFocus] = useState<string | null>(null)
  const [understood, setUnderstood] = useState<Set<string>>(new Set())
  const [openTraps, setOpenTraps] = useState<Set<number>>(new Set())
  const tiltRef = useRef<HTMLDivElement>(null)

  // hydrate the understood set after first paint — localStorage is client-only
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnderstood(readUnderstood())
  }, [])

  // hero default: the beating heart when the user hasn't chosen yet (derived,
  // not stored — so the first explicit selection simply wins)
  const resolvedTopicId = topicId ?? ALL_TOPICS.find((t) => t.sceneId === 'heart')?.id ?? null
  const topic = useMemo(() => ALL_TOPICS.find((t) => t.id === resolvedTopicId) ?? null, [resolvedTopicId])

  // explicit selection resets narration state — no cascading-effect resets
  const selectTopic = useCallback((id: string) => {
    setTopicId(id)
    setStep(0)
    setFocus(null)
    setOpenTraps(new Set())
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ALL_TOPICS.filter((t) => {
      if (subjectFilter !== 'ALL' && t.subjectCode !== subjectFilter) return false
      if (yieldFilter !== 'ALL' && t.yield !== yieldFilter) return false
      if (liveOnly && !t.sceneId) return false
      if (q && !(`${t.title} ${t.oneLiner} ${t.system}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [subjectFilter, yieldFilter, liveOnly, query])

  // capitalized so JSX can consume it directly; truthiness-narrowed at the call site
  const Scene = topic?.sceneId ? LIVE_SCENES[topic.sceneId as SceneId] : null
  const subject = topic ? UNDERSTAND_SUBJECTS[topic.subjectCode] : null

  // reset narration state when the topic changes is handled by selectTopic

  const toggleUnderstood = useCallback((id: string) => {
    setUnderstood((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        toast({ title: 'Marked as not yet understood', description: 'It stays on your list — honesty helps the algorithm.' })
      } else {
        next.add(id)
        // Wire into the engine: a real StudySession backs this — streak, consistency
        // in the Readiness Score and the heatmap all reflect the time spent here.
        const title = ALL_TOPICS.find((t) => t.id === id)?.title ?? 'Topic'
        api.understandComplete({ topicId: id, title }).catch(() => { /* session log is best-effort */ })
        toast({ title: 'Topic understood ✓', description: 'Logged to your timeline — the syllabus shrinks by one.' })
      }
      try { window.localStorage.setItem(UNDERSTOOD_KEY, JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }, [toast])

  // subtle 3D tilt following the pointer
  const onTilt = (e: React.PointerEvent) => {
    if (reduce || !tiltRef.current) return
    const r = tiltRef.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    tiltRef.current.style.transform = `perspective(1100px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg)`
  }
  const onTiltEnd = () => {
    if (tiltRef.current) tiltRef.current.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg)'
  }

  const sceneTopics = ALL_TOPICS.filter((t) => t.sceneId).length
  const weakCount = ALL_TOPICS.reduce((n, t) => n + t.weak.length, 0)
  const subjectCodes = useMemo(() => {
    const codes = new Set(ALL_TOPICS.map((t) => t.subjectCode as string))
    return Object.keys(UNDERSTAND_SUBJECTS).filter((c) => codes.has(c))
  }, [])
  const upNext = useMemo(() => {
    if (!topic) return null
    const pool = filtered.filter((t) => t.id !== topic.id)
    return pool.find((t) => !understood.has(t.id)) ?? pool[0] ?? null
  }, [filtered, topic, understood])

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <StepTimer topic={topic} playing={playing} reduce={reduce} step={step} setStep={setStep} />

      {/* ── header — porcelain editorial on a clay card ── */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="clay rounded-3xl p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            className="min-w-0"
            eyebrow={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                <Sparkles className="size-3" aria-hidden /> Core feature
              </span>
            }
            title={
              <span className="flex items-center gap-2.5">
                <Brain className="size-7 text-primary" aria-hidden /> Understand Your Topic
              </span>
            }
            intro="The whole MBBS + NEET-PG syllabus, mapped and brought to life — living 3D diagrams, narrated step by step, with every point students slip on highlighted before the exam does."
          />
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              { v: ALL_TOPICS.length, l: 'topics' },
              { v: sceneTopics, l: 'live scenes' },
              { v: weakCount, l: 'weak points' },
              { v: subjectCodes.length, l: 'subjects' },
            ].map((s) => (
              <div key={s.l} className="clay-in rounded-2xl px-3.5 py-2.5">
                <p className="text-xl font-bold tabular-nums text-primary">{s.v}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        {/* understood progress */}
        <div className="mt-4 flex items-center gap-3">
          <CircleCheckBig className="size-4 shrink-0 text-sev-ok" aria-hidden />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar"
            aria-valuenow={understood.size} aria-valuemin={0} aria-valuemax={ALL_TOPICS.length}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.62_0.105_158)] transition-all duration-500"
              style={{ width: `${Math.round((understood.size / Math.max(ALL_TOPICS.length, 1)) * 100)}%` }}
            />
          </div>
          <p className="shrink-0 text-xs font-semibold text-ink-soft">
            {understood.size}/{ALL_TOPICS.length} understood
          </p>
        </div>
      </motion.div>

      {/* ── filters ── */}
      <section aria-label="Topic filters" className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by subject">
          <FilterChip active={subjectFilter === 'ALL'} onClick={() => setSubjectFilter('ALL')}>All subjects</FilterChip>
          {subjectCodes.map((code) => {
            const meta = UNDERSTAND_SUBJECTS[code]
            return (
              <FilterChip key={code} active={subjectFilter === code} onClick={() => setSubjectFilter(code)}>
                <span aria-hidden>{meta.emoji}</span> {meta.name}
              </FilterChip>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics, systems…"
              aria-label="Search topics"
              className="clay-field h-10 pl-9"
            />
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Filter by yield">
            <FilterChip active={yieldFilter === 'ALL'} onClick={() => setYieldFilter('ALL')}>Any yield</FilterChip>
            {(['must', 'high', 'core'] as YieldTier[]).map((y) => (
              <FilterChip key={y} active={yieldFilter === y} onClick={() => setYieldFilter(y)}>
                {YIELD_META[y].label}
              </FilterChip>
            ))}
          </div>
          <FilterChip active={liveOnly} onClick={() => setLiveOnly((v) => !v)}>
            <Clapperboard className="size-3.5" aria-hidden /> Live scenes only
          </FilterChip>
        </div>
      </section>

      {/* ── main split ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* topic rail */}
        <aside aria-label="Topic list" className="clay max-h-[560px] overflow-y-auto rounded-3xl p-3 lg:sticky lg:top-20">
          <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
            {filtered.length} topic{filtered.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-1.5">
            {filtered.map((t) => {
              const meta = UNDERSTAND_SUBJECTS[t.subjectCode]
              const active = t.id === resolvedTopicId
              return (
                <button
                  key={t.id}
                  onClick={() => selectTopic(t.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'clay-hover flex w-full items-start gap-2.5 rounded-2xl border p-2.5 text-left transition-all min-h-11',
                    active ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:border-line hover:bg-surface-2',
                  )}
                >
                  <span aria-hidden className="mt-0.5 text-lg leading-none">{t.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('truncate text-sm font-semibold', active ? 'text-primary' : 'text-foreground')}>{t.title}</span>
                      {understood.has(t.id) && <CircleCheck className="size-3.5 shrink-0 text-sev-ok" aria-hidden />}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft">
                      <span className="inline-flex items-center gap-1 font-semibold" style={{ color: meta.color }}>
                        <span className="size-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
                        {meta.name}
                      </span>
                      {t.sceneId && (
                        <span className="rounded-full border border-sev-ok/40 bg-sev-ok/10 px-1.5 py-px font-bold text-sev-ok">LIVE 3D</span>
                      )}
                      <span className={cn('rounded-full border px-1.5 py-px font-semibold', YIELD_META[t.yield].cls)}>
                        {YIELD_META[t.yield].label}
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-ink-soft">No topics match those filters — try widening them.</p>
            )}
          </div>
        </aside>

        {/* stage + panels */}
        <div className="min-w-0 space-y-4">
          {topic && (
            <>
              {/* stage */}
              <section aria-label="Living diagram stage" className="clay overflow-hidden rounded-3xl">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 truncate text-lg font-bold tracking-tight">
                      <span aria-hidden>{topic.emoji}</span> {topic.title}
                    </h2>
                    <p className="text-xs text-ink-soft">{subject?.name} · {topic.system}</p>
                  </div>
                  {topic.sceneId ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sev-ok">
                      <span className="size-1.5 animate-pulse rounded-full bg-sev-ok" aria-hidden /> Live · moving
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                      <Layers className="size-3" aria-hidden /> Concept card
                    </span>
                  )}
                </div>

                {/* 3D tilt viewport */}
                <div
                  className="scene3d-plane mx-4 mt-3 sm:mx-5"
                  ref={tiltRef}
                  onPointerMove={onTilt}
                  onPointerLeave={onTiltEnd}
                  style={{ transition: 'transform 0.25s ease-out' }}
                >
                  <div className="clay-in overflow-hidden rounded-2xl p-2 sm:p-3">
                    {Scene && topic.sceneId ? (
                      <Scene
                        step={step}
                        playing={playing}
                        reduce={!!reduce}
                        focus={focus}
                      />
                    ) : (
                      <div className="rounded-xl bg-surface-2 px-4 py-10 text-center">
                        <p className="text-3xl" aria-hidden>{topic.emoji}</p>
                        <p className="mt-2 text-sm font-semibold">Concept card — living scene coming to this topic soon</p>
                        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-soft">{topic.oneLiner}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* controls + steps */}
                {topic.sceneId && Scene && (
                  <div className="px-4 pb-4 pt-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" className="min-h-10 gap-1.5 rounded-full"
                        onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
                        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                        {playing ? 'Pause' : 'Play'}
                      </Button>
                      <Button variant="outline" size="sm" className="min-h-10 gap-1.5 rounded-full"
                        onClick={() => setStep((s) => (s - 1 + topic.steps.length) % topic.steps.length)} aria-label="Previous step">
                        <ChevronLeft className="size-4" /> Prev
                      </Button>
                      <Button variant="outline" size="sm" className="min-h-10 gap-1.5 rounded-full"
                        onClick={() => setStep((s) => (s + 1) % topic.steps.length)} aria-label="Next step">
                        Next <ChevronRight className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="min-h-10 gap-1.5 rounded-full"
                        onClick={() => { setStep(0); setFocus(null); setPlaying(true) }} aria-label="Restart narration">
                        <RotateCcw className="size-4" /> Restart
                      </Button>
                      <p className="ml-auto text-[11px] font-semibold text-ink-soft">
                        step {step + 1} of {topic.steps.length}
                      </p>
                    </div>

                    {/* step chips — porcelain tray */}
                    <div className="clay-tray mt-3 flex gap-1.5 overflow-x-auto rounded-full p-1.5" role="tablist" aria-label="Narration steps">
                      {topic.steps.map((st, i) => (
                        <button
                          key={st.title}
                          role="tab"
                          aria-selected={i === step}
                          data-state={i === step ? 'active' : 'inactive'}
                          onClick={() => setStep(i)}
                          className={cn(
                            'clay-tab shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold min-h-9',
                            i === step ? 'border-primary/40 text-primary' : 'border-transparent text-ink-soft hover:text-foreground',
                          )}
                        >
                          {i + 1}. {st.title}
                        </button>
                      ))}
                    </div>

                    {/* active step narration */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${topic.id}-${step}`}
                        initial={reduce ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? undefined : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.28, ease: EASE }}
                        className="clay-in mt-3 rounded-2xl p-3.5"
                      >
                        <p className="flex items-center gap-2 text-sm font-bold">
                          <Sparkles className="size-3.5 text-primary" aria-hidden />
                          {topic.steps[step]?.title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{topic.steps[step]?.text}</p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
              </section>

              {/* plain words */}
              <section aria-label="Plain words explanation" className="clay rounded-3xl p-4 sm:p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
                  <GraduationCap className="size-4 text-primary" aria-hidden /> In plain words
                </h3>
                <p className="mt-2 text-sm leading-relaxed">{topic.plain}</p>
                <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 text-xs font-medium text-primary">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{topic.oneLiner}</span>
                </p>
              </section>

              {/* weak points + traps */}
              <div className="grid gap-4 md:grid-cols-2">
                <section aria-label="Where students slip" className="clay rounded-3xl p-4 sm:p-5">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
                    <AlertTriangle className="size-4 text-sev-warn" aria-hidden /> Where students slip
                  </h3>
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {topic.weak.map((w) => {
                      const sev = SEVERITY_META[w.severity]
                      return (
                        <button
                          key={w.title}
                          onClick={() => setFocus((f) => (f === w.anchor && w.anchor ? null : w.anchor ?? null))}
                          className={cn(
                            'w-full rounded-2xl border p-3 text-left transition-all min-h-11',
                            focus && w.anchor && focus === w.anchor
                              ? 'border-primary/50 bg-primary/10'
                              : 'border-line bg-surface-2 hover:border-primary/30',
                          )}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={cn('size-2 rounded-full', sev.dot)} aria-hidden />
                            <span className="text-sm font-semibold">{w.title}</span>
                            <span className={cn('ml-auto rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider', sev.cls)}>
                              {sev.label}
                            </span>
                          </span>
                          <span className="mt-1.5 block text-xs leading-relaxed text-ink-soft">{w.detail}</span>
                          {w.anchor && (
                            <span className="mt-1.5 block text-[10px] font-bold uppercase tracking-wider text-primary">
                              {focus === w.anchor ? '● spotlighting on the scene — click again to clear' : 'tap to spotlight on the scene'}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section aria-label="Exam traps" className="clay rounded-3xl p-4 sm:p-5">
                  <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
                    <BrainCircuit className="size-4 text-primary" aria-hidden /> Exam traps
                  </h3>
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {topic.traps.map((tr, i) => {
                      const open = openTraps.has(i)
                      return (
                        <div key={tr.q} className="rounded-2xl border border-line bg-surface-2">
                          <button
                            onClick={() => setOpenTraps((prev) => {
                              const next = new Set(prev)
                              if (next.has(i)) next.delete(i); else next.add(i)
                              return next
                            })}
                            aria-expanded={open}
                            className="flex w-full items-start gap-2 p-3 text-left min-h-11"
                          >
                            <span aria-hidden className="mt-0.5 text-sm">{open ? '🔓' : '🔒'}</span>
                            <span className="text-sm font-medium">{tr.q}</span>
                          </button>
                          <AnimatePresence initial={false}>
                            {open && (
                              <motion.div
                                initial={reduce ? false : { height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                transition={{ duration: 0.24, ease: EASE }}
                                className="overflow-hidden"
                              >
                                <p className="border-t border-line px-3 py-2.5 text-xs leading-relaxed text-sev-ok">
                                  ✓ {tr.a}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>

              {/* footer actions */}
              <div className="clay flex flex-wrap items-center gap-3 rounded-3xl p-4 sm:p-5">
                <Button
                  onClick={() => toggleUnderstood(topic.id)}
                  variant={understood.has(topic.id) ? 'secondary' : 'default'}
                  className="min-h-11 gap-2 rounded-full px-5"
                >
                  <CircleCheck className="size-4" aria-hidden />
                  {understood.has(topic.id) ? 'Understood ✓ — tap to undo' : 'Mark as understood'}
                </Button>
                {upNext && (
                  <Button variant="outline" className="min-h-11 gap-2 rounded-full" onClick={() => selectTopic(upNext.id)}>
                    Up next: <span aria-hidden>{upNext.emoji}</span> {upNext.title}
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
        active ? 'border-primary/50 bg-primary/12 text-primary' : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
