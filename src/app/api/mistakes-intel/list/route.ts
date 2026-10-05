import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { loadMistakeContext, modePredicate, modeSort } from '@/lib/mistake-intel'
import type { MistakeListPayload, MistakeMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MODES: MistakeMode[] = ['today', 'repeated', 'impact', 'unresolved', 'forgotten', 'exam']

// GET /api/mistakes-intel/list?mode=&subject=&type=&difficulty=&status=
// The personalized mistake review — six measured modes plus filters.
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const sp = req.nextUrl.searchParams
    const modeParam = sp.get('mode') ?? 'unresolved'
    const mode = (MODES as readonly string[]).includes(modeParam) ? (modeParam as MistakeMode) : 'unresolved'
    const subject = sp.get('subject') ?? ''
    const errorType = sp.get('type') ?? ''
    const difficulty = sp.get('difficulty') ?? ''

    const ctx = await loadMistakeContext(profile.id)

    let rows = ctx.rows.filter(modePredicate(mode))
    if (subject) rows = rows.filter((r) => r.subjectCode === subject)
    if (errorType) rows = rows.filter((r) => r.errorType === errorType)
    if (difficulty) rows = rows.filter((r) => String(r.difficulty) === difficulty)
    rows = rows.sort(modeSort(mode))

    const payload: MistakeListPayload = { rows: rows.slice(0, 60), total: rows.length, mode }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[api/mistakes-intel/list] GET failed:', err)
    return NextResponse.json({ error: 'Failed to list mistakes' }, { status: 500 })
  }
}
