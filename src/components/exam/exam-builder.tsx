'use client'

// ─── EXAM LAB · CUSTOM TEST BUILDER (PRODUCT 12) ───
// Subjects, topics, difficulty, source biases, count, minutes and negative
// marking — everything the engine accepts in ExamConfig, clamped client-side
// too. Live summary, honest labelling, no invented numbers.

import { useMemo, useState } from 'react'
import { ArrowLeft, Play, X } from 'lucide-react'

import type { ExamConfig, ExamHome } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Reveal, SectionTitle } from './exam-shared'

interface Props {
  home: ExamHome
  seed?: { subjectCodes?: string[]; topicIds?: string[]; conceptId?: string } | null
  onStart: (config: ExamConfig) => void
  onBack: () => void
}

type SourceKey = 'pyq' | 'image' | 'clinical' | 'rapid'

const SOURCE_META: { key: SourceKey; label: string; blurb: string }[] = [
  { key: 'pyq', label: 'PYQ-pattern', blurb: 'Classic repeated exam themes' },
  { key: 'image', label: 'Image-based', blurb: 'X-rays, ECGs, visual stems' },
  { key: 'clinical', label: 'Clinical vignettes', blurb: 'Case-style application stems' },
  { key: 'rapid', label: 'Rapid-fire', blurb: 'Short stems, quick recall' },
]

const COUNT_PRESETS = [10, 20, 30, 50]
const MINUTE_PRESETS = [10, 20, 30, 60]

const clampCount = (n: number) => Math.max(5, Math.min(100, Math.round(n) || 5))
const clampMinutes = (n: number) => Math.max(3, Math.min(240, Math.round(n) || 3))

export function ExamBuilder({ home, seed, onStart, onBack }: Props) {
  const [subjects, setSubjects] = useState<Set<string>>(() => new Set(seed?.subjectCodes ?? []))
  const [topics, setTopics] = useState<Set<string>>(() => new Set(seed?.topicIds ?? []))
  const [difficulty, setDifficulty] = useState<number | null>(null) // null = Any
  const [sources, setSources] = useState<Set<SourceKey>>(() => new Set())
  const [count, setCount] = useState(20)
  const [minutes, setMinutes] = useState(20)
  const [negativeMark, setNegativeMark] = useState(true)

  // Topics grouped by their subject prefix — the payload already carries
  // subjectCode per topic, so the grouping is measured, not guessed.
  const topicsBySubject = useMemo(() => {
    const groups = new Map<string, ExamHome['facets']['topics']>()
    for (const t of home.facets.topics) {
      const arr = groups.get(t.subjectCode) ?? []
      arr.push(t)
      groups.set(t.subjectCode, arr)
    }
    return [...groups.entries()]
  }, [home.facets.topics])

  const subjectName = (code: string) => home.facets.subjects.find((s) => s.code === code)?.name ?? code

  const toggle = <T,>(set: Set<T>, v: T, apply: (next: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    apply(next)
  }

  const start = () => {
    onStart({
      mode: 'custom',
      count: clampCount(count),
      minutes: clampMinutes(minutes),
      subjectCodes: subjects.size ? [...subjects] : undefined,
      topicIds: topics.size ? [...topics] : undefined,
      difficulty,
      sources: sources.size ? [...sources] : undefined,
      negativeMark,
      conceptId: seed?.conceptId,
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <Reveal index={0} className="min-w-0 space-y-3">
        <Button variant="ghost" size="sm" className="min-h-9 gap-1 text-xs text-ink-soft" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden /> Back to Exam Lab
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Build a Custom Test</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Exactly the filters you set — nothing else. Leave everything empty to draw from the whole bank.
        </p>
      </Reveal>

      {/* ── Subjects ── */}
      <Reveal index={1} className="space-y-2.5">
        <SectionTitle>Subjects {subjects.size > 0 && <span className="normal-case tracking-normal">· {subjects.size} selected</span>}</SectionTitle>
        <div className="clay flex max-h-60 flex-wrap gap-2 overflow-y-auto rounded-2xl p-4 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line">
          {home.facets.subjects.map((s) => {
            const active = subjects.has(s.code)
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => toggle(subjects, s.code, setSubjects)}
                aria-pressed={active}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                    : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
                )}
              >
                {s.name} · {s.count}
              </button>
            )
          })}
          {home.facets.subjects.length === 0 && <p className="text-xs text-ink-soft">No subjects available yet.</p>}
        </div>
      </Reveal>

      {/* ── Topics ── */}
      {home.facets.topics.length > 0 && (
        <Reveal index={2} className="space-y-2.5">
          <SectionTitle>Topics {topics.size > 0 && <span className="normal-case tracking-normal">· {topics.size} selected</span>}</SectionTitle>
          <div className="clay max-h-72 space-y-4 overflow-y-auto rounded-2xl p-4 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line">
            {topicsBySubject.map(([code, list]) => (
              <div key={code} className="min-w-0 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">{subjectName(code)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((t) => {
                    const active = topics.has(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(topics, t.id, setTopics)}
                        aria-pressed={active}
                        className={cn(
                          'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary/40 bg-primary/12 text-primary'
                            : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
                        )}
                      >
                        {t.name}
                        <span className="text-[10px] tabular-nums opacity-70">{t.count}</span>
                        {active && <X className="size-3" aria-hidden />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* ── Difficulty ── */}
      <Reveal index={3} className="space-y-2.5">
        <SectionTitle>Difficulty</SectionTitle>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Difficulty">
          {([null, 1, 2, 3] as const).map((d) => {
            const active = difficulty === d
            return (
              <button
                key={d ?? 'any'}
                type="button"
                onClick={() => setDifficulty(d)}
                aria-pressed={active}
                className={cn(
                  'min-h-11 rounded-full border px-5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                    : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
                )}
              >
                {d == null ? 'Any' : ['Easy', 'Moderate', 'Hard'][d - 1]}
              </button>
            )
          })}
        </div>
      </Reveal>

      {/* ── Sources ── */}
      <Reveal index={4} className="space-y-2.5">
        <SectionTitle>Source bias</SectionTitle>
        <div className="clay grid grid-cols-1 gap-2 rounded-2xl p-3 sm:grid-cols-2">
          {SOURCE_META.map((src) => {
            const active = sources.has(src.key)
            return (
              <button
                key={src.key}
                type="button"
                onClick={() => toggle(sources, src.key, setSources)}
                aria-pressed={active}
                className={cn(
                  'flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary/40 bg-primary/10' : 'border-line bg-surface-2/40 hover:border-primary/40',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{src.label}</span>
                  <span className="block truncate text-[11px] text-ink-soft">{src.blurb}</span>
                </span>
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-md border text-[10px] font-bold',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'border-line text-transparent',
                  )}
                  aria-hidden
                >
                  ✓
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-ink-soft">Biases tilt the paper toward these sources — they don&apos;t guarantee counts.</p>
      </Reveal>

      {/* ── Count ── */}
      <Reveal index={5} className="space-y-3">
        <SectionTitle>Questions</SectionTitle>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Question count presets">
          {COUNT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCount(c)}
              aria-pressed={clampCount(count) === c}
              className={cn(
                'min-h-11 rounded-full border px-5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                clampCount(count) === c
                  ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                  : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="clay rounded-2xl p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <Label htmlFor="exam-count" className="text-xs text-ink-soft">Custom count</Label>
            <span className="text-sm font-bold tabular-nums">{clampCount(count)} Q</span>
          </div>
          <Slider
            id="exam-count"
            min={5}
            max={100}
            step={1}
            value={[clampCount(count)]}
            onValueChange={(vals) => setCount(Array.isArray(vals) ? vals[0] : vals)}
            aria-label="Number of questions"
          />
        </div>
      </Reveal>

      {/* ── Minutes ── */}
      <Reveal index={6} className="space-y-3">
        <SectionTitle>Time budget</SectionTitle>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Minutes presets">
          {MINUTE_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              aria-pressed={clampMinutes(minutes) === m}
              className={cn(
                'min-h-11 rounded-full border px-5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                clampMinutes(minutes) === m
                  ? 'clay-in border-primary/40 bg-primary/12 text-primary'
                  : 'border-line bg-surface-2/50 text-ink-soft hover:border-primary/40',
              )}
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="clay flex items-center gap-3 rounded-2xl p-4">
          <Label htmlFor="exam-minutes" className="shrink-0 text-xs text-ink-soft">Custom (3–240)</Label>
          <Input
            id="exam-minutes"
            type="number"
            inputMode="numeric"
            min={3}
            max={240}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value === '' ? 0 : Number(e.target.value))}
            onBlur={() => setMinutes(clampMinutes(minutes))}
            className="w-24"
          />
          <span className="text-xs text-ink-soft">minutes total</span>
        </div>
      </Reveal>

      {/* ── Negative marking ── */}
      <Reveal index={7} className="space-y-2.5">
        <SectionTitle>Marking scheme</SectionTitle>
        <div className="clay flex items-center justify-between gap-4 rounded-2xl p-4">
          <div className="min-w-0">
            <Label htmlFor="exam-neg" className="text-sm font-semibold">Negative marking</Label>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
              {negativeMark
                ? 'Real exam rules: +4 for a correct answer, −1 for a wrong one, 0 for every question you skip.'
                : 'Practice mode: +4 for correct, 0 for wrong or skipped — no penalty while you rebuild.'}
            </p>
          </div>
          <Switch id="exam-neg" checked={negativeMark} onCheckedChange={setNegativeMark} aria-label="Toggle negative marking" />
        </div>
      </Reveal>

      {/* ── Live summary + start ── */}
      <Reveal index={8} className="space-y-3">
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs font-medium leading-relaxed" role="status">
          {clampCount(count)} questions · {clampMinutes(minutes)} minutes
          {subjects.size > 0 ? ` · ${subjects.size} ${subjects.size === 1 ? 'subject' : 'subjects'}` : ' · all subjects'}
          {topics.size > 0 ? ` · ${topics.size} ${topics.size === 1 ? 'topic' : 'topics'}` : ''}
          {difficulty != null ? ` · ${['easy', 'moderate', 'hard'][difficulty - 1]} only` : ''}
          {sources.size > 0 ? ` · ${[...sources].join('/')}-biased` : ''}
          {' · '}
          {negativeMark ? 'scored +4 / −1' : 'no penalty'}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="clay-btn min-h-12 flex-1 text-sm sm:flex-none" onClick={start}>
            <Play className="size-4" aria-hidden /> Start Test
          </Button>
          <Button variant="outline" className="min-h-12" onClick={onBack}>
            Back
          </Button>
        </div>
      </Reveal>
    </div>
  )
}
