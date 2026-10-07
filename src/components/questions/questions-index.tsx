'use client'

// ─── QUESTION LAB INDEX ───
// Tab shell: focused PRACTICE (quiz-view), exam-condition MOCK TEST,
// and the MISTAKE BOOK (personal error intelligence + re-drills).

import { useState } from 'react'
import { motion } from 'framer-motion'
import { BookX, FlaskConical, GraduationCap, Target } from 'lucide-react'
import { QuizView } from '@/components/questions/quiz-view'
import { MockTestView } from '@/components/questions/mock-test-view'
import { MistakeBook } from '@/components/questions/mistake-book'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

type LabTab = 'practice' | 'mock' | 'mistakes'

// Quiet one-row hand-off: the Question Lab is manual, the Adaptive Engine
// picks for you. Additive only — no quiz/mock/mistake internals touched.
function AdaptiveCrossLink() {
  const setView = useAppStore((s) => s.setView)
  return (
    <div className="mx-auto max-w-3xl px-4 pb-6 md:px-6">
      <button
        type="button"
        onClick={() => setView('adaptive')}
        className="group flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-left text-sm transition-colors hover:border-primary/50"
      >
        <Target className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-ink-soft">
          Want the engine to pick for you? <span className="font-semibold text-primary">Open the Adaptive Engine →</span>
        </span>
      </button>
    </div>
  )
}

export function QuestionsIndex() {
  const [tab, setTab] = useState<LabTab>('practice')

  return (
    <div>
      {/* Tab switcher — sits above whichever lab the student picks */}
      <div className="mx-auto max-w-3xl px-4 pt-4 md:px-6 md:pt-6">
        <div className="clay-tray inline-flex w-full rounded-2xl p-1.5" role="tablist" aria-label="Question lab mode">
          {(
            [
              { id: 'practice', label: 'Practice', icon: FlaskConical, hint: 'Instant feedback' },
              { id: 'mock', label: 'Mock Test', icon: GraduationCap, hint: 'Exam conditions' },
              { id: 'mistakes', label: 'Mistakes', icon: BookX, hint: 'Error intelligence' },
            ] as const
          ).map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'text-primary-foreground' : 'text-ink-soft hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="lab-tab"
                    className="absolute inset-0 rounded-xl bg-primary shadow-sm"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative inline-flex items-center gap-2">
                  <t.icon className="size-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.id === 'practice' ? 'Practice' : t.id === 'mock' ? 'Mock' : 'Errors'}</span>
                  <span className={cn('hidden rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide md:inline', active ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-surface-2 text-ink-soft')}>
                    {t.hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'practice' ? (
        <>
          <QuizView />
          <AdaptiveCrossLink />
        </>
      ) : tab === 'mock' ? (
        <MockTestView />
      ) : (
        <MistakeBook onGoPractice={() => setTab('practice')} />
      )}
    </div>
  )
}
