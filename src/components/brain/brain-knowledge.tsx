'use client'

// ─── PERSONAL MEDICAL BRAIN · KNOWLEDGE (PRODUCT 18) ─────────────────────────
// The full concept map: one stacked state bar, filter chips for the 7 published
// states with counts, a subject filter, a debounced search over name/topic —
// and one row per concept with its measured recall, exam weight, expandable
// evidence and hand-off actions. Filtering is client-side over the payload the
// engine publishes; the UI never invents a state or a number.

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Layers, Search, X } from 'lucide-react'
import type { BrainConceptState, BrainConceptStatus } from '@/lib/types'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ALL_STATUSES, ActionButton, BrainErrorState, EmptyNote, EvidenceList, MicroLabel, RecallBar,
  STATUS_META, SectionCard, SkeletonRow, StateDistribution, StatusPill, WeightDots, recallPct,
  useBrainPayload,
} from './brain-shared'
import type { BrainKnowledgeSeed } from './brain-view'

export function BrainKnowledge({ seed }: { seed: BrainKnowledgeSeed | null }) {
  const hook = useBrainPayload(() => api.brainKnowledge())

  // ── filters (client-side over the published payload) ──
  const [stateFilter, setStateFilter] = useState<BrainConceptStatus | 'all'>('all')
  const [subject, setSubject] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  // Cross-tab jump (Overview state segment → pre-filtered knowledge list):
  // render-time state adjustment when the seed nonce changes (no effect).
  const [lastSeed, setLastSeed] = useState(seed)
  if (seed !== lastSeed) {
    setLastSeed(seed)
    if (seed) setStateFilter(seed.state)
  }

  // Debounced search (250ms) — client filter on name/topic/subject.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim().toLowerCase()), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const data = hook.data

  const subjects = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.states.map((s) => s.subjectName))).sort((a, b) => a.localeCompare(b))
  }, [data])

  const rows = useMemo(() => {
    if (!data) return []
    return data.states.filter((s) => {
      if (stateFilter !== 'all' && s.status !== stateFilter) return false
      if (subject !== 'all' && s.subjectName !== subject) return false
      if (query && !(`${s.name} ${s.topicName} ${s.subjectName}`.toLowerCase().includes(query))) return false
      return true
    })
  }, [data, stateFilter, subject, query])

  const filtersActive = stateFilter !== 'all' || subject !== 'all' || query !== ''
  const clearFilters = () => {
    setStateFilter('all')
    setSubject('all')
    setSearchInput('')
    setQuery('')
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Concept map"
        icon={Layers}
        subtitle="Every concept, its published 7-state derivation, and the measured signals behind it."
        action={data ? <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{rows.length} of {data.states.length}</span> : undefined}
      >
        {hook.state === 'loading' && <SkeletonRow rows={5} />}
        {hook.state === 'error' && (
          <BrainErrorState
            title="The concept map didn't load"
            hint="The knowledge service did not respond — it may still be warming up. Nothing is lost; retry below."
            onRetry={hook.reload}
          />
        )}
        {data && (
          <div className="space-y-4">
            <StateDistribution counts={data.counts} onJump={(s) => setStateFilter(s)} />

            {/* state filter chips */}
            <div>
              <MicroLabel className="mb-2">State</MicroLabel>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={stateFilter === 'all'} onClick={() => setStateFilter('all')} label="All" count={data.states.length} />
                {ALL_STATUSES.map((s) => (
                  <FilterChip
                    key={s}
                    active={stateFilter === s}
                    onClick={() => setStateFilter(s)}
                    label={STATUS_META[s].label}
                    count={data.counts[s]}
                    dot={STATUS_META[s].dot}
                  />
                ))}
              </div>
            </div>

            {/* subject filter chips */}
            {subjects.length > 1 && (
              <div>
                <MicroLabel className="mb-2">Subject</MicroLabel>
                <div className="flex flex-wrap gap-1.5">
                  <FilterChip active={subject === 'all'} onClick={() => setSubject('all')} label="All subjects" />
                  {subjects.map((sub) => (
                    <FilterChip key={sub} active={subject === sub} onClick={() => setSubject(sub)} label={sub} />
                  ))}
                </div>
              </div>
            )}

            {/* search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search concept or topic…"
                aria-label="Search concepts"
                className="min-h-11 pl-9"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setQuery('') }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-surface-2"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>

            {data.states.length === 0 ? (
              <EmptyNote>{data.note}</EmptyNote>
            ) : rows.length === 0 ? (
              <EmptyNote>
                No concepts match the current filters. {filtersActive ? 'Loosen a filter or clear them to see the full map.' : data.note}
              </EmptyNote>
            ) : (
              <div
                className="max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
                aria-label="Concept list"
              >
                {rows.map((row) => (
                  <ConceptRow key={row.conceptId} row={row} />
                ))}
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{data.note}</p>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function FilterChip({ active, onClick, label, count, dot }: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  dot?: string
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
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dot)} aria-hidden />}
      {label}
      {count != null && <span className="tabular-nums">{count}</span>}
    </button>
  )
}

// ── one concept row — name, caption, pill, recall, weight, evidence + actions ─

function ConceptRow({ row }: { row: BrainConceptState }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-line bg-surface-2/40">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center gap-3 p-3 text-left outline-none ring-primary/50 focus-visible:ring-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{row.name}</span>
          <span className="block truncate text-[10px] text-ink-soft">{row.topicName} · {row.subjectName}</span>
        </span>
        <StatusPill status={row.status} />
        <span className="hidden w-24 shrink-0 sm:block">
          <RecallBar recall={row.estRecall} label={`Estimated recall for ${row.name}`} />
        </span>
        <span className="hidden shrink-0 text-[10px] tabular-nums text-ink-soft sm:block">{recallPct(row.estRecall)}</span>
        <WeightDots weight={row.examWeight} className="hidden shrink-0 md:inline-flex" />
        <ChevronDown className={cn('size-3.5 shrink-0 text-ink-soft transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
      </button>

      {expanded && (
        <div className="border-t border-line p-3">
          <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[10px] text-ink-soft">
            <span>Exam weight {row.examWeight}/5</span>
            <span aria-hidden>·</span>
            <span>{row.attempts > 0 ? `${row.attempts} attempts` : 'no attempts yet'}</span>
            {row.accuracy != null && <><span aria-hidden>·</span><span>{Math.round(row.accuracy)}% correct</span></>}
            {row.openMistakes > 0 && <><span aria-hidden>·</span><span className="font-medium text-sev-crit">{row.openMistakes} open mistake{row.openMistakes === 1 ? '' : 's'}</span></>}
            {row.prereqGap && <><span aria-hidden>·</span><span className="font-medium text-sev-warn">prerequisite gap upstream</span></>}
          </div>
          <EvidenceList signals={row.signals} className="mb-3" />
          <div className="flex flex-wrap gap-2">
            <ActionButton action={{ label: 'Open topic hub', view: 'hub', topicId: row.topicId, conceptId: row.conceptId }} />
            <ActionButton action={{ label: 'Practice', view: 'questions', conceptId: row.conceptId, topicId: row.topicId }} />
            <ActionButton action={{ label: 'Revise', view: 'revision', conceptId: row.conceptId }} />
          </div>
        </div>
      )}
    </div>
  )
}
