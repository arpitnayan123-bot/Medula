'use client'

// ─── MOTIVATION · JOURNEY (PRODUCT 17) ───────────────────────────────────────
// The measured ladder: Subjects → Topics → Mastery → Milestones → Exam
// Readiness. Horizontal on desktop, vertical stepper on mobile. Subject rows
// reuse the SAME mastery bar as Performance Intelligence (honest note kept).
// Insufficient data is stated honestly — nothing is invented to fill a stage.

import { Route, Award, GraduationCap, Gauge, Info } from 'lucide-react'
import type { GamifyJourneyPayload, GamifyJourneySubject } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  Bar, EmptyState, ErrorState, FootNote, MicroLabel, PercentRing, Reveal, SectionCard, SkeletonRow,
  useGamifyPayload,
} from './gamify-shared'

const STATUS_LABEL: Record<GamifyJourneySubject['status'], string> = {
  new: 'New',
  developing: 'Developing',
  strong: 'Strong',
}

const STATUS_CLASS: Record<GamifyJourneySubject['status'], string> = {
  new: 'border-line bg-surface-2/60 text-ink-soft',
  developing: 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn',
  strong: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok',
}

export function GamifyJourney() {
  const { data, state, stale, reload } = useGamifyPayload(api.gamifyJourney)

  if (state === 'loading') return <JourneySkeleton />
  if (state === 'error') {
    return (
      <ErrorState
        title="The journey didn't load"
        hint="The gamify engine did not respond — your ladder is safe; nothing is lost. Retry below."
        onRetry={reload}
      />
    )
  }
  if (!data) return null

  if (data.insufficientData) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Route}
          title="Not enough measured activity yet"
          hint={data.honestNote}
          action={
            <p className="flex flex-wrap justify-center gap-2 text-[11px] text-ink-soft">
              <span className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1">{data.dataBasis.conceptsTouched}/{data.dataBasis.conceptsTotal} concepts touched</span>
              <span className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1">{data.dataBasis.attempts} MCQ attempts</span>
              <span className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1">{data.dataBasis.mocks} mocks</span>
            </p>
          }
        />
        <FootNote>The ladder appears as soon as your real study activity gives it something honest to show.</FootNote>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── the 5-stage ladder ── */}
      <Reveal index={0}>
        <SectionCard
          title="The ladder"
          icon={Route}
          description="Five measured stages — from subjects you touch to exam readiness."
        >
          {/* desktop: horizontal */}
          <div className="relative hidden gap-3 md:grid md:grid-cols-5" role="list" aria-label="Journey stages">
            <div className="absolute inset-x-8 top-7 h-px bg-line" aria-hidden />
            {data.ladder.map((stage) => (
              <div key={stage.label} className="relative flex flex-col items-center gap-2 text-center" role="listitem">
                <div className="rounded-full bg-card p-1">
                  <PercentRing percent={stage.percent} size={56} strokeWidth={5} label={stage.label} />
                </div>
                <p className="text-xs font-semibold leading-tight">{stage.label}</p>
                <p className="text-[10px] leading-relaxed text-ink-soft">{stage.detail}</p>
              </div>
            ))}
          </div>
          {/* mobile: vertical stepper */}
          <ol className="space-y-4 md:hidden" aria-label="Journey stages">
            {data.ladder.map((stage, i) => (
              <li key={stage.label} className="relative flex gap-3.5 pb-1">
                {i < data.ladder.length - 1 && <span className="absolute left-[27px] top-14 h-[calc(100%-3rem)] w-px bg-line" aria-hidden />}
                <PercentRing percent={stage.percent} size={56} strokeWidth={5} label={stage.label} />
                <div className="min-w-0 pt-1.5">
                  <p className="text-xs font-semibold leading-tight">{stage.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{stage.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>
      </Reveal>

      {/* ── subjects ── */}
      <Reveal index={1}>
        <SectionCard
          title="Subjects"
          icon={GraduationCap}
          description="Mastery comes from the same engine as Performance Intelligence — one bar, no re-definition."
        >
          <ul className="space-y-2.5" aria-label="Subjects by NEET-PG weight">
            {data.subjects.map((s) => <SubjectRow key={s.id} s={s} />)}
          </ul>
        </SectionCard>
      </Reveal>

      {/* ── milestones ── */}
      <Reveal index={2}>
        <SectionCard
          title="Milestones"
          icon={Award}
          description={data.milestones.total > 0 ? `${data.milestones.unlocked} of ${data.milestones.total} unlocked — measured, one-time.` : 'Measured, one-time unlocks.'}
          className="warm-card"
        >
          {data.milestones.recent.length === 0 ? (
            <p className="text-xs leading-relaxed text-ink-soft">
              No milestones yet — the first topic you carry across the mastery bar unlocks one.
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label="Recently unlocked milestones">
              {data.milestones.recent.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface-2/50 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/12" aria-hidden>
                    <Award className="size-4 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{m.title}</span>
                  <span className="shrink-0 text-[10px] text-ink-soft" title={new Date(m.earnedAt).toLocaleString('en-IN')}>
                    {new Date(m.earnedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </Reveal>

      {/* ── exam readiness ── */}
      <Reveal index={3}>
        <ReadinessCard data={data} />
      </Reveal>

      <FootNote>{data.honestNote} Generated {new Date(data.generatedAt).toLocaleString('en-IN')}.</FootNote>
    </div>
  )
}

// ── subject row ──────────────────────────────────────────────────────────────

function SubjectRow({ s }: { s: GamifyJourneySubject }) {
  const openLearn = useAppStore((st) => st.openLearn)
  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex items-center gap-2.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{s.name}</span>
        <span className="shrink-0 rounded-full border border-line bg-surface-2/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-soft">
          NEET-PG {s.neetWeight}%
        </span>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide', STATUS_CLASS[s.status])}>
          {STATUS_LABEL[s.status]}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Bar value={s.masteryPct} className="flex-1" label={`${s.name} mastery`} />
        <span className="shrink-0 text-[10px] tabular-nums text-ink-soft">
          {s.topicsMastered}/{s.topicsTotal} mastered · {s.engagedPct}% engaged
        </span>
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9 rounded-full px-3 text-xs"
          onClick={() => openLearn('subject', s.id)}
        >
          Open in Learn
        </Button>
      </div>
    </li>
  )
}

// ── exam readiness ───────────────────────────────────────────────────────────

function ReadinessCard({ data }: { data: GamifyJourneyPayload }) {
  const setView = useAppStore((st) => st.setView)
  const r = data.readiness
  return (
    <SectionCard title="Exam readiness" icon={Gauge} description="From Performance Intelligence — the same measured estimate, one source of truth.">
      {r.current == null ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft" role="note">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          No readiness estimate yet — a submitted mock and steady practice give the model something honest to measure.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <PercentRing percent={r.current} size={64} strokeWidth={6} label="Exam readiness" />
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">{r.band}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{r.note}</p>
          </div>
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <Button variant="outline" size="sm" className="min-h-9 rounded-xl px-3.5 text-xs" onClick={() => setView('performance')}>
          Open Performance Intelligence
        </Button>
      </div>
    </SectionCard>
  )
}

function JourneySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading your journey">
      <div className="clay rounded-2xl p-5">
        <Skeleton className="h-4 w-28" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="clay rounded-2xl p-5">
        <Skeleton className="h-4 w-20" />
        <div className="mt-4"><SkeletonRow rows={4} /></div>
      </div>
      <MicroLabel className="sr-only">Loading journey stages</MicroLabel>
    </div>
  )
}
