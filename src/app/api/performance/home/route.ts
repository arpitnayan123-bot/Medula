import { NextResponse } from 'next/server'
import { buildPerformancePayload } from '@/lib/performance'

export const dynamic = 'force-dynamic'

// ─── GET /api/performance/home ──────────────────────────────────────────────
// PERFORMANCE & READINESS INTELLIGENCE (PRODUCT 13) — the unified profile:
// indicators · explainable readiness · trends · prioritized weaknesses ·
// strengths · actionable insights · realistic exam readiness.
// Everything is computed deterministically from the student's own signals.

export async function GET() {
  try {
    const payload = await buildPerformancePayload()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[api/performance/home]', err)
    return NextResponse.json({ error: 'Failed to build performance profile' }, { status: 500 })
  }
}
