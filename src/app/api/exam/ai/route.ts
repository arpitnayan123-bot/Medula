import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { readJson, asTrimmed } from '@/lib/http'
import type { ExamAiAction, ExamAiResponse, ExamAnalysis, ExamMode } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── POST /api/exam/ai — the AI Test Analyst ────────────────────────────────
// Grounding is ALWAYS the stored, deterministic ExamAnalysis of a submitted
// test (plus this profile's all-time measured patterns). The LLM narrates
// what the numbers already say — it never grades, never invents facts, and
// never exposes a chain of thought (conclusions only). On SDK failure a
// deterministic fallback text is assembled from the same analysis.

const ACTIONS: ExamAiAction[] = ['what-went-wrong', 'study-next', 'important-mistakes', 'revise', 'next-test']

const DISCLAIMER = 'AI analysis of your measured test data — verify against your standard textbooks. Not medical advice.'
const AI_BADGE = 'AI analyst · built on your measured results'

const JSON_RULE =
  'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after, no markdown fences needed (but if you use them, keep the JSON intact). Shape: {"text":"<the answer as ONE string, newlines escaped as \\n>"}.'

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parseLooseJson(text: string): Record<string, unknown> | null {
  const direct = tryParse(text.trim())
  if (direct) return direct
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const fromFence = tryParse(fence[1]!.trim())
    if (fromFence) return fromFence
  }
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const sliced = tryParse(text.slice(first, last + 1))
    if (sliced) return sliced
  }
  return null
}

function salvageText(raw: string): string {
  const m = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
  if (m) return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
  const parsed = parseLooseJson(raw)
  const candidates = parsed
    ? Object.values(parsed).filter((v): v is string => typeof v === 'string' && v.trim().length > 40)
    : []
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0]!.slice(0, 4000)
  return raw.replace(/```(?:json)?/gi, '').trim().slice(0, 4000)
}

// ── grounding: the measured analysis, verbatim numbers ──────────────────────
function analysisGrounding(a: ExamAnalysis): string {
  const t = a.totals
  const lines: string[] = [
    `TEST — ${a.label} (mode: ${a.mode}${a.negativeMark ? ', negative marking +4/−1' : ', no negative marking'})`,
    `SCORE: ${t.score}/${t.maxScore} (${t.percent}%) · accuracy ${t.accuracy}% (${t.correct}/${t.answered} attempted) · unattempted ${t.unattempted}/${t.total}`,
    `TIME: total ${Math.round(t.timeMs / 60000)} min · avg ${Math.round(a.speed.avgTimeMs / 1000)}s per question (${a.speed.band}) · time split: ${a.speed.buckets.map((b) => `${b.count} ${b.label}`).join(', ')}`,
    `MISTAKE PROFILE (measured): careless/fast-wrongs ${a.mistakes.careless} · conceptual (long-wrong) ${a.mistakes.conceptual} · changed-to-wrong ${a.mistakes.changedToWrong} · changed-to-right ${a.mistakes.changedToRight} · repeated (missed ≥2× before) ${a.mistakes.repeated}`,
  ]
  if (a.subjects.length) {
    lines.push('SUBJECTS (best→worst by marks): ' + a.subjects.map((s) => `${s.name} ${s.score > 0 ? '+' : ''}${s.score} marks, ${s.accuracy}% acc, ${s.unattempted} skipped`).join(' | '))
  }
  if (a.weakTopics.length) {
    lines.push('WEAK TOPICS (≤50% in this test): ' + a.weakTopics.map((w) => `${w.name} ${w.correct}/${w.total}`).join(', '))
  }
  if (a.strongTopics.length) {
    lines.push('STRONG TOPICS (≥75%): ' + a.strongTopics.map((w) => `${w.name} ${w.correct}/${w.total}`).join(', '))
  }
  if (a.weakConcepts.length) {
    lines.push('WEAK CONCEPTS: ' + a.weakConcepts.map((c) => `${c.conceptName} (${c.correct}/${c.total}${c.mastery !== null ? `, mastery ${c.mastery}%` : ''})`).join(', '))
  }
  if (a.difficulty.length) {
    lines.push('DIFFICULTY SPLIT: ' + a.difficulty.map((d) => `level ${d.d}: ${d.correct}/${d.total}`).join(', '))
  }
  if (a.pyq) {
    lines.push(`PYQ-PATTERN QUESTIONS: ${a.pyq.correct}/${a.pyq.attempted} right (${a.pyq.accuracy}%)`)
  }
  if (a.repeatedWrong.length) {
    lines.push('ALL-TIME REPEATED MISSES: ' + a.repeatedWrong.map((r) => `${r.conceptName} ×${r.misses}`).join(', '))
  }
  if (a.improvement) {
    lines.push(`VS PREVIOUS TEST ("${a.improvement.vsLabel}"): score ${a.improvement.scoreDelta !== null ? (a.improvement.scoreDelta > 0 ? '+' : '') + a.improvement.scoreDelta + ' pts' : 'n/a'}, accuracy ${a.improvement.accuracyDelta !== null ? (a.improvement.accuracyDelta > 0 ? '+' : '') + a.improvement.accuracyDelta + ' pts' : 'n/a'}`)
  }
  if (a.recommended) {
    lines.push(`ENGINE'S NEXT-TEST RECOMMENDATION: ${a.recommended.mode} — ${a.recommended.reason}`)
  }
  return lines.join('\n')
}

function fallbackFor(action: ExamAiAction, a: ExamAnalysis): string {
  const t = a.totals
  if (action === 'what-went-wrong') {
    const parts: string[] = []
    if (a.mistakes.conceptual > 0) parts.push(`${a.mistakes.conceptual} conceptual breaks — questions you worked long on and still missed`)
    if (a.mistakes.careless > 0) parts.push(`${a.mistakes.careless} careless losses (fast wrongs or changed answers)`)
    if (t.unattempted > 0) parts.push(`${t.unattempted} questions left unattempted`)
    if (a.mistakes.changedToWrong > 0) parts.push(`${a.mistakes.changedToWrong} answer change(s) turned right answers wrong`)
    return parts.length
      ? `Score ${t.score}/${t.maxScore} (${t.percent}%). What went wrong, measured: ${parts.join('; ')}.`
      : `Score ${t.score}/${t.maxScore} (${t.percent}%) — no single failure pattern dominates this paper; review the wrong answers one by one.`
  }
  if (action === 'study-next') {
    const wt = a.weakTopics[0]
    const wc = a.weakConcepts[0]
    if (wt) {
      return `Start with ${wt.name} — your weakest topic in this test (${wt.correct}/${wt.total}). Then work down the weak list. The engine's recommended next test: ${a.recommended?.mode ?? 'weak-area'} — ${a.recommended?.reason ?? 'repair the measured weak spots'}.`
    }
    if (wc) {
      return `Start with ${wc.conceptName} — your weakest concept in this test (${wc.correct}/${wc.total}). Then work down the weak list. The engine's recommended next test: ${a.recommended?.mode ?? 'weak-area'} — ${a.recommended?.reason ?? 'repair the measured weak spots'}.`
    }
    return `No measured weak topic stands out — keep the mixed cadence. Engine's next test: ${a.recommended?.mode ?? 'full'} — ${a.recommended?.reason ?? ''}.`
  }
  if (action === 'important-mistakes') {
    if (a.repeatedWrong.length) {
      const top = a.repeatedWrong[0]
      return `Most important: ${top.conceptName} — missed ${top.misses}× before and again in this test${a.mistakes.repeated > 0 ? ` (${a.mistakes.repeated} repeated miss${a.mistakes.repeated === 1 ? '' : 'es'} in this paper)` : ''}. Repeated misses cost the most per hour of study — retest it first.`
    }
    if (a.mistakes.careless >= 3) return `Most important: the ${a.mistakes.careless} careless losses — you knew these and lost the marks. Slow the pace, re-read the stem, then check the answer once before moving on.`
    if (a.weakConcepts.length) return `Most important: ${a.weakConcepts.slice(0, 3).map((c) => c.conceptName).join(', ')} — fresh conceptual breaks from this paper. Repair them before they become repeated misses.`
    return 'No high-priority mistakes in this paper — the wrong answers worth reviewing are flagged in the review list below.'
  }
  if (action === 'revise') {
    const list = [...a.weakTopics.map((w) => w.name), ...a.weakConcepts.slice(0, 3).map((c) => c.conceptName)].slice(0, 5)
    return list.length
      ? `Revise, in this order: ${list.join(' → ')}. These came out of this test's measured weak areas.`
      : 'Nothing from this paper demands revision — accuracy held across the topics it touched. Keep the spaced-revision cadence you already have.'
  }
  // next-test
  return a.recommended
    ? `Your next test: ${a.recommended.mode} — ${a.recommended.reason}. That is the deterministic engine recommendation from this paper's data.`
    : 'Take the next test after a repair pass on the weak topics above.'
}

export async function POST(req: NextRequest) {
  const body = await readJson<{ action?: unknown; attemptId?: unknown }>(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const action = asTrimmed(body.action, 30) as ExamAiAction | null
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }
  const attemptId = asTrimmed(body.attemptId, 100)
  if (!attemptId) return NextResponse.json({ error: 'attemptId is required' }, { status: 400 })

  const profile = await getDemoProfile()
  const attempt = await db.examAttempt.findUnique({ where: { id: attemptId } })
  if (!attempt || attempt.profileId !== profile.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  }
  if (attempt.status !== 'submitted' || !attempt.report) {
    return NextResponse.json({ error: 'The analyst reads a test after it is submitted' }, { status: 409 })
  }
  const analysis = attempt.report as unknown as ExamAnalysis

  const TASKS: Record<ExamAiAction, string> = {
    'what-went-wrong': `TASK: Answer the student's question "What went wrong in this test?" in 120–180 words. Use ONLY the measured numbers above: name the biggest measurable loss buckets (conceptual breaks, careless/fast wrongs, changed answers, unattempted questions) and point at the concrete topics/concepts where they happened. No rank or score predictions.`,
    'study-next': `TASK: Answer "What should I study next?" in 100–160 words. Prioritise strictly by the measured weak topics/concepts above, in order. Reference the engine's next-test recommendation. No invented study resources.`,
    'important-mistakes': `TASK: Answer "Which mistakes are most important?" in 100–150 words. Rank by measured impact: repeated misses first (they compound), then conceptual breaks, then careless losses. Use the numbers; name the concepts.`,
    revise: `TASK: Answer "What should I revise?" in 80–140 words. List the concrete concepts/topics from the measured weak lists above, in a sensible study order, and say why each earned its place (this test's numbers, or the all-time repeated list).`,
    'next-test': `TASK: Answer "What should my next test contain?" in 80–140 words. Base it on the engine's recommendation and the paper's measured gaps (skipped questions, difficulty splits, subject holes). Be concrete: mode, rough size, what it should cover.`,
  }

  const system = `You are the AI Test Analyst on MEDULA, an educational platform for Indian MBBS/NEET-PG students. You have just been handed the deterministic, measured analysis of one completed mock test. Your job is to narrate what the numbers say — nothing more.

MEASURED ANALYSIS (your ONLY factual grounding — never contradict it, never go beyond it):
${analysisGrounding(analysis)}

${TASKS[action]}

${JSON_RULE}

SAFETY (non-negotiable): Every claim must trace to a number in the analysis above — never invent medical facts, resources, cutoffs or percentiles, and never predict a rank or an exam score. NO chain-of-thought: output conclusions only, never your step-by-step deliberation.`

  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
      ],
      temperature: 0.3,
      maxTokens: 1000,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    const text =
      parsed && typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 4000) : salvageText(content)
    if (!text) throw new Error('empty AI response')
    const payload: ExamAiResponse = { ok: true, action, text, fallback: false, disclaimer: DISCLAIMER, aiBadge: AI_BADGE }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('Exam AI error:', err)
    const payload: ExamAiResponse = { ok: true, action, text: fallbackFor(action, analysis), fallback: true, disclaimer: DISCLAIMER, aiBadge: AI_BADGE }
    return NextResponse.json(payload)
  }
}
