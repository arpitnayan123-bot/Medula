import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates, buildExport } from '@/lib/brain-engine'
import type { BrainExportPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/export — a readable view of everything the brain stores
// about the student: Profile / Knowledge states / Repeated mistakes /
// Revision / Flashcards / Mocks / Activity / Settings (capped rows, honest
// truncation).
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)
    const payload: BrainExportPayload = buildExport(ctx, states)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/export error:', error)
    return NextResponse.json({ error: 'Failed to build your data export.' }, { status: 500 })
  }
}
