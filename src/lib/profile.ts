import { db } from '@/lib/db'
import type { Profile } from '@/lib/types'

export function toProfile(p: {
  id: string; name: string; year: number; semester: number; collegeName: string; collegeType: string
  gradYear: number; internshipDone: boolean; pastScore: string; prepStage: string
  dailyHours: number; weekdayHours: number; weekendHours: number
  learningStyles: unknown; resources: unknown; examMode: boolean; examLabel: string
  examDate: Date | null; onboarded: boolean; createdAt: Date
}): Profile {
  return {
    id: p.id, name: p.name, year: p.year, semester: p.semester,
    collegeName: p.collegeName, collegeType: p.collegeType, gradYear: p.gradYear,
    internshipDone: p.internshipDone, pastScore: p.pastScore,
    prepStage: p.prepStage as Profile['prepStage'],
    dailyHours: p.dailyHours, weekdayHours: p.weekdayHours, weekendHours: p.weekendHours,
    learningStyles: (p.learningStyles as string[]) ?? [], resources: (p.resources as string[]) ?? [],
    examMode: p.examMode, examLabel: p.examLabel,
    examDate: p.examDate ? p.examDate.toISOString() : null,
    onboarded: p.onboarded,
    memberSince: p.createdAt.toISOString(),
  }
}

// Single-user demo model: the platform serves one evolving student profile.
export async function getDemoProfile() {
  let p = await db.studentProfile.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!p) {
    p = await db.studentProfile.create({ data: { name: 'Future Dr.', onboarded: false } })
  }
  return p
}
