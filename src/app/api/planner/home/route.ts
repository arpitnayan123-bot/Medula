import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loadPlannerForProfile, buildPlanShape, computeFeasibility, generateToday, buildIntelligence, buildProgress, subjectUrgency, realizedCapacity, loadPlannerContext } from '@/lib/planner'
import { PLANNER_MODES } from '@/lib/types'
import type { PlannerHome, PlannerMode } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ─── GET /api/planner/home — the planner dashboard ───────────────────────────
// Everything the student needs in one payload: plan shape (phases, weekly
// goals), honest feasibility, TODAY (study/practice/revise/test + priority),
// measured progress and intelligence notes. `?mode=` switches the day shape;
// the chosen mode persists via the day log so tomorrow resumes from it.

function isPlannerMode(v: string | null): v is PlannerMode {
  return !!v && (PLANNER_MODES as { id: string }[]).some((m) => m.id === v)
}

export async function GET(req: NextRequest) {
  try {
    const qMode = req.nextUrl.searchParams.get('mode')
    let requested: PlannerMode = 'auto'
    if (isPlannerMode(qMode)) requested = qMode

    const { profile, planRow, ctx } = await loadPlannerForProfile()

    // ── No plan yet → setup payload (honest defaults from the profile) ──
    if (!planRow) {
      return NextResponse.json({
        hasPlan: false,
        plan: null,
        settings: {
          examDate: profile.examDate ? profile.examDate.toISOString() : null,
          examLabel: profile.examLabel,
          targetNote: '',
          dailyMinutes: Math.round(profile.dailyHours * 60),
          weekdayMinutes: Math.round(profile.weekdayHours * 60),
          weekendMinutes: Math.round(profile.weekendHours * 60),
          offDays: [] as string[],
        },
        feasibility: null,
        today: null,
        progress: null,
        subjects: subjectUrgency(ctx).slice(0, 6),
        intelligence: [],
        realized: null,
      } satisfies PlannerHome)
    }

    // remember the last explicitly chosen mode across days
    const dayLog = await db.plannerDayLog.findUnique({
      where: { profileId_dayKey: { profileId: profile.id, dayKey: ctx.todayKey } },
    })
    if (requested === 'auto' && dayLog && dayLog.mode !== 'auto' && isPlannerMode(dayLog.mode)) {
      requested = dayLog.mode
    }

    // ── Feasibility with realized capacity preference ──
    const realized = realizedCapacity(ctx)
    const weekdayAvg = Math.round(
      ((planRow.weekdayMinutes || planRow.dailyMinutes) * 5 + (planRow.weekendMinutes || planRow.dailyMinutes) * 2) / 7,
    )
    const useRealized = realized.median >= 15 && realized.days >= 5
    const capacityPerDay = useRealized ? realized.median : weekdayAvg
    const realizedNote = useRealized
      ? ` (using your realized median of ${realized.median} min/day over ${realized.days} active days)`
      : null
    const feasibility = computeFeasibility(ctx, capacityPerDay, realizedNote)

    // ── Plan shape (regenerated live; persisted for the record) ──
    const plan = buildPlanShape(ctx, feasibility)
    await db.plannerPlan.update({
      where: { id: planRow.id },
      data: { plan: plan as never, feasibility: feasibility as never },
    })

    // ── TODAY (generates tasks on first visit of the day / mode change) ──
    const { today } = await generateToday(ctx, !!planRow, requested, feasibility)
    const freshCtx = await loadPlannerContext(profile, {
      planId: planRow.id,
      dailyMinutes: planRow.dailyMinutes,
      weekdayMinutes: planRow.weekdayMinutes,
      weekendMinutes: planRow.weekendMinutes,
      offDays: (planRow.offDays as string[]) ?? [],
      targetNote: planRow.targetNote,
    })

    const progress = await buildProgress(freshCtx)
    const intelligence = buildIntelligence(freshCtx, today)

    const payload: PlannerHome = {
      hasPlan: true,
      plan,
      settings: {
        examDate: planRow.examDate ? planRow.examDate.toISOString() : null,
        examLabel: planRow.examLabel,
        targetNote: planRow.targetNote,
        dailyMinutes: planRow.dailyMinutes,
        weekdayMinutes: planRow.weekdayMinutes,
        weekendMinutes: planRow.weekendMinutes,
        offDays: (planRow.offDays as string[]) ?? [],
      },
      feasibility,
      today,
      progress,
      subjects: subjectUrgency(freshCtx).slice(0, 6),
      intelligence,
      realized: useRealized
        ? { medianMinutesPerDay: realized.median, daysSampled: realized.days, note: 'Capacity estimate uses your realized median — the plan bends to what you actually do, not what you wish.' }
        : null,
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[api/planner/home]', err)
    return NextResponse.json({ error: 'Failed to load planner' }, { status: 500 })
  }
}
