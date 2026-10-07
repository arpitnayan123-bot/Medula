'use client'

// ─── RESOURCE HUB · DETAIL PANEL (PRODUCT 14) ────────────────────────────────
// Overlay sheet (full-screen on mobile, right panel ≥sm) with the full trust
// metadata block: source, original URL (link-out only), access, license,
// attribution, verification status. Platform resources open where the frozen
// contract's view/focus/preset says they live. "Where this fits" wires the
// resource back into subjects, topics, concepts, cases, practice + revision.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Bookmark, BookmarkCheck, CalendarClock, Copyright, ExternalLink, Flag,
  GraduationCap, Landmark, Languages, Loader2, Scale, ShieldCheck, Stethoscope,
  Target, X,
} from 'lucide-react'
import type { LibraryDetailPayload, LibraryResource, View } from '@/lib/types'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AccessBadge, CardGrid, DifficultyDots, DisclaimerFootnote, ExamTags, KindIcon,
  LibraryCard, MicroLabel, OwnershipBadge, VerifiedBadge, kindLabel,
} from './library-shared'
import { LibraryAiPanel } from './library-ai'

type LoadState = 'loading' | 'ready' | 'error'

const REPORT_REASONS = [
  { value: 'incorrect', label: 'Factually incorrect' },
  { value: 'broken', label: 'Link is broken' },
  { value: 'outdated', label: 'Outdated content' },
  { value: 'copyright', label: 'Copyright concern' },
  { value: 'other', label: 'Something else' },
]

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  'en-hi': 'English + Hindi',
}

function masteryTone(m: number | null): string {
  if (m == null) return 'var(--muted-foreground)'
  if (m < 45) return 'var(--sev-crit)'
  if (m < 70) return 'var(--sev-warn)'
  return 'var(--sev-ok)'
}

export function LibraryDetailPanel({
  resourceId, onClose, onOpenResource, onSavedToggled,
}: {
  resourceId: string
  onClose: () => void
  onOpenResource: (id: string) => void
  onSavedToggled?: () => void
}) {
  const setView = useAppStore((s) => s.setView)
  const openLearn = useAppStore((s) => s.openLearn)
  const openHub = useAppStore((s) => s.openHub)
  const openConcept = useAppStore((s) => s.openConcept)
  const openSim = useAppStore((s) => s.openSim)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  const [payload, setPayload] = useState<LibraryDetailPayload | null>(null)
  // Request-keyed state: staleness is derived at render time, so the fetch
  // effect only touches state inside its promise callbacks.
  const [meta, setMeta] = useState<{ key: string; state: LoadState }>({ key: '', state: 'loading' })
  const [retryNonce, setRetryNonce] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [reported, setReported] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  const requestKey = `${resourceId}|${retryNonce}`
  const stale = meta.key !== requestKey

  // ── fetch detail (re-runs when a related card replaces the content) ──
  useEffect(() => {
    let alive = true
    api.libraryResource(resourceId).then(
      (p) => {
        if (!alive) return
        setPayload(p)
        setSaved(p.saved)
        setReported(p.reported)
        setMeta({ key: requestKey, state: 'ready' })
      },
      () => { if (alive) setMeta({ key: requestKey, state: 'error' }) },
    )
    return () => { alive = false }
  }, [resourceId, requestKey])

  // Escape closes · body scroll locked while the panel is open · focus the close button
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => closeBtnRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
    }
  }, [onClose])

  // Reset scroll when the content is replaced by a related resource
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [resourceId, stale])

  const toggleSave = useCallback(async () => {
    if (saveBusy) return
    const next = !saved
    setSaved(next) // optimistic
    setSaveBusy(true)
    try {
      const res = await api.librarySavedToggle(resourceId)
      setSaved(res.saved)
      onSavedToggled?.()
    } catch {
      setSaved(!next) // revert
      toast({ title: 'Could not update your saved list', variant: 'destructive' })
    } finally {
      setSaveBusy(false)
    }
  }, [saved, saveBusy, resourceId, onSavedToggled])

  const goLearn = (kind: 'subject' | 'topic', id: string) => {
    openLearn(kind, id)
    setView('learn')
  }

  const practiceTopicId = payload
    ? payload.handoffs.practice?.topicId ?? payload.handoffs.hub?.topicId ?? payload.integration.topics[0]?.id ?? null
    : null

  const openOnPlatform = (r: Extract<LibraryResource, { ownership: 'platform' }>) => {
    if (r.preset) {
      setAdaptivePreset(r.preset as Parameters<typeof setAdaptivePreset>[0])
      setView('adaptive')
      return
    }
    if (r.focus) {
      goLearn(r.focus.kind, r.focus.id)
      return
    }
    setView(r.view)
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Resource details">
      {/* backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />

      {/* panel — full-screen sheet on mobile, right panel ≥sm */}
      <motion.div
        ref={scrollRef}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className={cn(
          'absolute inset-0 overflow-y-auto bg-background shadow-2xl',
          'sm:inset-y-0 sm:left-auto sm:w-full sm:max-w-2xl sm:border-l sm:border-line',
        )}
      >
        {/* sticky header */}
        <div className="glass-strong sticky top-0 z-20 flex items-center gap-2 border-b border-line px-4 py-2.5 sm:px-6">
          <Button
            ref={closeBtnRef}
            variant="ghost"
            className="min-h-11 gap-1.5 px-3 text-ink-soft"
            onClick={onClose}
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Button>
          <p className="mx-auto truncate text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {!stale && meta.state === 'ready' && payload ? kindLabel(payload.resource.kind) : 'Resource'}
          </p>
          <Button
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label="Close resource details"
            className="size-11 shrink-0 rounded-xl"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="mx-auto max-w-2xl space-y-7 p-4 pb-10 sm:p-6 md:p-8">
          {(stale || meta.state === 'loading') && <DetailSkeleton />}

          {!stale && meta.state === 'error' && (
            <div className="clay flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
              <h2 className="text-base font-semibold tracking-tight">This resource didn&apos;t load</h2>
              <p className="max-w-sm text-sm text-ink-soft">
                The catalog did not respond for this resource — try again.
              </p>
              <Button variant="outline" className="min-h-11" onClick={() => setRetryNonce((n) => n + 1)}>
                Retry
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={onClose}>Back to the library</Button>
            </div>
          )}

          {!stale && meta.state === 'ready' && payload && (
            <ResourceDetailBody
              payload={payload}
              saved={saved}
              saveBusy={saveBusy}
              reported={reported}
              onToggleSave={toggleSave}
              onOpenReport={() => setReportOpen(true)}
              onOpenResource={onOpenResource}
              onOpenOnPlatform={openOnPlatform}
              onPractice={() => {
                if (!practiceTopicId) return
                setAdaptivePreset({ topicId: practiceTopicId, count: 10, autoStart: true })
                setView('adaptive')
              }}
              goLearn={goLearn}
              openHub={openHub}
              openConcept={openConcept}
              openSim={openSim}
              setView={setView}
            />
          )}
        </div>
      </motion.div>

      {/* report dialog */}
      {payload && (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          resourceTitle={payload.resource.title}
          resourceId={payload.resource.id}
          reported={reported}
          onReported={() => setReported(true)}
        />
      )}
    </div>
  )
}

// ── body ─────────────────────────────────────────────────────────────────────

function ResourceDetailBody({
  payload, saved, saveBusy, reported, onToggleSave, onOpenReport, onOpenResource,
  onOpenOnPlatform, onPractice, goLearn, openHub, openConcept, openSim, setView,
}: {
  payload: LibraryDetailPayload
  saved: boolean
  saveBusy: boolean
  reported: boolean
  onToggleSave: () => void
  onOpenReport: () => void
  onOpenResource: (id: string) => void
  onOpenOnPlatform: (r: Extract<LibraryResource, { ownership: 'platform' }>) => void
  onPractice: () => void
  goLearn: (kind: 'subject' | 'topic', id: string) => void
  openHub: (topicId: string) => void
  openConcept: (id: string) => void
  openSim: (caseId: string) => void
  setView: (v: View) => void
}) {
  const r = payload.resource
  const external = r.ownership === 'external'
  const ext = external ? r : null
  const plat = external ? null : r

  let host = ''
  if (ext) {
    try { host = new URL(ext.url).hostname.replace(/^www\./, '') } catch { host = '' }
  }

  const practiceTopicId = payload.handoffs.practice?.topicId ?? payload.handoffs.hub?.topicId ?? payload.integration.topics[0]?.id ?? null

  return (
    <>
      {/* header block */}
      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="clay-in grid size-11 shrink-0 place-items-center rounded-xl" aria-hidden>
            <KindIcon kind={r.kind} className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-xl font-semibold leading-snug tracking-tight md:text-2xl">{r.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <OwnershipBadge ownership={r.ownership} />
              <span className="text-[11px] font-medium text-ink-soft">{kindLabel(r.kind)}</span>
            </div>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-ink-soft">{r.description}</p>
      </header>

      {/* trust metadata */}
      {ext ? (
        <section className="space-y-3" aria-label="Source and trust metadata">
          <div
            className="flex items-start gap-2 rounded-xl border border-sev-warn/30 bg-sev-warn/10 px-3.5 py-3 text-xs font-semibold leading-relaxed text-sev-warn"
            role="note"
          >
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Metadata only — the content lives at the source. We never re-host or re-distribute it.
          </div>

          <div className="clay space-y-4 rounded-2xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <Landmark className="size-4 shrink-0 text-ink-soft" aria-hidden />
                <span className="min-w-0 truncate">{ext.sourceName}</span>
                {host && <span className="shrink-0 text-[11px] font-medium text-ink-soft">({host})</span>}
              </p>
              <a
                href={ext.url}
                target="_blank"
                rel="noreferrer noopener"
                className="clay-btn inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none ring-primary/50 transition-transform hover:-translate-y-px focus-visible:ring-2"
              >
                Open original <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">(opens the source website in a new tab)</span>
              </a>
            </div>

            <MetaRow icon={<ShieldCheck className="size-3.5" aria-hidden />} label="Verification status">
              <VerifiedBadge verified={ext.urlVerified} lastVerified={ext.lastVerified} />
            </MetaRow>
            <MetaRow icon={<Scale className="size-3.5" aria-hidden />} label="License / permission">
              <span className="text-xs leading-relaxed">{ext.license}</span>
            </MetaRow>
            <MetaRow icon={<Copyright className="size-3.5" aria-hidden />} label="Attribution">
              <span className="text-xs leading-relaxed">{ext.attribution}</span>
            </MetaRow>
            <MetaRow label="Access">
              <AccessBadge access={ext.access} />
            </MetaRow>
            <MetaRow label="Difficulty">
              <DifficultyDots level={ext.difficulty} />
            </MetaRow>
            <MetaRow label="Exams">
              <ExamTags exams={ext.exams} />
            </MetaRow>
            <MetaRow icon={<Languages className="size-3.5" aria-hidden />} label="Language">
              <span className="text-xs font-medium">{LANGUAGE_LABELS[ext.language] ?? ext.language}</span>
            </MetaRow>
          </div>
        </section>
      ) : plat && (
        <section className="space-y-3" aria-label="Platform resource details">
          <div className="clay space-y-4 rounded-2xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 text-xs leading-relaxed text-ink-soft">
                Platform-owned — generated from your measured progress, nothing external.
              </p>
              <Button className="clay-btn min-h-11 shrink-0" onClick={() => onOpenOnPlatform(plat)}>
                Open on the platform
              </Button>
            </div>
            <MetaRow label="Difficulty"><DifficultyDots level={plat.difficulty} /></MetaRow>
            <MetaRow label="Exams"><ExamTags exams={plat.exams} /></MetaRow>
          </div>
        </section>
      )}

      {/* action row */}
      <section className="space-y-2.5" aria-label="Actions">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={saved ? 'default' : 'outline'}
            className={cn('min-h-11 gap-1.5', !saved && 'clay-btn-soft')}
            onClick={onToggleSave}
            disabled={saveBusy}
            aria-pressed={saved}
          >
            {saved
              ? <BookmarkCheck className="size-4" aria-hidden />
              : <Bookmark className="size-4" aria-hidden />}
            {saved ? 'Saved' : 'Save'}
          </Button>
          {practiceTopicId && (
            <Button className="clay-btn min-h-11 gap-1.5" onClick={onPractice}>
              <Target className="size-4" aria-hidden /> Practice this topic
            </Button>
          )}
          <Button variant="outline" className="clay-btn-soft min-h-11 gap-1.5" onClick={() => setView('revision')}>
            <CalendarClock className="size-4" aria-hidden /> Add to revision
          </Button>
          {payload.handoffs.hub?.topicId && (
            <Button variant="outline" className="clay-btn-soft min-h-11 gap-1.5" onClick={() => openHub(payload.handoffs.hub!.topicId!)}>
              <GraduationCap className="size-4" aria-hidden /> Open Topic Hub
            </Button>
          )}
          <Button
            variant="ghost"
            className={cn('min-h-11 gap-1.5 text-ink-soft', reported && 'text-sev-ok')}
            onClick={onOpenReport}
          >
            <Flag className="size-4" aria-hidden /> {reported ? 'Reported' : 'Report'}
          </Button>
        </div>
        {reported && (
          <p className="text-[11px] font-medium text-sev-ok" role="status">
            Reported — our team reviews resource reports.
          </p>
        )}
      </section>

      {/* where this fits */}
      <section className="space-y-4" aria-label="Where this fits in your learning">
        <MicroLabel>Where this fits</MicroLabel>

        {payload.integration.subjects.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-soft">Subjects</p>
            <div className="flex flex-wrap gap-2">
              {payload.integration.subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goLearn('subject', s.id)}
                  className="clay clay-hover flex min-h-11 max-w-full items-center gap-2 rounded-xl px-3.5 text-sm font-medium outline-none ring-primary/50 focus-visible:ring-2"
                  aria-label={`Open ${s.name} in Learn`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color || 'var(--primary)' }} aria-hidden />
                  <span className="min-w-0 truncate">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {payload.integration.topics.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-soft">
              Topics <span className="font-normal">(measured counts · your mastery)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {payload.integration.topics.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openHub(t.id)}
                  className="clay clay-hover flex min-h-11 max-w-full flex-col justify-center rounded-xl px-3.5 py-1.5 text-left outline-none ring-primary/50 focus-visible:ring-2"
                  aria-label={`Open the Topic Hub for ${t.name}`}
                >
                  <span className="block max-w-60 truncate text-sm font-medium">{t.name}</span>
                  <span className="block text-[10px] font-semibold tabular-nums text-ink-soft">
                    {t.concepts} concepts · {t.questions} questions ·{' '}
                    <span style={{ color: masteryTone(t.mastery) }}>
                      {t.mastery != null ? `${t.mastery}% mastery` : 'no mastery yet'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {payload.integration.concepts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-soft">
              Concepts <span className="font-normal">(open the explorer)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {payload.integration.concepts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConcept(c.id)}
                  className="flex min-h-11 max-w-full items-center gap-2 rounded-full border border-line bg-surface-2 px-3 text-xs font-medium outline-none ring-primary/50 transition-colors hover:border-primary/40 focus-visible:ring-2"
                  aria-label={`Open the concept explorer for ${c.name}`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: masteryTone(c.mastery) }}
                    aria-hidden
                  />
                  <span className="min-w-0 max-w-56 truncate">{c.name}</span>
                  {c.mastery != null && <span className="shrink-0 tabular-nums text-ink-soft">{c.mastery}%</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {payload.integration.cases.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-soft">
              Related cases <span className="font-normal">(open the Case Simulator)</span>
            </p>
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {payload.integration.cases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openSim(c.id)}
                  className="clay clay-hover flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-3.5 py-2 text-left outline-none ring-primary/50 focus-visible:ring-2"
                  aria-label={`Open the case ${c.title} in the Case Simulator`}
                >
                  <Stethoscope className="size-4 shrink-0 text-ink-soft" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{c.specialty}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-ink-soft">Lv {c.difficulty}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* AI assistant */}
      <LibraryAiPanel resource={r} related={payload.related} />

      {/* related resources */}
      {payload.related.length > 0 && (
        <section className="space-y-3" aria-label="Related resources in the catalog">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MicroLabel>Related in the catalog</MicroLabel>
            <span className="text-[10px] text-ink-soft">opens in this panel</span>
          </div>
          <CardGrid className="lg:grid-cols-1 xl:grid-cols-2">
            {payload.related.map((rel) => (
              <LibraryCard key={rel.id} resource={rel} onOpen={onOpenResource} />
            ))}
          </CardGrid>
        </section>
      )}

      <DisclaimerFootnote text={payload.disclaimer} />
    </>
  )
}

// ── metadata row ─────────────────────────────────────────────────────────────

function MetaRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <p className="flex w-36 shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        {icon}
        {label}
      </p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

// ── report dialog ────────────────────────────────────────────────────────────

function ReportDialog({
  open, onOpenChange, resourceTitle, resourceId, reported, onReported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  resourceTitle: string
  resourceId: string
  reported: boolean
  onReported: () => void
}) {
  const [reason, setReason] = useState<string>('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ note: string; receivedAt: string } | null>(null)

  // Reset the form whenever the dialog (re)opens; an already-reported resource
  // shows the honest "team reviews reports" state straight away.
  useEffect(() => {
    if (open) {
      setReason('')
      setDetails('')
      setDone(null)
      setBusy(false)
    }
  }, [open])

  const submit = async () => {
    if (!reason || busy) return
    setBusy(true)
    try {
      const res = await api.libraryReport({
        resourceId,
        reason,
        details: details.trim() || undefined,
      })
      setDone({ note: res.note, receivedAt: res.receivedAt })
      onReported()
      toast({ title: 'Report received — thank you' })
    } catch {
      toast({ title: 'Could not send the report', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" role="dialog">
        {done || reported ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-sev-ok" aria-hidden /> Report received
              </DialogTitle>
              <DialogDescription>
                Reported — our team reviews resource reports. Nothing is auto-hidden; a human checks every report.
              </DialogDescription>
            </DialogHeader>
            {done?.note && <p className="text-xs leading-relaxed text-ink-soft">{done.note}</p>}
            <DialogFooter>
              <Button className="clay-btn min-h-11" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report this resource</DialogTitle>
              <DialogDescription className="line-clamp-2">
                {resourceTitle} — tell us what is wrong. Reports go to a human review queue.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="min-w-0">
                <MicroLabel className="mb-1.5">Reason</MicroLabel>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger aria-label="Report reason" className="clay-field h-11 w-full">
                    <SelectValue placeholder="Pick a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <MicroLabel className="mb-1.5">Details (optional)</MicroLabel>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Anything that helps us check it faster…"
                  className="clay-field min-h-24 resize-none"
                  maxLength={600}
                  aria-label="Report details (optional)"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button className="clay-btn min-h-11" onClick={submit} disabled={!reason || busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Send report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-3/4 max-w-full rounded-md" />
          <Skeleton className="h-4 w-28 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-28 rounded-xl" />
        <Skeleton className="h-11 w-36 rounded-xl" />
        <Skeleton className="h-11 w-32 rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  )
}
