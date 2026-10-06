import { NextRequest, NextResponse } from 'next/server'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { REPORT_REASONS, reportResource } from '@/lib/resource-hub'

export const dynamic = 'force-dynamic'

// POST /api/library/report {resourceId, reason, details?} — quality-control
// report over a catalog resource. 400 on an invalid reason or id.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ resourceId?: unknown; reason?: unknown; details?: unknown }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const resourceId = asTrimmed(body.resourceId, 120)
    const reason = asTrimmed(body.reason, 20)
    if (!resourceId || !reason) {
      return NextResponse.json({ error: 'resourceId and reason are required' }, { status: 400 })
    }
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
      return NextResponse.json(
        { error: `reason must be one of: ${REPORT_REASONS.join(', ')}` },
        { status: 400 },
      )
    }
    const details = asTrimmed(body.details, 500) ?? ''

    const profile = await getDemoProfile()
    let result
    try {
      result = await reportResource(profile.id, resourceId, reason as (typeof REPORT_REASONS)[number], details)
    } catch {
      return NextResponse.json({ error: 'resourceId must reference a catalog resource' }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('library report error:', err)
    return NextResponse.json({ error: 'Failed to record the report' }, { status: 500 })
  }
}
