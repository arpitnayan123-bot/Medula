import { NextResponse } from 'next/server'
import { getInventory } from '@/lib/faculty-engine'

export const dynamic = 'force-dynamic'

// GET /api/faculty/inventory — measured content inventory (PRODUCT 19):
// totals, per-subject coverage and the organization issues (unlinked
// questions/flashcards) — all live counts, nothing estimated.
export async function GET() {
  try {
    const payload = await getInventory()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/inventory error:', err)
    return NextResponse.json({ error: 'Inventory failed to load' }, { status: 500 })
  }
}
