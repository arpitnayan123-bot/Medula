import { db } from '@/lib/db'
import {
  buildTutorContext,
  serializePersonalization,
  PERSONALIZATION_RULES,
  yearLabelFor,
} from '@/lib/tutor-context'
import type { VoiceMode, VoiceModeInfo } from '@/lib/types'

// PRODUCT 11 — MEDICAL VOICE TUTOR
// Server-side engine for hands-free conversational learning:
//   «Listen → Speak → Answer → Get feedback → Learn»
// One builder composes the tutor's system prompt from measured platform data
// (personalization, revision queue, topic grounding). The tutor's spoken
// replies are graded by appending a fenced `voiceeval` block — parsed and
// STRIPPED server-side so it never reaches the client (no chain-of-thought,
// no raw evaluation scaffolding). AI never touches deterministic MCQ scoring:
// this engine only grades free spoken answers inside voice sessions.

export const VOICE_MODES: VoiceModeInfo[] = [
  {
    id: 'listen',
    name: 'Listen',
    tagline: 'AI teaches a topic conversationally',
    speak: '“Explain this topic.”',
    expectsAnswer: false,
  },
  {
    id: 'rapid',
    name: 'Rapid Fire',
    tagline: 'Quick questions, spoken answers',
    speak: '“Quiz me on pharmacology.”',
    expectsAnswer: true,
  },
  {
    id: 'viva',
    name: 'Viva',
    tagline: 'A structured oral medical viva',
    speak: '“Take my viva on pathology.”',
    expectsAnswer: true,
  },
  {
    id: 'revision',
    name: 'Revision',
    tagline: 'Your revision queue, spoken',
    speak: '“Revise my weak topics.”',
    expectsAnswer: true,
  },
  {
    id: 'clinical',
    name: 'Clinical',
    tagline: 'An interactive case by voice',
    speak: '“Give me a clinical case.”',
    expectsAnswer: true,
  },
  {
    id: 'doubt',
    name: 'Doubt',
    tagline: 'Ask anything, hear the explanation',
    speak: '“Explain this simply.”',
    expectsAnswer: false,
  },
]

export function isVoiceMode(v: string): v is VoiceMode {
  return VOICE_MODES.some((m) => m.id === v)
}

export function modeInfo(mode: VoiceMode): VoiceModeInfo {
  return VOICE_MODES.find((m) => m.id === mode) ?? VOICE_MODES[0]
}

// ── Structured spoken-answer evaluation (stripped before it ships) ────────
// The tutor appends EXACTLY this fenced block whenever it grades a spoken
// answer in a graded mode. The route parses it into the append-only evals
// log and removes it from the spoken/display text.

export interface VoiceEval {
  concept: string
  verdict: 'correct' | 'partial' | 'missed'
  note: string
}

export function parseVoiceEvals(raw: string): { clean: string; evals: VoiceEval[] } {
  const evals: VoiceEval[] = []
  const clean = raw
    .replace(/```voiceeval\s*([\s\S]*?)```/g, (_m, body: string) => {
      try {
        const parsed = JSON.parse(body.trim()) as Partial<VoiceEval>
        if (parsed && typeof parsed.concept === 'string' && parsed.concept.trim()) {
          const verdict =
            parsed.verdict === 'correct' || parsed.verdict === 'partial' || parsed.verdict === 'missed'
              ? parsed.verdict
              : 'partial'
          evals.push({
            concept: parsed.concept.trim().slice(0, 120),
            verdict,
            note: typeof parsed.note === 'string' ? parsed.note.trim().slice(0, 240) : '',
          })
        }
      } catch {
        /* malformed block — drop it silently, the spoken text still ships */
      }
      return ''
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { clean, evals }
}

// ── Voice style (shared across every mode) ────────────────────────────────
// Everything the tutor says is spoken aloud by TTS: no markdown decorations,
// no tables, no symbols read as characters. Short turns, one idea per
// sentence, explicit handoffs so the student knows when to speak.

const VOICE_STYLE = `VOICE STYLE (this reply will be read aloud by text-to-speech — non-negotiable):
- PLAIN SPOKEN PROSE only. NEVER use markdown: no asterisks, no headers, no bullet points, no tables, no numbered lists, no emojis, no URLs. Write full flowing sentences.
- Keep each turn SHORT: at most 120 spoken words unless the student explicitly asks for detail. One idea per sentence.
- Numbers: prefer words for small counts ("three signs" not "3 signs"); keep drug doses and lab values as digits so they are read precisely.
- Always end with a clear handoff so the student knows whether to speak now or just listen: e.g. "Your turn — what is your answer?", "Say continue for the next part", or "Any doubts before we move on?".
- Never ask two questions at once.`

const VOICE_SAFETY = `SAFETY RULES (non-negotiable):
- This is an EDUCATIONAL platform for medical students. Never give individualized medical advice, never diagnose a real patient, never prescribe for a real person. You are not a replacement for a qualified medical professional.
- If the student describes a real patient, say this platform is educational only and direct them to qualified seniors/faculty, then offer to teach the underlying concepts.
- Do not fabricate medical facts, citations, statistics or guidelines. Ground teaching in the PLATFORM CONTENT when provided; if you are uncertain or beyond the platform notes, SAY SO plainly ("I am not certain about this — verify against your standard textbook").
- Keep procedures at educational-description level only.`

const VOICE_IDENTITY = `You are the MEDULA Voice Tutor — the spoken-voice edition of a personal medical teacher for an Indian MBBS student preparing for NEET-PG. This is a HANDS-FREE voice conversation: the student may have the phone down and only listen and speak. You teach, question, grade spoken answers and coach — warmly, briefly, exam-oriented.`

export interface VoiceModeBlock {
  [mode: string]: string
}

const MODE_BLOCKS: VoiceModeBlock = {
  listen: `LISTEN MODE — teach the selected topic conversationally.
- Open the session with a one-line roadmap of the topic, then teach the FIRST chunk only (at most 120 spoken words).
- After each chunk, check in: ask one short understanding question OR invite "say continue for the next part".
- If the student answers your check-in, respond to it before continuing. Weave in the student's weak areas when relevant.
- Weave exam relevance ("this is a classic NEET-PG trap") into the flow, not as a separate lecture.`,

  rapid: `RAPID-FIRE MODE — quick spoken quiz.
- Ask EXACTLY ONE short recall question per turn, then STOP and wait for the spoken answer.
- After each answer: give a one-line verdict plus the correct fact in at most 40 words, then immediately ask the next question.
- Every 5 questions give a spoken scorecard ("three of five so far — the weak one was X").
- Mix difficulty: definition → mechanism → clinical application. Keep questions self-contained (the student cannot read anything).
- EVERY graded answer MUST be followed by the voiceeval block defined below.`,

  viva: `VIVA MODE — conduct a formal oral medical viva as a kind but rigorous examiner.
- Open by announcing the viva subject and the four-part plan: definitions, mechanisms, clinical application, management.
- Ask ONE question per turn and wait. Escalate: each follow-up builds on the previous answer.
- After each answer: state the verdict in one line ("that is correct", "partially right", "that is not right"), add what a strong answer would have included (at most 60 words), then move to the next question.
- After 5 to 6 questions, close the viva: overall performance, the one concept to repair, and one line of encouragement.
- EVERY graded answer MUST be followed by the voiceeval block defined below.`,

  revision: `REVISION MODE — convert the student's revision queue into a spoken session.
- Work through the TODAY'S SPOKEN REVISION QUEUE items one at a time, in priority order.
- For each item: give a one-line recall cue ("in one line, what is X?"), wait for the spoken answer, then confirm or correct using the PLATFORM NOTES for that item. If the student struggles, teach the one-liner and the most common mistake, then retest from a different angle once.
- After each item, say whether it stays on the revision list in everyday words.
- EVERY graded item MUST be followed by the voiceeval block defined below.`,

  clinical: `CLINICAL MODE — run an interactive clinical case entirely by voice.
- Build ONE realistic Indian patient vignette consistent with the teaching context (or pick a classic for the student's level): age, sex, occupation, presenting complaint.
- Reveal the case in STAGES, one stage per turn: history → examination findings → ask for differentials ranked → investigations → initial management. After each stage, ask the student to commit to a decision before revealing the next.
- When the student commits, grade briefly (what was right, what was missed) and continue the case.
- Management stays educational (principles, first-line classes) — never a prescription for a real person.
- EVERY graded decision MUST be followed by the voiceeval block defined below (concept = the case's key diagnosis or the decision topic).`,

  doubt: `DOUBT MODE — the student asks a medical question by voice; you explain.
- Answer the spoken question directly in at most 120 words: what it is, why it happens, how it shows up, why it matters for exams.
- Then offer exactly one useful next step ("want the exam angle, or a case to see it in action?").
- If the question is ambiguous, ask one short clarifying question first.`,
}

const VOICE_EVAL_CONTRACT = `GRADED-ANSWER FORMAT (only in modes that grade answers — rapid, viva, revision, clinical):
Whenever you grade a spoken answer, END your reply with EXACTLY one fenced block and nothing after it:
\`\`\`voiceeval
{"concept":"<the concept being tested, 2-6 words>","verdict":"correct|partial|missed","note":"<one-line what was right or missed>"}
\`\`\`
The block is machine-read and hidden from the student. The spoken part of your reply must never mention the block.

SESSION ARC: when a viva, rapid-fire set or clinical case reaches its natural end (wrap-up delivered), append [SESSION_END] as the very last line of that reply. It is machine-read, stripped, and never spoken.`

// ── Revision queue → spoken grounding ─────────────────────────────────────

async function revisionQueueBlock(): Promise<string> {
  const items = await db.revisionItem.findMany({
    where: { cleared: false },
    include: {
      concept: {
        select: {
          name: true,
          summary: true,
          lesson: true,
          topic: { select: { name: true, subject: { select: { name: true } } } },
        },
      },
    },
    orderBy: { priority: 'desc' },
    take: 6,
  })
  if (!items.length) return ''
  const lines = items.map((r, i) => {
    const lesson = (r.concept?.lesson ?? null) as { oneLiner?: string; mistakes?: string[] } | null
    const where = r.concept?.topic ? `${r.concept.topic.name} (${r.concept.topic.subject.name})` : 'general'
    const cue = r.concept?.summary || lesson?.oneLiner || ''
    const mistakes = (lesson?.mistakes ?? []).slice(0, 2)
    return [
      `${i + 1}. ${r.concept?.name ?? 'Untitled concept'} — ${where}`,
      cue ? `   PLATFORM NOTES (private grounding): ${cue.slice(0, 220)}` : '',
      mistakes.length ? `   COMMON MISTAKES: ${mistakes.join(' | ').slice(0, 200)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })
  return `\n\nTODAY'S SPOKEN REVISION QUEUE (highest priority first — work through these):\n${lines.join('\n')}`
}

// ── Topic grounding (same spirit as the AI Tutor, compressed for voice) ───

async function topicGroundingBlock(topicId: string | null | undefined): Promise<string> {
  if (!topicId) return ''
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    include: {
      subject: { select: { name: true } },
      concepts: {
        select: { name: true, kind: true, summary: true, lesson: true },
        orderBy: { examRelevance: 'desc' },
        take: 10,
      },
    },
  })
  if (!topic) return ''
  const lines = topic.concepts.map((c) => {
    const lesson = (c.lesson ?? null) as { oneLiner?: string } | null
    return `- ${c.name} (${c.kind}): ${(c.summary || lesson?.oneLiner || '').slice(0, 160)}`
  })
  return `\n\nTOPIC IN FOCUS: "${topic.name}" (${topic.subject.name}). Ground teaching in these platform concepts; never contradict them:\n${lines.join('\n')}`
}

// ── The one system-prompt builder every voice route uses ──────────────────

export async function buildVoiceSystemPrompt(opts: {
  mode: VoiceMode
  topicId?: string | null
  topicLabel?: string | null
}): Promise<string> {
  const profile = await getProfileSafe()
  const yearLabel = profile ? yearLabelFor(profile.year) : 'an MBBS student'

  let personalization = ''
  try {
    const ctx = await buildTutorContext(null)
    const serialized = serializePersonalization(ctx)
    if (serialized) {
      personalization = `\n\nWHAT YOU KNOW ABOUT THIS STUDENT (measured platform data):\n${serialized}\n\n${PERSONALIZATION_RULES}\n- Personalization in voice mode means NAMING it briefly and naturally: "You struggled with autonomic pharmacology recently — let's start there." Never recite the whole data block.`
    }
  } catch {
    /* personalization is best-effort — never block the session */
  }

  const [revision, grounding] = await Promise.all([
    opts.mode === 'revision' ? revisionQueueBlock() : Promise.resolve(''),
    topicGroundingBlock(opts.topicId),
  ])

  const focus = opts.topicLabel
    ? `\n\nSESSION FOCUS: the student picked "${opts.topicLabel}" for this ${opts.mode} session.`
    : ''

  const modeBlock = MODE_BLOCKS[opts.mode] ?? MODE_BLOCKS.listen

  return `${VOICE_IDENTITY}

CURRENT STUDENT: ${yearLabel}.${personalization}${focus}${grounding}${revision}

${modeBlock}

${VOICE_EVAL_CONTRACT}

${VOICE_STYLE}

${VOICE_SAFETY}`
}

// ── Opening line per mode (spoken by TTS before the first student turn) ───

export function greetingFor(mode: VoiceMode, topicLabel: string | null, hasQueue: boolean): string {
  const t = topicLabel ? ` on ${topicLabel}` : ''
  switch (mode) {
    case 'listen':
      return `Voice session starting. I'll teach${t || ' the topic'} conversationally — you can interrupt me any time. Say continue whenever you're ready for the next part, or ask me anything. What would you like to learn${t || ' today'}?`
    case 'rapid':
      return `Rapid fire, no notes, just your voice. I ask, you answer out loud, I correct you on the spot. First question coming up. Are you ready?`
    case 'viva':
      return `Welcome to your viva${t}. I'll be your examiner: definitions, mechanisms, clinical application, then management. One question at a time — answer out loud. Ready to begin?`
    case 'revision':
      return hasQueue
        ? `Revision by voice. I'll walk your revision queue one item at a time — recall first, then I fill the gaps. Let's start with the highest-priority item. Ready?`
        : `Your revision queue is clear right now — nothing due. We can revise a topic you choose instead, or run rapid fire. What would you like?`
    case 'clinical':
      return `Clinical mode. I'll bring you a patient, one step at a time — you reason out loud at every decision point. Take your stethoscope. Ready to meet the patient?`
    case 'doubt':
      return `I'm listening. Ask me any medical doubt — I'll explain it simply, then we can go as deep as you want.`
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/** Defensive eval-log parser — shared by the turn and complete routes. */
export function parseEvals(
  raw: unknown,
): { concept: string; verdict: 'correct' | 'partial' | 'missed'; note: string; at: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((e) => {
    if (!e || typeof e !== 'object') return []
    const rec = e as { concept?: unknown; verdict?: unknown; note?: unknown; at?: unknown }
    if (typeof rec.concept !== 'string' || !rec.concept.trim()) return []
    const verdict =
      rec.verdict === 'correct' || rec.verdict === 'partial' || rec.verdict === 'missed'
        ? rec.verdict
        : ('partial' as const)
    return [
      {
        concept: rec.concept.slice(0, 120),
        verdict,
        note: typeof rec.note === 'string' ? rec.note.slice(0, 240) : '',
        at: typeof rec.at === 'string' ? rec.at : new Date().toISOString(),
      },
    ]
  })
}

/** Defensive transcript parser — the append-only log is server-owned, but a
 *  corrupted row must never 500 the session. */
export function parseTranscript(raw: unknown): { role: 'tutor' | 'student'; text: string; at: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (e): e is { role: unknown; text: unknown; at: unknown } =>
        !!e && typeof e === 'object' && typeof (e as { text?: unknown }).text === 'string',
    )
    .filter((e) => e.role === 'tutor' || e.role === 'student')
    .map((e) => ({
      role: e.role as 'tutor' | 'student',
      text: (e.text as string).slice(0, 4000),
      at: typeof e.at === 'string' ? e.at : new Date().toISOString(),
    }))
}

async function getProfileSafe() {
  try {
    const { getDemoProfile } = await import('@/lib/profile')
    return await getDemoProfile()
  } catch {
    return null
  }
}
