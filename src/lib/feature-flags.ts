// ── Feature flags (Medical Knowledge OS spec §104) ─────────────────────────
// Advanced surfaces ship behind explicit flags so the product grows
// phase-by-phase without half-built features leaking into the UI.

export const FEATURES = {
  // Unified discovery: local knowledge graph + Europe PMC + live web search
  ENABLE_EXPLORE: true,

  // Research Hub — real paper metadata via Europe PMC (EBI) public REST API.
  // We render metadata + abstracts with provenance and always link to the
  // original source. We never reproduce full copyrighted papers.
  ENABLE_RESEARCH_HUB: true,

  // Institutional source registry (AIIMS, NMC, ICMR, WHO, Harvard, JHU, …).
  // Metadata + official URLs only; verification status shown honestly.
  ENABLE_INSTITUTION_EXPLORER: true,

  // AI explanation of a single paper's abstract — locked to the provided
  // text (RAG-lite): if the abstract doesn't contain the answer, the model
  // must say so. Output is always labelled as AI interpretation.
  ENABLE_PAPER_EXPLAIN: true,

  // Medical Content & Resource Hub (PRODUCT 14) — curated metadata + link-out
  // catalog over platform-owned content and open/licensed external resources.
  ENABLE_RESOURCE_HUB: true,

  // ── Flagged OFF until their phase arrives (do not build ad-hoc) ──
  ENABLE_MENTORSHIP: false, // Phase 11 — needs real auth + credential verification workflow
  ENABLE_SOURCE_PIPELINE: false, // Phase 6 — crawler + admin review queue; needs dedicated infra
  ENABLE_GUIDELINE_COMPARE: false, // needs a curated, versioned guideline store first
  ENABLE_PAPER_DIFFICULTY: false, // honest limitation: no verified difficulty methodology yet
  ENABLE_COURSE_HUB: false, // dedicated global-courses surface (course discovery folds into Explore for now)
} as const

export type FeatureFlag = keyof typeof FEATURES
