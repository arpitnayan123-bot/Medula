'use client'

// ─── COMMUNITY · SPACE SCREEN (PRODUCT 16) ───────────────────────────────────
// One space: header (kind chip, description, collapsible rules), a composer
// whose blocked verdict (deterministic PHI scan) is rendered prominently with
// the text kept for editing, filter/sort chips, and PostCard rows. Topic chips
// hand off to the Topic Hub; your own posts carry a confirm-toast delete.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, Loader2, MessageSquarePlus, RefreshCw, Send, ShieldAlert,
} from 'lucide-react'
import type {
  CommunityCreatePostResult, CommunityPostKind, CommunityPostSummary, CommunitySpaceDetail,
} from '@/lib/types'
import type { SubjectSummary } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  BlockedPanel, EmptyState, KindChip, MicroLabel, PostCard, PostCardSkeleton, Reveal,
  SPACE_KIND_LABEL,
} from './community-shared'

type LoadState = 'loading' | 'ready' | 'error'
type StatusFilter = 'all' | 'open' | 'resolved'
type SortKey = 'recent' | 'top'

const POST_KINDS: { value: CommunityPostKind; label: string }[] = [
  { value: 'question', label: 'Question — ask a real doubt' },
  { value: 'discussion', label: 'Discussion — start a conversation' },
  { value: 'pyq', label: 'PYQ — previous-year question' },
  { value: 'mcq', label: 'MCQ — a stumper worth dissecting' },
  { value: 'case', label: 'Case — de-identified clinical finding' },
]

export function CommunitySpaceScreen({
  spaceId, onOpenThread,
}: {
  spaceId: string
  onOpenThread: (id: string) => void
}) {
  const openHub = useAppStore((s) => s.openHub)

  const [detail, setDetail] = useState<CommunitySpaceDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  // filters + sort (client-side — the payload is space-scoped already)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [kind, setKind] = useState<'all' | CommunityPostKind>('all')
  const [sort, setSort] = useState<SortKey>('recent')

  // composer
  const [composerOpen, setComposerOpen] = useState(false)
  const [subjects, setSubjects] = useState<SubjectSummary[]>([])
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [pKind, setPKind] = useState<CommunityPostKind>('question')
  const [pTitle, setPTitle] = useState('')
  const [pBody, setPBody] = useState('')
  const [pTags, setPTags] = useState('')
  const [pSubject, setPSubject] = useState('')
  const [pTopic, setPTopic] = useState('')
  const [blocked, setBlocked] = useState<{ reasons: CommunityCreatePostResult['reasons']; guidance: string | null } | null>(null)
  const [posting, setPosting] = useState(false)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    setState('loading')
    setDetail(null)
    api.communitySpace(spaceId).then(
      (p) => { if (alive) { setDetail(p); setState('ready') } },
      () => { if (alive) setState('error') },
    )
    return () => { alive = false }
  }, [spaceId, reloadKey])

  // subjects for the composer — fetched once, when the composer first opens
  useEffect(() => {
    if (!composerOpen || subjects.length > 0) return
    api.subjects().then(
      (res) => setSubjects(res.subjects),
      () => setSubjects([]),
    )
  }, [composerOpen, subjects.length])

  // topics for the chosen subject — the lighter path: one small fetch of that
  // subject's topic list (no full-curriculum browse)
  useEffect(() => {
    if (!pSubject) { setTopics([]); setPTopic(''); return }
    const subj = subjects.find((s) => s.code === pSubject)
    if (!subj) return
    let alive = true
    setTopicsLoading(true)
    api.subject(subj.id).then(
      (res) => { if (alive) { setTopics(res.topics.map((t) => ({ id: t.id, name: t.name }))); setTopicsLoading(false) } },
      () => { if (alive) { setTopics([]); setTopicsLoading(false) } },
    )
    return () => { alive = false }
  }, [pSubject, subjects])

  const posts = detail?.posts ?? []
  const visible = useMemo(() => {
    let list = [...posts]
    if (status === 'open') list = list.filter((p) => !p.resolved)
    if (status === 'resolved') list = list.filter((p) => p.resolved)
    if (kind !== 'all') list = list.filter((p) => p.kind === kind)
    list.sort((a, b) => sort === 'top'
      ? b.upvotes - a.upvotes
      : new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    )
    return list
  }, [posts, status, kind, sort])

  // ── mutations ──────────────────────────────────────────────────────────────
  const patchPost = (id: string, patch: Partial<CommunityPostSummary>) => {
    setDetail((d) => d ? { ...d, posts: d.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : d)
  }

  const toggleVote = (post: CommunityPostSummary) => {
    patchPost(post.id, { votedByYou: !post.votedByYou, upvotes: post.upvotes + (post.votedByYou ? -1 : 1) })
    api.communityAction({ action: 'vote', postId: post.id }).then(
      (res) => patchPost(post.id, { votedByYou: !!res.voted, upvotes: res.upvotes ?? post.upvotes }),
      () => {
        patchPost(post.id, { votedByYou: post.votedByYou, upvotes: post.upvotes })
        toast({ title: 'Could not save your vote', description: 'Try again in a moment.', variant: 'destructive' })
      },
    )
  }

  const toggleSave = (post: CommunityPostSummary) => {
    patchPost(post.id, { savedByYou: !post.savedByYou })
    api.communityAction({ action: 'save', postId: post.id }).then(
      (res) => patchPost(post.id, { savedByYou: !!res.saved }),
      () => {
        patchPost(post.id, { savedByYou: post.savedByYou })
        toast({ title: 'Could not update saved', description: 'Try again in a moment.', variant: 'destructive' })
      },
    )
  }

  const doDelete = (post: CommunityPostSummary) => {
    patchPost(post.id, { status: 'removed' })
    api.communityPostDelete(post.id).then(
      () => {
        setDetail((d) => d ? { ...d, posts: d.posts.filter((p) => p.id !== post.id) } : d)
        toast({ title: 'Post deleted', description: 'It was removed for everyone.' })
      },
      () => {
        patchPost(post.id, { status: post.status })
        toast({ title: 'Could not delete', description: 'Try again in a moment.', variant: 'destructive' })
      },
    )
  }

  const confirmDelete = (post: CommunityPostSummary) => {
    toast({
      title: 'Delete this post?',
      description: `“${post.title}” will be removed for everyone. This cannot be undone.`,
      action: <ToastAction altText="Delete post" onClick={() => void doDelete(post)}>Delete</ToastAction>,
    })
  }

  const openComposer = () => {
    setPKind('question'); setPTitle(''); setPBody(''); setPTags('')
    setPSubject(detail?.space.subjectCode ?? ''); setPTopic(''); setBlocked(null)
    setComposerOpen(true)
  }

  const submitPost = async () => {
    if (!pTitle.trim() || !pBody.trim() || posting) return
    setPosting(true)
    try {
      const res = await api.communityPostCreate({
        spaceId,
        kind: pKind,
        title: pTitle.trim(),
        body: pBody.trim(),
        tags: pTags ? pTags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean).slice(0, 5) : undefined,
        subjectCode: pSubject || undefined,
        topicId: pTopic || undefined,
      })
      if (res.blocked) {
        // keep the dialog open and the text intact — the verdict is rendered above the form
        setBlocked({ reasons: res.reasons, guidance: res.guidance })
        toast({ title: 'Not posted', description: 'The scan found identifying details — see the composer.', variant: 'destructive' })
        return
      }
      if (res.post) {
        setComposerOpen(false)
        toast({ title: 'Posted', description: 'Your post is live in this space.' })
        refetch()
      } else {
        toast({ title: 'Could not post', description: 'The server did not return the post. Try again.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not post', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setPosting(false)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
        <ShieldAlert className="size-6 text-ink-soft" aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight">This space didn&apos;t load</h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
          The community engine did not respond — it may still be warming up. Nothing is lost; retry below.
        </p>
        <Button variant="outline" className="min-h-11" onClick={refetch}>Retry</Button>
      </div>
    )
  }

  if (state === 'loading' || !detail) {
    return (
      <div className="space-y-5" role="status" aria-busy="true">
        <SkeletonHeader />
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    )
  }

  const s = detail.space
  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <Reveal index={0}>
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <KindChip kind={s.kind} />
            <MicroLabel>{SPACE_KIND_LABEL[s.kind] ?? s.kind}{s.subjectCode ? ` · ${s.subjectCode}` : ''}</MicroLabel>
            <Button
              variant="ghost" size="icon" onClick={refetch} aria-label="Refresh this space"
              className="ml-auto size-11 shrink-0 rounded-xl text-ink-soft"
            >
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          </div>
          <h1 className="text-xl font-bold leading-snug tracking-tight md:text-2xl">{s.name}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">{s.description}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <SpaceStat value={s.posts} label="posts" />
            <SpaceStat value={s.replies} label="replies" />
            {s.unresolved > 0 && <SpaceStat value={s.unresolved} label="unresolved" tone="warn" />}
            <SpaceStat value={s.activeToday} label="active today" />
            {s.groupCount > 0 && <SpaceStat value={s.groupCount} label="study groups" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11 gap-1.5" onClick={openComposer}>
              <MessageSquarePlus className="size-4" aria-hidden /> New post
            </Button>
            {detail.rules.length > 0 && <RulesDisclosure rules={detail.rules} />}
          </div>
        </header>
      </Reveal>

      {/* ── filter + sort chips ── */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter and sort posts">
        <FilterPill active={status === 'all'} onClick={() => setStatus('all')}>All</FilterPill>
        <FilterPill active={status === 'open'} onClick={() => setStatus('open')}>Open</FilterPill>
        <FilterPill active={status === 'resolved'} onClick={() => setStatus('resolved')}>Resolved</FilterPill>
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden />
        <FilterPill active={kind === 'all'} onClick={() => setKind('all')}>Any kind</FilterPill>
        {POST_KINDS.map((k) => (
          <FilterPill key={k.value} active={kind === k.value} onClick={() => setKind(k.value)}>{k.value}</FilterPill>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          <FilterPill active={sort === 'recent'} onClick={() => setSort('recent')}>Recent</FilterPill>
          <FilterPill active={sort === 'top'} onClick={() => setSort('top')}>Top</FilterPill>
        </span>
      </div>

      {/* ── posts ── */}
      {posts.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title="No posts in this space yet"
          hint="Be the first — ask a real doubt, share a de-identified case, or start a discussion. Answered questions earn contribution score."
          action={<Button className="min-h-11" onClick={openComposer}>Write the first post</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing matches these filters"
          hint="Try clearing the kind or status filter — the posts are all still here."
          action={<Button variant="outline" className="min-h-11" onClick={() => { setStatus('all'); setKind('all') }}>Clear filters</Button>}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onOpen={onOpenThread}
              onToggleVote={toggleVote}
              onToggleSave={toggleSave}
              onDelete={confirmDelete}
              onOpenTopic={(post) => openHub(post.topicId)}
            />
          ))}
        </div>
      )}

      {/* ── composer dialog ── */}
      <Dialog open={composerOpen} onOpenChange={(v) => { setComposerOpen(v); if (!v) setBlocked(null) }}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">New post in {s.name}</DialogTitle>
            <DialogDescription>
              A focused, educational post — de-identify everything: no names, MRD numbers, dates or faces.
            </DialogDescription>
          </DialogHeader>

          {blocked && (
            <div className="space-y-2">
              <BlockedPanel reasons={blocked.reasons} guidance={blocked.guidance} />
              <p className="text-[11px] text-ink-soft">
                Your text is kept below — edit it and post again once it&apos;s de-identified.
              </p>
            </div>
          )}

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="post-kind">Kind</Label>
              <Select value={pKind} onValueChange={(v) => setPKind(v as CommunityPostKind)}>
                <SelectTrigger id="post-kind" aria-label="Post kind" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title" value={pTitle} onChange={(e) => setPTitle(e.target.value)}
                placeholder="One clear line — e.g. “Why does spironolactone spare potassium?”"
                maxLength={140} className="min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-body">Details</Label>
              <Textarea
                id="post-body" value={pBody} onChange={(e) => setPBody(e.target.value)}
                placeholder="What you tried, what you expected, where you're stuck. De-identify any clinical detail."
                className="min-h-32" maxLength={4000}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-tags">Tags (comma-separated, optional)</Label>
              <Input
                id="post-tags" value={pTags} onChange={(e) => setPTags(e.target.value)}
                placeholder="e.g. pharmacology, electrolytes"
                maxLength={120} className="min-h-11"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="post-subject">Subject (optional)</Label>
                <Select
                  value={pSubject || 'none'}
                  onValueChange={(v) => { setPSubject(v === 'none' ? '' : v); setPTopic('') }}
                >
                  <SelectTrigger id="post-subject" aria-label="Subject" className="min-h-11 w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No subject link</SelectItem>
                    {subjects.map((sub) => (
                      <SelectItem key={sub.id} value={sub.code}>{sub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-topic">Topic (optional)</Label>
                {topicsLoading ? (
                  <div className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-xs text-ink-soft" aria-live="polite">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading topics…
                  </div>
                ) : (
                  <Select value={pTopic || 'none'} onValueChange={(v) => setPTopic(v === 'none' ? '' : v)} disabled={!pSubject}>
                    <SelectTrigger id="post-topic" aria-label="Topic" className="min-h-11 w-full">
                      <SelectValue placeholder={pSubject ? 'Pick a topic' : 'Pick a subject first'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No topic link</SelectItem>
                      {topics.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => { setComposerOpen(false); setBlocked(null) }}>
              Cancel
            </Button>
            <Button className="min-h-11 gap-1.5" onClick={() => void submitPost()} disabled={!pTitle.trim() || !pBody.trim() || posting}>
              {posting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {posting ? 'Posting…' : 'Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── locals ───────────────────────────────────────────────────────────────────

function SkeletonHeader() {
  return (
    <header className="space-y-3" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-7 w-3/4 max-w-md rounded-lg" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-11 w-28 rounded-xl" />
    </header>
  )
}

function SpaceStat({ value, label, tone }: { value: number; label: string; tone?: 'warn' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        tone === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-line bg-surface-2 text-ink-soft',
      )}
    >
      <span className="tabular-nums">{value}</span> {label}
    </span>
  )
}

function RulesDisclosure({ rules }: { rules: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <Button variant="outline" className="min-h-11 gap-1.5" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Rules <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </Button>
      {open && (
        <ul className="mt-2 max-h-96 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-surface-2/50 p-3.5" aria-label="Space rules">
          {rules.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-h-9 items-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
        active ? 'border-primary/40 bg-primary/12 text-primary' : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
