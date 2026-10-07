'use client'

// ─── ADAPTIVE ENGINE · RUN REPORT (PRODUCT 04) ───
// Session-level insight from AdaptiveReport: accuracy ring, speed band,
// difficulty split, strong/weak topics, error patterns, wrong-question
// review, a recommended next run, and honest hand-offs (tutor / hub).

import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Bandage, BookOpen, CheckCircle2, ChevronDown, Crosshair, Flag, Landmark,
  MessageCircle, Sparkles, Target, Timer, TrendingUp, XCircle, Zap,
} from 'lucide-react'

import { useAppStore } from '@/lib/store'
import { ADAPTIVE_MODES, ERROR_TYPE_LABELS } from '@/lib/types'
import type { AdaptiveConfig, AdaptiveReport, AdaptiveTopicInsight } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Pop, SpringBar } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface AdaptiveReportViewProps {
  report: AdaptiveReport
  markedIds: string[]
  onStart: (config: AdaptiveConfig) => void
  onHome: () => void
}

function ScoreRing({ value, size, stroke, children }: { value: number; size: number; stroke: number; children?: ReactNode }) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="adaptive-report-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5cb491" />
            <stop offset="100%" stopColor="#16788c" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="url(#adaptive-report-ring)"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

const SPEED_BAND: Record<AdaptiveReport['speedBand'], { label: string; cls: string; note: string }> = {
  fast: { label: 'Fast', cls: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok', note: 'quicker than the 65 s exam benchmark' },
  steady: { label: 'Steady', cls: 'border-primary/40 bg-primary/10 text-primary', note: 'near the 65 s exam benchmark' },
  slow: { label: 'Slow', cls: 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn', note: 'slower than the 65 s exam benchmark' },
}

const DIFF_LABELS: Record<number, string> = { 1: 'Easy', 2: 'Moderate', 3: 'Hard', 4: 'Very hard' }

function TopicRow({ topic, tone, onDrill }: { topic: AdaptiveTopicInsight; tone: 'strong' | 'weak'; onDrill?: () => void }) {
  const strong = tone === 'strong'
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
      <span className={cn('size-2 shrink-0 rounded-full', strong ? 'bg-sev-ok' : 'bg-sev-warn')} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{topic.name}</p>
        <p className="text-[11px] text-ink-soft">
          {topic.correct}/{topic.total} correct · {topic.accuracy}%
        </p>
      </div>
      {strong ? (
        <span className="shrink-0 rounded-full bg-sev-ok/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sev-ok">Strong</span>
      ) : (
        <Button size="sm" variant="outline" className="min-h-9 shrink-0 gap-1 border-sev-warn/40 text-xs text-sev-warn hover:bg-sev-warn/10" onClick={onDrill}>
          <Zap className="size-3" /> Drill
        </Button>
      )}
    </li>
  )
}

export function AdaptiveReportView({ report, markedIds, onStart, onHome }: AdaptiveReportViewProps) {
  const openHub = useAppStore((s) => s.openHub)
  const setView = useAppStore((s) => s.setView)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const modeLabel = ADAPTIVE_MODES.find((m) => m.id === report.mode)?.label ?? report.mode
  const band = SPEED_BAND[report.speedBand] ?? SPEED_BAND.steady
  const avgSec = Math.round(report.avgTimeMs / 1000)
  const markedSet = new Set(markedIds)

  const drillTopic = (t: AdaptiveTopicInsight) => {
    onStart({ mode: 'weakness', count: 12, topicId: t.topicId ?? undefined, subjectCode: t.subjectCode || undefined })
  }

  const weakNames = report.weakTopics.map((t) => t.name).slice(0, 3).join(', ')
  const tutorText =
    `I just scored ${report.correct}/${report.answered} on an adaptive ${modeLabel} run. ` +
    `Weakest: ${weakNames || 'no clear weak topic this run'}. Teach me the top misses.`

  const hubTopic = report.weakTopics.find((t) => t.topicId)?.topicId ?? null

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2.5">
          <Pop>
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10">
              <Target className="size-5 text-primary" />
            </span>
          </Pop>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">RUN REPORT</h1>
        </div>
        <p className="text-sm text-ink-soft md:text-base">
          {modeLabel} · every attempt already updated your knowledge model.
        </p>
      </header>

      {/* ── Score + speed ── */}
      <section className="clay rounded-2xl p-5 md:p-7">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <ScoreRing value={report.accuracy} size={168} stroke={12}>
            <span className="text-4xl font-semibold tabular-nums tracking-tight">{report.accuracy}%</span>
            <span className="mt-1 text-xs text-ink-soft">accuracy</span>
          </ScoreRing>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
              <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <Target className="size-4 text-primary" /> Answered
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                {report.answered}/{report.total}
                <span className="inline-flex items-center gap-1 rounded-full bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok">
                  <CheckCircle2 className="size-3" /> {report.correct} correct
                </span>
                {report.answered > report.correct && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sev-crit/10 px-2 py-0.5 text-[10px] font-bold text-sev-crit">
                    <XCircle className="size-3" /> {report.answered - report.correct} missed
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
              <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
                <Timer className="size-4 text-primary" /> Avg time / question
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                {avgSec}s
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', band.cls)}>{band.label}</span>
              </span>
            </div>
            <p className="text-[11px] text-ink-soft">Speed band is measured against the 65 s/question NEET-PG benchmark — {band.note}.</p>
          </div>
        </div>

        {/* Difficulty split */}
        {report.difficulty.length > 0 && (
          <div className="mt-6 space-y-2.5 border-t border-line pt-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">By difficulty</p>
            {report.difficulty.map((row) => {
              const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0
              return (
                <div key={row.d} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-medium">{DIFF_LABELS[row.d] ?? `Level ${row.d}`}</span>
                  <span className="text-[11px] tabular-nums text-ink-soft">{'●'.repeat(Math.max(1, Math.min(4, row.d)))}</span>
                  <SpringBar value={pct} className="min-w-0 flex-1" />
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                    {row.correct}/{row.total}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Strong / weak topics ── */}
      {(report.strongTopics.length > 0 || report.weakTopics.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          {report.strongTopics.length > 0 && (
            <div className="clay space-y-3 rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-sev-ok">
                <TrendingUp className="size-4" /> Strong topics
              </h2>
              <ul className="space-y-2">
                {report.strongTopics.slice(0, 5).map((t) => (
                  <TopicRow key={t.name} topic={t} tone="strong" />
                ))}
              </ul>
            </div>
          )}
          {report.weakTopics.length > 0 && (
            <div className="clay space-y-3 rounded-2xl p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-sev-warn">
                <Crosshair className="size-4" /> Weak topics
              </h2>
              <ul className="space-y-2">
                {report.weakTopics.slice(0, 5).map((t) => (
                  <TopicRow key={t.name} topic={t} tone="weak" onDrill={() => drillTopic(t)} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Error patterns + all-time repeat offenders ── */}
      {(report.mistakes.length > 0 || report.repeatedWrong.length > 0) && (
        <section className="clay space-y-4 rounded-2xl p-4 md:p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">
            <Flag className="size-4 text-primary" /> Mistake profile
          </h2>
          {report.mistakes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">This run</p>
              <div className="flex flex-wrap gap-2">
                {report.mistakes.map((m) => (
                  <span key={m.errorType} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-sev-crit/30 bg-sev-crit/5 px-3 text-xs font-medium text-sev-crit">
                    {ERROR_TYPE_LABELS[m.errorType] ?? m.errorType}
                    <span className="rounded-full bg-sev-crit/15 px-1.5 text-[10px] font-bold tabular-nums">×{m.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {report.repeatedWrong.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Missed repeatedly (all-time)</p>
              <div className="flex flex-wrap gap-2">
                {report.repeatedWrong.map((r) => (
                  <span key={r.conceptId} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-3 text-xs font-medium text-sev-warn">
                    {r.conceptName}
                    <span className="rounded-full bg-sev-warn/20 px-1.5 text-[10px] font-bold tabular-nums">×{r.misses}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Wrong-question review ── */}
      {report.wrongQuestions.length > 0 && (
        <section className="clay space-y-3 rounded-2xl p-4 md:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">Wrong questions — review</h2>
          <ul className="space-y-2">
            {report.wrongQuestions.map((wq) => {
              const open = expanded.has(wq.id)
              return (
                <li key={wq.id} className="rounded-xl border border-line bg-surface-2/40">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(wq.id)}
                    aria-expanded={open}
                    className="flex min-h-11 w-full items-start gap-2.5 px-3.5 py-3 text-left"
                  >
                    <XCircle className="mt-0.5 size-4 shrink-0 text-sev-crit" />
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{wq.stem}</span>
                    {markedSet.has(wq.id) && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sev-warn">
                        <Flag className="size-3" /> flagged
                      </span>
                    )}
                    <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="border-t border-line px-3.5 py-3">
                      {wq.conceptName && (
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Concept: {wq.conceptName}</p>
                      )}
                      <p className="mt-1 text-xs text-ink-soft">
                        Re-drill this concept with a Weakness run, or ask the AI tutor to teach it from scratch.
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ── Recommended next run ── */}
      {report.recommended && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md md:p-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground/70">Recommended next</p>
          <p className="mt-1.5 text-lg font-semibold tracking-tight">
            Next: {ADAPTIVE_MODES.find((m) => m.id === report.recommended!.config.mode)?.label ?? report.recommended.config.mode}
          </p>
          <p className="mt-1 text-sm leading-snug text-primary-foreground/85">{report.recommended.reason}</p>
          <Button
            size="lg"
            variant="outline"
            className="mt-4 min-h-11 w-full gap-1.5 border-primary-foreground/30 bg-primary-foreground/10 font-semibold text-primary-foreground hover:bg-primary-foreground/20 sm:w-auto"
            onClick={() => onStart(report.recommended!.config)}
          >
            Start recommended <ArrowRight className="size-4" />
          </Button>
        </motion.section>
      )}

      {/* ── Hand-offs ── */}
      <section className="clay space-y-3 rounded-2xl p-4 md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-soft">Keep going</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="min-h-11 flex-1 gap-1.5 text-xs font-semibold"
            onClick={() => {
              try {
                window.sessionStorage.setItem('medos:tutor-question', tutorText)
              } catch {
                /* storage unavailable — the tutor simply won't pre-fill */
              }
              setView('tutor')
            }}
          >
            <MessageCircle className="size-4 text-primary" /> Ask the tutor about this run
          </Button>
          {hubTopic && (
            <Button variant="outline" className="min-h-11 flex-1 gap-1.5 text-xs font-semibold" onClick={() => openHub(hubTopic)}>
              <BookOpen className="size-4 text-primary" /> Open weakest topic in the Hub
            </Button>
          )}
          <Button
            variant="outline"
            className="min-h-11 flex-1 gap-1.5 text-xs font-semibold"
            onClick={() => setView('mistakes')}
          >
            <Bandage className="size-4 text-primary" /> Review every miss in Mistake Intelligence
          </Button>
        </div>
        {report.weakTopics.length > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <Landmark className="size-3" /> Weak topics above carry a one-tap Drill — a focused Weakness run on just that topic.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="min-h-11 flex-1 font-semibold" onClick={onHome}>
          <ArrowLeft className="size-4" /> BACK TO ENGINE HOME
        </Button>
      </div>
    </div>
  )
}
