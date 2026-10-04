import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asTrimmed, readJson } from '@/lib/http'
import { parseSessionState, selectNextQuestion, flagsFor } from '@/lib/adaptive'
import type { AdaptiveNextQuestion } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/adaptive/next {sessionId} — the next unanswered question.
// ai-adaptive: fresh engine re-selection each call (staircase + focus lock),
//   stored as the queue head so the answer route's membership check stays true.
// Other modes: the head of the stored queue. Also serves resume.
export async function POST(req: NextRequest) {
  const body = await readJson<{ sessionId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const sessionId = asTrimmed(body.sessionId, 100)
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const session = await db.adaptiveSession.findUnique({ where: { id: sessionId } })
  if (!session || session.profileId !== profile.id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const state = parseSessionState(session.state)

  if (session.mode === 'ai-adaptive') {
    // Fresh engine re-selection. selectNextQuestion is deterministic, so
    // excluding only the answered set re-picks the stored head when nothing
    // changed — and recomputes cleanly on resume. (Excluding the current queue
    // here would orphan the head, so the queue is emptied for the pass.)
    const pick = await selectNextQuestion(
      { mode: session.mode, config: session.config, state: { ...state, queue: [] } as unknown as object },
      profile.id,
    )
    state.queue = pick.question ? [pick.question.id] : []
    state.target = pick.target
    await db.adaptiveSession.update({
      where: { id: session.id },
      data: { state: state as unknown as object },
    })
    const result: AdaptiveNextQuestion = { question: pick.question, focusNote: pick.focusNote }
    return NextResponse.json(result)
  }

  // Static modes: serve the stored head without touching order.
  const nextId = state.queue[0]
  if (!nextId) {
    const result: AdaptiveNextQuestion = { question: null }
    return NextResponse.json(result)
  }
  const question = await db.question.findUnique({
    where: { id: nextId },
    include: { concept: { select: { name: true } } },
  })
  if (!question) {
    // Defensive: a queue id lost its row — skip it and serve the next one.
    state.queue = state.queue.slice(1)
    await db.adaptiveSession.update({
      where: { id: session.id },
      data: { state: state as unknown as object },
    })
    const result: AdaptiveNextQuestion = { question: null }
    return NextResponse.json(result)
  }
  const flags = flagsFor(question)
  const result: AdaptiveNextQuestion = {
    question: {
      id: question.id, stem: question.stem,
      options: (question.options as { id: string; text: string }[]),
      difficulty: question.difficulty, qtype: question.qtype, subjectCode: question.subjectCode, system: question.system,
      conceptId: question.conceptId ?? undefined,
      conceptName: question.concept?.name ?? undefined,
      pyqPattern: flags.pyqPattern,
      imageBased: flags.imageBased,
    },
  }
  return NextResponse.json(result)
}
