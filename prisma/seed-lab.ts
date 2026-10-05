// ─── PRODUCT 10 · MEDICAL IMAGE LEARNING LAB — seeder ────────────────────────
// Upserts the 31 curated teaching images (packs A+B) into the LabImage table.
// Idempotent: safe to re-run (upsert only — LabAttempt rows are untouched).
// Guards before write: asset file exists, identify/diagnosis = 4 options with
// exactly one correct, quiz = 3×4 options 1 correct + teaching line,
// ≥1 primary + ≥1 present:false negative finding, guided 4–8 steps,
// teaching 2–3 pearls. Concept links validated against the Concept table.

import { PrismaClient, Prisma } from '@prisma/client'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { LAB_PACK_A, type LabSeedRecord } from './seed-lab-a'
import { LAB_PACK_B } from './seed-lab-b'

const db = new PrismaClient()
const PUBLIC_DIR = join(process.cwd(), 'public')

function recordProblems(r: LabSeedRecord): string[] {
  const p: string[] = []
  if (!existsSync(join(PUBLIC_DIR, r.src))) p.push(`missing asset ${r.src}`)
  if (r.difficulty < 1 || r.difficulty > 3) p.push('difficulty out of 1..3')
  if (r.examRelevance < 1 || r.examRelevance > 5) p.push('examRelevance out of 1..5')

  const oneCorrect = (opts: { verdict: string }[], where: string) => {
    if (opts.length !== 4) p.push(`${where}: ${opts.length} options (need 4)`)
    const c = opts.filter((o) => o.verdict === 'correct').length
    if (c !== 1) p.push(`${where}: ${c} correct (need exactly 1)`)
  }
  oneCorrect(r.brief.identify.options, 'identify')
  oneCorrect(r.brief.diagnosis.options, 'diagnose')
  if (r.brief.quiz.length !== 3) p.push(`quiz: ${r.brief.quiz.length} questions (need 3)`)
  for (const q of r.brief.quiz) {
    oneCorrect(q.options, `quiz ${q.id}`)
    if (!q.teaching) p.push(`quiz ${q.id}: missing teaching line`)
  }

  const findings = r.brief.findings
  if (findings.length < 2) p.push(`findings: ${findings.length} (need ≥2)`)
  if (findings.filter((f) => f.primary).length !== 1) p.push('findings: need exactly 1 primary')
  if (!findings.some((f) => f.present === false)) p.push('findings: need ≥1 present:false negative')
  for (const f of findings) {
    if (f.present === false && f.region) p.push(`finding ${f.id}: negative finding must not carry a region`)
  }
  if (r.brief.guided.length < 4 || r.brief.guided.length > 8) p.push(`guided: ${r.brief.guided.length} steps`)
  if (r.brief.teaching.length < 2 || r.brief.teaching.length > 3) p.push(`teaching: ${r.brief.teaching.length} pearls`)
  return p
}

async function main() {
  const all = [...LAB_PACK_A, ...LAB_PACK_B]
  const seen = new Set<string>()
  for (const r of all) {
    if (seen.has(r.id)) throw new Error(`duplicate id ${r.id}`)
    seen.add(r.id)
  }

  const bad: string[] = []
  for (const r of all) {
    const problems = recordProblems(r)
    if (problems.length) bad.push(`${r.id}: ${problems.join('; ')}`)
  }
  if (bad.length) {
    console.error('✗ Seed guards failed:\n  ' + bad.join('\n  '))
    process.exit(1)
  }

  let created = 0
  let updated = 0
  for (const r of all) {
    const data = {
      title: r.title,
      diagnosis: r.diagnosis,
      modality: r.modality,
      system: r.system,
      subjectCode: r.subjectCode,
      conceptIds: r.conceptIds,
      src: r.src,
      provenance: r.provenance,
      sourceNote: r.sourceNote,
      difficulty: r.difficulty,
      examRelevance: r.examRelevance,
      isNormal: r.isNormal,
      compareGroup: r.compareGroup,
      brief: r.brief as unknown as Prisma.InputJsonValue,
    }
    const existing = await db.labImage.findUnique({ where: { id: r.id } })
    if (existing) await db.labImage.update({ where: { id: r.id }, data })
    else await db.labImage.create({ data: { id: r.id, ...data } })
    if (existing) updated += 1
    else created += 1
  }

  const total = await db.labImage.count()
  const byModality = await db.labImage.groupBy({ by: ['modality'], _count: true, orderBy: { modality: 'asc' } })
  const byProvenance = await db.labImage.groupBy({ by: ['provenance'], _count: true })
  const bySubject = await db.labImage.groupBy({ by: ['subjectCode'], _count: true, orderBy: { subjectCode: 'asc' } })
  const compareGroups = all.filter((r) => r.compareGroup).map((r) => `${r.id}→${r.compareGroup}`)
  const normalAnchors = all.filter((r) => r.isNormal).map((r) => r.id)

  const invalidConcepts: string[] = []
  for (const r of all) {
    for (const cid of r.conceptIds) {
      const exists = await db.concept.findUnique({ where: { id: cid } })
      if (!exists) invalidConcepts.push(`${r.id}:${cid}`)
    }
  }

  console.log(`✓ LabImage seeded — ${created} created, ${updated} updated, ${total} total`)
  console.log('  By modality:')
  for (const g of byModality) console.log(`   · ${g.modality}: ${g._count}`)
  console.log(`  By provenance: ${byProvenance.map((g) => `${g.provenance} ${g._count}`).join(', ')}`)
  console.log(`  By subject: ${bySubject.map((g) => `${g.subjectCode} ${g._count}`).join(', ')}`)
  console.log(`  Compare groups: ${compareGroups.join(', ') || 'none'}`)
  console.log(`  Normal anchors: ${normalAnchors.join(', ') || 'none'}`)
  console.log(`  Concept links: all valid${invalidConcepts.length ? ` — INVALID: ${invalidConcepts.join(', ')}` : ''}`)
  if (invalidConcepts.length) process.exitCode = 1
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
