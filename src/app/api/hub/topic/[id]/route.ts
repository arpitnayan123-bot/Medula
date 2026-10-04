// ─── TOPIC HUB API — ONE TOPIC, EVERYTHING (PRODUCT 02) ─────────────────────
// GET /api/hub/topic/<id>[?concept=<id>]
// Extends the shared topic-study builder (Learn, PRODUCT 01) with the hub-only
// sections: Watch, Read, Practice, Cases, Revise, Performance, AI prompts and
// an at-a-glance rollup. A `concept` param focuses the hub on one concept
// (the search → hub path) — it must belong to the topic or it is ignored.
//
// Honesty rules (inherited + enforced here):
//   • Every count is measured from real rows — 0 means zero.
//   • External resources are REAL search/deep links (YouTube channel-scoped
//     searches, StatPearls, Wikipedia, Radiopaedia) — never fabricated embeds
//     or invented video IDs.
//   • Platform Watch items come only from the Understand living-scene library.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { buildTopicStudy, TopicNotFound } from '@/lib/topic-study'
import { BASE_TOPICS } from '@/lib/understand-catalog-base'
import { CATALOG_B } from '@/lib/understand-catalog-b'
import { CATALOG_C } from '@/lib/understand-catalog-c'
import type { HubExternalResource, HubNoteSection, HubWatchPlatform } from '@/lib/types'

export const dynamic = 'force-dynamic'

type UnderstandTopicLike = {
  id: string; title: string; emoji: string; subjectCode: string
  system: string; sceneId?: string; oneLiner: string
}

const ALL_UNDERSTAND: UnderstandTopicLike[] = [...BASE_TOPICS, ...CATALOG_B, ...CATALOG_C]

// Curated anchor: the organ system's primary living scene. This is a mapping
// between two REAL libraries (curriculum systems ↔ Understand scenes) — no
// content is invented.
const SYSTEM_ANCHOR_SCENE: Record<string, string> = {
  cardiovascular: 'u-heart',
  renal: 'u-nephron',
  respiratory: 'u-alveolus',
  neurology: 'u-neuron',
  nervous: 'u-neuron',
  gastrointestinal: 'u-gastric',
}

const QTYPE_LABEL: Record<string, string> = {
  sba: 'Single best answer',
  vignette: 'Clinical vignettes',
  assertion: 'Assertion–reason',
  rapid: 'Rapid recall',
  integrated: 'Integrated',
}

const SECTION_LABELS: Record<string, string> = {
  mechanism: 'Pathophysiology', presentation: 'Clinical features', diagnosis: 'Diagnosis',
  management: 'Management', differentials: 'Differentials', complications: 'Complications',
  reasoning: 'Clinical reasoning', global: 'Global & viva points', numbers: 'Key numbers',
  drugs: 'Drug table', procedures: 'Procedures', imaging: 'Imaging', firstPrinciples: 'First principles',
}

// Measured image-based heuristic: the stem itself references a shown image.
const IMAGE_RE = /\b(x-?ray|radiograph|ecg|eeg|ct scan|mri|ultrasound|histopath|biopsy shown|photograph|smear shown|scan shown|figure shows)\b/i

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
}

// ── Watch: match Understand library scenes for this topic ───────────────────
function matchPlatformScenes(
  topicName: string,
  system: string | null,
  subjectCode: string,
  conceptNames: string[],
): HubWatchPlatform[] {
  const byCatalogId = new Map(ALL_UNDERSTAND.map((t) => [t.id, t]))
  const scores = new Map<string, number>()

  // 1) Curated system anchor — strongest signal
  const anchorId = system ? SYSTEM_ANCHOR_SCENE[system] : undefined
  if (anchorId && byCatalogId.has(anchorId)) scores.set(anchorId, (scores.get(anchorId) ?? 0) + 4)

  // 2) Topic-name token overlap with the catalog topic title/system
  const topicTokens = new Set([...tokenize(topicName), ...tokenize(system ?? '')])
  // 3) Concept-name tokens (they often carry the distinctive vocabulary)
  const conceptTokens = new Set(conceptNames.flatMap((n) => tokenize(n)))

  for (const t of ALL_UNDERSTAND) {
    const titleTokens = tokenize(`${t.title} ${t.system}`)
    let score = scores.get(t.id) ?? 0
    for (const tok of titleTokens) {
      if (topicTokens.has(tok)) score += 3
      if (conceptTokens.has(tok)) score += 2
    }
    if (t.subjectCode === subjectCode) score += 1
    if (score > (scores.get(t.id) ?? 0)) scores.set(t.id, score)
  }

  return [...scores.entries()]
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cid, s]) => {
      const t = byCatalogId.get(cid)!
      return {
        id: t.id,
        title: t.title,
        emoji: t.emoji,
        oneLiner: t.oneLiner,
        sceneId: t.sceneId ?? null,
        anchor: s >= 4, // came from the curated anchor or heavy overlap
      }
    })
}

// ── Watch/Read externals: real, stable entry points ─────────────────────────
function externalResources(topicName: string, kind: 'video' | 'reference' | 'imaging'): HubExternalResource[] {
  const q = encodeURIComponent(topicName)
  if (kind === 'video') {
    return [
      { label: `${topicName} lectures`, provider: 'Osmosis', kind: 'video', note: 'Opens a channel-scoped YouTube search — pick a lecture', url: `https://www.youtube.com/results?search_query=${q}+osmosis` },
      { label: `${topicName} deep dives`, provider: 'Ninja Nerd', kind: 'video', note: 'Opens a channel-scoped YouTube search — whiteboard lectures', url: `https://www.youtube.com/results?search_query=${q}+ninja+nerd` },
      { label: `${topicName} for exams`, provider: 'Zero To Finals', kind: 'video', note: 'Opens a channel-scoped YouTube search — concise clinical takes', url: `https://www.youtube.com/results?search_query=${q}+zero+to+finals` },
    ]
  }
  if (kind === 'imaging') {
    return [{ label: `${topicName} imaging`, provider: 'Radiopaedia', kind: 'imaging', note: 'Real radiology case library — open the search', url: `https://radiopaedia.org/search?q=${q}` }]
  }
  return [
    { label: `${topicName} chapter`, provider: 'StatPearls (NCBI)', kind: 'reference', note: 'Peer-reviewed clinical reference — opens its search', url: `https://www.ncbi.nlm.nih.gov/books/?term=${q}` },
    { label: `${topicName} overview`, provider: 'Wikipedia', kind: 'reference', note: 'Background reading — verify numbers against textbooks', url: `https://en.wikipedia.org/w/index.php?search=${q}` },
  ]
}

// ── concept.detail → readable note blocks ───────────────────────────────────
function extractNotes(detail: unknown, conceptId: string, conceptName: string): HubNoteSection[] {
  if (!Array.isArray(detail)) return []
  const out: HubNoteSection[] = []
  for (const block of detail.slice(0, 6)) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as { h?: unknown; body?: unknown; table?: unknown }
    if (typeof b.h !== 'string') continue
    const bullets = Array.isArray(b.body) ? b.body.filter((x): x is string => typeof x === 'string') : []
    let table: HubNoteSection['table'] = null
    if (b.table && typeof b.table === 'object' && !Array.isArray(b.table)) {
      const t = b.table as { headers?: unknown; rows?: unknown }
      if (Array.isArray(t.headers) && Array.isArray(t.rows)) {
        table = {
          headers: t.headers.filter((x): x is string => typeof x === 'string'),
          rows: t.rows
            .filter((r): r is unknown[] => Array.isArray(r))
            .map((r) => r.map((x) => String(x)))
            .slice(0, 8),
        }
      }
    }
    if (bullets.length === 0 && !table) continue
    out.push({ conceptId, conceptName, heading: b.h, bullets, table })
  }
  return out
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const focusParam = req.nextUrl.searchParams.get('concept')
  try {
    const [study, profile] = await Promise.all([buildTopicStudy(id), getDemoProfile()])
    const conceptIds = study.concepts.map((c) => c.id)

    // ── focus concept (search hand-off) — must belong to this topic ─────────
    let focusConcept: { id: string; name: string; summary: string; whyMatters: string } | null = null
    if (focusParam && conceptIds.includes(focusParam)) {
      const fc = await db.concept.findUnique({
        where: { id: focusParam },
        select: { id: true, name: true, summary: true, whyMatters: true },
      })
      if (fc) focusConcept = { id: fc.id, name: fc.name, summary: fc.summary, whyMatters: fc.whyMatters }
    }

    // ── raw concept rows for notes/detail ───────────────────────────────────
    const conceptRows = await db.concept.findMany({
      where: { topicId: id },
      select: { id: true, name: true, detail: true, summary: true },
    })
    const notes = [...conceptRows]
      .sort((a, b) => (focusConcept?.id === a.id ? -1 : focusConcept?.id === b.id ? 1 : 0))
      .flatMap((c) => extractNotes(c.detail, c.id, c.name))
      .slice(0, 6)

    // ── WATCH ───────────────────────────────────────────────────────────────
    const platform = matchPlatformScenes(
      study.topic.name, study.topic.system, study.topic.subject.code,
      conceptRows.map((c) => c.name),
    )
    const watchExternal = externalResources(study.topic.name, 'video')

    // ── READ ────────────────────────────────────────────────────────────────
    const availableSections = Object.entries(study.sections)
      .filter(([, ok]) => ok)
      .map(([k]) => SECTION_LABELS[k] ?? k)
    const readExternal = [...externalResources(study.topic.name, 'reference'), ...externalResources(study.topic.name, 'imaging')]

    // ── PRACTICE ────────────────────────────────────────────────────────────
    const topicQuestions = conceptIds.length
      ? await db.question.findMany({
          where: { OR: [{ topicId: id }, { conceptId: { in: conceptIds } }] },
          select: { id: true, qtype: true, difficulty: true, stem: true },
        })
      : []
    const byTypeMap = new Map<string, number>()
    let highYield = 0
    let imageBased = 0
    for (const q of topicQuestions) {
      byTypeMap.set(q.qtype, (byTypeMap.get(q.qtype) ?? 0) + 1)
      if (q.difficulty >= 3) highYield += 1
      if (IMAGE_RE.test(q.stem)) imageBased += 1
    }
    const byType = [...byTypeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([qtype, count]) => ({ qtype, label: QTYPE_LABEL[qtype] ?? qtype, count }))

    const topicQuestionIds = topicQuestions.map((q) => q.id)
    const [attemptAgg, lastAttempt] = await Promise.all([
      topicQuestionIds.length
        ? db.questionAttempt.groupBy({
            by: ['correct'],
            where: { profileId: profile.id, questionId: { in: topicQuestionIds } },
            _count: true,
          })
        : Promise.resolve([] as { correct: boolean; _count: number }[]),
      topicQuestionIds.length
        ? db.questionAttempt.findFirst({
            where: { questionId: { in: topicQuestionIds } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ])
    const attemptsTotal = attemptAgg.reduce((a, r) => a + r._count, 0)
    const attemptsCorrect = attemptAgg.find((r) => r.correct)?._count ?? 0

    // ── CASES with best score ───────────────────────────────────────────────
    const caseIds = study.cases.map((c) => c.id)
    const caseRuns = caseIds.length
      ? await db.caseRun.findMany({
          where: { caseId: { in: caseIds } },
          select: { caseId: true, score: true, completedAt: true },
          orderBy: { completedAt: 'desc' },
        })
      : []
    const bestByCase = new Map<string, number>()
    for (const r of caseRuns) {
      const cur = bestByCase.get(r.caseId)
      if (cur === undefined || r.score > cur) bestByCase.set(r.caseId, r.score)
    }
    const hubCases = study.cases.map((c) => ({
      id: c.id, title: c.title, specialty: c.specialty, difficulty: c.difficulty,
      attempted: bestByCase.has(c.id),
      bestScore: bestByCase.get(c.id) ?? null,
    }))

    // ── REVISE ──────────────────────────────────────────────────────────────
    const now = new Date()
    const [topicCards, dueReviews, revItems, pairs, wrongAttempts] = await Promise.all([
      db.flashcard.findMany({
        where: { conceptId: { in: conceptIds } },
        select: { id: true },
      }),
      conceptIds.length
        ? db.flashcardReview.findMany({
            where: { profileId: profile.id, dueAt: { lte: now }, flashcard: { conceptId: { in: conceptIds } } },
            select: { flashcardId: true },
          })
        : Promise.resolve([] as { flashcardId: string }[]),
      conceptIds.length
        ? db.revisionItem.findMany({
            where: { profileId: profile.id, conceptId: { in: conceptIds }, cleared: false },
            select: { conceptId: true, reason: true, dueAt: true, minutes: true },
            orderBy: { dueAt: 'asc' },
            take: 6,
          })
        : Promise.resolve([] as { conceptId: string; reason: string; dueAt: Date; minutes: number }[]),
      db.confusionPair.findMany({
        where: {
          OR: [
            { subjectCode: study.topic.subject.code, ...(study.topic.system ? { system: study.topic.system } : {}) },
            ...conceptRows.slice(0, 6).flatMap((c) => [
              { a: { contains: c.name.slice(0, 24) } },
              { b: { contains: c.name.slice(0, 24) } },
            ]),
          ],
        },
        select: { id: true, a: true, b: true, mnemonic: true },
        take: 4,
      }),
      topicQuestionIds.length
        ? db.questionAttempt.findMany({
            where: { correct: false, questionId: { in: topicQuestionIds } },
            select: { question: { select: { conceptId: true } } },
            orderBy: { createdAt: 'desc' },
            take: 120,
          })
        : Promise.resolve([] as { question: { conceptId: string | null } }[]),
    ])
    const missedMap = new Map<string, number>()
    for (const a of wrongAttempts) {
      const cid = a.question.conceptId
      if (!cid || !conceptIds.includes(cid)) continue
      missedMap.set(cid, (missedMap.get(cid) ?? 0) + 1)
    }
    const conceptNameById = new Map(study.concepts.map((c) => [c.id, c.name]))
    const missedConcepts = [...missedMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cid, misses]) => ({ id: cid, name: conceptNameById.get(cid) ?? cid, misses }))
    const revConceptName = new Map(conceptRows.map((c) => [c.id, c.name]))
    const dueCardCount = new Set(dueReviews.map((d) => d.flashcardId)).size

    // ── PERFORMANCE ─────────────────────────────────────────────────────────
    const engaged = study.concepts.filter((c) => c.mastery > 0)
    const weakConcepts = study.concepts
      .filter((c) => c.mastery > 0 && (c.mastery < 50 || c.learnStatus === 'needs-revision'))
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.name, mastery: c.mastery }))

    const [recentAttempts, recentRuns, recentReviews] = await Promise.all([
      topicQuestionIds.length
        ? db.questionAttempt.findMany({
            where: { questionId: { in: topicQuestionIds } },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { correct: true, createdAt: true },
          })
        : Promise.resolve([] as { correct: boolean; createdAt: Date }[]),
      caseIds.length
        ? db.caseRun.findMany({
            where: { caseId: { in: caseIds } },
            orderBy: { completedAt: 'desc' },
            take: 2,
            select: { score: true, completedAt: true, case: { select: { title: true } } },
          })
        : Promise.resolve([] as { score: number; completedAt: Date; case: { title: string } }[]),
      conceptIds.length
        ? db.flashcardReview.findMany({
            where: { flashcard: { conceptId: { in: conceptIds } }, reviewedAt: { not: null } },
            orderBy: { reviewedAt: 'desc' },
            take: 2,
            select: { reviewedAt: true, lastGrade: true },
          })
        : Promise.resolve([] as { reviewedAt: Date | null; lastGrade: number }[]),
    ])
    const recentActivity = [
      ...recentAttempts.map((a) => ({ kind: 'practice', label: a.correct ? 'Answered a question correctly' : 'Missed a question', at: a.createdAt.toISOString() })),
      ...recentRuns.map((r) => ({ kind: 'case', label: `Case run: ${r.case.title}`, at: r.completedAt.toISOString() })),
      ...recentReviews.map((r) => ({ kind: 'revise', label: 'Reviewed flashcards', at: (r.reviewedAt ?? new Date()).toISOString() })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 5)

    // ── AI contextual prompts (deterministic templates — no fabricated facts) ─
    const tn = study.topic.name
    const weakest = weakConcepts[0]?.name
    const ai = [
      { label: `Ask about ${tn}`, prompt: `Explain ${tn} at MBBS final-year level — mechanism, presentation, diagnosis and management, with the classic exam angles.`, kind: 'ask' as const },
      { label: 'Explain simply', prompt: `Explain ${tn} in the simplest possible words, as if to a junior student seeing it for the first time. No unexplained jargon.`, kind: 'explain' as const },
      { label: 'Explain with an analogy', prompt: `Give me one memorable everyday analogy for how ${tn} works, then map each part of the analogy back to the real physiology.`, kind: 'analogy' as const },
      { label: 'Quiz me', prompt: '', kind: 'quiz' as const },
      { label: 'Give me clinical cases', prompt: `Walk me through one realistic clinical case of ${tn}, asking me to make decisions at each step, then debrief my reasoning.`, kind: 'cases' as const },
      { label: 'Summarize', prompt: `Summarize ${tn} as high-yield exam points — maximum 10 bullets, each one line.`, kind: 'summarize' as const },
      { label: 'What should I revise?', prompt: weakest
          ? `My weakest concept here is ${weakest}. Build me a focused 15-minute revision plan for ${tn}, starting there.`
          : `Build me a focused 15-minute revision plan for ${tn} covering the highest-yield points.`,
        kind: 'revise' as const },
    ]

    const masteryBase = engaged.length
      ? Math.round(engaged.reduce((a, c) => a + c.mastery, 0) / engaged.length)
      : 0

    return NextResponse.json({
      topic: study.topic,
      focusConcept,
      progress: study.progress,
      statusCounts: study.statusCounts,
      mastery: masteryBase,
      atGlance: {
        concepts: study.concepts.length,
        lessons: study.flow.learn.lessons,
        scenes: platform.length,
        notes: notes.length,
        questions: topicQuestions.length,
        cases: hubCases.length,
        flashcards: topicCards.length,
        dueCards: dueCardCount,
        revisionItems: revItems.length,
      },
      learn: { concepts: study.concepts, groups: study.groups },
      watch: { platform, external: watchExternal },
      read: { sections: availableSections, notes, keyFacts: study.keyFacts, external: readExternal },
      practice: {
        questions: topicQuestions.length,
        byType,
        highYield,
        imageBased,
        attempts: {
          total: attemptsTotal,
          correct: attemptsCorrect,
          accuracy: attemptsTotal > 0 ? Math.round((attemptsCorrect / attemptsTotal) * 100) : null,
          lastAt: lastAttempt?.createdAt.toISOString() ?? null,
        },
      },
      cases: hubCases,
      revise: {
        flashcards: topicCards.length,
        dueCards: dueCardCount,
        revisionItems: revItems.map((r) => ({
          conceptId: r.conceptId,
          conceptName: revConceptName.get(r.conceptId) ?? r.conceptId,
          reason: r.reason,
          dueAt: r.dueAt.toISOString(),
          minutes: r.minutes,
        })),
        confusionPairs: pairs.map((p) => ({ id: p.id, a: p.a, b: p.b, mnemonic: p.mnemonic })),
        missedConcepts,
      },
      performance: {
        attemptsTotal,
        attemptsCorrect,
        accuracy: attemptsTotal > 0 ? Math.round((attemptsCorrect / attemptsTotal) * 100) : null,
        engagedConcepts: engaged.length,
        weakConcepts,
        dueCards: dueCardCount,
        pendingRevision: revItems.length,
        recentActivity,
      },
      connected: study.connectedTopics,
      evidence: study.evidence,
      ai,
    })
  } catch (err) {
    if (err instanceof TopicNotFound) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }
    console.error('[api/hub/topic] request failed:', err)
    return NextResponse.json({ error: 'Failed to load topic hub' }, { status: 500 })
  }
}
