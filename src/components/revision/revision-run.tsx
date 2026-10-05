'use client'

// ─── SMART REVISION · BLOCK RUNNER (PRODUCT 06) ───
// Iterates the session plan block by block. Per-kind renderers:
//   concept    — summary / why / key facts / detail sections + AI panel + hub link
//   flashcards — flip deck graded AGAIN/HARD/GOOD/EASY via the EXISTING
//                /api/revision/review endpoint (one SRS, no parallel engine)
//   mcq/pyq/mistake — MCQs graded via the EXISTING /api/attempts endpoint
//                (shared capture feeds the mistake bank automatically)
//   compare    — confusion pair A vs B
//   case       — hand-off to the Case Simulator (block NOT auto-completed)
// Block-level progress persists server-side per completed block; QUIT keeps
// the session resumable. No chain-of-thought — reasons render verbatim.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, ArrowRight, Bandage, BookMarked, Check, CheckCheck, CheckCircle2,
  ChevronRight, Landmark, Loader2, RefreshCw, Sparkles, Stethoscope, Target, XCircle,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { ERROR_TYPES, REVISION_MODES } from '@/lib/types'
import type {
  AttemptResult, RevisionBlock, RevisionConceptContent, RevisionFlashcardContent,
  RevisionPairContent, RevisionQuestionContent, RevisionQueuePlan, RevisionSessionContent,
  RevisionSessionSummary,
} from '@/lib/types'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { RevisionAiPanel } from './revision-ai'
import { DifficultyDots, EASE, MicroLabel, intervalLabel, missedCountFromWhy } from './revision-shared'

interface RevisionRunProps {
  sessionId: string
  plan: RevisionQueuePlan
  content: RevisionSessionContent
  onComplete: (summary: RevisionSessionSummary) => void
  onQuit: () => void
}

// ─── Grade buttons (same convention as the Revise deck) ──────────────────────

const GRADES: { label: string; sub: string; grade: number; classes: string }[] = [
  { label: 'AGAIN', sub: 'seen again today', grade: 0, classes: 'border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300' },
  { label: 'HARD', sub: 'short interval', grade: 1, classes: 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300' },
  { label: 'GOOD', sub: 'solid', grade: 2, classes: 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20' },
  { label: 'EASY', sub: 'long interval', grade: 3, classes: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300' },
]

// ─── Flip card (local implementation, revise-deck pattern) ───────────────────

function FlipCard({ card, flipped, onFlip }: { card: RevisionFlashcardContent; flipped: boolean; onFlip: () => void }) {
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
        aria-label={flipped ? 'Answer side — tap to hide' : 'Question side — tap to reveal answer'}
        className="glass relative block min-h-56 w-full cursor-pointer select-none rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* front — question */}
        <div className="glass absolute inset-0 flex flex-col overflow-y-auto rounded-2xl p-5 md:p-6" style={{ backfaceVisibility: 'hidden' }}>
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            <span>Question</span>
            <span>tap or press Space</span>
          </div>
          <div className="flex flex-1 items-center justify-center py-4">
            <p className="text-center text-xl font-medium leading-snug tracking-tight md:text-2xl">{card.front}</p>
          </div>
        </div>
        {/* back — answer + subject badge */}
        <div
          className="glass absolute inset-0 flex flex-col overflow-y-auto rounded-2xl border-primary/30 p-5 md:p-6"
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

// ─── Concept block ────────────────────────────────────────────────────────────

type ConceptDetailSection = NonNullable<RevisionConceptContent['detail']>[number]

function DetailSection({ s }: { s: ConceptDetailSection }) {
  return (
    <details className="group rounded-xl border border-line bg-surface-2/40">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-90" />
        {s.h}
      </summary>
      <div className="space-y-2.5 border-t border-line px-4 py-3">
        <ul className="space-y-1.5">
          {s.body.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-line" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {s.table && s.table.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {s.table.head.map((h, i) => (
                    <th key={i} className="border-b border-line px-2 py-1.5 font-semibold text-ink-soft">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.table.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td key={ci} className="border-b border-line/60 px-2 py-1.5 align-top">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  )
}

function ConceptBlock({ block, c, onDone, completing }: { block: RevisionBlock; c: RevisionConceptContent; onDone: () => void; completing: boolean }) {
  const openHub = useAppStore((s) => s.openHub)
  return (
    <article className="space-y-5">
      <header className="space-y-1.5">
        <MicroLabel className="text-primary">Concept</MicroLabel>
        <h2 className="text-2xl font-semibold tracking-tight">{c.name}</h2>
        <p className="text-xs text-ink-soft">
          {c.subjectName} · {c.topicName} · exam relevance {c.examRelevance}/5
        </p>
      </header>

      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <MicroLabel className="mb-1.5">Summary</MicroLabel>
        <p className="text-sm leading-relaxed">{c.summary}</p>
      </div>

      <section className="space-y-1.5">
        <MicroLabel>Why it matters</MicroLabel>
        <p className="text-sm leading-relaxed text-ink-soft">{c.whyMatters}</p>
      </section>

      {c.keyFacts.length > 0 && (
        <section className="space-y-1.5">
          <MicroLabel>Key facts</MicroLabel>
          <ul className="space-y-1.5">
            {c.keyFacts.map((f, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.mnemonic && (
        <div className="rounded-xl border border-sev-warn/40 bg-sev-warn/10 p-4">
          <MicroLabel className="mb-1.5 flex items-center gap-1.5 text-sev-warn">
            <Sparkles className="size-3" /> Mnemonic
          </MicroLabel>
          <p className="text-sm italic leading-relaxed">{c.mnemonic}</p>
        </div>
      )}

      {c.detail?.map((s, i) => <DetailSection key={i} s={s} />)}

      <RevisionAiPanel conceptId={block.conceptId ?? c.id} />

      <footer className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="min-h-11 flex-1"
          onClick={() => openHub(block.topicId ?? c.topicId, block.conceptId ?? c.id)}
        >
          <BookMarked className="size-4" /> Open in Topic Hub
        </Button>
        <Button className="min-h-11 flex-1" disabled={completing} onClick={onDone}>
          {completing ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} Mark as revised
        </Button>
      </footer>
    </article>
  )
}

// ─── Flashcards block ─────────────────────────────────────────────────────────

function FlashcardsBlock({ cards, onDone, completing }: { cards: RevisionFlashcardContent[]; onDone: () => void; completing: boolean }) {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState(false)
  const [lastInterval, setLastInterval] = useState<number | null>(null)

  const current = cards[idx]
  const last = idx >= cards.length - 1

  const grade = useCallback(
    async (g: number) => {
      if (!current || !flipped || grading || completing) return
      setGrading(true)
      setGradeError(false)
      try {
        const res = (await api.reviewFlashcard({ flashcardId: current.id, grade: g })) as {
          ok: boolean
          nextDueDays?: number
        }
        if (typeof res.nextDueDays === 'number') setLastInterval(res.nextDueDays)
        setFlipped(false)
        if (last) onDone()
        else setIdx((i) => i + 1)
      } catch {
        setGradeError(true)
      } finally {
        setGrading(false)
      }
    },
    [current, flipped, grading, completing, last, onDone],
  )

  // Keyboard: Space flips, 1-4 grades (guard input targets and open dialogs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
        return
      }
      const gi = ['1', '2', '3', '4'].indexOf(e.key)
      if (gi >= 0) {
        e.preventDefault()
        void grade(gi)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [grade])

  if (!current) return null

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <MicroLabel className="text-sev-ok">Flashcards</MicroLabel>
        <span className="text-xs tabular-nums text-ink-soft">
          card {idx + 1} of {cards.length}
        </span>
      </header>

      <FlipCard card={current} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />

      <div className="flex flex-wrap items-stretch justify-center gap-2" role="group" aria-label="Grade this card">
        {GRADES.map((g, i) => (
          <button
            key={g.label}
            type="button"
            disabled={!flipped || grading || completing}
            onClick={() => void grade(g.grade)}
            className={cn(
              'min-h-11 flex-1 rounded-xl border px-3 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-5',
              g.classes,
            )}
          >
            <span className="block text-xs font-bold tracking-wide">{g.label}</span>
            <span className="block text-[10px] opacity-80">{g.sub}</span>
            <span className="sr-only">press {i + 1}</span>
          </button>
        ))}
      </div>

      {!flipped && !gradeError && (
        <p className="text-center text-xs text-ink-soft">
          Tap the card (or press Space) to reveal the answer, then grade yourself honestly.
        </p>
      )}
      {gradeError && (
        <p className="flex items-center justify-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
          <AlertTriangle className="size-3.5 shrink-0" /> Couldn&apos;t save that grade — grade this card again.
        </p>
      )}
      {lastInterval != null && (
        <p className="text-center text-xs font-medium text-primary" role="status">
          {intervalLabel(lastInterval)}
        </p>
      )}
    </section>
  )
}

// ─── MCQ / PYQ / Mistake block ────────────────────────────────────────────────

function QuestionBlock({ block, questions, onDone, completing }: { block: RevisionBlock; questions: RevisionQuestionContent[]; onDone: () => void; completing: boolean }) {
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)
  const setView = useAppStore((s) => s.setView)

  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<AttemptResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [errorType, setErrorType] = useState<string | null>(null)
  const [errorLogged, setErrorLogged] = useState(false)
  const [logBusy, setLogBusy] = useState(false)

  const qStartRef = useRef(Date.now())
  const attemptRef = useRef<AttemptResult | null>(null)

  const q = questions[qi]
  const lastQ = qi >= questions.length - 1
  const wrongCount = block.kind === 'mistake' ? missedCountFromWhy(block.why) : null
  const headerLabel = block.kind === 'pyq' ? 'PYQ-pattern questions' : block.kind === 'mistake' ? 'Mistake retest' : 'MCQs'
  const answerText = attempt ? q?.options.find((o) => o.id === attempt.answer)?.text ?? attempt.answer : ''

  const submit = async (optionId: string) => {
    if (!q || attempt || submitting || completing) return
    setPicked(optionId)
    setSubmitting(true)
    setSubmitError(false)
    try {
      const res = await api.attempt({ questionId: q.id, selected: optionId, timeMs: Date.now() - qStartRef.current })
      attemptRef.current = res
      setAttempt(res)
      setErrorType(res.errorTypeSuggestion ?? null)
    } catch {
      setPicked(null)
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    if (!attempt || completing) return
    if (lastQ) {
      onDone()
      return
    }
    setQi((i) => i + 1)
    setPicked(null)
    setAttempt(null)
    attemptRef.current = null
    setSubmitError(false)
    setErrorType(null)
    setErrorLogged(false)
    qStartRef.current = Date.now()
  }

  const logError = async (type: string) => {
    if (!q || errorLogged || logBusy) return
    setErrorType(type)
    setLogBusy(true)
    try {
      await api.logErrorType({ questionId: q.id, errorType: type })
      setErrorLogged(true)
    } catch {
      /* stays unlogged — the picker remains interactive */
    } finally {
      setLogBusy(false)
    }
  }

  // Keyboard: A / Enter advances once feedback is on screen (guards dialogs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return
      if (attemptRef.current && (e.key === 'Enter' || e.key.toLowerCase() === 'a')) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!q) return null

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <MicroLabel className={cn(block.kind === 'mistake' ? 'text-sev-crit' : block.kind === 'pyq' ? 'text-sev-warn' : 'text-amber-600 dark:text-amber-300')}>
          {headerLabel}
        </MicroLabel>
        <span className="text-xs tabular-nums text-ink-soft">
          question {qi + 1} of {questions.length}
        </span>
      </header>

      {block.kind === 'mistake' && wrongCount != null && (
        <div className="flex items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-2.5 text-xs font-medium text-sev-crit">
          <Bandage className="size-3.5 shrink-0" />
          You&apos;ve missed this {wrongCount}× — slow down and read every option before answering.
        </div>
      )}

      <div className="glass space-y-3 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
          {q.pyqPattern && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sev-warn/15 px-2.5 py-1 text-sev-warn">
              <Landmark className="size-3" /> PYQ pattern
            </span>
          )}
          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1">{q.qtype}</span>
          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1">{q.subjectCode}</span>
          <DifficultyDots n={q.difficulty} />
        </div>
        <p className="text-base font-medium leading-relaxed">{q.stem}</p>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label="Answer options">
        {q.options.map((o, i) => {
          const isPick = picked === o.id
          const isAnswer = attempt != null && o.id === attempt.answer
          const isWrongPick = attempt != null && isPick && !attempt.correct
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={isPick}
              disabled={attempt != null || submitting || completing}
              onClick={() => void submit(o.id)}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                attempt == null && !submitting && 'border-line bg-surface-2/40 hover:border-primary/60',
                submitting && isPick && 'border-primary/60 bg-primary/5',
                isAnswer && 'border-sev-ok bg-sev-ok/10',
                isWrongPick && 'border-sev-crit bg-sev-crit/10',
                attempt != null && !isAnswer && !isWrongPick && 'border-line opacity-55',
              )}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold',
                  isAnswer ? 'border-sev-ok text-sev-ok' : isWrongPick ? 'border-sev-crit text-sev-crit' : 'border-line text-ink-soft',
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 flex-1 leading-snug">{o.text}</span>
              {isAnswer && <CheckCircle2 className="size-4 shrink-0 text-sev-ok" />}
              {isWrongPick && <XCircle className="size-4 shrink-0 text-sev-crit" />}
            </button>
          )
        })}
      </div>

      {submitting && (
        <p className="flex items-center gap-2 text-xs text-ink-soft" role="status">
          <Loader2 className="size-3.5 animate-spin" /> Grading…
        </p>
      )}
      {submitError && (
        <p className="flex items-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
          <AlertTriangle className="size-3.5 shrink-0" /> Couldn&apos;t submit your answer — tap an option to try again.
        </p>
      )}

      {attempt && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className={cn('space-y-3 rounded-2xl border p-4', attempt.correct ? 'border-sev-ok/40 bg-sev-ok/5' : 'border-sev-crit/30 bg-sev-crit/5')}
        >
          <p className={cn('flex flex-wrap items-center gap-2 text-sm font-bold', attempt.correct ? 'text-sev-ok' : 'text-sev-crit')}>
            {attempt.correct ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            {attempt.correct ? 'Correct' : <>Not quite — correct answer: <span className="font-semibold">{answerText}</span></>}
          </p>
          {attempt.explanation && <p className="text-sm leading-relaxed text-ink-soft">{attempt.explanation}</p>}
          {attempt.teaching && (
            <p className="rounded-lg border-l-2 border-sev-warn bg-sev-warn/10 px-3 py-2 text-xs italic leading-relaxed text-ink-soft">
              💡 {attempt.teaching}
            </p>
          )}

          {!attempt.correct && (
            <>
              <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <MicroLabel className="text-[10px]">Why did you miss this?</MicroLabel>
                  {errorLogged && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sev-ok">
                      <Check className="size-3" /> logged
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ERROR_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      title={t.hint}
                      disabled={errorLogged || logBusy}
                      onClick={() => void logError(t.id)}
                      className={cn(
                        'min-h-9 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-60',
                        errorType === t.id
                          ? 'border-sev-crit/50 bg-sev-crit/10 text-sev-crit'
                          : 'border-line bg-background/60 text-ink-soft hover:border-foreground/30',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink-soft">Optional but powerful — it shapes what the engine shows you next.</p>
              </div>

              {q.conceptId && (
                <button
                  type="button"
                  onClick={() => {
                    setAdaptivePreset({ conceptId: q.conceptId!, mode: 'weakness', autoStart: false })
                    setView('adaptive')
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  <Target className="size-3.5" /> Drill this concept in the Adaptive Engine →
                </button>
              )}
            </>
          )}
        </motion.div>
      )}

      <div className="space-y-2">
        <Button className="min-h-12 w-full" disabled={attempt == null || completing} onClick={next}>
          {completing ? <Loader2 className="size-4 animate-spin" /> : lastQ ? <CheckCheck className="size-4" /> : <ArrowRight className="size-4" />}
          {lastQ ? 'Finish block' : 'Next question'}
        </Button>
        {!attempt && !submitError && (
          <p className="text-center text-xs text-ink-soft">
            Pick an option to continue — A or Enter advances once feedback is shown.
          </p>
        )}
      </div>
    </section>
  )
}

// ─── Compare block ────────────────────────────────────────────────────────────

function CompareCol({ side, name, points, tone }: { side: 'A' | 'B'; name: string; points: string[]; tone: 'primary' | 'warn' }) {
  return (
    <div className={cn('rounded-xl border p-4', tone === 'primary' ? 'border-primary/30 bg-primary/5' : 'border-sev-warn/40 bg-sev-warn/5')}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold',
            tone === 'primary' ? 'bg-primary/15 text-primary' : 'bg-sev-warn/15 text-sev-warn',
          )}
        >
          {side}
        </span>
        <h3 className="min-w-0 text-sm font-semibold leading-tight">{name}</h3>
      </div>
      <ul className="space-y-1.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
            <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', tone === 'primary' ? 'bg-primary' : 'bg-sev-warn')} aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CompareBlock({ pair, onDone, completing }: { pair: RevisionPairContent; onDone: () => void; completing: boolean }) {
  return (
    <section className="space-y-4">
      <header className="space-y-1.5">
        <MicroLabel className="text-primary">Compare — don&apos;t confuse</MicroLabel>
        <h2 className="text-xl font-semibold tracking-tight">
          {pair.a} <span className="text-sm font-normal text-ink-soft">vs</span> {pair.b}
        </h2>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <CompareCol side="A" name={pair.a} points={pair.aPoints} tone="primary" />
        <CompareCol side="B" name={pair.b} points={pair.bPoints} tone="warn" />
      </div>

      {pair.mnemonic && (
        <div className="rounded-xl border border-sev-warn/40 bg-sev-warn/10 p-4">
          <MicroLabel className="mb-1.5 text-sev-warn">How to tell them apart</MicroLabel>
          <p className="text-sm italic leading-relaxed">{pair.mnemonic}</p>
        </div>
      )}

      <Button className="min-h-12 w-full" disabled={completing} onClick={onDone}>
        {completing ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} Got it — mark compared
      </Button>
    </section>
  )
}

// ─── Case block ───────────────────────────────────────────────────────────────

function CaseBlock({ cs, onDone, completing }: { cs: { id: string; title: string; specialty: string; system: string; difficulty: number }; onDone: () => void; completing: boolean }) {
  const setView = useAppStore((s) => s.setView)
  return (
    <section className="space-y-4">
      <header className="space-y-1.5">
        <MicroLabel className="text-teal-600 dark:text-teal-300">Clinical case</MicroLabel>
        <h2 className="text-xl font-semibold tracking-tight">{cs.title}</h2>
        <p className="text-xs text-ink-soft">{cs.specialty} · {cs.system}</p>
      </header>

      <div className="glass space-y-3 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1">{cs.specialty}</span>
          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1">{cs.system}</span>
          <DifficultyDots n={cs.difficulty} />
        </div>
        <p className="text-sm leading-relaxed text-ink-soft">
          This block hands you to the Case Simulator. Opening it pauses this session — resume from the banner on the
          revision home when you&apos;re back, or skip the block now.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="min-h-12 flex-1" onClick={() => setView('cases')}>
          <Stethoscope className="size-4" /> Open case simulator
        </Button>
        <Button variant="outline" className="min-h-11 sm:w-40" disabled={completing} onClick={onDone}>
          {completing && <Loader2 className="size-4 animate-spin" />} Skip block
        </Button>
      </div>
    </section>
  )
}

// ─── Missing-content fallback (honest, never blocks the session) ──────────────

function MissingContent({ onDone, completing }: { onDone: () => void; completing: boolean }) {
  return (
    <div className="glass space-y-3 rounded-2xl p-6 text-center">
      <AlertTriangle className="mx-auto size-6 text-sev-warn" aria-hidden />
      <p className="text-sm font-medium">This block&apos;s content couldn&apos;t be loaded.</p>
      <p className="text-xs text-ink-soft">You can skip it — your session progress is still saved.</p>
      <Button variant="outline" className="min-h-11" disabled={completing} onClick={onDone}>
        {completing && <Loader2 className="size-4 animate-spin" />} Skip block
      </Button>
    </div>
  )
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export function RevisionRun({ sessionId, plan, content, onComplete, onQuit }: RevisionRunProps) {
  const blocks = plan.blocks
  // cursor = index of the active block; -1 = everything is done (straight to wrap-up)
  const [cursor, setCursor] = useState<number>(() => blocks.findIndex((b) => !b.done))
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const finishStartedRef = useRef(false)

  const total = blocks.length
  const doneCount = blocks.filter((b) => b.done || completedIds.has(b.id)).length
  const block = cursor >= 0 ? blocks[cursor] : null
  const modeLabel = REVISION_MODES.find((m) => m.id === plan.mode)?.label ?? plan.mode

  const finish = useCallback(async () => {
    if (finishStartedRef.current) return
    finishStartedRef.current = true
    setFinishing(true)
    setFinishError(null)
    try {
      const summary = await api.completeRevisionSession({ sessionId })
      onComplete(summary)
    } catch {
      finishStartedRef.current = false
      setFinishError("Couldn't close the session — your completed blocks are safe. Try again.")
    } finally {
      setFinishing(false)
    }
  }, [sessionId, onComplete])

  const markDone = useCallback(
    async (blockId: string) => {
      const b = blocks.find((x) => x.id === blockId)
      if (!b || completing || finishing) return
      setCompleting(true)
      setCompleteError(null)
      try {
        await api.completeRevisionBlock({ sessionId, blockId, minutes: b.minutes })
        setCompletedIds((prev) => new Set(prev).add(blockId))
        const nextIdx = blocks.findIndex((x, i) => i > cursor && !x.done)
        if (nextIdx === -1) {
          setCursor(-1)
          await finish()
        } else {
          setCursor(nextIdx)
        }
      } catch {
        setCompleteError("Couldn't save this block — check your connection and try again.")
      } finally {
        setCompleting(false)
      }
    },
    [blocks, cursor, completing, finishing, sessionId, finish],
  )

  // Resume landed on a fully-done plan (or an empty plan): close the session
  // automatically so no dangling "in progress" banner is left behind.
  useEffect(() => {
    if (cursor !== -1) return
    void finish()
  }, [cursor, finish])

  const onDone = useCallback(() => {
    if (block) void markDone(block.id)
  }, [block, markDone])

  const renderBlock = () => {
    if (!block) return null
    if (block.kind === 'concept') {
      const c = block.conceptId ? content.concepts[block.conceptId] : undefined
      if (!c) return <MissingContent onDone={onDone} completing={completing} />
      return <ConceptBlock block={block} c={c} onDone={onDone} completing={completing} />
    }
    if (block.kind === 'flashcards') {
      const cards = (block.flashcardIds ?? []).map((id) => content.flashcards[id]).filter(Boolean)
      if (cards.length === 0) return <MissingContent onDone={onDone} completing={completing} />
      return <FlashcardsBlock cards={cards} onDone={onDone} completing={completing} />
    }
    if (block.kind === 'mcq' || block.kind === 'pyq' || block.kind === 'mistake') {
      const qs = (block.questionIds ?? []).map((id) => content.questions[id]).filter(Boolean)
      if (qs.length === 0) return <MissingContent onDone={onDone} completing={completing} />
      return <QuestionBlock block={block} questions={qs} onDone={onDone} completing={completing} />
    }
    if (block.kind === 'compare') {
      const pair = block.pairId ? content.pairs[block.pairId] : undefined
      if (!pair) return <MissingContent onDone={onDone} completing={completing} />
      return <CompareBlock pair={pair} onDone={onDone} completing={completing} />
    }
    if (block.kind === 'case') {
      const cs = block.caseId ? content.cases[block.caseId] : undefined
      if (!cs) return <MissingContent onDone={onDone} completing={completing} />
      return <CaseBlock cs={cs} onDone={onDone} completing={completing} />
    }
    return <MissingContent onDone={onDone} completing={completing} />
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Sticky run bar — sits under the app shell header */}
      <div className="sticky top-14 z-20 border-b border-line bg-background/90 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
            Smart Revision — {modeLabel}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-9 px-3 text-xs font-semibold text-ink-soft hover:text-foreground">
                Quit
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  Progress is saved — you can resume later. Completed blocks stay done; the current block restarts when
                  you come back.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">Keep going</AlertDialogCancel>
                <AlertDialogAction className="min-h-11" onClick={onQuit}>
                  Save &amp; exit
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Progress value={total > 0 ? (doneCount / total) * 100 : 0} className="h-1.5 flex-1" aria-label="Session progress" />
          <span className="shrink-0 text-xs tabular-nums text-ink-soft">
            {doneCount}/{total} blocks
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        {cursor === -1 ? (
          /* Wrap-up: last block finished (or nothing was due) — closing the session */
          <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
            {finishError ? (
              <>
                <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
                  <RefreshCw className="size-6 text-sev-crit" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">
                  {total === 0 ? 'Nothing was due for this mode' : "Couldn't close the session"}
                </h2>
                <p className="max-w-sm text-sm text-ink-soft">{finishError}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => void finish()}>
                    Retry
                  </Button>
                  <Button variant="ghost" className="min-h-11" onClick={onQuit}>
                    Back to revision home
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
                <h2 className="text-lg font-semibold tracking-tight">
                  {total === 0 ? 'Clearing this empty run…' : 'Wrapping up your session…'}
                </h2>
                <p className="max-w-sm text-sm text-ink-soft">
                  {total === 0 ? 'This mode had no blocks for you.' : 'All blocks are done — building your summary.'}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <motion.div
              key={block!.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {renderBlock()}
            </motion.div>
            {completeError && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-xs font-medium text-sev-crit">
                <AlertTriangle className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">{completeError}</span>
                <Button size="sm" variant="outline" className="min-h-9" onClick={onDone}>
                  Retry
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
