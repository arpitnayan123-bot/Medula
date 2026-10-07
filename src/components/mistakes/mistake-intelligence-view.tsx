'use client'

// ─── MISTAKE INTELLIGENCE · ROOT (PRODUCT 05) ───
// «Things I must stop getting wrong.» State machine: genome home → review
// list → mistake detail (with the Understand → Similar → Harder → Revision →
// Retest follow-up chain). Every number shown is measured from this profile's
// attempt feed, knowledge states and error tags — nothing estimated.

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, Bandage, BookOpen, ChevronLeft, ChevronRight, Compass,
  FlaskConical, Gauge, HeartCrack, Layers, RefreshCcw, Repeat2,
  ScanSearch, Sparkles, Target, Timer, TrendingUp, Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { MISTAKE_MODES } from '@/lib/types'
import type {
  MistakeDetailPayload, MistakeGenomePayload, MistakeListPayload,
  MistakeMode, MistakePatternCard, MistakeRow,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { NoiseVeil } from '@/components/primitives/aura'
import { Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import { MistakeDetail } from './mistake-detail'

type Phase = 'home' | 'review' | 'detail'
type LoadState = 'loading' | 'ready' | 'error'

const MODE_ICONS: Record<MistakeMode, typeof Target> = {
  today: Timer,
  repeated: Repeat2,
  impact: TrendingUp,
  unresolved: HeartCrack,
  forgotten: Gauge,
  exam: ScanSearch,
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function MistakeIntelligenceView() {
  const [phase, setPhase] = useState<Phase>('home')
  const [genome, setGenome] = useState<MistakeGenomePayload | null>(null)
  const [genomeState, setGenomeState] = useState<LoadState>('loading')

  const [mode, setMode] = useState<MistakeMode>('unresolved')
  const [subject, setSubject] = useState('all')
  const [errorType, setErrorType] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [list, setList] = useState<MistakeListPayload | null>(null)
  const [listState, setListState] = useState<LoadState>('loading')

  const [detail, setDetail] = useState<MistakeDetailPayload | null>(null)
  const [detailState, setDetailState] = useState<LoadState>('loading')

  const loadGenome = useCallback(() => {
    setGenomeState('loading')
    api.mistakeHome()
      .then((g) => { setGenome(g); setGenomeState('ready') })
      .catch(() => setGenomeState('error'))
  }, [])

  const loadList = useCallback((m: MistakeMode, s: string, t: string, d: string) => {
    setListState('loading')
    api.mistakeList({
      mode: m,
      subject: s === 'all' ? undefined : s,
      type: t === 'all' ? undefined : t,
      difficulty: d === 'all' ? undefined : d,
    })
      .then((l) => { setList(l); setListState('ready') })
      .catch(() => setListState('error'))
  }, [])

  // Initial genome load — state starts at 'loading', so the effect only fires
  // the async fetch (setState happens in the promise callbacks, not inline).
  useEffect(() => {
    let alive = true
    api.mistakeHome()
      .then((g) => { if (alive) { setGenome(g); setGenomeState('ready') } })
      .catch(() => { if (alive) setGenomeState('error') })
    return () => { alive = false }
  }, [])

  const openReview = (m: MistakeMode) => {
    setSubject('all')
    setErrorType('all')
    setDifficulty('all')
    setPhase('review')
    loadList(m, 'all', 'all', 'all')
    setMode(m)
  }

  // Resolve-and-apply: fetch with the NEW filter values (no stale closures).
  const applyFilters = useCallback((m: MistakeMode, s: string, t: string, d: string) => {
    setMode(m)
    setSubject(s)
    setErrorType(t)
    setDifficulty(d)
    loadList(m, s, t, d)
  }, [loadList])

  const refetchAfterChange = useCallback(() => {
    loadGenome()
    // keep an open detail in sync (e.g. after a retest resolved the mistake)
    if (detail) {
      api.mistakeDetail(detail.record.recordId).then((d) => { setDetail(d); setDetailState('ready') }).catch(() => {})
    }
  }, [loadGenome, detail])

  const openDetail = (recordId: string) => {
    setPhase('detail')
    setDetailState('loading')
    setDetail(null)
    api.mistakeDetail(recordId)
      .then((d) => { setDetail(d); setDetailState('ready') })
      .catch(() => setDetailState('error'))
  }

  // ── pattern actions ──
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)
  const setView = useAppStore((s) => s.setView)
  const patternAction = (p: MistakePatternCard) => {
    if (p.action.kind === 'drill' && p.action.mode) {
      setAdaptivePreset({ mode: p.action.mode, conceptId: p.action.conceptId, subjectCode: p.action.subjectCode, count: p.action.conceptId ? 6 : 12, autoStart: true })
      setView('adaptive')
    } else if (p.action.kind === 'compare' && p.action.pairId) {
      setAdaptivePreset({ mode: 'weakness', conceptId: p.action.conceptId, count: 6, autoStart: true })
      setView('adaptive')
    } else if (p.action.kind === 'slow' && p.action.subjectCode) {
      setAdaptivePreset({ mode: 'custom', subjectCode: p.action.subjectCode, count: 10, autoStart: true })
      setView('adaptive')
    } else if (p.action.kind === 'retest') {
      openReview('repeated')
    }
  }

  return (
    <div className="min-h-[60vh]">
      {phase === 'home' && (
        <MistakeHome
          genome={genome}
          status={genomeState}
          onRetry={loadGenome}
          onOpenReview={openReview}
          onOpenDetail={openDetail}
          onPatternAction={patternAction}
        />
      )}
      {phase === 'review' && (
        <MistakeReview
          mode={mode}
          subject={subject}
          errorType={errorType}
          difficulty={difficulty}
          list={list}
          status={listState}
          facets={genome?.filters}
          onApply={applyFilters}
          onOpenDetail={openDetail}
          onBack={() => { setPhase('home'); refetchAfterChange() }}
        />
      )}
      {phase === 'detail' && (
        <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
          <button
            type="button"
            onClick={() => { setPhase(list ? 'review' : 'home'); refetchAfterChange() }}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Back to {list ? MISTAKE_MODES.find((m) => m.id === mode)?.label.toLowerCase() : 'genome'}
          </button>
          {detailState === 'loading' && (
            <div className="space-y-3" aria-label="Loading mistake">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {detailState === 'error' && (
            <p className="flex items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-sm font-medium text-sev-crit" role="alert">
              <AlertTriangle className="size-4" /> Couldn&apos;t load this mistake — go back and try again.
            </p>
          )}
          {detailState === 'ready' && detail && (
            <MistakeDetail
              detail={detail}
              onChanged={refetchAfterChange}
              onBackToList={() => { setPhase(list ? 'review' : 'home'); loadList(mode, subject, errorType, difficulty) }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── GENOME HOME ─────────────────────────────────────────────────────────────
function MistakeHome(props: {
  genome: MistakeGenomePayload | null
  status: LoadState
  onRetry: () => void
  onOpenReview: (m: MistakeMode) => void
  onOpenDetail: (recordId: string) => void
  onPatternAction: (p: MistakePatternCard) => void
}) {
  const { genome, status, onRetry, onOpenReview, onOpenDetail, onPatternAction } = props

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* Hero */}
      <header className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10">
            <Bandage className="size-5 text-primary" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">MISTAKE INTELLIGENCE</h1>
        </div>
        <p className="text-lg font-medium leading-snug tracking-tight md:text-xl">
          Things I must <span className="text-primary">stop getting wrong.</span>
        </p>
        <p className="text-sm text-ink-soft">
          Every wrong answer from practice, mocks, PYQs and adaptive runs lands here — classified, prioritized and turned into a next step. Not a wall of shame; a repair list.
        </p>
      </header>

      {status === 'loading' && (
        <div className="space-y-3" aria-label="Loading mistake genome">
          <div className="flex gap-3">
            <Skeleton className="h-20 flex-1" />
            <Skeleton className="h-20 flex-1" />
            <Skeleton className="h-20 flex-1" />
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-sm font-medium text-sev-crit" role="alert">
            <AlertTriangle className="size-4" /> Couldn&apos;t load your mistake genome.
          </p>
          <Button variant="outline" onClick={onRetry} className="min-h-11 gap-2">
            <RefreshCcw className="size-4" /> Try again
          </Button>
        </div>
      )}

      {status === 'ready' && genome && (
        <>
          {/* Genome strip */}
          <section
            aria-label="Mistake genome totals"
            className="relative rounded-2xl"
          >
            <NoiseVeil />
            <Stagger className="relative z-10 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StaggerItem><Stat value={genome.totals.open} label="open mistakes" tone="crit" /></StaggerItem>
              <StaggerItem><Stat value={genome.totals.repeated} label="missed 2×+" tone="warn" /></StaggerItem>
              <StaggerItem><Stat value={genome.totals.todayCount} label="made today" tone="warn" /></StaggerItem>
              <StaggerItem><Stat value={genome.totals.resolvedThisWeek} label="fixed this week" tone="ok" /></StaggerItem>
              <StaggerItem><Stat value={`${genome.totals.mistakeRate}%`} label="wrong-answer rate" tone="plain" /></StaggerItem>
            </Stagger>
          </section>

          {genome.insufficientData && (
            <p className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm text-ink-soft" role="status">
              Not enough answered questions yet for a genome — answer a run in the Adaptive Engine and this page fills itself in.
            </p>
          )}

          {/* DO NEXT */}
          {genome.doNext && (
            <section aria-label="Highest priority mistake">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-soft">Do next — highest priority</h2>
              <button
                type="button"
                onClick={() => onOpenDetail(genome.doNext!.recordId)}
                className="clay-hover w-full rounded-2xl border border-sev-crit/30 bg-sev-crit/5 p-4 text-left transition-all hover:border-sev-crit/60 md:p-5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className="border-sev-crit/40 bg-sev-crit/10 text-sev-crit">{genome.doNext.priority} priority</Badge>
                  {genome.doNext.pyqPattern && <Badge variant="outline" className="border-line text-ink-soft">PYQ-pattern</Badge>}
                  {genome.doNext.wrongCount >= 2 && (
                    <Badge variant="outline" className="border-sev-warn/40 text-sev-warn">missed {genome.doNext.wrongCount}×</Badge>
                  )}
                  <span className="ml-auto text-xs text-ink-soft">{genome.doNext.subjectName} · D{genome.doNext.difficulty}</span>
                </div>
                <p className="line-clamp-2 text-sm font-medium leading-snug md:text-base">{genome.doNext.stem}</p>
                <p className="mt-2 text-xs text-ink-soft">
                  You picked <span className="font-medium text-ink">{genome.doNext.lastSelectedText}</span> — correct: <span className="font-medium text-sev-ok">{genome.doNext.answerText}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {genome.doNext.factors.filter((f) => f.points > 0).slice(0, 4).map((f) => (
                    <span key={f.id} className="rounded-full bg-surface-2/80 px-2.5 py-1 text-[11px] text-ink-soft">
                      {f.label}: {f.note}
                    </span>
                  ))}
                </div>
              </button>
            </section>
          )}

          {/* Patterns */}
          {genome.patterns.length > 0 && (
            <section aria-label="Detected patterns">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-soft">Patterns the engine sees</h2>
              <div className="space-y-2.5">
                {genome.patterns.map((p) => (
                  <PatternCardShell key={p.id} pattern={p} onAction={onPatternAction} onOpenReview={onOpenReview} />
                ))}
              </div>
            </section>
          )}

          {/* Review modes */}
          <section aria-label="Review modes">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-soft">Review</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MISTAKE_MODES.map((m) => {
                const Icon = MODE_ICONS[m.id]
                const count = genome.counts[m.id]
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpenReview(m.id)}
                    className="clay clay-hover group flex min-h-11 flex-col gap-1 rounded-xl border border-line p-3 text-left transition-colors hover:border-primary/50"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-primary" />
                      <span className="text-sm font-semibold">{m.label}</span>
                      <span className="ml-auto text-xs text-ink-soft group-hover:text-primary">{count}</span>
                    </span>
                    <span className="text-[11px] leading-snug text-ink-soft">{m.blurb}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <p className="text-center text-[11px] text-ink-soft">
            Captured automatically from MCQs · mocks · PYQ-pattern · adaptive runs · tutor quizzes — one shared attempt feed.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone: 'crit' | 'warn' | 'ok' | 'plain' }) {
  const color =
    tone === 'crit' ? 'text-sev-crit' : tone === 'warn' ? 'text-sev-warn' : tone === 'ok' ? 'text-sev-ok' : 'text-foreground'
  return (
    <div className="clay-in rounded-xl px-3 py-2.5">
      <p className={cn('text-xl font-bold leading-none md:text-2xl', color)}>{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-ink-soft">{label}</p>
    </div>
  )
}

const PATTERN_ICONS: Record<MistakePatternCard['kind'], typeof Compass> = {
  confusion: Layers,
  concept: Target,
  paradox: Compass,
  speed: Zap,
  confidence: Sparkles,
  difficulty: FlaskConical,
}

function PatternCardShell({ pattern: p, onAction, onOpenReview }: {
  pattern: MistakePatternCard
  onAction: (p: MistakePatternCard) => void
  onOpenReview: (m: MistakeMode) => void
}) {
  const Icon = PATTERN_ICONS[p.kind]
  return (
    <div className="clay rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{p.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{p.detail}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {p.evidence.map((e) => (
              <span key={e.label} className="rounded-full bg-surface-2/80 px-2.5 py-1 text-[11px] text-ink-soft">
                {e.label}: <span className="font-semibold text-ink">{e.value}</span>
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="min-h-9 gap-1.5" onClick={() => onAction(p)}>
              <ChevronRight className="size-3.5" /> {p.action.label}
            </Button>
            {(p.kind === 'speed' || p.kind === 'confidence') && (
              <Button size="sm" variant="outline" className="min-h-9" onClick={() => onOpenReview('repeated')}>
                Review repeats
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── REVIEW LIST ─────────────────────────────────────────────────────────────
function MistakeReview(props: {
  mode: MistakeMode
  subject: string
  errorType: string
  difficulty: string
  list: MistakeListPayload | null
  status: LoadState
  facets?: MistakeGenomePayload['filters']
  onApply: (m: MistakeMode, s: string, t: string, d: string) => void
  onOpenDetail: (recordId: string) => void
  onBack: () => void
}) {
  const { mode, subject, errorType, difficulty, list, status, facets, onApply, onOpenDetail, onBack } = props

  const change = (key: 'mode' | 'subject' | 'errorType' | 'difficulty', value: string) => {
    onApply(
      key === 'mode' ? (value as MistakeMode) : mode,
      key === 'subject' ? value : subject,
      key === 'errorType' ? value : errorType,
      key === 'difficulty' ? value : difficulty,
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Genome
        </button>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{MISTAKE_MODES.find((m) => m.id === mode)?.label}</h1>
        <p className="text-sm text-ink-soft">{MISTAKE_MODES.find((m) => m.id === mode)?.blurb}</p>
      </header>

      {/* Mode tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Review modes">
        {MISTAKE_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => change('mode', m.id)}
            className={cn(
              'min-h-9 shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              mode === m.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/50 hover:text-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={subject} onValueChange={(v) => change('subject', v)}>
          <SelectTrigger className="min-h-11 w-full" aria-label="Filter by subject">
            <SelectValue placeholder="All subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {facets?.subjects.map((s) => (
              <SelectItem key={s.code} value={s.code}>{s.name} ({s.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={errorType} onValueChange={(v) => change('errorType', v)}>
          <SelectTrigger className="min-h-11 w-full" aria-label="Filter by mistake type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {facets?.types.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.label} ({t.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={(v) => change('difficulty', v)}>
          <SelectTrigger className="min-h-11 w-full" aria-label="Filter by difficulty">
            <SelectValue placeholder="Any difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any difficulty</SelectItem>
            {facets?.difficulties.map((d) => (
              <SelectItem key={d.level} value={String(d.level)}>Level {d.level} ({d.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status === 'loading' && (
        <div className="space-y-2" aria-label="Loading mistakes">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {status === 'error' && (
        <p className="flex items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-sm font-medium text-sev-crit" role="alert">
          <AlertTriangle className="size-4" /> Couldn&apos;t load the list.
        </p>
      )}
      {status === 'ready' && list && list.rows.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface-2/40 px-4 py-10 text-center" role="status">
          <BookOpen className="mx-auto mb-2 size-6 text-sev-ok" />
          <p className="text-sm font-medium">Nothing here right now.</p>
          <p className="mt-1 text-xs text-ink-soft">
            {mode === 'today' ? 'No new mistakes in the last 24 hours — nice.' : 'This view clears itself as you resolve mistakes.'}
          </p>
        </div>
      )}
      {status === 'ready' && list && list.rows.length > 0 && (
        <>
          <p className="text-xs text-ink-soft" role="status">{list.total} mistake{list.total === 1 ? '' : 's'} · sorted by {mode === 'repeated' ? 'repetitions' : mode === 'today' ? 'recency' : 'priority'}</p>
          <Stagger>
            <ul className="space-y-2.5">
              {list.rows.map((r) => (
                <li key={r.recordId}>
                  <StaggerItem>
                    <MistakeRowCard row={r} onOpen={() => onOpenDetail(r.recordId)} />
                  </StaggerItem>
                </li>
              ))}
            </ul>
          </Stagger>
        </>
      )}
    </div>
  )
}

function MistakeRowCard({ row, onOpen }: { row: MistakeRow; onOpen: () => void }) {
  const statusTone =
    row.status === 'resolved' ? 'text-sev-ok border-sev-ok/40'
      : row.status === 'retested' ? 'text-sev-warn border-sev-warn/40'
        : row.status === 'revising' ? 'text-primary border-primary/40'
          : 'text-ink-soft border-line'
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full rounded-2xl border bg-surface-2/30 p-4 text-left transition-colors hover:border-primary/50',
        row.status === 'resolved' ? 'border-sev-ok/25 opacity-75' : 'border-line',
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {row.wrongCount >= 2 && (
          <span className="rounded-full bg-sev-crit/10 px-2 py-0.5 text-[11px] font-bold text-sev-crit">×{row.wrongCount}</span>
        )}
        {row.pyqPattern && <span className="rounded-full bg-surface-2/80 px-2 py-0.5 text-[11px] text-ink-soft">PYQ-pattern</span>}
        {row.flags.includes('fast-miss') && <span className="rounded-full bg-surface-2/80 px-2 py-0.5 text-[11px] text-ink-soft">fast miss</span>}
        {row.flags.includes('overconfident') && <span className="rounded-full bg-surface-2/80 px-2 py-0.5 text-[11px] text-ink-soft">was sure</span>}
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', statusTone)}>{row.status}</span>
        {row.revisionPending && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">revision due</span>}
        <span className="ml-auto text-[11px] text-ink-soft">{row.subjectName} · D{row.difficulty} · {relTime(row.lastWrongAt)}</span>
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug">{row.stem}</p>
      <p className="mt-1.5 line-clamp-1 text-xs text-ink-soft">
        You: <span className="text-ink">{row.lastSelectedText}</span> · Correct: <span className="text-sev-ok">{row.answerText}</span>
      </p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
        <span className="font-semibold text-ink">{row.priority}</span> priority
        {row.errorLabel && <> · <span className="italic">{row.errorLabel}</span></>}
        {row.conceptName && <> · {row.conceptName}</>}
      </div>
    </button>
  )
}
