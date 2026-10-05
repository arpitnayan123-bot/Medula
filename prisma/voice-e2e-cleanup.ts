// PRODUCT 11 E2E cleanup — removes rows created by the voice-tutor API and
// browser E2E runs so a real student starts from a clean measured profile.
// Kept as a utility (same convention as prisma/lab-e2e-cleanup.ts).
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const sessions = await prisma.voiceSession.findMany({ select: { id: true } })
  const ids = sessions.map((s) => s.id)

  const delSessions = ids.length
    ? await prisma.voiceSession.deleteMany({ where: { id: { in: ids } } })
    : { count: 0 }

  const study = await prisma.studySession.deleteMany({ where: { kind: 'voice' } })
  const patterns = await prisma.errorPattern.deleteMany({
    where: { errorType: { in: ['didnt_know', 'forgot'] }, conceptId: null },
  })
  const revision = await prisma.revisionItem.deleteMany({
    where: { reason: { contains: 'by voice' } },
  })

  console.log(
    `voice e2e cleanup: ${delSessions.count} VoiceSession, ${study.count} StudySession(voice), ` +
      `${patterns.count} ErrorPattern(null-concept), ${revision.count} RevisionItem(voice) removed`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
