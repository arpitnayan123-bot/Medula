import { NextResponse } from 'next/server'
import { getGaps } from '@/lib/faculty-engine'

export const dynamic = 'force-dynamic'

// GET /api/faculty/gaps — demand-ranked content gaps (PRODUCT 19).
// Every gap is measured (lesson presence, practice/revision pools, prereq
// graph, case linkage, review staleness, unlinked rows) and ranked by the
// published priority rule: exam weight × learner demand × severity.
export async function GET() {
  try {
    const payload = await getGaps()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/gaps error:', err)
    return NextResponse.json({ error: 'Gap map failed to load' }, { status: 500 })
  }
}
