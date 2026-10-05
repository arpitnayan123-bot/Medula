// ─── PRODUCT 09 · CLINICAL CASE SIMULATOR — curated case library (pack A) ────
// All content ORIGINAL educational material written for this platform.
// The `brief` is the hidden answer key — it NEVER leaves the server raw.
// Interaction kinds: explore (multi-select gather → findings), key (identify
// the single most important finding), choice (single-select decision),
// multi (differential shortlist / management bundle).
// Option verdicts: correct | acceptable | wrong | harmful. Explore options
// carry key:true (essential) and findings. Feedback explains every option.

export interface SimBriefOption {
  id: string
  label: string
  verdict?: 'correct' | 'acceptable' | 'wrong' | 'harmful'
  why?: string
  finding?: string // explore: revealed when pursued
  key?: boolean // explore: essential item
  cost?: string // explore (investigations): display chip
}

export interface SimBriefInteraction {
  id: string
  kind: 'explore' | 'key' | 'choice' | 'multi'
  prompt: string
  instruction?: string
  maxSelect?: number
  imageKey?: string
  imageCaption?: string
  options: SimBriefOption[]
}

export interface SimBriefStage {
  id: string
  kind: 'patient' | 'history' | 'exam' | 'investigations' | 'differential' | 'diagnosis' | 'management' | 'followup'
  label: string
  intro: string[]
  interactions: SimBriefInteraction[]
}

export interface SimAiBrief {
  persona: string
  intro: string
  hidden: { ask: string; reveal: string }[]
  exam: { ask: string; reveal: string }[]
  investigations: { ask: string; result: string }[]
  style: string
}

export interface SimBrief {
  diagnosis: string
  learning: string[]
  conceptIds: string[]
  stages: SimBriefStage[]
  aiBrief?: SimAiBrief
}

export interface SimSeedCase {
  id: string
  title: string
  specialty: string
  system: string
  difficulty: 'beginner' | 'mbbs' | 'neetpg' | 'advanced'
  patient: { age: string; sex: string; occupation: string; complaint: string; scene: string }
  estimateMinutes: number
  imageKey?: string
  imageCaption?: string
  aiReady?: boolean
  brief: SimBrief
}

export const simCasesPackA: SimSeedCase[] = [
  // ═══════════════════════════════ 1 · MEDICINE ═══════════════════════════
  {
    id: 'sim-gi-bleed',
    title: 'The Watchman Who Vomited Blood',
    specialty: 'Medicine',
    system: 'gastrointestinal',
    difficulty: 'mbbs',
    estimateMinutes: 14,
    imageKey: 'endo-gastric-ulcer',
    imageCaption: 'Upper GI endoscopy — gastric ulcer with a visible vessel (educational image, platform-owned)',
    aiReady: true,
    patient: {
      age: '55', sex: 'Male', occupation: 'Security watchman',
      complaint: 'Vomited blood twice since morning; black sticky stools',
      scene: 'A colleague brings in a 55-year-old night watchman at 7 AM. He is pale and anxious, holding an emesis basin with dark coffee-ground vomit. "Two times I vomited blood, doctor — and my stool has been black and sticky like tar since yesterday."',
    },
    brief: {
      diagnosis: 'Acute upper GI bleed — bleeding peptic ulcer (NSAID-associated)',
      conceptIds: ['c-ulcer', 'c-hpylori', 'c-shock'],
      learning: [
        'Hematemesis + melaena = upper GI bleed until endoscopy proves otherwise; urea rises out of proportion to creatinine because blood is digested protein.',
        'Resuscitation (two large-bore IVs, crystalloids) comes BEFORE any endoscopy; restrictive transfusion threshold is Hb 7 g/dL.',
        'IV PPI after endoscopic haemostasis; pre-endoscopy IV erythromycin improves the endoscopic view.',
        'NSAID-associated bleeds need H. pylori testing + eradication confirmation, and a long-term PPI if NSAIDs must continue.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '55-year-old man · night watchman · brought by a colleague at 7 AM.',
            'Chief complaint: two episodes of vomiting blood since morning; black tarry stools since yesterday.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'You have a few minutes before he is shifted to the resus bay. What do you want to know?',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR pieces of history will shape your differential and immediate risk right now?',
              instruction: 'You cannot ask everything — prioritise.',
              options: [
                { id: 'hx1', label: 'Pain — site, relation to meals, nocturnal pattern', key: true, finding: 'Burning epigastric pain for 3 months, often at 2 AM, briefly relieved by food and antacids — classic duodenal-type ulcer history.' },
                { id: 'hx2', label: 'Painkiller / NSAID use', key: true, finding: 'Takes diclofenac tablets daily for knee pain bought over the counter — for nearly a year.' },
                { id: 'hx3', label: 'Alcohol and smoking', finding: 'Beer on weekends only; smokes 5 cigarettes a day — not the picture of portal hypertension or Mallory-Weiss from a retching bout.' },
                { id: 'hx4', label: 'Retching before the vomit', finding: 'No prolonged non-productive retching before bleeding — against a Mallory-Weiss tear.' },
                { id: 'hx5', label: 'Past ulcer, surgery or liver disease', finding: 'No known ulcers, no surgery, no jaundice or abdominal distension in the past.' },
                { id: 'hx6', label: 'Weight loss or appetite change', finding: 'Appetite slightly reduced from the pain, but no significant weight loss — malignancy less likely.' },
                { id: 'hx7', label: 'Any nosebleed, coughing of blood or gum bleeding', finding: 'None — the blood came from vomiting, not the airway.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single piece of history most changes your immediate management?',
              options: [
                { id: 'k1', label: 'Daily NSAID use', verdict: 'correct', why: 'A continuing NSAID keeps the ulcer bleeding and blocks platelet function. It must be stopped now, and it predicts H. pylori co-pathology — it changes drugs, endoscopic planning and discharge advice.' },
                { id: 'k2', label: 'Weekend beer', verdict: 'wrong', why: 'Relevant background, but it does not alter the next hour of resuscitation or endoscopy decisions.' },
                { id: 'k3', label: 'Mild appetite loss', verdict: 'wrong', why: 'Softens the suspicion of malignancy, but management of the active bleed is unchanged.' },
                { id: 'k4', label: 'Family history of ulcers', verdict: 'wrong', why: 'Of academic interest only in an active upper GI bleed.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'He is moved to the resus bay. Examine with the bleeding score in mind (volume lost, liver stigmata, source clues).',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination steps matter most in the first 10 minutes?',
              options: [
                { id: 'ex1', label: 'Vitals with postural BP check', key: true, finding: 'HR 112/min, BP 104/68 lying; standing HR climbs to 130 and BP drops 18 mmHg — roughly 15–20% volume lost (Glasgow-Blatchford relevant).' },
                { id: 'ex2', label: 'Conjunctiva, skin, peripheries', key: true, finding: 'Marked pallor, cool clammy peripheries, capillary refill 3 s — hypovolaemia confirmed.' },
                { id: 'ex3', label: 'Stigmata of chronic liver disease', key: true, finding: 'No spider naevi, palmar erythema, jaundice or ascites; liver not palpable — variceal bleed unlikely (pre-endoscopy score stays low).' },
                { id: 'ex4', label: 'Abdominal examination', finding: 'Mild epigastric tenderness, no guarding or rigidity, no hepatosplenomegaly — no free perforation signs.' },
                { id: 'ex5', label: 'JVP', finding: 'JVP not visible even at 45° — another marker of volume depletion.' },
                { id: 'ex6', label: 'Per-rectal examination', finding: 'Black, tarry, sticky stool on the glove — confirms melaena.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'IV access is secured and crystalloid is running. Choose your workup.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which investigations do you order NOW (pick four)?',
              instruction: 'Cost chips show urgency trade-offs. Remember: endoscopy is diagnosis AND treatment.',
              options: [
                { id: 'iv1', label: 'CBC', key: true, cost: '15 min', finding: 'Hb 8.9 g/dL, MCV 78 fL — anaemia consistent with chronic oozing plus acute loss.' },
                { id: 'iv2', label: 'Urea & creatinine', key: true, cost: '30 min', finding: 'Urea 62 mg/dL with creatinine 1.0 — urea raised out of proportion: a classic clue that the bleed is UPPER GI (digested blood).', verdict: undefined },
                { id: 'iv3', label: 'Blood group & crossmatch 2 units', key: true, cost: '45 min', finding: 'Group O positive; 2 units crossmatched and held — readiness to transfuse if Hb trends down.' },
                { id: 'iv4', label: 'Upper GI endoscopy', key: true, cost: 'definitive', finding: 'Scheduled once he is stabilised — see the next step.' },
                { id: 'iv5', label: 'LFT & coagulation profile', finding: 'LFT near-normal; PT/INR 1.1 — no coagulopathy to correct.' },
                { id: 'iv6', label: 'CT abdomen before endoscopy', verdict: 'harmful', why: 'CT does not stop an ulcer bleeding and delays the one test that diagnoses AND treats. Imaging-first is the classic fatal delay in upper GI bleeding.' },
                { id: 'iv7', label: 'Colonoscopy', verdict: 'wrong', why: 'Hematemesis localises the source proximal to the ligament of Treitz — the colon is not the question.' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              imageKey: 'endo-gastric-ulcer',
              imageCaption: 'Upper GI endoscopy — gastric ulcer with a visible vessel (educational image, platform-owned)',
              prompt: 'Endoscopy shows a 1.5 cm ulcer on the lesser curve with a pigmented spot and active oozing. What is your reading and action?',
              options: [
                { id: 'ip1', label: 'Actively bleeding peptic ulcer → endoscopic therapy NOW (adrenaline injection ± thermal coagulation)', verdict: 'correct', why: 'Active oozing with a visible vessel is high-risk stigmata (Forrest IIA/IIB): combination endoscopic haemostasis reduces rebleeding and surgery. IV PPI follows the procedure.' },
                { id: 'ip2', label: 'Clean-based ulcer → discharge home on oral PPI', verdict: 'wrong', why: 'Active oozing is NOT a clean base. Discharging now invites rebleed — he needs therapy, observation and Hb monitoring.' },
                { id: 'ip3', label: 'Variceal bleeding → start terlipressin and banding', verdict: 'wrong', why: 'The picture is an ulcer, not varices; no liver stigmata were found. Octreotide/terlipressin is for variceal bleeds.' },
                { id: 'ip4', label: 'Malignant ulcer → emergency gastrectomy', verdict: 'wrong', why: 'Malignancy needs biopsies and staging, not an unplanned emergency resection during an acute bleed.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'Before you commit, shortlist what you are actively excluding.',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you will actively consider (up to four).',
              instruction: 'Include the likely diagnosis and the dangerous mimics you must not miss.',
              options: [
                { id: 'd1', label: 'Peptic ulcer disease (duodenal/gastric)', verdict: 'correct', why: 'Nocturnal food-relieved epigastric pain + NSAIDs + melaena is the textbook ulcer-bleed triad.' },
                { id: 'd2', label: 'Oesophageal varices', verdict: 'acceptable', why: 'Must be considered in any upper GI bleed — but no liver stigmata and endoscopy settles it.' },
                { id: 'd3', label: 'Mallory-Weiss tear', verdict: 'acceptable', why: 'Classic cause after forceful retching; his vomit was blood from the start, no retching history — less likely.' },
                { id: 'd4', label: 'Upper GI malignancy', verdict: 'acceptable', why: 'Age >50 mandates biopsies of any ulcer at endoscopy, but the history favours benign disease.' },
                { id: 'd5', label: 'Haemorrhoids', verdict: 'wrong', why: 'Causes fresh red rectal bleeding, never hematemesis or melaena.' },
                { id: 'd6', label: 'Inflammatory bowel disease', verdict: 'wrong', why: 'Younger patients, bloody diarrhoea and colicky pain — not upper GI bleeding.' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Endoscopy has spoken. Commit to the diagnosis.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Most likely diagnosis?',
              options: [
                { id: 'dx1', label: 'Bleeding peptic ulcer (NSAID-associated)', verdict: 'correct', why: 'History + endoscopy + raised urea all converge. High-risk stigmata were treated endoscopically.' },
                { id: 'dx2', label: 'Variceal haemorrhage', verdict: 'wrong', why: 'No portal-hypertension stigmata; endoscopy showed an ulcer, not varices.' },
                { id: 'dx3', label: 'Mallory-Weiss syndrome', verdict: 'wrong', why: 'No precededing forceful retching; lesion seen at endoscopy is an ulcer.' },
                { id: 'dx4', label: 'Gastric carcinoma', verdict: 'wrong', why: 'Biopsies taken at endoscopy were negative; no weight-loss story.' },
                { id: 'dx5', label: 'Haemorrhagic gastritis alone', verdict: 'wrong', why: 'A discrete ulcer with a visible vessel was demonstrated — more than erosive gastritis.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'He is in the endoscopy recovery bay, endoscopic clips in place. Build the 24-hour plan.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL appropriate management steps (up to six).',
              instruction: 'Two are actively harmful — sequencing and drug choice matter.',
              options: [
                { id: 'm1', label: 'Two large-bore IV lines + crystalloid resuscitation', key: true, verdict: 'correct', why: 'First move in any significant GI bleed — before any drug or scope.' },
                { id: 'm2', label: 'Transfuse to target Hb ≥ 7 g/dL (restrictive strategy)', key: true, verdict: 'correct', why: 'Trial evidence: restrictive thresholds (7 g/dL) reduce rebleeding and mortality versus liberal transfusion.' },
                { id: 'm3', label: 'IV PPI (80 mg bolus + infusion) after endoscopic haemostasis', key: true, verdict: 'correct', why: 'High-dose PPI after successful endoscopic therapy reduces rebleeding from high-risk ulcers.' },
                { id: 'm4', label: 'Stop diclofenac permanently; counsel on NSAIDs', key: true, verdict: 'correct', why: 'The ulcer will not heal while its cause continues. Paracetamol for his knees.' },
                { id: 'm5', label: 'IV erythromycin 30–120 min before endoscopy', verdict: 'acceptable', why: 'A prokinetic clears blood from the stomach and improves endoscopic visualisation — guideline-supported.' },
                { id: 'm6', label: 'H. pylori testing now + eradication course, then confirm cure', verdict: 'acceptable', why: 'Rapid urease test at endoscopy (positive here) → eradication and a test-of-cure, because NSAID and H. pylori are additive risks.' },
                { id: 'm7', label: 'Immediate surgery before any endoscopic attempt', verdict: 'harmful', why: 'Surgery is a rescue for failed endoscopic haemostasis — going first multiplies morbidity.' },
                { id: 'm8', label: 'Continue low-dose diclofenac "since pain persists"', verdict: 'harmful', why: 'Re-bleeding risk rises sharply; his knee needs paracetamol/topical NSAIDs, not systemic ones.' },
                { id: 'm9', label: 'IV octreotide infusion', verdict: 'wrong', why: 'Useful for variceal bleeding only; no benefit in non-variceal ulcers.' },
              ],
            },
            {
              id: 'in-rx-pivotal', kind: 'choice',
              prompt: 'Rapid urease test from the ulcer biopsy is POSITIVE. What completes his cure?',
              options: [
                { id: 'rp1', label: 'Full H. pylori eradication regimen + stop NSAIDs + confirm eradication (urea breath test) after 4 weeks', verdict: 'correct', why: 'Eradication + NSAID withdrawal + PPI course is the only combination that durably prevents rebleeding; test-of-cure ensures success.' },
                { id: 'rp2', label: 'Lifelong double-dose PPI alone', verdict: 'wrong', why: 'Suppression without eradication leaves the reinfection/rebleed cycle running.' },
                { id: 'rp3', label: 'Antacids as needed for symptoms', verdict: 'wrong', why: 'Symptomatic patch-up does nothing for the underlying H. pylori infection.' },
                { id: 'rp4', label: 'Elective vagotomy referral', verdict: 'wrong', why: 'Historical surgery — eradication therapy has replaced it.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Day 2: he is stable, Hb 9.4 g/dL and rising, no further melaena.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'When can he eat and go home?',
              options: [
                { id: 'f1', label: 'Oral diet within 24 h of endoscopy; discharge once stable with no rebleeding and haemoglobin stable', verdict: 'correct', why: 'Early feeding after endoscopic haemostasis is safe; discharge criteria are haemodynamic stability, no fresh bleeding and a reliable follow-up plan.' },
                { id: 'f2', label: 'Keep NPO for 5 days', verdict: 'wrong', why: 'Prolonged fasting adds malnutrition and thrombosis risk with no benefit after successful haemostasis.' },
                { id: 'f3', label: 'Only after a second look endoscopy', verdict: 'wrong', why: 'Routine second-look endoscopy is not indicated in uncomplicated cases.' },
                { id: 'f4', label: 'Only after surgery clears him', verdict: 'wrong', why: 'No surgery was needed or planned.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'He asks: "Will the tablets for the germ really stop this from happening again?"',
              options: [
                { id: 'f5', label: 'Yes — eradication plus avoiding NSAIDs drops rebleeding risk dramatically', verdict: 'correct', why: 'H. pylori eradication + NSAID cessation is the strongest evidence-based prevention of recurrent ulcer bleeding.' },
                { id: 'f6', label: 'No — ulcers always come back regardless', verdict: 'wrong', why: 'Rebleeding risk falls to low single digits when the cause is removed — this is exactly why cure matters.' },
                { id: 'f7', label: 'Only surgery can prevent recurrence', verdict: 'wrong', why: 'Acid suppression + eradication has made elective ulcer surgery obsolete.' },
                { id: 'f8', label: 'He must avoid all future painkillers forever, including paracetamol', verdict: 'wrong', why: 'Paracetamol is safe; only NSAIDs/aspirin need avoidance or gastroprotection.' },
              ],
            },
          ],
        },
      ],
      aiBrief: {
        persona: '55-year-old male night watchman, frightened but cooperative, speaking simple Hindi-flavoured English, calls the doctor "doctor sahab". Currently pale and anxious in the emergency department.',
        intro: 'Doctor sahab… since morning I vomited blood two times. My stool is black, sticky like tar since yesterday. Please see me quickly.',
        hidden: [
          { ask: 'pain / abdominal pain / stomach pain', reveal: 'Burning pain here (points to epigastrium) for three months, doctor. Mostly at night around 2 o\'clock. If I eat something, it settles for a while.' },
          { ask: 'painkiller / NSAID / tablet for pain / diclofen', reveal: 'Yes doctor, for knee pain I take diclofenac tablets — daily, from the medical shop, for almost one year now.' },
          { ask: 'alcohol / drinking / beer', reveal: 'Only weekends, doctor. Two-three beers, that\'s all. No morning drinking.' },
          { ask: 'retching / vomit before blood / dry vomiting', reveal: 'No doctor, the first vomit itself was bloody — dark like coffee powder. No dry retching before that.' },
          { ask: 'past / ulcer / surgery / jaundice / liver', reveal: 'Never tested before. No operations. No yellow eyes, no stomach water swelling.' },
          { ask: 'weight / appetite', reveal: 'Appetite is a little less from the burning pain, but weight is almost the same.' },
          { ask: 'nose / cough blood / gum', reveal: 'No nosebleed, no coughing blood, no gum bleeding. The blood came up from the stomach only.' },
        ],
        exam: [
          { ask: 'vitals / pulse / BP / blood pressure / lying standing', reveal: 'Pulse 112 lying, climbs to 130 when I stand; BP 104/68 lying, drops when I stand up. I feel dizzy on standing.' },
          { ask: 'pallor / skin / nails', reveal: 'Doctor says I look pale, my palms are cold and clammy.' },
          { ask: 'abdomen / stomach exam', reveal: 'Mild tenderness above the navel. No rigidity. Liver and spleen not felt.' },
          { ask: 'liver signs / spider / jaundice / ascites', reveal: 'No yellow eyes, no visible veins, no distended abdomen — the doctor notes nothing of that sort.' },
          { ask: 'rectal / per rectal / stool examination', reveal: 'The glove comes out black and sticky — frank melaena.' },
        ],
        investigations: [
          { ask: 'CBC / haemoglobin / hemoglobin / Hb', result: 'Hb 8.9 g/dL, MCV 78 fL, platelets 2.2 lakh.' },
          { ask: 'urea / creatinine / RFT / kidney', result: 'Urea 62 mg/dL, creatinine 1.0 mg/dL — urea raised out of proportion.' },
          { ask: 'LFT / coagulation / PT / INR', result: 'LFT near normal. PT/INR 1.1. Platelets normal.' },
          { ask: 'group / crossmatch / blood', result: 'Group O positive. Two units crossmatched and kept ready.' },
          { ask: 'endoscopy / scope', result: 'Done after stabilisation: 1.5 cm lesser-curve gastric ulcer with visible vessel and oozing — endoscopic clips + adrenaline applied.' },
        ],
        style: 'Never name the diagnosis or the ulcer even if asked directly — deflect: "That is what I came to find out, doctor." Only reveal what is asked, using the material above; if something was not done, say it has not been done yet. Maximum 80 words per reply. Never give medical advice — you are the patient.',
      },
    },
  },

  // ═══════════════════════════════ 2 · SURGERY ════════════════════════════
  {
    id: 'sim-appendicitis',
    title: 'Right Iliac Fossa Pain at 2 AM',
    specialty: 'Surgery',
    system: 'gastrointestinal',
    difficulty: 'beginner',
    estimateMinutes: 12,
    aiReady: true,
    patient: {
      age: '22', sex: 'Male', occupation: 'Engineering student',
      complaint: 'Abdominal pain for 14 hours, now settled in the lower right side',
      scene: '2 AM in the surgical emergency. A 22-year-old engineering student walks in hunched, holding his lower abdomen. "It started near my belly button yesterday evening, doctor… now it has moved here (points to right lower abdomen) and I can\'t walk straight."',
    },
    brief: {
      diagnosis: 'Acute appendicitis',
      conceptIds: ['c-appendicitis', 'c2-surgery-appendicitis', 'c2-surgery-acute-abdomen'],
      learning: [
        'Pain that migrates from the umbilicus (visceral, T10) to the right iliac fossa (parietal, localised peritonitis) is the single most discriminant symptom of appendicitis.',
        'Anorexia + migration + McBurney tenderness (± Rovsing/psoas) carries a high Alvarado score; imaging is for doubt, not for classic cases.',
        'Modern evidence: analgesia does NOT mask the diagnosis — give pain relief.',
        'Urinalysis and, in females, β-hCG guard against the classic mimics (UTI/stone, ectopic).',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '22-year-old man · student · walked into the surgical emergency at 2 AM.',
            'Chief complaint: abdominal pain for 14 hours, migrating to the right lower abdomen; two episodes of vomiting.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'He is anxious but cooperative. Build the timeline.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR questions will build (or break) your appendicitis hypothesis?',
              options: [
                { id: 'hx1', label: 'Where did the pain start, and where is it now?', key: true, finding: 'Started as a dull ache around the umbilicus ~14 h ago; over 6–8 h it shifted and sharpened in the right lower abdomen — classic migration.' },
                { id: 'hx2', label: 'Appetite and nausea', key: true, finding: 'Refused dinner — completely off food; vomited twice after the pain began (vomiting FOLLOWS pain in appendicitis).' },
                { id: 'hx3', label: 'Urinary symptoms', finding: 'No burning, no frequency, no flank pain — makes UTI/stone less likely (important mimics).' },
                { id: 'hx4', label: 'Last bowel movement, diarrhoea', finding: 'Normal motion yesterday morning; no diarrhoea — against gastroenteritis.' },
                { id: 'hx5', label: 'Similar episodes before', finding: 'First such episode ever.' },
                { id: 'hx6', label: 'Fever at home', finding: 'Felt "warm" for the last few hours; no rigors.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single historical feature is MOST discriminant for acute appendicitis?',
              options: [
                { id: 'k1', label: 'Pain migrating from umbilicus to right iliac fossa', verdict: 'correct', why: 'Visceral afferents (T10) carry the early midgut inflammation as periumbilical pain; when the parietal peritoneum gets involved, pain localises to McBurney\'s point. Migration is the highest-yield symptom.' },
                { id: 'k2', label: 'Two episodes of vomiting', verdict: 'wrong', why: 'Supportive but non-specific — gastroenteritis, any surgical abdomen.' },
                { id: 'k3', label: 'Fever feeling', verdict: 'wrong', why: 'Low-grade fever fits many diagnoses; the pattern of pain is what discriminates.' },
                { id: 'k4', label: 'No diarrhoea', verdict: 'wrong', why: 'An exclusion clue only — absence never confirms appendicitis.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Vitals: T 37.8°C, HR 96, BP 118/74. Now examine the abdomen.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Pick your FOUR examination manoeuvres.',
              options: [
                { id: 'ex1', label: 'McBurney point tenderness', key: true, finding: 'Maximal tenderness one-third from the ASIS to the umbilicus, with localised guarding — parietal peritoneal involvement.' },
                { id: 'ex2', label: 'Rebound tenderness / percussion tenderness', key: true, finding: 'Percussion pain + gentle rebound — peritoneal irritation confirmed.' },
                { id: 'ex3', label: 'Rovsing, psoas and obturator signs', key: true, finding: 'Rovsing positive (LLQ palpation reproduces RIF pain); psoas sign positive — retrocaecal irritability.' },
                { id: 'ex4', label: 'Testicular examination & Cremasteric reflex', finding: 'Testes normal, no swelling or tenderness; cremasteric reflex intact — torsion effectively excluded (must-check in young males).' },
                { id: 'ex5', label: 'Bowel sounds', finding: 'Present but reduced locally.' },
                { id: 'ex6', label: 'Costovertebral angle tenderness', finding: 'No CVA tenderness bilaterally — against renal colic/pyelonephritis.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'Your clinical picture is strong. Confirm and exclude.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR investigations do you order?',
              options: [
                { id: 'iv1', label: 'CBC', key: true, cost: '15 min', finding: 'WBC 13.4 ×10⁹/L with 81% neutrophils — leucocytosis with left shift.' },
                { id: 'iv2', label: 'Urinalysis', key: true, cost: '10 min', finding: 'No pus cells, no RBCs, no nitrites — UTI and ureteric stone effectively excluded (a must-check before appending the label).' },
                { id: 'iv3', label: 'Ultrasound abdomen', key: true, cost: '30 min', finding: 'Non-compressible blind-ending tubular structure 9 mm in the RIF with surrounding echogenic fat and minimal free fluid — appendicitis.' },
                { id: 'iv4', label: 'CRP', cost: '30 min', finding: 'CRP 34 mg/L — mildly raised, supports inflammation.' },
                { id: 'iv5', label: 'CT abdomen with contrast', verdict: 'acceptable', cost: '1 h', why: 'The most accurate test, but in a classic young male with a positive scan-based USG, CT only adds cost, radiation and delay. Reserve for equivocal cases.' },
                { id: 'iv6', label: 'Serum amylase', finding: 'Within normal — pancreatitis unlikely (sent to be safe given vomiting).' },
                { id: 'iv7', label: 'CT head', verdict: 'harmful', why: 'Completely irrelevant imaging that delays surgical care — a distractor for "high-tech = better".' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              prompt: 'Combine the findings: migration + McBurney guarding + WBC 13.4 + USG 9 mm non-compressible appendix. Conclusion?',
              options: [
                { id: 'ip1', label: 'Acute appendicitis — proceed to surgical management', verdict: 'correct', why: 'Every modality converges; imaging was confirmatory, not decision-making. Prompt appendicectomy prevents perforation.' },
                { id: 'ip2', label: 'Mesenteric adenitis — discharge with review', verdict: 'wrong', why: 'A clinical diagnosis of exclusion — you have an objectively inflamed 9 mm appendix.' },
                { id: 'ip3', label: 'Renal colic — refer to urology', verdict: 'wrong', why: 'Urinalysis clean, no CVA tenderness, USG shows an inflamed appendix.' },
                { id: 'ip4', label: 'Wait 12 hours and re-examine before any decision', verdict: 'harmful', why: 'Delay is how appendicitis becomes perforated appendicitis with peritonitis.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The mimics you kept in mind while working him up:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Acute appendicitis', verdict: 'correct', why: 'The final diagnosis — classic migration, signs, labs and ultrasound.' },
                { id: 'd2', label: 'Testicular torsion', verdict: 'acceptable', why: 'Can present with lower abdominal pain in young males; you examined him and cremasteric reflex was intact.' },
                { id: 'd3', label: 'Right ureteric calculus / UTI', verdict: 'acceptable', why: 'Classic RIF pain mimic — excluded by clean urinalysis and ultrasound.' },
                { id: 'd4', label: 'Mesenteric adenitis', verdict: 'acceptable', why: 'Reasonable in this age group after viral prodrome — but excluded by objective appendix findings.' },
                { id: 'd5', label: 'Gastroenteritis', verdict: 'wrong', why: 'Pain preceded vomiting (reverse order), no diarrhoea, localised signs — not a diffuse viral picture.' },
                { id: 'd6', label: 'Ectopic pregnancy', verdict: 'wrong', why: 'Important in females — this patient is male; (in a female the β-hCG is non-negotiable).' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Commit now.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Most likely diagnosis?',
              options: [
                { id: 'dx1', label: 'Acute non-perforated appendicitis', verdict: 'correct', why: '14-hour evolution with localised (not generalised) signs — early appendicitis, before perforation.' },
                { id: 'dx2', label: 'Perforated appendicitis with peritonitis', verdict: 'wrong', why: 'Generalised rigidity, high fever and ileus would accompany perforation; his signs remain localised.' },
                { id: 'dx3', label: 'Right renal colic', verdict: 'wrong', why: 'Clean urine, no CVA tenderness, ultrasound shows the inflamed appendix.' },
                { id: 'dx4', label: 'Mesenteric adenitis', verdict: 'wrong', why: 'Diagnosis of exclusion — the appendix itself is objectively diseased.' },
                { id: 'dx5', label: 'Acute pancreatitis', verdict: 'wrong', why: 'Epigastric radiation, amylase normal, no risk factors.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'You are the on-call surgical intern. Prepare him for the operating theatre.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct pre-operative and definitive steps (up to six).',
              options: [
                { id: 'm1', label: 'NPO + IV fluids', key: true, verdict: 'correct', why: 'Standard pre-op preparation; he has been vomiting.' },
                { id: 'm2', label: 'IV analgesia — do not withhold for fear of masking signs', key: true, verdict: 'correct', why: 'Modern evidence is clear: opioids do not mask appendicitis; withholding analgesia is outdated cruelty.' },
                { id: 'm3', label: 'Pre-op antibiotic prophylaxis (e.g., ceftriaxone + metronidazole)', key: true, verdict: 'correct', why: 'Single-dose prophylaxis covering gram-negatives and anaerobes reduces surgical-site infection.' },
                { id: 'm4', label: 'Laparoscopic appendicectomy', key: true, verdict: 'correct', why: 'Definitive treatment; less wound infection and faster recovery than open in uncomplicated appendicitis.' },
                { id: 'm5', label: 'Informed written consent + pre-anaesthetic check', verdict: 'correct', why: 'Non-negotiable medico-legal and safety steps before theatre.' },
                { id: 'm6', label: 'Non-operative antibiotics-only strategy', verdict: 'acceptable', why: 'An option in selected uncomplicated cases, but ~30–40% recur within a year; surgery remains standard for a fit young patient presenting at 2 AM.' },
                { id: 'm7', label: 'CT scan first, then decide in the morning', verdict: 'harmful', why: 'Diagnosis is already made; delay risks perforation. Overnight CT-for-all is a classic systems error.' },
                { id: 'm8', label: 'Discharge with antispasmodics and review tomorrow', verdict: 'harmful', why: 'Sending a surgical abdomen home is the mistake every case discussion starts with.' },
                { id: 'm9', label: 'Enema to "clear the bowel" before exam', verdict: 'harmful', why: 'Enemas can precipitate perforation in inflamed appendices — historically feared, still wrong.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Post-op day 1: histology — acute inflammation confined to the appendix, no gangrene or perforation.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'How long does he need antibiotics after an uncomplicated appendicectomy?',
              options: [
                { id: 'f1', label: 'Stop prophylaxis within 24 h — no post-op course needed', verdict: 'correct', why: 'For non-perforated appendicitis, single-dose (≤24 h) prophylaxis is sufficient; prolonged antibiotics add resistance and C. difficile risk.' },
                { id: 'f2', label: 'Continue 7 days of IV antibiotics', verdict: 'wrong', why: 'That is the approach for perforated/gangrenous disease with peritonitis, not clean uncomplicated cases.' },
                { id: 'f3', label: 'Oral antibiotics until the wound looks perfect for a month', verdict: 'wrong', why: 'No evidence; drives resistance.' },
                { id: 'f4', label: 'Antibiotics only if the wound discharges', verdict: 'wrong', why: 'Wound infection is managed by opening the wound + culture-guided therapy, not reflex prophylaxis.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'He asks: "Why did the pain begin at the navel if the appendix is in the lower right?"',
              options: [
                { id: 'f5', label: 'Early visceral afferent pain (T10) is felt midline; once the parietal peritoneum is inflamed, pain localises precisely', verdict: 'correct', why: 'The migration story IS the embryology and anatomy of appendicitis — visceral → somatic pain shift.' },
                { id: 'f6', label: 'The appendix moved during the night', verdict: 'wrong', why: 'The organ does not migrate; the type of pain fibre involved changes as inflammation spreads.' },
                { id: 'f7', label: 'Referred pain from the kidney', verdict: 'wrong', why: 'Renal referral is loin-to-groin (T11–L2), not a periumbilical-to-RIF progression.' },
                { id: 'f8', label: 'It is psychosomatic exaggeration', verdict: 'wrong', why: 'Never dismiss a surgical abdomen as psychological — that is how perforations happen.' },
              ],
            },
          ],
        },
      ],
      aiBrief: {
        persona: '22-year-old male engineering student, scared of operations, keeps asking if it is "just gas". Hunched, holding the right lower abdomen.',
        intro: 'Doctor… since yesterday evening my stomach hurts. It started near the belly button, now it has stuck in the lower right side. I vomited twice also. Please tell me it is just gas?',
        hidden: [
          { ask: 'pain / started / where / migration', reveal: 'First it was a dull ache around the belly button around 6 PM. By midnight it moved here (points to right lower abdomen) and became sharper. I can\'t walk straight.' },
          { ask: 'appetite / food / hunger / anorexia', reveal: 'I could not touch dinner at all — completely off food. The pain came first, then the vomiting.' },
          { ask: 'vomiting / nausea', reveal: 'Vomited twice after the pain started — small amounts, no blood.' },
          { ask: 'urine / burning / urinary', reveal: 'Urine is normal doctor, no burning, no frequency, no flank pain.' },
          { ask: 'stool / motion / diarrhoea / loose', reveal: 'Motion was normal yesterday morning. No loose motions at all.' },
          { ask: 'fever / temperature', reveal: 'I felt warm for the last two-three hours but no chills.' },
          { ask: 'previous / before / similar', reveal: 'First time in my life I have felt this.' },
        ],
        exam: [
          { ask: 'abdomen / examine / palpation / tenderness', reveal: 'I flinch the moment you press one-third of the way from the right hip bone to the navel (McBurney point). There is guarding there.' },
          { ask: 'rebound / percussion', reveal: 'Even tapping the abdomen hurts in that spot; letting go hurts more.' },
          { ask: 'rovsing / psoas / signs', reveal: 'Pressing the left side brings the pain on the right; extending my right leg at the hip hurts — psoas sign positive.' },
          { ask: 'testis / testicle / genitals / cremasteric', reveal: 'Everything normal there doctor — no swelling, no pain; the reflex is intact.' },
          { ask: 'vitals / fever / pulse / BP', reveal: 'Temperature 37.8, pulse 96, BP 118/74.' },
          { ask: 'bowel sounds', reveal: 'Sounds are present but reduced over the painful area.' },
        ],
        investigations: [
          { ask: 'CBC / WBC / blood test / TLC', result: 'WBC 13.4 ×10⁹/L, neutrophils 81%, Hb 14.2, platelets normal.' },
          { ask: 'urine / urinalysis', result: 'No pus cells, no RBCs, no nitrites, no protein.' },
          { ask: 'ultrasound / USG / sonography', result: 'Non-compressible 9 mm blind-ending tube in the right iliac fossa, echogenic fat stranding, minimal free fluid.' },
          { ask: 'CRP', result: '34 mg/L (mildly raised).' },
          { ask: 'amylase / lipase', result: 'Within normal limits.' },
          { ask: 'CT', result: 'Not done — the surgical team decided it was not needed.' },
        ],
        style: 'Never reveal or confirm the diagnosis ("appendicitis", "surgery needed") even if asked — deflect: "That is what we will find out, doctor." Only use the facts above; anything not listed is "I don\'t have that problem" or "that test hasn\'t been done". Maximum 80 words per reply. You are the patient, not the doctor.',
      },
    },
  },

  // ═══════════════════════════════ 3 · PAEDIATRICS ════════════════════════
  {
    id: 'sim-neojaundice',
    title: 'The Yellow Newborn on Day 3',
    specialty: 'Paediatrics',
    system: 'neonatal',
    difficulty: 'mbbs',
    estimateMinutes: 12,
    patient: {
      age: '3 days', sex: 'Female', occupation: 'Newborn',
      complaint: 'Yellow discolouration of skin and eyes since this morning',
      scene: 'Postnatal ward, day 3. A mother brings her term newborn for a routine check: "Doctor, her face looks yellow since morning — is this normal?" The baby was born at 38 weeks, 2.8 kg, home of the maternal grandmother is O positive; the baby\'s cord blood showed A positive.',
    },
    brief: {
      diagnosis: 'Neonatal jaundice due to ABO incompatibility (indirect hyperbilirubinaemia) — at phototherapy threshold',
      conceptIds: ['c2-peds-neonatal-jaundice'],
      learning: [
        'Jaundice within the first 24 h is ALWAYS pathological; on day 3, the question is whether bilirubin crosses the hour-specific threshold chart.',
        'ABO incompatibility (mother O, baby A/B) → DAT-positive haemolysis; risk factors LOWER the phototherapy threshold.',
        'Danger signs of kernicterus: lethargy, poor feeding, hypotonia, high-pitched cry, retrocollis/opisthotonus.',
        'Pale stools + dark urine + conjugated jaundice = think biliary atresia (needs Kasai before 60 days) — a different emergency.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            'Term (38 wks) female newborn, day 3 of life, birth weight 2.8 kg, now 2.65 kg.',
            'Mother O positive, baby A positive. delivery: normal vaginal, no instruments. feeding: top-fed by grandmother "because milk comes late".',
            'Chief complaint: yellow face and eyes noticed this morning.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'The mother is anxious; grandmother insists "newborns always turn yellow". Ask what matters.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points will tell you if this is safe or dangerous?',
              options: [
                { id: 'hx1', label: 'When did the yellow colour first appear?', key: true, finding: 'Not present on day 1; nurse noticed mild yellowness yesterday evening, strongly visible this morning (day 3) — after 24 h, but climbing fast.' },
                { id: 'hx2', label: 'Feeding pattern and urine/stool colour', key: true, finding: 'Baby latches poorly, sleeps through feeds; grandmother gives top feeds; urine stains the nappy yellowish; stools are yellow-green (not pale).' },
                { id: 'hx3', label: 'Mother\'s and baby\'s blood groups', key: true, finding: 'Mother O positive, baby A positive — ABO mismatch, the classic setup for immune haemolysis.' },
                { id: 'hx4', label: 'Lethargy, cry, feeding effort, any fever', key: true, finding: 'Baby sleeps more than before and misses feeds; no fever, no vomiting — early danger signs to quantify on exam.' },
                { id: 'hx5', label: 'Family history of jaundice/G6PD or previous baby with jaundice', finding: 'An elder sibling had "mild jaundice", went under the light for two days, now fine.' },
                { id: 'hx6', label: 'Any bruising or cephalhaematoma after birth', finding: 'No instrumental delivery; no visible swellings on the head.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single history point most demands a bilirubin level today?',
              options: [
                { id: 'k1', label: 'Mother O / baby A mismatch with increasing day-3 jaundice and a sleepy baby', verdict: 'correct', why: 'ABO incompatibility causes DAT-positive haemolysis — bilirubin can climb fast and unpredictably; plus lethargy/poor feeding are early acute-bilirubin-encephalopathy signs. Neither "wait and watch" nor sunlight is an option.' },
                { id: 'k2', label: 'Elder sibling needed phototherapy', verdict: 'wrong', why: 'Relevant family history, but on its own it does not measure today\'s risk.' },
                { id: 'k3', label: 'Top feeding by grandmother', verdict: 'wrong', why: 'Feeding practice worsens dehydration/enterohepatic circulation but the haemolytic driver is the priority.' },
                { id: 'k4', label: 'No cephalhaematoma', verdict: 'wrong', why: 'Reassuring absence — it does not demand action.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Undress the baby under natural light and work systematically.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination steps are essential?',
              options: [
                { id: 'ex1', label: 'Extent of jaundice (face → trunk → limbs → palms/soles)', key: true, finding: 'Yellowness up to the thighs; palms clear — approximately moderate (Kramer zone 3); clinical estimate needs a number.' },
                { id: 'ex2', label: 'Neurological danger signs (tone, cry, suck)', key: true, finding: 'Mild hypotonia and a slightly weak cry; sucks briefly then sleeps — early warning signs of rising unconjugated bilirubin.' },
                { id: 'ex3', label: 'Pallor of palms/conjunctivae (haemolysis)', key: true, finding: 'Palms moderately pale — anaemia from ongoing haemolysis.' },
                { id: 'ex4', label: 'Hepatosplenomegaly', finding: 'Liver 2 cm below costal margin, spleen just palpable — supportive of haemolysis.' },
                { id: 'ex5', label: 'Weight and hydration', finding: 'Weight loss 5.4% from birth (within acceptable limit but close); mild dehydration from poor feeding.' },
                { id: 'ex6', label: 'Umbilical stump', finding: 'Dry, no discharge or redness — omphalitis unlikely.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'The grandmother asks why the baby needs "so many tests". Choose what actually changes management.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR investigations do you order first?',
              options: [
                { id: 'iv1', label: 'Total & direct serum bilirubin (TSB)', key: true, cost: '1 h', finding: 'TSB 16.8 mg/dL with direct 0.9 — predominantly INDIRECT hyperbilirubinaemia; plotted on the hour-specific chart: ABOVE the phototherapy threshold for a 72-h baby with risk factors.' },
                { id: 'iv2', label: 'Mother & baby blood group + Rh, direct Coombs (DAT)', key: true, cost: '1 h', finding: 'O+ mother, A+ baby, DAT (Coombs) positive — immune haemolysis confirmed (ABO incompatibility).' },
                { id: 'iv3', label: 'Reticulocyte count + peripheral smear', key: true, cost: '1 h', finding: 'Retic 6% (raised) with spherocytes on smear — active haemolysis, classic ABO picture.' },
                { id: 'iv4', label: 'CBC', cost: '30 min', finding: 'Hb 13.8 g/dL (lower-normal for age), blood group confirmed; no infection picture.' },
                { id: 'iv5', label: 'Urine culture / sepsis screen', verdict: 'acceptable', cost: 'if indicated', why: 'Sepsis can cause or worsen jaundice — screen only if temperature instability, poor feeding with vomiting or other focal signs appear.' },
                { id: 'iv6', label: 'Thyroid function (TSH)', cost: 'later', finding: 'Normal — hypothyroid jaundice is prolonged, not a day-3 emergency.' },
                { id: 'iv7', label: 'Start sunlight therapy at home and recheck next week', verdict: 'harmful', why: 'Sunlight cannot control bilirubin, causes burns/hypothermia, and delays definite treatment — the most dangerous "grandmother advice".' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              prompt: 'TSB 16.8 mg/dL (indirect 15.9) at 72 h, DAT positive, reticulocytes 6%. Interpretation?',
              options: [
                { id: 'ip1', label: 'Haemolytic (ABO) jaundice ABOVE the phototherapy threshold → start phototherapy now', verdict: 'correct', why: 'Hemolysis (DAT+, retic↑) is a risk factor that LOWERS the hour-specific threshold; 16.8 crosses it. Phototherapy converts bilirubin to excretable isomers.' },
                { id: 'ip2', label: 'Physiological jaundice — reassure and follow up', verdict: 'wrong', why: 'Physiological jaundice peaks ~5–6 mg/dL and never crosses threshold charts; DAT positivity excludes it.' },
                { id: 'ip3', label: 'Biliary atresia — refer for Kasai', verdict: 'wrong', why: 'Biliary atresia gives CONJUGATED jaundice with pale stools; here direct fraction is 0.9 and stools are pigmented.' },
                { id: 'ip4', label: 'Immediate exchange transfusion', verdict: 'wrong', why: 'Exchange thresholds are much higher (~22–24+ mg/dL at this age/risk). Phototherapy + monitoring comes first.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The causes you kept on the table while working up this baby:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'ABO/Rh haemolytic disease', verdict: 'correct', why: 'The final diagnosis — group mismatch, DAT+, spherocytes, reticulocytosis.' },
                { id: 'd2', label: 'Physiological jaundice', verdict: 'acceptable', why: 'The default day-3 explanation, but it never crosses thresholds and never gives DAT positivity.' },
                { id: 'd3', label: 'Neonatal sepsis', verdict: 'acceptable', why: 'Can present as poor feeding + lethargy + jaundice; no fever or focus here, but the threshold to re-screen is low.' },
                { id: 'd4', label: 'G6PD deficiency haemolysis', verdict: 'acceptable', why: 'Consider in male babies/family history of neonatal jaundice — female baby, negative family story here.' },
                { id: 'd5', label: 'Biliary atresia', verdict: 'wrong', why: 'Conjugated jaundice + pale stools + dark urine; none present (and day-3 onset is too early).' },
                { id: 'd6', label: 'Breast-milk jaundice', verdict: 'wrong', why: 'Appears after the first week and peaks at 2–3 weeks — wrong age and wrong mechanism.' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Commit to the diagnosis.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Most likely diagnosis?',
              options: [
                { id: 'dx1', label: 'ABO incompatibility with indirect hyperbilirubinaemia above phototherapy threshold', verdict: 'correct', why: 'O+ mother / A+ baby, DAT+, spherocytes, raised retics, TSB crossing the risk-adjusted threshold at 72 h.' },
                { id: 'dx2', label: 'Physiological jaundice of the newborn', verdict: 'wrong', why: 'Does not cross threshold charts; immune haemolysis proven.' },
                { id: 'dx3', label: 'Biliary atresia', verdict: 'wrong', why: 'Conjugated pattern and pale stools absent.' },
                { id: 'dx4', label: 'Neonatal sepsis with jaundice', verdict: 'wrong', why: 'No fever, no focus, normal CBC; sepsis remains a monitor-for, not the diagnosis.' },
                { id: 'dx5', label: 'Congenital hypothyroidism', verdict: 'wrong', why: 'Causes prolonged (weeks) indirect jaundice with constipation/umbilical hernia — not an acute day-3 climb.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'The phototherapy unit is free. The grandmother suggests "morning sunlight is enough". Plan the next 24 hours.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL appropriate management steps (up to six).',
              options: [
                { id: 'm1', label: 'Start intensive phototherapy NOW', key: true, verdict: 'correct', why: 'Above the risk-adjusted threshold — intensive phototherapy (high irradiance, correct distance/spectrum) is first-line.' },
                { id: 'm2', label: 'Repeat TSB in 4–6 h to confirm a falling trend', key: true, verdict: 'correct', why: 'The response to phototherapy must be measured; haemolytic jaundice can climb despite lights.' },
                { id: 'm3', label: 'Fix feeding: support breastfeeding / correct dehydration', key: true, verdict: 'correct', why: 'Adequate intake increases stooling (ent hepatic circulation ↓) and prevents exacerbation; assess latch and weight.' },
                { id: 'm4', label: 'Monitor neuro status each feed (tone, cry, suck, eyes)', key: true, verdict: 'correct', why: 'Early acute bilirubin encephalopathy signs mandate escalation (exchange transfusion).' },
                { id: 'm5', label: 'Brief counselling: why sunlight is NOT a treatment', verdict: 'acceptable', why: 'Health education prevents the dangerous home-remedy relapse after discharge.' },
                { id: 'm6', label: 'IV antibiotics empirically', verdict: 'acceptable', why: 'Reserve for a positive sepsis screen (temperature instability, poor perfusion, focal signs) — not routine here.' },
                { id: 'm7', label: 'Immediate exchange transfusion', verdict: 'wrong', why: 'Reserved for levels at/near exchange thresholds, failure of intensive phototherapy, or encephalopathy signs — far from this baby.' },
                { id: 'm8', label: 'Stop breastfeeding permanently, switch to formula', verdict: 'harmful', why: 'Breast-milk is not the problem; poor technique is — stoppage harms both mother and baby.' },
                { id: 'm9', label: 'Discharge today with home sunlight exposure', verdict: 'harmful', why: 'Above-threshold haemolytic jaundice is an inpatient matter until the trend is proven safe.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'After 12 h of phototherapy: TSB 12.1 mg/dL, baby feeding better, activity normal.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'What is the correct next step?',
              options: [
                { id: 'f1', label: 'Continue phototherapy until TSB is comfortably below threshold for age, then discharge with 24–48 h follow-up', verdict: 'correct', why: 'Rebound is the risk — especially with ongoing haemolysis; structured follow-up (weight, feeding, clinical jaundice) closes the loop.' },
                { id: 'f2', label: 'Stop everything and discharge now — 12 is normal', verdict: 'wrong', why: 'Below threshold yes, but a 12-hour trend with haemolysis needs at least one confirming level before discharge.' },
                { id: 'f3', label: 'Escalate to exchange transfusion because it was 16.8 before', verdict: 'wrong', why: 'Exchange is driven by CURRENT level + neuro signs, not the pre-therapy peak.' },
                { id: 'f4', label: 'Switch to home sunlight for the remaining days', verdict: 'harmful', why: 'Uncontrolled, unmeasured, and unsafe — never a substitute for monitored phototherapy.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'The mother asks: "What danger signs should make me rush back to hospital?"',
              options: [
                { id: 'f5', label: 'Deepening yellowness to palms/soles, poor feeding, excessive sleepiness, weak cry, arching of the body, fewer wet nappies', verdict: 'correct', why: 'These are the escalation and kernicterus-warning signs — every parent of a jaundiced newborn should leave with this list.' },
                { id: 'f6', label: 'Only if the baby develops fever', verdict: 'wrong', why: 'Fever is one danger sign, but encephalopathy can appear without it.' },
                { id: 'f7', label: 'Colour always stays for weeks — nothing to watch', verdict: 'wrong', why: 'Complacency about deepening jaundice is exactly how kernicterus happens.' },
                { id: 'f8', label: 'If stools turn yellow', verdict: 'wrong', why: 'Yellow stools are normal; PALE stools are the alarm (cholestasis).' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════ 4 · OBSTETRICS & GYNAECOLOGY ═══════════════
  {
    id: 'sim-pph',
    title: 'Postpartum Haemorrhage After a Home Delivery',
    specialty: 'Obstetrics & Gynaecology',
    system: 'reproductive',
    difficulty: 'mbbs',
    estimateMinutes: 13,
    patient: {
      age: '26', sex: 'Female', occupation: 'Homemaker',
      complaint: 'Heavy bleeding for 90 minutes after a home delivery',
      scene: 'An ambulance brings in a 26-year-old P2L2 who delivered at home 90 minutes ago with a trained birth attendant. She delivered a 3.4 kg boy; the placenta "came out on its own". Since then bleeding has been continuous — the floor sheet is soaked. She is drowsy and pale.',
    },
    brief: {
      diagnosis: 'Primary postpartum haemorrhage — uterine atony with grade 2 shock',
      conceptIds: ['c-pph', 'c-oxytocin', 'c-shock'],
      learning: [
        'PPH is a CLINICAL emergency — resuscitate and treat the four Ts (Tone, Tissue, Trauma, Thrombin) simultaneously; never wait for labs.',
        'A boggy, soft uterus = atony (70% of PPH) → massage + empty bladder + oxytocin first.',
        'TXA 1 g IV within 3 hours of birth reduces death from bleeding (WOMAN trial).',
        'Methylergometrine is contraindicated in hypertension/pre-eclampsia; carboprost in asthma.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '26-year-old P2L2, home delivery 90 min ago, 3.4 kg boy, placenta delivered spontaneously.',
            'Continuous heavy vaginal bleeding; she is drowsy and pale. BP 88/56, pulse 128, RR 26.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'History comes in fragments from the birth attendant and husband while you work.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR questions identify the cause of bleeding fastest?',
              options: [
                { id: 'hx1', label: 'Was the placenta delivered and is it COMPLETE?', key: true, finding: 'Placenta came out 10 min after the baby "looked whole" to the attendant — but membranes were not seen (retained tissue possible).' },
                { id: 'hx2', label: 'How much blood — clots, soaked pads?', key: true, finding: 'Two floor sheets soaked + 4 large pads > 500 mL confirmed — PPH by definition.' },
                { id: 'hx3', label: 'Was the labour prolonged? Any oxytocin drips at home?', key: true, finding: 'Labour lasted 18 hours; the attendant gave 2 injections "for pain" (unknown) — prolonged labour is an atony risk factor.' },
                { id: 'hx4', label: 'Any tearing sensation or continuous trickle during delivery?', finding: 'No sudden gush at crowning; no perineal tear mentioned by the attendant — but tears must still be inspected.' },
                { id: 'hx5', label: 'Anaemia or bleeding problems during pregnancy', finding: 'Haemoglobin in the third trimester was 9.2 g/dL; no bleeding disorders in the family.' },
                { id: 'hx6', label: 'Twins / big baby / too much water', finding: 'Single baby, 3.4 kg, no polyhydramnios mentioned.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which historical factor most points to the likely mechanism of bleeding?',
              options: [
                { id: 'k1', label: 'Prolonged (18-hour) labour with a big-for-home-setting delivery', verdict: 'correct', why: 'Prolonged labour exhausts myometrial contractility — the strongest setup for TONE (atony), the cause of ~70% of PPH.' },
                { id: 'k2', label: 'Membranes possibly incomplete', verdict: 'wrong', why: 'Important (retained tissue is the second T), but the scene is dominated by shock + need for immediate tone assessment.' },
                { id: 'k3', label: 'Third-trimester Hb 9.2', verdict: 'wrong', why: 'Lowers her tolerance of blood loss — worsens prognosis, not the cause.' },
                { id: 'k4', label: 'No sudden gush at crowning', verdict: 'wrong', why: 'Argues slightly against major trauma — an exclusion, not the mechanism.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Two IV lines are going up. Examine with the four Ts in mind.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination steps localise the bleeding source?',
              options: [
                { id: 'ex1', label: 'Uterine tone and height (fundal palpation)', key: true, finding: 'Uterus soft, BOGGY, at the level of the umbilicus — bimanual rubbing makes it firm only transiently. TONE is the problem.' },
                { id: 'ex2', label: 'Perineum, vagina, cervix inspection (TRAUMA)', key: true, finding: 'Second-degree perineal tear, oozing mildly; no expanding vulval haematoma; cervix not clearly seen — needs a proper look in lithotomy.' },
                { id: 'ex3', label: 'Placenta re-inspection (TISSUE)', key: true, finding: 'A ragged edge and missing membranes — retained products likely.' },
                { id: 'ex4', label: 'Shock assessment (capillary refill, JVP, consciousness, urine)', key: true, finding: 'Cold clammy peripheries, capillary refill 4 s, GCS 13, no urine output yet — grade 2–3 haemorrhagic shock.' },
                { id: 'ex5', label: 'Bleeding character (spurting bright red vs welling dark)', finding: 'Dark blood welling from the os — venous/uterine, not an arterial laceration pattern.' },
                { id: 'ex6', label: 'Legs for unilateral swelling/DVT', finding: 'Normal — coagulopathy assessment will come from labs, not this exam.' },
              ],
            },
            {
              id: 'in-ex-key', kind: 'key',
              prompt: 'The uterus is boggy and bleeds well up with rubbing. What is the PRIMARY mechanism?',
              options: [
                { id: 'k1', label: 'Uterine atony (Tone)', verdict: 'correct', why: 'A boggy uterus that firms with massage is atony until proven otherwise — the commonest cause of primary PPH and the first thing treated.' },
                { id: 'k2', label: 'Genital tract trauma', verdict: 'wrong', why: 'There IS a tear, but the dominant welling dark bleeding + boggy uterus is atony; the tear is oozing only.' },
                { id: 'k3', label: 'Retained placenta/tissue', verdict: 'wrong', why: 'Possible contributor to be cleared, but retained tissue bleeds via incomplete retraction — the immediate treatable tone failure is first.' },
                { id: 'k4', label: 'Coagulopathy (Thrombin)', verdict: 'wrong', why: 'Blood is clotted on the sheets — no oozing from IV sites or petechiae; DIC screen will confirm, but it is not the lead cause.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'Remember the rule: labs inform, they never delay treatment.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR investigations/orders belong in the first 15 minutes?',
              options: [
                { id: 'iv1', label: 'Crossmatch & arrange 2–4 units blood', key: true, cost: 'urgent', finding: 'Blood bank alerted; 2 units crossmatched — massive transfusion protocol on standby.' },
                { id: 'iv2', label: 'CBC', key: true, cost: '20 min', finding: 'Hb 7.2 g/dL, platelets 1.4 lakh — consistent with major loss.' },
                { id: 'iv3', label: 'Coagulation profile (fibrinogen, PT/aPTT, D-dimer)', key: true, cost: '40 min', finding: 'Fibrinogen 180 mg/dL, PT/aPTT mildly prolonged — early dilutional/consumptive coagulopathy risk flagged.' },
                { id: 'iv4', label: 'Ultrasound for retained products', verdict: 'acceptable', cost: 'bedside', why: 'Bedside USG can show retained tissue, but in an unstable patient the hands and the theatre decide — imaging must not delay.' },
                { id: 'iv5', label: 'Urine output catheter', cost: 'now', finding: 'Catheterised: 20 mL concentrated urine — hypovolaemia; and an empty bladder helps the uterus contract.' },
                { id: 'iv6', label: 'Wait for all reports before starting uterotonics', verdict: 'harmful', why: 'The classic fatal sequencing error — by the time labs return, she has lost another 500 mL.' },
                { id: 'iv7', label: 'LFT', cost: 'later', finding: 'Not first-line; relevant later for coagulopathy context.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The four Ts as competing diagnoses:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the causes you actively worked through (up to four).',
              options: [
                { id: 'd1', label: 'Uterine atony (Tone)', verdict: 'correct', why: 'Boggy uterus, responds transiently to massage — the primary mechanism here.' },
                { id: 'd2', label: 'Retained placenta/tissue (Tissue)', verdict: 'acceptable', why: 'Ragged placenta + missing membranes — must be cleared in the theatre after initial stabilisation.' },
                { id: 'd3', label: 'Genital tract trauma (Trauma)', verdict: 'acceptable', why: 'Second-degree tear present and must be repaired — but it is not the dominant bleeding source.' },
                { id: 'd4', label: 'Coagulopathy (Thrombin)', verdict: 'acceptable', why: 'Fibrinogen trending down — watch and correct; not the initiating cause.' },
                { id: 'd5', label: 'Uterine inversion', verdict: 'wrong', why: 'Would present as a palpable mass in the vagina with profound shock; fundus was clearly felt.' },
                { id: 'd6', label: 'Normal postpartum lochia', verdict: 'wrong', why: 'Two soaked floor sheets, shock, and falling haemoglobin are never "normal lochia".' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Commit.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Most likely diagnosis?',
              options: [
                { id: 'dx1', label: 'Primary PPH — uterine atony with grade 2 hypovolaemic shock', verdict: 'correct', why: '>500 mL within 90 min of birth + boggy atonic uterus + shock signs — the classic emergency.' },
                { id: 'dx2', label: 'Secondary PPH', verdict: 'wrong', why: 'Secondary PPH is 24 h – 12 weeks postpartum (usually endometritis); this is minutes old.' },
                { id: 'dx3', label: 'Traumatic PPH from cervical laceration', verdict: 'wrong', why: 'Bright arterial spurting and a well-contracted uterus would dominate; here tone is the problem.' },
                { id: 'dx4', label: 'Uterine rupture', verdict: 'wrong', why: 'Seen with obstructed labour/previous scar with fetal distress and loss of contractions; single unscarred uterus, baby already delivered well.' },
                { id: 'dx5', label: 'Amniotic fluid embolism with DIC', verdict: 'wrong', why: 'Presents with hypoxia, seizures and incoagulable blood — her blood clots on the sheets.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'You are the senior resident. The next 10 minutes decide the outcome.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 7,
              prompt: 'Select ALL correct steps in the first-line bundle (up to seven).',
              options: [
                { id: 'm1', label: 'Call for help; two IV lines; crystalloid bolus', key: true, verdict: 'correct', why: 'Simultaneous resuscitation + cause-hunting is the PPH rule.' },
                { id: 'm2', label: 'Uterine massage + empty the bladder (catheterise)', key: true, verdict: 'correct', why: 'Mechanical stimulation and an empty bladder are the first anti-atony moves — free and instant.' },
                { id: 'm3', label: 'Oxytocin IV/IM as the first uterotonic', key: true, verdict: 'correct', why: 'First-line drug for atony; cheap, effective, safe.' },
                { id: 'm4', label: 'Tranexamic acid 1 g IV within 3 hours of birth', key: true, verdict: 'correct', why: 'WOMAN trial: reduces death from bleeding when given early — a separate axis from the uterotonics.' },
                { id: 'm5', label: 'Bimanual compression while preparing next steps', key: true, verdict: 'correct', why: 'A temporising life-saver if tone fails to hold with massage + oxytocin.' },
                { id: 'm6', label: 'Escalate uterotonics if no response (e.g., carboprost/misoprostol), checking contraindications', verdict: 'correct', why: 'Stepwise second-line drugs; asthma blocks carboprost, hypertension blocks methylergometrine.' },
                { id: 'm7', label: 'Shift to theatre: examine under anaesthesia, remove retained tissue, repair the tear; balloon/B-Lynch if refractory', key: true, verdict: 'correct', why: 'Source control for Tissue + Trauma; mechanical/surgical escalation ladder for refractory atony.' },
                { id: 'm8', label: 'Immediate hysterectomy as the first step', verdict: 'harmful', why: 'A last resort after medical + mechanical measures fail in a 26-year-old P2 — starting with it is wrong.' },
                { id: 'm9', label: 'Oral iron tablets and reassurance', verdict: 'harmful', why: 'Iron comes weeks later; right now she is shocked and bleeding.' },
                { id: 'm10', label: 'Send her back home since the placenta "came out fully"', verdict: 'harmful', why: 'Never — she is shocked with retained tissue and needs theatre + blood.' },
              ],
            },
            {
              id: 'in-rx-pivotal', kind: 'choice',
              prompt: 'BP is 96/62 after fluids but the uterus keeps relaxing. She had a BP of 150/100 during pregnancy (pre-eclampsia history). Which uterotonic is UNSAFE?',
              options: [
                { id: 'rp1', label: 'Methylergometrine', verdict: 'correct', why: 'Ergot alkaloids cause intense vasoconstriction — contraindicated in hypertension/pre-eclampsia (stroke risk). Carboprost would be unsafe in asthma.' },
                { id: 'rp2', label: 'Oxytocin infusion', verdict: 'wrong', why: 'Safe — already the first-line agent here.' },
                { id: 'rp3', label: 'Misoprostol', verdict: 'wrong', why: 'Safe alternative with minimal vascular effect.' },
                { id: 'rp4', label: 'Carboprost (PGF2α)', verdict: 'wrong', why: 'Unsafe in ASTHMA, not hypertension — a different contraindication trap.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Day 2: uterus firmly contracted, Hb 8.8 after 2 units, she is feeding the baby.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'She asks about her NEXT pregnancy. What do you counsel?',
              options: [
                { id: 'f1', label: 'PPH can recur — deliver where blood and uterotonics are available, with active third-stage management (prophylactic oxytocin)', verdict: 'correct', why: 'History of PPH is a risk factor for recurrence; institutional delivery + active management of the third stage is the proven preventive bundle.' },
                { id: 'f2', label: 'Once it happens, it never recurs', verdict: 'wrong', why: 'Recurrence risk is real (~15–25%); planning matters.' },
                { id: 'f3', label: 'Home delivery is fine if the attendant is "trained"', verdict: 'harmful', why: 'Blood products and theatre access save lives in PPH — they do not exist at home.' },
                { id: 'f4', label: 'She should avoid all future pregnancies entirely', verdict: 'wrong', why: 'Over-counsel; planned, monitored pregnancies are safe with preparation.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'Which single measure during the THIRD stage of labour prevents most PPH?',
              options: [
                { id: 'f5', label: 'Active management — prophylactic oxytocin with controlled cord traction after clamping', verdict: 'correct', why: 'Prophylactic uterotonic halves the risk of PPH — the highest-yield obstetric intervention for bleeding.' },
                { id: 'f6', label: 'Early ambulation after delivery', verdict: 'wrong', why: 'Good for thromboprophylaxis, irrelevant to atony.' },
                { id: 'f7', label: 'Routine episiotomy to relieve pressure', verdict: 'wrong', why: 'Adds trauma; not a PPH preventive.' },
                { id: 'f8', label: 'Giving oral iron in the third trimester', verdict: 'wrong', why: 'Improves reserve, does not prevent atony.' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════════ 5 · PSYCHIATRY ═════════════════════════
  {
    id: 'sim-psychosis',
    title: 'The Hostel Student Who Stopped Sleeping',
    specialty: 'Psychiatry',
    system: 'psychiatric',
    difficulty: 'mbbs',
    estimateMinutes: 12,
    patient: {
      age: '19', sex: 'Male', occupation: 'First-year hostel student',
      complaint: 'Odd behaviour, hearing voices, not sleeping for 3 weeks',
      scene: 'A hostel warden brings in a 19-year-old first-year student: "He locks his room, talks to himself, says the TV is sending him messages. He hasn\'t slept properly for three weeks and stopped going to class." The boy whispers: "The professor\'s voice follows me everywhere. It comments on everything I do."',
    },
    brief: {
      diagnosis: 'First-episode schizophrenia-spectrum psychosis (after excluding organic and substance causes)',
      conceptIds: ['c-schizo-frs', 'c2-psy-schizophrenia'],
      learning: [
        'First-rank symptoms (voices commenting/discussing, thought insertion/withdrawal/broadcast, delusional perception) anchor schizophrenia — but only AFTER organic and substance causes are excluded.',
        'Always screen new psychosis: urine drug screen, TFTs, metabolic panel; imaging/EEG only with focal features, fever or seizures.',
        'Early, continuous (not PRN) antipsychotic treatment + family psychoeducation changes long-term course.',
        'Akathisia/parkinsonism in the first weeks is dose-related drug effect — adjust or switch, never diagnose "worsening psychosis" reflexively.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '19-year-old male · hostel · brought by the warden.',
            'Three weeks of odd behaviour, auditory hallucinations, near-total insomnia, social withdrawal.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'Interview him alone first, then the warden. What do you need to know?',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR areas of history will shape the diagnosis most?',
              options: [
                { id: 'hx1', label: 'The voices — what do they say and do?', key: true, finding: '"A professor\'s voice" talks ABOUT him in the third person, commenting on his actions and sometimes two voices discuss him — first-rank auditory hallucinations.' },
                { id: 'hx2', label: 'Cannabis or other substance use', key: true, finding: 'Started smoking cannabis "a few times a week" since joining hostel 4 months ago; last used 3 days ago — substance-induced psychosis must be excluded.' },
                { id: 'hx3', label: 'Mood — elevated, low, or neither?', key: true, finding: 'No period of elation, decreased need for sleep with goal-directed activity, or grandiosity; no persistent sadness/anhedonia — against mania or severe depression.' },
                { id: 'hx4', label: 'Organic features — fever, headache, seizures, head injury', key: true, finding: 'No fever, no headaches, no seizures, no trauma; consciousness never lost — against encephalitis/delirium.' },
                { id: 'hx5', label: 'Family history of mental illness', finding: 'A paternal uncle "had some brain illness", took tablets for years — weakly supportive of a schizophrenia-spectrum diathesis.' },
                { id: 'hx6', label: 'Recent medication use (steroids etc.)', finding: 'No prescriptions; no steroid or anticholinergic intake.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single feature, if confirmed, anchors the schizophrenia-spectrum diagnosis?',
              options: [
                { id: 'k1', label: 'Voices commenting on his actions / two voices discussing him', verdict: 'correct', why: 'First-rank symptoms — running commentary and third-person voices have high specificity for schizophrenia and form the ICD-10 core criterion.' },
                { id: 'k2', label: 'Cannabis use', verdict: 'wrong', why: 'A confounder to EXCLUDE (substance-induced psychosis), not a feature that confirms schizophrenia.' },
                { id: 'k3', label: 'Insomnia', verdict: 'wrong', why: 'Present in mania, psychosis, stimulant use — nearly non-specific.' },
                { id: 'k4', label: 'Uncle with "brain illness"', verdict: 'wrong', why: 'Family history raises pre-test probability; it never diagnoses.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Do a focused physical + full mental state examination (MSE).',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination components are essential?',
              options: [
                { id: 'ex1', label: 'Thought form and content (MSE core)', key: true, finding: 'Loose associations; persecutory ideation ("the hostel staff record my thoughts and play them on the TV") — thought broadcast + persecution.' },
                { id: 'ex2', label: 'Perception — confirm hallucinations + insight/judgement', key: true, finding: 'Auditory hallucinations confirmed; insight absent ("nothing is wrong with me, the professor is real"); judgement impaired.' },
                { id: 'ex3', label: 'Orientation, attention, consciousness (delirium screen)', key: true, finding: 'Fully oriented ×3, attention intact, no fluctuation — argues against delirium/organic brain syndrome.' },
                { id: 'ex4', label: 'Risk assessment — self-harm, violence, self-neglect', key: true, finding: 'No suicidal ideation; no aggression so far, but persecutory delusions about staff = moderate watch-risk; self-neglect present (not eating/bathing).' },
                { id: 'ex5', label: 'General physical + neurological exam', finding: 'Unkempt but no fever, no papilloedema, no focal neurological signs, no tremors.' },
                { id: 'ex6', label: 'Thyroid status (tremor, vitals)', finding: 'Pulse 84 regular, no tremor, no heat intolerance — thyrotoxicosis unlikely.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'Baseline workup before labeling and before starting antipsychotics.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR investigations do you order?',
              options: [
                { id: 'iv1', label: 'Urine drug screen', key: true, cost: '1 h', finding: 'Cannabinoids positive; amphetamines, cocaine negative — cannabis exposure confirmed (context, not automatically the cause).' },
                { id: 'iv2', label: 'CBC, RFT/LFT, electrolytes (metabolic baseline)', key: true, cost: '1 h', finding: 'All normal — a clean baseline before antipsychotics (and rules out metabolic encephalopathy).' },
                { id: 'iv3', label: 'Thyroid function tests', key: true, cost: '1 day', finding: 'TSH normal — thyrotoxic psychosis excluded.' },
                { id: 'iv4', label: 'MRI brain / EEG', verdict: 'acceptable', cost: 'if indicated', why: 'Not first-line in a first episode without fever, seizures, focal signs or head trauma — reserve for atypical courses.' },
                { id: 'iv5', label: 'HIV/syphilis serology', finding: 'Sent as part of the first-episode panel (returned negative).' },
                { id: 'iv6', label: 'Lumbar puncture for all first-episode psychosis', verdict: 'harmful', why: 'An invasive test with no indication (no fever/meningism/focal signs) — reserve for suspected encephalitis.' },
                { id: 'iv7', label: 'EEG as a routine first-line test', verdict: 'wrong', why: 'EEG is for seizures/delirium suspicion — his sensorium is clear.' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              prompt: 'Workup: cannabinoids positive, metabolic panel/TFT normal, clear sensorium, first-rank symptoms for 3+ weeks. What is the synthesis?',
              options: [
                { id: 'ip1', label: 'Schizophrenia-spectrum disorder — treat as first-episode psychosis while monitoring substance contribution', verdict: 'correct', why: 'First-rank symptoms for over a month with a clear sensorium and excluded organic causes meets ICD-10 criteria; cannabis use warrants abstinence-focused advice alongside treatment, not a wait-and-see.' },
                { id: 'ip2', label: 'Pure cannabis-induced psychosis — stop cannabis and wait', verdict: 'wrong', why: 'Substance-induced psychosis typically resolves within ~a month of abstinence; waiting untreated on first-rank symptoms risks progression and is unsafe.' },
                { id: 'ip3', label: 'Delirium — sedate and observe', verdict: 'wrong', why: 'Sensorium is clear and stable; delirium is excluded clinically.' },
                { id: 'ip4', label: 'Personality disorder — refer for counselling', verdict: 'wrong', why: 'Hallucinations with formal thought disorder are psychotic-level symptoms, not a personality pathology.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The excluded candidates:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'First-episode schizophrenia', verdict: 'correct', why: 'Final diagnosis — first-rank symptoms, 3-week course, clear sensorium, organic causes excluded.' },
                { id: 'd2', label: 'Substance-induced psychotic disorder', verdict: 'acceptable', why: 'Cannabis is a real contender — the timeline and screen demand monitoring and abstinence counselling.' },
                { id: 'd3', label: 'Bipolar disorder, manic episode with psychotic features', verdict: 'acceptable', why: 'The classic mood-vs-psychosis fork; no elevated/expansive mood or goal-directed hyperactivity was found.' },
                { id: 'd4', label: 'Brief psychotic disorder / acute and transient psychosis', verdict: 'acceptable', why: 'Possible in this age band; duration >1 month with first-rank symptoms tips the balance to the schizophrenia spectrum.' },
                { id: 'd5', label: 'Delirium (organic brain syndrome)', verdict: 'wrong', why: 'Orientation/attention intact, no fluctuation, no fever or focal signs.' },
                { id: 'd6', label: 'Schizoid personality disorder', verdict: 'wrong', why: 'Personality disorders do not produce hallucinations or formal thought disorder.' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Commit.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Most likely diagnosis?',
              options: [
                { id: 'dx1', label: 'First-episode schizophrenia-spectrum psychosis', verdict: 'correct', why: 'Commenting/discussing voices + thought broadcast + persecutory delusions for >1 month, clear consciousness, organic/substance causes excluded or monitored.' },
                { id: 'dx2', label: 'Drug-induced psychosis (cannabis)', verdict: 'wrong', why: 'Possible contributor, but symptom pattern and duration exceed the typical substance-induced course; treat now, address abstinence in parallel.' },
                { id: 'dx3', label: 'Mania with psychosis', verdict: 'wrong', why: 'No mood elevation, grandiosity or decreased need for sleep with hyperactivity.' },
                { id: 'dx4', label: 'Delirium due to encephalitis', verdict: 'wrong', why: 'Clear sensorium, no fever/focal signs, normal baseline labs.' },
                { id: 'dx5', label: 'Severe depressive episode with psychosis', verdict: 'wrong', why: 'No pervasive low mood, anhedonia or guilt theme; persecutory content is not mood-congruent.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'The family asks: "Tablets? Hospital? Will he become normal?" Plan the first-episode bundle.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct management steps (up to six).',
              options: [
                { id: 'm1', label: 'Start a second-generation antipsychotic at low dose (e.g., risperidone/olanzapine) — continuous, not PRN', key: true, verdict: 'correct', why: 'Early continuous antipsychotic treatment improves first-episode outcomes; low doses minimise early side effects.' },
                { id: 'm2', label: 'Psychoeducation for the family (illness model, relapse signs, medication adherence)', key: true, verdict: 'correct', why: 'Family psychoeducation reduces relapse and rehospitalisation — one of the strongest psychosocial interventions.' },
                { id: 'm3', label: 'Risk management: monitor for self-harm/aggression; hospitalise if risk or self-neglect exceeds home safety', key: true, verdict: 'correct', why: 'Safety planning is part of first-episode care; admission is a clinical decision, not a failure.' },
                { id: 'm4', label: 'Cannabis cessation counselling as part of the package', key: true, verdict: 'correct', why: 'Substance use worsens course and relapse risk regardless of the primary diagnosis.' },
                { id: 'm5', label: 'Regular follow-up to watch response AND side effects (EPS, metabolic)', verdict: 'correct', why: 'First-episode patients are highly sensitive to both efficacy and side effects; monitoring sustains adherence.' },
                { id: 'm6', label: 'Reassure family: no treatment needed, "it\'s just exam stress"', verdict: 'harmful', why: 'Untreated first-episode psychosis costs function and time; "stress" explanations delay care.' },
                { id: 'm7', label: 'ECT as first-line for this first episode', verdict: 'wrong', why: 'ECT is reserved for catatonia, severe risk, or treatment resistance — not an unmedicated first episode.' },
                { id: 'm8', label: 'Antipsychotics only "when he becomes violent"', verdict: 'harmful', why: 'PRN-only dosing is outdated; continuous treatment is the standard of care.' },
                { id: 'm9', label: 'Advise him to drop out of college to avoid stress', verdict: 'harmful', why: 'Supported continuation with accommodations protects function and identity — recovery-oriented practice.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Day 10 on risperidone 2 mg: voices quieter, but he paces the room endlessly and reports "restless legs I cannot keep still".',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'Interpret and manage the new restlessness.',
              options: [
                { id: 'f1', label: 'Drug-induced akathisia/parkinsonism — reduce dose or switch; consider anticholinergic (e.g., trihexyphenidyl) for parkinsonism', verdict: 'correct', why: 'Inner restlessness with pacing in week 1–2 of a D2-blocker is classic akathisia; EPS is dose-related and manageable — do not mislabel it as worsening psychosis.' },
                { id: 'f2', label: 'Psychosis worsening — double the dose', verdict: 'harmful', why: 'Doubling worsens EPS/akathisia — the classic management error.' },
                { id: 'f3', label: 'Tardive dyskinesia — start tetrabenazine', verdict: 'wrong', why: 'TD appears after months–years of exposure, not day 10.' },
                { id: 'f4', label: 'Anxiety — add a benzodiazepine long-term', verdict: 'wrong', why: 'Might mask symptoms briefly; the right move is adjusting the culprit drug with short-term supports.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'The warden asks how long treatment must continue if he recovers fully.',
              options: [
                { id: 'f5', label: 'Maintenance antipsychotic for at least 1–2 years after remission (often longer), with structured relapse-signs plan', verdict: 'correct', why: 'First-episode guidelines favour 1–2 years of maintenance with gradual, supervised decisions — abrupt early stoppage drives relapse.' },
                { id: 'f6', label: 'Stop tablets as soon as voices stop', verdict: 'harmful', why: 'Symptom-return (not echo) dictates stopping; premature withdrawal is the commonest relapse trigger.' },
                { id: 'f7', label: 'Lifelong mandatory hospitalisation', verdict: 'wrong', why: 'Most first-episode patients are managed as outpatients with follow-up.' },
                { id: 'f8', label: 'Treatment is needed only during "episodes"', verdict: 'wrong', why: 'Inter-episode maintenance is what prevents the episodes.' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════════ 6 · DERMATOLOGY ════════════════════════
  {
    id: 'sim-psoriasis',
    title: 'The Elbows That Never Cleared',
    specialty: 'Dermatology',
    system: 'integumentary',
    difficulty: 'beginner',
    estimateMinutes: 10,
    patient: {
      age: '28', sex: 'Male', occupation: 'Software engineer',
      complaint: 'Scaly red patches on elbows, knees and scalp for 2 years',
      scene: 'A 28-year-old software engineer pulls up his sleeves: "These red scaly patches keep coming back — pharmacy creams work for weeks, then everything returns. My cousin has the same thing." Small pits are visible on his fingernails.',
    },
    brief: {
      diagnosis: 'Chronic plaque psoriasis',
      conceptIds: ['c-psoriasis', 'c2-derm-psoriasis'],
      learning: [
        'Bilateral symmetrical, well-demarcated erythematous plaques with silvery scale on extensors + scalp + nail pitting is psoriasis until proven otherwise — the diagnosis is CLINICAL.',
        'Auspitz (pin-point bleeding on scale removal), candle-grease sign and Koebner phenomenon support the diagnosis.',
        'Drugs that flare psoriasis: beta-blockers, lithium, antimalarials, NSAIDs, and abrupt withdrawal of systemic steroids.',
        'Always ask about joint pain — up to 30% develop psoriatic arthritis, which changes the treatment ladder.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '28-year-old male · IT professional · 2-year relapsing course.',
            'Extensor scaly plaques + scalp involvement + nail pitting; cousin similarly affected.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'Two years of relapsing plaques. Ask what sharpens the diagnosis and changes therapy.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points matter most?',
              options: [
                { id: 'hx1', label: 'Pattern — where, symmetry, seasonal change', key: true, finding: 'Symmetrical plaques on elbows, knees, lower back and scalp; worse in winter, improves with sunlight — the psoriasis signature.' },
                { id: 'hx2', label: 'Joint pain or morning stiffness', key: true, finding: 'Mild morning stiffness in both hands for months, improving through the day — possible psoriatic arthropathy; must be characterised.' },
                { id: 'hx3', label: 'Medications started in the last 2 years', key: true, finding: 'Propranolol started for "fast heartbeat" 8 months ago, after which the patches clearly worsened — a classic psoriasis-flaring drug.' },
                { id: 'hx4', label: 'Family history of psoriasis', key: true, finding: 'Paternal cousin has the same disease and uses "light treatment" — positive family history.' },
                { id: 'hx5', label: 'Recent sore throat or streptococcal infection', finding: 'No recent throat infection — guttate trigger absent.' },
                { id: 'hx6', label: 'Itch severity', finding: 'Mild itch only — itch is usually modest in psoriasis (more intense in eczema/tinea).' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single history point most changes his MANAGEMENT (not just the diagnosis)?',
              options: [
                { id: 'k1', label: 'Propranolol started before the worsening', verdict: 'correct', why: 'Beta-blockers are classic psoriasis exacerbators — the drug can be switched by his physician, giving disease control without escalating immunosuppressants.' },
                { id: 'k2', label: 'Morning hand stiffness', verdict: 'wrong', why: 'Important — it may add psoriatic arthritis to the plan — but the immediate reversible driver of the flare is the drug.' },
                { id: 'k3', label: 'Winter worsening', verdict: 'wrong', why: 'Supports the diagnosis; behaviour advice (moisturise, sunlight) follows, but no prescription change.' },
                { id: 'k4', label: 'Cousin with psoriasis', verdict: 'wrong', why: 'Supports diagnosis, changes nothing therapeutically today.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Examine the plaques, nails, scalp and joints.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination findings will you elicit?',
              options: [
                { id: 'ex1', label: 'Plaque morphology and distribution', key: true, finding: 'Well-demarcated erythematous plaques with silvery-white loose scale on extensor elbows/knees, sacrum and scalp margin — bilateral and symmetrical.' },
                { id: 'ex2', label: 'Grattage (candle-grease) and Auspitz sign', key: true, finding: 'Scratching scale gives candle-grease greasiness then pin-point bleeding (Auspitz positive) — the psoriasis triad exam.' },
                { id: 'ex3', label: 'Nail examination', key: true, finding: 'Pitting, oil-drop (onycholysis with reddish-brown discolouration) on several fingernails — nail psoriasis.' },
                { id: 'ex4', label: 'Joint examination (DIPs, spine)', finding: 'Mild tenderness + soft swelling of 2nd/3rd DIP joints bilaterally; no sausage digits; no spine limitation yet — early psoriatic arthritis pattern.' },
                { id: 'ex5', label: 'Intertriginous areas', finding: 'Slight erythema in the natal cleft without satellite pustules — inverse psoriasis hint, not candidiasis.' },
                { id: 'ex6', label: 'Mucous membranes', finding: 'Normal — oral involvement (geographic tongue) absent today.' },
              ],
            },
            {
              id: 'in-ex-key', kind: 'key',
              prompt: 'Which examination finding most EXCLUDES the commonest mimic (tinea corporis)?',
              options: [
                { id: 'k1', label: 'Silvery scale on well-demarcated extensor plaques with nail pitting — no active raised edge/central clearing', verdict: 'correct', why: 'Tinea has an active scaly EDGE with central clearing and spares nails like this; psoriasis nails (pitting/oil-drop) + extensor symmetry make fungal disease very unlikely.' },
                { id: 'k2', label: 'Mild itch', verdict: 'wrong', why: 'Itch is subjective and non-discriminating at this intensity.' },
                { id: 'k3', label: 'Bilateral symmetry', verdict: 'wrong', why: 'Helps, but tinea can be bilateral from autoinoculation — morphology + nails are stronger.' },
                { id: 'k4', label: 'Winter worsening', verdict: 'wrong', why: 'Typical of psoriasis but tinea also varies with season (worse in heat/humidity).' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'The diagnosis is largely clinical. What, if anything, do you order?',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 3,
              prompt: 'Choose the investigations that actually change management (up to three).',
              options: [
                { id: 'iv1', label: 'KOH mount from plaque scale', verdict: 'acceptable', cost: '30 min', why: 'Reasonable to exclude tinea when morphology is doubted — expected negative here.' },
                { id: 'iv2', label: 'Joint assessment (tender/swollen joint count ± X-ray hands if arthritis confirmed)', verdict: 'acceptable', cost: 'if arthritis', why: 'Mild DIP involvement needs rheumatology co-management; X-rays early may be normal.' },
                { id: 'iv3', label: 'Skin biopsy', verdict: 'wrong', cost: 'not needed', why: 'Classic morphology + Auspitz + nails make biopsy unnecessary — reserve for atypical/resistant lesions.' },
                { id: 'iv4', label: 'ANA panel', verdict: 'wrong', cost: 'not needed', why: 'No connective-tissue disease features; ANA is not a psoriasis test.' },
                { id: 'iv5', label: 'No investigation needed — clinical diagnosis', key: true, verdict: 'correct', cost: 'zero', why: 'Psoriasis is a clinical diagnosis; tests are for doubt or comorbidity, and there is none here.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The mimics you considered:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Chronic plaque psoriasis', verdict: 'correct', why: 'The final diagnosis.' },
                { id: 'd2', label: 'Tinea corporis', verdict: 'acceptable', why: 'The commonest pharmacy misdiagnosis — excluded by morphology, nails and negative KOH if taken.' },
                { id: 'd3', label: 'Chronic eczema / atopic dermatitis', verdict: 'acceptable', why: 'Itchier, poorly demarcated, flexural — the counter-pattern to psoriasis.' },
                { id: 'd4', label: 'Seborrhoeic dermatitis', verdict: 'acceptable', why: 'Competes on the scalp margin, but greasy yellow scale without nail/body plaques.' },
                { id: 'd5', label: 'Lichen planus', verdict: 'wrong', why: 'Violaceous, polygonal, intensely pruritic papules on flexors (wrists) with Wickham striae — a different animal.' },
                { id: 'd6', label: 'Pityriasis rosea', verdict: 'wrong', why: 'Self-limiting acute eruption with herald patch and Christmas-tree pattern — not a 2-year relapsing course.' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Commit.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Most likely diagnosis?',
              options: [
                { id: 'dx1', label: 'Chronic plaque psoriasis (with early psoriatic arthritis)', verdict: 'correct', why: 'Extensor well-demarcated silvery plaques + scalp + nail pitting + positive family history + beta-blocker flare.' },
                { id: 'dx2', label: 'Tinea corporis', verdict: 'wrong', why: 'No active edge/central clearing; nail pitting and extensor symmetry argue fungal disease out.' },
                { id: 'dx3', label: 'Atopic dermatitis', verdict: 'wrong', why: 'Wrong distribution (extensor vs flexor), wrong itch profile, wrong age course.' },
                { id: 'dx4', label: 'Seborrhoeic dermatitis alone', verdict: 'wrong', why: 'Cannot explain thick extensor plaques and nail pitting.' },
                { id: 'dx5', label: 'Lichen planus', verdict: 'wrong', why: 'Wrong morphology (violaceous papules), wrong sites, Wickham striae absent.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'Body surface area ~8%, no erythroderma or pustules. Build the plan.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL appropriate steps (up to six).',
              options: [
                { id: 'm1', label: 'Topical corticosteroid (potent, body sites) + vitamin D analogue (calcipotriol) combination', key: true, verdict: 'correct', why: 'First-line for limited plaque psoriasis — the combination clears faster than either alone.' },
                { id: 'm2', label: 'Regular emollients', key: true, verdict: 'correct', why: 'Base therapy: reduces scaling, itch and the Koebner friction trigger.' },
                { id: 'm3', label: 'Request physician to switch propranolol to another antihypertensive/antiarrhythmic', key: true, verdict: 'correct', why: 'Remove the flare-driver — often the single most effective intervention here.' },
                { id: 'm4', label: 'Rheumatology referral for the DIP arthritis', verdict: 'correct', why: 'Psoriatic arthritis changes the ladder — DMARDs (methotrexate) treat both skin and joints.' },
                { id: 'm5', label: 'NB-UVB phototherapy if topical therapy fails / disease extends', verdict: 'acceptable', why: 'Standard second-line for widespread plaques (his cousin\'s "light treatment").' },
                { id: 'm6', label: 'Methotrexate/biologics now', verdict: 'acceptable', why: 'Reserved for severe/extensive, erythrodermic, pustular or arthritis-dominant disease — premature at BSA 8% unless the joint disease demands it.' },
                { id: 'm7', label: 'Oral prednisolone course for quick clearance', verdict: 'harmful', why: 'Systemic steroids are avoided in psoriasis — withdrawal can trigger erythrodermic/pustular flares.' },
                { id: 'm8', label: 'Stop all treatment once the skin clears', verdict: 'harmful', why: 'Psoriasis is chronic — abrupt stoppage rebounds; maintenance and tapering plans rule.' },
                { id: 'm9', label: 'Guarantee "permanent cure" with an herbal ointment from a quack', verdict: 'harmful', why: 'Unregulated steroid-laced "herbal" creams are a notorious cause of rebound and striae in India.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Six weeks later: plaques 60% flattened on the topical combination after the propranolol switch.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'He asks what long-term monitoring his disease needs.',
              options: [
                { id: 'f1', label: 'Joint symptoms, cardiovascular risk factors (weight, lipids, BP), and drug side effects at each review', verdict: 'correct', why: 'Psoriasis is a systemic inflammatory disease — PsA surveillance and cardiometabolic screening are standard of care.' },
                { id: 'f2', label: 'Only check the skin at each visit', verdict: 'wrong', why: 'Skin-only follow-up misses arthritis and comorbidity — the two things that disable patients most.' },
                { id: 'f3', label: 'Repeat skin biopsy every 6 months', verdict: 'wrong', why: 'No role in stable classic disease.' },
                { id: 'f4', label: 'Nothing — psoriasis is only cosmetic', verdict: 'harmful', why: 'It is a systemic inflammatory disease with arthritis and cardiovascular comorbidity.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'His cousin asks whether his children will "definitely" inherit psoriasis.',
              options: [
                { id: 'f5', label: 'Genetic predisposition exists, but inheritance is multifactorial — not Mendelian; environment and triggers matter', verdict: 'correct', why: 'Polygenic susceptibility + triggers (infection, drugs, stress, obesity, smoking) — counselling avoids fatalistic genetics.' },
                { id: 'f6', label: 'Yes — it is a straightforward autosomal dominant disease', verdict: 'wrong', why: 'Psoriasis genetics are complex/polygenic; simple dominance is wrong.' },
                { id: 'f7', label: 'No — there is no genetic component at all', verdict: 'wrong', why: 'Family history is one of the strongest risk factors.' },
                { id: 'f8', label: 'Only the first-born child can be affected', verdict: 'wrong', why: 'Birth order is irrelevant.' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════════ 7 · OPHTHALMOLOGY ══════════════════════
  {
    id: 'sim-glaucoma',
    title: 'The Painful Red Eye With Haloes',
    specialty: 'Ophthalmology',
    system: 'ophthalmic',
    difficulty: 'neetpg',
    estimateMinutes: 13,
    patient: {
      age: '58', sex: 'Female', occupation: 'Homemaker',
      complaint: 'Severe right eye pain, redness, blurred vision with coloured haloes and vomiting — 4 hours',
      scene: 'A 58-year-old woman walks into the casualty holding her right eye shut at 9 PM: "We came out of the movie hall and my eye exploded with pain. I see rainbow rings around the tube light. I vomited twice on the way."',
    },
    brief: {
      diagnosis: 'Acute angle-closure glaucoma (right eye)',
      conceptIds: ['c-red-eye', 'c-poag', 'c2-opht-glaucoma'],
      learning: [
        'Painful red eye + haloes + mid-dilated fixed pupil + stony-hard globe + vomiting = acute angle-closure glaucoma — a sight-threatening emergency.',
        'At very high IOP the ischaemic iris sphincter will not respond to pilocarpine — lower the pressure first (acetazolamide ± mannitol), THEN constrict.',
        'Never dilate (atropine/mydriatics) and never treat as "conjunctivitis" — dilation can precipitate the very attack.',
        'After unilateral AACG, prophylactic laser peripheral iridotomy of BOTH eyes prevents the fellow-eye attack.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '58-year-old woman · after a movie in a dark hall · severe unilateral eye pain with haloes, vomiting ×2.',
            'She is distressed, cannot keep the right eye open.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'She can barely talk through the pain. Ask the highest-yield questions.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points matter most?',
              options: [
                { id: 'hx1', label: 'Coloured haloes around lights (before the attack)', key: true, finding: 'Recurrent rainbow haloes around bulbs in the evenings for months — self-limited subacute attacks (intermittent angle closure).' },
                { id: 'hx2', label: 'One eye or both? Vision change?', key: true, finding: 'Strictly right eye; vision blurred to "counting fingers" level — unilateral painful visual loss.' },
                { id: 'hx3', label: 'Nausea/vomiting and abdominal complaints', key: true, finding: 'Two vomits, referred to surgery first for "food poisoning" — the classic misrouting of AACG to a surgical casualty.' },
                { id: 'hx4', label: 'Old spectacles — long-sighted (hypermetropic)? Family glaucoma?', key: true, finding: 'Has worn thick convex ("plus") glasses for years; mother went blind from "eye pressure" — hypermetropia + family history = small crowded anterior segment.' },
                { id: 'hx5', label: 'Any eye drops or new medications (anticholinergics, TCA, salbutamol nebulisation)', finding: 'Started an antihistamine tablet for "allergy" last week — a mild mydriatic trigger.' },
                { id: 'hx6', label: 'Discharge or watering pattern', finding: 'No sticky discharge — against bacterial conjunctivitis.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single history feature most suggests angle CLOSURE (not open-angle glaucoma or conjunctivitis)?',
              options: [
                { id: 'k1', label: 'Recurrent evening haloes precipitated by darkness, now a full attack with vomiting', verdict: 'correct', why: 'Dim light → pupil dilation → iris bunches into the angle → pressure spike: the darkness-triggered halo prodrome is the signature of intermittent angle closure progressing to an acute attack.' },
                { id: 'k2', label: 'Unilateral painful blurred vision', verdict: 'wrong', why: 'Points away from conjunctivitis and toward serious pathology, but keratitis/uveitis also fit — not angle-closure-specific.' },
                { id: 'k3', label: 'Vomiting', verdict: 'wrong', why: 'Reflects the trigeminal-vagal response to pressure; it misdirects more diagnoses than it makes.' },
                { id: 'k4', label: 'Mother blind from "eye pressure"', verdict: 'wrong', why: 'Family history raises glaucoma probability generally; the halo-darkness pattern is the closure signature.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Torch + slit-lamp + tonometry. Examine BOTH eyes.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination steps are decisive?',
              options: [
                { id: 'ex1', label: 'Vision + ciliary vs conjunctival congestion', key: true, finding: 'Vision CF at 1 m; deep ciliary congestion around the limbus (not diffuse bulbar redness) — sight-threatening pattern.' },
                { id: 'ex2', label: 'Cornea and anterior chamber', key: true, finding: 'Cornea steamy/oedematous like "ground glass"; anterior chamber shallow and quiet-ish — oedema from pressure, not pus (no hypopyon).' },
                { id: 'ex3', label: 'Pupil', key: true, finding: 'Mid-dilated (5 mm), vertically oval, FIXED to light — the classic AACG pupil.' },
                { id: 'ex4', label: 'Intraocular pressure (digital + tonometry)', key: true, finding: 'Globe stony-hard; Goldmann IOP 48 mmHg right (normal 10–21) — the diagnosis in one number.' },
                { id: 'ex5', label: 'Discharge character', finding: 'Lacrimation only, no purulent discharge — against infective conjunctivitis.' },
                { id: 'ex6', label: 'Fellow eye anterior chamber depth (torch oblique)', finding: 'Left eye also has a shallow chamber — fellow eye at risk; prophylaxis will be needed.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'This is largely a clinical diagnosis — but confirm and stage it.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 3,
              prompt: 'Which investigations belong in the acute workup (up to three)?',
              options: [
                { id: 'iv1', label: 'Goldmann applanation tonometry', key: true, cost: 'now', finding: 'IOP 48 mmHg right eye, 18 mmHg left — confirms the acute pressure crisis.' },
                { id: 'iv2', label: 'Gonioscopy (once pressure is controlled)', key: true, cost: 'after IOP ↓', finding: 'Right angle closed for 360°; left angle occludable — confirms the mechanism and the fellow-eye risk.' },
                { id: 'iv3', label: 'Visual field charting + optic disc assessment (after attack resolves)', verdict: 'acceptable', cost: 'follow-up', why: 'Documents any glaucomatous damage from the attack; cannot be done through a hazy cornea now.' },
                { id: 'iv4', label: 'CT head (vomiting workup first)', verdict: 'harmful', cost: 'delay', why: 'Misreads an ocular emergency as a neurological one — every hour of high pressure costs ganglion cells.' },
                { id: 'iv5', label: 'Discharge home with antibiotic drops and review tomorrow', verdict: 'harmful', cost: 'dangerous', why: 'Untreated AACG can blind the eye within days — no outpatient trial in a pressure of 48.' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              prompt: 'Right eye: CF vision, ciliary congestion, steamy cornea, mid-dilated fixed pupil, shallow AC, IOP 48 mmHg. Left eye: shallow AC, IOP 18. Interpretation?',
              options: [
                { id: 'ip1', label: 'Acute angle-closure glaucoma right eye; occludable angles both eyes — ophthalmic emergency', verdict: 'correct', why: 'The pentad (pain, haloes, red eye, fixed mid-dilated pupil, hard globe) plus IOP 48 settles it; the shallow left AC mandates fellow-eye prophylaxis after the acute phase.' },
                { id: 'ip2', label: 'Acute bacterial conjunctivitis — discharge on antibiotics', verdict: 'wrong', why: 'Conjunctivitis has discharge, NO visual loss, NO fixed pupil, normal pressure and no pain of this order.' },
                { id: 'ip3', label: 'Acute anterior uveitis', verdict: 'wrong', why: 'Uveitis gives a SMALL constricted pupil, deep pain but usually lower IOP (hypotonous early), keratic precipitates — not a stony-hard globe.' },
                { id: 'ip4', label: 'Corneal abrasion with reflex vomiting', verdict: 'wrong', why: 'Abrasion pain is superficial with normal IOP, clear deep chambers and normal pupil.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The acute red eye fork:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Acute angle-closure glaucoma', verdict: 'correct', why: 'The final diagnosis.' },
                { id: 'd2', label: 'Acute anterior uveitis/iritis', verdict: 'acceptable', why: 'Painful red eye with visual loss — but small pupil, KP, and lower IOP distinguish it.' },
                { id: 'd3', label: 'Keratitis (corneal ulcer)', verdict: 'acceptable', why: 'Painful photophobic red eye; ruled out by ground-glass stromal oedema pattern and deep AC with 48 mmHg.' },
                { id: 'd4', label: 'Migraine/cluster headache with referred eye symptoms', verdict: 'acceptable', why: 'Unilateral pain + vomiting mimics neuro — but the objective ocular signs (hard globe, fixed pupil) exclude it.' },
                { id: 'd5', label: 'Bacterial conjunctivitis', verdict: 'wrong', why: 'Purulent discharge, mild discomfort, normal vision and IOP — the opposite pattern.' },
                { id: 'd6', label: 'Retinal detachment', verdict: 'wrong', why: 'Painless field loss with flashes/floaters — no painful red hard eye.' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Commit.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Most likely diagnosis?',
              options: [
                { id: 'dx1', label: 'Acute angle-closure glaucoma (right eye), fellow eye occludable', verdict: 'correct', why: 'Painful red eye + haloes + fixed mid-dilated pupil + shallow AC + IOP 48 mmHg after a dark-hall trigger.' },
                { id: 'dx2', label: 'Primary open-angle glaucoma (POAG)', verdict: 'wrong', why: 'POAG is silent and painless with cupping and field loss — no acute attacks or haloes.' },
                { id: 'dx3', label: 'Acute conjunctivitis', verdict: 'wrong', why: 'No discharge pattern, no visual loss, no pressure rise.' },
                { id: 'dx4', label: 'Acute iritis', verdict: 'wrong', why: 'Small pupil, KP, hypotonous early — opposite pupillary and pressure profile.' },
                { id: 'dx5', label: 'Acute gastroenteritis with coincidental eye redness', verdict: 'harmful', why: 'The vomiting MISLED the first casualty — the eye is the primary organ here.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'IOP 48 mmHg and climbing. The clock is running on her optic nerve.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct steps (up to six).',
              options: [
                { id: 'm1', label: 'IV acetazolamide 500 mg + topical timolol', key: true, verdict: 'correct', why: 'Systemic carbonic anhydrase inhibition + aqueous suppression drops IOP fast — first move in the attack.' },
                { id: 'm2', label: 'Topical pilocarpine 2% once IOP starts falling (<40 mmHg)', key: true, verdict: 'correct', why: 'The ischaemic sphincter at 48 mmHg will not respond; constrict AFTER pressure reduction pulls the iris out of the angle.' },
                { id: 'm3', label: 'IV mannitol if pressure does not fall', verdict: 'acceptable', why: 'Hyperosmotic agent — the next rung when acetazolamide is insufficient.' },
                { id: 'm4', label: 'Laser peripheral iridotomy (LPI) once controlled — RIGHT eye first, then LEFT eye', key: true, verdict: 'correct', why: 'LPI creates a bypass for aqueous flow — definitive attack-ender and fellow-eye prophylaxis (her left AC is occludable).' },
                { id: 'm5', label: 'Analgesia + antiemetic support', verdict: 'correct', why: 'Symptom control while definitive therapy works.' },
                { id: 'm6', label: 'Urgent ophthalmology referral — do not observe overnight', key: true, verdict: 'correct', why: 'Sight-threatening emergency; hours matter for ganglion cell survival.' },
                { id: 'm7', label: 'Atropine drops to "rest the eye"', verdict: 'harmful', why: 'Mydriasis bunches the iris into the angle — it can precipitate/worsen closure. Never dilate in AACG.' },
                { id: 'm8', label: 'Pilocarpine at full strength immediately (before lowering IOP)', verdict: 'wrong', why: 'At 48 mmHg the sphincter is ischaemic — pilocarpine fails and wastes golden time.' },
                { id: 'm9', label: 'Warm compresses and review in the morning', verdict: 'harmful', why: 'Overnight observation of an acute block is how patients lose the eye.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Next morning: IOP 16 mmHg, cornea clearing, vision 6/12. The laser schedule is posted.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'Why did pilocarpine fail at presentation but work this morning?',
              options: [
                { id: 'f1', label: 'Very high pressure ischaemised the iris sphincter; it responds only after IOP falls', verdict: 'correct', why: 'Ischaemic paralysis of the sphincter at ~40+ mmHg is the classic pharmacology exam point — sequence matters.' },
                { id: 'f2', label: 'The drop was expired yesterday', verdict: 'wrong', why: 'Reaching for exotic explanations misses the physiology.' },
                { id: 'f3', label: 'Pilocarpine needs sunlight to work', verdict: 'wrong', why: 'There is no light-activation pharmacology here.' },
                { id: 'f4', label: 'The cornea was too cloudy to absorb the drop', verdict: 'wrong', why: 'Corneal oedema blurs the view for the EXAMINER, not the drug\'s mechanism of failure.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'She asks why you insist on treating the LEFT (perfectly comfortable) eye too.',
              options: [
                { id: 'f5', label: 'Her left angle is occludable — prophylactic LPI prevents an identical (possibly blinding) attack', verdict: 'correct', why: 'Fellow-eye prophylactic iridotomy is standard after unilateral AACG — the anatomy is bilateral.' },
                { id: 'f6', label: 'Only because lasers are cheaper in bulk', verdict: 'wrong', why: 'No — it is evidence-based prevention of a second emergency.' },
                { id: 'f7', label: 'The left eye already has irreversible damage', verdict: 'wrong', why: 'It is structurally normal today; that is exactly why prophylaxis works.' },
                { id: 'f8', label: 'Drops alone can keep the left eye safe forever', verdict: 'wrong', why: 'Drugs do not fix the anatomical closure mechanism; LPI does.' },
              ],
            },
          ],
        },
      ],
    },
  },
]
