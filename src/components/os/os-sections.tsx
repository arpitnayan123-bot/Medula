'use client'

// ─── Medical Education OS — today sections (PRODUCT 20) ─────────────────────
// The unified daily surface: what to study now (already in the hero), today's
// revision, recommended MCQs, mistakes to fix, upcoming tests, weak topics
// and the merged cross-feature activity feed. Every row carries its measured
// evidence and a one-tap hand-off into the real feature.

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { OsActivityItem, OsCommandCenter, OsWeakItem } from '@/lib/types'
import {
  MicroLabel, OsCard, OsGoButton, EmptyNote, FootNote, MiniBar,
  OS_ACTIVITY_ICON, OS_KIND_ICON, useOsNavigate,
} from '@/components/os/os-shared'
import {
  CalendarCheck, CircleHelp, Bandage, ClipboardList, ChevronRight,
  AlertTriangle, Clock, BookOpen,
} from 'lucide-react'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function Section({ title, icon: Icon, action, children, className }: {
  title: string
  icon: typeof CalendarCheck
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      aria-label={title}
      className={cn('rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm', className)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-background">
            <Icon className="size-3.5 text-ink-soft" aria-hidden />
          </span>
          <MicroLabel>{title}</MicroLabel>
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

// ── today strip (4 quick counters, each opens its feature) ──────────────────

function TodayStrip({ data }: { data: OsCommandCenter }) {
  const go = useOsNavigate()
  const { revision, mcqs, mistakes, tests } = data.today
  const cards = [
    {
      icon: CalendarCheck, label: 'Revision due', value: `${revision.dueCount}`,
      sub: revision.overdueCount > 0 ? `${revision.overdueCount} overdue · ${revision.minutes} min` : `${revision.minutes} min scheduled`,
      view: 'revision' as const, hot: revision.dueCount > 0,
    },
    {
      icon: CircleHelp, label: 'MCQs suggested', value: `${mcqs.suggestedCount}`,
      sub: mcqs.targets[0] ? `from ${mcqs.targets[0].label}` : 'your weakest areas',
      view: 'adaptive' as const, hot: false,
    },
    {
      icon: Bandage, label: 'Mistakes open', value: `${mistakes.open}`,
      sub: mistakes.repeated > 0 ? `${mistakes.repeated} repeated 2+ times` : `${mistakes.resolvedThisWeek} resolved this week`,
      view: 'mistakes' as const, hot: mistakes.repeated > 0,
    },
    {
      icon: ClipboardList, label: tests.examLabel ?? 'Exam target', value: tests.daysLeft !== null ? `${tests.daysLeft}d` : '—',
      sub: tests.isEstimate ? 'estimate — set your date' : 'your target date',
      view: 'exam' as const, hot: tests.daysLeft !== null && tests.daysLeft <= 21,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map((c) => (
        <OsCard key={c.label} onClick={() => go(c.view)} ariaLabel={`${c.label}: ${c.value}. Opens the feature.`} className="group">
          <TodayCardInner card={c} />
        </OsCard>
      ))}
    </div>
  )
}

// OsCard renders a <button> when onClick is given — nest the visual content
// in a plain component to keep the markup valid and the tap target 44px+.
function TodayCardInner({ card }: { card: { icon: typeof CalendarCheck; label: string; value: string; sub: string; view: 'revision' | 'adaptive' | 'mistakes' | 'exam'; hot: boolean } }) {
  const Icon = card.icon
  return (
    <>
      <div className="flex items-center justify-between">
        <Icon className="size-4 text-ink-soft" aria-hidden />
        <ChevronRight className="size-3.5 text-ink-soft/60 transition group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums leading-none">{card.value}</div>
      <div className="mt-1 text-[11px] font-medium">{card.label}</div>
      <div className={cn('truncate text-[10px]', card.hot ? 'text-primary font-medium' : 'text-ink-soft')}>
        {card.sub}
      </div>
    </>
  )
}

// ── revision today ──────────────────────────────────────────────────────────

function RevisionSection({ data }: { data: OsCommandCenter }) {
  const r = data.today.revision
  return (
    <Section
      title="Today's revision"
      icon={CalendarCheck}
      action={<OsGoButton view="revision" variant="ghost" size="sm" className="text-xs text-primary">Open Smart Revision <ChevronRight className="size-3.5" aria-hidden /></OsGoButton>}
    >
      {r.dueCount === 0 ? (
        <EmptyNote>
          Nothing due — the queue builds automatically from what you have learned and when you last recalled it.
        </EmptyNote>
      ) : (
        <>
          <ul className="space-y-1.5">
            {r.topItems.map((item) => (
              <li key={item.conceptId} className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 px-2.5 py-2">
                {item.overdue
                  ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-primary" aria-label="overdue" />
                  : <Clock className="mt-0.5 size-3.5 shrink-0 text-ink-soft" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium leading-tight">{item.conceptName}</div>
                  <div className="truncate text-[11px] text-ink-soft">{item.topicName ? `${item.topicName} · ` : ''}{item.reason}</div>
                </div>
                {item.overdue && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">overdue</span>
                )}
              </li>
            ))}
          </ul>
          <FootNote>{r.dueCount} due · {r.minutes} min scheduled · {r.sessionsThisWeek} sessions this week</FootNote>
        </>
      )}
    </Section>
  )
}

// ── recommended MCQs ────────────────────────────────────────────────────────

function McqSection({ data }: { data: OsCommandCenter }) {
  const m = data.today.mcqs
  return (
    <Section
      title="Recommended MCQs"
      icon={CircleHelp}
      action={m.targets[0] && (
        <OsGoButton view="adaptive" conceptId={m.targets[0].conceptId} topicId={m.targets[0].topicId} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent text-xs">
          Start 10-Q session
        </OsGoButton>
      )}
    >
      {m.targets.length === 0 ? (
        <EmptyNote>Answer a few questions and the engine will aim your practice at exactly where marks are lost.</EmptyNote>
      ) : (
        <>
          <ul className="space-y-1.5">
            {m.targets.map((t) => (
              <li key={t.id} className="rounded-xl border border-border/60 bg-background/60 px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{t.label}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
                    {t.accuracy !== null ? `${t.accuracy}% · ` : ''}{t.attempts} attempts
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <MiniBar value={t.importance} className="flex-1" />
                  <span className="text-[10px] tabular-nums text-ink-soft">importance {t.importance}</span>
                </div>
              </li>
            ))}
          </ul>
          <FootNote>Ranked by the exam-weighted importance model — not raw wrongness. Pool: {m.bankSize} platform questions.</FootNote>
        </>
      )}
    </Section>
  )
}

// ── mistakes to fix ─────────────────────────────────────────────────────────

function MistakesSection({ data }: { data: OsCommandCenter }) {
  const m = data.today.mistakes
  return (
    <Section
      title="Mistakes to fix"
      icon={Bandage}
      action={m.open > 0 && (
        <OsGoButton view="mistakes" variant="ghost" size="sm" className="text-xs text-primary">Mistake clinic <ChevronRight className="size-3.5" aria-hidden /></OsGoButton>
      )}
    >
      {m.open === 0 ? (
        <EmptyNote>No open mistakes — either a clean slate or everything retested. Either way, nothing to fix here today.</EmptyNote>
      ) : (
        <>
          {m.patterns.length > 0 && (
            <div className="space-y-1.5">
              {m.patterns.map((p) => (
                <div key={p.errorType} className="rounded-xl border border-border/60 bg-background/60 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium">{p.label}</span>
                    <span className="text-[11px] tabular-nums text-ink-soft">×{p.count}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{p.tactic}</div>
                </div>
              ))}
            </div>
          )}
          <FootNote>
            {m.open} open · {m.repeated} repeated 2+ times · {m.resolvedThisWeek} resolved this week
            {m.oldestOpenAt ? ` · oldest waiting since ${new Date(m.oldestOpenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
          </FootNote>
        </>
      )}
    </Section>
  )
}

// ── upcoming tests ──────────────────────────────────────────────────────────

function TestsSection({ data }: { data: OsCommandCenter }) {
  const t = data.today.tests
  return (
    <Section
      title="Upcoming tests"
      icon={ClipboardList}
      action={<OsGoButton view="exam" variant="ghost" size="sm" className="text-xs text-primary">Exam Lab <ChevronRight className="size-3.5" aria-hidden /></OsGoButton>}
    >
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
        <div className="text-center">
          <div className="text-2xl font-bold tabular-nums leading-none">{t.daysLeft !== null ? t.daysLeft : '—'}</div>
          <div className="text-[9px] uppercase tracking-wider text-ink-soft">days left</div>
        </div>
        <div className="min-w-0 flex-1 border-l border-border/60 pl-3">
          <div className="truncate text-[13px] font-medium">{t.examLabel ?? 'No exam target set'}</div>
          <div className="text-[11px] text-ink-soft">
            {t.stage ? `${t.stage} · ` : ''}{t.mocksLast30} mocks in 30 days{t.lastMock ? ` · last: ${t.lastMock.percent ?? '—'}%` : ''}
          </div>
        </div>
        {t.isEstimate && t.daysLeft !== null && (
          <span className="shrink-0 rounded-full border border-border/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-soft">estimate</span>
        )}
      </div>
      {t.suggested && (
        <div className="mt-2 rounded-xl border border-primary/25 bg-primary/[0.05] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-medium">{t.suggested.title}</span>
            <OsGoButton view="exam" size="sm" className="shrink-0 rounded-lg text-[11px]">Start</OsGoButton>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-ink-soft">{t.suggested.reason}</div>
        </div>
      )}
      <FootNote>{t.note}</FootNote>
    </Section>
  )
}

// ── weak topics ─────────────────────────────────────────────────────────────

function WeakSection({ data }: { data: OsCommandCenter }) {
  const weak = data.weakTopics
  return (
    <Section
      title="Weak topics — where marks are lost"
      icon={BookOpen}
      action={weak[0] && (
        <OsGoButton view={weak[0].view} conceptId={weak[0].conceptId} topicId={weak[0].topicId} variant="ghost" size="sm" className="text-xs text-primary">
          Practice top weak <ChevronRight className="size-3.5" aria-hidden />
        </OsGoButton>
      )}
    >
      {weak.length === 0 ? (
        <EmptyNote>No measured weaknesses yet — attempt a few topic questions and this list becomes exam-weighted and specific.</EmptyNote>
      ) : (
        <ul className="space-y-1.5">
          {weak.slice(0, 5).map((w) => <WeakRow key={w.id} w={w} />)}
        </ul>
      )}
    </Section>
  )
}

function WeakRow({ w }: { w: OsWeakItem }) {
  const Icon = OS_KIND_ICON.practice
  return (
    <li className="rounded-xl border border-border/60 bg-background/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium leading-tight">{w.label}</div>
          {w.parent && <div className="truncate text-[11px] text-ink-soft">{w.parent}</div>}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
          {w.accuracy !== null ? `${w.accuracy}%` : `${w.attempts} att.`}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <MiniBar value={w.importance} className="flex-1" />
        <OsGoButton view={w.view} conceptId={w.conceptId} topicId={w.topicId} size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-[11px] text-primary">
          <Icon className="size-3" aria-hidden /> practice
        </OsGoButton>
      </div>
      <div className="mt-1 truncate text-[11px] text-ink-soft">{w.reason}</div>
    </li>
  )
}

// ── recent activity (merged cross-feature feed) ─────────────────────────────

function ActivitySection({ data }: { data: OsCommandCenter }) {
  const items = data.activity
  const fmt = (at: string) => {
    const diff = Date.now() - new Date(at).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return (
    <Section title="Recent learning activity" icon={OS_ACTIVITY_ICON.study}>
      {items.length === 0 ? (
        <EmptyNote>Nothing logged yet. Every question, revision block, case, mock and flashcard you touch lands here — one timeline across the whole platform.</EmptyNote>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {items.map((item) => <ActivityRow key={item.id} item={item} when={fmt(item.at)} />)}
        </ul>
      )}
    </Section>
  )
}

function ActivityRow({ item, when }: { item: OsActivityItem; when: string }) {
  const Icon = OS_ACTIVITY_ICON[item.kind]
  return (
    <li className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition hover:bg-muted/40">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
        <Icon className="size-3.5 text-ink-soft" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium leading-tight">{item.label}</div>
        {item.detail && <div className="truncate text-[11px] text-ink-soft">{item.detail}</div>}
      </div>
      {item.metric && <span className="shrink-0 text-[11px] font-medium tabular-nums text-ink-soft">{item.metric}</span>}
      <span className="w-16 shrink-0 text-right text-[10px] text-ink-soft/80">{when}</span>
    </li>
  )
}

// ── exported composition ────────────────────────────────────────────────────

export function OsTodaySections({ data }: { data: OsCommandCenter }) {
  return (
    <div className="space-y-3">
      <TodayStrip data={data} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RevisionSection data={data} />
        <McqSection data={data} />
        <MistakesSection data={data} />
        <TestsSection data={data} />
        <WeakSection data={data} />
        <ActivitySection data={data} />
      </div>
    </div>
  )
}
