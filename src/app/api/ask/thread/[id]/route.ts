import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import type { AskAnswerPayload, AskThreadDetail } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ─── GET /api/ask/thread/[id] — reopen a past thread ─────────────────────────
// The knowledge page is rebuilt from the stored grounding snapshot (deterministic
// at ask time); the follow-up transcript rides along untouched.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getDemoProfile()
  const thread = await db.askThread.findUnique({ where: { id } })
  if (!thread || thread.profileId !== profile.id) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  const page = (thread.grounding ?? null) as (AskAnswerPayload & { messages?: unknown }) | null
  if (!page) {
    return NextResponse.json({ error: 'Thread payload missing' }, { status: 409 })
  }
  const { messages: _m, ...pageClean } = page
  type AskMsg = { role: 'user' | 'assistant'; kind: AskThreadDetail['messages'][number]['kind']; text: string; payload?: AskThreadDetail['messages'][number]['payload'] }
  const messages = Array.isArray(thread.messages) ? (thread.messages as unknown as AskMsg[]) : []

  const detail: AskThreadDetail = {
    id: thread.id,
    title: thread.title,
    rootQuery: thread.rootQuery,
    level: (thread.level as AskThreadDetail['level']) ?? 'mbbs',
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    page: { ...pageClean, threadId: thread.id },
    messages,
  }
  return NextResponse.json({ thread: detail })
}
