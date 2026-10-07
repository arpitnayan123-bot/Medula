'use client'

// ─── MEDICAL IMAGE LEARNING LAB · STUDY SCREEN (PRODUCT 10) ───
// One image, the whole loop: the viewer is the primary focus, below it the
// Guided Explanation reveals findings one at a time, the AI panel answers
// grounded questions (badge + uncertainty framing, never a diagnosis
// verdict), similar images drive compare mode, and the five mode launchers
// hand off to the graded runners. Answer keys live server-side — this screen
// only ever sees teaching content.

import { useCallback, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Bot, CheckCircle2, Crosshair, Eye, GitCompareArrows, HelpCircle, Loader2,
  Play, RotateCcw, Send, Sparkles, Stethoscope, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { LAB_MODE_META, LAB_PROVENANCE_META } from '@/lib/types'
import type { LabAiResponse, LabImageDetail, LabMode } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DifficultyDots, MicroLabel, ProvenanceChip, RelevanceChip, Reveal, SCROLL_SLIM, difficultyLabel,
} from './lab-shared'
import { LabViewer } from './lab-viewer'
import type { LabAnnotation } from './lab-viewer'

type GradedMode = Exclude<LabMode, 'guided' | 'rapid'>

interface Props {
  detail: LabImageDetail
  onBack: () => void
  onLaunchMode: (mode: GradedMode) => void
  onRapid: () => void
  onResume: () => void
}

// ─── Mode launchers ───────────────────────────────────────────────────────────

const MODE_CARDS: { mode: GradedMode; icon: LucideIcon; meta: (d: LabImageDetail) => string }[] = [
  { mode: 'identify', icon: Eye, meta: () => 'One look · four options' },
  { mode: 'interpret', icon: Crosshair, meta: (d) => `Tap to pin ${d.locateCount} ${d.locateCount === 1 ? 'finding' : 'findings'} · then name them` },
  { mode: 'diagnose', icon: Stethoscope, meta: () => 'Clinical vignette · four options' },
  { mode: 'quiz', icon: HelpCircle, meta: (d) => `${d.quiz.length} targeted ${d.quiz.length === 1 ? 'question' : 'questions'}` },
]

function ModeLaunchers({ detail, onLaunchMode, onRapid }: Pick<Props, 'detail' | 'onLaunchMode' | 'onRapid'>) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {MODE_CARDS.map(({ mode, icon: Icon, meta }) => {
        const m = LAB_MODE_META[mode]
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onLaunchMode(mode)}
            className="clay clay-hover flex min-h-24 flex-col items-start gap-1.5 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Start ${m.label} — ${m.blurb}`}
          >
            <span className="flex w-full min-w-0 items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold tracking-tight">{m.label}</span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-sev-ok">graded</span>
              </span>
            </span>
            <span className="text-xs leading-relaxed text-ink-soft">{m.blurb}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft/70">{meta(detail)}</span>
          </button>
        )
      })}

      <button
        type="button"
        onClick={onRapid}
        className="clay clay-hover flex min-h-24 flex-col items-start gap-1.5 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open the rapid fire drill scope on the library"
      >
        <span className="flex w-full min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sev-warn/15 text-sev-warn">
            <Zap className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-tight">{LAB_MODE_META.rapid.label}</span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-sev-ok">graded</span>
          </span>
        </span>
        <span className="text-xs leading-relaxed text-ink-soft">{LAB_MODE_META.rapid.blurb}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft/70">
          Sets a {detail.summary.modality} scope on the library
        </span>
      </button>
    </div>
  )
}

// ─── Guided Explanation (sequential reveal) ──────────────────────────────────

function GuidedReveal({
  detail, onRevealChange,
}: {
  detail: LabImageDetail
  onRevealChange: (annotations: LabAnnotation[]) => void
}) {
  const steps = detail.guided
  const [idx, setIdx] = useState<number | null>(null)

  const go = useCallback((next: number | null) => {
    setIdx(next)
    if (next == null) {
      onRevealChange([])
      return
    }
    const revealed = steps.slice(0, next + 1)
    onRevealChange(
      revealed
        .map((s, i) => ({ n: i + 1, label: s.label, x: s.region?.x ?? 0, y: s.region?.y ?? 0, hasRegion: s.region != null }))
        .filter((a) => a.hasRegion)
        .map(({ n, label, x, y }) => ({ n, label, x, y })),
    )
  }, [steps, onRevealChange])

  if (steps.length === 0) return null

  const step = idx != null ? steps[idx] : null
  const atEnd = idx != null && idx >= steps.length - 1

  return (
    <section className="clay space-y-3.5 rounded-2xl p-4 md:p-5" aria-label="Guided explanation">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sev-warn/15 text-sev-warn">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <MicroLabel className="text-sev-warn">Guided explanation · step-by-step</MicroLabel>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft" aria-live="polite">
          {idx == null ? `${steps.length} findings` : `${idx + 1}/${steps.length}`}
        </span>
      </div>

      {idx == null ? (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">
            Walk the image the way a radiologist does — one finding at a time, each named, explained and marked
            on the picture above as it appears.
          </p>
          <Button className="clay-btn min-h-12 w-full sm:w-auto" onClick={() => go(0)}>
            <Play className="size-4" aria-hidden /> Begin the walkthrough
          </Button>
        </>
      ) : (
        <>
          {/* progress dots */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Guided steps">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                aria-label={`Step ${i + 1}: ${s.label}`}
                onClick={() => go(i)}
                className={cn(
                  'min-h-11 min-w-11 rounded-lg border px-2 text-xs font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  i === idx
                    ? 'border-sev-warn/50 bg-sev-warn/15 text-sev-warn'
                    : i < (idx ?? 0)
                      ? 'border-line bg-surface-2/60 text-ink-soft'
                      : 'border-line/60 text-ink-soft/50',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="min-w-0 space-y-2 rounded-xl border border-line bg-surface-2/30 p-3.5">
            <p className="flex min-w-0 items-start gap-2 text-sm font-semibold leading-snug">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-sev-warn/20 text-[11px] font-bold text-sev-warn">
                {idx! + 1}
              </span>
              <span className="min-w-0">{step!.label}</span>
            </p>
            <p className="text-[13px] leading-relaxed">{step!.description}</p>
            <p className="border-l-2 border-primary/50 pl-3 text-[13px] italic leading-relaxed text-ink-soft">
              <span className="sr-only">Why it matters: </span>{step!.why}
            </p>
            {!step!.region && (
              <p className="text-[11px] text-ink-soft/70">No marked region for this step — it is a pattern, not a point.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="min-h-11 flex-1 sm:flex-none"
              onClick={() => go(idx! === 0 ? null : idx! - 1)}
            >
              <ArrowLeft className="size-4" aria-hidden /> {idx === 0 ? 'Close' : 'Previous'}
            </Button>
            {!atEnd && (
              <Button className="clay-btn min-h-11 flex-1 sm:flex-none" onClick={() => go(idx! + 1)}>
                Next finding <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
            {atEnd && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-ok/30 bg-sev-ok/12 px-3 py-2 text-xs font-bold text-sev-ok">
                <CheckCircle2 className="size-4" aria-hidden /> All {steps.length} findings revealed
              </span>
            )}
            <Button variant="ghost" className="min-h-11" onClick={() => go(null)} aria-label="Reset the walkthrough">
              <RotateCcw className="size-4" aria-hidden />
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

// ─── AI panel (grounded image tutor) ─────────────────────────────────────────

interface AiTurn { role: 'user' | 'assistant'; text: string; fallback?: boolean; badge?: string }

const AI_CHIPS = [
  'What exactly am I looking at?',
  'Walk me through the findings',
  'Why does this matter clinically?',
  'What would change the diagnosis?',
]

function AiPanel({ imageId }: { imageId: string }) {
  const [turns, setTurns] = useState<AiTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [disclaimer, setDisclaimer] = useState<string | null>(null)

  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    setNotice(null)
    setInput('')
    setTurns((ts) => [...ts, { role: 'user', text: q }])
    try {
      const res: LabAiResponse = await api.labAi({ imageId, question: q })
      setTurns((ts) => [...ts, { role: 'assistant', text: res.reply, fallback: res.fallback, badge: res.aiBadge }])
      setDisclaimer(res.disclaimer)
    } catch {
      setTurns((ts) => ts.slice(0, -1)) // stay honest — drop the unanswered question
      setNotice('The image tutor is unreachable right now — try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [busy, imageId])

  return (
    <section className="clay space-y-3 rounded-2xl p-4 md:p-5" aria-label="Ask the image tutor">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
          <Bot className="size-4" aria-hidden />
        </span>
        <MicroLabel>Ask about this image</MicroLabel>
        <Badge variant="outline" className="ml-auto border-sev-warn/40 bg-sev-warn/10 text-[9px] font-bold uppercase tracking-wider text-sev-warn">
          AI-generated · educational
        </Badge>
      </div>

      {turns.length === 0 && (
        <p className="text-sm leading-relaxed text-ink-soft">
          Grounded in this image&apos;s teaching notes only — the tutor explains what is shown and why it matters,
          with honest uncertainty. It will not hand you a definitive diagnosis.
        </p>
      )}

      {turns.length > 0 && (
        <div className={cn('max-h-72 space-y-2.5 overflow-y-auto rounded-xl bg-surface-2/40 p-3', SCROLL_SLIM)} aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[88%] space-y-1 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  t.role === 'user'
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md border border-line bg-background/80',
                )}
              >
                <span className="sr-only">{t.role === 'user' ? 'You asked: ' : 'Tutor: '}</span>
                {t.role === 'assistant' && t.badge && (
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-sev-warn">{t.badge}</span>
                )}
                <span className="block whitespace-pre-wrap">{t.text}</span>
                {t.fallback && (
                  <span className="block text-[10px] italic text-ink-soft">
                    From the written teaching notes — the AI service was unreachable.
                  </span>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <p className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-background/80 px-3.5 py-2.5 text-sm text-ink-soft">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading the teaching notes…
              </p>
            </div>
          )}
        </div>
      )}

      {notice && (
        <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-3.5 py-2.5 text-xs text-sev-crit">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
        {AI_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={busy}
            onClick={() => void ask(chip)}
            className="min-h-9 rounded-full border border-line bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
      >
        <label className="sr-only" htmlFor="lab-ai-input">Your question about this image</label>
        <input
          id="lab-ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. What is the key abnormality?"
          autoComplete="off"
          className="clay-field h-11 min-w-0 flex-1 rounded-xl border border-line bg-background/70 px-3.5 text-sm outline-none placeholder:text-ink-soft/60"
        />
        <Button type="submit" className="min-h-11 px-4" disabled={busy || !input.trim()} aria-label="Send question">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        </Button>
      </form>

      {disclaimer && (
        <p className="text-[10px] leading-relaxed text-ink-soft/80">{disclaimer}</p>
      )}
    </section>
  )
}

// ─── Study root ───────────────────────────────────────────────────────────────

export function LabStudyScreen({ detail, onBack, onLaunchMode, onRapid, onResume }: Props) {
  const [annotations, setAnnotations] = useState<LabAnnotation[]>([])
  const [comparator, setComparator] = useState<LabImageDetail['similar'][number] | null>(null)
  const [compareOn, setCompareOn] = useState(false)

  const summary = detail.summary
  const resume = detail.resume && detail.resume.mode !== 'rapid' ? detail.resume : null
  const canCompare = detail.similar.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <Reveal index={0} className="min-w-0 space-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden /> Library
        </button>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{summary.title}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="border-line text-[10px] font-bold uppercase tracking-wider text-ink-soft">
            {summary.modality}
          </Badge>
          <Badge variant="outline" className="border-line text-[10px] font-semibold text-ink-soft">
            {summary.system}
          </Badge>
          <DifficultyDots level={summary.difficulty} className="ml-0.5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{difficultyLabel(summary.difficulty)}</span>
          <RelevanceChip value={summary.examRelevance} />
          <ProvenanceChip provenance={summary.provenance} />
        </div>
        <p className="sr-only">{LAB_PROVENANCE_META[summary.provenance].note}</p>
      </Reveal>

      {/* ── Resume banner ── */}
      {resume && (
        <Reveal index={1}>
          <button
            type="button"
            onClick={onResume}
            className="warm-card flex w-full min-w-0 items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Resume your ${resume.mode} attempt`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sev-warn/15 text-sev-warn">
              <RotateCcw className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-sev-warn">Attempt in progress</span>
              <span className="block truncate text-sm font-semibold">
                {LAB_MODE_META[resume.mode]?.label ?? resume.mode} mode — continue where you stopped
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden />
          </button>
        </Reveal>
      )}

      {/* ── Viewer (primary focus) ── */}
      <Reveal index={2} className="min-w-0">
        <LabViewer
          src={summary.src}
          alt={`${summary.title} — ${summary.modality} teaching image`}
          caption={studyCaption(summary.isNormal)}
          provenance={summary.provenance}
          sourceNote={summary.provenance === 'owned-clinical' ? null : LAB_PROVENANCE_META[summary.provenance].note}
          annotations={annotations}
          forceAnnotations={annotations.length > 0}
          compare={compareOn && comparator ? {
            src: comparator.src,
            alt: `${comparator.title} — ${comparator.modality}`,
            caption: `${comparator.title} · ${comparator.modality}`,
            provenance: comparator.provenance,
          } : null}
        />
      </Reveal>

      {/* ── Compare launcher ── */}
      {canCompare && (
        <Reveal index={3} className="space-y-2.5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <MicroLabel>
              Compare{summary.compareGroup ? ` · ${summary.compareGroup} group` : ''}
            </MicroLabel>
            {comparator && (
              <button
                type="button"
                onClick={() => setCompareOn((v) => !v)}
                aria-pressed={compareOn}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  compareOn
                    ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                    : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40 hover:text-foreground',
                )}
              >
                <GitCompareArrows className="size-3.5" aria-hidden />
                {compareOn ? 'Exit compare' : 'Compare side-by-side'}
              </button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-ink-soft">
            Pick a partner image — normal vs abnormal, or the look-alike you keep mixing up. Each pane zooms
            independently.
          </p>
          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Choose a comparison image">
            {detail.similar.map((s) => {
              const active = comparator?.id === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setComparator(s); setCompareOn(true) }}
                  aria-pressed={active}
                  aria-label={`Compare with ${s.title} (${s.modality})`}
                  className={cn(
                    'flex w-40 shrink-0 flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'border-primary/50 bg-primary/10' : 'border-line bg-surface-2/40 hover:border-primary/40',
                  )}
                >
                  { }
                  <img src={s.src} alt="" loading="lazy" draggable={false} className="h-16 w-full rounded-lg object-contain" />
                  <span className="line-clamp-2 text-[11px] font-semibold leading-snug">{s.title}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-ink-soft">{s.modality}</span>
                </button>
              )
            })}
          </div>
        </Reveal>
      )}

      {/* ── Mode launchers ── */}
      <Reveal index={4} className="space-y-2.5">
        <MicroLabel>Practice this image</MicroLabel>
        <ModeLaunchers detail={detail} onLaunchMode={onLaunchMode} onRapid={onRapid} />
      </Reveal>

      {/* ── Guided explanation ── */}
      <Reveal index={5}>
        <GuidedReveal detail={detail} onRevealChange={setAnnotations} />
      </Reveal>

      {/* ── AI panel ── */}
      <Reveal index={6}>
        <AiPanel imageId={summary.id} />
      </Reveal>

      {/* ── Concepts ── */}
      {detail.concepts.length > 0 && (
        <Reveal index={7} className="space-y-2.5">
          <MicroLabel>Concepts this image tests</MicroLabel>
          <p className="text-xs leading-relaxed text-ink-soft">
            Open them from the debrief after a graded run — mastery is measured there.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {detail.concepts.map((c) => (
              <span key={c.id} className="rounded-full border border-line bg-surface-2/50 px-3 py-2 text-xs font-medium text-ink-soft">
                {c.name}
              </span>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  )
}

function studyCaption(isNormal: boolean): string {
  return isNormal
    ? 'Study the film, then prove it is normal — normalcy is a finding too.'
    : 'Study the film — something abnormal is waiting to be found.'
}
