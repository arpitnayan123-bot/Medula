import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { db } from '@/lib/db'
import { threadPayload } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/posts/[id] — the thread page: post, replies, deterministic
// similar-question chips, measured related-MCQ pool. Every GET counts as one
// honest view.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const profile = await getDemoProfile()
    const payload = await threadPayload(profile.id, decodeURIComponent(id))

    if (payload === null) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (payload === 'removed') return NextResponse.json({ error: 'This post was removed' }, { status: 410 })
    if (payload === 'blocked') return NextResponse.json({ error: 'This content is not available' }, { status: 403 })
    return NextResponse.json(payload)
  } catch (error) {
    console.error('community/posts/[id] GET error:', error)
    return NextResponse.json({ error: 'Failed to load thread.' }, { status: 500 })
  }
}

// DELETE /api/community/posts/[id] — author-only soft delete (status='removed').
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const profile = await getDemoProfile()
    const post = await db.communityPost.findUnique({ where: { id: decodeURIComponent(id) } })
    if (!post || post.status === 'removed') return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.profileId !== profile.id) return NextResponse.json({ error: 'Only the author can delete this post' }, { status: 403 })

    await db.communityPost.update({
      where: { id: post.id },
      data: { status: 'removed', removedReason: 'author-deleted' },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('community/posts/[id] DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete post.' }, { status: 500 })
  }
}
