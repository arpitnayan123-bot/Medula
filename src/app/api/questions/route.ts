import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { QuestionClient } from '@/lib/types'
import { getDemoProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

// mix=high-yield → subjects sampled proportionally to their NEET-PG weight
// mix=weak       → prefer questions tied to the profile's weak/unstable concepts
// mix=random     → uniform shuffle (default)
// subjects=MED,SURG → restrict the pool to these subject codes (composable with any mix;
//                       only applied when the single `subjectCode` param is absent)
// topicId=t-…    → topic-focused practice (PRODUCT 02): questions tied to the
//                  topic's concepts (Question.topicId is an unkeyed string, so
//                  the concept relation is the honest source of truth)
// pair=cf-11     → confusion-pair drill: questions tagged to either concept of the
//                  ConfusionPair, topped up from the pair's own subject if short
type Mix = 'random' | 'high-yield' | 'weak'

const MAX_SUBJECT_FILTERS = 25 // hard cap on the comma-separated subjects list
const MAX_COUNT = 100 // hard cap on questions per run (Grand Mock 100)

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const subjectCode = sp.get('subjectCode') ?? undefined
  const subjectsParam = sp.get('subjects') ?? undefined
  const system = sp.get('system') ?? undefined
  const conceptId = sp.get('conceptId') ?? undefined
  const topicId = sp.get('topicId') ?? undefined
  const qtype = sp.get('qtype') ?? undefined
  const pairId = sp.get('pair') ?? undefined
  const mix = (sp.get('mix') ?? 'random') as Mix
  const count = Math.min(MAX_COUNT, Math.max(1, Number(sp.get('count') ?? 10)))

  const where: Record<string, unknown> = {}
  if (subjectCode) {
    where.subjectCode = subjectCode
  } else if (subjectsParam) {
    // Custom paper builder: IN-filter on the requested subject codes.
    // Empty segments are ignored, unknown codes are dropped, list length is capped.
    const requested = [...new Set(subjectsParam.split(',').map((c) => c.trim()).filter(Boolean))]
    if (requested.length > 0) {
      const known = await db.subject.findMany({ select: { code: true } })
      const knownCodes = new Set(known.map((s) => s.code))
      where.subjectCode = { in: requested.filter((c) => knownCodes.has(c)).slice(0, MAX_SUBJECT_FILTERS) }
    }
  }
  if (system) where.system = system
  if (conceptId) where.OR = [{ conceptId }, { concept: { edgesIn: { some: { fromId: conceptId } } } }]
  if (topicId) {
    // Topic pool = questions directly tied to the topic's concepts, plus the
    // rare rows whose string topicId matches. Falls back cleanly when empty.
    const topicConcepts = await db.concept.findMany({ where: { topicId }, select: { id: true } })
    const topicOr: Record<string, unknown>[] = [{ topicId }, { conceptId: { in: topicConcepts.map((c) => c.id) } }]
    where.OR = Array.isArray(where.OR) ? [...(where.OR as Record<string, unknown>[]), ...topicOr] : topicOr
  }
  if (qtype) where.qtype = qtype

  // Confusion-pair drill: resolve the pair, then pull questions tied to either
  // of its concepts. Pairs without concept codes drill from the pair's subject.
  let pairSubject: string | null = null
  if (pairId) {
    const pair = await db.confusionPair.findUnique({ where: { id: pairId } })
    if (!pair) {
      return NextResponse.json({ error: 'Unknown confusion pair' }, { status: 404 })
    }
    const codes = [pair.aCode, pair.bCode].filter(Boolean)
    if (codes.length > 0) {
      where.OR = codes.map((c) => ({ conceptId: c }))
    } else {
      where.subjectCode = pair.subjectCode
    }
    // Remember the pair's subject so a short pool can be topped up below.
    pairSubject = pair.subjectCode
  }

  const all = await db.question.findMany({ where, take: 500 })

  const shuffle = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  let pool: typeof all
  if (mix === 'high-yield' && all.length > 0) {
    // Weighted sampling: subjects with higher NEET-PG weight contribute more.
    const subjects = await db.subject.findMany()
    const weightByCode = new Map(subjects.map(s => [s.code, Math.max(1, s.neetWeight)]))
    const buckets = new Map<string, typeof all>()
    for (const q of shuffle([...all])) {
      const arr = buckets.get(q.subjectCode) ?? []
      arr.push(q)
      buckets.set(q.subjectCode, arr)
    }
    const picked: typeof all = []
    // Repeat weight-proportioned rounds until the ask is met or pools run dry
    while (picked.length < count) {
      const remaining = [...buckets.entries()].filter(([, arr]) => arr.length > 0)
      if (!remaining.length) break
      const totalWeight = remaining.reduce((a, [code, arr]) => a + (weightByCode.get(code) ?? 1) * arr.length, 0)
      let ticket = Math.random() * totalWeight
      let chosen = remaining[0]
      for (const entry of remaining) {
        ticket -= (weightByCode.get(entry[0]) ?? 1) * entry[1].length
        if (ticket <= 0) { chosen = entry; break }
      }
      const [code, arr] = chosen
      picked.push(arr.pop()!)
      if (arr.length === 0) buckets.delete(code)
    }
    pool = picked
  } else if (mix === 'weak') {
    // Prefer questions tied to weak/unstable knowledge states, fill with random.
    const profile = await getDemoProfile()
    const states = await db.knowledgeState.findMany({ where: { profileId: profile.id } })
    const weakIds = new Set(
      states.filter(s => s.status === 'weak' || s.status === 'unstable').map(s => s.conceptId),
    )
    const shuffled = shuffle([...all])
    const preferred = shuffled.filter(q => q.conceptId && weakIds.has(q.conceptId))
    const rest = shuffled.filter(q => !(q.conceptId && weakIds.has(q.conceptId)))
    pool = [...preferred, ...rest].slice(0, count)
  } else {
    // shuffle deterministically-ish then slice
    pool = shuffle([...all]).slice(0, count)
  }

  // Pair drill top-up: if the two concepts alone don't fill the ask, top up
  // from the pair's own subject (excluding what we already picked) so the
  // drill still feels like a run without diluting beyond the subject.
  if (pairId && pairSubject && pool.length < count) {
    const have = new Set(pool.map(q => q.id))
    const filler = await db.question.findMany({
      where: { subjectCode: pairSubject, id: { notIn: [...have] } },
      take: count - pool.length,
    })
    pool = [...pool, ...shuffle(filler)]
  }

  const questions: QuestionClient[] = pool.map(q => ({
    id: q.id, stem: q.stem,
    options: (q.options as { id: string; text: string }[]),
    difficulty: q.difficulty, qtype: q.qtype, subjectCode: q.subjectCode, system: q.system,
    conceptId: q.conceptId ?? undefined,
  }))
  return NextResponse.json({ questions, available: all.length })
}
