import { NextRequest, NextResponse } from 'next/server'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { libraryAi } from '@/lib/resource-hub'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/library/ai — grounded assistant over OUR catalog metadata only.
// recommend: picks ≤3 ids from a scored candidate list (invented ids dropped).
// key-points / compare: metadata-only study pointers / comparison with
// deterministic fallbacks when the model is unavailable.

const MODES = new Set(['recommend', 'key-points', 'compare'])

export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ mode?: unknown; resourceIds?: unknown; query?: unknown }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const mode = asTrimmed(body.mode, 20)
    if (!mode || !MODES.has(mode)) {
      return NextResponse.json(
        { error: 'mode must be one of: recommend, key-points, compare' },
        { status: 400 },
      )
    }

    const resourceIds = Array.isArray(body.resourceIds)
      ? body.resourceIds.filter((v): v is string => typeof v === 'string').slice(0, 2).map((v) => v.slice(0, 120))
      : []
    const query = asTrimmed(body.query, 300) ?? undefined

    const profile = await getDemoProfile()
    let payload
    try {
      payload = await libraryAi(profile.id, {
        mode: mode as 'recommend' | 'key-points' | 'compare',
        resourceIds,
        query,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'INVALID_RESOURCE' || msg === 'INVALID_RESOURCES') {
        return NextResponse.json(
          { error: 'resourceIds must reference catalog resources that currently exist' },
          { status: 400 },
        )
      }
      if (msg === 'INVALID_MODE') {
        return NextResponse.json({ error: 'mode must be one of: recommend, key-points, compare' }, { status: 400 })
      }
      throw err
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('library ai error:', err)
    return NextResponse.json({ error: 'AI assistance is unavailable right now' }, { status: 500 })
  }
}
