'use client'

// ─── ADAPTIVE ENGINE · HOME (PRODUCT 04) ───
// Measured entry point: personalization chips, resume banner, the eight
// engine modes with live bank counts, a custom builder, recent runs and
// bookmarks. Every "start" action hands a frozen AdaptiveConfig upward.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, BookOpenCheck, ChevronDown, Crosshair, Flag, Landmark, Layers,
  Loader2, Play, RefreshCcw, ScanLine, SlidersHorizontal, Sparkles, Stethoscope, Target, Timer, Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import type { AdaptiveSavedItem, AdaptiveSavedPayload } from '@/lib/api'
import { ADAPTIVE_MODES } from '@/lib/types'
import type { AdaptiveConfig, AdaptiveHomePayload, AdaptiveMode, SubjectSummary } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type LoadState = 'loading' | 'ready' | 'error'

export interface ResumeMeta { mode: AdaptiveMode; total: number; answered: number }

interface AdaptiveHomeProps {
  onStart: (config: AdaptiveConfig) => void
  onResume: (sessionId: string, meta: ResumeMeta) => void
  refreshKey: number
  starting: boolean
  startError: string | null
}

// Default run length per engine mode (spec-frozen).
const DEFAULT_COUNTS: Record<AdaptiveMode, number> = {
  'ai-adaptive': 15, adaptive: 15, weakness: 12, pyq: 12,
  rapid: 15, clinical: 8, image: 8, exam: 20, custom: 10,
}

const MODE_ICONS: Record<AdaptiveMode, typeof Target> = {
  'ai-adaptive': Sparkles,
  adaptive: SlidersHorizontal,
  weakness: Crosshair,
  pyq: Landmark,
  rapid: Zap,
  clinical: Stethoscope,
  image: ScanLine,
  exam: Timer,
  custom: Layers,
}

function modeBankCount(counts: AdaptiveHomePayload['counts'], mode: AdaptiveMode): number {
  switch (mode) {
    case 'pyq': return counts.pyqPattern
    case 'image': return counts.imageBased
    case 'clinical': return counts.clinical
    case 'rapid': return counts.rapid
    case 'weakness': return counts.weaknessQuestions
    default: return counts.bank
  }
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function normalizeSaved(payload: AdaptiveSavedPayload): AdaptiveSavedItem[] {
  const arr = payload.saved ?? payload.questions ?? payload.items ?? []
  return arr
    .map((it) => ({
      id: it.questionId ?? it.id,
      questionId: it.questionId ?? it.question?.id ?? it.id,
      stem: it.stem ?? it.question?.stem ?? 'Untitled question',
      conceptName: it.conceptName ?? it.question?.conceptName,
      subjectCode: it.subjectCode ?? it.question?.subjectCode,
      savedAt: it.savedAt,
    }))
    .filter((it) => !!it.questionId)
}

export function AdaptiveHome({ onStart, onResume, refreshKey, starting, startError }: AdaptiveHomeProps) {
  const [status, setStatus] = useState<LoadState>('loading')
  const [home, setHome] = useState<AdaptiveHomePayload | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Custom builder state
  const [builderOpen, setBuilderOpen] = useState(false)
  const [subjects, setSubjects] = useState<SubjectSummary[]>([])
  const [subjectCode, setSubjectCode] = useState('all')
  const [difficulty, setDifficulty] = useState(0) // 0 = Any
  const [count, setCount] = useState(10)

  // Bookmarks
  const [saved, setSaved] = useState<AdaptiveSavedItem[]>([])
  const [savedLoading, setSavedLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // status starts as 'loading'; refetches keep the stale view until fresh data lands
    api.adaptiveHome().then(
      (res) => {
        if (cancelled) return
        setHome(res)
        setStatus('ready')
      },
      () => {
        if (!cancelled) setStatus('error')
      },
    )
    api.subjects().then(
      (res) => {
        if (!cancelled) setSubjects(res.subjects)
      },
      () => {
        if (!cancelled) setSubjects([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey, refreshKey])

  useEffect(() => {
    let cancelled = false
    // savedLoading starts true; refetches swap the list in place when they resolve
    api
      .getSavedQuestions()
      .then((res) => {
        if (!cancelled) setSaved(normalizeSaved(res))
      })
      .catch(() => {
        if (!cancelled) setSaved([])
      })
      .finally(() => {
        if (!cancelled) setSavedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const unsave = async (questionId: string) => {
    setSaved((prev) => prev.filter((s) => s.questionId !== questionId))
    try {
      await api.unsaveQuestion(questionId)
    } catch {
      // optimistic removal — a stale bookmark is harmless
    }
  }

  const startMode = (mode: AdaptiveMode) => {
    const config: AdaptiveConfig = { mode, count: DEFAULT_COUNTS[mode] }
    if (mode === 'exam') config.minutes = DEFAULT_COUNTS[mode]
    onStart(config)
  }

  const resumeMeta = (sessionId: string): ResumeMeta => {
    const r = home?.recent.find((x) => x.id === sessionId)
    return r
      ? { mode: r.mode, total: r.total, answered: r.answered }
      : { mode: 'adaptive', total: 0, answered: 0 }
  }

  const startCustom = () => {
    onStart({
      mode: 'custom',
      count,
      subjectCode: subjectCode === 'all' ? undefined : subjectCode,
      difficulty: difficulty > 0 ? difficulty : undefined,
    })
  }

  const diffLabel = (n: number) => (n === 0 ? 'Any difficulty' : `Level ${n} only`)

  const resumeId = status === 'ready' ? home?.resumeId ?? null : null

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* ── Hero ── */}
      <header className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10">
            <Target className="size-5 text-primary" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">ADAPTIVE ENGINE</h1>
        </div>
        <p className="text-lg font-medium leading-snug tracking-tight md:text-xl">
          Don&apos;t practise random questions. <span className="text-primary">Practise what you need.</span>
        </p>
        <p className="text-sm text-ink-soft">
          Every run is selected from your live knowledge states, error patterns and the exam clock — measured, never random.
        </p>
      </header>

      {/* ── Personalization strip ── */}
      {status === 'ready' && home && (home.personalization.topWeak || home.personalization.topMissed) && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-col gap-2 sm:flex-row"
          aria-label="Personalized starting points"
        >
          {home.personalization.topWeak && (
            <button
              type="button"
              onClick={() => onStart({ mode: 'weakness', conceptId: home.personalization.topWeak!.conceptId, count: DEFAULT_COUNTS.weakness })}
              className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border border-sev-warn/40 bg-sev-warn/10 px-4 py-3 text-left text-sm transition-colors hover:border-sev-warn/70"
            >
              <Crosshair className="size-4 shrink-0 text-sev-warn" />
              <span className="min-w-0 flex-1 leading-snug">
                <span className="font-semibold">{home.personalization.topWeak.conceptName}</span>
                <span className="text-ink-soft"> · mastery {home.personalization.topWeak.mastery}%</span>
              </span>
              <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-sev-warn">Repair run →</span>
            </button>
          )}
          {home.personalization.topMissed && (
            <button
              type="button"
              onClick={() => onStart({ mode: 'weakness', conceptId: home.personalization.topMissed!.conceptId, count: DEFAULT_COUNTS.weakness })}
              className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border border-sev-crit/40 bg-sev-crit/10 px-4 py-3 text-left text-sm transition-colors hover:border-sev-crit/70"
            >
              <Zap className="size-4 shrink-0 text-sev-crit" />
              <span className="min-w-0 flex-1 leading-snug">
                <span className="font-semibold">{home.personalization.topMissed.conceptName}</span>
                <span className="text-ink-soft"> · missed {home.personalization.topMissed.misses}×</span>
              </span>
              <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-sev-crit">Drill →</span>
            </button>
          )}
        </motion.section>
      )}

      {/* ── Resume banner ── */}
      {resumeId && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3.5 sm:flex-row sm:items-center"
          role="status"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary">Unfinished run</p>
            <p className="text-xs text-ink-soft">
              {(() => {
                const m = resumeMeta(resumeId)
                return m.total > 0 ? `${m.answered} of ${m.total} done — the engine kept your plan.` : 'Pick up where you left off.'
              })()}
            </p>
          </div>
          <Button className="min-h-11 shrink-0 gap-1.5 font-semibold" disabled={starting} onClick={() => onResume(resumeId, resumeMeta(resumeId))}>
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Resume
          </Button>
        </motion.div>
      )}

      {/* ── Start / load states ── */}
      {startError && (
        <p className="flex items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-3 text-sm font-medium text-sev-crit" role="alert">
          <AlertTriangle className="size-4 shrink-0" /> {startError}
        </p>
      )}
      {starting && (
        <p className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm text-ink-soft" role="status">
          <Loader2 className="size-4 animate-spin text-primary" /> The engine is measuring your bank…
        </p>
      )}

      {status === 'error' && (
        <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
            <AlertTriangle className="size-6 text-sev-crit" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">The engine didn&apos;t respond</h2>
          <p className="max-w-sm text-sm text-ink-soft">
            The adaptive service may still be warming up. Nothing is lost — try again in a moment.
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCcw className="size-4" /> Retry
          </Button>
        </div>
      )}

      {status === 'loading' && (
        <div className="space-y-4" aria-busy="true" role="status">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="shimmer h-36 rounded-2xl" />
            ))}
          </div>
        </div>
      )}

      {/* ── Mode cards ── */}
      {status === 'ready' && home && (
        <section aria-label="Engine modes">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ADAPTIVE_MODES.map((m, i) => {
              const Icon = MODE_ICONS[m.id]
              const isPrimary = m.id === 'ai-adaptive'
              const bank = modeBankCount(home.counts, m.id)
              return (
                <motion.button
                  key={m.id}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE, delay: i * 0.04 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startMode(m.id)}
                  disabled={starting}
                  className={cn(
                    'flex min-h-36 flex-col rounded-2xl p-4 text-left transition-all disabled:opacity-60',
                    isPrimary
                      ? 'bg-primary text-primary-foreground shadow-md hover:shadow-lg'
                      : 'clay clay-hover',
                  )}
                >
                  <span className={cn('flex items-center justify-between gap-2')}>
                    <Icon className={cn('size-5 shrink-0', isPrimary ? 'text-primary-foreground' : 'text-primary')} />
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                        isPrimary ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-surface-2 text-ink-soft',
                      )}
                    >
                      {bank} Qs
                    </span>
                  </span>
                  <span className={cn('mt-3 text-sm font-semibold leading-tight', isPrimary && 'text-primary-foreground')}>{m.label}</span>
                  <span className={cn('mt-1 text-[11px] leading-snug', isPrimary ? 'text-primary-foreground/80' : 'text-ink-soft')}>{m.blurb}</span>
                </motion.button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Custom builder ── */}
      <section className="clay rounded-2xl" aria-label="Custom run builder">
        <button
          type="button"
          onClick={() => setBuilderOpen((o) => !o)}
          aria-expanded={builderOpen}
          className="flex min-h-11 w-full items-center gap-2.5 px-4 py-3.5 text-left"
        >
          <SlidersHorizontal className="size-4 shrink-0 text-primary" />
          <span className="flex-1 text-sm font-semibold">Custom run</span>
          <span className="text-[11px] text-ink-soft">subject · difficulty · length</span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform', builderOpen && 'rotate-180')} />
        </button>
        {builderOpen && (
          <div className="space-y-5 border-t border-line px-4 py-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Subject</label>
              <Select value={subjectCode} onValueChange={setSubjectCode}>
                <SelectTrigger className="min-h-11 w-full">
                  <SelectValue placeholder="All subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.code}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">Difficulty</label>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={cn(
                      'min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                      difficulty === d
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    {d === 0 ? 'Any' : '●'.repeat(d)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">{diffLabel(difficulty)}</label>
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{count}</span>
              </div>
              <Slider min={5} max={50} step={1} value={[count]} onValueChange={(v) => setCount(v[0] ?? 10)} />
              <div className="flex justify-between text-[11px] tabular-nums text-ink-soft">
                <span>5</span>
                <span>50</span>
              </div>
            </div>

            <Button size="lg" className="min-h-12 w-full text-base font-semibold" disabled={starting} onClick={startCustom}>
              <Play className="size-5" /> START CUSTOM RUN
            </Button>
          </div>
        )}
      </section>

      {/* ── Recent runs ── */}
      {status === 'ready' && home && home.recent.length > 0 && (
        <section className="clay space-y-3 rounded-2xl p-4" aria-label="Recent runs">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">Recent runs</h2>
          <ul className="space-y-2">
            {home.recent.slice(0, 5).map((r) => {
              const incomplete = !r.completedAt
              const accuracy = r.answered > 0 ? Math.round((r.correct / r.answered) * 100) : 0
              const row = (
                <>
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 shadow-well">
                    {(() => {
                      const Icon = MODE_ICONS[r.mode] ?? Target
                      return <Icon className="size-4 text-primary" />
                    })()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {ADAPTIVE_MODES.find((m) => m.id === r.mode)?.label ?? r.mode}
                      <span className="ml-2 text-xs font-normal text-ink-soft">{relTime(r.createdAt)}</span>
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {r.answered}/{r.total} answered{!incomplete && r.answered > 0 ? ` · ${accuracy}% on answered` : ''}
                    </span>
                  </span>
                  {incomplete ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                      <Play className="size-3" /> Resume
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sev-ok/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sev-ok">
                      Done
                    </span>
                  )}
                </>
              )
              return (
                <li key={r.id}>
                  {incomplete ? (
                    <button
                      type="button"
                      onClick={() => onResume(r.id, { mode: r.mode, total: r.total, answered: r.answered })}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2.5 text-left transition-colors hover:border-primary/50"
                    >
                      {row}
                    </button>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface-2/20 px-3 py-2.5">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ── Bookmarks ── */}
      <section className="clay space-y-3 rounded-2xl p-4" aria-label="Saved questions">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">
            <BookOpenCheck className="size-4 text-primary" /> Saved questions
          </h2>
          {!savedLoading && saved.length > 0 && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold tabular-nums text-ink-soft">{saved.length}</span>
          )}
        </div>
        {savedLoading ? (
          <div className="space-y-2" aria-busy="true" role="status">
            <Skeleton className="shimmer h-11 rounded-xl" />
            <Skeleton className="shimmer h-11 rounded-xl" />
          </div>
        ) : saved.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-ink-soft">
            <Flag className="size-3.5" /> Bookmark a question during a run (the flag icon) and it lands here for later.
          </p>
        ) : (
          <ul className="med-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
            {saved.map((s) => (
              <li key={s.questionId} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-medium leading-snug">{s.stem}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                    {[s.subjectCode, s.conceptName].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="min-h-9 shrink-0 px-2 text-[11px] text-ink-soft" onClick={() => unsave(s.questionId!)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
