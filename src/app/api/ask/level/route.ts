import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { loadGraphContext } from '@/lib/knowledge-graph'
import {
  buildAskGrounding, askAnswerText, buildAnswerPayload, normalizeAskQuery, ASK_AI_BADGE, ASK_DISCLAIMER,
} from '@/lib/ask-engine'
import type { AskAnswerPayload, AskLevel } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/ask/level — re-answer the thread's root question at a level ───
// ELI5 · MBBS · NEET-PG · Detailed. Grounding is re-derived LIVE (fresh
// mastery/mistakes); the resolution stays pinned to the thread so switching
// levels never silently changes the subject.

const LEVELS: AskLevel[] = ['eli5', 'mbbs', 'neetpg', 'detailed']

export async function POST(req: NextRequest) {
  const body = await readJson<{ threadId?: unknown; level?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const threadId = asTrimmed(body.threadId, 100)
  if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  const level = body.level as AskLevel
  if (!LEVELS.includes(level)) {
    return NextResponse.json({ error: `level must be one of: ${LEVELS.join(', ')}` }, { status: 400 })
  }

  const profile = await getDemoProfile()
  const thread = await db.askThread.findUnique({ where: { id: threadId } })
  if (!thread || thread.profileId !== profile.id) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }
  if (!thread.conceptId) {
    return NextResponse.json({ error: 'This thread has no concept to re-explain' }, { status: 409 })
  }

  const ctx = await loadGraphContext(profile.id)
  const resolution = {
    kind: (thread.resolvedKind === 'compare' ? 'compare' : 'concept') as 'compare' | 'concept',
    conceptId: thread.conceptId,
    secondaryId: thread.secondaryConceptId || null,
    topicId: null,
    matchedVia: 'thread',
    corrected: null,
  }
  const normalized = normalizeAskQuery(thread.rootQuery)
  const grounding = await buildAskGrounding(ctx, resolution, profile.id, thread.rootQuery)
  const name = grounding.resolution.conceptName ?? thread.rootQuery
  const { ai, fallback } = await askAnswerText(thread.rootQuery, name, grounding, level)

  const stored = (thread.grounding ?? null) as Partial<AskAnswerPayload> | null
  const page = buildAnswerPayload(threadId, thread.rootQuery, normalized, resolution, grounding, level, ai, fallback)
  await db.askThread.update({
    where: { id: threadId },
    data: { level, grounding: page as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  })
  void stored
  return NextResponse.json({
    ok: true,
    level,
    answer: page.answer,
    personal: page.personal,
    personalNote: page.personalNote ?? null,
    connections: page.connections,
    highYield: page.highYield,
    sources: page.sources,
    resources: page.resources,
    questions: page.questions,
    cases: page.cases,
  })
}
