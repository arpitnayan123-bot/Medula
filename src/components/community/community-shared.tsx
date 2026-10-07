'use client'

// ─── COMMUNITY · SHARED PRIMITIVES (PRODUCT 16) ──────────────────────────────
// Honesty made visible: every peer actor is labelled a seeded demo member, AI
// answers always carry the AI-ASSISTED badge, held-for-review posts say so,
// accountability meters are MEASURED, and peer progress is labelled demo.
// Patient-identifying content is blocked at write time by the server — the
// composer renders the server's verdict prominently.

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, BookOpen, Bookmark, BookmarkCheck,
  CalendarDays, Check, CheckCircle2, ChevronUp, Eye, Flag, Flame, Lock, MessageSquare,
  Scale, ShieldCheck, Sparkles, Star, Target, Users, X,
} from 'lucide-react'
import type { CommunityActor, CommunityBadge, CommunityGroupSummary, CommunityPostSummary, CommunityReplySummary, CommunitySpaceSummary } from '@/lib/types'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduce ? 0 : 0.05 * index, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

// ── Relative time (client-computed — app views render after hydration) ───────

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-soft', className)} title={new Date(iso).toLocaleString('en-IN')}>
      <CalendarDays className="size-3 shrink-0" aria-hidden />
      {relativeTime(iso)}
    </span>
  )
}

// ── Actors — 'You' vs seeded demo peers, always distinguishable ──────────────

export const BADGE_LABEL: Record<CommunityBadge, string> = {
  newcomer: 'Newcomer', contributor: 'Contributor', guide: 'Guide', mentor: 'Mentor',
}

export function actorInitials(actor: CommunityActor): string {
  const name = actor.kind === 'you' ? (actor.name || 'You') : actor.name
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}

export function yearLabel(year: number): string {
  return year <= 4 ? `Year ${year}` : year === 5 ? 'Intern' : 'Dedicated'
}

export function ActorChip({ actor, size = 'md', className }: { actor: CommunityActor; size?: 'sm' | 'md'; className?: string }) {
  const you = actor.kind === 'you'
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center rounded-full font-bold',
          size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs',
          you ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-ink-soft',
        )}
        title={you ? 'You' : 'Seeded demo peer'}
      >
        {actorInitials(actor)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-xs font-semibold', you && 'text-primary')}>{you ? 'You' : actor.name}</span>
          {!you && (
            <span className="shrink-0 rounded-full border border-line bg-surface-2 px-1.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft" title="Seeded demo peer — not a real classmate">
              demo
            </span>
          )}
        </span>
        <span className="block text-[10px] text-ink-soft">
          {yearLabel(actor.year)} · {BADGE_LABEL[actor.badge]}
        </span>
      </span>
    </span>
  )
}

// ── Kind + status chips ──────────────────────────────────────────────────────

export const SPACE_KIND_LABEL: Record<string, string> = {
  exam: 'Exam space', subject: 'Subject', doubt: 'Doubt clearance', pyq: 'PYQ', case: 'Cases', revision: 'Revision',
}

const POST_KIND_META: Record<string, { label: string; cls: string }> = {
  question: { label: 'Question', cls: 'border-primary/40 bg-primary/10 text-primary' },
  discussion: { label: 'Discussion', cls: 'border-line bg-surface-2 text-ink-soft' },
  pyq: { label: 'PYQ', cls: 'border-gold/40 bg-gold/10 text-gold' },
  mcq: { label: 'MCQ', cls: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok' },
  case: { label: 'Case', cls: 'border-sev-crit/40 bg-sev-crit/10 text-sev-crit' },
}

export function KindChip({ kind, className }: { kind: string; className?: string }) {
  const meta = POST_KIND_META[kind] ?? { label: kind, cls: 'border-line bg-surface-2 text-ink-soft' }
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', meta.cls, className)}>
      {meta.label}
    </span>
  )
}

/** Resolved / Answered / Held-for-review — the honest state of a thread. */
export function StatusBadges({ post, className }: { post: Pick<CommunityPostSummary, 'resolved' | 'answered' | 'flagged' | 'status'>; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {post.resolved ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
          <CheckCircle2 className="size-3" aria-hidden /> Resolved
        </span>
      ) : post.answered ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-ok/30 bg-sev-ok/5 px-2 py-0.5 text-[10px] font-semibold text-sev-ok/90">
          <Check className="size-3" aria-hidden /> Answered
        </span>
      ) : null}
      {(post.flagged || post.status === 'review') && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold text-sev-warn"
          title={post.flagged ? `Held for review (${post.flagged})` : 'Held for review'}
        >
          <AlertTriangle className="size-3" aria-hidden /> Held for review
        </span>
      )}
    </span>
  )
}

/** AI-ASSISTED badge — always paired with the response's own disclaimer. */
export function AIBadge({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary', className)}>
      <Sparkles className="size-3" aria-hidden /> {label ?? 'AI-assisted'}
    </span>
  )
}

// ── Votes, saves, meters, flame ───────────────────────────────────────────────

export function VoteButton({
  count, active, busy, onToggle, ariaLabel, className,
}: {
  count: number
  active: boolean
  busy?: boolean
  onToggle: () => void
  ariaLabel: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl border px-2.5 text-xs font-bold transition-colors disabled:opacity-60 outline-none ring-primary/50 focus-visible:ring-2',
        active ? 'border-primary/50 bg-primary/12 text-primary' : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
        className,
      )}
    >
      <ChevronUp className="size-4" aria-hidden />
      <span className="tabular-nums">{count}</span>
    </button>
  )
}

export function SaveButton({ saved, busy, onToggle, className }: { saved: boolean; busy?: boolean; onToggle: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved discussions' : 'Save this discussion'}
      title={saved ? 'Saved' : 'Save for later'}
      className={cn('size-11 shrink-0 rounded-xl', saved && 'border-primary/50 bg-primary/10 text-primary', className)}
    >
      {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
    </Button>
  )
}

/** MEASURED progress — value vs target, labelled with the real unit. */
export function ProgressMeter({
  value, target, unit, label, className, tone = 'primary',
}: {
  value: number
  target: number
  unit?: string
  label?: string
  className?: string
  tone?: 'primary' | 'emerald' | 'amber'
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  const done = target > 0 && value >= target
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <p className="mb-1 flex items-center justify-between gap-2 text-[11px] text-ink-soft">
          <span className="truncate">{label}</span>
          <span className="shrink-0 font-semibold tabular-nums">
            {value}/{target}{unit ? ` ${unit}` : ''} · {pct}%
          </span>
        </p>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={label ?? 'Progress'}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            done || tone === 'emerald' ? 'bg-sev-ok' : tone === 'amber' ? 'bg-gold' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Gentle streak flame — celebration without shaming; breaks are normal. */
export function StreakFlame({ current, longest, todayActive, className }: { current: number; longest: number; todayActive: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl border',
          todayActive ? 'border-gold/40 bg-gold/10' : 'border-line bg-surface-2',
        )}
        aria-hidden
      >
        <Flame className={cn('size-5', todayActive ? 'text-gold' : 'text-ink-soft/50')} />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold tabular-nums">{current} day{current === 1 ? '' : 's'}</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
          streak · best {longest}
          {todayActive ? ' · active today' : ''}
        </span>
      </span>
    </span>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon = MessageSquare, title, hint, action, className,
}: {
  icon?: typeof MessageSquare
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line bg-card/50 px-6 py-10 text-center', className)}>
      <span className="mb-0.5 grid size-11 place-items-center rounded-2xl bg-surface-2 text-ink-soft shadow-well" aria-hidden>
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-ink-soft">{hint}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

// ── Report dialog (spam | abuse | misinformation | privacy | other) ──────────

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or promotion' },
  { value: 'abuse', label: 'Harassment or abuse' },
  { value: 'misinformation', label: 'Medical misinformation' },
  { value: 'privacy', label: 'Privacy concern / patient details' },
  { value: 'other', label: 'Something else' },
]

export function ReportDialog({
  open, onOpenChange, targetLabel, onSubmit, reported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  targetLabel: string
  onSubmit: (reason: string, details: string) => Promise<void>
  reported?: boolean
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!reason) return
    setBusy(true)
    try {
      await onSubmit(reason, details.trim())
      setReason('')
      setDetails('')
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Report {targetLabel}</DialogTitle>
          <DialogDescription>
            Reports go to moderators only. Patient-identifying content and misinformation are taken down; everything else is reviewed by a person.
          </DialogDescription>
        </DialogHeader>
        {reported ? (
          <p className="flex items-start gap-2 rounded-xl border border-sev-ok/40 bg-sev-ok/10 px-3.5 py-3 text-xs text-sev-ok" role="status">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Already reported — thank you. Moderators will review it.
          </p>
        ) : (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="report-reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="report-reason" aria-label="Report reason" className="min-h-11 w-full">
                  <SelectValue placeholder="Pick the closest reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-details">Details (optional)</Label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What should a moderator look at?"
                className="min-h-20"
                maxLength={500}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!reported && (
            <Button className="min-h-11" onClick={() => void submit()} disabled={!reason || busy}>
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Shared report submitter — posts to /api/community/actions {action:'report'}. */
export function useCommunityReport() {
  const [reportedIds, setReportedIds] = useState<Record<string, boolean>>({})
  const report = async (target: { postId?: string; replyId?: string }, reason: string, details: string) => {
    try {
      await api.communityAction({ action: 'report', ...target, reason, details })
      const key = target.postId ?? target.replyId ?? ''
      setReportedIds((m) => ({ ...m, [key]: true }))
      toast({ title: 'Report received', description: 'Moderators will review it. Thank you for keeping this space safe.' })
    } catch {
      toast({ title: 'Could not send the report', description: 'Try again in a moment.', variant: 'destructive' })
      throw new Error('report failed')
    }
  }
  return { report, reportedIds }
}

// ── Cards ─────────────────────────────────────────────────────────────────────

const KIND_DOT: Record<string, string> = {
  exam: 'bg-primary', subject: 'bg-sev-ok', doubt: 'bg-gold',
  pyq: 'bg-gold', case: 'bg-sev-crit', revision: 'bg-primary',
}

export function SpaceCard({
  space, onOpen, reasonTag, compact,
}: {
  space: CommunitySpaceSummary
  onOpen: (id: string) => void
  reasonTag?: string | null
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(space.id)}
      aria-label={`Open the ${space.name} space`}
      className="clay clay-hover group flex h-full min-w-0 flex-col gap-2 rounded-2xl p-4 text-left outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
    >
      <span className="flex items-start gap-2.5">
        <span className={cn('mt-1 size-2 shrink-0 rounded-full', KIND_DOT[space.kind] ?? 'bg-ink-soft')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-snug">{space.name}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
            {SPACE_KIND_LABEL[space.kind] ?? space.kind}
            {space.subjectCode ? ` · ${space.subjectCode}` : ''}
          </span>
        </span>
        <ArrowUpRight className="size-3.5 shrink-0 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
      {!compact && <span className="line-clamp-2 block text-xs leading-relaxed text-ink-soft">{space.description}</span>}
      <span className="mt-auto flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
          <MessageSquare className="size-3" aria-hidden /> {space.posts} post{space.posts === 1 ? '' : 's'}
        </span>
        {space.unresolved > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2 py-0.5 text-[10px] font-semibold text-sev-warn">
            {space.unresolved} unresolved
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
          <Flame className="size-3" aria-hidden /> {space.activeToday} today
        </span>
        {space.groupCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
            <Users className="size-3" aria-hidden /> {space.groupCount} group{space.groupCount === 1 ? '' : 's'}
          </span>
        )}
        {(reasonTag ?? space.reasonTag) && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-semibold text-sev-ok" title="Why this is suggested — from your own learning signals">
            <Target className="size-3" aria-hidden /> {reasonTag ?? space.reasonTag}
          </span>
        )}
      </span>
    </button>
  )
}

export function SpaceCardSkeleton() {
  return (
    <div className="clay rounded-2xl p-4" aria-hidden>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-3 h-4 w-3/4 rounded-full" />
    </div>
  )
}

/** Topic chip — hands the thread back to the Topic Hub (PRODUCT 02). */
export function TopicChip({ topicName, onOpen, className }: { topicName: string; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      className={cn('inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 outline-none ring-primary/50 focus-visible:ring-2', className)}
      title="Open the Topic Hub for this topic"
    >
      <BookOpen className="size-3" aria-hidden /> {topicName}
      <ArrowUpRight className="size-3" aria-hidden />
    </button>
  )
}

/**
 * PostCard — the one row used by home, spaces and group discussions:
 * author, badges, kind, tags, votes, replies, views, time, topic hand-off
 * and a delete affordance for your own posts.
 */
export function PostCard({
  post, onOpen, onToggleVote, onToggleSave, onDelete, onOpenTopic, showSpace,
}: {
  post: CommunityPostSummary
  onOpen: (id: string) => void
  onToggleVote?: (post: CommunityPostSummary) => void
  onToggleSave?: (post: CommunityPostSummary) => void
  onDelete?: (post: CommunityPostSummary) => void
  onOpenTopic?: (post: CommunityPostSummary) => void
  showSpace?: boolean
}) {
  return (
    <article className={cn('clay group flex gap-3 rounded-2xl p-4 transition-shadow', post.status === 'open' && 'clay-hover')}>
      <VoteButton
        count={post.upvotes}
        active={post.votedByYou}
        ariaLabel={post.votedByYou ? `Remove your upvote from ${post.title}` : `Upvote ${post.title}`}
        onToggle={() => onToggleVote?.(post)}
        className="self-start"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <ActorChip actor={post.author} size="sm" />
          <RelativeTime iso={post.createdAt} className="ml-auto sm:hidden" />
        </div>
        {/* Title + body are the click target; the chips below stay sibling
            elements so no <button> ever nests inside another (hydration-safe). */}
        <button
          type="button"
          onClick={() => onOpen(post.id)}
          className="block w-full text-left outline-none ring-primary/50 focus-visible:ring-2"
          aria-label={`Open discussion: ${post.title}`}
        >
          <h4 className={cn('line-clamp-2 text-sm font-semibold leading-snug', post.status !== 'open' && 'opacity-70')}>{post.title}</h4>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">{post.body}</p>
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <KindChip kind={post.kind} />
          <StatusBadges post={post} />
          {showSpace && post.spaceName && (
            <span className="inline-flex max-w-44 shrink-0 items-center truncate rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft" title={post.spaceName}>
              {post.spaceName}
            </span>
          )}
          {post.groupName && (
            <span className="inline-flex max-w-44 shrink-0 items-center truncate rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft" title={`Study group: ${post.groupName}`}>
              <Users className="size-3 shrink-0" aria-hidden /> {post.groupName}
            </span>
          )}
          {post.topicName && onOpenTopic && (
            <TopicChip topicName={post.topicName} onOpen={() => onOpenTopic(post)} />
          )}
          {post.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">#{t}</span>
          ))}
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
            <MessageSquare className="size-3" aria-hidden /> {post.replies}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
            <Eye className="size-3" aria-hidden /> {post.views}
          </span>
          <RelativeTime iso={post.lastActivityAt} className="hidden sm:inline-flex" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        {onToggleSave && (
          <SaveButton saved={post.savedByYou} onToggle={() => onToggleSave(post)} />
        )}
        {post.mine && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(post)}
            aria-label={`Delete ${post.title}`}
            className="size-11 rounded-xl text-ink-soft hover:text-sev-crit"
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </article>
  )
}

export function PostCardSkeleton() {
  return (
    <div className="clay flex gap-3 rounded-2xl p-4" aria-hidden>
      <Skeleton className="size-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-4 w-1/2 rounded-full" />
      </div>
    </div>
  )
}

export function ReplyCard({
  reply, canMarkAnswer, onMarkAnswer, onToggleVote, onReport, busy,
}: {
  reply: CommunityReplySummary
  canMarkAnswer?: boolean
  onMarkAnswer?: (reply: CommunityReplySummary) => void
  onToggleVote?: (reply: CommunityReplySummary) => void
  onReport?: (reply: CommunityReplySummary) => void
  busy?: boolean
}) {
  return (
    <article
      className={cn(
        'clay flex gap-3 rounded-2xl p-4',
        reply.isAnswer && 'border-sev-ok/40 bg-sev-ok/5',
      )}
    >
      <VoteButton
        count={reply.upvotes}
        active={reply.votedByYou}
        ariaLabel={reply.votedByYou ? 'Remove your upvote from this reply' : 'Upvote this reply'}
        onToggle={() => onToggleVote?.(reply)}
        className="self-start"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <ActorChip actor={reply.author} size="sm" />
          {reply.isAnswer && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
              <BadgeCheck className="size-3" aria-hidden /> Marked answer
            </span>
          )}
          {reply.aiAssisted && <AIBadge />}
          {reply.status === 'review' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold text-sev-warn">
              <AlertTriangle className="size-3" aria-hidden /> Held for review
            </span>
          )}
          <RelativeTime iso={reply.createdAt} className="ml-auto" />
        </div>
        <p className={cn('whitespace-pre-line text-sm leading-relaxed', reply.status !== 'open' && 'opacity-70')}>{reply.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {canMarkAnswer && onMarkAnswer && !reply.isAnswer && reply.status === 'open' && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-9 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => onMarkAnswer(reply)}
              disabled={busy}
              title="Mark this reply as the answer — resolves your question"
            >
              <Star className="size-3.5 text-gold" aria-hidden /> Mark as answer
            </Button>
          )}
          {onReport && !reply.mine && reply.status === 'open' && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-9 gap-1.5 rounded-full px-3 text-xs text-ink-soft"
              onClick={() => onReport(reply)}
            >
              <Flag className="size-3.5" aria-hidden /> Report
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export function GroupCard({
  group, onOpen, onJoinLeave, busy, mine,
}: {
  group: CommunityGroupSummary
  onOpen: (id: string) => void
  onJoinLeave?: (group: CommunityGroupSummary) => void
  busy?: boolean
  mine?: boolean
}) {
  return (
    <article className="clay clay-hover flex h-full min-w-0 flex-col gap-2.5 rounded-2xl p-4">
      <button
        type="button"
        onClick={() => onOpen(group.id)}
        className="min-w-0 flex-1 text-left outline-none ring-primary/50 focus-visible:ring-2"
        aria-label={`Open study group ${group.name}`}
      >
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              {group.privacy === 'private' && <Lock className="size-3.5 shrink-0 text-ink-soft" aria-label="Private group" />}
              <span className="truncate text-sm font-semibold leading-snug">{group.name}</span>
            </span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
              {group.focusLabel || group.focusKind}
            </span>
          </span>
          {group.seeded && (
            <span className="shrink-0 rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-soft" title="Seeded demo group">
              demo
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">{group.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
            <Users className="size-3" aria-hidden /> {group.members} member{group.members === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
            <CalendarDays className="size-3" aria-hidden /> {group.meetCadence || 'flexible cadence'}
          </span>
          {group.challengeCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Scale className="size-3" aria-hidden /> {group.challengeCount} challenge{group.challengeCount === 1 ? '' : 's'}
            </span>
          )}
          {mine && (
            <span className="rounded-full border border-sev-ok/40 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
              {group.youOwner ? 'You own this' : 'Joined'}
            </span>
          )}
        </div>
      </button>
      {onJoinLeave && (
        <Button
          variant={group.youMember ? 'outline' : 'default'}
          className="min-h-11 w-full"
          disabled={busy || group.youOwner}
          onClick={(e) => { e.stopPropagation(); onJoinLeave(group) }}
        >
          {group.youOwner ? 'Owner' : group.youMember ? 'Leave group' : 'Join group'}
        </Button>
      )}
    </article>
  )
}

export function GroupCardSkeleton() {
  return (
    <div className="clay rounded-2xl p-4" aria-hidden>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-3 h-4 w-3/4 rounded-full" />
      <Skeleton className="mt-3 h-11 w-full rounded-xl" />
    </div>
  )
}

// ── Skeletons for async sections ─────────────────────────────────────────────

export function SectionSkeleton({ cards = 3, kind = 'post' }: { cards?: number; kind?: 'post' | 'space' | 'group' | 'stat' }) {
  if (kind === 'stat') {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="status" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    )
  }
  return (
    <div className={cn('grid grid-cols-1 gap-3', kind === 'space' || kind === 'group' ? 'sm:grid-cols-2 lg:grid-cols-3' : '')} role="status" aria-busy="true">
      {Array.from({ length: cards }).map((_, i) => (
        kind === 'space' ? <SpaceCardSkeleton key={i} /> : kind === 'group' ? <GroupCardSkeleton key={i} /> : <PostCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ThreadSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-7 w-3/4 max-w-md" />
      <div className="clay space-y-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <Skeleton className="h-3 w-32" />
      <div className="clay space-y-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

/** Blocked panel — the server's PHI/moderation verdict, rendered prominently. */
export function BlockedPanel({ reasons, guidance }: { reasons: { kind: string; note: string }[]; guidance: string | null }) {
  return (
    <div role="alert" className="space-y-2 rounded-2xl border border-sev-crit/40 bg-sev-crit/10 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-sev-crit">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        Not posted — patient-identifying details detected
      </p>
      {reasons.length > 0 && (
        <ul className="space-y-1.5">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sev-crit" aria-hidden />
              <span><span className="font-semibold capitalize text-sev-crit/90">{r.kind.replace(/[-_]/g, ' ')}</span> — {r.note}</span>
            </li>
          ))}
        </ul>
      )}
      {guidance && (
        <p className="rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
          <span className="font-semibold text-foreground">How to fix it: </span>{guidance}
        </p>
      )}
      <p className="text-[11px] text-ink-soft">
        Share findings, not identities — de-identify age/sex/setting (e.g. “22-year-old male”), and remove names, MRD numbers, dates and faces.
      </p>
    </div>
  )
}
