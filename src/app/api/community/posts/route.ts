import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { listPosts, createPost, POST_KINDS } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/posts?feed=mine|saved|unresolved|topic&q=&topicId=&spaceId=
// Post feeds across spaces (group posts stay on the group detail).
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const sp = req.nextUrl.searchParams
    const feed = (sp.get('feed') ?? 'recent').trim()
    const q = (sp.get('q') ?? '').trim()
    const topicId = (sp.get('topicId') ?? '').trim()
    const spaceId = (sp.get('spaceId') ?? '').trim()

    const payload = await listPosts(profile.id, feed, q, topicId, spaceId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('community/posts GET error:', error)
    return NextResponse.json({ error: 'Failed to load posts.' }, { status: 500 })
  }
}

// POST /api/community/posts — create a discussion thread. The deterministic
// moderation scan runs FIRST: PHI violations never touch the database (400
// with reasons + guidance); spam/abuse creates with status 'review'.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{
      spaceId?: unknown; groupId?: unknown; kind?: unknown; title?: unknown; body?: unknown
      tags?: unknown; subjectCode?: unknown; topicId?: unknown; questionRef?: unknown
    }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const kind = asTrimmed(body.kind, 20) ?? ''
    const title = asTrimmed(body.title, 150) ?? ''
    const text = asTrimmed(body.body, 4000) ?? ''
    if (!POST_KINDS.has(kind)) {
      return NextResponse.json({ error: 'kind must be one of: question, discussion, pyq, mcq, case' }, { status: 400 })
    }
    if (title.length < 6) return NextResponse.json({ error: 'Title must be at least 6 characters.' }, { status: 400 })
    if (text.length < 10) return NextResponse.json({ error: 'Body must be at least 10 characters.' }, { status: 400 })

    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim().slice(0, 40)).slice(0, 8)
      : []

    const profile = await getDemoProfile()
    const result = await createPost(profile.id, {
      spaceId: asTrimmed(body.spaceId, 60) ?? undefined,
      groupId: asTrimmed(body.groupId, 60) ?? undefined,
      kind, title, body: text, tags,
      subjectCode: asTrimmed(body.subjectCode, 12) ?? undefined,
      topicId: asTrimmed(body.topicId, 60) ?? undefined,
      questionRef: asTrimmed(body.questionRef, 60) ?? undefined,
    })

    if (!result.ok) {
      return NextResponse.json(
        { post: result.post, blocked: result.blocked, reasons: result.reasons, guidance: result.guidance, error: result.error },
        { status: result.status },
      )
    }
    return NextResponse.json(
      { post: result.post, blocked: false, reasons: result.reasons, guidance: result.guidance },
      { status: 201 },
    )
  } catch (error) {
    console.error('community/posts POST error:', error)
    return NextResponse.json({ error: 'Failed to create post.' }, { status: 500 })
  }
}
