'use client'

// ─── THE LEGACY BOARD — 00 · Legacy ─────────────────────────────────────────
// The flex surface: everything this doctor has measured since the day they
// joined — presented like a LeetCode/GitHub profile, but honest: every number
// is counted from real ledgers (questions, flashcards, revisions, mocks,
// cases, mistakes repaired, sessions studied), the contribution calendar is
// the study heatmap, and the badge wall only shows what was actually earned.
// Data: /api/gamify/home + /api/gamify/achievements + /api/progress — all
// pre-existing measured endpoints; nothing here is estimated or invented.

import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  Bandage,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  Flame,
  GraduationCap,
  Layers,
  Sparkles,
  Stethoscope,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '@/lib/api'
import type { GamifyAchievementsPayload, GamifyHomePayload, ProgressPayload } from '@/lib/types'
import { Stagger, ScrollReveal, Pop, SpringNumber, SpringBar, LiveDot, StaggerItem } from '@/components/primitives/motion'
import { BorderBeam, NoiseVeil, TextShimmer } from '@/components/primitives/aura'
import { SubjectGlyph } from '@/components/primitives/kit'
import { GAMIFY_ICON_MAP } from '@/components/gamify/gamify-shared'
import { cn } from '@/lib/utils'

// ── Small presentational atoms ───────────────────────────────────────────────

function LegacyWell({
  icon: Icon,
  value,
  label,
  tone = 'text-primary',
}: {
  icon: LucideIcon
  value: number
  label: string
  tone?: string
}) {
  return (
    <div className='clay-in flex flex-col items-center gap-1 rounded-xl px-3 py-3.5 text-center'>
      <Icon className={cn('size-4', tone)} aria-hidden />
      <span className='text-xl font-semibold tabular-nums text-foreground'>
        <SpringNumber value={value} />
      </span>
      <span className='text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft'>{label}</span>
    </div>
  )
}

function StreakRail({
  icon: Icon,
  label,
  days,
  state,
  note,
}: {
  icon: LucideIcon
  label: string
  days: number
  state: 'intact' | 'recovered' | 'open' | 'none'
  note: string
}) {
  const tone =
    state === 'intact' ? 'text-sev-ok' : state === 'recovered' ? 'text-gold' : state === 'open' ? 'text-sev-warn' : 'text-ink-soft'
  return (
    <div className='flex items-start gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3'>
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-background shadow-well', tone)}>
        <Icon className='size-4' aria-hidden />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='flex items-center gap-1.5 text-sm font-medium text-foreground'>
          {label}
          <span className={cn('tabular-nums', tone)}>
            {days} {days === 1 ? 'day' : 'days'}
          </span>
          {state === 'intact' && <LiveDot tone='bg-sev-ok' className='ml-0.5' />}
        </p>
        <p className='mt-0.5 line-clamp-1 text-[11px] leading-snug text-ink-soft' title={note}>
          {note}
        </p>
      </div>
    </div>
  )
}

function BadgeTile({ a, pop }: { a: GamifyAchievementsPayload['achievements'][number]; pop: boolean }) {
  const Icon = GAMIFY_ICON_MAP[a.icon] ?? Award
  const tile = (
    <div
      className={cn(
        'flex h-full flex-col items-center gap-1.5 rounded-xl border px-2.5 py-3 text-center transition-all clay-hover',
        a.unlocked ? 'border-gold/40 bg-gradient-to-b from-gold/10 to-transparent' : 'border-line bg-surface-2/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-8 place-items-center rounded-lg shadow-raised',
          a.unlocked ? 'bg-gold/15 text-gold' : 'bg-background text-ink-soft',
        )}
      >
        <Icon className='size-4' />
      </span>
      <p className={cn('text-[11px] font-semibold leading-tight', a.unlocked ? 'text-foreground' : 'text-ink-soft')}>
        {a.title}
      </p>
      {!a.unlocked && typeof a.progress === 'number' && (
        <SpringBar value={a.progress} className='h-1 w-full' barClassName='from-gold/70 to-gold' />
      )}
      <p className='text-[9.5px] leading-snug text-ink-soft'>{a.unlocked ? 'Earned' : (a.progressNote ?? 'Locked')}</p>
    </div>
  )
  return pop ? <Pop delay={0.25}>{tile}</Pop> : tile
}

// ── The contribution calendar (measured, warm-toned) ─────────────────────────

const CAL_TONES = ['bg-surface-2', 'bg-primary/15', 'bg-primary/35', 'bg-primary/60', 'bg-primary'] as const

type CalCell = { date: string; intensity: number }

type CalGrid = {
  weeks: (CalCell | null)[][]
  monthLabels: { col: number; label: string }[]
  activeDays: number
  totalMinutes: number
  totalQuestions: number
  longestChain: number
}

function ContributionCalendar({ heat }: { heat: ProgressPayload['heatmap'] }) {
  const { weeks, monthLabels, activeDays, totalMinutes, totalQuestions, longestChain } = useMemo<CalGrid>(() => {
    const cells: CalCell[] = heat.map((d) => ({ date: d.date, intensity: d.minutes + d.questions }))
    const firstCell = cells[0]
    if (!firstCell)
      return {
        weeks: [],
        monthLabels: [],
        activeDays: 0,
        totalMinutes: 0,
        totalQuestions: 0,
        longestChain: 0,
      }

    const first = new Date(`${firstCell.date}T00:00:00`)
    const pad = (first.getDay() + 6) % 7 // Monday-first
    const padded: (CalCell | null)[] = [...Array.from({ length: pad }, () => null), ...cells]
    while (padded.length % 7 !== 0) padded.push(null)

    const wk: (CalCell | null)[][] = []
    for (let i = 0; i < padded.length; i += 7) wk.push(padded.slice(i, i + 7))

    const labels: { col: number; label: string }[] = []
    let lastMonth = -1
    wk.forEach((week, ci) => {
      const fd = week.find(Boolean)
      if (!fd) return
      const d = new Date(`${fd.date}T00:00:00`)
      if (d.getDate() <= 7 && d.getMonth() !== lastMonth) {
        labels.push({ col: ci, label: d.toLocaleString('en-GB', { month: 'short' }) })
        lastMonth = d.getMonth()
      }
    })

    let active = 0
    let chain = 0
    let best = 0
    for (const c of cells) {
      if (c.intensity > 0) {
        active += 1
        chain += 1
        best = Math.max(best, chain)
      } else chain = 0
    }

    const totals = heat.reduce(
      (acc, d) => ({ minutes: acc.minutes + d.minutes, questions: acc.questions + d.questions }),
      { minutes: 0, questions: 0 },
    )

    return {
      weeks: wk,
      monthLabels: labels,
      activeDays: active,
      totalMinutes: totals.minutes,
      totalQuestions: totals.questions,
      longestChain: best,
    }
  }, [heat])

  const levelOf = useMemo(() => {
    const max = Math.max(30, ...heat.map((d) => d.minutes + d.questions))
    return (v: number) => (v <= 0 ? 0 : v / max < 0.25 ? 1 : v / max < 0.5 ? 2 : v / max < 0.75 ? 3 : 4)
  }, [heat])

  if (weeks.length === 0) {
    return (
      <div className='rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-6 text-center text-xs text-ink-soft'>
        The calendar fills as you study — sessions, questions and revision blocks all leave a mark here.
      </div>
    )
  }

  const hours = Math.round(totalMinutes / 60)

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <p className='text-sm text-ink-soft'>
          <span className='text-base font-semibold text-foreground'>
            <SpringNumber value={activeDays} />
          </span>{' '}
          active days ·{' '}
          <span className='text-base font-semibold text-foreground'>
            <SpringNumber value={longestChain} />
          </span>{' '}
          longest daily chain ·{' '}
          <span className='text-base font-semibold text-foreground'>
            <SpringNumber value={hours} />
          </span>{' '}
          hours measured
        </p>
        <p className='text-[11px] text-ink-soft'>last {weeks.length} weeks · every block is a real session</p>
      </div>

      <div className='overflow-x-auto pb-1'>
        <div className='inline-flex min-w-full flex-col gap-1'>
          {monthLabels.length > 0 && (
            <div className='flex gap-[3px] pl-7'>
              {weeks.map((_, ci) => {
                const label = monthLabels.find((m) => m.col === ci)
                return (
                  <span key={ci} className='w-[11px] text-[9px] font-medium uppercase tracking-wide text-ink-soft sm:w-[13px]'>
                    {label ? label.label : ''}
                  </span>
                )
              })}
            </div>
          )}
          <div className='flex gap-[2px] sm:gap-[3px]'>
            <div aria-hidden className='mr-1 flex flex-col gap-[2px] pt-px sm:gap-[3px]'>
              {['M', '', 'W', '', 'F', '', 'S'].map((d, ri) => (
                <span key={ri} className='h-[11px] text-[8.5px] leading-[11px] text-ink-soft sm:h-[13px] sm:leading-[13px]'>
                  {d}
                </span>
              ))}
            </div>
            {weeks.map((week, ci) => (
              <div key={ci} className='flex flex-col gap-[2px] sm:gap-[3px]'>
                {week.map((cell, ri) => (
                  <span
                    key={ri}
                    aria-hidden
                    title={cell ? new Date(`${cell.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : undefined}
                    className={cn(
                      'size-[11px] rounded-[3px] border border-black/[0.03] shadow-well sm:size-[13px] sm:rounded-[3.5px]',
                      CAL_TONES[cell ? levelOf(cell.intensity) : 0],
                      !cell && 'opacity-0',
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className='text-[11px] text-ink-soft'>
        {totalQuestions > 0 && (
          <>
            <SpringNumber value={totalQuestions} /> questions answered across this window.
          </>
        )}
      </p>
    </div>
  )
}

// ── The board ────────────────────────────────────────────────────────────────

export function LegacyBoard({ memberSince }: { memberSince: string }) {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [home, setHome] = useState<GamifyHomePayload | null>(null)
  const [achievements, setAchievements] = useState<GamifyAchievementsPayload | null>(null)
  const [progress, setProgress] = useState<ProgressPayload | null>(null)

  useEffect(() => {
    let ok = true
    Promise.all([api.gamifyHome(), api.gamifyAchievements(), api.progress()])
      .then(([h, a, p]) => {
        if (!ok) return
        setHome(h)
        setAchievements(a)
        setProgress(p)
        setState('ready')
      })
      .catch(() => {
        if (ok) setState('error')
      })
    return () => {
      ok = false
    }
  }, [])

  const since = useMemo(() => {
    const d = new Date(memberSince)
    if (Number.isNaN(d.getTime())) return null
    return {
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      days: Math.max(1, Math.floor((Date.now() - d.getTime()) / 86_400_000) + 1),
    }
  }, [memberSince])

  const topSubjects = useMemo(() => {
    if (!progress) return []
    return [...progress.subjects].sort((a, b) => b.mastery - a.mastery || b.conceptCount - a.conceptCount).slice(0, 8)
  }, [progress])

  const unlockedBadges = achievements?.achievements.filter((a) => a.unlocked) ?? []
  const lockedBadges = achievements?.achievements.filter((a) => !a.unlocked && typeof a.progress === 'number') ?? []

  return (
    <section
      id='pf-legacy'
      className='clay relative scroll-mt-20 overflow-hidden rounded-2xl p-5 md:p-6'
      aria-label='Legacy — everything measured since you joined'
    >
      <BorderBeam duration={12} size={230} />
      <NoiseVeil />

      {state === 'loading' && (
        <div className='relative z-10 space-y-3' aria-live='polite'>
          <div className='shimmer h-7 w-64 rounded-lg bg-surface-2' />
          <div className='shimmer h-4 w-40 rounded-lg bg-surface-2' />
          <div className='grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4'>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className='shimmer h-20 rounded-xl bg-surface-2' />
            ))}
          </div>
          <div className='shimmer h-28 rounded-xl bg-surface-2' />
          <p className='text-xs text-ink-soft'>Counting your ledgers…</p>
        </div>
      )}

      {state === 'error' && (
        <div className='relative z-10 rounded-xl border border-dashed border-line bg-surface-2/50 px-4 py-6 text-center'>
          <p className='text-sm font-medium text-foreground'>Your legacy numbers are resting.</p>
          <p className='mt-1 text-xs text-ink-soft'>
            The measured ledgers could not be reached — nothing is shown rather than stale or invented numbers. Refresh to try again.
          </p>
        </div>
      )}

      {state === 'ready' && home && since && (
        <div className='relative z-10 space-y-6'>
          {/* ── Hero band ── */}
          <header className='flex flex-wrap items-end justify-between gap-x-6 gap-y-3'>
            <div className='min-w-0'>
              <p className='flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft'>
                <Sparkles className='size-3 text-gold' aria-hidden />
                Legacy · measured since {since.label}
              </p>
              <h2 className='mt-1 font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl'>
                <TextShimmer>{home.level.tier}</TextShimmer> · Level{' '}
                <SpringNumber value={home.level.level} className='text-primary' />
              </h2>
              <p className='mt-0.5 text-sm text-ink-soft'>
                Day <SpringNumber value={since.days} className='font-semibold text-foreground' /> of studying here ·{' '}
                <SpringNumber value={home.level.xp} className='font-semibold text-foreground' /> XP measured,{' '}
                <SpringNumber value={home.achievements.unlocked} /> of {home.achievements.total} badges earned
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='clay-in inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground'>
                <Flame className='size-3.5 text-gold' aria-hidden />
                {home.streaks.learning.days}-day learning streak
              </span>
              <span className='clay-in inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground'>
                <Target className='size-3.5 text-primary' aria-hidden />
                {progress ? `${progress.overall.accuracy}% accuracy` : '—'}
              </span>
            </div>
          </header>

          {/* ── Totals since joined ── */}
          <div>
            <p className='mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft'>
              Everything counted since day one
            </p>
            <Stagger className='grid grid-cols-2 gap-2 sm:grid-cols-4' amount={0.1}>
              <StaggerItem className='h-full'>
                <LegacyWell icon={BookOpenCheck} value={home.totals.mcqsSolved} label='MCQs solved' />
              </StaggerItem>
              <StaggerItem className='h-full'>
                <LegacyWell icon={Layers} value={home.totals.flashcardsReviewed} label='Flashcards reviewed' tone='text-gold' />
              </StaggerItem>
              <StaggerItem className='h-full'>
                <LegacyWell icon={CalendarCheck} value={home.totals.revisionSessions} label='Revision sessions' />
              </StaggerItem>
              <StaggerItem className='h-full'>
                <LegacyWell icon={ClipboardList} value={home.totals.mocksSubmitted} label='Mocks submitted' tone='text-sev-warn' />
              </StaggerItem>
              <StaggerItem className='h-full'>
                <LegacyWell icon={Stethoscope} value={home.totals.casesCompleted} label='Cases completed' />
              </StaggerItem>
              <StaggerItem className='h-full'>
                <LegacyWell icon={GraduationCap} value={home.totals.topicsMastered} label='Topics mastered' tone='text-sev-ok' />
              </StaggerItem>
              <StaggerItem className='h-full'>
                <LegacyWell icon={Bandage} value={home.totals.mistakesResolved} label='Mistakes repaired' />
              </StaggerItem>
              <StaggerItem className='h-full'>
                <LegacyWell icon={Sparkles} value={home.totals.studySessions} label='Study sessions' tone='text-gold' />
              </StaggerItem>
            </Stagger>
          </div>

          {/* ── Contribution calendar ── */}
          <ScrollReveal>
            {progress && (
              <div className='rounded-xl border border-line bg-surface-2/40 px-3.5 py-3.5'>
                <p className='mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft'>
                  Your study calendar
                </p>
                <ContributionCalendar heat={progress.heatmap} />
              </div>
            )}
          </ScrollReveal>

          {/* ── Streaks + badge wall ── */}
          <div className='grid gap-5 lg:grid-cols-2'>
            <ScrollReveal from='left'>
              <p className='mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft'>Streaks</p>
              <div className='space-y-2'>
                <StreakRail
                  icon={BookOpenCheck}
                  label='Learning'
                  days={home.streaks.learning.days}
                  state={home.streaks.learning.state}
                  note={home.streaks.learning.note}
                />
                <StreakRail
                  icon={CalendarCheck}
                  label='Revision'
                  days={home.streaks.revision.days}
                  state={home.streaks.revision.state}
                  note={home.streaks.revision.note}
                />
                <StreakRail
                  icon={Target}
                  label='Questions'
                  days={home.streaks.mcq.days}
                  state={home.streaks.mcq.state}
                  note={home.streaks.mcq.note}
                />
              </div>
            </ScrollReveal>

            <ScrollReveal from='right'>
              <p className='mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft'>
                Badge wall
                <span className='font-medium normal-case tracking-normal'>
                  {unlockedBadges.length}/{achievements?.achievements.length ?? home.achievements.total} earned
                </span>
              </p>
              {achievements && achievements.achievements.length > 0 ? (
                <div className='max-h-64 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]'>
                  <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
                    {unlockedBadges.slice(0, 8).map((a, i) => (
                      <BadgeTile key={a.id} a={a} pop={i < 2} />
                    ))}
                  </div>
                  {lockedBadges.length > 0 && (
                    <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
                      {lockedBadges.slice(0, 4).map((a) => (
                        <BadgeTile key={a.id} a={a} pop={false} />
                      ))}
                    </div>
                  )}
                  {unlockedBadges.length > 8 && (
                    <p className='text-[11px] text-ink-soft'>
                      + {unlockedBadges.length - 8} more in Motivation → Achievements
                    </p>
                  )}
                </div>
              ) : (
                <p className='rounded-xl border border-dashed border-line bg-surface-2/40 px-3.5 py-4 text-xs text-ink-soft'>
                  No badges yet — the first ones unlock with your opening sessions.
                </p>
              )}
            </ScrollReveal>
          </div>

          {/* ── Mastery ladder ── */}
          {topSubjects.length > 0 && (
            <ScrollReveal>
              <p className='mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft'>
                Subject mastery ladder
              </p>
              <div className='space-y-2.5'>
                {topSubjects.map((s) => (
                  <div key={s.id} className='flex items-center gap-3'>
                    <SubjectGlyph code={s.code} name={s.name} size='sm' />
                    <div className='min-w-0 flex-1'>
                      <div className='mb-1 flex items-baseline justify-between gap-2'>
                        <p className='truncate text-xs font-medium text-foreground'>{s.name}</p>
                        <p className='shrink-0 text-[11px] tabular-nums text-ink-soft'>
                          {s.mastery}% mastery · {s.accuracy}% accuracy
                        </p>
                      </div>
                      <SpringBar value={s.mastery} className='h-1.5' />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          )}

          {/* ── Honest basis ── */}
          <p className='text-[11px] leading-relaxed text-ink-soft'>
            Basis: <SpringNumber value={home.dataBasis.events} className='font-medium text-foreground' /> measured events
            across {home.dataBasis.measuredSources.length} sources ({home.dataBasis.measuredSources.slice(0, 4).join(', ')}
            {home.dataBasis.measuredSources.length > 4 ? '…' : ''}). {home.honestNote}
          </p>
        </div>
      )}
    </section>
  )
}
