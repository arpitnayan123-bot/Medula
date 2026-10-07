'use client'

// ─── COMMUNITY · HOME (PRODUCT 16) ───────────────────────────────────────────
// «Learn Together → Discuss → Stay Accountable → Improve». Everything measured
// is labelled; everything demo says demo: the hero carries the payload's
// demoNotice, peer actors wear the demo chip, peer challenge numbers say
// 'demo snapshot'. The accountability strip and the contribution card link
// the community loop back to real study activity.

import { ArrowUpRight, Award, CheckCircle2, Flame, Info, MessageSquare, ScrollText, Sparkles, Target, TrendingUp, Users } from 'lucide-react'
import type { CommunityGroupSummary, CommunityHomePayload, CommunitySpaceKind, CommunitySpaceSummary } from '@/lib/types'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Aurora } from '@/components/primitives/aura'
import { ScrollReveal, SpringNumber, Stagger, StaggerItem } from '@/components/primitives/motion'
import { DotMatrix } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'
import {
  EmptyState, GroupCard, MicroLabel, PostCard, ProgressMeter,
  SPACE_KIND_LABEL, SpaceCard, StreakFlame,
} from './community-shared'

const KIND_ORDER: CommunitySpaceKind[] = ['exam', 'doubt', 'pyq', 'case', 'revision', 'subject']

export function CommunityHomeScreen({
  home, onOpenSpace, onOpenThread, onOpenGroup, onOpenGroups, onOpenAccountability, onOpenGuidelines,
}: {
  home: CommunityHomePayload
  onOpenSpace: (id: string) => void
  onOpenThread: (id: string) => void
  onOpenGroup: (id: string) => void
  onOpenGroups: () => void
  onOpenAccountability: () => void
  onOpenGuidelines: () => void
}) {
  const openHub = useAppStore((s) => s.openHub)
  const a = home.accountability

  return (
    <div className="space-y-8">
      {/* ── hero ── */}
      <ScrollReveal>
        <header className="relative space-y-3">
          <Aurora intensity={0.6} />
          <DotMatrix className="rounded-2xl" />
          <div className="relative z-10 space-y-3">
          <MicroLabel>Medical learning community</MicroLabel>
          <h1 className="text-xl font-bold leading-snug tracking-tight md:text-2xl">
            Learn Together <span className="text-ink-soft">→</span> Discuss <span className="text-ink-soft">→</span>{' '}
            <span className="text-primary">Stay Accountable</span> <span className="text-ink-soft">→</span> Improve
          </h1>
          <Stagger className="flex flex-wrap items-center gap-2">
            <StaggerItem><StatChip value={home.stats.spaces} label="spaces" /></StaggerItem>
            <StaggerItem><StatChip value={home.stats.posts} label="posts" /></StaggerItem>
            <StaggerItem><StatChip value={home.stats.replies} label="replies" /></StaggerItem>
            <StaggerItem><StatChip value={home.stats.resolved} label="resolved" tone="ok" /></StaggerItem>
            <StaggerItem><StatChip value={home.stats.unresolved} label="unresolved" tone="warn" /></StaggerItem>
            <StaggerItem><StatChip value={home.stats.groups} label="study groups" /></StaggerItem>
          </Stagger>
          <p
            className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-[11px] leading-relaxed text-ink-soft"
            role="note"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {home.demoNotice}
          </p>
          </div>
        </header>
      </ScrollReveal>

      {/* ── guidelines CTA (until accepted) ── */}
      {!home.guidelinesAccepted && (
        <ScrollReveal>
          <button
            type="button"
            onClick={onOpenGuidelines}
            className="clay clay-hover flex w-full items-start gap-3 rounded-2xl border border-sev-warn/40 bg-sev-warn/10 p-4 text-left outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
          >
            <span className="clay-in grid size-9 shrink-0 place-items-center rounded-xl" aria-hidden>
              <ScrollText className="size-4 text-sev-warn" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Read the community guidelines first</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                De-identification, AI labelling and privacy-by-default — the five rules that keep this space safe and useful.
              </span>
            </span>
            <ArrowUpRight className="mt-1 size-4 shrink-0 text-sev-warn" aria-hidden />
          </button>
        </ScrollReveal>
      )}

      {/* ── accountability strip — measured, gentle, one tap away ── */}
      <ScrollReveal>
        <button
          type="button"
          onClick={onOpenAccountability}
          aria-label="Open your accountability dashboard"
          className="clay clay-hover flex w-full flex-col gap-3 rounded-2xl p-4 text-left outline-none ring-primary/50 transition-shadow focus-visible:ring-2 sm:flex-row sm:items-center"
        >
          <StreakFlame current={a.streak.current} longest={a.streak.longest} todayActive={a.streak.todayActive} />
          <span className="min-w-0 flex-1 space-y-1.5">
            {a.goals.length > 0 ? (
              <>
                <span className="block text-xs font-semibold">
                  Today&apos;s goals — {a.goals.filter((g) => g.done).length} of {a.goals.length} done
                </span>
                <span className="block space-y-1">
                  {a.goals.slice(0, 2).map((g) => (
                    <ProgressMeter key={g.id} value={g.progress} target={g.target} label={g.title} />
                  ))}
                </span>
              </>
            ) : (
              <span className="block text-xs text-ink-soft">
                No goals yet — set one to build your rhythm. Today: {a.today.mcqs} MCQs · {a.today.studyMinutes} min study.
              </span>
            )}
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
              <Target className="size-3" aria-hidden />
              planned {a.plannedVsCompleted.today.planned} · completed {a.plannedVsCompleted.today.completed}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-ink-soft">
              Open accountability <ArrowUpRight className="size-3" aria-hidden />
            </span>
          </span>
        </button>
      </ScrollReveal>

      {/* ── For You — personalised from real learning signals ── */}
      {home.forYou && (
        <ScrollReveal>
          <section aria-labelledby="community-foryou">
            <div className="mb-2.5 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden />
              <h2 id="community-foryou" className="text-sm font-semibold tracking-tight">For you</h2>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-soft">{home.forYou.note}</p>
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {home.forYou.spaces.slice(0, 3).map((s) => (
                <StaggerItem key={s.id}><SpaceCard space={s} onOpen={onOpenSpace} /></StaggerItem>
              ))}
              {home.forYou.groups.slice(0, 3).map((g) => (
                <StaggerItem key={g.id}><GroupCard group={g} onOpen={onOpenGroup} /></StaggerItem>
              ))}
            </Stagger>
          </section>
        </ScrollReveal>
      )}

      {/* ── featured: unresolved questions + recently active ── */}
      <ScrollReveal>
        <section aria-labelledby="community-featured">
          <h2 id="community-featured" className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
            <MessageSquare className="size-4 text-primary" aria-hidden /> In the discussion
          </h2>
          {home.featured.unresolved.length === 0 && home.featured.active.length === 0 ? (
            <EmptyState
              title="No discussions yet"
              hint="Be the first — open a space and ask a real doubt. Answered questions earn contribution score."
            />
          ) : (
            <div className="space-y-5">
              {home.featured.unresolved.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                    Unresolved questions — help clear these
                  </p>
                  <div className="space-y-3">
                    {home.featured.unresolved.slice(0, 3).map((p) => (
                      <PostCard key={p.id} post={p} onOpen={onOpenThread} showSpace onOpenTopic={() => openHub(p.topicId)} />
                    ))}
                  </div>
                </div>
              )}
              {home.featured.active.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                    <TrendingUp className="size-3.5" aria-hidden /> Recently active
                  </p>
                  <div className="space-y-3">
                    {home.featured.active.slice(0, 3).map((p) => (
                      <PostCard key={p.id} post={p} onOpen={onOpenThread} showSpace onOpenTopic={() => openHub(p.topicId)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </ScrollReveal>

      {/* ── my groups ── */}
      <ScrollReveal>
        <section aria-labelledby="community-mygroups">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="community-mygroups" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Users className="size-4 text-primary" aria-hidden /> My study groups
            </h2>
            <Button variant="ghost" size="sm" className="min-h-9 gap-1 rounded-full px-3 text-xs" onClick={onOpenGroups}>
              Browse all <ArrowUpRight className="size-3" aria-hidden />
            </Button>
          </div>
          {home.myGroups.length === 0 ? (
            <EmptyState
              icon={Users}
              title="You haven't joined a study group yet"
              hint="Groups add gentle accountability — shared plans, cadence and challenges. Browse and join one, or start your own."
              action={<Button className="min-h-11" onClick={onOpenGroups}>Browse study groups</Button>}
            />
          ) : (
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {home.myGroups.slice(0, 3).map((g) => (
                <StaggerItem key={g.id}><GroupCard group={g} onOpen={onOpenGroup} mine /></StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      </ScrollReveal>

      {/* ── spaces grouped by kind ── */}
      <ScrollReveal>
        <SpacesByKind spaces={home.spaces} onOpenSpace={onOpenSpace} limit />
      </ScrollReveal>

      {/* ── contribution card ── */}
      <ScrollReveal>
        <section aria-labelledby="community-contribution" className="clay rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="community-contribution" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Award className="size-4 text-primary" aria-hidden /> Your contribution
            </h2>
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
              {home.stats.you.badge}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-3xl font-bold tabular-nums leading-none"><SpringNumber value={home.stats.you.score} /></p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">score</p>
            </div>
            <ContributionStat value={home.stats.you.answers} label="answers marked" />
            <ContributionStat value={home.stats.you.resolvedThreads} label="threads resolved" />
            <ContributionStat value={home.stats.you.upvotesReceived} label="upvotes received" />
            <ContributionStat value={home.stats.you.posts} label="posts" />
            <ContributionStat value={home.stats.you.replies} label="replies" />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
            Earned by helping others — solved doubts weigh more than upvotes. Answer a marked question or resolve your own thread to grow it.
          </p>
        </section>
      </ScrollReveal>
    </div>
  )
}

// ── Spaces directory (the Spaces tab reuses the same grouping) ───────────────

export function SpacesByKind({
  spaces, onOpenSpace, limit,
}: {
  spaces: CommunitySpaceSummary[]
  onOpenSpace: (id: string) => void
  limit?: boolean
}) {
  const groups = KIND_ORDER
    .map((kind) => ({ kind, items: spaces.filter((s) => s.kind === kind) }))
    .filter((g) => g.items.length > 0)
  return (
    <section aria-labelledby="community-spaces">
      <h2 id="community-spaces" className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Flame className="size-4 text-primary" aria-hidden /> Spaces
      </h2>
      {groups.length === 0 ? (
        <EmptyState title="No spaces yet" hint="Spaces appear as the curriculum and exams populate." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.kind}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                {SPACE_KIND_LABEL[g.kind] ?? g.kind}
                {g.kind === 'subject' && <span className="ml-1.5 font-normal normal-case">one per subject — follow the ones you study</span>}
                <span className="ml-2 font-normal normal-case text-ink-soft/70">{g.items.length}</span>
              </p>
              <Stagger className={cn('grid grid-cols-1 gap-3', limit ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3')}>
                {(limit ? g.items.slice(0, 6) : g.items).map((s) => (
                  <StaggerItem key={s.id}><SpaceCard space={s} onOpen={onOpenSpace} /></StaggerItem>
                ))}
              </Stagger>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function SpacesDirectory({ home, onOpenSpace }: { home: CommunityHomePayload; onOpenSpace: (id: string) => void }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">All spaces</h1>
        <p className="text-xs leading-relaxed text-ink-soft">
          {home.spaces.length} spaces, grouped by what they are for. Chips are measured — posts, unresolved questions and today&apos;s activity.
        </p>
      </header>
      <SpacesByKind spaces={home.spaces} onOpenSpace={onOpenSpace} />
    </div>
  )
}

// ── tiny locals ───────────────────────────────────────────────────────────────

function StatChip({ value, label, tone }: { value: number; label: string; tone?: 'ok' | 'warn' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        tone === 'ok' ? 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok'
          : tone === 'warn' ? 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn'
            : 'border-line bg-surface-2 text-ink-soft',
      )}
    >
      {tone === 'ok' && <CheckCircle2 className="size-3" aria-hidden />}
      <span className="tabular-nums">{value}</span> {label}
    </span>
  )
}

function ContributionStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
    </div>
  )
}
