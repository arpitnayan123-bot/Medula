'use client'

// ─── PERSONAL MEDICAL BRAIN · PATH (PRODUCT 18) ──────────────────────────────
// The personalized learning path. One focus concept chosen by the engine from
// measured signals, a seven-stage stepper (Next Concept → Learn → Practice →
// Mistake Correction → Revision → Retest → Mastery) with done stages carrying
// their measured evidence, the current stage carrying its actions, and honest
// alternatives ("Or work on: …") that re-point the path. When the profile is
// too thin the engine says so — and so do we.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, CircleDashed, Compass, Flag } from 'lucide-react'
import type { BrainPathPayload, BrainPathStage } from '@/lib/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ActionButton, BrainErrorState, EASE, EmptyNote, EvidenceList, SectionCard, SkeletonRow,
  StatusPill, useBrainPayload,
} from './brain-shared'

export function BrainPath() {
  // null → the engine picks the focus; a conceptId re-points the path.
  const [conceptId, setConceptId] = useState<string | null>(null)
  const hook = useBrainPayload(() => api.brainPath(conceptId ?? undefined), conceptId ?? 'engine')
  const data = hook.data

  return (
    <div className="space-y-4">
      <SectionCard
        title="Your learning path"
        icon={Compass}
        subtitle="One concept at a time, chosen from measured signals — the stages below are the full loop from first contact to mastery."
        action={data && data.alternatives.length > 0 ? (
          <span className="shrink-0 text-[11px] text-ink-soft">{data.alternatives.length} alternative{data.alternatives.length === 1 ? '' : 's'}</span>
        ) : undefined}
      >
        {hook.state === 'loading' && <SkeletonRow rows={6} />}
        {hook.state === 'error' && (
          <BrainErrorState
            title="The path didn't load"
            hint="The brain engine did not respond — it may still be warming up. Nothing is lost; retry below."
            onRetry={hook.reload}
          />
        )}
        {data && (
          data.insufficientData || data.focus == null ? (
            <div className="space-y-3">
              <EmptyNote>{data.note}</EmptyNote>
              <p className="text-xs leading-relaxed text-ink-soft">
                The path appears once a few measured signals exist — solve a couple of questions or study a topic and
                the engine will pick up from there.
              </p>
            </div>
          ) : (
            <PathBody
              data={data}
              activeId={conceptId}
              onSwitch={(id) => setConceptId(id)}
              stale={hook.stale}
              reload={hook.reload}
            />
          )
        )}
      </SectionCard>
    </div>
  )
}

function PathBody({ data, activeId, onSwitch, stale, reload }: {
  data: BrainPathPayload
  activeId: string | null
  onSwitch: (id: string) => void
  stale: boolean
  reload: () => void
}) {
  const focus = data.focus!
  return (
    <div className="space-y-5">
      {/* focus concept card */}
      <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Focus concept</p>
            <h4 className="mt-0.5 text-base font-bold leading-snug tracking-tight">{focus.name}</h4>
            <p className="mt-0.5 text-[11px] text-ink-soft">{focus.topicName} · {focus.subjectName}</p>
          </div>
          <StatusPill status={focus.status} />
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">{data.reason}</p>
        <EvidenceList signals={focus.signals} className="mt-3" />
        {stale && (
          <Button variant="ghost" size="sm" className="mt-2 min-h-9 rounded-full px-3 text-xs text-ink-soft" onClick={reload}>
            Re-pointing…
          </Button>
        )}
      </div>

      {/* seven-stage stepper */}
      <ol className="relative space-y-1" aria-label="Learning path stages">
        {data.stages.map((stage, i) => (
          <StageRow key={stage.id} stage={stage} index={i} />
        ))}
      </ol>

      {/* alternatives — honest re-pointing, engine-provided only */}
      {data.alternatives.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-tight">
            <Flag className="size-3.5 shrink-0 text-primary" aria-hidden />
            Or work on
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.alternatives.map((alt) => (
              <button
                key={alt.conceptId}
                type="button"
                onClick={() => onSwitch(alt.conceptId)}
                aria-pressed={activeId === alt.conceptId}
                title={alt.reason}
                className={cn(
                  'inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none ring-primary/50 transition-colors focus-visible:ring-2',
                  activeId === alt.conceptId
                    ? 'border-primary/40 bg-primary/12 text-primary'
                    : 'border-line bg-surface-2/50 text-ink-soft hover:text-foreground',
                )}
              >
                <span className="truncate">{alt.name}</span>
                <span className="hidden truncate text-[10px] font-normal opacity-70 sm:inline">{alt.reason}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{data.note}</p>
    </div>
  )
}

// ── one stage — done (emerald check + evidence), current (pulse + actions),
//    future (muted) ────────────────────────────────────────────────────────────

function StageRow({ stage, index }: { stage: BrainPathStage; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.04 * index, ease: EASE }}
      className="relative flex gap-3 pb-4 last:pb-0"
    >
      {/* connector line */}
      {index > 0 && <span className="absolute left-[13px] top-[-14px] h-[14px] w-px bg-line" aria-hidden />}

      <span
        className={cn(
          'relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border',
          stage.done && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600',
          stage.current && 'border-primary/50 bg-primary/12 text-primary',
          !stage.done && !stage.current && 'border-line bg-surface-2 text-ink-soft',
        )}
        aria-hidden
      >
        {stage.done ? (
          <Check className="size-3.5" />
        ) : stage.current ? (
          <>
            <span className="absolute inset-0 animate-pulse rounded-full ring-2 ring-primary/30" />
            <span className="size-2 rounded-full bg-primary" />
          </>
        ) : (
          <CircleDashed className="size-3.5" />
        )}
      </span>

      <div className={cn('min-w-0 flex-1', !stage.done && !stage.current && 'opacity-70')}>
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-xs font-semibold tracking-tight', stage.current && 'text-primary')}>
            {stage.title}
          </p>
          {stage.current && (
            <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
              Now
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{stage.line}</p>

        {stage.done && stage.evidence.length > 0 && (
          <ul className="mt-1.5 space-y-0.5" aria-label={`${stage.title} evidence`}>
            {stage.evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-soft">
                <Check className="mt-0.5 size-2.5 shrink-0 text-emerald-500" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        )}

        {stage.current && stage.actions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {stage.actions.map((a, i) => (
              <ActionButton key={i} action={a} />
            ))}
          </div>
        )}
      </div>
    </motion.li>
  )
}
