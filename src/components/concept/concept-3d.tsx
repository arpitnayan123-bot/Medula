'use client'

// ─── 3D VISUAL VIEWER — topics rendered as floating 3D layer diagrams ───
// Drag to orbit the stack, tap a layer to fly it forward, isolate it, toggle
// floating labels, walk the guided step-by-step tour, compare normal vs
// abnormal, and test yourself with the inline quiz. Falls back to a
// concept-generated stack when no custom diagram exists (visual3d.ts).
// Every control renders ONLY when the diagram actually carries the data —
// no fake states.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Footprints,
  GraduationCap,
  Hand,
  ListChecks,
  RotateCcw,
  Sparkles,
  Stethoscope,
  Tags,
  Trophy,
  Waypoints,
  X,
  XCircle,
} from 'lucide-react'
import type { ConceptDetail } from '@/lib/types'
import { getDiagram3D, type Diagram3D, type Layer3D, type QuizItem } from '@/lib/visual3d'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const TINT_FALLBACK = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#22d3ee', '#f97316', '#2dd4bf']

function layerTint(l: Layer3D, i: number): string {
  return l.tint ?? TINT_FALLBACK[i % TINT_FALLBACK.length]
}

// ── toolbar icon button (≥40px target, tooltip via title, labelled for SR) ──
function ToolBtn({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      className={cn(
        'clay-btn-soft inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl transition-all',
        pressed && 'ring-2 ring-primary',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  )
}

export function Concept3D({ detail, compact = false }: { detail: ConceptDetail; compact?: boolean }) {
  const reduce = useReducedMotion()
  const diagram: Diagram3D = useMemo(() => getDiagram3D(detail.id, detail), [detail])
  const steps = diagram.guidedSteps
  const quiz = diagram.quiz

  const [activeId, setActiveId] = useState<string | null>(diagram.layers[0]?.id ?? null)
  const [rot, setRot] = useState({ x: -14, y: 22 })
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [isolate, setIsolate] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [stepMode, setStepMode] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [quizOpen, setQuizOpen] = useState(false)

  const dragRef = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null)
  const movedRef = useRef(false)
  const stepPanelRef = useRef<HTMLDivElement>(null)

  const active = diagram.layers.find(l => l.id === activeId) ?? null
  const canIsolate = !!active && active.isolateable !== false
  const stepLayer = stepMode && steps ? diagram.layers.find(l => l.id === steps[stepIndex]?.layerId) ?? null : null
  const stepLayerId = stepLayer?.id ?? null

  // reset the viewer whenever the underlying diagram changes — done during
  // render (React's derived-state-reset pattern) to avoid effect cascades
  const [prevDiagramKey, setPrevDiagramKey] = useState(diagram)
  if (prevDiagramKey !== diagram) {
    setPrevDiagramKey(diagram)
    setActiveId(diagram.layers[0]?.id ?? null)
    setRot({ x: -14, y: 22 })
    setAutoOrbit(false)
    setIsolate(false)
    setShowLabels(false)
    setStepMode(false)
    setStepIndex(0)
    setQuizOpen(false)
  }

  // guided mode: the current step drives the highlighted layer — also applied
  // during render via the same pattern
  const stepTargetId = stepMode && steps ? steps[stepIndex]?.layerId ?? null : null
  const stepTargetValid =
    stepTargetId !== null && diagram.layers.some((l) => l.id === stepTargetId)
  const [appliedStepTarget, setAppliedStepTarget] = useState<string | null>(null)
  if (stepTargetValid && stepTargetId !== appliedStepTarget) {
    setAppliedStepTarget(stepTargetId)
    setActiveId(stepTargetId)
  }

  // guided mode keyboard: ← → navigate · Escape exits
  useEffect(() => {
    if (!stepMode || !steps) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStepMode(false)
        return
      }
      if (e.key === 'ArrowRight') setStepIndex(i => Math.min(steps.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setStepIndex(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepMode, steps])

  // move focus into the step panel when the tour opens
  useEffect(() => {
    if (stepMode) stepPanelRef.current?.focus()
  }, [stepMode])

  // pointer-drag orbiting
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, rx: rot.x, ry: rot.y }
    movedRef.current = false
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [rot])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 6) movedRef.current = true
    const nx = Math.max(-62, Math.min(30, d.rx - dy * 0.35))
    const ny = Math.max(-80, Math.min(80, d.ry + dx * 0.4))
    setRot({ x: nx, y: ny })
  }, [])

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const onLayerClick = (id: string) => {
    if (movedRef.current) return // it was a drag, not a click
    if (activeId === id) {
      setActiveId(null)
      setIsolate(false)
    } else {
      setActiveId(id)
    }
  }

  const reset = () => {
    setRot({ x: -14, y: 22 })
    setAutoOrbit(false)
    setIsolate(false)
  }

  const toggleStepMode = () => {
    if (stepMode) {
      setStepMode(false)
      return
    }
    setStepIndex(0)
    setStepMode(true)
  }

  const custom = diagram.layers.some(l => l.detail && l.simple !== l.detail)

  return (
    <div className={cn('space-y-3', compact && 'space-y-2.5')} data-testid="concept-3d">
      {/* intro strip */}
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden
          className={cn('clay-in grid shrink-0 place-items-center rounded-2xl', compact ? 'size-9 text-lg' : 'size-11 text-xl')}
        >
          {diagram.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="size-3" /> 3D visual learning
          </p>
          <h3 className={cn('mt-0.5 font-semibold tracking-tight', compact ? 'text-sm' : 'text-base')}>{diagram.title}</h3>
          <p className={cn('mt-0.5 leading-relaxed text-ink-soft', compact ? 'text-[11px]' : 'text-xs')}>{diagram.intro}</p>
        </div>
        {/* toolbar — wraps below the intro on phones; every icon ≥40px with aria-label + title tooltip.
            Controls whose data is absent are hidden entirely (no fake states). */}
        <div className="flex w-full shrink-0 flex-wrap items-center gap-1.5 sm:w-auto sm:justify-start" role="toolbar" aria-label="3D viewer controls">
          {canIsolate && (
            <ToolBtn label={isolate ? 'Show all layers' : 'Isolate active layer'} pressed={isolate} onClick={() => setIsolate(v => !v)}>
              <Crosshair className="size-4" />
            </ToolBtn>
          )}
          <ToolBtn label={showLabels ? 'Hide layer labels' : 'Show layer labels'} pressed={showLabels} onClick={() => setShowLabels(v => !v)}>
            <Tags className="size-4" />
          </ToolBtn>
          <ToolBtn label="Reset 3D view" onClick={reset}>
            <RotateCcw className="size-4" />
          </ToolBtn>
          {!reduce && (
            <ToolBtn label="Auto-orbit" pressed={autoOrbit} onClick={() => setAutoOrbit(v => !v)}>
              <Compass className={cn('size-4', !reduce && autoOrbit && 'animate-spin [animation-duration:6s]')} />
            </ToolBtn>
          )}
          {steps && steps.length > 0 && (
            <ToolBtn label="Guided step-by-step tour" pressed={stepMode} onClick={toggleStepMode}>
              <Footprints className="size-4" />
            </ToolBtn>
          )}
          {quiz && quiz.length > 0 && (
            <ToolBtn label={quizOpen ? 'Close quiz' : 'Open quiz'} pressed={quizOpen} onClick={() => setQuizOpen(v => !v)}>
              <ListChecks className="size-4" />
            </ToolBtn>
          )}
        </div>
      </div>

      {/* 3D stage — the OUTER wrapper carries the clip: elements that establish
          perspective cannot reliably clip their own 3D children (both
          overflow-hidden and same-element clip-path get bypassed), but a plain
          wrapper with clip-path forces flattening of the rendered output. */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-[#c9e8d4]/[0.10] via-transparent to-[#f3d5a4]/[0.10] [clip-path:inset(0_round_1rem)]',
          compact ? 'h-[240px] md:h-[290px]' : 'h-[340px]',
        )}
        style={{ touchAction: 'none' }}
        role="application"
        aria-label={`Interactive 3D diagram of ${diagram.title}. Drag to rotate, click a layer to inspect it.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="stage3d absolute inset-0">
        {/* scene backdrop */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="scene-dawn absolute inset-0 opacity-60" />
          <div className={cn('absolute bottom-3 left-1/2 w-[70%] -translate-x-1/2 rounded-[100%] bg-primary/10 blur-2xl', compact ? 'h-16' : 'h-24')} />
        </div>

        {/* drag hint */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-full border border-line bg-card/80 px-2.5 py-1 text-[10px] font-medium text-ink-soft backdrop-blur"
        >
          <Hand className="size-3" /> drag to rotate
        </span>

        <motion.div
          className="scene3d-plane absolute inset-0 grid place-items-center"
          animate={reduce ? { rotateX: rot.x, rotateY: rot.y } : { rotateX: rot.x, rotateY: autoOrbit ? undefined : rot.y }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {/* auto-orbit wrapper — separate so drag and orbit don't fight */}
          {autoOrbit && !reduce ? (
            <div
              className="scene3d-plane relative h-full w-full"
              style={{ animation: 'orbit-spin 16s linear infinite' }}
            >
              <LayerStack
                diagram={diagram}
                activeId={activeId}
                onLayerClick={onLayerClick}
                isolate={isolate}
                showLabels={showLabels}
                stepLayerId={stepLayerId}
                reduce={reduce}
                compact={compact}
              />
            </div>
          ) : (
            <LayerStack
              diagram={diagram}
              activeId={activeId}
              onLayerClick={onLayerClick}
              isolate={isolate}
              showLabels={showLabels}
              stepLayerId={stepLayerId}
              reduce={reduce}
              compact={compact}
            />
          )}
        </motion.div>

        {/* active layer caption ribbon */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-30">
          <p className={cn('w-fit max-w-full truncate rounded-full border border-line bg-card/85 px-3 py-1 font-medium backdrop-blur', compact ? 'text-[10px]' : 'text-[11px]')}>
            {active ? (
              <>
                <span aria-hidden className="mr-1">{active.emoji}</span>
                {active.label}
                <span className="mx-1.5 text-primary">·</span>
                <span className="text-ink-soft">{active.simple}</span>
              </>
            ) : (
              'Tap a layer to inspect it ↗'
            )}
          </p>
        </div>
        </div>{/* /.stage3d */}
      </div>

      {/* guided step strip — only when the diagram ships a tour AND it's on */}
      {stepMode && steps && steps.length > 0 && (
        <motion.div
          ref={stepPanelRef}
          tabIndex={-1}
          role="group"
          aria-label={`Guided tour, step ${stepIndex + 1} of ${steps.length}. Left and right arrow keys navigate, Escape exits.`}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="clay relative z-10 rounded-2xl p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              <Footprints className="size-3.5" /> Guided tour
            </span>
            <span className="text-[10px] font-semibold text-ink-soft">{stepIndex + 1} / {steps.length}</span>
            <ToolBtn label="Exit guided mode (Escape)" onClick={() => setStepMode(false)}>
              <X className="size-4" />
            </ToolBtn>
          </div>

          {/* progress dots (≥44px targets) */}
          <div className="-ml-2 mt-1 flex flex-wrap gap-0.5" role="tablist" aria-label="Guided steps">
            {steps.map((s, i) => (
              <button
                key={`${s.title}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === stepIndex}
                aria-label={`Step ${i + 1}: ${s.title}`}
                onClick={() => setStepIndex(i)}
                className="grid min-h-11 min-w-11 place-items-center rounded-xl transition-colors hover:bg-primary/5"
              >
                <span aria-hidden className={cn('block rounded-full transition-all', i === stepIndex ? 'size-2.5 bg-primary' : 'size-2 bg-ink-soft/35')} />
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stepIndex}
              initial={reduce ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -14 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <h4 className="text-sm font-semibold tracking-tight">{steps[stepIndex].title}</h4>
              <p className={cn('mt-1 leading-relaxed text-ink-soft', compact ? 'text-[11px]' : 'text-xs')}>{steps[stepIndex].detail}</p>
              {stepLayer?.stepHint && (
                <p className={cn('mt-1.5 text-ink-soft/80', compact ? 'text-[10px]' : 'text-[11px]')}>
                  <span aria-hidden className="mr-1">{stepLayer.emoji}</span>
                  {stepLayer.stepHint}
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIndex(i => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              aria-label="Previous step"
              className="clay-btn-soft inline-flex min-h-11 items-center gap-1 rounded-xl px-4 text-xs font-semibold disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-4" /> Prev
            </button>
            {stepIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIndex(i => Math.min(steps.length - 1, i + 1))}
                aria-label="Next step"
                className="clay-btn-soft inline-flex min-h-11 items-center gap-1 rounded-xl px-4 text-xs font-semibold"
              >
                Next <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepMode(false)}
                className="clay-btn-soft inline-flex min-h-11 items-center gap-1 rounded-xl px-4 text-xs font-semibold ring-1 ring-primary/40"
              >
                <CheckCircle2 className="size-4 text-sev-ok" /> Finish
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* layer chips — a second, organized way into the diagram (z-10 keeps
          them clickable above any 3D content projected out of the stage) */}
      <div className="relative z-10 flex flex-wrap gap-1.5" role="tablist" aria-label="Diagram layers">
        {diagram.layers.map((l, i) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={activeId === l.id}
            onClick={() => setActiveId(cur => (cur === l.id ? null : l.id))}
            className={cn(
              'clay-btn-soft inline-flex items-center gap-1.5 rounded-full font-medium transition-all',
              compact ? 'min-h-7 px-2.5 text-[10px]' : 'min-h-8 px-3 text-[11px]',
              activeId === l.id && 'ring-2 ring-primary',
              isolate && activeId !== l.id && 'opacity-55',
            )}
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: layerTint(l, i) }}
            />
            {l.label}
          </button>
        ))}
      </div>

      {/* explanation panel for the active layer (aria-live so SR users hear the change) */}
      {active && (
        <motion.div
          key={active.id}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          aria-live="polite"
          className={cn('clay relative z-10 rounded-2xl', compact ? 'p-3.5' : 'p-4')}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn('grid place-items-center rounded-xl', compact ? 'size-7 text-sm' : 'size-8 text-base')}
              style={{ background: `${layerTint(active, diagram.layers.indexOf(active))}22` }}
            >
              {active.emoji}
            </span>
            <h4 className={cn('font-semibold tracking-tight', compact ? 'text-xs' : 'text-sm')}>{active.label}</h4>
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              simple first
            </span>
          </div>
          <p className={cn('mt-2.5 leading-relaxed', compact ? 'text-[13px]' : 'text-sm')}>{active.simple}</p>
          {active.detail && active.detail !== active.simple && (
            <div className="mt-2 border-l-2 border-primary/40 pl-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Teach me deeper</p>
              <p className={cn('mt-0.5 leading-relaxed text-ink-soft', compact ? 'text-[11px]' : 'text-xs')}>{active.detail}</p>
            </div>
          )}
          {(active.clinicalNote || active.examNote) && (
            <div className="mt-2.5 space-y-1.5">
              {active.clinicalNote && (
                <p className={cn('flex items-start gap-1.5 rounded-lg border border-sev-ok/25 bg-sev-ok/5 leading-relaxed text-ink-soft', compact ? 'px-2 py-1.5 text-[10px]' : 'px-2.5 py-1.5 text-[11px]')}>
                  <Stethoscope aria-hidden className="mt-0.5 size-3 shrink-0 text-sev-ok" />
                  <span><span className="font-bold text-sev-ok">If it fails:</span> {active.clinicalNote}</span>
                </p>
              )}
              {active.examNote && (
                <p className={cn('flex items-start gap-1.5 rounded-lg border border-sev-warn/30 bg-sev-warn/5 leading-relaxed text-ink-soft', compact ? 'px-2 py-1.5 text-[10px]' : 'px-2.5 py-1.5 text-[11px]')}>
                  <GraduationCap aria-hidden className="mt-0.5 size-3 shrink-0 text-sev-warn" />
                  <span><span className="font-bold text-sev-warn">Exam angle:</span> {active.examNote}</span>
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* clinical correlation card — only when authored */}
      {diagram.clinicalCorrelation && (
        <div className="clay rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            <Activity className="size-3.5" /> Clinical correlation
          </p>
          <p className={cn('mt-1.5 leading-relaxed', compact ? 'text-[11px]' : 'text-xs')}>{diagram.clinicalCorrelation}</p>
        </div>
      )}

      {/* normal vs abnormal — compact two-column compare, only when authored */}
      {diagram.normalVsAbnormal && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-sev-ok/30 bg-sev-ok/5 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sev-ok">
              <CheckCircle2 className="size-3.5" /> Normal
            </p>
            <p className={cn('mt-1 leading-relaxed text-ink-soft', compact ? 'text-[10px]' : 'text-[11px]')}>{diagram.normalVsAbnormal.normal}</p>
          </div>
          <div className="rounded-2xl border border-sev-crit/30 bg-sev-crit/5 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sev-crit">
              <XCircle className="size-3.5" /> Abnormal
            </p>
            <p className={cn('mt-1 leading-relaxed text-ink-soft', compact ? 'text-[10px]' : 'text-[11px]')}>{diagram.normalVsAbnormal.abnormal}</p>
          </div>
        </div>
      )}

      {/* quiz trigger — only when the diagram ships questions */}
      {quiz && quiz.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setQuizOpen(v => !v)}
            aria-expanded={quizOpen}
            className="clay-btn inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-xs font-semibold"
          >
            <ListChecks className="size-4" />
            {quizOpen ? 'Hide quiz' : 'Test me on this'}
          </button>
        </div>
      )}
      {quiz && quizOpen && quiz.length > 0 && <QuizPanel quiz={quiz} />}

      {/* clinical anchor */}
      <p className={cn('flex items-start gap-2 rounded-xl border border-sev-ok/25 bg-sev-ok/5 leading-relaxed text-ink-soft', compact ? 'px-2.5 py-2 text-[11px]' : 'px-3 py-2.5 text-xs')}>
        <Stethoscope className={cn('mt-0.5 shrink-0 text-sev-ok', compact ? 'size-3' : 'size-3.5')} />
        <span>{diagram.clinical}</span>
      </p>

      {!custom && (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Waypoints className="size-3" />
          Layered from this concept&apos;s study notes — hand-drawn 3D scenes are being added to the highest-yield topics first.
        </p>
      )}
    </div>
  )
}

// ── inline quiz: click an option → instant verdict + explanation, score, retake ──

function QuizPanel({ quiz }: { quiz: QuizItem[] }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.map(() => null))
  const done = answers.every(a => a !== null)
  const score = answers.reduce<number>((acc, a, i) => acc + (a === quiz[i].answerIndex ? 1 : 0), 0)

  const pick = (qi: number, oi: number) => {
    setAnswers(cur => (cur[qi] !== null ? cur : cur.map((a, i) => (i === qi ? oi : a))))
  }
  const retake = () => setAnswers(quiz.map(() => null))

  return (
    <div className="clay space-y-3 rounded-2xl p-4" aria-label="Diagram self-test">
      {quiz.map((item, qi) => {
        const chosen = answers[qi]
        const answered = chosen !== null
        return (
          <div key={qi} className="rounded-xl border border-line/70 p-3">
            <p className="text-xs font-semibold leading-snug">{qi + 1}. {item.q}</p>
            <div className="mt-2 grid gap-1.5" role="group" aria-label={`Question ${qi + 1} options`}>
              {item.options.map((opt, oi) => {
                const isAnswer = oi === item.answerIndex
                const isChosen = chosen === oi
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={answered}
                    onClick={() => pick(qi, oi)}
                    aria-pressed={isChosen}
                    className={cn(
                      'clay-btn-soft flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-[11px] font-medium leading-snug transition-all',
                      answered && isAnswer && 'border-sev-ok/60 bg-sev-ok/10 text-sev-ok',
                      answered && isChosen && !isAnswer && 'border-sev-crit/60 bg-sev-crit/10 text-sev-crit',
                      answered && !isAnswer && !isChosen && 'opacity-45',
                    )}
                  >
                    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border border-line text-[9px] font-bold">
                      {answered && isAnswer ? <CheckCircle2 className="size-3.5" /> : answered && isChosen ? <XCircle className="size-3.5" /> : String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                  </button>
                )
              })}
            </div>
            {answered && (
              <p
                aria-live="polite"
                className={cn(
                  'mt-2 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed',
                  chosen === item.answerIndex ? 'bg-sev-ok/10 text-sev-ok' : 'bg-sev-crit/10 text-sev-crit',
                )}
              >
                {chosen === item.answerIndex ? 'Correct — ' : 'Not quite — '}
                {item.explain}
              </p>
            )}
          </div>
        )
      })}
      {done && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Trophy aria-hidden className="size-4 text-primary" />
            Score: {score}/{quiz.length}{score === quiz.length ? ' — perfect!' : ' — retake to lock it in.'}
          </p>
          <button
            type="button"
            onClick={retake}
            className="clay-btn-soft ml-auto inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-semibold"
          >
            Retake
          </button>
        </div>
      )}
    </div>
  )
}

// ── the 3D layer stack — each layer is a floating clay card ──

function LayerStack({
  diagram,
  activeId,
  onLayerClick,
  isolate = false,
  showLabels = false,
  stepLayerId = null,
  reduce,
  compact = false,
}: {
  diagram: Diagram3D
  activeId: string | null
  onLayerClick: (id: string) => void
  isolate?: boolean
  showLabels?: boolean
  stepLayerId?: string | null
  reduce: boolean | null
  compact?: boolean
}) {
  const n = diagram.layers.length
  const gap = compact ? 38 : 46
  return (
    <div className={cn('scene3d-plane relative', compact ? 'h-[190px] w-[260px] md:h-[210px] md:w-[320px]' : 'h-[220px] w-[300px] md:h-[240px] md:w-[360px]')}>
      {diagram.layers.map((l, i) => {
        const isActive = activeId === l.id
        const tint = layerTint(l, i)
        const dimmed = isolate && !!activeId && !isActive
        const stepped = stepLayerId === l.id && !isActive
        // spread layers through Z from back to front; active jumps forward
        const baseZ = (n - 1 - i) * gap
        const z = isActive ? baseZ + 100 : baseZ
        const yOffset = isActive ? 0 : i * 3
        return (
          <motion.button
            key={l.id}
            type="button"
            onClick={() => onLayerClick(l.id)}
            aria-pressed={isActive}
            aria-label={`${l.label}: ${l.simple}`}
            className={cn(
              'layer3d layer3d-card absolute top-1/2 flex items-center text-left',
              compact ? 'inset-x-4 gap-2.5 rounded-xl p-2.5 md:inset-x-8' : 'inset-x-6 gap-3 rounded-2xl p-3 md:inset-x-10',
              isActive ? 'z-30' : 'z-10',
              !reduce && !isActive && 'layer3d-float',
            )}
            initial={reduce ? false : { opacity: 0, y: 40 }}
            animate={{
              opacity: dimmed ? 0.16 : 1,
              y: yOffset,
              z,
              rotateX: isActive ? 0 : -2,
              scale: isActive ? 1.02 : 1,
            }}
            transition={{ type: 'spring', stiffness: 170, damping: 22, delay: reduce ? 0 : i * 0.06 }}
            style={
              {
                '--lz': `${baseZ}px`,
                borderColor: isActive ? `${tint}88` : undefined,
                boxShadow: isActive
                  ? `0 26px 48px -18px ${tint}66, inset 0 1.5px 4px -1px var(--clay-hi), 0 0 0 1px ${tint}55`
                  : stepped
                    ? `0 0 0 2px ${tint}, 0 14px 34px -16px ${tint}55`
                    : undefined,
              } as React.CSSProperties
            }
          >
            <span
              aria-hidden
              className={cn('grid shrink-0 place-items-center rounded-xl', compact ? 'size-8 text-base' : 'size-10 text-lg')}
              style={{
                background: `linear-gradient(150deg, ${tint}30, ${tint}12)`,
                boxShadow: `inset 0 1px 3px -1px ${tint}55, inset 0 -2px 4px -2px ${tint}33`,
              }}
            >
              {l.emoji}
            </span>
            <span className="min-w-0">
              <span className={cn('block truncate font-semibold leading-tight', compact ? 'text-[11px]' : 'text-xs')}>{l.label}</span>
              <span className={cn('block truncate text-ink-soft', compact ? 'text-[9px]' : 'text-[10px]')}>{l.simple}</span>
            </span>
            {showLabels && (
              <span
                aria-hidden
                className="pointer-events-none absolute -top-3.5 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-card/90 px-2 py-0.5 text-[9px] font-bold backdrop-blur"
                style={{ color: tint }}
              >
                {l.emoji} {l.label}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
