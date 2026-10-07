'use client'

// ─── EXAM LAB · POST-TEST ANALYSIS (PRODUCT 12) ───
// Never just a score: mistake profile, speed distribution, subject table,
// weak/strong topics, readiness indicators, the AI Test Analyst (which only
// narrates the measured analysis) and the recommended retest.

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Award, Bot, BrainCircuit, CheckCircle2, ClipboardList,
  Clock3, Flag, Gauge, History, Landmark, Loader2, ListChecks, MinusCircle, Repeat2, Send, Target,
  TrendingDown, TrendingUp, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import type { ExamAiAction, ExamAiResponse, ExamAnalysis, ExamConfig } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Pop, Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import {
  AnimatedNumber, BarRow, EASE, Reveal, SectionTitle, accuracyText, accuracyTone, asPct,
  formatMs, modeInfo, signed, toneClass,
} from './exam-shared'

interface Props {
  analysis: ExamAnalysis
  onOpenReview: () => void
  onRetest: (config: ExamConfig) => void
  onHome: () => void
  onHistory: () => void
  onDrillTopic: (topicId: string) => void
  onOpenConcept: (conceptId: string) => void
}

// ─── Score ring (copied pattern from sim-debrief) ─────────────────────────────

function ScoreRing({ pct }: { pct: number }) {
  const reduce = useReducedMotion()
  const size = 132
  const stroke = 11
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const tone = clamped >= 70 ? 'var(--sev-ok)' : clamped >= 50 ? 'var(--sev-warn)' : 'var(--sev-crit)'

  return (
    <span className="relative inline-grid place-items-center" role="img" aria-label={`Score ${clamped} percent`}>
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
        <span className="mt-1 block text-[10px] uppercase tracking-wider text-ink-soft">percent</span>
      </span>
    </span>
  )
}

function Chip({ icon: Icon, children, tone }: { icon: LucideIcon; children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-3 py-1.5 text-xs font-semibold',
        tone,
      )}
    >
      <Icon className="size-3.5" aria-hidden /> {children}
    </span>
  )
}

// ─── AI Test Analyst panel ────────────────────────────────────────────────────

const AI_ACTIONS: { action: ExamAiAction; label: string }[] = [
  { action: 'what-went-wrong', label: 'What went wrong?' },
  { action: 'study-next', label: 'What should I study next?' },
  { action: 'important-mistakes', label: 'Which mistakes are most important?' },
  { action: 'revise', label: 'What should I revise?' },
  { action: 'next-test', label: 'What should my next test contain?' },
]

function AiAnalyst({ attemptId }: { attemptId: string }) {
  const [active, setActive] = useState<ExamAiAction | null>(null)
  const [loading, setLoading] = useState<ExamAiAction | null>(null)
  const [res, setRes] = useState<ExamAiResponse | null>(null)
  const [failed, setFailed] = useState(false)

  const ask = async (action: ExamAiAction) => {
    setLoading(action)
    setFailed(false)
    try {
      const out = await api.examAi({ action, attemptId })
      setRes(out)
      setActive(action)
    } catch {
      setFailed(true)
    } finally {
      setLoading(null)
    }
  }

  return (
    <Reveal index={9} className="space-y-3">
      <SectionTitle className="text-primary">AI test analyst — narrates your numbers, never invents them</SectionTitle>
      <div className="clay space-y-4 rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          {AI_ACTIONS.map(({ action, label }) => {
            const busy = loading === action
            return (
              <button
                key={action}
                type="button"
                onClick={() => void ask(action)}
                disabled={loading != null}
                aria-pressed={active === action}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                  active === action
                    ? 'border-primary/40 bg-primary/12 text-primary'
                    : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40 hover:text-foreground',
                )}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
                {label}
              </button>
            )
          })}
        </div>

        {loading != null && !res && (
          <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Reading your analysis…
          </p>
        )}

        {failed && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-4 py-2.5 text-xs font-medium text-sev-crit" role="alert">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">The analyst didn&apos;t respond. Your measured analysis below is unaffected.</span>
            <Button variant="outline" size="sm" className="min-h-9 text-xs" onClick={() => active && void ask(active)}>Retry</Button>
          </div>
        )}

        {res && !failed && (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{res.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              {res.aiBadge && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Bot className="size-3" aria-hidden /> {res.aiBadge}
                </span>
              )}
              {res.fallback && (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/70 px-2.5 py-1 text-[10px] font-semibold text-ink-soft">
                  Offline analysis — deterministic summary
                </span>
              )}
            </div>
            {res.disclaimer && <p className="text-[11px] leading-relaxed text-ink-soft">{res.disclaimer}</p>}
          </div>
        )}
      </div>
    </Reveal>
  )
}

// ─── Analysis screen ──────────────────────────────────────────────────────────

export function ExamAnalysisView({ analysis, onOpenReview, onRetest, onHome, onHistory, onDrillTopic, onOpenConcept }: Props) {
  const t = analysis.totals
  const pct = t.maxScore > 0 ? (t.score / t.maxScore) * 100 : 0
  const accTone = accuracyTone(t.accuracy)

  const mistakeTiles: { key: keyof ExamAnalysis['mistakes']; label: string; sub: string; icon: LucideIcon; tone: string }[] = [
    { key: 'careless', label: 'Careless', sub: 'Wrong quickly or after changing your mind', icon: Zap, tone: 'text-sev-warn' },
    { key: 'conceptual', label: 'Conceptual', sub: 'Worked long and still went wrong', icon: BrainCircuit, tone: 'text-sev-crit' },
    { key: 'changedToWrong', label: 'Changed to wrong', sub: 'Changed answer and it became wrong', icon: TrendingDown, tone: 'text-sev-crit' },
    { key: 'changedToRight', label: 'Changed to right', sub: 'Second look saved the question', icon: TrendingUp, tone: 'text-sev-ok' },
    { key: 'repeated', label: 'Repeated', sub: 'Concepts already missed in earlier tests', icon: Repeat2, tone: 'text-sev-crit' },
    { key: 'unattempted', label: 'Unattempted', sub: 'Left blank — scored zero either way', icon: MinusCircle, tone: 'text-ink-soft' },
  ]

  const bucketMax = Math.max(1, ...analysis.speed.buckets.map((b) => b.count))
  const bandLabel = analysis.speed.band === 'fast' ? 'Fast' : analysis.speed.band === 'steady' ? 'Steady' : 'Slow'
  const bandNote = analysis.speed.band === 'fast' ? 'quicker than the 65s exam benchmark' : analysis.speed.band === 'steady' ? 'near the 65s exam benchmark' : 'well over the 65s exam benchmark'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* ── Score hero ── */}
      <Reveal index={0}>
        <section className="clay flex flex-col items-center gap-6 rounded-2xl p-6 text-center md:flex-row md:p-8 md:text-left" aria-label="Score summary">
          <Pop>
            <ScoreRing pct={pct} />
          </Pop>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{analysis.label}</p>
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {t.score}
              <span className="text-xl text-ink-soft"> / {t.maxScore}</span>
            </p>
            <div className="flex flex-wrap justify-center gap-2 md:justify-start">
              <Chip icon={Target} tone={toneClass(accTone)}>Accuracy {accuracyText(t.accuracy)}</Chip>
              <Chip icon={ListChecks}>Attempted {t.answered}/{t.total}</Chip>
              <Chip icon={Clock3}>Time {formatMs(t.timeMs)}</Chip>
              {analysis.negativeMark && <Chip icon={Flag} tone="border-sev-warn/30 bg-sev-warn/10 text-sev-warn">+4 / −1 marking</Chip>}
              {analysis.autoSubmitted && <Chip icon={AlertTriangle} tone="border-sev-warn/30 bg-sev-warn/10 text-sev-warn">Auto-submitted — time expired</Chip>}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Improvement vs previous test ── */}
      {analysis.improvement && (
        <Reveal index={1}>
          <section className="clay space-y-3 rounded-2xl p-4 md:p-5" aria-label="Improvement vs previous test">
            <SectionTitle>Against your last test</SectionTitle>
            <p className="text-sm font-semibold">
              vs <span className="text-ink-soft">{analysis.improvement.vsLabel}</span>
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <DeltaTile
                label="Score"
                value={signed(analysis.improvement.scoreDelta)}
                positive={(analysis.improvement.scoreDelta ?? 0) > 0}
                negative={(analysis.improvement.scoreDelta ?? 0) < 0}
              />
              <DeltaTile
                label="Accuracy"
                value={analysis.improvement.accuracyDelta != null ? `${signed(analysis.improvement.accuracyDelta)}%` : '—'}
                positive={(analysis.improvement.accuracyDelta ?? 0) > 0}
                negative={(analysis.improvement.accuracyDelta ?? 0) < 0}
              />
              <DeltaTile
                label="Speed per question"
                value={analysis.improvement.speedDeltaMs != null ? formatMs(Math.abs(analysis.improvement.speedDeltaMs)) : '—'}
                positive={(analysis.improvement.speedDeltaMs ?? 0) < 0}
                negative={(analysis.improvement.speedDeltaMs ?? 0) > 0}
                suffix={analysis.improvement.speedDeltaMs == null ? undefined : (analysis.improvement.speedDeltaMs < 0 ? ' faster' : ' slower')}
              />
            </div>
          </section>
        </Reveal>
      )}

      {/* ── What went wrong — mistake profile ── */}
      <Reveal index={2} className="space-y-3">
        <SectionTitle className="text-sev-warn">What went wrong — mistake profile</SectionTitle>
        <Stagger className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {mistakeTiles.map((m) => {
            const v = analysis.mistakes[m.key]
            return (
              <StaggerItem key={m.key}>
                <div className="clay flex h-full min-w-0 flex-col gap-1 rounded-2xl p-4">
                  <span className={cn('grid size-8 place-items-center rounded-lg bg-surface-2', m.tone)}>
                    <m.icon className="size-4" aria-hidden />
                  </span>
                  <span className="mt-1 text-2xl font-semibold tabular-nums leading-none">{v}</span>
                  <span className="text-xs font-semibold">{m.label}</span>
                  <span className="text-[11px] leading-snug text-ink-soft">{m.sub}</span>
                </div>
              </StaggerItem>
            )
          })}
        </Stagger>
        {analysis.repeatedWrong.length > 0 && (
          <div className="clay rounded-2xl p-4">
            <p className="text-xs font-semibold text-sev-crit">Repeated offenders — missed again today</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {analysis.repeatedWrong.map((r) => (
                <span key={r.conceptId} className="inline-flex items-center gap-1 rounded-full border border-sev-crit/30 bg-sev-crit/10 px-2.5 py-1 text-xs font-medium text-sev-crit">
                  {r.conceptName} ×{r.misses} all-time
                </span>
              ))}
            </div>
          </div>
        )}
      </Reveal>

      {/* ── Speed & time distribution ── */}
      <Reveal index={3} className="space-y-3">
        <SectionTitle>Speed &amp; time</SectionTitle>
        <div className="clay space-y-4 rounded-2xl p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip icon={Gauge} tone={analysis.speed.band === 'slow' ? 'border-sev-warn/30 bg-sev-warn/10 text-sev-warn' : undefined}>
              {formatMs(analysis.speed.avgTimeMs)} per question
            </Chip>
            <span className="text-xs text-ink-soft">
              {bandLabel} — {bandNote}
            </span>
          </div>
          <div className="space-y-3">
            {analysis.speed.buckets.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                pct={(b.count / bucketMax) * 100}
                valueText={String(b.count)}
              />
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── Subject table ── */}
      {analysis.subjects.length > 0 && (
        <Reveal index={4} className="space-y-3">
          <SectionTitle>Subject breakdown — best to worst</SectionTitle>
          <div className="clay overflow-x-auto rounded-2xl p-2 md:p-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line">
            <table className="w-full min-w-125 text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  <th className="px-3 py-2 font-bold">Subject</th>
                  <th className="px-2 py-2 text-right font-bold">✓</th>
                  <th className="px-2 py-2 text-right font-bold">✗</th>
                  <th className="px-2 py-2 text-right font-bold">Blank</th>
                  <th className="px-2 py-2 text-right font-bold">Accuracy</th>
                  <th className="px-3 py-2 text-right font-bold">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {analysis.subjects.map((s) => {
                  const tone = accuracyTone(s.accuracy)
                  return (
                    <tr key={s.subjectCode}>
                      <td className="max-w-40 truncate px-3 py-2.5 font-medium">{s.name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-sev-ok">{s.correct}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-sev-crit">{s.wrong}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">{s.unattempted}</td>
                      <td className={cn('px-2 py-2.5 text-right font-bold tabular-nums', toneClass(tone))}>
                        {accuracyText(s.accuracy)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{s.score}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      {/* ── Difficulty split + PYQ ── */}
      <Reveal index={5} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {analysis.difficulty.length > 0 && (
          <div className="clay space-y-3 rounded-2xl p-4 md:p-5">
            <SectionTitle>By difficulty</SectionTitle>
            {analysis.difficulty.map((d) => {
              const pctD = d.total > 0 ? (d.correct / d.total) * 100 : 0
              return (
                <BarRow
                  key={d.d}
                  label={['Easy', 'Moderate', 'Hard'][Math.min(2, Math.max(0, d.d - 1))]}
                  pct={pctD}
                  valueText={`${d.correct}/${d.total}`}
                  tone={accuracyTone(pctD) === 'ok' ? 'ok' : accuracyTone(pctD) === 'warn' ? 'warn' : 'crit'}
                />
              )
            })}
          </div>
        )}
        <div className="clay space-y-3 rounded-2xl p-4 md:p-5">
          <SectionTitle>PYQ performance</SectionTitle>
          {analysis.pyq ? (
            <div className="flex flex-wrap items-center gap-2">
              <Chip icon={Landmark} tone={accuracyTone(analysis.pyq.accuracy) === 'ok' ? 'border-sev-ok/30 bg-sev-ok/10 text-sev-ok' : accuracyTone(analysis.pyq.accuracy) === 'warn' ? 'border-sev-warn/30 bg-sev-warn/10 text-sev-warn' : 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit'}>
                {analysis.pyq.correct}/{analysis.pyq.attempted} · {accuracyText(analysis.pyq.accuracy)}
              </Chip>
              <span className="text-xs text-ink-soft">Classic repeated exam themes in this paper.</span>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">— This paper carried no PYQ-pattern questions.</p>
          )}
        </div>
      </Reveal>

      {/* ── Weak / strong topics ── */}
      {(analysis.weakTopics.length > 0 || analysis.strongTopics.length > 0) && (
        <Reveal index={6} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {analysis.weakTopics.length > 0 && (
            <div className="clay space-y-3 rounded-2xl p-4 md:p-5">
              <SectionTitle className="text-sev-crit">Weak topics — drill them</SectionTitle>
              <div className="space-y-2.5">
                {analysis.weakTopics.map((w) => (
                  <div key={`${w.subjectCode}-${w.name}`} className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <p className="text-[11px] tabular-nums text-ink-soft">
                        {w.correct}/{w.total} · {accuracyText(w.accuracy)}
                      </p>
                    </div>
                    {w.topicId && (
                      <Button variant="outline" size="sm" className="min-h-9 shrink-0 gap-1 text-xs" onClick={() => onDrillTopic(w.topicId!)}>
                        <ArrowRight className="size-3.5" aria-hidden /> Drill this
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {analysis.strongTopics.length > 0 && (
            <div className="clay space-y-3 rounded-2xl p-4 md:p-5">
              <SectionTitle className="text-sev-ok">Strong topics — keep them warm</SectionTitle>
              <div className="space-y-2.5">
                {analysis.strongTopics.map((w) => (
                  <div key={`${w.subjectCode}-${w.name}`} className="flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-sev-ok" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <p className="text-[11px] tabular-nums text-ink-soft">
                        {w.correct}/{w.total} · {accuracyText(w.accuracy)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Reveal>
      )}

      {/* ── Weak concepts ── */}
      {analysis.weakConcepts.length > 0 && (
        <Reveal index={7} className="space-y-3">
          <SectionTitle>Weak concepts — open and repair</SectionTitle>
          <div className="clay flex flex-wrap gap-2 rounded-2xl p-4">
            {analysis.weakConcepts.map((c) => {
              const mastery = asPct(c.mastery)
              return (
                <button
                  key={c.conceptId}
                  type="button"
                  onClick={() => onOpenConcept(c.conceptId)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1 pl-3 pr-1 text-xs font-semibold transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open concept ${c.conceptName}`}
                >
                  <span className="max-w-44 truncate">{c.conceptName}</span>
                  <span className="tabular-nums text-ink-soft">
                    {mastery != null ? `${mastery}%` : `${c.correct}/${c.total}`}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Open</span>
                </button>
              )
            })}
          </div>
        </Reveal>
      )}

      {/* ── Readiness strip ── */}
      {analysis.readiness.length > 0 && (
        <Reveal index={8} className="space-y-3">
          <SectionTitle>Readiness indicators</SectionTitle>
          <div className="clay grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-2 md:grid-cols-3 md:p-5">
            {analysis.readiness.map((r) => (
              <div key={r.key} className="min-w-0 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{r.label}</span>
                  <span className={cn('text-xs font-bold tabular-nums', toneClass(accuracyTone(r.value)))}>{Math.round(r.value)}</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${r.label}: ${Math.round(r.value)} of 100`}>
                  <div
                    className={cn(
                      'h-full rounded-full',
                      accuracyTone(r.value) === 'ok' ? 'bg-sev-ok' : accuracyTone(r.value) === 'warn' ? 'bg-sev-warn' : 'bg-sev-crit',
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }}
                  />
                </div>
                <p className="text-[11px] leading-snug text-ink-soft">{r.note}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-soft">Transparent indicators from your own tests — never a promised rank.</p>
        </Reveal>
      )}

      {/* ── AI Test Analyst ── */}
      <AiAnalyst attemptId={analysis.attemptId} />

      {/* ── Recommended next test ── */}
      {analysis.recommended && (
        <Reveal index={10}>
          <section className="clay space-y-3 rounded-2xl border-primary/25 p-4 md:p-5" aria-label="Recommended next test">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Recommended next test</p>
              <span className="inline-flex shrink-0 items-center rounded-full border border-primary/40 bg-primary/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                {modeInfo(analysis.recommended.mode)?.name ?? analysis.recommended.mode}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">{analysis.recommended.reason}</p>
            <Button className="clay-btn min-h-11 w-full sm:w-auto" onClick={() => onRetest(analysis.recommended!.config)}>
              <Send className="size-4" aria-hidden /> Retest now
            </Button>
          </section>
        </Reveal>
      )}

      {/* ── Feed report ── */}
      <Reveal index={11}>
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-[11px] leading-relaxed text-ink-soft">
          <Award className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Fed back into your platform data: {analysis.fed.attemptsRecorded} question attempts,{' '}
            {analysis.fed.revisionItems} revision {analysis.fed.revisionItems === 1 ? 'item' : 'items'}, study session{' '}
            {analysis.fed.studySession ? 'logged' : 'not logged'}. {analysis.fed.reason}
          </span>
        </p>
      </Reveal>

      {/* ── Actions ── */}
      <Reveal index={12} className="flex flex-wrap gap-2">
        <Button className="clay-btn min-h-11 flex-1 sm:flex-none" onClick={onOpenReview}>
          <ClipboardList className="size-4" aria-hidden /> Review every question
        </Button>
        <Button variant="outline" className="min-h-11" onClick={onHistory}>
          <History className="size-4" aria-hidden /> Performance history
        </Button>
        <Button variant="ghost" className="min-h-11 gap-1 text-ink-soft" onClick={onHome}>
          <ArrowLeft className="size-4" aria-hidden /> Back to Exam Lab
        </Button>
      </Reveal>
    </div>
  )
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function DeltaTile({ label, value, positive, negative, suffix }: { label: string; value: string; positive?: boolean; negative?: boolean; suffix?: string }) {
  const tone = positive ? 'text-sev-ok' : negative ? 'text-sev-crit' : 'text-ink-soft'
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone)}>
        {value}
        {suffix && <span className="ml-1 text-xs font-medium">{suffix}</span>}
      </p>
    </div>
  )
}
