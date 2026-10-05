import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { asInt, asTrimmed, readJson } from '@/lib/http'
import {
  buildPlan,
  defaultBudgetMinutes,
  hydrateContent,
  loadRevisionContext,
  parseStoredBlocks,
  planFromStored,
} from '@/lib/revision-engine'
import { REVISION_BLOCK_KIND_LABELS, REVISION_MODES } from '@/lib/types'
import type { RevisionBlockKind, RevisionMode, RevisionSessionResume, RevisionSessionStart } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ─── POST /api/revision/smart/session — start a revision session ────────────
// Body: {mode, minutes?, subjects?, kinds?}. Custom mode accepts subject/kind
// filters; every other mode ignores them. The plan is snapshotted into the
// RevisionSession row (ids + reasons only — never answers); content is
// hydrated fresh so the client never receives explanation/answer fields.
export async function POST(req: NextRequest) {
  const body = await readJson<{ mode?: unknown; minutes?: unknown; subjects?: unknown; kinds?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const modeRaw = asTrimmed(body.mode, 20)
  if (!modeRaw || !REVISION_MODES.some((m) => m.id === modeRaw)) {
    return NextResponse.json(
      { error: `mode must be one of: ${REVISION_MODES.map((m) => m.id).join(', ')}` },
      { status: 400 },
    )
  }
  const mode = modeRaw as RevisionMode

  // subjects: up to 8 trimmed strings (custom filter)
  let subjects: string[] = []
  if (body.subjects !== undefined) {
    if (!Array.isArray(body.subjects)) return NextResponse.json({ error: 'subjects must be an array of subject codes' }, { status: 400 })
    subjects = body.subjects
      .map((s) => asTrimmed(s, 40))
      .filter((s): s is string => !!s)
      .slice(0, 8)
  }

  // kinds: validated against the frozen block-kind list (custom filter)
  const validKinds = Object.keys(REVISION_BLOCK_KIND_LABELS) as RevisionBlockKind[]
  let kinds: RevisionBlockKind[] = []
  if (body.kinds !== undefined) {
    if (!Array.isArray(body.kinds)) return NextResponse.json({ error: `kinds must be an array of: ${validKinds.join(', ')}` }, { status: 400 })
    for (const k of body.kinds) {
      const kind = asTrimmed(k, 20)
      if (!kind || !validKinds.includes(kind as RevisionBlockKind)) {
        return NextResponse.json({ error: `kinds must be an array of: ${validKinds.join(', ')}` }, { status: 400 })
      }
      if (!kinds.includes(kind as RevisionBlockKind)) kinds.push(kind as RevisionBlockKind)
    }
    kinds = kinds.slice(0, validKinds.length)
  }

  const profile = await getDemoProfile()
  const ctx = await loadRevisionContext(profile.id)

  // Budget: explicit minutes win; otherwise rapid sprints default to 10 and
  // every other mode to the profile's daily budget ladder value.
  const fallbackMinutes = mode === 'rapid' ? 10 : defaultBudgetMinutes(ctx.dailyHours)
  const minutes = body.minutes === undefined ? fallbackMinutes : asInt(body.minutes, 5, 120, fallbackMinutes)

  const filters = mode === 'custom' ? { subjects, kinds } : undefined
  const plan = buildPlan(ctx, mode, minutes, filters)
  if (plan.blocks.length === 0) {
    return NextResponse.json(
      { error: 'Nothing to revise for this mode right now — try Daily Revision.' },
      { status: 422 },
    )
  }

  const config: { minutes: number; subjects?: string[]; kinds?: RevisionBlockKind[] } = { minutes }
  if (mode === 'custom') {
    if (subjects.length) config.subjects = subjects
    if (kinds.length) config.kinds = kinds
  }

  const session = await db.revisionSession.create({
    data: {
      profileId: profile.id,
      mode,
      config: JSON.stringify(config),
      plan: JSON.stringify(plan.blocks),
      total: plan.blocks.length,
      done: 0,
      minutes,
      status: 'active',
    },
  })

  const payload: RevisionSessionStart = {
    sessionId: session.id,
    plan: { ...plan, blocks: plan.blocks.map((b) => ({ ...b, done: false })) },
    content: await hydrateContent(ctx, plan),
  }
  return NextResponse.json(payload)
}

// ─── GET /api/revision/smart/session?id= — resume a session ─────────────────
// Ownership-scoped. Blocks come from the stored snapshot (done flags kept);
// content is re-hydrated server-side so answers never live in the stored JSON.
export async function GET(req: NextRequest) {
  const id = asTrimmed(req.nextUrl.searchParams.get('id'), 200)
  if (!id) return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const session = await db.revisionSession.findFirst({ where: { id, profileId: profile.id } })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const ctx = await loadRevisionContext(profile.id)
  const storedBlocks = parseStoredBlocks(session.plan)
  const plan = planFromStored(session, storedBlocks, ctx)

  const payload: RevisionSessionResume = {
    session: {
      id: session.id,
      mode: session.mode as RevisionMode,
      minutes: plan.minutes,
      done: session.done,
      total: session.total,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
    },
    plan,
    content: await hydrateContent(ctx, plan),
  }
  return NextResponse.json(payload)
}
