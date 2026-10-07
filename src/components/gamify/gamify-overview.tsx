'use client'

// ─── MOTIVATION · OVERVIEW (PRODUCT 17) ──────────────────────────────────────
// The home tab. Receives the shared home payload (fetched once by the shell).
// Hero: level ring + measured week/today lines. Streaks: healthy view of
// consistency with the published recovery rule. Motivation cards: capped at 4
// by the engine, each with exactly one hand-off action. Recent XP ledger with
// the full ledger on demand. 'How XP works' is always published — transparent
// by design. Copy is neutral-positive only: no guilt, no deficit framing.

import { useState } from 'react'
import { CalendarCheck, ChevronDown, CircleHelp, ClipboardList, Clock, Flame, Info, ListChecks, Sparkles, TrendingUp } from 'lucide-react'
import type { GamifyHomePayload, GamifyMotivationCard, GamifyXpEventView } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollReveal, SpringNumber, Stagger, StaggerItem } from '@/components/primitives/motion'
import { OrbitRings } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'
import {
  DeltaIcon, EmptyState, FootNote, MicroLabel, MOTIVATION_KIND_ICON, SectionCard, SkeletonRow,
  StatChip, StreakChip, XpRing, XpTableCard, friendlyDelta, relativeTime, useAccent, useGamifyPayload, xpKindMeta,
} from './gamify-shared'

const MOTIVATION_TONE: Record<GamifyMotivationCard['kind'], string> = {
  'close-topic': 'text-primary',
  'accuracy-up': 'text-sev-ok',
  blockers: 'text-primary',
  'revision-backlog': 'text-sev-warn',
  streak: 'text-primary',
}

export function GamifyOverview({ home, stale, reload }: {
  home: GamifyHomePayload
  stale: boolean
  reload: () => void
}) {
  return (
    <div className="space-y-4">
      <GamifyHero home={home} />
      <ScrollReveal><GamifyStreaks home={home} /></ScrollReveal>
      <MotivationCards motivation={home.motivation} />
      <ScrollReveal><RecentLedger recent={home.recent} /></ScrollReveal>
      <ScrollReveal><XpTableCard recoveryRule={home.streaks.recoveryRule} /></ScrollReveal>
      <TotalsStrip home={home} />

      {/* measured basis + refresh — quiet trust line */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FootNote className="max-w-xl">
          {home.honestNote} Measured from {home.dataBasis.events.toLocaleString('en-IN')} activity events
          {home.dataBasis.measuredSources.length > 0 ? ` (${home.dataBasis.measuredSources.join(', ')})` : ''}.
        </FootNote>
        <Button variant="ghost" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs text-ink-soft" onClick={reload}>
          {stale ? 'Re-measuring…' : 'Re-measure'}
        </Button>
      </div>
    </div>
  )
}

// ── hero: level ring + measured week + today ─────────────────────────────────

function GamifyHero({ home }: { home: GamifyHomePayload }) {
  const accent = useAccent()
  const delta = friendlyDelta(home.weekXp, home.lastWeekXp)
  const t = home.today
  return (
    <section className="warm-card relative rounded-2xl p-5 md:p-6">
      <OrbitRings className="rounded-2xl opacity-60" />
      <div className="relative z-10 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7">
        <div className="flex flex-col items-center">
          <XpRing
            level={home.level.level}
            tier={home.level.tier}
            xpIntoLevel={home.level.xpIntoLevel}
            xpForNextLevel={home.level.xpForNextLevel}
            size={116}
            strokeWidth={9}
            className="mb-5"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5 text-center sm:text-left">
          <MicroLabel>Your momentum — measured, never estimated</MicroLabel>
          <h1 className="text-lg font-bold tracking-tight md:text-xl">
            {home.level.tier} · Level {home.level.level}
          </h1>
          <p className="text-sm text-ink-soft">
            <span className={cn('font-semibold tabular-nums', accent.text)}>
              <SpringNumber value={home.level.xpToNext} /> XP
            </span>{' '}to next level
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11px]">
              <span className="font-semibold tabular-nums"><SpringNumber value={home.weekXp} /> XP</span>
              <span className="text-ink-soft">this week</span>
            </span>
            {delta && (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11px] text-ink-soft">
                <DeltaIcon tone={delta.tone} />
                {delta.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* today — measured chips; an open day is an invitation, never a nudge */}
      <div className="relative z-10 mt-5 border-t border-line pt-4">
        {t.active ? (
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <TodayChip icon={CircleHelp} value={t.mcqs} label={t.mcqs === 1 ? 'MCQ' : 'MCQs'} />
            <TodayChip icon={CalendarCheck} value={t.revision} label={t.revision === 1 ? 'revision' : 'revisions'} />
            <TodayChip icon={Clock} value={t.studyMinutes} label="min" />
            <TodayChip icon={ClipboardList} value={t.mocks} label={t.mocks === 1 ? 'mock' : 'mocks'} />
            <TodayChip icon={Sparkles} value={`+${t.xp}`} label="XP today" highlight />
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 text-center text-xs text-ink-soft sm:justify-start" role="note">
            <Info className="size-3.5 shrink-0" aria-hidden />
            Today is still open — any session counts.
          </p>
        )}
      </div>
    </section>
  )
}

function TodayChip({ icon: Icon, value, label, highlight }: {
  icon: typeof CircleHelp; value: number | string; label: string; highlight?: boolean
}) {
  const accent = useAccent()
  return (
    <span className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px]', highlight ? cn(accent.chipBg, accent.chipText, accent.chipBorder) : 'border-line bg-surface-2/60')}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className={highlight ? '' : 'text-ink-soft'}>{label}</span>
    </span>
  )
}

// ── streaks: healthy consistency view + published recovery rule ──────────────

function GamifyStreaks({ home }: { home: GamifyHomePayload }) {
  const s = home.streaks
  return (
    <SectionCard
      title="Consistency"
      icon={Flame}
      description={`${s.activeDays14} active days in the last 14 — measured from real sessions, not logins.`}
      className="warm-card"
    >
      <div className="flex flex-wrap gap-2">
        <StreakChip label="Learning" line={s.learning} />
        <StreakChip label="Revision" line={s.revision} />
        <StreakChip label="MCQ" line={s.mcq} />
      </div>

      {/* weekly consistency — last 6 weeks, activeDays / 7 */}
      <div className="mt-4" role="img" aria-label="Weekly consistency for the last 6 weeks">
        <MicroLabel className="mb-2">Last 6 weeks</MicroLabel>
        <div className="grid grid-cols-6 gap-2">
          {s.weekly.map((w) => (
            <div key={w.weekStart} className="text-center" title={`Week of ${w.weekStart}: ${w.activeDays} of 7 days active`}>
              <div className="flex flex-col items-center gap-0.5">
                {Array.from({ length: w.total > 0 ? w.total : 7 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn('h-1.5 w-4 rounded-full', i < w.activeDays ? 'bg-primary' : 'bg-primary/15')}
                    aria-hidden
                  />
                ))}
              </div>
              <span className="mt-1 block text-[9px] tabular-nums text-ink-soft">{w.activeDays}/{w.total > 0 ? w.total : 7}</span>
            </div>
          ))}
        </div>
      </div>

      <FootNote className="mt-4">{s.recoveryRule}</FootNote>
    </SectionCard>
  )
}

// ── motivation cards — engine-built, capped at 4, one hand-off each ──────────

function MotivationCards({ motivation }: { motivation: GamifyMotivationCard[] }) {
  // hooks first — the empty check below must never skip them
  const setView = useAppStore((s) => s.setView)
  const openHub = useAppStore((s) => s.openHub)
  const openLearn = useAppStore((s) => s.openLearn)
  const openExam = useAppStore((s) => s.openExam)
  const openCommunity = useAppStore((s) => s.openCommunity)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  if (motivation.length === 0) return null

  const handOff = (card: GamifyMotivationCard) => {
    const a = card.action
    switch (a.view) {
      case 'hub':
        if (a.topicId) openHub(a.topicId)
        else setView('hub')
        return
      case 'mistakes': setView('mistakes'); return
      case 'revision': setView('revision'); return
      case 'performance': setView('performance'); return
      case 'questions': setView('questions'); return
      case 'adaptive':
        setAdaptivePreset({ subjectCode: a.subjectCode, topicId: a.topicId })
        setView('adaptive')
        return
      case 'learn':
        if (a.topicId) openLearn('topic', a.topicId)
        else setView('learn')
        return
      case 'exam': openExam(); return
      case 'community': openCommunity({ tab: 'groups' }); return
      default: setView(a.view)
    }
  }

  return (
    <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {motivation.map((card) => (
        <StaggerItem key={card.id} className="h-full">
          <MotivationCard card={card} onAction={() => handOff(card)} />
        </StaggerItem>
      ))}
    </Stagger>
  )
}

function MotivationCard({ card, onAction }: { card: GamifyMotivationCard; onAction: () => void }) {
  const Icon = MOTIVATION_KIND_ICON[card.kind] ?? Sparkles
  return (
    <section className="clay flex h-full flex-col gap-2.5 rounded-2xl p-4">
      <header className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2" aria-hidden>
          <Icon className={cn('size-4', MOTIVATION_TONE[card.kind])} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug tracking-tight">{card.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{card.detail}</p>
        </div>
      </header>
      <Button variant="outline" size="sm" className="mt-auto min-h-9 w-full justify-center rounded-xl text-xs" onClick={onAction}>
        {card.action.label}
      </Button>
    </section>
  )
}

// ── recent XP ledger + full ledger on demand ─────────────────────────────────

function RecentLedger({ recent }: { recent: GamifyXpEventView[] }) {
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const ledger = useGamifyPayload(api.gamifyXpLedger)

  return (
    <SectionCard
      title="Recent XP"
      icon={ListChecks}
      description="Every point is a measured event — the full ledger is open to you."
    >
      {recent.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No XP events yet"
          hint="Your first solved MCQ, revision block or completed case will show up here — everything is measured from real study activity."
        />
      ) : (
        <ul className="space-y-1" aria-label="Recent XP events">
          {recent.map((e) => <LedgerRow key={e.id} e={e} />)}
        </ul>
      )}

      {/* full ledger — fetched on demand, grouped by IST day */}
      <Collapsible open={ledgerOpen} onOpenChange={setLedgerOpen} className="mt-3">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-left text-xs font-semibold outline-none ring-primary/50 focus-visible:ring-2">
          <span>See full ledger</span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-ink-soft transition-transform duration-200', ledgerOpen && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-xl border border-line p-3">
            {ledger.state === 'loading' && <SkeletonRow rows={4} />}
            {ledger.state === 'error' && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-ink-soft">The ledger didn&apos;t load — nothing is lost.</p>
                <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={ledger.reload}>Retry</Button>
              </div>
            )}
            {ledger.data && (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {ledger.data.byKind.map((k) => (
                    <span key={k.kind} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[10px]">
                      <span className="font-semibold tabular-nums">+{k.xp}</span>
                      <span className="text-ink-soft">{k.label}</span>
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-2.5 py-1 text-[10px] font-semibold text-primary">
                    total {ledger.data.totalXp.toLocaleString('en-IN')} XP
                  </span>
                </div>
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {ledger.data.days.length === 0 && (
                    <p className="text-xs text-ink-soft">No events in the loaded window yet.</p>
                  )}
                  {ledger.data.days.map((d) => (
                    <div key={d.dayKey}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold">{d.label}</span>
                        <span className="text-[11px] font-semibold tabular-nums text-primary">+{d.xp} XP</span>
                      </div>
                      <ul className="space-y-1" aria-label={`XP events on ${d.label}`}>
                        {d.events.map((e, i) => (
                          <LedgerRow
                            key={`${e.at}-${i}`}
                            e={{ id: `${e.at}-${i}`, kind: e.kind, label: e.label, xp: e.xp, dayKey: d.dayKey, at: e.at }}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                  {ledger.data.hasMore && (
                    <p className="pt-1 text-[10px] text-ink-soft">Older events stay in the engine — this window shows the most recent ones.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </SectionCard>
  )
}

function LedgerRow({ e }: { e: GamifyXpEventView }) {
  const meta = xpKindMeta(e.kind)
  const Icon = meta.icon
  return (
    <li className="flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-surface-2/60">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2" aria-hidden>
        <Icon className="size-4 text-ink-soft" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{e.label}</span>
        <span className="block text-[10px] text-ink-soft">{meta.label !== e.label ? `${meta.label} · ` : ''}{relativeTime(e.at)}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">+{e.xp}</span>
    </li>
  )
}

// ── totals strip — quiet, measured lifetime chips ────────────────────────────

function TotalsStrip({ home }: { home: GamifyHomePayload }) {
  const t = home.totals
  return (
    <SectionCard
      title="Everything you've measured"
      icon={TrendingUp}
      description="Lifetime totals from your real activity — quiet numbers, no vanity counters."
    >
      <Stagger className="flex flex-wrap gap-2">
        <StaggerItem><StatChip value={t.mcqsSolved.toLocaleString('en-IN')} label="MCQs solved" /></StaggerItem>
        <StaggerItem><StatChip value={t.mocksSubmitted.toLocaleString('en-IN')} label="mocks submitted" /></StaggerItem>
        <StaggerItem><StatChip value={t.revisionSessions.toLocaleString('en-IN')} label="revision sessions" /></StaggerItem>
        <StaggerItem><StatChip value={t.topicsMastered.toLocaleString('en-IN')} label="topics mastered" /></StaggerItem>
        <StaggerItem><StatChip value={t.mistakesResolved.toLocaleString('en-IN')} label="mistakes fixed" /></StaggerItem>
      </Stagger>
    </SectionCard>
  )
}
