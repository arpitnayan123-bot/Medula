'use client'

// ─── EXPLORE MEDICINE — one search across curriculum, research, institutions ──
// Source-first by construction: every result links to its ORIGINAL source,
// unverified things say so, and the AI summary is grounded in retrieved
// sources only. We index metadata and never reproduce copyrighted content.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, Compass, CornerDownRight, ExternalLink, FlaskConical, Globe2,
  GraduationCap, Landmark, Loader2, ScrollText, Search, ShieldAlert,
  ShieldCheck, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FEATURES } from '@/lib/feature-flags'
import { PageHeader } from '@/components/primitives/kit'
import { Aurora } from '@/components/primitives/aura'
import { Stagger, StaggerItem } from '@/components/primitives/motion'
import { OrbitRings } from '@/components/primitives/scenery'
import type { SourceRecord } from '@/lib/institutions-registry'
import { cn } from '@/lib/utils'

// ── API shapes (mirror of /api/explore + /api/institutions) ──────────────────
interface LearnItem {
  type: 'topic' | 'concept'
  id: string
  title: string
  subtitle: string
  subjectColor: string
}

interface ResearchItem {
  pmid: string
  title: string
  authors: string
  journal: string
  pubYear: string
  isOpenAccess: boolean
  url: string
}

interface WebItem {
  title: string
  url: string
  snippet: string
  host: string
  date: string
  retrievedAt: string
}

interface ExploreResponse {
  query: string
  groups: {
    learn: LearnItem[]
    research: ResearchItem[]
    institutions: SourceRecord[]
    web: { courses: WebItem[]; guidelines: WebItem[]; resources: WebItem[] }
  }
  summary: { text: string; note: string } | null
  provenance: { retrievedAt: string; sources: string[] }
  notes: string[]
}

const EXAMPLES = ['heart failure', 'free cardiology course', 'AIIMS cardiology research', 'sepsis guidelines']

const KIND_LABEL: Record<SourceRecord['kind'], string> = {
  AIIMS: 'AIIMS',
  GOVERNMENT: 'Government',
  DATABASE: 'Database',
  GLOBAL_UNIVERSITY: 'University',
  SOCIETY: 'Society',
}

const ACCESS_LABEL: Record<SourceRecord['accessType'], string> = {
  PUBLIC: 'Public',
  REGISTRATION: 'Registration',
  PAID: 'Paid',
  MIXED: 'Mixed',
  UNKNOWN: 'Unknown',
}

// ── small building blocks ────────────────────────────────────────────────────
function GroupHeader({ icon: Icon, title, count }: { icon: typeof Compass; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="clay-in grid h-8 w-8 shrink-0 place-items-center rounded-xl" aria-hidden="true">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-soft">{title}</h2>
      <span className="clay-in rounded-full px-2 py-0.5 text-[10px] font-bold text-ink-soft">{count}</span>
    </div>
  )
}

function VerificationBadge({ record }: { record: SourceRecord }) {
  return record.urlVerified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      Verified {record.lastVerified ?? ''}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold text-sev-warn">
      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
      Verification pending
    </span>
  )
}

function WebSubgroup({
  icon: Icon, label, items,
}: { icon: typeof Compass; label: string; items: WebItem[] }) {
  if (items.length === 0) return null
  const retrievedAt = items[0]?.retrievedAt ?? ''
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-ink-soft" aria-hidden="true" />
        <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">{label}</h3>
        <span className="text-[10px] font-semibold text-ink-soft/70">{items.length}</span>
      </div>
      <ul className="space-y-2">
        {items.map((w) => (
          <li key={w.url} className="clay clay-hover rounded-2xl p-3">
            <a
              href={w.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-11 items-start justify-between gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{w.title}</p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-ink-soft">{w.host || 'web'}</p>
                {w.snippet && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft/90">{w.snippet}</p>
                )}
              </div>
              <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-ink-soft group-hover:text-primary" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[10.5px] leading-relaxed text-ink-soft/80">
        Found via live web search on {retrievedAt}. We link out and never host course content. Confirm free/paid status at the source.
      </p>
    </div>
  )
}

function SkeletonBlock() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="clay-in h-16 animate-pulse rounded-2xl" />
      ))}
    </div>
  )
}

// ── the view ─────────────────────────────────────────────────────────────────
function ExploreInner({ onNavigate }: { onNavigate?: (view: string, payload?: string) => void }) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ExploreResponse | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim()
    if (q.length < 2) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setQuery(q)
    setDraft(q)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/explore?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      const json = (await res.json()) as ExploreResponse
      setData(json)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setData(null)
      setError(err instanceof Error ? err.message : 'Something went wrong while searching.')
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const submitted = Boolean(query)
  const g = data?.groups
  const webTotal = g ? g.web.courses.length + g.web.guidelines.length + g.web.resources.length : 0
  const hasResults = Boolean(
    g && (g.learn.length > 0 || g.research.length > 0 || g.institutions.length > 0 || webTotal > 0),
  )

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      {/* ── HERO (scenery: faint knowledge orbits behind the search zone) ─── */}
      <div className="relative">
        <Aurora intensity={0.55} />
        <OrbitRings className="opacity-25" />
        <div className="relative z-10">
      <header>
        <PageHeader
          eyebrow={
            <>
              <Compass className="mr-1 inline size-3" />
              Knowledge OS
            </>
          }
          title="Explore Medicine"
          intro="One search across your curriculum, real research, official institutions, and the open web — every result linked to its original source."
        />
      </header>

      {/* ── SEARCH ───────────────────────────────────────────────────────── */}
      <form
        role="search"
        className="clay mt-6 flex items-center gap-2 rounded-3xl p-2"
        onSubmit={(e) => { e.preventDefault(); void runSearch(draft) }}
      >
        <Search className="ml-3 h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search topics, papers, institutions, courses…"
          aria-label="Search medicine across all sources"
          className="min-h-11 flex-1 border-0 bg-transparent text-base font-medium shadow-none focus-visible:ring-0"
          maxLength={120}
        />
        <Button
          type="submit"
          size="lg"
          className="clay-btn min-h-11 gap-2 rounded-2xl px-5 font-bold"
          disabled={loading || draft.trim().length < 2}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          <span className="hidden sm:inline">{loading ? 'Searching' : 'Search'}</span>
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => void runSearch(ex)}
            className="clay-in min-h-9 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {ex}
          </button>
        ))}
      </div>
        </div>
      </div>

      {/* ── LEGEND (pre-search) ──────────────────────────────────────────── */}
      {!submitted && !loading && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-8"
          aria-label="What this search covers"
        >
          <Stagger className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: BookOpen, t: 'Learn', d: 'Your local curriculum graph — topics and concepts, offline and yours.' },
              { icon: FlaskConical, t: 'Research', d: 'Real paper metadata from Europe PMC — always linked to the original.' },
              { icon: Landmark, t: 'Institutions', d: 'Official sources with an honest verification badge for every URL.' },
              { icon: Globe2, t: 'On the web', d: 'Live discovery of courses, guidelines and resources — linked, never hosted.' },
            ].map((c) => (
              <StaggerItem key={c.t}>
                <div className="clay rounded-2xl p-4">
                  <div className="flex items-center gap-2.5">
                    <c.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    <p className="text-sm font-bold text-foreground">{c.t}</p>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{c.d}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </motion.section>
      )}

      {/* ── SKELETONS ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="mt-8 space-y-4" role="status" aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <div key={i} className="clay space-y-3 rounded-3xl p-4">
              <div className="clay-in h-6 w-40 animate-pulse rounded-xl" />
              <SkeletonBlock />
            </div>
          ))}
        </div>
      )}

      {/* ── ERROR + RETRY ────────────────────────────────────────────────── */}
      {error && !loading && (
        <div className="clay mt-8 rounded-3xl border border-sev-crit/30 p-5 text-center" role="alert">
          <ShieldAlert className="mx-auto h-6 w-6 text-sev-crit" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-foreground">{error}</p>
          <Button variant="outline" className="clay-btn-soft mt-3 min-h-11 rounded-2xl px-5 font-bold" onClick={() => void runSearch(query)}>
            Retry
          </Button>
        </div>
      )}

      {/* ── HONEST EMPTY STATE ───────────────────────────────────────────── */}
      {submitted && !loading && !error && !hasResults && (
        <div className="clay mt-8 rounded-3xl p-6 text-center">
          <Compass className="mx-auto h-6 w-6 text-ink-soft" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-foreground">Nothing found for “{query}” yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
            MEDULA does not invent results. Try a broader medical term, or one of the example searches above.
          </p>
        </div>
      )}

      {/* ── RESULTS ──────────────────────────────────────────────────────── */}
      {submitted && !loading && data && hasResults && (
        <div className="mt-8 space-y-5">
          {/* AI SUMMARY (grounded, labelled) */}
          {data.summary && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="clay rounded-3xl p-5"
              aria-label="AI summary grounded in retrieved sources"
            >
              <div className="flex items-center gap-2.5">
                <span className="clay-in grid h-8 w-8 shrink-0 place-items-center rounded-xl" aria-hidden="true">
                  <Sparkles className="h-4 w-4 text-primary" />
                </span>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-soft">AI Summary</h2>
                <span className="rounded-full bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold text-sev-warn">AI output</span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground">{data.summary.text}</p>
              <p className="mt-3 border-t border-border/60 pt-2.5 text-[11px] leading-relaxed text-ink-soft">{data.summary.note}</p>
            </motion.section>
          )}

          {/* LEARN — local curriculum graph */}
          {g && g.learn.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="clay rounded-3xl p-4 sm:p-5"
              aria-label="Learn from your curriculum"
            >
              <GroupHeader icon={BookOpen} title="Learn — your curriculum" count={g.learn.length} />
              <ul className="mt-3 space-y-1.5">
                {g.learn.map((l) => (
                  <li key={`${l.type}-${l.id}`}>
                    <button
                      type="button"
                      onClick={() => onNavigate?.('understand', l.type === 'concept' ? l.id : undefined)}
                      className="group flex min-h-11 w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: l.subjectColor }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">{l.title}</span>
                        <span className="block truncate text-[11px] font-medium text-ink-soft">{l.subtitle}</span>
                      </span>
                      <CornerDownRight className="h-4 w-4 shrink-0 text-ink-soft/60 group-hover:text-primary" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* RESEARCH — Europe PMC */}
          {g && g.research.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="clay rounded-3xl p-4 sm:p-5"
              aria-label="Research papers from Europe PMC"
            >
              <GroupHeader icon={FlaskConical} title="Research — Europe PMC" count={g.research.length} />
              <ul className="mt-3 space-y-2">
                {g.research.map((r) => (
                  <li key={r.pmid} className="clay clay-hover rounded-2xl p-3">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-h-11 items-start justify-between gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="min-w-0">
                        <span className="line-clamp-2 block text-sm font-semibold leading-snug text-foreground group-hover:text-primary">{r.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-ink-soft">
                          <span className="truncate">{r.journal}{r.pubYear ? ` · ${r.pubYear}` : ''}</span>
                          {r.isOpenAccess && (
                            <span className="rounded-full bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">OPEN ACCESS</span>
                          )}
                        </span>
                      </span>
                      <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-ink-soft group-hover:text-primary" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="clay-btn-soft mt-3 min-h-11 w-full rounded-2xl font-bold sm:w-auto"
                onClick={() => onNavigate?.('research', data.query)}
              >
                Open Research Hub
              </Button>
            </motion.section>
          )}

          {/* INSTITUTIONS — official sources */}
          {g && g.institutions.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="clay rounded-3xl p-4 sm:p-5"
              aria-label="Official institutions and databases"
            >
              <GroupHeader icon={Landmark} title="Institutions — official sources" count={g.institutions.length} />
              <ul className="med-scroll mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                {g.institutions.map((inst) => (
                  <li key={inst.slug} className="clay clay-hover rounded-2xl p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-foreground">{inst.name}</p>
                          <span className="clay-in rounded-full px-2 py-0.5 text-[10px] font-bold text-ink-soft">{KIND_LABEL[inst.kind]}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <VerificationBadge record={inst} />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft/80">
                            {ACCESS_LABEL[inst.accessType]} access · {inst.country}
                          </span>
                        </div>
                      </div>
                      <a
                        href={inst.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open the official website of ${inst.name}`}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-ink-soft transition hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* ON THE WEB — live discovery */}
          {g && webTotal > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="clay space-y-5 rounded-3xl p-4 sm:p-5"
              aria-label="Courses, guidelines and resources found on the web"
            >
              <GroupHeader icon={Globe2} title="On the web — live discovery" count={webTotal} />
              <WebSubgroup icon={GraduationCap} label="Courses" items={g.web.courses} />
              <WebSubgroup icon={ScrollText} label="Guidelines" items={g.web.guidelines} />
              <WebSubgroup icon={Globe2} label="Resources" items={g.web.resources} />
            </motion.section>
          )}

          {/* honest degradation notes */}
          {data.notes.length > 0 && (
            <div className="clay-in rounded-2xl p-3.5" role="note">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sev-warn">What did not load</p>
              <ul className="mt-1.5 space-y-1">
                {data.notes.map((n, i) => (
                  <li key={i} className="text-xs leading-relaxed text-ink-soft">· {n}</li>
                ))}
              </ul>
            </div>
          )}

          {/* provenance */}
          <p className="px-2 text-center text-[11px] leading-relaxed text-ink-soft">
            Sources: {data.provenance.sources.join(' · ')} — retrieved {data.provenance.retrievedAt}
          </p>
        </div>
      )}

      {/* ── VIEW FOOTER (source-first promise) ───────────────────────────── */}
      <footer className="mt-10 border-t border-border/60 pt-4 text-center">
        <p className="mx-auto max-w-lg text-[11px] leading-relaxed text-ink-soft">
          MEDULA indexes metadata and always links to the original source. We never reproduce copyrighted material.
        </p>
      </footer>
    </div>
  )
}

export function ExploreView({ onNavigate }: { onNavigate?: (view: string, payload?: string) => void }) {
  if (!FEATURES.ENABLE_EXPLORE) return null
  return <ExploreInner onNavigate={onNavigate} />
}
