'use client'

// ─── EXAM LAB · HOME DASHBOARD (PRODUCT 12) ───
// Everything measured from ExamAttempt rows by the deterministic engine:
// hero + one-tap full-length CTA, resume banner, stats, the 9 test modes with
// honest built-from lines, recommendation, weak areas, recent tests and the
// bank honesty strip.

import { useMemo } from 'react'
import {
  Award, BookOpenCheck, ClipboardList, Flame, Image as ImageIcon, Landmark, Library, ListChecks,
  Play, RotateCcw, Target, Timer, TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { ExamConfig, ExamHome, ExamMode, ExamModeInfo } from '@/lib/types'
import { EXAM_MODES } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Reveal, SectionTitle, StatTile, accuracyText, asPct, formatClock, modeBadge, relTime,
} from './exam-shared'

interface Props {
  home: ExamHome
  onStart: (config: ExamConfig) => void
  onResume: (attemptId: string) => void
  onOpenHistory: () => void
  onOpenAnalysis: (attemptId: string) => void
  onOpenBuilder: () => void
}

// ─── Mode icons (fixed registry, mirrors EXAM_MODES ordering) ─────────────────

const MODE_ICON: Record<ExamMode, LucideIcon> = {
  full: ClipboardList,
  subject: Library,
  topic: BookOpenCheck,
  pyq: Landmark,
  custom: ListChecks,
  weak: Target,
  adaptive: TrendingUp,
  image: ImageIcon,
  rapid: Flame,
}

// ─── Mode card ────────────────────────────────────────────────────────────────

function ModeCard({ info, index, onStart, onOpenBuilder }: { info: ExamModeInfo; index: number; onStart: (config: ExamConfig) => void; onOpenBuilder: () => void }) {
  const Icon = MODE_ICON[info.id] ?? ClipboardList
  const isCustom = info.id === 'custom'
  const negative = info.preset.negativeMark
  return (
    <Reveal index={Math.min(index, 10)} className="min-w-0">
      <div className="clay flex h-full min-w-0 flex-col gap-2.5 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', isCustom ? 'bg-primary/12 text-primary' : 'bg-surface-2 text-ink-soft')}>
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold leading-snug tracking-tight">{info.name}</h3>
            <p className="text-xs leading-snug text-ink-soft">{info.tagline}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
            {info.preset.count} Q
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
            <Timer className="size-3" aria-hidden /> {info.preset.minutes} min
          </span>
          <span className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            negative ? 'border-sev-warn/30 bg-sev-warn/10 text-sev-warn' : 'border-sev-ok/30 bg-sev-ok/10 text-sev-ok',
          )}>
            {negative ? '+4 / −1' : 'No penalty'}
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-ink-soft">{info.builtFrom}</p>

        <div className="mt-auto border-t border-line/70 pt-2.5">
          {isCustom ? (
            <Button variant="outline" size="sm" className="min-h-9 w-full gap-1 text-xs" onClick={onOpenBuilder}>
              <ListChecks className="size-3.5" aria-hidden /> Build it
            </Button>
          ) : (
            <Button
              size="sm"
              className={cn('min-h-9 w-full gap-1 text-xs', info.id === 'full' ? 'clay-btn' : 'clay-btn')}
              onClick={() => onStart({ mode: info.id, count: info.preset.count, minutes: info.preset.minutes, negativeMark: info.preset.negativeMark })}
            >
              <Play className="size-3.5" aria-hidden /> Start {info.name}
            </Button>
          )}
        </div>
      </div>
    </Reveal>
  )
}

// ─── Home screen ──────────────────────────────────────────────────────────────

export function ExamHomeScreen({ home, onStart, onResume, onOpenHistory, onOpenAnalysis, onOpenBuilder }: Props) {
  // Full-length preset comes from the payload modes — never hardcoded.
  const fullPreset = useMemo(() => {
    const info = home.modes.find((m) => m.id === 'full') ?? EXAM_MODES.find((m) => m.id === 'full')
    return info
      ? { count: info.preset.count, minutes: info.preset.minutes, negativeMark: info.preset.negativeMark }
      : { count: 50, minutes: 50, negativeMark: true }
  }, [home.modes])

  const stats = home.stats
  const resumeLeft = home.resume
    ? formatClock(Math.max(0, (new Date(home.resume.endsAt).getTime() - Date.now()) / 1000))
    : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      {/* ── Hero ── */}
      <Reveal index={0} className="min-w-0 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Product 12 · Mock tests & exam intelligence</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Exam Lab</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Simulate → Perform → Analyze → Fix → Retest. Real exam conditions, deterministic grading, and an honest
          post-mortem of every paper you sit.
        </p>
        <Button
          size="lg"
          className="clay-btn min-h-12 w-full text-sm sm:w-auto"
          onClick={() => onStart({ mode: 'full', count: fullPreset.count, minutes: fullPreset.minutes, negativeMark: fullPreset.negativeMark })}
        >
          <ClipboardList className="size-4" aria-hidden />
          Start Full-Length Mock ({fullPreset.count} Q · {fullPreset.minutes} min)
        </Button>
      </Reveal>

      {/* ── Resume banner ── */}
      {home.resume && (
        <Reveal index={1}>
          <button
            type="button"
            onClick={() => onResume(home.resume!.attemptId)}
            className="warm-card flex w-full min-w-0 items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Resume ${home.resume.label} — ${home.resume.answered} of ${home.resume.total} answered`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sev-warn/15 text-sev-warn">
              <RotateCcw className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-sev-warn">Test in progress</span>
              <span className="block truncate text-sm font-semibold">Resume {home.resume.label}</span>
              <span className="block text-xs text-ink-soft">
                {home.resume.answered}/{home.resume.total} answered
              </span>
            </span>
            {resumeLeft && (
              <span className="shrink-0 rounded-full bg-sev-warn/10 px-2.5 py-1 text-xs font-bold tabular-nums text-sev-warn" role="timer" aria-label="Time remaining">
                {resumeLeft}
              </span>
            )}
            <span className="hidden shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary sm:flex">
              Resume <Play className="size-3.5" aria-hidden />
            </span>
          </button>
        </Reveal>
      )}

      {/* ── Measured stats ── */}
      <Reveal index={2} className="flex flex-wrap gap-2.5">
        <StatTile icon={ClipboardList} value={String(stats.tests)} label="tests taken" accent />
        <StatTile icon={Target} value={stats.avgPercent != null ? `${Math.round(stats.avgPercent)}%` : '—'} label="average score" />
        <StatTile icon={Award} value={stats.bestPercent != null ? `${Math.round(stats.bestPercent)}%` : '—'} label="best score" />
        <StatTile icon={BookOpenCheck} value={accuracyText(stats.accuracy)} label="accuracy" />
        <StatTile icon={Timer} value={String(Math.round(stats.minutes))} label="minutes in exams" />
      </Reveal>

      {/* ── The 9 test modes ── */}
      <section aria-label="Test modes" className="space-y-3">
        <SectionTitle>The 9 test modes</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {home.modes.map((m, i) => (
            <ModeCard
              key={m.id}
              info={m}
              index={i + 3}
              onStart={onStart}
              onOpenBuilder={onOpenBuilder}
            />
          ))}
        </div>
      </section>

      {/* ── Recommended next test ── */}
      {home.recommended && (
        <Reveal index={4}>
          <section className="glass space-y-3 rounded-2xl border-primary/25 p-4 md:p-5" aria-label="Recommended next test">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Recommended next test</p>
              {modeBadge(home.recommended.mode)}
            </div>
            <p className="text-base font-semibold leading-snug tracking-tight">
              {home.modes.find((m) => m.id === home.recommended!.mode)?.name ?? 'Recommended test'}
            </p>
            <p className="text-sm leading-relaxed text-ink-soft">{home.recommended.reason}</p>
            <Button className="clay-btn min-h-11 w-full sm:w-auto" onClick={() => onStart(home.recommended!.config)}>
              <Play className="size-4" aria-hidden /> Start this test
            </Button>
          </section>
        </Reveal>
      )}

      {/* ── Weak subjects + weak concepts ── */}
      {(home.weakSubjects.length > 0 || home.weakConcepts.length > 0) && (
        <Reveal index={5} className="space-y-3">
          <SectionTitle className="text-sev-warn">Measured weak areas — fix them under exam conditions</SectionTitle>
          {home.weakSubjects.length > 0 && (
            <div className="glass flex flex-wrap gap-2 rounded-2xl p-4">
              {home.weakSubjects.map((s) => (
                <span
                  key={s.code}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-sev-warn/30 bg-sev-warn/10 py-1 pl-3 pr-1 text-xs font-semibold text-sev-warn"
                >
                  <span className="max-w-40 truncate">{s.name}</span>
                  <span className="tabular-nums">{accuracyText(s.accuracy)}</span>
                  <button
                    type="button"
                    onClick={() => onStart({ mode: 'subject', subjectCodes: [s.code] })}
                    className="min-h-9 rounded-full bg-sev-warn/15 px-3 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-sev-warn/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Start a subject test on ${s.name}`}
                  >
                    Test this
                  </button>
                </span>
              ))}
            </div>
          )}
          {home.weakConcepts.length > 0 && (
            <div className="glass flex flex-wrap gap-2 rounded-2xl p-4">
              {home.weakConcepts.map((c) => {
                const mastery = asPct(c.mastery)
                return (
                  <span
                    key={c.conceptId}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1 pl-3 pr-1 text-xs font-semibold"
                  >
                    <span className="max-w-40 truncate">{c.conceptName}</span>
                    <span className="tabular-nums text-ink-soft">{mastery != null ? `${mastery}%` : '—'}</span>
                    <button
                      type="button"
                      onClick={() => onStart({ mode: 'weak', conceptId: c.conceptId })}
                      className="min-h-9 rounded-full bg-primary/10 px-3 text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Start a weak-area test on ${c.conceptName}`}
                    >
                      Test this
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </Reveal>
      )}

      {/* ── Recent tests ── */}
      {home.recent.length > 0 && (
        <Reveal index={6} className="space-y-3">
          <SectionTitle>Recent tests</SectionTitle>
          <div className="glass divide-y divide-line/70 rounded-2xl p-2 md:p-3">
            {home.recent.map((r, i) => (
              <button
                key={`${r.attemptId}-${i}`}
                type="button"
                onClick={() => onOpenAnalysis(r.attemptId)}
                className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open analysis for ${r.label} — ${Math.round(r.percent)} percent`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-xs font-bold tabular-nums">
                  {Math.round(r.percent)}%
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.label}</span>
                  <span className="block truncate text-[11px] text-ink-soft">
                    score {r.score}/{r.maxScore} · accuracy {accuracyText(r.accuracy)} · {relTime(r.at)}
                  </span>
                </span>
                {modeBadge(r.mode)}
              </button>
            ))}
          </div>
        </Reveal>
      )}

      {/* ── Bank honesty strip ── */}
      <Reveal index={7} className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-2/40 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <Library className="size-3.5 text-primary" aria-hidden />
            Bank: {home.bank.total} questions
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <Landmark className="size-3.5" aria-hidden /> {home.bank.pyq} PYQ-pattern
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <ImageIcon className="size-3.5" aria-hidden /> {home.bank.image} image-based
          </span>
          <Button variant="ghost" size="sm" className="ml-auto min-h-9 gap-1 text-xs text-primary" onClick={onOpenHistory}>
            <TrendingUp className="size-3.5" aria-hidden /> Performance history
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-ink-soft">{home.disclaimer}</p>
      </Reveal>
    </div>
  )
}
