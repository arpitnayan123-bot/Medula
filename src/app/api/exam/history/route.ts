import { NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildHistory } from '@/lib/exam'

export const dynamic = 'force-dynamic'

// GET /api/exam/history — performance tracking across submitted tests:
// score/accuracy/speed trends, consistency, subject aggregates with trend,
// measured revision impact, and the honest no-percentile note.
export async function GET() {
  try {
    const profile = await getDemoProfile()
    const history = await buildHistory(profile.id)
    return NextResponse.json(history)
  } catch (err) {
    console.error('Exam history error:', err)
    return NextResponse.json({ error: 'Exam history failed to load' }, { status: 500 })
  }
}
