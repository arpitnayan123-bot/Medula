import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson } from '@/lib/http'
import { clampMinutes, generatePaper } from '@/lib/exam'
import type { ExamConfig, ExamMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MODES: ExamMode[] = ['full', 'subject', 'topic', 'pyq', 'custom', 'weak', 'adaptive', 'image', 'rapid']

// POST /api/exam/start {config} — generate a paper deterministically from the
// platform bank, freeze it on the attempt and return the client-safe question
// set (answers/explanations never included). An unfinished attempt of another
// mode is NOT auto-abandoned — the home resume banner owns that decision; a
// second active attempt is rejected so the answer sheet stays unambiguous.
export async function POST(req: NextRequest) {
  const body = await readJson<{ config?: unknown }>(req)
  if (!body || !body.config || typeof body.config !== 'object') {
    return NextResponse.json({ error: 'config is required' }, { status: 400 })
  }
  const config = body.config as ExamConfig
  if (!config.mode || !MODES.includes(config.mode)) {
    return NextResponse.json({ error: `config.mode must be one of: ${MODES.join(', ')}` }, { status: 400 })
  }

  const profile = await getDemoProfile()

  const running = await db.examAttempt.findFirst({
    where: { profileId: profile.id, status: 'active' },
    select: { id: true, label: true },
  })
  if (running) {
    return NextResponse.json(
      { error: 'An exam is already in progress — resume or submit it first.', attemptId: running.id },
      { status: 409 },
    )
  }

  const paper = await generatePaper(profile.id, config)
  if (paper.questionIds.length === 0) {
    return NextResponse.json({ error: paper.note ?? 'No questions matched this test — widen the filters.' }, { status: 422 })
  }

  const minutes = clampMinutes(config.minutes, config.mode)
  const startedAt = new Date()
  const endsAt = new Date(startedAt.getTime() + minutes * 60_000)

  const attempt = await db.examAttempt.create({
    data: {
      profileId: profile.id,
      mode: config.mode,
      label: paper.label,
      config: config as unknown as object,
      questionIds: paper.questionIds as unknown as object,
      responses: [] as unknown as object,
      events: [{ kind: 'start', at: startedAt.toISOString() }] as unknown as object,
      total: paper.questionIds.length,
      maxScore: paper.questionIds.length * 4,
      startedAt,
    },
  })

  return NextResponse.json({
    ok: true as const,
    attemptId: attempt.id,
    label: paper.label,
    mode: config.mode,
    negativeMark: paper.negativeMark,
    total: paper.questionIds.length,
    endsAt: endsAt.toISOString(),
    startedAt: startedAt.toISOString(),
    questions: paper.questions,
    note: paper.note,
  })
}
