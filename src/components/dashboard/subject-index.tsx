'use client'

// ─── ALL SUBJECTS — the porcelain subject index ─────────────────────────────
// Subjects are worlds, not database rows: each card carries its own visual
// identity (glyph + tint), a measured mastery bar, and one honest number.
// Tap a subject → opens the Doubt Search pre-scoped to that subject, where
// every topic of the subject is one tap away.

import { motion, useReducedMotion } from 'framer-motion'

import { useAppStore } from '@/lib/store'
import { SubjectGlyph, subjectIdentity } from '@/components/primitives/kit'
import type { MapInsights } from '@/app/api/map-insights/route'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export function SubjectIndex({ insights }: { insights: MapInsights | null }) {
  const setView = useAppStore((s) => s.setView)
  const setMapScope = useAppStore((s) => s.setMapScope)
  const reduce = useReducedMotion()

  const branches = insights?.branches ?? []
  if (branches.length === 0) return null

  const openSubject = (subjectId: string) => {
    setMapScope(`subject:${subjectId}`)
    setView('map') // the map view is now the Doubt Search — lands scoped
  }

  return (
    <section aria-label="All subjects">
      {/* header — one line, no clutter */}
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">All Subjects</h2>
        <p className="text-xs text-ink-soft">
          {branches.length} subjects · tap to open
        </p>
      </div>

      {/* the tidy grid — 2 cols on phones, up to 5 on desktop */}
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {branches.map((b, i) => {
          const identity = subjectIdentity(b.name)
          return (
            <motion.li
              key={b.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: reduce ? 0 : Math.min(i * 0.025, 0.3), ease: EASE }}
            >
              <button
                type="button"
                onClick={() => openSubject(b.id)}
                aria-label={`${b.name} — ${b.conceptCount} concepts, ${b.mastery}% mastery. Open topics.`}
                className="clay clay-hover group flex h-full w-full flex-col rounded-2xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex w-full items-center gap-2.5">
                  <SubjectGlyph name={b.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight">{b.name}</span>
                    <span className="block text-[10px] leading-tight text-ink-soft">{b.conceptCount} concepts</span>
                  </span>
                </span>
                <span className="mt-2.5 flex w-full items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 shadow-well">
                    <span
                      className="block h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${Math.max(4, b.mastery)}%`,
                        backgroundColor: identity.color,
                        opacity: 0.85,
                      }}
                    />
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums text-ink-soft">{b.mastery}%</span>
                </span>
              </button>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}
