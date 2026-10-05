// PRODUCT 10 E2E cleanup — removes ALL lab test attempts + the mistake-feed
// rows they created, restoring the demo profile's lab state to clean.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const p = await db.studentProfile.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!p) return console.log('no profile — nothing to clean')
  const attempts = await db.labAttempt.deleteMany({ where: { profileId: p.id } })
  const ep = await db.errorPattern.deleteMany({ where: { profileId: p.id, errorType: 'visual' } })
  const ri = await db.revisionItem.deleteMany({ where: { profileId: p.id, reason: { startsWith: 'Missed image' } } })
  const ss = await db.studySession.deleteMany({ where: { profileId: p.id, kind: 'lab' } })
  console.log(`cleaned: attempts ${attempts.count}, errorPatterns ${ep.count}, revisionItems ${ri.count}, studySessions ${ss.count}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
