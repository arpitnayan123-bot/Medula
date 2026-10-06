import { db } from '@/lib/db'
import { loadGraphContext, searchGraph, buildGraphHub, type GraphContext } from '@/lib/knowledge-graph'
import { lessonsByConceptId } from '@/lib/curriculum/registry'
import type { ConceptLesson, SourceRef } from '@/lib/curriculum/types'
import { EXTERNAL_CATALOG, scoreExternal, queryWords } from '@/lib/resource-catalog'
import { platformResourcesFor } from '@/lib/resource-hub'
import type {
  AskAnswerPayload, AskConnection, AskFollowKind, AskFollowPayload, AskLevel,
  AskMistakeItem, AskQuizItem, AskResolutionKind, AskResource, AskSource,
} from '@/lib/types'

// ─── PRODUCT 15 — AI MEDICAL SEARCH & ANSWER ENGINE (server-only) ────────────
// Search → Understand → Verify → Explore → Learn.
//
// TRUST RULES (binding):
//   · The LLM NEVER writes the Sources section — sources are assembled here,
//     deterministically, from real platform artefacts (structured lessons +
//     their SourceRefs, the measured MCQ pool, curated external metadata).
//   · The LLM is grounded ONLY on platform content. When the grounding lacks
//     what the query needs, the answer must say so (uncertain=true) instead of
//     inventing facts, numbers, doses or citations.
//   · External resources are METADATA + LINK-OUT ONLY (PRODUCT 14 rules).
//   · No chain-of-thought: prompts demand conclusions only; answers are also
//     JSON-salvaged defensively.
//   · Every MCQ is drawn from the MEASURED platform Question pool — never
//     AI-generated on the fly.

export const ASK_AI_BADGE = 'AI answer · grounded in MEDULA platform content'
export const ASK_DISCLAIMER = 'Educational explanation — not medical advice. Verify against your standard textbooks.'

// ─── 1 · QUERY NORMALISATION (abbreviations · Hinglish · fuzzy typos) ────────

/** Abbreviation/synonym expansion — superset of the classic /api/search map. */
const EXPANSIONS: Record<string, string[]> = {
  raas: ['renin', 'angiotensin', 'aldosterone'], mi: ['myocardial infarction', 'heart attack'],
  acs: ['acute coronary', 'myocardial infarction', 'angina'], dm: ['diabetes'],
  t1dm: ['type 1'], t2dm: ['type 2'], tb: ['tuberculosis'],
  aki: ['acute kidney injury', 'renal failure'], ckd: ['chronic kidney'],
  htn: ['hypertension', 'blood pressure'], gfr: ['glomerular filtration'],
  nsaid: ['nsaids', 'anti-inflammatory'], ace: ['ace inhibitor', 'acei'],
  ppi: ['proton pump'], mcd: ['minimal change'], gn: ['glomerulonephritis'],
  hf: ['heart failure'], chf: ['heart failure', 'congestive'], cvd: ['cardiovascular'],
  obg: ['obstetrics'], 'nephrotic syndrome': ['proteinuria'],
  nephrotic: ['proteinuria', 'hypoalbuminemia', 'glomerular'],
  nephritic: ['hematuria', 'rbc casts', 'glomerular'], glomerular: ['nephrotic', 'nephritic'],
  'heart failure': ['cardiac', 'ejection'], 'heart attack': ['myocardial infarction'],
  edema: ['swelling'], anxiety: ['psychiatry'], copd: ['chronic obstructive', 'emphysema'],
  dka: ['diabetic ketoacidosis', 'ketoacidosis'], sle: ['lupus'], uti: ['urinary tract'],
  arf: ['acute renal', 'acute kidney'], ecg: ['electrocardiogram', 'ekg'],
  arrhythmia: ['arrhythmias', 'conduction'], anemia: ['anaemia', 'hemoglobin'],
  anaemia: ['anemia', 'haemoglobin'], thyroid: ['thyroid hormone', 'goiter'],
  seizure: ['seizures', 'epilepsy'], stroke: ['cerebrovascular', 'infarct'],
  ans: ['autonomic'], cns: ['central nervous'], pns: ['peripheral nervous'],
  tsh: ['thyroid stimulating'], ns: ['nephrotic syndrome'],
  af: ['atrial fibrillation'], ards: ['respiratory distress'],
  'heart disease': ['heart failure'], 'heart problem': ['heart failure'],
  'chest pain': ['angina', 'myocardial infarction'],
}

/** Curated Hinglish → medical-English phrases. Applied as whole-word/phrase
 *  replacements; every hit is surfaced to the student as «understood as …».
 *  Phrase entries come FIRST so they win over word-level ones. */
const HINGLISH: { re: RegExp; to: string; label: string }[] = [
  { re: /\bseene\s+mein\s+dard\b/gi, to: 'chest pain', label: 'seene mein dard → chest pain' },
  { re: /\bpeshab\s+mein\s+jalan\b/gi, to: 'dysuria', label: 'peshab mein jalan → dysuria' },
  { re: /\bdil\s+ka\s+daura(?:\s+pad\w+)?\b/gi, to: 'heart attack', label: 'dil ka daura → heart attack' },
  { re: /\bdil\s+ki\s+bimari(?:yan|een)?\b/gi, to: 'heart disease', label: 'dil ki bimari → heart disease' },
  { re: /\bloose\s+motions?\b/gi, to: 'diarrhea', label: 'loose motions → diarrhea' },
  { re: /\bsir\s+dard\b/gi, to: 'headache', label: 'sir dard → headache' },
  { re: /\bdil\b/gi, to: 'heart', label: 'dil → heart' },
  { re: /\bbukhar\b/gi, to: 'fever', label: 'bukhar → fever' },
  { re: /\bkhansi\b/gi, to: 'cough', label: 'khansi → cough' },
  { re: /\bkhoon\b/gi, to: 'blood', label: 'khoon → blood' },
  { re: /\bbimari(?:yan|een)?\b/gi, to: 'disease', label: 'bimari → disease' },
  { re: /\blakshan\b/gi, to: 'symptoms', label: 'lakshan → symptoms' },
  { re: /\bilaj\b/gi, to: 'treatment', label: 'ilaj → treatment' },
  { re: /\bdawa(?:i|iyi)?\b/gi, to: 'drug', label: 'dawai → drug' },
  { re: /\bpathri\b/gi, to: 'stone', label: 'pathri → stone' },
  { re: /\bpeshab\b/gi, to: 'urine', label: 'peshab → urine' },
  { re: /\bulti(?:yan)?\b/gi, to: 'vomiting', label: 'ulti → vomiting' },
  { re: /\bdast\b/gi, to: 'diarrhea', label: 'dast → diarrhea' },
  { re: /\bsardi\b/gi, to: 'common cold', label: 'sardi → common cold' },
  { re: /\bkamzori\b/gi, to: 'weakness', label: 'kamzori → weakness' },
  { re: /\buliyan\b/gi, to: 'edema', label: 'uliyan → edema' },
  { re: /\bso(?:o)?jan\b/gi, to: 'swelling', label: 'soojan → swelling' },
  { re: /\bchakkar\b/gi, to: 'dizziness', label: 'chakkar → dizziness' },
  { re: /\bbehoshi\b/gi, to: 'syncope', label: 'behoshi → syncope' },
]

/** Hinglish connectors removed after phrase mapping (whole words only). */
const HINGLISH_CONNECTORS_RE =
  /\b(?:ki|ka|ke|mein|me|hai|hain|hota|hoti|hote|kya|kyu|kyun|kyon|kaise|bat(?:a|ao)|mujhe|mera|meri)\b/gi

/** Filler stripped before entity matching («Explain …», «What is …»). */
const FILLER_RE =
  /^(?:please\s+)?(?:can you\s+)?(?:tell me about|explain|describe|define|what(?:'s| is| are)|whats|why does|why do|why is|how does|how do|how is|give me|show me|tell about|about|overview of|meaning of)\s+/i

export interface NormalizedQuery {
  clean: string // Hinglish-resolved, filler-trimmed, punctuation-trimmed
  original: string
  understoodAs: string | null // human-readable note when Hinglish fired
  expandedTerms: string[] // synonym expansions worth trying
}

export function normalizeAskQuery(raw: string): NormalizedQuery {
  let q = raw.trim().replace(/[?！?。]+$/g, '')
  const applied: string[] = []
  // compare-based detection — replace() always restarts at index 0 and resets
  // lastIndex, so the shared /g regexes stay stateless across requests.
  for (const h of HINGLISH) {
    const replaced = q.replace(h.re, h.to)
    if (replaced !== q) {
      applied.push(h.label)
      q = replaced
    }
  }
  // "pet scan/ct" guard: only plain «pet» maps to abdomen
  const petReplaced = q.replace(/\bpet\b(?!\s*(?:scan|ct|mri))/gi, 'abdomen')
  if (petReplaced !== q) {
    applied.push('pet → abdomen')
    q = petReplaced
  }
  // Hinglish connectors («dil ki bimari» → «heart disease»)
  const deconned = q.replace(HINGLISH_CONNECTORS_RE, ' ')
  if (deconned !== q) {
    applied.push('Hinglish connectors dropped')
    q = deconned
  }
  const lower = q.toLowerCase()
  const expandedTerms: string[] = []
  for (const [key, syns] of Object.entries(EXPANSIONS)) {
    if (!syns.length) continue
    // short keys must match on word boundaries — "mi" must NOT fire inside
    // "chromodynamics" (a real false-positive seen in testing)
    const keyHit = key.length <= 4
      ? new RegExp(`\\b${key}\\b`, 'i').test(q)
      : lower.includes(key)
    const backHit = syns.some((s) =>
      s.length <= 4 ? new RegExp(`\\b${s}\\b`, 'i').test(q) : lower.includes(s),
    )
    if (keyHit) syns.forEach((s) => expandedTerms.push(s))
    if (backHit) expandedTerms.push(key)
  }
  const clean = q.replace(FILLER_RE, '').replace(/\s+/g, ' ').trim() || q.trim()
  return { clean, original: raw.trim(), understoodAs: applied.length ? applied.join(' · ') : null, expandedTerms }
}

/** Damerau-ish bounded Levenshtein (≤2) for typo tolerance on short tokens. */
function editDistanceAtMost(a: string, b: string, cap: number): boolean {
  if (Math.abs(a.length - b.length) > cap) return false
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]!
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = temp
      best = Math.min(best, prev[j]!)
    }
    if (best > cap) return false // row minimum already over budget
  }
  return prev[b.length]! <= cap
}

export interface AskResolution {
  kind: AskResolutionKind
  conceptId: string | null
  secondaryId: string | null
  topicId: string | null
  matchedVia: string // name|synonym|fuzzy|topic|none
  corrected: string | null // typo-corrected query when fuzzy fired
}

/** Split «difference between A and B» / «A vs B» intents. */
function parseCompare(q: string): [string, string] | null {
  const m1 = /^(?:difference|diff|distinguish)\s+between\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+)$/i.exec(q)
  if (m1) return [m1[1]!.trim(), m1[2]!.trim()]
  const m2 = /^(.+?)\s+(?:vs\.?|versus|or)\s+(.+)$/i.exec(q)
  if (m2 && m2[1]!.length > 2 && m2[2]!.length > 2) return [m2[1]!.trim(), m2[2]!.trim()]
  return null
}

function conceptIdForText(ctx: GraphContext, text: string): string | null {
  const t = text.toLowerCase().replace(/[?.!]+$/g, '').trim()
  if (!t) return null
  // 1 · exact concept name / synonym term (via the tiered graph search)
  const direct = searchGraph(ctx, t)
  if (direct.concepts.length) {
    const c0 = direct.concepts[0]!
    const name = c0.name.toLowerCase()
    // accept exact names, synonym hits, and honest prefixes («nephrotic» →
    // «Nephrotic Syndrome») — never bare contains-matches
    if (c0.matchedVia === 'synonym' || name === t || (name.startsWith(t) && t.length >= 4)) {
      return c0.id
    }
  }
  // 2 · entity spotting — concept names / synonyms contained in the text
  let best: { id: string; len: number; degree: number } | null = null
  for (const c of ctx.concepts.values()) {
    const name = c.name.toLowerCase()
    if (t.includes(name) && (!best || name.length > best.len || (name.length === best.len && c.degree > best.degree))) {
      best = { id: c.id, len: name.length, degree: c.degree }
    }
  }
  for (const s of ctx.synonyms) {
    const term = s.term.toLowerCase()
    if (term.length >= 3 && t.includes(term) && s.kind === 'concept' && ctx.concepts.has(s.refId)) {
      if (!best || term.length > best.len) best = { id: s.refId, len: term.length, degree: 999 }
    }
  }
  return best?.id ?? null
}

function fuzzyCorrectToken(ctx: GraphContext, token: string): string | null {
  if (token.length < 5) return null
  const cap = token.length >= 7 ? 2 : 1
  let best: { word: string; id: string } | null = null
  for (const c of ctx.concepts.values()) {
    for (const word of c.name.toLowerCase().split(/[\s-]+/)) {
      if (Math.abs(word.length - token.length) > cap || word === token) continue
      if (editDistanceAtMost(token, word, cap)) {
        if (!best || word.length < best.word.length) best = { word, id: c.id }
      }
    }
  }
  if (best) return best.word
  for (const s of ctx.synonyms) {
    if (Math.abs(s.term.length - token.length) > cap || s.term === token) continue
    if (editDistanceAtMost(token, s.term, cap)) return s.term
  }
  return null
}

/** Resolve a natural-language query to a platform entity — never guesses. */
export function resolveAskQuery(ctx: GraphContext, normalized: NormalizedQuery): AskResolution {
  const { clean, original } = normalized
  const q = clean.toLowerCase()

  // ── compare intent ──
  const cmp = parseCompare(clean)
  if (cmp) {
    const a = conceptIdForText(ctx, cmp[0])
    const b = conceptIdForText(ctx, cmp[1])
    if (a && b && a !== b) return { kind: 'compare', conceptId: a, secondaryId: b, topicId: null, matchedVia: 'compare', corrected: null }
  }

  // ── exact / entity spotting on the cleaned query ──
  const directId = conceptIdForText(ctx, q)
  if (directId) return { kind: 'concept', conceptId: directId, secondaryId: null, topicId: null, matchedVia: q === ctx.concepts.get(directId)?.name.toLowerCase() ? 'name' : 'entity', corrected: null }

  // ── fuzzy typo correction, then retry once ──
  const tokens = q.split(/\s+/).filter(Boolean)
  let changed = false
  const fixed = tokens.map((t) => {
    const c = fuzzyCorrectToken(ctx, t.replace(/[^a-z0-9]/gi, ''))
    if (c && c !== t) {
      changed = true
      return c
    }
    return t
  })
  if (changed) {
    const corrected = fixed.join(' ')
    const fuzzyId = conceptIdForText(ctx, corrected)
    if (fuzzyId) return { kind: 'concept', conceptId: fuzzyId, secondaryId: null, topicId: null, matchedVia: 'fuzzy', corrected }
  }

  // ── synonym-expanded terms ──
  for (const term of normalized.expandedTerms) {
    const id = conceptIdForText(ctx, term)
    if (id) return { kind: 'concept', conceptId: id, secondaryId: null, topicId: null, matchedVia: 'synonym', corrected: null }
  }

  // ── topic fallback ──
  const topics = searchGraph(ctx, q).topics
  if (topics.length) return { kind: 'topic', conceptId: null, secondaryId: null, topicId: topics[0]!.id, matchedVia: 'topic', corrected: null }

  // ── honest miss (keep the original wording for the UI) ──
  void original
  return { kind: 'none', conceptId: null, secondaryId: null, topicId: null, matchedVia: 'none', corrected: null }
}

// ─── 2 · LESSON EXTRACTION (grounding core) ──────────────────────────────────

interface AskLesson {
  oneLiner: string
  whyMatters: string
  explain30s: string
  eli5: string
  firstPrinciples: string[]
  mechanism: string
  presentation: string[]
  diagnosis: string[]
  differentials: { name: string; key: string }[]
  management: string[]
  numbers: { label: string; value: string; note?: string }[]
  mistakes: string[]
  mnemonics: { hook: string; expands: string }[]
  analogies: string[]
  teachDeeper: string[]
  examRelevance: string
  clinicalRelevance: string
  evidenceLevel: string
  lastReviewed: string | null
  sources: SourceRef[]
}

const cap = (a: string[] | undefined, n: number): string[] => (a ?? []).filter(Boolean).slice(0, n)

function extractLesson(conceptId: string, dbLesson: unknown): AskLesson | null {
  const reg = lessonsByConceptId().get(conceptId) as ConceptLesson | undefined
  const raw = (reg ?? (dbLesson as ConceptLesson | null)) as ConceptLesson | null
  if (!raw) return null
  return {
    oneLiner: raw.oneLiner ?? '',
    whyMatters: raw.whyMatters ?? '',
    explain30s: raw.explain30s ?? '',
    eli5: raw.eli5 ?? '',
    firstPrinciples: cap(raw.firstPrinciples, 6),
    mechanism: raw.mechanism ?? '',
    presentation: cap(raw.presentation, 6),
    diagnosis: cap(raw.diagnosis, 6),
    differentials: (raw.differentials ?? []).slice(0, 5).map((d) => ({ name: d.name, key: d.key })),
    management: cap(raw.management, 6),
    numbers: (raw.numbers ?? []).slice(0, 8).map((n) => ({ label: n.label, value: n.value, ...(n.note ? { note: n.note } : {}) })),
    mistakes: cap(raw.mistakes, 6),
    mnemonics: (raw.mnemonics ?? []).slice(0, 4).map((m) => ({ hook: m.hook, expands: m.expands })),
    analogies: cap(raw.analogies, 3),
    teachDeeper: cap(raw.teachDeeper, 4),
    examRelevance: raw.examRelevance ?? '',
    clinicalRelevance: raw.clinicalRelevance ?? '',
    evidenceLevel: raw.evidenceLevel ?? '',
    lastReviewed: raw.lastReviewed ?? null,
    sources: (raw.sources ?? []).slice(0, 6),
  }
}

// ─── 3 · GROUNDING PACK BUILDER ──────────────────────────────────────────────

const CONNECTION_GROUPS: { group: string; limit: number }[] = [
  { group: 'prerequisite', limit: 5 }, { group: 'mechanism', limit: 4 },
  { group: 'caused_by', limit: 4 }, { group: 'manifestation', limit: 4 },
  { group: 'investigation', limit: 4 }, { group: 'treatment', limit: 5 },
  { group: 'complication', limit: 4 }, { group: 'confusable', limit: 4 },
  { group: 'causes', limit: 4 }, { group: 'related', limit: 5 },
]

function suggestionsFor(name: string, connections: AskConnection[]): string[] {
  const s: string[] = []
  const first = (g: string) => connections.find((c) => c.group === g)?.items[0]?.name
  const mech = first('mechanism') ?? first('caused_by')
  if (mech) s.push(`Why does ${mech} matter here?`)
  if (connections.some((c) => c.group === 'confusable')) {
    const cf = connections.find((c) => c.group === 'confusable')!.items[0]!.name
    s.push(`Compare ${name} with ${cf}`)
  }
  if (connections.some((c) => c.group === 'treatment')) s.push(`How is ${name} managed?`)
  s.push(`Give me an analogy for ${name}`, `Quiz me on ${name}`)
  return s.slice(0, 4)
}

export interface AskGrounding {
  resolution: AskAnswerPayload['resolution']
  lesson: AskLesson | null
  secondaryLesson: AskLesson | null
  connections: AskConnection[]
  highYield: string[]
  personal: AskAnswerPayload['personal']
  personalNote: string | null
  questions: { total: number; pyq: number }
  cases: { id: string; title: string; specialty: string }[]
  resources: AskResource[]
  sources: AskSource[]
  suggestions: string[]
}

/** Serialize the grounding for an LLM prompt — platform content only. */
function serializeLesson(name: string, l: AskLesson): string {
  const lines: string[] = [`CONCEPT — ${name}`]
  if (l.oneLiner) lines.push(`WHAT: ${l.oneLiner}`)
  if (l.whyMatters) lines.push(`WHY IT MATTERS: ${l.whyMatters}`)
  if (l.explain30s) lines.push(`30-SECOND EXPLANATION: ${l.explain30s}`)
  if (l.eli5) lines.push(`SIMPLE (ELI5) EXPLANATION: ${l.eli5}`)
  if (l.mechanism) lines.push(`MECHANISM: ${l.mechanism}`)
  if (l.firstPrinciples.length) lines.push(`FIRST PRINCIPLES: ${l.firstPrinciples.join(' | ')}`)
  if (l.presentation.length) lines.push(`CLINICAL PRESENTATION: ${l.presentation.join(' | ')}`)
  if (l.diagnosis.length) lines.push(`DIAGNOSIS / INVESTIGATIONS: ${l.diagnosis.join(' | ')}`)
  if (l.management.length) lines.push(`MANAGEMENT PRINCIPLES: ${l.management.join(' | ')}`)
  if (l.differentials.length) lines.push(`DIFFERENTIALS: ${l.differentials.map((d) => `${d.name} (${d.key})`).join(' | ')}`)
  if (l.numbers.length) lines.push(`KEY NUMBERS: ${l.numbers.map((n) => `${n.label} = ${n.value}${n.note ? ` (${n.note})` : ''}`).join(' | ')}`)
  if (l.mistakes.length) lines.push(`COMMON MISTAKES: ${l.mistakes.join(' | ')}`)
  if (l.mnemonics.length) lines.push(`MNEMONICS: ${l.mnemonics.map((m) => `${m.hook} → ${m.expands}`).join(' | ')}`)
  if (l.analogies.length) lines.push(`APPROVED ANALOGIES: ${l.analogies.join(' | ')}`)
  if (l.examRelevance) lines.push(`HOW IT IS ASKED IN EXAMS: ${l.examRelevance}`)
  if (l.clinicalRelevance) lines.push(`CLINICAL RELEVANCE: ${l.clinicalRelevance}`)
  return lines.join('\n')
}

export async function buildAskGrounding(
  ctx: GraphContext,
  resolution: AskResolution,
  profileId: string,
  query: string,
): Promise<AskGrounding> {
  const conceptId = resolution.conceptId
  const concept = conceptId ? ctx.concepts.get(conceptId) : undefined
  const secondaryId = resolution.secondaryId
  const secondary = secondaryId ? ctx.concepts.get(secondaryId) : undefined

  // concept row (for DB lesson fallback + topic wiring)
  const [dbConcept, dbSecondary, topicRow] = await Promise.all([
    conceptId ? db.concept.findUnique({ where: { id: conceptId }, select: { lesson: true, topicId: true } }) : Promise.resolve(null),
    secondaryId ? db.concept.findUnique({ where: { id: secondaryId }, select: { lesson: true, topicId: true } }) : Promise.resolve(null),
    concept ? db.topic.findUnique({ where: { id: concept.topicId }, include: { subject: true } }) : Promise.resolve(null),
  ])

  const lesson = conceptId ? extractLesson(conceptId, dbConcept?.lesson) : null
  const secondaryLesson = secondaryId ? extractLesson(secondaryId, dbSecondary?.lesson) : null

  // graph neighbourhood + personal layer (verified edges only, via the hub engine)
  const hub = conceptId ? buildGraphHub(ctx, conceptId) : null
  const connections: AskConnection[] = []
  if (hub) {
    for (const g of CONNECTION_GROUPS) {
      const items = hub.groups.find((gr) => gr.kind === g.group)?.items ?? []
      if (items.length) {
        connections.push({
          group: g.group,
          items: items.slice(0, g.limit).map((i) => ({ id: i.id, name: i.name, mastery: i.mastery, status: i.status })),
        })
      }
    }
  }

  const st = conceptId ? ctx.stateOf(conceptId) : null
  const mistakeOpen = conceptId ? ctx.hasOpenMistake(conceptId) : false
  const mistakeMaxWrong = conceptId ? ctx.openMistakeMaxWrong.get(conceptId) ?? 0 : 0
  const missingPrereqs = (hub?.personal.missingPrerequisites ?? []).slice(0, 3).map((p) => ({ id: p.id, name: p.name, mastery: p.mastery }))

  const highYield: string[] = []
  if (lesson) {
    for (const n of lesson.numbers.slice(0, 5)) highYield.push(`${n.label}: ${n.value}${n.note ? ` — ${n.note}` : ''}`)
    for (const m of lesson.mistakes.slice(0, 4)) highYield.push(`Common mistake: ${m}`)
    for (const m of lesson.mnemonics.slice(0, 2)) highYield.push(`Mnemonic — ${m.hook}: ${m.expands}`)
    if (lesson.examRelevance) highYield.push(lesson.examRelevance)
  }

  // measured question stats + this student's mistakes on this concept
  let questionStats = { total: hub?.questionStats.total ?? 0, pyq: hub?.questionStats.pyq ?? 0 }
  if (conceptId && (!hub || (questionStats.total === 0 && questionStats.pyq === 0))) {
    // JSON array filtering isn't available on SQLite — count in JS (bounded select)
    const rows = await db.question.findMany({ where: { conceptId }, select: { tags: true } })
    const pyq = rows.filter((r) => Array.isArray(r.tags) && (r.tags as string[]).includes('pyq-pattern')).length
    questionStats = { total: rows.length, pyq }
  }

  const cases = concept
    ? await db.clinicalCase.findMany({
        where: { OR: [{ title: { contains: concept.name } }, { title: { contains: concept.name.split(' ')[0]! } }] },
        select: { id: true, title: true, specialty: true },
        take: 3,
      })
    : []

  // curated external resources — METADATA ONLY (PRODUCT 14 trust rules)
  const words = queryWords(query)
  const subjectIds = topicRow ? [topicRow.subject.id] : []
  const topicIds = dbConcept?.topicId ? [dbConcept.topicId] : []
  const extScored = EXTERNAL_CATALOG.map((r) => ({ r, s: scoreExternal(r, words) + (r.topicIds.some((t) => topicIds.includes(t)) ? 6 : 0) + (r.subjects.some((s) => subjectIds.includes(s)) ? 3 : 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
  const resources: AskResource[] = extScored.map(({ r }) => ({
    id: r.id, kind: r.kind, title: r.title, description: r.description, sourceName: r.sourceName,
    url: r.url, urlVerified: r.urlVerified, lastVerified: r.lastVerified, access: r.access,
    license: r.license, difficulty: r.difficulty,
  }))

  // SOURCES — assembled deterministically; the LLM never touches these
  const sources: AskSource[] = []
  if (concept && lesson) {
    sources.push({
      kind: 'platform',
      label: `MEDULA structured lesson — ${concept.name}`,
      detail: [lesson.evidenceLevel ? `evidence: ${lesson.evidenceLevel}` : '', lesson.lastReviewed ? `reviewed ${lesson.lastReviewed}` : ''].filter(Boolean).join(' · ') || undefined,
    })
  } else if (concept) {
    sources.push({ kind: 'platform', label: `MEDULA concept page — ${concept.name}`, detail: concept.summary || undefined })
  }
  for (const ref of lesson?.sources ?? []) {
    sources.push({
      kind: 'lesson-ref',
      label: `${ref.institution} — ${ref.title}`,
      detail: [ref.year ? String(ref.year) : '', ref.accessNote ?? ''].filter(Boolean).join(' · ') || undefined,
      ...(ref.url ? { url: ref.url } : {}),
    })
  }
  if (questionStats.total > 0) {
    sources.push({
      kind: 'question-pool',
      label: `MEDULA question pool — ${questionStats.total} MCQ${questionStats.total === 1 ? '' : 's'}${questionStats.pyq ? ` · ${questionStats.pyq} PYQ-pattern` : ''}`,
      detail: 'every option carries a worked explanation on the platform',
    })
  }
  for (const r of resources) {
    sources.push({
      kind: 'external',
      label: `${r.sourceName} — ${r.title}`,
      url: r.url,
      verified: r.urlVerified,
      lastVerified: r.lastVerified,
      license: r.license,
      access: r.access,
    })
  }

  const personalNote =
    missingPrereqs.length > 0
      ? `${missingPrereqs[0]!.name} is a prerequisite that's still at ${missingPrereqs[0]!.mastery}% mastery for you — the answer below builds on it, so skim that first.`
      : null

  const subjectName = topicRow?.subject.name ?? concept?.subjectName ?? null
  const grounding: AskGrounding = {
    resolution: {
      kind: resolution.kind,
      ...(conceptId ? { conceptId, conceptName: concept?.name, conceptSummary: concept?.summary } : {}),
      ...(secondaryId ? { secondaryId, secondaryName: secondary?.name } : {}),
      ...(dbConcept?.topicId ? { topicId: dbConcept.topicId, topicName: topicRow?.name } : {}),
      ...(subjectName ? { subjectName } : {}),
      ...(topicRow ? { subjectColor: topicRow.subject.color } : {}),
      matchedVia: resolution.matchedVia,
    },
    lesson,
    secondaryLesson,
    connections,
    highYield,
    personal: {
      mastery: st && st.engaged ? st.mastery : null,
      status: st && st.engaged ? st.status : null,
      missingPrerequisites: missingPrereqs,
      mistakeOpen: mistakeOpen ? 1 : 0,
      mistakeMaxWrong,
    },
    personalNote,
    questions: questionStats,
    cases,
    resources,
    sources,
    suggestions: concept ? suggestionsFor(concept.name, connections) : [],
  }
  return grounding
}

// ─── 4 · ANSWER GENERATION (AI + deterministic fallback) ─────────────────────

export const ASK_LEVEL_META: Record<AskLevel, { label: string; blurb: string }> = {
  eli5: { label: 'ELI5', blurb: 'Very simple' },
  mbbs: { label: 'MBBS', blurb: 'Undergraduate level' },
  neetpg: { label: 'NEET-PG', blurb: 'High-yield exam angle' },
  detailed: { label: 'Detailed', blurb: 'Full depth' },
}

const LEVEL_BLOCKS: Record<AskLevel, string> = {
  eli5: 'LEVEL — ELI5: explain like the student is curious and 12 years old. Short everyday sentences, one approved analogy from the grounding if available, no unexplained jargon (introduce each term in plain words). 90–140 words.',
  mbbs: 'LEVEL — MBBS: an MBBS student who knows basic science. Precise standard terminology, mechanism-first, clinically anchored. 140–200 words.',
  neetpg: 'LEVEL — NEET-PG HIGH-YIELD: exam-first answer. Lead with what examiners actually ask, the discriminating facts, classic traps/lookalikes from the grounding, and the measured numbers. One-line pearls allowed. 130–190 words. Never predict scores or ranks.',
  detailed: 'LEVEL — DETAILED: full structured depth with short labelled paragraphs (Definition → Mechanism → Clinical → Investigation → Management → Exam angle), using ONLY grounding content. 220–320 words.',
}

// ── JSON salvage ladder (same defensive pattern as the other AI routes) ──
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
  const candidates = parsed ? Object.values(parsed).filter((v): v is string => typeof v === 'string' && v.trim().length > 40) : []
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0]!.slice(0, 4000)
  return raw.replace(/```(?:json)?/gi, '').trim().slice(0, 4000)
}

export interface AskAiAnswer {
  text: string
  keyPoints: string[]
  uncertain: boolean
  uncertainNote: string
}

function groundingPromptBlock(g: AskGrounding, name: string): string {
  const parts: string[] = []
  if (g.lesson) parts.push(serializeLesson(name, g.lesson))
  if (g.resolution.secondaryName && g.secondaryLesson) parts.push(serializeLesson(g.resolution.secondaryName, g.secondaryLesson))
  else if (g.resolution.secondaryName) parts.push(`SECOND ENTITY — ${g.resolution.secondaryName}: no structured platform lesson available for this side; say so rather than inventing.`)
  if (g.connections.length) {
    parts.push(
      'GRAPH CONNECTIONS (verified platform knowledge-graph edges): ' +
        g.connections.map((c) => `${c.group}: ${c.items.map((i) => i.name).join(', ')}`).join(' · '),
    )
  }
  if (g.highYield.length) parts.push('HIGH-YIELD FACTS: ' + g.highYield.join(' | '))
  const p = g.personal
  if (p.mastery !== null) parts.push(`THIS STUDENT (measured): mastery ${p.mastery}% (${p.status})${g.personal.mistakeOpen ? `, ${g.personal.mistakeMaxWrong}× missed questions here before` : ''}`)
  if (g.personalNote) parts.push(`PREREQ NOTE: ${g.personalNote}`)
  if (g.questions.total) parts.push(`PLATFORM PRACTICE POOL: ${g.questions.total} MCQs (${g.questions.pyq} PYQ-pattern) exist for this concept`)
  return parts.join('\n\n')
}

/** Grounded answer at a level; deterministic compose on AI failure. */
export async function askAnswerText(
  query: string,
  name: string,
  g: AskGrounding,
  level: AskLevel,
  transcript?: { role: 'user' | 'assistant'; text: string }[],
): Promise<{ ai: AskAiAnswer | null; fallback: AskAiAnswer }> {
  const fallback = composeFallbackAnswer(query, name, g, level)
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const history = (transcript ?? []).slice(-6).map((m) => `${m.role === 'user' ? 'STUDENT' : 'YOU (earlier)'}: ${m.text.slice(0, 400)}`).join('\n')
    const system = [
      'You are the MEDULA Ask Engine — an educational medical answer engine for Indian MBBS / NEET-PG students. This is an educational system: you never give personal medical advice.',
      '',
      'PLATFORM GROUNDING (your ONLY factual grounding — never contradict it, never go beyond it):',
      groundingPromptBlock(g, name),
      '',
      LEVEL_BLOCKS[level],
      '',
      `TASK: The student asked: «${query}». Answer that question directly in the first sentence, at the required level. Use ONLY the grounding above. If the grounding does not contain what the question needs, set "uncertain" to true and say precisely what is missing — do NOT fill gaps from general knowledge, never invent facts, numbers, doses, or citations. ${g.personalNote ? 'Open with a one-sentence refresher of the prerequisite in the PREREQ NOTE, then the main answer. ' : ''}keyPoints: up to 4 one-line takeaways drawn strictly from the grounding.`,
      '',
      'OUTPUT: Respond with ONE JSON object and nothing else — no prose before or after (markdown fences tolerated but keep the JSON intact). Shape: {"text":"<answer as ONE string, newlines escaped as \\n>","keyPoints":["...","..."],"uncertain":false,"uncertainNote":""}.',
      '',
      'SAFETY (non-negotiable): educational information only; no personal medical advice; no fabricated citations — the Sources section is assembled by the platform, not by you. NO chain-of-thought: output conclusions only, never your step-by-step deliberation.',
      history ? `\nCONVERSATION SO FAR:\n${history}` : '',
    ].join('\n')
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
      ],
      temperature: 0.3,
      maxTokens: 1200,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    const text = parsed && typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 4000) : salvageText(content)
    if (!text || text.length < 20) throw new Error('empty AI response')
    const keyPoints = Array.isArray(parsed?.keyPoints)
      ? (parsed!.keyPoints as unknown[]).filter((k): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, 4)
      : []
    const uncertain = parsed?.uncertain === true
    const uncertainNote = typeof parsed?.uncertainNote === 'string' ? parsed!.uncertainNote.slice(0, 300) : ''
    return { ai: { text, keyPoints, uncertain, uncertainNote }, fallback }
  } catch {
    return { ai: null, fallback }
  }
}

/** Deterministic, lesson-composed answer — used when AI is unavailable. */
export function composeFallbackAnswer(query: string, name: string, g: AskGrounding, level: AskLevel): AskAiAnswer {
  const l = g.lesson
  if (!l) {
    return {
      text: `I couldn't map «${query}» to a structured platform lesson, so I won't guess. ${
        g.resolution.conceptName ? `The closest platform entity is ${g.resolution.conceptName} — its page, questions and connections are linked below.` : 'Try one of the suggested searches below.'
      }`,
      keyPoints: [],
      uncertain: true,
      uncertainNote: 'no structured platform lesson matched',
    }
  }
  const parts: string[] = []
  if (level === 'eli5') {
    parts.push(l.eli5 || l.explain30s || l.oneLiner)
    if (l.analogies.length) parts.push(`Analogy: ${l.analogies[0]}`)
  } else if (level === 'neetpg') {
    parts.push(l.explain30s || l.oneLiner)
    if (l.examRelevance) parts.push(`How it's asked: ${l.examRelevance}`)
    if (l.numbers.length) parts.push(`Numbers to know: ${l.numbers.slice(0, 5).map((n) => `${n.label} ${n.value}`).join(' · ')}`)
    if (l.mistakes.length) parts.push(`Traps: ${l.mistakes.slice(0, 3).join(' · ')}`)
  } else if (level === 'detailed') {
    if (l.oneLiner) parts.push(l.oneLiner)
    if (l.mechanism) parts.push(`Mechanism — ${l.mechanism}`)
    if (l.firstPrinciples.length) parts.push(l.firstPrinciples.join(' '))
    if (l.presentation.length) parts.push(`Clinically: ${l.presentation.join(' · ')}`)
    if (l.diagnosis.length) parts.push(`Workup: ${l.diagnosis.join(' · ')}`)
    if (l.management.length) parts.push(`Management principles: ${l.management.join(' · ')}`)
    if (l.examRelevance) parts.push(`Exam angle: ${l.examRelevance}`)
  } else {
    parts.push(l.explain30s || l.oneLiner)
    if (l.mechanism) parts.push(l.mechanism)
    if (l.clinicalRelevance) parts.push(l.clinicalRelevance)
  }
  if (!parts.length) parts.push(l.oneLiner || g.resolution.conceptSummary || '')
  return {
    text: `${parts.join('\n\n')}\n\n(Composed directly from the MEDULA structured lesson — deterministic, no AI.)`,
    keyPoints: [l.oneLiner, ...l.mistakes.slice(0, 2)].filter(Boolean).slice(0, 3),
    uncertain: false,
    uncertainNote: '',
  }
}

/** Honest miss payload when nothing on the platform matched. */
export function buildMissPayload(query: string, ctx: GraphContext, normalized: NormalizedQuery): Omit<AskAnswerPayload, 'threadId'> {
  const near = searchGraph(ctx, normalized.clean).concepts.slice(0, 4).map((c) => c.name)
  const suggestions = [...near.map((n) => `Explain ${n}`), 'Why does nephrotic syndrome cause edema?', 'Explain AKI'].slice(0, 4)
  return {
    query,
    ...(normalized.understoodAs ? { understoodAs: normalized.understoodAs } : {}),
    level: 'mbbs',
    resolution: { kind: 'none', matchedVia: 'none' },
    answer: {
      text:
        `I searched the platform's concepts, lessons, questions and resources and couldn't map «${query}» to content I can verify, so I won't improvise an answer — a made-up medical explanation is worse than none.\n\n` +
        (near.length ? `The closest things the platform holds: ${near.join(', ')}. ` : '') +
        'Try one of the suggested searches below, or rephrase with the full term.',
      keyPoints: [],
      uncertain: true,
      uncertainNote: 'no platform content matched this query',
      fallback: false,
      aiBadge: ASK_AI_BADGE,
      disclaimer: ASK_DISCLAIMER,
    },
    connections: [],
    highYield: [],
    personal: { mastery: null, status: null, missingPrerequisites: [], mistakeOpen: 0, mistakeMaxWrong: 0 },
    questions: { total: 0, pyq: 0 },
    cases: [],
    resources: [],
    sources: [],
    suggestions,
  }
}

// ─── 5 · FOLLOW-UP INTENTS ───────────────────────────────────────────────────

export function detectFollowIntent(message: string): { intent: AskFollowKind | 'simpler' | 'deeper' | 'analogy' | 'example' | 'related' | 'free'; level?: AskLevel } {
  const m = message.toLowerCase().trim()
  if (/^(quiz me|test me|generate mcqs?|give me (some )?(neet[- ]?pg |neetpg )?mcqs?|mcqs? on|mcqs?)\b/i.test(m)) return { intent: 'quiz' }
  if (/(my |previous |the )?mistakes|what did i (get |keep )?wrong|show my (previous )?mistakes/i.test(m)) return { intent: 'mistakes' }
  if (/add (this |it )?to (my )?revision|revise (this|it|later)/i.test(m)) return { intent: 'revision' }
  if (/show related|related concepts?|connections?|what is (this|it) (linked|connected) to/i.test(m)) return { intent: 'related' }
  if (/(explain |make it |go )?(more )?simpl(er|ly)|eli5|like i'?m (5|ten|twelve)/i.test(m)) return { intent: 'simpler', level: 'eli5' }
  if (/deeper|more detail|in depth|advanced|explain (it )?fully/i.test(m)) return { intent: 'deeper', level: 'detailed' }
  if (/analogy|like what|compare (it )?to (something|real life)/i.test(m)) return { intent: 'analogy' }
  if (/clinical example|case example|real (life |world )?example|patient example/i.test(m)) return { intent: 'example' }
  if (parseCompare(m)) return { intent: 'compare' }
  return { intent: 'free' }
}

const FOLLOW_TASKS: Partial<Record<string, string>> = {
  simpler: 'TASK: The student asked for a simpler explanation. Re-explain the core concept at ELI5 level (90–140 words), using the grounding only.',
  deeper: 'TASK: The student asked to go deeper. Expand at DETAILED level (220–320 words) with labelled paragraphs, grounding only.',
  analogy: 'TASK: Give an analogy for this concept. Use an APPROVED ANALOGY from the grounding if one exists; otherwise build the analogy strictly from grounded mechanisms and say clearly it is an analogy, not physiology. 80–130 words.',
  example: 'TASK: Give a short clinical example (a vignette-style walkthrough) built ONLY from the grounding (presentation, diagnosis, management). Label it clearly as an educational example. 110–170 words.',
}

export async function askFollowupReply(
  thread: { rootQuery: string; messages: unknown; level: string },
  g: AskGrounding,
  name: string,
  message: string,
  intent: string,
  level?: AskLevel,
): Promise<{ text: string; fallback: boolean }> {
  const transcript = Array.isArray(thread.messages)
    ? (thread.messages as { role: 'user' | 'assistant'; text: string }[]).slice(-6)
    : []
  const task = FOLLOW_TASKS[intent] ??
    `TASK: The student follows up on the thread «${thread.rootQuery}» with: «${message}». Answer at ${ASK_LEVEL_META[(level as AskLevel) ?? 'mbbs'].label} level using ONLY the grounding. If the grounding cannot answer it, say exactly what is missing instead of inventing. 80–200 words.`
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const history = transcript.map((m) => `${m.role === 'user' ? 'STUDENT' : 'YOU'}: ${m.text.slice(0, 400)}`).join('\n')
    const system = [
      'You are the MEDULA Ask Engine — an educational medical answer engine for Indian MBBS / NEET-PG students. This is an educational system: you never give personal medical advice.',
      '',
      'PLATFORM GROUNDING (your ONLY factual grounding — never contradict it, never go beyond it):',
      groundingPromptBlock(g, name),
      '',
      task,
      '',
      'OUTPUT: Respond with ONE JSON object and nothing else. Shape: {"text":"<answer as ONE string, newlines escaped as \\n>"}.',
      '',
      'SAFETY: educational information only; no fabricated facts or citations; NO chain-of-thought — conclusions only.',
      history ? `\nCONVERSATION SO FAR:\n${history}` : '',
    ].join('\n')
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Perform the TASK now. Reply with the JSON object only.' },
      ],
      temperature: 0.35,
      maxTokens: 1100,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLooseJson(content)
    const text = parsed && typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 4000) : salvageText(content)
    if (!text || text.length < 10) throw new Error('empty AI response')
    return { text, fallback: false }
  } catch {
    // deterministic follow-up fallbacks from the grounding
    let text: string
    if (intent === 'analogy') {
      text = g.lesson?.analogies.length
        ? `Analogy (from the platform lesson): ${g.lesson.analogies[0]}`
        : `I don't have a vetted analogy on file for ${name}, and I'd rather not improvise one — ask me "explain simpler" instead and I'll rebuild it from the lesson.`
    } else if (intent === 'example') {
      text = g.lesson?.presentation.length
        ? `Educational example built from the lesson: a typical patient presents with ${g.lesson.presentation.slice(0, 3).join(', ')}. Workup would centre on ${g.lesson.diagnosis.slice(0, 2).join(' and ') || 'the investigations in the connections below'}. Management follows the principles in the practice section.`
        : `I don't have enough grounded clinical detail for a worked example on ${name}. The connections below show what the platform links it to.`
    } else if (g.lesson) {
      const fb = composeFallbackAnswer(thread.rootQuery, name, g, (level as AskLevel) ?? 'mbbs')
      text = fb.text
    } else {
      text = `I can only answer from the platform's grounded content here, and it doesn't cover that follow-up for ${name}. Try the connected concepts below or the practice questions.`
    }
    return { text, fallback: true }
  }
}

// ─── 6 · MEASURED ACTIONS (quiz / mistakes / revision) ───────────────────────

export async function selectAskQuiz(
  profileId: string,
  opts: { conceptId?: string; topicId?: string; threadId?: string; mode?: 'concept' | 'mistakes'; count?: number },
): Promise<{ items: AskQuizItem[]; note?: string }> {
  const count = Math.min(10, Math.max(1, Math.round(opts.count ?? 5)))
  if (opts.mode === 'mistakes' && opts.conceptId) {
    const rows = await db.mistakeRecord.findMany({
      where: { profileId, status: { not: 'resolved' }, question: { conceptId: opts.conceptId } },
      include: { question: { include: { concept: { select: { name: true } } } } },
      orderBy: { wrongCount: 'desc' },
      take: count,
    })
    if (!rows.length) {
      const any = await db.question.count({ where: { conceptId: opts.conceptId } })
      return { items: [], note: any ? 'No open mistakes recorded on this concept — clean sheet so far. Practising fresh questions instead is a good idea.' : undefined }
    }
    return {
      items: rows.map((r) => ({
        id: r.questionId, stem: r.question.stem,
        options: (r.question.options as { id: string; text: string }[]) ?? [],
        answer: r.question.answer, explanation: r.question.explanation, teaching: r.question.teaching ?? '',
        pyqPattern: Array.isArray(r.question.tags) && (r.question.tags as string[]).includes('pyq-pattern'),
        conceptName: r.question.concept?.name,
      })),
      note: `Your own missed questions on this concept, worst first (${rows.length}).`,
    }
  }
  if (!opts.conceptId) return { items: [], note: 'Ask about a concept first — the quiz pool is tied to platform concepts.' }
  const primary = await db.question.findMany({
    where: { conceptId: opts.conceptId },
    orderBy: [{ difficulty: 'desc' }, { id: 'asc' }],
    take: count,
    include: { concept: { select: { name: true } } },
  })
  let rows = primary
  let note: string | undefined
  if (rows.length < count && opts.topicId) {
    const topUp = await db.question.findMany({
      where: { topicId: opts.topicId, NOT: { id: { in: rows.map((r) => r.id) } } },
      orderBy: { difficulty: 'desc' },
      take: count - rows.length,
      include: { concept: { select: { name: true } } },
    })
    rows = [...rows, ...topUp]
    if (topUp.length) note = `${primary.length} on this concept + ${topUp.length} from the wider topic.`
  }
  if (!rows.length) return { items: [], note: 'No measured questions on the platform for this concept yet — honest gap, nothing invented.' }
  return {
    items: rows.map((q) => ({
      id: q.id, stem: q.stem,
      options: (q.options as { id: string; text: string }[]) ?? [],
      answer: q.answer, explanation: q.explanation, teaching: q.teaching ?? '',
      pyqPattern: Array.isArray(q.tags) && (q.tags as string[]).includes('pyq-pattern'),
      conceptName: q.concept?.name,
    })),
    note,
  }
}

export async function mistakesForConcept(profileId: string, conceptId: string): Promise<AskMistakeItem[]> {
  const rows = await db.mistakeRecord.findMany({
    where: { profileId, question: { conceptId } },
    include: { question: { select: { stem: true, teaching: true } } },
    orderBy: { wrongCount: 'desc' },
    take: 6,
  })
  return rows.map((r) => ({
    questionId: r.questionId, stem: r.question.stem, wrongCount: r.wrongCount,
    lastErrorType: r.lastErrorType ?? null, teaching: r.question.teaching ?? '',
  }))
}

export async function enqueueAskRevision(profileId: string, conceptId: string, rootQuery: string): Promise<{ queued: boolean }> {
  const existing = await db.revisionItem.findFirst({ where: { profileId, conceptId, cleared: false } })
  if (existing) return { queued: false }
  await db.revisionItem.create({
    data: {
      profileId, conceptId,
      reason: `From Ask Engine: «${rootQuery.slice(0, 80)}»`,
      priority: 3, minutes: 15, dueAt: new Date(),
    },
  })
  return { queued: true }
}

export async function dueRevisionCount(profileId: string): Promise<number> {
  return db.revisionItem.count({ where: { profileId, cleared: false, dueAt: { lte: new Date() } } })
}

// ─── 7 · PAGE PAYLOAD ASSEMBLY ───────────────────────────────────────────────

export function buildAnswerPayload(
  threadId: string,
  query: string,
  normalized: NormalizedQuery,
  resolution: AskResolution,
  g: AskGrounding,
  level: AskLevel,
  ai: AskAiAnswer | null,
  fallback: AskAiAnswer,
): AskAnswerPayload {
  const ans = ai ?? fallback
  return {
    threadId,
    query,
    ...(normalized.understoodAs || resolution.corrected ? { understoodAs: [normalized.understoodAs, resolution.corrected ? `spelling corrected to “${resolution.corrected}”` : ''].filter(Boolean).join(' · ') } : {}),
    level,
    resolution: g.resolution,
    answer: {
      text: ans.text,
      keyPoints: ans.keyPoints,
      uncertain: ans.uncertain,
      ...(ans.uncertainNote ? { uncertainNote: ans.uncertainNote } : {}),
      fallback: !ai,
      aiBadge: ASK_AI_BADGE,
      disclaimer: ASK_DISCLAIMER,
    },
    ...(g.personalNote ? { personalNote: g.personalNote } : {}),
    connections: g.connections,
    highYield: g.highYield,
    personal: g.personal,
    questions: g.questions,
    cases: g.cases,
    resources: g.resources,
    sources: g.sources,
    suggestions: g.suggestions,
  }
}

// ─── 8 · LOOSE EXPORTS (used by the follow-up route to re-resolve compare) ───
export function parseCompareLoose(text: string): [string, string] | null {
  return parseCompare(text)
}
export function conceptIdForTextLoose(ctx: GraphContext, text: string): string | null {
  return conceptIdForText(ctx, text)
}
