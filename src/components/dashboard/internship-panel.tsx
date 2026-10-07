'use client'

// ─── INTERNSHIP MODE PANEL (spec §44) ───
// Rotation-based plan for intern profiles (year ≥ 5): the full NMC CRMI
// 12-month rotation timeline, a posting detail card with ward duties + NEET-PG
// hooks, and a ward+study weekly template. Renders nothing for non-interns.

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BookOpenCheck, ClipboardList, GraduationCap, Medal, Play, Sunrise, Target } from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { InternshipPayload, InternshipRotation, InternshipBlock } from '@/app/api/internship/route'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const KIND_STYLE: Record<InternshipBlock['kind'], { chip: string; bar: string }> = {
  clinical: { chip: 'bg-info/10 text-info', bar: 'bg-info' },
  recall: { chip: 'bg-sev-ok/10 text-sev-ok', bar: 'bg-sev-ok' },
  questions: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary' },
  revision: { chip: 'bg-sev-warn/10 text-sev-warn', bar: 'bg-sev-warn' },
  notes: { chip: 'bg-surface-2 text-ink-soft', bar: 'bg-muted-foreground/50' },
  rest: { chip: 'bg-sev-crit/10 text-sev-crit', bar: 'bg-sev-crit' },
}

function RotationChip({
  r, selected, onClick, index, reduce,
}: {
  r: InternshipRotation
  selected: boolean
  onClick: () => void
  index: number
  reduce: boolean | null
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : index * 0.05, duration: 0.35, ease: EASE }}
      whileHover={reduce ? undefined : { y: -2 }}
      className={cn(
        'group flex w-[104px] shrink-0 flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition-colors sm:w-[118px]',
        selected
          ? 'border-gold/60 bg-gold/10 shadow-md shadow-gold/10'
          : 'border-line bg-surface-2/60 hover:border-gold/40',
      )}
    >
      <span aria-hidden className="text-2xl transition-transform group-hover:scale-110">{r.emoji}</span>
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{r.name}</span>
      <span className="text-[10px] text-ink-soft">{r.monthsLabel.replace(' (incl. Anaesthesia)', '').replace(' (incl. Family Welfare)', '').replace(' (incl. UHC)', '').replace(' (incl. PMR)', '')}</span>
    </motion.button>
  )
}

function BlockRow({ b }: { b: InternshipBlock }) {
  const s = KIND_STYLE[b.kind]
  const hours = Math.floor(b.minutes / 60)
  const mins = b.minutes % 60
  const dur = hours > 0 ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className={cn('h-7 w-1 shrink-0 rounded-full', s.bar)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{b.label}</span>
      </span>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums', s.chip)}>
        {dur}
      </span>
    </li>
  )
}

export function InternshipPanel() {
  const reduce = useReducedMotion()
  const setView = useAppStore(s => s.setView)
  const setQuizPreset = useAppStore(s => s.setQuizPreset)

  const [data, setData] = useState<InternshipPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)

  useEffect(() => {
    let ok = true
    api.internship()
      .then(d => {
        if (!ok) return
        setData(d)
        setSelId(d.rotations[0]?.id ?? null)
      })
      .catch(() => { if (ok) setFailed(true) })
    return () => { ok = false }
  }, [])

  // Not an intern (or the API failed) → keep home clean, render nothing.
  if (failed || !data || !data.active) return null

  const sel = data.rotations.find(r => r.id === selId) ?? data.rotations[0]
  const weekStudy = data.weekTemplate.weekday
    .filter(b => ['questions', 'revision', 'recall', 'notes'].includes(b.kind))
    .reduce((a, b) => a + b.minutes, 0)

  const practicePosting = (r: InternshipRotation) => {
    // rotation.subjectCode is the DB code (e.g. "MED") — exactly what the
    // questions API and quiz presets expect
    if (!r.subjectCode || r.questionCount === 0) return
    setQuizPreset({ subjectCode: r.subjectCode, count: 8 })
    setView('questions')
  }

  return (
    <motion.section
      aria-label="Internship mode"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
      className="warm-scene relative overflow-hidden rounded-3xl p-4 md:p-6"
    >
      {/* scenic layers */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="scene-canopy absolute inset-0" />
        <div className="scene-float absolute -right-12 top-10 size-56 rounded-full bg-gold/20 blur-3xl" />
        <div className="scene-float absolute -left-16 bottom-0 size-64 rounded-full bg-mint/15 blur-3xl" style={{ animationDelay: '3s' }} />
        <motion.span
          aria-hidden
          className="absolute right-6 top-4 select-none text-gold opacity-60"
          animate={reduce ? undefined : { y: [0, -8, 0], rotate: [0, 6, 0] }}
          transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sunrise className="size-6" />
        </motion.span>
      </div>

      <div className="relative">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              <Sunrise className="size-4 text-gold" />
              Internship mode · your CRMI year
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl">
              Ward by day, NEET-PG by night
            </h2>
            <p className="mt-0.5 max-w-xl text-xs text-ink-soft md:text-sm">
              {data.totals.postings} postings across {data.totals.months} months, mapped to real CRMI rotations — each one with its study plan.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-medium tabular-nums">
              <ClipboardList className="size-3.5 text-primary" /> {data.totals.questionsInScope.toLocaleString('en-IN')} posting-linked questions
            </span>
            <span className="hidden items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 font-medium tabular-nums sm:inline-flex">
              <Target className="size-3.5 text-sev-warn" /> ≈ {weekStudy / 60 > 1 ? `${Math.round(weekStudy / 60)} h` : `${weekStudy} min`} self-study/weekday
            </span>
          </div>
        </div>

        {/* rotation timeline */}
        <div className="med-scroll mt-4 flex gap-2 overflow-x-auto pb-2">
          {data.rotations.map((r, i) => (
            <RotationChip key={r.id} r={r} index={i} reduce={reduce} selected={sel?.id === r.id} onClick={() => setSelId(r.id)} />
          ))}
        </div>

        {/* selected posting detail */}
        {sel && (
          <motion.div
            key={sel.id}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="mt-3 grid gap-3 lg:grid-cols-[1fr_340px]"
          >
            <div className="clay rounded-2xl p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden className="text-xl">{sel.emoji}</span>
                <h3 className="text-base font-semibold tracking-tight">{sel.name}</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">{sel.monthsLabel}</span>
                {sel.subjectName && (
                  <span className="rounded-full border border-line px-2.5 py-0.5 text-[10px] font-medium text-ink-soft">
                    links to {sel.subjectName}
                  </span>
                )}
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">On the ward</p>
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {sel.duties.map(d => (
                  <li key={d} className="flex items-start gap-1.5 text-xs leading-snug">
                    <BookOpenCheck className="mt-0.5 size-3.5 shrink-0 text-sev-ok" />
                    {d}
                  </li>
                ))}
              </ul>
              <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-primary">NEET-PG hook</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{sel.neetTip}</p>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Logbook: {sel.logbookHint} <span className="text-ink-soft">De-identified entries only.</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sel.subjectCode && sel.questionCount > 0 && (
                  <Button size="sm" className="min-h-9 gap-1.5" onClick={() => practicePosting(sel)}>
                    <Play className="size-3.5" /> Practice {sel.subjectName} ({sel.questionCount} Qs)
                  </Button>
                )}
                <Button size="sm" variant="outline" className="min-h-9 gap-1.5" onClick={() => setView('cases')}>
                  <ClipboardList className="size-3.5" /> Log a case
                </Button>
              </div>
            </div>

            {/* weekly template */}
            <div className="clay rounded-2xl p-4 md:p-5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                <GraduationCap className="size-4 text-gold" /> Ward-day template
              </h3>
              <ul className="mt-3 space-y-2.5">
                {data.weekTemplate.weekday.map((b, i) => <BlockRow key={`${b.label}-${i}`} b={b} />)}
              </ul>
              <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Weekends trade the ward for {Math.round(data.totals.studyHoursPerWeek / 7)}-hour self-study days — mocks on Sunday evening. Adjust hours in your profile and this template follows.
              </p>
            </div>
          </motion.div>
        )}

        <p className="relative mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] leading-relaxed text-muted-foreground">
          <Medal className="size-3.5 shrink-0 text-gold" aria-hidden />
          <span>{data.sourceNote}</span>
        </p>
      </div>
    </motion.section>
  )
}
