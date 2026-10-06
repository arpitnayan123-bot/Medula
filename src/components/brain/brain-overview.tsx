'use client'

// ─── PERSONAL MEDICAL BRAIN · OVERVIEW (PRODUCT 18) ──────────────────────────
// The "understands me" tab. Receives the shared home payload (fetched once by
// the shell). Hero: measured learning profile. Centrepiece: "Your brain
// answers" — the seven intelligence questions as a calm accordion, each answer
// carrying its evidence and one hand-off action. Insights (max 4) + forgetting
// strip + the published derivation rules ("How your brain works"). No data
// dumps — every block is an insight plus an action.

import { useState } from 'react'
import {
  Brain, CalendarCheck, ChevronDown, Flame, GraduationCap, ListChecks, Sparkles,
} from 'lucide-react'
import type { BrainAnswer, BrainConceptStatus, BrainHomePayload } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  ActionButton, EmptyNote, FootNote, MicroLabel, RecallBar, SectionCard, StateDistribution,
  WhyLine, recallPct, relativeTime,
} from './brain-shared'
import type { BrainTab } from './brain-shared'

export function BrainOverview({ home, stale, reload, onGoto, onJumpKnowledge }: {
  home: BrainHomePayload
  stale: boolean
  reload: () => void
  onGoto: (tab: BrainTab) => void
  onJumpKnowledge: (state?: BrainConceptStatus | 'all') => void
}) {
  return (
    <div className="space-y-4">
      <ProfileStrip home={home} stale={stale} reload={reload} onJumpKnowledge={onJumpKnowledge} />
      <AnswersCard answers={home.answers} />
      <InsightsCard home={home} />
      <ForgettingStrip home={home} onGoto={onGoto} />
      <HowItWorksCard home={home} />
    </div>
  )
}

// ── profile strip — the measured learning profile ────────────────────────────

function ProfileStrip({ home, stale, reload, onJumpKnowledge }: {
  home: BrainHomePayload
  stale: boolean
  reload: () => void
  onJumpKnowledge: (state?: BrainConceptStatus | 'all') => void
}) {
  const p = home.profile
  const studiedPct = p.topicsTotal > 0 ? Math.round((p.topicsStudied / p.topicsTotal) * 100) : 0
  return (
    <SectionCard
      title="Your learning profile"
      icon={Brain}
      subtitle="Measured from your real study activity — questions, flashcards, revisions, sessions and mocks."
      action={(
        <Button variant="ghost" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs text-ink-soft" onClick={reload}>
          {stale ? 'Re-reading…' : 'Re-read'}
        </Button>
      )}
    >
      {/* topics studied */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium">Topics studied</p>
          <p className="text-xs tabular-nums text-ink-soft">{p.topicsStudied} of {p.topicsTotal} · {studiedPct}%</p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15" role="progressbar" aria-valuenow={studiedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Topics studied">
          <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${studiedPct}%` }} />
        </div>
      </div>

      {/* concept states — tap to open Knowledge pre-filtered */}
      <div>
        <MicroLabel className="mb-2">Concepts by state — tap a state to inspect</MicroLabel>
        <StateDistribution counts={p.conceptsByState} onJump={(s) => onJumpKnowledge(s)} />
      </div>

      {/* measured numbers */}
      <div className="flex flex-wrap gap-1.5 border-t border-line pt-3.5">
        <Stat value={p.questionAccuracy == null ? '—' : `${Math.round(p.questionAccuracy)}%`} label="question accuracy" />
        <Stat value={p.accuracy30d == null ? '—' : `${Math.round(p.accuracy30d)}%`} label="last 30 days" />
        <Stat value={p.medianTimeSec == null ? '—' : `${Math.round(p.medianTimeSec)}s`} label="median per question" />
        <Stat value={String(p.revisionSessions)} label="revision sessions" />
        <Stat value={p.mock.attempts === 0 ? '—' : `${p.mock.meanScore == null ? '—' : Math.round(p.mock.meanScore)}`} label="mock mean" />
        <Stat value={p.mock.lastScore == null ? '—' : String(Math.round(p.mock.lastScore))} label="mock last" />
        <Stat value={p.mock.bestScore == null ? '—' : String(Math.round(p.mock.bestScore))} label="mock best" />
        <Stat value={`${p.consistency.streakDays}d`} label="streak" />
        <Stat value={String(p.consistency.activeDays30)} label="active days / 30" />
      </div>

      {/* preferences the brain personalizes within */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[10px] text-ink-soft">
          <GraduationCap className="size-3 shrink-0" aria-hidden />
          {p.preferences.prepStage} · {p.preferences.examLabel || 'exam unset'}
        </span>
        {p.preferences.dailyHours != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[10px] text-ink-soft">
            <CalendarCheck className="size-3 shrink-0" aria-hidden />
            {p.preferences.dailyHours}h planned daily
          </span>
        )}
        {p.preferences.learningStyles.map((style) => (
          <span key={style} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[10px] text-ink-soft">
            <Sparkles className="size-3 shrink-0" aria-hidden />
            {style}
          </span>
        ))}
      </div>
    </SectionCard>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-[11px]">
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-ink-soft">{label}</span>
    </span>
  )
}

// ── "Your brain answers" — the seven intelligence questions ──────────────────

function AnswersCard({ answers }: { answers: BrainAnswer[] }) {
  return (
    <SectionCard
      title="Your brain answers"
      icon={ListChecks}
      subtitle="Seven questions about how you learn — each answered from measured activity, each with the evidence and a next step."
    >
      {answers.length === 0 ? (
        <EmptyNote>
          Nothing to answer yet — the brain starts answering as soon as your first measured activity lands
          (a solved question, a flashcard, a revision block).
        </EmptyNote>
      ) : (
        <Accordion type="single" collapsible className="gap-0">
          {answers.map((a, i) => (
            <AccordionItem key={a.id} value={a.id} className={cn('border-line', i > 0 && 'border-t')}>
              <AccordionTrigger className="gap-3 py-3.5 text-left hover:no-underline">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug tracking-tight">{a.question}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    {a.headline}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-2.5">
                  {a.items.length === 0 && <EmptyNote>No measured items behind this answer yet.</EmptyNote>}
                  {a.items.map((item, j) => (
                    <div key={`${a.id}-${j}`} className="rounded-xl border border-line bg-surface-2/40 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold leading-snug">{item.label}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{item.detail}</p>
                        </div>
                        {item.action && <ActionButton action={item.action} className="shrink-0" />}
                      </div>
                      <WhyLine text={item.evidence} className="mt-1.5" />
                    </div>
                  ))}
                  {a.note && <EmptyNote>{a.note}</EmptyNote>}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </SectionCard>
  )
}

// ── insights — max 4, each with one action + evidence ────────────────────────

function InsightsCard({ home }: { home: BrainHomePayload }) {
  if (home.insights.length === 0) return null
  return (
    <SectionCard
      title="Insights"
      icon={Sparkles}
      subtitle="A few things worth knowing now — each with its evidence and one action. Never more than four."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {home.insights.map((ins, i) => (
          <section key={i} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-2/40 p-3.5">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold leading-snug tracking-tight">{ins.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{ins.line}</p>
            </div>
            <WhyLine text={ins.evidence} />
            {ins.action && <ActionButton action={ins.action} className="mt-auto w-full justify-center" />}
          </section>
        ))}
      </div>
    </SectionCard>
  )
}

// ── forgetting strip — the top recall risks, linking to Memory ───────────────

function ForgettingStrip({ home, onGoto }: { home: BrainHomePayload; onGoto: (tab: BrainTab) => void }) {
  const f = home.forgetting
  return (
    <SectionCard
      title="Forgetting"
      icon={Flame}
      subtitle="Where measured recall is lowest right now — the same signals that order your Smart Revision queue."
      action={(
        <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={() => onGoto('memory')}>
          Open Memory
        </Button>
      )}
    >
      {f.topRisks.length === 0 ? (
        <EmptyNote>
          No recall risks measured yet. As stability decays after study, the lowest-recall concepts will surface here
          before they slip.
        </EmptyNote>
      ) : (
        <ul className="space-y-2.5" aria-label="Top recall risks">
          {f.topRisks.map((r) => (
            <li key={r.conceptId} className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-semibold">{r.name}</p>
                <p className="shrink-0 text-[11px] font-semibold tabular-nums text-ink-soft">{recallPct(r.recall / 100)}</p>
              </div>
              <RecallBar recall={r.recall / 100} label={`Estimated recall for ${r.name}`} />
            </li>
          ))}
        </ul>
      )}
      <FootNote className="mt-3">
        {f.atRisk} at risk · {f.needsRevision} need revision — measured from the published recall curve (estRecall = e^(−t / 1.6·stability)).
      </FootNote>
    </SectionCard>
  )
}

// ── how your brain works — the published derivation rules ────────────────────

function HowItWorksCard({ home }: { home: BrainHomePayload }) {
  const [open, setOpen] = useState(false)
  const d = home.dataBasis
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="clay overflow-hidden rounded-2xl">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none ring-primary/50 focus-visible:ring-2 md:px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Brain className="size-4 shrink-0 text-primary" aria-hidden />
            How your brain works
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-line px-4 py-4 md:px-6">
            <ol className="space-y-2">
              {home.howItWorks.map((rule, i) => (
                <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-primary/12 text-[9px] font-bold text-primary" aria-hidden>
                    {i + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-soft" role="note">
              Data basis — {d.conceptsMeasured.toLocaleString('en-IN')} concepts measured from {d.attempts.toLocaleString('en-IN')} question attempts,
              {' '}{d.flashcardReviews.toLocaleString('en-IN')} flashcard reviews, {d.revisionItems.toLocaleString('en-IN')} revision items and
              {' '}{d.mocks.toLocaleString('en-IN')} submitted mocks.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
              Last computed {relativeTime(home.generatedAt)}.
            </p>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
