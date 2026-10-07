'use client'

// ─── MOTIVATION · REWARDS (PRODUCT 17) ───────────────────────────────────────
// Non-monetary by contract: accent themes scoped to this section, featured
// badges, challenge badges, group recognition. No coins, no loot boxes. The
// accent honesty line — 'Applies to this section' — is always shown.

import { Check, Gem, Lock, Medal, Trophy, Users } from 'lucide-react'
import type { GamifyRewardsPayload } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollReveal, Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import {
  ACCENTS, ErrorState, FootNote, MicroLabel, SectionCard, useGamifyPayload,
} from './gamify-shared'
import type { GamifyAccentClasses, GamifyAccentId } from './gamify-shared'

export function GamifyRewards({ accentId, onAccentChange }: {
  accentId: GamifyAccentId
  onAccentChange: (id: GamifyAccentId) => void
}) {
  const { data, state, stale, reload } = useGamifyPayload(api.gamifyRewards)

  if (state === 'loading') return <RewardsSkeleton />
  if (state === 'error') {
    return (
      <ErrorState
        title="Rewards didn't load"
        hint="The gamify engine did not respond — your rewards are recorded server-side and nothing is lost. Retry below."
        onRetry={reload}
      />
    )
  }
  if (!data) return null

  return (
    <div className="space-y-4">
      {/* ── accent themes (section-scoped by design) ── */}
      <ScrollReveal>
        <SectionCard
          title="Accent themes"
          icon={Gem}
          description="Unlocked by your measured level — the active one tints this Motivation section only."
        >
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.accents.map((a) => {
              const isCurrent = a.id === accentId
              const classes = (ACCENTS as Record<string, GamifyAccentClasses | undefined>)[a.id]
              const canApply = Boolean(classes)
              return (
                <StaggerItem key={a.id} className="h-full">
                  <article
                    className={cn(
                      'clay h-full rounded-2xl p-4 transition-colors',
                      isCurrent && 'border-primary/40',
                    )}
                  >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn('size-9 shrink-0 rounded-xl', classes ? classes.swatch : 'bg-surface-2')}
                      aria-hidden
                      title={a.name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{a.name}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-soft">{a.description}</p>
                    </div>
                    {isCurrent && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-primary">
                        <Check className="size-3" aria-hidden /> active
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {a.unlocked && canApply ? (
                      <Button
                        variant={isCurrent ? 'ghost' : 'outline'}
                        size="sm"
                        className="min-h-9 rounded-xl px-3.5 text-xs"
                        disabled={isCurrent}
                        onClick={() => onAccentChange(a.id as GamifyAccentId)}
                      >
                        {isCurrent ? 'Applied to this section' : 'Apply to this section'}
                      </Button>
                    ) : a.unlocked ? (
                      <span className="text-[10px] text-ink-soft">Theme available — refresh to load it</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-ink-soft">
                        <Lock className="size-3 shrink-0" aria-hidden />
                        Unlocks at Level {a.unlockLevel}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[9px] uppercase tracking-[0.14em] text-ink-soft/70">Applies to this section</p>
                </article>
                </StaggerItem>
              )
            })}
          </Stagger>
        </SectionCard>
      </ScrollReveal>

      {/* ── featured badges summary ── */}
      <ScrollReveal>
        <SectionCard
          title="Featured badges"
          icon={Trophy}
          description={`${data.badges.unlocked} of ${data.badges.total} achievements unlocked — the featured ones ride on your Motivation header.`}
          action={
            <FeaturedJumpLink />
          }
        >
          {data.badges.challengeBadges.length === 0 ? (
            <p className="text-xs leading-relaxed text-ink-soft">
              Complete a challenge to earn its badge — they stay on your record, no expiry.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Challenge badges">
              {data.badges.challengeBadges.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-xl bg-surface-2/50 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/12" aria-hidden>
                    <Medal className="size-4 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{b.title}</span>
                  <span className="shrink-0 text-[10px] text-ink-soft" title={new Date(b.completedAt).toLocaleString('en-IN')}>
                    {new Date(b.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </ScrollReveal>

      {/* ── group recognition ── */}
      <ScrollReveal>
        <SectionCard
          title="Group recognition"
          icon={Users}
          description="Notes your study groups have attached to your contribution — visible because you chose to share."
        >
          {data.groupRecognition.length === 0 ? (
            <p className="text-xs leading-relaxed text-ink-soft">
              Nothing here yet — contribution in a study group (answering, sharing plans) is what earns recognition.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Group recognition">
              {data.groupRecognition.map((g) => (
                <li
                  key={g.groupName}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface-2/60 px-3 py-1.5"
                  title={g.note}
                >
                  <span className="truncate text-xs font-medium">{g.groupName}</span>
                  <span className="shrink-0 text-[10px] text-ink-soft">{g.note}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </ScrollReveal>

      <FootNote>
        {data.note} Rewards here are educational and non-monetary — mastery, consistency and contribution, not coins.
      </FootNote>
      {stale && <span className="sr-only" role="status">Updating…</span>}
    </div>
  )
}

// tiny tab jump — openGamify re-fires the section focus nonce so the shell
// switches tabs in place (no reload, everything shareable)

function FeaturedJumpLink() {
  const openGamify = useAppStore((s) => s.openGamify)
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-9 shrink-0 rounded-full px-3 text-xs"
      onClick={() => openGamify({ tab: 'achievements' })}
    >
      Open achievements
    </Button>
  )
}

function RewardsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading rewards">
      <Skeleton className="h-4 w-24" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="clay rounded-2xl p-4" aria-hidden>
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
            <Skeleton className="mt-3 h-9 w-32 rounded-xl" />
          </div>
        ))}
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <MicroLabel className="sr-only">Loading rewards</MicroLabel>
    </div>
  )
}
