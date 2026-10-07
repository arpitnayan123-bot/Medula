'use client'

// ─── MEDICAL IMAGE LEARNING LAB · DEBRIEF (PRODUCT 10) ───
// The honest mirror: the diagnosis reveal (celebrate learning, never shame),
// the measured score ring, the full step timeline with the engine's
// option-by-option whys, teaching pearls, the Knowledge-Graph neighbourhood,
// and measured hand-offs (Adaptive MCQ drill, similar images, re-study).
// Same visual language as the Case Simulator debrief — clay/ink, sev tones,
// Reveal entrances, motion gated by useReducedMotion.

import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Award, CheckCircle2, ChevronDown, Clock3, Crosshair, Flag, Images, Lightbulb,
  RotateCcw, ScanEye, XCircle, Zap,
} from 'lucide-react'

import { useAppStore } from '@/lib/store'
import { LAB_MODE_META } from '@/lib/types'
import type { LabDebrief } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { ScrollReveal } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import {
  AnimatedNumber, EASE, LAB_VERDICT_META, MicroLabel, Reveal, SCROLL_SLIM,
  asPct, fmtClock, statusTone, verdictTextTone,
} from './lab-shared'

// ─── Animated score ring (same pattern as the Case Simulator debrief) ────────

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

// ─── Step timeline item (prompt → choices → verdict → collapsible whys) ──────

function StepItem({ step, index }: { step: LabDebrief['steps'][number]; index: number }) {
  const [open, setOpen] = useState(false)
  const stepTone = step.correct ? 'text-sev-ok' : 'text-sev-crit'
  const StepIcon = step.correct ? CheckCircle2 : XCircle
  const hasWhys = !!step.perOption && step.perOption.length > 0

  return (
    <ScrollReveal>
      <li className="clay min-w-0 space-y-2.5 rounded-2xl p-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <StepIcon className={cn('mt-0.5 size-4 shrink-0', stepTone)} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
              Step {index + 1}
              {' · '}
              <span className="font-semibold tabular-nums text-ink-soft">{Math.round(step.score)}/100</span>
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-snug">{step.prompt}</p>
          </div>
        </div>

        {step.chosenLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {step.chosenLabels.map((l, i) => (
              <span key={i} className="rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-xs font-medium">
                {l}
              </span>
            ))}
          </div>
        )}

        <p className="text-[13px] leading-relaxed text-ink-soft">{step.headline}</p>

        {hasWhys && (
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
            <CollapsibleContent className="pt-2">
              <ul className="space-y-2">
                {(step.perOption ?? []).map((o) => {
                  const meta = LAB_VERDICT_META[o.verdict]
                  const Icon = meta.icon
                  return (
                    <li key={o.id} className="space-y-1">
                      <div className="flex items-start gap-2">
                        <Icon className={cn('mt-0.5 size-3.5 shrink-0', verdictTextTone(o.verdict))} aria-hidden />
                        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{o.label}</p>
                        <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider', meta.chip)}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="ml-[1.375rem] text-xs leading-relaxed text-ink-soft">{o.why}</p>
                    </li>
                  )
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </li>
    </ScrollReveal>
  )
}

// ─── Debrief root ────────────────────────────────────────────────────────────

interface Props {
  debrief: LabDebrief
  onReplay: () => void
  onBackHome: () => void
  onOpenImage: (imageId: string) => void
}

export function LabDebriefScreen({ debrief, onReplay, onBackHome, onOpenImage }: Props) {
  const setView = useAppStore((s) => s.setView)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)
  const openHub = useAppStore((s) => s.openHub)
  const openConcept = useAppStore((s) => s.openConcept)

  const conceptId = debrief.handoffs.conceptId
  const topicId = debrief.handoffs.topicId
  const isRapid = debrief.mode === 'rapid'
  const modeLabel = LAB_MODE_META[debrief.mode]?.label ?? debrief.mode

  const startMcqs = useCallback(() => {
    if (!conceptId) return
    // Concept drill — the exact verified hand-off shape shared by the
    // Knowledge Graph and Case Simulator flows ('concept' is not an
    // AdaptiveMode; the conceptId scope alone drives the adaptive pool).
    setAdaptivePreset({ conceptId, autoStart: true })
    setView('adaptive')
  }, [conceptId, setAdaptivePreset, setView])

  const openPrimaryConcept = useCallback(() => {
    if (topicId && conceptId) openHub(topicId, conceptId)
    else if (conceptId) openConcept(conceptId)
  }, [topicId, conceptId, openHub, openConcept])

  const timeUsed = fmtClock(debrief.scores.timeMs)
  const findPct =
    debrief.scores.findingsTotal > 0
      ? Math.max(0, Math.min(100, Math.round((debrief.scores.findingsHit / debrief.scores.findingsTotal) * 100)))
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <Reveal index={0} className="min-w-0 space-y-2">
        <MicroLabel className="text-sev-ok">Image debrief</MicroLabel>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{debrief.imageTitle}</h1>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] font-bold uppercase tracking-wider text-primary">
            {isRapid && <Zap className="mr-1 inline size-3" aria-hidden />}
            {modeLabel}
          </Badge>
          {debrief.handoffs.subjectCode && (
            <Badge variant="outline" className="border-line text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              {debrief.handoffs.subjectCode}
            </Badge>
          )}
        </div>
      </Reveal>

      {/* ── Diagnosis reveal — celebrate learning, never shame ── */}
      <Reveal index={1}>
        <section className="clay space-y-3 rounded-2xl p-5 md:p-6" aria-label="Diagnosis reveal">
          <MicroLabel>What this image shows</MicroLabel>
          <p className="text-xl font-semibold leading-snug tracking-tight md:text-2xl">{debrief.diagnosis}</p>
          <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
            {isRapid
              ? 'Rapid fire graded the whole sweep — this reveal belongs to the session’s opening image. Every image you saw is waiting in the library for a slower look.'
              : 'The answer is yours now. Recognition is a skill — every return visit to this image makes it faster.'}
          </p>
        </section>
      </Reveal>

      {/* ── Measured scores ── */}
      <Reveal index={2}>
        <section className="clay flex flex-col items-center gap-6 rounded-2xl p-5 sm:flex-row sm:items-stretch md:p-6" aria-label="Score breakdown">
          <div className="flex shrink-0 items-center justify-center">
            <ScoreRing pct={debrief.scores.total} />
          </div>
          <div className="grid min-w-0 flex-1 content-center gap-4">
            {findPct != null && (
              <div className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                    <Crosshair className="size-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">Findings located</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums">
                    {debrief.scores.findingsHit}/{debrief.scores.findingsTotal} · {findPct}%
                  </span>
                </div>
                <Progress
                  value={findPct}
                  className="h-1.5"
                  aria-label={`Findings located ${debrief.scores.findingsHit} of ${debrief.scores.findingsTotal} — ${findPct} percent`}
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                  <Clock3 className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">Time on this run</span>
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums">{timeUsed}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-soft">
                {isRapid
                  ? 'Speed is scored in rapid fire — hesitation costs, but a wrong blink costs more. The engine keeps both honest.'
                  : 'Measured from the moment the attempt opened. Timing feeds your averages, never a penalty.'}
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── Step timeline ── */}
      {debrief.steps.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel>What the engine saw</MicroLabel>
          <ol className="space-y-3">
            {debrief.steps.map((step, i) => (
              <StepItem key={`step-${i}`} step={step} index={i} />
            ))}
          </ol>
        </ScrollReveal>
      )}

      {/* ── Teaching pearls ── */}
      {debrief.teaching.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel className="text-primary">Teaching pearls</MicroLabel>
          <ul className="clay space-y-3 rounded-2xl p-4 md:p-5">
            {debrief.teaching.map((t, i) => (
              <li key={i} className="flex min-w-0 items-start gap-2.5">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-sev-warn" aria-hidden />
                <span className="text-sm leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </ScrollReveal>
      )}

      {/* ── Concepts (Knowledge Graph) ── */}
      {debrief.concepts.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel>Concepts this image tests</MicroLabel>
          <div className="flex flex-wrap gap-2">
            {debrief.concepts.map((c) => {
              const mastery = asPct(c.mastery)
              // The contract carries no primary flag — the engine's lead
              // concept is the one mirrored into debrief.handoffs.conceptId,
              // and that chip earns the Topic Hub hand-off.
              const isLead = conceptId != null && c.id === conceptId
              const isOpenable = isLead ? !!conceptId : true
              const body = (
                <>
                  <span className="truncate">{c.name}</span>
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
                  onClick={isLead ? openPrimaryConcept : () => openConcept(c.id)}
                  className="flex min-h-11 w-full items-center gap-1.5 rounded-full border border-line bg-surface-2/50 px-3 py-2 text-left text-xs font-medium transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:max-w-full"
                  aria-label={`Open ${c.name}${isLead && topicId ? ' in the Topic Hub' : ' in the concept explorer'}`}
                >
                  {body}
                </button>
              )
            })}
          </div>
        </ScrollReveal>
      )}

      {/* ── Related Knowledge (graph neighbourhood) ── */}
      {debrief.related && debrief.related.length > 0 && (
        <ScrollReveal className="space-y-3">
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
        </ScrollReveal>
      )}

      {/* ── Practice similar images (same-modality pool) ── */}
      <ScrollReveal className="space-y-3">
        <MicroLabel>Practice similar images</MicroLabel>
        {debrief.nextImages.length > 0 ? (
          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Similar images from the library">
            {debrief.nextImages.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onOpenImage(img.id)}
                className="clay clay-hover flex w-40 shrink-0 flex-col gap-1.5 rounded-2xl p-2.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open image: ${img.title} — ${img.modality}, difficulty ${img.difficulty} of 3`}
              >
                <span className="block h-16 w-full rounded-lg border border-line/70 bg-surface-2/30 p-1">
                  <img src={img.src} alt="" loading="lazy" draggable={false} className="h-full w-full rounded-md object-contain" />
                </span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-snug">{img.title}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-ink-soft">{img.modality}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            No similar images in the pool yet — the library grows with the curriculum.
          </p>
        )}
      </ScrollReveal>

      {/* ── Hand-offs ── */}
      <ScrollReveal className="space-y-3">
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
              {conceptId ? 'Starts an adaptive drill built around the primary concept.' : 'No concept link available for this image.'}
            </span>
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="clay clay-hover flex min-h-24 flex-col items-start gap-2 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
              <ScanEye className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold">Study this image again</span>
            <span className="text-xs leading-relaxed text-ink-soft">
              Back to the study surface — guided reveal, compare mode and every graded launcher.
            </span>
          </button>
        </div>
      </ScrollReveal>

      {/* ── Mistake Intelligence honesty report ── */}
      {debrief.mistakeFed && (
        <ScrollReveal>
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
        </ScrollReveal>
      )}

      {/* ── Actions ── */}
      <ScrollReveal className="flex flex-col gap-2 sm:flex-row">
        <Button className="clay-btn min-h-12 flex-1" onClick={onReplay}>
          <RotateCcw className="size-4" aria-hidden /> Study this image again
        </Button>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onBackHome}>
          <Images className="size-4" aria-hidden /> Back to library
        </Button>
      </ScrollReveal>
    </div>
  )
}
