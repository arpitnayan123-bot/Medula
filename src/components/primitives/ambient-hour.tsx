'use client'

// ─── AMBIENT HOUR — realtime warm color, the canvas breathes with the day ────
// A zero-UI system layer: watches the clock (IST) and tags <html> with
// data-ambient="dawn|morning|afternoon|dusk|evening|night". globals.css maps
// each phase to ambient glow hues — only decorative washes shift; contrast,
// text, and tokens stay identical. Mounted once in the root layout.

import { useEffect } from 'react'

type Phase = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'evening' | 'night'

function phaseForHour(h: number): Phase {
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 20) return 'dusk'
  if (h >= 20 || h < 1) return 'evening'
  return 'night'
}

export function AmbientHour() {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      // User timezone (Asia/Calcutta) via locale clock, UTC+5:30 fallback.
      const ist = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000)
      root.dataset.ambient = phaseForHour(ist.getHours())
    }
    apply()
    const t = setInterval(apply, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])
  return null
}
