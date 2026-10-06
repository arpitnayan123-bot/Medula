import { NextResponse } from 'next/server'
import { getDemoProfile } from '@/lib/profile'
import { libraryHome } from '@/lib/resource-hub'

export const dynamic = 'force-dynamic'

// GET /api/library/home — measured hub landing (stats, forYou, featured…).
export async function GET() {
  try {
    const profile = await getDemoProfile()
    const payload = await libraryHome(profile.id)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('library home error:', err)
    return NextResponse.json({ error: 'Failed to load library home' }, { status: 500 })
  }
}
