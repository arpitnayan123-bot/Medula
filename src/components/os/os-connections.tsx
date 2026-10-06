'use client'

// ─── Medical Education OS — one connected system map (PRODUCT 20) ───────────
// The 14 features rendered as one ecosystem: each tile shows a MEASURED
// one-liner of what that feature knows about you today, and opens the real
// feature on tap. Active (used in 30 days) vs quiet is shown honestly —
// a quiet feature is an invitation, never a guilt trip.

import { motion } from 'framer-motion'
import type { OsCommandCenter } from '@/lib/types'
import { MicroLabel, OS_CONNECTION_ICON, StatusDot, useOsNavigate } from '@/components/os/os-shared'
import { ChevronRight } from 'lucide-react'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export function OsConnections({ data }: { data: OsCommandCenter }) {
  const go = useOsNavigate()
  const active = data.connections.filter((c) => c.status === 'active').length

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: 0.05 }}
      aria-label="One connected system"
      className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-background">
            <span className="text-[11px] font-bold text-ink-soft">{data.connections.length}</span>
          </span>
          <MicroLabel>One connected system — not {data.connections.length} separate features</MicroLabel>
        </div>
        <span className="text-[11px] tabular-nums text-ink-soft">{active} active</span>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {data.connections.map((c) => {
          const Icon = OS_CONNECTION_ICON[c.view as keyof typeof OS_CONNECTION_ICON]
          return (
            <button
              key={c.view}
              onClick={() => go(c.view)}
              className="group flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={`${c.label}: ${c.contribution}. Opens the feature.`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card">
                {Icon ? <Icon className="size-4 text-ink-soft" aria-hidden /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <StatusDot status={c.status} />
                  <span className="truncate text-[12.5px] font-medium leading-tight">{c.label}</span>
                </span>
                <span className="block truncate text-[11px] text-ink-soft">{c.contribution}</span>
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-ink-soft/50 transition group-hover:translate-x-0.5" aria-hidden />
            </button>
          )
        })}
      </div>
    </motion.section>
  )
}
