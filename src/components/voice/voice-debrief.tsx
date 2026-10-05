'use client'

import { CheckCircle2, CircleDot, Mic, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { VoiceDebrief, VoiceMode } from '@/lib/types'

// PRODUCT 11 — post-session debrief: honest numbers, per-concept verdicts,
// where the signals were fed, and the next hand-off. Same honesty contract
// as every other Medula debrief: counts only what was actually graded.

const MODE_LABELS: Record<VoiceMode, string> = {
  listen: 'Listen',
  rapid: 'Rapid Fire',
  viva: 'Viva',
  revision: 'Revision',
  clinical: 'Clinical',
  doubt: 'Doubt',
}

export function VoiceDebriefCard({
  debrief,
  onHome,
  onAgain,
}: {
  debrief: VoiceDebrief
  onHome: () => void
  onAgain: (mode: VoiceMode) => void
}) {
  const minutes = Math.max(1, Math.round(debrief.durationMs / 60000))
  const ring = debrief.accuracy // 0..100 | null

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      {/* headline */}
      <div className="rounded-3xl border border-sky-200/70 bg-gradient-to-br from-sky-100 via-white to-emerald-50 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
          {MODE_LABELS[debrief.mode]} voice session · complete
        </p>
        <div className="mx-auto mt-4 flex size-28 items-center justify-center rounded-full border-[6px] border-sky-200 bg-white">
          <div>
            <p className="text-2xl font-bold text-ink">{ring === null ? '—' : `${ring}%`}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">
              {debrief.questions > 0 ? 'accuracy' : 'open talk'}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-ink">
          {minutes} min · {debrief.turns} exchanges
          {debrief.questions > 0 &&
            ` · ${debrief.correct}/${debrief.questions} spoken answers correct`}
        </p>
        {debrief.topicLabel && debrief.topicLabel !== debrief.mode && (
          <p className="mt-1 text-xs text-ink-soft">{debrief.topicLabel}</p>
        )}
      </div>

      {/* per-concept verdicts */}
      {debrief.concepts.length > 0 && (
        <section className="mt-5" aria-label="Graded concepts this session">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            What your voice answered
          </h2>
          <div className="mt-2 space-y-2">
            {debrief.concepts.map((c, i) => (
              <div
                key={`${c.name}-${i}`}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5"
              >
                {c.verdict === 'correct' ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="correct" />
                ) : c.verdict === 'partial' ? (
                  <CircleDot className="mt-0.5 size-5 shrink-0 text-amber-600" aria-label="partially correct" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-label="missed" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{c.name}</p>
                  {c.note && <p className="mt-0.5 text-xs text-ink-soft">{c.note}</p>}
                </div>
                <span
                  className={cn(
                    'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    c.verdict === 'correct' && 'bg-emerald-100 text-emerald-700',
                    c.verdict === 'partial' && 'bg-amber-100 text-amber-700',
                    c.verdict === 'missed' && 'bg-rose-100 text-rose-700',
                  )}
                >
                  {c.verdict}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* weak areas revisited */}
      {debrief.weakTouched.length > 0 && (
        <section className="mt-5" aria-label="Measured weak areas revisited">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Weak areas you revisited out loud
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {debrief.weakTouched.map((w) => (
              <span
                key={w.name}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800"
              >
                {w.name} · {w.mastery}%
              </span>
            ))}
          </div>
        </section>
      )}

      {/* honest feed report */}
      <section className="mt-5 rounded-2xl border border-border bg-card/60 p-4" aria-label="Where these signals were fed">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
          <Sparkles className="size-3.5 text-sky-600" aria-hidden />
          Where these signals went
        </p>
        <ul className="mt-2 space-y-1 text-xs text-ink-soft">
          <li>
            {debrief.fed.studySession ? '✓' : '·'} {minutes} min logged to Performance Analytics
            (Study Session)
          </li>
          <li>
            {debrief.fed.errorPattern ? '✓' : '·'} Missed spoken answers → Mistake Intelligence
            patterns
          </li>
          <li>
            {debrief.fed.revisionItem ? '✓' : '·'} Missed concepts → Smart Revision queue
          </li>
          <li className="text-[11px] italic text-ink-soft/80">{debrief.fed.reason}</li>
        </ul>
      </section>

      {/* next actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button className="h-11 flex-1 rounded-xl" onClick={() => onAgain(debrief.mode)}>
          <Mic className="size-4" aria-hidden />
          Another {MODE_LABELS[debrief.mode].toLowerCase()} session
        </Button>
        {debrief.fed.revisionItem && (
          <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={onHome}>
            <RotateCcw className="size-4" aria-hidden />
            See revision queue
          </Button>
        )}
        <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={onHome}>
          Voice home
        </Button>
      </div>
    </div>
  )
}
