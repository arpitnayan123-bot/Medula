import { NextResponse } from 'next/server'
import { listVersions } from '@/lib/faculty-engine'

export const dynamic = 'force-dynamic'

// GET /api/faculty/versions — the published content library of record
// (PRODUCT 19). One row per published revision with reviewer, references and
// verification status. Optional filters: ?entityType=&entityId=
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const entityType = url.searchParams.get('entityType') ?? undefined
    const entityId = url.searchParams.get('entityId') ?? undefined
    const payload = await listVersions({ entityType, entityId })
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/versions error:', err)
    return NextResponse.json({ error: 'Versions failed to load' }, { status: 500 })
  }
}
