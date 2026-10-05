// ─── PRODUCT 09 · CLINICAL CASE SIMULATOR — curated case library (pack B) ────
// Content original. Same brief schema as pack A (import the shared types).

import type { SimSeedCase } from './seed-sim-cases-a'

export const simCasesPackB: SimSeedCase[] = [
  // ═══════════════════════════════ 8 · ENT ════════════════════════════════
  {
    id: 'sim-epistaxis',
    title: 'The Nosebleed That Would Not Stop',
    specialty: 'ENT',
    system: 'ent',
    difficulty: 'beginner',
    estimateMinutes: 11,
    aiReady: true,
    patient: {
      age: '62', sex: 'Male', occupation: 'Shopkeeper',
      complaint: 'Bleeding from the right nose for 40 minutes, not stopping',
      scene: 'A 62-year-old shopkeeper rushes into ENT casualty clutching a blood-soaked handkerchief to his nose. "Forty minutes, doctor — it fills up again the moment I loosen my grip." His wife says he is a known hypertensive who "forgets tablets sometimes".',
    },
    brief: {
      diagnosis: 'Anterior epistaxis from Little\'s area (Kiesselbach plexus), aggravated by uncontrolled hypertension + aspirin',
      conceptIds: ['c2-ent-epistaxis', 'c-htn'],
      learning: [
        'First aid is a genuine treatment: sit up, lean FORWARD, pinch the SOFT part of the nose 10–15 min continuously.',
        '90% of epistaxis is anterior (Little\'s area) — cautery of the visible vessel is first-line; packing if cautery fails.',
        'Posterior bleed suspicion = blood in the pharynx from both nostrils → admit; posterior packing ± SPA ligation/embolisation.',
        'Always hunt the drivers: blood pressure, anticoagulants/antiplatelets, coagulopathy.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '62-year-old male · shopkeeper · bleeding from the right nostril for 40 minutes.',
            'Handkerchief soaked thrice. Known hypertension, irregular tablets.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'While he holds pressure, take a rapid but targeted history.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points will change what you do in the next ten minutes?',
              options: [
                { id: 'hx1', label: 'Which nostril started the bleed — front or back of throat?', key: true, finding: 'Bleeding started from the RIGHT nostril in front; he spits a little blood when he swallows, but no continuous pharyngeal trickle — anterior pattern.' },
                { id: 'hx2', label: 'Blood pressure control and tablets', key: true, finding: 'Amlodipine + losartan "most days"; BP was 160/95 at the pharmacy last week — uncontrolled hypertension is a major driver.' },
                { id: 'hx3', label: 'Aspirin or blood thinners', key: true, finding: 'Takes aspirin 75 mg daily "for the heart" prescribed by a cardiologist two years ago — platelet function impaired.' },
                { id: 'hx4', label: 'Trauma, nose picking, recent cold/surgery', finding: 'No trauma, no habit of nose-picking, no recent surgery; mild dryness this winter.' },
                { id: 'hx5', label: 'Bleeding elsewhere — gums, bruises, family bleeding disorder', finding: 'No gum bleeding, no unusual bruises, no family history of bleeding disorders — against a coagulopathy.' },
                { id: 'hx6', label: 'Liver disease or alcohol', finding: 'No jaundice/hepatitis history; occasional social drinks — liver-related coagulopathy unlikely.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single history element most predicts this will need MORE than first aid?',
              options: [
                { id: 'k1', label: 'Aspirin + uncontrolled BP together with a 40-minute bleed', verdict: 'correct', why: 'Impaired platelets + high pressure + persistent duration is the triad that defeats simple pressure — anticipate cautery/packing and physician coordination, not just first aid.' },
                { id: 'k2', label: 'Winter dryness', verdict: 'wrong', why: 'A precipitant, not a severity predictor.' },
                { id: 'k3', label: 'No family bleeding history', verdict: 'wrong', why: 'Reassuring, but absence does not guide intervention intensity.' },
                { id: 'k4', label: 'No trauma', verdict: 'wrong', why: 'Trauma would change imaging priorities; its absence does not escalate care.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'He is pale-looking but talking. Headlight, suction, and speculum are ready.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination steps guide the intervention?',
              options: [
                { id: 'ex1', label: 'Vitals — BP, pulse, signs of hypovolaemia', key: true, finding: 'BP 168/98, pulse 96 regular; no postural symptoms — significant hypertension but not yet hypovolaemic.' },
                { id: 'ex2', label: 'Anterior rhinoscopy — identify the bleeding point', key: true, finding: 'An active spurter on the anterior septum (Little\'s area/Kiesselbach plexus) right side — the target for cautery.' },
                { id: 'ex3', label: 'Throat/pharynx check for posterior trickle', key: true, finding: 'Occasional spit of old blood; no continuous posterior stream — posterior bleed unlikely.' },
                { id: 'ex4', label: 'Bleeding diathesis signs (petechiae, gum ooze, IV-site oozing)', finding: 'None — no systemic diathesis pattern on exam.' },
                { id: 'ex5', label: 'Other nostril', finding: 'Left nostril dry, no active bleeding.' },
                { id: 'ex6', label: 'Nasal endoscopy now', verdict: 'acceptable', why: 'Reserved when the bleeding point cannot be seen anteriorly or posterior bleed suspected — not needed to start here.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'Anterior epistaxis management is hands-on; labs support the driver hunt.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 3,
              prompt: 'Which investigations do you send while controlling the bleed (up to three)?',
              options: [
                { id: 'iv1', label: 'CBC (Hb, platelets)', key: true, cost: '20 min', finding: 'Hb 12.4 g/dL, platelets 2.1 lakh — no anaemia or thrombocytopenia.' },
                { id: 'iv2', label: 'Coagulation profile (PT/INR, aPTT)', key: true, cost: '40 min', finding: 'INR 1.0, aPTT normal — aspirin effect does not show here; platelet function is the issue.' },
                { id: 'iv3', label: 'Group & save (if Hb drops or bleeding recurs)', verdict: 'acceptable', cost: 'if needed', why: 'Sensible contingency in a hypertensive aspirin user — not mandatory for the first controlled episode.' },
                { id: 'iv4', label: 'X-ray skull/paranasal sinuses', verdict: 'harmful', cost: 'delay', why: 'Radiology contributes nothing to an anterior bleed — time spent on an X-ray is time bleeding.' },
                { id: 'iv5', label: 'Nasal endoscopy (after control, if recurrent)', verdict: 'acceptable', cost: 'later', why: 'Right tool for RECURRENT unilateral bleeds to exclude a tumour — a follow-up plan item, not the emergency action.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'Where could this blood be coming from?',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the sources/causes you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Anterior epistaxis — Little\'s area vessel', verdict: 'correct', why: 'Visible spurter on the anterior septum — the commonest site (~90%).'},
                { id: 'd2', label: 'Posterior epistaxis (sphenopalatine artery territory)', verdict: 'acceptable', why: 'Must be actively excluded — pharyngeal trickle would have flipped the plan to admission and posterior packing.' },
                { id: 'd3', label: 'Hypertension as the aggravating driver', verdict: 'acceptable', why: '168/98 with missed tablets — treating BP is part of treating the bleed.' },
                { id: 'd4', label: 'Coagulopathy / platelet dysfunction (aspirin)', verdict: 'acceptable', why: 'Antiplatelet effect is real and changes escalation threshold.' },
                { id: 'd5', label: 'Nasal/nasopharyngeal tumour', verdict: 'wrong', why: 'A consideration in recurrent UNILATERAL bleeds with obstruction — this is his first episode with a visible vessel.' },
                { id: 'd6', label: 'Hereditary haemorrhagic telangiectasia', verdict: 'wrong', why: 'Recurrent multi-site telangiectatic bleeds with family history — absent here.' },
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
              prompt: 'Working diagnosis?',
              options: [
                { id: 'dx1', label: 'Anterior epistaxis from Little\'s area, driven by uncontrolled hypertension + aspirin', verdict: 'correct', why: 'Visible anterior spurter + BP 168/98 + daily aspirin — all three modifiable at once.' },
                { id: 'dx2', label: 'Posterior epistaxis', verdict: 'wrong', why: 'No continuous pharyngeal trickle; bleeding point seen anteriorly.' },
                { id: 'dx3', label: 'Bleeding diathesis', verdict: 'wrong', why: 'Platelets and coagulation profile normal; no systemic stigmata.' },
                { id: 'dx4', label: 'Nasal tumour', verdict: 'wrong', why: 'First episode, visible anterior vessel, no mass on rhinoscopy — endoscopy only if it recurs.' },
                { id: 'dx5', label: 'Sinusitis with haemorrhage', verdict: 'wrong', why: 'No facial pain, purulence or fever.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'Suction on, headlight on. Sequence your actions.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct steps (up to six).',
              options: [
                { id: 'm1', label: 'Sit patient up, lean forward, firm pressure on the SOFT nose 10–15 min (re-attempt in rounds)', key: true, verdict: 'correct', why: 'Compression of Kiesselbach\'s plexus — correct technique (soft triangle, NOT the bony bridge; leaning FORWARD prevents swallowed blood and nausea).' },
                { id: 'm2', label: 'Topical vasoconstrictor (oxymetazoline/lignocaine+adrenaline pledget) then CAUTERY of the bleeding point', key: true, verdict: 'correct', why: 'Silver nitrate (or electrocautery) of the identified vessel is the definitive anterior first-line.' },
                { id: 'm3', label: 'Anterior packing (Merocel/ribbon gauze, BIPP) if cautery fails or bleeding re-starts', key: true, verdict: 'correct', why: 'Packing tamponades what cautery cannot reach; leave 24–48 h.' },
                { id: 'm4', label: 'Control BP now (oral agent per physician; keep him calm)', key: true, verdict: 'correct', why: 'Pressure control is bleeding control — a core part of the plan, not an afterthought.' },
                { id: 'm5', label: 'Coordinate aspirin continuation vs pause with his cardiologist', key: true, verdict: 'correct', why: 'The decision is shared (cardiac risk vs bleed severity) — unilateral "stop all thinners" or "ignore it" are both wrong.' },
                { id: 'm6', label: 'Antibiotics while packing is in place (toxic-shock prophylaxis)', verdict: 'acceptable', why: 'Standard supportive care during packing days.' },
                { id: 'm7', label: 'Immediate posterior packing and theatre before any anterior attempt', verdict: 'harmful', why: 'Posterior measures are for posterior bleeds — he has a visible anterior vessel.' },
                { id: 'm8', label: 'Send home with "blow the nose hard to clear clots" advice', verdict: 'harmful', why: 'Nose-blowing dislodges clot — the classic immediate re-bleed instruction.' },
                { id: 'm9', label: 'Tilt his head BACK to reduce visible bleeding', verdict: 'harmful', why: 'Swallowed blood → vomiting → re-bleed; the "reassuring tilt" is the commonest lay mistake.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Cautery + 24 h of packing later: dry right anterior septum, BP 142/86 on adjusted tablets.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'During packing removal he starts gushing from BOTH nostrils with blood running down the throat. What now?',
              options: [
                { id: 'f1', label: 'Posterior bleed — resuscitate, posterior packing/balloon, admit; prepare for SPA ligation or embolisation', verdict: 'correct', why: 'Bilateral + pharyngeal flow flips the diagnosis to posterior — airway watch, admission and escalation ladder (posterior pack → SPA ligation → embolisation).' },
                { id: 'f2', label: 'Insert another anterior pack and discharge', verdict: 'harmful', why: 'A posterior bleed defeats anterior packs and can obstruct the airway unobserved at home.' },
                { id: 'f3', label: 'Do a skull X-ray', verdict: 'harmful', why: 'Again — imaging is not haemostasis.' },
                { id: 'f4', label: 'Wait 30 minutes for it to stop spontaneously', verdict: 'harmful', why: 'Observing an active posterior bleed in a hypertensive aspirin user risks exsanguination and airway compromise.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'Discharge advice — which single line prevents most recurrences?',
              options: [
                { id: 'f5', label: 'Saline gel/petroleum jelly, avoid nose-picking & forceful blowing, control BP daily, return early if it recurs', verdict: 'correct', why: 'Moisturisation + mechanical avoidance + BP control hits every driver identified today.' },
                { id: 'f6', label: 'Steam inhalation with eucalyptus thrice daily', verdict: 'wrong', why: 'Comfort at best; does not address dryness mechanics or BP.' },
                { id: 'f7', label: 'Stop ALL physical activity permanently', verdict: 'wrong', why: 'Unnecessary and counterproductive counselling.' },
                { id: 'f8', label: 'Self-adjust aspirin dose as he feels fit', verdict: 'harmful', why: 'Antiplatelet decisions belong to him AND the cardiologist, never solo dose fiddling.' },
              ],
            },
          ],
        },
      ],
      aiBrief: {
        persona: '62-year-old male shopkeeper, agitated, pinching his nose with a blood-soaked handkerchief, speaks in short worried sentences, worried about "sugar and pressure".',
        intro: 'Doctor, it won\'t stop… forty minutes now. The cloth is full again. Please do something.',
        hidden: [
          { ask: 'which nostril / side / started', reveal: 'From the right side, doctor — the front part. It drips a little at the back of my throat when I swallow but mostly it comes from the front.' },
          { ask: 'pressure / BP / blood pressure / tablets', reveal: 'I take amlodipine and losartan… most days, doctor. Last week at the medical shop the machine showed 160 over 95.' },
          { ask: 'aspirin / blood thinner / ecospirin / heart tablet', reveal: 'Yes doctor, the heart doctor gave me one white tablet in the morning — aspirin, since two years.' },
          { ask: 'injury / hitting / picking / operation', reveal: 'Nothing like that — no injury, no operation. This winter the nose feels dry, that is all.' },
          { ask: 'gums / bruise / bleeding elsewhere / family', reveal: 'No doctor, no gum bleeding, no blue marks on the body, nobody in the family has this bleeding problem.' },
          { ask: 'liver / alcohol / jaundice', reveal: 'No jaundice ever. Only two pegs at a wedding, that\'s all.' },
        ],
        exam: [
          { ask: 'vitals / BP / pulse', reveal: 'The nurse says 168/98 and pulse 96.' },
          { ask: 'nose / inside / bleeding point / look', reveal: 'You see a small vessel spurting on the front partition of the right side (Little\'s area).' },
          { ask: 'throat / back / posterior', reveal: 'Only old blood that I spit sometimes — no steady stream coming down the throat.' },
          { ask: 'other nostril / left', reveal: 'The left side is dry, no bleeding.' },
          { ask: 'pallor / weakness / dizzy', reveal: 'I look pale in the mirror but I am not feeling faint right now.' },
        ],
        investigations: [
          { ask: 'CBC / haemoglobin / Hb / platelets', result: 'Hb 12.4 g/dL, platelets 2.1 lakh — normal.' },
          { ask: 'INR / PT / coagulation / clotting', result: 'INR 1.0, aPTT normal.' },
          { ask: 'group / crossmatch', result: 'Group B positive, kept on hold in case bleeding recurs.' },
        ],
        style: 'Never name the diagnosis or say what treatment is needed even if asked ("what will you do, doctor?" → "Please examine first, doctor"). Only reveal what is asked using the material above; anything else: "No, that is not there" / "That has not been done". Maximum 80 words per reply. You are the patient.',
      },
    },
  },

  // ═══════════════════════════════ 9 · ORTHOPAEDICS ═══════════════════════
  {
    id: 'sim-compartment',
    title: 'Pain Out of Proportion After the Fall',
    specialty: 'Orthopaedics',
    system: 'musculoskeletal',
    difficulty: 'neetpg',
    estimateMinutes: 13,
    patient: {
      age: '34', sex: 'Male', occupation: 'Construction worker',
      complaint: 'Crushing pain in the right leg 6 hours after a fall, worse since the plaster',
      scene: 'A 34-year-old construction worker fell from scaffolding 6 hours ago. A village clinic put on a tight above-knee plaster for a "broken leg bone". He arrives moaning: "Doctor, the pain is unbearable — it keeps getting worse even with painkillers. My toes feel like they are burning when touched."',
    },
    brief: {
      diagnosis: 'Acute compartment syndrome of the right leg (tibial fracture + tight cast)',
      conceptIds: ['c-compartment', 'c2-orth-compartment'],
      learning: [
        'Pain out of proportion + pain on PASSIVE STRETCH is the earliest and most reliable sign; the classic 5 Ps (esp. pulselessness) are LATE — normal pulses NEVER exclude compartment syndrome.',
        'Split the plaster and dressings down to skin FIRST — this alone may drop compartment pressure.',
        'Keep the limb AT HEART LEVEL (elevation above the heart reduces perfusion pressure).',
        'Diagnosis is clinical; compartment pressure measurement (within 30 mmHg of diastolic) is for equivocal/uncommunicative patients. Treatment: emergency two-incision four-compartment fasciotomy.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '34-year-old male · fall from height 6 h ago · above-knee plaster applied 4 h ago at a village clinic.',
            'Progressively worsening right leg pain despite analgesics; "burning" toes on touch.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'The clock matters more than anything else in this conversation.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR questions build the suspicion fastest?',
              options: [
                { id: 'hx1', label: 'Pain timeline — worse since plaster? Relieved by anything?', key: true, finding: 'Pain exploded over the last 2 hours; Increasing despite two doses of tramadol — a red flag that this is not ordinary fracture pain.' },
                { id: 'hx2', label: 'Numbness, tingling or colour change in toes', key: true, finding: 'Toe tingling started an hour ago; toes look pink at rest — paraesthesia is an EARLY sign.' },
                { id: 'hx3', label: 'Injury mechanism and time since injury/plaster', key: true, finding: 'Axial load fall 6 h ago; plaster 4 h ago — the syndrome window (commonly 2–6 h) fits perfectly.' },
                { id: 'hx4', label: 'Blood thinner use / bleeding disorders', finding: 'None — no bleeding diathesis to complicate fasciotomy.' },
                { id: 'hx5', label: 'Pain character — deep, crushing, out of proportion?', finding: '"Like the leg is in a vice and something is bursting inside" — the classic description students must learn to hear.' },
                { id: 'hx6', label: 'Fever or previous leg problems', finding: 'No fever, no prior leg surgery or vein problems.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single historical feature shouts COMPARTMENT SYNDROME rather than fracture pain?',
              options: [
                { id: 'k1', label: 'Pain escalating and out of proportion despite analgesia', verdict: 'correct', why: 'Ordinary fracture pain settles with immobilisation + analgesia; rising, deepening, analgesia-resistant pain is the hallmark of rising intracompartmental pressure.' },
                { id: 'k2', label: 'Toe tingling', verdict: 'wrong', why: 'Early nerve ischaemia — supports the diagnosis strongly, but pain pattern is the presenting alarm.' },
                { id: 'k3', label: 'Fall from height', verdict: 'wrong', why: 'Explains the fracture; not the syndrome.' },
                { id: 'k4', label: 'No blood thinners', verdict: 'wrong', why: 'Relevant to surgical planning only.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'The plaster looks intact. What do you do with your hands?',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination steps are decisive?',
              options: [
                { id: 'ex1', label: 'PASSIVE STRETCH test of the toes (dorsiflexion/plantarflexion)', key: true, finding: 'Exquisite pain on passive stretch of the toe flexors — the single most reliable early clinical sign.' },
                { id: 'ex2', label: 'Palpate the leg compartments (tense, tender?)', key: true, finding: 'Anterior and deep posterior compartments tense and firm like wood; fascia feels rigid — pressure is up.' },
                { id: 'ex3', label: 'Distal pulses + capillary refill', key: true, finding: 'Dorsalis pedis and posterior tibial pulses PALPABLE, capillary refill <2 s — pulses present does NOT exclude the syndrome (this is the exam trap).' },
                { id: 'ex4', label: 'Sensation map (deep peroneal, posterior tibial)', key: true, finding: 'Reduced sensation in the first web space (deep peroneal) — early nerve ischaemia.' },
                { id: 'ex5', label: 'Skin colour and temperature', finding: 'Pink and warm at rest — perfusion not yet lost; do NOT wait for pallor/pulselessness.' },
                { id: 'ex6', label: 'Motor power of toes/ankle', finding: 'Toe movements weak and painful — early motor involvement.' },
              ],
            },
            {
              id: 'in-ex-key', kind: 'key',
              prompt: 'Pulses are NORMAL. A colleague says "pulse is fine, so no compartment syndrome." Your response?',
              options: [
                { id: 'k1', label: 'Wrong — ischaemia of muscle/nerve occurs at pressures BELOW arterial occlusion; pulselessness is a LATE, pre-gangrene sign', verdict: 'correct', why: 'Capillary perfusion fails when tissue pressure approaches diastolic pressure — long before the artery stops flowing. Waiting for absent pulses means waiting for necrosis.' },
                { id: 'k2', label: 'Agree — normal pulses exclude the diagnosis', verdict: 'harmful', why: 'The most catastrophic exam/triage error in orthopaedics — converts a reversible emergency into Volkmann-type loss.' },
                { id: 'k3', label: 'Order a Doppler to be sure before acting', verdict: 'wrong', why: 'Doppler confirms what the pulse already shows — arterial patency. It answers the WRONG question.' },
                { id: 'k4', label: 'Discharge with stronger painkillers', verdict: 'harmful', why: 'Analgesia hides the only monitoring tool you have — the pain trend.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'Your clinical picture is the diagnosis. Choose what helps.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 3,
              prompt: 'Which investigations/orders matter (up to three)?',
              options: [
                { id: 'iv1', label: 'Split the plaster + remove dressings NOW and re-examine', key: true, cost: 'zero', finding: 'Cast and crepe cut, dressing split to skin: pain drops a little but passive-stretch pain and tense compartments persist — the diagnosis stands.' },
                { id: 'iv2', label: 'Intracompartmental pressure measurement', key: true, cost: '15 min', finding: 'Anterior compartment 38 mmHg (BP 132/84 → diastolic 84; within 30 mmHg of diastolic) — confirmatory in an equivocal/uncooperative case; here it corroborates the clinical diagnosis.' },
                { id: 'iv3', label: 'X-ray tibia (already known fracture; plan fixation)', verdict: 'acceptable', cost: 'after fasciotomy', why: 'The fracture needs fixation eventually — but NEVER before the fasciotomy decision.' },
                { id: 'iv4', label: 'CK + renal function (rhabdomyolysis watch)', verdict: 'acceptable', cost: 'parallel', finding: 'CK 8,400 U/L, creatinine 1.3 — muscle injury beginning; IV fluids started for renal protection.' },
                { id: 'iv5', label: 'MRI of the leg before deciding on surgery', verdict: 'harmful', cost: 'delay', why: 'MRI cannot rule out early compartment syndrome and burns golden hours — a diagnosis that lives in the hands, not the scanner.' },
                { id: 'iv6', label: 'Doppler ultrasound of leg arteries', verdict: 'wrong', cost: 'wrong question', why: 'Pulses are present; the question is tissue perfusion pressure, not arterial patency.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'What else makes a post-fracture leg scream?',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Acute compartment syndrome', verdict: 'correct', why: 'The final diagnosis.' },
                { id: 'd2', label: 'Arterial injury (popliteal/tibial)', verdict: 'acceptable', why: 'The dangerous alternative — excluded by palpable pulses, warm pink foot; would need CT angiogram if pulses were absent.' },
                { id: 'd3', label: 'Tight cast simply pressing (external pressure)', verdict: 'acceptable', why: 'A real contributor — splitting the cast is the first move; but persistent signs after splitting mean the compartments themselves are the problem.' },
                { id: 'd4', label: 'Deep vein thrombosis', verdict: 'acceptable', why: 'Calf pain and swelling in an immobilised limb — but DVT does not give passive-stretch agony or paraesthesia of this pattern.' },
                { id: 'd5', label: 'Cellulitis', verdict: 'wrong', why: 'No fever, no erythema/lymphangitis — and 6-hour timelines do not build cellulitis.' },
                { id: 'd6', label: 'Normal post-fracture pain', verdict: 'harmful', why: 'The mislabel that kills limbs — "pain is expected after fracture" is how fasciotomies get missed.' },
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
                { id: 'dx1', label: 'Acute compartment syndrome of the right leg', verdict: 'correct', why: 'Escalating disproportionate pain + passive-stretch agony + tense compartments + paraesthesia with PRESENT pulses after tibial fracture and cast application.' },
                { id: 'dx2', label: 'Acute arterial occlusion', verdict: 'wrong', why: 'Pulses present, foot pink and warm — arterial inflow is intact.' },
                { id: 'dx3', label: 'Simple tight cast discomfort', verdict: 'harmful', why: 'Splitting the cast improved pain only partially — compartment pressures remain pathological.' },
                { id: 'dx4', label: 'Popliteal DVT', verdict: 'wrong', why: 'No passive-stretch agony, no paraesthesia; the time course (hours) is too acute.' },
                { id: 'dx5', label: 'Crush injury with rhabdomyolysis alone', verdict: 'wrong', why: 'CK rise is a CONSEQUENCE here, not the primary diagnosis — the compartment is the source.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'You are the on-call orthopaedic registrar. Move.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct steps (up to six).',
              options: [
                { id: 'm1', label: 'Emergency two-incision FOUR-compartment fasciotomy — the definitive treatment', key: true, verdict: 'correct', why: 'Anterior + lateral (one incision), superficial + deep posterior (second): every compartment released, vital structures preserved.' },
                { id: 'm2', label: 'Keep limb AT HEART LEVEL after splitting the cast', key: true, verdict: 'correct', why: 'Elevation above the heart drops capillary pressure and worsens ischaemia — a counter-intuitive classic.' },
                { id: 'm3', label: 'Split plaster + dressings down to skin immediately', key: true, verdict: 'correct', why: 'Removes external pressure; can drop compartment pressures 10–30 mmHg on its own.' },
                { id: 'm4', label: 'IV analgesia (and fluids for rhabdomyolysis/renal protection)', verdict: 'correct', why: 'CK 8,400 → vigorous crystalloids protect kidneys; analgesia before theatre.' },
                { id: 'm5', label: 'Book theatre; consent; watch potassium/myoglobinuria', verdict: 'correct', why: 'Hyperkalaemia from muscle breakdown can arrest — ECG and K+ monitoring in parallel.' },
                { id: 'm6', label: 'Elevate the leg on 3 pillows and observe overnight with ice packs', verdict: 'harmful', why: 'Elevation + ice = less perfusion + delayed diagnosis — the standard first-day mistake.' },
                { id: 'm7', label: 'Wait for the "5 Ps" to complete before surgery', verdict: 'harmful', why: 'Pulselessness and pallor are LATE — by then muscle is dying. The 5 Ps describe a dying limb, not an evolving one.' },
                { id: 'm8', label: 'Immediate internal fixation of the tibia through swollen skin', verdict: 'harmful', why: 'Operating through tense swollen skin risks wound necrosis; fasciotomy first, fixation once soft tissue allows (or with the fasciotomy if planned together).' },
                { id: 'm9', label: 'Discharge on oral analgesics with review in a week', verdict: 'harmful', why: 'Six hours from now this patient has Volkmann contracture and a ruined limb.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Fasciotomy done 40 minutes after arrival: all four compartments released, muscle pink and contractile. He asks about the numb big toe.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'Which late complication was this emergency designed to PREVENT?',
              options: [
                { id: 'f1', label: 'Ischaemic (Volkmann) contracture + permanent nerve injury', verdict: 'correct', why: 'Muscle necrosis → fibrosis → contracture; deep peroneal/peroneal nerve injury → foot drop and numbness. Both are preventable only by EARLY decompression.' },
                { id: 'f2', label: 'Chronic venous ulcer', verdict: 'wrong', why: 'Venous disease is unrelated to compartment pathophysiology.' },
                { id: 'f3', label: 'Wound infection alone', verdict: 'wrong', why: 'Possible but not the feared irreversible outcome; the contracture is the monster.' },
                { id: 'f4', label: 'Re-fracture', verdict: 'wrong', why: 'Fixation planning handles the fracture; the syndrome is the race against the clock.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'The wound is left open after fasciotomy. What is the standard plan?',
              options: [
                { id: 'f5', label: 'Delayed primary closure or skin grafting in a few days once swelling settles', verdict: 'correct', why: 'Fasciotomy wounds are never force-closed on day 0 — the swollen muscle needs room; closure/grafting follows in ~5–7 days.' },
                { id: 'f6', label: 'Immediate tight closure to prevent infection', verdict: 'harmful', why: 'Re-creates the pressure you just released — re-precipitates the syndrome.' },
                { id: 'f7', label: 'Negative-pressure dressing forever', verdict: 'wrong', why: 'NPWT is a bridge, not a permanent state.' },
                { id: 'f8', label: 'Amputation is inevitable', verdict: 'wrong', why: 'With timely fasciotomy, salvage is the norm — amputation is the failure mode of delay.' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════════ 10 · RADIOLOGY ═════════════════════════
  {
    id: 'sim-freeair',
    title: 'The Erect Film Every Surgeon Fears',
    specialty: 'Radiology',
    system: 'gastrointestinal',
    difficulty: 'neetpg',
    estimateMinutes: 13,
    imageKey: 'cxr-free-air',
    imageCaption: 'Erect chest X-ray — free air under both hemidiaphragms (educational image, platform-owned)',
    patient: {
      age: '68', sex: 'Male', occupation: 'Retired clerk',
      complaint: 'Sudden severe abdominal pain 5 hours ago, now constant and spreading',
      scene: 'A 68-year-old retired clerk is brought in clutching his abdomen: "It hit me like a knife during dinner — started above the navel and now the whole belly is hard like wood." Known duodenal ulcer on self-medicated antacids; takes painkillers for backache daily.',
    },
    brief: {
      diagnosis: 'Perforated duodenal ulcer with generalized peritonitis (pneumoperitoneum)',
      conceptIds: ['c2-rad-cxr', 'c-cxr', 'c2-surgery-acute-abdomen', 'c-ulcer'],
      learning: [
        'Sudden knife-like epigastric pain → board-like rigidity in an ulcer patient = perforation until proven otherwise.',
        'Erect CXR detects pneumoperitoneum in ~70–80% of perforations; if the patient cannot stand, do a left lateral decubitus film.',
        'Never order barium studies in suspected perforation — water-soluble contrast if needed, barium peritonitis is a disaster.',
        'Resuscitate → nil orally → NG tube → IV antibiotics → Graham (omental) patch repair; then H. pylori eradication and NSAID avoidance.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '68-year-old male · sudden knife-like abdominal pain 5 h ago during dinner · now constant and generalised.',
            'Known duodenal ulcer; daily self-medicated NSAIDs for backache.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'He lies still — "every movement hurts". Ask fast.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points drive this workup?',
              options: [
                { id: 'hx1', label: 'Mode of onset — sudden? Where did it start and spread?', key: true, finding: 'Pain began instantaneously over a meal, epigastric, then spread to the whole abdomen within an hour — perforation pattern.' },
                { id: 'hx2', label: 'Ulcer history and NSAID intake', key: true, finding: 'Burning pain for months, antacids bought over the counter; daily diclofenac for backache — the perforation setup.' },
                { id: 'hx3', label: 'Vomiting, distension, last motion/flatus', key: true, finding: 'Vomited twice initially; abdomen feels swollen; last flatus this morning — ileus setting in.' },
                { id: 'hx4', label: 'Cardiac history — chest pain, prior MI?', key: true, finding: 'No chest pain, no prior cardiac events — keeps the inferior-MI mimic lower on the list (must still get an ECG).' },
                { id: 'hx5', label: 'Previous surgeries or similar episodes', finding: 'No abdominal surgeries; no similar attacks.' },
                { id: 'hx6', label: 'Alcohol', finding: 'Occasional — not the lead factor here.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single history element most directly predicts a perforated viscus?',
              options: [
                { id: 'k1', label: 'Instantaneous epigastric pain that generalised over one hour in a chronic NSAID-using ulcer patient', verdict: 'correct', why: 'Sudden onset + rapid generalisation = peritoneal contamination from a perforation; chronic ulcer + NSAIDs supplies the weakened wall.' },
                { id: 'k2', label: 'Abdominal distension', verdict: 'wrong', why: 'Reflects the secondary ileus — a downstream consequence, not the cause.' },
                { id: 'k3', label: 'No prior MI', verdict: 'wrong', why: 'Excludes a mimic; does not confirm the perforation.' },
                { id: 'k4', label: 'Occasional alcohol', verdict: 'wrong', why: 'Background noise in this presentation.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'He lies motionless; the classic "surgical corpse" stillness. Vitals: BP 96/62, HR 118, T 37.6°C.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination findings will you elicit?',
              options: [
                { id: 'ex1', label: 'Abdominal wall — rigidity and guarding', key: true, finding: 'Board-like generalised rigidity with rebound — chemical+ bacterial peritonitis.' },
                { id: 'ex2', label: 'Bowel sounds', key: true, finding: 'Silent abdomen — paralytic ileus from peritoneal irritation.' },
                { id: 'ex3', label: 'Loss of liver dullness', key: true, finding: 'Liver dullness diminished — free air interposing over the liver surface (supportive, not definitive).' },
                { id: 'ex4', label: 'Chest examination + ECG', key: true, finding: 'Chest clear; ECG sinus tachycardia, no ST elevation — inferior-MI mimic excluded before theatre.' },
                { id: 'ex5', label: 'Temperature trend', finding: '37.6°C early — fever is often minimal in chemical peritonitis; do not require it.' },
                { id: 'ex6', label: 'Per-rectal examination', finding: 'No mass, no tenderness in the rectovesical pouch; no blood.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'Choose the tests that confirm and prepare for theatre.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR investigations/orders now?',
              options: [
                { id: 'iv1', label: 'ERECT chest X-ray', key: true, cost: '10 min', finding: 'Free air under BOTH hemidiaphragms (crescent sign) — pneumoperitoneum confirmed. See the image in the next step.' },
                { id: 'iv2', label: 'CBC, electrolytes, renal function, blood sugar', key: true, cost: '40 min', finding: 'WBC 15.8 ×10⁹/L; Na 134, K 3.4; urea 48 — pre-op correction targets.' },
                { id: 'iv3', label: 'Serum amylase/lipase', key: true, cost: '40 min', finding: 'Amylase 220 U/L (mildly raised — can rise in perforation too), lipase normal — pancreatitis effectively excluded.' },
                { id: 'iv4', label: 'ECG + group & crossmatch (pre-op)', verdict: 'acceptable', cost: 'parallel', finding: 'ECG clean; 2 units crossmatched — theatre readiness.' },
                { id: 'iv5', label: 'CT abdomen with ORAL barium contrast', verdict: 'harmful', cost: 'dangerous', why: 'Barium outside the gut = chemical peritonitis nightmare. If CT is needed at all (equivocal cases), it uses WATER-SOLUBLE contrast — and in this classic case it is not needed.' },
                { id: 'iv6', label: 'Barium meal follow-through', verdict: 'harmful', cost: 'catastrophic', why: 'The historical test for ulcer disease has no role in suspected perforation — barium into the peritoneum is a surgeon\'s nightmare.' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              imageKey: 'cxr-free-air',
              imageCaption: 'Erect chest X-ray — free air under both hemidiaphragms (educational image, platform-owned)',
              prompt: 'Look at this erect chest X-ray of the patient. What does it show and what does it mean?',
              options: [
                { id: 'ip1', label: 'Free air (pneumoperitoneum) under both hemidiaphragms = hollow viscus perforation → emergency laparotomy after resuscitation', verdict: 'correct', why: 'The crescent of lucency under the diaphragm with this history of sudden generalised peritonitis is a perforation — imaging confirms what the hands already suspected.' },
                { id: 'ip2', label: 'Chilaiditi sign — benign colonic interposition, reassure', verdict: 'wrong', why: 'Chilaiditi is an ASYMPTOMATIC radiological curiosity; this patient is in peritonitis — clinical context decides, not the X-ray alone.' },
                { id: 'ip3', label: 'Residual post-operative gas — explain and observe', verdict: 'wrong', why: 'He has never had laparoscopic surgery — no source for iatrogenic gas.' },
                { id: 'ip4', label: 'Bilateral basal pneumonia', verdict: 'wrong', why: 'The lucency is free air under the diaphragm, not basal consolidation; no cough/fever story.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The rigid-abdomen shortlist:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Perforated peptic ulcer', verdict: 'correct', why: 'The final diagnosis — ulcer history + NSAIDs + instantaneous generalisation + free air.' },
                { id: 'd2', label: 'Acute pancreatitis', verdict: 'acceptable', why: 'Also sudden epigastric pain with rigidity — lipase normal, free air present, pancreatitis excluded.' },
                { id: 'd3', label: 'Acute myocardial infarction (inferior)', verdict: 'acceptable', why: 'Elderly, sudden epigastric pain + vomiting — ECG was clean; must always be on the elderly sudden-pain list.' },
                { id: 'd4', label: 'Ruptured abdominal aortic aneurysm', verdict: 'acceptable', why: 'Sudden severe abdominal pain + hypotension in a 68-year-old — excluded by pain location and lack of pulsatile mass; a danger differential.' },
                { id: 'd5', label: 'Acute gastroenteritis', verdict: 'wrong', why: 'Crampy diarrhoeal illness — not a board-like silent abdomen.' },
                { id: 'd6', label: 'Biliary colic', verdict: 'wrong', why: 'RUQ, colicky, subacute — the opposite tempo and location.' },
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
                { id: 'dx1', label: 'Perforated duodenal ulcer with generalised peritonitis', verdict: 'correct', why: 'All four legs of the table hold: chronic ulcer + NSAIDs, sudden generalised peritonitis, pneumoperitoneum, clean ECG.' },
                { id: 'dx2', label: 'Acute pancreatitis', verdict: 'wrong', why: 'Normal lipase and pneumoperitoneum point elsewhere.' },
                { id: 'dx3', label: 'Inferior wall MI', verdict: 'wrong', why: 'Clean ECG; peritonitis signs dominate.' },
                { id: 'dx4', label: 'Ruptured AAA', verdict: 'wrong', why: 'No pulsatile expansile mass, pain pattern and free air fit the ulcer path.' },
                { id: 'dx5', label: 'Chilaiditi anomaly', verdict: 'harmful', why: 'Reading an X-ray without the patient in front of you is how patients die — context over curio.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'Theatre is 30 minutes away. Resuscitation first.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct steps (up to six).',
              options: [
                { id: 'm1', label: 'IV fluids (two lines), NPO, NG tube decompression, urinary catheter', key: true, verdict: 'correct', why: 'The pre-op resuscitation bundle — correct volume status and decompress the stomach before induction.' },
                { id: 'm2', label: 'IV broad-spectrum antibiotics + analgesia', key: true, verdict: 'correct', why: 'Peritoneal contamination → gram-negative/anaerobic cover; analgesia does not mask peritonitis.' },
                { id: 'm3', label: 'Consent + emergency surgery: omental (Graham) patch repair of the perforation ± peritoneal lavage', key: true, verdict: 'correct', why: 'Source control; patch repair is standard for a chronic duodenal perforation in this setting.' },
                { id: 'm4', label: 'Correct electrolytes (K 3.4) and volume before induction', verdict: 'acceptable', why: 'A hypokalaemic, hypovolaemic patient arrests on the table — 30 minutes of correction is time well spent.' },
                { id: 'm5', label: 'Plan H. pylori eradication + NSAID cessation after recovery', verdict: 'correct', why: 'The repair fixes today; eradication and drug avoidance fix the future.' },
                { id: 'm6', label: 'Overnight observation with antacids, surgery "if not better by morning"', verdict: 'harmful', why: 'The fatal sequencing — every hour spreads contamination; peritonitis is a now-emergency.' },
                { id: 'm7', label: 'Start oral PPI and discharge after X-ray review', verdict: 'harmful', why: 'An uncontained perforation is not a pharmacy problem.' },
                { id: 'm8', label: 'CT with oral contrast in theatre queue before any resuscitation', verdict: 'harmful', why: 'Inverted priorities — stabilize first; the diagnosis is already clinical + radiological.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Post-op day 1 in the ward, NG tube out, sips started. He asks two questions.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: '"Doctor, why did you take a CHEST X-ray and not an X-ray of the stomach?"',
              options: [
                { id: 'f1', label: 'Free air RISES — on an erect film it collects under the diaphragm where a chest X-ray shows it best; erect abdominal films are inferior', verdict: 'correct', why: 'Physics does the imaging: intraperitoneal gas ascends to the highest point (subdiaphragmatic). If he cannot stand: left lateral decubitus film instead.' },
                { id: 'f2', label: 'The machine for abdominal X-rays was busy', verdict: 'wrong', why: 'There is a real physiological reason — never joke through teaching moments.' },
                { id: 'f3', label: 'Chest X-ray also checks the heart', verdict: 'wrong', why: 'Not why it was chosen; the diaphragmatic lucency was the target.' },
                { id: 'f4', label: 'Abdominal X-rays cannot detect air at all', verdict: 'wrong', why: 'They can — but erect CXR is far more sensitive for free intraperitoneal gas.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: '"What must change so this never happens again?"',
              options: [
                { id: 'f5', label: 'H. pylori eradication (test-of-cure) + stop NSAIDs + complete PPI course', verdict: 'correct', why: 'The two drivers that thinned the wall — the germ and the painkillers — are both fixable; eradicating one and stopping the other makes recurrence unlikely.' },
                { id: 'f6', label: 'Nothing — ulcers just happen at this age', verdict: 'wrong', why: 'Both aetiological drivers are modifiable — nihilism is bad medicine.' },
                { id: 'f7', label: 'Lifetime monthly endoscopy', verdict: 'wrong', why: 'Surveillance endoscopy is not indicated after successful repair + eradication.' },
                { id: 'f8', label: 'Only avoid spicy food', verdict: 'wrong', why: 'The spicy-food myth distracts from the real drivers (H. pylori, NSAIDs).' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════════ 11 · PATHOLOGY ═════════════════════════
  {
    id: 'sim-leukaemia',
    title: 'Gums Bleeding, Blasts Everywhere',
    specialty: 'Pathology',
    system: 'haematology',
    difficulty: 'advanced',
    estimateMinutes: 14,
    patient: {
      age: '24', sex: 'Male', occupation: 'Postgraduate student',
      complaint: 'Fatigue, gum bleeding and fever for 3 weeks; bruises on the body',
      scene: 'A 24-year-old postgraduate student sits in the medicine OPD: "I get tired climbing one flight, doctor. My gums bleed when I brush, and these bruises just appear." On the bed: a pale young man with petechiae over the shins and boggy, bleeding gums.',
    },
    brief: {
      diagnosis: 'Acute myeloid leukaemia (AML) with pancytopenia and DIC risk',
      conceptIds: ['c-leukemia', 'c2-pathology-leukaemias'],
      learning: [
        'Pancytopenia + blasts on smear + tissue infiltration (gum hypertrophy) in a young adult = acute leukaemia; Auer rods point to myeloid lineage.',
        'Coagulation profile BEFORE biopsy/chemo: AML (esp. promyelocytic/APL) can present with DIC — start ATRA early if APL suspected.',
        'Tumour lysis prophylaxis (hydration + allopurinol/rasburicase, watch K⁺/urate/phosphate) starts BEFORE induction chemotherapy.',
        'Iron deficiency is the trap diagnosis here — anaemia is only ONE cell line; this is marrow failure, not iron loss.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '24-year-old male · student · 3-week progressive course.',
            'Fatigue, gum bleeding, fever (on and off), spontaneous bruises, weight loss 4 kg.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'A marrow-failure story hides in routine questions. Ask well.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points characterise this presentation?',
              options: [
                { id: 'hx1', label: 'Pattern of bleeding and bruising', key: true, finding: 'Spontaneous gum oozing + petechiae without trauma — platelet-type bleeding, not vessel or clot-factor pattern alone.' },
                { id: 'hx2', label: 'Fever pattern and infections', key: true, finding: 'Low-grade fevers most evenings for 2 weeks, one treated "chest infection" — marrow failure + possible underlying infection.' },
                { id: 'hx3', label: 'Bone pain, weight loss, night sweats', key: true, finding: 'Diffuse bone tenderness (sternal prominence), 4 kg weight loss, drenching night sweats — B symptoms + marrow expansion.' },
                { id: 'hx4', label: 'Drug/toxin/chemo exposure (benzene, prior chemotherapy, radiation)', key: true, finding: 'Works part-time in a paint shop (solvent/benzene exposure ~2 years) — a recognised AML risk factor.' },
                { id: 'hx5', label: 'Diet and GI bleeding (iron-loss clues)', finding: 'Normal mixed diet, no overt GI bleeding — against a pure iron-deficiency story.' },
                { id: 'hx6', label: 'Family history of haematological disease', finding: 'None — familial leukaemia syndromes unlikely.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single history thread most strongly suggests MARROW FAILURE rather than a nutritional anaemia?',
              options: [
                { id: 'k1', label: 'Simultaneous bleeding (platelets) + infections (neutrophils) + fatigue (haemoglobin) over 3 weeks', verdict: 'correct', why: 'All three cell lines failing together = pancytopenia from marrow disease. Iron deficiency cannot cause gum bleeding and recurrent infections.' },
                { id: 'k2', label: 'Paint-shop solvent exposure', verdict: 'wrong', why: 'An AML risk factor (useful for the aetiology), not the physiology that localises the disease.' },
                { id: 'k3', label: 'Night sweats', verdict: 'wrong', why: 'A systemic/B-symptom flag — seen in lymphoma and TB too.' },
                { id: 'k4', label: 'Weight loss', verdict: 'wrong', why: 'Non-specific across malignancies and chronic infection.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Pale young man on the bed. Examine with lineages in mind.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination findings will you elicit?',
              options: [
                { id: 'ex1', label: 'Pallor + petechiae/ecchymoses', key: true, finding: 'Marked conjunctival/palmar pallor; non-blanching petechiae over shins and a 4 cm shin ecchymosis — platelet failure visible.' },
                { id: 'ex2', label: 'Gum hypertrophy and oral bleeding', key: true, finding: 'Boggy hypertrophied gums oozing at the margins — leukaemic infiltration (classic in myelomonocytic subtypes M4/M5).' },
                { id: 'ex3', label: 'Sternal tenderness + nodes + hepatosplenomegaly', key: true, finding: 'Sternal bone tenderness; cervical nodes ~1 cm rubbery; spleen 3 cm below costal margin — marrow expansion and organ infiltration.' },
                { id: 'ex4', label: 'Fundus examination', verdict: 'acceptable', why: 'Retinal haemorrhages flag severe thrombocytopenia/leucostasis — worthwhile but does not change the immediate diagnostic path.' },
                { id: 'ex5', label: 'Signs of infection source (chest, skin)', finding: 'Mild right basal crepitations — possible early pneumonia (neutropenic risk).' },
                { id: 'ex6', label: 'Lymph nodes >2 cm fixed', finding: 'Nodes are small and mobile — bulky lymphadenopathy would push toward ALL/lymphoma.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'The smear will talk. Order in the right sequence.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR investigations/orders in the first hour?',
              options: [
                { id: 'iv1', label: 'CBC + PERIPHERAL SMEAR', key: true, cost: '1 h', finding: 'WBC 42 ×10⁹/L with 40% blasts; Hb 7.1 g/dL, platelets 18 ×10⁹/L — pancytopenia with circulating blasts. Smear: myeloblasts with AUER RODS.' },
                { id: 'iv2', label: 'Coagulation profile (PT/aPTT, fibrinogen, D-dimer)', key: true, cost: '1 h', finding: 'Fibrinogen 90 mg/dL (low), D-dimer high, PT/aPTT prolonged — DIC pattern; urgency skyrockets (APL concern).' },
                { id: 'iv3', label: 'Bone marrow aspirate + flow cytometry + cytogenetics', key: true, cost: '24–48 h', finding: 'Hypercellular marrow, 68% myeloblasts; flow: CD13/CD33 positive; cytogenetics pending — diagnostic confirmation and subtype assignment.' },
                { id: 'iv4', label: 'Uric acid, LDH, electrolytes, creatinine (tumour lysis baseline)', key: true, cost: '1 h', finding: 'Uric acid 9.8 mg/dL, LDH 890 — pre-induction baseline for tumour lysis prophylaxis.' },
                { id: 'iv5', label: 'Lumbar puncture now', verdict: 'acceptable', cost: 'later', why: 'CNS staging is routine in ALL; in AML done selectively (high WBC, monocytic subtypes) — after stabilisation, not first-hour.' },
                { id: 'iv6', label: 'Start iron tablets and review in 4 weeks', verdict: 'harmful', cost: 'fatal delay', why: 'Anaemia is one cell line of a three-line catastrophe — "iron and watch" burns the treatment window.' },
                { id: 'iv7', label: 'CT chest', verdict: 'wrong', cost: 'not now', why: 'No mediastinal/lymphoma question yet — the marrow and the smear are the organs of interest.' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              prompt: 'Peripheral smear: 40% myeloblasts, Auer rods visible, pancytopenia; fibrinogen 90 mg/dL with high D-dimer. Best synthesis?',
              options: [
                { id: 'ip1', label: 'AML (myeloid blasts + Auer rods) complicated by DIC — haematology emergency, APL protocol vigilance', verdict: 'correct', why: 'Auer rods are pathognomonic of myeloid lineage; DIC (low fibrinogen, high D-dimer) in acute leukaemia screams promyelocytic (APL) — ATRA should start on suspicion, not wait for full cytogenetics.' },
                { id: 'ip2', label: 'ALL — start steroid pre-phase', verdict: 'wrong', why: 'ALL blasts are lymphoid (no Auer rods); starting steroids without lineage confirmation muddies diagnostics.' },
                { id: 'ip3', label: 'ITP — immunoglobulin and steroids', verdict: 'wrong', why: 'ITP is ISOLATED thrombocytopenia with a clean smear — blasts and anaemia exclude it.' },
                { id: 'ip4', label: 'CML in blast crisis', verdict: 'acceptable', why: 'Also myeloid blasts, but CML has a chronic phase history + splenomegaly + basophilia + BCR-ABL — absent here; keep until cytogenetics return.' },
                { id: 'ip5', label: 'Aplastic anaemia', verdict: 'wrong', why: 'Aplasia gives a EMPTY marrow with NO blasts — this marrow is packed with them.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The pancytopenia + blasts fork:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Acute myeloid leukaemia (AML)', verdict: 'correct', why: 'The final diagnosis.' },
                { id: 'd2', label: 'Acute lymphoblastic leukaemia (ALL)', verdict: 'acceptable', why: 'The age-band rival — excluded by morphology (Auer rods) pending flow cytometry.' },
                { id: 'd3', label: 'CML blast crisis', verdict: 'acceptable', why: 'Myeloid blasts possible — needs the chronic phase + BCR-ABL to fit; kept until cytogenetics.' },
                { id: 'd4', label: 'Aplastic anaemia', verdict: 'acceptable', why: 'Also pancytopenic presentation — excluded by the packed marrow with 68% blasts.' },
                { id: 'd5', label: 'Iron deficiency anaemia', verdict: 'wrong', why: 'Cannot produce blasts, bleeding diathesis or neutropenic infections.' },
                { id: 'd6', label: 'Infectious mononucleosis', verdict: 'wrong', why: 'Atypical LYMPHOCYTES (reactive), sore throat, lymphadenopathy — not blasts with Auer rods.' },
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
                { id: 'dx1', label: 'Acute myeloid leukaemia with DIC risk (APL vigilance)', verdict: 'correct', why: 'Auer rods + gum infiltration + DIC screen abnormality + benzene exposure; subtype confirmation via flow/cytogenetics (t(15;17) for APL).' },
                { id: 'dx2', label: 'ALL', verdict: 'wrong', why: 'Lymphoid blasts lack Auer rods; age band supports AML less strongly here than morphology does.' },
                { id: 'dx3', label: 'Aplastic anaemia', verdict: 'wrong', why: 'Empty marrow, no blasts — opposite end of the cellularity spectrum.' },
                { id: 'dx4', label: 'ITP', verdict: 'wrong', why: 'Isolated platelet disease with otherwise clean counts and smear.' },
                { id: 'dx5', label: 'Disseminated TB with marrow involvement', verdict: 'wrong', why: 'Possible pancytopenia cause, but blasts + Auer rods are leukaemic, not granulomatous.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'Haematology accepts him. The first 48 hours have their own rules.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct immediate steps (up to six).',
              options: [
                { id: 'm1', label: 'Urgent haematology admission + treatment under a leukaemia protocol', key: true, verdict: 'correct', why: 'AML is a days-not-weeks disease at presentation.' },
                { id: 'm2', label: 'Tumour lysis prophylaxis BEFORE chemotherapy: hydration, allopurinol (± rasburicase), monitor K⁺/urate/phosphate', key: true, verdict: 'correct', why: 'High blast burden + high urate = the pre-chemo window is when prophylaxis pays.' },
                { id: 'm3', label: 'Correct coagulopathy (fibrinogen/cryoprecipitate, platelets) — and start ATRA if APL suspected on morphology', key: true, verdict: 'correct', why: 'In APL suspicion, ATRA should NOT wait for cytogenetics — early ATRA converts a bleeding death into a treatable disease.' },
                { id: 'm4', label: 'Neutropenic precautions + empiric antibiotics for infection per protocol', verdict: 'correct', why: 'Neutropenia + basal crepitations — cover before cultures return.' },
                { id: 'm5', label: 'Platelet transfusion per threshold/bleeding guidance', verdict: 'acceptable', why: 'Prophylactic thresholds (~10 ×10⁹/L; higher with fever/bleeding) — guided by haematology.' },
                { id: 'm6', label: 'Induction chemotherapy plan ("7+3" cytarabine + anthracycline or ATRA-based for APL)', verdict: 'acceptable', why: 'Specialist-led but concept-correct — the student should know the framework.' },
                { id: 'm7', label: 'Iron tablets + OPD review next month', verdict: 'harmful', why: 'Repeating the classic fatal delay — this is not a nutrition problem.' },
                { id: 'm8', label: 'Corticosteroid pulse to control bleeding', verdict: 'wrong', why: 'Steroids are ALL/ITP tools — in AML they add infection risk without addressing the mechanism.' },
                { id: 'm9', label: 'Send home after one unit of blood', verdict: 'harmful', why: 'Transfusion without disease control is a revolving door — DIC and sepsis kill between visits.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Cytogenetics return: t(15;17) positive — acute promyelocytic leukaemia (APL).',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'What makes APL (the M3 subtype) a special emergency?',
              options: [
                { id: 'f1', label: 'Massive DIC from tissue-factor release — but it is uniquely treatable with ATRA ± arsenic, so early recognition is life-saving', verdict: 'correct', why: 'APL is simultaneously the most bleeding-prone and the most curable AML — the exam\'s favourite paradox.' },
                { id: 'f2', label: 'APL never causes bleeding problems', verdict: 'wrong', why: 'It is the prototype of leukaemia-associated DIC.' },
                { id: 'f3', label: 'APL requires immediate allogeneic transplant in all cases', verdict: 'wrong', why: 'ATRA/arsenic protocols cure most low/intermediate-risk APL without transplant.' },
                { id: 'f4', label: 'APL is a chronic leukaemia', verdict: 'wrong', why: 'Acute, aggressive, hours-to-days relevant.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'Six hours after starting induction, K⁺ is 6.8 mmol/L, urate 12 mg/dL, phosphate high, calcium low. What is happening and what do you do?',
              options: [
                { id: 'f5', label: 'Tumour lysis syndrome — intensive hydration, rasburicase, electrolyte correction, cardiac monitoring', verdict: 'correct', why: 'Blast lysis dumps K⁺, urate and phosphate; calcium falls bound to phosphate. Recognise, protect the kidneys and the heart.' },
                { id: 'f6', label: 'Chemotherapy overdose — stop all treatment permanently', verdict: 'wrong', why: 'TLS is an expected complication with a protocol — panicking and abandoning therapy is wrong.' },
                { id: 'f7', label: 'DIC deterioration — give vitamin K only', verdict: 'wrong', why: 'Vitamin K does not address lysis products; the pattern is metabolic, not purely coagulative.' },
                { id: 'f8', label: 'Normal response — no action needed', verdict: 'harmful', why: 'Untreated TLS causes fatal arrhythmia and renal failure.' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═════════════════════════ 12 · EMERGENCY MEDICINE ══════════════════════
  {
    id: 'sim-trauma',
    title: 'The Motorway Crash — First Ten Minutes',
    specialty: 'Emergency Medicine',
    system: 'trauma',
    difficulty: 'advanced',
    estimateMinutes: 14,
    patient: {
      age: '28', sex: 'Male', occupation: 'Delivery rider',
      complaint: 'Motorcycle collision 20 minutes ago; severe breathing difficulty and leg pain',
      scene: 'Trauma bay, 11:30 PM. A 28-year-old delivery rider is brought after his bike hit a car. He is agitated, speaking single words, RR 34, SpO₂ 88%, HR 132, BP 82/58. His left thigh is visibly deformed. Cervical collar in place.',
    },
    brief: {
      diagnosis: 'Tension pneumothorax (right) with haemorrhagic shock from femoral fracture — found during primary survey',
      conceptIds: ['c-trauma-primary', 'emergency-abcde', 'c-shock'],
      learning: [
        'The primary survey (ABCDE) is a ORDER, not a checklist — the first life-threat found is treated before moving to the next letter.',
        'Tension pneumothorax is a CLINICAL diagnosis: tracheal shift away + hyper-resonance + absent breath sounds + hypotension → decompress FIRST, radiograph never.',
        'Normal-pulse hypotension in trauma = ongoing bleeding — think blood, heart, and lungs before "head".',
        'Femur fractures bleed 1–1.5 L into the thigh — traction splinting is haemorrhage control.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '28-year-old rider · motorcycle vs car · 20 minutes ago · GCS 14 (agitated), RR 34, SpO₂ 88%, HR 132, BP 82/58.',
            'Left thigh deformed. The team is around the trolley — you lead.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'He cannot give a full history. Use bystanders and the mechanism.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 3,
              prompt: 'Which THREE rapid questions matter (bystander/police)?',
              options: [
                { id: 'hx1', label: 'Speed and mechanism (ejected? helmet? trapped?)', key: true, finding: 'Hit at ~60 km/h, rider was thrown 3 m; helmet on, never removed; not trapped — high-energy mechanism, expect multiple injuries.' },
                { id: 'hx2', label: 'Loss of consciousness at scene', key: true, finding: 'Brief amnesia of the event per bystander, awake and agitated since — GCS 14 consistent; head injury surveillance continues.' },
                { id: 'hx3', label: 'Allergies, medications, last meal (AMPLE)', key: true, finding: 'No known allergies, no regular meds, ate 2 h ago — full stomach matters for anaesthesia planning.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Why does the MECHANISM matter more than any single complaint right now?',
              options: [
                { id: 'k1', label: 'High-energy ejection predicts hidden multi-system injury — you treat PATTERNS, not complaints', verdict: 'correct', why: 'The primary survey exists because high-energy trauma hides killers (tension pneumo, tamponade, pelvic bleed) behind a noisy broken femur.' },
                { id: 'k2', label: 'Because police documentation requires it', verdict: 'wrong', why: 'Medico-legal duty, never clinical priority.' },
                { id: 'k3', label: 'It determines the ambulance bill', verdict: 'wrong', why: 'Irrelevant.' },
                { id: 'k4', label: 'It predicts the fracture pattern only', verdict: 'wrong', why: 'Far broader — it reshapes the whole survey.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination — PRIMARY SURVEY', intro: [
            'ABCDE in order. Find the first killer and treat it before moving on.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'You start with A and B. Which FOUR steps belong to A+B (airway/breathing)?',
              options: [
                { id: 'ex1', label: 'Airway — patency, voice, secretions', key: true, finding: 'Airway clear, speaking single words — no immediate airway obstruction; keep C-spine immobilised.' },
                { id: 'ex2', label: 'Respiratory rate, effort, SpO₂', key: true, finding: 'RR 34, accessory muscle use, SpO₂ 88% on 15 L O₂ — severe hypoxaemia with tachypnoea.' },
                { id: 'ex3', label: 'Tracheal position + chest expansion symmetry', key: true, finding: 'Trachea deviated to the LEFT; right chest expands poorly — mediastinal shift away from the right side.' },
                { id: 'ex4', label: 'Percussion + breath sounds both sides', key: true, finding: 'Right chest hyper-resonant with ABSENT breath sounds; left normal — the tension pneumothorax quartet is complete.' },
                { id: 'ex5', label: 'Chest wall crepitus/contusions', finding: 'Subcutaneous emphysema over the right clavicle — air leak signature.' },
                { id: 'ex6', label: 'Neck veins', finding: 'JVP distended — supports tension physiology (venous return obstructed).' },
              ],
            },
            {
              id: 'in-ex-key', kind: 'key',
              prompt: 'BP 82/58, HR 132, distended neck veins, right-sided hyper-resonance, absent sounds, trachea shifted left, SpO₂ 88%. What is happening?',
              options: [
                { id: 'k1', label: 'Tension pneumothorax — decompress NOW, before any imaging', verdict: 'correct', why: 'The triad (shift away + hyper-resonance + absent sounds) with shock = tension pneumothorax. It kills in minutes; it is diagnosed with ears and hands.' },
                { id: 'k2', label: 'Massive haemothorax', verdict: 'wrong', why: 'Haemothorax is DULL to percussion with reduced sounds — hyper-resonance + shift + distended neck veins point to tension air.' },
                { id: 'k3', label: 'Cardiac tamponade', verdict: 'wrong', why: 'Beck triad (muffled sounds, hypotension, distended veins) without respiratory signs — no hyper-resonance or tracheal shift.' },
                { id: 'k4', label: 'Head injury causing hypotension', verdict: 'harmful', why: 'The classic misconception — the brain does not bleed enough to cause shock; hypotension in trauma is blood volume, lungs or heart until proven otherwise.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'The registrar reaches for the portable X-ray machine. You stop him. Why?',
          ], interactions: [
            {
              id: 'in-inv-decide', kind: 'choice',
              prompt: 'What happens BEFORE any investigation?',
              options: [
                { id: 'ip1', label: 'Needle decompression of the right chest NOW — then definitive chest drain', verdict: 'correct', why: 'A large-bore cannula, 2nd intercostal space mid-clavicular line, converts a killing pressure into a simple pneumothorax; then the 5th ICS drain completes it.' },
                { id: 'ip2', label: 'Portable CXR to confirm', verdict: 'harmful', why: 'The classic fatal bureaucracy — the CXR will show what the hands already know, minutes too late.' },
                { id: 'ip3', label: 'Whole-body CT first', verdict: 'harmful', why: 'An unstable patient belongs to the surgeon\'s hands, not the scanner.' },
                { id: 'ip4', label: 'Arterial blood gas to document hypoxia', verdict: 'wrong', why: 'The SpO₂ and the chest findings already document it — action beats documentation.' },
              ],
            },
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 3,
              prompt: 'After decompression + chest drain (rush of air, saturations 96%, BP 96/62): which THREE investigations now?',
              options: [
                { id: 'iv1', label: 'eFAST ultrasound', key: true, cost: '5 min', finding: 'Right lung sliding restored; free fluid in the RUQ and pelvis — intra-abdominal bleeding suspected on top of the femur fracture.' },
                { id: 'iv2', label: 'Chest X-ray (drain position + residual pneumothorax)', key: true, cost: '10 min', finding: 'Drain in position, right lung mostly re-expanded; small residual apical pneumothorax.' },
                { id: 'iv3', label: 'Bloods: CBC, crossmatch 4 units, ABG, lactate', key: true, cost: 'parallel', finding: 'Hb 9.8, lactate 4.2 — shock index high; blood ordered, not just crystalloid.' },
                { id: 'iv4', label: 'CT trauma series (pan-scan) before theatre', verdict: 'acceptable', cost: 'if stabilised', why: 'Once stable post-decompression, a CT defines injuries — but NEVER before haemodynamic stability.' },
                { id: 'iv5', label: 'MRI cervical spine now', verdict: 'wrong', cost: 'delay', why: 'Clear collar protocol comes after life threats; MRI is not an emergency-room first act.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The shock-in-trauma shortlist you ran through:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Tension pneumothorax', verdict: 'correct', why: 'Found and treated first — the classic letter-B killer.' },
                { id: 'd2', label: 'Haemorrhagic shock (femur + suspected intra-abdominal bleed)', verdict: 'correct', why: 'eFAST free fluid + femur fracture — the letter-C problem that follows the decompression.' },
                { id: 'd3', label: 'Cardiac tamponade', verdict: 'acceptable', why: 'Distended neck veins overlap — excluded by the respiratory findings and the response to decompression (FAST heart view clear).' },
                { id: 'd4', label: 'Massive haemothorax', verdict: 'acceptable', why: 'Same chest, opposite percussion note — excluded at the bedside in seconds.' },
                { id: 'd5', label: 'Neurogenic shock', verdict: 'wrong', why: 'Needs bradycardia + warm peripheries + motor/sensory level — he is tachycardic, cold and agitated.' },
                { id: 'd6', label: 'Isolated closed head injury as the shock source', verdict: 'harmful', why: 'The brain is never the source of shock in trauma — anchoring here kills through missed chests and bellies.' },
              ],
            },
          ],
        },
        {
          id: 'st-diagnosis', kind: 'diagnosis', label: 'Diagnosis', intro: [
            'Commit to the combined picture.',
          ], interactions: [
            {
              id: 'in-dx', kind: 'choice',
              prompt: 'Working diagnosis after the first ten minutes?',
              options: [
                { id: 'dx1', label: 'Tension pneumothorax (treated) + haemorrhagic shock from left femur fracture with suspected intra-abdominal bleed', verdict: 'correct', why: 'The ABCDE logic in one line — a B-killer decompressed, a C-bleed being sourced with FAST and blood products.' },
                { id: 'dx2', label: 'Isolated femoral fracture with pain', verdict: 'wrong', why: 'Ignores the shock — a femur alone rarely explains 82/58 without blood loss accounting.' },
                { id: 'dx3', label: 'Cardiac tamponade from sternal fracture', verdict: 'wrong', why: 'No sternal findings, FAST heart clear, decompression improved him.' },
                { id: 'dx4', label: 'Simple pneumothorax', verdict: 'wrong', why: 'Simple pneumothorax does not shift the mediastinum or cause shock — tension physiology was present.' },
                { id: 'dx5', label: 'Moderate head injury with agitation', verdict: 'harmful', why: 'GCS 14 is real and needs surveillance — but it is NOT the haemodynamic diagnosis; anchoring on the head misses the torso.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'The first 30 minutes of the damage-control resuscitation.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct steps (up to six).',
              options: [
                { id: 'm1', label: 'Needle decompression → intercostal chest drain (5th ICS, anterior axillary line)', key: true, verdict: 'correct', why: 'Needle buys minutes; the drain completes the decompression and lets you measure output.' },
                { id: 'm2', label: 'High-flow O₂, prepare anaesthesia/intubation standby', key: true, verdict: 'correct', why: 'Airway protection is ready in the background — but intubation only when indicated, not reflexively.' },
                { id: 'm3', label: 'Two large IV lines + tranexamic acid + blood products early (damage-control resuscitation)', key: true, verdict: 'correct', why: 'TXA within 3 h, blood:plasma ratio-driven resuscitation, permissive hypotension until source control.' },
                { id: 'm4', label: 'Traction splint the femur — it IS haemorrhage control', key: true, verdict: 'correct', why: '1–1.5 L can bleed into a thigh; realignment + traction stops the venous ooze.' },
                { id: 'm5', label: 'Trauma team activation + theatre for source control if FAST/lavage positive', key: true, verdict: 'correct', why: 'Shock + free fluid = the operating theatre, not the CT scanner.' },
                { id: 'm6', label: 'Cervical collar maintained until cleared', verdict: 'correct', why: 'Spine protection continues while the life threats are handled.' },
                { id: 'm7', label: 'Portables CXR + full CT before ANY decompression', verdict: 'harmful', why: 'The inverted-priority error — imaging never outranks a clinically diagnosed tension pneumothorax.' },
                { id: 'm8', label: 'Aggressive 3 L crystalloid bolus to normalise BP before surgery', verdict: 'harmful', why: 'Dilutes clotting factors, cools the patient, pops clots — permissive hypotension + early blood is the modern standard.' },
                { id: 'm9', label: 'Remove the collar early because the airway is clear', verdict: 'harmful', why: 'Airway patency ≠ spine clearance — the collar stays until formally cleared.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Two hours later: drain output 400 mL initially, then 250 mL/h for the third hour; BP holding at 100/64 with blood running.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'What does the chest drain output pattern demand?',
              options: [
                { id: 'f1', label: 'Ongoing intrathoracic bleeding — thoracotomy thresholds reached (~1500 mL initial or ≥200 mL/h × 2–4 h)', verdict: 'correct', why: 'Drain output is a vital sign: 250 mL/h for 3 hours crosses the surgical threshold — the chest must be opened, not "watched".' },
                { id: 'f2', label: 'Normal post-traumatic ooze — continue watching', verdict: 'harmful', why: 'By the 4th hour he has lost another unit into a bottle — watching is bleeding.' },
                { id: 'f3', label: 'Clamp the drain to "build pressure" and stop bleeding', verdict: 'harmful', why: 'Clamping converts an open haemothorax into a tension haemothorax — a resurrection of the first killer.' },
                { id: 'f4', label: 'Remove the drain — it must be kinked', verdict: 'wrong', why: 'The output pattern is the diagnosis; removing the messenger does not treat the message.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'He stabilises overnight. Why did the first 2 L of crystalloid fail to raise the BP adequately?',
              options: [
                { id: 'f5', label: 'Ongoing haemorrhage — crystalloid dilutes and leaks; source control + blood products were the real treatment', verdict: 'correct', why: 'Shock that does not respond to crystalloid is bleeding until controlled — the femur, the chest drain output and the FAST all pointed there.' },
                { id: 'f6', label: 'The fluids were the wrong brand', verdict: 'wrong', why: 'Composition differences are trivial next to the physiology of ongoing blood loss.' },
                { id: 'f7', label: 'He was simply anxious', verdict: 'wrong', why: 'Anxiety does not produce lactate 4.2 and Hb 9.8.' },
                { id: 'f8', label: 'Tension pneumothorax persisted after the drain', verdict: 'wrong', why: 'Saturations and pressure normalised after decompression — the residual problem was blood, not air.' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════════ 13 · CARDIOLOGY (image) ════════════════
  {
    id: 'sim-chb',
    title: 'The Collapse With a Slow Pulse',
    specialty: 'Cardiology',
    system: 'cardiovascular',
    difficulty: 'mbbs',
    estimateMinutes: 12,
    imageKey: 'ecg-complete-heart-block',
    imageCaption: 'ECG — complete (third-degree) AV block with ventricular escape rhythm (educational image, platform-owned)',
    patient: {
      age: '74', sex: 'Female', occupation: 'Retired teacher',
      complaint: 'Two blackouts at home in one week; profound slowing of pulse noticed today',
      scene: 'A 74-year-old retired teacher is brought by her son after collapsing in the kitchen this morning: "She went pale, dropped the pot, and was out for a few seconds." A family member counted her pulse at "36, very regular". She takes metoprolol for years-old palpitations.',
    },
    brief: {
      diagnosis: 'Complete (third-degree) AV block with ventricular escape rhythm, drug-exacerbated — needs pacing',
      conceptIds: ['c-arrhythmia', 'c-ecg'],
      learning: [
        'Syncope without prodrome + profound regular bradycardia in an elderly patient = consider complete heart block first.',
        'Cannon "a" waves + variable-intensity S1 = AV dissociation — the bedside signature of CHB.',
        'Atropine often fails in infranodal (wide-QRS) block — escalate to transcutaneous → temporary → permanent pacing.',
        'Always review rate-controlling drugs (beta-blockers, CCBs, digoxin) — but drug withdrawal alone does not fix structural CHB.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '74-year-old woman · two witnessed syncopal episodes this week · pulse 36 regular on arrival.',
            'On metoprolol 50 mg BD (prescribed years ago for palpitations). No chest pain.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'The son narrates. Ask the questions that separate cardiac syncope from its mimics.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points discriminate?',
              options: [
                { id: 'hx1', label: 'Circumstances of the blackouts — warning or none? Exertion or rest?', key: true, finding: 'Both collapses without any warning — no dim vision, no sweating, no prolonged standing; one occurred while sitting and sewing — Stokes-Adams pattern.' },
                { id: 'hx2', label: 'Drug history — rate-controlling drugs', key: true, finding: 'Metoprolol 50 mg twice daily for years; also takes amlodipine — a bradycardic burden on a possibly failing conduction system.' },
                { id: 'hx3', label: 'Seizure features — tongue bite, incontinence, post-event confusion', key: true, finding: 'No tongue biting, no incontinence, oriented immediately after each episode — against epileptic seizures.' },
                { id: 'hx4', label: 'Chest pain, palpitations, heart failure symptoms', key: true, finding: 'Intermittent palpitations ("heart thumping") over weeks, no exertional chest pain; mild ankle swelling recently — conduction disease ± structural heart.' },
                { id: 'hx5', label: 'Vertigo pattern (room-spinning)', finding: 'No rotational vertigo — against vestibular causes.' },
                { id: 'hx6', label: 'Family history of sudden death or pacemakers', finding: 'An elder brother had a pacemaker implanted in his 60s — supports a conduction-system diathesis.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which historical pattern most specifically points to an arrhythmic (Stokes-Adams) syncope?',
              options: [
                { id: 'k1', label: 'Unheralded collapses without trigger or posture, with instant recovery', verdict: 'correct', why: 'Vasovagal syncope has prodromes and postural triggers; Stokes-Adams attacks from intermittent CHB strike without warning and recover instantly when the escape rhythm resumes.' },
                { id: 'k2', label: 'Years of metoprolol', verdict: 'wrong', why: 'A contributor to identify and address — but many patients take beta-blockers without syncope.' },
                { id: 'k3', label: 'No seizure features', verdict: 'wrong', why: 'Useful exclusion (epilepsy), not a positive arrhythmia marker.' },
                { id: 'k4', label: 'Ankle swelling', verdict: 'wrong', why: 'Suggests structural heart disease involvement, but is not the syncope fingerprint.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'Pulse 36, regular. Lying BP 88/50. Now look at the neck and listen.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination findings will you look for?',
              options: [
                { id: 'ex1', label: 'JVP — for cannon "a" waves', key: true, finding: 'Intermittent large cannon "a" waves in the neck — atria contracting against closed AV valves during AV dissociation.' },
                { id: 'ex2', label: 'S1 intensity variation', key: true, finding: 'Loud S1 of varying intensity ("bruit de canon") — PR relationship is random in complete dissociation.' },
                { id: 'ex3', label: 'Rate regularity and response to standing/Valsalva', key: true, finding: 'Persistent 36/min regardless of posture — an escape rhythm does not accelerate with autonomic stress (a sinus bradycardia would).' },
                { id: 'ex4', label: 'Heart failure signs (crackles, oedema, S3)', key: true, finding: 'Basal crackles + grade 2 ankle oedema — ventricular escape + drug burden producing failure signs.' },
                { id: 'ex5', label: 'Neurological examination', finding: 'No focal deficits, no tongue bite — seizure effectively excluded.' },
                { id: 'ex6', label: 'Carotid sinus massage', verdict: 'acceptable', why: 'A diagnostic manoeuvre for carotid hypersensitivity — NEVER first-line with documented severe bradycardia.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'The monitor shows the rhythm. The ECG is in your hand.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 3,
              prompt: 'Which investigations do you order while preparing for pacing?',
              options: [
                { id: 'iv1', label: '12-lead ECG immediately', key: true, cost: '5 min', finding: 'See the next step — the ECG is diagnostic.' },
                { id: 'iv2', label: 'Serum electrolytes (K⁺, Ca²⁺, Mg²⁺)', key: true, cost: '40 min', finding: 'K⁺ 4.4, Ca²⁺ normal — metabolic bradycardia excluded; drug + conduction disease remain.' },
                { id: 'iv3', label: 'Thyroid function + troponin', key: true, cost: '4 h', finding: 'TSH normal; troponin negative — hypothyroidism and acute ischaemic cause excluded.' },
                { id: 'iv4', label: 'Echocardiogram', verdict: 'acceptable', cost: 'soon', why: 'Structural assessment supports the pacemaker decision — after the rhythm is secured.' },
                { id: 'iv5', label: 'EEG as the first test', verdict: 'wrong', cost: 'wrong order', why: 'The pulse of 36 IS the neurological answer — an EEG before an ECG in syncope is the classic misdirection.' },
                { id: 'iv6', label: 'Discharge for outpatient Holter in 2 weeks', verdict: 'harmful', cost: 'dangerous', why: 'Documented 36/min + recent syncope = an inpatient pacing question, not a two-week waiting game.' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              imageKey: 'ecg-complete-heart-block',
              imageCaption: 'ECG — complete (third-degree) AV block with ventricular escape rhythm (educational image, platform-owned)',
              prompt: 'Read this ECG: regular rate 34/min, P waves marching independently, QRS 140 ms, no fixed PR relationship. Interpretation?',
              options: [
                { id: 'ip1', label: 'Complete (third-degree) AV block with a wide-QRS (ventricular) escape rhythm', verdict: 'correct', why: 'AV dissociation (P waves unrelated to QRS) + wide escape QRS = infra-His block — an unstable escape that can pause; pacing is mandatory, atropine will likely fail.' },
                { id: 'ip2', label: 'Sinus bradycardia — reduce the beta-blocker and observe', verdict: 'wrong', why: 'Sinus bradycardia would show each P conducting to its QRS with a fixed PR — dissociation excludes it; reducing drugs alone leaves the structural block in place.' },
                { id: 'ip3', label: 'Second-degree Mobitz I (Wenckebach)', verdict: 'wrong', why: 'Wenckebach shows progressive PR prolongation then a dropped beat — there is NO relationship at all here.' },
                { id: 'ip4', label: 'Atrial fibrillation with slow ventricular response', verdict: 'wrong', why: 'AF has no P waves and an IRREGULARLY irregular rhythm — this rhythm is regular with visible P waves.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The syncope-with-bradycardia shortlist:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Complete heart block (Stokes-Adams attacks)', verdict: 'correct', why: 'The final diagnosis — everything converges: history, cannon waves, ECG.' },
                { id: 'd2', label: 'Drug-induced bradycardia (beta-blocker + CCB)', verdict: 'acceptable', why: 'A real exacerbator — must be addressed, but cannot create AV dissociation on its own.' },
                { id: 'd3', label: 'Sick sinus syndrome', verdict: 'acceptable', why: 'The other pacemaker candidate — sinus pauses would show on ECG; here the sinus node is FIRING (P waves) but the ventricle is disconnected.' },
                { id: 'd4', label: 'Carotid sinus hypersensitivity', verdict: 'acceptable', why: 'Considered in elderly unheralded syncope — but a persistent 36/min at rest outruns it as the explanation.' },
                { id: 'd5', label: 'Vasovagal syncope', verdict: 'wrong', why: 'Needs prodrome/trigger and a NORMAL resting rhythm between events.' },
                { id: 'd6', label: 'Epilepsy', verdict: 'wrong', why: 'No seizure features; bradycardia and ECG explain everything.' },
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
                { id: 'dx1', label: 'Complete AV block with ventricular escape (drug-exacerbated) — Stokes-Adams syncope', verdict: 'correct', why: 'AV dissociation on ECG + cannon a waves + unheralded syncope + bradycardic drug burden.' },
                { id: 'dx2', label: 'Sinus node dysfunction only', verdict: 'wrong', why: 'P waves march on — the sinus node is alive; the CONDUCTION system has failed.' },
                { id: 'dx3', label: 'Seizure disorder', verdict: 'wrong', why: 'No seizure stigmata; every finding points to the heart.' },
                { id: 'dx4', label: 'Vasovagal syncope', verdict: 'wrong', why: 'Wrong pattern (no prodrome, persistent severe bradycardia at rest).' },
                { id: 'dx5', label: 'Atrial fibrillation with slow response', verdict: 'wrong', why: 'Regular rhythm with organised P waves — not AF.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'Telemetry attached. Build the pacing pathway.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct steps (up to six).',
              options: [
                { id: 'm1', label: 'Continuous monitoring, IV access, transcutaneous pads ON standby', key: true, verdict: 'correct', why: 'The escape rhythm can pause without warning — readiness is the treatment you give before you need it.' },
                { id: 'm2', label: 'Atropine trial (may fail in infranodal block — do not rely on it)', key: true, verdict: 'correct', why: 'Reasonable first drug, but wide-QRS infra-His block often ignores it — escalate promptly if no response.' },
                { id: 'm3', label: 'Stop/hold metoprolol (and review amlodipine)', key: true, verdict: 'correct', why: 'Remove the exacerbators — necessary but NOT sufficient for structural CHB.' },
                { id: 'm4', label: 'Temporary pacing wire (transvenous) if unstable or pauses recur', key: true, verdict: 'correct', why: 'Bridges her to the definitive solution with the escape rhythm as backup.' },
                { id: 'm5', label: 'Permanent pacemaker evaluation (dual-chamber) — the definitive treatment', key: true, verdict: 'correct', why: 'Symptomatic complete heart block has a Class I indication for permanent pacing.' },
                { id: 'm6', label: 'Isoprenaline infusion as a pharmacological bridge if pacing delayed', verdict: 'acceptable', why: 'Chronotropic support buys time in settings without immediate pacing access.' },
                { id: 'm7', label: 'Discharge on a reduced beta-blocker dose with Holter in 2 weeks', verdict: 'harmful', why: 'The pause that killed the pot in the kitchen can recur in the bathroom tonight.' },
                { id: 'm8', label: 'Start digoxin to "strengthen the heart"', verdict: 'harmful', why: 'Digoxin slows AV conduction further — accelerant on a fire.' },
                { id: 'm9', label: 'Immediate DC cardioversion', verdict: 'harmful', why: 'She is in a slow escape rhythm, not a tachyarrhythmia — shocking an escape rhythm can asystole her.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'She receives a dual-chamber pacemaker on day 3. The son asks two questions.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: '"What were those jumping movements in her neck at the bedside?"',
              options: [
                { id: 'f1', label: 'Cannon "a" waves — atrial contractions hitting closed AV valves at random because atria and ventricles beat independently', verdict: 'correct', why: 'AV dissociation makes some atrial beats land against a closed tricuspid valve — the neck shows the physics.' },
                { id: 'f2', label: 'Muscle twitches from low calcium', verdict: 'wrong', why: 'Calcium was normal; the timing was with heartbeats, not random.' },
                { id: 'f3', label: 'The pacemaker misfiring', verdict: 'wrong', why: 'It happened BEFORE the device was implanted.' },
                { id: 'f4', label: 'Blocked tear ducts causing vein prominence', verdict: 'wrong', why: 'Not a cardiovascular explanation — exam jokes aside, learn the real mechanism.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: '"Why did the atropine injection in the ambulance barely change her pulse?"',
              options: [
                { id: 'f5', label: 'The block is below the AV node — atropine acts mainly at the nodal level, so infra-His block usually resists it', verdict: 'correct', why: 'Vagal tone modulation cannot fix a dead infranodal pathway — a pharmacology-physiology integration classic.' },
                { id: 'f6', label: 'The dose was too old', verdict: 'wrong', why: 'Reaching for logistics again — the mechanism is anatomical.' },
                { id: 'f7', label: 'Atropine only works in children', verdict: 'wrong', why: 'It works well in nodal bradyarrhythmias at any age.' },
                { id: 'f8', label: 'It did fail — so electrical cardioversion is next', verdict: 'harmful', why: 'Cardioversion of a slow escape rhythm risks asystole; the next rung is PACING.' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ═══════════════════════════ 14 · CARDIOLOGY / MEDICINE (image) ═════════
  {
    id: 'sim-pulmedema',
    title: 'Waking Up Gasping at 3 AM',
    specialty: 'Cardiology',
    system: 'cardiovascular',
    difficulty: 'neetpg',
    estimateMinutes: 13,
    imageKey: 'cxr-pulm-edema',
    imageCaption: 'Chest X-ray — acute pulmonary oedema with bat-wing infiltrates and Kerley B lines (educational image, platform-owned)',
    patient: {
      age: '64', sex: 'Male', occupation: 'Retired bank manager',
      complaint: 'Woke at 3 AM gasping for breath; brought to casualty at 4 AM',
      scene: 'A 64-year-old retired bank manager arrives at 4 AM upright on the trolley, gasping between words: "I woke up drowning, doctor… I had to sit up or I would die." Known ischaemic heart disease (stent 3 years ago); stopped his "water tablet" last month because "the trips to the toilet at night were too many".',
    },
    brief: {
      diagnosis: 'Acute cardiogenic pulmonary oedema (flash pulmonary oedema) on ischaemic LV dysfunction, precipitated by diuretic non-compliance',
      conceptIds: ['c-heartfail', 'c-diuretics', 'c-cxr'],
      learning: [
        'PND + orthopnea + bilateral mid-zone crackles + S3 in an ischaemic patient = acute cardiogenic pulmonary oedema.',
        'Immediate management: sit up + O₂ + IV furosemide + nitrates (if BP allows) ± CPAP; then hunt the trigger (ischaemia, arrhythmia, salt, non-compliance).',
        'Do NOT give fluid boluses to a gasping wet-lung patient; do NOT intubate reflexively — CPAP often averts it.',
        'HFrEF mortality therapy = ACEI + beta-blocker + MRA (± SGLT2i); digoxin improves symptoms, not survival.',
      ],
      stages: [
        {
          id: 'st-patient', kind: 'patient', label: 'Patient', intro: [
            '64-year-old male · IHD with stent 3 years ago · stopped furosemide a month ago.',
            '3 AM waking with air hunger, now sitting bolt upright, RR 32, SpO₂ 88%.',
          ], interactions: [],
        },
        {
          id: 'st-history', kind: 'history', label: 'History', intro: [
            'He can speak only in half-sentences. The son fills the gaps.',
          ], interactions: [
            {
              id: 'in-hx-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR history points matter most?',
              options: [
                { id: 'hx1', label: 'The sleep pattern — how many pillows? Waking gasping?', key: true, finding: 'Two-pillow orthopnea for weeks; last night woke gasping 90 minutes after sleeping flat — paroxysmal nocturnal dyspnoea.' },
                { id: 'hx2', label: 'Medication changes — especially diuretics', key: true, finding: 'Stopped furosemide a month ago (nighttime toilet trips) and reduced his salt discipline during festivals — the classic precipitant story.' },
                { id: 'hx3', label: 'Chest pain or new palpitations (trigger hunt)', key: true, finding: 'Mild retrosternal heaviness on exertion in the last week; a run of fast "thumping" heartbeats two days ago — ischaemia/arrhythmia as trigger must be excluded.' },
                { id: 'hx4', label: 'Leg swelling and weight change', key: true, finding: 'Shoes tighter for two weeks; weight up 3 kg — fluid retention building before the decompensation.' },
                { id: 'hx5', label: 'Cough with fever / sputum', finding: 'Dry cough at night only, no fever or purulent sputum — against pneumonia as the primary driver.' },
                { id: 'hx6', label: 'Snoring and daytime sleepiness', finding: 'Snores "when he naps in the chair", no witnessed apnoeas — OSA noted as a background factor.' },
              ],
            },
            {
              id: 'in-hx-key', kind: 'key',
              prompt: 'Which single detail most directly explains WHY he decompensated tonight?',
              options: [
                { id: 'k1', label: 'Diuretic stopped a month ago + festival salt load', verdict: 'correct', why: 'Removing the safety valve (diuresis) while loading the system (salt) is the textbook precipitant — the fixable cause of tonight\'s crisis.' },
                { id: 'k2', label: 'Two-pillow orthopnea', verdict: 'wrong', why: 'Confirms chronic failure severity — but the TRIGGER is the compliance break.' },
                { id: 'k3', label: 'Exertional heaviness', verdict: 'wrong', why: 'Raises ischaemia as a co-precipitant to investigate — but the reversible behaviour change is the first lever.' },
                { id: 'k4', label: 'Nighttime cough', verdict: 'wrong', why: 'A congestion symptom, not an explanation.' },
              ],
            },
          ],
        },
        {
          id: 'st-exam', kind: 'exam', label: 'Examination', intro: [
            'He refuses to lie down. BP 176/104, HR 110 irregular.',
          ], interactions: [
            {
              id: 'in-ex-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR examination findings define the syndrome?',
              options: [
                { id: 'ex1', label: 'Position and work of breathing', key: true, finding: 'Tripod sitting, using accessory muscles, speaking 3–4 words per breath — respiratory distress from pulmonary congestion.' },
                { id: 'ex2', label: 'Lung auscultation', key: true, finding: 'Bilateral mid-zone fine inspiratory crackles extending up from the bases — symmetric pulmonary oedema pattern.' },
                { id: 'ex3', label: 'Cardiac auscultation — S3, murmurs', key: true, finding: 'S3 gallop present; soft apical pansystolic murmur (functional MR from a dilated LV) — a failing, volume-loaded ventricle.' },
                { id: 'ex4', label: 'JVP and peripheral oedema', key: true, finding: 'JVP elevated ~8 cm; bilateral pitting oedema to mid-shin — systemic congestion corroborates.' },
                { id: 'ex5', label: 'Pulse character and rhythm', finding: 'Irregularly irregular at 110 — atrial fibrillation (the probable acute trigger) to confirm on ECG.' },
                { id: 'ex6', label: 'Perfusion status (cold/warm)', finding: 'Warm peripheries with good pulses — "warm and wet" profile; not yet cardiogenic shock.' },
              ],
            },
          ],
        },
        {
          id: 'st-investigations', kind: 'investigations', label: 'Investigations', intro: [
            'Order what confirms, triggers, and guides — in that order.',
          ], interactions: [
            {
              id: 'in-inv-explore', kind: 'explore', maxSelect: 4,
              prompt: 'Which FOUR investigations do you send now?',
              options: [
                { id: 'iv1', label: '12-lead ECG', key: true, cost: '5 min', finding: 'Atrial fibrillation at 110, old anterior Q waves — the arrhythmic trigger is confirmed on top of ischaemic substrate.' },
                { id: 'iv2', label: 'Chest X-ray', key: true, cost: '20 min', finding: 'See the next step — the film is diagnostic.' },
                { id: 'iv3', label: 'NT-proBNP', key: true, cost: '1 h', finding: 'NT-proBNP 8,900 pg/mL — markedly raised, supports heart failure as the cause of dyspnoea (rule-in, not a treatment guide).' },
                { id: 'iv4', label: 'Electrolytes, renal function, troponin', key: true, cost: '1 h', finding: 'K⁺ 4.8, creatinine 1.4 (baseline 1.1); troponin mildly positive — ischaemic contribution plausible, repeat trend needed.' },
                { id: 'iv5', label: 'Echocardiogram', verdict: 'acceptable', cost: 'after stabilisation', why: 'Will quantify EF and MR — important for long-term therapy, not for tonight\'s emergency.' },
                { id: 'iv6', label: 'CT pulmonary angiogram first', verdict: 'harmful', cost: 'delay', why: 'PE workup is not first-line with this classic cardiac picture — you would spiral-CT a drowning man.' },
                { id: 'iv7', label: 'D-dimer to "rule out PE"', verdict: 'wrong', cost: 'misleading', why: 'D-dimer is meaningless in heart failure (elevated anyway) — a test ordered to comfort, not to decide.' },
              ],
            },
            {
              id: 'in-inv-interpret', kind: 'choice',
              imageKey: 'cxr-pulm-edema',
              imageCaption: 'Chest X-ray — acute pulmonary oedema with bat-wing infiltrates and Kerley B lines (educational image, platform-owned)',
              prompt: 'Read this chest X-ray: bilateral perihilar "bat-wing" infiltrates, Kerley B lines, cardiomegaly, small bilateral effusions. Interpretation?',
              options: [
                { id: 'ip1', label: 'Acute cardiogenic pulmonary oedema — hydrostatic (pressure) oedema from a failing left ventricle', verdict: 'correct', why: 'Bat-wing perihelial congestion + Kerley B (interlobular septal fluid) + effusions + cardiomegaly in a hypertensive ischaemic patient = the radiograph of a flooded lung.' },
                { id: 'ip2', label: 'Bilateral pneumonia — start antibiotics as the primary therapy', verdict: 'wrong', why: 'Pneumonia is patchy, often asymmetric, with fever and purulent sputum; the symmetric perihilar + septal pattern is hydrostatic oedema.' },
                { id: 'ip3', label: 'Miliary tuberculosis', verdict: 'wrong', why: 'Miliary TB shows uniform 1–2 mm nodules everywhere — a different galaxy from bat-wing congestion.' },
                { id: 'ip4', label: 'ARDS', verdict: 'acceptable', why: 'The radiographic mimic — but ARDS comes with a precipitant (sepsis/aspiration), refractory hypoxia and NON-cardiogenic physiology; NT-proBNP and response to diuresis settle it.' },
              ],
            },
          ],
        },
        {
          id: 'st-differential', kind: 'differential', label: 'Differential diagnosis', intro: [
            'The acute-dyspnoea fork in a 64-year-old:',
          ], interactions: [
            {
              id: 'in-ddx', kind: 'multi', maxSelect: 4,
              prompt: 'Select the differentials you actively considered (up to four).',
              options: [
                { id: 'd1', label: 'Acute cardiogenic pulmonary oedema', verdict: 'correct', why: 'The final diagnosis — history, examination, NT-proBNP and the film converge.' },
                { id: 'd2', label: 'Pneumonia', verdict: 'acceptable', why: 'Fever/purulence would have flipped it; absent here.' },
                { id: 'd3', label: 'Pulmonary embolism', verdict: 'acceptable', why: 'Acute dyspnoea + AF — considered, but no risk factors, no pleuritic pain, and the radiograph/congestion pattern argued cardiac.' },
                { id: 'd4', label: 'COPD/asthma exacerbation', verdict: 'acceptable', why: 'Wheeze-only histories confuse; this patient had crackles, not diffuse wheeze, plus orthopnoea.' },
                { id: 'd5', label: 'ARDS', verdict: 'acceptable', why: 'Radiographic overlap — excluded by the cardiogenic context and clear precipitant profile.' },
                { id: 'd6', label: 'Anxiety-panic hyperventilation', verdict: 'harmful', why: 'The most dangerous comfort-diagnosis in dyspnoea — SpO₂ 88% and crackles are not anxiety.' },
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
                { id: 'dx1', label: 'Acute cardiogenic pulmonary oedema (flash) on ischaemic LV dysfunction; triggers: AF + diuretic/salt non-compliance', verdict: 'correct', why: 'PND/orthopnoea + S3 + symmetric crackles + bat-wing CXR + NT-proBNP 8,900 + the trigger triad.' },
                { id: 'dx2', label: 'Community-acquired pneumonia', verdict: 'wrong', why: 'No fever/purulence; pattern and physiology are hydrostatic.' },
                { id: 'dx3', label: 'Pulmonary embolism', verdict: 'wrong', why: 'No PE risk profile; congestion pattern argues against isolated PE.' },
                { id: 'dx4', label: 'COPD exacerbation', verdict: 'wrong', why: 'No COPD history; crackles + orthopnoea + S3 are cardiac signs.' },
                { id: 'dx5', label: 'Acute renal failure with fluid overload', verdict: 'wrong', why: 'Creatinine only mildly up (1.4 vs baseline 1.1) — a cardiorenal CONSEQUENCE of the congestion, not the driver; the primary pump failure picture dominates.' },
              ],
            },
          ],
        },
        {
          id: 'st-management', kind: 'management', label: 'Management', intro: [
            'The next ten minutes un-drown the lung.',
          ], interactions: [
            {
              id: 'in-rx', kind: 'multi', maxSelect: 6,
              prompt: 'Select ALL correct steps (up to six).',
              options: [
                { id: 'm1', label: 'Sit upright + high-flow O₂ (target SpO₂ ≥ 90%)', key: true, verdict: 'correct', why: 'Position drains the upper lung zones; oxygen buys myocardial comfort while drugs work.' },
                { id: 'm2', label: 'IV furosemide 40–80 mg', key: true, verdict: 'correct', why: 'Vasodilates early (within minutes) then diureses — the central drug of the wet lung.' },
                { id: 'm3', label: 'Sublingual/IV nitrates (BP 176/104 allows)', key: true, verdict: 'correct', why: 'Venodilation drops preload instantly — the fastest pressure-unloader available.' },
                { id: 'm4', label: 'CPAP (non-invasive ventilation) if not settling', key: true, verdict: 'correct', why: 'Positive pressure splints alveoli open, pushes fluid back, cuts intubation rates.' },
                { id: 'm5', label: 'Rate/rhythm control pathway for AF + ischaemia workup', verdict: 'correct', why: 'Treat the trigger: rate control, anticoagulation decisions, and troponin-trended ischaemia assessment.' },
                { id: 'm6', label: 'Restart the missed therapy plan: diuretic + salt counselling', verdict: 'correct', why: 'The behavioural fix — non-compliance kills more stented patients than stent failures.' },
                { id: 'm7', label: '3 L crystalloid bolus to "flush the kidneys"', verdict: 'harmful', why: 'Flooding a wet lung is the exact opposite of the physiology — renal flush belongs to other syndromes.' },
                { id: 'm8', label: 'Immediate intubation in every case before drugs', verdict: 'wrong', why: 'CPAP + drugs avert most intubations; the airway is a rung on the ladder, not rung one.' },
                { id: 'm9', label: 'Send home with cough syrup and review next week', verdict: 'harmful', why: 'SpO₂ 88% with bat-wing oedema is an admission, not a pharmacy visit.' },
              ],
            },
          ],
        },
        {
          id: 'st-followup', kind: 'followup', label: 'Follow-up', intro: [
            'Day 2: sitting at 45°, SpO₂ 95% on room air, urine 3 L. Echo: EF 30%, moderate functional MR.',
          ], interactions: [
            {
              id: 'in-fu1', kind: 'choice',
              prompt: 'Which discharge medications IMPROVE SURVIVAL in this EF-30% heart failure?',
              options: [
                { id: 'f1', label: 'ACE inhibitor + beta-blocker + mineralocorticoid antagonist (± SGLT2 inhibitor)', verdict: 'correct', why: 'The four pillars of HFrEF mortality benefit — each independently reduces death; add them in sequence as tolerated.' },
                { id: 'f2', label: 'Digoxin — proven mortality benefit', verdict: 'wrong', why: 'Digoxin reduces symptoms/hospitalisation, NOT mortality — the classic pharmacology trap.' },
                { id: 'f3', label: 'Amlodipine for the failing heart', verdict: 'harmful', why: 'First-generation dihydropyridines have neutral-to-negative outcomes in HFrEF; they treat BP, not survival.' },
                { id: 'f4', label: 'Furosemide alone is enough', verdict: 'wrong', why: 'Diuretics control congestion — they do not touch the mortality curve.' },
              ],
            },
            {
              id: 'in-fu2', kind: 'choice',
              prompt: 'He asks what "Kerley B lines" on his X-ray were.',
              options: [
                { id: 'f5', label: 'Distended interlobular septa from interstitial fluid — the X-ray fingerprint of pressure (cardiac) oedema', verdict: 'correct', why: 'Short parallel lines at the lung bases perpendicular to the pleura = fluid in the interlobular septa — hydrostatic oedema\'s signature.' },
                { id: 'f6', label: 'Scars from his old stent surgery', verdict: 'wrong', why: 'Stents live inside coronary arteries — invisible on a plain film.' },
                { id: 'f7', label: 'Tuberculosis marks', verdict: 'wrong', why: 'TB leaves apical fibrocavitary disease, not basal septal lines.' },
                { id: 'f8', label: 'Air trapping from COPD', verdict: 'wrong', why: 'Air trapping shows hyperlucency and flat diaphragms — the opposite of septal fluid lines.' },
              ],
            },
          ],
        },
      ],
    },
  },
]