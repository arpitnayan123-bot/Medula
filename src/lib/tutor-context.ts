import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import type { TutorContextPayload } from '@/lib/types'

// PRODUCT 03 — AI MEDICAL TUTOR
// One builder, two consumers:
//   · GET /api/tutor/context  → the client "what your tutor knows" panel
//   · POST /api/tutor         → the personalization block inside the system prompt
// Everything here is MEASURED platform data (knowledge states, attempts,
// error patterns, revision queue) — the tutor is told never to invent more.

export function yearLabelFor(year: number): string {
  return year <= 4 ? `Year ${year} MBBS` : year === 5 ? 'Intern' : 'Dedicated NEET-PG aspirant'
}

export async function buildTutorContext(topicId?: string | null): Promise<TutorContextPayload> {
  const profile = await getDemoProfile()

  const [states, errorPatterns, dueCount, topRevision, wrongAttempts, drills, attemptsTotal] = await Promise.all([
    db.knowledgeState.findMany({
      where: { profileId: profile.id, attemptCount: { gt: 0 } },
      include: { concept: { select: { name: true } } },
      orderBy: [{ score: 'asc' }, { priority: 'desc' }],
      take: 6,
    }),
    db.errorPattern.findMany({
      where: { profileId: profile.id, count: { gt: 0 } },
      orderBy: { count: 'desc' },
      take: 3,
    }),
    db.revisionItem.count({ where: { profileId: profile.id, cleared: false } }),
    db.revisionItem.findMany({
      where: { profileId: profile.id, cleared: false },
      include: { concept: { select: { name: true } } },
      orderBy: { priority: 'desc' },
      take: 3,
    }),
    db.questionAttempt.findMany({
      where: { profileId: profile.id, correct: false, question: { conceptId: { not: null } } },
      include: { question: { select: { conceptId: true, concept: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
    db.studySession.count({ where: { profileId: profile.id, kind: 'drill' } }),
    db.questionAttempt.count({ where: { profileId: profile.id } }),
  ])

  const weak = states
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((s) => ({
      conceptId: s.conceptId,
      name: s.concept.name,
      mastery: Math.round(s.score),
      attempts: s.attemptCount,
      status: s.status,
    }))

  // Group the student's wrong attempts by linked concept → recurring misses.
  const missedMap = new Map<string, { conceptId: string | null; name: string; count: number }>()
  for (const a of wrongAttempts) {
    const name = a.question.concept?.name
    if (!name) continue
    const key = a.question.conceptId ?? name
    const entry = missedMap.get(key) ?? { conceptId: a.question.conceptId, name, count: 0 }
    entry.count += 1
    missedMap.set(key, entry)
  }
  const missed = [...missedMap.values()].sort((a, b) => b.count - a.count).slice(0, 5)

  const errorTypes = errorPatterns.map((e) => ({ type: e.errorType, count: e.count }))

  const payload: TutorContextPayload = {
    profile: {
      yearLabel: yearLabelFor(profile.year),
      prepStage: profile.prepStage,
      learningStyles: Array.isArray(profile.learningStyles) ? (profile.learningStyles as string[]) : [],
      attemptsTotal,
    },
    weak,
    missed,
    errorTypes,
    revision: { due: dueCount, top: topRevision.map((r) => r.concept.name) },
    drills,
  }

  // Optional teaching context: the topic the student is currently studying.
  if (topicId) {
    const topic = await db.topic.findUnique({
      where: { id: topicId },
      include: {
        subject: { select: { name: true, code: true } },
        concepts: { select: { id: true, name: true } },
      },
    })
    if (topic) {
      const conceptIds = topic.concepts.map((c) => c.id)
      const [questions, cases, cards, mark, topicStates] = await Promise.all([
        db.question.count({ where: { OR: [{ topicId: topic.id }, { conceptId: { in: conceptIds } }] } }),
        topic.system ? db.clinicalCase.count({ where: { system: topic.system } }) : 0,
        db.flashcard.count({ where: { concept: { topicId: topic.id } } }),
        db.learnProgress.findUnique({
          where: { profileId_kind_entityId: { profileId: profile.id, kind: 'topic', entityId: topic.id } },
        }),
        conceptIds.length
          ? db.knowledgeState.findMany({
              where: { profileId: profile.id, conceptId: { in: conceptIds }, attemptCount: { gt: 0 } },
              orderBy: { score: 'asc' },
              take: 1,
              include: { concept: { select: { name: true } } },
            })
          : [],
      ])
      payload.topic = {
        id: topic.id,
        name: topic.name,
        subjectName: topic.subject.name,
        subjectCode: topic.subject.code,
        system: topic.system,
        importance: topic.importance,
        mark: mark?.status ?? null,
        questions,
        cases,
        cards,
        weak: topicStates[0]
          ? { conceptId: topicStates[0].conceptId, name: topicStates[0].concept.name, mastery: Math.round(topicStates[0].score) }
          : null,
      }
    }
  }

  return payload
}

// ── System-prompt serialization ────────────────────────────────────────────
// Compact, instruction-oriented rendering of the same measured data for the
// model. Kept separate from the client payload so the two can evolve.

const ERROR_LABELS: Record<string, string> = {
  didnt_know: 'did not know the fact',
  forgot: 'knew it once but forgot',
  misread: 'misread the question',
  confused: 'confused similar concepts',
  calculation: 'calculation slip',
  reasoning: 'reasoning error',
  changed: 'changed the right answer',
  time: 'ran out of time',
  guess: 'guessed',
}

export function serializePersonalization(ctx: TutorContextPayload): string {
  const lines: string[] = []
  lines.push(`STUDENT PROFILE: ${ctx.profile.yearLabel}, preparation stage: ${ctx.profile.prepStage}.`)
  if (ctx.profile.learningStyles.length)
    lines.push(`PREFERRED LEARNING STYLES: ${ctx.profile.learningStyles.join(', ')} — lean into these formats.`)
  if (ctx.profile.attemptsTotal > 0) lines.push(`Total MCQ attempts on the platform: ${ctx.profile.attemptsTotal}.`)

  if (ctx.weak.length) {
    lines.push('WEAK AREAS (mastery %, measured):')
    for (const w of ctx.weak) lines.push(`  - ${w.name}: mastery ~${w.mastery}% over ${w.attempts} attempts (${w.status})`)
  }
  if (ctx.missed.length) {
    lines.push('RECENTLY MISSED (wrong MCQ answers, last 150):')
    for (const m of ctx.missed) lines.push(`  - ${m.name}: missed ${m.count}×`)
  }
  if (ctx.errorTypes.length) {
    lines.push('MISTAKE PATTERN:')
    for (const e of ctx.errorTypes) lines.push(`  - ${ERROR_LABELS[e.type] ?? e.type}: ${e.count}×`)
  }
  if (ctx.revision.due > 0) {
    lines.push(
      `REVISION DUE: ${ctx.revision.due} item(s)${ctx.revision.top.length ? ` — highest priority: ${ctx.revision.top.join(', ')}` : ''}.`,
    )
  }
  if (ctx.drills > 0) lines.push(`Completed Socratic drills: ${ctx.drills}.`)

  return lines.join('\n')
}

export const PERSONALIZATION_RULES = `PERSONALIZATION RULES:
- Adapt difficulty, depth and examples to the student's level and weak areas above.
- When a weak area or repeated mistake is relevant to the current question, proactively address the likely misconception (e.g. if the student repeatedly confuses two entities, explicitly contrast them).
- You may suggest revising weak items or doing platform MCQs — but only when genuinely relevant.
- NEVER claim memories of conversations beyond the data above; this data IS what you know about the student.`
