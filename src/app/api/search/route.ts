import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { SearchResults } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Medical-language-aware search: abbreviations, synonyms, partial matching.
// PRODUCT 02: expanded abbreviation coverage so the Topic Hub resolves the
// way students actually type (NS, CHF, CKD…) — standard abbreviations only.
const SYNONYMS: Record<string, string[]> = {
  raas: ['renin', 'angiotensin', 'aldosterone'],
  mi: ['myocardial infarction', 'heart attack'],
  acs: ['acute coronary', 'myocardial infarction', 'angina'],
  dm: ['diabetes'],
  t1dm: ['type 1'],
  t2dm: ['type 2'],
  tb: ['tuberculosis'],
  aki: ['acute kidney injury', 'renal failure'],
  ckd: ['chronic kidney'],
  htn: ['hypertension', 'blood pressure'],
  gfr: ['glomerular filtration'],
  nsaid: ['nsaids', 'anti-inflammatory'],
  ace: ['ace inhibitor', 'acei'],
  ppi: ['proton pump'],
  igA: ['iga'],
  mcd: ['minimal change'],
  gn: ['glomerulonephritis'],
  hf: ['heart failure'],
  chf: ['heart failure', 'congestive'],
  cvd: ['cardiovascular'],
  gynae: ['gynaecology', 'obstetrics'],
  obg: ['obstetrics'],
  'nephrotic syndrome': ['proteinuria'],
  nephrotic: ['proteinuria', 'hypoalbuminemia', 'glomerular'],
  nephritic: ['hematuria', 'rbc casts', 'glomerular'],
  glomerular: ['nephrotic', 'nephritic'],
  'heart failure': ['cardiac', 'ejection'],
  'heart attack': ['myocardial infarction'],
  edema: ['swelling'],
  anxiety: ['psychiatry'],
  copd: ['chronic obstructive', 'emphysema'],
  dka: ['diabetic ketoacidosis', 'ketoacidosis'],
  sle: ['lupus'],
  uti: ['urinary tract'],
  arf: ['acute renal', 'acute kidney'],
  ecg: ['electrocardiogram', 'ekg'],
  arrhythmia: ['arrhythmias', 'conduction'],
  anemia: ['anaemia', 'hemoglobin'],
  anaemia: ['anemia', 'haemoglobin'],
  thyroid: ['thyroid hormone', 'goiter'],
  seizure: ['seizures', 'epilepsy'],
  stroke: ['cerebrovascular', 'infarct'],
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({ concepts: [], subjects: [], questions: [], flashcards: [], cases: [], topics: [] })
  }
  const lower = q.toLowerCase()
  const expanded = new Set<string>([lower])
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (lower === key || lower.includes(key)) syns.forEach(s => expanded.add(s))
    if (syns.some(s => lower.includes(s))) expanded.add(key)
  }
  const terms = [...expanded]

  const [concepts, subjects, questions, flashcards, cases, topics] = await Promise.all([
    db.concept.findMany({
      where: { OR: terms.flatMap(t => [{ name: { contains: t } }, { summary: { contains: t } }, { whyMatters: { contains: t } }]) },
      include: { topic: { include: { subject: true } } },
      take: 14,
    }),
    db.subject.findMany({
      where: { OR: terms.flatMap(t => [{ name: { contains: t } }, { code: { contains: t.toUpperCase() } }, { blurb: { contains: t } }]) },
      take: 6,
    }),
    db.question.findMany({
      where: { OR: terms.map(t => ({ stem: { contains: t } })) },
      take: 8,
      select: { id: true, stem: true },
    }),
    db.flashcard.findMany({
      where: { OR: terms.map(t => ({ front: { contains: t } })) },
      take: 8,
      select: { id: true, front: true, subjectCode: true },
    }),
    db.clinicalCase.findMany({
      where: { OR: terms.map(t => ({ title: { contains: t } })) },
      take: 5,
      select: { id: true, title: true, specialty: true },
    }),
    db.topic.findMany({
      where: { OR: terms.map(t => ({ name: { contains: t } })) },
      include: { subject: true },
      take: 6,
    }),
  ])

  const payload: SearchResults = {
    concepts: concepts.map(c => ({ id: c.id, name: c.name, kind: c.kind, summary: c.summary, subject: c.topic.subject.name, topicId: c.topicId })),
    subjects: subjects.map(s => ({ id: s.id, name: s.name, code: s.code, blurb: s.blurb })),
    questions, flashcards, cases,
    topics: topics.map(t => ({ id: t.id, name: t.name, subject: t.subject.name })),
  }
  return NextResponse.json(payload)
}
