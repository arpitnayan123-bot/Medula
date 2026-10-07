'use client'

// ─── LESSON SECTIONS — the shared deep-lesson renderer ──────────────────────
// Renders a full ConceptLesson as stacked progressive-disclosure collapsibles
// (one pattern, no nesting). Used by the Learn homepage flow AND the concept
// explorer overlay. Honesty rules: a section renders only when its data
// exists — never an empty placeholder, never invented content.

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpRight, BadgeCheck, BookMarked, Brain, ChevronDown, FlaskConical,
  Globe2, Landmark, Lightbulb, ListChecks, Network, ScanLine, Stethoscope,
  Table2, Target, Timer, TriangleAlert, Waypoints, Wrench, type LucideIcon,
} from 'lucide-react'
import type { ConceptLesson, GlobalPerspectiveEntry } from '@/lib/curriculum/types'
import { cn } from '@/lib/utils'

// ── small building blocks ────────────────────────────────────────────────────

function Bullets({ items, icon: Icon }: { items: string[]; icon?: LucideIcon }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
          {Icon ? (
            <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          ) : (
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
          )}
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3.5 md:p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">{label}</p>
      <div className="medprose mt-1.5 text-sm leading-relaxed">{children}</div>
    </div>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="shadow-well overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-xs md:text-sm">
        <thead>
          <tr className="bg-surface-2">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-line">
              {row.map((cell, ci) => (
                <td key={ci} className={cn('px-3 py-2.5 align-top', ci === 0 && 'font-medium')}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── collapsible section shell (the ONE disclosure pattern) ──────────────────

function LessonSection({
  title, icon: Icon, defaultOpen = false, badge, children,
}: {
  title: string
  icon: LucideIcon
  defaultOpen?: boolean
  badge?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={cn('overflow-hidden rounded-2xl', open ? 'clay' : 'clay')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40 md:p-5"
      >
        <span className="clay-in grid size-9 shrink-0 place-items-center rounded-xl">
          <Icon className="size-4 text-primary" aria-hidden />
        </span>
        <span className="flex-1 text-sm font-semibold md:text-[15px]">{title}</span>
        {badge && (
          <span className="hidden rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft sm:inline">
            {badge}
          </span>
        )}
        <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24 }}
          >
            <div className="space-y-4 border-t border-line p-4 md:p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">{children}</p>
}

// ── global perspective per-region block ─────────────────────────────────────

const REGION_FIELD_LABELS: { key: keyof Pick<GlobalPerspectiveEntry, 'terminology' | 'workflow' | 'screening' | 'diagnosis' | 'treatment' | 'emergency' | 'delivery' | 'training'>; label: string }[] = [
  { key: 'terminology', label: 'Terminology' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'screening', label: 'Screening' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'training', label: 'Training' },
]

function RegionBlock({ entry }: { entry: GlobalPerspectiveEntry }) {
  const rows = REGION_FIELD_LABELS.map(({ key, label }) => {
    const v = entry[key]
    if (!v || (Array.isArray(v) && v.length === 0)) return null
    return (
      <div key={key} className="clay-in rounded-xl p-3.5">
        <Label>{label}</Label>
        {Array.isArray(v) ? (
          <ul className="mt-1.5 space-y-1">
            {v.map((t, i) => (
              <li key={i} className="text-sm leading-relaxed">· {t}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm leading-relaxed">{v}</p>
        )}
      </div>
    )
  }).filter(Boolean)

  return (
    <div className="space-y-3">
      {rows}
      <p className="text-xs italic leading-relaxed text-muted-foreground">{entry.note}</p>
    </div>
  )
}

// ── main renderer ────────────────────────────────────────────────────────────

export function LessonSections({
  lesson,
  compact = false,
  onOpenConcept,
}: {
  lesson: ConceptLesson
  compact?: boolean
  onOpenConcept?: (conceptId: string) => void
}) {
  const has =
    (arr?: unknown[] | string | null) =>
      Array.isArray(arr) ? arr.length > 0 : typeof arr === 'string' ? arr.trim().length > 0 : false

  const examWeightDots = Math.max(1, Math.min(5, lesson.examWeight || 1))

  return (
    <div className="space-y-4">
      {/* Quality metadata strip — always visible, no disclosure needed */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
          <BadgeCheck className="size-3 text-sev-ok" aria-hidden />
          {lesson.evidenceLevel}
        </span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
          source confidence: <span className="font-semibold text-foreground">{lesson.sourceConfidence}</span>
        </span>
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
          level: <span className="font-semibold text-foreground">{lesson.educationalLevel}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
          exam weight
          <span className="flex items-center gap-0.5" aria-label={`${examWeightDots} of 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={cn('size-1.5 rounded-full', i < examWeightDots ? 'bg-primary' : 'bg-muted-foreground/30')} />
            ))}
          </span>
        </span>
        {lesson.lastReviewed && (
          <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft">
            reviewed {lesson.lastReviewed}
          </span>
        )}
        {lesson.clinicalUpdateRequired && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2.5 py-1 text-[11px] font-medium text-sev-warn">
            <TriangleAlert className="size-3" aria-hidden />
            Clinical update recommended
          </span>
        )}
      </div>

      {/* 1 · OVERVIEW — open by default */}
      <LessonSection title="Overview" icon={Lightbulb} defaultOpen>
        <p className="text-[15px] font-medium leading-relaxed">{lesson.oneLiner}</p>
        {has(lesson.whyMatters) && (
          <FieldRow label="Why it matters">
            <p>{lesson.whyMatters}</p>
          </FieldRow>
        )}
        {has(lesson.explain30s) && (
          <div className="callout callout-easy rounded-xl">
            <div className="flex items-center gap-2">
              <Timer className="size-3.5 text-sev-ok" aria-hidden />
              <Label>Explain it in 30 seconds</Label>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{lesson.explain30s}</p>
          </div>
        )}
        {has(lesson.eli5) && (
          <div className="callout callout-easy">
            <Label>Simple version</Label>
            <p className="mt-1.5 text-sm leading-relaxed">{lesson.eli5}</p>
          </div>
        )}
        {has(lesson.firstPrinciples) && (
          <div>
            <Label>First principles — build it up step by step</Label>
            <ol className="mt-2 space-y-2.5">
              {(lesson.firstPrinciples ?? []).map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="clay-in grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {has(lesson.normal) && (
          <FieldRow label="Normal baseline">
            <p>{lesson.normal}</p>
          </FieldRow>
        )}
      </LessonSection>

      {/* 2 · DEEP DIVE — every optional depth field, hidden when absent */}
      {(has(lesson.mechanism) || has(lesson.presentation) || has(lesson.diagnosis) ||
        has(lesson.differentials) || has(lesson.management) || has(lesson.complications) ||
        has(lesson.numbers) || has(lesson.drugs) || has(lesson.procedures) ||
        has(lesson.imaging) || has(lesson.pathologyCorrelation)) && (
        <LessonSection title="Deep dive" icon={Stethoscope} defaultOpen={!compact}>
          {has(lesson.mechanism) && (
            <FieldRow label="Mechanism">
              <p>{lesson.mechanism}</p>
            </FieldRow>
          )}
          {has(lesson.presentation) && (
            <div>
              <Label>Clinical presentation</Label>
              <div className="mt-2"><Bullets items={lesson.presentation ?? []} /></div>
            </div>
          )}
          {has(lesson.diagnosis) && (
            <div>
              <Label>Diagnosis & investigations</Label>
              <div className="mt-2"><Bullets items={lesson.diagnosis ?? []} /></div>
            </div>
          )}
          {has(lesson.differentials) && (
            <div>
              <Label>Differentials — the distinguishing key</Label>
              <div className="mt-2 space-y-2">
                {(lesson.differentials ?? []).map((d, i) => (
                  <div key={i} className="clay-in rounded-xl p-3.5">
                    <p className="text-sm font-semibold">{d.name}</p>
                    <p className="medprose mt-1 text-sm leading-relaxed text-ink-soft">↳ {d.key}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {has(lesson.management) && (
            <div>
              <div className="callout callout-warn rounded-xl">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="size-3.5 text-sev-warn" aria-hidden />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sev-warn">
                    Educational principles — verify against current guidelines
                  </p>
                </div>
                {lesson.verifyNote && <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{lesson.verifyNote}</p>}
              </div>
              <div className="mt-3"><Label>Management principles</Label>
                <div className="mt-2"><Bullets items={lesson.management ?? []} /></div>
              </div>
            </div>
          )}
          {has(lesson.complications) && (
            <div>
              <Label>Complications</Label>
              <div className="mt-2"><Bullets items={lesson.complications ?? []} /></div>
            </div>
          )}
          {has(lesson.numbers) && (
            <div>
              <div className="flex items-center gap-2">
                <Table2 className="size-3.5 text-primary" aria-hidden />
                <Label>Numbers to know</Label>
              </div>
              <div className="mt-2">
                <DataTable
                  headers={['Value', 'What it means']}
                  rows={(lesson.numbers ?? []).map((n) => [`${n.label} — ${n.value}`, n.note ?? ''])}
                />
              </div>
            </div>
          )}
          {has(lesson.drugs) && (
            <div>
              <Label>Drugs</Label>
              <div className="mt-2">
                <DataTable
                  headers={['Drug', 'Class', 'Mechanism']}
                  rows={(lesson.drugs ?? []).map((d) => [d.name + (d.note ? ` (${d.note})` : ''), d.drugClass, d.mechanism])}
                />
              </div>
            </div>
          )}
          {has(lesson.procedures) && (
            <div>
              <div className="flex items-center gap-2">
                <Wrench className="size-3.5 text-primary" aria-hidden />
                <Label>Procedures</Label>
              </div>
              <div className="mt-2 space-y-2">
                {(lesson.procedures ?? []).map((p, i) => (
                  <div key={i} className="clay-in rounded-xl p-3.5">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="medprose mt-1 text-sm leading-relaxed text-ink-soft">{p.what}</p>
                    {p.steps && p.steps.length > 0 && (
                      <ol className="mt-2 space-y-1.5">
                        {p.steps.map((s, j) => (
                          <li key={j} className="flex gap-2 text-sm leading-relaxed">
                            <span className="font-semibold text-primary">{j + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {has(lesson.imaging) && (
            <div>
              <div className="flex items-center gap-2">
                <ScanLine className="size-3.5 text-primary" aria-hidden />
                <Label>Imaging correlation</Label>
              </div>
              <p className="medprose mt-1.5 text-sm leading-relaxed">{lesson.imaging}</p>
            </div>
          )}
          {has(lesson.pathologyCorrelation) && (
            <div>
              <div className="flex items-center gap-2">
                <FlaskConical className="size-3.5 text-primary" aria-hidden />
                <Label>Pathology correlation</Label>
              </div>
              <p className="medprose mt-1.5 text-sm leading-relaxed">{lesson.pathologyCorrelation}</p>
            </div>
          )}
        </LessonSection>
      )}

      {/* 3 · CLINICAL REASONING — vertical stepper */}
      {has(lesson.reasoning) && (
        <LessonSection
          title="Clinical reasoning"
          icon={Waypoints}
          badge={`${lesson.reasoning?.length} steps`}
        >
          <ol className="relative space-y-4 border-l border-line pl-5">
            {(lesson.reasoning ?? []).map((r, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1 grid size-4 place-items-center rounded-full border-2 border-primary bg-background" aria-hidden />
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{r.stage}</p>
                <p className="mt-0.5 text-sm font-semibold leading-snug">{r.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{r.detail}</p>
              </li>
            ))}
          </ol>
        </LessonSection>
      )}

      {/* 4 · MEMORY & EXAM */}
      {(has(lesson.mnemonics) || has(lesson.mistakes) || has(lesson.analogies) ||
        has(lesson.examRelevance) || has(lesson.clinicalRelevance) || has(lesson.teachDeeper)) && (
        <LessonSection title="Memory & exam" icon={Brain}>
          {has(lesson.mnemonics) && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(lesson.mnemonics ?? []).map((m, i) => (
                <div key={i} className="callout callout-pearl rounded-xl">
                  <p className="text-sm font-bold tracking-wide">{m.hook}</p>
                  <p className="medprose mt-1 text-sm leading-relaxed text-ink-soft">{m.expands}</p>
                </div>
              ))}
            </div>
          )}
          {has(lesson.mistakes) && (
            <div className="callout callout-warn rounded-xl">
              <Label>Common mistakes</Label>
              <div className="mt-2"><Bullets items={lesson.mistakes ?? []} /></div>
            </div>
          )}
          {has(lesson.analogies) && (
            <div>
              <Label>Analogies</Label>
              <div className="mt-2"><Bullets items={lesson.analogies ?? []} icon={Lightbulb} /></div>
            </div>
          )}
          {has(lesson.examRelevance) && (
            <div className="callout callout-exam">
              <div className="flex items-center gap-2">
                <Target className="size-3.5 text-sev-crit" aria-hidden />
                <Label>How the exam asks it</Label>
              </div>
              <p className="medprose mt-1.5 text-sm leading-relaxed">{lesson.examRelevance}</p>
            </div>
          )}
          {has(lesson.clinicalRelevance) && (
            <FieldRow label="Real-world practice">
              <p>{lesson.clinicalRelevance}</p>
            </FieldRow>
          )}
          {has(lesson.teachDeeper) && (
            <div>
              <Label>Teach me deeper — threads to pull</Label>
              <div className="mt-2"><Bullets items={lesson.teachDeeper ?? []} icon={BookMarked} /></div>
            </div>
          )}
        </LessonSection>
      )}

      {/* 5 · GLOBAL PERSPECTIVE */}
      {has(lesson.global) && (
        <LessonSection title="Global perspective" icon={Globe2} badge={`${lesson.global?.length} regions`}>
          <div className="space-y-4">
            {(lesson.global ?? []).map((g, i) => (
              <div key={i} className="clay-in rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <Landmark className="size-3.5 text-primary" aria-hidden />
                  <p className="text-sm font-semibold">{g.region}</p>
                </div>
                <div className="mt-3"><RegionBlock entry={g} /></div>
              </div>
            ))}
          </div>
        </LessonSection>
      )}

      {/* 6 · CONNECTIONS */}
      {has(lesson.crossLinks) && (
        <LessonSection title="Connections" icon={Network} badge={`${lesson.crossLinks?.length} links`}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(lesson.crossLinks ?? []).map((link, i) => {
              const openable = Boolean(link.conceptId && onOpenConcept && link.conceptId)
              const inner = (
                <>
                  <p className={cn('text-sm font-semibold leading-snug', openable && 'group-hover:text-primary')}>
                    {link.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{link.why}</p>
                  {link.subject && (
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {link.subject}
                    </p>
                  )}
                </>
              )
              return openable ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => onOpenConcept?.(link.conceptId!)}
                  className="clay clay-hover group min-h-11 rounded-xl p-3.5 text-left"
                >
                  {inner}
                </button>
              ) : (
                <div key={i} className="clay-in rounded-xl p-3.5">{inner}</div>
              )
            })}
          </div>
        </LessonSection>
      )}

      {/* 7 · SOURCES & FURTHER READING */}
      {has(lesson.sources) && (
        <LessonSection title="Sources & further reading" icon={ListChecks} badge={`${lesson.sources?.length}`}>
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs italic leading-relaxed text-ink-soft">
            Independently synthesized — sources are references, not copies.
          </p>
          <div className="space-y-2.5">
            {(lesson.sources ?? []).map((s, i) => (
              <div key={i} className="clay-in rounded-xl p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{s.institution}</p>
                  <span className="rounded-full border border-line bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {s.sourceType}
                  </span>
                  {s.year != null && <span className="text-[11px] text-muted-foreground">{s.year}</span>}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.title}</p>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Open source <ArrowUpRight className="size-3.5" aria-hidden />
                  </a>
                )}
                {s.accessNote && <p className="mt-1 text-xs italic text-muted-foreground">{s.accessNote}</p>}
              </div>
            ))}
          </div>
        </LessonSection>
      )}
    </div>
  )
}
