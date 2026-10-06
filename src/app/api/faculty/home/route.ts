import { NextResponse } from 'next/server'
import { getHome } from '@/lib/faculty-engine'

export const dynamic = 'force-dynamic'

// GET /api/faculty/home — the workspace dashboard payload (PRODUCT 19).
// Fully computed-on-read: inventory, gaps, quality, drafts, versions and
// recommendations, assembled once for the sticky header + overview tab.
export async function GET() {
  try {
    const payload = await getHome()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/home error:', err)
    return NextResponse.json({ error: 'Faculty workspace failed to load' }, { status: 500 })
  }
}
