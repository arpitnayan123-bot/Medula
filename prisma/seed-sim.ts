// ─── PRODUCT 09 · CLINICAL CASE SIMULATOR — seeder ───────────────────────────
// Upserts the 14 curated cases (packs A+B) AND imports the 4 legacy
// ClinicalCase cases (seed-cases.ts) into the richer SimCase format so the
// platform's original case content is preserved inside the new simulator.
// Idempotent: safe to re-run (upsert only, attempts untouched).

import { PrismaClient } from '@prisma/client'
import { simCasesPackA, type SimSeedCase } from './seed-sim-cases-a'
import { simCasesPackB } from './seed-sim-cases-b'
import { cases as legacyCases } from './seed-cases'

const db = new PrismaClient()

// ── Legacy → Sim conversion ─────────────────────────────────────────────────
// Legacy steps keep their content + single-choice questions (teaching line
// becomes the correct-option `why`). Each case then gains curated
// differential / diagnosis / management stages authored below, so imported
// cases exercise the same reasoning loop as the new ones.

type SimBriefStage = SimSeedCase['brief']['stages'][number]

const PHASE_MAP: Record<string, { kind: SimBriefStage['kind']; label: string } | null> = {
  HISTORY: { kind: 'history', label: 'History' },
  PRESENTATION: { kind: 'history', label: 'History' },
  VITALS: { kind: 'exam', label: 'Examination' },
  EXAMINATION: { kind: 'exam', label: 'Examination' },
  LABORATORY: { kind: 'investigations', label: 'Investigations' },
  DECISION: { kind: 'management', label: 'Management' },
  MANAGEMENT: { kind: 'management', label: 'Management' },
  PHARMACOLOGY: { kind: 'management', label: 'Management' },
  COMPLICATION: { kind: 'followup', label: 'Follow-up' },
  PITFALL: { kind: 'followup', label: 'Follow-up' },
  REPORT: null, // covered by the debrief + learning points
}

interface LegacyExtras {
  conceptIds: string[]
  difficulty: SimSeedCase['difficulty']
  system: string
  estimateMinutes: number
  ddx: { label: string; verdict: 'correct' | 'acceptable' | 'wrong'; why: string }[]
  dxOptions: { label: string; verdict: 'correct' | 'acceptable' | 'wrong' | 'harmful'; why: string }[]
  rx: { label: string; verdict: 'correct' | 'acceptable' | 'wrong' | 'harmful'; key?: boolean; why: string }[]
}

const LEGACY_EXTRAS: Record<string, LegacyExtras> = {
  'case-graves': {
    conceptIds: ['c-graves', 'c-thyroidphys', 'c2-medicine-thyroid'],
    difficulty: 'mbbs',
    system: 'endocrine',
    estimateMinutes: 12,
    ddx: [
      { label: "Graves' disease", verdict: 'correct', why: 'Diffuse goitre with bruit + ophthalmopathy + pretibial myxoedema + diffuse high uptake + TRAb positive — the full autoimmune pentad.' },
      { label: 'Toxic multinodular goitre', verdict: 'acceptable', why: 'Causes thyrotoxicosis, but uptake is PATCHY and eye disease/dermopathy are absent.' },
      { label: 'Painless (silent) thyroiditis', verdict: 'acceptable', why: 'Another hyperthyroid cause — but uptake would be near-zero with a destroyed gland.' },
      { label: 'Factitious thyrotoxicosis', verdict: 'wrong', why: 'Exogenous hormone suppresses uptake to zero AND the goitre would not exist.' },
      { label: 'Anxiety disorder', verdict: 'wrong', why: 'Cannot produce diffuse goitre, bruit, proptosis or suppressed TSH.' },
    ],
    dxOptions: [
      { label: "Graves' disease (diffuse toxic goitre)", verdict: 'correct', why: 'Every discriminator — eyes, skin, bruit, diffuse uptake, TRAb — converges.' },
      { label: 'Toxic multinodular goitre', verdict: 'wrong', why: 'Patchy uptake, no extrathyroidal manifestations.' },
      { label: 'Subacute (de Quervain) thyroiditis', verdict: 'wrong', why: 'Painful tender gland, low uptake, post-viral course.' },
      { label: 'Painless thyroiditis', verdict: 'wrong', why: 'Low uptake phase; no eye/derm disease.' },
      { label: 'TSH-secreting adenoma', verdict: 'wrong', why: 'TSH would be inappropriately NORMAL/high — hers is fully suppressed.' },
    ],
    rx: [
      { label: 'Propranolol for adrenergic symptoms + methimazole to block synthesis', verdict: 'correct', key: true, why: 'β-blocker controls symptoms within hours; thionamide blocks TPO — the standard non-pregnant first line.' },
      { label: 'Counsel on three definitive paths (thionamides, radioiodine, surgery) with pros/cons', verdict: 'correct', key: true, why: 'Definitive-therapy choice is a shared decision — her pregnancy plans and eye disease steer it.' },
      { label: 'Avoid radioiodine now (planned pregnancy + active ophthalmopathy)', verdict: 'correct', key: true, why: 'Radioiodine can worsen orbitopathy and is contraindicated in pregnancy planning.' },
      { label: 'PTU preferred if she conceives in the first trimester', verdict: 'acceptable', why: 'PTU is the first-trimester choice (hepatotoxicity limits it afterwards); methimazole resumes later.' },
      { label: 'Iodine (Lugol\'s) before any thionamide', verdict: 'harmful', why: 'Iodine FUELS new hormone synthesis — always block first (the storm rule: block, then flood).' },
      { label: 'Immediate total thyroidectomy this week', verdict: 'wrong', why: 'Surgery requires euthyroid preparation first — operating on a thyrotoxic patient risks storm.' },
      { label: 'Reassurance only — review in 6 months', verdict: 'harmful', why: 'Untreated thyrotoxicosis risks storm, osteoporosis and atrial fibrillation.' },
    ],
  },
  'case-nephrotic': {
    conceptIds: ['c-nephrotic', 'c-nephritic', 'c-gfr'],
    difficulty: 'mbbs',
    system: 'renal',
    estimateMinutes: 12,
    ddx: [
      { label: 'Idiopathic nephrotic syndrome — minimal change disease (child)', verdict: 'correct', why: 'Age 2–12 + selective heavy proteinuria + normal complement + normal BP/RFT is the MCD signature.' },
      { label: 'Focal segmental glomerulosclerosis (FSGS)', verdict: 'acceptable', why: 'The steroid-resistance suspect — biopsy if he fails to respond or shows atypical features.' },
      { label: 'Post-infectious glomerulonephritis', verdict: 'wrong', why: 'A NEPHRITIC disease: haematuria, RBC casts, low C3, hypertension — all absent.' },
      { label: 'Membranous nephropathy (adult pattern)', verdict: 'wrong', why: 'The commonest adult nephrotic cause — wrong age band; think 40s–60s.' },
      { label: 'Hepatitis B–associated nephropathy', verdict: 'wrong', why: 'No HBV history; paediatric first-episode picture points idiopathic first.' },
    ],
    dxOptions: [
      { label: 'Nephrotic syndrome — minimal change disease most likely', verdict: 'correct', why: 'Classic paediatric nephrotic tetrad with bland urine, normal C3 and renal function.' },
      { label: 'Nephritic syndrome (post-streptococcal GN)', verdict: 'harmful', why: 'Haematuria + low C3 + hypertension absent — treating the wrong syndrome delays steroids.' },
      { label: 'FSGS', verdict: 'acceptable', why: 'The differential if steroids fail — respond first, biopsy second.' },
      { label: 'Membranous nephropathy', verdict: 'wrong', why: 'Adult disease; anti-PLA2R workup would be the adult route.' },
      { label: 'Congenital nephrotic syndrome', verdict: 'wrong', why: 'Presents in the first months of life, not at 7 years.' },
    ],
    rx: [
      { label: 'Empirical oral prednisolone 60 mg/m²/day with daily urine protein monitoring', verdict: 'correct', key: true, why: 'Children 2–12 with typical idiopathic nephrotic syndrome are treated WITHOUT biopsy — response itself is diagnostic.' },
      { label: 'Reserve renal biopsy for steroid resistance, relapse with atypical features, or age <1 / >12 years', verdict: 'correct', key: true, why: 'Biopsy-then-treat is the adult algorithm; children invert it.' },
      { label: 'Salt restriction + cautious diuresis for oedema comfort', verdict: 'acceptable', why: 'Symptomatic control while the steroid takes effect; over-diuresis risks intravascular depletion and thrombosis.' },
      { label: 'Vaccination plan (pneumococcal) + varicella status review', verdict: 'acceptable', why: 'Encapsulated-organism risk from urinary IgG loss — prophylaxis is standard supportive care.' },
      { label: 'Renal biopsy before any treatment', verdict: 'wrong', why: 'Needling every oedematous child is outdated — steroid response defines the biopsy question.' },
      { label: 'Cyclophosphamide as first-line therapy', verdict: 'wrong', why: 'Immunosuppressants beyond steroids are for FREQUENT RELAPSERS or steroid dependence.' },
      { label: 'Discharge home today without monitoring plan', verdict: 'harmful', why: 'The first episode needs response documentation + complication watch (thrombosis, infection).' },
    ],
  },
  'case-ami': {
    conceptIds: ['c-ami', 'c-ecg', 'c-troponin'],
    difficulty: 'neetpg',
    system: 'cardiovascular',
    estimateMinutes: 13,
    ddx: [
      { label: 'Acute inferior STEMI with RV involvement (RCA)', verdict: 'correct', why: 'ST↑ II/III/aVF + ST↑ V4R + bradycardia — RCA occlusion with nodal supply threatened.' },
      { label: 'Unstable angina / NSTEMI', verdict: 'acceptable', why: 'The prodrome fits crescendo angina, but ST ELEVATION has escalated him to STEMI territory.' },
      { label: 'Pulmonary embolism', verdict: 'wrong', why: 'Can cause chest pain + hypotension, but not regional ST elevation with reciprocal changes.' },
      { label: 'Aortic dissection', verdict: 'acceptable', why: 'Must always flash through STEMI-differential minds — tearing pain/limb inequality would have demanded CT before anticoagulation; his focal ECG + typical pain argued against.' },
      { label: 'GERD / oesophageal spasm', verdict: 'wrong', why: 'Never explains ST elevation, haemodynamic compromise or troponin rise.' },
    ],
    dxOptions: [
      { label: 'Acute inferior STEMI (RCA) with right ventricular infarction', verdict: 'correct', why: 'ECG localisation (II/III/aVF + V4R) + bradycardia from AV-nodal ischaemia + hypotension.' },
      { label: 'Anterior STEMI (LAD)', verdict: 'wrong', why: 'LAD would elevate V1–V4 with anterior wall motion loss — opposite territory.' },
      { label: 'NSTEMI', verdict: 'wrong', why: 'NSTEMI shows ST depression/T inversion WITHOUT persistent elevation.' },
      { label: 'Pericarditis', verdict: 'wrong', why: 'Diffuse concave elevation + PR depression + pleuritic positional pain — not focal territory with reciprocal depression.' },
      { label: 'Pulmonary embolism with RV strain', verdict: 'wrong', why: 'S1Q3T3 patterns are subtle and non-focal; ST elevation in inferior leads with reciprocal change is infarction until proven otherwise.' },
    ],
    rx: [
      { label: 'Primary PCI achieved ≤90 min door-to-balloon — continue DAPT + anticoagulation', verdict: 'correct', key: true, why: 'Mechanical reperfusion beats fibrinolysis when timely; dual antiplatelets + heparin protect the stent.' },
      { label: 'Aspirin 300 mg chewed + P2Y12 loading before the lab', verdict: 'correct', key: true, why: 'Chewing accelerates absorption — "time is muscle".' },
      { label: 'NO nitrates: RV infarct is preload-dependent', verdict: 'correct', key: true, why: 'V4R elevation + hypotension means the RV needs its filling pressure — nitrate-induced venodilation can crash him.' },
      { label: 'High-intensity statin + beta-blocker + ACE inhibitor for remodelling', verdict: 'correct', key: true, why: 'The post-MI mortality bundle, titrated once haemodynamically stable.' },
      { label: 'Echocardiogram for LV/RV function + complication surveillance', verdict: 'acceptable', why: 'Baseline EF, wall-motion and later complication screening (VSR, MR, tamponade).' },
      { label: 'Fibrinolysis in addition to PCI', verdict: 'harmful', why: 'Double reperfusion adds bleeding (including intracranial) with no benefit once PCI is achieved.' },
      { label: 'Discharge after 24 h if pain-free', verdict: 'harmful', why: 'Post-MI rhythm surveillance (48 h minimum) and complication-timeline monitoring are standard.' },
      { label: 'Wait for troponin to rise before treating', verdict: 'harmful', why: 'Troponin lags hours behind occlusion — STEMI is an ECG-clock diagnosis; waiting wastes myocardium.' },
    ],
  },
  'case-dka': {
    conceptIds: ['c-dka', 'c-insulin', 'c-acidbase'],
    difficulty: 'neetpg',
    system: 'endocrine',
    estimateMinutes: 13,
    ddx: [
      { label: 'Diabetic ketoacidosis (new-onset T1DM)', verdict: 'correct', why: 'Hyperglycaemia + ketonuria + high anion gap acidosis + Kussmaul breathing.' },
      { label: 'Hyperosmolar hyperglycaemic state (HHS)', verdict: 'acceptable', why: 'Also hyperglycaemic — but HHS has extreme osmolality, minimal ketosis and pH near normal.' },
      { label: 'Lactic acidosis from sepsis', verdict: 'acceptable', why: 'Another high-gap acidosis — ketones 3+ and glucose 512 point to ketoacidosis; infection screen still runs.' },
      { label: 'Salicylate poisoning', verdict: 'acceptable', why: 'Causes high-gap acidosis + tachypnoea — excluded by history and the glucose/ketone picture.' },
      { label: 'Alcoholic ketoacidosis', verdict: 'wrong', why: 'Comes with a drinking history and usually NORMAL/low glucose — she is 21 with glucose 512.' },
      { label: 'Uraemic acidosis', verdict: 'wrong', why: 'Creatinine 1.1 — the kidneys are not the acid source.' },
    ],
    dxOptions: [
      { label: 'Diabetic ketoacidosis — new-onset type 1 diabetes', verdict: 'correct', why: 'Weight loss + polyuria + ketosis + gap 26 + glucose 512 in a young adult.' },
      { label: 'HHS', verdict: 'wrong', why: 'No extreme hyperosmolality (~310) and ketosis dominates — pure HHS shows little ketonaemia.' },
      { label: 'Sepsis with lactic acidosis', verdict: 'wrong', why: 'No fever/focus; the ketone drive is insulin deficiency.' },
      { label: 'Acute pancreatitis', verdict: 'wrong', why: 'Abdominal pain in DKA mimics the surgical abdomen — lipase would settle it; the acid-base picture is metabolic ketoacidosis.' },
      { label: 'Salicylate toxicity', verdict: 'wrong', why: 'No ingestion history; tinnitus would be the clue.' },
    ],
    rx: [
      { label: 'Isotonic saline 1–1.5 L in the first hour', verdict: 'correct', key: true, why: 'She is 5–6 L down — volume restores perfusion and makes insulin effective.' },
      { label: 'Insulin infusion 0.1 U/kg/h (started after fluids are running)', verdict: 'correct', key: true, why: 'Switches off ketogenesis; bolus-first strategies raise cerebral oedema risk in young patients.' },
      { label: 'Hold potassium until K⁺ <5.2 with urine flow, then replace generously', verdict: 'correct', key: true, why: 'Serum K is a mirage — total-body K is depleted; insulin will drive it into cells and arrhythmias follow.' },
      { label: 'Add dextrose when glucose approaches ~250, KEEPING insulin running', verdict: 'correct', key: true, why: 'Glucose normalises before ketones clear — dextrose lets insulin continue until the ANION GAP closes.' },
      { label: 'Sodium bicarbonate now (pH 7.02)', verdict: 'wrong', why: 'Bicarbonate is reserved for pH <6.9 — it paradoxically delays ketone clearance and shifts the oxyhaemoglobin curve.' },
      { label: 'Stop insulin when glucose hits 200–250', verdict: 'harmful', why: 'The classic DKA killing error — insulin continues until the gap closes, anion normalises and she is eating.' },
      { label: 'Half-normal saline + bicarbonate as the primary resuscitation', verdict: 'wrong', why: 'Isotonic saline restores intravascular volume first; hypotonic fluid risks cerebral oedema.' },
      { label: 'Urgent haemodialysis', verdict: 'wrong', why: 'Dialysis is for renal failure/toxin removal — DKA clears with fluids + insulin when kidneys work.' },
    ],
  },
}

function convertLegacy(l: (typeof legacyCases)[number]): SimSeedCase {
  const extras = LEGACY_EXTRAS[l.id]
  const stages: SimBriefStage[] = [
    {
      id: 'st-patient', kind: 'patient', label: 'Patient',
      intro: [
        `${l.patient.age}-year-old ${l.patient.sex.toLowerCase()} · ${l.patient.occupation}.`,
        `Chief complaint: ${l.patient.complaint}.`,
      ],
      interactions: [],
    },
  ]

  let lastKind: SimBriefStage['kind'] | null = null
  let stageNo = 0
  for (const step of l.steps) {
    const mapped = PHASE_MAP[step.phase]
    if (!mapped) continue
    stageNo += 1
    const stage: SimBriefStage = {
      id: `st-legacy-${stageNo}`,
      kind: mapped.kind,
      label: mapped.label,
      intro: [...step.content],
      interactions: [],
    }
    if (step.question && step.options) {
      stage.interactions = [
        {
          id: `in-${step.id}`,
          kind: 'choice',
          prompt: step.question,
          options: step.options.map((opt, i) => ({
            id: `o${i}`,
            label: opt,
            verdict: (i === step.answerId ? 'correct' : 'wrong') as 'correct' | 'wrong',
            why: i === step.answerId
              ? (step.teaching ?? 'This is the keyed best answer for this step.')
              : `Not the best answer here — the step's teaching point explains why the keyed answer is preferred. ${(step.teaching ?? '').slice(0, 90)}`,
          })),
        },
      ]
    }
    // merge consecutive steps of the same kind into one stage
    if (lastKind === mapped.kind && stages.length > 1) {
      const prev = stages[stages.length - 1]!
      prev.intro.push(...stage.intro)
      prev.interactions.push(...stage.interactions)
    } else {
      stages.push(stage)
    }
    lastKind = mapped.kind
  }

  stages.push({
    id: 'st-ddx', kind: 'differential', label: 'Differential diagnosis',
    intro: ['Shortlist what you are actively excluding.'],
    interactions: [{
      id: 'in-ddx', kind: 'multi', maxSelect: 4,
      prompt: 'Select the differentials you actively considered (up to four).',
      options: extras.ddx.map((d, i) => ({ id: `d${i + 1}`, ...d })),
    }],
  })
  stages.push({
    id: 'st-dx', kind: 'diagnosis', label: 'Diagnosis',
    intro: ['Commit to the diagnosis.'],
    interactions: [{
      id: 'in-dx', kind: 'choice',
      prompt: 'Most likely diagnosis?',
      options: extras.dxOptions.map((d, i) => ({ id: `dx${i + 1}`, ...d })),
    }],
  })
  stages.push({
    id: 'st-rx', kind: 'management', label: 'Management',
    intro: ['Build the management plan.'],
    interactions: [{
      id: 'in-rx', kind: 'multi', maxSelect: 6,
      prompt: 'Select ALL appropriate management steps (up to six).',
      options: extras.rx.map((m, i) => ({ id: `m${i + 1}`, ...m })),
    }],
  })

  return {
    id: l.id,
    title: l.title,
    specialty: l.specialty.split(' / ')[0]!.trim(),
    system: extras.system,
    difficulty: extras.difficulty,
    patient: { ...l.patient, scene: `${l.patient.age}-year-old ${l.patient.sex.toLowerCase()} ${l.patient.occupation.toLowerCase()} — ${l.patient.complaint}.` },
    estimateMinutes: extras.estimateMinutes,
    aiReady: false,
    brief: {
      diagnosis: l.diagnosis,
      learning: l.learning,
      conceptIds: extras.conceptIds,
      stages,
    },
  }
}

async function main() {
  const curated = [...simCasesPackA, ...simCasesPackB]
  const imported = legacyCases.map(convertLegacy)
  const all = [...curated, ...imported]

  let created = 0
  let updated = 0
  for (const c of all) {
    const existing = await db.simCase.findUnique({ where: { id: c.id } })
    await db.simCase.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        title: c.title,
        specialty: c.specialty,
        system: c.system,
        difficulty: c.difficulty,
        patient: c.patient,
        brief: JSON.parse(JSON.stringify(c.brief)),
        estimateMinutes: c.estimateMinutes,
        imageKey: c.imageKey ?? null,
        imageCaption: c.imageCaption ?? '',
        aiReady: c.aiReady ?? false,
        source: c.id.startsWith('case-') ? 'imported-legacy' : 'curated',
      },
      update: {
        title: c.title,
        specialty: c.specialty,
        system: c.system,
        difficulty: c.difficulty,
        patient: c.patient,
        brief: JSON.parse(JSON.stringify(c.brief)),
        estimateMinutes: c.estimateMinutes,
        imageKey: c.imageKey ?? null,
        imageCaption: c.imageCaption ?? '',
        aiReady: c.aiReady ?? false,
        source: c.id.startsWith('case-') ? 'imported-legacy' : 'curated',
      },
    })
    if (existing) updated += 1
    else created += 1
  }

  const total = await db.simCase.count()
  const bySpecialty = await db.simCase.groupBy({ by: ['specialty'], _count: true, orderBy: { specialty: 'asc' } })
  const imageCases = all.filter(c => c.imageKey).map(c => `${c.id}→${c.imageKey}`).join(', ')
  const aiCases = all.filter(c => c.aiReady).map(c => c.id).join(', ')
  const invalidConcepts: string[] = []
  for (const c of all) {
    for (const cid of c.brief.conceptIds) {
      const exists = await db.concept.findUnique({ where: { id: cid } })
      if (!exists) invalidConcepts.push(`${c.id}:${cid}`)
    }
  }

  console.log(`✓ SimCase seeded — ${created} created, ${updated} updated, ${total} total`)
  console.log('  By specialty:')
  for (const g of bySpecialty) console.log(`   · ${g.specialty}: ${g._count}`)
  console.log(`  Image-based: ${imageCases || 'none'}`)
  console.log(`  AI-ready: ${aiCases || 'none'}`)
  console.log(`  Concept links: all valid${invalidConcepts.length ? ` — INVALID: ${invalidConcepts.join(', ')}` : ''}`)
  if (invalidConcepts.length) process.exitCode = 1
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
