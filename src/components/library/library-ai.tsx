'use client'

// ─── RESOURCE HUB · AI ASSISTANT (PRODUCT 14) ────────────────────────────────
// A compact, collapsible assistant over OUR catalog metadata only: key
// learning points, compare-with-a-sibling, and recommend-for-me. The frozen
// LibraryAiResponse carries a badge + disclaimer; the answer is displayed
// as-is (the API enforces the ≤150-word, no-chain-of-thought rule — the UI
// never renders reasoning, only conclusions).

import { useState } from 'react'
import { ChevronDown, Loader2, Sparkles } from 'lucide-react'
import type { LibraryAiResponse, LibraryResource } from '@/lib/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pop } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'

type Action = 'key-points' | 'compare' | 'recommend'

interface AiState {
  key: string // resource.id the answer belongs to
  result: LibraryAiResponse | null
  error: string | null
}

export function LibraryAiPanel({ resource, related }: { resource: LibraryResource; related: LibraryResource[] }) {
  const [open, setOpen] = useState(false)
  const [compareId, setCompareId] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [aiState, setAiState] = useState<AiState>({ key: resource.id, result: null, error: null })

  // Derived staleness: switching to a related resource instantly clears the
  // previous answer without any setState-in-effect.
  const stale = aiState.key !== resource.id
  const result = stale ? null : aiState.result
  const error = stale ? null : aiState.error
  const compareIdValid = related.some((r) => r.id === compareId)

  const run = async (action: Action, otherId?: string, goalText?: string) => {
    setBusy(action)
    try {
      // Contract body: {mode, resourceIds, query} — recommend ignores
      // resourceIds server-side (it scores the catalog from live signals).
      const res = await api.libraryAi({
        mode: action,
        resourceIds: otherId ? [resource.id, otherId] : action === 'recommend' ? [] : [resource.id],
        query: goalText?.trim() || undefined,
      })
      // Drop the answer if the panel moved to another resource meanwhile.
      setAiState((d) => (d.key === resource.id || d.key === '' ? { key: resource.id, result: res, error: null } : d))
    } catch {
      setAiState((d) => (d.key === resource.id || d.key === ''
        ? { key: resource.id, result: null, error: 'The assistant did not respond. You can still open the resource and study it directly.' }
        : d))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="clay rounded-2xl p-4">
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2.5 text-left outline-none ring-primary/50 focus-visible:ring-2">
          <span className="clay-in grid size-8 shrink-0 place-items-center rounded-xl" aria-hidden>
            <Sparkles className="size-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">AI study assistant</span>
            <span className="block text-[11px] text-ink-soft">
              Grounded in our own catalog metadata — conclusions only, never a chain of thought.
            </span>
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            {/* key learning points + compare */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="clay-btn-soft min-h-11"
                onClick={() => run('key-points')}
                disabled={busy !== null}
              >
                {busy === 'key-points' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Key learning points
              </Button>

              {related.length > 0 ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Select value={compareIdValid ? compareId : ''} onValueChange={setCompareId}>
                    <SelectTrigger aria-label="Pick a resource to compare with" className="clay-field h-11 min-w-0 max-w-full flex-1 sm:max-w-56">
                      <SelectValue placeholder="Compare with…" />
                    </SelectTrigger>
                    <SelectContent>
                      {related.map((r) => (
                        <SelectItem key={r.id} value={r.id} className="max-w-full">
                          <span className="block max-w-64 truncate">{r.title}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="clay-btn-soft min-h-11"
                    onClick={() => run('compare', compareId)}
                    disabled={busy !== null || !compareIdValid}
                  >
                    {busy === 'compare' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Compare
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-ink-soft">No sibling resources to compare with yet.</p>
              )}
            </div>

            {/* recommend for me (optional free-text goal) */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Your goal (optional) — e.g. revise NEET-PG cardiology"
                aria-label="Goal for the recommendation"
                className="clay-field h-11 min-w-0 flex-1"
                maxLength={120}
              />
              <Button
                variant="outline"
                className="clay-btn-soft min-h-11 shrink-0"
                onClick={() => run('recommend', undefined, goal)}
                disabled={busy !== null}
              >
                {busy === 'recommend' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Recommend for me
              </Button>
            </div>

            {/* result / fallback / error */}
            {busy !== null && !result && (
              <p className="flex items-center gap-2 text-xs text-ink-soft" role="status" aria-busy="true">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Thinking over the catalog…
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-sev-warn/35 bg-sev-warn/10 px-3.5 py-3 text-xs leading-relaxed text-sev-warn" role="alert">
                {error}
              </p>
            )}
            {result && (
              <div className="space-y-2.5" role="status">
                <p className="flex flex-wrap items-center gap-2">
                  <Pop className="inline-flex">
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      <Sparkles className="size-3" aria-hidden /> {result.aiBadge}
                    </span>
                  </Pop>
                  {result.fallback && (
                    <span className="text-[10px] font-medium text-ink-soft">
                      Answered from the catalog&apos;s own metadata (assistant offline)
                    </span>
                  )}
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed">{result.answer}</p>
                <p className="text-[11px] leading-relaxed text-ink-soft">{result.disclaimer}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
