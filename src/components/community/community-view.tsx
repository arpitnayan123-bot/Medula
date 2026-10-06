'use client'

// ─── MEDICAL LEARNING COMMUNITY & ACCOUNTABILITY · ROOT (PRODUCT 16) ─────────
// State machine: home | space | thread | groups | group | accountability.
// Sticky sub-nav tabs (Home / Spaces / Groups / Accountability) + a Guidelines
// dialog. Deep links: #/community?space=<id> · ?post=<id> · ?tab=groups|accountability
// (parsed on mount) and in-app hand-offs via store.communityFocus
// (openCommunity nonce pattern — store hand-offs take priority over the hash).
// Search is debounced against /api/community/similar (deterministic duplicates).

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Flame, Loader2, ScanSearch, ScrollText, Users, X } from 'lucide-react'
import type { CommunityHomePayload } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { EmptyState, PostCardSkeleton, Reveal } from './community-shared'
import { CommunityHomeScreen, SpacesDirectory } from './community-home'
import { CommunitySpaceScreen } from './community-space'
import { CommunityThreadScreen } from './community-thread'
import { CommunityGroupsScreen } from './community-groups'
import { CommunityGroupDetailScreen } from './community-group-detail'
import { CommunityAccountabilityScreen } from './community-accountability'

type Phase = 'home' | 'spaces' | 'space' | 'thread' | 'groups' | 'group' | 'accountability'
type Tab = 'home' | 'spaces' | 'groups' | 'accountability'
type LoadState = 'loading' | 'ready' | 'error'

interface CommunityHash { space: string | null; post: string | null; tab: Tab | null }

/** Parse #/community?space=<id>&post=<id>&tab=<groups|accountability> — this view's own deep links. */
export function parseCommunityHash(hash?: string): CommunityHash {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  const out: CommunityHash = { space: null, post: null, tab: null }
  if (!h.startsWith('#/community')) return out
  try {
    const qs = h.slice('#/community'.length).replace(/^\?/, '')
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=')
      const val = v ? decodeURIComponent(v) : null
      if (k === 'space' && val) out.space = val
      if (k === 'post' && val) out.post = val
      if (k === 'tab' && (val === 'groups' || val === 'accountability')) out.tab = val
    }
  } catch { /* malformed hash — ignore */ }
  return out
}

function writeCommunityHash(spaceId: string | null, postId: string | null, tab: Tab | null): void {
  if (typeof window === 'undefined') return
  const qs = new URLSearchParams()
  if (spaceId) qs.set('space', spaceId)
  if (postId) qs.set('post', postId)
  if (tab && tab !== 'home') qs.set('tab', tab)
  const target = qs.toString() ? `#/community?${qs.toString()}` : '#/community'
  try { window.history.replaceState(null, '', target) } catch { /* private mode */ }
}

export function CommunityView() {
  const communityFocus = useAppStore((s) => s.communityFocus)
  const closeCommunity = useAppStore((s) => s.closeCommunity)

  // ── deep-link bootstrap (hash) — in-app hand-offs re-fire via the nonce ──
  const [initial] = useState(() => parseCommunityHash())
  const [phase, setPhase] = useState<Phase>(
    initial.post ? 'thread' : initial.space ? 'space' : initial.tab ?? 'home',
  )
  const [spaceId, setSpaceId] = useState<string | null>(initial.space)
  const [postId, setPostId] = useState<string | null>(initial.post)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [threadFrom, setThreadFrom] = useState<'home' | 'space'>('home')

  const [home, setHome] = useState<CommunityHomePayload | null>(null)
  const [homeMeta, setHomeMeta] = useState<{ key: number; state: LoadState }>({ key: 0, state: 'loading' })
  const [homeKey, setHomeKey] = useState(0)
  const [guidelinesOpen, setGuidelinesOpen] = useState(false)

  const homeStale = homeMeta.key !== homeKey

  const loadHome = useCallback((key: number) => {
    setHomeMeta({ key, state: 'loading' })
    api.communityHome().then(
      (p) => { setHome(p); setHomeMeta({ key, state: 'ready' }) },
      () => { setHomeMeta({ key, state: 'error' }) },
    )
  }, [])

  // ── home payload: feeds the home screen AND the Spaces directory tab ──
  // (setTimeout keeps the loading-state write out of the synchronous effect
  // window — react-hooks/set-state-in-effect — behaviour is unchanged)
  useEffect(() => {
    const t = setTimeout(() => loadHome(homeKey), 0)
    return () => clearTimeout(t)
  }, [homeKey, loadHome])

  // ── in-app hand-offs: re-apply whenever openCommunity() bumps the nonce.
  // Store hand-offs take priority over any hash. Render-time state adjustment
  // (react.dev/learn/you-might-not-need-an-effect). ──
  const [lastFocus, setLastFocus] = useState(communityFocus)
  if (communityFocus !== lastFocus) {
    setLastFocus(communityFocus)
    if (communityFocus) {
      if (communityFocus.postId) {
        setPostId(communityFocus.postId)
        setPhase('thread')
        setThreadFrom('home')
      } else if (communityFocus.spaceId) {
        setSpaceId(communityFocus.spaceId)
        setPhase('space')
      } else if (communityFocus.tab) {
        setPhase(communityFocus.tab)
      } else {
        setPhase('home')
      }
    }
  }

  // Clear the external focus channel once consumed.
  useEffect(() => {
    if (communityFocus) closeCommunity()
  }, [communityFocus, closeCommunity])

  // ── keep the URL hash honest with the visible state (shareable links) ──
  useEffect(() => {
    if (phase === 'space') writeCommunityHash(spaceId, null, null)
    else if (phase === 'thread') writeCommunityHash(null, postId, null)
    else if (phase === 'groups') writeCommunityHash(null, null, 'groups')
    else if (phase === 'accountability') writeCommunityHash(null, null, 'accountability')
    else writeCommunityHash(null, null, null)
  }, [phase, spaceId, postId])

  const openSpace = useCallback((id: string) => {
    setSpaceId(id)
    setPhase('space')
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const openThread = useCallback((id: string, from: 'home' | 'space' = 'home') => {
    setPostId(id)
    setThreadFrom(from)
    setPhase('thread')
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const openGroup = useCallback((id: string) => {
    setGroupId(id)
    setPhase('group')
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const goTab = useCallback((t: Tab) => {
    setPhase(t)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const openAccountability = useCallback(() => goTab('accountability'), [goTab])
  const openGroups = useCallback(() => goTab('groups'), [goTab])

  // ── debounced search against the deterministic similar-posts engine ──
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [similar, setSimilar] = useState<{ id: string; title: string; score: number; resolved: boolean }[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    // short queries: nothing to search — the dropdown below only renders when
    // debouncedQ is long enough, so stale similar/searching stay invisible
    if (debouncedQ.length < 2) return
    let alive = true
    const t = setTimeout(() => {
      if (!alive) return
      setSearching(true)
      api.communitySimilar(debouncedQ).then(
        (p) => { if (alive) { setSimilar(p.posts); setSearching(false) } },
        () => { if (alive) { setSimilar([]); setSearching(false) } },
      )
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [debouncedQ])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 pb-10 md:px-6 md:py-7">
      {/* ── sticky sub-nav ── */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-line bg-background/90 px-4 py-2.5 backdrop-blur-xl md:-mx-6 md:px-6">
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Community sections">
          {(phase === 'space' || phase === 'thread' || phase === 'group') && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-9 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => {
                if (phase === 'thread' && threadFrom === 'space' && spaceId) setPhase('space')
                else if (phase === 'group') openGroups()
                else goTab('home')
              }}
            >
              <ArrowLeft className="size-3.5" aria-hidden /> Back
            </Button>
          )}
          <TabPill active={phase === 'home'} onClick={() => goTab('home')} label="Home" />
          <TabPill active={phase === 'space' || phase === 'spaces'} onClick={() => goTab('spaces')} label="Spaces" />
          <TabPill active={phase === 'groups' || phase === 'group'} onClick={openGroups} label="Groups" />
          <TabPill active={phase === 'accountability'} onClick={openAccountability} label="Accountability" />
          <Button
            variant="outline"
            size="sm"
            className="ml-auto min-h-9 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => setGuidelinesOpen(true)}
          >
            <ScrollText className="size-3.5" aria-hidden /> Guidelines
          </Button>
        </nav>
      </div>

      {/* ── debounced search (home tab) ── */}
      {phase === 'home' && (
        <div className="relative mb-5">
          <div className="relative">
            <ScanSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search discussions — people may have asked this already…"
              aria-label="Search community discussions"
              className="h-11 pl-9 pr-9"
              maxLength={120}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-soft hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {debouncedQ.length >= 2 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-line bg-background p-2 shadow-xl" role="region" aria-label="Matching discussions">
              {searching && (
                <p className="flex items-center gap-2 px-2 py-2 text-xs text-ink-soft" role="status" aria-busy="true">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Looking for matching discussions…
                </p>
              )}
              {!searching && similar && similar.length === 0 && (
                <p className="px-2 py-2 text-xs text-ink-soft">
                  No matching discussions yet — try a shorter phrase, or ask it in the Doubt Clearance space.
                </p>
              )}
              {!searching && similar && similar.length > 0 && (
                <ul className="space-y-0.5">
                  {similar.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => { openThread(p.id); setQ('') }}
                        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs transition-colors hover:bg-surface-2"
                      >
                        {p.resolved ? (
                          <Flame className="size-3.5 shrink-0 text-emerald-500" aria-hidden />
                        ) : (
                          <Flame className="size-3.5 shrink-0 text-ink-soft/50" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                        {p.resolved && <span className="shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">resolved</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── phases ── */}
      {(phase === 'home' || phase === 'spaces') && (
        home === null && (homeStale || homeMeta.state === 'loading') ? (
          phase === 'spaces' ? (
            <SectionGridSkeleton /> 
          ) : (
            <div className="space-y-5" role="status" aria-busy="true">
              <Skeleton className="h-8 w-72 max-w-full rounded-lg" />
              <Skeleton className="h-4 w-80 max-w-full" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
              <PostCardSkeleton />
              <PostCardSkeleton />
            </div>
          )
        ) : home === null && homeMeta.state === 'error' ? (
          <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
            <h1 className="text-lg font-semibold tracking-tight">The community didn&apos;t load</h1>
            <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
              The community engine did not respond — it may still be warming up. Nothing is lost; retry below.
            </p>
            <Button variant="outline" className="min-h-11" onClick={() => setHomeKey((k) => k + 1)}>
              Retry
            </Button>
          </div>
        ) : home ? (
          phase === 'home' ? (
            <Reveal index={0}>
              <CommunityHomeScreen
                home={home}
                onOpenSpace={openSpace}
                onOpenThread={(id) => openThread(id, 'home')}
                onOpenGroup={openGroup}
                onOpenGroups={openGroups}
                onOpenAccountability={openAccountability}
                onOpenGuidelines={() => setGuidelinesOpen(true)}
              />
            </Reveal>
          ) : (
            <Reveal index={0}>
              <SpacesDirectory home={home} onOpenSpace={openSpace} />
            </Reveal>
          )
        ) : null
      )}

      {phase === 'space' && spaceId && (
        <CommunitySpaceScreen spaceId={spaceId} onOpenThread={(id) => openThread(id, 'space')} />
      )}

      {phase === 'thread' && postId && (
        <CommunityThreadScreen
          postId={postId}
          onBack={() => {
            if (threadFrom === 'space' && spaceId) setPhase('space')
            else goTab('home')
          }}
          onOpenSpace={openSpace}
          onOpenThread={(id) => openThread(id, threadFrom)}
        />
      )}

      {phase === 'groups' && (
        <CommunityGroupsScreen
          onOpenGroup={openGroup}
          onOpenSpace={openSpace}
          onGroupsChanged={() => loadHome(homeKey)}
        />
      )}

      {phase === 'group' && groupId && (
        <CommunityGroupDetailScreen
          groupId={groupId}
          onOpenThread={(id) => openThread(id, 'home')}
          onBack={openGroups}
          onOpenAccountability={openAccountability}
        />
      )}

      {phase === 'accountability' && <CommunityAccountabilityScreen />}

      {/* ── guidelines dialog ── */}
      <Dialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ScrollText className="size-4 text-primary" aria-hidden /> Community guidelines
            </DialogTitle>
            <DialogDescription>
              A focused, moderated, educational community — not a social network.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed" aria-label="Guidelines">
            {GUIDELINES.map((g) => (
              <li key={g.title} className="rounded-xl border border-line bg-surface-2/50 p-3.5">
                <p className="text-xs font-semibold">{g.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{g.body}</p>
              </li>
            ))}
          </ul>
          <Button className="min-h-11" onClick={() => setGuidelinesOpen(false)}>Got it</Button>
        </DialogContent>
      </Dialog>

      {/* honest empty state when a drill-down lost its target (bad link) */}
      {((phase === 'space' && !spaceId) || (phase === 'thread' && !postId) || (phase === 'group' && !groupId)) && (
        <EmptyState
          icon={Users}
          title="That link didn't point anywhere"
          hint="The discussion or space it referenced is gone, or was never there. Head back to the community home."
          action={<Button className="min-h-11" onClick={() => goTab('home')}>Community home</Button>}
        />
      )}
    </div>
  )
}

// ── tab pill ─────────────────────────────────────────────────────────────────

function TabPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-9 items-center rounded-full border px-3.5 text-xs font-semibold outline-none ring-primary/50 transition-colors focus-visible:ring-2',
        active
          ? 'border-primary/40 bg-primary/12 text-primary'
          : 'border-transparent text-ink-soft hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

// ── spaces-directory skeleton ──────────────────────────────────────────────────

function SectionGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="clay rounded-2xl p-4" aria-hidden>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-24" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-3 h-4 w-3/4 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ── guidelines copy (mirrors the frozen honesty contract) ────────────────────

const GUIDELINES: { title: string; body: string }[] = [
  {
    title: 'Learn together, not competitively',
    body: 'Ask real doubts, answer what you know, cite what you can. Upvote generously — and downvote nothing you cannot explain better.',
  },
  {
    title: 'No patient identities — ever',
    body: 'Posts and replies are scanned for patient-identifying details (names, MRD numbers, dates, faces). Blocked content never goes live. De-identify: age, sex, setting.',
  },
  {
    title: 'AI assistance is labelled',
    body: 'AI-drafted replies and AI answers always carry an AI-ASSISTED badge and a disclaimer. They are study aids, not verified medical advice.',
  },
  {
    title: 'Peers here are demo members',
    body: 'Other members, their posts and their progress numbers are seeded examples so the community is useful from day one. Your posts, votes and progress are real.',
  },
  {
    title: 'Privacy by default',
    body: 'Private groups show nothing to non-members. Your performance is never shared with a group unless you explicitly switch sharing on for that group.',
  },
  {
    title: "Report, don't argue",
    body: 'Spam, abuse, misinformation or privacy concerns: report them. Moderators review every report; held-for-review posts are hidden until cleared.',
  },
]
