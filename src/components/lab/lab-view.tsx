'use client'

// PRODUCT 10 · MEDICAL IMAGE LEARNING LAB — placeholder shell.
// Replaced by the full lab view machine (home | study | player | debrief)
// built in Task 10-b. Keeps the 'lab' view + nav wiring compiling meanwhile.

import { Card, CardContent } from '@/components/ui/card'
import { ScanEye } from 'lucide-react'
import { LAB_MODE_META } from '@/lib/types'

export function LabView() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-6 flex min-w-0 items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ScanEye className="size-6" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">Medical Image Learning Lab</h1>
          <p className="truncate text-sm text-ink-soft">
            See → Identify → Interpret → Reason → Learn → Practice
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-ink-soft">
            The interactive image lab is being assembled — the curated library of 31 platform-owned
            teaching images and six modes is landing next:
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(LAB_MODE_META).map(([id, meta]) => (
              <li key={id} className="rounded-lg border border-line p-3">
                <span className="text-sm font-semibold">{meta.label}</span>
                <span className="block text-xs text-ink-soft">{meta.blurb}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
