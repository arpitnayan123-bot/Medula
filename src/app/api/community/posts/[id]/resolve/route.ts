import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson } from '@/lib/http'
import { resolvePost } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// POST /api/community/posts/[id]/resolve — {replyId} marks that reply as THE
// answer (and resolves the thread); {} toggles the thread's resolved flag.
// Author-only (403 otherwise).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await readJson<{ replyId?: unknown }>(req)

    const profile = await getDemoProfile()
    const result = await resolvePost(
      profile.id,
      decodeURIComponent(id),
      body ? (typeof body.replyId === 'string' && body.replyId.trim() ? body.replyId.trim() : undefined) : undefined,
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true, resolved: result.resolved, answeredReplyId: result.answeredReplyId })
  } catch (error) {
    console.error('community/posts/[id]/resolve error:', error)
    return NextResponse.json({ error: 'Failed to update resolve state.' }, { status: 500 })
  }
}
