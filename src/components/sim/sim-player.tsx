'use client'

// ─── CLINICAL CASE SIMULATOR · PLAYER (PRODUCT 09) ───
// The immersive case runner. Stages render one interaction at a time; the
// deterministic engine grades every commit — the AI patient never grades.
// AI Case Mode replaces history / examination / investigations with a
// roleplay chat («You are the doctor. I am the patient.») and hands back to
// the structured engine at the differential stage so grading stays fair.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, ArrowRight, Bot, Check, Flag, Image as ImageIcon, Loader2, LogOut,
  MessagesSquare, Send, Stethoscope, Timer, UserRound,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  SIM_DIFFICULTY_META,
} from '@/lib/types'
import type {
  SimActResponse, SimAiMessage, SimCaseDetail, SimDebrief, SimDifficulty,
  SimFeedback, SimInteractionPublic, SimStagePublic,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  AI_QUICK_CHIPS, AI_SCENE_NOTE, DIFF_TONE, EASE, MicroLabel, STAGE_META, VERDICT_META,
  fmtClock, imgSrc, isAiChatStage, SCROLL_SLIM,
} from './sim-shared'

// ─── Types ───────────────────────────────────────────────────────────────────

type AttemptMode = 'guided' | 'ai'

interface ChatEntry {
  role: 'user' | 'assistant'
  content: string
  /** local scene note — rendered in the client only, never sent to the API */
  local?: boolean
}

interface Attempt {
  id: string
  mode: AttemptMode
  startedAt: string
  stageIndex: number
  doneIds: string[]
  chat: ChatEntry[]
}

interface PlayerProps {
  detail: SimCaseDetail
  resume: { attemptId: string; stageIndex: number; mode: string; startedAt: string; events: unknown[] } | null
  onComplete: (debrief: SimDebrief) => void
  onExit: () => void
}

/** Defensive parse of the attempt's append-only event feed (typed server-side). */
function parseEvents(raw: unknown[]): { doneIds: string[]; chat: ChatEntry[] } {
  const doneIds: string[] = []
  const chat: ChatEntry[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const ev = e as Record<string, unknown>
    if (ev.type === 'chat' && (ev.role === 'user' || ev.role === 'assistant') && typeof ev.content === 'string') {
      chat.push({ role: ev.role, content: ev.content })
    } else if (typeof ev.interactionId === 'string') {
      doneIds.push(ev.interactionId)
    }
  }
  return { doneIds, chat }
}

const COMMIT_LABEL: Record<SimInteractionPublic['kind'], string> = {
  explore: 'Commit — see what you find',
  key: 'Commit',
  choice: 'Commit',
  multi: 'Commit selection',
}

// ─── Root player ─────────────────────────────────────────────────────────────

export function SimPlayer({ detail, resume, onComplete, onExit }: PlayerProps) {
  const reduce = useReducedMotion()
  const summary = detail.summary

  // ── Attempt lifecycle ──
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    if (!resume) return null
    const parsed = parseEvents(Array.isArray(resume.events) ? resume.events : [])
    return {
      id: resume.attemptId,
      mode: resume.mode === 'ai' ? 'ai' : 'guided',
      startedAt: resume.startedAt,
      stageIndex: Math.min(Math.max(0, resume.stageIndex), Math.max(0, detail.stages.length - 1)),
      doneIds: parsed.doneIds,
      chat: parsed.chat,
    }
  })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  // ── Interaction state ──
  const [selected, setSelected] = useState<string[]>([])
  const [acting, setActing] = useState(false)
  const [actError, setActError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ interactionId: string; chosen: string[]; response: SimActResponse } | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState(false)

  // ── AI chat state ──
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatNotice, setChatNotice] = useState<string | null>(null)

  // ── Quit flow ──
  const [quitOpen, setQuitOpen] = useState(false)
  const [abandoning, setAbandoning] = useState(false)

  // ── Live timer (mm:ss from startedAt) ──
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const topRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const startAttempt = useCallback(async (mode: AttemptMode) => {
    setStarting(true)
    setStartError(null)
    try {
      const res = await api.simStart(summary.id, mode)
      setAttempt({ id: res.attemptId, mode, startedAt: new Date().toISOString(), stageIndex: 0, doneIds: [], chat: [] })
    } catch {
      setStartError('The simulator could not start this case — check your connection and try again.')
    } finally {
      setStarting(false)
    }
  }, [summary.id])

  // Guided cases start immediately; AI-ready cases show the mode choice first.
  useEffect(() => {
    if (resume || attempt) return
    if (summary.aiReady) return
    void startAttempt('guided')
  }, [resume, attempt, summary.aiReady, startAttempt])

  const stage: SimStagePublic | null = useMemo(() => {
    if (!attempt) return null
    return detail.stages[attempt.stageIndex] ?? detail.stages[detail.stages.length - 1] ?? null
  }, [attempt, detail.stages])

  const elapsedMs = attempt ? Math.max(0, now - new Date(attempt.startedAt).getTime()) : 0

  const scrollToTop = useCallback(() => {
    topRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [reduce])

  // ── Stage advance (patient → history, chat → differential, stage → stage) ──
  const advance = useCallback(async (stageIndex: number) => {
    if (!attempt) return
    setAdvancing(true)
    setActError(null)
    const next = detail.stages[stageIndex]
    try {
      await api.simAdvance(attempt.id, { stageIndex })
      setAttempt((a) => {
        if (!a) return a
        const chat = [...a.chat]
        if (a.mode === 'ai' && next && isAiChatStage(next.kind) && AI_SCENE_NOTE[next.kind]) {
          chat.push({ role: 'assistant', content: AI_SCENE_NOTE[next.kind]!, local: true })
        }
        return { ...a, stageIndex, chat }
      })
      setFeedback(null)
      setSelected([])
      requestAnimationFrame(scrollToTop)
    } catch {
      setActError('Could not move to the next stage — the attempt is saved; try again.')
    } finally {
      setAdvancing(false)
    }
  }, [attempt, detail.stages, scrollToTop])

  // ── Commit an interaction to the deterministic engine ──
  const commit = useCallback(async (interaction: SimInteractionPublic, chosen: string[]) => {
    if (!attempt || !stage) return
    setActing(true)
    setActError(null)
    try {
      const response = await api.simAct(attempt.id, { stageId: stage.id, interactionId: interaction.id, chosen })
      setFeedback({ interactionId: interaction.id, chosen, response })
      setAttempt((a) => (a ? { ...a, doneIds: [...a.doneIds, interaction.id] } : a))
      requestAnimationFrame(() => {
        feedbackRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      })
    } catch {
      setActError('The engine could not grade that choice — try again.')
    } finally {
      setActing(false)
    }
  }, [attempt, stage, reduce])

  // ── Continue after feedback: next interaction → next stage → complete ──
  const continueFlow = useCallback(async () => {
    if (!attempt || !feedback) return
    const { response } = feedback
    if (response.allDone) {
      setCompleting(true)
      setCompleteError(false)
      try {
        const debrief = await api.simComplete(attempt.id)
        onComplete(debrief)
      } catch {
        setCompleteError(true)
      } finally {
        setCompleting(false)
      }
      return
    }
    if (response.stageDone) {
      await advance(attempt.stageIndex + 1)
      return
    }
    setFeedback(null)
    setSelected([])
  }, [attempt, feedback, advance, onComplete])

  // ── AI patient chat ──
  const sendChat = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || !attempt || chatBusy) return
    const history: SimAiMessage[] = attempt.chat
      .filter((c) => !c.local)
      .map((c) => ({ role: c.role, content: c.content }))
    setChatBusy(true)
    setChatNotice(null)
    setChatInput('')
    setAttempt((a) => (a ? { ...a, chat: [...a.chat, { role: 'user', content: msg }] } : a))
    try {
      const res = await api.simAi(attempt.id, { message: msg, messages: history })
      setAttempt((a) => (a ? { ...a, chat: [...a.chat, { role: 'assistant', content: res.reply }] } : a))
      setChatNotice(res.fallback
        ? 'The AI patient is unreachable right now — this reply came from the written case notes.'
        : null)
    } catch {
      // No reply arrived — remove the optimistic message so the transcript
      // stays honest, and explain the situation calmly.
      setChatNotice('The AI patient is unreachable right now. You can end the consultation and continue — the structured stages still grade normally.')
      setAttempt((a) => {
        if (!a) return a
        const chat = [...a.chat]
        if (chat[chat.length - 1]?.role === 'user') chat.pop()
        return { ...a, chat }
      })
    } finally {
      setChatBusy(false)
    }
  }, [attempt, chatBusy])

  // keep chat scrolled to the newest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [attempt?.chat.length, chatBusy])

  const abandon = useCallback(async () => {
    if (!attempt) return onExit()
    setAbandoning(true)
    try {
      await api.simAbandon(attempt.id)
    } catch {
      // leave anyway — the abandoned attempt is simply never completed
    }
    onExit()
  }, [attempt, onExit])

  // ── Derived per render ──
  const doneSet = useMemo(() => new Set(attempt?.doneIds ?? []), [attempt?.doneIds])
  const nextInteraction = stage && !feedback
    ? stage.interactions.find((ix) => !doneSet.has(ix.id)) ?? null
    : null
  const gradedInteraction = feedback && stage
    ? stage.interactions.find((ix) => ix.id === feedback.interactionId) ?? null
    : null
  const diffIndex = detail.stages.findIndex((s) => s.kind === 'differential')
  const chatStage = attempt && stage && attempt.mode === 'ai' && isAiChatStage(stage.kind)

  // ─── Render ───
  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      {/* ── Sticky command bar: leave · timer · mode · stage rail ── */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-background/85 px-4 pb-2.5 pt-2 backdrop-blur-xl md:-mx-6 md:px-6">
        <div ref={topRef} className="flex flex-wrap items-center gap-2" aria-label="Case command bar">
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
              className="clay inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums"
              role="timer"
              aria-label={`Elapsed time ${fmtClock(elapsedMs)}`}
            >
              <Timer className="size-3.5 text-primary" aria-hidden /> {fmtClock(elapsedMs)}
            </span>
          )}
          {attempt?.mode === 'ai' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-warn/40 bg-sev-warn/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-sev-warn">
              <Bot className="size-3.5" aria-hidden /> AI-generated scenario
            </span>
          )}
          <Badge variant="outline" className={cn('ml-auto shrink-0 border text-[10px] font-bold uppercase tracking-wider', DIFF_TONE[summary.difficulty])}>
            {SIM_DIFFICULTY_META[summary.difficulty]?.label ?? summary.difficulty}
          </Badge>
        </div>

        {/* Stage rail */}
        {attempt && stage && (
          <nav aria-label="Case stages" className={cn('mt-2 flex gap-1.5 overflow-x-auto pb-1', SCROLL_SLIM)}>
            {detail.stages.map((s, i) => {
              const meta = STAGE_META[s.kind]
              const Icon = meta.icon
              const isDone = i < attempt.stageIndex
              const isCurrent = i === attempt.stageIndex
              return (
                <span
                  key={s.id}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    isCurrent
                      ? 'border-primary/40 bg-primary/12 text-primary'
                      : isDone
                        ? 'border-line bg-surface-2/60 text-ink-soft'
                        : 'border-line/60 bg-transparent text-ink-soft/60',
                  )}
                >
                  {isDone ? (
                    <Check className="size-3" aria-hidden />
                  ) : (
                    <Icon className={cn('size-3', isCurrent && 'text-primary')} aria-hidden />
                  )}
                  {meta.label}
                </span>
              )
            })}
          </nav>
        )}
      </div>

      {/* ── Case header ── */}
      <header className="mb-5 min-w-0 space-y-1.5">
        <MicroLabel>{summary.specialty} · {SIM_DIFFICULTY_META[summary.difficulty as SimDifficulty]?.blurb ?? ''}</MicroLabel>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{summary.title}</h1>
      </header>

      {/* ── Attempt not started: mode choice / starting ── */}
      {!attempt && (
        <section aria-label="Choose case mode" className="space-y-3">
          {startError && (
            <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-sm text-sev-crit">
              {startError}
            </p>
          )}
          {summary.aiReady ? (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">
                This case can run two ways — both are graded by the same deterministic engine.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => void startAttempt('guided')}
                  className="clay clay-hover flex min-h-44 flex-col items-start gap-2.5 rounded-2xl p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/12 text-primary">
                    <Stethoscope className="size-5" aria-hidden />
                  </span>
                  <span className="text-base font-semibold tracking-tight">Guided case</span>
                  <span className="text-sm leading-relaxed text-ink-soft">
                    Work the structured encounter: gather history, examine, order investigations, decide.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => void startAttempt('ai')}
                  className="clay clay-hover flex min-h-44 flex-col items-start gap-2.5 rounded-2xl p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-sev-warn/15 text-sev-warn">
                    <MessagesSquare className="size-5" aria-hidden />
                  </span>
                  <span className="text-base font-semibold tracking-tight">With the AI patient</span>
                  <span className="text-sm italic leading-relaxed text-ink-soft">
                    «You are the doctor. I am the patient.» Interview freely — the differential onwards is graded
                    as usual.
                  </span>
                </button>
              </div>
            </>
          ) : startError ? (
            <div className="clay flex flex-col items-start gap-3 rounded-2xl p-5">
              <Button className="min-h-12" onClick={() => void startAttempt('guided')} disabled={starting}>
                {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Stethoscope className="size-4" aria-hidden />}
                Begin the case
              </Button>
            </div>
          ) : (
            <div className="clay flex items-center gap-3 rounded-2xl p-5">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              <p className="text-sm text-ink-soft">Preparing the encounter…</p>
            </div>
          )}
          {starting && (
            <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Opening the case…
            </p>
          )}
        </section>
      )}

      {/* ── Stage content ── */}
      {attempt && stage && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${attempt.stageIndex}-${feedback ? `fb-${feedback.interactionId}` : nextInteraction?.id ?? 'idle'}`}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="min-w-0 space-y-4"
          >
            {/* Stage intro as clinical narrative */}
            {stage.intro.length > 0 && (
              <div className="clay space-y-2 rounded-2xl p-4 md:p-5" aria-label={`${STAGE_META[stage.kind].label} notes`}>
                <MicroLabel>{STAGE_META[stage.kind].label}</MicroLabel>
                {stage.intro.map((line, i) => (
                  <p key={i} className="text-sm leading-relaxed text-ink-soft first:text-foreground first:font-medium">
                    {line}
                  </p>
                ))}
              </div>
            )}

            {chatStage ? (
              /* ── AI patient chat stage ── */
              <AiChatPanel
                stage={stage}
                chat={attempt.chat}
                busy={chatBusy}
                notice={chatNotice}
                input={chatInput}
                onInput={setChatInput}
                onSend={sendChat}
                endRef={chatEndRef}
                onEndConsultation={() => void advance(diffIndex >= 0 ? diffIndex : attempt.stageIndex + 1)}
                advancing={advancing}
              />
            ) : stage.kind === 'patient' ? (
              /* ── Patient opening card ── */
              <PatientOpening detail={detail} ai={attempt.mode === 'ai'} />
            ) : feedback && gradedInteraction ? (
              /* ── Graded interaction + feedback ── */
              <>
                <GradedInteraction interaction={gradedInteraction} chosen={feedback.chosen} feedback={feedback.response.feedback} />
                <FeedbackPanel
                  innerRef={feedbackRef}
                  response={feedback.response}
                  kind={gradedInteraction.kind}
                  completing={completing}
                  completeError={completeError}
                  advancing={advancing}
                  nextStageLabel={detail.stages[attempt.stageIndex + 1]?.label ?? null}
                  onContinue={() => void continueFlow()}
                />
              </>
            ) : nextInteraction ? (
              /* ── Active interaction ── */
              <ActiveInteraction
                interaction={nextInteraction}
                selected={selected}
                onSelect={setSelected}
                onCommit={(chosen) => void commit(nextInteraction, chosen)}
                acting={acting}
              />
            ) : (
              /* Defensive: stage finished without engine feedback (e.g. resume) */
              <div className="clay flex flex-col items-start gap-3 rounded-2xl p-5">
                <p className="text-sm text-ink-soft">This stage is complete.</p>
                <Button className="min-h-12" onClick={() => void advance(attempt.stageIndex + 1)} disabled={advancing}>
                  Continue <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            )}

            {/* Patient stage CTA */}
            {attempt && stage.kind === 'patient' && !feedback && (
              <Button
                className="clay-btn min-h-12 w-full sm:w-auto"
                onClick={() => void advance(1)}
                disabled={advancing}
              >
                {advancing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {attempt.mode === 'ai' ? 'Enter the consultation' : 'Begin the encounter'}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}

            {/* Action errors */}
            {actError && (
              <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-sm text-sev-crit">
                {actError}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Quit confirm dialog ── */}
      <Dialog open={quitOpen} onOpenChange={setQuitOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Leave this case?</DialogTitle>
            <DialogDescription>
              The encounter ends here and is recorded as abandoned — progress inside this run is not scored. You
              can always start the case again from the library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => setQuitOpen(false)}>
              Keep working
            </Button>
            <Button
              variant="destructive"
              className="min-h-11 flex-1 sm:flex-none"
              disabled={abandoning}
              onClick={() => void abandon()}
            >
              {abandoning ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
              Leave case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Patient opening card ────────────────────────────────────────────────────

function PatientOpening({ detail, ai }: { detail: SimCaseDetail; ai: boolean }) {
  const p = detail.patient
  const src = imgSrc(detail.summary.imageKey)
  return (
    <section className="clay space-y-4 rounded-2xl p-5 md:p-6" aria-label="Patient opening">
      <div className="flex flex-wrap gap-1.5">
        {[p.age && `${p.age} y`, p.sex, p.occupation].filter(Boolean).map((chip, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
            <UserRound className="size-3" aria-hidden /> {chip}
          </span>
        ))}
      </div>
      <div>
        <MicroLabel>Chief complaint</MicroLabel>
        <p className="mt-1 text-lg font-semibold leading-snug tracking-tight">{p.complaint}</p>
      </div>
      {src && (
        <figure className="overflow-hidden rounded-xl border border-line">
          <img src={src} alt={detail.summary.imageKey ?? ''} className="max-h-72 w-full object-contain" loading="lazy" />
        </figure>
      )}
      <blockquote className="rounded-xl border-l-2 border-primary/50 bg-surface-2/60 px-4 py-3 text-sm italic leading-relaxed">
        {p.scene}
      </blockquote>
      {ai && (
        <p className="text-xs leading-relaxed text-ink-soft">
          In AI patient mode you conduct the interview yourself — the patient answers only what you ask.
        </p>
      )}
    </section>
  )
}

// ─── Active interaction (explore / key / choice / multi) ─────────────────────

function InteractionImage({ interaction }: { interaction: SimInteractionPublic }) {
  const src = imgSrc(interaction.imageKey)
  if (!src) return null
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-background/60">
      <img src={src} alt={interaction.imageCaption ?? 'Educational clinical image'} className="max-h-80 w-full object-contain" loading="lazy" />
      <figcaption className="space-y-1 border-t border-line px-3.5 py-2.5">
        <p className="text-xs font-medium leading-snug">{interaction.imageCaption ?? ''}</p>
        <p className="flex items-start gap-1.5 text-[10px] uppercase tracking-wider text-ink-soft">
          <ImageIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          Educational image — platform-owned schematic/illustration, not a real patient record
        </p>
      </figcaption>
    </figure>
  )
}

function ActiveInteraction({
  interaction, selected, onSelect, onCommit, acting,
}: {
  interaction: SimInteractionPublic
  selected: string[]
  onSelect: (next: string[]) => void
  onCommit: (chosen: string[]) => void
  acting: boolean
}) {
  const multi = interaction.kind === 'explore' || interaction.kind === 'multi'
  const max = multi ? Math.max(1, interaction.maxSelect ?? interaction.options.length) : 1
  const min = multi ? Math.max(1, interaction.minSelect ?? 1) : 1
  const atMax = selected.length >= max

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onSelect(selected.filter((s) => s !== id))
    } else if (selected.length < max) {
      onSelect([...selected, id])
    }
  }

  const pick = (id: string) => {
    onSelect([id])
    onCommit([id])
  }

  return (
    <section className="space-y-3" aria-label={interaction.prompt}>
      <InteractionImage interaction={interaction} />
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-snug tracking-tight md:text-lg">{interaction.prompt}</h2>
        {interaction.instruction && (
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{interaction.instruction}</p>
        )}
      </div>

      {multi && (
        <p className="text-xs font-semibold tabular-nums text-ink-soft" aria-live="polite">
          {selected.length}/{max} selected{atMax && interaction.kind === 'explore' ? ' — you cannot ask everything' : ''}
        </p>
      )}

      <div className="grid gap-2" role={multi ? 'group' : undefined} aria-label={interaction.prompt}>
        {interaction.options.map((opt) => {
          const isSel = selected.includes(opt.id)
          const disabled = !multi ? acting : acting || (!isSel && atMax)
          return multi ? (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isSel}
              disabled={disabled}
              onClick={() => toggle(opt.id)}
              className={cn(
                'flex min-h-11 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                isSel
                  ? 'clay-in border-primary/50 bg-primary/10 font-medium'
                  : 'border-line bg-surface-2/40 hover:border-primary/40',
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
              onClick={() => pick(opt.id)}
              className="min-h-11 w-full rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-left text-sm leading-snug transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {multi && (
        <Button
          className="clay-btn min-h-12 w-full sm:w-auto"
          disabled={acting || selected.length < min}
          onClick={() => onCommit(selected)}
        >
          {acting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {COMMIT_LABEL[interaction.kind]}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}
      {multi && selected.length < min && (
        <p className="text-xs text-ink-soft">Select at least {min} to commit.</p>
      )}
    </section>
  )
}

// ─── Graded interaction (picks + verdicts, before the feedback headline) ─────

function GradedInteraction({
  interaction, chosen, feedback,
}: {
  interaction: SimInteractionPublic
  chosen: string[]
  feedback: SimFeedback
}) {
  const chosenSet = new Set(chosen)
  const byId = new Map(feedback.perOption.map((o) => [o.id, o]))
  return (
    <section className="space-y-2" aria-label={`Your decision — ${interaction.prompt}`}>
      <MicroLabel>Your decision</MicroLabel>
      <p className="text-sm font-medium leading-snug">{interaction.prompt}</p>
      <ul className="space-y-1.5">
        {interaction.options.map((opt) => {
          const fb = byId.get(opt.id)
          const isChosen = chosenSet.has(opt.id)
          const verdict = fb?.verdict
          const meta = verdict ? VERDICT_META[verdict] : null
          const Icon = meta?.icon
          return (
            <li
              key={opt.id}
              className={cn(
                'flex min-h-11 items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm leading-snug',
                isChosen ? 'border-primary/40 bg-primary/5 font-medium' : 'border-line/60 bg-surface-2/30 text-ink-soft',
              )}
            >
              <span className="mt-0.5 shrink-0">
                {isChosen ? (
                  <Check className="size-4 text-primary" aria-label="chosen" />
                ) : (
                  <span aria-hidden className="block size-4 rounded border border-line" />
                )}
              </span>
              <span className="min-w-0 flex-1">{opt.label}</span>
              {meta && Icon && (
                <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', meta.chip)}>
                  <Icon className="size-3" aria-hidden /> {meta.label}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Feedback panel (engine output) ──────────────────────────────────────────

function FeedbackPanel({
  innerRef, response, kind, completing, completeError, advancing, nextStageLabel, onContinue,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>
  response: SimActResponse
  kind: SimInteractionPublic['kind']
  completing: boolean
  completeError: boolean
  advancing: boolean
  nextStageLabel: string | null
  onContinue: () => void
}) {
  const fb = response.feedback
  return (
    <motion.section
      ref={innerRef}
      role="status"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="clay space-y-4 rounded-2xl p-4 md:p-5"
      aria-label="Engine feedback"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{fb.headline}</p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold tabular-nums text-primary">
          <Flag className="size-3" aria-hidden /> {Math.round(fb.score)}/100
        </span>
      </div>

      {/* Per-option explanations */}
      <ul className="space-y-2.5">
        {fb.perOption.map((o) => {
          const meta = VERDICT_META[o.verdict]
          const Icon = meta.icon
          return (
            <li key={o.id} className="min-w-0 space-y-1.5">
              <div className="flex items-start gap-2.5">
                <Icon className={cn('mt-0.5 size-4 shrink-0', o.verdict === 'correct' ? 'text-sev-ok' : o.verdict === 'acceptable' ? 'text-info' : o.verdict === 'wrong' ? 'text-sev-warn' : 'text-sev-crit')} aria-hidden />
                <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{o.label}</p>
                <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', meta.chip)}>
                  {meta.label}
                </span>
              </div>
              {o.finding && (
                <div className="ml-[1.625rem] rounded-lg border-l-2 border-info/50 bg-surface-2/60 px-3 py-2 text-[13px] italic leading-relaxed text-ink-soft">
                  <span className="sr-only">Chart note: </span>
                  {o.finding}
                </div>
              )}
              <p className="ml-[1.625rem] text-[13px] leading-relaxed text-ink-soft">{o.why}</p>
            </li>
          )
        })}
      </ul>

      {/* Missed essentials */}
      {fb.missed.length > 0 && (
        <div className="space-y-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sev-warn">
            <AlertTriangle className="size-3.5" aria-hidden />
            {kind === 'explore' ? 'You did not pursue' : 'Missed'}
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

      {completeError && (
        <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-3.5 py-2.5 text-sm text-sev-crit">
          The debrief could not be generated — the run is saved. Try again.
        </p>
      )}

      <Button className="clay-btn min-h-12 w-full sm:w-auto" onClick={onContinue} disabled={completing || advancing}>
        {completing || advancing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {response.allDone ? 'Complete the case' : response.stageDone ? `Continue to ${nextStageLabel ?? 'next stage'}` : 'Continue'}
        {!response.allDone && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </motion.section>
  )
}

// ─── AI patient chat panel ───────────────────────────────────────────────────

function AiChatPanel({
  stage, chat, busy, notice, input, onInput, onSend, endRef, onEndConsultation, advancing,
}: {
  stage: SimStagePublic
  chat: ChatEntry[]
  busy: boolean
  notice: string | null
  input: string
  onInput: (v: string) => void
  onSend: (msg: string) => void
  endRef: React.RefObject<HTMLDivElement | null>
  onEndConsultation: () => void
  advancing: boolean
}) {
  const chips = AI_QUICK_CHIPS[stage.kind] ?? []
  return (
    <section className="clay space-y-3 rounded-2xl p-4 md:p-5" aria-label="AI patient consultation">
      {/* Fixed prominent badge + disclaimer while chatting */}
      <div className="rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-3.5 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sev-warn">
          <Bot className="size-3.5" aria-hidden /> AI-generated scenario
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
          AI-generated educational scenario — practice tool, not real patient data or medical advice.
        </p>
      </div>

      {/* Conversation */}
      <div className={cn('max-h-[420px] space-y-3 overflow-y-auto rounded-xl bg-surface-2/40 p-3', SCROLL_SLIM)} aria-live="polite">
        {chat.length === 0 && (
          <div className="rounded-xl border border-dashed border-line bg-background/60 p-4 text-center">
            <p className="text-sm font-medium">Ask your opening question</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              e.g. «What brings you in today?» — the patient answers only what you ask, exactly like a real
              encounter.
            </p>
          </div>
        )}
        {chat.map((m, i) =>
          m.local ? (
            <p key={i} className="px-1 py-1 text-center text-[11px] font-medium uppercase tracking-wider text-ink-soft/70">
              {m.content}
            </p>
          ) : (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <p
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md border border-line bg-background/80',
                )}
              >
                <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Patient: '}</span>
                {m.content}
              </p>
            </div>
          ),
        )}
        {busy && (
          <div className="flex justify-start">
            <p className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-background/80 px-3.5 py-2.5 text-sm text-ink-soft">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> The patient is thinking…
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-sev-warn">
          {notice}
        </p>
      )}

      {/* Quick questions derived from the stage kind */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={busy}
              onClick={() => onSend(chip)}
              className="min-h-9 rounded-full border border-line bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSend(input)
        }}
      >
        <label className="sr-only" htmlFor="sim-chat-input">Message to the patient</label>
        <input
          id="sim-chat-input"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder="Type your question…"
          autoComplete="off"
          className="clay-field h-11 min-w-0 flex-1 rounded-xl border border-line bg-background/70 px-3.5 text-sm outline-none placeholder:text-ink-soft/60"
        />
        <Button type="submit" className="min-h-11 px-4" disabled={busy || !input.trim()} aria-label="Send message">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        </Button>
      </form>

      {/* Hand back to the deterministic engine */}
      <div className="space-y-1.5">
        <Button
          variant="outline"
          className="min-h-12 w-full"
          onClick={onEndConsultation}
          disabled={advancing}
        >
          {advancing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          End consultation → commit <ArrowRight className="size-4" aria-hidden />
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-ink-soft">
          The differential onwards runs as structured decisions — graded by the deterministic engine, never the AI.
        </p>
      </div>
    </section>
  )
}
