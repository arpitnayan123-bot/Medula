import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { loadMistakeContext } from '@/lib/mistake-intel'
import { ERROR_TYPE_LABELS } from '@/lib/types'
import type { MistakeDetailPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/mistakes-intel/detail?id=<recordId>
// The full mistake profile: question, options (with why-this-option notes),
// both answers, the attempt history, any curated confusion pair that matches
// the concept, and how many sibling questions exist for a drill. Opening a
// detail also stamps lastReviewedAt (review tracking, not judgement).
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const recordId = req.nextUrl.searchParams.get('id') ?? ''
    if (!recordId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const record = await db.mistakeRecord.findUnique({
      where: { id: recordId },
      include: {
        question: {
          include: {
            concept: { select: { id: true, name: true } },
            subject: { select: { code: true, name: true } },
          },
        },
      },
    })
    if (!record || record.profileId !== profile.id) {
      return NextResponse.json({ error: 'Mistake record not found' }, { status: 404 })
    }

    await db.mistakeRecord.update({
      where: { id: record.id },
      data: { lastReviewedAt: new Date() },
    })

    const ctx = await loadMistakeContext(profile.id)

    const attempts = await db.questionAttempt.findMany({
      where: { profileId: profile.id, questionId: record.questionId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    })

    const optionsRaw = Array.isArray(record.question.options)
      ? (record.question.options as { id: string; text: string }[])
      : []
    const notesRaw = record.question.optionNotes
    const notes =
      notesRaw && typeof notesRaw === 'object' && !Array.isArray(notesRaw)
        ? (notesRaw as Record<string, string>)
        : {}

    const drillAvailable = record.question.conceptId
      ? await db.question.count({
          where: { conceptId: record.question.conceptId, id: { not: record.questionId } },
        })
      : 0

    const confusionPairRow = record.question.conceptId
      ? (await db.confusionPair.findFirst({
          where: { OR: [{ aCode: record.question.conceptId }, { bCode: record.question.conceptId }] },
        }))
      : null

    // rebuild the single row for this record so priority/factors stay consistent
    const row = ctx.rows.find((r) => r.recordId === record.id)
    if (!row) return NextResponse.json({ error: 'Mistake record not found in context' }, { status: 404 })

    const payload: MistakeDetailPayload = {
      record: row,
      options: optionsRaw.map((o) => ({
        id: o.id,
        text: o.text,
        isAnswer: o.id === record.question.answer,
        isWrongPick: o.id === record.lastSelected && o.id !== record.question.answer,
        note: notes[o.id] ?? undefined,
      })),
      answer: record.question.answer,
      explanation: record.question.explanation,
      teaching: record.question.teaching,
      attempts: attempts.map((a) => ({
        at: a.createdAt.toISOString(),
        selectedText: optionsRaw.find((o) => o.id === a.selected)?.text ?? a.selected,
        correct: a.correct,
        errorType: a.errorType,
        errorLabel: a.errorType ? (ERROR_TYPE_LABELS[a.errorType] ?? a.errorType) : null,
        timeMs: a.timeMs,
        confidence: a.confidence,
      })),
      confusionPair: confusionPairRow
        ? {
            a: confusionPairRow.a,
            b: confusionPairRow.b,
            mnemonic: confusionPairRow.mnemonic,
            aPoints: (confusionPairRow.aPoints as string[]) ?? [],
            bPoints: (confusionPairRow.bPoints as string[]) ?? [],
          }
        : null,
      drillAvailable,
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[api/mistakes-intel/detail] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load mistake detail' }, { status: 500 })
  }
}
