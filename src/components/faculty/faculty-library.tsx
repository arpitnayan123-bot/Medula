'use client'

// ─── AI FACULTY & CONTENT INTELLIGENCE · VERSIONS (PRODUCT 19) ───────────────
// The published content library of record: every verified content version with
// its reviewer, summary, references and review dates. Versioning exists so
// content can be CORRECTED WITHOUT REWRITING LEARNING HISTORY — KnowledgeState
// and attempt rows are keyed by concept/question ids and are never touched.

import { useMemo } from 'react'
import { History } from 'lucide-react'
import type { FacultyVersionView } from '@/lib/types'
import { api } from '@/lib/api'
import {
  EmptyNote, FacultyErrorState, FacultyStatusPill, GateNote, MicroLabel, SCROLL_LIST,
  SectionCard, SkeletonRow, VerifiedBadge, relativeTime, useFaculty,
} from './faculty-shared'

export function FacultyLibrary() {
  const hook = useFaculty(() => api.facultyVersions())
  const data = hook.data

  // Newest first — the client never reorders what the engine ranked, this is
  // a pure presentation sort on the published createdAt.
  const versions = useMemo(() => {
    if (!data) return []
    return [...data.versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [data])

  const verified = data?.versions.filter((v) => v.verificationStatus === 'verified').length ?? 0

  return (
    <div className="space-y-4">
      <SectionCard
        title="Content versions"
        icon={History}
        subtitle="Published drafts, as verified versions of record — each attributed to a named reviewer."
        action={data ? <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">{versions.length} version{versions.length === 1 ? '' : 's'}</span> : undefined}
      >
        {hook.state === 'loading' && <SkeletonRow rows={4} />}
        {hook.state === 'error' && (
          <FacultyErrorState
            title="Versions didn't load"
            hint="The faculty engine did not respond — it may still be warming up. Nothing is lost; retry below."
            onRetry={hook.reload}
          />
        )}
        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Version summary">
              {verified > 0 && <VerifiedBadge />}
              <p className="text-[11px] text-ink-soft">
                {verified} verified · {versions.length} total — newest first
              </p>
            </div>

            {versions.length === 0 ? (
              <EmptyNote>
                No published versions yet. When a reviewer publishes a Studio draft, it lands here as a version with
                its reviewer, references and review date — the library of record starts there.
              </EmptyNote>
            ) : (
              <ul className={SCROLL_LIST} aria-label="Content versions, newest first">
                {versions.map((v) => <VersionCard key={v.id} version={v} />)}
              </ul>
            )}

            <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{data.note}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Why versioning matters"
        icon={History}
        subtitle="Content can be corrected without rewriting learning history."
      >
        <div className="space-y-2.5 text-[11px] leading-relaxed text-ink-soft" role="note">
          <p>
            KnowledgeState and attempt rows are keyed by concept/question ids and are never touched. When a reviewer
            publishes a correction, the new version takes the record; every attempt a student made against the
            previous content still counts, still informs their knowledge profile, and still drives spaced repetition.
          </p>
          <GateNote>
            Applying a lesson body is an explicit reviewer action and is additive — no learning history is rewritten,
            re-dated, or silently reattributed.
          </GateNote>
        </div>
      </SectionCard>
    </div>
  )
}

function VersionCard({ version }: { version: FacultyVersionView }) {
  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-snug">{version.entityLabel}</p>
          <p className="mt-0.5 text-[10px] text-ink-soft">
            {version.entityType} · created {relativeTime(version.createdAt)}
            {version.lastReviewedAt ? ` · last reviewed ${new Date(version.lastReviewedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ' · not re-reviewed since publish'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] font-semibold tabular-nums text-ink-soft">v{version.version}</span>
          <FacultyStatusPill status={version.verificationStatus} />
        </div>
      </div>

      {version.summary && (
        <p className="mt-2 text-xs leading-relaxed text-foreground/90">{version.summary}</p>
      )}

      <p className="mt-1.5 text-[10px] text-ink-soft">
        <span className="font-medium text-foreground">Reviewer: </span>{version.reviewer || 'Faculty (demo)'}
      </p>

      {version.references.length > 0 && (
        <div className="mt-2">
          <MicroLabel className="mb-1">References</MicroLabel>
          <ol className="space-y-1">
            {version.references.map((r, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-ink-soft">
                <span className="shrink-0 font-semibold text-foreground">[{i + 1}]</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  )
}
