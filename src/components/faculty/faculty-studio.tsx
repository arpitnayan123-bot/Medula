'use client'

// ─── AI FACULTY & CONTENT INTELLIGENCE · STUDIO (PRODUCT 19) ─────────────────
// The creation + draft workspace. The Assist panel grounds AI output in
// EXISTING platform content and produces a DRAFT (AI-ASSISTED, never
// authoritative); the drafts list carries each draft through the reviewer gate:
// send for review → publish (with a reviewer note → a verified version) or
// reject. The engine never self-publishes, and every action is attributed.

import { useEffect, useState } from 'react'
import { ChevronDown, Send, Sparkles } from 'lucide-react'
import type {
  FacultyAssistAction, FacultyAssistResult, FacultyDraftStatus,
  FacultyDraftView, FacultyRecommendPayload,
} from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  AiAssistedBadge, DRAFT_KIND_LABELS, EmptyNote, FacultyErrorState, FacultyStatusPill,
  GateNote, MicroLabel, SCROLL_LIST, SectionCard, SkeletonRow, relativeTime, useFaculty,
} from './faculty-shared'

const ASSIST_ACTIONS: { id: FacultyAssistAction; label: string }[] = [
  { id: 'summary', label: 'Summarize' },
  { id: 'simplify', label: 'Simplify for students' },
  { id: 'key-points', label: 'Extract key points' },
  { id: 'flashcards', label: 'Draft flashcards' },
  { id: 'mcq', label: 'Draft MCQs' },
  { id: 'case', label: 'Draft a clinical case' },
  { id: 'revision-notes', label: 'Revision notes' },
  { id: 'concept-links', label: 'Suggest concept links' },
]

export function FacultyStudio() {
  const drafts = useFaculty(() => api.facultyDrafts())
  const rec = useFaculty(() => api.facultyRecommend())

  const [lastResult, setLastResult] = useState<FacultyAssistResult | null>(null)

  return (
    <div className="space-y-4">
      <AssistPanel rec={rec.data} recLoading={rec.state === 'loading'} onCreated={(res) => { setLastResult(res); drafts.reload() }} />
      {lastResult && <AssistResultCard result={lastResult} onChanged={drafts.reload} />}
      <DraftsList state={drafts} onChanged={drafts.reload} />
    </div>
  )
}

// ── assist panel — pick an entity + action, generate a grounded draft ────────

function AssistPanel({ rec, recLoading, onCreated }: {
  rec: FacultyRecommendPayload | null
  recLoading: boolean
  onCreated: (result: FacultyAssistResult) => void
}) {
  const [entityType, setEntityType] = useState<'concept' | 'question' | 'topic'>('concept')
  const [entityId, setEntityId] = useState('')
  const [action, setAction] = useState<FacultyAssistAction>('summary')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)

  // Prefill the entity id with the first measured recommendation so the panel
  // is instantly try-able. Never overrides what the user has typed.
  useEffect(() => {
    if (!entityId && rec?.items.length) setEntityId(rec.items[0].conceptId)
  }, [rec, entityId])

  const generate = async () => {
    setBusy(true)
    try {
      const res = await api.facultyAssist({
        entityType,
        entityId: entityId.trim(),
        action,
        instruction: instruction.trim() || undefined,
      })
      toast({
        title: 'Draft created in the Studio',
        description: 'Grounded in existing platform content — AI-ASSISTED, and not authoritative until a reviewer publishes it.',
      })
      onCreated(res)
    } catch {
      toast({
        title: 'Could not generate the draft',
        description: 'The engine did not respond — check the entity id (e.g. a concept id) and try again. Nothing was saved.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const sampleId = rec?.items.length ? rec.items[0].conceptId : null

  return (
    <SectionCard
      title="Assist — draft with AI, grounded"
      icon={Sparkles}
      subtitle="AI drafts are grounded in existing platform content, badged AI-ASSISTED, and stay drafts until a human publishes them."
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <MicroLabel className="mb-1.5">Entity type</MicroLabel>
            <Select value={entityType} onValueChange={(v) => setEntityType(v as typeof entityType)}>
              <SelectTrigger className="min-h-11 w-full" aria-label="Entity type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concept">Concept</SelectItem>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="topic">Topic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <MicroLabel className="mb-1.5">Assist action</MicroLabel>
            <Select value={action} onValueChange={(v) => setAction(v as FacultyAssistAction)}>
              <SelectTrigger className="min-h-11 w-full" aria-label="Assist action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIST_ACTIONS.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <MicroLabel className="mb-1.5">Entity id</MicroLabel>
          <Input
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder={sampleId ?? 'e.g. a concept id from the curriculum'}
            aria-label="Entity id to assist on"
            className="min-h-11"
          />
          {recLoading && <p className="mt-1 text-[10px] text-ink-soft">Loading a sample entity id from measured recommendations…</p>}
          {!recLoading && sampleId && (
            <p className="mt-1 text-[10px] text-ink-soft" role="note">
              Prefilled with {sampleId} — the top measured recommendation. Replace it with any real entity id.
            </p>
          )}
        </div>

        <div>
          <MicroLabel className="mb-1.5">Instruction (optional)</MicroLabel>
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. focus on exam-relevant mechanisms for NEET-PG"
            aria-label="Optional instruction for the assist"
            className="min-h-11"
            maxLength={300}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-10 rounded-xl text-xs" onClick={generate} disabled={busy || !entityId.trim()}>
            {busy ? 'Grounding on existing content…' : 'Generate draft'}
          </Button>
          <GateNote className="min-w-0 flex-1">
            The draft lands below and in your drafts list — unverified until a reviewer publishes it.
          </GateNote>
        </div>
      </div>
    </SectionCard>
  )
}

// ── assist result — grounded sources, the created draft, honest disclaimers ──

function AssistResultCard({ result, onChanged }: { result: FacultyAssistResult; onChanged: () => void }) {
  const d = result.draft
  return (
    <SectionCard
      title="Created draft"
      icon={Sparkles}
      subtitle="Review the output before sending it to the queue — AI output can be wrong; your note is the audit trail."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Grounding sources">
          <MicroLabel className="w-full">Grounded on</MicroLabel>
          {result.sources.map((s, i) => (
            <span key={`${s.kind}-${i}`} className="inline-flex items-center rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[10px] text-ink-soft">
              {s.label}
            </span>
          ))}
          <AiAssistedBadge />
        </div>

        <DraftCard draft={d} defaultExpanded onChanged={onChanged} />

        <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{result.disclaimer}</p>
        <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{result.note}</p>
      </div>
    </SectionCard>
  )
}

// ── drafts list — filter by status, expand to read, act by status ────────────

const STATUS_FILTERS: { id: FacultyDraftStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'in-review', label: 'In review' },
  { id: 'published', label: 'Published' },
  { id: 'rejected', label: 'Rejected' },
]

function DraftsList({ state, onChanged }: {
  state: { data: import('@/lib/types').FacultyDraftsPayload | null; state: 'loading' | 'ready' | 'error'; reload: () => void }
  onChanged: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<FacultyDraftStatus | 'all'>('all')
  const data = state.data

  const drafts = data?.drafts.filter((d) => statusFilter === 'all' || d.status === statusFilter) ?? []

  return (
    <SectionCard
      title="Drafts"
      icon={Send}
      subtitle="Every draft in the workspace — send for review, publish with a note, or reject. Nothing is authoritative until published."
      action={data ? <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{drafts.length} of {data.counts.all}</span> : undefined}
    >
      {state.state === 'loading' && <SkeletonRow rows={4} />}
      {state.state === 'error' && (
        <FacultyErrorState
          title="Drafts didn't load"
          hint="The faculty engine did not respond — it may still be warming up. Nothing is lost; retry below."
          onRetry={state.reload}
        />
      )}
      {data && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter drafts by status">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                aria-pressed={statusFilter === f.id}
                className={cn(
                  'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none ring-primary/50 transition-colors focus-visible:ring-2',
                  statusFilter === f.id
                    ? 'border-primary/40 bg-primary/12 text-primary'
                    : 'border-line bg-surface-2/50 text-ink-soft hover:text-foreground',
                )}
              >
                {f.label}
                {f.id !== 'all' && <span className="tabular-nums">{data.counts[f.id] ?? 0}</span>}
              </button>
            ))}
          </div>

          {data.drafts.length === 0 ? (
            <EmptyNote>
              No drafts yet. Use the Assist panel above to ground the first draft in existing content, then send it for
              review when it reads right.
            </EmptyNote>
          ) : drafts.length === 0 ? (
            <EmptyNote>No drafts with this status. Clear the filter to see the full list.</EmptyNote>
          ) : (
            <ul className={SCROLL_LIST} aria-label="Drafts">
              {drafts.map((draft) => <DraftCard key={draft.id} draft={draft} onChanged={onChanged} />)}
            </ul>
          )}

          <GateNote>
            Publishing creates a verified content version attributed to Faculty (demo) — applying lesson content is an
            explicit reviewer action and never rewrites learning history.
          </GateNote>
          <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{data.note}</p>
        </div>
      )}
    </SectionCard>
  )
}

// ── one draft card — expandable header + kind-aware body + status actions ────

function DraftCard({ draft, defaultExpanded = false, onChanged }: {
  draft: FacultyDraftView
  defaultExpanded?: boolean
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <li className="rounded-xl border border-line bg-surface-2/40">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full flex-wrap items-center gap-2 p-3 text-left outline-none ring-primary/50 focus-visible:ring-2"
      >
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-xs font-semibold">{draft.title}</span>
          <span className="block truncate text-[10px] text-ink-soft">
            {DRAFT_KIND_LABELS[draft.kind] ?? draft.kind} · {draft.entityLabel} · updated {relativeTime(draft.updatedAt)}
          </span>
        </span>
        {draft.aiAssisted && <AiAssistedBadge />}
        <FacultyStatusPill status={draft.status} />
        <ChevronDown className={cn('size-3.5 shrink-0 text-ink-soft transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
      </button>

      {expanded && (
        <div className="border-t border-line p-3">
          {draft.changeNote && (
            <p className="text-[11px] leading-relaxed text-ink-soft" role="note">
              <span className="font-medium text-foreground">Change note: </span>{draft.changeNote}
            </p>
          )}
          <DraftBodyView draft={draft} />
          <DraftActions draft={draft} onChanged={onChanged} />
        </div>
      )}
    </li>
  )
}

// ── draft body — rendered by kind, every variant honest to its shape ─────────

function DraftBodyView({ draft }: { draft: FacultyDraftView }) {
  const body = draft.body
  const hasAny = body.text || body.bullets?.length || body.cards?.length || body.mcqs?.length || body.case || body.links?.length || body.references?.length
  if (!hasAny) {
    return (
      <EmptyNote className="mt-2">
        This draft has no body yet — it may be a placeholder awaiting content.
      </EmptyNote>
    )
  }
  return (
    <div className="mt-3 space-y-3">
      {body.text && (
        <div className="space-y-2 text-xs leading-relaxed text-foreground/90">
          {body.text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
        </div>
      )}

      {body.bullets && body.bullets.length > 0 && (
        <ul className="space-y-1.5" aria-label="Key points">
          {body.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {body.cards && body.cards.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Flashcard drafts">
          {body.cards.map((c, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface-2/50 p-2.5">
              <MicroLabel>Front</MicroLabel>
              <p className="mt-1 text-xs font-medium leading-snug">{c.front}</p>
              <MicroLabel className="mt-2">Back</MicroLabel>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{c.back}</p>
            </div>
          ))}
        </div>
      )}

      {body.mcqs && body.mcqs.map((m, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface-2/50 p-3" aria-label={`MCQ draft ${i + 1}`}>
          <p className="text-xs font-semibold leading-snug">{m.stem}</p>
          <ul className="mt-2 space-y-1">
            {m.options.map((o) => (
              <li
                key={o.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg px-2 py-1 text-[11px] leading-relaxed',
                  o.id === m.answer ? 'bg-sev-ok/10 font-medium text-sev-ok' : 'text-ink-soft',
                )}
              >
                <span className="shrink-0 font-semibold uppercase">{o.id}</span>
                <span>{o.text}</span>
                {o.id === m.answer && <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide text-sev-ok">answer</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft" role="note">
            <span className="font-medium text-foreground">Explanation: </span>{m.explanation}
          </p>
          {m.teaching && (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft" role="note">
              <span className="font-medium text-foreground">Teaching point: </span>{m.teaching}
            </p>
          )}
        </div>
      ))}

      {body.case && (
        <div className="rounded-xl border border-line bg-surface-2/50 p-3" aria-label="Case draft">
          <p className="text-xs font-semibold">{body.case.title}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-soft">{body.case.specialty}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">{body.case.patient}</p>
          <MicroLabel className="mt-3">Steps</MicroLabel>
          <ol className="mt-1.5 space-y-1.5">
            {body.case.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary/12 text-[9px] font-bold text-primary" aria-hidden>{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <MicroLabel className="mt-3">Learning points</MicroLabel>
          <ul className="mt-1.5 space-y-1">
            {body.case.learning.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {body.links && body.links.length > 0 && (
        <ul className="space-y-1.5" aria-label="Concept link drafts">
          {body.links.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-2/50 p-2.5 text-[11px]">
              <span className="font-mono text-ink-soft">{l.fromId}</span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">{l.type}</span>
              <span className="font-mono text-ink-soft">{l.toId}</span>
              <span className="w-full text-ink-soft" role="note">{l.label} — {l.why}</span>
            </li>
          ))}
        </ul>
      )}

      {body.references && body.references.length > 0 && (
        <div>
          <MicroLabel className="mb-1.5">References</MicroLabel>
          <ol className="space-y-1">
            {body.references.map((r, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-ink-soft">
                <span className="shrink-0 font-semibold text-foreground">[{i + 1}]</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ── draft actions — the reviewer gate, by status ─────────────────────────────

function DraftActions({ draft, onChanged }: { draft: FacultyDraftView; onChanged: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'submit' | 'publish' | 'reject' | null>(null)

  const act = async (action: 'submit' | 'publish' | 'reject') => {
    setBusy(action)
    try {
      if (action === 'submit') {
        await api.facultyPatchDraft(draft.id, { action: 'submit', changeNote: note.trim() })
        toast({ title: 'Sent for review', description: 'The draft is now in the review queue — a human decides what happens next.' })
      } else if (action === 'publish') {
        await api.facultyPatchDraft(draft.id, { action: 'publish', reviewerNote: note.trim(), applyLesson: false })
        toast({ title: 'Draft published', description: 'A verified content version was created and attributed to Faculty (demo). Learning history was not touched.' })
      } else {
        await api.facultyPatchDraft(draft.id, { action: 'reject', reviewerNote: note.trim() })
        toast({ title: 'Draft rejected', description: 'Recorded with your note — the draft stays out of the published library.' })
      }
      setNote('')
      onChanged()
    } catch {
      toast({ title: 'The action did not go through', description: 'The engine did not respond — the draft is unchanged. Try again.', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  if (draft.status === 'published') {
    return (
      <div className="mt-3 border-t border-line pt-3" role="status">
        <p className="text-[11px] font-semibold text-sev-ok">
          Published as v{draft.publishedVersion ?? '—'} · reviewed by {draft.reviewedBy || 'Faculty (demo)'}
        </p>
      </div>
    )
  }

  if (draft.status === 'rejected') {
    return (
      <div className="mt-3 border-t border-line pt-3" role="note">
        <p className="text-[11px] font-semibold text-sev-crit">Rejected by {draft.reviewedBy || 'Faculty (demo)'}</p>
        {draft.reviewerNote && <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">Reviewer note: {draft.reviewerNote}</p>}
      </div>
    )
  }

  if (draft.status === 'draft') {
    return (
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Change note (required to send for review)"
          aria-label={`Change note for draft ${draft.title}`}
          className="min-h-10"
          maxLength={280}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-10 rounded-xl px-3 text-xs"
            onClick={() => act('submit')}
            disabled={!note.trim() || busy != null}
          >
            {busy === 'submit' ? 'Sending…' : 'Send for review'}
          </Button>
          <GateNote className="min-w-0 flex-1">A reviewer publishes or rejects it with their own note.</GateNote>
        </div>
      </div>
    )
  }

  // in-review — publish or reject, both reviewer-note-gated
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reviewer note (required)"
        aria-label={`Reviewer note for draft ${draft.title}`}
        className="min-h-10"
        maxLength={280}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="min-h-10 rounded-xl px-3 text-xs"
          onClick={() => act('publish')}
          disabled={!note.trim() || busy != null}
        >
          {busy === 'publish' ? 'Publishing…' : 'Publish'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-10 rounded-xl px-3 text-xs text-ink-soft"
          onClick={() => act('reject')}
          disabled={!note.trim() || busy != null}
        >
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
        <GateNote className="min-w-0 flex-1">Publishing creates a verified content version attributed to Faculty (demo).</GateNote>
      </div>
    </div>
  )
}
