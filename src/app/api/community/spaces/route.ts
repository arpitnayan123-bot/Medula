import { NextRequest, NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { spaceSummaries, personalizeSpaces, loadLearningSignals } from '@/lib/community-engine'

export const dynamic = 'force-dynamic'

// GET /api/community/spaces?q=&kind= — all spaces with measured chips.
// Personalised reason tags are attached when a learning signal exists; q
// filters by name/description, kind narrows to one space kind.
export async function GET(req: NextRequest) {
  try {
    const profile = await getDemoProfile()
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
    const kind = (req.nextUrl.searchParams.get('kind') ?? '').trim()

    let spaces = await spaceSummaries(profile.id)
    if (kind) spaces = spaces.filter((s) => s.kind === kind)
    if (q) {
      spaces = spaces.filter((s) =>
        s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
      )
    }
    spaces = personalizeSpaces(await loadLearningSignals(profile.id), spaces)

    return NextResponse.json({ spaces })
  } catch (error) {
    console.error('community/spaces error:', error)
    return NextResponse.json({ error: 'Failed to load spaces.' }, { status: 500 })
  }
}
