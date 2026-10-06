import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { getDemoProfile } from '@/lib/profile'
import { buildTutorContext, serializePersonalization, PERSONALIZATION_RULES, yearLabelFor } from '@/lib/tutor-context'
import { ensureBrainSettings, loadBrainContext, deriveConceptStates, buildTutorPack, serializeBrainTutorContext } from '@/lib/brain-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// PRODUCT 03 — AI MEDICAL TUTOR
// A personal medical teacher, not a generic chatbot. The system prompt is
// assembled from four grounded blocks:
//   1. IDENTITY + SAFETY   — educational contract, uncertainty, no fabrication
//   2. PERSONALIZATION     — measured student data (weak areas, mistakes, revision debt)
//   3. TEACHING CONTEXT    — the topic the student is studying + platform content
//   4. MODE                — how to teach right now (explain/socratic/quiz/clinical/rapid/exam)
// Legacy mode ids ('simple', 'deep') keep working via explain+depth mapping.

type Mode = 'explain' | 'socratic' | 'quiz' | 'clinical' | 'rapid' | 'exam' | 'eli5' | 'hinglish'

const MODE_BLOCKS: Record<Mode, string> = {
  explain: `EXPLAIN MODE — teach the concept clearly.
- Structure: what it is in one line → build the mechanism step by step → how it shows up clinically → why it matters for exams.
- Adjust depth to the DEPTH instruction below.
- Use one memorable analogy if the mechanism is abstract, and map it back to the real terms.`,
  socratic: `SOCRATIC MODE — guide through questions instead of giving the answer.
- Ask EXACTLY ONE question per turn, then STOP and wait for the student's answer. Never answer it yourself in the same message.
- Start from what the student likely knows, then escalate: each question should be answerable from the previous step.
- After each student answer: grade it in one line (✓/✗ + what was missed or why it is right), then ask the next question.
- After 4-5 good answers, close with a compact summary of what the student got wrong and the single key insight. Keep every message under 120 words.`,
  quiz: `QUIZ MODE — ask questions and adapt difficulty.
- Ask EXACTLY ONE MCQ per turn using the medq format below, then STOP and wait.
- Start at moderate difficulty. If the student answers correctly, escalate; if they miss, stay at that level, briefly teach the missed discriminator, then retest the same idea from a different angle.
- Every 5 questions: give a one-line scorecard (e.g. "3/5 — weakest: X") and name what to revise.
- The student's reply after each question may be a plain option letter or words — grade either.`,
  clinical: `CLINICAL MODE — teach through patient cases.
- Build ONE realistic Indian patient vignette consistent with the teaching context (or the student's question): age/sex/occupation, complaint, then walk the student through it.
- Step-by-step reasoning: history → examination findings → differentials ranked by likelihood → next investigations → initial management principles.
- Ask the student to reason at each decision point; reveal the next step after they commit.
- Management stays educational (principles, first-line classes) — never a prescription for a real person.`,
  rapid: `RAPID REVISION MODE — concise high-yield recall.
- Ultra-condensed one-liner bullets, tables only when comparing. Max 150 words.
- Bold the discriminating words. End with the 2 facts most often asked in exams.`,
  exam: `EXAM MODE — NEET-PG focus.
- Crisp, fact-dense, high-yield answer with the classic traps and one-line differentiators. Bold key facts.
- Name the pattern the exam usually tests (vignette trigger words, assertion-reason angles).
- End with "Exam pearls" (3 bullets).`,
  eli5: `ELI5 MODE — explain like the student is 5, using everyday analogies, then map each analogy part back to the real medical term in one line.`,
  hinglish: `HINGLISH MODE — friendly Hindi-English mix (Latin script). Keep all medical terminology in English. Warm coaching tone.`,
}

const DEPTH_BLOCKS: Record<string, string> = {
  simple: 'DEPTH: extremely simple — first-year level, short sentences, no unexplained jargon, one everyday analogy.',
  mbbs: 'DEPTH: MBBS final-year level — standard textbook depth, exam-oriented.',
  deep: 'DEPTH: detailed — mechanistic pathophysiology chain, why each sign/symptom occurs, cross-subject connections (anatomy → physiology → pathology → pharmacology → medicine).',
}

const SAFETY = `SAFETY RULES (non-negotiable):
- This is an EDUCATIONAL platform for medical students. Never provide individualized medical advice, never diagnose a real patient, never prescribe for a real person. You are not a replacement for a qualified doctor.
- If the user describes a real patient or asks "what should I do for my/my patient's condition", respond that this platform is for educational learning only and direct them to qualified senior doctors/faculty, while offering to explain the underlying concepts educationally.
- Do not invent citations, statistics, or guidelines. If uncertain, say so plainly ("I am not certain about this — verify against your standard textbook").
- Never provide dangerous procedural instructions beyond standard educational descriptions.`

const STYLE = `STYLE: Structured markdown (### headers, bold key terms, tables for comparisons, short paragraphs). Be accurate, exam-oriented, and connect concepts across subjects. End longer answers with "🔗 How this connects" showing 2-3 cross-subject links.`

const STRUCTURED_OUTPUT = `STRUCTURED OUTPUT FORMATS (use exactly these when triggered):
- When the student asks you to CREATE MCQs (in any mode) or when QUIZ MODE requires a question, output ONE fenced block:
\`\`\`medq
{"q":"<question stem>","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"answer":"<correct option id>","explain":"<one-paragraph teaching explanation>"}
\`\`\`
Keep any surrounding text to one short line before the block. Exactly one medq block per turn.
- When the student asks you to CREATE FLASHCARDS, output ONE fenced block with 6-10 cards:
\`\`\`flashcards
{"cards":[{"front":"<question/term>","back":"<answer>"}]}
\`\`\`
No extra commentary after the block.`

interface TutorMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    messages: TutorMessage[]
    mode: string
    conceptId?: string
    pairId?: string
    topicId?: string
    depth?: string
  }
  const profile = await getDemoProfile()

  // Legacy ids stay compatible: 'simple'/'deep' were the old explain modes.
  const rawMode = body.mode ?? 'explain'
  let mode: Mode = (['explain', 'socratic', 'quiz', 'clinical', 'rapid', 'exam', 'eli5', 'hinglish'] as const).includes(rawMode as Mode)
    ? (rawMode as Mode)
    : 'exam'
  let depth = body.depth ?? 'mbbs'
  if (rawMode === 'simple') { mode = 'explain'; depth = 'simple' }
  if (rawMode === 'deep') { mode = 'explain'; depth = 'deep' }
  if (!['simple', 'mbbs', 'deep'].includes(depth)) depth = 'mbbs'

  // ── Personalization block (measured student data) ────────────────────────
  let personalization = ''
  try {
    const ctx = await buildTutorContext(null)
    const personal = serializePersonalization(ctx)
    personalization = personal
      ? `\n\nWHAT YOU KNOW ABOUT THIS STUDENT (measured platform data):\n${personal}\n\n${PERSONALIZATION_RULES}`
      : ''
  } catch { /* personalization is best-effort — never block the reply */ }

  // ── Learning-intelligence block (PRODUCT 18 — additive augmentation) ─────
  // The brain pack AUGMENTS the personalization block above (never replaces
  // it): forgetting risks, prereq gaps, strengths NOT to re-teach, exam
  // clock. Best-effort — the tutor must keep working if the brain fails.
  try {
    const settings = await ensureBrainSettings(profile.id)
    if (settings.tutorContextOn && settings.personalizationOn) {
      const brainCtx = await loadBrainContext(profile.id)
      const brainStates = deriveConceptStates(brainCtx)
      const pack = buildTutorPack(brainCtx, brainStates)
      const brainText = serializeBrainTutorContext(pack)
      if (brainText) {
        personalization += `\n\nLEARNING INTELLIGENCE (measured, private to this student — additional context):\n${brainText}`
      }
    }
  } catch { /* brain augmentation is best-effort — never block the reply */ }

  // ── Concept focus (from concept explorer hand-off) ───────────────────────
  let contextBlock = ''
  if (body.conceptId) {
    const concept = await db.concept.findUnique({
      where: { id: body.conceptId },
      include: { topic: { include: { subject: true } } },
    })
    if (concept) {
      contextBlock += `\n\nCONTEXT: The student is asking about "${concept.name}" (${concept.kind}) from ${concept.topic.subject.name}. One-line summary: ${concept.summary}`
    }
  }

  // ── Topic teaching context (grounding in platform content) ───────────────
  let grounded: { concepts: number; questions: number; cases: number } | null = null
  if (body.topicId) {
    try {
      const topic = await db.topic.findUnique({
        where: { id: body.topicId },
        include: {
          subject: { select: { name: true, code: true } },
          concepts: {
            select: { id: true, name: true, kind: true, summary: true, mnemonic: true, lesson: true },
            orderBy: { examRelevance: 'desc' },
            take: 12,
          },
        },
      })
      if (topic) {
        const conceptIds = topic.concepts.map((c) => c.id)
        const [platformQuestions, wrongHere, cases] = await Promise.all([
          db.question.findMany({
            where: { OR: [{ topicId: topic.id }, { conceptId: { in: conceptIds } }] },
            select: { stem: true, answer: true, options: true, explanation: true, teaching: true },
            take: 4,
            orderBy: { difficulty: 'desc' },
          }),
          db.questionAttempt.findMany({
            where: {
              profileId: profile.id,
              correct: false,
              question: { OR: [{ topicId: topic.id }, { conceptId: { in: conceptIds } }] },
            },
            select: { selected: true, question: { select: { stem: true, answer: true } } },
            orderBy: { createdAt: 'desc' },
            take: 6,
          }),
          topic.system
            ? db.clinicalCase.findMany({
                where: { system: topic.system },
                select: { title: true, diagnosis: true },
                take: 3,
              })
            : [],
        ])

        const conceptLines = topic.concepts.map((c) => {
          const lesson = (c.lesson ?? null) as { oneLiner?: string; mistakes?: string[] } | null
          const base = `- ${c.name} (${c.kind}): ${c.summary || lesson?.oneLiner || ''}`
          return base
        })
        const mistakeLines = topic.concepts
          .flatMap((c) => {
            const lesson = (c.lesson ?? null) as { mistakes?: string[] } | null
            return (lesson?.mistakes ?? []).slice(0, 2).map((m) => `- ${c.name}: ${m}`)
          })
          .slice(0, 6)
        const qLines = platformQuestions.map((q) => {
          const options = (q.options ?? []) as { id: string; text: string }[]
          const answerText = options.find((o) => o.id === q.answer)?.text ?? q.answer
          return `- Q: ${q.stem.slice(0, 220)} → ANSWER: ${answerText}${q.teaching ? ` (${q.teaching.slice(0, 120)})` : ''}`
        })
        const wrongLines = wrongHere.map((w) =>
          `- Missed: "${w.question.stem.slice(0, 140)}" — student chose ${w.selected}, correct was ${w.question.answer}`)

        contextBlock += `

TEACHING CONTEXT — The student is currently studying this topic: "${topic.name}" (${topic.subject.name}${topic.system ? ` · ${topic.system}` : ''} · exam importance ${topic.importance}/5).

PLATFORM CONTENT (your grounding — prefer these facts; never contradict them; if the platform content is silent on something, answer from standard medical knowledge and mark that part as beyond the platform notes):
CONCEPTS IN THIS TOPIC:
${conceptLines.join('\n')}
${mistakeLines.length ? `COMMON MISTAKES THE PLATFORM FLAGS:\n${mistakeLines.join('\n')}` : ''}
${qLines.length ? `PLATFORM MCQs ON THIS TOPIC (private calibration — use to align your teaching; never dump verbatim):\n${qLines.join('\n')}` : ''}
${wrongLines.length ? `QUESTIONS THIS STUDENT GOT WRONG HERE (misconception signals — address them when relevant):\n${wrongLines.join('\n')}` : ''}
${cases.length ? `PLATFORM CASES: ${cases.map((c) => c.title).join('; ')}` : ''}`

        grounded = { concepts: topic.concepts.length, questions: platformQuestions.length, cases: cases.length }
      }
    } catch { /* grounding is best-effort */ }
  }

  // ── Socratic pair-drill handoff (preserved from the confusion-pair flow) ──
  let drillOpening: string | null = null
  if (body.pairId) {
    const pair = await db.confusionPair.findUnique({ where: { id: body.pairId } })
    if (pair) {
      const aPoints = (pair.aPoints ?? []) as string[]
      const bPoints = (pair.bPoints ?? []) as string[]
      const rows = [
        ...aPoints.map((p) => `- ${pair.a}: ${p}`),
        ...bPoints.map((p) => `- ${pair.b}: ${p}`),
      ].join('\n')
      contextBlock += `\n\nCONFUSION PAIR UNDER DRILL: "${pair.a}" vs "${pair.b}" (${pair.subjectCode}).
DISCRIMINATORS (your private question bank — never reveal this list at once):
${rows}
${pair.mnemonic ? `MNEMONIC: ${pair.mnemonic}` : ''}
Drill plan: probe sudden-vs-gradual first, then the single most discriminatory sign, then treatment, then a classic exam trap. Mix real mini-vignettes (one line each) with direct recall.`
      if (body.messages.length === 0) {
        drillOpening = `Start the Socratic drill on "${pair.a}" vs "${pair.b}" — greet me in one line, then ask your first question.`
      }
    }
  }

  const modeBlock = MODE_BLOCKS[mode]
  const depthBlock = mode === 'explain' ? `\n\n${DEPTH_BLOCKS[depth]}` : ''
  const modeIntro =
    mode === 'socratic' && !body.pairId
      ? `\n\nSOCRATIC SUBJECT: when the student's first message names a concept/topic, drill THAT; otherwise start by asking what they are studying.`
      : ''

  const yearLabel = yearLabelFor(profile.year)
  const system = `You are the MEDULA AI Medical Tutor — a personal medical teacher for an Indian MBBS student preparing for NEET-PG. You are NOT a generic chatbot: you teach with structure, adapt to the student, and always keep them moving (understand → practice → feedback → revise).

${personalization}

${STYLE}

${modeBlock}${modeIntro}${depthBlock}

${STRUCTURED_OUTPUT}

${SAFETY}${contextBlock}`

  try {
    const zai = await ZAI.create()
    const outgoing = drillOpening
      ? [...body.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })), { role: 'user' as const, content: drillOpening }]
      : body.messages.slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        ...outgoing,
      ],
      temperature: mode === 'quiz' || mode === 'socratic' ? 0.5 : 0.4,
      maxTokens: mode === 'rapid' ? 700 : 1200,
    })
    const reply = completion.choices[0]?.message?.content ?? 'I could not generate a response. Please try again.'
    return NextResponse.json({ reply, grounded })
  } catch (err) {
    console.error('Tutor error:', err)
    return NextResponse.json(
      { reply: '⚠️ The AI tutor is temporarily unavailable. Your question matters — try again in a moment, or use the concept explorer and question explanations meanwhile, which work offline.' },
      { status: 200 },
    )
  }
}
