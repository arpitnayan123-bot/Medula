import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { parseEvals, parseTranscript } from '@/lib/voice'
import type { VoiceDebrief, VoiceMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/voice/complete — close a spoken session: debrief + honest feeds.
// Feeds run EXACTLY ONCE (double-complete is a 409, same guard as the lab):
//   · StudySession  (kind 'voice') — always, ≥1 minute
//   · ErrorPattern  ('didnt_know' / 'forgot') — for missed/partial concepts
//   · RevisionItem  — for missed concepts that resolve to real platform
//                     concepts (name match); unresolvable names are skipped
//                     and reported honestly in `fed.reason`.
export async function POST(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const body = (await req.json()) as { sessionId?: string }
    if (!body.sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const session = await db.voiceSession.findUnique({ where: { id: body.sessionId } })
    if (!session || session.profileId !== profile.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.status === 'completed') {
      return NextResponse.json({ error: 'Session already completed' }, { status: 409 })
    }

    const now = new Date()
    const durationMs = Math.max(0, now.getTime() - session.startedAt.getTime())
    const transcript = parseTranscript(session.transcript)
    const evals = parseEvals(session.evals)

    await db.voiceSession.update({
      where: { id: session.id },
      data: { status: 'completed', completedAt: now },
    })

    // ── StudySession feed (always) ──
    const minutes = Math.max(1, Math.round(durationMs / 60000))
    await db.studySession.create({
      data: {
        profileId: profile.id,
        minutes,
        kind: 'voice',
        label: session.topicLabel || `${session.mode} voice session`,
      },
    })

    // ── Mistake Intelligence feed (missed/partial spoken answers) ──
    const missed = evals.filter((e) => e.verdict === 'missed')
    const partial = evals.filter((e) => e.verdict === 'partial')
    let errorPatternFed = false
    for (const e of [...missed, ...partial]) {
      const conceptId = await resolveConceptId(e.concept)
      const errorType = e.verdict === 'missed' ? 'didnt_know' : 'forgot'
      // SQLite unique indexes treat NULLs as distinct — an upsert keyed on a
      // null conceptId would keep inserting rows. Dedup manually when the
      // spoken concept name doesn't resolve to a platform concept.
      if (conceptId) {
        await db.errorPattern.upsert({
          where: {
            profileId_errorType_conceptId: { profileId: profile.id, errorType, conceptId },
          },
          create: { profileId: profile.id, errorType, conceptId, count: 1 },
          update: { count: { increment: 1 }, lastAt: now },
        })
      } else {
        const existing = await db.errorPattern.findFirst({
          where: { profileId: profile.id, errorType, conceptId: null },
        })
        if (existing) {
          await db.errorPattern.update({
            where: { id: existing.id },
            data: { count: { increment: 1 }, lastAt: now },
          })
        } else {
          await db.errorPattern.create({
            data: { profileId: profile.id, errorType, conceptId: null, count: 1 },
          })
        }
      }
      errorPatternFed = true
    }

    // ── Smart Revision feed (missed concepts → due revision items) ──
    let revisionFed = false
    let revisionSkipped = 0
    const missedNames = [...new Set(missed.map((e) => e.concept))]
    for (const name of missedNames) {
      const concept = await resolveConcept(name)
      if (!concept) {
        revisionSkipped += 1
        continue
      }
      const existing = await db.revisionItem.findFirst({
        where: { profileId: profile.id, conceptId: concept.id, cleared: false },
      })
      if (!existing) {
        await db.revisionItem.create({
          data: {
            profileId: profile.id,
            conceptId: concept.id,
            reason: `Missed it by voice (${session.mode} session)`,
            priority: 3,
            minutes: 10,
          },
        })
      }
      revisionFed = true
    }

    // ── measured weak areas revisited this session ──
    const states = await db.knowledgeState.findMany({
      where: { profileId: profile.id, attemptCount: { gt: 0 } },
      include: { concept: { select: { name: true } } },
      orderBy: { score: 'asc' },
      take: 30,
    })
    const evalNames = new Set(evals.map((e) => e.concept.toLowerCase()))
    const weakTouched = states
      .filter((s) => evalNames.has(s.concept.name.toLowerCase()))
      .slice(0, 3)
      .map((s) => ({ name: s.concept.name, mastery: Math.round(s.score) }))

    const questions = session.questions
    const reasons: string[] = []
    if (evals.length === 0) reasons.push('no graded spoken answers this session')
    if (errorPatternFed) reasons.push('missed/partial answers fed to Mistake Intelligence')
    if (revisionFed) reasons.push('missed concepts added to Smart Revision')
    if (revisionSkipped > 0) reasons.push(`${revisionSkipped} missed concept name(s) did not match a platform concept — revision skipped for them`)

    const debrief: VoiceDebrief = {
      sessionId: session.id,
      mode: session.mode as VoiceMode,
      topicLabel: session.topicLabel || session.mode,
      durationMs,
      turns: Math.floor(transcript.length / 2),
      questions,
      correct: session.correct,
      accuracy: questions > 0 ? Math.round((session.correct / questions) * 100) : null,
      concepts: evals.slice(-10).map((e) => ({ name: e.concept, verdict: e.verdict, note: e.note })),
      weakTouched,
      fed: {
        studySession: true,
        errorPattern: errorPatternFed,
        revisionItem: revisionFed,
        reason: reasons.join(' · ') || 'no feeds needed',
      },
      handoffs: { revision: true, mistakes: true, planner: true },
    }
    return NextResponse.json(debrief)
  } catch (err) {
    console.error('voice/complete error:', err)
    return NextResponse.json({ error: 'Could not complete the session' }, { status: 500 })
  }
}

// Concept-name → id resolution for the feeds: exact → case-insensitive →
// prefix → contains. Free-spoken concept names are fuzzy, so unresolvable
// ones are skipped and reported honestly rather than guessed.
async function resolveConcept(name: string) {
  const clean = name.trim()
  if (!clean) return null
  const exact = await db.concept.findFirst({ where: { name: clean } })
  if (exact) return exact
  // Prisma on SQLite is case-sensitive for `equals` — try a whitespace-
  // normalized contains as the practical case-insensitive path.
  const ci = await db.concept.findFirst({
    where: { name: { contains: clean.slice(0, Math.max(4, Math.min(clean.length, 24))) } },
    orderBy: { examRelevance: 'desc' },
  })
  if (ci) return ci
  return db.concept.findFirst({
    where: { name: { contains: clean.slice(0, Math.max(4, Math.min(clean.length, 14))) } },
    orderBy: { examRelevance: 'desc' },
  })
}

async function resolveConceptId(name: string): Promise<string | null> {
  const concept = await resolveConcept(name)
  return concept?.id ?? null
}
