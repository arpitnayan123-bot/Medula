'use client'

// ─── Medical Education OS — hero: "What should I do next?" (PRODUCT 20) ─────
// The one card that answers the platform's core question. Primary action is
// the top of the PUBLISHED priority rule; alternates are different kinds.
// Everything on it is measured; the rule is one tap away, not hidden.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Magnetic, SpringNumber, Stagger, StaggerItem } from '@/components/primitives/motion'
import { OrbitRings } from '@/components/primitives/scenery'
import type { OsAction, OsCommandCenter, OsReadiness, OsStats } from '@/lib/types'
import {
  OS_KIND_ICON, MicroLabel, OsGoButton, useOsNavigate,
} from '@/components/os/os-shared'
import { ChevronRight, Sparkles, Flame, CalendarDays, Timer, CircleHelp, Zap, HelpCircle } from 'lucide-react'

// ── readiness ring (honest: dashed placeholder when data-poor) ──────────────

function ReadinessRing({ readiness }: { readiness: OsReadiness }) {
  const overall = readiness.overall
  const pct = overall !== null ? Math.max(0, Math.min(100, overall)) : null
  const R = 34
  const C = 2 * Math.PI * R
  return (
    <div className="flex flex-col items-center gap-1.5" aria-label={pct !== null ? `Readiness ${pct} of 100, ${readiness.band}` : 'Readiness not computable yet'}>
      <div className="relative size-[84px]">
        <svg viewBox="0 0 84 84" className="size-full -rotate-90">
          <circle cx="42" cy="42" r={R} fill="none" strokeWidth="7" className="stroke-muted" strokeLinecap="round" strokeDasharray={pct === null ? '3 6' : undefined} />
          {pct !== null && (
            <circle
              cx="42" cy="42" r={R} fill="none" strokeWidth="7" className="stroke-primary" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * C} ${C}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none">{pct !== null ? pct : '—'}</span>
          <span className="text-[9px] uppercase tracking-wider text-ink-soft">ready</span>
        </div>
      </div>
      <span className={cn('text-[11px] font-medium', pct !== null ? 'text-foreground' : 'text-ink-soft')}>
        {pct !== null ? readiness.band : 'not enough data'}
      </span>
    </div>
  )
}

// ── one alternate row ────────────────────────────────────────────────────────

function AlternateRow({ action }: { action: OsAction }) {
  const go = useOsNavigate()
  const Icon = OS_KIND_ICON[action.kind]
  return (
    <button
      onClick={() => go(action.view, action.conceptId, action.topicId)}
      className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-line hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line/80 bg-card shadow-sm">
        <Icon className="size-4 text-primary/80" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{action.title}</span>
        <span className="block truncate text-[11px] text-ink-soft">{action.reason}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-soft transition group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}

function StatChip({ icon: Icon, label, value, hint }: {
  icon: typeof Flame
  label: string
  value: number
  hint?: string
}) {
  return (
    <div className="clay clay-hover flex items-center gap-2 rounded-xl px-2.5 py-2" title={hint}>
      <Icon className="size-3.5 shrink-0 text-gold" aria-hidden />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-tight tabular-nums">
          <SpringNumber value={value} />
        </div>
        <div className="truncate text-[10px] text-ink-soft">{label}</div>
      </div>
    </div>
  )
}

// ── the hero ────────────────────────────────────────────────────────────────

export function OsHero({ data }: { data: OsCommandCenter }) {
  const { greeting, now, readiness, stats } = data
  const [ruleOpen, setRuleOpen] = useState(false)
  const go = useOsNavigate()
  const primary = now.primary
  const PrimaryIcon = OS_KIND_ICON[primary.kind]

  return (
    <section aria-label="What should I do next" className="space-y-3">
      {/* greeting row */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting.hello}
          </h1>
          <p className="mt-1 text-xs text-ink-soft">
            {greeting.dateLine} · {greeting.stageLabel}
            {greeting.examLine ? ` · ${greeting.examLine}` : ''}
          </p>
        </div>
        <ReadinessRing readiness={readiness} />
      </div>

      {/* primary action — the porcelain podium answers the core question */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="podium relative overflow-hidden rounded-3xl p-4 md:p-6"
      >
        <OrbitRings className="opacity-60" />
        <div className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full bg-[#f3d5a4]/35 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-14 -bottom-8 size-48 rounded-full bg-[#c9e8d4]/30 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl border border-white/60 bg-primary/10 shadow-well">
                <PrimaryIcon className="size-4 text-primary" aria-hidden />
              </span>
              <MicroLabel>Do this next</MicroLabel>
              <span className="rounded-full border border-line/80 bg-card/80 px-2 py-0.5 text-[10px] font-medium text-ink-soft shadow-sm">
                {primary.ruleIndex ? `rule #${primary.ruleIndex} of ${now.rule.length}` : `priority ${primary.priority}/100`}
              </span>
            </div>
            <h2 className="font-display mt-3 text-xl font-semibold leading-snug md:text-2xl">{primary.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{primary.reason}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Magnetic>
                <Button size="sm" className="clay-btn rounded-xl text-xs" onClick={() => go(primary.view, primary.conceptId, primary.topicId)}>
                  {primary.cta}
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </Magnetic>
              <OsGoButton view="tutor" variant="ghost" size="sm" className="text-xs text-ink-soft">
                <Sparkles className="size-3.5" aria-hidden />
                Ask the AI tutor
              </OsGoButton>
              <button
                onClick={() => setRuleOpen((v) => !v)}
                aria-expanded={ruleOpen}
                className="press inline-flex min-h-9 items-center gap-1 rounded-xl px-2 text-xs text-ink-soft transition hover:text-foreground"
              >
                <HelpCircle className="size-3.5" aria-hidden />
                Why this?
              </button>
            </div>
          </div>
        </div>

        {ruleOpen && (
          <div className="clay-in relative mt-4 rounded-xl p-3.5">
            <MicroLabel>Published priority rule — applied top to bottom</MicroLabel>
            <ol className="mt-1.5 space-y-1">
              {now.rule.map((line, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-ink-soft">
                  <span className="font-semibold text-foreground/70">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[10px] text-ink-soft">
              First rule whose condition your data satisfies becomes the primary action. No hidden scoring, no chain-of-thought — just this order.
            </p>
          </div>
        )}
      </motion.div>

      {/* alternates */}
      {now.alternates.length > 0 && (
        <div className="clay rounded-2xl p-1.5">
          {now.alternates.map((a) => <AlternateRow key={a.id} action={a} />)}
        </div>
      )}

      {/* today's measured stats */}
      <Stagger className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StaggerItem className="h-full">
          <StatChip icon={Flame} label="day streak" value={stats.streakDays} hint="Consecutive active IST days, measured from your activity" />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatChip icon={CalendarDays} label="active days / 30" value={stats.activeDays30} hint="Days with any measured study activity in the last 30" />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatChip icon={Timer} label="min logged today" value={stats.minutesToday} hint="Study sessions logged today" />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatChip icon={CircleHelp} label="MCQs today" value={stats.questionsToday} hint="Questions answered today" />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatChip icon={Zap} label="XP today" value={stats.xpToday} hint="Experience points earned today (measured, not for opening the app)" />
        </StaggerItem>
      </Stagger>
    </section>
  )
}
