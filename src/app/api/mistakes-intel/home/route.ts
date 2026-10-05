import { NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { detectPatterns, detectParadox, detectBehaviourPatterns, loadMistakeContext, modePredicate } from '@/lib/mistake-intel'
import { ERROR_TYPE_LABELS } from '@/lib/types'
import type { MistakeGenomePayload, MistakePatternCard } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/mistakes-intel/home — the Mistake Genome dashboard.
// Everything measured from this profile's attempt feed, knowledge states,
// error tags and the platform's own tags. Nothing estimated.
export async function GET() {
  try {
    const profile = await getDemoProfile()
    const ctx = await loadMistakeContext(profile.id)
    const openRows = ctx.rows.filter((r) => r.status !== 'resolved')

    // ── patterns ──
    const qMeta = (id: string) => {
      const q = ctx.questionById.get(id)
      return q
        ? { subjectCode: q.subjectCode, conceptId: q.conceptId, difficulty: q.difficulty }
        : { subjectCode: '', conceptId: null, difficulty: 2 }
    }
    const patterns: MistakePatternCard[] = [
      ...detectPatterns({
        rows: ctx.rows,
        wrongAttempts: ctx.wrongAttempts,
        questionById: new Map([...ctx.questionById.keys()].map((id) => [id, qMeta(id)])),
        pairs: ctx.pairs,
        wrongByConcept: ctx.wrongByConcept,
        masteryByConcept: ctx.masteryByConcept,
      }),
      ...detectParadox(ctx.subjectStats, ctx.wrongBySubjectType, ctx.subjectNames),
      ...detectBehaviourPatterns(ctx.wrongAttempts, new Map([...ctx.questionById.keys()].map((id) => [id, qMeta(id)])), ctx.correctByDifficulty),
    ].slice(0, 7)

    // ── review-mode counts + filter facets (over OPEN rows; resolved ones are history) ──
    const modes = ['today', 'repeated', 'impact', 'unresolved', 'forgotten', 'exam'] as const
    const counts = Object.fromEntries(
      modes.map((m) => [m, openRows.filter(modePredicate(m)).length]),
    ) as MistakeGenomePayload['counts']

    const subjectCounts = new Map<string, { name: string; count: number }>()
    const typeCounts = new Map<string, number>()
    const diffCounts = new Map<number, number>()
    for (const r of openRows) {
      const s = subjectCounts.get(r.subjectCode) ?? { name: r.subjectName, count: 0 }
      s.count += 1
      subjectCounts.set(r.subjectCode, s)
      if (r.errorType) typeCounts.set(r.errorType, (typeCounts.get(r.errorType) ?? 0) + 1)
      diffCounts.set(r.difficulty, (diffCounts.get(r.difficulty) ?? 0) + 1)
    }

    // ── totals — mistakeRate over the attempt feed: share of attempts that were wrong ──
    const totalWrongAttempts = ctx.wrongAttempts.length
    const weekAgo = Date.now() - 7 * 24 * 3600_000
    const totals = {
      open: openRows.length,
      resolved: ctx.rows.filter((r) => r.status === 'resolved').length,
      repeated: ctx.rows.filter((r) => r.wrongCount >= 2).length,
      todayCount: counts.today,
      mistakeRate: ctx.totalAttempts
        ? Math.round((totalWrongAttempts / ctx.totalAttempts) * 100)
        : 0,
      resolvedThisWeek: ctx.rows.filter((r) => r.status === 'resolved' && r.resolvedAt && new Date(r.resolvedAt).getTime() >= weekAgo).length,
    }

    // doNext — highest-priority open mistake, with its measured factors
    const doNext = [...openRows].sort((a, b) => b.priority - a.priority)[0] ?? null

    const payload: MistakeGenomePayload = {
      totals,
      doNext,
      patterns,
      counts,
      filters: {
        subjects: [...subjectCounts.entries()]
          .map(([code, s]) => ({ code, name: s.name, count: s.count }))
          .sort((a, b) => b.count - a.count),
        types: [...typeCounts.entries()]
          .map(([id, count]) => ({ id, label: ERROR_TYPE_LABELS[id] ?? id, count }))
          .sort((a, b) => b.count - a.count),
        difficulties: [...diffCounts.entries()]
          .map(([level, count]) => ({ level, count }))
          .sort((a, b) => a.level - b.level),
      },
      insufficientData: ctx.totalAttempts < 5,
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[api/mistakes-intel/home] GET failed:', err)
    return NextResponse.json({ error: 'Failed to compute mistake genome' }, { status: 500 })
  }
}
