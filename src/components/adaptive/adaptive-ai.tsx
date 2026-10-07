'use client'

// ─── ADAPTIVE ENGINE · AI WIDGETS (PRODUCT 04) ───
// On-demand AI actions on an ANSWERED question: explain / simplify /
// similar / harder / easier / weakness. Text answers render in a quiet
// panel; generated MCQs render inline with client-side grading and are
// clearly labeled "not platform-validated" + never recorded in stats.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, Brain, CheckCircle2, ChevronDown, GraduationCap, Lightbulb, Loader2, Send, Sparkles, XCircle,
} from 'lucide-react'

import { api } from '@/lib/api'
import type { AdaptiveAiQuestionResult } from '@/lib/api'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type AiAction = 'explain' | 'simplify' | 'similar' | 'harder' | 'easier' | 'weakness'

const ACTIONS: { id: AiAction; label: string; questionKind: boolean }[] = [
  { id: 'explain', label: 'Explain more', questionKind: false },
  { id: 'simplify', label: 'Simplify', questionKind: false },
  { id: 'similar', label: 'Similar question', questionKind: true },
  { id: 'harder', label: 'Harder', questionKind: true },
  { id: 'easier', label: 'Easier', questionKind: true },
  { id: 'weakness', label: 'Why do I keep missing this?', questionKind: false },
]

interface AiOption { id: string; text: string }

function normalizeOptions(raw: AdaptiveAiQuestionResult['options']): AiOption[] {
  return raw.map((o, i) => (typeof o === 'string' ? { id: o, text: o } : { id: o.id ?? String.fromCharCode(65 + i), text: o.text }))
}

function gradePick(pickedId: string, answer: string, opts: AiOption[]): boolean {
  if (pickedId === answer) return true
  const picked = opts.find((o) => o.id === pickedId)
  return !!picked && picked.text === answer
}

// ─── Inline AI-generated MCQ (client-side graded, never recorded) ────────────

function AiQuestionCard({ q }: { q: AdaptiveAiQuestionResult }) {
  const opts = normalizeOptions(q.options)
  const [picked, setPicked] = useState<string | null>(null)
  const correct = picked != null && gradePick(picked, q.answer, opts)
  const answered = picked != null

  return (
    <div className="space-y-3 rounded-xl border border-sev-warn/40 bg-sev-warn/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-warn/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sev-warn">
          <Sparkles className="size-3" /> AI-generated practice — not platform-validated
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">
          {answered ? 'Graded on-device · not recorded in your stats' : 'Not recorded in your stats'}
        </span>
      </div>

      <p className="text-sm font-medium leading-relaxed">{q.stem}</p>

      <div className="space-y-2" role="radiogroup" aria-label="AI practice options">
        {opts.map((o, i) => {
          const isPick = picked === o.id
          const isAnswer = answered && gradePick(o.id, q.answer, opts)
          const isWrongPick = answered && isPick && !correct
          return (
            <button
              key={`${o.id}-${i}`}
              type="button"
              role="radio"
              aria-checked={isPick}
              disabled={answered}
              onClick={() => setPicked(o.id)}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                !answered && 'border-line bg-surface-2/40 hover:border-sev-warn/60',
                isAnswer && 'border-sev-ok bg-sev-ok/10',
                isWrongPick && 'border-sev-crit bg-sev-crit/10',
                answered && !isAnswer && !isWrongPick && 'border-line opacity-55',
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

      {answered && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="space-y-2">
          <p className={cn('text-xs font-bold', correct ? 'text-sev-ok' : 'text-sev-crit')}>
            {correct ? 'Correct — graded on this device only.' : `Not quite — the AI's key: ${opts.find((o) => o.id === q.answer)?.text ?? q.answer}`}
          </p>
          {q.explanation && <p className="text-xs leading-relaxed text-ink-soft">{q.explanation}</p>}
          {q.teaching && (
            <p className="flex items-start gap-2 rounded-lg border-l-2 border-sev-warn bg-sev-warn/10 px-3 py-2 text-xs italic leading-relaxed text-ink-soft">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
              <span>{q.teaching}</span>
            </p>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function AdaptiveAiPanel({ questionId, conceptId }: { questionId: string; conceptId?: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<AiAction | null>(null)
  const [error, setError] = useState(false)
  const [textResults, setTextResults] = useState<Partial<Record<AiAction, string>>>({})
  const [questionResults, setQuestionResults] = useState<Partial<Record<AiAction, AdaptiveAiQuestionResult>>>({})

  const run = async (action: AiAction) => {
    if (loading) return
    setLoading(action)
    setError(false)
    try {
      const res = await api.adaptiveAi({ action, questionId, conceptId })
      if (res.question && ACTIONS.find((a) => a.id === action)?.questionKind) {
        setQuestionResults((prev) => ({ ...prev, [action]: res.question! }))
        setTextResults((prev) => {
          const next = { ...prev }
          delete next[action]
          return next
        })
      } else {
        setTextResults((prev) => ({ ...prev, [action]: res.text ?? 'The AI did not return anything for this one.' }))
        setQuestionResults((prev) => {
          const next = { ...prev }
          delete next[action]
          return next
        })
      }
    } catch {
      setError(true)
    } finally {
      setLoading(null)
    }
  }

  const anyResult = Object.keys(textResults).length > 0 || Object.keys(questionResults).length > 0

  return (
    <div className="rounded-xl border border-line bg-surface-2/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <Brain className="size-4 shrink-0 text-primary" />
        <span className="flex-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Ask the AI about this question</span>
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
              <div className="flex flex-wrap gap-2" role="group" aria-label="AI actions">
                {ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => run(a.id)}
                    disabled={loading != null}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors disabled:opacity-50',
                      textResults[a.id] || questionResults[a.id]
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-line bg-surface-2/60 text-ink-soft hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    {loading === a.id ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
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

              {ACTIONS.filter((a) => textResults[a.id]).map((a) => (
                <div key={a.id} className="rounded-xl border border-line bg-background/60 p-3.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">{a.label}</p>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{textResults[a.id]}</p>
                </div>
              ))}

              {ACTIONS.filter((a) => questionResults[a.id]).map((a) => (
                <div key={a.id} className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    <GraduationCap className="size-3.5" /> {a.label} — your turn
                  </p>
                  <AiQuestionCard q={questionResults[a.id]!} />
                </div>
              ))}

              {!anyResult && loading == null && !error && (
                <p className="flex items-center gap-2 text-xs text-ink-soft">
                  <Send className="size-3.5" /> Pick an action — answers stay on this screen and never touch your stats.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
