import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { greetingFor, isVoiceMode, parseTranscript } from '@/lib/voice'
import type { VoiceMode } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/voice/session
//   { mode, topicId? }  → start a new spoken session (the tutor's opening
//                         line is written into the append-only transcript)
//   { sessionId }       → resume an active session (transcript replayed,
//                         no duplicate greeting)
// The system prompt is NOT persisted — the turn route rebuilds it from
// measured data on every turn, so personalization stays live all session.
export async function POST(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const body = (await req.json()) as { mode?: string; topicId?: string; sessionId?: string }

    // ── resume path ──
    if (body.sessionId) {
      const existing = await db.voiceSession.findUnique({ where: { id: body.sessionId } })
      if (!existing || existing.profileId !== profile.id) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }
      if (existing.status !== 'active') {
        return NextResponse.json({ error: `Session is ${existing.status}` }, { status: 409 })
      }
      const transcript = parseTranscript(existing.transcript)
      return NextResponse.json({
        ok: true,
        sessionId: existing.id,
        mode: existing.mode,
        resumed: true,
        greeting: '',
        display: '',
        transcript,
        state: {
          turns: Math.floor(transcript.length / 2),
          questions: existing.questions,
          correct: existing.correct,
        },
      })
    }

    // ── start path ──
    const mode: VoiceMode = body.mode && isVoiceMode(body.mode) ? body.mode : 'listen'
    let topicLabel = ''
    if (body.topicId) {
      const topic = await db.topic.findUnique({
        where: { id: body.topicId },
        select: { name: true, subject: { select: { name: true } } },
      })
      if (topic) topicLabel = `${topic.name} (${topic.subject.name})`
    }

    // revision mode must know up front whether the queue is empty so the
    // greeting stays honest
    const dueCount =
      mode === 'revision'
        ? await db.revisionItem.count({ where: { profileId: profile.id, cleared: false } })
        : 0

    const greeting = greetingFor(mode, topicLabel || null, dueCount > 0)
    const created = await db.voiceSession.create({
      data: {
        profileId: profile.id,
        mode,
        topicId: body.topicId ?? '',
        topicLabel,
        transcript: [
          { role: 'tutor', text: greeting, at: new Date().toISOString() },
        ] as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      ok: true,
      sessionId: created.id,
      mode,
      resumed: false,
      greeting,
      display: greeting,
      state: { turns: 0, questions: 0, correct: 0 },
    })
  } catch (err) {
    console.error('voice/session error:', err)
    return NextResponse.json({ error: 'Could not start the voice session' }, { status: 500 })
  }
}
