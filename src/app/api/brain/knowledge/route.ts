import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadBrainContext, deriveConceptStates } from '@/lib/brain-engine'
import { asTrimmed } from '@/lib/http'
import type { BrainKnowledgePayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/knowledge — the full concept-state table with server-side
// filters (?state= ?subject= ?q=). Counts are always the UNFILTERED totals;
// the states list is the filtered view. All curriculum concepts are returned
// (including not-started) — the client filters further.
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)

    const stateFilter = asTrimmed(req.nextUrl.searchParams.get('state'), 24)
    const subjectFilter = asTrimmed(req.nextUrl.searchParams.get('subject'), 64)?.toLowerCase()
    const qFilter = asTrimmed(req.nextUrl.searchParams.get('q'), 64)?.toLowerCase()

    let filtered = states
    if (stateFilter) filtered = filtered.filter((s) => s.status === stateFilter)
    if (subjectFilter) {
      filtered = filtered.filter((s) => s.subjectId.toLowerCase() === subjectFilter || s.subjectName.toLowerCase() === subjectFilter)
    }
    if (qFilter) {
      filtered = filtered.filter((s) =>
        s.name.toLowerCase().includes(qFilter) ||
        s.topicName.toLowerCase().includes(qFilter) ||
        s.subjectName.toLowerCase().includes(qFilter),
      )
    }

    const counts = states.reduce((acc, s) => { acc[s.status] += 1; return acc }, {
      'not-started': 0, learning: 0, familiar: 0, strong: 0, mastered: 0, 'at-risk': 0, 'needs-revision': 0,
    } as BrainKnowledgePayload['counts'])

    const payload: BrainKnowledgePayload = {
      generatedAt: ctx.now.toISOString(),
      counts,
      states: filtered,
      note: `${filtered.length} of ${states.length} concepts shown${stateFilter || subjectFilter || qFilter ? ' (filtered)' : ''} — every concept carries its measured signals, so "why am I seeing this" is one tap away.`,
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/knowledge error:', error)
    return NextResponse.json({ error: 'Failed to load the knowledge table.' }, { status: 500 })
  }
}
