import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { resetBrainData, RESET_SCOPES, type BrainResetScope } from '@/lib/brain-engine'
import { readJson, asTrimmed } from '@/lib/http'
import type { BrainResetResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/brain/reset — scoped delete of DERIVED/QUEUED families only:
// knowledge | mistakes | revision | flashcards | snapshots | all-learning.
// Raw measured history (QuestionAttempt, StudySession, ExamAttempt, XpEvent,
// community content) is NEVER touched. Unknown scope → 400.
export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ scope?: unknown }>(req)
    const scope = asTrimmed(body?.scope, 24)
    if (!scope || !(RESET_SCOPES as readonly string[]).includes(scope)) {
      return NextResponse.json(
        { error: `scope must be one of: ${RESET_SCOPES.join(', ')}.` },
        { status: 400 },
      )
    }
    const profile = await getDemoProfile()
    const result: BrainResetResult = await resetBrainData(profile.id, scope as BrainResetScope)
    return NextResponse.json(result)
  } catch (error) {
    console.error('brain/reset error:', error)
    return NextResponse.json({ error: 'Failed to reset the requested brain data.' }, { status: 500 })
  }
}
