import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { getDemoProfile } from '@/lib/profile'
import { parseBrief, pickRapidPool, RAPID_TIME_LIMIT_MS } from '@/lib/lab'
import type { LabRapidStart } from '@/lib/types'
import { LAB_MODALITIES } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/lab/rapid — build a rapid-fire session: 10 items from the
// least-attempted pool (optionally scoped to a modality / subject), ordered
// deterministically. The session's item list is stored as a `session` event in
// the attempt's answers log so acts/completes stay resolvable even if attempt
// counts change meanwhile; attempt.imageId = the first item's image.
export async function POST(req: Request) {
  const body = await readJson<{ modality?: unknown; subjectCode?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const modality = asTrimmed(body.modality, 30)
  if (modality && !(LAB_MODALITIES as readonly string[]).includes(modality)) {
    return NextResponse.json({ error: `modality must be one of: ${LAB_MODALITIES.join(', ')}` }, { status: 400 })
  }
  const subjectCode = asTrimmed(body.subjectCode, 40)

  const profile = await getDemoProfile()
  const pool = await pickRapidPool(profile.id, {
    ...(modality ? { modality } : {}),
    ...(subjectCode ? { subjectCode } : {}),
  })
  if (pool.length === 0) {
    return NextResponse.json({ error: 'No images available for this scope — widen the filter' }, { status: 409 })
  }

  const imageIds = pool.map((r) => r.id)

  // close stale active rapid sessions (idempotent; keeps resume honest)
  await db.labAttempt.updateMany({
    where: { profileId: profile.id, mode: 'rapid', status: 'active' },
    data: { status: 'abandoned' },
  })

  const attempt = await db.labAttempt.create({
    data: {
      profileId: profile.id,
      imageId: imageIds[0]!,
      mode: 'rapid',
      status: 'active',
      stepIndex: 0,
      answers: [{ type: 'session', imageIds, ts: Date.now() }] as unknown as Prisma.InputJsonValue,
    },
  })

  const payload: LabRapidStart = {
    ok: true,
    attemptId: attempt.id,
    timeLimitMs: RAPID_TIME_LIMIT_MS,
    items: pool.map((r) => {
      const brief = parseBrief(r.brief)
      return {
        imageId: r.id,
        src: r.src,
        modality: r.modality as LabRapidStart['items'][number]['modality'],
        prompt: brief.identify.prompt || 'Recognise this image — fast.',
        options: brief.identify.options.map((o) => ({ id: o.id, label: o.label })), // {id,label} ONLY
      }
    }),
  }
  return NextResponse.json(payload)
}
