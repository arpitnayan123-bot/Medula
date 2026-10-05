'use client'

// ─── MEDICAL IMAGE LEARNING LAB · GRADED RUNNERS (PRODUCT 10) ───
// Five runners over one skeleton: identify (options under the image),
// interpret (tap-to-pin locate → multi-select label commit), diagnose
// (vignette + options), quiz (one question at a time) and rapid fire (10
// timed items, verdict flash, immediate next). Every commit is graded by the
// deterministic engine — the client never sees the answer key, only the
// feedback payload. Timer + quit-confirm → labAbandon.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, Flag, Loader2, LogOut, Target, Timer, XCircle, Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import { LAB_MODE_META } from '@/lib/types'
import type {
  LabActResponse, LabDebrief, LabFeedback, LabImageDetail, LabMode, LabOptionPublic, LabPin,
  LabRapidStart,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { LAB_STEP_IDS, LAB_VERDICT_META, EASE, fmtClock, verdictTextTone } from './lab-shared'
import { LabViewer } from './lab-viewer'
import type { LabPinMarker } from './lab-viewer'

export type LabPlayerMode = Exclude<LabMode, 'guided'>

interface PlayerProps {
  detail: LabImageDetail | null // null in rapid mode (items carry their own images)
  mode: LabPlayerMode
  resume: { attemptId: string; mode: LabMode; startedAt: string } | null
  rapidScope: { modality?: string; subjectCode?: string } | null
  onComplete: (debrief: LabDebrief) => void
  onExit: () => void
}

interface LabStep {
  id: string
  prompt: string
  options?: LabOptionPublic[]
  multi?: boolean
  imageSrc?: string
  imageAlt?: string
}

// ─── Feedback card (engine payload → honest UI) ──────────────────────────────

function FeedbackCard({ fb, onContinue, busy, continueLabel, children }: {
  fb: LabFeedback
  onContinue: () => void
  busy: boolean
  continueLabel: string
  children?: React.ReactNode
}) {
  return (
    <motion.section
      role="status"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="glass space-y-3.5 rounded-2xl p-4 md:p-5"
      aria-label="Grader feedback"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn('min-w-0 flex-1 text-sm font-semibold leading-snug', fb.correct ? 'text-sev-ok' : 'text-foreground')}>
          <span className="mr-1.5 inline-block align-[-3px]">
            {fb.correct ? <CheckCircle2 className="size-4 text-sev-ok" aria-hidden /> : <XCircle className="size-4 text-sev-warn" aria-hidden />}
          </span>
          {fb.headline}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold tabular-nums text-primary">
          <Flag className="size-3" aria-hidden /> {Math.round(fb.score)}/100
        </span>
      </div>

      {children}

      {fb.perOption && fb.perOption.length > 0 && (
        <ul className="space-y-2.5">
          {fb.perOption.map((o) => {
            const meta = LAB_VERDICT_META[o.verdict]
            const Icon = meta.icon
            return (
              <li key={o.id} className="min-w-0 space-y-1">
                <div className="flex items-start gap-2.5">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', verdictTextTone(o.verdict))} aria-hidden />
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{o.label}</p>
                  <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', meta.chip)}>
                    {meta.label}
                  </span>
                </div>
                <p className="ml-[1.625rem] text-[13px] leading-relaxed text-ink-soft">{o.why}</p>
              </li>
            )
          })}
        </ul>
      )}

      {fb.missed && fb.missed.length > 0 && (
        <div className="space-y-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sev-warn">
            <AlertTriangle className="size-3.5" aria-hidden /> Missed
          </p>
          <ul className="space-y-1.5">
            {fb.missed.map((m) => (
              <li key={m.id} className="text-[13px] leading-relaxed">
                <span className="font-semibold">{m.label}</span>
                <span className="text-ink-soft"> — {m.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fb.teaching && (
        <p className="rounded-xl border-l-2 border-primary/50 bg-surface-2/60 px-3.5 py-2.5 text-[13px] italic leading-relaxed text-ink-soft">
          <span className="sr-only">Teaching point: </span>{fb.teaching}
        </p>
      )}

      <Button className="clay-btn min-h-12 w-full sm:w-auto" onClick={onContinue} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {continueLabel}
        {!busy && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </motion.section>
  )
}

// ─── Root player ──────────────────────────────────────────────────────────────

export function LabPlayer({ detail, mode, resume, rapidScope, onComplete, onExit }: PlayerProps) {
  const reduce = useReducedMotion()
  const meta = LAB_MODE_META[mode]

  // ── Attempt lifecycle ──
  const [attempt, setAttempt] = useState<{ id: string; startedAt: string } | null>(
    resume && resume.mode === mode ? { id: resume.attemptId, startedAt: resume.startedAt } : null,
  )
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startKey, setStartKey] = useState(0)
  const [rapid, setRapid] = useState<LabRapidStart | null>(null)

  // ── Step state ──
  const [stepIndex, setStepIndex] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [pin, setPin] = useState<LabPin | null>(null)
  const [placedPins, setPlacedPins] = useState<LabPin[]>([]) // multi-pin locate — every committed pin
  const [aspect, setAspect] = useState<number | null>(null)
  const [acting, setActing] = useState(false)
  const [actError, setActError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<LabActResponse | null>(null)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState(false)

  // ── Quit flow + timer ──
  const [quitOpen, setQuitOpen] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const stepStartRef = useRef(Date.now())
  const autoNextRef = useRef<number | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const clearAutoNext = useCallback(() => {
    if (autoNextRef.current != null) {
      window.clearTimeout(autoNextRef.current)
      autoNextRef.current = null
    }
  }, [])
  useEffect(() => clearAutoNext, [clearAutoNext])

  // ── Start (or resume) the attempt ──
  // NOTE: `starting` is deliberately NOT a dependency — setting it inside the
  // effect would re-run the effect, fire the cleanup and kill the in-flight
  // request handler (alive=false) before the response ever lands.
  useEffect(() => {
    if (attempt) return
    let alive = true
    const start = async () => {
      try {
        setStarting(true)
        setStartError(null)
        if (mode === 'rapid') {
          const res = await api.labRapidStart(rapidScope ?? {})
          if (!alive) return
          setRapid(res)
          setAttempt({ id: res.attemptId, startedAt: new Date().toISOString() })
        } else if (detail) {
          const res = await api.labStart(detail.summary.id, mode)
          if (!alive) return
          setAttempt({ id: res.attemptId, startedAt: new Date().toISOString() })
        }
      } catch {
        if (alive) setStartError(mode === 'rapid'
          ? 'Rapid fire could not start — check your connection and try again.'
          : 'The attempt could not start — check your connection and try again.')
      } finally {
        if (alive) setStarting(false)
      }
    }
    void start()
    return () => { alive = false }
     
  }, [attempt, startKey, mode, detail, rapidScope])

  // ── Natural aspect for pin grading (interpret locate) ──
  const pinSrc = mode === 'interpret' && detail ? detail.summary.src : null
  useEffect(() => {
    if (!pinSrc) return
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive && img.naturalWidth > 0) setAspect(img.naturalWidth / img.naturalHeight) }
    img.src = pinSrc
    return () => { alive = false }
  }, [pinSrc])

  // ── Step plan ──
  const steps: LabStep[] = useMemo(() => {
    if (mode === 'rapid') {
      return (rapid?.items ?? []).map((it) => ({
        id: it.imageId,
        prompt: it.prompt,
        options: it.options,
        imageSrc: it.src,
        imageAlt: `${it.modality} image`,
      }))
    }
    if (!detail) return []
    if (mode === 'identify') {
      return [{ id: LAB_STEP_IDS.identify, prompt: detail.identifyPrompt, options: detail.identifyOptions }]
    }
    if (mode === 'diagnose') {
      return [{ id: LAB_STEP_IDS.diagnose, prompt: detail.diagnosePrompt, options: detail.diagnoseOptions }]
    }
    if (mode === 'interpret') {
      return [
        { id: LAB_STEP_IDS.locate, prompt: `Tap the image to pin every finding — ${detail.locateCount} zones to find` },
        { id: LAB_STEP_IDS.label, prompt: detail.interpretPrompt, options: detail.interpretOptions, multi: true },
      ]
    }
    return detail.quiz.map((q) => ({ id: q.id, prompt: q.q, options: q.options }))
  }, [mode, detail, rapid])

  const step: LabStep | null = steps[stepIndex] ?? null
  const elapsedMs = attempt ? Math.max(0, now - new Date(attempt.startedAt).getTime()) : 0

  // ── Commit one step ──
  const commit = useCallback(async (payload: { chosen?: string | string[]; pin?: LabPin | null }) => {
    if (!attempt || !step) return
    setActing(true)
    setActError(null)
    clearAutoNext()
    try {
      const response = await api.labAct(attempt.id, {
        stepId: step.id,
        ...payload,
        ...(payload.pin && aspect != null ? { aspect } : {}),
        timeMs: Math.max(300, Date.now() - stepStartRef.current),
      })
      setFeedback(response)
      if (mode === 'interpret' && step.id === LAB_STEP_IDS.locate && payload.pin) {
        setPlacedPins((prev) => [...prev, payload.pin!])
      }
      if (mode !== 'rapid') {
        requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }))
      }
    } catch {
      setActError('The engine could not grade that — try again.')
    } finally {
      setActing(false)
    }
  }, [attempt, step, aspect, mode, reduce, clearAutoNext])

  // ── Complete → debrief ──
  const complete = useCallback(async () => {
    if (!attempt) return
    setCompleting(true)
    setCompleteError(false)
    try {
      const debrief = await api.labComplete(attempt.id)
      onComplete(debrief)
    } catch {
      setCompleteError(true)
    } finally {
      setCompleting(false)
    }
  }, [attempt, onComplete])

  // ── Continue after feedback ──
  const continueRef = useRef<() => void>(() => {})
  continueRef.current = () => {
    if (!feedback) return
    if (feedback.done) {
      void complete()
      return
    }
    setStepIndex(feedback.nextIndex)
    setFeedback(null)
    setSelected([])
    setPin(null)
    setPlacedPins([])
    stepStartRef.current = Date.now()
    if (!feedback.done) {
      void api.labStage(attempt?.id ?? '', { stepIndex: feedback.nextIndex }).catch(() => { /* best-effort sync */ })
    }
  }

  // Rapid: verdict flash then immediate next
  const scheduleRapidNext = useCallback(() => {
    if (mode !== 'rapid') return
    clearAutoNext()
    autoNextRef.current = window.setTimeout(() => continueRef.current(), 1500)
  }, [mode, clearAutoNext])

  // ── Abandon ──
  const abandon = useCallback(async () => {
    setAbandoning(true)
    if (attempt) {
      try { await api.labAbandon(attempt.id) } catch { /* leave anyway — never completed */ }
    }
    onExit()
  }, [attempt, onExit])

  // ── Pin handling (interpret locate) ──
  const onPinPlace = useCallback((p: LabPin) => {
    if (feedback || acting) return
    setPin(p)
  }, [feedback, acting])

  // ─── Render ───
  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      {/* ── Sticky command bar ── */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-background/85 px-4 pb-2.5 pt-2 backdrop-blur-xl md:-mx-6 md:px-6">
        <div ref={topRef} className="flex flex-wrap items-center gap-2" aria-label="Attempt command bar">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 gap-1.5 px-3 text-ink-soft hover:text-foreground"
            onClick={() => setQuitOpen(true)}
          >
            <LogOut className="size-4" aria-hidden /> Leave
          </Button>
          {attempt && (
            <span
              className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums"
              role="timer"
              aria-label={`Elapsed time ${fmtClock(elapsedMs)}`}
            >
              <Timer className="size-3.5 text-primary" aria-hidden /> {fmtClock(elapsedMs)}
            </span>
          )}
          <Badge variant="outline" className="ml-auto shrink-0 border-primary/30 bg-primary/10 text-[10px] font-bold uppercase tracking-wider text-primary">
            {meta.label}{meta.graded ? '' : ' · guided'}
          </Badge>
        </div>

        {attempt && steps.length > 0 && (
          <div className="mt-2 flex items-center gap-3">
            <p className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-ink-soft" aria-live="polite">
              {mode === 'rapid'
                ? `Item ${Math.min(stepIndex + 1, steps.length)} of ${steps.length}`
                : step
                  ? `Step ${stepIndex + 1} of ${steps.length}`
                  : ''}
            </p>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2" role="presentation">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.min(100, (stepIndex / Math.max(1, steps.length)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Rapid per-item countdown */}
        {mode === 'rapid' && rapid && attempt && !feedback && (
          <div className="mt-2" aria-hidden>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                key={stepIndex}
                className="h-full bg-sev-warn"
                style={{
                  width: '100%',
                  animation: reduce ? undefined : `lab-drain ${rapid.timeLimitMs}ms linear forwards`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Attempt not started ── */}
      {!attempt && (
        <section aria-label="Starting the attempt" className="space-y-3">
          {startError && (
            <div className="glass flex flex-col items-start gap-3 rounded-2xl p-5">
              <p role="alert" className="text-sm text-sev-crit">{startError}</p>
              <Button className="min-h-12" onClick={() => setStartKey((k) => k + 1)} disabled={starting}>
                {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}
                Try again
              </Button>
            </div>
          )}
          {!startError && (
            <div className="glass flex items-center gap-3 rounded-2xl p-5">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              <p className="text-sm text-ink-soft">Preparing the attempt…</p>
            </div>
          )}
        </section>
      )}

      {/* ── Active step ── */}
      {attempt && step && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${stepIndex}-${feedback ? 'fb' : 'ask'}`}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="space-y-5"
          >
            {/* Image (primary focus) */}
            {!feedback && (
              <LabViewer
                src={step.imageSrc ?? (mode === 'rapid' ? '' : detail?.summary.src ?? '')}
                alt={step.imageAlt ?? `${detail?.summary.title ?? 'Image'} — attempt in progress`}
                provenance={mode === 'rapid' ? null : detail?.summary.provenance ?? null}
                pinMode={mode === 'interpret' && step.id === LAB_STEP_IDS.locate}
                onPin={mode === 'interpret' ? onPinPlace : undefined}
                pinDraft={mode === 'interpret' ? pin : null}
                pins={
                  mode === 'interpret' && step.id === LAB_STEP_IDS.locate
                    ? (placedPins.map((p) => ({ x: p.x, y: p.y })) as LabPinMarker[])
                    : undefined
                }
                compact={mode === 'rapid'}
              />
            )}

            {/* Post-commit viewer: student pin + region reveal */}
            {feedback && feedback.feedback.pins && (
              <LabViewer
                src={detail?.summary.src ?? ''}
                alt={`${detail?.summary.title ?? 'Image'} — regions revealed`}
                provenance={detail?.summary.provenance ?? null}
                pins={[
                  ...(feedback.feedback.pins.student ? [{ x: feedback.feedback.pins.student.x, y: feedback.feedback.pins.student.y } as LabPinMarker] : []),
                  ...(feedback.feedback.pins.results ?? [])
                    .filter((r) => r.region != null)
                    .map((r) => ({ x: r.region!.x, y: r.region!.y, verdict: r.verdict } as LabPinMarker)),
                ]}
                annotations={(feedback.feedback.pins.results ?? [])
                  .filter((r) => r.region != null)
                  .map((r, i) => ({ n: i + 1, label: r.label, x: r.region!.x, y: r.region!.y }))}
                forceAnnotations
              />
            )}

            {/* Diagnose vignette */}
            {mode === 'diagnose' && detail && (
              <section className="glass space-y-2 rounded-2xl p-4 md:p-5" aria-label="Clinical context">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Clinical context</p>
                <p className="text-sm leading-relaxed">{detail.diagnoseContext}</p>
              </section>
            )}

            {/* Prompt + options */}
            {!feedback && (
              <section aria-label={step.prompt} className="space-y-3">
                <h2 className="text-base font-semibold leading-snug tracking-tight md:text-lg">{step.prompt}</h2>

                {mode === 'interpret' && step.id === LAB_STEP_IDS.locate && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="clay-btn min-h-12"
                      disabled={!pin || acting}
                      onClick={() => void commit({ pin })}
                    >
                      {acting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Target className="size-4" aria-hidden />}
                      Commit pin
                    </Button>
                    {pin && (
                      <Button variant="outline" className="min-h-12" onClick={() => setPin(null)} disabled={acting}>
                        Reposition
                      </Button>
                    )}
                    {!pin && (
                      <p className="text-xs leading-relaxed text-ink-soft">
                        Tap the picture to drop the pin — drag to pan, pinch or double-tap to zoom for precision.
                      </p>
                    )}
                  </div>
                )}

                {step.options && !(mode === 'interpret' && step.id === LAB_STEP_IDS.locate) && (
                  <>
                    {step.multi && (
                      <p className="text-xs font-semibold tabular-nums text-ink-soft" aria-live="polite">
                        {selected.length} selected — pick every finding that is present, including absences you can defend
                      </p>
                    )}
                    <div className={cn('grid gap-2', mode === 'rapid' && 'sm:grid-cols-2')} role={step.multi ? 'group' : undefined} aria-label={step.prompt}>
                      {step.options.map((opt) => {
                        const isSel = selected.includes(opt.id)
                        const committed = feedback != null
                        const disabled = acting || committed || (step.multi ? false : !!feedback)
                        return step.multi ? (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={isSel}
                            disabled={disabled}
                            onClick={() => setSelected((s) => (s.includes(opt.id) ? s.filter((x) => x !== opt.id) : [...s, opt.id]))}
                            className={cn(
                              'flex min-h-11 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                              isSel ? 'clay-in border-primary/50 bg-primary/10 font-medium' : 'border-line bg-surface-2/40 hover:border-primary/40',
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border',
                                isSel ? 'border-primary bg-primary text-primary-foreground' : 'border-line bg-background/60',
                              )}
                            >
                              {isSel && <Check className="size-3.5" />}
                            </span>
                            <span className="min-w-0">{opt.label}</span>
                          </button>
                        ) : (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              if (mode === 'rapid') {
                                setSelected([opt.id])
                                void commit({ chosen: opt.id }).then(() => scheduleRapidNext())
                              } else {
                                setSelected([opt.id])
                                void commit({ chosen: opt.id })
                              }
                            }}
                            className="min-h-11 w-full rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-left text-sm leading-snug transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>

                    {step.multi && (
                      <>
                        <Button
                          className="clay-btn min-h-12 w-full sm:w-auto"
                          disabled={acting || selected.length === 0 || !!feedback}
                          onClick={() => void commit({ chosen: selected })}
                        >
                          {acting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                          Commit selection
                          <ArrowRight className="size-4" aria-hidden />
                        </Button>
                        {selected.length === 0 && (
                          <p className="text-xs text-ink-soft">Select at least one finding to commit.</p>
                        )}
                      </>
                    )}
                  </>
                )}

                {actError && (
                  <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-sm text-sev-crit">
                    {actError}
                  </p>
                )}
              </section>
            )}

            {/* Feedback */}
            {feedback && (
              <FeedbackCard
                fb={feedback.feedback}
                busy={completing}
                continueLabel={feedback.done ? (mode === 'rapid' ? 'See the debrief' : 'Complete the attempt') : mode === 'rapid' ? 'Next image' : 'Continue'}
                onContinue={() => continueRef.current()}
              >
                {feedback.feedback.pins && (
                  <p className="text-[13px] leading-relaxed text-ink-soft">
                    Pins hit: <span className="font-bold tabular-nums">{feedback.feedback.pins.hits}/{feedback.feedback.pins.total}</span>
                    {' '}— your pins are blue, hit zones glow green. Missed zones stay hidden — meet them in the Guided Explanation after this attempt.
                  </p>
                )}
                {completeError && (
                  <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-3.5 py-2.5 text-sm text-sev-crit">
                    The debrief could not be generated — the run is saved. Try again.
                  </p>
                )}
              </FeedbackCard>
            )}

            {/* Multi-pin locate: keep placing pins until every zone is found */}
            {mode === 'interpret' && step.id === LAB_STEP_IDS.locate && feedback?.feedback.pins && feedback.feedback.pins.hits < feedback.feedback.pins.total && (
              <Button
                variant="outline"
                className="min-h-11 w-full sm:w-auto"
                disabled={acting}
                onClick={() => {
                  setFeedback(null)
                  setPin(null)
                  stepStartRef.current = Date.now()
                }}
              >
                <Target className="size-4" aria-hidden />
                Pin another zone — {feedback.feedback.pins.total - feedback.feedback.pins.hits} left
              </Button>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Quit confirm ── */}
      <Dialog open={quitOpen} onOpenChange={setQuitOpen}>
        <DialogContent className="max-w-sm" aria-describedby="lab-quit-desc">
          <DialogHeader>
            <DialogTitle>Leave this attempt?</DialogTitle>
            <DialogDescription id="lab-quit-desc">
              {abandoning
                ? 'Abandoning…'
                : 'The attempt is abandoned — it will not be scored or fed to your revision queue. You can always start it again.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="min-h-11 flex-1" onClick={() => setQuitOpen(false)} disabled={abandoning}>
              Keep going
            </Button>
            <Button variant="destructive" className="min-h-11 flex-1" onClick={() => void abandon()} disabled={abandoning}>
              {abandoning ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rapid drain keyframes (scoped, tiny) */}
      <style>{`@keyframes lab-drain { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  )
}
