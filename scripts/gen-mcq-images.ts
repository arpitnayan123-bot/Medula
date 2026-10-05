/**
 * PRODUCT 04 — Adaptive MCQ Engine asset generation.
 * Generates schematic, textbook-style illustrations for the image-based
 * questions in the bank. Every image is an ILLUSTRATIVE diagram (not a
 * photorealistic patient image) and the UI captions it accordingly.
 *
 * Run: bun scripts/gen-mcq-images.ts
 */
import ZAI from 'z-ai-web-dev-sdk'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = join(process.cwd(), 'public', 'questions')
mkdirSync(OUT_DIR, { recursive: true })

const STYLE =
  'Clean medical textbook illustration, grayscale radiograph/schematic style, educational diagram for MBBS students, high contrast, no text labels, no watermark, no signature.'

const IMAGES: { file: string; size: '1024x1024' | '1344x768' | '1152x864'; prompt: string }[] = [
  {
    file: 'cxr-left-collapse.jpg',
    size: '1152x864',
    prompt: `${STYLE}. Chest X-ray diagram showing complete collapse (atelectasis) of the LEFT lung: dense homogeneous white opacification filling the entire left hemithorax, the trachea and heart mediastinum visibly PULLED toward the left (affected) side, the right lung appearing clear and over-inflated, intact rib cage and clavicles.`,
  },
  {
    file: 'cxr-boot-heart.jpg',
    size: '1152x864',
    prompt: `${STYLE}. Pediatric chest X-ray diagram of an infant showing the classic BOOT-SHAPED HEART (coeur en sabot) of tetralogy of Fallot: uplifted rounded cardiac apex pointing up and to the left, a concave pulmonary artery segment at the upper left heart border, dark (oligaemic) lung fields, normal ribs and spine.`,
  },
  {
    file: 'cxr-pulm-edema.jpg',
    size: '1152x864',
    prompt: `${STYLE}. Chest X-ray diagram of acute pulmonary oedema: enlarged heart, symmetric butterfly (bat-wing) perihilar opacification spreading into both mid and lower zones, peripheral lungs relatively clear, small pleural effusions at both costophrenic angles, upper-lobe venous diversion.`,
  },
  {
    file: 'cxr-free-air.jpg',
    size: '1152x864',
    prompt: `${STYLE}. ERECT chest X-ray diagram showing pneumoperitoneum: thin crescent-shaped dark free air collections under BOTH hemidiaphragms, separating the liver and stomach shadow from the diaphragm, normal lung fields above, clear demarcated diaphragm domes.`,
  },
  {
    file: 'endo-gastric-ulcer.jpg',
    size: '1152x864',
    prompt: `${STYLE}. Upper GI endoscopy view diagram of a gastric antral ulcer: a single round crater with raised, heaped-up irregular margins on the gastric antrum wall, surrounding erythematous mucosal folds radiating toward the crater, realistic endoscopic field-of-view circle on dark background, reddish-pink tones.`,
  },
  {
    file: 'ecg-complete-heart-block.jpg',
    size: '1344x768',
    prompt: `${STYLE}. ECG rhythm strip diagram of THIRD-DEGREE (complete) atrioventricular block: regular independent P waves marching across the strip at ~90/min, slow regular wide QRS complexes at ~35/min with no fixed PR relationship, occasional P waves falling on QRS-T complexes, standard grid paper background.`,
  },
  {
    file: 'thyroid-scan-graves.jpg',
    size: '1024x1024',
    prompt: `${STYLE}. Thyroid nuclear scintigram (radioiodine uptake scan) diagram of Graves disease: enlarged butterfly-shaped thyroid gland with DIFFUSE, intense, symmetric tracer uptake in both lobes, faint salivary glands, dark background, grayscale scan texture.`,
  },
]

async function main() {
  const zai = await ZAI.create()
  for (const img of IMAGES) {
    const out = join(OUT_DIR, img.file)
    if (existsSync(out)) {
      console.log(`• ${img.file} already exists — skipping`)
      continue
    }
    try {
      const res = await zai.images.generations.create({ prompt: img.prompt, size: img.size })
      const b64 = res?.data?.[0]?.base64
      if (!b64) throw new Error('no image data returned')
      writeFileSync(out, Buffer.from(b64, 'base64'))
      console.log(`✓ ${img.file}`)
    } catch (err) {
      console.error(`✗ ${img.file}:`, err instanceof Error ? err.message : err)
      process.exitCode = 1
    }
  }
}

main()
