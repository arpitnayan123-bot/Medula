import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { loadGraphContext } from '@/lib/knowledge-graph'
import {
  normalizeAskQuery, resolveAskQuery, buildAskGrounding, askAnswerText,
  buildMissPayload, buildAnswerPayload, ASK_AI_BADGE, ASK_DISCLAIMER,
} from '@/lib/ask-engine'
import type { AskAnswerPayload, AskLevel } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/ask/search — the Ask Engine's core endpoint ───────────────────
// Resolve → ground (platform content only) → answer at a level → persist the
// thread. Unresolvable queries get an HONEST miss payload (no improvised
// medicine) and no persisted thread — suggestions act as fresh searches.

const LEVELS: AskLevel[] = ['eli5', 'mbbs', 'neetpg', 'detailed']

export async function POST(req: NextRequest) {
  const body = await readJson<{ q?: unknown; level?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const q = asTrimmed(body.q, 300)
  if (!q || q.length < 2) return NextResponse.json({ error: 'Ask a question (at least 2 characters)' }, { status: 400 })
  const level = (LEVELS.includes(body.level as AskLevel) ? body.level : 'mbbs') as AskLevel

  const profile = await getDemoProfile()
  const ctx = await loadGraphContext(profile.id)
  const normalized = normalizeAskQuery(q)
  const resolution = resolveAskQuery(ctx, normalized)

  // ── honest miss: nothing fabricated, nothing persisted ──
  if (resolution.kind === 'none') {
    const payload = buildMissPayload(q, ctx, normalized)
    return NextResponse.json({ ...payload, threadId: '' })
  }

  const grounding = await buildAskGrounding(ctx, resolution, profile.id, q)
  const name = grounding.resolution.conceptName ?? grounding.resolution.secondaryName ?? q
  const { ai, fallback } = await askAnswerText(q, name, grounding, level)

  const base = buildAnswerPayload('', q, normalized, resolution, grounding, level, ai, fallback)
  const thread = await db.askThread.create({
    data: {
      profileId: profile.id,
      title: q.slice(0, 80),
      rootQuery: q,
      resolvedKind: resolution.kind,
      conceptId: resolution.conceptId ?? '',
      secondaryConceptId: resolution.secondaryId ?? '',
      level,
      grounding: base as unknown as Prisma.InputJsonValue,
      messages: [] as unknown as Prisma.InputJsonValue,
    },
  })
  const payload: AskAnswerPayload = { ...base, threadId: thread.id }
  await db.askThread.update({
    where: { id: thread.id },
    data: { grounding: payload as unknown as Prisma.InputJsonValue },
  })
  return NextResponse.json({ ...payload, aiBadge: ASK_AI_BADGE, disclaimer: ASK_DISCLAIMER })
}
