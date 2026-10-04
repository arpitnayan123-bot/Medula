import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asInt, asTrimmed, readJson } from '@/lib/http'
import { selectAdaptiveQuestions } from '@/lib/adaptive'
import { ADAPTIVE_MODES } from '@/lib/types'
import type { AdaptiveConfig, AdaptiveMode, AdaptiveSessionStart } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/adaptive/session {config} — validate → select → persist → start.
// Mode ids: the ADAPTIVE_MODES catalogue (UI list) plus 'custom' (the
// custom-builder mode defined by the AdaptiveMode contract; it has no UI card).
export async function POST(req: NextRequest) {
  const body = await readJson<{ config?: unknown }>(req)
  if (!body || typeof body.config !== 'object' || body.config === null) {
    return NextResponse.json({ error: 'config is required' }, { status: 400 })
  }
  const raw = body.config as Record<string, unknown>

  const mode = asTrimmed(raw.mode, 30)
  const validMode = mode !== null && (ADAPTIVE_MODES.some((m) => m.id === mode) || mode === 'custom')
  if (!validMode) {
    return NextResponse.json(
      { error: `mode must be one of: ${[...ADAPTIVE_MODES.map((m) => m.id), 'custom'].join(', ')}` },
      { status: 400 },
    )
  }

  const config: AdaptiveConfig = {
    mode: mode as AdaptiveMode,
    count: asInt(raw.count, 5, 100, 10),
    minutes: raw.minutes === undefined || raw.minutes === null ? undefined : asInt(raw.minutes, 1, 600, 60),
    subjectCode: asTrimmed(raw.subjectCode, 20) ?? undefined,
    system: asTrimmed(raw.system, 60) ?? undefined,
    topicId: asTrimmed(raw.topicId, 100) ?? undefined,
    conceptId: asTrimmed(raw.conceptId, 100) ?? undefined,
    difficulty: raw.difficulty === undefined || raw.difficulty === null ? undefined : asInt(raw.difficulty, 1, 3, 2),
  }

  const profile = await getDemoProfile()
  const selection = await selectAdaptiveQuestions(profile.id, config)
  if (selection.questions.length === 0) {
    return NextResponse.json(
      { error: 'No questions match this mode and filter combination — try widening the filters.' },
      { status: 422 },
    )
  }

  const session = await db.adaptiveSession.create({
    data: {
      profileId: profile.id,
      mode: config.mode,
      config: config as unknown as object,
      state: {
        queue: selection.questions.map((q) => q.id),
        answered: [],
        markedIds: [],
        missedConcepts: [],
        target: selection.target,
        focus: null,
      },
      total: selection.questions.length,
    },
  })

  const start: AdaptiveSessionStart = {
    sessionId: session.id,
    mode: config.mode,
    label: selection.label,
    blurb: selection.blurb,
    questions: selection.questions,
    timed: selection.timed,
    secondsPerQuestion: selection.secondsPerQuestion,
    totalSeconds: selection.totalSeconds,
  }
  return NextResponse.json(start)
}
