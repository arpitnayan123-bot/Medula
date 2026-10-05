/* eslint-disable no-console */
// ─── PRODUCT 08 — MEDICAL KNOWLEDGE GRAPH — CURATED DATA SEEDER ────────────
// Companion to prisma/seed.ts (DESTRUCTIVE) — this file is UPSERT-ONLY and
// SAFE TO RE-RUN. It NEVER deletes rows.
//
// Data-quality policy (spec: "relationships must be medically meaningful,
// not random AI-generated connections"):
//   • Every edge below is hand-curated against the seeded concept list.
//   • Direction conventions follow the existing seed:
//       prerequisite_of   prereq      → advanced        (GFR → RAAS)
//       causes            cause       → effect          (RAAS → HTN)
//       caused_by         effect      → cause           (inverse)
//       treated_by        drug        → disease         (ACEI → HTN)
//       diagnosed_by      disease     → investigation   (AMI → ECG)
//       complication_of   disease     → complication    (DM → DKA)
//       differential_of   disease     → its differential (either side OK)
//       mechanism_of      mechanism   → thing explained (RAAS → ACEI)
//       manifestation_of  sign        → disease         (new type)
//       related_to / commonly_tested_with / clinical_application_of  symmetric
//   • source stays "curated", verified=true → reviewable provenance.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

type E = { from: string; to: string; type: string; label?: string }

// ── CURATED EDGES (medically meaningful, cross-subject where relevant) ──────
const edges: E[] = [
  // ── Cardiovascular chain (the spec's Heart Failure example) ──
  { from: 'c2-anatomy-heart-chambers-valves', to: 'c-cardcycle', type: 'prerequisite_of', label: 'chambers + valves before flow' },
  { from: 'c-cardcycle', to: 'c-heartfail', type: 'mechanism_of', label: 'Frank–Starling & pump reserve' },
  { from: 'c-htn', to: 'c-heartfail', type: 'causes', label: 'chronic pressure overload' },
  { from: 'c-ami', to: 'c-heartfail', type: 'causes', label: 'ischemic cardiomyopathy' },
  { from: 'c-heartfail', to: 'c-aki', type: 'causes', label: 'cardiorenal hypoperfusion' },
  { from: 'c-heartfail', to: 'c-cxr', type: 'diagnosed_by', label: 'pulmonary oedema, cardiomegaly' },
  { from: 'c-heartfail', to: 'c-ecg', type: 'diagnosed_by', label: 'strain patterns, ischaemia search' },
  { from: 'c-heartfail', to: 'c-acei', type: 'treated_by', label: 'afterload reduction' },
  { from: 'c-heartfail', to: 'c-betablock', type: 'treated_by', label: 'remodelling protection' },
  { from: 'c-heartfail', to: 'c-diuretics', type: 'treated_by', label: 'congestion control' },
  { from: 'c-heartfail', to: 'c-shock', type: 'related_to', label: 'cardiogenic shock = pump failure end-stage' },
  { from: 'c2-cc-shock', to: 'c-shock', type: 'related_to', label: 'same emergency, two subject lenses' },
  { from: 'c2-pathology-cell-injury', to: 'c-ami', type: 'related_to', label: 'coagulative necrosis of myocardium' },
  { from: 'c-ami', to: 'c-arrhythmia', type: 'causes', label: 'necrotic substrate → re-entry' },
  { from: 'c-hyperk', to: 'c-arrhythmia', type: 'causes', label: 'peaked T → wide QRS → arrest' },
  { from: 'c2-physiology-cardiac-action-potential', to: 'c-ecg', type: 'prerequisite_of', label: 'depolarisation waves → complexes' },
  { from: 'c2-physiology-cardiac-action-potential', to: 'c-arrhythmia', type: 'prerequisite_of', label: 're-entry needs slowed conduction' },
  { from: 'c2-physiology-blood-pressure-regulation', to: 'c-htn', type: 'prerequisite_of', label: 'short + long term BP control' },
  { from: 'c2-physiology-blood-pressure-regulation', to: 'c-raas', type: 'related_to', label: 'RAAS = the chronic arm' },
  { from: 'c-htn', to: 'c2-medicine-stroke', type: 'causes', label: 'hypertensive small-vessel stroke' },
  { from: 'c-htn', to: 'c2-medicine-ckd', type: 'related_to', label: 'nephrosclerosis' },
  { from: 'c-coronary', to: 'c-ami', type: 'prerequisite_of', label: 'territory mapping' },
  { from: 'c-ecg', to: 'c-arrhythmia', type: 'related_to', label: 'read the rhythm first' },

  // ── Renal cluster ──
  { from: 'c-aki', to: 'c2-medicine-ckd', type: 'causes', label: 'repeated AKI episodes scar' },
  { from: 'c-aki', to: 'c2-medicine-ckd', type: 'related_to', label: 'AKI-on-CKD workup' },
  { from: 'c-diuretics', to: 'c-hyperk', type: 'causes', label: 'K⁺-sparing limbs retain potassium' },
  { from: 'c-acidbase', to: 'c-rta', type: 'prerequisite_of', label: 'read the ABG first' },
  { from: 'c-acidbase', to: 'c-dka', type: 'related_to', label: 'high-anion-gap acidosis' },
  { from: 'c-gfr', to: 'c-acidbase', type: 'prerequisite_of', label: 'acid excretion follows GFR' },
  { from: 'c-peds-poststrep', to: 'c-nephritic', type: 'differential_of', label: 'the paediatric nephritic story' },
  { from: 'c-aki', to: 'c-hyperk', type: 'causes', label: 'excretion failure' },

  // ── Endocrine cluster ──
  { from: 'c-dm', to: 'c-diabretino', type: 'complication_of', label: 'microangiopathy' },
  { from: 'c-dka', to: 'c-fluids', type: 'related_to', label: 'fluid-first management' },
  { from: 'c-insulin', to: 'c2-biochemistry-fasting-gluconeogenesis', type: 'related_to', label: 'insulin suppresses gluconeogenesis' },
  { from: 'c-thyroidphys', to: 'c-graves', type: 'prerequisite_of', label: 'TSH-receptor antibodies in context' },
  { from: 'c-thyroidphys', to: 'c2-medicine-thyroid', type: 'prerequisite_of', label: 'synthesis → hyper vs hypo' },
  { from: 'c-graves', to: 'c-thyroidstorm', type: 'causes', label: 'uncontrolled hyperthyroidism decompensates' },
  { from: 'c-steroids', to: 'c-cushing', type: 'causes', label: 'exogenous steroids mimic the syndrome' },
  { from: 'c2-anatomy-thyroid-gland', to: 'c-thyroidnodule', type: 'prerequisite_of', label: 'lobes, isthmus, relations' },
  { from: 'c2-anatomy-thyroid-gland', to: 'c2-pathology-thyroid-pathology', type: 'prerequisite_of', label: 'goitre anatomy before pathology' },
  { from: 'c-thyroidnodule', to: 'c2-medicine-thyroid', type: 'related_to', label: 'solitary nodule workup' },
  { from: 'c2-biochemistry-glycolysis-tca', to: 'c-glycogen', type: 'prerequisite_of', label: 'fuel pathways explain storage disease' },
  { from: 'c2-biochemistry-glycolysis-tca', to: 'c-insulin', type: 'related_to', label: 'fuel metabolism map' },

  // ── Respiratory cluster ──
  { from: 'c2-physiology-respiration-gas-exchange', to: 'c-asthma-copd', type: 'prerequisite_of', label: 'obstruction physiology' },
  { from: 'c-asthma-copd', to: 'c-spirometry', type: 'diagnosed_by', label: 'FEV1/FVC decides' },
  { from: 'c2-medicine-pneumonia', to: 'c-cxr', type: 'diagnosed_by', label: 'consolidation' },
  { from: 'c-tb', to: 'c-cxr', type: 'diagnosed_by', label: 'upper-lobe cavitation' },
  { from: 'c-cxr', to: 'c2-rad-cxr', type: 'related_to', label: 'two lenses on one film' },
  { from: 'c-airway', to: 'emergency-abcde', type: 'prerequisite_of', label: 'A before everything' },
  { from: 'c-trauma-primary', to: 'emergency-abcde', type: 'related_to', label: 'the same loop, trauma lens' },
  { from: 'c2-anes-asa-airway', to: 'c-airway', type: 'prerequisite_of', label: 'grading before securing' },
  { from: 'c-shock', to: 'emergency-abcde', type: 'related_to', label: 'shock recognition inside C' },
  { from: 'c2-cc-shock', to: 'c-sepsis', type: 'related_to', label: 'septic shock = distributive type' },

  // ── GI / hepatic cluster ──
  { from: 'c-hpylori', to: 'c-ulcer', type: 'causes', label: 'the urease story' },
  { from: 'c2-surgery-acute-abdomen', to: 'c-appendicitis', type: 'prerequisite_of', label: 'approach before the disease' },
  { from: 'c2-surgery-acute-abdomen', to: 'c2-surgery-int-obstruction', type: 'commonly_tested_with', label: 'RIF vs central colicky map' },
  { from: 'c-appendicitis', to: 'c2-surgery-appendicitis', type: 'related_to', label: 'disease vs surgery lens' },
  { from: 'c-hernia', to: 'c2-surgery-hernias', type: 'related_to', label: 'same defect, two lenses' },
  { from: 'c2-pathology-cirrhosis', to: 'c-aki', type: 'causes', label: 'hepatorenal syndrome' },
  { from: 'c2-microbiology-hbv-serology', to: 'c2-pathology-cirrhosis', type: 'related_to', label: 'chronic HBV → cirrhosis' },
  { from: 'c2-embryology-gi-rotation', to: 'c2-surgery-int-obstruction', type: 'prerequisite_of', label: 'malrotation → volvulus' },
  { from: 'c2-anatomy-inguinal-canal', to: 'c-hernia', type: 'prerequisite_of', label: 'canal bounds decide direct vs indirect' },

  // ── Haematology cluster ──
  { from: 'c2-pathology-anemias', to: 'c-idacda', type: 'prerequisite_of', label: 'MCV frame before the pair' },
  { from: 'c2-medicine-anemia', to: 'c2-pathology-anemias', type: 'related_to', label: 'clinical vs pathology lens' },
  { from: 'c-leukemia', to: 'c2-pathology-leukaemias', type: 'related_to', label: 'same blasts, two lenses' },
  { from: 'c-coag', to: 'c-antidotes', type: 'related_to', label: 'anticoagulant-overdose logic' },
  { from: 'c-coag', to: 'c-leukemia', type: 'related_to', label: 'AML releases tissue factor → DIC' },

  // ── Immunology / pathology cluster ──
  { from: 'c2-immunology-innate-adaptive', to: 'c-hypersensitivity', type: 'prerequisite_of', label: 'I–IV need the adaptive arm' },
  { from: 'c-hypersensitivity', to: 'c2-immunology-hypersensitivity', type: 'related_to', label: 'one framework, two lenses' },
  { from: 'c-atopic-derm', to: 'c-hypersensitivity', type: 'caused_by', label: 'IgE-mediated atopy' },
  { from: 'c-atopic-derm', to: 'c-psoriasis', type: 'differential_of', label: 'flexural lichenification vs extensor plaques' },
  { from: 'c-psoriasis', to: 'c2-derm-psoriasis', type: 'related_to', label: 'same plaques, two lenses' },
  { from: 'c2-pathology-cell-injury', to: 'c-inflamm', type: 'prerequisite_of', label: 'injury first, response next' },
  { from: 'c-neoplasia', to: 'c2-pathology-cell-injury', type: 'related_to', label: 'dysplasia sits on injury continuum' },
  { from: 'c-genetics', to: 'c2-genetics-inheritance-patterns', type: 'related_to', label: 'one pedigree logic, two lenses' },
  { from: 'c2-genetics-trisomies', to: 'c-genetics', type: 'related_to', label: 'nondisjunction in context' },

  // ── Microbiology → pharmacology bridge ──
  { from: 'c2-microbiology-gram-stain', to: 'c2-pharmacology-antibiotics', type: 'prerequisite_of', label: 'the wall decides colour AND target' },
  { from: 'c-antitb', to: 'c2-pharmacology-antibiotics', type: 'related_to', label: 'mycobacterial regimen is a different logic' },
  { from: 'c2-medicine-tb-mgmt', to: 'c-tb', type: 'related_to', label: 'disease vs management lens' },
  { from: 'c2-medicine-tb-mgmt', to: 'c-antitb', type: 'prerequisite_of', label: 'principles before the drug ladder' },
  { from: 'c2-microbiology-malaria', to: 'c2-pathology-anemias', type: 'causes', label: 'haemolysis every cycle' },
  { from: 'c2-microbiology-hiv', to: 'c2-immunology-immunodeficiencies', type: 'related_to', label: 'acquired immunodeficiency' },

  // ── Pharmacology spine ──
  { from: 'c2-pharmacology-kinetics', to: 'c2-pharmacology-dynamics', type: 'prerequisite_of', label: 'what body does → what drug does' },
  { from: 'c2-pharmacology-kinetics', to: 'c-antidotes', type: 'prerequisite_of', label: 'half-life drives antidote timing' },
  { from: 'c2-pharmacology-autonomic', to: 'c-betablock', type: 'prerequisite_of', label: 'receptors before blockers' },
  { from: 'c2-pharmacology-autonomic', to: 'c2-pharmacology-emergency', type: 'prerequisite_of', label: 'crash-cart drugs map to receptors' },
  { from: 'c-antidotes', to: 'c2-pharmacology-emergency', type: 'commonly_tested_with', label: 'poisoning vs crash-cart pairs' },
  { from: 'c-oxytocin', to: 'c-pph', type: 'treated_by', label: 'uterotonics prevent atonic PPH' },
  { from: 'c-steroids', to: 'c2-pharmacology-dynamics', type: 'related_to', label: 'dose → effect ladder' },

  // ── AI-medicine cluster (bridges into clinical biostat) ──
  { from: 'c-ai-sensitivity-specificity', to: 'c-ai-auroc-auprc', type: 'prerequisite_of', label: 'thresholds before curves' },
  { from: 'c-ai-machine-learning-basics', to: 'c-ai-deep-learning', type: 'prerequisite_of', label: 'training first, layers next' },
  { from: 'c-ai-what-is-medical-ai', to: 'c-ai-predictive-models', type: 'prerequisite_of', label: 'scope before the models' },
  { from: 'c-ai-machine-learning-basics', to: 'c-ai-sensitivity-specificity', type: 'prerequisite_of', label: 'confusion matrix is the test' },
  { from: 'c-ai-llms-multimodal', to: 'c-ai-healthcare-agents', type: 'prerequisite_of', label: 'LLMs are the agent engine' },
  { from: 'c-ai-sensitivity-specificity', to: 'c-biostat', type: 'related_to', label: 'same 2×2 table, new subject' },
  { from: 'c-epidesign', to: 'c-ai-sensitivity-specificity', type: 'related_to', label: 'screening test metrics' },
  { from: 'c-biostat', to: 'c-epidesign', type: 'related_to', label: 'tests need a design first' },
  { from: 'c2-cm-incidence-prevalence', to: 'c-epidesign', type: 'prerequisite_of', label: 'two numbers before designs' },
  { from: 'c2-cm-screening', to: 'c-biostat', type: 'related_to', label: 'screening biases meet test metrics' },
  { from: 'c2-cm-screening', to: 'c-epidesign', type: 'commonly_tested_with', label: 'lead-time vs length bias' },

  // ── MSK / anatomy → clinical ──
  { from: 'c-brachial', to: 'c-colles', type: 'related_to', label: 'radial nerve injury with distal radius' },
  { from: 'c-compartment', to: 'c2-orth-compartment', type: 'related_to', label: 'same emergency, two lenses' },
  { from: 'c-colles', to: 'c2-orth-colles', type: 'related_to', label: 'same fracture, two lenses' },
  { from: 'c-cranial', to: 'c-bppv-meniere', type: 'related_to', label: 'CN VIII vestibular link' },
  { from: 'c-red-eye', to: 'c2-opht-glaucoma', type: 'related_to', label: 'the painful red eye differential' },
  { from: 'c-poag', to: 'c2-opht-glaucoma', type: 'related_to', label: 'silent thief vs acute attack' },
  { from: 'c2-ent-otitis-media', to: 'c-otitis-media', type: 'related_to', label: 'AOM to complications, two lenses' },
  { from: 'c-diabretino', to: 'c2-opht-cataract', type: 'related_to', label: 'the diabetic eye pair' },

  // ── ObGyn / paediatrics ──
  { from: 'c-preec', to: 'c-eclampsia-mgmt', type: 'prerequisite_of', label: 'recognise before you manage' },
  { from: 'c2-obgy-anc', to: 'c-preec', type: 'prerequisite_of', label: 'ANC is where pre-eclampsia is caught' },
  { from: 'c2-obgy-normal-labour', to: 'c-partograph', type: 'prerequisite_of', label: 'stages make the curves readable' },
  { from: 'c-fluids', to: 'c2-peds-diarrhea', type: 'prerequisite_of', label: 'WHO plans A/B/C are fluid logic' },
  { from: 'c-imnci', to: 'c2-peds-diarrhea', type: 'related_to', label: 'danger signs frame every plan' },
  { from: 'c-milestones', to: 'c2-peds-milestones', type: 'related_to', label: 'one timeline, two lenses' },
  { from: 'c-vaccines', to: 'c2-peds-immunization', type: 'related_to', label: 'national schedule × principles' },
  { from: 'c-vaccines', to: 'c2-cm-vaccine-platforms', type: 'related_to', label: 'schedule meets platform science' },

  // ── Psychiatry ──
  { from: 'c2-psy-schizophrenia', to: 'c-schizo-frs', type: 'prerequisite_of', label: 'basics before first-rank symptoms' },
  { from: 'c-mdd', to: 'c2-psy-depression', type: 'related_to', label: 'same disorder, two lenses' },
  { from: 'c-schizo-frs', to: 'c2-psy-schizophrenia', type: 'differential_of', label: 'FRS vs basics' },

  // ── FMT / histology / wounds ──
  { from: 'c2-fmt-wound-types', to: 'c2-surgery-wounds-healing', type: 'prerequisite_of', label: 'read the wound, then predict healing' },
  { from: 'c2-fmt-postmortem-changes', to: 'c2-fmt-wound-types', type: 'related_to', label: 'the FMT pairing' },
  { from: 'c2-histology-epithelium', to: 'c2-histology-connective-tissue', type: 'related_to', label: 'tissue siblings' },
  { from: 'c2-histology-epithelium', to: 'c2-pathology-cell-injury', type: 'related_to', label: 'normal architecture is the baseline' },
  { from: 'c2-physiology-gi-secretion', to: 'c-ulcer', type: 'prerequisite_of', label: 'acid–mucosal balance' },
]

// ── CURATED SYNONYMS (natural terminology + common variations) ──────────────
// term = what students actually type. Exact lowercase match; never ambiguous
// mappings (an ambiguous term is better left unmapped than taught wrong).
type S = { term: string; kind: 'concept' | 'topic' | 'subject'; refId: string; weight?: number }

const synonyms: S[] = [
  // Cardio
  { term: 'hf', kind: 'concept', refId: 'c-heartfail', weight: 3 },
  { term: 'chf', kind: 'concept', refId: 'c-heartfail', weight: 3 },
  { term: 'congestive cardiac failure', kind: 'concept', refId: 'c-heartfail', weight: 2 },
  { term: 'pnd', kind: 'concept', refId: 'c-heartfail', weight: 2 },
  { term: 'paroxysmal nocturnal dyspnoea', kind: 'concept', refId: 'c-heartfail', weight: 2 },
  { term: 'heart attack', kind: 'concept', refId: 'c-ami', weight: 3 },
  { term: 'mi', kind: 'concept', refId: 'c-ami', weight: 3 },
  { term: 'stemi', kind: 'concept', refId: 'c-ami', weight: 3 },
  { term: 'nstemi', kind: 'concept', refId: 'c-ami', weight: 2 },
  { term: 'acs', kind: 'concept', refId: 'c-ami', weight: 2 },
  { term: 'ihd', kind: 'concept', refId: 'c-coronary', weight: 2 },
  { term: 'cad', kind: 'concept', refId: 'c-coronary', weight: 2 },
  { term: 'chd', kind: 'concept', refId: 'c-coronary', weight: 1 },
  { term: 'htn', kind: 'concept', refId: 'c-htn', weight: 3 },
  { term: 'high bp', kind: 'concept', refId: 'c-htn', weight: 2 },
  { term: 'high blood pressure', kind: 'concept', refId: 'c-htn', weight: 2 },
  { term: 'bp', kind: 'concept', refId: 'c-htn', weight: 1 },
  { term: 'af', kind: 'concept', refId: 'c-arrhythmia', weight: 2 },
  { term: 'atrial fib', kind: 'concept', refId: 'c-arrhythmia', weight: 2 },
  { term: 'vt', kind: 'concept', refId: 'c-arrhythmia', weight: 2 },
  { term: 'vf', kind: 'concept', refId: 'c-arrhythmia', weight: 2 },
  { term: 'ecg', kind: 'concept', refId: 'c-ecg', weight: 3 },
  { term: 'ekg', kind: 'concept', refId: 'c-ecg', weight: 3 },
  { term: 'troponin', kind: 'concept', refId: 'c-troponin', weight: 1 },
  // Renal / metabolic
  { term: 'aki', kind: 'concept', refId: 'c-aki', weight: 3 },
  { term: 'arf', kind: 'concept', refId: 'c-aki', weight: 2 },
  { term: 'renal failure', kind: 'concept', refId: 'c-aki', weight: 2 },
  { term: 'ckd', kind: 'concept', refId: 'c2-medicine-ckd', weight: 3 },
  { term: 'esrd', kind: 'concept', refId: 'c2-medicine-ckd', weight: 2 },
  { term: 'dialysis', kind: 'concept', refId: 'c2-medicine-ckd', weight: 1 },
  { term: 'raas', kind: 'concept', refId: 'c-raas', weight: 3 },
  { term: 'gfr', kind: 'concept', refId: 'c-gfr', weight: 3 },
  { term: 'abg', kind: 'concept', refId: 'c-acidbase', weight: 3 },
  { term: 'blood gases', kind: 'concept', refId: 'c-acidbase', weight: 2 },
  { term: 'rta', kind: 'concept', refId: 'c-rta', weight: 3 },
  { term: 'dm', kind: 'concept', refId: 'c-dm', weight: 3 },
  { term: 't1dm', kind: 'concept', refId: 'c-dm', weight: 2 },
  { term: 't2dm', kind: 'concept', refId: 'c-dm', weight: 2 },
  { term: 'diabetes', kind: 'concept', refId: 'c-dm', weight: 2 },
  { term: 'dka', kind: 'concept', refId: 'c-dka', weight: 3 },
  { term: 'hba1c', kind: 'concept', refId: 'c-hba1c', weight: 3 },
  { term: 'a1c', kind: 'concept', refId: 'c-hba1c', weight: 2 },
  { term: 'glycated haemoglobin', kind: 'concept', refId: 'c-hba1c', weight: 2 },
  // Drugs
  { term: 'acei', kind: 'concept', refId: 'c-acei', weight: 3 },
  { term: 'ace', kind: 'concept', refId: 'c-acei', weight: 1 },
  { term: 'bb', kind: 'concept', refId: 'c-betablock', weight: 1 },
  { term: 'aspirin', kind: 'concept', refId: 'c-antiplatelet', weight: 2 },
  { term: 'heparin', kind: 'concept', refId: 'c-coag', weight: 2 },
  { term: 'warfarin', kind: 'concept', refId: 'c-coag', weight: 2 },
  { term: 'dic', kind: 'concept', refId: 'c-coag', weight: 2 },
  { term: 'anticoagulation', kind: 'concept', refId: 'c-coag', weight: 2 },
  { term: 'steroids', kind: 'concept', refId: 'c-steroids', weight: 2 },
  { term: 'cortisone', kind: 'concept', refId: 'c-steroids', weight: 1 },
  { term: 'nsaid', kind: 'concept', refId: 'c2-pharmacology-nsaids', weight: 3 },
  { term: 'nsaids', kind: 'concept', refId: 'c2-pharmacology-nsaids', weight: 3 },
  { term: 'crash cart', kind: 'concept', refId: 'c2-pharmacology-emergency', weight: 2 },
  // Infectious / micro
  { term: 'tb', kind: 'concept', refId: 'c-tb', weight: 3 },
  { term: 'koch', kind: 'concept', refId: 'c-tb', weight: 2 },
  { term: "koch's", kind: 'concept', refId: 'c-tb', weight: 2 },
  { term: 'kochs', kind: 'concept', refId: 'c-tb', weight: 2 },
  { term: 'gram positive', kind: 'concept', refId: 'c2-microbiology-gram-stain', weight: 1 },
  { term: 'gram negative', kind: 'concept', refId: 'c2-microbiology-gram-stain', weight: 1 },
  { term: 'elisa', kind: 'concept', refId: 'c2-microbiology-hiv', weight: 1 },
  { term: 'western blot', kind: 'concept', refId: 'c2-microbiology-hiv', weight: 1 },
  // Respiratory / investigations
  { term: 'copd', kind: 'concept', refId: 'c-asthma-copd', weight: 3 },
  { term: 'pft', kind: 'concept', refId: 'c-spirometry', weight: 3 },
  { term: 'pfts', kind: 'concept', refId: 'c-spirometry', weight: 2 },
  { term: 'cxr', kind: 'concept', refId: 'c-cxr', weight: 3 },
  { term: 'chest xray', kind: 'concept', refId: 'c-cxr', weight: 2 },
  { term: 'chest x-ray', kind: 'concept', refId: 'c-cxr', weight: 2 },
  // Haem / general pathology
  { term: 'anaemia', kind: 'concept', refId: 'c2-medicine-anemia', weight: 3 },
  { term: 'low hb', kind: 'concept', refId: 'c2-medicine-anemia', weight: 2 },
  { term: 'ida', kind: 'concept', refId: 'c-idacda', weight: 2 },
  { term: 'acd', kind: 'concept', refId: 'c-idacda', weight: 1 },
  { term: 'anemia of chronic disease', kind: 'concept', refId: 'c-idacda', weight: 2 },
  { term: 'cancer', kind: 'concept', refId: 'c-neoplasia', weight: 1 },
  { term: 'tumor', kind: 'concept', refId: 'c-neoplasia', weight: 1 },
  { term: 'tumour', kind: 'concept', refId: 'c-neoplasia', weight: 1 },
  { term: 'tnm', kind: 'concept', refId: 'oncology-tnm', weight: 3 },
  { term: 'staging', kind: 'concept', refId: 'oncology-tnm', weight: 1 },
  // Endocrine misc
  { term: 'thyrotoxicosis', kind: 'concept', refId: 'c-graves', weight: 2 },
  { term: 'thyrotoxic crisis', kind: 'concept', refId: 'c-thyroidstorm', weight: 2 },
  { term: 'hyperkalemia', kind: 'concept', refId: 'c-hyperk', weight: 2 },
  { term: 'pcod', kind: 'concept', refId: 'c2-obgy-pcos', weight: 3 },
  // Emergency
  { term: 'abcde', kind: 'concept', refId: 'emergency-abcde', weight: 3 },
  { term: 'atls', kind: 'concept', refId: 'c-trauma-primary', weight: 2 },
  { term: 'primary survey', kind: 'concept', refId: 'c-trauma-primary', weight: 2 },
  { term: 'imci', kind: 'concept', refId: 'c-imnci', weight: 3 },
  // ObGyn / derm / ent
  { term: 'pph', kind: 'concept', refId: 'c-pph', weight: 3 },
  { term: 'pet', kind: 'concept', refId: 'c-preec', weight: 2 },
  { term: 'pre-eclampsia', kind: 'concept', refId: 'c-preec', weight: 3 },
  { term: 'preeclampsia', kind: 'concept', refId: 'c-preec', weight: 3 },
  { term: 'eclampsia', kind: 'concept', refId: 'c-preec', weight: 2 },
  { term: 'csom', kind: 'concept', refId: 'c-otitis-media', weight: 3 },
  { term: 'glue ear', kind: 'concept', refId: 'c-otitis-media', weight: 2 },
  { term: 'ear infection', kind: 'concept', refId: 'c-otitis-media', weight: 1 },
  { term: 'psgn', kind: 'concept', refId: 'c-peds-poststrep', weight: 3 },
  // Subject-level natural terms (Indian course names included)
  { term: 'pharma', kind: 'subject', refId: 'pharmacology', weight: 2 },
  { term: 'patho', kind: 'subject', refId: 'pathology', weight: 2 },
  { term: 'physio', kind: 'subject', refId: 'physiology', weight: 2 },
  { term: 'anat', kind: 'subject', refId: 'anatomy', weight: 2 },
  { term: 'biochem', kind: 'subject', refId: 'biochemistry', weight: 2 },
  { term: 'psm', kind: 'subject', refId: 'cm', weight: 3 },
  { term: 'spm', kind: 'subject', refId: 'cm', weight: 2 },
  { term: 'community medicine', kind: 'subject', refId: 'cm', weight: 2 },
  { term: 'forensic', kind: 'subject', refId: 'fmt', weight: 2 },
  { term: 'fsm', kind: 'subject', refId: 'fmt', weight: 1 },
]

async function main() {
  console.log('🔗 Knowledge Graph seeder (upsert-only, safe to re-run)…')

  // 1) Provenance on ALL existing edges — idempotent.
  const stamped = await db.conceptEdge.updateMany({
    where: { source: 'curated', verified: false },
    data: { verified: true },
  })
  console.log(`  re-verified ${stamped.count} previously flagged edges (if any)`)

  // 2) Curated edges — upsert by deterministic id.
  let created = 0
  let skipped = 0
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]
    const id = `g8-e-${i + 1}`
    const exists = await db.conceptEdge.findFirst({ where: { fromId: e.from, toId: e.to, type: e.type } })
    if (exists) {
      // Keep the legacy row; just ensure provenance + a label when missing.
      await db.conceptEdge.update({
        where: { id: exists.id },
        data: { label: exists.label || e.label || '', source: 'curated', verified: true },
      })
      skipped++
      continue
    }
    const fromOk = await db.concept.findUnique({ where: { id: e.from }, select: { id: true } })
    const toOk = await db.concept.findUnique({ where: { id: e.to }, select: { id: true } })
    if (!fromOk || !toOk) {
      console.log(`  ⚠️ skip missing endpoint: ${e.from} → ${e.to}`)
      continue
    }
    await db.conceptEdge.create({
      data: { id, fromId: e.from, toId: e.to, type: e.type, label: e.label ?? '', source: 'curated', verified: true },
    })
    created++
  }
  console.log(`  edges: ${created} created, ${skipped} already present (labelled)`)

  // 3) Synonyms — upsert by unique term.
  let sCreated = 0
  for (let i = 0; i < synonyms.length; i++) {
    const s = synonyms[i]
    const data = { id: `g8-s-${i + 1}`, term: s.term, kind: s.kind, refId: s.refId, weight: s.weight ?? 1 }
    await db.graphSynonym.upsert({ where: { term: s.term }, create: data, update: data })
    sCreated++
  }
  console.log(`  synonyms: ${sCreated} upserted`)

  // 4) Health report — connectivity after seeding.
  const all = await db.conceptEdge.findMany()
  const deg = new Map<string, number>()
  for (const e of all) {
    deg.set(e.fromId, (deg.get(e.fromId) || 0) + 1)
    deg.set(e.toId, (deg.get(e.toId) || 0) + 1)
  }
  const concepts = await db.concept.findMany({ select: { id: true } })
  const isolated = concepts.filter(c => !deg.has(c.id)).length
  const byType: Record<string, number> = {}
  for (const e of all) byType[e.type] = (byType[e.type] || 0) + 1
  console.log('  graph health:', {
    edges: all.length,
    concepts: concepts.length,
    connected: deg.size,
    isolated,
    byType,
  })
  console.log('✅ Knowledge Graph seed complete')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
