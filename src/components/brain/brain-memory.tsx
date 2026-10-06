'use client'

// ─── PERSONAL MEDICAL BRAIN · MEMORY (PRODUCT 18) ────────────────────────────
// Memory & forgetting: the measured recall curve per concept, ordered by lowest
// recall first. Every row carries its last review, stability, days-to-decay,
// flashcard history, retrieval success and revision count — the same signals
// the Smart Revision queue reads. No fake precision: unmeasured stays "—".

import { CalendarCheck, Info } from 'lucide-react'
import type { BrainMemoryPayload, BrainMemoryRow } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  BrainErrorState, EmptyNote, RecallBar, RiskPill, SectionCard, SkeletonRow, recallPct,
  relativeTime, useBrainPayload,
} from './brain-shared'

export function BrainMemory() {
  const hook = useBrainPayload(() => api.brainMemory())
  const setView = useAppStore((s) => s.setView)
  const data = hook.data

  // lowest recall first; never-measured rows sink below measured ones
  const rows = data
    ? [...data.rows].sort((a, b) => {
        if (a.estRecall == null && b.estRecall == null) return 0
        if (a.estRecall == null) return 1
        if (b.estRecall == null) return -1
        return a.estRecall - b.estRecall
      })
    : []

  return (
    <div className="space-y-4">
      <SectionCard
        title="Memory & forgetting"
        icon={CalendarCheck}
        subtitle="Your measured recall curve — estRecall = e^(−t / 1.6·stability), recomputed from your real review history. Lowest recall first."
        action={data ? (
          <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={() => setView('revision')}>
            Open Smart Revision
          </Button>
        ) : undefined}
      >
        {hook.state === 'loading' && <SkeletonRow rows={6} />}
        {hook.state === 'error' && (
          <BrainErrorState
            title="Memory didn't load"
            hint="The brain engine did not respond — it may still be warming up. Nothing is lost; retry below."
            onRetry={hook.reload}
          />
        )}
        {data && (
          <div className="space-y-4">
            {/* summary chips */}
            <div className="flex flex-wrap gap-1.5">
              <SummaryChip value={data.summary.highRisk} label="high risk" tone="high" />
              <SummaryChip value={data.summary.moderateRisk} label="moderate" tone="moderate" />
              <SummaryChip value={data.summary.dueNow} label="due now" tone="due" />
            </div>

            {data.rows.length === 0 ? (
              <EmptyNote>{data.summary.note}</EmptyNote>
            ) : rows.length === 0 ? (
              <EmptyNote>No concepts in the measured window.</EmptyNote>
            ) : (
              <ul className="space-y-2" aria-label="Concepts by recall">
                {rows.map((row) => (
                  <MemoryRow key={row.conceptId} row={row} />
                ))}
              </ul>
            )}

            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft" role="note">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>{data.summary.note}</span>
            </p>
          </div>
        )}
      </SectionCard>

      {/* hand-off — the revision queue is the action surface for these risks */}
      {data && data.rows.length > 0 && (
        <section className="clay rounded-2xl p-4 md:p-6">
          <h3 className="text-sm font-semibold tracking-tight">This feeds your Smart Revision queue</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            The same measured recall risks above are what your revision queue orders itself by. Open Smart Revision to
            work the due blocks — high-risk concepts surface first there.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="min-h-11 rounded-xl text-xs" onClick={() => setView('revision')}>
              Open Smart Revision
            </Button>
            <Button variant="outline" className="min-h-11 rounded-xl text-xs" onClick={() => setView('revision')}>
              Send top risks to revision
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
            The revision view handles queueing itself — nothing is moved until you run a block there.
          </p>
        </section>
      )}
    </div>
  )
}

function SummaryChip({ value, label, tone }: { value: number; label: string; tone: 'high' | 'moderate' | 'due' }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px]',
        tone === 'high' && 'border-rose-500/40 bg-rose-500/12 text-rose-700',
        tone === 'moderate' && 'border-amber-500/40 bg-amber-500/12 text-amber-700',
        tone === 'due' && 'border-primary/40 bg-primary/12 text-primary',
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span className={tone === 'due' ? '' : 'opacity-80'}>{label}</span>
    </span>
  )
}

function MemoryRow({ row }: { row: BrainMemoryRow }) {
  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{row.name}</p>
          <p className="truncate text-[10px] text-ink-soft">
            {row.topicName} · {row.subjectName}
            {row.lastReviewedAt ? ` · reviewed ${relativeTime(row.lastReviewedAt)}` : ' · never reviewed'}
          </p>
        </div>
        <RiskPill risk={row.forgetRisk} />
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <RecallBar recall={row.estRecall} className="flex-1" label={`Estimated recall for ${row.name}`} />
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-soft">{recallPct(row.estRecall)}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-soft">
        <span>stability {row.stabilityDays == null ? '—' : `${Math.round(row.stabilityDays)}d`}</span>
        <span aria-hidden>·</span>
        <span>{decayLine(row.daysToDecay)}</span>
        <span aria-hidden>·</span>
        <span>
          flashcards {row.flashcards.reps} rep{row.flashcards.reps === 1 ? '' : 's'}
          {row.flashcards.lapses > 0 ? ` · ${row.flashcards.lapses} lapse${row.flashcards.lapses === 1 ? '' : 's'}` : ''}
        </span>
        <span aria-hidden>·</span>
        <span>retrieval {row.retrievalSuccess == null ? '—' : `${Math.round(row.retrievalSuccess)}%`}</span>
        <span aria-hidden>·</span>
        <span>{row.revisions} revision{row.revisions === 1 ? '' : 's'}</span>
        {row.wrongCount > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="font-medium text-rose-600">{row.wrongCount} wrong</span>
          </>
        )}
      </div>

      {row.signals.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Signals for ${row.name}`}>
          {row.signals.map((sig, i) => (
            <li
              key={i}
              className="inline-flex max-w-full items-center rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] text-ink-soft"
            >
              <span className="truncate">{sig}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function decayLine(days: number | null): string {
  if (days == null) return 'decay not measurable yet'
  if (days <= 0) return 'below 60% recall now'
  return `~${Math.round(days)} days to 60% recall`
}
