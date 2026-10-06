import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import {
  loadBrainContext, deriveConceptStates, buildBrainProfile, buildAnswers, buildBrainPath,
  buildInsights, buildPrivacy, materializeSnapshot, brainHonestNote, howItWorksRules,
} from '@/lib/brain-engine'
import type { BrainHomePayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/brain/home — the Brain landing payload: measured profile, the 7
// intelligence answers, the dynamic path, max-4 insights, forgetting summary,
// privacy switches and the published derivation rules. A daily snapshot is
// materialized best-effort (never fails the route).
export async function GET(_req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadBrainContext(profile.id)
    const states = deriveConceptStates(ctx)

    const counts = states.reduce((acc, s) => { acc[s.status] += 1; return acc }, {
      'not-started': 0, learning: 0, familiar: 0, strong: 0, mastered: 0, 'at-risk': 0, 'needs-revision': 0,
    } as BrainHomePayload['profile']['conceptsByState'])

    const payload: BrainHomePayload = {
      generatedAt: ctx.now.toISOString(),
      profile: buildBrainProfile(ctx, states),
      answers: buildAnswers(ctx, states),
      path: buildBrainPath(ctx, states),
      insights: buildInsights(ctx, states),
      forgetting: {
        atRisk: counts['at-risk'],
        needsRevision: counts['needs-revision'],
        topRisks: states
          .filter((s) => s.estRecall != null)
          .sort((a, b) => (a.estRecall ?? 1) - (b.estRecall ?? 1))
          .slice(0, 5)
          .map((s) => ({ conceptId: s.conceptId, name: s.name, recall: s.estRecall as number })),
      },
      privacy: ctx.settings,
      howItWorks: howItWorksRules(),
      dataBasis: {
        conceptsMeasured: states.filter((s) => s.status !== 'not-started').length,
        attempts: ctx.attemptsTotal,
        flashcardReviews: ctx.flashReviews.length,
        revisionItems: ctx.revisionItems.length,
        mocks: ctx.examAttempts.length,
      },
      honestNote: brainHonestNote(ctx, states),
    }

    // daily snapshot — best-effort, never fails the route
    try { await materializeSnapshot(profile.id, ctx, states) } catch { /* ignore */ }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('brain/home error:', error)
    return NextResponse.json({ error: 'Failed to load your brain home.' }, { status: 500 })
  }
}
