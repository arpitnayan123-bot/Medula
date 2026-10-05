'use client'

// ─── SMART REVISION · AI PANEL (PRODUCT 06) ───
// On-demand AI help for CONCEPT blocks: RAPID NOTES (condensed text) and
// QUIZ ME (self-test Q&A with per-item answer reveal). Pattern copied from
// the Adaptive AI panel; responses are clearly labelled AI-generated and
// never touch measured stats. Rendered strings come from the API verbatim.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Brain, ChevronDown, GraduationCap, Loader2, Sparkles, Zap } from 'lucide-react'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { EASE } from './revision-shared'

type AiAction = 'rapid-notes' | 'recall'

const ACTIONS: { id: AiAction; label: string; hint: string }[] = [
  { id: 'rapid-notes', label: 'Rapid notes', hint: 'One tight pass through this concept' },
  { id: 'recall', label: 'Quiz me', hint: 'A few recall probes — answers revealed one by one' },
]

const FALLBACK_DISCLAIMER = 'AI-generated study aid — always verify against standard references.'

function QuizItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="rounded-xl border border-line bg-background/60 p-3.5">
      <p className="text-sm font-medium leading-relaxed">
        <span className="mr-1.5 text-ink-soft tabular-nums">{index + 1}.</span>
        {question}
      </p>
      {!shown ? (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          Show answer
        </button>
      ) : (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="mt-2 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-ink-soft"
        >
          {answer}
        </motion.p>
      )}
    </div>
  )
}

export function RevisionAiPanel({ conceptId }: { conceptId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<AiAction | null>(null)
  const [error, setError] = useState(false)
  const [notes, setNotes] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<{ question: string; answer: string }[] | null>(null)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [disclaimer, setDisclaimer] = useState<string | null>(null)

  const run = async (action: AiAction) => {
    if (loading) return
    setLoading(action)
    setError(false)
    try {
      const res = await api.revisionAi({ action, conceptId })
      setAiGenerated(res.aiGenerated ?? false)
      setDisclaimer(res.disclaimer ?? null)
      if (action === 'rapid-notes') {
        setNotes(res.text ?? 'The AI did not return anything for this concept — try again in a moment.')
        setQuiz(null)
      } else {
        const qs = res.questions ?? []
        setQuiz(qs.length > 0 ? qs : null)
        setNotes(qs.length === 0 ? 'No quiz questions came back for this concept — try again in a moment.' : null)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(null)
    }
  }

  const hasResult = notes != null || quiz != null

  return (
    <div className="rounded-xl border border-line bg-surface-2/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <Brain className="size-4 shrink-0 text-primary" />
        <span className="flex-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
          AI study help — rapid notes &amp; recall quiz
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-line px-4 py-3.5">
              <div className="flex flex-wrap gap-2" role="group" aria-label="AI revision actions">
                {ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    title={a.hint}
                    onClick={() => run(a.id)}
                    disabled={loading != null}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors disabled:opacity-50',
                      (a.id === 'rapid-notes' && notes != null) || (a.id === 'recall' && quiz != null)
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-line bg-surface-2/60 text-ink-soft hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    {loading === a.id ? <Loader2 className="size-3 animate-spin" /> : a.id === 'rapid-notes' ? <Zap className="size-3" /> : <GraduationCap className="size-3" />}
                    {a.label}
                  </button>
                ))}
              </div>

              {error && (
                <p className="flex items-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
                  <AlertTriangle className="size-3.5 shrink-0" /> AI unavailable right now — try again in a moment.
                </p>
              )}

              {loading != null && (
                <div className="space-y-2 rounded-xl border border-line bg-background/60 p-3.5" aria-busy="true" role="status">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
                </div>
              )}

              {notes != null && (
                <div className="rounded-xl border border-line bg-background/60 p-3.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    <Zap className="size-3" /> Rapid notes
                  </p>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{notes}</p>
                </div>
              )}

              {quiz != null && quiz.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    <GraduationCap className="size-3.5" /> Recall quiz — answer first, then reveal
                  </p>
                  {quiz.map((q, i) => (
                    <QuizItem key={`${i}-${q.question.slice(0, 24)}`} question={q.question} answer={q.answer} index={i} />
                  ))}
                </div>
              )}

              {hasResult && (
                <p className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-warn/15 px-2.5 py-1 text-sev-warn">
                    <Sparkles className="size-3" /> AI-generated
                  </span>
                  <span className="normal-case tracking-normal">{disclaimer ?? FALLBACK_DISCLAIMER}</span>
                </p>
              )}

              {!hasResult && loading == null && !error && (
                <p className="flex items-center gap-2 text-xs text-ink-soft">
                  <Sparkles className="size-3.5" /> Pick an action — answers stay on this screen and never touch your stats.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
