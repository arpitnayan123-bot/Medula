import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import type { MistakeRetestQuestion } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/mistakes-intel/retest {recordId}
// Serve THE SAME question the student missed — fresh, without the answer.
// The retest is the honesty gate: only retests move a mistake toward resolved.
export async function POST(req: NextRequest) {
  const body = await readJson<{ recordId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const recordId = asTrimmed(body.recordId, 100)
  if (!recordId) return NextResponse.json({ error: 'recordId is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const record = await db.mistakeRecord.findUnique({
    where: { id: recordId },
    include: { question: true },
  })
  if (!record || record.profileId !== profile.id) {
    return NextResponse.json({ error: 'Mistake record not found' }, { status: 404 })
  }
  if (record.status === 'resolved') {
    return NextResponse.json({ error: 'This mistake is already resolved' }, { status: 409 })
  }

  await db.mistakeRecord.update({
    where: { id: record.id },
    data: { lastReviewedAt: new Date() },
  })

  const q = record.question
  const payload: MistakeRetestQuestion = {
    recordId: record.id,
    questionId: q.id,
    stem: q.stem,
    options: Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : [],
    difficulty: q.difficulty,
    qtype: q.qtype,
    subjectCode: q.subjectCode,
    imageUrl: q.imageUrl ?? null,
    attemptNo: record.retestCount + 1,
  }
  return NextResponse.json(payload)
}
