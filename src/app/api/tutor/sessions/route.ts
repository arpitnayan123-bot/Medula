import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

// Persisted AI-tutor threads (PRODUCT 03). A tutoring session survives
// reloads and app switches so the tutor behaves like a continuing teacher,
// not a disposable chat. Messages are stored as [{role, content}] — widget
// blocks (medq / flashcards fenced JSON) are part of the content strings and
// re-render on resume.

const MAX_MESSAGES = 80
const MAX_TITLE = 90

interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
}

function sanitizeMessages(raw: unknown): SessionMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is SessionMessage =>
      !!m && typeof m === 'object' &&
      ((m as SessionMessage).role === 'user' || (m as SessionMessage).role === 'assistant') &&
      typeof (m as SessionMessage).content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
}

export async function GET(req: NextRequest) {
  const profile = await getDemoProfile()
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const session = await db.tutorSession.findFirst({
      where: { id, profileId: profile.id },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        mode: session.mode,
        topicId: session.topicId,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        messageCount: Array.isArray(session.messages) ? (session.messages as unknown[]).length : 0,
        messages: sanitizeMessages(session.messages),
      },
    })
  }

  const sessions = await db.tutorSession.findMany({
    where: { profileId: profile.id },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  })
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      mode: s.mode,
      topicId: s.topicId,
      messageCount: Array.isArray(s.messages) ? (s.messages as unknown[]).length : 0,
      updatedAt: s.updatedAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const profile = await getDemoProfile()
  const body = await req.json().catch(() => null) as {
    id?: string
    title?: string
    mode?: string
    topicId?: string
    messages?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const messages = sanitizeMessages(body.messages)
  if (messages.length === 0) return NextResponse.json({ error: 'Nothing to save yet' }, { status: 400 })

  const title = (body.title ?? '').trim().slice(0, MAX_TITLE) || 'New tutoring session'
  const mode = (body.mode ?? 'explain').slice(0, 24)
  const topicId = (body.topicId ?? '').slice(0, 64)

  // Upsert: client keeps the session id and PATCHes the same thread.
  if (body.id) {
    const existing = await db.tutorSession.findFirst({ where: { id: body.id, profileId: profile.id } })
    if (existing) {
      const updated = await db.tutorSession.update({
        where: { id: existing.id },
        data: { title, mode, topicId, messages: messages as unknown as Prisma.InputJsonValue },
      })
      return NextResponse.json({ id: updated.id })
    }
  }

  const created = await db.tutorSession.create({
    data: { profileId: profile.id, title, mode, topicId, messages: messages as unknown as Prisma.InputJsonValue },
  })
  return NextResponse.json({ id: created.id })
}

export async function DELETE(req: NextRequest) {
  const profile = await getDemoProfile()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const existing = await db.tutorSession.findFirst({ where: { id, profileId: profile.id } })
  if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  await db.tutorSession.delete({ where: { id: existing.id } })
  return NextResponse.json({ ok: true })
}
