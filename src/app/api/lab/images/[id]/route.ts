import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { clientImageDetail, parseConceptIds, summarizeImage } from '@/lib/lab'
import type { LabImageRowLite } from '@/lib/lab'
import type { LabImageDetail, LabImageSummary, LabMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/lab/images/[id] — client-safe image detail. The brief is STRIPPED:
// options carry {id,label} only, guided reveal steps carry the teaching
// content, and the locate count is a number — verdicts, whys, correct-option
// ids, pin regions and quiz answers never leave the server. Includes any
// active attempt to resume.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const profile = await getDemoProfile()
  const row = await db.labImage.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

  const attempts = await db.labAttempt.findMany({
    where: { profileId: profile.id, imageId: id },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
  })

  // most recent ACTIVE attempt → resume payload (the answer key itself still
  // never leaves the server)
  const active = [...attempts].reverse().find((a) => a.status === 'active')

  const conceptIds = parseConceptIds(row.conceptIds)
  const concepts = conceptIds.length
    ? await db.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, name: true } })
    : []

  // compare pool: same compareGroup first, then same modality — never self
  const similarRows = row.compareGroup
    ? await db.labImage.findMany({
        where: { id: { not: row.id }, OR: [{ compareGroup: row.compareGroup }, { modality: row.modality }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    : await db.labImage.findMany({
        where: { id: { not: row.id }, modality: row.modality },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
  const similar: LabImageSummary[] = (similarRows as unknown as LabImageRowLite[])
    .slice(0, 6)
    .map((r) => summarizeImage(r, []))

  const detail: LabImageDetail = clientImageDetail(row as unknown as LabImageRowLite, attempts, {
    similar,
    concepts,
    resume: active
      ? {
          attemptId: active.id,
          mode: active.mode as LabMode,
          startedAt: active.startedAt.toISOString(),
        }
      : null,
  })
  return NextResponse.json(detail)
}
