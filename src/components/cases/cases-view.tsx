'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  NotebookPen,
  Orbit,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Stethoscope,
  Target,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Concept3D } from '@/components/concept/concept-3d'
import { PageHeader } from '@/components/primitives/kit'
import { Pop, ScrollReveal, Stagger, StaggerItem } from '@/components/primitives/motion'
import { PulseTrace } from '@/components/primitives/scenery'
import type { ConceptDetail } from '@/lib/types'
import { SYSTEMS } from '@/lib/types'
import type { LogbookEntryClient } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Case → diagrammed concept whose 3D layer diagram best explains the mechanism
// behind the case's final diagnosis (only cases with a matching diagram).
const CASE_3D: Record<string, string> = {
  'case-graves': 'c-thyroidphys',
  'case-nephrotic': 'c-gfr',
  'case-ami': 'c-ecg',
  'case-dka': 'c-dka',
}

// ─── Local types (mirror api.cases / api.caseDetail payloads) ────────────────

interface CaseSummary {
  id: string
  title: string
  specialty: string
  system: string
  difficulty: number
  patient: { age: string; sex: string; occupation: string; complaint: string }
  attempted: boolean
  lastScore: number | null
}

interface CaseStep {
  id: string
  phase: string
  title: string
  content: string[]
  question?: string
  options?: string[]
}

interface CaseDetail {
  id: string
  title: string
  specialty: string
  system: string
  difficulty: number
  patient: Record<string, string>
  steps: CaseStep[]
  learning: string[]
  attempted: boolean
  lastScore: number | null
}

interface StepVerdict {
  correct: boolean
  answerId: number
  teaching: string
}

interface StepDecision {
  stepId: string
  chosen: number
  correct: boolean
}

interface Finding {
  phase: string
  text: string
}

type LoadState = 'loading' | 'ready' | 'error'
type ReportStatus = 'idle' | 'loading' | 'ready' | 'error'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

const PATIENT_ROWS: { key: string; label: string }[] = [
  { key: 'age', label: 'Age' },
  { key: 'sex', label: 'Sex' },
  { key: 'occupation', label: 'Occupation' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diffMeta(d: number): { label: string; cls: string } {
  if (d <= 1) return { label: 'Easy', cls: 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok' }
  if (d >= 3) return { label: 'Hard', cls: 'border-sev-crit/40 bg-sev-crit/10 text-sev-crit' }
  return { label: 'Moderate', cls: 'border-sev-warn/40 bg-sev-warn/10 text-sev-warn' }
}

function initialsOf(title: string): string {
  const words = title
    .replace(/[^a-zA-Z ]/g, ' ')
    .split(' ')
    .filter(Boolean)
  const significant = words.filter((w) => w.length > 2)
  const src = significant.length >= 2 ? significant : words
  const out = src
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
  return out || 'PT'
}

function scoreColor(score: number): string {
  if (score >= 70) return 'var(--sev-ok)'
  if (score >= 40) return 'var(--sev-warn)'
  return 'var(--sev-crit)'
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function MiniRing({ value, size = 38, stroke = 4 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={scoreColor(pct)}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[9px] font-bold tabular-nums">{pct}</span>
    </span>
  )
}

function ScoreRing({
  value,
  size,
  stroke,
  gradientId,
  children,
}: {
  value: number
  size: number
  stroke: number
  gradientId: string
  children?: ReactNode
}) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" />
            <stop offset="100%" stopColor="var(--chart-2)" />
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
          stroke={`url(#${gradientId})`}
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.3, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ─── Loading / error states ──────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-busy="true" role="status">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="shimmer h-48 rounded-2xl" />
      ))}
    </div>
  )
}

function LoadErrorCard({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-sev-crit/10">
        <AlertTriangle className="size-6 text-sev-crit" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{message}</h2>
      <p className="max-w-sm text-sm text-ink-soft">
        The server did not respond. Check your connection and try again — your case history is safe.
      </p>
      <Button variant="outline" className="min-h-11" onClick={onRetry}>
        <RefreshCw className="size-4" /> Retry
      </Button>
    </div>
  )
}

function PlayerSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true" role="status">
      <Skeleton className="shimmer h-80 rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="shimmer h-10 w-full rounded-xl" />
        <Skeleton className="shimmer h-72 w-full rounded-2xl" />
      </div>
    </div>
  )
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function CasesView() {
  const setView = useAppStore((s) => s.setView)
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const reduce = useReducedMotion()

  // Tab state — case simulator vs clinical logbook
  const [tab, setTab] = useState<'cases' | 'logbook'>('cases')

  // List state
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [listStatus, setListStatus] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  // Player state
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<LoadState>('loading')
  const [revealed, setRevealed] = useState(0)
  const [choice, setChoice] = useState<number | null>(null)
  const [verdict, setVerdict] = useState<StepVerdict | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [stepError, setStepError] = useState(false)
  const [decisions, setDecisions] = useState<StepDecision[]>([])
  const [report, setReport] = useState<{ score: number } | null>(null)
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle')

  const runIdRef = useRef(0)
  const completeFiredRef = useRef(false)

  // "The mechanism, in 3D" — collapsed drawer in the case report that renders
  // the compact Concept3D diagram for the concept behind the case diagnosis.
  const [show3d, setShow3d] = useState(false)
  const [detail3d, setDetail3d] = useState<ConceptDetail | null>(null)
  const [detail3dLoading, setDetail3dLoading] = useState(false)
  const [detail3dError, setDetail3dError] = useState(false)

  const concept3dId = detail ? CASE_3D[detail.id] : undefined

  const load3d = useCallback((conceptId: string) => {
    if (detail3d || detail3dLoading) return
    setDetail3dLoading(true)
    setDetail3dError(false)
    api.concept(conceptId)
      .then((d) => setDetail3d(d))
      .catch(() => setDetail3dError(true))
      .finally(() => setDetail3dLoading(false))
  }, [detail3d, detail3dLoading])

  const toggle3d = () => {
    const next = !show3d
    setShow3d(next)
    if (next && concept3dId) load3d(concept3dId)
  }

  // Cases list fetch (refetched on return from player so scores stay fresh)
  useEffect(() => {
    let cancelled = false
    api.cases().then(
      (res) => {
        if (cancelled) return
        setCases(res.cases)
        setListStatus('ready')
      },
      () => {
        if (cancelled) return
        setListStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // ── Derived run state ──
  const step = detail ? (detail.steps[Math.min(revealed, detail.steps.length - 1)] ?? null) : null
  const isLast = detail ? revealed >= detail.steps.length - 1 : false
  const reportVisible = step != null && isLast && (!step.question || verdict != null)
  const findings: Finding[] = detail
    ? detail.steps.slice(0, revealed + 1).flatMap((s) => s.content.map((text) => ({ phase: s.phase, text })))
    : []

  // ── Actions ──
  const openCase = useCallback((id: string) => {
    const my = ++runIdRef.current
    completeFiredRef.current = false
    setDetailStatus('loading')
    setDetail(null)
    setRevealed(0)
    setChoice(null)
    setVerdict(null)
    setSubmitting(false)
    setStepError(false)
    setDecisions([])
    setReport(null)
    setReportStatus('idle')
    setShow3d(false)
    setDetail3d(null)
    setDetail3dLoading(false)
    setDetail3dError(false)
    api.caseDetail(id).then(
      (res) => {
        if (runIdRef.current !== my) return
        setDetail(res)
        setDetailStatus('ready')
      },
      () => {
        if (runIdRef.current !== my) return
        setDetailStatus('error')
      },
    )
  }, [])

  const backToList = () => {
    runIdRef.current++
    setDetail(null)
    setListStatus('loading')
    setReloadKey((k) => k + 1)
  }

  const confirmDecision = () => {
    if (!detail || !step || step.question == null || choice == null || verdict || submitting) return
    const picked = choice
    setSubmitting(true)
    setStepError(false)
    api.caseStep(detail.id, { stepId: step.id, choice: picked }).then(
      (res) => {
        setSubmitting(false)
        setVerdict(res)
        setDecisions((prev) => [
          ...prev.filter((d) => d.stepId !== step.id),
          { stepId: step.id, chosen: picked, correct: res.correct },
        ])
      },
      () => {
        setSubmitting(false)
        setStepError(true)
      },
    )
  }

  const submitCompletion = useCallback(() => {
    if (!detail) return
    setReportStatus('loading')
    const questionSteps = detail.steps.filter((s) => s.question != null)
    const detailPayload = questionSteps.map((s) => {
      const d = decisions.find((x) => x.stepId === s.id)
      return { stepId: s.id, correct: d?.correct ?? false, chosen: d?.chosen ?? -1 }
    })
    const correctSteps = detailPayload.filter((d) => d.correct).length
    api
      .caseComplete(detail.id, {
        correctSteps,
        totalSteps: questionSteps.length,
        detail: detailPayload,
      })
      .then(
        (res) => {
          setReport({ score: res.score })
          setReportStatus('ready')
        },
        () => setReportStatus('error'),
      )
  }, [detail, decisions])

  const continueCase = () => {
    if (!detail) return
    const nextIdx = revealed + 1
    if (nextIdx > detail.steps.length - 1) return
    setRevealed(nextIdx)
    setChoice(null)
    setVerdict(null)
    setStepError(false)
    if (nextIdx === detail.steps.length - 1 && !completeFiredRef.current) {
      completeFiredRef.current = true
      submitCompletion()
    }
  }

  const retryCase = () => {
    completeFiredRef.current = false
    setRevealed(0)
    setChoice(null)
    setVerdict(null)
    setSubmitting(false)
    setStepError(false)
    setDecisions([])
    setReport(null)
    setReportStatus('idle')
  }

  const insightToQuestions = () => {
    if (!detail) return
    setQuizPreset({ system: detail.system, count: 8 })
    setView('questions')
  }

  // ─── RENDER: LIST ──────────────────────────────────────────────────────────
  if (!detail) {
    return (
      <div className="relative mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        {/* ── Header — porcelain editorial, faint ECG pulse in the header zone ── */}
        <div className="relative pb-12 md:pb-14">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 md:h-14" aria-hidden>
            <PulseTrace height={80} />
          </div>
          <PageHeader
            className="relative z-10"
            eyebrow={<><Stethoscope className="mr-1 inline size-3" />Clinical case simulator</>}
            title="Clinical Case Simulator"
            intro="Progressive-reveal cases. Make the call at every step — the platform explains your reasoning after."
          />
        </div>

        {/* Tab switcher — case simulator / clinical logbook */}
        <div className="clay-tray inline-flex rounded-xl p-1" role="tablist" aria-label="Cases sections">
          {([
            { id: 'cases' as const, label: 'CASE SIMULATOR', icon: Stethoscope },
            { id: 'logbook' as const, label: 'CLINICAL LOGBOOK', icon: NotebookPen },
          ]).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              data-state={tab === t.id ? 'active' : 'inactive'}
              onClick={() => setTab(t.id)}
              className={cn(
                'clay-tab flex min-h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold tracking-wide',
                tab === t.id ? 'text-foreground' : 'text-ink-soft hover:text-foreground',
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'logbook' ? (
          <LogbookPanel reduce={reduce} />
        ) : (
          <>
            {listStatus === 'loading' && <ListSkeleton />}
            {listStatus === 'error' && (
              <LoadErrorCard message="Couldn't load the case files" onRetry={() => setReloadKey((k) => k + 1)} />
            )}

            {listStatus === 'ready' && (
          <Stagger className="grid gap-4 md:grid-cols-2">
            {cases.map((c) => {
              const dm = diffMeta(c.difficulty)
              return (
                <StaggerItem key={c.id} className="flex flex-col">
                  <article className="clay clay-hover flex flex-1 flex-col rounded-2xl p-5 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]',
                        dm.cls,
                      )}
                    >
                      {dm.label}
                    </span>
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                      {c.specialty}
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-1.5 flex items-start gap-2 text-sm leading-snug text-ink-soft">
                    <UserRound className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {c.patient.age}-year-old {c.patient.sex.toLowerCase()} · {c.patient.occupation} —{' '}
                      {c.patient.complaint}
                    </span>
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
                    {c.attempted && c.lastScore != null ? (
                      <span className="inline-flex items-center gap-2 text-xs text-ink-soft">
                        <MiniRing value={c.lastScore} />
                        <span>
                          Attempted · last score{' '}
                          <span className="font-semibold tabular-nums">{c.lastScore}%</span>
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                        <Sparkles className="size-3.5" /> New case
                      </span>
                    )}
                    <Button className="min-h-11 font-semibold" onClick={() => openCase(c.id)}>
                      <Play className="size-4" /> START CASE
                    </Button>
                  </div>
                  </article>
                </StaggerItem>
              )
            })}
          </Stagger>
        )}
          </>
        )}
      </div>
    )
  }

  // ─── RENDER: PLAYER ────────────────────────────────────────────────────────
  const dm = diffMeta(detail.difficulty)
  const questionSteps = detail.steps.filter((s) => s.question != null)
  const correctSteps = decisions.filter((d) => d.correct).length
  const patient = detail.patient
  const extraRows = Object.entries(patient).filter(
    ([k]) => !PATIENT_ROWS.some((r) => r.key === k) && k !== 'complaint',
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          onClick={backToList}
          aria-label="Back to all cases"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            Clinical case simulator
          </p>
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{detail.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn('rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', dm.cls)}
          >
            {dm.label}
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            {detail.specialty}
          </span>
        </div>
      </div>

      {detailStatus === 'loading' && <PlayerSkeleton />}
      {detailStatus === 'error' && (
        <LoadErrorCard message="Couldn't open this case" onRetry={() => openCase(detail.id)} />
      )}

      {detailStatus === 'ready' && step && (
        <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Patient chart */}
          <aside className="clay rounded-2xl p-5 lg:sticky lg:top-6 lg:self-start">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {initialsOf(detail.title)}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Patient chart</p>
                <p className="truncate text-sm font-semibold">{patient.occupation ?? 'Patient'}</p>
              </div>
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
              {PATIENT_ROWS.filter((r) => patient[r.key] != null).map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">{r.label}</dt>
                  <dd className="truncate font-medium">{patient[r.key]}</dd>
                </div>
              ))}
              {extraRows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft capitalize">{k}</dt>
                  <dd className="truncate font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            {patient.complaint && (
              <p className="mt-3 rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm italic leading-relaxed">
                “{patient.complaint}”
              </p>
            )}

            <div className="mt-4 border-t border-line pt-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
                <Eye className="size-3.5" /> Findings so far
              </p>
              <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1 text-sm">
                {findings.length === 0 && (
                  <li className="text-xs text-ink-soft">Nothing revealed yet — take the history first.</li>
                )}
                {findings.map((f, i) => (
                  <motion.li
                    key={`${i}-${f.text.slice(0, 12)}`}
                    initial={reduce ? false : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex items-start gap-2 leading-snug"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                      {f.phase}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] text-foreground/90">{f.text}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Main column */}
          <div className="min-w-0 space-y-4">
            {/* Stepper */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Case steps">
              {detail.steps.map((s, i) => {
                const done = i < revealed
                const active = i === revealed
                return (
                  <div key={s.id} className="flex shrink-0 items-center gap-1">
                    {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />}
                    <span
                      aria-current={active ? 'step' : undefined}
                      className={cn(
                        'flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                        done && 'border-sev-ok/40 bg-sev-ok/5 text-sev-ok',
                        active && 'border-primary bg-primary/10 text-primary',
                        !done && !active && 'border-line text-ink-soft',
                      )}
                    >
                      {done && <Check className="size-3" />}
                      {s.phase}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Step card */}
            <AnimatePresence mode="wait">
              <motion.section
                key={step.id}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="clay space-y-5 rounded-2xl p-5 md:p-7"
              >
                <div className="flex items-center gap-2.5">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                    {step.phase}
                  </span>
                  <span className="text-xs tabular-nums text-ink-soft">
                    Step {revealed + 1} of {detail.steps.length}
                  </span>
                </div>

                <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{step.title}</h2>

                <ul className="space-y-2.5">
                  {step.content.map((c, i) => (
                    <motion.li
                      key={i}
                      initial={reduce ? false : { opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: reduce ? 0 : 0.12 * i, duration: 0.35, ease: EASE }}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground/90"
                    >
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60" />
                      <span className="min-w-0 flex-1">{c}</span>
                    </motion.li>
                  ))}
                </ul>

                {/* Decision panel */}
                {step.question != null && step.options != null && (
                  <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4 md:p-5">
                    <div className="flex items-center gap-2">
                      <Target className="size-4 text-primary" />
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Your call</h3>
                    </div>
                    <p className="text-sm font-medium leading-relaxed">{step.question}</p>

                    <div className="space-y-2" role="radiogroup" aria-label="Decision options">
                      {step.options.map((opt, i) => {
                        const isSelected = choice === i && verdict == null
                        const isCorrectOne = verdict != null && verdict.answerId === i
                        const isWrongPick = verdict != null && !verdict.correct && choice === i
                        return (
                          <button
                            key={i}
                            type="button"
                            role="radio"
                            aria-checked={choice === i}
                            disabled={verdict != null || submitting}
                            onClick={() => setChoice(i)}
                            className={cn(
                              'flex min-h-11 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                              verdict == null &&
                                !isSelected &&
                                'border-line bg-surface-2/40 hover:border-primary/50',
                              isSelected && 'border-primary bg-primary/10',
                              isCorrectOne && 'border-sev-ok bg-sev-ok/10',
                              isWrongPick && 'border-sev-crit bg-sev-crit/10',
                              verdict != null && !isCorrectOne && !isWrongPick && 'border-line opacity-55',
                            )}
                          >
                            <span
                              className={cn(
                                'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                                isSelected && 'border-primary text-primary',
                                isCorrectOne && 'border-sev-ok text-sev-ok',
                                isWrongPick && 'border-sev-crit text-sev-crit',
                                !isSelected && !isCorrectOne && !isWrongPick && 'border-line text-ink-soft',
                              )}
                            >
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="min-w-0 flex-1 leading-snug">{opt}</span>
                            {isCorrectOne && <CheckCircle2 className="size-4 shrink-0 text-sev-ok" />}
                            {isWrongPick && <XCircle className="size-4 shrink-0 text-sev-crit" />}
                          </button>
                        )
                      })}
                    </div>

                    {!verdict && (
                      <div className="space-y-2">
                        {stepError && (
                          <p className="rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs text-sev-crit">
                            Couldn&apos;t record your decision — check your connection and confirm again.
                          </p>
                        )}
                        <Button
                          className="min-h-11 w-full font-semibold sm:w-auto"
                          disabled={choice == null || submitting}
                          onClick={confirmDecision}
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="size-4 animate-spin" /> Evaluating…
                            </>
                          ) : (
                            <>
                              <Check className="size-4" /> CONFIRM DECISION
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {verdict && (
                      <Pop className="space-y-3">
                        <div
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold',
                            verdict.correct ? 'bg-sev-ok/10 text-sev-ok' : 'bg-sev-crit/10 text-sev-crit',
                          )}
                        >
                          {verdict.correct ? (
                            <CheckCircle2 className="size-4 shrink-0" />
                          ) : (
                            <XCircle className="size-4 shrink-0" />
                          )}
                          {verdict.correct ? 'Good clinical reasoning' : 'Missed it — here\u2019s why'}
                        </div>
                        {verdict.teaching && (
                          <div className="rounded-lg border-l-2 border-sev-warn bg-sev-warn/10 px-3.5 py-2.5">
                            <p className="flex items-start gap-2 text-sm leading-relaxed">
                              <Lightbulb className="mt-0.5 size-4 shrink-0 text-sev-warn" />
                              <span>{verdict.teaching}</span>
                            </p>
                          </div>
                        )}
                      </Pop>
                    )}
                  </div>
                )}

                {/* Continue (non-report steps, after decision or when no question) */}
                {!isLast && (step.question == null || verdict != null) && (
                  <Button size="lg" className="min-h-11 w-full font-semibold sm:w-auto" onClick={continueCase}>
                    CONTINUE <ArrowRight className="size-4" />
                  </Button>
                )}

                {/* Clinical reasoning report (final step) */}
                {reportVisible && (
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="space-y-5 rounded-2xl border border-line bg-surface-2/40 p-5 md:p-6"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-primary" />
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                        Clinical reasoning report
                      </h3>
                    </div>

                    {reportStatus === 'loading' && (
                      <p className="flex items-center gap-2 text-sm text-ink-soft">
                        <Loader2 className="size-4 animate-spin" /> Compiling your report…
                      </p>
                    )}

                    {reportStatus === 'error' && (
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm text-sev-crit">Couldn&apos;t save the case run.</p>
                        <Button variant="outline" size="sm" className="min-h-11" onClick={submitCompletion}>
                          <RefreshCw className="size-4" /> Retry
                        </Button>
                      </div>
                    )}

                    {reportStatus === 'ready' && report && (
                      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
                        <ScoreRing value={report.score} size={132} stroke={10} gradientId="case-report-ring">
                          <span className="text-3xl font-semibold tabular-nums tracking-tight">{report.score}%</span>
                          <span className="mt-0.5 text-[10px] text-ink-soft">case score</span>
                        </ScoreRing>
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-sm font-semibold">
                            {correctSteps}/{questionSteps.length} clinical decisions correct
                          </p>
                          <div className="space-y-1.5">
                            {questionSteps.map((s) => {
                              const d = decisions.find((x) => x.stepId === s.id)
                              const ok = d?.correct ?? false
                              return (
                                <div key={s.id} className="flex items-center gap-2.5 text-sm">
                                  {ok ? (
                                    <CheckCircle2 className="size-4 shrink-0 text-sev-ok" />
                                  ) : (
                                    <XCircle className="size-4 shrink-0 text-sev-crit" />
                                  )}
                                  <span className="w-28 shrink-0 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                                    {s.phase}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{s.title}</span>
                                  <span className="shrink-0 text-xs font-medium">
                                    {ok ? 'Correct' : d ? 'Missed' : 'Skipped'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Learning points */}
                    {detail.learning.length > 0 && (
                      <div className="space-y-2 border-t border-line pt-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                          Learning points
                        </p>
                        <ul className="space-y-1.5">
                          {detail.learning.map((l, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                              <Check className="mt-1 size-3.5 shrink-0 text-sev-ok" />
                              <span>{l}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* The mechanism, in 3D — compact layer diagram for the concept
                        behind this case (collapsed by default, lazily fetched) */}
                    {concept3dId && (
                      <div className="overflow-hidden rounded-2xl border border-line bg-surface-2">
                        <button
                          type="button"
                          onClick={toggle3d}
                          aria-expanded={show3d}
                          className="flex w-full items-center gap-2 p-3.5 text-left transition-colors hover:text-primary md:p-4"
                        >
                          <Orbit className="size-3.5 shrink-0 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                            The mechanism, in 3D
                          </span>
                          <ChevronDown
                            className={`ml-auto size-4 shrink-0 text-ink-soft transition-transform ${show3d ? '' : '-rotate-90'}`}
                          />
                        </button>
                        <AnimatePresence initial={false}>
                          {show3d && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22 }}
                            >
                              <div className="border-t border-line p-3.5 md:p-4">
                                {detail3dLoading && (
                                  <div className="space-y-2.5">
                                    <Skeleton className="h-8 w-1/2 rounded-full" />
                                    <Skeleton className="h-[240px] w-full rounded-2xl md:h-[290px]" />
                                  </div>
                                )}
                                {detail3dError && !detail3dLoading && (
                                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sev-crit/30 bg-sev-crit/5 px-3 py-2.5">
                                    <p className="text-xs text-ink-soft">Couldn&apos;t load the 3D diagram for this concept.</p>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="ml-auto min-h-8"
                                      onClick={() => concept3dId && load3d(concept3dId)}
                                    >
                                      <RefreshCw className="mr-1.5 size-3" />Retry
                                    </Button>
                                  </div>
                                )}
                                {detail3d && <Concept3D detail={detail3d} compact />}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap">
                      <Button variant="outline" className="min-h-11 font-semibold" onClick={retryCase}>
                        <RotateCcw className="size-4" /> RETRY CASE
                      </Button>
                      <Button variant="outline" className="min-h-11 font-semibold" onClick={backToList}>
                        <ArrowLeft className="size-4" /> MORE CASES
                      </Button>
                      <Button className="min-h-11 flex-1 font-semibold sm:flex-none" onClick={insightToQuestions}>
                        <Sparkles className="size-4" /> TURN INSIGHT INTO QUESTIONS
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.section>
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CLINICAL LOGBOOK PANEL ──────────────────────────────────────────────────
// De-identified educational records only — never real patient data.

const CASE_TYPES = ['Ward case', 'Emergency', 'OPD visit', 'Procedure observed', 'Interesting finding'] as const

const LOG_TYPE_META: Record<string, { color: string }> = {
  'Ward case': { color: '#16788c' },
  'Emergency': { color: 'var(--sev-crit)' },
  'OPD visit': { color: 'var(--sev-ok)' },
  'Procedure observed': { color: '#9a7fc0' },
  'Interesting finding': { color: 'var(--sev-warn)' },
}

function LogbookPanel({ reduce }: { reduce: boolean | null }) {
  const setQuizPreset = useAppStore((s) => s.setQuizPreset)
  const setView = useAppStore((s) => s.setView)

  const [entries, setEntries] = useState<LogbookEntryClient[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [caseType, setCaseType] = useState<string>('Ward case')
  const [system, setSystem] = useState<string>('cardiovascular')
  const [diagnosis, setDiagnosis] = useState('')
  const [learned, setLearned] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(false)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.logbook().then(
      (res) => { if (!cancelled) { setEntries(res.entries); setStatus('ready') } },
      () => { if (!cancelled) setStatus('error') },
    )
    return () => { cancelled = true }
  }, [reloadKey])

  const submit = () => {
    if (!diagnosis.trim()) { setFormError(true); return }
    setFormError(false)
    setSaving(true)
    api.logbookCreate({ caseType, system, diagnosis, learned })
      .then((res) => {
        setEntries((prev) => [res.entry, ...prev])
        setDiagnosis(''); setLearned('')
        setJustAdded(res.entry.id)
        setTimeout(() => setJustAdded(null), 1800)
      })
      .catch(() => setFormError(true))
      .finally(() => setSaving(false))
  }

  const remove = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    api.logbookDelete(id).catch(() => {
      setReloadKey((k) => k + 1) // restore truth on failure
    })
  }

  const systemsCovered = new Set(entries.map((e) => e.system)).size

  return (
    <div className="space-y-6">
      {/* Stats band */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Cases logged', value: entries.length },
          { label: 'Systems touched', value: systemsCovered },
          { label: 'Learning tasks', value: entries.length * 3 },
        ].map((s) => (
          <div key={s.label} className="clay rounded-2xl p-4 text-center">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-soft">{s.label}</p>
          </div>
        ))}
      </div>

      {/* New entry form */}
      <ScrollReveal>
      <section className="clay rounded-2xl p-4 md:p-5">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">Log a clinical exposure</h3>
          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[9px] uppercase tracking-wider text-ink-soft">
            de-identified only
          </span>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-soft">Case type</p>
            <div className="flex flex-wrap gap-2">
              {CASE_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setCaseType(t)}
                  className={cn(
                    'min-h-9 rounded-full border px-3 text-xs transition-colors',
                    caseType === t ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-line text-ink-soft hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-soft">System</p>
            <div className="flex flex-wrap gap-2">
              {SYSTEMS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSystem(s.id)}
                  className={cn(
                    'min-h-9 rounded-full border px-3 text-xs transition-colors',
                    system === s.id ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-line text-ink-soft hover:text-foreground',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-soft">Diagnosis / finding *</span>
              <input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Circle of Willis aneurysm — ruptured"
                className={cn(
                  'min-h-11 w-full rounded-xl border bg-card px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60',
                  formError ? 'border-sev-crit' : 'border-line focus:border-primary/60',
                )}
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-soft">What did I learn?</span>
              <textarea
                value={learned}
                onChange={(e) => setLearned(e.target.value)}
                placeholder="Key takeaways, differentials considered, what to read next…"
                rows={2}
                className="min-h-11 w-full resize-none rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60"
                maxLength={1000}
              />
            </label>
          </div>

          {formError && (
            <p className="text-xs text-sev-crit">Add a diagnosis or finding — one line is enough.</p>
          )}

          <Button className="min-h-11" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <NotebookPen className="mr-2 size-4" />}
            {saving ? 'Saving…' : 'ADD TO LOGBOOK'}
          </Button>
        </div>
      </section>
      </ScrollReveal>

      {/* Entries timeline */}
      {status === 'loading' && (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      )}
      {status === 'error' && (
        <div className="clay rounded-2xl p-6 text-center">
          <p className="text-sm text-ink-soft">Couldn&apos;t load your logbook.</p>
          <Button variant="outline" size="sm" className="mt-3 min-h-9" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="mr-2 size-3.5" /> Retry
          </Button>
        </div>
      )}
      {status === 'ready' && entries.length === 0 && (
        <div className="clay rounded-2xl p-8 text-center">
          <NotebookPen className="mx-auto size-8 text-ink-soft" />
          <p className="mt-3 text-sm font-medium">Your logbook is empty</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
            After every ward case or interesting patient, log one line here. MEDULA turns each exposure into
            recall tasks and question sets — clinical experience becomes exam preparation.
          </p>
        </div>
      )}
      {status === 'ready' && entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((e, i) => {
            const meta = LOG_TYPE_META[e.caseType] ?? { color: 'var(--muted-foreground)' }
            const sysLabel = SYSTEMS.find((s) => s.id === e.system)?.label ?? e.system
            return (
              <motion.article
                key={e.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={justAdded === e.id ? { opacity: 1, y: 0, scale: [1, 1.015, 1] } : { opacity: 1, y: 0 }}
                transition={reduce ? undefined : { duration: 0.35, delay: Math.min(i * 0.04, 0.2) }}
                className="clay rounded-2xl p-4 md:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: meta.color, background: 'color-mix(in oklab, currentColor 12%, transparent)' }}
                  >
                    {e.caseType}
                  </span>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                    {sysLabel}
                  </span>
                  <span className="ml-auto text-[11px] text-ink-soft">
                    {new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={() => remove(e.id)}
                    aria-label={`Delete entry: ${e.diagnosis}`}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sev-crit/10 hover:text-sev-crit"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <h4 className="mt-2.5 text-[15px] font-semibold tracking-tight">{e.diagnosis}</h4>
                {e.learned && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{e.learned}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <span className="text-[10px] uppercase tracking-wider text-ink-soft">Auto learning tasks:</span>
                  <span className="rounded-md border border-line px-2 py-0.5 text-[10px] text-ink-soft">15 min recall</span>
                  <span className="rounded-md border border-line px-2 py-0.5 text-[10px] text-ink-soft">8 questions</span>
                  <span className="rounded-md border border-line px-2 py-0.5 text-[10px] text-ink-soft">1 case review</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto min-h-8 gap-1 text-xs text-primary"
                    onClick={() => { setQuizPreset({ system: e.system, count: 6 }); setView('questions') }}
                  >
                    PRACTICE <ArrowRight className="size-3" />
                  </Button>
                </div>
              </motion.article>
            )
          })}
        </div>
      )}

      <p className="text-center text-[10px] leading-relaxed text-ink-soft">
        Logbook entries are educational notes. Never record identifiable patient information —
        use de- descriptions and follow your institution&apos;s privacy rules.
      </p>
    </div>
  )
}
