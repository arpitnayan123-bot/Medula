import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// POST /api/adaptive/report-question {questionId, reason, detail?}
// Free-text content report on a question (reason required, ≤80 chars).
export async function POST(req: NextRequest) {
  const body = await readJson<{ questionId?: unknown; reason?: unknown; detail?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const questionId = asTrimmed(body.questionId, 200)
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })

  const reason = asTrimmed(body.reason, 80)
  if (!reason) return NextResponse.json({ error: 'reason is required (max 80 characters)' }, { status: 400 })

  const detail = asTrimmed(body.detail, 1000) ?? ''

  const question = await db.question.findUnique({ where: { id: questionId }, select: { id: true } })
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const profile = await getDemoProfile()
  await db.questionReport.create({
    data: { profileId: profile.id, questionId, reason, detail },
  })
  return NextResponse.json({ ok: true })
}
