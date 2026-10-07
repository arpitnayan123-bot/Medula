'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import {
  Baby,
  BookMarked,
  Bot,
  Brain,
  ChevronDown,
  Compass,
  Eraser,
  GraduationCap,
  History,
  Flag,
  Languages,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  MessagesSquare,
  Microscope,
  Plus,
  RotateCcw,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Target,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import type { AttemptResult, QuestionClient, TutorContextPayload, TutorDepth, TutorMode } from '@/lib/types'
import { Aurora, Sheen } from '@/components/primitives/aura'
import { Pop, Stagger, StaggerItem } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// ─── Hand-off keys (written by other views) ─────────────────────────────────
// TUTOR_QUESTION_KEY ← global search, doubt search, explorer, topic hub
// TUTOR_PAIR_KEY     ← quiz results pair debrief (Socratic drill)
// TUTOR_TOPIC_KEY    ← topic hub AI section — the whole session becomes topic-aware
const TUTOR_QUESTION_KEY = 'medos:tutor-question'
const TUTOR_PAIR_KEY = 'medos:tutor-pair'
const TUTOR_TOPIC_KEY = 'medula:tutor-topic'

interface DrillPair {
  id: string
  a: string
  b: string
}

// ─── Teaching modes (PRODUCT 03 spec) ───────────────────────────────────────

const MODES: { id: TutorMode; label: string; icon: LucideIcon; desc: string }[] = [
  { id: 'explain', label: 'Explain', icon: Lightbulb, desc: 'Teach the concept clearly — pick a depth below' },
  { id: 'socratic', label: 'Socratic', icon: MessagesSquare, desc: 'Guides you with questions instead of answers' },
  { id: 'quiz', label: 'Quiz', icon: ListChecks, desc: 'Asks MCQs and adapts difficulty to you' },
  { id: 'clinical', label: 'Clinical', icon: Stethoscope, desc: 'Teaches through patient cases' },
  { id: 'rapid', label: 'Rapid Revision', icon: Zap, desc: 'Concise high-yield recall sheet' },
  { id: 'exam', label: 'Exam', icon: GraduationCap, desc: 'NEET-PG patterns, traps and pearls' },
]

const EXTRA_MODES: { id: TutorMode; label: string; icon: LucideIcon; desc: string }[] = [
  { id: 'eli5', label: 'ELI5', icon: Baby, desc: 'Everyday analogies mapped back to real terms' },
  { id: 'hinglish', label: 'Hinglish', icon: Languages, desc: 'Friendly Hindi-English mix, medical terms in English' },
]

const DEPTHS: { id: TutorDepth; label: string; desc: string }[] = [
  { id: 'simple', label: 'Simple', desc: 'First-year level, no unexplained jargon' },
  { id: 'mbbs', label: 'MBBS', desc: 'Final-year textbook depth, exam-oriented' },
  { id: 'deep', label: 'Deep', desc: 'Mechanistic chain + cross-subject links' },
]

// Client-side safety net: real-patient phrasing gets an inline notice under the reply.
const SENSITIVE_RE = /my patient|should i (give|prescribe|start)|real patient/i

const SENSITIVE_NOTICE =
  'This looks like a real-patient question — MEDULA is educational. Discuss with your seniors/faculty.'

const FOOTER_TEXT =
  'Educational content only — never a replacement for a qualified doctor. The AI can be wrong; verify against standard textbooks.'

// A Socratic drill needs at least this many probes to count as a completed
// review in the knowledge engine (matches the API's MIN_PROBES).
const DRILL_MIN_PROBES = 4

let msgSeq = 0
const nextId = (role: string) => `${role}-${Date.now()}-${msgSeq++}`

// ─── Thread message model ───────────────────────────────────────────────────
// role 'quiz' is an ephemeral platform-MCQ widget rendered inside the thread —
// it is never persisted; its outcome lands as a normal user message.

interface QuizPayload {
  topicId?: string
  subjectCode?: string
  label?: string
  count?: number
}

interface TutorMessage {
  id: string
  role: 'user' | 'assistant' | 'quiz'
  content: string
  sensitive?: boolean
  grounded?: { concepts: number; questions: number; cases: number } | null
  quizPayload?: QuizPayload
}

// ─── Structured-block parsing (medq / flashcards fenced JSON) ───────────────

interface MedqData {
  q: string
  options: { id: string; text: string }[]
  answer: string
  explain: string
}

type Segment =
  | { type: 'text'; content: string }
  | { type: 'medq'; data: MedqData }
  | { type: 'flashcards'; data: { cards: { front: string; back: string }[] } }

function parseSegments(content: string): Segment[] {
  const segments: Segment[] = []
  const re = /```(medq|flashcards)\s*\n([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    if (m.index > last) segments.push({ type: 'text', content: content.slice(last, m.index) })
    let parsed = false
    try {
      const data = JSON.parse(m[2].trim()) as MedqData & { cards?: { front: string; back: string }[] }
      if (m[1] === 'medq' && data?.q && Array.isArray(data.options) && data.answer) {
        segments.push({ type: 'medq', data: { q: data.q, options: data.options, answer: data.answer, explain: data.explain ?? '' } })
        parsed = true
      } else if (m[1] === 'flashcards' && Array.isArray(data.cards) && data.cards.length) {
        segments.push({
          type: 'flashcards',
          data: { cards: data.cards.filter((c) => c?.front && c?.back).slice(0, 12) },
        })
        parsed = true
      }
    } catch { /* fall through to raw text */ }
    if (!parsed) segments.push({ type: 'text', content: m[0] })
    last = m.index + m[0].length
  }
  if (last < content.length) segments.push({ type: 'text', content: content.slice(last) })
  return segments
}

// ─── Markdown styling (unchanged from v1) ───────────────────────────────────

const MD_COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="mt-3 text-base font-semibold tracking-tight first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-3 text-sm font-semibold tracking-tight first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-2.5 text-sm font-semibold text-foreground/90 first:mt-0">{children}</h5>,
  h4: ({ children }) => <h6 className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-1.5 text-sm leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed marker:text-primary/70">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-4 text-sm leading-relaxed marker:text-primary/70">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="text-ink-soft">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-sm italic text-ink-soft">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
  code: ({ children }) => <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">{children}</code>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg border border-line bg-surface-2 p-2 text-xs">{children}</pre>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-xs [&_td]:border-b [&_td]:border-line/70 [&_td]:px-2 [&_td]:py-1.5 [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_tr:last-child_td]:border-b-0">
        {children}
      </table>
    </div>
  ),
}

// ─── Thinking indicator ──────────────────────────────────────────────────────

function ThinkingDots({ hint }: { hint?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="flex items-center gap-2.5"
      aria-live="polite"
      role="status"
    >
      <span className="clay-in grid size-8 shrink-0 place-items-center rounded-xl" aria-hidden>
        <Brain className="size-4 text-primary" />
      </span>
      <span className="clay inline-flex items-center gap-2.5 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
        <span className="flex items-end gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-primary"
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
            />
          ))}
        </span>
        <span className="text-xs text-ink-soft">{hint ?? 'Thinking through this…'}</span>
      </span>
    </motion.div>
  )
}

// ─── Interactive AI MCQ card (parses medq blocks) ────────────────────────────

function McqCard({ data, onAnswered }: { data: MedqData; onAnswered: (correct: boolean, chosen: string) => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const correct = chosen === data.answer
  return (
    <div className="clay-in my-2 rounded-xl p-3.5">
      <p className="text-sm font-medium leading-snug">{data.q}</p>
      <div className="mt-2.5 grid gap-1.5">
        {data.options.map((o) => {
          const revealed = chosen !== null
          const isAnswer = o.id === data.answer
          const isChosen = o.id === chosen
          return (
            <button
              key={o.id}
              type="button"
              disabled={revealed}
              onClick={() => {
                setChosen(o.id)
                onAnswered(o.id === data.answer, o.id)
              }}
              className={cn(
                'flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-all',
                !revealed && 'border-line bg-surface-2 hover:border-primary/50 hover:bg-primary/5',
                revealed && isAnswer && 'border-sev-ok/50 bg-sev-ok/10 text-foreground',
                revealed && isChosen && !isAnswer && 'border-sev-crit/50 bg-sev-crit/10',
                revealed && !isAnswer && !isChosen && 'border-line/60 bg-surface-2 opacity-60',
              )}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold uppercase',
                  revealed && isAnswer ? 'border-sev-ok/60 bg-sev-ok/15 text-sev-ok' : 'border-line bg-card text-ink-soft',
                )}
              >
                {o.id}
              </span>
              <span className="min-w-0">{o.text}</span>
            </button>
          )
        })}
      </div>
      {chosen !== null && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2.5">
          <p className={cn('text-xs font-semibold', correct ? 'text-sev-ok' : 'text-sev-crit')}>
            {correct ? '✓ Correct' : `✗ Not quite — the answer is ${data.answer.toUpperCase()}`}
          </p>
          {data.explain && <div className="mt-1 text-xs leading-relaxed text-ink-soft"><Markdown components={MD_COMPONENTS}>{data.explain}</Markdown></div>}
        </motion.div>
      )}
    </div>
  )
}

// ─── AI flashcard deck (parses flashcards blocks) ────────────────────────────

function FlashcardDeck({
  cards,
  subjectCode,
}: {
  cards: { front: string; back: string }[]
  subjectCode: string | null
}) {
  const { toast } = useToast()
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const card = cards[Math.min(idx, cards.length - 1)]

  const save = async () => {
    if (!subjectCode || saving) return
    setSaving(true)
    try {
      const res = await api.saveTutorFlashcards({ cards, subjectCode })
      if (res.saved > 0) {
        setSaved(true)
        toast({ title: `${res.saved} flashcard${res.saved > 1 ? 's' : ''} added to Revise`, description: 'They are due now — find them in your Revise deck.' })
      } else {
        toast({ title: 'Not saved', description: res.reason ?? 'Cards could not be anchored to a platform subject.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not save cards', description: 'Check your connection and try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="clay-in my-2 rounded-xl p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <Layers className="size-3.5" aria-hidden /> Flashcards · {idx + 1}/{cards.length}
        </p>
        {subjectCode && !saved && (
          <Button variant="outline" size="xs" disabled={saving} onClick={save} className="min-h-8 gap-1 text-[11px]">
            {saving ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Plus className="size-3" aria-hidden />}
            Save to Revise
          </Button>
        )}
        {saved && <span className="text-[11px] font-medium text-sev-ok">✓ Saved to Revise</span>}
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? 'Show front of card' : 'Show back of card'}
        className="mt-2.5 grid min-h-28 w-full place-items-center rounded-xl border border-primary/25 bg-primary/5 px-4 py-4 text-center transition-colors hover:bg-primary/10"
      >
        <div className="text-sm leading-relaxed">
          {flipped ? (
            <div className="text-left"><Markdown components={MD_COMPONENTS}>{card.back}</Markdown></div>
          ) : (
            <span className="font-medium">{card.front}</span>
          )}
        </div>
      </button>
      <p className="mt-1 text-center text-[10px] text-ink-soft">{flipped ? 'tap to flip back' : 'tap to reveal'}</p>
      <div className="mt-1 flex items-center justify-center gap-2">
        <Button variant="ghost" size="xs" disabled={idx === 0} onClick={() => { setIdx((i) => Math.max(0, i - 1)); setFlipped(false) }} className="min-h-8">
          <ChevronDown className="size-3.5 rotate-90" aria-hidden /> Prev
        </Button>
        <Button variant="ghost" size="xs" disabled={idx >= cards.length - 1} onClick={() => { setIdx((i) => Math.min(cards.length - 1, i + 1)); setFlipped(false) }} className="min-h-8">
          Next <ChevronDown className="size-3.5 -rotate-90" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// ─── Platform MCQ widget — real questions, real attempts, real mastery ──────

const ERROR_LABELS: Record<string, string> = {
  didnt_know: 'did not know the fact',
  forgot: 'knew it once but forgot',
  misread: 'misread the question',
  confused: 'confused similar concepts',
  calculation: 'calculation slip',
  reasoning: 'reasoning error',
  changed: 'changed the right answer',
  time: 'ran out of time',
  guess: 'guessed',
}

function PlatformQuiz({
  payload,
  onFallbackToAI,
  onFinish,
}: {
  payload: QuizPayload
  onFallbackToAI: () => void
  onFinish: (summary: string, score: number, total: number) => void
}) {
  const count = payload.count ?? 5
  const [questions, setQuestions] = useState<QuestionClient[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [idx, setIdx] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [score, setScore] = useState(0)
  const [missed, setMissed] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.questions({ topicId: payload.topicId, subjectCode: payload.subjectCode, count, mix: 'weak' })
      .then((res) => {
        if (cancelled) return
        if (!res.questions.length) {
          onFallbackToAI()
          return
        }
        setQuestions(res.questions)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          onFallbackToAI()
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="clay-in flex items-center gap-2.5 rounded-2xl px-4 py-3.5 text-sm text-ink-soft">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Pulling platform MCQs…
      </div>
    )
  }
  if (!questions || idx >= questions.length) return null

  const q = questions[idx]
  const finished = idx === questions.length - 1 && result !== null

  const submit = async (optionId: string) => {
    if (chosen || submitting) return
    setChosen(optionId)
    setSubmitting(true)
    try {
      const res = await api.attempt({ questionId: q.id, selected: optionId })
      setResult(res)
      if (res.correct) setScore((s) => s + 1)
      else if (q.conceptName || q.conceptId) setMissed((m) => [...m, q.conceptName ?? (q.conceptId as string)])
    } catch {
      setResult({ correct: false, answer: '', explanation: 'Could not check this answer — connection issue.', teaching: '', knowledgeUpdated: false })
    } finally {
      setSubmitting(false)
    }
  }

  const advance = () => {
    if (finished) {
      const label = payload.label ? ` on ${payload.label}` : ''
      const missedNote = missed.length ? ` Concepts to re-teach: ${[...new Set(missed)].join(', ')}.` : ''
      onFinish(`I just did ${questions.length} platform MCQs${label} and scored ${score}/${questions.length}.${missedNote} Teach me what I got wrong.`, score, questions.length)
      return
    }
    setIdx((i) => i + 1)
    setChosen(null)
    setResult(null)
  }

  return (
    <div className="clay-in my-1 rounded-2xl p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <ListChecks className="size-3.5" aria-hidden /> Platform MCQ {idx + 1}/{questions.length}
        </p>
        <span className="text-[11px] text-ink-soft">score {score}/{idx + (result ? 1 : 0)}</span>
      </div>
      <p className="mt-2 text-sm leading-snug">{q.stem}</p>
      <div className="mt-2.5 grid gap-1.5">
        {q.options.map((o) => {
          const revealed = result !== null
          const isAnswer = revealed && o.id === result?.answer
          const isChosen = o.id === chosen
          return (
            <button
              key={o.id}
              type="button"
              disabled={revealed || submitting}
              onClick={() => submit(o.id)}
              className={cn(
                'flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-all',
                !revealed && 'border-line bg-surface-2 hover:border-primary/50 hover:bg-primary/5',
                revealed && isAnswer && 'border-sev-ok/50 bg-sev-ok/10',
                revealed && isChosen && !isAnswer && 'border-sev-crit/50 bg-sev-crit/10',
                revealed && !isAnswer && !isChosen && 'border-line/60 bg-surface-2 opacity-60',
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-card text-[11px] font-semibold uppercase text-ink-soft">
                {o.id}
              </span>
              <span className="min-w-0">{o.text}</span>
            </button>
          )
        })}
      </div>
      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-1.5">
          <p className={cn('text-xs font-semibold', result.correct ? 'text-sev-ok' : 'text-sev-crit')}>
            {result.correct ? '✓ Correct' : '✗ Incorrect'}
            {result.knowledgeUpdated && result.mastery != null && (
              <span className="ml-2 font-normal text-ink-soft">mastery ~{result.mastery}% · engine updated</span>
            )}
          </p>
          {result.explanation && <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-soft"><Markdown components={MD_COMPONENTS}>{result.explanation}</Markdown></div>}
          {result.teaching && (
            <p className="text-xs font-medium text-foreground">
              <Lightbulb className="mr-1 inline size-3.5 text-gold" aria-hidden />
              {result.teaching}
            </p>
          )}
        </motion.div>
      )}
      {(result !== null) && (
        <Button size="sm" onClick={advance} className="mt-3 min-h-10 w-full gap-1.5">
          {finished ? <><Compass className="size-4" aria-hidden /> Get re-taught ({score}/{questions.length})</> : <>Next question</>}
        </Button>
      )}
      {result && result.errorTypeSuggestion && (
        <p className="mt-2 text-[11px] text-ink-soft">Marked as: {ERROR_LABELS[result.errorTypeSuggestion] ?? result.errorTypeSuggestion}</p>
      )}
    </div>
  )
}

// ─── Context panel — what the tutor knows about THIS student ────────────────

function ContextPanel({
  ctx,
  loading,
  onAsk,
}: {
  ctx: TutorContextPayload | null
  loading: boolean
  onAsk: (prompt: string) => void
}) {
  const [open, setOpen] = useState(false)

  if (loading) {
    return (
      <div className="glass flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs text-ink-soft">
        <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> Reading your learning data…
      </div>
    )
  }
  if (!ctx) return null

  const hasData = ctx.weak.length > 0 || ctx.missed.length > 0 || ctx.errorTypes.length > 0 || ctx.revision.due > 0

  return (
    <div className="glass rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
          <Brain className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">What your tutor knows about you</span>
          {hasData && (
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {[
                ctx.weak.length ? `${ctx.weak.length} weak` : null,
                ctx.missed.length ? `${ctx.missed[0].name} ×${ctx.missed[0].count}` : null,
                ctx.revision.due ? `${ctx.revision.due} due` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 border-t border-line/70 px-3.5 pb-3 pt-2.5">
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-medium">{ctx.profile.yearLabel}</span>
                <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-medium capitalize">{ctx.profile.prepStage} stage</span>
                {ctx.profile.attemptsTotal > 0 && (
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-medium">{ctx.profile.attemptsTotal} MCQ attempts</span>
                )}
                {ctx.drills > 0 && (
                  <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-medium">{ctx.drills} drills</span>
                )}
              </div>
              {ctx.topic && (
                <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
                  <p className="text-[11px] font-semibold text-primary">Currently studying</p>
                  <p className="mt-0.5 text-xs font-medium">{ctx.topic.name}</p>
                  <p className="text-[11px] text-ink-soft">
                    {ctx.topic.subjectName}
                    {ctx.topic.system ? ` · ${ctx.topic.system}` : ''}
                    {ctx.topic.mark ? ` · marked ${ctx.topic.mark}` : ''}
                    {` · ${ctx.topic.questions} MCQs · ${ctx.topic.cases} cases`}
                  </p>
                </div>
              )}
              {ctx.weak.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Weak areas — tap to get taught</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {ctx.weak.map((w) => (
                      <button
                        key={w.conceptId}
                        type="button"
                        onClick={() => onAsk(`Teach me ${w.name} step by step — my mastery is only ${w.mastery}% after ${w.attempts} attempts. Start from the foundation and address what I likely misunderstand.`)}
                        className="min-h-8 rounded-full border border-sev-warn/40 bg-sev-warn/10 px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-sev-warn/20"
                      >
                        {w.name} · {w.mastery}%
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {ctx.missed.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Recently missed — tap to fix the misconception</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {ctx.missed.map((m) => (
                      <button
                        key={`${m.conceptId ?? m.name}`}
                        type="button"
                        onClick={() => onAsk(`Why do I keep getting ${m.name} wrong (missed ${m.count}×)? Identify my likely misconception and re-teach it, then retest me.`)}
                        className="min-h-8 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-primary/40"
                      >
                        {m.name} ×{m.count}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {ctx.errorTypes.map((e) => (
                  <span key={e.type} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-ink-soft">
                    {ERROR_LABELS[e.type] ?? e.type} · {e.count}×
                  </span>
                ))}
                {ctx.revision.due > 0 && (
                  <button
                    type="button"
                    onClick={() => onAsk(`Rapid-revise my due revision list${ctx.revision.top.length ? ` — highest priority: ${ctx.revision.top.join(', ')}` : ''}. One-liners only.`)}
                    className="min-h-8 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    {ctx.revision.due} due · top: {ctx.revision.top[0] ?? '—'}
                  </button>
                )}
              </div>
              <p className="text-[10px] leading-snug text-ink-soft">
                Built from your measured platform data — attempts, mastery, revision queue. The tutor knows nothing else about you.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── History sheet ───────────────────────────────────────────────────────────

interface SessionRow {
  id: string
  title: string
  mode: string
  topicId: string
  messageCount: number
  updatedAt: string
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function HistorySheet({
  open,
  onOpenChange,
  onResume,
  currentId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onResume: (row: SessionRow) => void
  currentId: string | null
}) {
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const { toast } = useToast()

  // null rows = loading state; fetch only while the sheet is open.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.tutorSessions()
      .then((res) => {
        if (!cancelled) setRows(res.sessions)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const remove = async (id: string) => {
    try {
      await api.deleteTutorSession(id)
      setRows((r) => r?.filter((x) => x.id !== id) ?? null)
      toast({ title: 'Session deleted' })
    } catch {
      toast({ title: 'Could not delete session', variant: 'destructive' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-line px-4 py-3.5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" aria-hidden /> Tutoring history
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {rows === null && (
            <p className="flex items-center gap-2 px-1 py-6 text-sm text-ink-soft">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Loading sessions…
            </p>
          )}
          {rows !== null && rows.length === 0 && (
            <p className="px-1 py-6 text-sm leading-relaxed text-ink-soft">
              No saved sessions yet. Every tutoring conversation is saved here automatically — pick one up any time.
            </p>
          )}
          <div className="space-y-2">
            {rows?.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'group flex items-center gap-2 rounded-xl border p-3 transition-colors',
                  row.id === currentId ? 'border-primary/50 bg-primary/5' : 'border-line bg-card hover:border-primary/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onResume(row)
                    onOpenChange(false)
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">
                    {relTime(row.updatedAt)} · {row.messageCount} messages · {row.mode}
                    {row.topicId ? ' · topic' : ''}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete session: ${row.title}`}
                  onClick={() => void remove(row.id)}
                  className="size-9 shrink-0 text-ink-soft hover:text-sev-crit"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── TutorView ───────────────────────────────────────────────────────────────

export function TutorView() {
  const { toast } = useToast()
  const [mode, setMode] = useState<TutorMode>('explain')
  const [depth, setDepth] = useState<TutorDepth>('mbbs')
  const [topicId, setTopicId] = useState<string | null>(null)
  const [topicLabel, setTopicLabel] = useState<string | null>(null)
  const [ctx, setCtx] = useState<TutorContextPayload | null>(null)
  const [ctxLoading, setCtxLoading] = useState(true)
  const [drillPair, setDrillPair] = useState<DrillPair | null>(null)
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const bootRef = useRef(false)
  // Latest in-flight request wins; stale replies are dropped.
  const reqRef = useRef(0)
  // Socratic drill progress: each user answer counts as one probe. Ending the
  // drill with ≥ DRILL_MIN_PROBES probes logs the outcome to the knowledge engine.
  const drillProbesRef = useRef(0)
  const [drillProbes, setDrillProbes] = useState(0)
  // Persisted session id (the thread survives reloads).
  const sessionIdRef = useRef<string | null>(null)
  const sessionTitleRef = useRef('New tutoring session')

  const autosize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  // Refresh the tutor's knowledge of the student whenever the topic changes.
  useEffect(() => {
    let cancelled = false
    setCtxLoading(true)
    api.tutorContext(topicId)
      .then((res) => {
        if (cancelled) return
        setCtx(res)
        if (res.topic) setTopicLabel(res.topic.name)
      })
      .catch(() => {
        if (!cancelled) setCtx(null)
      })
      .finally(() => {
        if (!cancelled) setCtxLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [topicId])

  const persist = useCallback(
    (msgs: TutorMessage[]) => {
      const persistable = msgs.filter((m) => m.role === 'user' || m.role === 'assistant')
      if (persistable.length < 2) return
      api.saveTutorSession({
        id: sessionIdRef.current ?? undefined,
        title: sessionTitleRef.current,
        mode: drillPair ? 'socratic' : mode,
        topicId: topicId ?? undefined,
        messages: persistable.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      })
        .then((res) => {
          sessionIdRef.current = res.id
        })
        .catch(() => {
          /* history is best-effort */
        })
    },
    [mode, drillPair, topicId],
  )

  const send = useCallback(
    async (
      raw: string,
      history: TutorMessage[],
      opts?: { mode?: TutorMode; depth?: TutorDepth; topicId?: string | null },
    ) => {
      const content = raw.trim()
      if (!content) return
      const req = ++reqRef.current
      const effMode = opts?.mode ?? mode
      const effDepth = opts?.depth ?? depth
      const effTopicId = opts?.topicId !== undefined ? opts.topicId : topicId

      const userMsg: TutorMessage = { id: nextId('user'), role: 'user', content, sensitive: SENSITIVE_RE.test(content) }
      const outgoing = [...history, userMsg]
      if (drillPair) {
        drillProbesRef.current += 1
        setDrillProbes(drillProbesRef.current)
      }
      if (history.length === 0) {
        sessionTitleRef.current = content.slice(0, 80)
      }

      setMessages(outgoing)
      setInput('')
      setError(null)
      setThinking(true)

      try {
        const res = await api.tutor({
          messages: outgoing.slice(-10).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          mode: drillPair ? 'socratic' : effMode,
          depth: effMode === 'explain' ? effDepth : undefined,
          conceptId: undefined,
          pairId: drillPair?.id,
          topicId: effTopicId ?? undefined,
        })
        if (reqRef.current !== req) return
        const replyMsg: TutorMessage = {
          id: nextId('assistant'),
          role: 'assistant',
          content: res.reply,
          sensitive: userMsg.sensitive,
          grounded: res.grounded ?? null,
        }
        const withReply = [...outgoing, replyMsg]
        setMessages(withReply)
        persist(withReply)
      } catch {
        if (reqRef.current !== req) return
        setError('Could not reach the tutor. Your question is kept — try again.')
      } finally {
        if (reqRef.current === req) setThinking(false)
      }
    },
    [mode, depth, topicId, drillPair, persist],
  )

  // Platform-quiz flow: real questions first; if the topic/subject has none,
  // fall back to the AI quiz (medq blocks) with the same adaptive contract.
  const startPlatformQuiz = useCallback(
    (quizTopicId?: string | null, quizSubjectCode?: string | null, label?: string | null) => {
      // A quiz that opens a fresh session deserves a human title, not the
      // post-quiz summary text.
      if (messagesRef.current.length === 0) {
        sessionTitleRef.current = `Platform quiz${label ? ` — ${label}` : ''}`.slice(0, 80)
      }
      const widget: TutorMessage = {
        id: nextId('quiz'),
        role: 'quiz',
        content: '',
        quizPayload: {
          topicId: quizTopicId ?? topicId ?? undefined,
          subjectCode: quizSubjectCode ?? ctx?.topic?.subjectCode,
          label: label ?? topicLabel ?? undefined,
          count: 5,
        },
      }
      setMessages((prev) => [...prev, widget])
    },
    [topicId, topicLabel, ctx],
  )

  // Keep a ref to the latest messages for widget callbacks.
  const messagesRef = useRef<TutorMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const aiQuizFallback = useCallback(() => {
    const subject = topicLabel ?? (ctx?.weak[0]?.name ? `my weak area: ${ctx.weak[0].name}` : 'the topics we discussed')
    void send(`Quiz me on ${subject} — one MCQ at a time, adapting difficulty as we go.`, messagesRef.current, { mode: 'quiz' })
    setMode('quiz')
  }, [send, topicLabel, ctx])

  const onQuizFinish = useCallback(
    (summary: string) => {
      // The widget is ephemeral — remove it; its outcome continues as a user turn.
      setMessages((prev) => prev.filter((m) => m.role !== 'quiz'))
      void send(summary, messagesRef.current.filter((m) => m.role !== 'quiz'), { mode: 'explain', depth: 'mbbs' })
    },
    [send],
  )

  // Opening move of a Socratic pair drill — no user message yet, the API injects
  // the internal opening instruction and replies with the first probe.
  const startDrill = useCallback(async (pair: DrillPair) => {
    const req = ++reqRef.current
    setMessages([])
    setError(null)
    setThinking(true)
    drillProbesRef.current = 0
    setDrillProbes(0)
    try {
      const res = await api.tutor({ messages: [], mode: 'socratic', pairId: pair.id })
      if (reqRef.current !== req) return
      setMessages([{ id: nextId('assistant'), role: 'assistant', content: res.reply }])
    } catch {
      if (reqRef.current !== req) return
      setError(`Could not start the drill on “${pair.a} vs ${pair.b}” — try the button again.`)
      setDrillPair(null)
    } finally {
      if (reqRef.current === req) setThinking(false)
    }
  }, [])

  // Boot hand-offs, in priority order: pair drill > topic context > question.
  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true

    // 1. Socratic drill handed off from the quiz pair debrief.
    let p: string | null = null
    try {
      p = sessionStorage.getItem(TUTOR_PAIR_KEY)
      if (p) sessionStorage.removeItem(TUTOR_PAIR_KEY)
    } catch {
      p = null
    }
    if (p) {
      api.confusionPair(p)
        .then((res) => {
          const pair: DrillPair = { id: res.pair.id, a: res.pair.a, b: res.pair.b }
          setDrillPair(pair)
          void startDrill(pair)
        })
        .catch(() => {
          setError('That confusion pair could not be loaded — start it again from the drill results.')
        })
      return
    }

    // 2. Topic-aware launch from the Topic Hub AI section.
    let topic: string | null = null
    try {
      topic = sessionStorage.getItem(TUTOR_TOPIC_KEY)
      if (topic) sessionStorage.removeItem(TUTOR_TOPIC_KEY)
    } catch {
      topic = null
    }
    if (topic) setTopicId(topic)

    // 3. Question handed off from search / explorer / hub (auto-sent).
    let q: string | null = null
    try {
      q = sessionStorage.getItem(TUTOR_QUESTION_KEY)
      if (q) sessionStorage.removeItem(TUTOR_QUESTION_KEY)
    } catch {
      q = null
    }
    if (!q) return
    const t = setTimeout(() => {
      textareaRef.current?.focus()
      void send(q as string, [], { topicId: topic })
    }, 60)
    return () => clearTimeout(t)
  }, [send, startDrill])

  // Keep the thread pinned to the newest bubble.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    if (!thinking && input.trim()) void send(input, messages)
  }

  const newChat = () => {
    reqRef.current++
    sessionIdRef.current = null
    sessionTitleRef.current = 'New tutoring session'
    setMessages([])
    setInput('')
    setError(null)
    setThinking(false)
    setDrillPair(null)
  }

  // Ending a drill with enough probes closes the loop: the knowledge engine
  // refreshes recall on BOTH concepts of the pair and logs a study session.
  const endDrill = () => {
    reqRef.current++
    const pair = drillPair
    const probes = drillProbesRef.current
    setDrillPair(null)
    drillProbesRef.current = 0
    setDrillProbes(0)
    if (!pair || probes < DRILL_MIN_PROBES) return
    const summary: TutorMessage = {
      id: nextId('assistant'),
      role: 'assistant',
      content: `**Drill complete — ${probes} probes on “${pair.a} vs ${pair.b}”.**`,
    }
    setMessages((prev) => [...prev, summary])
    api.drillComplete({ pairId: pair.id, probes })
      .then((res) => {
        const sides = res.updated
          .map((u) => `mastery ~${u.mastery}%`)
          .join(' · ')
        setMessages((prev) => [
          ...prev,
          {
            id: nextId('assistant'),
            role: 'assistant',
            content: sides
              ? `Your knowledge engine refreshed both sides of the distinction — ${sides}. The Map, Progress and your Next Best Action already reflect it.`
              : `Session logged (${res.minutes ?? probes * 2} min). This pair has no linked concepts yet, so only study time was recorded.`,
          },
        ])
      })
      .catch(() => {
        /* engine logging is best-effort — the drill itself already succeeded */
      })
  }

  const resumeSession = useCallback((row: SessionRow) => {
    api.tutorSession(row.id)
      .then((res) => {
        const s = res.session
        reqRef.current++
        sessionIdRef.current = s.id
        sessionTitleRef.current = s.title
        setMessages(
          s.messages.map((m) => ({ id: nextId(m.role), role: m.role, content: m.content })),
        )
        setMode((['explain', 'socratic', 'quiz', 'clinical', 'rapid', 'exam', 'eli5', 'hinglish'] as string[]).includes(s.mode) ? (s.mode as TutorMode) : 'explain')
        setTopicId(s.topicId || null)
        setError(null)
        setDrillPair(null)
      })
      .catch(() => {
        toast({ title: 'Could not load that session', variant: 'destructive' })
      })
  }, [toast])

  // ── Suggested actions (never an empty chatbot screen) ─────────────────────
  const suggestions = useMemo(() => {
    const t = ctx?.topic
    if (t) {
      return [
        {
          label: 'Explain this simply',
          icon: Lightbulb,
          run: () => void send(`Explain ${t.name} in the simplest possible words — I want the intuition before the detail.`, [], { mode: 'explain', depth: 'simple' }),
        },
        { label: 'Quiz me', icon: ListChecks, run: () => startPlatformQuiz(t.id, t.subjectCode, t.name) },
        {
          label: 'Give me a case',
          icon: Stethoscope,
          run: () => void send(`Walk me through one realistic clinical case of ${t.name}, asking me to make decisions at each step, then debrief my reasoning.`, [], { mode: 'clinical' }),
        },
        {
          label: 'Rapid-revise this',
          icon: Zap,
          run: () => void send(`Rapid-revise ${t.name} — one-liner high-yield recall sheet.`, [], { mode: 'rapid' }),
        },
        {
          label: 'What should I revise here?',
          icon: Compass,
          run: () => void send(`Given my performance data, what exactly should I revise in ${t.name}, and in what order?`, []),
        },
        {
          label: 'Make flashcards',
          icon: Layers,
          run: () => void send(`Create 8 exam-focused flashcards for ${t.name}.`, []),
        },
      ]
    }
    const w = ctx?.weak[0]
    const m = ctx?.missed[0]
    const out: { label: string; icon: LucideIcon; run: () => void }[] = []
    if (w) out.push({ label: `Teach me ${w.name}`, icon: Lightbulb, run: () => void send(`Teach me ${w.name} step by step — my mastery is only ${w.mastery}%. Start from the foundation.`, []) })
    if (m) out.push({ label: `Why do I keep missing ${m.name}?`, icon: Target, run: () => void send(`Why do I keep getting ${m.name} wrong (missed ${m.count}×)? Identify my likely misconception and re-teach it.`, []) })
    out.push(
      {
        label: 'Quiz my weak spots',
        icon: ListChecks,
        run: () => {
          if (ctx?.weak.length) {
            const names = ctx.weak.slice(0, 3).map((x) => x.name).join(', ')
            void send(`Quiz me on my weak areas: ${names}. One MCQ at a time, adapting difficulty.`, [], { mode: 'quiz' })
          } else {
            void send('Quiz me on high-yield NEET-PG topics — one MCQ at a time.', [], { mode: 'quiz' })
          }
        },
      },
      { label: 'Rapid-revise my due cards', icon: Zap, run: () => void send(`Rapid-revise my due revision list${ctx?.revision.top.length ? ` — priority: ${ctx.revision.top.join(', ')}` : ''}.`, [], { mode: 'rapid' }) },
      { label: 'Compare nephritic vs nephrotic', icon: Microscope, run: () => void send('Nephritic vs nephrotic syndrome — compare them in a table with the classic discriminators, then give me the exam trap.', []) },
      { label: 'Make me flashcards', icon: Layers, run: () => void send('Create 8 flashcards on the highest-yield facts I should not forget from my weak areas.', []) },
    )
    return out
  }, [ctx, send, startPlatformQuiz])

  // Follow-up chips shown under the latest assistant reply.
  const followUps: { label: string; prompt: string }[] = [
    { label: 'Simpler', prompt: 'Explain that again more simply.' },
    { label: 'An example', prompt: 'Give me a concrete clinical example of that.' },
    { label: 'Quiz me on this', prompt: 'Quiz me on that — one question at a time.' },
    { label: 'Why does this matter?', prompt: 'Why does this matter clinically and for the exam?' },
  ]

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const showFollowUps = !thinking && !drillPair && lastAssistant && messages[messages.length - 1]?.id === lastAssistant.id

  const empty = messages.length === 0 && !thinking

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 px-4 pb-4 pt-4 md:px-6 md:pt-6">
      {/* Header */}
      <header className="relative flex items-start justify-between gap-3">
        <Aurora intensity={0.7} />
        <div className="relative z-10 flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Stethoscope className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">AI Medical Tutor</h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              A personal medical teacher — grounded in your platform data, never medical advice.
            </p>
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Tutoring history" onClick={() => setHistoryOpen(true)} className="size-10 text-ink-soft hover:text-foreground">
            <History className="size-4.5" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label="New chat" onClick={newChat} className="size-10 text-ink-soft hover:text-foreground">
            <Plus className="size-5" aria-hidden />
          </Button>
        </div>
      </header>

      {/* Topic banner — context-aware tutoring */}
      {topicId && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
          <BookMarked className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              Teaching context: <span className="text-primary">{topicLabel ?? 'topic'}</span>
            </p>
            <p className="text-[11px] text-ink-soft">
              The tutor is studying this topic with you — answers prefer your platform notes
              {ctx?.topic ? ` · ${ctx.topic.questions} platform MCQs · ${ctx.topic.cases} cases` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTopicId(null)}
            aria-label="Clear topic context"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-primary/10 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Socratic drill banner — active drill replaces the mode picker */}
      {drillPair ? (
        <div
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-sev-warn/40 bg-sev-warn/10 px-4 py-3"
          role="status"
          aria-label={`Socratic drill on ${drillPair.a} versus ${drillPair.b}`}
        >
          <Zap className="size-4 shrink-0 text-sev-warn" aria-hidden />
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <span className="font-semibold text-sev-warn">Socratic drill</span>
            <span className="text-ink-soft"> — one question at a time: </span>
            <span className="font-medium">{drillPair.a}</span>
            <span className="text-ink-soft"> vs </span>
            <span className="font-medium">{drillPair.b}</span>
            <span className="ml-2 inline-flex items-center rounded-full border border-sev-warn/30 bg-sev-warn/10 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-sev-warn">
              {drillProbes >= DRILL_MIN_PROBES
                ? `${drillProbes} probes · counts toward mastery`
                : `${drillProbes}/${DRILL_MIN_PROBES} probes`}
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={endDrill}
            className="min-h-9 gap-1.5 border-sev-warn/40 px-2.5 text-xs text-sev-warn hover:bg-sev-warn/10 hover:text-sev-warn"
          >
            <X className="size-3.5" aria-hidden /> End drill
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Mode selector */}
          <div role="radiogroup" aria-label="Teaching mode" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MODES.map((m) => {
              const active = mode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={m.desc}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all',
                    active
                      ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_20px_-8px_var(--primary)]'
                      : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <m.icon className="size-4" aria-hidden />
                  {m.label}
                </button>
              )
            })}
          </div>
          {/* Explain depth + extra voices */}
          {(mode === 'explain' || mode === 'eli5' || mode === 'hinglish') && (
            <div className="flex flex-wrap items-center gap-2">
              {mode === 'explain' && (
                <div role="radiogroup" aria-label="Explanation depth" className="flex gap-1.5">
                  {DEPTHS.map((d) => {
                    const active = depth === d.id
                    return (
                      <button
                        key={d.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={d.desc}
                        onClick={() => setDepth(d.id)}
                        className={cn(
                          'min-h-9 rounded-full border px-3 text-xs font-medium transition-all',
                          active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
                        )}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex gap-1.5">
                {EXTRA_MODES.map((m) => {
                  const active = mode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={m.desc}
                      onClick={() => setMode(m.id)}
                      className={cn(
                        'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-all',
                        active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-line bg-surface-2 text-ink-soft hover:text-foreground',
                      )}
                    >
                      <m.icon className="size-3.5" aria-hidden />
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Context panel */}
      <ContextPanel ctx={ctx} loading={ctxLoading} onAsk={(p) => void send(p, messages)} />

      {/* Thread */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl pr-1"
        aria-live="polite"
        aria-label="Tutor conversation"
      >
        {empty && (
          <div className="flex h-full flex-col items-center justify-center gap-5 py-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="glass grid size-14 place-items-center rounded-2xl"
            >
              <Sparkles className="size-6 text-primary" aria-hidden />
            </motion.div>
            <div className="max-w-md">
              <p className="text-sm font-medium text-foreground">
                {topicLabel ? `Let's master ${topicLabel}.` : 'Where should we start?'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {topicLabel
                  ? 'Your tutor already has the platform notes, MCQs and your performance here — pick a move:'
                  : 'Pick a mode above, or start from your measured weak spots:'}
              </p>
            </div>
            <Stagger className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {suggestions.slice(0, 6).map((s) => (
                <StaggerItem key={s.label}>
                  <button
                    type="button"
                    onClick={s.run}
                    className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-left text-xs font-medium text-ink-soft transition-all hover:border-primary/45 hover:text-foreground"
                  >
                    <s.icon className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 truncate">{s.label}</span>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="flex justify-end"
              >
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/10 px-4 py-2.5 text-sm leading-relaxed text-foreground">
                  {m.content}
                </div>
              </motion.div>
            ) : m.role === 'quiz' && m.quizPayload ? (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="flex items-start gap-2.5"
              >
                <span className="glass mt-1 grid size-8 shrink-0 place-items-center rounded-xl" aria-hidden>
                  <ListChecks className="size-4 text-primary" />
                </span>
                <div className="min-w-0 max-w-[calc(100%-3rem)] flex-1">
                  <PlatformQuiz
                    payload={m.quizPayload}
                    onFallbackToAI={aiQuizFallback}
                    onFinish={onQuizFinish}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="flex items-start gap-2.5"
              >
                <span className="glass mt-1 grid size-8 shrink-0 place-items-center rounded-xl" aria-hidden>
                  <Bot className="size-4 text-primary" />
                </span>
                <div className="min-w-0 max-w-[calc(100%-3rem)]">
                  {m.content.includes('**Drill complete') ? (
                    <div className="clay-in rounded-2xl border-gold/50! px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <Pop className="mt-0.5" delay={0.15}>
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gold/25 text-gold" aria-hidden>
                            <Flag className="size-4" />
                          </span>
                        </Pop>
                        <div className="min-w-0 text-sm leading-relaxed [&_strong]:font-semibold">
                          <Markdown components={MD_COMPONENTS}>{m.content.replace(/^\u{1F3C1}\s*/u, '')}</Markdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                  <div className="clay rounded-2xl rounded-tl-sm px-4 py-3">
                    {parseSegments(m.content).map((seg, i) => {
                      if (seg.type === 'text') return <Markdown key={i} components={MD_COMPONENTS}>{seg.content}</Markdown>
                      if (seg.type === 'medq')
                        return (
                          <McqCard
                            key={i}
                            data={seg.data}
                            onAnswered={(correct, chosenId) => {
                              // Feed the result back so the tutor adapts.
                              void send(
                                `My answer to your MCQ was ${chosenId.toUpperCase()} — ${correct ? 'correct' : 'incorrect'}. ${correct ? 'Escalate difficulty.' : 'Teach the missed point, then retest me.'}`,
                                messagesRef.current,
                                { mode: 'quiz' },
                              )
                            }}
                          />
                        )
                      return <FlashcardDeck key={i} cards={seg.data.cards} subjectCode={ctx?.topic?.subjectCode ?? null} />
                    })}
                  </div>
                  )}
                  {m.grounded && (
                    <p className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-ink-soft">
                      <BookMarked className="size-3 shrink-0" aria-hidden />
                      Grounded in platform content — {m.grounded.concepts} concepts · {m.grounded.questions} MCQs · {m.grounded.cases} cases
                    </p>
                  )}
                  {m.sensitive && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-sev-warn/30 bg-sev-warn/10 px-2.5 py-1.5 text-xs leading-snug text-sev-warn">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {SENSITIVE_NOTICE}
                    </p>
                  )}
                </div>
              </motion.div>
            ),
          )}
          {thinking && <ThinkingDots key="thinking" hint={drillPair ? 'Preparing the next probe…' : undefined} />}
        </AnimatePresence>

        {/* Follow-up chips */}
        {showFollowUps && !empty && (
          <div className="flex flex-wrap gap-1.5 pl-10">
            {followUps.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => void send(f.prompt, messages)}
                className="min-h-9 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-ink-soft transition-all hover:border-primary/40 hover:text-foreground"
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-3.5 py-2.5">
          <p className="flex items-center gap-2 text-xs text-sev-crit">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-9 gap-1.5 text-sev-crit hover:text-sev-crit"
            onClick={() => {
              const lastUser = [...messages].reverse().find((m) => m.role === 'user')
              if (lastUser) void send(lastUser.content, messages.filter((m) => m.id !== lastUser.id))
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden /> Retry
          </Button>
        </div>
      )}

      {/* Composer */}
      <div className="glass rounded-2xl p-2.5">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onInput={autosize}
            rows={1}
            placeholder={
              drillPair
                ? 'Answer the probe — or ask for a hint…'
                : topicLabel
                  ? `Ask anything about ${topicLabel}…`
                  : `Ask anything — try ${MODES.find((m) => m.id === mode)?.label ?? 'exam'} style…`
            }
            aria-label="Message your medical tutor"
            className="max-h-40 min-h-11 flex-1 resize-none border-none bg-transparent px-2 py-2.5 shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            onClick={() => void send(input, messages)}
            disabled={thinking || !input.trim()}
            aria-label="Send message"
            className="size-11 shrink-0 rounded-xl"
          >
            <Sheen className="rounded-xl">
              {thinking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
            </Sheen>
          </Button>
        </div>
      </div>

      {/* Permanent safety footer */}
      <footer className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-sev-warn" aria-hidden />
        <p className="text-[11px] leading-snug text-ink-soft">{FOOTER_TEXT}</p>
      </footer>

      {/* History */}
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} onResume={resumeSession} currentId={sessionIdRef.current} />
    </div>
  )
}
