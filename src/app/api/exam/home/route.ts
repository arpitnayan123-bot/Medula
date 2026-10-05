import { NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { buildExamHome } from '@/lib/exam'

export const dynamic = 'force-dynamic'

// GET /api/exam/home — measured Exam Lab dashboard: stats, 9 test modes,
// recent tests, resume banner, weak subjects/concepts, recommendation,
// builder facets and bank honesty counts. Never 500s on empty data.
export async function GET() {
  try {
    const profile = await getDemoProfile()
    const home = await buildExamHome(profile.id)
    return NextResponse.json(home)
  } catch (err) {
    console.error('Exam home error:', err)
    return NextResponse.json({ error: 'Exam home failed to load' }, { status: 500 })
  }
}
