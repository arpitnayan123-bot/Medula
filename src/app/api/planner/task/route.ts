import { NextRequest, NextResponse } from 'next/server'
import { readJson, asTrimmed } from '@/lib/http'
import { completeTask } from '@/lib/planner'

export const dynamic = 'force-dynamic'

// ─── POST /api/planner/task — complete or skip a planned task ────────────────
// Body: { taskId, status: 'done' | 'skipped' }
// Completion updates the task lifecycle, recomputes the day log totals, and
// (for planner-owned kinds like topic study) logs a StudySession so streaks
// and consistency across the whole platform stay in sync. MCQ / revision /
// mock tasks do NOT double-log — their surfaces already record sessions.

export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{ taskId?: unknown; status?: unknown }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const taskId = asTrimmed(body.taskId, 64)
    if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 })

    const statusRaw = asTrimmed(body.status, 10)
    if (statusRaw !== 'done' && statusRaw !== 'skipped') {
      return NextResponse.json({ error: "status must be 'done' or 'skipped'" }, { status: 400 })
    }

    const result = await completeTask(taskId, statusRaw)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/planner/task]', err)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
