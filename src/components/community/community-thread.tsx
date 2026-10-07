'use client'

// ─── COMMUNITY · THREAD SCREEN (PRODUCT 16) ──────────────────────────────────
// Full post page: header with space breadcrumb, actions (vote / save / report /
// resolve), "People also asked" chips, replies with the marked answer pinned,
// a reply composer with the labelled AI-assist checkbox, and a collapsible AI
// panel (summarize / explain / suggest) whose every response carries the
// AI-ASSISTED badge + disclaimer, admits fallbacks honestly, and hands off to
// measured platform surfaces (Adaptive MCQs, Topic Hub, verified external links).

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight, BookOpen, CheckCircle2, ChevronDown, ExternalLink, Eye, Flag, Loader2,
  MessageSquare, RefreshCw, RotateCcw, Send, ShieldAlert, ShieldCheck, Sparkles,
} from 'lucide-react'
import type { CommunityAiResponse, CommunityReplySummary, CommunityThreadPayload } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AIBadge, ActorChip, BlockedPanel, EmptyState, KindChip, RelativeTime, ReplyCard,
  ReportDialog, Reveal, SaveButton, StatusBadges, ThreadSkeleton, TopicChip, VoteButton,
  useCommunityReport,
} from './community-shared'

type LoadState = 'loading' | 'ready' | 'error'
type AiTab = 'summarize' | 'explain' | 'suggest'

export function CommunityThreadScreen({
  postId, onBack, onOpenSpace, onOpenThread,
}: {
  postId: string
  onBack: () => void
  onOpenSpace: (id: string) => void
  onOpenThread: (id: string) => void
}) {
  const openHub = useAppStore((s) => s.openHub)
  const setView = useAppStore((s) => s.setView)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  const [payload, setPayload] = useState<CommunityThreadPayload | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  // mutations
  const [busyAction, setBusyAction] = useState(false)
  const [busyReplyId, setBusyReplyId] = useState<string | null>(null)
  const { report, reportedIds } = useCommunityReport()
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<{ postId?: string; replyId?: string; label: string } | null>(null)

  // reply composer
  const [replyText, setReplyText] = useState('')
  const [aiAssisted, setAiAssisted] = useState(false)
  const [replyBlocked, setReplyBlocked] = useState<{ reasons: { kind: string; note: string }[]; guidance: string | null } | null>(null)
  const [sending, setSending] = useState(false)

  // AI panel
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTab, setAiTab] = useState<AiTab>('summarize')
  const [aiQuery, setAiQuery] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [ai, setAi] = useState<CommunityAiResponse | null>(null)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    setState('loading')
    setPayload(null)
    setAi(null); setAiOpen(false); setAiQuery('')
    setReplyText(''); setAiAssisted(false); setReplyBlocked(null)
    api.communityThread(postId).then(
      (p) => { if (alive) { setPayload(p); setState('ready') } },
      () => { if (alive) setState('error') },
    )
    return () => { alive = false }
  }, [postId, reloadKey])

  // ── post-level mutations ───────────────────────────────────────────────────
  const toggleVote = () => {
    if (!payload) return
    const post = payload.post
    setPayload({
      ...payload,
      post: { ...post, votedByYou: !post.votedByYou, upvotes: post.upvotes + (post.votedByYou ? -1 : 1) },
    })
    api.communityAction({ action: 'vote', postId }).then(
      (res) => setPayload((p) => p ? { ...p, post: { ...p.post, votedByYou: !!res.voted, upvotes: res.upvotes ?? p.post.upvotes } } : p),
      () => {
        setPayload((p) => p ? { ...p, post: { ...p.post, votedByYou: post.votedByYou, upvotes: post.upvotes } } : p)
        toast({ title: 'Could not save your vote', description: 'Try again in a moment.', variant: 'destructive' })
      },
    )
  }

  const toggleSave = () => {
    if (!payload) return
    const post = payload.post
    setPayload({ ...payload, post: { ...post, savedByYou: !post.savedByYou } })
    api.communityAction({ action: 'save', postId }).then(
      (res) => setPayload((p) => p ? { ...p, post: { ...p.post, savedByYou: !!res.saved } } : p),
      () => {
        setPayload((p) => p ? { ...p, post: { ...p.post, savedByYou: post.savedByYou } } : p)
        toast({ title: 'Could not update saved', description: 'Try again in a moment.', variant: 'destructive' })
      },
    )
  }

  const toggleResolved = () => {
    if (!payload || busyAction) return
    const next = !payload.post.resolved
    setBusyAction(true)
    api.communityResolve(postId, { resolved: next }).then(
      () => {
        toast({
          title: next ? 'Thread marked resolved' : 'Thread reopened',
          description: next ? 'The question is closed out — the answer stays on the thread.' : 'The question is open again.',
        })
        refetch()
      },
      () => toast({ title: 'Could not update the thread', description: 'Try again in a moment.', variant: 'destructive' }),
    ).finally(() => setBusyAction(false))
  }

  const markAnswer = (reply: CommunityReplySummary) => {
    if (busyReplyId) return
    setBusyReplyId(reply.id)
    api.communityResolve(postId, { replyId: reply.id }).then(
      () => {
        toast({ title: 'Marked as the answer', description: 'The reply is pinned and the thread is resolved.' })
        refetch()
      },
      () => toast({ title: 'Could not mark the answer', description: 'Try again in a moment.', variant: 'destructive' }),
    ).finally(() => setBusyReplyId(null))
  }

  // ── reply composer ─────────────────────────────────────────────────────────
  const submitReply = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    try {
      const res = await api.communityReply(postId, { body: replyText.trim(), aiAssisted })
      if (res.blocked) {
        setReplyBlocked({ reasons: res.reasons, guidance: res.guidance })
        toast({ title: 'Not posted', description: 'The scan found identifying details — see the note above your draft.', variant: 'destructive' })
        return
      }
      if (res.reply) {
        setReplyText('')
        setAiAssisted(false)
        setReplyBlocked(null)
        toast({ title: 'Reply posted', description: aiAssisted ? 'Posted with the AI-ASSISTED label.' : undefined })
        refetch()
      } else {
        toast({ title: 'Could not reply', description: 'The server did not return the reply. Try again.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not reply', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  // ── AI panel ───────────────────────────────────────────────────────────────
  const runAi = async (mode: AiTab, query?: string) => {
    setAiBusy(true)
    setAi(null)
    try {
      const res = await api.communityAi({ mode, postId, query: query?.trim() || undefined })
      setAi(res)
    } catch {
      toast({ title: 'AI help is unavailable right now', description: 'The engine did not respond — try again in a moment.', variant: 'destructive' })
    } finally {
      setAiBusy(false)
    }
  }

  const switchAiTab = (t: AiTab) => {
    setAiTab(t)
    setAi(null)
  }

  const practiceMcqs = (mcqs: { count: number; subjectCode: string; topicId: string; topicName: string }) => {
    setAdaptivePreset({ subjectCode: mcqs.subjectCode, topicId: mcqs.topicId, count: mcqs.count })
    setView('adaptive')
    toast({ title: 'Handed to Adaptive practice', description: `${mcqs.count} MCQs queued on ${mcqs.topicName}.` })
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
        <ShieldAlert className="size-6 text-ink-soft" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">This thread didn&apos;t load</h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
          The community engine did not respond — it may still be warming up. Nothing is lost; retry below.
        </p>
        <Button variant="outline" className="min-h-11" onClick={refetch}>Retry</Button>
      </div>
    )
  }

  if (state === 'loading' || !payload) {
    return <ThreadSkeleton />
  }

  const post = payload.post
  const replies = [...payload.replies].sort((a, b) => Number(b.isAnswer) - Number(a.isAnswer))
  const reported = !!reportedIds[postId]

  return (
    <div className="space-y-6">
      {/* ── post ── */}
      <Reveal index={0}>
        <article className="space-y-4">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-soft">
              <button
                type="button"
                onClick={() => onOpenSpace(post.spaceId)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 font-semibold text-ink-soft transition-colors hover:text-foreground outline-none ring-primary/50 focus-visible:ring-2"
                title={`Back to the ${post.spaceName} space`}
              >
                <MessageSquare className="size-3" aria-hidden /> {post.spaceName}
              </button>
              <span aria-hidden>/</span>
              <span className="truncate">thread</span>
              <span className="ml-auto inline-flex items-center gap-1 text-[11px]" title="Views are counted on open">
                <Eye className="size-3.5" aria-hidden /> {post.views} view{post.views === 1 ? '' : 's'}
              </span>
            </div>
            <h1 className="text-xl font-bold leading-snug tracking-tight md:text-2xl">{post.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <ActorChip actor={post.author} />
              <RelativeTime iso={post.createdAt} />
              <KindChip kind={post.kind} />
              <StatusBadges post={post} />
              {post.groupName && (
                <span className="inline-flex max-w-44 shrink-0 items-center truncate rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft" title={`Study group: ${post.groupName}`}>
                  {post.groupName}
                </span>
              )}
            </div>
          </header>

          <div className="clay space-y-4 rounded-2xl p-4 sm:p-5">
            <p className="whitespace-pre-line text-sm leading-relaxed">{post.body}</p>
            {(post.tags.length > 0 || post.topicName) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {post.topicName && <TopicChip topicName={post.topicName} onOpen={() => openHub(post.topicId)} />}
                {post.tags.map((t) => (
                  <span key={t} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">#{t}</span>
                ))}
              </div>
            )}

            {/* actions row */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
              <VoteButton
                count={post.upvotes}
                active={post.votedByYou}
                onToggle={toggleVote}
                ariaLabel={post.votedByYou ? 'Remove your upvote from this thread' : 'Upvote this thread'}
              />
              <SaveButton saved={post.savedByYou} onToggle={toggleSave} />
              <Button
                variant="ghost"
                className="min-h-11 gap-1.5 rounded-xl px-3 text-xs text-ink-soft"
                onClick={() => { setReportTarget({ postId, label: 'this post' }); setReportOpen(true) }}
                disabled={reported}
              >
                <Flag className="size-4" aria-hidden /> {reported ? 'Reported' : 'Report'}
              </Button>
              {payload.youCanResolve && (
                <Button
                  variant="outline"
                  className="ml-auto min-h-11 gap-1.5 rounded-xl px-3 text-xs"
                  onClick={toggleResolved}
                  disabled={busyAction}
                >
                  {busyAction
                    ? <Loader2 className="size-4 animate-spin" aria-hidden />
                    : post.resolved ? <RotateCcw className="size-4" aria-hidden /> : <CheckCircle2 className="size-4 text-sev-ok" aria-hidden />}
                  {post.resolved ? 'Reopen thread' : 'Mark resolved'}
                </Button>
              )}
            </div>
          </div>
        </article>
      </Reveal>

      {/* ── people also asked ── */}
      {payload.similar.length > 0 && (
        <section aria-labelledby="thread-similar">
          <h2 id="thread-similar" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            People also asked
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {payload.similar.slice(0, 6).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpenThread(s.id)}
                className={cn(
                  'inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
                  s.resolved
                    ? 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok'
                    : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
                )}
                title={s.resolved ? 'Resolved thread' : 'Open thread'}
              >
                {s.resolved && <CheckCircle2 className="size-3 shrink-0" aria-hidden />}
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── replies ── */}
      <section aria-labelledby="thread-replies" className="space-y-3">
        <h2 id="thread-replies" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <MessageSquare className="size-4 text-primary" aria-hidden />
          {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
          {payload.youCanResolve && !post.resolved && (
            <span className="text-[11px] font-normal text-ink-soft">— mark the best one as the answer</span>
          )}
        </h2>
        {replies.length === 0 ? (
          <EmptyState
            title="No replies yet"
            hint="Know the answer, or part of it? Reply below — cited, de-identified, and generous. Marked answers earn the most contribution score."
          />
        ) : (
          <div className="space-y-3">
            {replies.map((r) => (
              <ReplyCard
                key={r.id}
                reply={r}
                canMarkAnswer={payload.youCanResolve && !post.resolved}
                onMarkAnswer={markAnswer}
                onToggleVote={() => toggleReplyVote(r)}
                onReport={() => { setReportTarget({ replyId: r.id, label: 'this reply' }); setReportOpen(true) }}
                busy={busyReplyId === r.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── reply composer ── */}
      <section aria-labelledby="thread-reply-composer" className="clay space-y-3 rounded-2xl p-4">
        <h2 id="thread-reply-composer" className="text-sm font-semibold tracking-tight">Add your reply</h2>
        {replyBlocked && (
          <div className="space-y-2">
            <BlockedPanel reasons={replyBlocked.reasons} guidance={replyBlocked.guidance} />
            <p className="text-[11px] text-ink-soft">Your draft is kept below — edit it and send again once it&apos;s de-identified.</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="reply-body" className="sr-only">Your reply</Label>
          <Textarea
            id="reply-body"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Answer what you know, cite what you can. De-identify: age, sex, setting — no names, MRD numbers, dates or faces."
            className="min-h-28"
            maxLength={4000}
          />
          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
            <Checkbox
              id="reply-ai"
              checked={aiAssisted}
              onCheckedChange={(v) => setAiAssisted(v === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="reply-ai" className="text-xs font-semibold leading-tight">
                Draft with AI assist — will be labelled
              </Label>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                If you tick this, the reply carries a visible AI-ASSISTED badge. It stays your words — the label just tells readers an AI helped draft it.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-soft">Be generous with upvotes — they fund the contributor badges.</p>
          <Button className="min-h-11 gap-1.5" onClick={() => void submitReply()} disabled={!replyText.trim() || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {sending ? 'Sending…' : 'Reply'}
          </Button>
        </div>
      </section>

      {/* ── AI panel ── */}
      <section aria-labelledby="thread-ai" className="clay rounded-2xl p-4">
        <button
          type="button"
          onClick={() => setAiOpen((v) => !v)}
          aria-expanded={aiOpen}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl text-left outline-none ring-primary/50 focus-visible:ring-2"
        >
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-tight">AI study help</span>
            <span className="block text-[11px] text-ink-soft">Summaries and explanations, always badged and grounded in this thread or platform lessons.</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform', aiOpen && 'rotate-180')} aria-hidden />
        </button>

        {aiOpen && (
          <div className="mt-3 space-y-3 border-t border-line pt-3">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="AI modes">
              {([['summarize', 'Summarize'], ['explain', 'Explain'], ['suggest', 'Suggest']] as const).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={aiTab === t}
                  onClick={() => switchAiTab(t)}
                  className={cn(
                    'flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
                    aiTab === t ? 'border-primary/40 bg-primary/12 text-primary' : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {aiTab === 'summarize' && (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-ink-soft">Condenses the whole thread — the post and every reply. No input needed.</p>
                <Button variant="outline" className="min-h-11 gap-1.5" onClick={() => void runAi('summarize')} disabled={aiBusy}>
                  {aiBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Summarize thread
                </Button>
              </div>
            )}

            {aiTab === 'explain' && (
              <div className="space-y-2">
                <Label htmlFor="ai-query" className="text-xs">What should be explained?</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="ai-query"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="e.g. why aldosterone escape happens"
                    className="min-h-11 flex-1"
                    maxLength={200}
                  />
                  <Button variant="outline" className="min-h-11 gap-1.5" onClick={() => void runAi('explain', aiQuery)} disabled={aiBusy || !aiQuery.trim()}>
                    {aiBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Explain
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-ink-soft">Grounded in this thread and platform lessons when they cover it — the response says honestly when they don&apos;t.</p>
              </div>
            )}

            {aiTab === 'suggest' && (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-ink-soft">
                  Finds platform lessons, MCQ pools and verified external resources for this thread&apos;s topic and subject — measured from the platform, never invented.
                </p>
                <Button variant="outline" className="min-h-11 gap-1.5" onClick={() => void runAi('suggest')} disabled={aiBusy}>
                  {aiBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Suggest what to study
                </Button>
              </div>
            )}

            {aiBusy && (
              <div className="space-y-2" role="status" aria-busy="true">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            )}

            {ai && !aiBusy && <AiResult ai={ai} onPracticeMcqs={practiceMcqs} onOpenHub={openHub} />}
          </div>
        )}
      </section>

      <div>
        <Button variant="ghost" className="min-h-11 gap-1.5 text-xs text-ink-soft" onClick={onBack}>
          <ArrowRight className="size-3.5 rotate-180" aria-hidden /> Back
        </Button>
      </div>

      {/* ── report dialog ── */}
      {reportTarget && (
        <ReportDialog
          open={reportOpen}
          onOpenChange={(v) => {
            setReportOpen(v)
            if (!v) setReportTarget(null)
          }}
          targetLabel={reportTarget.label}
          onSubmit={async (reason, details) => {
            // useCommunityReport toasts the failure and rejects so the dialog stays open
            try { await report(reportTarget, reason, details) } catch { /* keep open */ }
          }}
          reported={!!(reportTarget.postId && reportedIds[reportTarget.postId]) || !!(reportTarget.replyId && reportedIds[reportTarget.replyId])}
        />
      )}
    </div>
  )

  // reply vote (optimistic, scoped to this closure's payload)
  function toggleReplyVote(reply: CommunityReplySummary) {
    if (!payload) return
    const patch = (list: CommunityReplySummary[]) => list.map((x) => (x.id === reply.id
      ? { ...x, votedByYou: !reply.votedByYou, upvotes: reply.upvotes + (reply.votedByYou ? -1 : 1) }
      : x))
    setPayload({ ...payload, replies: patch(payload.replies) })
    api.communityAction({ action: 'vote', replyId: reply.id }).then(
      (res) => setPayload((p) => p
        ? { ...p, replies: p.replies.map((x) => (x.id === reply.id ? { ...x, votedByYou: !!res.voted, upvotes: res.upvotes ?? x.upvotes } : x)) }
        : p),
      () => {
        setPayload((p) => p
          ? { ...p, replies: p.replies.map((x) => (x.id === reply.id ? { ...x, votedByYou: reply.votedByYou, upvotes: reply.upvotes } : x)) }
          : p)
        toast({ title: 'Could not save your vote', description: 'Try again in a moment.', variant: 'destructive' })
      },
    )
  }
}

// ── AI response rendering — badge + disclaimer ALWAYS, fallback honest ───────

function AiResult({
  ai, onPracticeMcqs, onOpenHub,
}: {
  ai: CommunityAiResponse
  onPracticeMcqs: (mcqs: { count: number; subjectCode: string; topicId: string; topicName: string }) => void
  onOpenHub: (topicId: string) => void
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <AIBadge label={ai.aiBadge} />
        {ai.fallback && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold text-sev-warn">
            <ShieldAlert className="size-3" aria-hidden /> Fallback — not grounded right now
          </span>
        )}
      </div>

      {ai.fallback && (
        <p className="text-[11px] leading-relaxed text-sev-warn">
          The AI engine could not ground this response right now — treat it as a generic pointer, not an answer. Verify anything important against a standard source.
        </p>
      )}

      {ai.summary && (
        <div className="space-y-2.5">
          <p className="text-sm leading-relaxed">{ai.summary.overview}</p>
          {ai.summary.keyPoints.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Key points</p>
              <ul className="mt-1 space-y-1">
                {ai.summary.keyPoints.map((k, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{k}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ai.summary.openQuestions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Still open in this thread</p>
              <ul className="mt-1 space-y-1">
                {ai.summary.openQuestions.map((k, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full border border-line bg-surface-2" aria-hidden />{k}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {ai.explanation && (
        <div className="space-y-2.5">
          {!ai.explanation.grounded && (
            <p className="rounded-xl border border-sev-warn/40 bg-sev-warn/10 px-3 py-2 text-[11px] leading-relaxed text-sev-warn">
              Not grounded in platform lessons — this is a general explanation, not course material.
            </p>
          )}
          <p className="whitespace-pre-line text-sm leading-relaxed">{ai.explanation.text}</p>
          {ai.explanation.keyPoints.length > 0 && (
            <ul className="space-y-1">
              {ai.explanation.keyPoints.map((k, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />{k}
                </li>
              ))}
            </ul>
          )}
          {ai.explanation.uncertain && (
            <p className="text-[11px] font-semibold leading-relaxed text-sev-warn">
              The AI flagged uncertainty here — verify against a standard source before you rely on it.
            </p>
          )}
          {ai.explanation.topicId && (
            <Button variant="outline" className="min-h-9 gap-1.5 rounded-full px-3 text-xs" onClick={() => onOpenHub(ai.explanation!.topicId!)}>
              <BookOpen className="size-3.5" aria-hidden /> Open the topic hub{ai.explanation.conceptName ? ` for ${ai.explanation.conceptName}` : ''}
            </Button>
          )}
        </div>
      )}

      {ai.suggestions && (
        <div className="space-y-3">
          <p className="text-[11px] leading-relaxed text-ink-soft">{ai.suggestions.note}</p>
          {ai.suggestions.mcqs && ai.suggestions.mcqs.count > 0 && (
            <button
              type="button"
              onClick={() => onPracticeMcqs(ai.suggestions!.mcqs!)}
              className="clay clay-hover flex min-h-11 w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary" aria-hidden>
                <Sparkles className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                Practice {ai.suggestions.mcqs.count} MCQs on {ai.suggestions.mcqs.topicName}
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
            </button>
          )}
          {ai.suggestions.lessons.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Platform lessons</p>
              <div className="mt-1.5 space-y-1.5">
                {ai.suggestions.lessons.map((l) => (
                  <button
                    key={l.topicId}
                    type="button"
                    onClick={() => onOpenHub(l.topicId)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2 text-left text-xs outline-none ring-primary/50 transition-colors focus-visible:ring-2 hover:bg-surface-2"
                  >
                    <BookOpen className="size-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{l.topicName}</span>
                    <span className="shrink-0 text-[10px] text-ink-soft">{l.lessonCount} lesson{l.lessonCount === 1 ? '' : 's'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {ai.suggestions.resources.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">External resources — open in a new tab</p>
              <div className="mt-1.5 space-y-1.5">
                {ai.suggestions.resources.map((r) => (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2 text-xs outline-none ring-primary/50 transition-colors focus-visible:ring-2 hover:bg-surface-2"
                  >
                    <ExternalLink className="size-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.title}</span>
                      <span className="block truncate text-[10px] text-ink-soft">{r.sourceName} · {r.kind} — external site, not part of Medula</span>
                    </span>
                    <span
                      className={
                        'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ' +
                        (r.urlVerified
                          ? 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok'
                          : 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn')
                      }
                    >
                      {r.urlVerified ? 'link verified' : 'unverified link'}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-line bg-background px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft" role="note">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {ai.disclaimer}
      </p>
    </div>
  )
}


