import { NextResponse } from 'next/server'
import { readJson, asTrimmed } from '@/lib/http'
import { getReviewQueue, reviewAction, FacultyHttpError, type ReviewActionInput } from '@/lib/faculty-engine'
import type { FacultyEntityType, FacultySeverity } from '@/lib/types'

export const dynamic = 'force-dynamic'

const SEVERITIES: FacultySeverity[] = ['info', 'warning', 'critical']

// GET /api/faculty/review — the human queue (PRODUCT 19): open review items
// (most severe first) plus drafts waiting in review.
export async function GET() {
  try {
    const payload = await getReviewQueue()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/review GET error:', err)
    return NextResponse.json({ error: 'Review queue failed to load' }, { status: 500 })
  }
}

// POST /api/faculty/review — flag / resolve / dismiss.
//   flag     (engine or reviewer) sends a finding to the queue — idempotent per
//            (entityType, entityId, kind): re-flags refresh evidence, never spam.
//   resolve  requires a reviewer note — the decision leaves the queue, recorded.
//   dismiss  requires a reviewer note — nothing is silently dropped.
export async function POST(req: Request) {
  const body = await readJson<Record<string, unknown>>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const action = asTrimmed(body.action, 10)
  if (action !== 'flag' && action !== 'resolve' && action !== 'dismiss') {
    return NextResponse.json({ error: 'action must be one of: flag, resolve, dismiss' }, { status: 400 })
  }

  const input: ReviewActionInput = {
    action,
    itemId: asTrimmed(body.itemId, 100) ?? undefined,
    kind: asTrimmed(body.kind, 60) ?? undefined,
    entityType: (asTrimmed(body.entityType, 20) ?? undefined) as FacultyEntityType | undefined,
    entityId: asTrimmed(body.entityId, 200) ?? undefined,
    severity: (asTrimmed(body.severity, 10) ?? undefined) as FacultySeverity | undefined,
    evidence: Array.isArray(body.evidence) ? (body.evidence as unknown[]).filter((e): e is string => typeof e === 'string').slice(0, 8) : undefined,
    suggestion: asTrimmed(body.suggestion, 400) ?? undefined,
    reviewerNote: asTrimmed(body.reviewerNote, 280) ?? undefined,
  }
  if (input.severity && !SEVERITIES.includes(input.severity)) input.severity = undefined

  try {
    const result = await reviewAction(input)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FacultyHttpError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('faculty/review POST error:', err)
    return NextResponse.json({ error: 'The review action did not go through' }, { status: 500 })
  }
}
