import { NextRequest, NextResponse } from 'next/server'
import { asInt } from '@/lib/http'
import { searchLibrary } from '@/lib/resource-hub'
import type { LibraryQuery, ResourceAccess, ResourceKind, ResourceOwnership } from '@/lib/types'

export const dynamic = 'force-dynamic'

// GET /api/library/resources — filter + search over the combined catalog.
// Every query param is whitelisted; unknown params are ignored.

const KINDS: Set<string> = new Set([
  'lesson', 'notes', 'lecture-video', 'article', 'guideline', 'reference',
  'images', 'clinical', 'pyq', 'question-set', 'revision', 'course', 'case',
])
const ACCESSES: Set<string> = new Set(['PUBLIC', 'REGISTRATION', 'PAID', 'MIXED', 'UNKNOWN'])
const OWNERSHIPS: Set<string> = new Set(['platform', 'external'])
const SORTS: Set<string> = new Set(['relevance', 'title', 'recent'])

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    const q: LibraryQuery = {}
    const qText = sp.get('q')
    if (qText) q.q = qText.slice(0, 120)
    const subject = sp.get('subject')
    if (subject) q.subject = subject.slice(0, 60)
    const topic = sp.get('topic')
    if (topic) q.topic = topic.slice(0, 80)
    const kindParam = sp.get('kind')
    if (kindParam) {
      const kinds = kindParam.split(',').map((k) => k.trim()).filter((k): k is ResourceKind => KINDS.has(k))
      if (kinds.length > 0) q.kind = kinds.join(',')
    }
    const source = sp.get('source')
    if (source) q.source = source.slice(0, 60)
    const difficulty = sp.get('difficulty')
    if (difficulty === '1' || difficulty === '2' || difficulty === '3') q.difficulty = Number(difficulty) as 1 | 2 | 3
    const exam = sp.get('exam')
    if (exam) q.exam = exam.slice(0, 20)
    const ownership = sp.get('ownership')
    if (ownership && OWNERSHIPS.has(ownership)) q.ownership = ownership as ResourceOwnership
    const access = sp.get('access')
    if (access && ACCESSES.has(access)) q.access = access as ResourceAccess
    const sort = sp.get('sort')
    if (sort && SORTS.has(sort)) q.sort = sort as NonNullable<LibraryQuery['sort']>
    q.page = asInt(sp.get('page'), 1, 500, 1)

    const payload = await searchLibrary(q)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('library search error:', err)
    return NextResponse.json({ error: 'Failed to search the library' }, { status: 500 })
  }
}
