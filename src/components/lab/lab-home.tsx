'use client'

// ─── MEDICAL IMAGE LEARNING LAB · LIBRARY DASHBOARD (PRODUCT 10) ───
// «See → Identify → Interpret → Reason → Learn → Practice.» Everything
// measured from this profile's LabAttempt rows by the deterministic engine:
// accuracy, interpretation coverage, response time, rapid best, weak
// modalities, missed patterns, the recommended next image and the resume
// banner. Card labels stay diagnosis-agnostic — answers unlock in study.

import { useMemo, useState } from 'react'
import {
  Activity, ArrowRight, CheckCircle2, Clock3, Compass, Crosshair, Flame, Image as ImageIcon,
  Play, RotateCcw, ScanEye, Target, TrendingUp, XCircle, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  LAB_MODALITIES, LAB_MODE_META,
} from '@/lib/types'
import type { LabHome, LabImageSummary, LabMode, LabModality } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Stagger, StaggerItem, ScrollReveal } from '@/components/primitives/motion'
import { DotMatrix } from '@/components/primitives/scenery'
import { cn } from '@/lib/utils'
import {
  DifficultyDots, MicroLabel, ProvenanceChip, RelevanceChip, Reveal, ScopeChip, SCROLL_SLIM,
  difficultyLabel, relTime,
} from './lab-shared'

interface Props {
  home: LabHome
  onOpenImage: (imageId: string) => void
  onStartRapid: (scope: { modality?: string; subjectCode?: string }) => void
  rapidSignal?: boolean
}

type RelFilter = 0 | 3 | 4 | 5

// ─── Small pieces ─────────────────────────────────────────────────────────────

function StatChip({ icon: Icon, value, label, accent }: { icon: LucideIcon; value: string; label: string; accent?: boolean }) {
  return (
    <div className="clay flex min-h-16 min-w-0 flex-1 basis-36 items-center gap-3 rounded-2xl px-4 py-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', accent ? 'bg-primary/12 text-primary' : 'bg-surface-2 text-ink-soft')}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold tabular-nums leading-tight">{value}</span>
        <span className="block truncate text-[11px] font-medium text-ink-soft">{label}</span>
      </span>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'clay-in border-primary/40 bg-primary/12 text-primary'
          : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Diagnosis-agnostic status line — never reveals the answer. */
function studyLine(img: LabImageSummary): string {
  if (img.isNormal) return 'Normal study — prove it'
  return 'Abnormal study — find the findings'
}

function resultLine(img: LabImageSummary): React.ReactNode {
  if (img.attemptCount === 0) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Play className="size-3.5" aria-hidden /> Not attempted yet
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-soft">
      {img.lastScore != null && img.lastScore >= 60 ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-sev-ok" aria-label="last run passed" />
      ) : (
        <XCircle className="size-3.5 shrink-0 text-sev-crit" aria-label="last run below pass mark" />
      )}
      <span className="truncate">
        {img.attemptCount} {img.attemptCount === 1 ? 'run' : 'runs'}
        {img.bestScore != null ? ` · best ${Math.round(img.bestScore)}` : ''}
        {img.lastScore != null ? ` · last ${Math.round(img.lastScore)}` : ''}
        {img.lastAt ? ` · ${relTime(img.lastAt)}` : ''}
      </span>
    </span>
  )
}

function ImageCard({ img, onOpen }: { img: LabImageSummary; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(img.id)}
      className="clay clay-hover flex w-full min-w-0 flex-col overflow-hidden rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open image: ${img.title} — ${img.modality}, ${img.system}, difficulty ${img.difficulty} of 3, exam relevance ${img.examRelevance} of 5`}
    >
      <span className="block h-32 w-full border-b border-line bg-surface-2/30 p-1.5">
        { }
        <img
          src={img.src}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full rounded-lg object-contain"
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
        <span className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-[15px] font-semibold leading-snug tracking-tight">{img.title}</h3>
          <DifficultyDots level={img.difficulty} />
        </span>

        <span className="text-xs font-medium text-ink-soft">
          {img.modality} · {img.system}
        </span>

        <span className="flex flex-wrap gap-1.5">
          <RelevanceChip value={img.examRelevance} />
          <ProvenanceChip provenance={img.provenance} />
          <span className="inline-flex shrink-0 items-center rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-soft">
            {studyLine(img)}
          </span>
        </span>

        <span className="mt-auto block border-t border-line/70 pt-2.5">{resultLine(img)}</span>
      </span>
    </button>
  )
}

// ─── Home screen ──────────────────────────────────────────────────────────────

export function LabHomeScreen({ home, onOpenImage, onStartRapid, rapidSignal }: Props) {
  const [subjectF, setSubjectF] = useState<string | null>(null)
  const [systemF, setSystemF] = useState<string | null>(null)
  const [modalityF, setModalityF] = useState<LabModality | null>(null)
  const [diffF, setDiffF] = useState<number | null>(null)
  const [relF, setRelF] = useState<RelFilter>(0)

  const [rapidModality, setRapidModality] = useState<LabModality | null>(null)
  const [rapidSubject, setRapidSubject] = useState<string | null>(null)

  const stats = home.stats

  const subjects = useMemo(
    () => [...new Set(home.images.map((i) => i.subjectCode))].sort(),
    [home.images],
  )
  const systems = useMemo(
    () => [...new Set(home.images.map((i) => i.system))].sort(),
    [home.images],
  )
  const modalities = useMemo(
    () => LAB_MODALITIES.filter((m) => home.images.some((i) => i.modality === m)),
    [home.images],
  )
  const difficulties = useMemo(
    () => [1, 2, 3].filter((d) => home.images.some((i) => i.difficulty === d)),
    [home.images],
  )

  const filtered = useMemo(
    () => home.images.filter(
      (img) =>
        (!subjectF || img.subjectCode === subjectF) &&
        (!systemF || img.system === systemF) &&
        (!modalityF || img.modality === modalityF) &&
        (!diffF || img.difficulty === diffF) &&
        (relF === 0 || img.examRelevance >= relF),
    ),
    [home.images, subjectF, systemF, modalityF, diffF, relF],
  )

  const filtersActive = subjectF != null || systemF != null || modalityF != null || diffF != null || relF !== 0

  const clearFilters = () => {
    setSubjectF(null); setSystemF(null); setModalityF(null); setDiffF(null); setRelF(0)
  }

  const startRapid = () => {
    onStartRapid({
      ...(rapidModality ? { modality: rapidModality } : {}),
      ...(rapidSubject ? { subjectCode: rapidSubject } : {}),
    })
  }

  const avgSec = stats.avgTimeMs != null ? (stats.avgTimeMs / 1000).toFixed(1) : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* ── Hero: the learning loop — porcelain podium ── */}
      <Reveal index={0}>
        <div className="podium relative overflow-hidden rounded-3xl p-5 md:p-7">
          <DotMatrix />
          <div className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full bg-[#f3d5a4]/35 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -left-14 -bottom-8 size-48 rounded-full bg-[#c9e8d4]/30 blur-3xl" aria-hidden />
          <div className="relative min-w-0 space-y-2">
            <MicroLabel className="text-primary">Product 10 · Visual diagnosis</MicroLabel>
            <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Medical Image Learning Lab</h1>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-relaxed text-ink-soft" aria-label="Learning loop">
              {['See', 'Identify', 'Interpret', 'Reason', 'Learn', 'Practice'].map((step, i, arr) => (
                <span key={step} className="inline-flex items-center gap-1.5">
                  <span className={cn('font-semibold', i === 0 ? 'text-foreground' : 'text-ink-soft')}>{step}</span>
                  {i < arr.length - 1 && <ArrowRight className="size-3.5 shrink-0 text-primary/70" aria-hidden />}
                </span>
              ))}
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
              {stats.imagesAvailable} platform-owned teaching images across {modalities.length} modalities. Zoom in,
              place pins where the findings live, and let the deterministic engine grade your eye.
            </p>
          </div>
        </div>
      </Reveal>

      {/* ── Resume banner ── */}
      {home.resume && home.resume.mode !== 'rapid' && (
        <Reveal index={1}>
          <button
            type="button"
            onClick={() => onOpenImage(home.resume!.imageId)}
            className="warm-card clay-hover flex w-full min-w-0 items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Resume ${home.resume.mode} attempt on ${home.resume.imageTitle}`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sev-warn/15 text-sev-warn">
              <RotateCcw className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-sev-warn">
                Attempt in progress
              </span>
              <span className="block truncate text-sm font-semibold">“{home.resume.imageTitle}”</span>
              <span className="block text-xs text-ink-soft">
                {LAB_MODE_META[home.resume.mode as LabMode]?.label ?? home.resume.mode} mode — picks up where you left off
              </span>
            </span>
            <span className="hidden shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary sm:flex">
              Continue <Play className="size-3.5" aria-hidden />
            </span>
          </button>
        </Reveal>
      )}

      {/* ── Rapid Fire banner ── */}
      <Reveal index={2}>
        <section
          className={cn(
            'clay space-y-3.5 rounded-2xl border-primary/25 p-4 md:p-5',
            rapidSignal && 'ring-2 ring-primary/50',
          )}
          aria-label="Rapid fire drill"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Zap className="size-4" aria-hidden />
            </span>
            <MicroLabel className="text-primary">Rapid fire · {home.rapidPoolSize} images in the pool</MicroLabel>
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            Ten images, one look each. Big picture, four options, verdict in a blink — speed is scored, hesitation
            is not fatal.
          </p>

          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Rapid fire modality scope">
            <ScopeChip active={rapidModality === null} onClick={() => setRapidModality(null)}>
              Any modality
            </ScopeChip>
            {modalities.map((m) => (
              <ScopeChip key={m} active={rapidModality === m} onClick={() => setRapidModality(rapidModality === m ? null : m)}>
                {m}
              </ScopeChip>
            ))}
          </div>
          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Rapid fire subject scope">
            <ScopeChip active={rapidSubject === null} onClick={() => setRapidSubject(null)}>
              Any subject
            </ScopeChip>
            {subjects.map((s) => (
              <ScopeChip key={s} active={rapidSubject === s} onClick={() => setRapidSubject(rapidSubject === s ? null : s)}>
                {s}
              </ScopeChip>
            ))}
          </div>

          <Button className="clay-btn min-h-12 w-full sm:w-auto" onClick={startRapid} disabled={home.rapidPoolSize === 0}>
            <Zap className="size-4" aria-hidden /> Start rapid fire · 10 images
          </Button>
        </section>
      </Reveal>

      {/* ── Measured stat chips ── */}
      <Reveal index={3} className="flex flex-wrap gap-2.5">
        <StatChip icon={ScanEye} value={`${stats.imagesStudied}/${stats.imagesAvailable}`} label="images studied" accent />
        <StatChip icon={Target} value={stats.accuracy != null ? `${Math.round(stats.accuracy)}%` : '—'} label="graded accuracy" />
        <StatChip icon={Crosshair} value={stats.interpretationCoverage != null ? `${Math.round(stats.interpretationCoverage)}%` : '—'} label="pin coverage" />
        <StatChip icon={Clock3} value={avgSec != null ? `${avgSec}s` : '—'} label="avg response time" />
        <StatChip icon={Flame} value={stats.rapidBest != null ? String(Math.round(stats.rapidBest)) : '—'} label="rapid best score" />
      </Reveal>

      {/* ── Library filters ── */}
      <section aria-label="Image library filters" className="space-y-3">
        <Reveal index={4} className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <MicroLabel>Library · {home.images.length} images</MicroLabel>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 rounded-full px-3 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Filter by subject">
            <FilterChip active={subjectF === null} onClick={() => setSubjectF(null)}>All subjects</FilterChip>
            {subjects.map((s) => (
              <FilterChip key={s} active={subjectF === s} onClick={() => setSubjectF(subjectF === s ? null : s)}>{s}</FilterChip>
            ))}
          </div>

          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Filter by body system">
            <FilterChip active={systemF === null} onClick={() => setSystemF(null)}>All systems</FilterChip>
            {systems.map((s) => (
              <FilterChip key={s} active={systemF === s} onClick={() => setSystemF(systemF === s ? null : s)}>{s}</FilterChip>
            ))}
          </div>

          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Filter by modality">
            <FilterChip active={modalityF === null} onClick={() => setModalityF(null)}>All modalities</FilterChip>
            {modalities.map((m) => (
              <FilterChip key={m} active={modalityF === m} onClick={() => setModalityF(modalityF === m ? null : m)}>{m}</FilterChip>
            ))}
          </div>

          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)} role="group" aria-label="Filter by difficulty and exam relevance">
            {difficulties.map((d) => (
              <FilterChip key={d} active={diffF === d} onClick={() => setDiffF(diffF === d ? null : d)}>
                {difficultyLabel(d)}
              </FilterChip>
            ))}
            <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
            {([0, 3, 4, 5] as RelFilter[]).map((r) => (
              <FilterChip key={r} active={relF === r} onClick={() => setRelF(r)}>
                {r === 0 ? 'Any relevance' : r === 5 ? 'Relevance 5/5' : `Relevance ≥${r}`}
              </FilterChip>
            ))}
          </div>
        </Reveal>

        {/* ── Image cards grid ── */}
        {home.images.length === 0 ? (
          <Reveal index={5}>
            <div className="clay flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-primary/10">
                <Compass className="size-7 text-primary" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold tracking-tight">The library is empty for now</h2>
              <p className="max-w-sm text-sm text-ink-soft">
                Teaching images land here as the library grows. The Adaptive Engine and Topic Hub already carry
                the concepts they will test.
              </p>
            </div>
          </Reveal>
        ) : filtered.length === 0 ? (
          <Reveal index={5}>
            <div className="clay flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
              <p className="text-sm font-medium">No images match these filters.</p>
              <Button variant="outline" className="min-h-11" onClick={clearFilters}>Clear filters</Button>
            </div>
          </Reveal>
        ) : (
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((img) => (
              <StaggerItem key={img.id}>
                <ImageCard img={img} onOpen={onOpenImage} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {/* ── Weak modalities ── */}
      {home.weakModalities.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel className="text-sev-warn">Weak modalities — below 70% measured</MicroLabel>
          <div className="clay space-y-3.5 rounded-2xl p-4 md:p-5">
            {home.weakModalities.map((w, i) => (
              <div key={`${w.label}-${i}`} className="min-w-0">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold">{w.label}</span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-sev-warn">
                    {Math.round(w.accuracy)}%
                  </span>
                </div>
                <Progress value={Math.max(0, Math.min(100, Math.round(w.accuracy)))} aria-label={`${w.label} accuracy ${Math.round(w.accuracy)} percent`} className="h-1.5" />
                <p className="mt-1 text-[11px] text-ink-soft">
                  across {w.attempts} graded {w.attempts === 1 ? 'attempt' : 'attempts'}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      )}

      {/* ── Missed patterns ── */}
      {home.missedPatterns.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel className="text-sev-crit">Missed patterns — same finding, several runs</MicroLabel>
          <div className="clay divide-y divide-line/70 rounded-2xl p-2 md:p-3">
            {home.missedPatterns.map((p, i) => (
              <div key={i} className="flex min-w-0 items-start gap-3 p-2.5 md:p-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sev-crit/10 text-sev-crit">
                  <XCircle className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">
                    Missed “{p.label}” in {p.count} {p.count === 1 ? 'run' : 'runs'}
                  </p>
                  <p className="truncate text-xs text-ink-soft">last: {p.lastImageTitle}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      )}

      {/* ── Recommended next image ── */}
      {home.recommended && (
        <ScrollReveal>
          <section className="clay space-y-3 rounded-2xl border-primary/25 p-4 md:p-5" aria-label="Recommended next image">
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              <MicroLabel className="text-primary">Recommended next image</MicroLabel>
            </div>
            <p className="text-lg font-semibold leading-snug tracking-tight">{home.recommended.title}</p>
            <p className="text-sm leading-relaxed text-ink-soft">{home.recommended.reason}</p>
            <Button className="clay-btn min-h-12 w-full sm:w-auto" onClick={() => onOpenImage(home.recommended!.imageId)}>
              <ImageIcon className="size-4" aria-hidden /> Open this image
            </Button>
          </section>
        </ScrollReveal>
      )}

      {/* ── Recent runs ── */}
      {home.recent.length > 0 && (
        <ScrollReveal className="space-y-3">
          <MicroLabel>Recent runs</MicroLabel>
          <div className={cn('flex gap-2 overflow-x-auto pb-1', SCROLL_SLIM)}>
            {home.recent.map((r, i) => (
              <button
                key={`${r.imageId}-${i}`}
                type="button"
                onClick={() => onOpenImage(r.imageId)}
                className="clay clay-hover flex w-52 shrink-0 flex-col gap-1 rounded-2xl p-3.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Reopen ${r.title} — score ${Math.round(r.score)}, ${r.correct ? 'passed' : 'below pass mark'}`}
              >
                <span className="flex items-center gap-1.5">
                  {r.correct ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-sev-ok" aria-hidden />
                  ) : (
                    <XCircle className="size-3.5 shrink-0 text-sev-crit" aria-hidden />
                  )}
                  <span className="text-xs font-bold tabular-nums">{Math.round(r.score)}</span>
                  <span className="ml-auto truncate text-[9px] font-bold uppercase tracking-wider text-ink-soft">
                    {LAB_MODE_META[r.mode as LabMode]?.label ?? r.mode}
                  </span>
                </span>
                <span className="truncate text-sm font-medium">{r.title}</span>
                <span className="truncate text-[11px] text-ink-soft">{relTime(r.at)}</span>
              </button>
            ))}
          </div>
        </ScrollReveal>
      )}

      {/* Measured-data footnote */}
      {stats.attempts === 0 && (
        <ScrollReveal>
          <p className="rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            Accuracy, pin coverage, response time and the rapid record appear here as measured values once you
            complete your first graded attempt — nothing is estimated or assumed.
            <Activity className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />
          </p>
        </ScrollReveal>
      )}
    </div>
  )
}
