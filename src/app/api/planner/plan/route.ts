import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson, asTrimmed } from '@/lib/http'
import { loadPlannerContext, buildPlanShape, computeFeasibility, realizedCapacity, PLANNER_OFF_DAYS } from '@/lib/planner'
import type { PlannerPlanSaveResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ─── POST /api/planner/plan — create or update the plan settings ─────────────
// Body: { examDate?, examLabel?, targetNote?, dailyMinutes?, weekdayMinutes?,
//         weekendMinutes?, offDays? }
// The exam date is mirrored to StudentProfile so the WHOLE platform (revision
// engine, adaptive proximity weighting, exam clock) shifts together — one
// exam clock, everywhere. Creating/updating the plan re-runs feasibility and
// rebuilds the phase shape immediately.

function clampMinutes(v: unknown, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(900, Math.max(0, n))
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson<{
      examDate?: unknown; examLabel?: unknown; targetNote?: unknown
      dailyMinutes?: unknown; weekdayMinutes?: unknown; weekendMinutes?: unknown; offDays?: unknown
    }>(req)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const profile = await db.studentProfile.findFirst()
    if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 404 })

    // ── validate inputs ──
    let examDate: Date | null | undefined
    if (body.examDate === null || body.examDate === '') {
      examDate = null
    } else if (typeof body.examDate === 'string') {
      const d = new Date(body.examDate)
      examDate = Number.isNaN(d.getTime()) ? undefined : d
    }

    const examLabel = asTrimmed(body.examLabel, 60) ?? undefined
    const targetNote = asTrimmed(body.targetNote, 140) ?? undefined

    const existing = await db.plannerPlan.findFirst({
      where: { profileId: profile.id, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    })
    const dailyMinutes = body.dailyMinutes !== undefined ? Math.max(30, clampMinutes(body.dailyMinutes, 240)) : undefined
    const weekdayMinutes = body.weekdayMinutes !== undefined ? clampMinutes(body.weekdayMinutes, 0) : undefined
    const weekendMinutes = body.weekendMinutes !== undefined ? clampMinutes(body.weekendMinutes, 0) : undefined

    let offDays: string[] | undefined
    if (body.offDays !== undefined) {
      if (!Array.isArray(body.offDays)) return NextResponse.json({ error: 'offDays must be an array of weekday keys' }, { status: 400 })
      const valid = new Set<string>(PLANNER_OFF_DAYS)
      offDays = body.offDays
        .map((d) => (typeof d === 'string' ? d.trim().slice(0, 3) : ''))
        .filter((d): d is string => valid.has(d))
        .slice(0, 3)
    }

    // ── upsert the plan ──
    const data = {
      ...(examDate !== undefined ? { examDate } : {}),
      ...(examLabel !== undefined ? { examLabel } : {}),
      ...(targetNote !== undefined ? { targetNote } : {}),
      ...(dailyMinutes !== undefined ? { dailyMinutes } : {}),
      ...(weekdayMinutes !== undefined ? { weekdayMinutes } : {}),
      ...(weekendMinutes !== undefined ? { weekendMinutes } : {}),
      ...(offDays !== undefined ? { offDays: offDays as never } : {}),
    }

    const planRow = existing
      ? await db.plannerPlan.update({ where: { id: existing.id }, data })
      : await db.plannerPlan.create({
          data: {
            profileId: profile.id,
            examDate: examDate ?? profile.examDate ?? null,
            examLabel: examLabel ?? '',
            targetNote: targetNote ?? '',
            dailyMinutes: dailyMinutes ?? Math.round(profile.dailyHours * 60),
            weekdayMinutes: weekdayMinutes ?? Math.round(profile.weekdayHours * 60),
            weekendMinutes: weekendMinutes ?? Math.round(profile.weekendHours * 60),
            offDays: offDays ?? [],
            plan: {},
            feasibility: {},
          },
        })

    // ── mirror the exam date/label to the profile (one exam clock everywhere) ──
    if (examDate !== undefined || examLabel !== undefined) {
      await db.studentProfile.update({
        where: { id: profile.id },
        data: {
          ...(examDate !== undefined ? { examDate, examMode: examDate !== null } : {}),
          ...(examLabel !== undefined ? { examLabel } : {}),
        },
      })
    }

    // ── rebuild feasibility + plan shape with the new inputs ──
    const freshProfile = await db.studentProfile.findUnique({ where: { id: profile.id } })
    if (!freshProfile) return NextResponse.json({ error: 'Profile vanished' }, { status: 404 })
    const ctx = await loadPlannerContext(freshProfile, {
      planId: planRow.id,
      dailyMinutes: planRow.dailyMinutes,
      weekdayMinutes: planRow.weekdayMinutes,
      weekendMinutes: planRow.weekendMinutes,
      offDays: (planRow.offDays as string[]) ?? [],
      targetNote: planRow.targetNote,
    })
    const realized = realizedCapacity(ctx)
    const weekdayAvg = Math.round(((planRow.weekdayMinutes || planRow.dailyMinutes) * 5 + (planRow.weekendMinutes || planRow.dailyMinutes) * 2) / 7)
    const useRealized = realized.median >= 15 && realized.days >= 5
    const feasibility = computeFeasibility(ctx, useRealized ? realized.median : weekdayAvg, null)
    const plan = buildPlanShape(ctx, feasibility)
    await db.plannerPlan.update({
      where: { id: planRow.id },
      data: { plan: plan as never, feasibility: feasibility as never },
    })

    const result: PlannerPlanSaveResult = { ok: true, plan, feasibility }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/planner/plan]', err)
    return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 })
  }
}
