// ─── LEARN STATUS — the 5-state progress model ──────────────────────────────
// Shared by the Learn APIs (topic/subject/progress) and any surface that
// shows study progress. The 5 user-facing states resolve as:
//     user mark (LearnProgress) ?? auto-derived (KnowledgeState analytics)
// A user mark is ALWAYS authoritative — analytics only fill the gaps.

export type LearnStatus =
  | 'not-started'
  | 'learning'
  | 'completed'
  | 'needs-revision'
  | 'mastered'

export const LEARN_STATUSES: readonly LearnStatus[] = [
  'not-started', 'learning', 'completed', 'needs-revision', 'mastered',
] as const

/** Short, human labels used across Learn surfaces. */
export const LEARN_STATUS_LABEL: Record<LearnStatus, string> = {
  'not-started': 'Not started',
  learning: 'Learning',
  completed: 'Completed',
  'needs-revision': 'Needs revision',
  mastered: 'Mastered',
}

/** Marks a user may set explicitly ('not-started' = clear the mark). */
export const SETTABLE_LEARN_STATUSES: readonly Exclude<LearnStatus, 'not-started'>[] = [
  'learning', 'completed', 'needs-revision', 'mastered',
] as const

export function isSettableLearnStatus(v: unknown): v is Exclude<LearnStatus, 'not-started'> {
  return typeof v === 'string' && (SETTABLE_LEARN_STATUSES as readonly string[]).includes(v)
}

/** Minimal analytics slice needed for derivation (KnowledgeState-shaped). */
export interface KnowledgeSlice {
  score: number
  attemptCount: number
  estRecall: number
}

/**
 * Auto-derive the 5-state status from learning analytics.
 * Honest and conservative: without engagement a concept stays "not started".
 */
export function deriveLearnStatus(state: KnowledgeSlice | null | undefined): LearnStatus {
  if (!state || (state.attemptCount === 0 && state.score <= 0)) return 'not-started'
  if (state.score >= 85 && state.estRecall >= 0.65) return 'mastered'
  if (state.estRecall < 0.55) return 'needs-revision'
  return 'learning'
}

/**
 * Effective status: explicit user mark wins; otherwise analytics derive it.
 */
export function effectiveLearnStatus(
  mark: string | null | undefined,
  state: KnowledgeSlice | null | undefined,
): LearnStatus {
  if (mark && (LEARN_STATUSES as readonly string[]).includes(mark) && mark !== 'not-started') {
    return mark as LearnStatus
  }
  return deriveLearnStatus(state)
}

/** Day in ms — parity with lib/engine's DAY constant. */
export const DAY_MS = 86_400_000
