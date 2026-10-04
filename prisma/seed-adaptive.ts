// ─── ADAPTIVE ENGINE — UPDATE-ONLY TAG SEEDER (PRODUCT 04) ──────────────────
// Companion to seed.ts / seed-questions.ts (which are DESTRUCTIVE — never
// confuse them). This seeder NEVER inserts or deletes questions and NEVER
// overwrites existing tags: it only APPENDS the two adaptive-engine tag
// families to a curated subset that was chosen by READING THE REAL STEMS in
// the database.
//
// Labeling policy (honest, no fabrication):
//   'pyq-pattern'  → classic, repeatedly-asked exam-theme items (the "classic
//                    presentation / classic management order / classic trap"
//                    patterns every Indian MCQ bank cycles through). We make NO
//                    claim about any specific exam, year or board — the tag
//                    means "this THEME is a classic repeated exam pattern".
//   'image-based'  → stems that hinge on interpreting a visual/modality finding
//                    (X-ray, ECG, MRI, Doppler, microscopy).
//
// SAFE TO RE-RUN: idempotent (skips rows already tagged), update-only.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Curated by reading actual stems (see worklog Task 29-a). Classic themes:
// TOF spell + boot-shaped CXR, organophosphate & snakebite first steps, SVT →
// adenosine, warfarin skin necrosis, III-nerve palsy with blown pupil, DKA K+
// timing, inferior STEMI vessel, bilateral RAS + ACEi, Murphy sign, testicular
// torsion (absent cremasteric), compartment syndrome, angle-closure glaucoma,
// anaphylaxis adrenaline-first, primary-survey order, tension pneumothorax
// decompression-before-imaging, perforated ulcer free air, appendicitis pain
// migration, previa vs abruption, eclampsia MgSO₄, pyogenic meningitis CSF,
// Mentzer index, B12 subacute combined degeneration, APL Auer rods/t(15;17),
// primary hyperaldosteronism, hyperkalaemia ECG→stabilise-then-shift, von
// Gierke disease, Erb palsy.
const PYQ_PATTERN_IDS = [
  'q-gm1',    // TOF tet spell — knee-chest positioning
  'q-gm2',    // boot-shaped heart CXR in TOF
  'q-anti1',  // organophosphate poisoning — atropine first
  'q-anti2',  // snakebite neurotoxicity — 20-min WBCT
  'q-arr1',   // stable SVT — adenosine after vagal maneuvers
  'q-coag2',  // warfarin skin necrosis — protein C
  'q-cranial1', // III-nerve palsy with blown pupil — PCOM aneurysm
  'q-dka1',   // DKA — when to add potassium
  'q-ecg1',   // inferior STEMI — vessel localization
  'q-gfr1',   // bilateral renal artery stenosis + ACE inhibitor
  'q-gm11',   // Murphy sign — acute cholecystitis
  'q-gm12',   // testicular torsion — absent cremasteric reflex
  'q-gm14',   // compartment syndrome — pain on passive stretch
  'q-gm18',   // angle-closure glaucoma — halos, steamy cornea
  'q-gm25',   // anaphylaxis — intramuscular adrenaline first
  'q-gm29',   // primary survey — Breathing after Airway
  'q-gm30',   // tension pneumothorax — decompress before imaging
  'q-gm41',   // perforated duodenal ulcer — free air under diaphragm
  'q-gm9',    // appendicitis — periumbilical-to-RIF pain migration
  'q-gm5',    // placenta previa — painless bleeding
  'q-gm6',    // abruptio placentae — woody uterus
  'q-preec1', // eclampsia — MgSO₄ and its antidote
  'q-gm62',   // pyogenic meningitis — CSF pattern
  'q-gm67',   // Mentzer index — β-thalassemia trait vs IDA
  'q-gm68',   // B12 deficiency — subacute combined degeneration + MMA
  'q-aml1',   // acute promyelocytic leukemia — Auer rods → ATRA
  'q-htn1',   // primary hyperaldosteronism — unprovoked hypokalemia
  'q-hyperk1', // hyperkalaemia — stabilize membrane then shift K⁺
  'q-gsd1',   // von Gierke disease (GSD I) — fasting hypoglycemia
  'q-brach1', // Erb palsy — shoulder dystocia, waiter's-tip
]

// Image/modality-driven stems (visual interpretation is the question).
const IMAGE_BASED_IDS = [
  'q-cxr1',  // chest X-ray — trachea pulled toward the opacity
  'q-gm92',  // X-ray — free air under the diaphragm (typhoid perforation)
  'q-gm65',  // MRI — hemorrhagic necrosis of medial temporal lobes
  'q-gm48',  // Doppler — increased testicular flow (epididymo-orchitis)
  'q-gm27',  // ECG — acute pulmonary oedema with atrial fibrillation
  'q-ecg1',  // ECG — ST elevation II/III/aVF with reciprocal changes
  'q-gm66',  // India-ink microscopy — cryptococcal meningitis
]

async function tagFamily(ids: string[], tag: string, family: string) {
  let added = 0
  let already = 0
  let missing: string[] = []
  for (const id of ids) {
    const q = await db.question.findUnique({ where: { id }, select: { id: true, stem: true, tags: true } })
    if (!q) { missing.push(id); continue }
    const tags = Array.isArray(q.tags) ? (q.tags as string[]) : []
    if (tags.includes(tag)) { already += 1; continue }
    // PRESERVE existing tags — append only.
    await db.question.update({ where: { id }, data: { tags: [...tags, tag] } })
    added += 1
    console.log(`  [${family}] ${id} ← "${tag}"  (${q.stem.slice(0, 70).replace(/\n/g, ' ')}…)`)
  }
  if (missing.length) console.warn(`  [${family}] MISSING ids (no such Question rows): ${missing.join(', ')}`)
  console.log(`[${family}] added=${added} already-tagged=${already} missing=${missing.length}`)
  return { added, already, missing: missing.length }
}

async function main() {
  const before = await db.question.count()
  console.log(`seed-adaptive: UPDATE-ONLY run — ${before} questions in bank (never inserted/deleted)`)
  if (before === 0) {
    console.error('seed-adaptive: question bank is EMPTY — run the destructive seeders first; aborting.')
    process.exit(1)
  }

  console.log('Tagging PYQ-pattern classics…')
  const pyq = await tagFamily(PYQ_PATTERN_IDS, 'pyq-pattern', 'pyq-pattern')
  console.log('Tagging image-based stems…')
  const img = await tagFamily(IMAGE_BASED_IDS, 'image-based', 'image-based')

  const after = await db.question.count()
  // SQLite Prisma has no Json array-contains filter — count in JS honestly.
  const all = await db.question.findMany({ select: { tags: true } })
  const has = (tag: string) => all.filter((q) => Array.isArray(q.tags) && (q.tags as string[]).includes(tag)).length
  console.log(`seed-adaptive done: questions before=${before} after=${after} (unchanged expected)`)
  console.log(`bank totals → pyq-pattern=${has('pyq-pattern')}, image-based=${has('image-based')}`)
  console.log(`this run   → pyq added=${pyq.added}, image added=${img.added}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
