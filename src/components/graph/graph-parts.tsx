'use client'

// ─── KNOWLEDGE GRAPH · SHARED PARTS (PRODUCT 08) ───
// Calm, mobile-first primitives for the graph section. Visual language copied
// from the Smart Revision / Adaptive / Mistakes sections (glass panels, sev
// tones, uppercase micro-labels, Reveal entrances). The underlying graph is
// complex — the UI stays quiet: small chips, tiny labels, measured numbers.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Activity, ArrowDownRight, ArrowUpRight, Biohazard, Bone, Bug, CheckCircle2,
  ClipboardCheck, Cog, DoorOpen, Flag, GitCompareArrows, Hand, KeyRound, Lightbulb, Link2, Loader2,
  Microscope, Pill, Sparkles, Stethoscope, Syringe, TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { GRAPH_GROUP_META } from '@/lib/types'
import type { GraphAiResponse, GraphGroup, GraphGroupKind, GraphHub, GraphNeighbor } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Slim scrollbar utility for long scrollable lists (same recipe as revision-shared)
export const SCROLL_SLIM =
  '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line ' +
  '[&::-webkit-scrollbar-track]:bg-transparent'

// ─── Motion + label primitives ────────────────────────────────────────────────

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

export function MicroLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft', className)}>
      {children}
    </p>
  )
}

// ─── Kind + status conventions (from concept-explorer / types.ts KIND_META) ──

export const KIND_ICONS: Record<string, LucideIcon> = {
  concept: Lightbulb,
  disease: Stethoscope,
  drug: Pill,
  investigation: Microscope,
  physiology: Activity,
  anatomy: Bone,
  pathology: Biohazard,
  pharmacology: Syringe,
  microbiology: Bug,
  clinical_skill: Hand,
}

const KIND_COLORS: Record<string, string> = {
  concept: '#22d3ee', disease: '#f87171', drug: '#a78bfa', investigation: '#fbbf24',
  physiology: '#34d399', anatomy: '#38bdf8', pathology: '#f472b6', pharmacology: '#c084fc',
  microbiology: '#facc15', clinical_skill: '#4ade80',
}

export function statusColor(s: string): string {
  switch (s) {
    case 'strong': return 'var(--sev-ok)'
    case 'unstable': return 'var(--sev-warn)'
    case 'weak': return 'var(--sev-crit)'
    default: return 'var(--muted-foreground)' // new / unknown
  }
}

export function masteryColor(m: number): string {
  if (m <= 0) return 'var(--muted-foreground)'
  if (m < 45) return 'var(--sev-crit)'
  if (m < 70) return 'var(--sev-warn)'
  return 'var(--sev-ok)'
}

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = KIND_ICONS[kind]
  if (!Icon) return null
  return <Icon className={cn('size-3.5 shrink-0', className)} style={{ color: KIND_COLORS[kind] ?? 'var(--muted-foreground)' }} aria-hidden />
}

export function KindBadge({ kind }: { kind: string }) {
  const color = KIND_COLORS[kind] ?? 'var(--muted-foreground)'
  const Icon = KIND_ICONS[kind]
  const label = kind.replace(/_/g, ' ')
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 36%, transparent)`,
      }}
    >
      {Icon && <Icon className="size-2.5" aria-hidden />}
      {label}
    </span>
  )
}

export function MasteryDot({ mastery, status, className }: { mastery: number; status?: string; className?: string }) {
  const color = status ? statusColor(status) : masteryColor(mastery)
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
      role="img"
      aria-label={`mastery ${Math.round(mastery)}%${status ? `, ${status}` : ''}`}
    />
  )
}

export function SubjectChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-2 py-0.5 text-[10px] font-medium text-ink-soft', className)}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  )
}

export function ExamDots({ n, className }: { n: number; className?: string }) {
  const d = Math.max(0, Math.min(5, Math.round(n)))
  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={`Exam relevance ${d}/5`} aria-label={`Exam relevance ${d} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('size-1.5 rounded-full', i <= d ? 'bg-primary' : 'bg-foreground/15')} />
      ))}
    </span>
  )
}

// ─── Mastery ring (hub header — same recipe as concept explorer) ──────────────

export function MasteryRing({ score, status, estRecall }: { score: number; status: string; estRecall: number }) {
  const pct = Math.max(0, Math.min(100, score)) / 100
  const recall = Math.max(0, Math.min(1, estRecall))
  const color = statusColor(status)
  const R = 24
  const C = 2 * Math.PI * R
  const reduce = useReducedMotion()
  return (
    <div className="flex w-[96px] shrink-0 flex-col items-center gap-0.5 text-center">
      <svg width="60" height="60" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--muted)" strokeWidth="5" />
        <motion.circle
          cx="32" cy="32" r={R}
          fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C}
          initial={reduce ? { strokeDashoffset: C * (1 - pct) } : { strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--foreground)">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{status}</span>
      <span className="text-[9px] leading-tight text-muted-foreground">recall est. {Math.round(recall * 100)}%</span>
    </div>
  )
}

// ─── Group tone (fixed group → colour map, reused by minimap) ─────────────────

export const GROUP_ICONS: Record<GraphGroupKind, LucideIcon> = {
  prerequisite: KeyRound,
  unlocks: DoorOpen,
  related: Link2,
  confusable: GitCompareArrows,
  causes: ArrowDownRight,
  caused_by: ArrowUpRight,
  mechanism: Cog,
  manifestation: Stethoscope,
  investigation: Microscope,
  treatment: Pill,
  complication: TriangleAlert,
  application: ClipboardCheck,
}

export const GROUP_COLORS: Record<GraphGroupKind, string> = {
  prerequisite: '#f59e0b',
  unlocks: '#34d399',
  related: '#94a3b8',
  confusable: '#e879f9',
  causes: '#fb923c',
  caused_by: '#fb7185',
  mechanism: '#2dd4bf',
  manifestation: '#a78bfa',
  investigation: '#fbbf24',
  treatment: '#4ade80',
  complication: '#f87171',
  application: '#22d3ee',
}

// ─── Relationship feedback dialog (data-quality loop) ─────────────────────────
// NOTE: the project mounts the shadcn Toaster (ui/toaster) in layout.tsx —
// every other view reports via use-toast, so the same channel is used here
// for the confirmation (a raw sonner <Sonner/> host is not mounted).

type Vote = 'wrong' | 'helpful' | 'unsure'

const VOTE_LABELS: { value: Vote; label: string }[] = [
  { value: 'wrong', label: 'This link is wrong' },
  { value: 'helpful', label: 'Helpful' },
  { value: 'unsure', label: 'Not sure' },
]

export function FeedbackDialog({
  target, onClose,
}: {
  target: { fromId: string; neighbor: GraphNeighbor } | null
  onClose: () => void
}) {
  // State resets happen via key-remount (parent keys this dialog by target id).
  const [vote, setVote] = useState<Vote | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (!target || !vote || sending) return
    setSending(true)
    try {
      await api.graphFeedback({
        fromId: target.fromId,
        toId: target.neighbor.id,
        type: target.neighbor.edgeType,
        vote,
        note: note.trim() || undefined,
      })
      toast({ title: 'Thanks — a reviewer will check this link.' })
      onClose()
    } catch {
      toast({ title: 'Could not send feedback', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={target != null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby="graph-feedback-desc">
        <DialogHeader>
          <DialogTitle className="text-base">Review this link</DialogTitle>
          <DialogDescription id="graph-feedback-desc">
            {target ? `${target.neighbor.name} · ${target.neighbor.edgeLabel}` : ''}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={vote ?? undefined} onValueChange={(v) => setVote(v as Vote)} className="gap-2.5">
          {VOTE_LABELS.map((v) => (
            <div key={v.value} className="flex items-center gap-2.5">
              <RadioGroupItem value={v.value} id={`fb-${v.value}`} />
              <Label htmlFor={`fb-${v.value}`} className="cursor-pointer text-sm font-normal">{v.label}</Label>
            </div>
          ))}
        </RadioGroup>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything else? (optional)"
          className="min-h-[64px] resize-none text-sm"
          aria-label="Optional note"
        />
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="min-h-10" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button className="min-h-10" onClick={() => void submit()} disabled={!vote || sending}>
            {sending && <Loader2 className="size-4 animate-spin" aria-hidden />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Neighbor chip (the atom of "Related Knowledge") ──────────────────────────

export function NeighborChip({
  neighbor, confusable, onOpen, onExplain, onFlag,
}: {
  neighbor: GraphNeighbor
  confusable?: boolean
  onOpen: (id: string, name?: string) => void
  onExplain?: (n: GraphNeighbor) => void
  onFlag: (n: GraphNeighbor) => void
}) {
  return (
    <div className="group flex min-w-0 items-stretch gap-1 rounded-xl border border-line bg-surface-2/50 p-1.5 transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={() => onOpen(neighbor.id, neighbor.name)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left"
      >
        <MasteryDot mastery={neighbor.mastery} status={neighbor.status} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <KindIcon kind={neighbor.kind} className="size-3" />
            <span className="min-w-0 truncate text-sm font-medium">{neighbor.name}</span>
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-medium uppercase tracking-wide text-ink-soft">
            {neighbor.edgeLabel}
          </span>
        </span>
        {neighbor.questionCount > 0 && (
          <span className="shrink-0 rounded-full border border-line bg-background/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-ink-soft" title={`${neighbor.questionCount} linked questions`}>
            {neighbor.questionCount}Q
          </span>
        )}
      </button>
      <span className="flex shrink-0 flex-col items-center justify-center gap-0.5 pr-0.5">
        <button
          type="button"
          onClick={() => onFlag(neighbor)}
          aria-label={`Flag the link to ${neighbor.name} for review`}
          title="Is this link right?"
          className="grid size-8 place-items-center rounded-lg text-ink-soft/50 transition-colors hover:bg-sev-warn/10 hover:text-sev-warn focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
        >
          <Flag className="size-3.5" aria-hidden />
        </button>
        {confusable && onExplain && (
          <button
            type="button"
            onClick={() => onExplain(neighbor)}
            aria-label={`Explain the link between this concept and ${neighbor.name}`}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
          >
            <Sparkles className="size-3" aria-hidden /> why?
          </button>
        )}
      </span>
    </div>
  )
}

// ─── Group section (server-ordered, capped at 6 with "+N more") ───────────────

const DISPLAY_CAP = 6

export function GroupSection({
  group, onOpen, onExplain, onFlag,
}: {
  group: GraphGroup
  onOpen: (id: string, name?: string) => void
  onExplain: (n: GraphNeighbor) => void
  onFlag: (n: GraphNeighbor) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = GRAPH_GROUP_META[group.kind]
  const label = group.label || meta?.label || group.kind
  const blurb = group.blurb || meta?.blurb || ''
  const tone = GROUP_COLORS[group.kind]
  const Icon = GROUP_ICONS[group.kind] ?? Link2
  const total = group.items.length + (group.hidden ?? 0)
  const shown = expanded ? group.items : group.items.slice(0, DISPLAY_CAP)
  const confusable = group.kind === 'confusable'

  if (group.items.length === 0) return null

  return (
    <section className="space-y-2" aria-label={`${label} (${total})`}>
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]">
            <span className="truncate">{label}</span>
            <span className="shrink-0 rounded-full border border-line bg-surface-2/70 px-1.5 py-px text-[10px] font-bold tabular-nums text-ink-soft">
              {total}
            </span>
          </p>
          {blurb && <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{blurb}</p>}
        </div>
      </div>
      <div className="ml-0 grid gap-1.5 sm:grid-cols-2">
        {shown.map((n) => (
          <NeighborChip key={`${group.kind}-${n.id}`} neighbor={n} confusable={confusable} onOpen={onOpen} onExplain={onExplain} onFlag={onFlag} />
        ))}
      </div>
      {!expanded && group.items.length > DISPLAY_CAP && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-9 rounded-lg px-2 text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
        >
          +{group.items.length - DISPLAY_CAP + (group.hidden ?? 0)} more
        </button>
      )}
      {expanded && (group.hidden ?? 0) > 0 && (
        <p className="px-2 text-[11px] text-ink-soft">+{group.hidden} more not shown here</p>
      )}
    </section>
  )
}

// ─── Minimap — pure-SVG radial map of the concept's neighbourhood ─────────────

function truncLabel(s: string, max = 11): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function Minimap({ data, onOpen }: { data: GraphHub['minimap']; onOpen: (id: string, name?: string) => void }) {
  const [focused, setFocused] = useState<string | null>(null)
  const nodes = data.nodes.slice(0, 12)
  const W = 520
  const H = 260
  const cx = W / 2
  const cy = H / 2
  const R = Math.min(H / 2 - 34, 96)

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full" role="group" aria-label={`Neighbourhood map of ${data.center.name}`}>
        {/* spokes */}
        {nodes.map((n) => {
          const i = nodes.indexOf(n)
          const angle = (-90 + (360 / Math.max(nodes.length, 1)) * i) * (Math.PI / 180)
          const x = cx + R * Math.cos(angle)
          const y = cy + R * Math.sin(angle)
          return <line key={`l-${n.id}`} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1.5" />
        })}

        {/* center node */}
        <g>
          <circle cx={cx} cy={cy} r="27" fill="color-mix(in oklab, var(--primary) 12%, transparent)" stroke="var(--primary)" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="31" fill="none" stroke={statusColor(data.center.status)} strokeWidth="2" strokeOpacity="0.55" />
          <text x={cx} y={cy - 3} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--foreground)">
            {truncLabel(data.center.name, 14)}
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="var(--muted-foreground)">
            {Math.round(data.center.mastery)}% mastery
          </text>
        </g>

        {/* orbit nodes */}
        {nodes.map((n, i) => {
          const angle = (-90 + (360 / nodes.length) * i) * (Math.PI / 180)
          const x = cx + R * Math.cos(angle)
          const y = cy + R * Math.sin(angle)
          const color = GROUP_COLORS[n.group] ?? 'var(--muted-foreground)'
          const dim = focused != null && focused !== n.id
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${n.name}`}
              className="cursor-pointer focus:outline-none"
              onClick={() => onOpen(n.id, n.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(n.id, n.name)
                }
              }}
              onFocus={() => setFocused(n.id)}
              onBlur={() => setFocused((f) => (f === n.id ? null : f))}
              opacity={dim ? 0.45 : 1}
            >
              <title>{`${n.name} · ${GRAPH_GROUP_META[n.group]?.label ?? n.group}`}</title>
              {focused === n.id && <circle cx={x} cy={y} r="21" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />}
              <circle cx={x} cy={y} r="17" fill="none" stroke={n.subjectColor} strokeWidth="2" strokeOpacity="0.5" />
              <circle cx={x} cy={y} r="13" fill={`color-mix(in oklab, ${color} 16%, transparent)`} stroke={color} strokeWidth="1.5" />
              <circle cx={x + 8} cy={y + 8} r="3.5" fill={masteryColor(n.mastery)} stroke="var(--background)" strokeWidth="1" />
              <text x={x} y={y + 30} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--foreground)" opacity={dim ? 0.5 : 0.9}>
                {truncLabel(n.name)}
              </text>
            </g>
          )
        })}
      </svg>
      {nodes.length === 0 && (
        <p className="absolute inset-0 grid place-items-center text-sm text-ink-soft">
          No connections seeded for this concept yet.
        </p>
      )}
    </div>
  )
}

// ─── AI panel (hub: "Why does this happen?") ──────────────────────────────────

const AI_FALLBACK_DISCLAIMER = 'AI-generated study aid — always verify against standard references.'

export function AiTextCard({ res, title }: { res: GraphAiResponse; title: string }) {
  return (
    <div className="rounded-xl border border-line bg-background/60 p-3.5">
      <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
        <Sparkles className="size-3" aria-hidden /> {title}
        <span className="rounded-full bg-sev-warn/15 px-2 py-0.5 text-sev-warn">AI-generated</span>
      </p>
      <p className="whitespace-pre-line text-sm leading-relaxed">{res.text || 'The AI did not return anything — try again in a moment.'}</p>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{res.disclaimer || AI_FALLBACK_DISCLAIMER}</p>
    </div>
  )
}

export function WhyPathPanel({ conceptId, triggerLabel }: { conceptId: string; triggerLabel: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [res, setRes] = useState<GraphAiResponse | null>(null)

  const run = async () => {
    if (loading) return
    setLoading(true)
    setError(false)
    try {
      const r = await api.graphAi({ action: 'why-path', conceptId })
      setRes(r)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2.5">
      {!res && (
        <Button variant="outline" className="min-h-11 w-full border-dashed" onClick={() => void run()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4 text-primary" aria-hidden />}
          {triggerLabel}
        </Button>
      )}
      {error && (
        <p className="flex items-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> AI unavailable right now — try again in a moment.
          <button type="button" onClick={() => void run()} className="ml-auto font-bold underline underline-offset-2">retry</button>
        </p>
      )}
      <AnimatePresence initial={false}>
        {res && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <AiTextCard res={res} title="AI explanation" />
          </motion.div>
        )}
      </AnimatePresence>
      {!res && !loading && !error && (
        <p className="text-[11px] leading-snug text-ink-soft">
          Grounded in this concept&apos;s own graph links — never a substitute for your textbooks.
        </p>
      )}
    </div>
  )
}

// ─── "Explain this link" dialog (confusable pairs) ────────────────────────────

export function ExplainLinkDialog({
  target, onClose,
}: {
  target: { conceptId: string; neighbor: GraphNeighbor } | null
  onClose: () => void
}) {
  // Remounted by the parent whenever the target changes (key prop), so the
  // fetch state starts fresh: loading until the AI call resolves.
  const [loading, setLoading] = useState(!!target)
  const [error, setError] = useState(false)
  const [res, setRes] = useState<GraphAiResponse | null>(null)
  const other = target?.neighbor

  useEffect(() => {
    if (!target) return
    let cancelled = false
    api.graphAi({
      action: 'explain-relationship',
      conceptId: target.conceptId,
      otherId: target.neighbor.id,
      edgeType: target.neighbor.edgeType,
    })
      .then((r) => { if (!cancelled) setRes(r) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [target])

  return (
    <Dialog open={target != null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" aria-describedby="graph-explain-desc">
        <DialogHeader>
          <DialogTitle className="text-base">
            {other ? `Why ${other.edgeLabel.toLowerCase()} — ${other.name}?` : 'Explain this link'}
          </DialogTitle>
          <DialogDescription id="graph-explain-desc" className="sr-only">
            AI explanation of this relationship, grounded in the knowledge graph.
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="space-y-2 rounded-xl border border-line bg-background/60 p-3.5" aria-busy="true" role="status">
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
          </div>
        )}
        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> AI unavailable right now — try again in a moment.
          </p>
        )}
        {res && <AiTextCard res={res} title="AI explanation" />}
        <p className="flex items-center gap-1.5 text-[10px] leading-snug text-muted-foreground">
          <CheckCircle2 className="size-3 shrink-0 text-sev-ok" aria-hidden />
          Never authoritative — verify against standard references.
        </p>
      </DialogContent>
    </Dialog>
  )
}
