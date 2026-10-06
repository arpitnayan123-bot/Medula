import { NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { createDraft, listDrafts, FacultyHttpError, type CreateDraftInput } from '@/lib/faculty-engine'
import type { FacultyDraftBody, FacultyDraftKind, FacultyEntityType } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ENTITY_TYPES: FacultyEntityType[] = ['concept', 'question', 'flashcard', 'case', 'resource', 'topic', 'module']
const DRAFT_KINDS: FacultyDraftKind[] = [
  'summary', 'simplify', 'key-points', 'flashcards', 'mcq', 'case', 'revision-notes', 'concept-links', 'manual',
]

// GET /api/faculty/drafts — every draft in the workspace with status counts.
export async function GET() {
  try {
    const payload = await listDrafts()
    return NextResponse.json(payload)
  } catch (err) {
    console.error('faculty/drafts GET error:', err)
    return NextResponse.json({ error: 'Drafts failed to load' }, { status: 500 })
  }
}

// POST /api/faculty/drafts — create a draft (manual notes, or the body an AI
// assist produced in the route that owns the model call). A draft is NEVER
// authoritative: it starts at status=draft and reaches the library only
// through the reviewer gate (PATCH-equivalent action=publish on /[id]).
export async function POST(req: Request) {
  const body = await readJson<Record<string, unknown>>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const entityType = asTrimmed(body.entityType, 20) as FacultyEntityType | null
  const entityId = asTrimmed(body.entityId, 200)
  const kind = asTrimmed(body.kind, 20) as FacultyDraftKind | null
  const title = asTrimmed(body.title, 200)

  if (!entityType || !ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json({ error: `entityType must be one of: ${ENTITY_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!entityId) return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
  if (!kind || !DRAFT_KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${DRAFT_KINDS.join(', ')}` }, { status: 400 })
  }

  const draftBody = (body.body && typeof body.body === 'object' && !Array.isArray(body.body) ? body.body : {}) as FacultyDraftBody

  try {
    const profile = await getDemoProfile()
    const input: CreateDraftInput = {
      profileId: profile.id,
      entityType,
      entityId,
      kind,
      title: title ?? `${entityId} — note`,
      body: draftBody,
      changeNote: asTrimmed(body.changeNote, 280) ?? undefined,
      aiAssisted: body.aiAssisted === true,
      grounded: body.grounded === true,
    }
    const draft = await createDraft(input)
    return NextResponse.json({ draft })
  } catch (err) {
    if (err instanceof FacultyHttpError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('faculty/drafts POST error:', err)
    return NextResponse.json({ error: 'Could not create the draft' }, { status: 500 })
  }
}
