'use client'

// ─── ASK ENGINE · SELF-CHECK QUIZ (PRODUCT 15) ───────────────────────────────
// Every question is drawn from the MEASURED platform pool (never AI-invented).
// Self-paced: commit an answer → see the key + worked explanation + pearl.
// No negative marking — this is practice, not a graded test.

import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Lightbulb, ListChecks, Target, XCircle } from 'lucide-react'
import type { AskQuizItem } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SpringNumber } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'

export function AskQuiz({
  items,
  note,
  onPracticeMore,
}: {
  items: AskQuizItem[]
  note?: string
  onPracticeMore?: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<(string | null)[]>(() => items.map(() => null))
  const done = idx >= items.length
  const item = !done ? items[idx] : null
  const revealed = !done && picked[idx] !== null && picked[idx] !== undefined
  const score = useMemo(
    () => items.reduce((acc, q, i) => acc + (picked[i] === q.answer ? 1 : 0), 0),
    [items, picked],
  )

  if (!items.length) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink-soft">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <ListChecks className="size-4 text-primary" aria-hidden /> No questions available
        </p>
        <p className="mt-1">{note ?? 'Nothing measured on the platform for this yet — honest gap, nothing invented.'}</p>
      </div>
    )
  }

  const commit = (optionId: string) => {
    if (picked[idx] != null) return
    setPicked((p) => p.map((v, i) => (i === idx ? optionId : v)))
  }

  // ── summary ──
  if (done) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-surface-1 p-4 text-center">
          <p className="text-3xl font-semibold tracking-tight">
            <SpringNumber value={score} /><span className="text-lg text-ink-soft">/{items.length}</span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {score === items.length
              ? 'Full marks — this concept is holding. Consider protecting it with a spaced revision item.'
              : score >= items.length / 2
                ? 'Solid base — the explanations above show exactly where the marks leaked.'
                : 'Shaky — re-read the answer above, then take these again via “Quiz me”.'}
          </p>
        </div>
        {onPracticeMore && (
          <Button variant="outline" size="sm" className="min-h-11 w-full" onClick={onPracticeMore}>
            Practice more in the Question Lab <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    )
  }

  const q = item!
  const isRight = picked[idx] === q.answer

  return (
    <div className="space-y-3">
      {/* progress header */}
      <div className="flex items-center gap-3">
        <Progress value={((idx + (revealed ? 1 : 0)) / items.length) * 100} className="h-1.5" aria-hidden />
        <span className="shrink-0 text-[11px] font-medium text-ink-soft">{idx + 1}/{items.length}</span>
        {q.pyqPattern && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">PYQ pattern</span>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface-1 p-4">
        <p className="text-sm font-medium leading-relaxed">{q.stem}</p>
        <div className="mt-3 space-y-2" role="group" aria-label="Answer options">
          {q.options.map((o) => {
            const chosen = picked[idx] === o.id
            const isAnswer = o.id === q.answer
            return (
              <button
                key={o.id}
                onClick={() => commit(o.id)}
                disabled={revealed}
                aria-pressed={chosen}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left text-sm min-h-11 transition-colors',
                  !revealed && 'border-line bg-surface-2 hover:border-primary/40',
                  revealed && isAnswer && 'border-sev-ok/60 bg-sev-ok/10',
                  revealed && chosen && !isAnswer && 'border-sev-crit/60 bg-sev-crit/10',
                  revealed && !isAnswer && !chosen && 'border-line bg-surface-2 opacity-60',
                )}
              >
                <span className="mt-0.5 font-mono text-[11px] font-semibold text-ink-soft">{o.id.toUpperCase()}</span>
                <span className="flex-1 leading-relaxed">{o.text}</span>
                {revealed && isAnswer && <CheckCircle2 className="size-4 shrink-0 text-sev-ok" aria-hidden />}
                {revealed && chosen && !isAnswer && <XCircle className="size-4 shrink-0 text-sev-crit" aria-hidden />}
              </button>
            )
          })}
        </div>

        {revealed && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <p className={cn('flex items-center gap-1.5 text-xs font-semibold', isRight ? 'text-sev-ok' : 'text-sev-crit')}>
              <Target className="size-3.5" aria-hidden />
              {isRight ? 'Correct' : `The key is ${q.answer.toUpperCase()}`}
            </p>
            <p className="text-[13px] leading-relaxed text-ink-soft">{q.explanation}</p>
            {q.teaching && (
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-[13px] font-medium leading-relaxed">
                <Lightbulb className="mr-1 inline size-3.5 text-gold" aria-hidden />
                {q.teaching}
              </p>
            )}
            {q.conceptName && <p className="text-[11px] text-ink-soft">Concept: {q.conceptName}</p>}
            <Button
              size="sm"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => setIdx((i) => i + 1)}
            >
              {idx + 1 === items.length ? 'See result' : 'Next question'} <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
      {note && <p className="text-[11px] text-ink-soft">{note}</p>}
    </div>
  )
}
