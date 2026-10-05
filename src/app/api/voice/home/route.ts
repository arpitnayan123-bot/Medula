import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { VOICE_MODES } from '@/lib/voice'
import type { VoiceHome, VoiceMode, VoiceSuggestion } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/voice/home — measured Voice Tutor landing: stats, modes,
// personalized «why this now» suggestions and any resumable session.
// Never throws: degraded payloads keep the section usable offline.
export async function GET() {
  try {
    const profile = await getDemoProfile()

    const [sessions, agg, states, revisionDue, resumeRow] = await Promise.all([
      db.voiceSession.findMany({
        where: { profileId: profile.id, status: 'completed' },
        orderBy: { startedAt: 'desc' },
        take: 200,
        select: { startedAt: true, completedAt: true },
      }),
      db.voiceSession.aggregate({
        where: { profileId: profile.id, status: 'completed' },
        _sum: { questions: true, correct: true },
        _count: { _all: true },
      }),
      db.knowledgeState.findMany({
        where: { profileId: profile.id, attemptCount: { gt: 0 } },
        include: { concept: { select: { name: true } } },
        orderBy: { score: 'asc' },
        take: 5,
      }),
      db.revisionItem.count({ where: { profileId: profile.id, cleared: false } }),
      db.voiceSession.findFirst({
        where: { profileId: profile.id, status: 'active' },
        orderBy: { startedAt: 'desc' },
      }),
    ])

    const minutes = sessions.reduce((sum, s) => {
      if (!s.completedAt) return sum
      return sum + Math.max(1, Math.round((s.completedAt.getTime() - s.startedAt.getTime()) / 60000))
    }, 0)

    const questions = agg._sum.questions ?? 0
    const correct = agg._sum.correct ?? 0

    // ── measured weak areas (below 70% mastery; fall back to the lowest) ──
    const belowBar = states
      .filter((s) => s.score < 70)
      .map((s) => ({ name: s.concept.name, mastery: Math.round(s.score) }))
    const weak = belowBar.length
      ? belowBar
      : states[0]
        ? [{ name: states[0].concept.name, mastery: Math.round(states[0].score) }]
        : []

    // ── measured «why this now» suggestions ──
    const suggestions: VoiceSuggestion[] = []
    if (revisionDue > 0) {
      suggestions.push({
        mode: 'revision',
        line: `You have ${revisionDue} revision item${revisionDue === 1 ? '' : 's'} due — clear them by voice.`,
        topicId: null,
      })
    }
    if (weak[0]) {
      suggestions.push({
        mode: 'viva',
        line: `You struggled with ${weak[0].name} recently — let's test it out loud.`,
        topicId: null,
      })
    }
    if (questions === 0) {
      suggestions.push({
        mode: 'listen',
        line: 'New here? Pick a topic and just listen — hands-free.',
        topicId: null,
      })
    } else {
      suggestions.push({
        mode: 'rapid',
        line: `Your spoken-answer record is ${correct}/${questions} — keep the streak going.`,
        topicId: null,
      })
    }
    suggestions.push({
      mode: 'doubt',
      line: "Got tonight's doubt? Ask it by voice.",
      topicId: null,
    })

    const home: VoiceHome = {
      modes: VOICE_MODES,
      stats: {
        sessions: agg._count._all,
        minutes,
        questions,
        accuracy: questions > 0 ? Math.round((correct / questions) * 100) : null,
        lastSessionAt: sessions[0]?.completedAt?.toISOString() ?? null,
      },
      suggestions: suggestions.slice(0, 4),
      revisionDue,
      weak: weak.slice(0, 3),
      resume: resumeRow
        ? {
            sessionId: resumeRow.id,
            mode: resumeRow.mode as VoiceMode,
            topicLabel: resumeRow.topicLabel,
            startedAt: resumeRow.startedAt.toISOString(),
          }
        : null,
      micSupported: true, // client overrides after a real capability probe
    }
    return NextResponse.json(home)
  } catch (err) {
    console.error('voice/home error:', err)
    const home: VoiceHome = {
      modes: VOICE_MODES,
      stats: { sessions: 0, minutes: 0, questions: 0, accuracy: null, lastSessionAt: null },
      suggestions: [{ mode: 'listen', line: 'Pick a topic and just listen — hands-free.', topicId: null }],
      revisionDue: 0,
      weak: [],
      resume: null,
      micSupported: true,
    }
    return NextResponse.json({ ...home, degraded: true })
  }
}
