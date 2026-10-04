import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

// POST /api/tutor/flashcards — save AI-tutor-generated flashcards into the
// REAL spaced-repetition engine. Each card becomes a Flashcard row plus an
// immediately-due FlashcardReview, so it shows up in Revise with everyone
// else. Honesty rules: cards are only saved when they can be anchored to a
// real subject (via explicit subjectCode or via the concept's topic) —
// unanchored AI content never silently enters the curriculum.

const MAX_CARDS = 12

export async function POST(req: NextRequest) {
  const profile = await getDemoProfile()
  const body = await req.json().catch(() => null) as {
    cards?: { front?: unknown; back?: unknown }[]
    subjectCode?: string
    conceptId?: string
  } | null

  const cards = (body?.cards ?? [])
    .map((c) => ({ front: String(c?.front ?? '').trim(), back: String(c?.back ?? '').trim() }))
    .filter((c) => c.front && c.back)
    .slice(0, MAX_CARDS)

  if (cards.length === 0) {
    return NextResponse.json({ saved: 0, reason: 'No valid cards to save (need front + back).' }, { status: 400 })
  }

  // Resolve the anchor: explicit subjectCode wins; otherwise the concept's
  // topic → subject. Neither → refuse honestly.
  let subjectCode = (body?.subjectCode ?? '').trim()
  let conceptId = (body?.conceptId ?? '').trim() || null

  if (conceptId) {
    const concept = await db.concept.findUnique({
      where: { id: conceptId },
      select: { topic: { select: { subject: { select: { code: true } } } } },
    })
    if (!concept) conceptId = null
    else if (!subjectCode) subjectCode = concept.topic.subject.code
  }

  if (!subjectCode) {
    return NextResponse.json({
      saved: 0,
      reason: 'These cards have no platform subject anchor, so they were not saved — generate them from a topic to enable saving.',
    }, { status: 400 })
  }

  const subject = await db.subject.findUnique({ where: { code: subjectCode }, select: { code: true } })
  if (!subject) {
    return NextResponse.json({ saved: 0, reason: 'Unknown subject code.' }, { status: 400 })
  }

  const now = new Date()
  let saved = 0
  for (const card of cards) {
    const created = await db.flashcard.create({
      data: {
        id: `ai-${crypto.randomUUID().slice(0, 12)}`,
        front: card.front.slice(0, 600),
        back: card.back.slice(0, 2000),
        subjectCode: subject.code,
        conceptId,
        tags: ['ai-tutor'],
      },
    })
    await db.flashcardReview.create({
      data: { flashcardId: created.id, profileId: profile.id, dueAt: now },
    })
    saved += 1
  }

  return NextResponse.json({ saved, subject: subject.code, due: 'now' })
}
