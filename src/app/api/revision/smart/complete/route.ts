import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import { buildPlan, loadRevisionContext, parseStoredBlocks } from '@/lib/revision-engine'
import type { RevisionMode, RevisionSessionSummary } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/revision/smart/complete — close a revision session.
// Accuracy is MEASURED from QuestionAttempt rows inside [session.createdAt,
// now] for the questions the session queued. "Next" comes from a fresh daily
// plan, skipping blocks this session already finished. One StudySession row is
// logged for the minutes NOT already logged per concept/compare block.
export async function POST(req: NextRequest) {
  const body = await readJson<{ sessionId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const sessionId = asTrimmed(body.sessionId, 200)
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const session = await db.revisionSession.findFirst({ where: { id: sessionId, profileId: profile.id } })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const blocks = parseStoredBlocks(session.plan)
  const doneBlocks = blocks.filter((b) => b.done)
  const doneIds = new Set(doneBlocks.map((b) => b.id))

  // ── measured accuracy inside the session window ──
  const questionIds = [...new Set(blocks.flatMap((b) => b.questionIds ?? []))]
  let accuracy: { answered: number; correct: number } | null = null
  if (questionIds.length) {
    const attempts = await db.questionAttempt.findMany({
      where: {
        profileId: profile.id,
        questionId: { in: questionIds },
        createdAt: { gte: session.createdAt, lte: new Date() },
      },
      select: { correct: true },
    })
    if (attempts.length) {
      accuracy = { answered: attempts.length, correct: attempts.filter((a) => a.correct).length }
    }
  }

  // ── honest next recommendation from a fresh 20-min daily plan ──
  const ctx = await loadRevisionContext(profile.id)
  const fresh = buildPlan(ctx, 'daily', 20)
  const nextBlock = fresh.blocks.find((b) => !doneIds.has(b.id))
  const next = nextBlock ? { title: nextBlock.title, reason: nextBlock.reason, kind: nextBlock.kind } : null

  // ── close the session (idempotent: a repeat call never double-logs time) ──
  let minutesLogged = 0
  if (session.status !== 'completed') {
    // Concept/compare blocks already logged their minutes in touchConceptReview.
    // Every other DONE block logs its own estimate here — a half-finished
    // session never claims the full budget.
    const alreadyLogged = doneBlocks
      .filter((b) => (b.kind === 'concept' || b.kind === 'compare') && b.conceptId)
      .reduce((a, b) => a + b.minutes, 0)
    const remainder = doneBlocks
      .filter((b) => !((b.kind === 'concept' || b.kind === 'compare') && b.conceptId))
      .reduce((a, b) => a + b.minutes, 0)
    if (remainder > 0) {
      await db.studySession.create({
        data: { profileId: profile.id, minutes: remainder, kind: 'revision', label: `Smart revision — ${session.mode} session` },
      })
    }
    minutesLogged = alreadyLogged + remainder
    await db.revisionSession.update({
      where: { id: session.id },
      data: { status: 'completed', completedAt: new Date() },
    })
  }

  const message =
    doneBlocks.length > 0
      ? `Revised ${doneBlocks.length} of ${blocks.length} blocks — ${minutesLogged} min logged.`
      : 'Session closed — nothing was marked done; the queue stays for tomorrow.'

  const payload: RevisionSessionSummary = {
    sessionId: session.id,
    mode: session.mode as RevisionMode,
    done: doneBlocks.length,
    total: blocks.length,
    minutes: session.minutes,
    accuracy,
    next,
    message,
  }
  return NextResponse.json(payload)
}
