'use client'

// ─── AI FACULTY & CONTENT INTELLIGENCE · QUALITY & REVIEW (PRODUCT 19) ───────
// The validator tab: measured answer-key distribution (with the skew callout),
// open report counts, and quality findings that are FLAGGED FOR HUMAN REVIEW —
// the engine never declares content correct on its own. The review queue lists
// open review items plus drafts waiting in review; every resolution or dismissal
// requires a short reviewer note, and flagging is the only power the engine
// gives itself.

import { useState } from 'react'
import { Flag, ShieldCheck } from 'lucide-react'
import type { FacultyQualityPayload, FacultyQualityItem, FacultyReviewItemView, FacultyDraftView } from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  AiAssistedBadge, EmptyNote, FacultyErrorState, FacultyStatusPill, GateNote, MicroLabel,
  QUALITY_KIND_LABELS, SCROLL_LIST, SectionCard, SeverityPill, SkeletonRow, StatChip,
  relativeTime, useFaculty,
} from './faculty-shared'
import type { FacultyTab } from './faculty-shared'

export function FacultyQuality({ onGoto }: { onGoto?: (tab: FacultyTab) => void }) {
  const quality = useFaculty(() => api.facultyQuality())
  const queue = useFaculty(() => api.facultyReviewQueue())

  const refreshAll = () => { quality.reload(); queue.reload() }

  const data = quality.data
  const q = queue.data

  return (
    <div className="space-y-4">
      <SectionCard
        title="Content quality"
        icon={ShieldCheck}
        subtitle="Measured QC over the question bank, lessons and resources — every finding is an offer to a human reviewer, never a verdict."
        action={data ? <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{data.counts.open} open of {data.counts.all}</span> : undefined}
      >
        {quality.state === 'loading' && <SkeletonRow rows={5} />}
        {quality.state === 'error' && (
          <FacultyErrorState
            title="Quality findings didn't load"
            hint="The faculty engine did not respond — it may still be warming up. Nothing is lost; retry below."
            onRetry={quality.reload}
          />
        )}
        {data && (
          <div className="space-y-4">
            {/* disclaimer banner — verbatim, first */}
            <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-3.5" role="note">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12" aria-hidden>
                <ShieldCheck className="size-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight">Flagged for human review</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                  Findings are flagged for human review — the engine never declares content correct on its own. {data.disclaimer}
                </p>
              </div>
            </div>

            {/* answer-key distribution — small bar row + honest skew callout */}
            {data.answerKeyDist.length > 0 && (
              <div>
                <MicroLabel className="mb-2">Answer-key distribution</MicroLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="img" aria-label={`Answer-key distribution: ${data.answerKeyDist.map((d) => `option ${d.option} ${d.sharePct}%`).join(', ')}`}>
                  {data.answerKeyDist.map((d) => (
                    <div key={d.option} className="rounded-xl border border-line bg-surface-2/40 p-2.5">
                      <div className="flex items-baseline justify-between gap-1.5">
                        <span className="text-xs font-bold uppercase">{d.option}</span>
                        <span className="text-[10px] tabular-nums text-ink-soft">{d.count} · {d.sharePct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, Math.min(100, d.sharePct))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {data.answerKeySkew && (
                  <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-sev-warn" role="note">
                    <span className="mt-0.5 shrink-0 font-semibold">Skew —</span>
                    <span>{data.answerKeySkew.line}</span>
                  </p>
                )}
              </div>
            )}

            {/* open student reports — measured counts */}
            <div className="flex flex-wrap gap-1.5">
              <StatChip value={data.openReports.questions} label="open question reports" />
              <StatChip value={data.openReports.resources} label="open resource reports" />
              <StatChip value={data.flaggedForHumanReview} label="flagged for human review" />
            </div>

            {/* findings list */}
            {data.items.length === 0 ? (
              <EmptyNote>
                No open findings right now. When the engine measures something suspicious — a skewed answer key, a thin
                explanation, a fail-after-read pattern — it will surface here for a human decision.
              </EmptyNote>
            ) : (
              <ul className={SCROLL_LIST} aria-label="Quality findings">
                {data.items.map((f) => <FindingCard key={f.id} finding={f} onFlagged={refreshAll} />)}
              </ul>
            )}

            <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{data.note}</p>
          </div>
        )}
      </SectionCard>

      <ReviewQueueCard
        queue={q}
        loading={queue.state === 'loading'}
        error={queue.state === 'error'}
        onRetry={queue.reload}
        onDone={refreshAll}
        onGoto={onGoto}
      />
    </div>
  )
}

// ── one finding — same card pattern as gaps, plus flag-for-review ────────────

function FindingCard({ finding, onFlagged }: { finding: FacultyQualityItem; onFlagged: () => void }) {
  const [flagging, setFlagging] = useState(false)

  const flag = async () => {
    setFlagging(true)
    try {
      await api.facultyReviewAction({
        action: 'flag',
        kind: finding.kind,
        entityType: finding.entityType,
        entityId: finding.entityId,
        label: finding.label,
        severity: finding.severity,
        evidence: finding.evidence,
        suggestion: finding.suggestion,
      })
      toast({ title: 'Flagged for review', description: 'A review item now waits in the queue — a human decides what happens next.' })
      onFlagged()
    } catch {
      toast({ title: 'Could not flag this finding', description: 'The engine did not respond — nothing was changed. Try again.', variant: 'destructive' })
    } finally {
      setFlagging(false)
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-snug">{finding.label}</p>
          <p className="mt-0.5 text-[10px] text-ink-soft">{QUALITY_KIND_LABELS[finding.kind] ?? finding.kind} · {finding.entityType}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {finding.flagged && <FacultyStatusPill status="flagged" />}
          <SeverityPill severity={finding.severity} />
        </div>
      </div>

      {finding.evidence.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Measured evidence">
          {finding.evidence.map((ev, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-soft/60" aria-hidden />
              <span>{ev}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-soft" role="note">
        <span className="font-medium text-foreground">Suggested next step: </span>{finding.suggestion}
      </p>

      {!finding.flagged && (
        <div className="mt-2.5">
          <Button
            variant="outline"
            size="sm"
            className="min-h-9 rounded-xl px-3 text-xs"
            onClick={flag}
            disabled={flagging}
            aria-label={`Flag "${finding.label}" for human review`}
          >
            <Flag className="size-3.5 shrink-0" aria-hidden />
            {flagging ? 'Flagging…' : 'Flag for review'}
          </Button>
        </div>
      )}
    </li>
  )
}

// ── the review queue — open items + drafts in review, reviewer-gated ─────────

function ReviewQueueCard({ queue, loading, error, onRetry, onDone, onGoto }: {
  queue: { open: FacultyReviewItemView[]; draftsInReview: FacultyDraftView[]; note: string } | null
  loading: boolean
  error: boolean
  onRetry: () => void
  onDone: () => void
  onGoto?: (tab: FacultyTab) => void
}) {
  return (
    <SectionCard
      title="Review queue"
      icon={Flag}
      subtitle="Open review items and drafts waiting for a human decision. Resolve or dismiss with a note — every action is attributed."
      action={queue ? <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{queue.open.length + queue.draftsInReview.length} waiting</span> : undefined}
    >
      {loading && <SkeletonRow rows={4} />}
      {error && (
        <FacultyErrorState
          title="The review queue didn't load"
          hint="The faculty engine did not respond — it may still be warming up. Nothing is lost; retry below."
          onRetry={onRetry}
        />
      )}
      {queue && (
        <div className="space-y-4">
          {queue.open.length === 0 && queue.draftsInReview.length === 0 ? (
            <EmptyNote>
              The queue is clear — no open review items and no drafts waiting. Flag a finding above or send a Studio
              draft for review and it will appear here.
            </EmptyNote>
          ) : (
            <>
              {queue.open.length > 0 && (
                <div>
                  <MicroLabel className="mb-2">Open review items</MicroLabel>
                  <ul className={SCROLL_LIST} aria-label="Open review items">
                    {queue.open.map((item) => <ReviewItemCard key={item.id} item={item} onDone={onDone} />)}
                  </ul>
                </div>
              )}

              {queue.draftsInReview.length > 0 && (
                <div>
                  <MicroLabel className="mb-2">Drafts in review</MicroLabel>
                  <ul className="space-y-2" aria-label="Drafts in review">
                    {queue.draftsInReview.map((draft) => (
                      <li key={draft.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-xs font-semibold">{draft.title}</p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {draft.aiAssisted && <AiAssistedBadge />}
                            <FacultyStatusPill status={draft.status} />
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-ink-soft">
                          {draft.entityLabel} · sent {relativeTime(draft.updatedAt)}
                          {draft.changeNote ? ` · ${draft.changeNote}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {onGoto && (
                    <div className="mt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9 rounded-xl px-3 text-xs"
                        onClick={() => onGoto('studio')}
                      >
                        Open Studio to publish or reject
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <GateNote>
                Publishing a draft creates a verified content version attributed to its reviewer. Dismissing a review
                item records who dismissed it and why — nothing is silently dropped.
              </GateNote>
            </>
          )}
          <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{queue.note}</p>
        </div>
      )}
    </SectionCard>
  )
}

function ReviewItemCard({ item, onDone }: { item: FacultyReviewItemView; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'resolve' | 'dismiss' | null>(null)

  const act = async (action: 'resolve' | 'dismiss') => {
    setBusy(action)
    try {
      await api.facultyReviewAction({ action, itemId: item.id, reviewerNote: note.trim() })
      toast({ title: action === 'resolve' ? 'Review item resolved' : 'Review item dismissed', description: 'Recorded with your note — the finding leaves the open queue.' })
      setNote('')
      onDone()
    } catch {
      toast({ title: 'The action did not go through', description: 'The engine did not respond — the item is still open. Try again.', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">{item.label}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <SeverityPill severity={item.severity} />
          <FacultyStatusPill status="in-review" />
        </div>
      </div>
      <p className="mt-0.5 text-[10px] text-ink-soft">
        {item.kind} · {item.entityType} · opened {relativeTime(item.createdAt)}
      </p>

      {item.evidence.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Measured evidence">
          {item.evidence.map((ev, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-soft">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-soft/60" aria-hidden />
              <span>{ev}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-soft" role="note">
        <span className="font-medium text-foreground">Suggested next step: </span>{item.suggestion}
      </p>

      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reviewer note (required)"
          aria-label={`Reviewer note for ${item.label}`}
          className="min-h-10 flex-1"
          maxLength={280}
        />
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn('min-h-10 rounded-xl px-3 text-xs')}
            onClick={() => act('resolve')}
            disabled={!note.trim() || busy != null}
          >
            {busy === 'resolve' ? 'Resolving…' : 'Resolve'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-10 rounded-xl px-3 text-xs text-ink-soft"
            onClick={() => act('dismiss')}
            disabled={!note.trim() || busy != null}
          >
            {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </Button>
        </div>
      </div>
    </li>
  )
}
