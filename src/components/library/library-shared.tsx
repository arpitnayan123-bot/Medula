'use client'

// ─── RESOURCE HUB · SHARED PRIMITIVES (PRODUCT 14) ───────────────────────────
// The trust rules of the frozen contract, made visible: platform-owned vs
// external ownership, access + license badges, honest verification status,
// difficulty dots and exam tags. External resources are METADATA + LINK-OUT
// ONLY — cards open our detail sheet, and the only "open" for external
// content ever points at the original source.

import { Children } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen, ClipboardList, CircleHelp, FileQuestion, GraduationCap, Images,
  Info, Library as LibraryIcon, MonitorPlay, NotebookPen, RefreshCcw, Scale,
  ScrollText, ShieldAlert, ShieldCheck, Stethoscope,
} from 'lucide-react'
import type { LibraryResource, ResourceAccess, ResourceKind } from '@/lib/types'
import { RESOURCE_KIND_META } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollReveal, Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// ── Kind icon mapping (RESOURCE_KIND_META carries string icon names) ─────────
export const KIND_ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  NotebookPen,
  MonitorPlay,
  ScrollText,
  Scale,
  Library: LibraryIcon,
  Images,
  Stethoscope,
  FileQuestion,
  CircleHelp,
  RefreshCcw,
  GraduationCap,
  ClipboardList,
}

export function kindLabel(kind: ResourceKind): string {
  return RESOURCE_KIND_META[kind]?.label ?? kind
}

export function KindIcon({ kind, className }: { kind: ResourceKind; className?: string }) {
  const Icon = KIND_ICON_MAP[RESOURCE_KIND_META[kind]?.icon] ?? BookOpen
  return <Icon className={cn('size-4 shrink-0 text-primary', className)} aria-hidden />
}

// ── Motion + label primitives (same recipe as graph/revision shared parts) ───

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  return (
    <ScrollReveal className={className} delay={0.05 * index} amount={0.08}>
      {children}
    </ScrollReveal>
  )
}

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

export function StatChip({ label, value, icon: Icon }: { label: string; value: number | string; icon?: LucideIcon }) {
  return (
    <div className="clay-in flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5">
      {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
      <span className="min-w-0">
        <span className="block truncate text-base font-bold leading-tight tabular-nums">{value}</span>
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</span>
      </span>
    </div>
  )
}

// ── Trust badges ──────────────────────────────────────────────────────────────

export function OwnershipBadge({ ownership, className }: { ownership: 'platform' | 'external'; className?: string }) {
  return ownership === 'platform' ? (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary',
        className,
      )}
    >
      Platform
    </span>
  ) : (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft',
        className,
      )}
    >
      External
    </span>
  )
}

const ACCESS_META: Record<ResourceAccess, { label: string; cls: string }> = {
  PUBLIC: { label: 'Free access', cls: 'border-sev-ok/35 bg-sev-ok/10 text-sev-ok' },
  REGISTRATION: { label: 'Free · sign-up', cls: 'border-sev-warn/35 bg-sev-warn/10 text-sev-warn' },
  PAID: { label: 'Paid', cls: 'border-sev-crit/35 bg-sev-crit/10 text-sev-crit' },
  MIXED: { label: 'Partly paid', cls: 'border-sev-warn/35 bg-sev-warn/10 text-sev-warn' },
  UNKNOWN: { label: 'Access unknown', cls: 'border-line bg-surface-2 text-ink-soft' },
}

export function AccessBadge({ access, className }: { access: ResourceAccess; className?: string }) {
  const meta = ACCESS_META[access] ?? ACCESS_META.UNKNOWN
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        meta.cls,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}

/** Honest verification state — never dresses a pending link up as verified. */
export function VerifiedBadge({ verified, lastVerified, className }: { verified: boolean; lastVerified: string | null; className?: string }) {
  return verified ? (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-ok/35 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-bold text-sev-ok',
        className,
      )}
      title="The source domain was confirmed in a live verification session"
    >
      <ShieldCheck className="size-3" aria-hidden />
      Verified{lastVerified ? ` ${lastVerified}` : ''}
    </span>
  ) : (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-sev-warn/35 bg-sev-warn/10 px-2 py-0.5 text-[10px] font-bold text-sev-warn',
        className,
      )}
      title="Recorded but not yet confirmed in a verification session"
    >
      <ShieldAlert className="size-3" aria-hidden />
      Verification pending
    </span>
  )
}

/** License/permission status compressed to a chip-length label. */
export function licenseShort(license: string): string {
  const l = license.toLowerCase()
  if (l.includes('cc by-nc-nd')) return 'CC BY-NC-ND'
  if (l.includes('cc by-nc-sa')) return 'CC BY-NC-SA'
  if (l.includes('cc by 4.0') || l.includes('cc-by')) return 'CC BY 4.0'
  if (l.includes('public domain')) return 'Public domain'
  if (l.includes('varies')) return 'Varies per item'
  if (l.includes('who')) return 'WHO terms'
  if (l.includes('government') || l.includes('igo')) return 'Gov. terms'
  if (license.startsWith('©')) return '© site terms'
  return 'See site terms'
}

export function LicenseChip({ license, className }: { license: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft',
        className,
      )}
      title={license}
    >
      {licenseShort(license)}
    </span>
  )
}

// ── Difficulty + exams + platform counts ─────────────────────────────────────

const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = { 1: 'Foundational', 2: 'Core', 3: 'Advanced' }

export function DifficultyDots({ level, className }: { level: 1 | 2 | 3; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1.5', className)}
      title={`Difficulty: ${DIFFICULTY_LABELS[level]}`}
      aria-label={`Difficulty ${level} of 3 — ${DIFFICULTY_LABELS[level]}`}
    >
      <span className="flex items-center gap-0.5" aria-hidden>
        {[1, 2, 3].map((d) => (
          <span
            key={d}
            className={cn(
              'size-1.5 rounded-full',
              d <= level ? (level === 3 ? 'bg-sev-warn' : level === 2 ? 'bg-primary' : 'bg-sev-ok') : 'bg-line',
            )}
          />
        ))}
      </span>
      <span className="text-[10px] font-semibold text-ink-soft">{DIFFICULTY_LABELS[level]}</span>
    </span>
  )
}

const EXAM_LABELS: Record<string, string> = { neetpg: 'NEET-PG', fmge: 'FMGE', mbbs: 'MBBS' }

export function ExamTags({ exams, className }: { exams: string[]; className?: string }) {
  if (exams.length === 0) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {exams.slice(0, 3).map((e) => (
        <span key={e} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
          {EXAM_LABELS[e] ?? e.toUpperCase()}
        </span>
      ))}
    </span>
  )
}

const COUNT_LABELS: Record<string, string> = {
  mcqs: 'MCQs',
  questions: 'questions',
  pyqs: 'PYQs',
  lessons: 'lessons',
  concepts: 'concepts',
  flashcards: 'flashcards',
  cases: 'cases',
  topics: 'topics',
  subjects: 'subjects',
  videos: 'videos',
  notes: 'notes',
}

/** "24 MCQs · 6 lessons" — measured backing counts of platform resources. */
export function CountsChips({ counts, className }: { counts: Record<string, number>; className?: string }) {
  const parts = Object.entries(counts)
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .slice(0, 4)
    .map(([key, n]) => `${n} ${COUNT_LABELS[key] ?? key.replace(/[-_]/g, ' ')}`)
  if (parts.length === 0) return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary',
        className,
      )}
    >
      {parts.join(' · ')}
    </span>
  )
}

// ── LibraryCard ───────────────────────────────────────────────────────────────

export function LibraryCard({
  resource, onOpen, reasonTag,
}: {
  resource: LibraryResource
  onOpen: (id: string) => void
  reasonTag?: string
}) {
  const external = resource.ownership === 'external'
  return (
    <button
      type="button"
      onClick={() => onOpen(resource.id)}
      aria-label={`${resource.title} — ${external ? 'external resource' : 'platform resource'}, open details`}
      className="clay clay-hover group flex h-full min-w-0 flex-col gap-2.5 rounded-2xl p-4 text-left outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
    >
      <span className="flex items-start gap-3">
        <span className="clay-in grid size-9 shrink-0 place-items-center rounded-xl" aria-hidden>
          <KindIcon kind={resource.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-sm font-semibold leading-snug">{resource.title}</span>
          <span className="mt-0.5 block text-[11px] font-medium text-ink-soft">{kindLabel(resource.kind)}</span>
        </span>
        <OwnershipBadge ownership={resource.ownership} />
      </span>

      <span className="line-clamp-2 block text-xs leading-relaxed text-ink-soft">{resource.description}</span>

      <span className="mt-auto flex flex-wrap items-center gap-1.5">
        {external ? (
          <>
            {resource.sourceName && (
              <span className="max-w-full truncate rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                {resource.sourceName}
              </span>
            )}
            <AccessBadge access={resource.access} />
            <LicenseChip license={resource.license} />
            <VerifiedBadge verified={resource.urlVerified} lastVerified={resource.lastVerified} />
          </>
        ) : (
          <CountsChips counts={resource.counts} />
        )}
        <DifficultyDots level={resource.difficulty} />
        <ExamTags exams={resource.exams} />
        {reasonTag && (
          <span className="max-w-full truncate rounded-full border border-sev-ok/35 bg-sev-ok/10 px-2 py-0.5 text-[10px] font-semibold text-sev-ok">
            {reasonTag}
          </span>
        )}
      </span>
    </button>
  )
}

/** Card grid — 1 column mobile, 2 columns ≥lg (low-clutter rule).
 *  Cards arrive in a gentle Stagger cascade (reduced-motion safe). */
export function CardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Stagger className={cn('grid grid-cols-1 gap-3 lg:grid-cols-2', className)}>
      {Children.map(children, (child) =>
        child == null ? child : <StaggerItem>{child}</StaggerItem>,
      )}
    </Stagger>
  )
}

// ── Disclaimer footnote (always renders payload.disclaimer) ──────────────────

export function DisclaimerFootnote({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-[11px] leading-relaxed text-ink-soft',
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-ink-soft" aria-hidden />
      <span>{text}</span>
    </p>
  )
}

// ── Skeleton / error shells for the section ──────────────────────────────────

export function SectionSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
