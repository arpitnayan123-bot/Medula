// ─── PRODUCT 19 — AI FACULTY & CONTENT INTELLIGENCE · DEMO WORKSPACE SEED ────
// Idempotent: skips when the workspace already holds drafts. Seeds a small,
// honest faculty workspace anchored on REAL content rows:
//   1. a published (human-reviewed) summary draft + verified version v1
//   2. an AI-ASSISTED flashcard draft waiting in review
//   3. an AI-ASSISTED key-points draft still in draft
//   4. the measured answer-key-skew flagged for human review
// plus the matching audit-trail rows. Nothing here invents measurements —
// the skew evidence mirrors what the quality engine computes live.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const ACTOR = 'Faculty (demo)'

async function main() {
  const existing = await db.facultyDraft.count()
  if (existing > 0) {
    console.log(`Faculty seed skipped — workspace already holds ${existing} drafts.`)
    return
  }

  // Real anchors (verified to exist in the seeded curriculum)
  const acei = await db.concept.findUnique({ where: { id: 'c-acei' }, select: { id: true, name: true } })
  const ami = await db.concept.findUnique({ where: { id: 'c-ami' }, select: { id: true, name: true } })
  const dka = await db.concept.findUnique({ where: { id: 'c-dka' }, select: { id: true, name: true } })
  if (!acei || !ami || !dka) {
    console.log('Faculty seed skipped — anchor concepts not found (run the main seed first).')
    return
  }

  // ── 1) published summary draft + verified version v1 ──────────────────────
  const published = await db.facultyDraft.create({
    data: {
      profileId: 'faculty-demo',
      kind: 'summary',
      entityType: 'concept',
      entityId: acei.id,
      entityLabel: acei.name,
      title: `Library summary: ${acei.name}`,
      body: {
        text: 'ACE inhibitors block the conversion of angiotensin I to angiotensin II, lowering both vasoconstriction and aldosterone drive. The library summary keeps four anchors in view: afterload reduction in heart failure, nephroprotective effect in diabetic kidney disease, the dry cough/angioedema pair that separates them from ARBs, and the contraindication cluster (pregnancy, bilateral renal artery stenosis, hyperkalaemia risk).',
        references: [
          `MEDOS lesson — ${acei.name}`,
          'MEDOS concept graph — RAAS pathway edges',
        ],
      },
      status: 'published',
      aiAssisted: false,
      grounded: true,
      changeNote: 'Initial library summary drafted from the existing lesson.',
      reviewerNote: 'Verified against the platform lesson and the RAAS graph edges — terminology matches the lesson, no new claims introduced.',
      reviewedBy: ACTOR,
      publishedVersion: 1,
    },
  })

  const version = await db.facultyContentVersion.create({
    data: {
      entityType: 'concept',
      entityId: acei.id,
      entityLabel: acei.name,
      version: 1,
      verificationStatus: 'verified',
      reviewer: ACTOR,
      summary: 'Verified against the platform lesson and the RAAS graph edges — no new claims introduced.',
      references: [
        `MEDOS lesson — ${acei.name}`,
        'MEDOS concept graph — RAAS pathway edges',
      ],
      body: {
        text: 'ACE inhibitors block the conversion of angiotensin I to angiotensin II, lowering both vasoconstriction and aldosterone drive. The library summary keeps four anchors in view: afterload reduction in heart failure, nephroprotective effect in diabetic kidney disease, the dry cough/angioedema pair that separates them from ARBs, and the contraindication cluster (pregnancy, bilateral renal artery stenosis, hyperkalaemia risk).',
        references: [
          `MEDOS lesson — ${acei.name}`,
          'MEDOS concept graph — RAAS pathway edges',
        ],
      },
      lastReviewedAt: new Date(),
    },
  })

  // ── 2) AI-ASSISTED flashcard draft waiting in review ──────────────────────
  const inReview = await db.facultyDraft.create({
    data: {
      profileId: 'faculty-demo',
      kind: 'flashcards',
      entityType: 'concept',
      entityId: ami.id,
      entityLabel: ami.name,
      title: `AI draft — Flashcards: ${ami.name}`,
      body: {
        cards: [
          { front: 'Which two ECG changes within hours of STEMI point to immediate reperfusion?', back: 'ST-segment elevation in contiguous leads (± new LBBB) with evolving hyperacute T waves — window and morphology together, not either alone.' },
          { front: 'Why does troponin rise even in unstable angina-free MI variants?', back: 'Myocyte necrosis releases troponin regardless of the infarct size — unstable angina by definition is ischaemia WITHOUT necrosis, so its troponin stays normal.' },
          { front: 'First-line reperfusion when PCI is unavailable within 120 minutes?', back: 'Fibrinolysis within the golden window, then transfer for angiography — the door-to-needle discipline mirrors the door-to-balloon one.' },
        ],
        references: [`MEDOS platform content — ${ami.name}`],
      },
      status: 'in-review',
      aiAssisted: true,
      grounded: true,
      changeNote: 'Draft flashcards generated from the platform question pool; wording aligned with the lesson.',
    },
  })

  // ── 3) AI-ASSISTED key-points draft, still in draft ───────────────────────
  await db.facultyDraft.create({
    data: {
      profileId: 'faculty-demo',
      kind: 'key-points',
      entityType: 'concept',
      entityId: dka.id,
      entityLabel: dka.name,
      title: `AI draft — Key points: ${dka.name}`,
      body: {
        bullets: [
          'Diagnosis rests on the triad — hyperglycaemia, ketosis, metabolic acidosis — not on any single lab value.',
          'Fluids come first: crystalloid before insulin, and potassium is checked before any insulin infusion.',
          'Insulin is infused at a fixed low dose and held if potassium is low — the sequence is the exam.',
          'Cerebral oedema is the complication that kills young patients — headache with falling sodium in the first hours is the alarm.',
        ],
        references: [`MEDOS platform content — ${dka.name}`],
      },
      status: 'draft',
      aiAssisted: true,
      grounded: true,
      changeNote: '',
    },
  })

  // ── 4) measured answer-key skew, flagged for human review ─────────────────
  const total = await db.question.count()
  const skewRows = await db.$queryRawUnsafe<{ answer: string; c: bigint }[]>(
    'SELECT answer, COUNT(*) AS c FROM Question GROUP BY answer ORDER BY c DESC LIMIT 1',
  )
  const top = skewRows[0]
  if (top && total > 0) {
    const share = Math.round((Number(top.c) / total) * 100)
    if (share >= 40) {
      const item = await db.facultyReviewItem.create({
        data: {
          entityType: 'question',
          entityId: '__bank__',
          kind: 'answer-key-skew',
          severity: share >= 60 ? 'critical' : 'warning',
          status: 'open',
          evidence: [
            `${share}% of ${total} answer keys sit on option ${top.answer} — students can game the key without knowing the content.`,
            'Measured live over the whole question bank by the quality engine; flagged here for a human decision.',
          ],
          suggestion: 'Rebalance correct answers across options on new and edited questions; treat existing skew as a writing habit to fix, not a scoring bug.',
        },
      })
      await db.facultyAuditLog.create({
        data: {
          actor: ACTOR,
          action: 'item-flagged',
          entityType: 'question',
          entityId: '__bank__',
          detail: { itemId: item.id, kind: 'answer-key-skew', severity: item.severity, seeded: true },
        },
      })
    }
  }

  // ── audit trail for the seeded lifecycle ─────────────────────────────────
  const auditRows: { action: string; entityType: string; entityId: string; detail: object }[] = [
    { action: 'draft-created', entityType: 'concept', entityId: acei.id, detail: { draftId: published.id, title: published.title, kind: 'summary', aiAssisted: false, seeded: true } },
    { action: 'draft-created', entityType: 'concept', entityId: ami.id, detail: { draftId: inReview.id, title: inReview.title, kind: 'flashcards', aiAssisted: true, seeded: true } },
    { action: 'draft-submitted', entityType: 'concept', entityId: ami.id, detail: { draftId: inReview.id, title: inReview.title, seeded: true } },
    { action: 'draft-published', entityType: 'concept', entityId: acei.id, detail: { draftId: published.id, title: published.title, seeded: true } },
    { action: 'version-created', entityType: 'concept', entityId: acei.id, detail: { version: 1, verificationStatus: 'verified', draftId: published.id, seeded: true } },
  ]
  for (const row of auditRows) {
    await db.facultyAuditLog.create({ data: { actor: ACTOR, action: row.action, entityType: row.entityType, entityId: row.entityId, detail: row.detail } })
  }

  console.log('✅ Faculty seed complete:', { drafts: 3, versions: 1, reviewItems: 1, audit: auditRows.length + 1 })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
