// ─── PRODUCT 10 · MEDICAL IMAGE LEARNING LAB — platform-drawn SVG assets ────
// Deterministic, medically accurate schematic teaching images (waveforms,
// radiograph schematics, photomicrograph schematics). Fully platform-owned.
// Each file is served from /questions/*.svg. Also emits lab-svg-regions.json
// with finding pin regions (x,y in % of size, r = hit radius in % of height)
// so the seeded briefs grade pins against EXACT geometry.
import fs from 'fs'

const OUT = '/home/z/my-project/public/questions'
const REG = {}

const svgs = {}

// ── ECG helpers ────────────────────────────────────────────────────────────
// Grid: pink ECG paper, small square 8px, large square 40px.
function ecgPaper(w, h) {
  let g = `<rect width="${w}" height="${h}" fill="#f6d3d3"/>`
  for (let x = 0; x <= w; x += 8) g += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#e5a3a3" stroke-width="${x % 40 === 0 ? 1.4 : 0.6}"/>`
  for (let y = 0; y <= h; y += 8) g += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#e5a3a3" stroke-width="${y % 40 === 0 ? 1.4 : 0.6}"/>`
  return g
}
// One PQRST beat starting at x, baseline b, scale s. Returns path segment.
// st: ST-elevation fraction of amplitude (0 normal). tH: T-wave height factor.
// qrsW: QRS widening factor. pH: P-wave amplitude factor.
function beat(x, b, s, { st = 0, tH = 0.22, qrsW = 1, pH = 0.12 } = {}) {
  const p = (d) => d
  // P wave (gaussian bump via cubic), PR flat, Q dip, R spike, S dip, ST (elevated), T wave
  const w = 96 * qrsW
  const seg = [
    `M ${x} ${b}`,
    // P wave
    `C ${x + 10} ${b}, ${x + 13} ${b - s * pH}, ${x + 17 * qrsW} ${b - s * pH}`,
    `C ${x + 21 * qrsW} ${b - s * pH}, ${x + 24 * qrsW} ${b}, ${x + 28 * qrsW} ${b}`,
    // PR segment
    `L ${x + 38 * qrsW} ${b}`,
    // Q
    `L ${x + 41 * qrsW} ${b + s * 0.08}`,
    // R up
    `L ${x + 46 * qrsW} ${b - s}`,
    // S down
    `L ${x + 52 * qrsW} ${b + s * 0.45}`,
    // back toward baseline, ST elevated by st fraction
    `C ${x + 56 * qrsW} ${b + s * 0.28 - s * st}, ${x + 62 * qrsW} ${b - s * st}, ${x + 68 * qrsW} ${b - s * st}`,
    // T wave flows from elevated ST
    `C ${x + 76 * qrsW} ${b - s * st}, ${x + 80 * qrsW} ${b - s * st - s * tH}, ${x + 88 * qrsW} ${b - s * st - s * tH * 0.4}`,
    `C ${x + 92 * qrsW} ${b - s * st}, ${x + 96 * qrsW} ${b}, ${x + 100 * qrsW} ${b}`,
  ]
  return { path: p(seg.join(' ')), end: x + 100 * qrsW }
}

// ── 1. ECG: anterior STEMI (tombstone ST elevation, lead V3) ───────────────
{
  const w = 1408, h = 768, b = 430, s = 250
  let d = ''
  let x = 60
  for (let i = 0; i < 6; i++) {
    const bb = beat(x, b, s, { st: 0.42, tH: 0.34 })
    d += bb.path + ' '
    x = bb.end + 96
  }
  svgs['ecg-stemi'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${ecgPaper(w, h)}<text x="60" y="90" font-family="monospace" font-size="44" fill="#3b3b3b">V3</text><path d="${d}" fill="none" stroke="#1c1c1c" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    regions: {
      stemiStElevation: { x: 52, y: 40, r: 15, label: 'ST-segment elevation merging into the T wave', primary: true },
      hyperacuteT: { x: 52, y: 34, r: 12, label: 'Broad hyperacute T wave fused with elevated ST' },
      qrsComplex: { x: 46, y: 58, r: 12, label: 'Narrow QRS complex (conduction still preserved)' },
    },
  }
}

// ── 2. ECG: atrial fibrillation (irregularly irregular, no P waves) ────────
{
  const w = 1408, h = 768, b = 420
  // fibrillatory baseline: composite of small irregular waves
  let fib = `M 0 ${b} `
  for (let x = 0; x <= w; x += 12) {
    const y = b - 7 * Math.sin(x / 17) - 5 * Math.sin(x / 7.3 + 1.7) - 4 * Math.sin(x / 29 + 4)
    fib += `L ${x} ${y.toFixed(1)} `
  }
  // irregularly irregular QRS
  const gaps = [150, 320, 230, 470, 200, 380, 260, 430, 220]
  let qrs = ''
  let x = 110
  for (const g of gaps) {
    qrs += `M ${x} ${b - 5 * Math.sin(x / 17)} L ${x + 9} ${b + 22} L ${x + 20} ${b - 180} L ${x + 30} ${b + 60} L ${x + 40} ${b - 5 * Math.sin(x / 17)} `
    // T wave
    qrs += `C ${x + 52} ${b - 20}, ${x + 62} ${b - 60}, ${x + 74} ${b - 30} C ${x + 86} ${b - 5}, ${x + 96} ${b - 5}, ${x + 108} ${b - 5 * Math.sin(x / 17)} `
    x += 40 + g
  }
  svgs['ecg-af'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${ecgPaper(w, h)}<text x="60" y="90" font-family="monospace" font-size="44" fill="#3b3b3b">II</text><path d="${fib}" fill="none" stroke="#1c1c1c" stroke-width="3.2"/><path d="${qrs}" fill="none" stroke="#1c1c1c" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    regions: {
      noPWaves: { x: 50, y: 55, r: 16, label: 'Absent P waves — chaotic fibrillatory baseline', primary: true },
      irregularRR: { x: 60, y: 40, r: 18, label: 'Irregularly irregular R–R intervals' },
      narrowQRS: { x: 22, y: 42, r: 10, label: 'Narrow QRS — ventricular conduction normal' },
    },
  }
}

// ── 3. ECG: hyperkalemia (tall peaked tented T, wide QRS, flat P) ──────────
{
  const w = 1408, h = 768, b = 460, s = 190
  let d = ''
  let x = 80
  for (let i = 0; i < 4; i++) {
    const bb = beat(x, b, s, { st: 0, tH: 0.62, qrsW: 1.35, pH: 0.04 })
    d += bb.path + ' '
    x = bb.end + 46
  }
  svgs['ecg-hyperkalemia'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${ecgPaper(w, h)}<text x="60" y="90" font-family="monospace" font-size="44" fill="#3b3b3b">II</text><path d="${d}" fill="none" stroke="#1c1c1c" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    regions: {
      peakedT: { x: 56, y: 28, r: 14, label: 'Tall, narrow, peaked ("tented") T waves', primary: true },
      wideQRS: { x: 50, y: 55, r: 12, label: 'Widened QRS complex' },
      flatP: { x: 42, y: 57, r: 10, label: 'Small flattened P wave' },
    },
  }
}

// ── CXR schematic helpers ──────────────────────────────────────────────────
// 900x640 PA chest. Viewer-left = patient RIGHT (standard PA display).
function cxrBase() {
  let s = ''
  s += `<rect width="900" height="640" fill="#050505"/>`
  // soft tissues (chest wall shoulders)
  s += `<path d="M 60 640 Q 90 380 200 300 L 200 560 Q 120 600 60 640 Z" fill="#1a1a1a"/>`
  s += `<path d="M 840 640 Q 810 380 700 300 L 700 560 Q 780 600 840 640 Z" fill="#1a1a1a"/>`
  // lung fields
  s += `<path d="M 205 140 Q 150 320 195 500 Q 240 570 330 560 L 395 520 L 400 150 Q 300 90 205 140 Z" fill="#101010"/>`
  s += `<path d="M 695 140 Q 750 320 705 500 Q 660 570 570 560 L 505 520 L 500 150 Q 600 90 695 140 Z" fill="#101010"/>`
  // mediastinum + spine
  s += `<rect x="400" y="80" width="100" height="480" fill="#262626"/>`
  s += `<path d="M 415 640 L 415 100 Q 450 70 485 100 L 485 640 Z" fill="#2d2d2d"/>`
  for (let y = 130; y < 560; y += 38) s += `<rect x="425" y="${y}" width="50" height="16" rx="5" fill="#3a3a3a"/>`
  // heart silhouette (left heart = viewer right)
  s += `<path d="M 485 240 Q 560 250 590 330 Q 620 420 560 480 Q 500 520 460 520 L 460 250 Z" fill="#262626"/>`
  // aortic knuckle
  s += `<path d="M 460 190 Q 470 160 505 168 Q 520 172 512 196" fill="none" stroke="#2e2e2e" stroke-width="26"/>`
  // ribs both sides
  for (let i = 0; i < 8; i++) {
    const y = 165 + i * 47
    s += `<path d="M 210 ${y} Q 300 ${y + 36} 400 ${y + 6}" fill="none" stroke="#4b4b4b" stroke-width="9" stroke-linecap="round"/>`
    s += `<path d="M 690 ${y} Q 600 ${y + 36} 500 ${y + 6}" fill="none" stroke="#4b4b4b" stroke-width="9" stroke-linecap="round"/>`
  }
  // clavicles
  s += `<path d="M 205 128 Q 300 108 405 122" fill="none" stroke="#5a5a5a" stroke-width="13"/>`
  s += `<path d="M 695 128 Q 600 108 495 122" fill="none" stroke="#5a5a5a" stroke-width="13"/>`
  // diaphragm
  s += `<path d="M 190 505 Q 300 430 400 505 L 400 640 L 190 640 Z" fill="#161616"/>`
  s += `<path d="M 500 505 Q 600 430 710 505 L 710 640 L 500 640 Z" fill="#161616"/>`
  // gastric bubble under right-costophrenic (viewer left, patient left)
  s += `<ellipse cx="560" cy="585" rx="42" ry="26" fill="#101010"/>`
  // trachea
  s += `<rect x="438" y="60" width="26" height="90" rx="10" fill="#2b2b2b"/>`
  return s
}

// ── 4. CXR: normal ─────────────────────────────────────────────────────────
{
  let s = cxrBase()
  // vascular markings
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    const x0 = 300, y0 = 330
    const x1 = x0 + Math.cos(a) * (105 + (i % 3) * 22), y1 = y0 + Math.sin(a) * (150 + (i % 4) * 16)
    s += `<line x1="${x0}" y1="${y0}" x2="${x1.toFixed(0)}" y2="${y1.toFixed(0)}" stroke="#242424" stroke-width="2.4"/>`
    const x0b = 600
    const x1b = x0b - Math.cos(a) * (105 + (i % 3) * 22)
    s += `<line x1="${x0b}" y1="${y0}" x2="${x1b.toFixed(0)}" y2="${y1.toFixed(0)}" stroke="#242424" stroke-width="2.4"/>`
  }
  svgs['cxr-normal'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      costophrenic: { x: 23, y: 82, r: 7, label: 'Sharp costophrenic angles', primary: true },
      heartSize: { x: 60, y: 62, r: 10, label: 'Cardiothoracic ratio within normal limits' },
      lungFields: { x: 33, y: 45, r: 12, label: 'Clear lung fields with normal vascular markings' },
    },
  }
}

// ── 5. CXR: right pneumothorax ─────────────────────────────────────────────
{
  let s = cxrBase()
  // vascular markings on LEFT (patient left, viewer right) only
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    const x0 = 600, y0 = 330
    const x1 = x0 - Math.cos(a) * (105 + (i % 3) * 22), y1 = y0 + Math.sin(a) * (150 + (i % 4) * 16)
    s += `<line x1="${x0}" y1="${y0}" x2="${x1.toFixed(0)}" y2="${y1.toFixed(0)}" stroke="#242424" stroke-width="2.4"/>`
  }
  // deep sulcus + hyperlucent right (viewer left) zone
  s += `<path d="M 205 140 Q 150 320 190 530 Q 260 585 345 565 L 400 520 L 400 150 Q 300 90 205 140 Z" fill="#0a0a0a"/>`
  // visceral pleural line (white) with no markings beyond
  s += `<path d="M 268 128 Q 232 300 268 528" fill="none" stroke="#cfcfcf" stroke-width="5"/>`
  s += `<path d="M 268 128 Q 300 118 400 150" fill="none" stroke="#cfcfcf" stroke-width="4"/>`
  s += `<path d="M 268 528 Q 320 552 400 520" fill="none" stroke="#cfcfcf" stroke-width="4"/>`
  // collapsed lung edge medially
  s += `<path d="M 400 150 Q 340 300 396 520 L 400 520 Z" fill="#181818"/>`
  svgs['cxr-pneumothorax'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      pleuralLine: { x: 29, y: 48, r: 9, label: 'Visceral pleural line separated from the chest wall', primary: true },
      noMarkings: { x: 20, y: 45, r: 10, label: 'Avascular (black) zone beyond the pleural line' },
      collapsedLung: { x: 42, y: 50, r: 9, label: 'Medially collapsed lung edge' },
      deepSulcus: { x: 21, y: 82, r: 8, label: 'Deepened lucent costophrenic sulcus' },
    },
  }
}

// ── 6. CXR: miliary tuberculosis ───────────────────────────────────────────
{
  let s = cxrBase()
  // uniform tiny nodules both fields — seeded deterministic pseudo-random
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 460; i++) {
    const side = rnd() > 0.5
    const cx = side ? 215 + rnd() * 175 : 510 + rnd() * 175
    const cy = 130 + rnd() * 390
    s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(1.6 + rnd() * 1.4).toFixed(1)}" fill="#5f5f5f" opacity="0.85"/>`
  }
  svgs['cxr-miliary-tb'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      miliaryNodules: { x: 33, y: 45, r: 14, label: 'Countless uniform millet-seed nodules in both lungs', primary: true },
      randomSpread: { x: 66, y: 45, r: 14, label: 'Random, even distribution (haematogenous spread)' },
      normalHeart: { x: 60, y: 62, r: 9, label: 'Heart size normal — nodules dominate the film' },
    },
  }
}

// ── brain axial CT helper ──────────────────────────────────────────────────
// 800x800 axial slice. Radiology convention: patient LEFT = viewer RIGHT.
function ctBase() {
  let s = `<rect width="800" height="800" fill="#000"/>`
  s += `<ellipse cx="400" cy="410" rx="322" ry="368" fill="#e8e8e8"/>` // skull outer
  s += `<ellipse cx="400" cy="410" rx="300" ry="346" fill="#8a8a8a"/>` // brain
  return s
}
function ctSulci(s, cx, cy, rx, ry, n, color = '#6f6f6f', width = 5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x1 = cx + Math.cos(a) * rx, y1 = cy + Math.sin(a) * ry
    const x2 = cx + Math.cos(a) * rx * 0.55, y2 = cy + Math.sin(a) * ry * 0.55
    s += `<path d="M ${x1.toFixed(0)} ${y1.toFixed(0)} Q ${(cx + Math.cos(a + 0.12) * rx * 0.8).toFixed(0)} ${(cy + Math.sin(a + 0.12) * ry * 0.8).toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`
  }
}

// ── 7. CT: left MCA territory infarct ──────────────────────────────────────
{
  let s = ctBase()
  // ventricles (dark CSF)
  s += `<path d="M 385 330 Q 360 360 372 430 Q 390 470 400 440 L 400 330 Z" fill="#2c2c2c"/>`
  s += `<path d="M 415 330 Q 440 360 428 430 Q 410 470 400 440 L 400 330 Z" fill="#2c2c2c"/>`
  // falx
  s += `<line x1="400" y1="80" x2="400" y2="740" stroke="#7a7a7a" stroke-width="4"/>`
  // normal sulci right hemisphere (viewer left) — clearly visible
  ctSulci(s, 250, 410, 130, 290, 14, '#5a5a5a', 6)
  // infarct: hypodense wedge viewer RIGHT (patient LEFT MCA territory), clearly darker
  s += `<path d="M 430 220 Q 560 260 600 420 Q 620 560 500 640 Q 440 660 430 560 Z" fill="#7d7d7d"/>`
  s += `<path d="M 470 260 Q 560 300 575 430 Q 580 540 500 600 Q 465 610 460 520 Z" fill="#8a8a8a"/>`
  // basal ganglia loss of distinction
  s += `<ellipse cx="470" cy="420" rx="60" ry="80" fill="#909090" opacity="0.65"/>`
  svgs['ct-mca-infarct'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${s}</svg>`,
    regions: {
      hypodensity: { x: 70, y: 50, r: 13, label: 'Wedge-shaped hypodensity in the left MCA territory', primary: true },
      greyWhiteLoss: { x: 70, y: 42, r: 9, label: 'Loss of grey–white differentiation' },
      sulcalEfface: { x: 72, y: 64, r: 9, label: 'Effaced sulci over the infarcted cortex' },
      ventricles: { x: 50, y: 48, r: 8, label: 'Lateral ventricles (contralateral side normal)' },
    },
  }
}

// ── 8. CT: acute subdural haematoma ────────────────────────────────────────
{
  let s = ctBase()
  s += `<path d="M 385 330 Q 360 360 372 430 Q 390 470 400 440 L 400 330 Z" fill="#2c2c2c"/>`
  s += `<path d="M 415 330 Q 440 360 428 430 Q 410 470 400 440 L 400 330 Z" fill="#2c2c2c"/>`
  ctSulci(s, 560, 410, 110, 280, 10)
  // crescentic hyperdense collection along RIGHT skull (viewer left)
  s += `<path d="M 132 330 Q 96 420 128 560 Q 160 640 230 680 Q 200 600 210 500 Q 220 400 260 300 Q 190 260 132 330 Z" fill="#f4f4f4"/>`
  s += `<path d="M 150 360 Q 122 430 148 540 Q 172 610 224 650 Q 204 590 212 505 Q 222 410 262 320 Q 200 300 150 360 Z" fill="#e0e0e0"/>`
  // midline shift to the left (viewer right)
  s += `<path d="M 430 100 Q 448 400 430 730" fill="none" stroke="#7a7a7a" stroke-width="4"/>`
  // compressed ventricle ipsilateral
  s += `<path d="M 300 350 Q 285 380 295 430 Q 308 458 322 435 L 322 350 Z" fill="#2c2c2c"/>`
  svgs['ct-subdural'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${s}</svg>`,
    regions: {
      crescent: { x: 21, y: 58, r: 13, label: 'Crescent-shaped hyperdense collection along the convexity', primary: true },
      skullInner: { x: 13, y: 55, r: 8, label: 'Blood tracks along the inner skull table (crosses sutures)' },
      midlineShift: { x: 54, y: 47, r: 7, label: 'Midline shift away from the collection' },
      ventricle: { x: 38, y: 48, r: 8, label: 'Compressed ipsilateral ventricle' },
    },
  }
}

// ── 9. MRI FLAIR: multiple sclerosis plaques ───────────────────────────────
{
  let s = `<rect width="800" height="800" fill="#000"/>`
  s += `<ellipse cx="400" cy="410" rx="322" ry="368" fill="#d9d9d9"/>`
  s += `<ellipse cx="400" cy="410" rx="300" ry="346" fill="#3f3f3f"/>` // brain dark on FLAIR
  // gyral shading
  ctSulci(s, 260, 400, 130, 290, 12, '#2f2f2f')
  ctSulci(s, 540, 400, 130, 290, 12, '#2f2f2f')
  // ventricles dark CSF on FLAIR
  s += `<path d="M 378 320 Q 348 370 362 460 Q 385 500 400 455 L 400 320 Z" fill="#0c0c0c"/>`
  s += `<path d="M 422 320 Q 452 370 438 460 Q 415 500 400 455 L 400 320 Z" fill="#0c0c0c"/>`
  // bright ovoid periventricular plaques
  const plaques = [
    [350, 300, -25], [452, 306, 22], [345, 470, -18], [458, 472, 16], [510, 380, 35], [295, 360, -35], [480, 540, 10], [330, 545, -8],
  ]
  for (const [x, y, rot] of plaques) s += `<ellipse cx="${x}" cy="${y}" rx="26" ry="15" transform="rotate(${rot} ${x} ${y})" fill="#f2f2f2"/>`
  svgs['mri-ms'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${s}</svg>`,
    regions: {
      periventricular: { x: 44, y: 38, r: 10, label: 'Ovoid periventricular plaques ("Dawson fingers")', primary: true },
      whiteMatter: { x: 63, y: 47, r: 10, label: 'Bright white-matter lesions, sparing the cortex' },
      csfDark: { x: 50, y: 50, r: 8, label: 'Dark CSF — FLAIR suppresses fluid, lesions stand out' },
    },
  }
}

// ── 10. Peripheral smear: sickle cell disease ──────────────────────────────
{
  let s = `<rect width="900" height="640" fill="#f7e4e4"/><circle cx="450" cy="320" r="300" fill="#fbeeee"/>`
  let seed = 13
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 95; i++) {
    const cx = 190 + rnd() * 520, cy = 90 + rnd() * 460, r = 11 + rnd() * 4
    s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="#d46a6a" stroke="#b24d4d" stroke-width="1.5"/><circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(r * 0.45).toFixed(0)}" fill="#e89b9b" opacity="0.85"/>`
  }
  // sickled cells: elongated crescents with pointed ends
  const sickles = [[300, 200, -30], [520, 160, 15], [620, 300, 40], [380, 420, 10], [250, 350, 65], [560, 470, -45], [450, 540, 25], [660, 430, -12], [200, 500, 35]]
  for (const [x, y, rot] of sickles) {
    s += `<path d="M ${x - 34} ${y + 6} Q ${x} ${y - 22} ${x + 34} ${y + 6} Q ${x} ${y - 2} ${x - 34} ${y + 6} Z" transform="rotate(${rot} ${x} ${y})" fill="#c25252" stroke="#8f3a3a" stroke-width="1.5"/>`
  }
  // target cell
  s += `<circle cx="700" cy="200" r="13" fill="#d46a6a"/><circle cx="700" cy="200" r="5" fill="#b24d4d"/>`
  svgs['smear-sickle'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      sickleCells: { x: 44, y: 66, r: 12, label: 'Elongated crescent-shaped sickled red cells', primary: true },
      anisocytosis: { x: 30, y: 35, r: 10, label: 'Variation in red-cell size (anisocytosis)' },
      targetCell: { x: 78, y: 31, r: 7, label: 'Target cell — common in haemoglobinopathies' },
    },
  }
}

// ── 11. Peripheral smear: AML blasts with Auer rod ─────────────────────────
{
  let s = `<rect width="900" height="640" fill="#f5ecec"/><circle cx="450" cy="320" r="300" fill="#faf2f2"/>`
  let seed = 29
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const blast = (x, y, r) => {
    let g = `<circle cx="${x}" cy="${y}" r="${r}" fill="#cdb9e8" stroke="#8f7ab5" stroke-width="2"/>`
    g += `<circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="#7c68a6"/>` // nucleus
    g += `<circle cx="${x - r * 0.2}" cy="${y - r * 0.18}" r="${r * 0.13}" fill="#4d3f6e"/>`
    g += `<circle cx="${x + r * 0.18}" cy="${y + r * 0.1}" r="${r * 0.1}" fill="#4d3f6e"/>`
    // fine chromatin speckle
    for (let i = 0; i < 8; i++) g += `<circle cx="${x - r * 0.5 + rnd() * r}" cy="${y - r * 0.5 + rnd() * r}" r="1.2" fill="#655389" opacity="0.7"/>`
    return g
  }
  for (let i = 0; i < 9; i++) {
    const x = 210 + rnd() * 470, y = 110 + rnd() * 420
    s += blast(x.toFixed(0), y.toFixed(0), (26 + rnd() * 10).toFixed(0))
  }
  // few residual lymphocytes (small, dark)
  for (let i = 0; i < 5; i++) {
    const x = 200 + rnd() * 500, y = 100 + rnd() * 440
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="7" fill="#3f4d8f"/>`
  }
  // THE Auer rod cell (center-ish, distinct)
  s += blast(450, 320, 34)
  s += `<path d="M 430 300 L 476 336" stroke="#c23a3a" stroke-width="5" stroke-linecap="round"/>`
  svgs['smear-aml'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      blasts: { x: 50, y: 50, r: 16, label: 'Large immature myeloblasts, crowded sheet', primary: true },
      auerRod: { x: 50, y: 50, r: 6, label: 'Needle-shaped pink Auer rod — myeloid lineage' },
      nucleoli: { x: 27, y: 35, r: 8, label: 'Fine chromatin with visible nucleoli' },
    },
  }
}

// ── 12. Dermatology: chronic plaque psoriasis ──────────────────────────────
{
  let s = `<rect width="900" height="640" fill="#e8e3dd"/>`
  // forearm
  s += `<path d="M 0 240 Q 160 190 320 205 Q 560 225 640 300 Q 700 360 660 430 Q 560 540 320 520 Q 120 500 0 430 Z" fill="#eecdb0"/>`
  s += `<path d="M 640 300 Q 720 330 760 400 Q 790 460 740 500 Q 700 530 660 430 Z" fill="#eecdb0"/>`
  // plaques: well-demarcated erythematous with silvery scale
  const plaque = (x, y, rx, ry, rot) => {
    let g = `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#c4574f"/>`
    g += `<ellipse cx="${x}" cy="${y}" rx="${rx * 0.86}" ry="${ry * 0.8}" transform="rotate(${rot} ${x} ${y})" fill="#d4736a"/>`
    // silvery scale flakes
    let seed = x
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * rx * 0.7
      const fx = x + Math.cos(a) * rr, fy = y + Math.sin(a) * rr * (ry / rx)
      g += `<ellipse cx="${fx.toFixed(0)}" cy="${fy.toFixed(0)}" rx="${(3 + rnd() * 4).toFixed(1)}" ry="${(2 + rnd() * 3).toFixed(1)}" transform="rotate(${(rnd() * 180).toFixed(0)} ${fx.toFixed(0)} ${fy.toFixed(0)})" fill="#f0ebe2" opacity="0.9"/>`
    }
    return g
  }
  s += plaque(300, 320, 130, 80, -12)
  s += plaque(490, 280, 80, 52, 8)
  s += plaque(480, 430, 90, 55, -6)
  // Auspitz dots at a plaque edge
  for (let i = 0; i < 7; i++) s += `<circle cx="${170 + i * 6}" cy="${390 + (i % 3) * 5}" r="1.8" fill="#a23830"/>`
  svgs['derm-psoriasis'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      plaque: { x: 33, y: 50, r: 14, label: 'Well-demarcated erythematous plaque with silvery-white scale', primary: true },
      scale: { x: 33, y: 44, r: 8, label: 'Silvery micaceous scale over the plaque' },
      auspitz: { x: 19, y: 61, r: 6, label: 'Pinpoint bleeding points (Auspitz sign) where scale is lifted' },
    },
  }
}

// ── 13. Dermatology: herpes zoster (dermatomal) ────────────────────────────
{
  let s = `<rect width="900" height="640" fill="#5a5f63"/>`
  // torso
  s += `<path d="M 180 640 L 200 240 Q 300 140 450 140 Q 600 140 700 240 L 720 640 Z" fill="#eecdb0"/>`
  s += `<path d="M 250 190 Q 320 120 450 120 Q 580 120 650 190" fill="none" stroke="#e0b894" stroke-width="26"/>`
  // unilateral band of grouped vesicles on erythematous base (viewer left = patient RIGHT)
  s += `<path d="M 205 330 Q 330 300 430 350 Q 470 370 465 420 Q 440 470 340 450 Q 240 430 205 380 Z" fill="#d97a6a" opacity="0.55"/>`
  let seed = 5
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 46; i++) {
    const t = rnd()
    const cx = 215 + t * 240 + (rnd() - 0.5) * 60
    const cy = 340 + Math.sin(t * 3.2) * 30 + (rnd() - 0.5) * 70
    s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(5 + rnd() * 4).toFixed(1)}" fill="#f6f3ea" stroke="#c98a76" stroke-width="1.6"/>`
    s += `<circle cx="${(cx - 1.5).toFixed(0)}" cy="${(cy - 1.5).toFixed(0)}" r="1.6" fill="#d9cfc0" opacity="0.9"/>`
  }
  svgs['derm-zoster'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      dermatomal: { x: 33, y: 58, r: 14, label: 'Grouped vesicles confined to ONE dermatomal band', primary: true },
      vesicles: { x: 30, y: 54, r: 8, label: 'Clear fluid vesicles on an erythematous base' },
      midlineStop: { x: 51, y: 55, r: 7, label: 'Rash stops abruptly at the midline' },
    },
  }
}

// ── fundus helper ──────────────────────────────────────────────────────────
function fundusBase() {
  let s = `<rect width="900" height="640" fill="#0a0603"/>`
  s += `<circle cx="450" cy="320" r="290" fill="#c2571f"/>`
  s += `<radialGradient id="fg" cx="0.5" cy="0.5" r="0.75"><stop offset="0%" stop-color="#d96f2e"/><stop offset="78%" stop-color="#b84d18"/><stop offset="100%" stop-color="#7a2e0c"/></radialGradient>`
  s += `<circle cx="450" cy="320" r="290" fill="url(#fg)"/>`
  return s
}
function fundusVessels(s, fromDiscX, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.9 + (i / (n - 1)) * Math.PI * 1.8
    const x1 = fromDiscX + Math.cos(a) * 26, y1 = 320 + Math.sin(a) * 26
    const x2 = fromDiscX + Math.cos(a) * 250, y2 = 320 + Math.sin(a) * 265
    const midx = fromDiscX + Math.cos(a) * 140, midy = 320 + Math.sin(a) * 150 + (i % 2 ? 14 : -14)
    const color = i % 2 ? '#5a1a10' : '#8f2c17'
    s += `<path d="M ${x1.toFixed(0)} ${y1.toFixed(0)} Q ${midx.toFixed(0)} ${midy.toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}" fill="none" stroke="${color}" stroke-width="${i % 2 ? 6 : 9}" opacity="0.95"/>`
  }
}

// ── 14. Fundus: hypertensive retinopathy ───────────────────────────────────
{
  let s = fundusBase()
  s += `<ellipse cx="620" cy="320" rx="44" ry="50" fill="#e8b45a"/>` // disc (temporal view)
  s += `<ellipse cx="628" cy="322" rx="16" ry="19" fill="#c98f3d"/>` // cup
  fundusVessels(s, 618)
  // AV nipping: artery compresses vein at crossings — clearly visible tapering
  const nips = [[540, 240], [520, 400], [560, 480]]
  for (const [x, y] of nips) {
    s += `<path d="M ${x - 26} ${y - 4} Q ${x} ${y - 10} ${x + 26} ${y - 4}" stroke="#a83c1e" stroke-width="10" fill="none" opacity="0.95"/>`
    s += `<path d="M ${x - 24} ${y + 6} Q ${x} ${y + 2} ${x + 24} ${y + 6}" stroke="#4a120a" stroke-width="9" fill="none"/>`
    s += `<path d="M ${x - 5} ${y - 12} L ${x + 5} ${y + 12}" stroke="#c2571f" stroke-width="4"/>`
  }
  // flame haemorrhages near disc
  const flames = [[560, 270, -25], [548, 300, 15], [556, 370, 20], [545, 405, -30], [575, 430, 10]]
  for (const [x, y, rot] of flames) s += `<path d="M ${x - 16} ${y} Q ${x} ${y - 7} ${x + 16} ${y} Q ${x} ${y + 7} ${x - 16} ${y} Z" transform="rotate(${rot} ${x} ${y})" fill="#8f1d12"/>`
  // cotton wool spots
  const cws = [[470, 230], [450, 420], [495, 330]]
  for (const [x, y] of cws) {
    s += `<circle cx="${x}" cy="${y}" r="15" fill="#e9dcc8" opacity="0.85"/><circle cx="${x - 8}" cy="${y - 5}" r="8" fill="#f3ead9" opacity="0.9"/><circle cx="${x + 9}" cy="${y + 4}" r="7" fill="#efe4d0" opacity="0.85"/>`
  }
  svgs['fundus-htn'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      avNipping: { x: 60, y: 37, r: 8, label: 'Arteriovenous nipping at crossings', primary: true },
      flames: { x: 62, y: 55, r: 9, label: 'Flame-shaped haemorrhages radiating from the disc' },
      cottonWool: { x: 51, y: 52, r: 8, label: 'Cotton-wool spots (nerve-fibre-layer infarcts)' },
      disc: { x: 69, y: 50, r: 7, label: 'Optic disc' },
    },
  }
}

// ── 15. Fundus: diabetic retinopathy ───────────────────────────────────────
{
  let s = fundusBase()
  s += `<ellipse cx="620" cy="320" rx="44" ry="50" fill="#e8b45a"/>`
  s += `<ellipse cx="628" cy="322" rx="15" ry="18" fill="#c98f3d"/>`
  fundusVessels(s, 618)
  // dot-blot microaneurysms scattered
  let seed = 41
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, rr = 40 + rnd() * 220
    const x = 450 + Math.cos(a) * rr * 1.05, y = 320 + Math.sin(a) * rr * 0.78
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.6 + rnd() * 2.2).toFixed(1)}" fill="#8f1d12" opacity="0.9"/>`
  }
  // circinate ring of hard exudates near macula
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    const x = 350 + Math.cos(a) * 62, y = 330 + Math.sin(a) * 48
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(2.4 + rnd() * 1.8).toFixed(1)}" fill="#f0df9a" opacity="0.95"/>`
  }
  s += `<ellipse cx="350" cy="330" rx="30" ry="24" fill="#a83c12" opacity="0.5"/>` // macula
  svgs['fundus-dr'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      dotBlots: { x: 50, y: 45, r: 15, label: 'Scattered dot–blot haemorrhages and microaneurysms', primary: true },
      exudates: { x: 39, y: 52, r: 9, label: 'Circinate ring of yellow hard exudates around the macula' },
      macula: { x: 39, y: 52, r: 5, label: 'Macula threatened by exudates — vision risk' },
      disc: { x: 69, y: 50, r: 7, label: 'Optic disc' },
    },
  }
}

// ── 16. Eye: mature cataract ───────────────────────────────────────────────
{
  let s = `<rect width="900" height="640" fill="#e9dccb"/>`
  // orbit / lids
  s += `<path d="M 80 320 Q 260 120 460 130 Q 680 140 820 300 L 820 360 Q 660 540 440 545 Q 220 545 80 360 Z" fill="#e2b48f"/>`
  s += `<path d="M 80 320 Q 260 128 460 136 Q 680 146 820 300" fill="none" stroke="#c99a72" stroke-width="14"/>`
  // sclera
  s += `<ellipse cx="450" cy="335" rx="300" ry="150" fill="#f6f4ef"/>`
  // iris
  s += `<circle cx="450" cy="335" r="118" fill="#5e7f6e"/>`
  s += `<circle cx="450" cy="335" r="118" fill="none" stroke="#47604f" stroke-width="7"/>`
  // milky white cataractous lens (pupil white instead of black)
  s += `<circle cx="450" cy="335" r="64" fill="#f2efe6"/>`
  s += `<circle cx="450" cy="335" r="64" fill="none" stroke="#ddd6c6" stroke-width="4"/>`
  s += `<circle cx="432" cy="318" r="20" fill="#ffffff" opacity="0.7"/>`
  // light reflex
  s += `<ellipse cx="500" cy="230" rx="34" ry="14" transform="rotate(-18 500 230)" fill="#ffffff" opacity="0.8"/>`
  svgs['ophtha-cataract'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      whitePupil: { x: 50, y: 52, r: 10, label: 'Pupil appears milky white instead of black', primary: true },
      lens: { x: 50, y: 52, r: 7, label: 'Opaque lens behind the clear cornea' },
      redReflex: { x: 50, y: 52, r: 7, label: 'Normal red reflex lost' },
    },
  }
}

// ── 17. Wrist lateral X-ray: Colles fracture (clean teaching schematic) ────
{
  let s = `<rect width="800" height="640" fill="#050505"/>`
  // soft-tissue silhouette (subtle)
  s += `<path d="M 0 150 Q 260 120 430 145 Q 560 165 640 205 Q 700 235 800 245 L 800 90 Q 640 80 520 95 Q 300 105 0 90 Z" fill="#101010"/>`
  s += `<path d="M 0 560 Q 300 585 500 570 Q 640 560 800 540 L 800 640 L 0 640 Z" fill="#101010"/>`
  // PROXIMAL radius shaft (upper bone entering from left) — light grey
  s += `<path d="M 0 240 L 360 232 L 380 330 L 0 340 Z" fill="#e2e2e2"/>`
  s += `<path d="M 0 252 L 340 245 L 340 248 L 0 254 Z" fill="#f6f6f6" opacity="0.6"/>` // cortex highlight
  // ulna shaft (lower bone, shorter distally)
  s += `<path d="M 0 420 L 350 414 L 362 470 L 0 482 Z" fill="#d5d5d5"/>`
  // FRACTURE: step at distal radius. Distal fragment tilted dorsally (up = dorsal in lateral).
  // proximal fragment edge
  s += `<path d="M 360 232 L 380 330 L 368 336 L 356 236 Z" fill="#8a8a8a"/>`
  // distal fragment (tilted "up" toward dorsal = top of image)
  s += `<path d="M 356 236 L 430 210 L 452 268 L 380 330 Z" fill="#eaeaea"/>`
  // fracture line (dark, visible)
  s += `<line x1="362" y1="228" x2="378" y2="338" stroke="#0a0a0a" stroke-width="8"/>`
  s += `<line x1="360" y1="232" x2="430" y2="210" stroke="#050505" stroke-width="4"/>`
  // ulna styloid (normal) — ulna ends lower than radius now (typical in Colles)
  s += `<path d="M 350 414 L 362 470 L 386 466 L 380 410 Z" fill="#dedede"/>`
  // carpal bones cluster (overlapping circles)
  const carp = [[470, 300], [505, 268], [512, 330], [548, 292], [540, 352], [500, 372]]
  for (const [x, y] of carp) s += `<circle cx="${x}" cy="${y}" r="27" fill="#e6e6e6" stroke="#8f8f8f" stroke-width="2.5"/>`
  // metacarpals to the right (hand)
  s += `<path d="M 560 260 L 800 238 L 800 286 L 566 300 Z" fill="#e0e0e0"/>`
  s += `<path d="M 560 300 L 800 296 L 800 340 L 566 348 Z" fill="#d9d9d9"/>`
  s += `<path d="M 552 352 L 800 372 L 800 420 L 560 402 Z" fill="#d2d2d2"/>`
  // distal radius articular surface tilt indicator: volar (bottom) angle compressed
  s += `<path d="M 380 330 L 452 268" stroke="#7d7d7d" stroke-width="3" stroke-dasharray="8 6"/>`
  svgs['xray-colles'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 640">${s}</svg>`,
    regions: {
      fractureLine: { x: 46, y: 44, r: 10, label: 'Transverse fracture of the distal radius', primary: true },
      dorsalTilt: { x: 50, y: 34, r: 9, label: 'Distal fragment tilted dorsally — dinner-fork deformity' },
      ulna: { x: 45, y: 70, r: 8, label: 'Ulna now relatively long at the wrist (radial shortening)' },
    },
  }
}

// ── 18. Barium swallow: achalasia (bird-beak) ──────────────────────────────
{
  let s = `<rect width="800" height="640" fill="#0a0a0a"/>`
  // chest wall hint
  s += `<path d="M 120 640 Q 140 200 400 150 Q 660 200 680 640 Z" fill="#151515"/>`
  // hugely dilated contrast column (widens upward, bulging mediastinum)
  s += `<path d="M 250 20 L 550 20 Q 560 200 520 360 Q 495 450 445 495 Q 420 515 400 515 Q 380 515 355 495 Q 305 450 280 360 Q 240 200 250 20 Z" fill="#f2f2f2"/>`
  // fluid level / mottling
  s += `<ellipse cx="400" cy="90" rx="140" ry="42" fill="#dcdcdc"/>`
  s += `<ellipse cx="400" cy="210" rx="115" ry="38" fill="#e8e8e8"/>`
  s += `<ellipse cx="390" cy="330" rx="90" ry="34" fill="#eeeeee"/>`
  // bird-beak taper at LES (smooth symmetric point)
  s += `<path d="M 355 495 Q 400 570 445 495 Q 425 560 400 572 Q 375 560 355 495 Z" fill="#e8e8e8"/>`
  // stomach outline below with a trickle of contrast
  s += `<path d="M 300 600 Q 400 555 500 600 Q 500 640 300 640 Z" fill="#c9c9c9"/>`
  s += `<path d="M 393 572 L 400 612 L 407 572 Z" fill="#ffffff"/>`
  svgs['barium-achalasia'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 640">${s}</svg>`,
    regions: {
      birdBeak: { x: 50, y: 85, r: 10, label: 'Smooth tapering "bird-beak" at the lower sphincter', primary: true },
      dilated: { x: 50, y: 22, r: 14, label: 'Hugely dilated, contrast-filled oesophagus' },
      aperistalsis: { x: 50, y: 50, r: 10, label: 'Smooth walls — no peristaltic indentations' },
    },
  }
}

// ── 19. Ultrasound: gallbladder stone with shadowing ───────────────────────
{
  let s = `<rect width="900" height="640" fill="#020202"/>`
  s += `<path d="M 450 30 L 880 640 L 20 640 Z" fill="#0d0d0d"/>` // sector
  // abdominal wall layers (top)
  s += `<path d="M 450 30 L 560 190 L 340 190 Z" fill="#3a3a3a"/>`
  for (let i = 0; i < 3; i++) s += `<path d="M ${(370 - i * 20)} ${(200 + i * 26)} Q 450 ${(180 + i * 26)} ${(530 + i * 20)} ${(200 + i * 26)}" fill="none" stroke="#4a4a4a" stroke-width="7"/>`
  // liver parenchyma speckle
  let seed = 97
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 400; i++) {
    const x = 150 + rnd() * 600, y = 230 + rnd() * 340
    if (Math.hypot((x - 450) / 430, (y - 640) / 620) < 0.95) s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1 + rnd() * 2).toFixed(1)}" fill="#3d3d3d" opacity="0.8"/>`
  }
  // gallbladder (anechoic)
  s += `<ellipse cx="450" cy="380" rx="150" ry="95" fill="#0a0a0a" stroke="#5a5a5a" stroke-width="4"/>`
  // echogenic stone
  s += `<ellipse cx="450" cy="425" rx="46" ry="30" fill="#f5f5f5"/>`
  // posterior acoustic shadow (clean dark cone)
  s += `<path d="M 408 448 L 380 620 L 522 620 L 492 448 Z" fill="#000"/>`
  svgs['us-gallstone'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      stone: { x: 50, y: 66, r: 8, label: 'Bright echogenic focus inside the gallbladder', primary: true },
      shadow: { x: 50, y: 88, r: 10, label: 'Clean posterior acoustic shadow behind the stone' },
      bile: { x: 50, y: 55, r: 10, label: 'Anechoic (black) bile — fluid' },
    },
  }
}

// ── 20. Histology: caseating granuloma ─────────────────────────────────────
{
  let s = `<rect width="900" height="640" fill="#e9dfe8"/>`
  // background alveolated tissue
  let seed = 61
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 900, y = rnd() * 640
    if (Math.hypot(x - 450, y - 320) > 260) s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(7 + rnd() * 8).toFixed(0)}" ry="${(6 + rnd() * 7).toFixed(0)}" fill="#cdb9d4" stroke="#a48bb0" stroke-width="1.2"/>`
  }
  // granuloma rim: epithelioid cells (pale elongated histiocytes)
  for (let i = 0; i < 74; i++) {
    const a = (i / 74) * Math.PI * 2
    const rr = 205 + rnd() * 26
    const x = 450 + Math.cos(a) * rr, y = 320 + Math.sin(a) * rr * 0.92
    s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="16" ry="9" transform="rotate(${(a * 57.3 + 90).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="#c8a8c4" stroke="#8f6f96" stroke-width="1.4"/>`
  }
  // Langhans giant cell: large with horseshoe nuclei (left of centre)
  s += `<circle cx="360" cy="300" r="34" fill="#d9b8d2" stroke="#8f6f96" stroke-width="2"/>`
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.75 + (i / 6) * Math.PI * 1.5
    s += `<circle cx="${(360 + Math.cos(a) * 20).toFixed(0)}" cy="${(300 + Math.sin(a) * 20 * 0.7).toFixed(0)}" r="6" fill="#6d4f7e"/>`
  }
  // caseous centre
  s += `<circle cx="450" cy="320" r="165" fill="#e3b8ac"/>`
  s += `<circle cx="450" cy="320" r="160" fill="#e8c6ba"/>`
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2, rr = rnd() * 130
    s += `<circle cx="${(450 + Math.cos(a) * rr).toFixed(0)}" cy="${(320 + Math.sin(a) * rr * 0.92).toFixed(0)}" r="${(1.4 + rnd() * 2.4).toFixed(1)}" fill="#d3a294" opacity="0.8"/>`
  }
  // lymphocyte collar outside the epithelioid rim
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2
    const rr = 246 + rnd() * 26
    s += `<circle cx="${(450 + Math.cos(a) * rr).toFixed(0)}" cy="${(320 + Math.sin(a) * rr * 0.9).toFixed(0)}" r="${(3 + rnd() * 2).toFixed(1)}" fill="#5c4a72"/>`
  }
  svgs['histo-granuloma'] = {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">${s}</svg>`,
    regions: {
      caseous: { x: 50, y: 50, r: 15, label: 'Central amorphous caseous (cheesy) necrosis', primary: true },
      epithelioid: { x: 50, y: 18, r: 9, label: 'Rim of pale epithelioid histiocytes' },
      langhans: { x: 40, y: 47, r: 6, label: 'Langhans giant cell — horseshoe of peripheral nuclei' },
      lymphocytes: { x: 50, y: 88, r: 8, label: 'Outer collar of small lymphocytes' },
    },
  }
}

// ── write files + regions manifest ─────────────────────────────────────────
const written = []
for (const [key, obj] of Object.entries(svgs)) {
  const file = `${OUT}/${key}.svg`
  fs.writeFileSync(file, obj.svg)
  REG[key] = obj.regions
  written.push(`${key}.svg (${Math.round(obj.svg.length / 1024)}kb)`)
}
fs.writeFileSync('/home/z/my-project/prisma/lab-svg-regions.json', JSON.stringify(REG, null, 2))
console.log('WROTE', written.length, 'SVGs')
console.log(written.join('\n'))
