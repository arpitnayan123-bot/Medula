import { NextResponse } from 'next/server'
import { readJson, asTrimmed } from '@/lib/http'
import { patchDraft, FacultyHttpError, type PatchDraftInput } from '@/lib/faculty-engine'

export const dynamic = 'force-dynamic'

// POST /api/faculty/drafts/[id] — the reviewer gate (PRODUCT 19).
//   action=submit   draft → in-review (change note required)
//   action=publish  in-review → published (reviewer note REQUIRED; mints a
//                   FacultyContentVersion attributed to the reviewer; optional
//                   applyLesson merges the body additively into the concept's
//                   lesson — learning history is never rewritten)
//   action=reject   draft|in-review → rejected (reviewer note required)
// AI output can never reach `published` without this explicit human action.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await readJson<Record<string, unknown>>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const action = asTrimmed(body.action, 10)
  if (action !== 'submit' && action !== 'publish' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be one of: submit, publish, reject' }, { status: 400 })
  }

  const input: PatchDraftInput = {
    action,
    changeNote: asTrimmed(body.changeNote, 280) ?? undefined,
    reviewerNote: asTrimmed(body.reviewerNote, 280) ?? undefined,
    applyLesson: body.applyLesson === true,
  }

  try {
    const result = await patchDraft(id, input)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof FacultyHttpError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('faculty/drafts/[id] POST error:', err)
    return NextResponse.json({ error: 'The draft action did not go through' }, { status: 500 })
  }
}
