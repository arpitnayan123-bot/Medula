import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAY, istDayKey } from '@/lib/engine'
import { getDemoProfile } from '@/lib/profile'
import { buildIntelligence, buildPlan, countModeBlocks, defaultBudgetMinutes, loadRevisionContext } from '@/lib/revision-engine'
import { REVISION_MODES } from '@/lib/types'
import type { RevisionMode, RevisionSmartHome } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Recompiled after the stale-Prisma-client guard was added to src/lib/db.ts.

// GET /api/revision/smart/home — the Smart Revision landing payload:
// today's measured queue, per-mode queue sizes, the intelligence panel,
// resume/recent sessions and honest study stats. Every number is measured.
export async function GET() {
  const profile = await getDemoProfile()
  const ctx = await loadRevisionContext(profile.id)
  const intelligence = buildIntelligence(ctx)

  const budget = defaultBudgetMinutes(ctx.dailyHours)
  const today = buildPlan(ctx, 'daily', budget)

  const modes = REVISION_MODES.map((m) => ({
    id: m.id,
    label: m.label,
    blurb: m.blurb,
    count: m.id === 'daily' ? today.blocks.length : countModeBlocks(ctx, m.id),
  }))

  // ── sessions: resume + recent + today's completed blocks ──
  const sessions = await db.revisionSession.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const resumeRow = sessions.find((s) => s.status === 'active' && s.done > 0)
  const recent = sessions.slice(0, 5).map((s) => ({
    id: s.id,
    mode: s.mode as RevisionMode,
    done: s.done,
    total: s.total,
    minutes: s.minutes,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
  }))
  const todayKey = istDayKey(new Date())
  const blocksToday = sessions
    .filter((s) => s.status === 'completed' && s.completedAt && istDayKey(s.completedAt) === todayKey)
    .reduce((a, s) => a + s.done, 0)

  // ── study stats from the shared StudySession feed ──
  // minutesThisWeek uses a rolling last-7-days window (documented choice).
  const revisionSessions = await db.studySession.findMany({
    where: { profileId: profile.id, kind: 'revision' },
    orderBy: { date: 'desc' },
    take: 300,
  })
  const weekAgo = Date.now() - 7 * DAY
  const minutesThisWeek = revisionSessions
    .filter((s) => s.date.getTime() >= weekAgo)
    .reduce((a, s) => a + s.minutes, 0)
  const lastRevisedAt = revisionSessions[0]?.date.toISOString() ?? null

  const payload: RevisionSmartHome = {
    today,
    modes,
    intelligence,
    resume: resumeRow
      ? { sessionId: resumeRow.id, mode: resumeRow.mode as RevisionMode, done: resumeRow.done, total: resumeRow.total }
      : null,
    recent,
    stats: { blocksToday, minutesThisWeek, lastRevisedAt },
    // Honest "nothing measurable yet" flag for the empty onboarding state.
    insufficientData: ctx.engagedCount === 0 && ctx.dueCards.length === 0 && ctx.mistakes.length === 0,
  }
  return NextResponse.json(payload)
}
