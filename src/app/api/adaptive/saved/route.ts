import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'

export const dynamic = 'force-dynamic'

// ── Adaptive bookmarks ───────────────────────────────────────────────────────
// GET    /api/adaptive/saved            → list (id/questionId/stem/subjectCode/createdAt)
// POST   /api/adaptive/saved {questionId} → create (idempotent on the unique pair)
// DELETE /api/adaptive/saved?questionId=… → remove

export async function GET() {
  const profile = await getDemoProfile()
  const rows = await db.savedQuestion.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: 'desc' },
    include: { question: { select: { stem: true, subjectCode: true } } },
  })
  return NextResponse.json({
    saved: rows.map((r) => ({
      id: r.id,
      questionId: r.questionId,
      stem: r.question.stem,
      subjectCode: r.question.subjectCode,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ questionId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const questionId = asTrimmed(body.questionId, 200)
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })

  const question = await db.question.findUnique({ where: { id: questionId }, select: { id: true } })
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const profile = await getDemoProfile()
  const existing = await db.savedQuestion.findUnique({
    where: { profileId_questionId: { profileId: profile.id, questionId } },
  })
  if (existing) return NextResponse.json({ ok: true, id: existing.id })

  const saved = await db.savedQuestion.create({ data: { profileId: profile.id, questionId } })
  return NextResponse.json({ ok: true, id: saved.id })
}

export async function DELETE(req: NextRequest) {
  const questionId = asTrimmed(req.nextUrl.searchParams.get('questionId'), 200)
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })

  const profile = await getDemoProfile()
  await db.savedQuestion.deleteMany({ where: { profileId: profile.id, questionId } })
  return NextResponse.json({ ok: true })
}
