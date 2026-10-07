'use client'

// ─── CLINICAL CASE SIMULATOR · LIBRARY DASHBOARD (PRODUCT 09) ───
// Everything measured from SimCaseAttempt rows by the deterministic engine:
// hero stats, resume banner, difficulty ladder, specialty grid, case cards,
// weak areas, repeated errors, the recommended next case and recent runs.

import { useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Activity, Award, Bot, CheckCircle2, Clock3, Compass, Image as ImageIcon, Play,
  RotateCcw, Stethoscope, Target, Timer, TrendingUp, XCircle, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAppStore } from '@/lib/store'
import {
  SIM_DIFFICULTY_META, SIM_SPECIALTIES,
} from '@/lib/types'
import type { SimCaseSummary, SimDifficulty, SimHome } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SpotlightCard } from '@/components/primitives/aura'
import { Stagger, StaggerItem, ScrollReveal } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import { DIFF_TONE, MicroLabel, Reveal, AnimatedNumber, relTime, SCROLL_SLIM } from './sim-shared'

interface Props {
  home: SimHome
  onOpenCase: (caseId: string) => void
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function StatChip({ icon: Icon, value, label, accent }: { icon: LucideIcon; value: string; label: string; accent?: boolean }) {
  return (
    <div className="clay flex min-h-16 min-w-0 flex-1 basis-40 items-center gap-3 rounded-2xl px-4 py-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', accent ? 'bg-primary/12 text-primary' : 'bg-surface-2 text-ink-soft')}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold tabular-nums leading-tight">{value}</span>
        <span className="block truncate text-[11px] font-medium text-ink-soft">{label}</span>
      </span>
    </div>
  )
}

function CaseCard({ c, onOpen }: { c: SimCaseSummary; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(c.id)}
      className="clay clay-hover flex w-full min-w-0 flex-col gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open case: ${c.title} — ${c.specialty}, ${SIM_DIFFICULTY_META[c.difficulty].label}, about ${c.minutes} minutes`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[15px] font-semibold leading-snug tracking-tight">{c.title}</h3>
        <Badge variant="outline" className={cn('shrink-0 border text-[10px] font-bold uppercase tracking-wider', DIFF_TONE[c.difficulty])}>
          {SIM_DIFFICULTY_META[c.difficulty].label}
        </Badge>
      </div>

      <p className="text-xs font-medium text-ink-soft">
        {c.specialty}
        {c.system ? ` · ${c.system}` : ''}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
          <Clock3 className="size-3" aria-hidden /> {c.minutes} min
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
          <Stethoscope className="size-3" aria-hidden /> {c.stageCount} stages
        </span>
        {c.imageKey && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            <ImageIcon className="size-3" aria-hidden /> Image
          </span>
        )}
        {c.aiReady && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Bot className="size-3" aria-hidden /> AI patient
          </span>
        )}
      </div>

      <div className="mt-auto border-t border-line/70 pt-2.5">
        {c.attempted ? (
          <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-soft">
            {c.diagnosisCorrect === true ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-sev-ok" aria-label="diagnosis correct" />
            ) : c.diagnosisCorrect === false ? (
              <XCircle className="size-3.5 shrink-0 text-sev-crit" aria-label="diagnosis missed" />
            ) : null}
            <span className="truncate">
              {c.diagnosisCorrect === true ? 'Diagnosis made' : c.diagnosisCorrect === false ? 'Diagnosis missed' : 'Attempted'}
              {' · '}
              {c.bestScore != null ? `best ${Math.round(c.bestScore)}` : `last ${Math.round(c.lastScore ?? 0)}`}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Play className="size-3.5" aria-hidden /> Not attempted yet
          </span>
        )}
      </div>
    </button>
  )
}

/** Honest one-liner for the recommended tier — derived from measured accuracy. */
function recommendedWhy(home: SimHome): string {
  const acc = home.stats.diagnosticAccuracy
  const completed = home.stats.completed
  if (acc == null || completed === 0) {
    return 'No runs measured yet — ward level is the honest place to start.'
  }
  if (acc >= 70) return `${acc}% diagnostic accuracy over ${completed} completed ${completed === 1 ? 'run' : 'runs'} — the next rung is open.`
  if (acc >= 50) return `${acc}% diagnostic accuracy — consolidate this tier before stepping up.`
  return `${acc}% diagnostic accuracy — step down, rebuild the pattern, come back.`
}

// ─── Home screen ──────────────────────────────────────────────────────────────

export function SimHomeScreen({ home, onOpenCase }: Props) {
  const reduce = useReducedMotion()
  const setView = useAppStore((s) => s.setView)

  const [diffFilter, setDiffFilter] = useState<SimDifficulty | null>(null)
  const [specFilter, setSpecFilter] = useState<string | null>(null)

  // Specialty chips: canonical SIM_SPECIALTIES first, then any extra labels
  // present in the library (e.g. legacy 'Endocrinology' imports).
  const specialties = useMemo(() => {
    const byName = new Map(home.specialties.map((s) => [s.name, s]))
    const canonical = SIM_SPECIALTIES.filter((n) => byName.has(n)).map((n) => byName.get(n)!)
    const extras = home.specialties.filter((s) => !(SIM_SPECIALTIES as readonly string[]).includes(s.name))
    return [...canonical, ...extras]
  }, [home.specialties])

  const filteredCases = useMemo(
    () => home.cases.filter(
      (c) => (!diffFilter || c.difficulty === diffFilter) && (!specFilter || c.specialty === specFilter),
    ),
    [home.cases, diffFilter, specFilter],
  )

  const stats = home.stats
  const recommendedDiff = home.recommendedDifficulty

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* ── Hero — the porcelain podium ── */}
      <Reveal index={0}>
        <div className="podium relative overflow-hidden rounded-3xl p-5 md:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full bg-[#f3d5a4]/35 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -left-14 -bottom-8 size-48 rounded-full bg-[#c9e8d4]/30 blur-3xl" aria-hidden />
          <div className="relative min-w-0 space-y-2">
            <MicroLabel className="text-primary">Product 09 · Clinical reasoning</MicroLabel>
            <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Clinical Case Simulator</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
              Learn the concept → encounter the patient → reason through the case → decide what to do.
            </p>
          </div>
        </div>
      </Reveal>

      {/* ── Resume banner ── */}
      {home.resume && (
        <Reveal index={1}>
          <SpotlightCard className="warm-card clay-hover w-full overflow-visible rounded-2xl">
            <button
              type="button"
              onClick={() => onOpenCase(home.resume!.caseId)}
              className="flex w-full min-w-0 items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Resume case ${home.resume.caseTitle} at saved stage`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sev-warn/15 text-sev-warn">
                <RotateCcw className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-sev-warn">
                  Case in progress
                </span>
                <span className="block truncate text-sm font-semibold">
                  Picks up at “{home.resume.caseTitle}”
                </span>
                <span className="block text-xs text-ink-soft">
                  {home.resume.mode === 'ai' ? 'AI patient mode' : 'Guided mode'} · stage{' '}
                  {Math.max(1, home.resume.stageIndex + 1)}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary sm:flex">
                Continue <Play className="size-3.5" aria-hidden />
              </span>
            </button>
          </SpotlightCard>
        </Reveal>
      )}

      {/* ── Measured stat chips ── */}
      <Reveal index={2} className="flex flex-wrap gap-2.5">
        <StatChip icon={Stethoscope} value={String(stats.completed)} label={`cases completed · ${stats.attempted} attempted`} accent />
        <StatChip icon={Target} value={stats.diagnosticAccuracy != null ? `${Math.round(stats.diagnosticAccuracy)}%` : '—'} label="diagnostic accuracy" />
        <StatChip icon={Award} value={stats.avgScore != null ? String(Math.round(stats.avgScore)) : '—'} label="average score" />
        <StatChip icon={Timer} value={String(Math.round(stats.minutesPractised))} label="minutes practised" />
      </Reveal>

      {/* ── Difficulty ladder (filters + recommended tier) ── */}
      <Reveal index={3} className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MicroLabel>Difficulty ladder</MicroLabel>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Zap className="size-3" aria-hidden />
            Recommended for you: {SIM_DIFFICULTY_META[recommendedDiff].label}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-ink-soft">{recommendedWhy(home)}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter cases by difficulty">
          {(Object.keys(SIM_DIFFICULTY_META) as SimDifficulty[]).map((d) => {
            const active = diffFilter === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDiffFilter(active ? null : d)}
                aria-pressed={active}
                className={cn(
                  'min-h-11 rounded-2xl border px-4 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? cn('clay-in font-semibold', DIFF_TONE[d])
                    : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40 hover:text-foreground',
                )}
              >
                <span className="block text-sm font-semibold">{SIM_DIFFICULTY_META[d].label}</span>
                <span className="block text-[11px] leading-snug">{SIM_DIFFICULTY_META[d].blurb}</span>
              </button>
            )
          })}
        </div>
      </Reveal>

      {/* ── Specialty grid ── */}
      {specialties.length > 0 && (
        <Reveal index={4} className="space-y-2.5">
          <MicroLabel>Specialties</MicroLabel>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter cases by specialty">
            <button
              type="button"
              onClick={() => setSpecFilter(null)}
              aria-pressed={specFilter === null}
              className={cn(
                'min-h-11 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                specFilter === null
                  ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                  : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
              )}
            >
              All · {home.cases.length}
            </button>
            {specialties.map((s) => {
              const active = specFilter === s.name
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setSpecFilter(active ? null : s.name)}
                  aria-pressed={active}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                      : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
                  )}
                >
                  {s.name} · {s.count}
                  {s.accuracy != null && (
                    <span className={cn('ml-1.5 tabular-nums', s.accuracy >= 70 ? 'text-sev-ok' : 'text-sev-warn')}>
                      {Math.round(s.accuracy <= 1 ? s.accuracy * 100 : s.accuracy)}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Reveal>
      )}

      {/* ── Case cards grid ── */}
      <section aria-label="Case library" className="space-y-3">
        {home.cases.length === 0 ? (
          <Reveal index={5}>
            <div className="clay flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-primary/10 shadow-well">
                <Compass className="size-7 text-primary" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold tracking-tight">The library is empty for now</h2>
              <p className="max-w-sm text-sm text-ink-soft">
                Curated cases land here as the library grows. Meanwhile, the Adaptive Engine and the Topic Hub
                already carry the concepts these cases will test.
              </p>
              <Button variant="outline" className="min-h-11" onClick={() => setView('adaptive')}>
                Practice MCQs instead
              </Button>
            </div>
          </Reveal>
        ) : filteredCases.length === 0 ? (
          <Reveal index={5}>
            <div className="clay flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
              <p className="text-sm font-medium">No cases match these filters.</p>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => { setDiffFilter(null); setSpecFilter(null) }}
              >
                Clear filters
              </Button>
            </div>
          </Reveal>
        ) : (
          <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredCases.map((c) => (
              <StaggerItem key={c.id}>
                <CaseCard c={c} onOpen={onOpenCase} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {/* ── Weak areas ── */}
      {home.weakAreas.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel className="text-sev-warn">Weak areas — below 70% measured</MicroLabel>
          <div className="clay space-y-3.5 rounded-2xl p-4 md:p-5">
            {home.weakAreas.map((w, i) => {
              const pct = w.accuracy != null ? Math.round(w.accuracy <= 1 ? w.accuracy * 100 : w.accuracy) : null
              return (
                <div key={`${w.label}-${i}`} className="min-w-0">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">{w.label}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-sev-warn">
                      {pct != null ? `${pct}%` : '—'}
                    </span>
                  </div>
                  <Progress value={pct ?? 0} aria-label={`${w.label} accuracy ${pct ?? 'unknown'} percent`} className="h-1.5" />
                  <p className="mt-1 truncate text-[11px] text-ink-soft">{w.detail}</p>
                </div>
              )
            })}
          </div>
        </ScrollReveal>
      )}

      {/* ── Repeated errors ── */}
      {home.repeatedErrors.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel className="text-sev-crit">Repeated misses — same decision, several runs</MicroLabel>
          <div className="clay divide-y divide-line/70 rounded-2xl p-2 md:p-3">
            {home.repeatedErrors.map((e, i) => (
              <div key={i} className="flex min-w-0 items-start gap-3 p-2.5 md:p-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sev-crit/10 text-sev-crit">
                  <XCircle className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">
                    Missed “{e.label}” in {e.count} {e.count === 1 ? 'case' : 'cases'}
                  </p>
                  <p className="truncate text-xs text-ink-soft">last: {e.lastCaseTitle}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      )}

      {/* ── Recommended next case ── */}
      {home.recommended && (
        <ScrollReveal>
          <section className="clay space-y-3 rounded-2xl border-primary/25 p-4 md:p-5" aria-label="Recommended next case">
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              <MicroLabel className="text-primary">Recommended next case</MicroLabel>
            </div>
            <p className="text-lg font-semibold leading-snug tracking-tight">{home.recommended.title}</p>
            <p className="text-sm leading-relaxed text-ink-soft">{home.recommended.reason}</p>
            <Button className="clay-btn min-h-12 w-full sm:w-auto" onClick={() => onOpenCase(home.recommended!.caseId)}>
              <Play className="size-4" /> Begin this case
            </Button>
          </section>
        </ScrollReveal>
      )}

      {/* ── Recent runs ── */}
      {home.recent.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel>Recent runs</MicroLabel>
          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)}>
            {home.recent.map((r, i) => (
              <button
                key={`${r.caseId}-${i}`}
                type="button"
                onClick={() => onOpenCase(r.caseId)}
                className="clay clay-hover flex w-56 shrink-0 flex-col gap-1 rounded-2xl p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Reopen ${r.title} — score ${Math.round(r.score)}, ${r.diagnosisCorrect ? 'diagnosis made' : 'diagnosis missed'}`}
              >
                <span className="flex items-center gap-1.5">
                  {r.diagnosisCorrect ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-sev-ok" aria-hidden />
                  ) : (
                    <XCircle className="size-3.5 shrink-0 text-sev-crit" aria-hidden />
                  )}
                  <span className="text-xs font-bold tabular-nums">{Math.round(r.score)}</span>
                  {r.mode === 'ai' && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                      <Bot className="size-2.5" aria-hidden /> AI
                    </span>
                  )}
                </span>
                <span className="truncate text-sm font-medium">{r.title}</span>
                <span className="truncate text-[11px] text-ink-soft">{r.specialty} · {relTime(r.at)}</span>
              </button>
            ))}
          </div>
        </ScrollReveal>
      )}

      {/* Measured-data footnote (only when the profile has no runs yet) */}
      {stats.attempted === 0 && (
        <ScrollReveal>
          <p className="rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            Scores, accuracy and the recommended ladder appear here as measured values once you complete your
            first case — nothing is estimated or assumed.
            {!reduce && <Activity className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />}
          </p>
        </ScrollReveal>
      )}
    </div>
  )
}
