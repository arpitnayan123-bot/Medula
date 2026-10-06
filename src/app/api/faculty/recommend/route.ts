import { NextResponse } from 'next/server'
import { getRecommend } from '@/lib/faculty-engine'

export const dynamic = 'force-dynamic'

// GET /api/faculty/recommend — personalized focus list (PRODUCT 19).
// Weak concepts from THIS account's knowledge states, ranked by exam weight ×
// measured weakness, each with the resources that exist to close the gap.
export async function GET() {
  try {
    const payload = await getRecommend()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/recommend error:', err)
    return NextResponse.json({ error: 'Recommendations failed to load' }, { status: 500 })
  }
}
