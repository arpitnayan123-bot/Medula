import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import { parseSessionState } from '@/lib/adaptive'

export const dynamic = 'force-dynamic'

// The 9 known self-reported error types (mirrors QuestionAttempt.errorType)
const ERROR_TYPES = ['didnt_know', 'forgot', 'misread', 'confused', 'calculation', 'reasoning', 'changed', 'time', 'guess'] as const

// POST /api/adaptive/answer-type {sessionId, questionId, errorType}
// Attaches/updates the self-reported error type on an already-answered entry in
// the session state. Pure annotation — no knowledge/scoring changes here.
export async function POST(req: NextRequest) {
  const body = await readJson<{ sessionId?: unknown; questionId?: unknown; errorType?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const sessionId = asTrimmed(body.sessionId, 100)
  const questionId = asTrimmed(body.questionId, 200)
  const errorType = asTrimmed(body.errorType, 40)
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  if (!questionId) return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
  if (!errorType || !(ERROR_TYPES as readonly string[]).includes(errorType)) {
    return NextResponse.json({ error: `errorType must be one of: ${ERROR_TYPES.join(', ')}` }, { status: 400 })
  }

  const profile = await getDemoProfile()
  const session = await db.adaptiveSession.findUnique({ where: { id: sessionId } })
  if (!session || session.profileId !== profile.id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const state = parseSessionState(session.state)
  const entry = state.answered.find((a) => a.questionId === questionId)
  if (!entry) {
    return NextResponse.json({ error: 'Answer not found in this session — log the answer first' }, { status: 404 })
  }

  entry.errorType = errorType
  await db.adaptiveSession.update({
    where: { id: session.id },
    data: { state: state as unknown as object },
  })
  return NextResponse.json({ ok: true })
}
