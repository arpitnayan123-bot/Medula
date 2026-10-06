import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { toggleVote, toggleSave, reportTarget, toggleBlock, acceptGuidelines } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// POST /api/community/actions — one guarded route for the small toggles:
//   {action:'vote', postId|replyId}       → toggle your upvote (self-vote 400)
//   {action:'save', postId}               → toggle SavedDiscussion
//   {action:'report', postId|replyId|memberId, reason, details?}
//   {action:'block'|'mute', memberId}     → toggle MemberBlock
//   {action:'guidelines'}                 → accept the community guidelines
// privacy/misinformation reports hold the target for review (deterministic).
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{
      action?: unknown; postId?: unknown; replyId?: unknown; memberId?: unknown
      reason?: unknown; details?: unknown
    }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const action = asTrimmed(body.action, 20)
    const profile = await getDemoProfile()

    if (action === 'vote') {
      const postId = asTrimmed(body.postId, 60)
      const replyId = asTrimmed(body.replyId, 60)
      if (!postId && !replyId) return NextResponse.json({ error: 'postId or replyId is required' }, { status: 400 })
      const result = await toggleVote(profile.id, postId ? 'post' : 'reply', (postId ?? replyId)!)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, voted: result.voted, upvotes: result.upvotes })
    }

    if (action === 'save') {
      const postId = asTrimmed(body.postId, 60)
      if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 })
      const result = await toggleSave(profile.id, postId)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
      return NextResponse.json({ ok: true, saved: result.saved })
    }

    if (action === 'report') {
      const postId = asTrimmed(body.postId, 60)
      const replyId = asTrimmed(body.replyId, 60)
      const memberId = asTrimmed(body.memberId, 60)
      const targetType = postId ? 'post' : replyId ? 'reply' : memberId ? 'member' : ''
      const targetId = postId ?? replyId ?? memberId ?? ''
      if (!targetType) return NextResponse.json({ error: 'postId, replyId or memberId is required' }, { status: 400 })
      const reason = asTrimmed(body.reason, 20) ?? ''
      const details = asTrimmed(body.details, 500) ?? ''
      const result = await reportTarget(profile.id, targetType as 'post' | 'reply' | 'member', targetId, reason, details)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, reported: true })
    }

    if (action === 'block' || action === 'mute') {
      const memberId = asTrimmed(body.memberId, 60)
      if (!memberId) return NextResponse.json({ error: 'memberId is required' }, { status: 400 })
      const result = await toggleBlock(profile.id, memberId, action)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true, active: result.active })
    }

    if (action === 'guidelines') {
      const result = await acceptGuidelines(profile.id)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'action must be one of: vote, save, report, block, mute, guidelines' }, { status: 400 })
  } catch (error) {
    console.error('community/actions error:', error)
    return NextResponse.json({ error: 'Failed to run action.' }, { status: 500 })
  }
}
