// ─── PRODUCT 16 — COMMUNITY & ACCOUNTABILITY SEED ───────────────────────────
// Seeds the demo community: structured spaces (derived from the live Subject
// registry), clearly-labelled demo peers, medically-grounded discussions linked
// to REAL curriculum topics, study groups + challenges with peer-progress
// snapshots. Idempotent: wipes community tables then recreates with stable ids.
// The real user ("you") is NEVER seeded — derived from StudentProfile at read
// time. Peer content is demo data and is labelled as such in the UI.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const daysAgo = (n: number, hoursOffset = 0) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000 - hoursOffset * 60 * 60 * 1000)

async function main() {
  // ── wipe community tables (idempotent re-seed) ──
  await db.communityVote.deleteMany()
  await db.savedDiscussion.deleteMany()
  await db.communityReport.deleteMany()
  await db.memberBlock.deleteMany()
  await db.groupMembership.deleteMany()
  await db.groupChallenge.deleteMany()
  await db.communityReply.deleteMany()
  await db.communityPost.deleteMany()
  await db.studyGroup.deleteMany()
  await db.communityMember.deleteMany()
  await db.communitySpace.deleteMany()
  await db.accountabilityGoal.deleteMany()
  await db.communitySettings.deleteMany()

  // ── spaces: fixed core spaces + one per live Subject ──
  const coreSpaces = [
    { id: 'c-space-neetpg', kind: 'exam', name: 'NEET-PG Preparation Hub', description: 'Strategy, high-yield discussions, exam-day tactics and motivation for NEET-PG aspirants.', subjectCode: '' },
    { id: 'c-space-fmge', kind: 'exam', name: 'FMGE / MCI Screening', description: 'FMGE-focused discussions: subject order, foreign-medical-graduate doubts, pass strategy.', subjectCode: '' },
    { id: 'c-space-doubts', kind: 'doubt', name: 'Doubt Clearance', description: 'Ask any medical concept doubt. Explain it to others — teaching is the best revision.', subjectCode: '' },
    { id: 'c-space-pyq', kind: 'pyq', name: 'PYQ Discussions', description: 'Previous-year question threads: why each option is right or wrong, repeating patterns.', subjectCode: '' },
    { id: 'c-space-cases', kind: 'case', name: 'Clinical Case Discussions', description: 'Walk through clinical presentations step by step. De-identified educational cases only.', subjectCode: '' },
    { id: 'c-space-revision', kind: 'revision', name: 'Revision Circle', description: 'Revision techniques, spaced-repetition accountability, group recall sessions.', subjectCode: '' },
  ]
  const subjects = await db.subject.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } })
  const subjectSpaces = subjects.map((s) => ({
    id: `c-space-subj-${s.id}`,
    kind: 'subject',
    name: `${s.name} Community`,
    description: `Subject-wise discussions, doubts and high-yield pearls for ${s.name}.`,
    subjectCode: s.code,
  }))
  await db.communitySpace.createMany({ data: [...coreSpaces, ...subjectSpaces].map((s) => ({ ...s, rules: [] })) })
  console.log(`spaces: ${coreSpaces.length + subjectSpaces.length}`)

  // ── demo peers (clearly-labelled seeded members) ──
  const peers = [
    { id: 'm-aarav', handle: 'aarav-s', name: 'Aarav S.', year: 4, bio: 'Final year. Obsessed with cardiology MCQs and ECG patterns.' },
    { id: 'm-meera', handle: 'meera-k', name: 'Meera K.', year: 3, bio: 'Pathology lover. Nephropathology nerd. Ask me glomerular stuff.' },
    { id: 'm-rohan', handle: 'rohan-p', name: 'Rohan P.', year: 5, bio: 'Intern. NEET-PG dedicated. Pharmacology revision evangelist.' },
    { id: 'm-sanya', handle: 'sanya-t', name: 'Sanya T.', year: 3, bio: 'Physiology first-principles believer. S3/S4 whisperer.' },
    { id: 'm-kabir', handle: 'kabir-m', name: 'Kabir M.', year: 4, bio: 'Surgery shelf topper. Lap-sim addict. Appendicitis case hoarder.' },
    { id: 'm-ishita', handle: 'ishita-r', name: 'Ishita R.', year: 3, bio: 'Microbiology. TB diagnostics. GeneXpert sceptic-turned-fan.' },
    { id: 'm-dev', handle: 'dev-n', name: 'Dev N.', year: 6, bio: 'Dedicated prep. 2nd attempt. Here to share what actually worked.' },
    { id: 'm-tara', handle: 'tara-b', name: 'Tara B.', year: 3, bio: 'FMGE aspirant. systems-based revision + PYQ loops.' },
    { id: 'm-vikram', handle: 'vikram-j', name: 'Vikram J.', year: 4, bio: 'Radiology eye. CXR ABCDE systematic reader.' },
    { id: 'm-nikita', handle: 'nikita-d', name: 'Nikita D.', year: 3, bio: 'Anatomy mnemonics factory. Brachial plexus survivor.' },
    { id: 'm-arjun', handle: 'arjun-h', name: 'Arjun H.', year: 5, bio: 'Intern. Medicine wards by day, AKI differentials by night.' },
    { id: 'm-priya', handle: 'priya-v', name: 'Priya V.', year: 4, bio: 'Haematology graph-reader. Iron studies simplified.' },
  ]
  await db.communityMember.createMany({ data: peers.map((p) => ({ id: p.id, handle: p.handle, name: p.name, year: p.year, bio: p.bio, seeded: true })) })
  console.log(`peers: ${peers.length}`)

  // ── pick 2 real platform questions to anchor MCQ/PYQ threads ──
  const medQuestions = await db.question.findMany({
    where: { subjectCode: 'MED' },
    select: { id: true, stem: true },
    take: 2,
  })
  const qRef1 = medQuestions[0]?.id ?? ''
  const qRef2 = medQuestions[1]?.id ?? ''

  // ── posts (grounded in real curriculum topics) ──
  type P = { id: string; author: string; spaceId: string; kind: string; title: string; body: string; tags: string[]; subjectCode?: string; topicId?: string; questionRef?: string; upvotes: number; views: number; resolved?: boolean; answeredReplyId?: string; at: Date }
  const posts: P[] = [
    {
      id: 'p-glom-edema', author: 'm-meera', spaceId: 'c-space-doubts', kind: 'question',
      title: 'Why does nephrotic syndrome cause generalised edema but nephritic usually doesn\u2019t?',
      body: 'Both involve glomerular injury, so why does the nephritic syndrome stay relatively "dry" while nephrotic patients blow up? I understand proteinuria is heavier in nephrotic, but I keep mixing up the exact mechanism — is it just albumin loss or is there more to it (Na+ retention etc.)?',
      tags: ['nephrology', 'pathology', 'high-yield'], subjectCode: 'PATHO', topicId: 't-patho-glomerular', upvotes: 18, views: 240, resolved: true, at: daysAgo(6),
    },
    {
      id: 'p-htn-pyq', author: 'm-rohan', spaceId: 'c-space-pyq', kind: 'pyq',
      title: 'PYQ trap: most common cause of secondary hypertension in a young, thin female',
      body: 'Repeated PYQ pattern. Options usually include polycystic kidney disease, fibromuscular dysplasia, pheochromocytoma, Conn syndrome, coarctation. The exam wants fibromuscular dysplasia here — young thin female + resistant hypertension + renal bruit. Polycystic is the classic in someone with family history + palpable kidneys + hematuria. Discuss other traps you\u2019ve seen around secondary HTN workup.',
      tags: ['pyq', 'hypertension', 'medicine'], subjectCode: 'MED', topicId: 't-med-htn', questionRef: qRef1, upvotes: 12, views: 180, resolved: true, at: daysAgo(4),
    },
    {
      id: 'p-ecg-equivalents', author: 'm-aarav', spaceId: 'c-space-neetpg', kind: 'mcq',
      title: 'Rapid review: ST-elevation equivalents the exam loves',
      body: 'Sharing my high-yield list before tomorrow\u2019s mock: new LBBB, De Winter T waves, Wellens syndrome, posterior MI (ST depression V1-V3 with tall R), and RV infarct patterns. Add what I\u2019ve missed — and debate: is De Winter an "occluding lesion" pattern or a "stubborn" one? Why does it matter clinically?',
      tags: ['ecg', 'cardiology', 'rapid-review'], subjectCode: 'MED', topicId: 't-med-acs', questionRef: qRef2, upvotes: 22, views: 310, at: daysAgo(0, 2),
    },
    {
      id: 'p-case-chestpain', author: 'm-aarav', spaceId: 'c-space-cases', kind: 'case',
      title: 'Case walk-through: 58M, crushing chest pain 40 minutes — your first 10 minutes?',
      body: 'De-identified teaching case. 58-year-old male, smoker, presents with 40 minutes of crushing retrosternal pain radiating to left arm, sweating. Vitals: BP 148/92, HR 96, SpO2 96% RA. Walk me through your first 10 minutes: immediate management, ECG expectations, and the one drug you hold until you\u2019ve seen the ECG. De-identified educational discussion only.',
      tags: ['case', 'acs', 'emergency'], subjectCode: 'MED', topicId: 't-med-acs', upvotes: 15, views: 205, at: daysAgo(1),
    },
    {
      id: 'p-s3-s4', author: 'm-sanya', spaceId: 'c-space-subj-physiology', kind: 'question',
      title: 'Why is S3 associated with volume overload but S4 with a stiff ventricle?',
      body: 'Both are diastolic sounds, both mean something is wrong with filling — so why does one point to dilatation/volume overload and the other to hypertrophy/decreased compliance? I want the first-principles answer, not just associations.',
      tags: ['physiology', 'heart-sounds', 'first-principles'], subjectCode: 'PHYS', topicId: 't-phys-cardcycle', upvotes: 9, views: 120, at: daysAgo(2),
    },
    {
      id: 'p-rev-method', author: 'm-dev', spaceId: 'c-space-revision', kind: 'discussion',
      title: 'The revision loop that finally stuck for me (2nd attempt lessons)',
      body: 'Failed my first attempt by 12 marks. What changed: 40 new + 60 review flashcards daily, one full mock every 10 days, and an error-log I actually re-read weekly. The magic wasn\u2019t volume — it was never letting a mistake escape the log. Sharing my weekly template here; steal it and tell me what you\u2019d change.',
      tags: ['strategy', 'revision', 'retake'], subjectCode: '', upvotes: 31, views: 420, at: daysAgo(3),
    },
    {
      id: 'p-spirono-k', author: 'm-rohan', spaceId: 'c-space-subj-pharmacology', kind: 'question',
      title: 'Why does spironolactone spare potassium while loop diuretics waste it?',
      body: 'Both act "before" the collecting duct in some sense, so why does one spare K+ and the other dump it? Loop diuretics increase distal Na+ delivery — I get that part. What I want nailed is the aldosterone-independent vs aldosterone-dependent piece and where amiloride fits in this picture.',
      tags: ['pharmacology', 'diuretics', 'potassium'], subjectCode: 'PHARM', topicId: 't-pharm-diuretics', upvotes: 11, views: 150, at: daysAgo(2, 6),
    },
    {
      id: 'p-pyq-cataract', author: 'm-tara', spaceId: 'c-space-pyq', kind: 'pyq',
      title: 'PYQ: "Morgagnian cataract — what liquefies and what sinks?"',
      body: 'Hypermature cataract question keeps repeating with small twists. Core facts: cortex liquefies, the dense nucleus sinks inferiorly (Morgagnian globule). The distractor they love is the opposite direction. Post every variant of this question you\u2019ve seen — let\u2019s build one bulletproof card out of it.',
      tags: ['pyq', 'ophthalmology'], subjectCode: 'OPHT', upvotes: 7, views: 95, at: daysAgo(5),
    },
    {
      id: 'p-brachial', author: 'm-nikita', spaceId: 'c-space-subj-anatomy', kind: 'question',
      title: 'Systematic approach to brachial plexus injuries in exams?',
      body: 'Erb vs Klumpke is easy, but exam stems love intermediate lesions — "wrist drop with sensory loss over first dorsal web space" type. Can someone share a step-by-step root → trunk → cord → branch mapping method that survives under exam pressure?',
      tags: ['anatomy', 'brachial-plexus', 'exam-technique'], subjectCode: 'ANAT', topicId: 't-anat-brachial', upvotes: 13, views: 170, resolved: true, at: daysAgo(7),
    },
    {
      id: 'p-6mo-plan', author: 'm-dev', spaceId: 'c-space-neetpg', kind: 'discussion',
      title: '6 months out: how I rebuilt my schedule around measured weaknesses',
      body: 'Instead of subject-by-subject grinding, I built my day around what my error log said: every weak-concept block gets a learn → 10 MCQs → mistake retest → revision-entry loop. 90 minutes of targeted work beat 4 hours of passive lectures. What does your weak-area loop look like?',
      tags: ['strategy', 'planning'], subjectCode: '', upvotes: 19, views: 260, at: daysAgo(1, 8),
    },
    {
      id: 'p-hrs-aki', author: 'm-arjun', spaceId: 'c-space-subj-medicine', kind: 'question',
      title: 'Hepatorenal syndrome vs pre-renal AKI — does a fluid challenge always separate them?',
      body: 'Ward teaching says: pre-renal improves with fluids, HRS doesn\u2019t. But how much fluid, over how long, and what about the dilutional hyponatremia picture? Also — where does albumin + vasoconstrictor therapy change the answer? Exam wants the simplified version, wards want the real one. Discuss both.',
      tags: ['nephrology', 'hepatology', 'aki'], subjectCode: 'MED', topicId: 't-med-aki', upvotes: 10, views: 130, at: daysAgo(0, 5),
    },
    {
      id: 'p-case-appendix', author: 'm-kabir', spaceId: 'c-space-cases', kind: 'case',
      title: 'Case: 8F, colicky periumbilical pain → RIF. Alvarado scoring discussion.',
      body: 'De-identified teaching case. 8-year-old female, 24h colicky periumbilical pain now localised to RIF, anorexia, low-grade fever 37.8, tenderness at McBurney point, rebound positive. Walk through: Alvarado score components, imaging decision in children (USG first?), and when surgery beats observation. Educational discussion only — no identifiers.',
      tags: ['case', 'pediatric-surgery', 'alvarado'], subjectCode: 'SURG', topicId: 't-surg-appendix', upvotes: 14, views: 190, at: daysAgo(4, 4),
    },
    {
      id: 'p-cxr-system', author: 'm-vikram', spaceId: 'c-space-doubts', kind: 'discussion',
      title: 'My 7-step systematic chest X-ray read (ABCDE-R) — critique it',
      body: 'Airway → Bones → Cardiac silhouette → Diaphragm → Everything else (lung fields, fissures) → Review soft tissues + devices. The "R" is a deliberate second look at lung apices and behind the heart — the two hiding spots. Tear it apart and tell me what YOUR system catches that mine misses.',
      tags: ['radiology', 'cxr', 'systematic-reading'], subjectCode: 'RAD', topicId: 't-rad-chestxray', upvotes: 17, views: 220, at: daysAgo(3, 2),
    },
    {
      id: 'p-tb-culture', author: 'm-ishita', spaceId: 'c-space-subj-microbiology', kind: 'question',
      title: 'Why is culture still the TB gold standard when GeneXpert is faster?',
      body: 'GeneXpert detects DNA in 2 hours, culture takes weeks — so why does culture keep the gold-standard crown? I know it\u2019s about viability + drug-sensitivity panels, but I want the full picture: sensitivity/specificity numbers, where Xpert misses (paucibacillary? extrapulmonary?), and what "gold standard" actually means for treatment decisions.',
      tags: ['microbiology', 'tb', 'diagnostics'], subjectCode: 'MICRO', topicId: 't-micro-tb', upvotes: 12, views: 160, at: daysAgo(2, 10),
    },
    {
      id: 'p-fmge-90', author: 'm-tara', spaceId: 'c-space-fmge', kind: 'discussion',
      title: 'FMGE in 90 days — the subject order that worked for me',
      body: 'Phase 1 (days 1-30): Micro + PSM + Pharma (the "big three" scorers). Phase 2 (31-60): Patho, Medicine, Surgery, OBGY interleaved — one theory + one clinical subject daily. Phase 3 (61-90): PYQ loops + weak-area repair only. Non-negotiables: 2 image-based questions daily and a weekly 150-question grand test. What would you reorder?',
      tags: ['fmge', 'strategy', '90-days'], subjectCode: '', upvotes: 16, views: 210, at: daysAgo(5, 6),
    },
    {
      id: 'p-id-microcytosis', author: 'm-priya', spaceId: 'c-space-subj-pathology', kind: 'question',
      title: 'Why does iron deficiency show microcytosis BEFORE anemia?',
      body: 'Sequence question that keeps tripping people: storage iron falls → serum iron falls → TIBC rises → microcytosis appears → THEN hemoglobin falls. Why does the red cell index change before the hemoglobin? And where exactly does RDW start rising in this sequence?',
      tags: ['hematology', 'iron-deficiency', 'sequence'], subjectCode: 'PATHO', topicId: 't-patho-hemapath', upvotes: 8, views: 110, at: daysAgo(0, 9),
    },
  ]
  for (const p of posts) {
    await db.communityPost.create({
      data: {
        id: p.id, profileId: '', authorMemberId: p.author, spaceId: p.spaceId, groupId: '',
        kind: p.kind, title: p.title, body: p.body, tags: p.tags,
        subjectCode: p.subjectCode ?? '', topicId: p.topicId ?? '', questionRef: p.questionRef ?? '',
        upvotes: p.upvotes, views: p.views, resolved: p.resolved ?? false,
        answeredReplyId: p.answeredReplyId ?? '', status: 'open', flagged: '', createdAt: p.at, updatedAt: p.at,
      },
    })
  }
  console.log(`posts: ${posts.length}`)

  // ── replies ──
  type R = { id: string; postId: string; author: string; body: string; upvotes: number; isAnswer?: boolean; at: Date }
  const replies: R[] = [
    { id: 'r-glom-1', postId: 'p-glom-edema', author: 'm-sanya', body: 'Two mechanisms stack: (1) massive proteinuria drops oncotic pressure so fluid leaks interstitially, (2) the hypovolemia-triggered RAAS + aldosterone axis makes kidneys retain Na+ — so it\u2019s not just "leaky vessels", the kidney actively holds salt. Nephritic damage is more inflammatory/proliferative — GFR drops faster, so less filtered load overall, and protein loss is milder.', upvotes: 24, at: daysAgo(6, -2) },
    { id: 'r-glom-2', postId: 'p-glom-edema', author: 'm-meera', body: 'Adding the exam pearl: nephrotic edema is periorbital-first in the morning (gravity-free overnight), cardiac edema is ankle-first. Also remember hyperlipidemia from hypoalbuminemia-driven hepatic lipoprotein synthesis.', upvotes: 15, at: daysAgo(6, -4) },
    { id: 'r-glom-3', postId: 'p-glom-edema', author: 'm-arjun', body: 'Wards perspective: check urine protein:creatinine ratio >3.5 g/day anchors nephrotic range. But careful — minimal change disease in kids can be nephrotic with seemingly bland sediment.', upvotes: 9, at: daysAgo(5, -2) },
    { id: 'r-htn-1', postId: 'p-htn-pyq', author: 'm-aarav', body: 'The age/sex matrix solves most secondary-HTN PYQs: young thin female + bruit → FMD; obese + striae + glucose → Cushing; episodic headache-sweat-palpitations triad → pheo; hypokalemia + weakness → Conn; family history + palpable kidneys → PKD. Coarctation → upper>lower BP gradient in a child.', upvotes: 21, isAnswer: true, at: daysAgo(4, -3) },
    { id: 'r-htn-2', postId: 'p-htn-pyq', author: 'm-rohan', body: 'Another repeating trap: renovascular hypertension in ELDERLY smokers = atherosclerotic RAS, not FMD. Same organ, opposite demographic.', upvotes: 8, at: daysAgo(3, -6) },
    { id: 'r-ecg-1', postId: 'p-ecg-equivalents', author: 'm-arjun', body: 'De Winter = proximal LAD occlusion pattern — ST depression + peaked T in V1-V3, not a "stubborn" NSTEMI. It changes the conversation to the cath lab, exactly like STEMI.', upvotes: 13, at: daysAgo(0, 1) },
    { id: 'r-ecg-2', postId: 'p-ecg-equivalents', author: 'm-priya', body: 'Add: wellens type A (biphasic) vs type B (deep inverted) V2-V3 — both critical LAD stenosis. And remember posterolateral MI: tall R + upright T in V1 — the "mirror image" trap.', upvotes: 10, at: daysAgo(0, 0.5) },
    { id: 'r-s3-1', postId: 'p-s3-s4', author: 'm-aarav', body: 'S3 = rapid passive filling phase hitting a dilated ventricle — the walls are already stretched, so the sudden rush of blood reverberates (volume overload state). S4 = atrial contraction slamming into a STIFF, non-compliant ventricle — you only hear it in sinus rhythm, and it\u2019s the sound of pressure overload/hypertrophy/ischemia fighting back.', upvotes: 12, at: daysAgo(2, -4) },
    { id: 'r-spiro-1', postId: 'p-spirono-k', author: 'm-arjun', body: 'Loops: block Na-K-2Cl in thick ascending limb → more Na+ reaches the collecting duct → ENaC-driven K+ secretion amplified (aldosterone-dependent wasting) + flow diuresis. Spironolactone: aldosterone receptor blockade at the collecting duct itself → K+ secretion never gets switched on → sparing. Amiloride does the same downstream of the receptor, blocking ENaC directly.', upvotes: 17, isAnswer: true, at: daysAgo(2, -6) },
    { id: 'r-brachial-1', postId: 'p-brachial', author: 'm-nikita', body: 'My 4-step: (1) sensory level + motor deficit → localise to root/trunk/cord/branch, (2) "where do the two famous cords live" — lateral cord → musculocutaneous, posterior → radial+axillary, medial → ulnar, (3) match the deficit pattern, (4) name the classic lesion. Radial + first dorsal web = posterior cord/radial nerve. It compresses 80% of stems into 4 moves.', upvotes: 19, isAnswer: true, at: daysAgo(7, -5) },
    { id: 'r-brachial-2', postId: 'p-brachial', author: 'm-vikram', body: 'Exam technique addition: if the stem mentions "claw hand + sensory loss medial forearm + T1" — think Klumpke BEFORE lower trunk, because the exam wants the C8-T1 → intrinsic hand muscles chain spelled out.', upvotes: 7, at: daysAgo(6, -3) },
    { id: 'r-hrs-1', postId: 'p-hrs-aki', author: 'm-meera', body: 'Fluid challenge rule of thumb: albumin 1g/kg over 48h — no improvement + excluded other causes → HRS territory. The differentiator is really the vasodilated splanchnic circulation + low effective arterial volume despite TOTAL volume overload. Terlipressin + albumin targets the mechanism, not just numbers.', upvotes: 11, at: daysAgo(0, -2) },
    { id: 'r-appendix-1', postId: 'p-case-appendix', author: 'm-kabir', body: 'Alvarado here: migration(1) + anorexia(1) + RIF(2) + rebound(1) + fever(1) = 6 → equivocal-to-likely. In children USG first (radiation stewardship), CT reserved for equivocal USG with high suspicion. Score ≥7 → surgical consult before imaging delays you.', upvotes: 14, at: daysAgo(4, -8) },
    { id: 'r-cxr-1', postId: 'p-cxr-system', author: 'm-vikram', body: 'Solid system. My addition: the "hidden areas" pass should include the costophrenic angles and the hila — small effusions blunt angles first, and hilar enlargement is missed when you read the lung fields mid-zone only.', upvotes: 9, at: daysAgo(3, -1) },
    { id: 'r-tb-1', postId: 'p-tb-culture', author: 'm-ishita', body: 'Culture keeps the crown for three reasons: (1) it proves VIABLE bacilli, DNA ≠ alive, (2) sensitivity panels ( LJ medium + MGIT) guide MDR/XDR regimens, (3) sensitivity near 100% vs Xpert\u2019s ~90% smear+ / lower in paucibacillary + extrapulmonary. Xpert = rapid triage + rifampicin resistance; culture = definitive + DST.', upvotes: 16, isAnswer: true, at: daysAgo(2, -12) },
    { id: 'r-fmge-1', postId: 'p-fmge-90', author: 'm-tara', body: 'Would add: don\u2019t leave Biochem for "later" — the image bank (gels, cycles, deficiency pictures) is a free 10-15 marks. And FMGE repeats pharma classifications heavily — tables beat paragraphs.', upvotes: 10, at: daysAgo(5, -7) },
    { id: 'r-rev-1', postId: 'p-rev-method', author: 'm-dev', body: 'The error-log re-read is the actual unlock: Sunday 30 min, only mistakes, no new content. Second attempt passed with 42 marks to spare. The log IS the syllabus.', upvotes: 22, at: daysAgo(3, -9) },
    { id: 'r-id-1', postId: 'p-id-microcytosis', author: 'm-priya', body: 'Because the marrow keeps making cells from falling serum iron before the TOTAL hemoglobin mass drops — each new cell is smaller (low MCHC/MCV) but the count of cells hasn\u2019t fallen yet. RDW rises once the marrow mixes normal-sized old population with newly microcytic cells (anisocytosis) — early transition marker.', upvotes: 13, at: daysAgo(0, -5) },
  ]
  for (const r of replies) {
    await db.communityReply.create({
      data: {
        id: r.id, postId: r.postId, profileId: '', authorMemberId: r.author, body: r.body,
        upvotes: r.upvotes, isAnswer: r.isAnswer ?? false, aiAssisted: false, status: 'open', createdAt: r.at,
      },
    })
  }
  // sync reply counts + answered ids
  for (const p of posts) {
    const n = replies.filter((r) => r.postId === p.id).length
    const answer = replies.find((r) => r.postId === p.id && r.isAnswer)
    await db.communityPost.update({
      where: { id: p.id },
      data: { replyCount: n, resolved: !!(p.resolved && answer), answeredReplyId: p.resolved && answer ? answer.id : '' },
    })
  }
  console.log(`replies: ${replies.length}`)

  // ── study groups + memberships + challenges ──
  await db.studyGroup.create({
    data: {
      id: 'g-pharm-revision', slug: 'pharmacology-revision-circle', name: 'Pharmacology Revision Circle',
      description: 'Daily pharmacology revision: one drug-class block + 20 MCQs. Cardio → Antibiotics → CNS in 3 weeks.',
      privacy: 'public', focusKind: 'subject', focusRef: 'PHARM',
      goalText: 'Finish Cardiovascular + Antibiotics revision this month; CNS next.',
      meetCadence: 'Daily 7pm — 20 MCQ challenge + 10-min recall huddle',
      plan: JSON.stringify([
        { id: 'gp-1', line: 'Week 1: Cardiovascular Drugs — diuretics → antianginals → antihypertensives', addedBy: 'Rohan P.', at: daysAgo(6).toISOString() },
        { id: 'gp-2', line: 'Week 2: Antibiotics — cell-wall → protein-synthesis → antifungals', addedBy: 'Aarav S.', at: daysAgo(5).toISOString() },
        { id: 'gp-3', line: 'Week 3: CNS + Autonomics grand review + 50-Q subject test', addedBy: 'Rohan P.', at: daysAgo(4).toISOString() },
      ]),
      ownerMemberId: 'm-rohan', seeded: true, status: 'open', createdAt: daysAgo(10),
    },
  })
  await db.studyGroup.create({
    data: {
      id: 'g-neetpg-daily', slug: 'neetpg-daily-50', name: 'NEET-PG Daily 50',
      description: 'Non-negotiable: 50 MCQs every day, any subject mix. Streak culture — but rest days are allowed (recovery is strategy, not weakness).',
      privacy: 'public', focusKind: 'exam', focusRef: 'NEET-PG',
      goalText: 'Daily 50 MCQs, error-log re-read every Sunday.',
      meetCadence: 'Daily, async — post your count in the group thread',
      plan: JSON.stringify([
        { id: 'gp-4', line: 'Every day: 50 MCQs + log every wrong answer with one-line reason', addedBy: 'Dev N.', at: daysAgo(8).toISOString() },
        { id: 'gp-5', line: 'Sunday: error-log re-read + 1 weak-concept deep dive', addedBy: 'Dev N.', at: daysAgo(8).toISOString() },
      ]),
      ownerMemberId: 'm-dev', seeded: true, status: 'open', createdAt: daysAgo(14),
    },
  })
  await db.studyGroup.create({
    data: {
      id: 'g-anatomy-squad', slug: 'anatomy-high-yield-squad', name: 'Anatomy High-Yield Squad',
      description: 'Brachial plexus to diaphragm openings — image-based anatomy drills + mnemonic exchange.',
      privacy: 'public', focusKind: 'subject', focusRef: 'ANAT',
      goalText: 'One region per week with image-based recall on Fridays.',
      meetCadence: 'Fri 8pm — image-based recall session',
      plan: JSON.stringify([
        { id: 'gp-6', line: 'This week: upper limb — brachial plexus lesions drill', addedBy: 'Nikita D.', at: daysAgo(4).toISOString() },
        { id: 'gp-7', line: 'Next week: thorax — diaphragm openings + coronaries', addedBy: 'Nikita D.', at: daysAgo(4).toISOString() },
      ]),
      ownerMemberId: 'm-nikita', seeded: true, status: 'open', createdAt: daysAgo(9),
    },
  })
  await db.studyGroup.create({
    data: {
      id: 'g-fmge-bootcamp', slug: 'fmge-90-day-bootcamp', name: 'FMGE 90-Day Bootcamp',
      description: 'Structured 90-day sprint: big-three first, then clinicals, PYQ loops in the last month. Weekly grand test.',
      privacy: 'public', focusKind: 'exam', focusRef: 'FMGE',
      goalText: '2 full mocks per week + big-three revision before day 60.',
      meetCadence: 'Sun 10am — weekly grand test + review',
      plan: JSON.stringify([
        { id: 'gp-8', line: 'Days 1-30: Micro + PSM + Pharma (the big three)', addedBy: 'Tara B.', at: daysAgo(7).toISOString() },
        { id: 'gp-9', line: 'Every Saturday: 150-question grand test', addedBy: 'Tara B.', at: daysAgo(7).toISOString() },
      ]),
      ownerMemberId: 'm-tara', seeded: true, status: 'open', createdAt: daysAgo(12),
    },
  })
  await db.studyGroup.create({
    data: {
      id: 'g-cardio-club', slug: 'cardio-clinical-case-club', name: 'Cardio Clinical Case Club',
      description: 'Private circle: de-identified cardiology case walk-throughs, EGC-to-cath-lab reasoning, ACS management debates.',
      privacy: 'private', focusKind: 'mixed', focusRef: 'cardiology',
      goalText: 'Two case walk-throughs weekly; everyone presents once a month.',
      meetCadence: 'Wed 9pm — case presentation',
      plan: JSON.stringify([
        { id: 'gp-10', line: 'This week: ACS risk stratification walk-through', addedBy: 'Aarav S.', at: daysAgo(3).toISOString() },
      ]),
      ownerMemberId: 'm-aarav', seeded: true, status: 'open', createdAt: daysAgo(11),
    },
  })
  const memberships: { groupId: string; actorKey: string; role: string }[] = [
    { groupId: 'g-pharm-revision', actorKey: 'm-rohan', role: 'owner' },
    { groupId: 'g-pharm-revision', actorKey: 'm-aarav', role: 'member' },
    { groupId: 'g-pharm-revision', actorKey: 'm-arjun', role: 'member' },
    { groupId: 'g-pharm-revision', actorKey: 'm-meera', role: 'member' },
    { groupId: 'g-neetpg-daily', actorKey: 'm-dev', role: 'owner' },
    { groupId: 'g-neetpg-daily', actorKey: 'm-rohan', role: 'member' },
    { groupId: 'g-neetpg-daily', actorKey: 'm-tara', role: 'member' },
    { groupId: 'g-neetpg-daily', actorKey: 'm-sanya', role: 'member' },
    { groupId: 'g-neetpg-daily', actorKey: 'm-priya', role: 'member' },
    { groupId: 'g-anatomy-squad', actorKey: 'm-nikita', role: 'owner' },
    { groupId: 'g-anatomy-squad', actorKey: 'm-kabir', role: 'member' },
    { groupId: 'g-anatomy-squad', actorKey: 'm-vikram', role: 'member' },
    { groupId: 'g-fmge-bootcamp', actorKey: 'm-tara', role: 'owner' },
    { groupId: 'g-fmge-bootcamp', actorKey: 'm-ishita', role: 'member' },
    { groupId: 'g-fmge-bootcamp', actorKey: 'm-dev', role: 'member' },
    { groupId: 'g-cardio-club', actorKey: 'm-aarav', role: 'owner' },
    { groupId: 'g-cardio-club', actorKey: 'm-arjun', role: 'member' },
    { groupId: 'g-cardio-club', actorKey: 'm-sanya', role: 'member' },
  ]
  await db.groupMembership.createMany({ data: memberships.map((m) => ({ ...m, profileId: '', shareData: false })) })
  console.log(`memberships: ${memberships.length}`)

  const challenges = [
    {
      id: 'gc-pharm-daily', groupId: 'g-pharm-revision', kind: 'mcq', title: 'Daily 20 pharmacology MCQs',
      detail: 'Any 20 platform pharmacology questions per day. Wrong answers go to the error log — the group reviews the 3 hardest every Friday.',
      target: 20, unit: 'mcqs', dueAt: null, status: 'active',
      progress: [
        { actorKey: 'm-rohan', label: 'Rohan P.', count: 18, at: daysAgo(0, 3).toISOString() },
        { actorKey: 'm-aarav', label: 'Aarav S.', count: 20, at: daysAgo(0, 6).toISOString() },
        { actorKey: 'm-arjun', label: 'Arjun H.', count: 11, at: daysAgo(0, 8).toISOString() },
      ],
    },
    {
      id: 'gc-daily-50', groupId: 'g-neetpg-daily', kind: 'mcq', title: 'The Daily 50',
      detail: '50 MCQs every day. Post your count in the thread. Sunday = error-log re-read instead of volume.',
      target: 50, unit: 'mcqs', dueAt: null, status: 'active',
      progress: [
        { actorKey: 'm-dev', label: 'Dev N.', count: 50, at: daysAgo(0, 4).toISOString() },
        { actorKey: 'm-tara', label: 'Tara B.', count: 34, at: daysAgo(0, 5).toISOString() },
        { actorKey: 'm-sanya', label: 'Sanya T.', count: 50, at: daysAgo(1).toISOString() },
      ],
    },
    {
      id: 'gc-anat-rev', groupId: 'g-anatomy-squad', kind: 'revision', title: 'Weekly 5 revision sessions',
      detail: 'Five revision blocks (15+ min) this week. Image-based Friday session counts double.',
      target: 5, unit: 'sessions', dueAt: daysAgo(-4), status: 'active',
      progress: [
        { actorKey: 'm-nikita', label: 'Nikita D.', count: 3, at: daysAgo(1).toISOString() },
        { actorKey: 'm-vikram', label: 'Vikram J.', count: 5, at: daysAgo(0, 7).toISOString() },
      ],
    },
    {
      id: 'gc-fmge-mock', groupId: 'g-fmge-bootcamp', kind: 'mock', title: 'Two mocks this week',
      detail: 'Two full grand tests before Sunday review. Review every wrong answer the same day — mocks without review are just guesses with extra steps.',
      target: 2, unit: 'mocks', dueAt: daysAgo(-5), status: 'active',
      progress: [
        { actorKey: 'm-tara', label: 'Tara B.', count: 1, at: daysAgo(1).toISOString() },
        { actorKey: 'm-ishita', label: 'Ishita R.', count: 0, at: daysAgo(1).toISOString() },
      ],
    },
  ]
  for (const c of challenges) {
    await db.groupChallenge.create({ data: { ...c, progress: c.progress, seeded: true } })
  }
  console.log(`challenges: ${challenges.length}`)

  // ── group-attached discussion seed (one post in the pharmacology circle) ──
  await db.communityPost.create({
    data: {
      id: 'p-group-pharm-week1', profileId: '', authorMemberId: 'm-rohan', spaceId: 'c-space-subj-pharmacology',
      groupId: 'g-pharm-revision', kind: 'discussion',
      title: 'Week 1 check-in: diuretics chain — post your one-line mechanism summary',
      body: 'Loop → thiazide → K-sparing, each with site + ion + one exam trap. Mine: "Loops waste Ca2+, thiazides hold it — that\u2019s why loops treat hypercalcemia and thiazides treat recurrent stones." Drop yours — best line goes into the shared plan.',
      tags: ['diuretics', 'week-1'], subjectCode: 'PHARM', topicId: 't-pharm-diuretics',
      upvotes: 6, views: 45, replyCount: 1, resolved: false, status: 'open', createdAt: daysAgo(1, 6), updatedAt: daysAgo(0, 9),
    },
  })
  await db.communityReply.create({
    data: {
      id: 'r-group-1', postId: 'p-group-pharm-week1', profileId: '', authorMemberId: 'm-aarav',
      body: 'Spironolactone treats the aldosterone escape, amiloride treats the channel — same K+ sparing, different villain.',
      upvotes: 8, isAnswer: false, aiAssisted: false, status: 'open', createdAt: daysAgo(0, 9),
    },
  })
  console.log('group discussion: 1 post + 1 reply')

  console.log('community seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
