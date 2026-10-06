'use client'

// ─── AI FACULTY & CONTENT INTELLIGENCE · GAPS (PRODUCT 19) ───────────────────
// Demand-ranked content gaps: one filter chip per measured gap kind with its
// live count, a severity filter, and a priority-ranked list. Every item carries
// its evidence (each line traceable to a real table), the published priority
// score and — where one exists — a hand-off into the surface that fixes it.
// Ranking rule (published): exam weight × learner demand. The UI never
// invents a gap or a number.

import { useMemo, useState } from 'react'
import { Target } from 'lucide-react'
import type { FacultyGapItem, FacultyGapKind, FacultySeverity } from '@/lib/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  EmptyNote, ExamWeightStars, FacultyErrorState, GAP_KIND_LABELS, HandoffButton, MicroLabel,
  MonoChip, PriorityBar, SCROLL_LIST, SectionCard, SeverityPill, SkeletonRow, useFaculty,
} from './faculty-shared'

export function FacultyGaps() {
  const hook = useFaculty(() => api.facultyGaps())

  const [kindFilter, setKindFilter] = useState<FacultyGapKind | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<FacultySeverity | 'all'>('all')

  const data = hook.data

  const kindCounts = useMemo(() => {
    const map = new Map<FacultyGapKind, number>()
    if (data) for (const [k, v] of Object.entries(data.counts)) {
      if (k !== 'all' && typeof v === 'number') map.set(k as FacultyGapKind, v)
    }
    return map
  }, [data])

  const items = useMemo(() => {
    if (!data) return []
    return data.items
      .filter((it) => (kindFilter === 'all' || it.kind === kindFilter) && (severityFilter === 'all' || it.severity === severityFilter))
      .sort((a, b) => b.priority - a.priority)
  }, [data, kindFilter, severityFilter])

  const filtersActive = kindFilter !== 'all' || severityFilter !== 'all'

  return (
    <div className="space-y-4">
      <SectionCard
        title="Content gaps"
        icon={Target}
        subtitle="Where the library falls short of what students actually need — each gap measured, ranked and owned by a fix."
        action={data ? <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{items.length} of {data.counts.all}</span> : undefined}
      >
        {hook.state === 'loading' && <SkeletonRow rows={5} />}
        {hook.state === 'error' && (
          <FacultyErrorState
            title="The gap map didn't load"
            hint="The faculty engine did not respond — it may still be warming up. Nothing is lost; retry below."
            onRetry={hook.reload}
          />
        )}
        {data && (
          <div className="space-y-4">
            {/* kind filter chips — one per measured gap kind */}
            <div>
              <MicroLabel className="mb-2">Kind</MicroLabel>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter gaps by kind">
                <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')} label="All gaps" count={data.counts.all} />
                {Array.from(kindCounts.entries()).map(([kind, count]) => (
                  <FilterChip
                    key={kind}
                    active={kindFilter === kind}
                    onClick={() => setKindFilter(kind)}
                    label={GAP_KIND_LABELS[kind] ?? kind}
                    count={count}
                  />
                ))}
              </div>
            </div>

            {/* severity filter chips */}
            <div>
              <MicroLabel className="mb-2">Severity</MicroLabel>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter gaps by severity">
                <FilterChip active={severityFilter === 'all'} onClick={() => setSeverityFilter('all')} label="Any severity" />
                {(['info', 'warning', 'critical'] as const).map((sev) => (
                  <FilterChip key={sev} active={severityFilter === sev} onClick={() => setSeverityFilter(sev)} label={sev === 'info' ? 'Info' : sev === 'warning' ? 'Warning' : 'Critical'} />
                ))}
              </div>
            </div>

            {data.items.length === 0 ? (
              <EmptyNote>
                No gaps measured right now — every checked concept has its lesson, practice pool and revision material.
                New content is re-checked as it lands.
              </EmptyNote>
            ) : items.length === 0 ? (
              <EmptyNote>
                No gaps match the current filters. {filtersActive ? 'Loosen a filter to see the full ranked list.' : ''}
              </EmptyNote>
            ) : (
              <ul className={SCROLL_LIST} aria-label="Priority-ranked gap list">
                {items.map((gap) => <GapItemCard key={gap.id} gap={gap} />)}
              </ul>
            )}

            {/* published ranking rule + data basis, verbatim */}
            <div className="space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-soft" role="note">
              <p><span className="font-semibold text-foreground">Prioritized by: </span>{data.prioritizedBy}</p>
              <p><span className="font-semibold text-foreground">Data basis — </span>{data.dataBasis}</p>
              <p>{data.note}</p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ── one gap item — label, context, demand, evidence, suggestion, priority ────

function GapItemCard({ gap }: { gap: FacultyGapItem }) {
  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-snug">{gap.label}</p>
          <p className="mt-0.5 text-[10px] text-ink-soft">
            {GAP_KIND_LABELS[gap.kind] ?? gap.kind}
            {gap.subjectName ? ` · ${gap.subjectName}` : ''}{gap.topicName ? ` · ${gap.topicName}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ExamWeightStars weight={gap.examWeight} />
          <SeverityPill severity={gap.severity} />
          <PriorityBar priority={gap.priority} />
        </div>
      </div>

      {gap.demandLine && <MonoChip className="mt-2">{gap.demandLine}</MonoChip>}

      {gap.evidence.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Measured evidence">
          {gap.evidence.map((ev, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-soft/60" aria-hidden />
              <span>{ev}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-soft" role="note">
        <span className="font-medium text-foreground">Suggested fix: </span>{gap.suggestion}
      </p>

      {gap.handoff && (
        <div className="mt-2.5">
          <HandoffButton handoff={gap.handoff} />
        </div>
      )}
    </li>
  )
}

function FilterChip({ active, onClick, label, count }: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none ring-primary/50 transition-colors focus-visible:ring-2',
        active
          ? 'border-primary/40 bg-primary/12 text-primary'
          : 'border-line bg-surface-2/50 text-ink-soft hover:text-foreground',
      )}
    >
      {label}
      {count != null && <span className="tabular-nums">{count}</span>}
    </button>
  )
}
