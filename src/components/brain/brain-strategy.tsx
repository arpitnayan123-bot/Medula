'use client'

// ─── PERSONAL MEDICAL BRAIN · STRATEGY (PRODUCT 18) ──────────────────────────
// Evidence-based exam strategy: the measured exam clock, readiness band, the
// high-impact weaknesses worth the effort, the strong areas to protect (not
// grind), time management vs the published 63s/question pace, mistake-pattern
// tactics, revision gaps, test-taking signals and a numbered playbook. Every
// line carries its measurement; the disclaimer is rendered verbatim; nothing
// anywhere promises or predicts a rank.

import { ClipboardList, Flag, Gauge, HeartPulse, ShieldCheck, Target } from 'lucide-react'
import type { BrainStrategyPayload } from '@/lib/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  ActionButton, BrainErrorState, EmptyNote, SectionCard, SkeletonRow, WeightDots,
  useBrainPayload,
} from './brain-shared'

export function BrainStrategy() {
  const hook = useBrainPayload(() => api.brainStrategy())
  const data = hook.data

  return (
    <div className="space-y-4">
      {hook.state === 'loading' && (
        <SectionCard title="Exam strategy" icon={Target}>
          <SkeletonRow rows={6} />
        </SectionCard>
      )}
      {hook.state === 'error' && (
        <BrainErrorState
          title="Strategy didn't load"
          hint="The brain engine did not respond — it may still be warming up. Nothing is lost; retry below."
          onRetry={hook.reload}
        />
      )}
      {data && (
        <>
          {/* exam clock + readiness */}
          <SectionCard title="Where the exam stands" icon={Target} subtitle="Measured from your profile and submitted mocks — never a prediction.">
            <div className="flex flex-wrap items-center gap-2">
              {data.examClock ? (
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/40 bg-primary/12 px-3 py-1.5 text-[11px] font-semibold text-primary">
                  <Gauge className="size-3.5 shrink-0" aria-hidden />
                  {data.examClock.daysLeft == null ? data.examClock.stage : `${data.examClock.daysLeft} days left`}
                  {data.examClock.isEstimate && (
                    <span className="rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft">
                      estimate
                    </span>
                  )}
                  <span className="font-normal opacity-80">{data.examClock.daysLeft == null ? '' : `· ${data.examClock.stage}`}</span>
                </span>
              ) : (
                <EmptyNote>No exam date on the profile yet — set one in Profile to anchor the strategy timeline.</EmptyNote>
              )}
              {data.readiness && (
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11px]">
                  <HeartPulse className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="font-semibold tabular-nums">{data.readiness.current == null ? '—' : data.readiness.current}</span>
                  <span className="text-ink-soft">{data.readiness.band}</span>
                </span>
              )}
            </div>
            {data.readiness && data.readiness.dataPoorDims.length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft" role="note">
                Readiness excludes dimensions with too little data — currently: {data.readiness.dataPoorDims.join(', ')}.
              </p>
            )}
          </SectionCard>

          {/* high-impact weaknesses */}
          {data.highImpactWeaknesses.length > 0 && (
            <SectionCard
              title="High-impact weaknesses"
              icon={Flag}
              subtitle="Where effort moves the measured needle most — exam weight × measured weakness."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.highImpactWeaknesses.map((w) => (
                  <section key={w.conceptId} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-2/40 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="min-w-0 text-sm font-semibold leading-snug tracking-tight">{w.name}</h4>
                      <WeightDots weight={w.examWeight} className="mt-1 shrink-0" />
                    </div>
                    <p className="text-xs leading-relaxed text-ink-soft">{w.line}</p>
                    <ActionButton action={w.action} className="mt-auto w-full justify-center" />
                  </section>
                ))}
              </div>
            </SectionCard>
          )}

          {/* strong areas — protect, don't grind */}
          {data.strongAreas.length > 0 && (
            <SectionCard
              title="Strong areas"
              icon={ShieldCheck}
              subtitle="Protect — don't grind. These hold their measured level; a light pass is enough."
            >
              <ul className="space-y-1.5" aria-label="Strong areas">
                {data.strongAreas.map((s) => (
                  <li key={s.conceptId} className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{s.name}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{s.line}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* time management + test taking */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Time management" icon={Gauge}>
              <dl className="space-y-2 text-xs">
                <Metric label="Your median per question" value={data.timeManagement.medianSec == null ? '—' : `${Math.round(data.timeManagement.medianSec)}s`} />
                <Metric label="Published exam pace" value={`${Math.round(data.timeManagement.paceSec)}s per question`} />
                <Metric label="Timed accuracy" value={data.timeManagement.timedAccuracy == null ? '—' : `${Math.round(data.timeManagement.timedAccuracy)}%`} />
                <Metric label="Untimed accuracy" value={data.timeManagement.untimedAccuracy == null ? '—' : `${Math.round(data.timeManagement.untimedAccuracy)}%`} />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">{data.timeManagement.line}</p>
            </SectionCard>

            <SectionCard title="Test-taking signals" icon={ClipboardList}>
              <dl className="space-y-2 text-xs">
                <Metric label="Careless-error rate" value={data.testTaking.carelessRate == null ? '—' : `${Math.round(data.testTaking.carelessRate)}%`} />
                <Metric label="Changed answers in mocks" value={String(data.testTaking.changedAnswers)} />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-soft">{data.testTaking.line}</p>
            </SectionCard>
          </div>

          {/* mistake patterns → tactics */}
          {data.mistakePatterns.length > 0 && (
            <SectionCard title="Mistake patterns" icon={Flag} subtitle="Your measured error types, each with the tactic that fits it.">
              <ul className="space-y-1.5" aria-label="Mistake patterns">
                {data.mistakePatterns.map((m) => (
                  <li key={m.errorType} className="rounded-xl border border-line bg-surface-2/40 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold capitalize">{m.errorType.replace(/-/g, ' ')}</p>
                      <p className="shrink-0 text-[11px] tabular-nums text-ink-soft">{m.count} measured</p>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{m.tactic}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* revision gaps */}
          <SectionCard title="Revision gaps" icon={ClipboardList}>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11px]">
                <span className="font-semibold tabular-nums">{data.revisionGaps.coverage == null ? '—' : `${Math.round(data.revisionGaps.coverage)}%`}</span>
                <span className="text-ink-soft">coverage</span>
              </span>
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/12 px-3 py-1.5 text-[11px]">
                <span className="font-semibold tabular-nums">{data.revisionGaps.overdue}</span>
                <span className="text-amber-700">overdue</span>
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">{data.revisionGaps.line}</p>
          </SectionCard>

          {/* playbook */}
          {data.playbook.length > 0 && (
            <SectionCard title="Your playbook" icon={Target} subtitle="Numbered, evidence-based lines — each traceable to the measurements above.">
              <ol className="space-y-2">
                {data.playbook.map((line, i) => (
                  <li key={i} className="flex gap-2.5 text-xs leading-relaxed">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary" aria-hidden>
                      {i + 1}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          {/* disclaimer — verbatim */}
          <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-[11px] italic leading-relaxed text-ink-soft" role="note">
            {data.disclaimer}
          </p>
          <p className="text-[11px] text-ink-soft">Computed {new Date(data.generatedAt).toLocaleString('en-IN')}.</p>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-b-0 last:pb-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
