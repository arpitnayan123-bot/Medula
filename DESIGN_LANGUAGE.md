# MEDULA · PORCELAIN ATLAS — Design Language (v1)

The one design system for the whole product. Every view must feel like it
belongs to the same warm, tactile, academic medical campus.

**Do NOT copy any specific company. Original language: warm ivory + surgical
teal + champagne + coral. Light only. Never dark. Never neon. Never generic.**

---

## 1 · Tokens (already defined in `src/app/globals.css` — USE THESE, not raw colors)

| Purpose | Token utility |
|---|---|
| Page canvas | `bg-background` (warm ivory — body already carries it) |
| Elevated card | `clay` (+ `clay-hover` for clickable) — the canonical card |
| Recessed well | `clay-in` (chips, filters, active toggles, code wells) |
| Input / select well | `clay-field` |
| Tabs tray / active tab | `clay-tray` / `clay-tab` |
| Primary button | `clay-btn` (add to Button className) |
| Soft button | `clay-btn-soft` |
| Warm glass | `glass` / `glass-strong` (floating nav, modals, overlays) |
| Hero podium | `podium` (the big warm hero stage) |
| Warm accent card | `warm-card` (champagne tint — struggle zones, highlights) |
| Text | `text-foreground` / `text-ink` primary, `text-ink-soft` secondary, `text-muted-foreground` tertiary |
| Hairline | `border-line` (never border-slate/gray/zinc) |
| Success / warn / crit / info | `sev-ok` / `sev-warn` / `sev-crit` / `info` |
| Human warmth | `peach`, `gold` (champagne), `mint` |
| Shadows | `shadow-raised`, `shadow-lift`, `shadow-well`, `shadow-float` |
| Data-viz family | `chart-1..5` (teal, sky, mint, champagne, coral) |

### Subject identities (subtle worlds — use `SubjectGlyph` / `subjectIdentity` from `@/components/primitives/kit`)
anatomy=terracotta · physiology=teal · biochemistry=champagne · pathology=dusty-rose ·
pharmacology=sage · microbiology=moss · medicine=clinical-blue · surgery=steel ·
paediatrics=peach · obgyn=rose.

## 2 · Typography

- **Display serif** (`font-display` = Source Serif 4): h1 page titles, hero
  headlines, big moments. Add `font-display` class explicitly on h1/h2 that
  matter. Base h1/h2 are already serif via globals.
- Body/UI: Geist (default). Mono: Geist Mono (already).
- Eyebrow labels: `text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft` (use `MicroLabel`).
- Hierarchy: Display 2.75–3.5rem / H1 1.875–2.25rem / H2 1.25–1.5rem / H3 1rem–1.125 / body 0.875 / caption 0.75 / label 0.6875 uppercase.

## 3 · Canonical primitives — `@/components/primitives/kit.tsx`

`Reveal`, `AnimatedNumber`, `MicroLabel`, `PageHeader`, `SectionTitle`,
`EmptyState`, `Callout` (tones: pearl/key/exam/easy/warn), `SubjectGlyph`,
`subjectIdentity`, `EASE`.

- **Page headers**: prefer `PageHeader` (eyebrow + serif title + intro + right slot).
- **Section titles**: `SectionTitle` (icon + serif-ish h2 + right slot).
- **Empty states**: `EmptyState` (icon in a shadow-well tile + title + hint + action). Never a bare "No data" line.
- **Content callouts**: `Callout` — clinical pearls (gold), key points (teal),
  exam focus (coral), easy explanations (mint), cautions (warn).

## 4 · Rules of the house

1. **Cards**: ONE elevated language — `clay clay-hover`. Replace hand-rolled
   `border border-line bg-card/XX shadow-sm backdrop-blur-sm` cards and old
   `glass` cards with `clay` (keep `glass`/`glass-strong` ONLY for floating
   nav, modals, command palettes, sticky headers, AI panels, overlays).
2. **Motion**: subtle only. `Reveal` for entrance (stagger ≤ 0.05s), `lift`/
   `press`/`clay-hover` for touch, `AnimatedNumber` for figures. Respect
   `useReducedMotion`. Never gaming-like.
3. **No emojis as icons** — replace with lucide icons (keep learn subject
   emojis ONLY where they are data-driven subject identity already accepted;
   `SYSTEM_EMOJI` in learn may stay). 💡 → `Lightbulb`, 🎯 → `Target`,
   🧪 → `FlaskConical`, 🙈 → `EyeOff`, 🔖 → `Bookmark`, 🏆 → `Trophy`,
   🎉 → `PartyPopper`, 🏁 → `Flag`, 🗓️ → `CalendarDays`, 🧊 → `Box`, 🧠 → `Brain`.
4. **No raw palette colors** (`text-amber-500`, `bg-sky-100`, `from-cyan-500`…)
   — map to tokens: amber→`gold`/`sev-warn`, sky/cyan→`primary`/`info`,
   emerald→`sev-ok`/`mint`, rose→`sev-crit`/`peach`, violet→`primary`,
   fuchsia/teal→`primary`/`mint`, slate/gray/zinc→`ink-soft`/`surface-2`/`line`.
   Exception: `understand/` scene SVG hex colors are data art — leave the
   scene internals; only restyle surrounding chrome.
5. **No `dark:` classes** (dead code — dark mode removed). Delete them when
   touching a line; don't do dedicated sweeps that risk breakage.
6. **Gradients**: only the sanctioned ones — `ink-gradient` text, teal→mint
   progress fills (`bg-gradient-to-r from-primary to-[oklch(0.62_0.105_158)]`),
   podium/hero scene tints, avatar `from-primary/18 to-primary/8`.
7. **Contrast is law**: text on ivory ≥ 4.5:1. Never white-on-champagne.
8. **Touch targets ≥ 44px** (`min-h-11`). Focus states: `focus-visible:ring-2 focus-visible:ring-ring` or `ring-focus`.
9. **Spacing rhythm**: 4/8pt. Section gap `space-y-6`, card padding `p-4 md:p-6`, grid gaps 3–4.
10. **Radii**: cards `rounded-2xl`, heroes `rounded-3xl`, chips `rounded-full`, inputs `rounded-xl` (clay handles).
11. **Scroll strips**: `med-scroll` (visible) / `no-scrollbar` (hidden).
12. **Never** change: business logic, API calls, store wiring, routes, auth,
    props flow, data shapes, event handlers, a11y attributes (aria-*, roles),
    keyboard handling. className + presentational JSX only. When in doubt,
    change only the class string.

## 5 · Page header recipe (replace hand-rolled h1 sections)

```tsx
<PageHeader
  eyebrow={<><Sparkles className="mr-1 inline size-3" />Feature name</>}
  title="Human, calm title"
  intro="One measured sentence about what this surface does for the student."
  right={<Button className="clay-btn" size="sm">Primary action</Button>}
/>
```

## 6 · The emotional register

Warm · clinical · scientific · human · intelligent · tactile · dimensional ·
premium · academic · modern · welcoming. Copy stays honest and measured.
The product must whisper "you are becoming a doctor" — never shout.

---

## 7 · ATELIER ELEVATION (v2) — motion, scenery, realtime color

The porcelain base is done. v2 adds the living layer. New canonical imports:

### Motion — `@/components/primitives/motion`
`SPRING` / `SPRING_SOFT` / `SPRING_SNAP` (house springs) ·
`Stagger` + `StaggerItem` (cascade reveals for card grids/rows) ·
`ScrollReveal` (viewport-aware, once; from=up/left/right/scale) ·
`Parallax` (gentle scroll drift) · `LiftCard` (spring hover lift) ·
`Magnetic` (hero CTAs lean toward cursor) · `Pop` (one-shot badge pop) ·
`Pressable` (springy press) · `SpringBar` (animated progress fill) ·
`SpringNumber` (spring count-up) · `LiveDot` (pulsing live mark) ·
`OrbitPulse` (quiet loader) · `Shimmer` (skeleton line).

**Use sparingly and consistently**: grids/rows → `Stagger`+`StaggerItem`;
below-fold sections → `ScrollReveal`; hero CTAs → `Magnetic`; clickable clay
cards may wrap in `LiftCard`. Everything is reduced-motion aware already.

### Scenery — `@/components/primitives/scenery` (Haikei-spirit original SVG)
`AuroraWaves` (hero wave bands) · `ContourAtlas` (topographic contour lines —
the Atlas signature) · `BlobField` (soft organic washes) · `DotMatrix` (dot
grid w/ radial fade) · `OrbitRings` (knowledge orbits) · `PulseTrace` (ECG
line) · `MoleculeDrift` (floating molecule) · `GrainVeil` (paper grain).
Place as **first child of a `relative` section**, content above with
`relative z-10`. They are decorative only — never behind dense text tables.
One (max two) scenery piece per view. Subtlety is the law: if you notice the
scenery before the content, it is too strong.

### Ambient Hour (already global — zero work needed)
`AmbientHour` in the root layout tags `<html data-ambient="dawn|morning|
afternoon|dusk|evening|night">`; body + podium washes shift warmth with the
real clock. Do NOT hardcode hour-based colors in views — the system handles it.

### Shell (already elevated — zero work needed)
Spring drawers/sheets, gliding dock pill, scroll-reactive header are done.
Do not touch `app-shell.tsx`.

## §8 — The Aura Layer (v3 expressiveness)

Skiper-UI-grade effects, re-engineered for a light, warm, academic surface.
Primitives live in `src/components/primitives/aura.tsx`, their keyframes in
the `AURA` section of `globals.css`. Every effect animates transform/opacity
only, is pointer-fine-aware, and collapses to a calm static state under
`prefers-reduced-motion`.

| Primitive | Feel | Spend it on |
|---|---|---|
| `SpotlightCard` | a warm teal wash follows the cursor | hero cards, feature grids (≤1 per view) |
| `BorderBeam` | champagne comet riding the card edge | THE one hero card per view |
| `Aurora` | slow champagne/mint/teal light drift | landing + view heroes, behind scenery |
| `Marquee` | infinite edge-faded chip drift | ambient capability strips (landing only) |
| `TiltCard` | ≤4.5° spring lean toward cursor | persona/feature cards (desktop only) |
| `Sheen` | hover light sweep on CTAs | primary CTA per view |
| `WordCycle` | rotating word in display headings | sparingly (greetings) |
| `GlowRing` | conic progress ring + champagne halo | level/readiness ring moments |
| `NoiseVeil` | 3.5% paper grain | hero cards needing texture |
| `TextShimmer` | metallic drift on one word | one hero word per view max |

**Budget law: 1–2 (max 3) aura moments per view. Never stack two effects on
one element. Never inside question/answer runners.** The Legacy Board
(`profile-legacy.tsx`) is the flagship composition: member-since hero,
since-joined well grid, measured contribution calendar, badge wall, streak
rails, subject mastery ladder — every number counted from real ledgers.
