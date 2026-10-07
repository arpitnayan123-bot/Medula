'use client'

// ─── AI FACULTY & CONTENT INTELLIGENCE · OVERVIEW (PRODUCT 19) ───────────────
// The "what does my faculty workspace see" tab. Receives the shared home
// payload (fetched once by the shell). Hero: the published content pipeline
// «Collect → Organize → Understand → Validate → Personalize» with the measured
// numbers behind each stage. Then the inventory summary, previews of gaps /
// quality / drafts / versions, the top personalized recommendations with
// hand-offs, and the published "how your faculty workspace works" rules.

import { useState } from 'react'
import {
  ChevronDown, CircleHelp, FileText, GraduationCap, History, LayoutGrid, ShieldCheck,
  Sparkles, Target,
} from 'lucide-react'
import type { FacultyHomePayload, FacultyRecommendItem, FacultyRecommendResource } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  AiAssistedBadge, EmptyNote, ExamWeightStars, FacultyStatusPill, GateNote, HandoffButton,
  MicroLabel, MonoChip, SectionCard, SeverityPill, StatChip, relativeTime,
} from './faculty-shared'
import type { FacultyTab } from './faculty-shared'

export function FacultyOverview({ home, stale, reload, onGoto }: {
  home: FacultyHomePayload
  stale: boolean
  reload: () => void
  onGoto: (tab: FacultyTab) => void
}) {
  return (
    <div className="space-y-4">
      <PipelineCard home={home} stale={stale} reload={reload} />
      <InventoryCard home={home} />
      <GapsPreview home={home} onGoto={onGoto} />
      <QualityPreview home={home} onGoto={onGoto} />
      <DraftsPreview home={home} onGoto={onGoto} />
      <VersionsPreview home={home} onGoto={onGoto} />
      <RecommendationsCard items={home.recommendations} />
      <HowItWorksCard home={home} />
      <WorkspaceFootnotes home={home} />
    </div>
  )
}

// ── the published content pipeline — five measured stages ────────────────────

const STAGE_LABELS: Record<FacultyHomePayload['pipeline'][number]['stage'], string> = {
  collected: 'Collected',
  organized: 'Organized',
  understood: 'Understood',
  validated: 'Validated',
  personalized: 'Personalized',
}

function stageStat(stage: FacultyHomePayload['pipeline'][number]['stage'], home: FacultyHomePayload): string {
  const inv = home.inventory
  switch (stage) {
    case 'collected':
      return `${inv.concepts.toLocaleString('en-IN')} concepts · ${inv.subjects.toLocaleString('en-IN')} subjects`
    case 'organized':
      return `${inv.lessons.toLocaleString('en-IN')} lessons · ${inv.flashcards.toLocaleString('en-IN')} flashcards`
    case 'understood':
      return `${home.gaps.all.toLocaleString('en-IN')} open gaps`
    case 'validated':
      return `${home.quality.open.toLocaleString('en-IN')} open findings`
    case 'personalized':
      return `${home.recommendations.length.toLocaleString('en-IN')} recommended focus items`
  }
}

function PipelineCard({ home, stale, reload }: { home: FacultyHomePayload; stale: boolean; reload: () => void }) {
  return (
    <SectionCard
      title="The content pipeline"
      icon={GraduationCap}
      subtitle="How the platform's medical content is collected, organized, understood, validated and personalized — every stage measured live."
      action={(
        <Button variant="ghost" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs text-ink-soft" onClick={reload}>
          {stale ? 'Re-reading…' : 'Re-read'}
        </Button>
      )}
    >
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Content pipeline stages">
        {home.pipeline.map((stage, i) => (
          <li key={stage.stage} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2/40 p-3.5">
            <div className="flex items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary" aria-hidden>
                {i + 1}
              </span>
              <p className="text-xs font-semibold tracking-tight">{STAGE_LABELS[stage.stage]}</p>
            </div>
            <p className="text-xs font-medium leading-snug">{stage.headline}</p>
            <p className="text-[11px] leading-relaxed text-ink-soft">{stage.detail}</p>
            <p className="mt-auto border-t border-line pt-2 text-[10px] font-semibold tabular-nums text-ink-soft" role="note">
              {stageStat(stage.stage, home)}
            </p>
          </li>
        ))}
      </ol>
    </SectionCard>
  )
}

// ── inventory summary — one chip per measured content family ─────────────────

function InventoryCard({ home }: { home: FacultyHomePayload }) {
  const inv = home.inventory
  const chips: { value: number; label: string }[] = [
    { value: inv.subjects, label: 'subjects' },
    { value: inv.topics, label: 'topics' },
    { value: inv.concepts, label: 'concepts' },
    { value: inv.lessons, label: 'lessons' },
    { value: inv.questions, label: 'questions' },
    { value: inv.pyqPatternQuestions, label: 'PYQ-pattern questions' },
    { value: inv.flashcards, label: 'flashcards' },
    { value: inv.cases, label: 'clinical cases' },
    { value: inv.simCases, label: 'sim cases' },
    { value: inv.labImages, label: 'lab images' },
    { value: inv.learningModules, label: 'learning modules' },
    { value: inv.edges, label: 'concept edges' },
  ]
  return (
    <SectionCard
      title="Content inventory"
      icon={LayoutGrid}
      subtitle="Everything the workspace currently manages — counted live from the content tables, nothing estimated."
    >
      <div className="flex flex-wrap gap-1.5" aria-label="Content inventory counts">
        {chips.map((c) => <StatChip key={c.label} value={c.value.toLocaleString('en-IN')} label={c.label} />)}
      </div>
    </SectionCard>
  )
}

// ── gaps preview — the top 3 priority-ranked gaps ────────────────────────────

function GapsPreview({ home, onGoto }: { home: FacultyHomePayload; onGoto: (tab: FacultyTab) => void }) {
  const g = home.gaps
  return (
    <SectionCard
      title="Where content falls short"
      icon={Target}
      subtitle={`Top ${Math.min(3, g.top.length)} of ${g.all.toLocaleString('en-IN')} measured gaps — ranked by exam weight × learner demand, not by library size.`}
      action={(
        <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={() => onGoto('gaps')}>
          Open Gaps
        </Button>
      )}
    >
      {g.top.length === 0 ? (
        <EmptyNote>
          No gaps measured right now — every concept has its lesson, practice pool and revision material. New content will
          be re-checked as it lands.
        </EmptyNote>
      ) : (
        <ul className="space-y-2" aria-label="Top content gaps">
          {g.top.map((gap) => (
            <li key={gap.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-semibold">{gap.label}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <SeverityPill severity={gap.severity} />
                  <span className="text-[10px] font-semibold tabular-nums text-ink-soft" title={`Priority ${gap.priority}/100`}>
                    P{gap.priority}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{gap.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
      <GateNote className="mt-3">
        {g.critical.toLocaleString('en-IN')} of these gaps are critical — students feel each one in practice.
      </GateNote>
    </SectionCard>
  )
}

// ── quality preview — the top findings + flagged count ───────────────────────

function QualityPreview({ home, onGoto }: { home: FacultyHomePayload; onGoto: (tab: FacultyTab) => void }) {
  const q = home.quality
  return (
    <SectionCard
      title="Quality findings"
      icon={ShieldCheck}
      subtitle={`Top ${Math.min(3, q.top.length)} of ${q.open.toLocaleString('en-IN')} open findings — flagged for human review, never auto-resolved.`}
      action={(
        <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={() => onGoto('quality')}>
          Open Quality &amp; Review
        </Button>
      )}
    >
      {q.top.length === 0 ? (
        <EmptyNote>
          No open findings right now. When the engine measures something suspicious — a skewed answer key, a thin
          explanation, a fail-after-read pattern — it will surface here for a human decision.
        </EmptyNote>
      ) : (
        <ul className="space-y-2" aria-label="Top quality findings">
          {q.top.map((f) => (
            <li key={f.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-semibold">{f.label}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {f.flagged && <FacultyStatusPill status="flagged" />}
                  <SeverityPill severity={f.severity} />
                </div>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{f.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
      {q.top.length > 0 && (
        <GateNote className="mt-3">
          {q.top.filter((f) => f.flagged).length} of the {q.top.length} shown finding{q.top.length === 1 ? ' is' : 's are'} flagged
          for human review — the engine never declares content correct on its own.
        </GateNote>
      )}
    </SectionCard>
  )
}

// ── drafts preview — the 4 most recent drafts in the studio ──────────────────

function DraftsPreview({ home, onGoto }: { home: FacultyHomePayload; onGoto: (tab: FacultyTab) => void }) {
  const d = home.drafts
  const inReview = d.counts['in-review'] ?? 0
  return (
    <SectionCard
      title="Recent drafts"
      icon={Sparkles}
      subtitle="AI-assisted and manual drafts from the Studio — drafts are never authoritative; a reviewer publishes them."
      action={(
        <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={() => onGoto('studio')}>
          Open Studio
        </Button>
      )}
    >
      {d.recent.length === 0 ? (
        <EmptyNote>
          No drafts yet. Open the Studio, pick an entity and an assist action, and the first grounded draft will appear
          here.
        </EmptyNote>
      ) : (
        <ul className="space-y-2" aria-label="Recent drafts">
          {d.recent.slice(0, 4).map((draft) => (
            <li key={draft.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-semibold">{draft.title}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  {draft.aiAssisted && <AiAssistedBadge />}
                  <FacultyStatusPill status={draft.status} />
                </div>
              </div>
              <p className="mt-1 text-[11px] text-ink-soft">
                {draft.entityLabel} · updated {relativeTime(draft.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <GateNote className="mt-3">
        {inReview.toLocaleString('en-IN')} draft{inReview === 1 ? ' is' : 's are'} waiting in review — publishing
        requires a reviewer note and creates a verified version.
      </GateNote>
    </SectionCard>
  )
}

// ── versions preview — verified content versions of record ───────────────────

function VersionsPreview({ home, onGoto }: { home: FacultyHomePayload; onGoto: (tab: FacultyTab) => void }) {
  const v = home.versions
  return (
    <SectionCard
      title="Content versions"
      icon={History}
      subtitle="Published drafts become verified, attributed versions — content can be corrected without rewriting learning history."
      action={(
        <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={() => onGoto('library')}>
          Open Versions
        </Button>
      )}
    >
      {v.recent.length === 0 ? (
        <EmptyNote>
          No published versions yet. When a reviewer publishes a draft, it lands here as a verified version with its
          reviewer, references and review date.
        </EmptyNote>
      ) : (
        <ul className="space-y-2" aria-label="Recent content versions">
          {v.recent.slice(0, 4).map((ver) => (
            <li key={ver.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/40 p-3">
              <p className="min-w-0 truncate text-xs font-semibold">{ver.entityLabel}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[10px] font-semibold tabular-nums text-ink-soft">v{ver.version}</span>
                <FacultyStatusPill status={ver.verificationStatus} />
                <span className="text-[10px] text-ink-soft">{relativeTime(ver.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <GateNote className="mt-3">
        {v.verified.toLocaleString('en-IN')} verified version{v.verified === 1 ? '' : 's'} of record — each attributed
        to a named human reviewer.
      </GateNote>
    </SectionCard>
  )
}

// ── recommendations — the top 2 personalized focus items, fully rendered ─────

const RESOURCE_KIND_LABELS: Record<FacultyRecommendResource['kind'], string> = {
  lesson: 'Lesson',
  questions: 'Questions',
  flashcards: 'Flashcards',
  case: 'Case',
  lab: 'Image lab',
  module: 'Module',
  understand: 'Understand',
}

function RecommendationsCard({ items }: { items: FacultyRecommendItem[] }) {
  return (
    <SectionCard
      title="Where faculty effort pays off most"
      icon={Target}
      subtitle="Measured weak spots ordered by exam weight × learner demand — each with the resources to close it."
    >
      {items.length === 0 ? (
        <EmptyNote>
          No personalized recommendations yet — they appear once this account measures real question attempts and
          lessons against the content library.
        </EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.slice(0, 2).map((item) => <RecommendCard key={item.conceptId} item={item} />)}
        </div>
      )}
    </SectionCard>
  )
}

function RecommendCard({ item }: { item: FacultyRecommendItem }) {
  return (
    <section className="clay flex flex-col gap-2.5 rounded-2xl p-3.5" aria-label={`Recommended focus: ${item.conceptName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug tracking-tight">{item.conceptName}</h4>
          <p className="mt-0.5 text-[11px] text-ink-soft">{item.subjectName} · {item.topicName}</p>
        </div>
        <ExamWeightStars weight={item.examWeight} />
      </div>
      <MonoChip className="self-start">{item.weaknessLine}</MonoChip>
      {item.recommended.length > 0 && (
        <ul className="space-y-2" aria-label="Recommended resources">
          {item.recommended.map((res, i) => (
            <li key={`${res.kind}-${i}`} className="rounded-xl border border-line bg-surface-2/50 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-xs font-semibold">
                  <span className="text-ink-soft">{RESOURCE_KIND_LABELS[res.kind]}{res.count != null ? ` × ${res.count}` : ''} — </span>
                  {res.label}
                </p>
                {res.handoff && <HandoffButton handoff={res.handoff} />}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft" role="note">Why this: {res.why}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{item.note}</p>
    </section>
  )
}

// ── how your faculty workspace works — the published rules ───────────────────

function HowItWorksCard({ home }: { home: FacultyHomePayload }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="clay overflow-hidden rounded-2xl">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none ring-primary/50 focus-visible:ring-2 md:px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <CircleHelp className="size-4 shrink-0 text-primary" aria-hidden />
            How your faculty workspace works
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-line px-4 py-4 md:px-6">
            <ol className="space-y-2">
              {home.howItWorks.map((rule, i) => (
                <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-primary/12 text-[9px] font-bold text-primary" aria-hidden>
                    {i + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-soft" role="note">
              Last computed {relativeTime(home.generatedAt)}.
            </p>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

// ── footnotes — data basis + workspace note + honest note, verbatim ──────────

function WorkspaceFootnotes({ home }: { home: FacultyHomePayload }) {
  return (
    <SectionCard title="Read before you publish" icon={FileText}>
      <div className="space-y-2.5 text-[11px] leading-relaxed text-ink-soft" role="note">
        <p><span className="font-semibold text-foreground">Data basis — </span>{home.dataBasis}</p>
        <p><span className="font-semibold text-foreground">Workspace — </span>{home.workspaceNote}</p>
        <p><span className="font-semibold text-foreground">Honest limits — </span>{home.honestNote}</p>
        <MicroLabel className="pt-1">Reviewer-gated by design</MicroLabel>
        <GateNote>
          Nothing authored in this workspace is authoritative until a human publishes it — AI drafts carry the
          AI-ASSISTED badge and stay unverified until then.
        </GateNote>
      </div>
    </SectionCard>
  )
}
