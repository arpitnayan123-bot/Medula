import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed, asInt } from '@/lib/http'
import { selectAskQuiz } from '@/lib/ask-engine'

export const dynamic = 'force-dynamic'

// ─── POST /api/ask/quiz — measured self-check MCQs, never AI-invented ────────
// Questions come from the platform's Question pool (concept-first, then wider
// topic). mode:'mistakes' serves this student's own open misses, worst first.

export async function POST(req: NextRequest) {
  const body = await readJson<{ threadId?: unknown; conceptId?: unknown; mode?: unknown; count?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const threadId = asTrimmed(body.threadId, 100)
  const conceptIdIn = asTrimmed(body.conceptId, 100)
  const mode = body.mode === 'mistakes' ? 'mistakes' : 'concept'
  const count = asInt(body.count, 1, 10, 5)

  let conceptId = conceptIdIn
  let topicId: string | undefined
  if (threadId) {
    const profile = await getDemoProfile()
    const thread = await db.askThread.findUnique({ where: { id: threadId } })
    if (!thread || thread.profileId !== profile.id) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }
    if (thread.conceptId) {
      conceptId = thread.conceptId
      const concept = await db.concept.findUnique({ where: { id: thread.conceptId }, select: { topicId: true } })
      topicId = concept?.topicId
    }
  }
  if (!conceptId) {
    return NextResponse.json({ items: [], note: 'Ask about a concept first — the quiz pool is tied to platform concepts.' })
  }

  const profile = await getDemoProfile()
  const { items, note } = await selectAskQuiz(profile.id, { conceptId, topicId, mode, count })
  return NextResponse.json({ items, note })
}
