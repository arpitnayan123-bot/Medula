'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { AuditPayload, AuditResultPayload, QuestionClient } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X, ScanSearch, ArrowRight, Map as MapIcon, Trophy, AlertTriangle,
  CircleCheck, Loader2, Sparkles, Stethoscope, RefreshCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const bandMeta: Record<string, { label: string; color: string }> = {
  strong: { label: 'Strong', color: 'var(--sev-ok)' },
  moderate: { label: 'Moderate', color: 'var(--sev-warn)' },
  weak: { label: 'Weak', color: 'var(--sev-crit)' },
  unmapped: { label: 'Unmapped', color: 'var(--muted-foreground)' },
}

type Phase = 'intro' | 'loading' | 'run' | 'submitting' | 'results'

export function AuditView() {
  const { auditOpen, setAuditOpen, setView, setQuizPreset } = useAppStore()
  const [phase, setPhase] = useState<Phase>('intro')
  const [audit, setAudit] = useState<AuditPayload | null>(null)
  const [result, setResult] = useState<AuditResultPayload | null>(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState(false)

  const reset = useCallback(() => {
    setPhase('intro'); setAudit(null); setResult(null); setIdx(0)
    setAnswers({}); setError(false)
  }, [])

  // Escape closes (only from intro/results to avoid losing an in-progress audit)
  useEffect(() => {
    if (!auditOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'intro' || phase === 'results')) setAuditOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [auditOpen, phase, setAuditOpen])

  if (!auditOpen) return null

  const start = () => {
    setPhase('loading')
    setError(false)
    api.auditStart()
      .then((a) => {
        setAudit(a)
        setPhase(a.questions.length ? 'run' : 'results')
        if (!a.questions.length) {
          setResult({
            overall: { correct: 0, total: 0, accuracy: 0 },
            subjects: [], weakest: null, strongest: null,
            recommendation: 'No questions available yet for an audit — practice a few sessions first.',
          })
        }
      })
      .catch(() => { setError(true); setPhase('intro') })
  }

  const current: QuestionClient | null = audit && idx < audit.questions.length ? audit.questions[idx] : null

  const choose = (optionId: string) => {
    if (!current) return
    setAnswers((prev) => ({ ...prev, [current.id]: optionId }))
  }

  const nextOrSubmit = () => {
    if (!audit) return
    if (idx < audit.questions.length - 1) {
      setIdx(idx + 1)
      return
    }
    setPhase('submitting')
    api.auditSubmit({
      results: Object.entries(answers).map(([questionId, selected]) => ({ questionId, selected })),
    })
      .then((r) => { setResult(r); setPhase('results') })
      .catch(() => { setPhase('run') })
  }

  const answeredCount = Object.keys(answers).length

  return (
    <AnimatePresence>
      {auditOpen && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog" aria-modal="true" aria-label="Knowledge audit"
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={() => phase !== 'run' && phase !== 'submitting' && setAuditOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="glass-strong absolute inset-x-0 top-[6vh] mx-auto flex max-h-[86vh] w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-3xl border border-line shadow-2xl"
          >
            {/* header */}
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/12">
                <ScanSearch className="size-4 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold tracking-tight">KNOWLEDGE AUDIT</h2>
                <p className="truncate text-[11px] text-ink-soft">A cross-subject diagnostic — feeds your knowledge map</p>
              </div>
              {(phase === 'intro' || phase === 'results') && (
                <Button variant="ghost" size="icon" className="size-9" aria-label="Close audit" onClick={() => setAuditOpen(false)}>
                  <X className="size-4" />
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="p-5 md:p-6">
                {error && phase === 'intro' && (
                  <div className="rounded-2xl border border-sev-crit/30 bg-sev-crit/10 p-4 text-sm">
                    Could not start the audit.
                    <Button variant="outline" size="sm" className="mt-3 min-h-9" onClick={start}><RefreshCcw className="mr-2 size-3.5" />Retry</Button>
                  </div>
                )}

                {phase === 'intro' && !error && (
                  <div className="space-y-5">
                    <div className="clay-in rounded-2xl p-4 text-sm leading-relaxed text-ink-soft">
                      I&apos;ll ask <span className="font-semibold text-foreground">a handful of quick questions across every subject</span> with
                      questions available — from pre-clinical to clinical. There is no pass or fail; the goal is to
                      map where you actually stand so the engine can calibrate your missions.
                    </div>
                    <ul className="space-y-2.5 text-sm">
                      {[
                        'Roughly 2 questions per subject · ~15–20 total · 5 minutes',
                        'Every answer quietly updates your knowledge state',
                        'You get a per-subject knowledge map with weakness bands at the end',
                      ].map((t) => (
                        <li key={t} className="flex items-start gap-2.5">
                          <CircleCheck className="mt-0.5 size-4 shrink-0 text-sev-ok" />
                          <span className="text-ink-soft">{t}</span>
                        </li>
                      ))}
                    </ul>
                    <Button className="min-h-11 w-full text-sm" onClick={start}>
                      <Sparkles className="mr-2 size-4" /> AUDIT MY MEDICAL KNOWLEDGE
                    </Button>
                  </div>
                )}

                {phase === 'loading' && (
                  <div className="space-y-4">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-24 w-full rounded-2xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                )}

                {phase === 'run' && current && audit && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-ink-soft">Q{idx + 1}/{audit.questions.length}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((idx) / audit.questions.length) * 100}%` }} />
                      </div>
                      <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft">{current.subjectCode}</span>
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={current.id}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-4"
                      >
                        <p className="text-[15px] font-medium leading-relaxed md:text-base">{current.stem}</p>
                        <div className="space-y-2">
                          {current.options.map((o, i) => {
                            const selected = answers[current.id] === o.id
                            return (
                              <button
                                key={o.id}
                                onClick={() => choose(o.id)}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-xl p-3.5 text-left text-sm transition-all min-h-11',
                                  selected ? 'border border-primary bg-primary/10 font-medium' : 'clay-in hover:border-primary/40',
                                )}
                              >
                                <span className={cn(
                                  'flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-[11px]',
                                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-line text-ink-soft',
                                )}>
                                  {String.fromCharCode(65 + i)}
                                </span>
                                {o.text}
                              </button>
                            )
                          })}
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-[11px] text-ink-soft">{answeredCount} answered · unanswered questions count as skipped</span>
                      <Button className="ml-auto min-h-10" disabled={!answers[current.id]} onClick={nextOrSubmit}>
                        {idx === audit.questions.length - 1 ? 'FINISH AUDIT' : 'NEXT'}
                        <ArrowRight className="ml-1.5 size-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {phase === 'submitting' && (
                  <div className="flex flex-col items-center gap-4 py-14 text-center">
                    <Loader2 className="size-7 animate-spin text-primary" />
                    <p className="text-sm text-ink-soft">Updating your knowledge model…</p>
                  </div>
                )}

                {phase === 'results' && result && (
                  <div className="space-y-6">
                    <div className="clay-in flex items-center gap-5 rounded-2xl p-5">
                      <div className="relative flex size-24 items-center justify-center">
                        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                          <circle cx="48" cy="48" r="40" fill="none" stroke="var(--muted)" strokeWidth="7" />
                          <motion.circle
                            cx="48" cy="48" r="40" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round"
                            strokeDasharray={2 * Math.PI * 40}
                            initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                            animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - result.overall.accuracy / 100) }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            transform="rotate(-90 48 48)"
                          />
                        </svg>
                        <span className="absolute text-xl font-bold tabular-nums">{result.overall.accuracy}%</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Diagnostic baseline</p>
                        <p className="mt-0.5 text-xs text-ink-soft">{result.overall.correct}/{result.overall.total} correct · model estimates, not absolute competence</p>
                        {result.weakest && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-sev-crit"><AlertTriangle className="size-3.5" /> Weakest area: {result.weakest.name}</p>
                        )}
                        {result.strongest && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-sev-ok"><Trophy className="size-3.5" /> Strongest area: {result.strongest.name}</p>
                        )}
                      </div>
                    </div>

                    {result.subjects.length > 0 && (
                      <div className="space-y-2.5">
                        <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Your knowledge map</p>
                        {result.subjects.map((s, i) => (
                          <motion.div
                            key={s.code}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="clay-in rounded-xl p-3.5"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                              <span className="text-sm font-medium">{s.name}</span>
                              <span className="ml-auto text-[11px] text-ink-soft">{s.correct}/{s.total} · mastery {s.mastery}%</span>
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: bandMeta[s.band].color, background: 'color-mix(in oklab, currentColor 12%, transparent)' }}>
                                {bandMeta[s.band].label}
                              </span>
                            </div>
                            <div className="flex gap-1.5">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ background: s.color }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${s.accuracy}%` }}
                                  transition={{ duration: 0.7, delay: i * 0.05 }}
                                />
                              </div>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted opacity-60">
                                <motion.div
                                  className="h-full rounded-full bg-foreground/50"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${s.mastery}%` }}
                                  transition={{ duration: 0.7, delay: 0.1 + i * 0.05 }}
                                />
                              </div>
                            </div>
                          </motion.div>
                        ))}
                        <p className="text-right text-[10px] text-ink-soft">cyan bar: audit accuracy · dim bar: stored mastery</p>
                      </div>
                    )}

                    <div className="rounded-2xl border-l-4 border-l-primary bg-surface p-4 text-sm leading-relaxed">
                      {result.recommendation}
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      {result.weakest && (
                        <Button
                          className="min-h-11 flex-1"
                          onClick={() => {
                            setQuizPreset({ subjectCode: result.weakest!.code, count: 8 })
                            setView('questions')
                            setAuditOpen(false)
                          }}
                        >
                          <Stethoscope className="mr-2 size-4" /> Practice {result.weakest.name}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="min-h-11 flex-1"
                        onClick={() => { setView('map'); setAuditOpen(false) }}
                      >
                        <MapIcon className="mr-2 size-4" /> Search your doubts
                      </Button>
                    </div>
                    <button
                      onClick={reset}
                      className="mx-auto block text-xs text-ink-soft underline-offset-4 hover:underline"
                    >
                      Run the audit again
                    </button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
