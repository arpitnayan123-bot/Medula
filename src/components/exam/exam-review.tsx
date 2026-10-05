'use client'

// ─── EXAM LAB · FULL QUESTION REVIEW (PRODUCT 12) ───
// Post-submit review: every paper question with the answer key, explanation,
// teaching pearl and why-each-other-option-fails — plus mistake-bank status,
// bookmarking (same routes as the adaptive engine) and issue reporting.

import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, CheckCircle2, ChevronDown, Flag, Image as ImageIcon,
  Landmark, Link2, ScanLine, Send, Timer, XCircle,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { MISTAKE_STATUS_LABELS } from '@/lib/types'
import type { ExamReviewPayload, ExamReviewQuestion, MistakeStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { DifficultyDots, Reveal, SectionTitle, SCROLL_SLIM, accuracyText, formatMs } from './exam-shared'

interface Props {
  payload: ExamReviewPayload
  onBack: () => void
}

type FilterKey = 'all' | 'wrong' | 'unattempted' | 'marked' | 'changed'

const REPORT_REASONS = ['Wrong answer', 'Wrong explanation', 'Typo', 'Options overlap', 'Other'] as const

// ─── Question card ────────────────────────────────────────────────────────────

function ReviewCard({
  q, index, saved, onToggleSaved, onReport,
}: {
  q: ExamReviewQuestion
  index: number
  saved: boolean
  onToggleSaved: (questionId: string, current: boolean) => void
  onReport: (questionId: string) => void
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const setView = useAppStore((s) => s.setView)
  const openConcept = useAppStore((s) => s.openConcept)
  const openHub = useAppStore((s) => s.openHub)

  const optionText = (id: string) => q.options.find((o) => o.id === id)?.text ?? id
  const notes = Object.entries(q.optionNotes ?? {})
  const mistakeLabel = q.mistakeStatus && (MISTAKE_STATUS_LABELS as Record<string, string>)[q.mistakeStatus]

  return (
    <Reveal index={Math.min(index, 8)} className="min-w-0">
      <article className="glass space-y-4 rounded-2xl p-4 md:p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold tabular-nums">
            {index + 1}
          </span>
          {q.correct ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sev-ok/30 bg-sev-ok/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sev-ok">
              <CheckCircle2 className="size-3" aria-hidden /> Correct
            </span>
          ) : q.unattempted ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
              <MinusGlyph /> Unattempted
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-sev-crit/30 bg-sev-crit/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sev-crit">
              <XCircle className="size-3" aria-hidden /> Wrong
            </span>
          )}
          <DifficultyDots n={q.difficulty} />
          {q.pyqPattern && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sev-warn">
              <Landmark className="size-3" aria-hidden /> PYQ
            </span>
          )}
          {q.imageBased && (
            <span className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-info">
              <ScanLine className="size-3" aria-hidden /> Image
            </span>
          )}
          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
            {q.subjectName}
          </span>
          {q.changed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sev-warn">
              <Flag className="size-3" aria-hidden /> Answer changed
            </span>
          )}
          {q.marked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sev-warn/30 bg-sev-warn/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sev-warn">
              <Flag className="size-3" aria-hidden /> Marked
            </span>
          )}
        </div>

        <p className="text-[15px] font-medium leading-relaxed">{q.stem}</p>

        {q.imageUrl && (
          <img
            src={q.imageUrl}
            alt="Question image"
            className="max-h-64 w-full rounded-xl border border-line bg-surface-2/60 object-contain"
            loading="lazy"
          />
        )}

        {/* Options */}
        <div className="space-y-2">
          {q.options.map((o, i) => {
            const isAnswer = o.id === q.answer
            const isMyWrong = !q.unattempted && q.selected === o.id && !q.correct
            return (
              <div
                key={o.id}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-xl border border-l-4 px-4 py-2.5 text-sm',
                  isAnswer
                    ? 'border-line border-l-sev-ok bg-sev-ok/10'
                    : isMyWrong
                      ? 'border-line border-l-sev-crit bg-sev-crit/10'
                      : 'border-line border-l-line bg-surface-2/40',
                )}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-[10px] font-semibold text-ink-soft">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 flex-1 leading-snug">{o.text}</span>
                {isAnswer && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sev-ok">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Correct answer
                  </span>
                )}
                {isMyWrong && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sev-crit">
                    <XCircle className="size-3.5" aria-hidden /> You marked
                  </span>
                )}
              </div>
            )
          })}
          {q.unattempted && (
            <p className="rounded-xl border border-dashed border-line bg-surface-2/30 px-4 py-2.5 text-xs font-medium text-ink-soft">
              Not attempted — scored 0{q.answerText ? `. The answer was “${q.answerText}”.` : '.'}
            </p>
          )}
        </div>

        {/* Explanation + teaching */}
        <div className="space-y-2.5 rounded-xl bg-surface-2/50 p-3.5">
          <p className="text-sm leading-relaxed">{q.explanation}</p>
          {q.teaching && (
            <p className="flex items-start gap-2 border-t border-line/70 pt-2.5 text-[13px] leading-relaxed text-ink-soft">
              <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary">Pearl</span>
              <span>{q.teaching}</span>
            </p>
          )}
        </div>

        {/* Why other options are wrong */}
        {notes.length > 0 && (
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
            <CollapsibleTrigger
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
              aria-expanded={notesOpen}
            >
              Why other options are wrong
              <ChevronDown className={cn('size-3.5 transition-transform', notesOpen && 'rotate-180')} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 space-y-2">
                {notes.map(([optionId, note]) => (
                  <li key={optionId} className="rounded-xl border border-line bg-surface-2/40 p-3">
                    <p className="text-[13px] font-semibold leading-snug">{optionText(optionId)}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{note}</p>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Related concept + topic hub */}
        {(q.conceptId || q.topicId) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
            <Link2 className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
            <span className="text-xs font-semibold">{q.conceptName ?? q.topicName}</span>
            {q.conceptId && (
              <Button variant="outline" size="sm" className="min-h-9 text-xs" onClick={() => openConcept(q.conceptId!)}>
                Open concept
              </Button>
            )}
            {q.topicId && (
              <Button variant="ghost" size="sm" className="min-h-9 text-xs text-ink-soft" onClick={() => openHub(q.topicId!, q.conceptId)}>
                Topic Hub
              </Button>
            )}
          </div>
        )}

        {/* Mistake bank status */}
        {q.mistakeStatus && (
          <button
            type="button"
            onClick={() => setView('mistakes')}
            className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full border border-sev-crit/30 bg-sev-crit/10 px-3 text-xs font-semibold text-sev-crit transition-colors hover:bg-sev-crit/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open Mistake Intelligence"
          >
            <AlertTriangle className="size-3.5" aria-hidden />
            Mistake bank: {mistakeLabel ?? q.mistakeStatus}
            {q.wrongCount > 0 && <span className="tabular-nums">· ×{q.wrongCount} all-time</span>}
          </button>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Timer className="size-3.5" aria-hidden /> {formatMs(q.timeMs)}
          </span>
          <button
            type="button"
            onClick={() => onToggleSaved(q.questionId, saved)}
            aria-pressed={saved}
            aria-label={saved ? 'Remove bookmark' : 'Bookmark this question'}
            className={cn(
              'ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              saved ? 'border-primary/50 bg-primary/10 text-primary' : 'border-line text-ink-soft hover:text-foreground',
            )}
          >
            {saved ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => onReport(q.questionId)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-ink-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AlertTriangle className="size-3.5" aria-hidden /> Report issue
          </button>
        </div>
      </article>
    </Reveal>
  )
}

function MinusGlyph() {
  return <span aria-hidden>—</span>
}

// ─── Review screen ────────────────────────────────────────────────────────────

export function ExamReviewView({ payload, onBack }: Props) {
  const { toast } = useToast()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {}
    for (const q of payload.questions) out[q.questionId] = q.saved
    return out
  })
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0])
  const [reportDetail, setReportDetail] = useState('')
  const [reporting, setReporting] = useState(false)

  const counts = useMemo(() => {
    const qs = payload.questions
    return {
      all: qs.length,
      wrong: qs.filter((q) => !q.unattempted && !q.correct).length,
      unattempted: qs.filter((q) => q.unattempted).length,
      marked: qs.filter((q) => q.marked).length,
      changed: qs.filter((q) => q.changed).length,
    }
  }, [payload.questions])

  const summary = useMemo(() => {
    const qs = payload.questions
    const correct = qs.filter((q) => q.correct).length
    const wrong = qs.filter((q) => !q.unattempted && !q.correct).length
    const unattempted = qs.filter((q) => q.unattempted).length
    const attempted = correct + wrong
    return { correct, wrong, unattempted, accuracy: attempted > 0 ? (correct / attempted) * 100 : null }
  }, [payload.questions])

  const filtered = useMemo(() => {
    const qs = payload.questions
    switch (filter) {
      case 'wrong': return qs.filter((q) => !q.unattempted && !q.correct)
      case 'unattempted': return qs.filter((q) => q.unattempted)
      case 'marked': return qs.filter((q) => q.marked)
      case 'changed': return qs.filter((q) => q.changed)
      default: return qs
    }
  }, [payload.questions, filter])

  const toggleSaved = (questionId: string, current: boolean) => {
    setSavedMap((m) => ({ ...m, [questionId]: !current }))
    const call = current ? api.unsaveQuestion(questionId) : api.saveQuestion({ questionId })
    call.catch(() => {
      setSavedMap((m) => ({ ...m, [questionId]: current })) // honest revert
      toast({ title: 'Bookmark failed', description: 'Check your connection and try again.', variant: 'destructive' })
    })
  }

  const submitReport = async () => {
    if (!reportId) return
    setReporting(true)
    try {
      await api.reportAdaptiveQuestion({ questionId: reportId, reason: reportReason, detail: reportDetail.trim() || undefined })
      toast({ title: 'Reported — thank you', description: 'The question team reviews every report.' })
      setReportId(null)
      setReportReason(REPORT_REASONS[0])
      setReportDetail('')
    } catch {
      toast({ title: 'Report failed', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setReporting(false)
    }
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'wrong', label: 'Wrong' },
    { key: 'unattempted', label: 'Unattempted' },
    { key: 'marked', label: 'Marked' },
    { key: 'changed', label: 'Changed' },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      {/* ── Summary bar ── */}
      <Reveal index={0} className="space-y-3">
        <Button variant="ghost" size="sm" className="min-h-9 gap-1 text-xs text-ink-soft" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden /> Back to analysis
        </Button>
        <div className="glass flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3.5">
          <p className="text-sm font-semibold">{payload.label}</p>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sev-ok">
            <CheckCircle2 className="size-3.5" aria-hidden /> {summary.correct} correct
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sev-crit">
            <XCircle className="size-3.5" aria-hidden /> {summary.wrong} wrong
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            <MinusGlyph /> {summary.unattempted} unattempted
          </span>
          <span className="ml-auto text-xs font-bold tabular-nums text-ink-soft">
            accuracy {accuracyText(summary.accuracy)}
          </span>
        </div>
      </Reveal>

      {/* ── Filter tabs ── */}
      <Reveal index={1}>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter questions">
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                    : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
                )}
              >
                {f.label} · <span className="tabular-nums">{counts[f.key]}</span>
              </button>
            )
          })}
        </div>
      </Reveal>

      {/* ── Question cards ── */}
      {filtered.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl px-6 py-10 text-center">
          <ImageIcon className="size-6 text-ink-soft" aria-hidden />
          <p className="text-sm font-medium">Nothing in this bucket.</p>
          <p className="text-xs text-ink-soft">Try another filter — every paper question stays reviewable here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((q, i) => (
            <ReviewCard
              key={q.questionId}
              q={q}
              index={i}
              saved={!!savedMap[q.questionId]}
              onToggleSaved={toggleSaved}
              onReport={setReportId}
            />
          ))}
        </div>
      )}

      {/* ── Report dialog ── */}
      <Dialog open={reportId != null} onOpenChange={(v) => { if (!v) setReportId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s wrong with this question. Reports are reviewed by the content team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-reason">Reason</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger id="report-reason" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-detail">Details (optional)</Label>
              <Input
                id="report-detail"
                value={reportDetail}
                onChange={(e) => setReportDetail(e.target.value)}
                placeholder="Anything specific that helped you spot the issue"
                maxLength={300}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setReportId(null)}>Cancel</Button>
            <Button className="clay-btn min-h-11" disabled={reporting} onClick={() => void submitReport()}>
              {reporting ? <Send className="size-4 animate-pulse" aria-hidden /> : <Send className="size-4" aria-hidden />}
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
