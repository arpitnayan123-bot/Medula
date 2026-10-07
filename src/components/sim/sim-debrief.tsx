'use client'

// ─── CLINICAL CASE SIMULATOR · DEBRIEF (PRODUCT 09) ───
// The honest mirror: diagnosis reveal, measured score breakdown, the full
// decision timeline with the engine's explanations, learning points, the
// Knowledge-Graph neighbourhood, and measured hand-offs (MCQ drill, Topic
// Hub, Mistake Intelligence feed report).

import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Award, BookOpenCheck, Bot, CheckCircle2, ChevronDown, Crosshair, Flag, Lightbulb,
  Network, Play, RotateCcw, Stethoscope, Timer, XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useAppStore } from '@/lib/store'
import { SIM_DIFFICULTY_META } from '@/lib/types'
import type { SimDebrief, SimDebriefTimelineItem, SimDifficulty } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  AnimatedNumber, DIFF_TONE, EASE, MicroLabel, Reveal, VERDICT_META, asPct, fmtClock, statusTone,
} from './sim-shared'

const SUB_SCORES: { key: keyof SimDebrief['scores'] & string; label: string; icon: LucideIcon }[] = [
  { key: 'diagnosis', label: 'Diagnostic accuracy', icon: Crosshair },
  { key: 'reasoning', label: 'Reasoning', icon: Stethoscope },
  { key: 'investigations', label: 'Investigations', icon: Network },
  { key: 'management', label: 'Management', icon: BookOpenCheck },
]

// ─── Animated score ring ─────────────────────────────────────────────────────

function ScoreRing({ pct }: { pct: number }) {
  const reduce = useReducedMotion()
  const size = 132
  const stroke = 11
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const tone = clamped >= 70 ? 'var(--sev-ok)' : clamped >= 50 ? 'var(--sev-warn)' : 'var(--sev-crit)'

  return (
    <span className="relative inline-grid place-items-center" role="img" aria-label={`Total score ${clamped} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - clamped / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
      <span className="absolute text-center">
        <span className="block text-3xl font-semibold tabular-nums leading-none">
          <AnimatedNumber value={clamped} />
        </span>
        <span className="mt-1 block text-[10px] uppercase tracking-wider text-ink-soft">of 100</span>
      </span>
    </span>
  )
}

// ─── Timeline item ───────────────────────────────────────────────────────────

function TimelineItem({ item, index }: { item: SimDebriefTimelineItem; index: number }) {
  const [open, setOpen] = useState(false)
  const verdictTone = item.correct ? 'text-sev-ok' : 'text-sev-crit'
  const ResultIcon = item.correct ? CheckCircle2 : XCircle
  const hasDetail = item.verdicts.length > 0 || item.missed.length > 0

  return (
    <Reveal index={Math.min(index, 6)}>
      <li className="clay min-w-0 space-y-2.5 rounded-2xl p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <ResultIcon className={cn('mt-0.5 size-4 shrink-0', verdictTone)} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
              {item.stageLabel}
              {' · '}
              <span className="font-semibold tabular-nums text-ink-soft">{Math.round(item.score)}/100</span>
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-snug">{item.prompt}</p>
          </div>
        </div>

        {item.chosenLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.chosenLabels.map((l, i) => (
              <span key={i} className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-xs font-medium">
                {l}
              </span>
            ))}
          </div>
        )}

        <p className="text-[13px] leading-relaxed text-ink-soft">{item.headline}</p>

        {hasDetail && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:text-primary/80',
                open && 'text-primary/80',
              )}
              aria-expanded={open}
            >
              {open ? 'Hide' : 'Show'} the engine&apos;s reasoning
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <ul className="space-y-2">
                {item.verdicts.map((v) => {
                  const meta = VERDICT_META[v.verdict]
                  const Icon = meta.icon
                  return (
                    <li key={v.id} className="space-y-1">
                      <div className="flex items-start gap-2">
                        <Icon className={cn('mt-0.5 size-3.5 shrink-0', v.verdict === 'correct' ? 'text-sev-ok' : v.verdict === 'acceptable' ? 'text-info' : v.verdict === 'wrong' ? 'text-sev-warn' : 'text-sev-crit')} aria-hidden />
                        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{v.label}</p>
                        <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider', meta.chip)}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="ml-[1.375rem] text-xs leading-relaxed text-ink-soft">{v.why}</p>
                      {v.finding && (
                        <p className="ml-[1.375rem] rounded-lg border-l-2 border-info/50 bg-surface-2/60 px-2.5 py-1.5 text-xs italic leading-relaxed text-ink-soft">
                          {v.finding}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
              {item.missed.length > 0 && (
                <div className="rounded-xl border border-sev-warn/30 bg-sev-warn/10 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sev-warn">Missed</p>
                  <ul className="mt-1.5 space-y-1">
                    {item.missed.map((m) => (
                      <li key={m.id} className="text-xs leading-relaxed">
                        <span className="font-semibold">{m.label}</span>
                        <span className="text-ink-soft"> — {m.why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </li>
    </Reveal>
  )
}

// ─── Debrief root ────────────────────────────────────────────────────────────

export function SimDebriefView({
  debrief, onRunAgain, onBackToLibrary,
}: {
  debrief: SimDebrief
  onRunAgain: () => void
  onBackToLibrary: () => void
}) {
  const setView = useAppStore((s) => s.setView)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)
  const openHub = useAppStore((s) => s.openHub)
  const openConcept = useAppStore((s) => s.openConcept)

  const difficulty = debrief.difficulty as SimDifficulty
  const isAi = debrief.mode === 'ai'
  const conceptId = debrief.handoffs.conceptId
  const topicId = debrief.handoffs.topicId

  const startMcqs = useCallback(() => {
    if (!conceptId) return
    // Concept drill — same hand-off shape as the Knowledge Graph's verified
    // "Practice questions" flow ('concept' is not a valid AdaptiveMode, the
    // conceptId scope alone drives the adaptive engine's pool).
    setAdaptivePreset({ conceptId, autoStart: true })
    setView('adaptive')
  }, [conceptId, setAdaptivePreset, setView])

  const openTopicHub = useCallback(() => {
    if (topicId) openHub(topicId, conceptId)
  }, [topicId, conceptId, openHub])

  const openPrimaryConcept = useCallback(() => {
    if (topicId && conceptId) openHub(topicId, conceptId)
    else if (conceptId) openConcept(conceptId)
  }, [topicId, conceptId, openHub, openConcept])

  const timeUsed = fmtClock(debrief.scores.timeMs)
  const overEstimate = debrief.scores.timeMs > debrief.scores.estimateMinutes * 60000

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <Reveal index={0} className="min-w-0 space-y-2">
        <MicroLabel className="text-sev-ok">Case debrief</MicroLabel>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{debrief.caseTitle}</h1>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="border-line text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
            {debrief.specialty}
          </Badge>
          <Badge variant="outline" className={cn('border text-[10px] font-bold uppercase tracking-wider', DIFF_TONE[difficulty])}>
            {SIM_DIFFICULTY_META[difficulty]?.label ?? debrief.difficulty}
          </Badge>
          {isAi && (
            <Badge variant="outline" className="border-sev-warn/40 bg-sev-warn/10 text-[10px] font-bold uppercase tracking-wider text-sev-warn">
              <Bot className="mr-1 size-3" aria-hidden /> AI patient mode
            </Badge>
          )}
        </div>
      </Reveal>

      {/* ── Diagnosis reveal ── */}
      <Reveal index={1}>
        <section className="clay space-y-3 rounded-2xl p-5 md:p-6" aria-label="Diagnosis reveal">
          <MicroLabel>The diagnosis was</MicroLabel>
          <p className="text-xl font-semibold leading-snug tracking-tight md:text-2xl">{debrief.diagnosis}</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {debrief.diagnosisCorrect ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-ok/30 bg-sev-ok/12 px-3 py-1.5 text-xs font-bold text-sev-ok">
                <CheckCircle2 className="size-4" aria-hidden /> You made the diagnosis
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-crit/30 bg-sev-crit/10 px-3 py-1.5 text-xs font-bold text-sev-crit">
                <XCircle className="size-4" aria-hidden /> Your diagnosis was not the one this patient had
              </span>
            )}
            {isAi && debrief.aiNote && (
              <p className="text-xs italic leading-relaxed text-ink-soft">{debrief.aiNote}</p>
            )}
          </div>
        </section>
      </Reveal>

      {/* ── Measured scores ── */}
      <Reveal index={2}>
        <section className="clay flex flex-col items-center gap-6 rounded-2xl p-5 sm:flex-row sm:items-stretch md:p-6" aria-label="Score breakdown">
          <div className="flex shrink-0 items-center justify-center">
            <ScoreRing pct={debrief.scores.total} />
          </div>
          <div className="grid min-w-0 flex-1 gap-3 self-center sm:grid-cols-2">
            {SUB_SCORES.map((s) => {
              const v = debrief.scores[s.key as keyof SimDebrief['scores']] as number | undefined
              const pct = typeof v === 'number' ? Math.max(0, Math.min(100, Math.round(v))) : null
              return (
                <div key={s.key} className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                      <s.icon className="size-3.5 shrink-0 text-primary" aria-hidden />
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold tabular-nums">{pct != null ? `${pct}%` : '—'}</span>
                  </div>
                  <Progress value={pct ?? 0} className="h-1.5" aria-label={`${s.label} ${pct ?? 'unknown'} percent`} />
                </div>
              )
            })}
            <div className="min-w-0 sm:col-span-2">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                  <Timer className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">Time used vs estimate</span>
                </span>
                <span className={cn('shrink-0 text-xs font-bold tabular-nums', overEstimate ? 'text-sev-warn' : 'text-sev-ok')}>
                  {timeUsed} vs {debrief.scores.estimateMinutes} min
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-soft">
                {overEstimate
                  ? 'Slower than the estimate — exam-level timing is its own skill; the ladder measures it, never punishes it.'
                  : 'Within the estimated time — the sequencing held up under exam-style pacing.'}
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Decision timeline ── */}
      {debrief.timeline.length > 0 && (
        <Reveal index={3} className="space-y-3">
          <MicroLabel>Decision timeline</MicroLabel>
          <ol className="space-y-3">
            {debrief.timeline.map((item, i) => (
              <TimelineItem key={`${item.interactionId}-${i}`} item={item} index={i} />
            ))}
          </ol>
        </Reveal>
      )}

      {/* ── Learning points ── */}
      {debrief.learning.length > 0 && (
        <Reveal index={4} className="space-y-3">
          <MicroLabel className="text-primary">Learning points</MicroLabel>
          <ul className="clay space-y-3 rounded-2xl p-4 md:p-5">
            {debrief.learning.map((l, i) => (
              <li key={i} className="flex min-w-0 items-start gap-2.5">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-sev-warn" aria-hidden />
                <span className="text-sm leading-relaxed">{l}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      )}

      {/* ── Concepts (Knowledge Graph) ── */}
      {debrief.concepts.length > 0 && (
        <Reveal index={5} className="space-y-3">
          <MicroLabel>Concepts this case tested</MicroLabel>
          <div className="flex flex-wrap gap-2">
            {debrief.concepts.map((c) => {
              const mastery = asPct(c.mastery)
              const isOpenable = c.primary ? !!conceptId : true
              const body = (
                <>
                  <span className="truncate">{c.name}</span>
                  {c.primary && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                      primary
                    </span>
                  )}
                  <span className={cn('ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', statusTone(c.status))}>
                    {c.status ?? 'new'}{mastery != null ? ` · ${mastery}%` : ''}
                  </span>
                </>
              )
              if (!isOpenable) {
                return <span key={c.id} className="flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface-2/50 px-3 py-2 text-xs font-medium text-ink-soft">{body}</span>
              }
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={c.primary ? openPrimaryConcept : () => openConcept(c.id)}
                  className="flex min-h-11 w-full items-center gap-1.5 rounded-full border border-line bg-surface-2/50 px-3 py-2 text-left text-xs font-medium transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:max-w-full"
                  aria-label={`Open ${c.name}${c.primary ? ' in the Topic Hub' : ' in the concept explorer'}`}
                >
                  {body}
                </button>
              )
            })}
          </div>
        </Reveal>
      )}

      {/* ── Related Knowledge (graph neighbourhood) ── */}
      {debrief.related && debrief.related.length > 0 && (
        <Reveal index={6} className="space-y-3">
          <MicroLabel>Related Knowledge — from the graph</MicroLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {debrief.related.map((g) => (
              <div key={g.kind} className="clay min-w-0 space-y-2.5 rounded-2xl p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">{g.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{g.blurb}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openConcept(item.id)}
                      title={item.edgeLabel}
                      className="min-h-11 rounded-full border border-line bg-surface-2/50 px-3 py-2 text-xs font-medium transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Open ${item.name} in the concept explorer (${item.edgeLabel})`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* ── Hand-offs ── */}
      <Reveal index={7} className="space-y-3">
        <MicroLabel>Hand-offs</MicroLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={startMcqs}
            disabled={!conceptId}
            className="clay clay-hover flex min-h-24 flex-col items-start gap-2 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
              <Award className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold">Practice MCQs on this concept</span>
            <span className="text-xs leading-relaxed text-ink-soft">
              {conceptId ? 'Starts an adaptive drill built around the primary concept.' : 'No concept link available for this case.'}
            </span>
          </button>
          <button
            type="button"
            onClick={openTopicHub}
            disabled={!topicId}
            className="clay clay-hover flex min-h-24 flex-col items-start gap-2 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
              <Network className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold">Open in Topic Hub</span>
            <span className="text-xs leading-relaxed text-ink-soft">
              {topicId ? 'The full study surface: mechanism, gaps, connected knowledge.' : 'No topic link available for this case.'}
            </span>
          </button>
        </div>
      </Reveal>

      {/* ── Mistake Intelligence honesty report ── */}
      {debrief.mistakeFed && (
        <Reveal index={8}>
          <p
            role="status"
            className={cn(
              'flex min-w-0 items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed',
              debrief.mistakeFed.errorPattern || debrief.mistakeFed.revisionItem
                ? 'border-sev-warn/30 bg-sev-warn/10 text-sev-warn'
                : 'border-line bg-surface-2/40 text-ink-soft',
            )}
          >
            <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              {debrief.mistakeFed.errorPattern || debrief.mistakeFed.revisionItem
                ? 'This miss was added to your revision queue (Mistake Intelligence) — it will resurface until it stops happening. '
                : 'No mistake was fed to your revision queue for this run — nothing to unlearn here. '}
              <span className="text-ink-soft">{debrief.mistakeFed.reason}</span>
            </span>
          </p>
        </Reveal>
      )}

      {/* ── Actions ── */}
      <Reveal index={9} className="flex flex-col gap-2 sm:flex-row">
        <Button className="clay-btn min-h-12 flex-1" onClick={onRunAgain}>
          <RotateCcw className="size-4" aria-hidden /> Run the case again
        </Button>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onBackToLibrary}>
          <Play className="size-4" aria-hidden /> Back to library
        </Button>
      </Reveal>
    </div>
  )
}
