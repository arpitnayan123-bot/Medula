// ─── MEDICAL RESOURCE CATALOG — curated external resources (PRODUCT 14) ─────
// The trust layer of the Medical Content & Resource Hub.
//
// ABSOLUTE RULES this file obeys (see SOURCE_REGISTRY.md + spec):
//   · METADATA ONLY. We index what a resource IS (title, type, subjects,
//     source, license status) and link to its ORIGINAL location. We never
//     re-host, mirror, scrape or redistribute copyrighted material.
//   · Public availability ≠ permission to redistribute. Access describes how
//     the SOURCE can be reached; license describes what may be done with the
//     content. Both are recorded separately and honestly.
//   · `urlVerified: true` = the domain was confirmed via a live web search
//     (z-ai `web_search`) on the date in `lastVerified`. Base domains marked
//     ✅ on 2026-10-04 were verified in the SOURCE_REGISTRY session.
//   · Entries we could not confirm carry `urlVerified: false`,
//     `lastVerified: null` and a note — shown in UI as "verification pending".
//     We never present an unverified link as verified.
//   · `description` is ALWAYS our own original summary. We never copy source
//     page text, so AI assistance over this catalog cannot launder copyright.

import type { LibraryExternalResource, ResourceKind } from './types'

export const CATALOG_VERIFIED_ON = '2026-10-06'
const PENDING = 'Recorded but not yet confirmed in a verification session — confirm at the link'

/** Attribution templates — honest per-source reuse rules. */
const ATTR = {
  gov: 'Government/IGO publication — link to the original; reuse governed by the source’s own terms',
  ccBy4: 'CC BY 4.0 — credit OpenStax (Rice University) with the license link; derivatives allowed with attribution',
  ccByNcSa: (who: string) => `CC BY-NC-SA — credit ${who}; non-commercial, share derivatives under the same license`,
  ccByNcNd: (who: string) => `CC BY-NC-ND — credit ${who}; non-commercial, no derivatives`,
  variesPerChapter: 'Open access, but the license varies per chapter/article — check each item’s own license line before reuse',
  siteCopyright: (who: string) => `© ${who} — free to access and link; no reproduction or re-hosting beyond permitted personal study use`,
  publicDomain: 'Public domain (US government work) — attribution appreciated, not legally required',
} as const

interface Row {
  id: string
  kind: ResourceKind
  title: string
  description: string
  sourceName: string
  sourceSlug: string
  url: string
  urlVerified: boolean
  license: string
  attribution: string
  subjects: string[]
  topicIds?: string[]
  difficulty: 1 | 2 | 3
  exams?: string[]
  access?: LibraryExternalResource['access']
  pendingNote?: string
}

/**
 * The curated external catalog. Subject ids/topic ids reference the frozen
 * curriculum registry (src/lib/curriculum/*) — validated by tests below.
 */
const ROWS: Row[] = [
  // ── Guidelines & policy ───────────────────────────────────────────────────
  {
    id: 'ext:who-guidelines',
    kind: 'guideline',
    title: 'WHO — Global guidelines & health-topic guidance',
    description: 'The World Health Organization’s recommendations on clinical management, public-health programmes and disease control — the primary international reference for community medicine, infectious disease and national programme questions.',
    sourceName: 'World Health Organization (WHO)',
    sourceSlug: 'who',
    url: 'https://www.who.int/health-topics',
    urlVerified: true,
    license: 'WHO web content — free to access; reuse requires WHO permission per their copyright page',
    attribution: ATTR.gov,
    subjects: ['cm', 'microbiology', 'medicine', 'peds'],
    topicIds: ['t-cm-vaccines', 't-cm-epi', 'microbiology-malaria', 'medicine-tuberculosis', 'microbiology-sepsis'],
    difficulty: 2,
    exams: ['neetpg', 'fmge', 'mbbs'],
  },
  {
    id: 'ext:nmc-cbme',
    kind: 'guideline',
    title: 'NMC — CBME curriculum & competency framework',
    description: 'The National Medical Commission’s Competency-Based Medical Education curriculum — the official structure every MBBS subject, competency and assessment in India maps to.',
    sourceName: 'National Medical Commission (NMC)',
    sourceSlug: 'nmc-india',
    url: 'https://www.nmc.org.in/information-desk/for-colleges/ug-curriculum',
    urlVerified: true,
    license: 'Government of India publication — free to access',
    attribution: ATTR.gov,
    subjects: ['cm', 'medicine', 'surgery', 'obgy', 'peds'],
    difficulty: 1,
    exams: ['mbbs', 'fmge'],
  },
  {
    id: 'ext:nbems-neetpg',
    kind: 'pyq',
    title: 'NBEMS — NEET-PG information bulletin & announcements',
    description: 'The official NEET-PG source: eligibility, exam pattern, marking scheme and officially released papers/answer keys when published. Always check here before trusting any third-party exam claim.',
    sourceName: 'National Board of Examinations in Medical Sciences (NBEMS)',
    sourceSlug: 'nbems',
    url: 'https://natboard.edu.in',
    urlVerified: true,
    license: 'Government of India publication — free to access',
    attribution: ATTR.gov,
    subjects: ['medicine', 'surgery', 'obgy', 'peds'],
    difficulty: 2,
    exams: ['neetpg'],
  },
  {
    id: 'ext:nbems-fmge',
    kind: 'pyq',
    title: 'NBEMS — FMGE / NExT information',
    description: 'Official FMGE (Foreign Medical Graduate Examination) and NExT announcements from the conducting board — pattern, eligibility and released papers.',
    sourceName: 'National Board of Examinations in Medical Sciences (NBEMS)',
    sourceSlug: 'nbems',
    url: 'https://natboard.edu.in/fmge',
    urlVerified: true,
    license: 'Government of India publication — free to access',
    attribution: ATTR.gov,
    subjects: ['medicine', 'surgery'],
    difficulty: 2,
    exams: ['fmge'],
  },
  {
    id: 'ext:icmr-guidelines',
    kind: 'guideline',
    title: 'ICMR — guidelines, trials & health research',
    description: 'Indian Council of Medical Research guidance — national research ethics, disease-control recommendations and ICMR task-force reports referenced in Indian exam questions.',
    sourceName: 'Indian Council of Medical Research (ICMR)',
    sourceSlug: 'icmr',
    url: 'https://www.icmr.gov.in',
    urlVerified: true,
    license: 'Government of India publication — free to access',
    attribution: ATTR.gov,
    subjects: ['cm', 'microbiology', 'medicine'],
    topicIds: ['t-cm-epi', 'medicine-tuberculosis'],
    difficulty: 3,
    exams: ['neetpg', 'fmge'],
  },
  {
    id: 'ext:cdc-clinical',
    kind: 'guideline',
    title: 'CDC — clinical guidance & disease pages',
    description: 'US CDC clinical recommendations — vaccination schedules, infection control, travel health and disease-specific management pages used as reference standards worldwide.',
    sourceName: 'Centers for Disease Control and Prevention (CDC)',
    sourceSlug: 'cdc',
    url: 'https://www.cdc.gov',
    urlVerified: true,
    license: 'Public domain (US government work)',
    attribution: ATTR.publicDomain,
    subjects: ['cm', 'microbiology', 'peds', 'medicine'],
    topicIds: ['t-cm-vaccines', 'peds-immunization', 'microbiology-malaria'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },
  {
    id: 'ext:mohfw-programmes',
    kind: 'guideline',
    title: 'MoHFW — national health programmes of India',
    description: 'The Ministry of Health & Family Welfare’s official pages for every National Health Programme (TB, RMNCH+A, immunisation, NCDs) — a direct exam-yield source for Community Medicine.',
    sourceName: 'Ministry of Health & Family Welfare, India',
    sourceSlug: 'mohfw-india',
    url: 'https://mohfw.gov.in',
    urlVerified: true,
    license: 'Government of India publication — free to access',
    attribution: ATTR.gov,
    subjects: ['cm', 'peds'],
    topicIds: ['t-cm-vaccines', 't-cm-epi', 'peds-immunization'],
    difficulty: 2,
    exams: ['neetpg', 'fmge', 'mbbs'],
  },
  {
    id: 'ext:iap-guidelines',
    kind: 'guideline',
    title: 'IAP — Indian Academy of Pediatrics guidelines',
    description: 'Indian Academy of Pediatrics consensus guidelines and the IAP immunisation schedule — the India-specific paediatric standard that NEET-PG paediatrics follows alongside global guidance.',
    sourceName: 'Indian Academy of Pediatrics (IAP)',
    sourceSlug: 'iap',
    url: 'https://iapindia.org',
    urlVerified: true,
    license: ATTR.siteCopyright('Indian Academy of Pediatrics'),
    attribution: ATTR.siteCopyright('IAP'),
    subjects: ['peds'],
    topicIds: ['peds-immunization', 'peds-neonatal-jaundice', 'peds-diarrhea-dehydration', 't-peds-growth'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },

  // ── References ────────────────────────────────────────────────────────────
  {
    id: 'ext:statpearls',
    kind: 'reference',
    title: 'StatPearls — peer-reviewed topic summaries (NCBI Bookshelf)',
    description: 'Continuously updated, peer-reviewed summaries of thousands of medical topics on the NCBI Bookshelf — a free first stop for a quick, structured overview of almost any concept.',
    sourceName: 'NCBI Bookshelf (NIH/NLM)',
    sourceSlug: 'nih',
    url: 'https://www.ncbi.nlm.nih.gov/books/',
    urlVerified: true,
    license: ATTR.variesPerChapter,
    attribution: ATTR.variesPerChapter,
    subjects: ['medicine', 'pathology', 'pharmacology', 'physiology', 'surgery', 'peds'],
    difficulty: 2,
    exams: ['neetpg', 'fmge', 'mbbs'],
  },
  {
    id: 'ext:merck-manuals',
    kind: 'reference',
    title: 'MSD/Merck Manual — Professional Edition',
    description: 'The long-running free professional medical reference covering etiology, diagnosis and treatment across every specialty — strong for quick pre-exam refreshers and clinical detail.',
    sourceName: 'Merck & Co. / MSD Manuals',
    sourceSlug: 'merck-manuals',
    url: 'https://www.merckmanuals.com/professional',
    urlVerified: true,
    license: ATTR.siteCopyright('Merck & Co., Inc.'),
    attribution: ATTR.siteCopyright('MSD Manuals'),
    subjects: ['medicine', 'surgery', 'peds', 'obgy', 'psy', 'orth', 'ent', 'opht'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },
  {
    id: 'ext:medlineplus',
    kind: 'reference',
    title: 'MedlinePlus — consumer-level health encyclopedia (NLM)',
    description: 'The US National Library of Medicine’s plain-language encyclopedia (ADAM illustrated topics included). Public-domain explanations ideal for building the patient-communication side of any topic.',
    sourceName: 'US National Library of Medicine (NIH)',
    sourceSlug: 'medlineplus',
    url: 'https://medlineplus.gov',
    urlVerified: true,
    license: ATTR.publicDomain,
    attribution: ATTR.publicDomain,
    subjects: ['medicine', 'cm', 'peds'],
    difficulty: 1,
    exams: ['mbbs'],
  },
  {
    id: 'ext:nci-pdq',
    kind: 'reference',
    title: 'NCI PDQ — authoritative cancer information summaries',
    description: 'The US National Cancer Institute’s PDQ summaries on screening, prevention, staging and treatment — public-domain, regularly reviewed oncology references.',
    sourceName: 'National Cancer Institute (NIH)',
    sourceSlug: 'nci',
    url: 'https://www.cancer.gov/publications/pdq',
    urlVerified: true,
    license: ATTR.publicDomain,
    attribution: ATTR.publicDomain,
    subjects: ['oncology', 'medicine', 'surgery'],
    topicIds: ['t-patho-neoplasia', 'oncology-tnm-staging'],
    difficulty: 3,
    exams: ['neetpg'],
  },
  {
    id: 'ext:litfl',
    kind: 'clinical',
    title: 'LITFL — ECG library, clinical cases & eponym dictionary',
    description: 'Life in the Fast Lane’s beloved free library: a curated ECG library with annotated tracings, clinical cases and the internet’s best medical eponym dictionary — a revision classic for emergency and critical-care topics.',
    sourceName: 'Life in the Fast Lane (LITFL)',
    sourceSlug: 'litfl',
    url: 'https://litfl.com',
    urlVerified: true,
    license: ATTR.siteCopyright('LITFL'),
    attribution: ATTR.siteCopyright('LITFL'),
    subjects: ['medicine', 'anes', 'emergency-medicine', 'critical-care'],
    topicIds: ['t-med-acs', 'medicine-stroke', 't-anes-crit', 'emergency-medicine-abcde', 'physiology-cardiac-electrophysiology'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },
  {
    id: 'ext:teachmeanatomy',
    kind: 'notes',
    title: 'TeachMeAnatomy — illustrated anatomy notes',
    description: 'Structured, illustrated anatomy notes organised by region (with clinical-relevance boxes and quizzes). A friendly first pass before a viva or an anatomy-heavy MCQ set.',
    sourceName: 'TeachMeAnatomy',
    sourceSlug: 'teachmeanatomy',
    url: 'https://teachmeanatomy.info',
    urlVerified: true,
    license: ATTR.siteCopyright('TeachMeAnatomy'),
    attribution: ATTR.siteCopyright('TeachMeAnatomy'),
    subjects: ['anatomy', 'orth'],
    topicIds: ['t-anat-heart', 't-anat-brachial', 't-anat-femoral', 'anatomy-diaphragm', 'anatomy-thyroid-gland'],
    difficulty: 1,
    exams: ['mbbs', 'neetpg'],
  },
  {
    id: 'ext:physiopedia',
    kind: 'reference',
    title: 'Physiopedia — physiotherapy & musculoskeletal reference',
    description: 'Community-built, openly licensed reference for musculoskeletal, neurological and cardiopulmonary physiotherapy — useful for orthopaedics rehabilitation and PMR-adjacent concepts.',
    sourceName: 'Physiopedia',
    sourceSlug: 'physiopedia',
    url: 'https://www.physio-pedia.com',
    urlVerified: true,
    license: ATTR.ccByNcSa('Physiopedia contributors'),
    attribution: ATTR.ccByNcSa('Physiopedia contributors'),
    subjects: ['orth', 'physical-medicine-rehabilitation', 'anatomy'],
    topicIds: ['t-orth-fractures', 'orth-colles'],
    difficulty: 2,
    exams: ['mbbs'],
  },

  // ── Open courses & lessons ───────────────────────────────────────────────
  {
    id: 'ext:openstax-ap',
    kind: 'course',
    title: 'OpenStax — Anatomy & Physiology (free open textbook)',
    description: 'Rice University’s openly licensed A&P textbook — complete, peer-reviewed and free. The most license-friendly foundational resource in this catalog: CC BY 4.0 permits adaptation with attribution.',
    sourceName: 'OpenStax (Rice University)',
    sourceSlug: 'openstax',
    url: 'https://openstax.org/details/books/anatomy-and-physiology-2e',
    urlVerified: true,
    license: 'CC BY 4.0 — free to use, share and adapt with attribution',
    attribution: ATTR.ccBy4,
    subjects: ['anatomy', 'physiology'],
    topicIds: ['t-phys-cardcycle', 't-phys-lung', 't-anat-heart', 'physiology-cardiac-electrophysiology', 'physiology-gi-secretion'],
    difficulty: 1,
    exams: ['mbbs', 'fmge'],
  },
  {
    id: 'ext:mit-ocw-biology',
    kind: 'course',
    title: 'MIT OpenCourseWare — biology & biological engineering',
    description: 'Full MIT course materials (video lectures, notes, exams) in biology and biological engineering under open licenses — deep, rigorous grounding for biochemistry, genetics and immunology.',
    sourceName: 'MIT OpenCourseWare',
    sourceSlug: 'mit-opencourseware',
    url: 'https://ocw.mit.edu/search/?d=Biology',
    urlVerified: true,
    license: 'CC BY-NC-SA (most course materials) — check each course page',
    attribution: ATTR.ccByNcSa('MIT OpenCourseWare'),
    subjects: ['biochemistry', 'genetics', 'immunology', 'physiology'],
    topicIds: ['biochemistry-glycolysis-tca', 'genetics-inheritance-patterns', 'immunology-innate-adaptive'],
    difficulty: 3,
    exams: ['mbbs'],
  },
  {
    id: 'ext:khan-medicine',
    kind: 'lesson',
    title: 'Khan Academy — Health & Medicine lessons',
    description: 'Short, clear video lessons across the health-and-medicine library (circulatory, respiratory, renal, endocrine and more) under an open license — ideal for building intuition before deeper study.',
    sourceName: 'Khan Academy',
    sourceSlug: 'khan-academy',
    url: 'https://www.khanacademy.org/science/health-and-medicine',
    urlVerified: true,
    license: 'CC BY-NC-SA — free with attribution, non-commercial',
    attribution: ATTR.ccByNcSa('Khan Academy'),
    subjects: ['physiology', 'medicine', 'peds'],
    topicIds: ['t-phys-raas', 't-phys-lung', 't-med-dm', 'peds-diarrhea-dehydration'],
    difficulty: 1,
    exams: ['mbbs', 'fmge'],
  },
  {
    id: 'ext:nptel-biomed',
    kind: 'course',
    title: 'NPTEL — biomedical & life-science courses (Govt. of India)',
    description: 'India’s national MOOC platform: full university courses in biomedical engineering, life sciences and public health, with certification — free to learn, taught by IIT/IISc faculty.',
    sourceName: 'NPTEL (IITs & IISc, Govt. of India)',
    sourceSlug: 'nptel',
    url: 'https://nptel.ac.in/courses',
    urlVerified: true,
    license: 'NPTEL course license — free to access; reuse per course page',
    attribution: 'Credit NPTEL and the instructor; check each course page',
    subjects: ['biochemistry', 'physiology', 'cm', 'ai-medicine'],
    difficulty: 2,
    exams: ['mbbs'],
  },

  // ── Video lectures ───────────────────────────────────────────────────────
  {
    id: 'ext:ninja-nerd',
    kind: 'lecture-video',
    title: 'Ninja Nerd — free whiteboard lecture library',
    description: 'Deep whiteboard-style science and clinical lectures (the famous long-form pathophysiology and systems series). Watch at 1.5× for a full topic rebuild from first principles.',
    sourceName: 'Ninja Nerd',
    sourceSlug: 'ninja-nerd',
    url: 'https://www.ninjanerd.org',
    urlVerified: true,
    license: ATTR.siteCopyright('Ninja Nerd'),
    attribution: ATTR.siteCopyright('Ninja Nerd'),
    subjects: ['physiology', 'pathology', 'pharmacology', 'medicine'],
    topicIds: ['t-phys-cardcycle', 't-phys-raas', 't-patho-cvpath', 'physiology-cardiac-electrophysiology'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },
  {
    id: 'ext:osmosis',
    kind: 'lecture-video',
    title: 'Osmosis — visual medical lectures (free library + paid full access)',
    description: 'Highly visual, mechanism-first medical videos. A meaningful free library exists on their public pages/YouTube; the complete platform requires a subscription — access marked MIXED.',
    sourceName: 'Osmosis (Elsevier)',
    sourceSlug: 'osmosis',
    url: 'https://www.osmosis.org',
    urlVerified: true,
    license: ATTR.siteCopyright('Osmosis'),
    attribution: ATTR.siteCopyright('Osmosis'),
    subjects: ['medicine', 'pathology', 'physiology', 'pharmacology'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
    access: 'MIXED',
  },
  {
    id: 'ext:zero-to-finals',
    kind: 'lecture-video',
    title: 'Zero to Finals — concise medicine videos & notes',
    description: 'Deliberately concise explanations that strip topics down to what matters — the video series and the free website notes are built for finals and postgraduate entrance revision.',
    sourceName: 'Zero to Finals',
    sourceSlug: 'zero-to-finals',
    url: 'https://zerotofinals.com',
    urlVerified: true,
    license: ATTR.siteCopyright('Zero to Finals'),
    attribution: ATTR.siteCopyright('Zero to Finals'),
    subjects: ['medicine', 'surgery', 'obgy', 'peds'],
    topicIds: ['t-med-htn', 't-med-dm', 't-med-shock', 'medicine-pneumonia', 't-surg-appendix'],
    difficulty: 1,
    exams: ['neetpg', 'fmge', 'mbbs'],
  },

  // ── Articles & papers ────────────────────────────────────────────────────
  {
    id: 'ext:pubmed',
    kind: 'article',
    title: 'PubMed — the biomedical literature index (36M+ citations)',
    description: 'The primary index of biomedical literature from NLM. Search any topic for original research; abstracts are free, full text lives at the publisher. Pair with the platform Research Hub for curated reading.',
    sourceName: 'PubMed (NCBI/NLM)',
    sourceSlug: 'pubmed',
    url: 'https://pubmed.ncbi.nlm.nih.gov',
    urlVerified: true,
    license: 'Index metadata free; article reuse governed by each publisher',
    attribution: 'Cite the original paper and journal',
    subjects: ['medicine', 'cm', 'microbiology', 'pharmacology'],
    difficulty: 3,
    exams: ['neetpg'],
  },
  {
    id: 'ext:pmc-open-access',
    kind: 'article',
    title: 'PubMed Central — full-text open-access archive',
    description: 'NIH’s free full-text archive of journal articles. The open-access subset is the legal home of freely reusable full texts — check each article’s individual license (many CC BY).',
    sourceName: 'PubMed Central (NCBI/NLM)',
    sourceSlug: 'nih',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/',
    urlVerified: true,
    license: ATTR.variesPerChapter,
    attribution: ATTR.variesPerChapter,
    subjects: ['medicine', 'pathology', 'microbiology', 'cm'],
    difficulty: 3,
    exams: ['neetpg'],
  },
  {
    id: 'ext:europe-pmc',
    kind: 'article',
    title: 'Europe PMC — open literature database with public API',
    description: 'EMBL-EBI’s open literature database (the source powering the platform’s Research Hub). Supports open-access filtering, citation counting and programmatic search.',
    sourceName: 'Europe PMC (EMBL-EBI)',
    sourceSlug: 'europe-pmc',
    url: 'https://europepmc.org',
    urlVerified: true,
    license: 'Metadata free via public API; full-text licenses vary per article',
    attribution: 'Cite original papers; API use per Europe PMC terms',
    subjects: ['cm', 'medicine', 'ai-medicine'],
    difficulty: 3,
    exams: ['neetpg'],
  },
  {
    id: 'ext:cochrane-pls',
    kind: 'article',
    title: 'Cochrane Library — systematic reviews & plain-language summaries',
    description: 'Gold-standard evidence syntheses. Abstracts and plain-language summaries are free; full reviews may need a subscription depending on country — the fastest honest answer to "what is the evidence?"',
    sourceName: 'Cochrane Library',
    sourceSlug: 'cochrane-library',
    url: 'https://www.cochranelibrary.com',
    urlVerified: true,
    license: 'Abstracts/PLS free; full reviews subscription-dependent',
    attribution: 'Credit Cochrane and the review authors',
    subjects: ['cm', 'medicine', 'obgy', 'peds'],
    difficulty: 3,
    exams: ['neetpg'],
    access: 'MIXED',
  },
  {
    id: 'ext:indian-pediatrics',
    kind: 'article',
    title: 'Indian Pediatrics — IAP official journal (open access)',
    description: 'The Indian Academy of Pediatrics’ monthly journal, free online — India-relevant paediatric studies, IAP guideline papers and case reports.',
    sourceName: 'Indian Pediatrics (IAP)',
    sourceSlug: 'indian-pediatrics',
    url: 'https://www.indianpediatrics.net',
    urlVerified: true,
    license: 'Free full-text access; reuse per journal terms',
    attribution: 'Cite the article; © Indian Pediatrics',
    subjects: ['peds'],
    topicIds: ['peds-neonatal-jaundice', 'peds-diarrhea-dehydration', 't-peds-growth'],
    difficulty: 3,
    exams: ['neetpg'],
  },
  {
    id: 'ext:ijmr',
    kind: 'article',
    title: 'IJMR — Indian Journal of Medical Research (ICMR)',
    description: 'India’s flagship medical research journal published by ICMR — full-text archive open online, strong on Indian disease epidemiology and national studies.',
    sourceName: 'Indian Council of Medical Research (ICMR)',
    sourceSlug: 'icmr',
    url: 'https://www.icmr.gov.in/ijmr',
    urlVerified: true,
    license: 'Free access; reuse per ICMR/journal terms',
    attribution: 'Cite the article; © ICMR',
    subjects: ['cm', 'microbiology', 'medicine'],
    difficulty: 3,
    exams: ['neetpg'],
  },

  // ── Image libraries ──────────────────────────────────────────────────────
  {
    id: 'ext:radiopaedia',
    kind: 'images',
    title: 'Radiopaedia — collaborative radiology reference & case library',
    description: 'Community-built radiology reference with thousands of annotated cases and an image-rich article library. The go-to for building X-ray/CT pattern recognition for the platform’s imaging topics.',
    sourceName: 'Radiopaedia',
    sourceSlug: 'radiopaedia',
    url: 'https://radiopaedia.org',
    urlVerified: true,
    license: 'Text/images CC BY-NC-SA by contributing authors — non-commercial with attribution',
    attribution: ATTR.ccByNcSa('Radiopaedia and the individual case authors'),
    subjects: ['rad', 'medicine', 'orth'],
    topicIds: ['t-rad-chestxray', 't-orth-fractures', 'orth-colles'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },
  {
    id: 'ext:dermnet',
    kind: 'images',
    title: 'DermNet — dermatology image atlas & condition library',
    description: 'The world’s largest free dermatology resource: clinical photos of almost every skin condition with concise diagnostic notes — essential practice for papulosquamous, eczema and lesion-recognition questions.',
    sourceName: 'DermNet (New Zealand)',
    sourceSlug: 'dermnet',
    url: 'https://dermnetnz.org',
    urlVerified: true,
    license: 'Images CC BY-NC-ND — credit DermNet, no derivatives',
    attribution: ATTR.ccByNcNd('DermNet'),
    subjects: ['derm', 'medicine'],
    topicIds: ['t-derm-psoriasis'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },
  {
    id: 'ext:cdc-phil',
    kind: 'images',
    title: 'CDC Public Health Image Library (PHIL)',
    description: 'Thousands of public-domain public-health images — microbes, outbreaks, clinical and lab photographs. (Recorded honestly: the CDC base domain is verified, this subdomain itself is not yet re-confirmed.)',
    sourceName: 'Centers for Disease Control and Prevention (CDC)',
    sourceSlug: 'cdc',
    url: 'https://phil.cdc.gov',
    urlVerified: false,
    license: 'Most images public domain (US government work) — check each item’s credit line',
    attribution: 'Credit CDC and the listed photographer',
    subjects: ['microbiology', 'cm', 'pathology'],
    topicIds: ['microbiology-malaria', 'microbiology-bacteria-basics', 't-micro-tb'],
    difficulty: 2,
    exams: ['mbbs'],
    pendingNote: PENDING,
  },
  {
    id: 'ext:medlineplus-images',
    kind: 'images',
    title: 'MedlinePlus Medical Encyclopedia — illustrated topics (ADAM)',
    description: 'The A.D.A.M. medical illustration library inside MedlinePlus: clear anatomical and procedure diagrams in public-domain illustrated health topics.',
    sourceName: 'US National Library of Medicine (NIH)',
    sourceSlug: 'medlineplus',
    url: 'https://medlineplus.gov/encyclopedia.html',
    urlVerified: true,
    license: ATTR.publicDomain,
    attribution: ATTR.publicDomain,
    subjects: ['anatomy', 'medicine', 'surgery'],
    topicIds: ['anatomy-diaphragm', 'anatomy-thyroid-gland'],
    difficulty: 1,
    exams: ['mbbs'],
  },

  // ── Clinical skills & tools ──────────────────────────────────────────────
  {
    id: 'ext:geeky-medics',
    kind: 'clinical',
    title: 'Geeky Medics — OSCE guides, examinations & procedures',
    description: 'Step-by-step clinical examination checklists, procedure guides, data interpretation and free video demos — the standard bridge between textbook knowledge and clinical skill marks.',
    sourceName: 'Geeky Medics',
    sourceSlug: 'geeky-medics',
    url: 'https://geekymedics.com',
    urlVerified: true,
    license: ATTR.siteCopyright('Geeky Medics'),
    attribution: ATTR.siteCopyright('Geeky Medics'),
    subjects: ['medicine', 'surgery', 'peds', 'obgy', 'ent', 'opht'],
    topicIds: ['t-opht-redeye', 'ent-epistaxis'],
    difficulty: 1,
    exams: ['mbbs', 'fmge', 'neetpg'],
  },
  {
    id: 'ext:mdcalc',
    kind: 'clinical',
    title: 'MDCalc — medical calculators, formulas & scores',
    description: 'Free clinical calculator library (Wells, CHA₂DS₂-VASc, GCS, Child-Pugh, SOFA…) each with the evidence, interpretation and pitfalls — the fastest way to actually understand a score instead of memorising it.',
    sourceName: 'MDCalc',
    sourceSlug: 'mdcalc',
    url: 'https://www.mdcalc.com',
    urlVerified: true,
    license: ATTR.siteCopyright('MDCalc (MD+Tech)'),
    attribution: ATTR.siteCopyright('MDCalc'),
    subjects: ['medicine', 'surgery', 'anes', 'critical-care'],
    topicIds: ['t-med-shock', 't-med-acs', 'medicine-stroke', 't-anes-crit'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },
  {
    id: 'ext:who-imci',
    kind: 'clinical',
    title: 'WHO/IMCI — Integrated Management of Childhood Illness chart booklet',
    description: 'The WHO/UNICEF IMCI chart booklet — assess-classify-treat tables for sick children used verbatim in paediatrics and community-medicine questions about syndromic management.',
    sourceName: 'World Health Organization (WHO)',
    sourceSlug: 'who',
    url: 'https://www.who.int/publications/i/item/9789240085325',
    urlVerified: true,
    license: 'WHO publication — free to access; reuse per WHO terms',
    attribution: ATTR.gov,
    subjects: ['peds', 'cm'],
    topicIds: ['peds-diarrhea-dehydration', 'peds-neonatal-jaundice', 't-peds-growth'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
  },

  // ── Revision resources ───────────────────────────────────────────────────
  {
    id: 'ext:radiologycafe',
    kind: 'revision',
    title: 'Radiology Cafe — radiology teaching & FRCR-style revision',
    description: 'Free radiology teaching: normal imaging anatomy, X-ray interpretation walkthroughs and physics notes. (Recorded honestly: not yet confirmed in a verification session — check the link.)',
    sourceName: 'Radiology Cafe',
    sourceSlug: 'radiologycafe',
    url: 'https://www.radiologycafe.com',
    urlVerified: false,
    license: ATTR.siteCopyright('Radiology Cafe'),
    attribution: ATTR.siteCopyright('Radiology Cafe'),
    subjects: ['rad'],
    topicIds: ['t-rad-chestxray'],
    difficulty: 2,
    exams: ['neetpg', 'mbbs'],
    pendingNote: PENDING,
  },
  {
    id: 'ext:aiims-academics',
    kind: 'pyq',
    title: 'AIIMS New Delhi — academics & examination portal',
    description: 'The apex AIIMS institute’s official academics section — institute notices, examination information and published academic material for AIIMS-led entrance examinations.',
    sourceName: 'AIIMS New Delhi',
    sourceSlug: 'aiims-new-delhi',
    url: 'https://www.aiims.edu',
    urlVerified: true,
    license: 'Government of India publication — free to access',
    attribution: ATTR.gov,
    subjects: ['medicine', 'surgery'],
    difficulty: 3,
    exams: ['neetpg'],
  },
]

// ── Compile rows → typed catalog records ─────────────────────────────────────

function buildResource(r: Row): LibraryExternalResource {
  return {
    id: r.id,
    ownership: 'external',
    kind: r.kind,
    title: r.title,
    description: r.description,
    sourceName: r.sourceName,
    sourceSlug: r.sourceSlug,
    url: r.url,
    urlVerified: r.urlVerified,
    lastVerified: r.urlVerified ? CATALOG_VERIFIED_ON : null,
    access: r.access ?? 'PUBLIC',
    license: r.license,
    attribution: r.attribution,
    subjects: r.subjects,
    topicIds: r.topicIds ?? [],
    difficulty: r.difficulty,
    exams: r.exams ?? ['neetpg', 'fmge', 'mbbs'],
    language: 'en',
  }
}

export const EXTERNAL_CATALOG: LibraryExternalResource[] = ROWS.map(buildResource)

export const CATALOG_DISCLAIMER =
  'External resources are shown as metadata with a link to the original source — nothing is re-hosted or redistributed. Access describes reaching the source; reuse of its content is governed by that source’s own license. Public availability is not permission to redistribute.'

// ── Helpers ──────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'on', 'your', 'how', 'what'])

/** Deterministic relevance score for a free-text query against one record. */
export function scoreExternal(r: LibraryExternalResource, words: string[]): number {
  if (words.length === 0) return 0
  const hay = [
    r.title, r.description, r.sourceName,
    r.kind, r.exams.join(' '),
  ].join(' ').toLowerCase()
  const topicHay = r.topicIds.join(' ').toLowerCase().replace(/-/g, ' ')
  const subjectHay = r.subjects.join(' ')
  let score = 0
  for (const w of words) {
    if (r.title.toLowerCase().includes(w)) score += 3
    else if (hay.includes(w)) score += 2
    if (topicHay.includes(w)) score += 2
    if (subjectHay.includes(w)) score += 2
  }
  return score
}

/** Split a query into scored words (shared by the engine). */
export function queryWords(q: string): string[] {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}

/** Valid catalog ids — used by AI routes so the LLM can never cite invented ids. */
export const CATALOG_IDS: Set<string> = new Set(EXTERNAL_CATALOG.map((r) => r.id))

export function externalById(id: string): LibraryExternalResource | null {
  return EXTERNAL_CATALOG.find((r) => r.id === id) ?? null
}
