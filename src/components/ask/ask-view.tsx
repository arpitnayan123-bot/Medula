'use client'

// ─── AI MEDICAL SEARCH & ANSWER ENGINE · VIEW (PRODUCT 15) ───────────────────
// Search → Understand → Verify → Explore → Learn, on one page. Search-first
// and mobile-first: ask once, get a grounded answer at four levels, verified
// sources, knowledge-graph connections, measured practice, one-tap revision —
// then keep the thread going with conversational follow-ups.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowUpRight, BookMarked, CircleHelp, Compass, FlaskConical,
  Landmark, Lightbulb, ListChecks, Loader2, Network, ScanSearch, Send,
  ShieldCheck, Sparkles, Stethoscope, Undo2, Wrench,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { AskAnswerPayload, AskFollowKind, AskFollowPayload, AskHomePayload, AskLevel } from '@/lib/types'
import type { AskThreadDetail } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  AiBadgeRow, ConnectionGroup, HighYieldList, KeyPoints, LevelChips, MasteryChip,
  Reveal, SectionCard, SourceRow, UncertainBanner,
} from './ask-shared'
import { AskQuiz } from './ask-quiz'

type Msg = AskThreadDetail['messages'][number]

function parseAskHash(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash
  if (!h.startsWith('#/ask')) return null
  const qs = h.slice('#/ask'.length).replace(/^\?/, '')
  for (const part of qs.split('&')) {
    const [k, v] = part.split('=')
    if (k === 'q' && v) {
      try { return decodeURIComponent(v) } catch { return null }
    }
  }
  return null
}

function writeAskHash(q: string | null): void {
  if (typeof window === 'undefined') return
  try { window.history.replaceState(null, '', q ? `#/ask?q=${encodeURIComponent(q)}` : '#/ask') } catch { /* private mode */ }
}

export function AskView() {
  const { askFocus, closeAsk, openConcept, openSim, openLibrary, setQuizPreset, setView } = useAppStore()
  const { toast } = useToast()
  const [home, setHome] = useState<AskHomePayload | null>(null)
  const [page, setPage] = useState<AskAnswerPayload | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [followInput, setFollowInput] = useState('')
  const [busy, setBusy] = useState<'' | 'search' | 'followup' | 'level' | 'thread'>('')
  const [error, setError] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareWith, setCompareWith] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const hashConsumed = useRef(false)

  const loadHome = useCallback(async () => {
    try {
      const h = await api.askHome()
      setHome(h)
    } catch { /* home is best-effort; the search box still works */ }
  }, [])

  useEffect(() => {
    if (!page) void loadHome()
  }, [])

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const runSearch = useCallback(async (q: string) => {
    const query = q.trim()
    if (query.length < 2 || busy === 'search') return
    setBusy('search')
    setError(null)
    setMessages([])
    setCompareOpen(false)
    try {
      const p = await api.askSearch({ q: query })
      setPage(p)
      writeAskHash(query)
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The engine could not answer — try again.')
    } finally {
      setBusy('')
    }
  }, [busy])

  const loadThread = useCallback(async (id: string) => {
    setBusy('thread')
    setError(null)
    try {
      const { thread } = await api.askThread(id)
      setPage(thread.page)
      setMessages(thread.messages)
      writeAskHash(null)
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reopen that thread.')
    } finally {
      setBusy('')
    }
  }, [])

  const sendFollowup = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || !page?.threadId || busy === 'followup') return
    setBusy('followup')
    setError(null)
    setMessages((m) => [...m, { role: 'user', kind: 'text', text: message }])
    setFollowInput('')
    setCompareOpen(false)
    setCompareWith('')
    try {
      const res = await api.askFollowup({ threadId: page.threadId, message })
      setMessages((m) => [...m, { role: 'assistant', kind: res.kind, text: res.reply, payload: res }])
      scrollToBottom()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The follow-up failed — try again.'
      setError(msg)
      setMessages((m) => m.slice(0, -1)) // roll back the optimistic user bubble
    } finally {
      setBusy('')
    }
  }, [page?.threadId, busy])

  const changeLevel = useCallback(async (level: AskLevel) => {
    if (!page?.threadId || busy === 'level') return
    setBusy('level')
    try {
      const res = await api.askLevel({ threadId: page.threadId, level })
      const { personalNote, ...levelPatch } = res
      setPage((prev) => (prev ? { ...prev, ...levelPatch, personalNote: personalNote ?? undefined } : prev))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Level switch failed.')
    } finally {
      setBusy('')
    }
  }, [page?.threadId, busy])

  const addToRevision = async () => {
    if (!page?.threadId) return
    try {
      const res = await api.askRevision({ threadId: page.threadId })
      toast({
        title: res.queued ? 'Added to Smart Revision' : 'Already queued',
        description: res.queued
          ? `A 15-minute revision block is due now · ${res.due} item${res.due === 1 ? '' : 's'} due in total.`
          : `${res.due} item${res.due === 1 ? '' : 's'} due across your queue.`,
      })
    } catch {
      toast({ title: 'Could not add to revision', description: 'Try again in a moment.' })
    }
  }

  // deep links + cross-view hand-offs (nonce re-fires on repeat hand-offs)
  useEffect(() => {
    if (!askFocus) return
    closeAsk()
    if (askFocus.threadId) void loadThread(askFocus.threadId)
    else if (askFocus.q) void runSearch(askFocus.q)
  }, [askFocus?.nonce])

  // shared deep link #/ask?q=…
  useEffect(() => {
    if (hashConsumed.current) return
    const q = parseAskHash()
    if (q) {
      hashConsumed.current = true
      void runSearch(q)
    }
  }, [])

  const backHome = () => {
    setPage(null)
    setMessages([])
    setInput('')
    setError(null)
    writeAskHash(null)
    void loadHome()
  }

  // ─────────────────────────────────────────────────────────── loading states ──
  if (busy === 'thread') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 md:px-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════ THREAD ╗
  if (page) {
    const r = page.resolution
    const anchored = !!r.conceptId
    return (
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-4 md:px-6">
        {/* sticky search — ask again without leaving */}
        <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line bg-background/90 px-4 py-2.5 backdrop-blur-xl md:-mx-6 md:px-6">
          <form
            role="search"
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); void runSearch(input) }}
          >
            <Button
              type="button" variant="ghost" size="icon" onClick={backHome}
              className="size-10 shrink-0" aria-label="Back to Ask Engine home"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <div className="relative min-w-0 flex-1">
              <ScanSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" aria-hidden />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something else…"
                aria-label="Ask the medical answer engine"
                className="pl-9"
              />
            </div>
            <Button type="submit" size="icon" className="size-10 shrink-0" disabled={busy === 'search' || input.trim().length < 2} aria-label="Ask">
              {busy === 'search' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            </Button>
          </form>
        </div>

        {busy === 'search' && (
          <div className="space-y-3" aria-live="polite">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-44 w-full" />
          </div>
        )}

        {busy === '' && error && (
          <div role="alert" className="mb-4 rounded-xl border border-sev-crit/40 bg-sev-crit/10 p-3 text-sm text-sev-crit">{error}</div>
        )}

        {page && busy !== 'search' && (
          <div className="space-y-4">
            {/* ── resolution header ── */}
            <Reveal index={0}>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline" size="sm" className="min-h-9 gap-1.5 rounded-full px-3 text-xs"
                  onClick={() => anchored && openConcept(r.conceptId!)}
                  disabled={!anchored}
                  title="Open the concept explorer"
                >
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  {r.kind === 'compare' && r.secondaryName
                    ? `${r.conceptName ?? ''} vs ${r.secondaryName}`
                    : r.conceptName ?? r.topicName ?? page.query}
                  <ArrowUpRight className="size-3" aria-hidden />
                </Button>
                {r.subjectName && (
                  <span className="text-[11px] text-ink-soft">
                    {r.subjectName}
                    {r.topicName ? ` · ${r.topicName}` : ''}
                  </span>
                )}
                <MasteryChip mastery={page.personal.mastery} status={page.personal.status} />
                {page.personal.mistakeOpen > 0 && (
                  <span className="rounded-full bg-sev-warn/10 px-2.5 py-1 text-[11px] font-medium text-sev-warn">
                    missed {page.personal.mistakeMaxWrong}× before
                  </span>
                )}
              </div>
              {page.understoodAs && (
                <p className="mt-2 text-[11px] text-ink-soft">
                  <ShieldCheck className="mr-1 inline size-3 text-sev-ok" aria-hidden />
                  Understood as: {page.understoodAs}
                </p>
              )}
            </Reveal>

            {/* ── honest-miss route: fresh searches, not follow-ups ── */}
            {!page.threadId && page.suggestions.length > 0 && (
              <Reveal index={2}>
                <div className="flex flex-wrap gap-1.5" aria-label="Suggested searches">
                  {page.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); void runSearch(s) }}
                      className="min-h-9 rounded-full border border-line bg-surface-1 px-3.5 text-xs text-ink-soft transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Reveal>
            )}

            {/* ── quick answer ── */}
            <Reveal index={1}>
              <SectionCard
                title="Quick answer"
                icon={<Sparkles className="size-3.5 text-primary" aria-hidden />}
                action={<LevelChips active={page.level} busy={busy === 'level'} onPick={changeLevel} />}
              >
                {busy === 'level' ? (
                  <div className="space-y-2 py-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></div>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{page.answer.text}</div>
                    <KeyPoints points={page.answer.keyPoints} />
                  </>
                )}
                <div className="mt-3 space-y-2">
                  {page.answer.uncertain && <UncertainBanner note={page.answer.uncertainNote} />}
                  <AiBadgeRow fallback={page.answer.fallback} measured={page.answer.disclaimer} />
                </div>
              </SectionCard>
            </Reveal>

            {/* ── personal bridge ── */}
            {page.personalNote && (
              <Reveal index={2}>
                <div className="flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed">
                  <Compass className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span><span className="font-semibold">Personal route — </span>{page.personalNote}</span>
                </div>
              </Reveal>
            )}

            {/* ── actions ── */}
            {anchored && (
              <Reveal index={3}>
                <div className="flex flex-wrap gap-1.5" aria-label="Answer actions">
                  {[
                    { label: 'Explain simpler', msg: 'Explain it more simply' },
                    { label: 'Explain deeper', msg: 'Go deeper with more detail' },
                    { label: 'Analogy', msg: 'Give me an analogy' },
                    { label: 'Clinical example', msg: 'Give me a clinical example' },
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={() => void sendFollowup(a.msg)}
                      disabled={busy === 'followup'}
                      className="min-h-9 rounded-full border border-line bg-surface-1 px-3.5 text-xs transition-colors hover:border-primary/40 disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setCompareOpen((o) => !o)}
                    aria-expanded={compareOpen}
                    className="min-h-9 rounded-full border border-line bg-surface-1 px-3.5 text-xs transition-colors hover:border-primary/40"
                  >
                    Compare with…
                  </button>
                  <button
                    onClick={() => void sendFollowup('Quiz me')}
                    className="min-h-9 rounded-full border border-primary/50 bg-primary/10 px-3.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <ListChecks className="mr-1 inline size-3.5" aria-hidden /> Quiz me
                  </button>
                  <button
                    onClick={() => void addToRevision()}
                    className="min-h-9 rounded-full border border-line bg-surface-1 px-3.5 text-xs transition-colors hover:border-primary/40"
                  >
                    <Undo2 className="mr-1 inline size-3.5" aria-hidden /> Add to revision
                  </button>
                </div>
                {compareOpen && (
                  <form
                    className="mt-2 flex items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (compareWith.trim()) void sendFollowup(`Compare ${r.conceptName} with ${compareWith.trim()}`) }}
                  >
                    <Input
                      value={compareWith}
                      onChange={(e) => setCompareWith(e.target.value)}
                      placeholder={`e.g. a condition often confused with ${r.conceptName ?? 'this'}`}
                      aria-label="Concept to compare with"
                      className="min-h-11 flex-1"
                    />
                    <Button type="submit" size="sm" className="min-h-11" disabled={compareWith.trim().length < 2 || busy === 'followup'}>Compare</Button>
                  </form>
                )}
              </Reveal>
            )}

            {/* ── follow-up transcript ── */}
            {(messages.length > 0 || busy === 'followup') && (
              <Reveal index={4}>
                <SectionCard title="Follow-ups" icon={<Sparkles className="size-3.5 text-primary" aria-hidden />}>
                  <div className="space-y-3">
                    {messages.map((m, i) => (
                      <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[85%]',
                            m.role === 'user' ? 'bg-primary/12 text-foreground' : 'border border-line bg-surface-1',
                          )}
                        >
                          <p className="whitespace-pre-wrap">{m.text}</p>
                          {m.payload?.kind === 'quiz' && m.payload.quiz && (
                            <div className="mt-3">
                              <AskQuiz
                                items={m.payload.quiz}
                                note={m.payload.quizNote}
                                onPracticeMore={anchored ? () => { setQuizPreset({ conceptId: r.conceptId, count: 8 }); setView('questions') } : undefined}
                              />
                            </div>
                          )}
                          {m.payload?.kind === 'mistakes' && m.payload.mistakes && (
                            <ul className="mt-2 space-y-2">
                              {m.payload.mistakes.map((mi) => (
                                <li key={mi.questionId} className="rounded-xl border border-sev-warn/30 bg-sev-warn/5 p-2.5 text-xs">
                                  <p className="line-clamp-2 font-medium">{mi.stem}</p>
                                  <p className="mt-1 text-ink-soft">missed {mi.wrongCount}×{mi.lastErrorType ? ` · ${mi.lastErrorType}` : ''}</p>
                                  {mi.teaching && (
                                    <p className="mt-1 text-foreground">
                                      <Lightbulb className="mr-1 inline size-3.5 text-gold" aria-hidden />
                                      {mi.teaching}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {m.payload?.fallback && (
                            <p className="mt-2 text-[10px] text-ink-soft">deterministic compose · {m.payload.disclaimer}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {busy === 'followup' && (
                      <div className="flex items-center gap-2 text-xs text-ink-soft" aria-live="polite">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> grounding the answer…
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* follow-up input + suggestions */}
                  {anchored && page.threadId && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {page.suggestions.length > 0 && messages.length === 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {page.suggestions.map((s) => (
                            <button
                              key={s}
                              onClick={() => void sendFollowup(s)}
                              className="min-h-9 rounded-full border border-line bg-surface-2 px-3 text-[11px] text-ink-soft transition-colors hover:border-primary/40 hover:text-foreground"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => { e.preventDefault(); void sendFollowup(followInput) }}
                      >
                        <Input
                          value={followInput}
                          onChange={(e) => setFollowInput(e.target.value)}
                          placeholder="Ask a follow-up without restarting…"
                          aria-label="Follow-up question"
                          className="min-h-11 flex-1"
                        />
                        <Button type="submit" size="icon" className="size-11 shrink-0" disabled={busy === 'followup' || !followInput.trim()} aria-label="Send follow-up">
                          {busy === 'followup' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                        </Button>
                      </form>
                    </div>
                  )}
                </SectionCard>
              </Reveal>
            )}

            {/* ── connections (knowledge graph) ── */}
            {page.connections.length > 0 && (
              <Reveal index={5}>
                <SectionCard
                  title="Knowledge connections"
                  icon={<Network className="size-3.5 text-primary" aria-hidden />}
                  action={
                    <Button variant="ghost" size="sm" className="min-h-9 gap-1 text-xs" onClick={() => setView('graph')}>
                      <Network className="size-3.5" aria-hidden /> Graph
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    {page.connections.map((c) => (
                      <ConnectionGroup key={c.group} group={c.group} items={c.items} onOpen={openConcept} />
                    ))}
                  </div>
                </SectionCard>
              </Reveal>
            )}

            {/* ── high-yield facts ── */}
            {page.highYield.length > 0 && (
              <Reveal index={6}>
                <SectionCard title="High-yield facts" icon={<FlaskConical className="size-3.5 text-primary" aria-hidden />}>
                  <HighYieldList facts={page.highYield} />
                </SectionCard>
              </Reveal>
            )}

            {/* ── practice ── */}
            {anchored && (page.questions.total > 0 || page.personal.mistakeOpen > 0 || page.cases.length > 0) && (
              <Reveal index={7}>
                <SectionCard title="Practice here" icon={<CircleHelp className="size-3.5 text-primary" aria-hidden />}>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                      <span className="rounded-full bg-surface-2 px-2.5 py-1">{page.questions.total} MCQ{page.questions.total === 1 ? '' : 's'} on platform</span>
                      {page.questions.pyq > 0 && <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{page.questions.pyq} PYQ-pattern</span>}
                      {page.personal.mistakeOpen > 0 && <span className="rounded-full bg-sev-warn/10 px-2.5 py-1 text-sev-warn">{page.personal.mistakeMaxWrong}× your worst miss</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="min-h-11" onClick={() => void sendFollowup('Quiz me')}>
                        <ListChecks className="size-4" aria-hidden /> Quiz me
                      </Button>
                      <Button
                        size="sm" variant="outline" className="min-h-11"
                        onClick={() => { setQuizPreset({ conceptId: r.conceptId, count: 8 }); setView('questions') }}
                      >
                        Open Question Lab <ArrowUpRight className="size-4" aria-hidden />
                      </Button>
                      {page.personal.mistakeOpen > 0 && (
                        <Button size="sm" variant="outline" className="min-h-11" onClick={() => setView('mistakes')}>
                          <Wrench className="size-4" aria-hidden /> Fix my mistakes
                        </Button>
                      )}
                    </div>
                    {page.cases.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Clinical cases</p>
                        {page.cases.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => openSim(c.id)}
                            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 text-left text-sm transition-colors hover:border-primary/40"
                          >
                            <span className="truncate">{c.title}</span>
                            <span className="shrink-0 text-[11px] text-ink-soft">{c.specialty} <ArrowUpRight className="inline size-3" aria-hidden /></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>
              </Reveal>
            )}

            {/* ── external resources (metadata + link-out only) ── */}
            {page.resources.length > 0 && (
              <Reveal index={8}>
                <SectionCard
                  title="Go deeper externally"
                  icon={<BookMarked className="size-3.5 text-primary" aria-hidden />}
                  action={
                    <Button variant="ghost" size="sm" className="min-h-9 gap-1 text-xs" onClick={() => openLibrary({ q: r.conceptName ?? page.query })}>
                      Resource Hub <ArrowUpRight className="size-3" aria-hidden />
                    </Button>
                  }
                >
                  <div className="space-y-2">
                    {page.resources.map((res) => (
                      <a
                        key={res.id}
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl border border-line bg-surface-1 p-3 transition-colors hover:border-primary/40 min-h-11"
                        aria-label={`${res.title} by ${res.sourceName} (opens external site)`}
                      >
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          {res.title} <ArrowUpRight className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-soft">{res.description}</p>
                        <p className="mt-1 text-[11px] text-ink-soft">
                          {res.sourceName} · {res.access.toLowerCase()} · {res.license}
                          <span className={res.urlVerified ? 'text-sev-ok' : 'text-sev-warn'}>
                            {' '}· {res.urlVerified ? 'link verified' : 'verification pending'}
                          </span>
                        </p>
                      </a>
                    ))}
                  </div>
                </SectionCard>
              </Reveal>
            )}

            {/* ── sources (deterministic, never LLM-written) ── */}
            {page.sources.length > 0 && (
              <Reveal index={9}>
                <SectionCard title="Sources" icon={<Landmark className="size-3.5 text-primary" aria-hidden />}>
                  <div className="space-y-2">
                    {page.sources.map((s, i) => <SourceRow key={`${s.kind}-${i}`} s={s} />)}
                  </div>
                  <p className="mt-3 text-[11px] text-ink-soft">
                    Sources are assembled by the engine from real platform artefacts — never generated by the AI. External rows
                    link out to the original source; we never re-host or redistribute.
                  </p>
                </SectionCard>
              </Reveal>
            )}
          </div>
        )}
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════ HOME ╗
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6 md:px-6 md:pt-10">
      {/* ── hero ── */}
      <Reveal index={0} className="space-y-3 text-center">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          <ScanSearch className="size-3.5 text-primary" aria-hidden /> MEDULA Ask Engine
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Ask once. Understand. Practice. Revise.
        </h1>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-ink-soft">
          One search across diseases, drugs, mechanisms, investigations and PYQs — answered from
          MEDULA&apos;s own lessons and verified sources, with the uncertainty shown honestly.
        </p>
      </Reveal>

      {/* ── the search box ── */}
      <Reveal index={1} className="pt-5">
        <form
          role="search"
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); void runSearch(input) }}
        >
          <div className="relative min-w-0 flex-1">
            <ScanSearch className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-soft" aria-hidden />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try "Why does nephrotic syndrome cause edema?"'
              aria-label="Ask the medical answer engine"
              autoFocus
              className="min-h-12 rounded-2xl pl-11 text-base shadow-sm"
            />
          </div>
          <Button type="submit" className="min-h-12 rounded-2xl px-5" disabled={busy === 'search' || input.trim().length < 2}>
            {busy === 'search' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Ask'}
          </Button>
        </form>

        {/* examples — every one resolves on the platform */}
        {home && home.examples.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {home.examples.map((ex) => (
              <button
                key={ex}
                onClick={() => { setInput(ex); void runSearch(ex) }}
                className="min-h-9 rounded-full border border-line bg-surface-1 px-3.5 text-xs text-ink-soft transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        {busy === 'search' && (
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-soft" aria-live="polite">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> resolving against {home ? home.stats.concepts : 'the'} concepts…
          </p>
        )}
        {error && (
          <div role="alert" className="mt-3 rounded-xl border border-sev-crit/40 bg-sev-crit/10 p-3 text-sm text-sev-crit">{error}</div>
        )}
      </Reveal>

      {/* ── personal shortcuts — only from real signals, never invented ── */}
      {home && (home.personal.weak.length > 0 || home.personal.missed.length > 0 || home.personal.dueRevision > 0) && (
        <Reveal index={2} className="pt-7">
          <SectionCard title="Your learning context" icon={<Compass className="size-3.5 text-primary" aria-hidden />}>
            <div className="space-y-3 text-sm">
              <p className="text-xs text-ink-soft">
                {home.personal.yearLabel} · {home.personal.prepStage} stage — the engine leans on this when it explains.
              </p>
              {home.personal.weak.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">Weakest concepts — ask one, get the prerequisite-first route</p>
                  <div className="flex flex-wrap gap-1.5">
                    {home.personal.weak.map((w) => (
                      <button
                        key={w.conceptId}
                        onClick={() => { setInput(`Explain ${w.name}`); void runSearch(`Explain ${w.name}`) }}
                        className="min-h-9 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-3 text-xs transition-colors hover:border-sev-warn"
                      >
                        {w.name} <span className="ml-1 text-[10px] text-ink-soft">{w.mastery}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {home.personal.missed.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">Most-missed recently</p>
                  <div className="flex flex-wrap gap-1.5">
                    {home.personal.missed.map((m, i) => (
                      <span key={`${m.name}-${i}`} className="min-h-9 rounded-full border border-line bg-surface-2 px-3 text-xs leading-9">
                        {m.name} <span className="text-[10px] text-sev-warn">×{m.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {home.personal.dueRevision > 0 && (
                <button
                  onClick={() => setView('revision')}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-3 text-left text-xs transition-colors hover:border-primary/40"
                >
                  <span>{home.personal.dueRevision} revision item{home.personal.dueRevision === 1 ? '' : 's'} due in Smart Revision</span>
                  <ArrowUpRight className="size-3.5 text-ink-soft" aria-hidden />
                </button>
              )}
            </div>
          </SectionCard>
        </Reveal>
      )}

      {/* ── recent asks ── */}
      {home && home.threads.length > 0 && (
        <Reveal index={3} className="pt-5">
          <SectionCard title="Recent asks" icon={<Stethoscope className="size-3.5 text-primary" aria-hidden />}>
            <div className="space-y-1.5">
              {home.threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void loadThread(t.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-2 text-left transition-colors hover:border-primary/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block text-[11px] text-ink-soft">
                      {t.resolvedKind === 'compare' ? 'comparison' : t.resolvedKind === 'none' ? 'no match' : t.resolvedKind}
                      {' · '}{new Date(t.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-ink-soft" aria-hidden />
                </button>
              ))}
            </div>
          </SectionCard>
        </Reveal>
      )}

      {/* ── trust strip — measured counts only ── */}
      {home && (
        <Reveal index={4} className="pt-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: 'structured lessons', value: home.stats.lessons, icon: Sparkles },
              { label: 'concepts in the graph', value: home.stats.concepts, icon: Network },
              { label: 'MCQs with explanations', value: home.stats.questions, icon: CircleHelp },
              { label: 'PYQ-pattern questions', value: home.stats.pyq, icon: Landmark },
              { label: 'clinical cases', value: home.stats.cases, icon: Stethoscope },
              { label: 'verified external resources', value: home.stats.resources, icon: BookMarked },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-line bg-surface-1 p-3.5 text-center">
                <p className="text-xl font-semibold tracking-tight">{s.value.toLocaleString()}</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-ink-soft">
                  <s.icon className="size-3 text-primary" aria-hidden /> {s.label}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-soft">
            Educational answers grounded in platform content — never personal medical advice, never invented citations.
            When the platform can&apos;t verify it, the engine says so.
          </p>
        </Reveal>
      )}
    </div>
  )
}
