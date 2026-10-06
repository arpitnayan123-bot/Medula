import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import { loadGraphContext } from '@/lib/knowledge-graph'
import {
  buildAskGrounding, detectFollowIntent, askFollowupReply, selectAskQuiz,
  mistakesForConcept, enqueueAskRevision, dueRevisionCount, conceptIdForTextLoose,
  parseCompareLoose, ASK_AI_BADGE, ASK_DISCLAIMER,
} from '@/lib/ask-engine'
import type { AskFollowPayload, AskResolutionKind } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/ask/followup — conversational follow-ups inside a thread ──────
// Deterministic intents (quiz me / my mistakes / add to revision / related)
// never touch the LLM. Language intents (simpler / deeper / analogy / clinical
// example / compare / free question) re-ground on the platform and answer with
// a deterministic fallback when AI is unavailable. Every exchange is persisted
// on the thread (capped transcript) before responding.

const MESSAGE_CAP = 40

export async function POST(req: NextRequest) {
  const body = await readJson<{ threadId?: unknown; message?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const threadId = asTrimmed(body.threadId, 100)
  const message = asTrimmed(body.message, 500)
  if (!threadId) return NextResponse.json({ error: 'threadId is required' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const thread = await db.askThread.findUnique({ where: { id: threadId } })
  if (!thread || thread.profileId !== profile.id) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  const { intent, level } = detectFollowIntent(message)
  const conceptId = thread.conceptId || null
  let payload: AskFollowPayload

  // ── fully deterministic intents — measured data only, no LLM ──
  if (intent === 'quiz') {
    const concept = conceptId ? await db.concept.findUnique({ where: { id: conceptId }, select: { topicId: true } }) : null
    const { items, note } = await selectAskQuiz(profile.id, {
      conceptId: conceptId ?? undefined,
      topicId: concept?.topicId,
      mode: /mistake/i.test(message) ? 'mistakes' : 'concept',
      count: 5,
    })
    const reply = items.length
      ? `Pulled ${items.length} measured question${items.length === 1 ? '' : 's'}${note ? ` — ${note.replace(/\.$/, '')}` : ''}. Answers reveal after you commit — no negative marking here, just honesty.`
      : (note ?? 'No measured questions available for this concept yet — nothing invented to fill the gap.')
    payload = { ok: true, kind: 'quiz', reply, quiz: items, quizNote: note }
  } else if (intent === 'mistakes') {
    if (!conceptId) {
      payload = { ok: true, kind: 'text', reply: 'This thread is not anchored to a concept, so there are no measured mistakes to show. Ask about a concept first — then I can show exactly what you missed there.' }
    } else {
      const rows = await mistakesForConcept(profile.id, conceptId)
      const reply = rows.length
        ? `You have missed ${rows.length} question${rows.length === 1 ? '' : 's'} here (measured from your attempt history) — listed worst-first below.`
        : 'Clean sheet — no open mistakes recorded on this concept. Keep it that way with a quick self-check.'
      payload = { ok: true, kind: 'mistakes', reply, mistakes: rows }
    }
  } else if (intent === 'revision') {
    if (!conceptId) {
      payload = { ok: true, kind: 'text', reply: 'Nothing to queue — this thread is not anchored to a concept yet. Ask about a concept and I can add it to your revision queue.' }
    } else {
      const { queued } = await enqueueAskRevision(profile.id, conceptId, thread.rootQuery)
      const due = await dueRevisionCount(profile.id)
      const reply = queued
        ? `Added to your revision queue (15-minute block, due now). You have ${due} item${due === 1 ? '' : 's'} due across the queue.`
        : `Already sitting in your open revision queue — no duplicate added. ${due} item${due === 1 ? '' : 's'} due in total.`
      payload = { ok: true, kind: 'revision', reply }
    }
  } else if (intent === 'related') {
    const page = (thread.grounding ?? null) as { connections?: { group: string; items: { id: string; name: string }[] }[] } | null
    const related = (page?.connections ?? []).flatMap((c) => c.items.slice(0, 3).map((i) => ({ ...i, group: c.group }))).slice(0, 8)
    const reply = related.length
      ? `The verified knowledge graph links this to ${related.length} connections across ${new Set(related.map((r) => r.group)).size} groups — tap any chip to open it.`
      : 'The verified graph has no edges for this concept yet — honest gap, nothing implied.'
    payload = { ok: true, kind: 'text', reply, related }
  } else {
    // ── language intents (AI, grounded, deterministic fallback) ──
    const ctx = await loadGraphContext(profile.id)
    let resolution: { kind: AskResolutionKind; conceptId: string | null; secondaryId: string | null; topicId: string | null; matchedVia: string; corrected: string | null } = {
      kind: (thread.resolvedKind as AskResolutionKind) ?? 'concept',
      conceptId,
      secondaryId: thread.secondaryConceptId || null,
      topicId: null,
      matchedVia: 'thread',
      corrected: null,
    }
    let resolvedCompare = resolution.kind === 'compare' && !!resolution.conceptId && !!resolution.secondaryId

    // a fresh «A vs B» inside the thread re-resolves both sides on the graph
    const cmp = parseCompareLoose(message)
    if (cmp && !resolvedCompare) {
      const a = conceptIdForTextLoose(ctx, cmp[0])
      const b = conceptIdForTextLoose(ctx, cmp[1])
      if (a && b && a !== b) {
        resolution = { kind: 'compare', conceptId: a, secondaryId: b, topicId: null, matchedVia: 'compare', corrected: null }
        resolvedCompare = true
      }
    }

    const grounding = await buildAskGrounding(ctx, resolution, profile.id, message)
    const name = grounding.resolution.conceptName ?? grounding.resolution.secondaryName ?? thread.rootQuery
    const { text, fallback } = await askFollowupReply(
      { rootQuery: thread.rootQuery, messages: thread.messages, level: thread.level },
      grounding, name, message, intent === 'compare' ? 'free' : intent,
      level,
    )
    const reply = intent === 'compare' && !resolvedCompare
      ? `I could not resolve both sides of that comparison to platform concepts, so I will not fake it. ${text}`
      : text
    payload = { ok: true, kind: 'text', reply, fallback, aiBadge: ASK_AI_BADGE, disclaimer: ASK_DISCLAIMER }
  }

  // ── persist the exchange (capped) before responding ──
  const prior = Array.isArray(thread.messages) ? (thread.messages as unknown as Prisma.InputJsonValue[]) : []
  const next: Prisma.InputJsonValue[] = [
    ...prior.slice(-(MESSAGE_CAP - 2)),
    { role: 'user', kind: 'text', text: message },
    { role: 'assistant', kind: payload.kind, text: payload.reply, payload } as unknown as Prisma.InputJsonValue,
  ] as unknown as Prisma.InputJsonValue[]
  await db.askThread.update({ where: { id: threadId }, data: { messages: next, updatedAt: new Date() } })
  return NextResponse.json(payload)
}
