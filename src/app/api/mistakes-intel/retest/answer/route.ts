import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import { recordAttempt } from '@/lib/attempt-record'
import type { MistakeRetestResult, MistakeStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/mistakes-intel/retest/answer {recordId, selected, timeMs}
// Grade the retest through the SHARED recordAttempt (same knowledge update as
// every other attempt — no parallel truth), then move the lifecycle:
//   correct #1 → 'retested'; correct #2 (consecutive) → 'resolved'
//   wrong → back to 'unresolved' (recordAttempt's capture bumps the count)
export async function POST(req: NextRequest) {
  const body = await readJson<{ recordId?: unknown; selected?: unknown; timeMs?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const recordId = asTrimmed(body.recordId, 100)
  const selected = asTrimmed(body.selected, 10)
  const timeMs = typeof body.timeMs === 'number' && Number.isFinite(body.timeMs) && body.timeMs >= 0
    ? Math.min(Math.round(body.timeMs), 3_600_000)
    : 0
  if (!recordId || !selected) {
    return NextResponse.json({ error: 'recordId and selected are required' }, { status: 400 })
  }

  const profile = await getDemoProfile()
  const record = await db.mistakeRecord.findUnique({
    where: { id: recordId },
    include: { question: true },
  })
  if (!record || record.profileId !== profile.id) {
    return NextResponse.json({ error: 'Mistake record not found' }, { status: 404 })
  }

  // Grade through the shared recorder — one knowledge engine, one attempt feed.
  const { correct } = await recordAttempt(profile.id, record.questionId, selected, timeMs, 3)

  const q = record.question
  const options = Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : []

  let status: MistakeStatus
  let resolvedNow = false
  if (correct) {
    const streak = record.retestCorrect + 1
    if (streak >= 2) {
      status = 'resolved'
      resolvedNow = true
      await db.mistakeRecord.update({
        where: { id: record.id },
        data: { status, retestCount: { increment: 1 }, retestCorrect: streak, resolvedAt: new Date(), resolvedBy: 'retest' },
      })
    } else {
      status = 'retested'
      await db.mistakeRecord.update({
        where: { id: record.id },
        data: { status, retestCount: { increment: 1 }, retestCorrect: streak },
      })
    }
  } else {
    status = 'unresolved'
    await db.mistakeRecord.update({
      where: { id: record.id },
      data: { status, retestCount: { increment: 1 }, retestCorrect: 0, resolvedAt: null, resolvedBy: null },
    })
  }

  const payload: MistakeRetestResult = {
    correct,
    answerText: options.find((o) => o.id === q.answer)?.text ?? q.answer,
    selectedText: options.find((o) => o.id === selected)?.text ?? selected,
    explanation: q.explanation,
    status,
    resolvedNow,
    wrongCount: correct ? record.wrongCount : record.wrongCount + 1,
  }
  return NextResponse.json(payload)
}
