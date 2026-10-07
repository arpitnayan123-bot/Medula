'use client'

// ─── PERSONAL MEDICAL BRAIN · PRIVACY (PRODUCT 18) ───────────────────────────
// The trust tab. Private by default (no sharing surface exists), a transparent
// list of what is stored, personalization switches with honest captions and
// optimistic saves, "what the AI tutor sees" rendered verbatim, a full "view my
// brain data" export, and a scoped reset that always says exactly what is and
// is NOT deleted (the raw activity ledger stays).

import { useState } from 'react'
import { Brain, ChevronDown, Database, Download, Eye, RotateCcw, ShieldCheck } from 'lucide-react'
import type { BrainPrivacySettingsView, BrainResetResult } from '@/lib/types'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  BrainErrorState, EmptyNote, FootNote, SectionCard, SkeletonRow, useBrainPayload,
} from './brain-shared'

export function BrainPrivacy({ refreshHome }: { refreshHome: () => void }) {
  const hook = useBrainPayload(() => api.brainPrivacyGet())
  const data = hook.data

  return (
    <div className="space-y-4">
      <SectionCard
        title="Privacy & control"
        icon={ShieldCheck}
        subtitle="Your brain belongs to you. Everything below is control you actually have."
      >
        {hook.state === 'loading' && <SkeletonRow rows={4} />}
        {hook.state === 'error' && (
          <BrainErrorState
            title="Privacy settings didn't load"
            hint="The brain engine did not respond — it may still be warming up. Nothing is lost; retry below."
            onRetry={hook.reload}
          />
        )}
        {data && (
          <div className="space-y-4">
            {/* private-by-default banner — verbatim from the engine */}
            <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4" role="note">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12" aria-hidden>
                <ShieldCheck className="size-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight">Private by default</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{data.privateByDefault}</p>
              </div>
            </div>

            {/* what is stored — the measured ledger, in plain sight */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-tight">
                <Database className="size-3.5 shrink-0 text-primary" aria-hidden />
                What is stored about you
              </p>
              <ul className="space-y-1.5" aria-label="Stored data sections">
                {data.storedData.map((s) => (
                  <li key={s.section} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{s.section}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{s.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-ink-soft">
                      {s.count.toLocaleString('en-IN')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-soft">Snapshot taken {new Date(data.generatedAt).toLocaleString('en-IN')}.</p>
            </div>

            <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{data.note}</p>
          </div>
        )}
      </SectionCard>

      {data && (
        <>
          <PersonalizationCard settings={data.settings} onSaved={() => hook.reload()} />
          <TutorSeesCard tutorContextOn={data.settings.tutorContextOn} />
          <ExportCard />
          <ResetCard onReset={() => { hook.reload(); refreshHome() }} />
        </>
      )}

      {/* why recommendations look this way — pointer to the published rules */}
      {data && data.howItWorks.length > 0 && (
        <SectionCard title="Why recommendations look this way" icon={Brain} subtitle="The derivation rules are published — no hidden scoring, no black box.">
          <ol className="space-y-2">
            {data.howItWorks.map((rule, i) => (
              <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-ink-soft">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary" aria-hidden>
                  {i + 1}
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  )
}

// ── personalization switches — optimistic save, honest captions ──────────────

const SWITCH_META: { key: keyof BrainPrivacySettingsView; label: string; caption: string }[] = [
  {
    key: 'personalizationOn',
    label: 'Personalization (master)',
    caption: 'Master switch — when off, every surface falls back to its non-personalized behavior and nothing adapts to you.',
  },
  {
    key: 'tutorContextOn',
    label: 'AI Tutor context',
    caption: 'The tutor receives your weak concepts, error patterns and due revision as teaching context — and is told not to re-teach what you have mastered.',
  },
  {
    key: 'questionPersonalizationOn',
    label: 'Question personalization',
    caption: 'Question selection adapts to your measured knowledge states and mistakes instead of uniform sampling.',
  },
  {
    key: 'revisionPersonalizationOn',
    label: 'Revision personalization',
    caption: 'Smart Revision orders its queue by your measured recall risks instead of a fixed schedule.',
  },
  {
    key: 'contentPersonalizationOn',
    label: 'Content personalization',
    caption: 'Resource and content recommendations follow your measured gaps instead of generic popularity.',
  },
  {
    key: 'historySnapshotsOn',
    label: 'Daily timeline snapshots',
    caption: 'Keeps one derived snapshot per day so the brain can show progress over time. Turning it off stops new snapshots.',
  },
]

function PersonalizationCard({ settings, onSaved }: { settings: BrainPrivacySettingsView; onSaved: () => void }) {
  // optimistic local copy — reverted on a failed save; seeded at mount (this
  // card renders only once the privacy payload exists)
  const [local, setLocal] = useState<BrainPrivacySettingsView>(settings)
  const [saving, setSaving] = useState<string | null>(null)

  const toggle = async (key: keyof BrainPrivacySettingsView, next: boolean) => {
    const prev = local[key]
    setLocal((s) => ({ ...s, [key]: next }))
    setSaving(key)
    try {
      await api.brainPrivacySet({ [key]: next })
      const meta = SWITCH_META.find((m) => m.key === key)
      toast({ title: meta ? `${meta.label} ${next ? 'on' : 'off'}` : 'Setting saved', description: next ? 'Personalization is active for this surface.' : 'This surface falls back to non-personalized behavior.' })
      onSaved()
    } catch {
      setLocal((s) => ({ ...s, [key]: prev }))
      toast({ title: 'Could not save the setting', description: 'The engine did not respond — your choice was not applied. Try again.', variant: 'destructive' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <SectionCard title="Personalization switches" icon={Eye} subtitle="Every switch is respected immediately. Off means that surface uses its plain, non-personalized behavior.">
      <ul className="space-y-3">
        {SWITCH_META.map((m) => (
          <li key={m.key} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold">{m.label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{m.caption}</p>
            </div>
            <Switch
              checked={local[m.key]}
              onCheckedChange={(v) => toggle(m.key, v)}
              disabled={saving === m.key}
              aria-label={m.label}
              className="mt-0.5 shrink-0 scale-125"
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

// ── what the AI tutor sees — the exact context pack, verbatim ────────────────

function TutorSeesCard({ tutorContextOn }: { tutorContextOn: boolean }) {
  const [open, setOpen] = useState(false)
  const pack = useBrainPayload(() => api.brainTutorContext(), open ? 'open' : 'closed')

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="clay overflow-hidden rounded-2xl">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none ring-primary/50 focus-visible:ring-2 md:px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Eye className="size-4 shrink-0 text-primary" aria-hidden />
            What the AI tutor sees
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-line px-4 py-4 md:px-6">
            {!tutorContextOn ? (
              <EmptyNote>
                Tutor context is switched off — the tutor currently works without your personal profile. Turn it on above
                and it will teach from your measured weak areas.
              </EmptyNote>
            ) : pack.state === 'loading' ? (
              <SkeletonRow rows={4} />
            ) : pack.state === 'error' ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-ink-soft">The context pack didn&apos;t load — nothing is lost.</p>
                <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={pack.reload}>Retry</Button>
              </div>
            ) : pack.data && (
              <div className="space-y-3">
                {pack.data.blocks.map((b) => (
                  <div key={b.title} className="rounded-xl border border-line bg-surface-2/40 p-3">
                    <p className="text-xs font-semibold">{b.title}</p>
                    <ul className="mt-1.5 space-y-1">
                      {b.lines.map((line, i) => (
                        <li key={i} className="text-[11px] leading-relaxed text-ink-soft">{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {pack.data.masteredNotToRepeat.length > 0 && (
                  <div className="rounded-xl border border-sev-ok/30 bg-sev-ok/[0.06] p-3">
                    <p className="text-xs font-semibold">Told NOT to re-teach (mastered)</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{pack.data.masteredNotToRepeat.join(' · ')}</p>
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-ink-soft" role="note">{pack.data.note}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

// ── view my brain data — the full export, in plain sight ─────────────────────

function ExportCard() {
  const [open, setOpen] = useState(false)
  const hook = useBrainPayload(() => api.brainExport(), open ? 'open' : 'closed')

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="clay overflow-hidden rounded-2xl">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none ring-primary/50 focus-visible:ring-2 md:px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Download className="size-4 shrink-0 text-primary" aria-hidden />
            View my brain data
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-line px-4 py-4 md:px-6">
            {hook.state === 'loading' && <SkeletonRow rows={5} />}
            {hook.state === 'error' && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-ink-soft">The export didn&apos;t load — nothing is lost.</p>
                <Button variant="outline" size="sm" className="min-h-9 shrink-0 rounded-full px-3 text-xs" onClick={hook.reload}>Retry</Button>
              </div>
            )}
            {hook.data && (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-ink-soft">{hook.data.profileLine}</p>
                <div className="max-h-96 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
                  {hook.data.sections.map((s) => (
                    <div key={s.title} className="rounded-xl border border-line bg-surface-2/40 p-3">
                      <p className="text-xs font-semibold">{s.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{s.description}</p>
                      <dl className="mt-2 space-y-1">
                        {s.rows.map((r, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-3 border-b border-line pb-1 last:border-b-0 last:pb-0">
                            <dt className="min-w-0 text-[11px] text-ink-soft">{r.label}</dt>
                            <dd className="shrink-0 text-[11px] font-semibold tabular-nums">{r.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
                <FootNote>
                  Generated {new Date(hook.data.generatedAt).toLocaleString('en-IN')}. {hook.data.note}
                </FootNote>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

// ── reset learning data — scoped, explicit, honest ───────────────────────────

const RESET_SCOPES: { id: string; label: string; deletes: string; keeps: string }[] = [
  {
    id: 'knowledge-states',
    label: 'Knowledge states',
    deletes: 'The brain\'s derived knowledge states — concept states, scores and recall estimates rebuild from your activity as you continue.',
    keeps: 'Your attempts, sessions and mistakes stay untouched.',
  },
  {
    id: 'repeated-mistakes',
    label: 'Repeated mistakes',
    deletes: 'Your mistake records and their resolution status.',
    keeps: 'Question attempts themselves stay.',
  },
  {
    id: 'revision-queue',
    label: 'Revision queue & history',
    deletes: 'Everything queued for revision and your completed revision session history.',
    keeps: 'Your question accuracy and knowledge states stay.',
  },
  {
    id: 'flashcard-scheduling',
    label: 'Flashcard scheduling',
    deletes: 'Flashcard review history and due schedules — cards restart fresh.',
    keeps: 'The flashcards themselves stay.',
  },
  {
    id: 'brain-timeline',
    label: 'Brain timeline snapshots',
    deletes: 'The daily brain snapshots used for progress-over-time views.',
    keeps: 'All underlying activity stays.',
  },
  {
    id: 'all-personalization',
    label: 'All derived personalization',
    deletes: 'Every derived layer at once — knowledge states, mistake intel, revision queue, flashcard scheduling and timeline snapshots.',
    keeps: 'Your raw activity ledger — attempts, study sessions, mocks, XP — always stays.',
  },
]

function ResetCard({ onReset }: { onReset: () => void }) {
  const [scope, setScope] = useState<string>(RESET_SCOPES[0].id)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BrainResetResult | null>(null)
  const selected = RESET_SCOPES.find((s) => s.id === scope) ?? RESET_SCOPES[0]

  const runReset = async () => {
    setBusy(true)
    try {
      const res = await api.brainReset(scope)
      setResult(res)
      setConfirmOpen(false)
      toast({
        title: 'Learning data reset',
        description: res.note || `Cleared ${res.cleared.reduce((n, c) => n + c.count, 0)} derived rows in the "${selected.label}" scope.`,
      })
      onReset()
    } catch {
      toast({ title: 'Reset did not complete', description: 'The engine did not respond — nothing was deleted. Try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard title="Reset learning data" icon={RotateCcw} subtitle="A scoped, deliberate reset — the raw activity ledger is never touched.">
      <div className="space-y-3">
        <Select value={scope} onValueChange={(v) => { setScope(v); setResult(null) }}>
          <SelectTrigger className="min-h-11 w-full" aria-label="Reset scope">
            <SelectValue placeholder="Choose what to reset" />
          </SelectTrigger>
          <SelectContent>
            {RESET_SCOPES.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="rounded-xl border border-line bg-surface-2/40 p-3">
          <p className="text-[11px] leading-relaxed text-ink-soft"><span className="font-semibold text-foreground">Deletes: </span>{selected.deletes}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft"><span className="font-semibold text-foreground">Never deleted: </span>{selected.keeps}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="destructive" className="min-h-11 rounded-xl text-xs" onClick={() => setConfirmOpen(true)}>
            Reset — {selected.label}
          </Button>
        </div>

        {result && (
          <div className="rounded-xl border border-line bg-surface-2/40 p-3" role="status">
            <p className="text-xs font-semibold">Cleared — {result.scope.replace(/-/g, ' ')}</p>
            <ul className="mt-1.5 space-y-0.5" aria-label="Cleared tables">
              {result.cleared.map((c) => (
                <li key={c.table} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="capitalize text-ink-soft">{c.table.replace(/[-_]/g, ' ')}</span>
                  <span className="font-semibold tabular-nums">{c.count}</span>
                </li>
              ))}
              {result.cleared.length === 0 && <li className="text-[11px] text-ink-soft">Nothing needed clearing in this scope.</li>}
            </ul>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{result.note}</p>
          </div>
        )}
      </div>

      {/* confirm dialog — explicit about what is and is NOT deleted */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset {selected.label.toLowerCase()}?</DialogTitle>
            <DialogDescription className="text-left leading-relaxed">
              {selected.deletes} This cannot be undone.
            </DialogDescription>
            <DialogDescription className="text-left leading-relaxed">
              <span className="font-medium text-foreground">Not deleted: </span>{selected.keeps}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="min-h-11 rounded-xl text-xs" onClick={() => setConfirmOpen(false)}>
              Keep my data
            </Button>
            <Button variant="destructive" className="min-h-11 rounded-xl text-xs" onClick={runReset} disabled={busy}>
              {busy ? 'Resetting…' : 'Reset now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
