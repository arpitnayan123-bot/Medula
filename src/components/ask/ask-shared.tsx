'use client'

// ─── ASK ENGINE · SHARED PRIMITIVES (PRODUCT 15) ─────────────────────────────
// Trust made visible: level chips, AI-badge + uncertainty banners, deterministic
// source rows (platform / lesson-ref / question-pool / external link-out),
// knowledge-graph connection chips and the measured high-yield list.

import { motion, useReducedMotion } from 'framer-motion'
import {
  BookOpenCheck, CircleAlert, ExternalLink, FlaskConical, Landmark, Quote,
  ShieldCheck, Sparkles, Trophy,
} from 'lucide-react'
import type { AskAnswerPayload, AskLevel, AskSource } from '@/lib/types'
import { GRAPH_GROUP_META } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const ASK_LEVELS: AskLevel[] = ['eli5', 'mbbs', 'neetpg', 'detailed']
export const ASK_LEVEL_LABEL: Record<AskLevel, string> = {
  eli5: 'ELI5', mbbs: 'MBBS', neetpg: 'NEET-PG', detailed: 'Detailed',
}

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduce ? 0 : 0.05 * index, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

export function SectionCard({ title, icon, children, className, action }: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface-1 p-4 sm:p-5', className)} aria-label={title}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
          {icon}
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  )
}

/** The four answer levels — one chip row, active state explicit. */
export function LevelChips({ active, busy, onPick }: { active: AskLevel; busy?: boolean; onPick: (l: AskLevel) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Answer level">
      {ASK_LEVELS.map((l) => (
        <button
          key={l}
          role="tab"
          aria-selected={active === l}
          disabled={busy}
          onClick={() => onPick(l)}
          className={cn(
            'min-h-9 rounded-full border px-3.5 text-xs font-medium transition-colors disabled:opacity-50',
            active === l
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-line bg-surface-1 text-ink-soft hover:border-primary/40 hover:text-foreground',
          )}
        >
          {ASK_LEVEL_LABEL[l]}
        </button>
      ))}
    </div>
  )
}

/** Honest uncertainty banner — never dressed up as confidence. */
export function UncertainBanner({ note }: { note?: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-sev-warn/40 bg-sev-warn/10 p-3 text-xs leading-relaxed text-sev-warn">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">Not fully grounded.</span>{' '}
        {note || 'The platform content could not fully answer this, so treat the answer above with care.'} Verify
        against your standard textbook before using it for decisions.
      </span>
    </div>
  )
}

export function AiBadgeRow({ fallback, measured }: { fallback: boolean; measured?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft">
      <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
        <Sparkles className="size-3" aria-hidden /> AI answer
      </Badge>
      <Badge variant="outline" className="gap-1">
        <ShieldCheck className="size-3" aria-hidden /> grounded in platform content
      </Badge>
      {fallback && (
        <Badge variant="outline" className="gap-1">
          deterministic compose
        </Badge>
      )}
      {measured && <span aria-hidden>· {measured}</span>}
    </div>
  )
}

const SOURCE_ICON: Record<AskSource['kind'], typeof Landmark> = {
  platform: BookOpenCheck,
  'lesson-ref': Landmark,
  'question-pool': FlaskConical,
  external: ExternalLink,
}

const SOURCE_KIND_LABEL: Record<AskSource['kind'], string> = {
  platform: 'Platform',
  'lesson-ref': 'Reference',
  'question-pool': 'Question pool',
  external: 'External',
}

/** Deterministic source row — the engine assembled these, never the LLM. */
export function SourceRow({ s }: { s: AskSource }) {
  const Icon = SOURCE_ICON[s.kind] ?? Landmark
  const inner = (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-surface-1 p-3 transition-colors min-h-11 hover:border-primary/30">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="size-3.5 text-primary" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{s.label}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-soft">
          <span className="font-medium text-ink-soft/90">{SOURCE_KIND_LABEL[s.kind]}</span>
          {s.detail && <span aria-hidden>· {s.detail}</span>}
          {s.kind === 'external' && s.license && <span aria-hidden>· {s.license}</span>}
          {s.kind === 'external' && s.access && <span aria-hidden>· {s.access.toLowerCase()}</span>}
          {s.kind === 'external' && (
            <span className={s.verified ? 'text-sev-ok' : 'text-sev-warn'}>
              · {s.verified ? 'link verified' : 'verification pending'}
            </span>
          )}
        </p>
      </div>
      {s.kind === 'external' && s.url && <ExternalLink className="mt-1 size-3.5 shrink-0 text-ink-soft" aria-hidden />}
    </div>
  )
  if (s.kind === 'external' && s.url) {
    return (
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="block" aria-label={`${s.label} (opens external site)`}>
        {inner}
      </a>
    )
  }
  return inner
}

/** Connection chips grouped by the verified knowledge-graph relation. */
export function ConnectionGroup({ group, items, onOpen }: {
  group: string
  items: { id: string; name: string; mastery: number; status: string }[]
  onOpen: (id: string) => void
}) {
  const meta = GRAPH_GROUP_META[group as keyof typeof GRAPH_GROUP_META]
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">
        {meta?.label ?? group}
        <span className="ml-1.5 font-normal text-ink-soft/70">{meta?.blurb}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <button
            key={i.id}
            onClick={() => onOpen(i.id)}
            className={cn(
              'min-h-9 rounded-full border px-3 text-xs transition-colors',
              i.status === 'weak' || i.status === 'unstable'
                ? 'border-sev-warn/40 bg-sev-warn/10 text-foreground hover:border-sev-warn'
                : 'border-line bg-surface-2 hover:border-primary/40',
            )}
            title={i.mastery ? `Your mastery: ${i.mastery}%` : 'Not attempted yet'}
          >
            {i.name}
            {i.status !== 'new' && i.mastery > 0 && <span className="ml-1.5 text-[10px] text-ink-soft">{i.mastery}%</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Measured high-yield facts — numbers, traps and mnemonics from the lesson. */
export function HighYieldList({ facts }: { facts: string[] }) {
  return (
    <ul className="space-y-2">
      {facts.map((f, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed">
          <span
            className={cn(
              'mt-1.5 size-1.5 shrink-0 rounded-full',
              f.startsWith('Common mistake') ? 'bg-sev-warn' : f.startsWith('Mnemonic') ? 'bg-primary' : 'bg-ink-soft/50',
            )}
            aria-hidden
          />
          <span>
            {f.startsWith('Common mistake') ? (
              <><span className="font-medium text-sev-warn">Trap — </span>{f.replace('Common mistake: ', '')}</>
            ) : f.startsWith('Mnemonic — ') ? (
              <><span className="font-medium text-primary">Mnemonic · </span>{f.replace('Mnemonic — ', '')}</>
            ) : (
              f
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Key-point bullets under the quick answer. */
export function KeyPoints({ points }: { points: string[] }) {
  if (!points.length) return null
  return (
    <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
      {points.map((p, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
          <Quote className="mt-0.5 size-3 shrink-0 text-primary/70" aria-hidden />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  )
}

export function MasteryChip({ mastery, status }: { mastery: number | null; status: string | null }) {
  if (mastery === null) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1',
        status === 'strong' && 'border-sev-ok/50 bg-sev-ok/10 text-sev-ok',
        (status === 'weak' || status === 'unstable') && 'border-sev-warn/50 bg-sev-warn/10 text-sev-warn',
      )}
    >
      <Trophy className="size-3" aria-hidden /> {mastery}% mastery
    </Badge>
  )
}
