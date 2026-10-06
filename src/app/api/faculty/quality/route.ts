import { NextResponse } from 'next/server'
import { getQuality } from '@/lib/faculty-engine'

export const dynamic = 'force-dynamic'

// GET /api/faculty/quality — measured QC findings (PRODUCT 19): answer-key
// distribution + skew, duplicate stems, ambiguous options, thin explanations,
// missing option notes/citations, outdated or unverified resources, open
// student reports and the fail-after-read pattern measured on THIS account.
// Findings are flagged FOR human review — never auto-resolved.
export async function GET() {
  try {
    const payload = await getQuality()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/quality error:', err)
    return NextResponse.json({ error: 'Quality findings failed to load' }, { status: 500 })
  }
}
