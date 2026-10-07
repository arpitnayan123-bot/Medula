'use client'

// ─── CLINICAL CASE SIMULATOR · SHARED PRIMITIVES (PRODUCT 09) ───
// Visual language matches the Porcelain Atlas system:
// clay + podium panels, sev tones, uppercase micro-labels, Reveal entrances.
// The API contract lives FROZEN in src/lib/types.ts — nothing here redefines it.

import { useEffect, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle, BedDouble, CheckCircle2, ClipboardList, Crosshair, FlaskConical,
  GitCompareArrows, MinusCircle, Pill, Repeat2, ScanSearch, Stethoscope, XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SimDifficulty, SimFeedbackOption, SimStageKind } from '@/lib/types'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Slim scrollbar utility for horizontally scrolling strips (stage rail, chips)
export const SCROLL_SLIM =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line ' +
  '[&::-webkit-scrollbar-track]:bg-transparent'

// ─── Motion primitives (same pattern as revision-shared) ─────────────────────

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : 0.06 * index, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (reduce) return
    const controls = animate(0, value, {
      duration: 1,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, reduce])

  return <span className={className}>{reduce ? value : display}</span>
}

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

// ─── Platform-owned clinical images (public/questions) ───────────────────────
// imageKey → file mapping confirmed against the shipped asset set at build
// time. Keys outside this set are NOT rendered (no broken-image guesswork).

export const IMG_FILES: Record<string, string> = {
  'endo-gastric-ulcer': 'endo-gastric-ulcer.jpg',
  'cxr-free-air': 'cxr-free-air.jpg',
  'ecg-complete-heart-block': 'ecg-complete-heart-block.jpg',
  'cxr-pulm-edema': 'cxr-pulm-edema.jpg',
  'cxr-boot-heart': 'cxr-boot-heart.jpg',
  'cxr-left-collapse': 'cxr-left-collapse.jpg',
  'thyroid-scan-graves': 'thyroid-scan-graves.jpg',
}

export function imgSrc(key?: string | null): string | null {
  if (!key) return null
  const file = IMG_FILES[key]
  return file ? `/questions/${file}` : null
}

// ─── Difficulty palette (existing severity tokens — no blue/indigo) ──────────

export const DIFF_TONE: Record<SimDifficulty, string> = {
  beginner: 'border-sev-ok/30 bg-sev-ok/12 text-sev-ok',
  mbbs: 'border-info/30 bg-info/12 text-info',
  neetpg: 'border-sev-warn/30 bg-sev-warn/15 text-sev-warn',
  advanced: 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit',
}

// ─── Verdict semantics (deterministic engine output) ─────────────────────────

export const VERDICT_META: Record<SimFeedbackOption['verdict'], { icon: LucideIcon; label: string; chip: string }> = {
  correct: { icon: CheckCircle2, label: 'Essential', chip: 'border-sev-ok/30 bg-sev-ok/12 text-sev-ok' },
  acceptable: { icon: MinusCircle, label: 'Reasonable', chip: 'border-info/25 bg-info/10 text-info' },
  wrong: { icon: XCircle, label: 'Not the key', chip: 'border-sev-warn/30 bg-sev-warn/15 text-sev-warn' },
  harmful: { icon: AlertTriangle, label: 'Harmful', chip: 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit' },
}

// ─── Stage rail metadata ─────────────────────────────────────────────────────

export const STAGE_META: Record<SimStageKind, { icon: LucideIcon; label: string }> = {
  patient: { icon: BedDouble, label: 'Patient' },
  history: { icon: ClipboardList, label: 'History' },
  exam: { icon: Stethoscope, label: 'Examination' },
  investigations: { icon: FlaskConical, label: 'Investigations' },
  differential: { icon: GitCompareArrows, label: 'Differential' },
  diagnosis: { icon: Crosshair, label: 'Diagnosis' },
  management: { icon: Pill, label: 'Management' },
  followup: { icon: Repeat2, label: 'Follow-up' },
}

/** Stages the AI patient roleplays (guided mode runs explore interactions here). */
export const AI_CHAT_STAGE_KINDS: readonly SimStageKind[] = ['history', 'exam', 'investigations']

export const isAiChatStage = (kind: SimStageKind): boolean => AI_CHAT_STAGE_KINDS.includes(kind)

/** Quick-question chips for AI Case Mode, derived from the stage kind. */
export const AI_QUICK_CHIPS: Partial<Record<SimStageKind, string[]>> = {
  history: [
    'What brings you in today?',
    'Where exactly does it hurt?',
    'When did it start?',
    'Do you take any medications?',
    'Any allergies?',
    'Have you had this before?',
  ],
  exam: [
    'Check the vital signs',
    'Examine the abdomen',
    'Listen to the chest',
    'Anything unusual on inspection?',
  ],
  investigations: [
    'Show me the investigation results',
    'What do the blood tests show?',
    'What does the imaging show?',
    'Is anything urgently abnormal?',
  ],
}

/** Local-only scene notes appended to the AI chat when the stage advances. */
export const AI_SCENE_NOTE: Partial<Record<SimStageKind, string>> = {
  exam: '— You wash your hands and move to the examination. Ask what you would like to check. —',
  investigations: '— You step out to the charts. Ask to see any investigation. —',
}

// ─── Time + number helpers ───────────────────────────────────────────────────

export function fmtClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const diff = Date.now() - then
  if (diff < 0) return 'just now'
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

/** KnowledgeState mastery may arrive as 0..1 or 0..100 — normalise honestly. */
export function asPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.round(v <= 1 ? v * 100 : v)
}

/** Same status convention as the Knowledge Graph (graph-parts.tsx). */
export function statusTone(s: string | null | undefined): string {
  switch (s) {
    case 'strong': return 'border-sev-ok/30 bg-sev-ok/12 text-sev-ok'
    case 'unstable': return 'border-sev-warn/30 bg-sev-warn/15 text-sev-warn'
    case 'weak': return 'border-sev-crit/30 bg-sev-crit/10 text-sev-crit'
    default: return 'border-line bg-surface-2/60 text-ink-soft'
  }
}
