/**
 * PRODUCT 04 — Adaptive MCQ Engine content patch.
 * Idempotent: maps schematic illustrations to image-based questions and
 * attaches curated per-option "why this option is wrong" notes.
 *
 * Run: bun prisma/seed-mcq-engine.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// Image mapping: question id → schematic illustration in /public/questions.
// Every stem already references the imaging modality; the image makes the
// stem's finding visible. Tag 'image-based' is ensured so Image Mode picks up.
const IMAGE_MAP: Record<string, string> = {
  'q-cxr1': '/questions/cxr-left-collapse.jpg', // left lung collapse — trachea pulled toward opacity
  'q-gm2': '/questions/cxr-boot-heart.jpg', // TOF boot-shaped heart
  'q-gm27': '/questions/cxr-pulm-edema.jpg', // acute pulmonary oedema, AF, HTN
  'q-gm41': '/questions/cxr-free-air.jpg', // perforated DU — free air under diaphragm
  'q-gm92': '/questions/cxr-free-air.jpg', // enteric fever ileal perforation — free air
  'q-ulcer1': '/questions/endo-gastric-ulcer.jpg', // antral ulcer on endoscopy
  'q-gm86': '/questions/endo-gastric-ulcer.jpg', // malignant-looking antral ulcer
  'q-gm61': '/questions/ecg-complete-heart-block.jpg', // complete heart block strip
  'q-graves1': '/questions/thyroid-scan-graves.jpg', // diffuse uptake scan (Graves')
}

// Curated per-option notes: why each WRONG option is wrong (the correct
// option carries no note — the platform explanation already covers it).
const OPTION_NOTES: Record<string, Record<string, string>> = {
  'q-cxr1': {
    a: 'A large effusion PUSHES the mediastinum away from the opacity — here it is pulled toward it, the signature of volume loss.',
    c: 'Lobar pneumonia gives air-space opacification without volume loss — the mediastinum stays central.',
    d: 'Tension pneumothorax is hyperlucid (dark), not opaque, and pushes the trachea to the opposite side.',
  },
  'q-gm2': {
    a: 'Egg-on-string is transposition of the great arteries — a narrow pedicle, not a boot.',
    c: 'The snowman (figure-of-8) silhouette belongs to total anomalous pulmonary venous connection.',
    d: 'Rib notching with cardiomegaly is coarctation of the aorta — an older-child/adult finding.',
  },
  'q-gm27': {
    a: 'Digoxin controls ventricular rate in AF but does nothing for acute pulmonary oedema tonight — it is too slow for the emergency.',
    c: 'Dobutamine is for low-output states with hypotension; this patient is hypertensive at 168/96.',
    d: 'Oral captopril loading is neither acute nor fast enough for flash pulmonary oedema with SpO₂ 86%.',
  },
  'q-gm41': {
    a: 'Highly selective vagotomy is an elective anti-ulcer operation — it cannot seal an acute perforation.',
    c: 'Billroth II gastrectomy is excessive morbidity in an unstable, septic patient — repair wins.',
    d: 'Antibiotics alone cannot close a perforation with established free air under the diaphragm.',
  },
  'q-gm61': {
    a: 'Atropine may bridge a vagal bradycardia but will not fix an infra-His complete block — discharging this patient is unsafe.',
    c: 'Adenosine challenges AV nodal conduction in SVT diagnosis — it has no role in complete heart block.',
    d: 'AV-node ablation deliberately creates the block you are trying to fix; it is a rate-control option in refractory AF, not here.',
  },
  'q-gm86': {
    a: 'H. pylori testing is appropriate generally, but a heaped-up ulcer edge demands histology FIRST — treat the possibility of cancer, not the possibility of H. pylori.',
    c: 'An 8-week PPI trial without biopsy risks prescribing through a gastric cancer.',
    d: 'Serum gastrin screens Zollinger–Ellison syndrome — not the first step for a suspicious-looking ulcer.',
  },
  'q-gm92': {
    a: 'Variceal bleeding presents with haematemesis and shock, never with pneumoperitoneum.',
    c: 'A perforated gastric ulcer is possible, but the classic step-ladder fever + terminal ileum over Peyer patches story is enteric fever.',
    d: 'A ruptured amoebic abscess into the pleura gives an effusion/empyema picture — not free intra-abdominal air.',
  },
  'q-graves1': {
    b: 'Focal hot nodules with suppressed background = toxic multinodular goitre — not the diffuse gland of Graves.',
    c: 'No uptake means thyroiditis or exogenous hormone — the opposite of an overactive, avid gland.',
    d: 'A cold nodule raises the question of malignancy or cyst — Graves is a diffuse process.',
  },
  'q-ulcer1': {
    a: 'Worth doing, but H. pylori testing alone misses the real danger here — a weight-losing patient with an ulcer that must be biopsied.',
    c: 'A PPI trial without histology risks eight masked weeks of gastric cancer.',
    d: 'CT adds nothing to an endoscopic diagnosis already in hand.',
  },
}

async function main() {
  // 1) Images + image-based tag
  for (const [qid, url] of Object.entries(IMAGE_MAP)) {
    const q = await db.question.findUnique({ where: { id: qid }, select: { tags: true } })
    if (!q) {
      console.warn(`⚠ question ${qid} not found — skipped`)
      continue
    }
    const tags = Array.isArray(q.tags) ? (q.tags as string[]) : []
    const nextTags = tags.includes('image-based') ? tags : [...tags, 'image-based']
    await db.question.update({ where: { id: qid }, data: { imageUrl: url, tags: nextTags } })
    console.log(`✓ image ${qid} → ${url}${nextTags.length !== tags.length ? ' (+image-based tag)' : ''}`)
  }

  // 2) Per-option notes
  for (const [qid, notes] of Object.entries(OPTION_NOTES)) {
    const q = await db.question.findUnique({ where: { id: qid }, select: { options: true, answer: true } })
    if (!q) {
      console.warn(`⚠ question ${qid} not found — skipped`)
      continue
    }
    const options = (q.options as { id: string; text: string }[])
    // Keep only notes whose option id actually exists on the question
    const clean: Record<string, string> = {}
    for (const [oid, note] of Object.entries(notes)) {
      if (oid === q.answer) continue // never annotate the correct option
      if (options.some((o) => o.id === oid)) clean[oid] = note
    }
    await db.question.update({ where: { id: qid }, data: { optionNotes: clean } })
    console.log(`✓ optionNotes ${qid} (${Object.keys(clean).length} notes)`)
  }

  const all = await db.question.findMany({ select: { id: true, tags: true } })
  const imagePool = all.filter((q) => Array.isArray(q.tags) && (q.tags as string[]).includes('image-based'))
  console.log(`— image-based pool now ${imagePool.length} questions`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
