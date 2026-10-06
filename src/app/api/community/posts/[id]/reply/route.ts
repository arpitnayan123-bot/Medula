import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { createReply } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// POST /api/community/posts/[id]/reply — answer a thread. Same moderation
// contract as post creation: PHI → 400 blocked, spam/abuse → held for review.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await readJson<{ body?: unknown; aiAssisted?: unknown }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const text = asTrimmed(body.body, 4000)
    if (!text || text.length < 2) return NextResponse.json({ error: 'Reply must be at least 2 characters.' }, { status: 400 })

    const profile = await getDemoProfile()
    const result = await createReply(
      profile.id,
      decodeURIComponent(id),
      text,
      body.aiAssisted === true,
    )

    if (!result.ok) {
      return NextResponse.json(
        { reply: null, blocked: result.blocked ?? false, reasons: result.reasons ?? [], guidance: result.guidance ?? null, error: result.error },
        { status: result.status },
      )
    }
    return NextResponse.json(
      { reply: result.reply, blocked: false, reasons: [], guidance: null },
      { status: 201 },
    )
  } catch (error) {
    console.error('community/posts/[id]/reply error:', error)
    return NextResponse.json({ error: 'Failed to post reply.' }, { status: 500 })
  }
}
