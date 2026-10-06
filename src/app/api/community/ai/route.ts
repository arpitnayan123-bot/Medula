import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { communityAi } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// POST /api/community/ai — the AI community assistant.
//   summarize {postId}            → grounded IN-THREAD summary
//   explain {query}               → lesson-grounded explanation (honest miss when
//                                   nothing resolvable — never improvised)
//   suggest {topicId|subjectCode|postId} → MEASURED lessons/resources/MCQ pool
//   moderate {content}            → deterministic scan + AI second opinion
// Every payload carries the AI badge + disclaimer; final text only, no CoT.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{
      mode?: unknown; postId?: unknown; query?: unknown
      topicId?: unknown; subjectCode?: unknown; content?: unknown
    }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const mode = asTrimmed(body.mode, 12) ?? ''
    const profile = await getDemoProfile()

    const result = await communityAi(profile.id, {
      mode,
      postId: asTrimmed(body.postId, 60) ?? undefined,
      query: asTrimmed(body.query, 300) ?? undefined,
      topicId: asTrimmed(body.topicId, 60) ?? undefined,
      subjectCode: asTrimmed(body.subjectCode, 12) ?? undefined,
      content: typeof body.content === 'string' ? body.content.slice(0, 4000) : undefined,
    })

    if (!result.payload) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result.payload)
  } catch (error) {
    console.error('community/ai error:', error)
    return NextResponse.json({ error: 'The assistant could not respond. Try again in a moment.' }, { status: 500 })
  }
}
