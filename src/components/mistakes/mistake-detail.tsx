'use client'

// ─── MISTAKE DETAIL (PRODUCT 05) ───
// The full mistake profile + the follow-up chain:
//   Understand → Similar question → Harder → Revision → Retest
// Plus the honest lifecycle: only retests (or an explicit manual fix) resolve
// a mistake. AI actions reuse the Adaptive Engine panel — disclaimered,
// on-demand, never touching the stats.

import { useState } from 'react'
import {
  AlertTriangle, ArrowRight, BadgeCheck, BookOpen, Check, ChevronRight, Clock,
  GraduationCap, HeartCrack, Layers, Loader2, RefreshCcw, RotateCcw, Scale, Sparkles, X,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { MistakeDetailPayload, MistakeRetestQuestion, MistakeRetestResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { AdaptiveAiPanel } from '@/components/adaptive/adaptive-ai'

const TUTOR_QUESTION_KEY = 'medos:tutor-question'

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function MistakeDetail({ detail, onChanged, onBackToList }: {
  detail: MistakeDetailPayload
  onChanged: () => void
  onBackToList: () => void
}) {
  const { toast } = useToast()
  const record = detail.record
  const openConcept = useAppStore((s) => s.openConcept)
  const setView = useAppStore((s) => s.setView)

  const [acting, setActing] = useState<'revising' | 'resolve' | 'reopen' | null>(null)
  const [retest, setRetest] = useState<MistakeRetestQuestion | null>(null)
  const [retestState, setRetestState] = useState<'idle' | 'loading' | 'question' | 'submitting' | 'result'>('idle')
  const [retestResult, setRetestResult] = useState<MistakeRetestResult | null>(null)
  const [showAi, setShowAi] = useState(false)

  const lifecycle = async (action: 'revising' | 'resolve' | 'reopen') => {
    setActing(action)
    try {
      const res = await api.mistakeAction({ recordId: record.recordId, action })
      if (action === 'revising') {
        toast({
          title: record.conceptName ? `${record.conceptName} added to Revise` : 'Marked as revising',
          description: record.conceptName ? 'It is due now in your Revise deck.' : 'No concept anchor on this question — the status changed only.',
        })
      }
      if (action === 'resolve') toast({ title: 'Marked as fixed', description: 'Honest bookkeeping: you resolved it manually — no retest evidence.' })
      if (action === 'reopen') toast({ title: 'Reopened', description: 'It is back on the repair list.' })
      void res
      onChanged()
      onBackToList()
    } catch {
      toast({ title: 'Could not update', description: 'Try again in a moment.', variant: 'destructive' })
    } finally {
      setActing(null)
    }
  }

  const startRetest = async () => {
    setRetestState('loading')
    try {
      const q = await api.mistakeRetest({ recordId: record.recordId })
      setRetest(q)
      setRetestState('question')
    } catch {
      setRetestState('idle')
      toast({ title: 'Retest unavailable', description: 'Try again in a moment.', variant: 'destructive' })
    }
  }

  const submitRetest = async (selected: string, timeMs: number) => {
    if (!retest) return
    setRetestState('submitting')
    try {
      const res = await api.mistakeRetestAnswer({ recordId: record.recordId, selected, timeMs })
      setRetestResult(res)
      setRetestState('result')
      onChanged()
    } catch {
      setRetestState('question')
      toast({ title: 'Could not submit', description: 'Try again.', variant: 'destructive' })
    }
  }

  const askTutor = () => {
    const text = record.conceptName
      ? `I have missed this question ${record.wrongCount}× — my last pick was "${record.lastSelectedText}" but the correct answer is "${record.answerText}". The concept is ${record.conceptName}. Explain the underlying misconception simply, then check me with one question.`
      : `I keep getting this question wrong. Explain the reasoning behind "${record.answerText}" and why "${record.lastSelectedText}" is wrong, then check me with one question. Stem: ${record.stem}`
    try {
      window.sessionStorage.setItem(TUTOR_QUESTION_KEY, text)
    } catch {
      /* storage unavailable — the tutor simply won't pre-fill */
    }
    setView('tutor')
  }

  return (
    <div className="space-y-5">
      {/* ── header ── */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="border-sev-crit/40 bg-sev-crit/10 text-sev-crit">{record.priority} priority</Badge>
          <Badge variant="outline" className="border-line text-ink-soft">{record.status}</Badge>
          {record.wrongCount >= 2 && <Badge variant="outline" className="border-sev-warn/40 text-sev-warn">missed {record.wrongCount}×</Badge>}
          {record.pyqPattern && <Badge variant="outline" className="border-line text-ink-soft">PYQ-pattern</Badge>}
          {record.revisionPending && <Badge className="border-primary/40 bg-primary/10 text-primary">revision due</Badge>}
        </div>
        <p className="text-xs text-ink-soft">{record.subjectName}{record.topicName ? ` · ${record.topicName}` : ''}{record.conceptName ? ` · ${record.conceptName}` : ''} · difficulty {record.difficulty}</p>
      </header>

      {/* ── the mistake itself ── */}
      <section className="rounded-2xl border border-line bg-surface-2/30 p-4 md:p-5" aria-label="Question">
        {record.imageUrl && (
          <img src={record.imageUrl} alt="Question illustration" className="mb-3 w-full rounded-lg border border-line" loading="lazy" />
        )}
        <p className="text-sm font-medium leading-relaxed md:text-base">{record.stem}</p>

        <ul className="mt-4 space-y-2">
          {detail.options.map((o) => (
            <li
              key={o.id}
              className={cn(
                'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm',
                o.isAnswer
                  ? 'border-sev-ok/50 bg-sev-ok/10'
                  : o.isWrongPick
                    ? 'border-sev-crit/50 bg-sev-crit/10'
                    : 'border-line bg-surface-2/40 opacity-70',
              )}
            >
              <span className={cn(
                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                o.isAnswer ? 'bg-sev-ok/20 text-sev-ok' : o.isWrongPick ? 'bg-sev-crit/20 text-sev-crit' : 'bg-surface-2 text-ink-soft',
              )}>
                {o.isAnswer ? <Check className="size-3" /> : o.isWrongPick ? <X className="size-3" /> : o.id.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-snug">{o.text}</span>
                {o.isWrongPick && <span className="mt-0.5 block text-[11px] font-semibold text-sev-crit">your last pick</span>}
                {o.note && <span className="mt-1 block text-[11px] leading-snug text-ink-soft">{o.note}</span>}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2 border-t border-line pt-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">Why the right answer is right</p>
          <p className="text-[13px] leading-relaxed text-ink-soft">{detail.explanation}</p>
          {detail.teaching && (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-[13px] font-medium leading-snug">💡 {detail.teaching}</p>
          )}
        </div>
      </section>

      {/* ── why it ranks here ── */}
      <section aria-label="Priority breakdown" className="rounded-2xl border border-line p-4">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-ink-soft">Why this ranks {record.priority} — measured factors</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {record.factors.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-1.5 text-xs">
              <span className="w-8 shrink-0 text-right font-bold text-ink">{f.points}</span>
              <span className="font-medium">{f.label}</span>
              <span className="min-w-0 flex-1 truncate text-right text-ink-soft">{f.note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── confusion compare ── */}
      {detail.confusionPair && (
        <section aria-label="Confusing pair" className="rounded-2xl border border-sev-warn/30 bg-sev-warn/5 p-4">
          <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-sev-warn">
            <Scale className="size-3.5" /> The classic pair you mix up
          </p>
          <p className="mb-3 text-sm font-semibold">{detail.confusionPair.a} vs {detail.confusionPair.b}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-2/50 p-3">
              <p className="mb-1.5 text-xs font-bold">{detail.confusionPair.a}</p>
              <ul className="space-y-1">
                {detail.confusionPair.aPoints.map((pt, i) => (
                  <li key={i} className="text-[12px] leading-snug text-ink-soft">• {pt}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/50 p-3">
              <p className="mb-1.5 text-xs font-bold">{detail.confusionPair.b}</p>
              <ul className="space-y-1">
                {detail.confusionPair.bPoints.map((pt, i) => (
                  <li key={i} className="text-[12px] leading-snug text-ink-soft">• {pt}</li>
                ))}
              </ul>
            </div>
          </div>
          {detail.confusionPair.mnemonic && (
            <p className="mt-2.5 rounded-lg bg-surface-2/60 px-3 py-2 text-[12px] italic leading-snug text-ink-soft">
              🧠 Anchor: {detail.confusionPair.mnemonic}
            </p>
          )}
        </section>
      )}

      {/* ── attempt history ── */}
      {detail.attempts.length > 1 && (
        <section aria-label="Attempt history" className="rounded-2xl border border-line p-4">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-ink-soft">Previous attempts ({detail.attempts.length})</p>
          <ul className="space-y-1.5">
            {detail.attempts.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-2/40 px-3 py-1.5 text-xs">
                {a.correct
                  ? <Check className="size-3.5 shrink-0 text-sev-ok" />
                  : <X className="size-3.5 shrink-0 text-sev-crit" />}
                <span className="min-w-0 flex-1 truncate text-ink-soft">{a.selectedText}</span>
                {a.errorLabel && <span className="shrink-0 rounded-full bg-surface-2/80 px-2 py-0.5 text-[10px]">{a.errorLabel}</span>}
                {a.timeMs > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-ink-soft"><Clock className="size-3" />{Math.round(a.timeMs / 1000)}s</span>
                )}
                <span className="shrink-0 text-ink-soft">{relTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── follow-up chain ── */}
      <section aria-label="What to do next" className="rounded-2xl border border-primary/25 bg-primary/5 p-4 md:p-5">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-primary">What to do about it — in order</p>
        <ol className="space-y-2">
          <FollowUpStep
            n={1}
            title="Understand the concept"
            desc={record.conceptName ? `Re-learn ${record.conceptName} in the hub, then come back.` : 'No concept anchor — re-read the explanation above.'}
            action={
              record.conceptId && (
                <Button size="sm" className="min-h-9 gap-1.5" onClick={() => openConcept(record.conceptId!)}>
                  <BookOpen className="size-3.5" /> Open in hub
                </Button>
              )
            }
          />
          <FollowUpStep
            n={2}
            title="Drill the confusion + ask the AI"
            desc="Similar and harder questions, plain-language explanations — clearly AI, never part of your stats."
            action={
              <Button size="sm" variant="outline" className="min-h-9 gap-1.5" onClick={() => setShowAi((v) => !v)}>
                <Sparkles className="size-3.5" /> {showAi ? 'Hide AI panel' : 'Open AI panel'}
              </Button>
            }
          />
          <FollowUpStep
            n={3}
            title="Put it in revision"
            desc={record.revisionPending ? 'A revision item is already due for this concept.' : 'Adds the concept to your Revise deck — due now.'}
            action={
              <Button
                size="sm"
                variant="outline"
                className="min-h-9 gap-1.5"
                disabled={acting !== null || record.revisionPending}
                onClick={() => void lifecycle('revising')}
              >
                {acting === 'revising' ? <Loader2 className="size-3.5 animate-spin" /> : <GraduationCap className="size-3.5" />}
                {record.revisionPending ? 'Already due' : 'Add to Revise'}
              </Button>
            }
          />
          <FollowUpStep
            n={4}
            title="Retest — the honesty gate"
            desc={`Answer this exact question again. ${record.status === 'retested' ? 'One more correct retest resolves it.' : 'Two correct retests in a row resolve it.'} A miss puts it back on the list.`}
            action={
              retestState === 'idle' && (
                <Button size="sm" className="min-h-9 gap-1.5" onClick={() => void startRetest()}>
                  <RotateCcw className="size-3.5" /> Retest now
                </Button>
              )
            }
          >
            {retestState === 'loading' && (
              <p className="flex items-center gap-2 text-xs text-ink-soft"><Loader2 className="size-3.5 animate-spin" /> Preparing the retest…</p>
            )}
            {(retestState === 'question' || retestState === 'submitting') && retest && (
              <RetestForm retest={retest} onSubmit={submitRetest} submitting={retestState === 'submitting'} />
            )}
            {retestState === 'result' && retestResult && (
              <div className={cn('space-y-2 rounded-xl border p-3', retestResult.correct ? 'border-sev-ok/40 bg-sev-ok/5' : 'border-sev-crit/40 bg-sev-crit/5')}>
                <p className="flex items-center gap-2 text-sm font-bold">
                  {retestResult.correct ? (
                    <><BadgeCheck className="size-4 text-sev-ok" /> Correct — {retestResult.resolvedNow ? 'mistake resolved 🎉' : 'one more correct retest resolves it'}</>
                  ) : (
                    <><HeartCrack className="size-4 text-sev-crit" /> Missed again — back on the list</>
                  )}
                </p>
                <p className="text-xs text-ink-soft">Correct: <span className="font-medium text-ink">{retestResult.answerText}</span></p>
                <p className="text-[12px] leading-relaxed text-ink-soft">{retestResult.explanation}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="min-h-9 gap-1.5" onClick={() => { setRetestState('idle'); setRetest(null); setRetestResult(null); void startRetest() }}>
                    <RotateCcw className="size-3.5" /> Retest again
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-9 gap-1.5" onClick={onBackToList}>
                    Back to list <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </FollowUpStep>
        </ol>
      </section>

      {/* ── AI panel ── */}
      {showAi && (
        <section aria-label="AI help">
          <AdaptiveAiPanel questionId={record.questionId} conceptId={record.conceptId ?? undefined} />
        </section>
      )}

      {/* ── tutor handoff + lifecycle footer ── */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="min-h-11 flex-1 gap-2" onClick={askTutor}>
          <Sparkles className="size-4 text-primary" /> Ask the tutor why I keep getting this wrong
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row">
        {record.status !== 'resolved' ? (
          <Button variant="ghost" className="min-h-10 gap-1.5 text-ink-soft" disabled={acting !== null} onClick={() => void lifecycle('resolve')}>
            {acting === 'resolve' ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
            Mark as fixed (no retest)
          </Button>
        ) : (
          <Button variant="ghost" className="min-h-10 gap-1.5 text-ink-soft" disabled={acting !== null} onClick={() => void lifecycle('reopen')}>
            {acting === 'reopen' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Reopen — it slipped again
          </Button>
        )}
      </div>
    </div>
  )
}

function FollowUpStep({ n, title, desc, action, children }: {
  n: number
  title: string
  desc: string
  action: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-ink-soft">{desc}</p>
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </li>
  )
}

function RetestForm({ retest, onSubmit, submitting }: {
  retest: MistakeRetestQuestion
  onSubmit: (selected: string, timeMs: number) => void
  submitting: boolean
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const startedAt = useState(() => Date.now())[0]

  return (
    <div className="rounded-xl border border-primary/30 bg-surface-2/40 p-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-primary">Retest · attempt {retest.attemptNo}</p>
      <p className="text-[13px] font-medium leading-snug">{retest.stem}</p>
      <div className="mt-2.5 space-y-1.5">
        {retest.options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setPicked(o.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
              picked === o.id ? 'border-primary bg-primary/10' : 'border-line hover:border-primary/50',
            )}
          >
            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold', picked === o.id ? 'border-primary bg-primary/20 text-primary' : 'border-line text-ink-soft')}>
              {o.id.toUpperCase()}
            </span>
            {o.text}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        className="mt-3 min-h-9 gap-1.5"
        disabled={!picked || submitting}
        onClick={() => picked && onSubmit(picked, Date.now() - startedAt)}
      >
        {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}
        Submit retest
      </Button>
    </div>
  )
}
