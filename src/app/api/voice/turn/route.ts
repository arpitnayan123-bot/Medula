import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { buildVoiceSystemPrompt, parseEvals, parseTranscript, parseVoiceEvals } from '@/lib/voice'
import type { VoiceMode } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/voice/turn — the conversational core.
// Student text arrives already transcribed (client ASR route or typed input).
// The tutor's reply is generated voice-first, its hidden `voiceeval` blocks
// and [SESSION_END] marker are stripped, the transcript + eval log are
// appended atomically, and graded verdicts update the session counters.
// Chain-of-thought is never requested (thinking disabled) and never shipped.
const SESSION_END_MARKER = '[SESSION_END]'

export async function POST(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const body = (await req.json()) as { sessionId?: string; text?: string }
    const text = (body.text ?? '').trim().slice(0, 2000)
    if (!body.sessionId || !text) {
      return NextResponse.json({ error: 'sessionId and text are required' }, { status: 400 })
    }

    const session = await db.voiceSession.findUnique({ where: { id: body.sessionId } })
    if (!session || session.profileId !== profile.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.status !== 'active') {
      return NextResponse.json({ error: `Session is ${session.status}` }, { status: 409 })
    }

    const mode = session.mode as VoiceMode
    const priorTranscript = parseTranscript(session.transcript)
    const priorEvals = parseEvals(session.evals) /* shared defensive parser */
    const nowIso = new Date().toISOString()

    // ── compose the LLM conversation from the append-only transcript ──
    const messages: { role: 'user' | 'assistant'; content: string }[] = priorTranscript
      .slice(-12)
      .map((e) => ({ role: e.role === 'tutor' ? ('assistant' as const) : ('user' as const), content: e.text }))
    messages.push({ role: 'user', content: text })

    const system = await buildVoiceSystemPrompt({
      mode,
      topicId: session.topicId || null,
      topicLabel: session.topicLabel || null,
    })

    let rawReply: string
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: mode === 'listen' || mode === 'doubt' ? 0.4 : 0.5,
        maxTokens: 700, // voice turns are short by contract
        thinking: { type: 'disabled' },
      })
      rawReply = completion.choices[0]?.message?.content?.trim() ?? ''
    } catch (err) {
      console.error('voice/turn LLM error:', err)
      return NextResponse.json(
        {
          ok: true,
          reply: 'I hit a connection snag. Say that again, or try once more in a moment.',
          display: '⚠️ The voice tutor is temporarily unavailable — try again in a moment. Your typed input works too.',
          transcript: [...priorTranscript, { role: 'student' as const, text, at: nowIso }],
          state: {
            turns: Math.floor(priorTranscript.length / 2),
            questions: session.questions,
            correct: session.correct,
          },
          ended: false,
        },
        { status: 200 },
      )
    }

    if (!rawReply) rawReply = 'Sorry — I lost that thought. Could you repeat the question?'

    // ── strip machine blocks: evals + session-end marker (never spoken) ──
    const { clean, evals: freshEvals } = parseVoiceEvals(rawReply)
    let reply = clean
    const ended = reply.includes(SESSION_END_MARKER)
    reply = reply.replace(SESSION_END_MARKER, '').trim() || clean.trim()

    const newEvals = [
      ...priorEvals,
      ...freshEvals.map((e) => ({ ...e, at: nowIso })),
    ]
    const questions = session.questions + freshEvals.length
    const correct = session.correct + freshEvals.filter((e) => e.verdict === 'correct').length

    const nextTranscript = [
      ...priorTranscript,
      { role: 'student' as const, text, at: nowIso },
      { role: 'tutor' as const, text: reply, at: nowIso },
    ]

    await db.voiceSession.update({
      where: { id: session.id },
      data: {
        transcript: nextTranscript as unknown as Prisma.InputJsonValue,
        evals: newEvals as unknown as Prisma.InputJsonValue,
        questions,
        correct,
      },
    })

    return NextResponse.json({
      ok: true,
      reply,
      display: reply,
      transcript: nextTranscript,
      state: { turns: Math.floor(nextTranscript.length / 2), questions, correct },
      ended,
    })
  } catch (err) {
    console.error('voice/turn error:', err)
    return NextResponse.json({ error: 'Voice turn failed' }, { status: 500 })
  }
}
