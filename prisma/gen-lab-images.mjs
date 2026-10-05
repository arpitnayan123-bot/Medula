// ─── PRODUCT 10 · MEDICAL IMAGE LEARNING LAB — asset generation ──────────────
// Generates platform-OWNED educational images (AI-created illustrations) for
// the Image Lab. Every generated image is clearly labelled in the app as
// "AI-generated educational illustration" (provenance: ai-illustration) and
// the 7 pre-existing real clinical photos remain provenance: owned-clinical.
// No text labels burned into images — students must identify findings.
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

const OUT = '/home/z/my-project/public/questions'

const IMAGES = [
  { file: 'ecg-stemi.jpg', size: '1408x768', prompt: '12-lead electrocardiogram printout on standard pink graph paper, black ECG tracings, dramatic ST-segment elevation in chest leads V2 V3 V4 with tall broad hyperacute T waves, regular rhythm, realistic medical ECG paper texture, sharp clean print, no text annotations or letters, high quality, detailed' },
  { file: 'ecg-af.jpg', size: '1408x768', prompt: 'ECG rhythm strip on pink graph paper, black tracing showing atrial fibrillation: irregularly irregular R-R intervals with no P waves, wavy chaotic fibrillatory baseline between narrow QRS complexes, clean realistic medical ECG print, no text, high quality' },
  { file: 'ecg-hyperkalemia.jpg', size: '1408x768', prompt: 'ECG rhythm strip on pink graph paper, black tracing showing very tall peaked tented symmetric T waves after each QRS complex, regular rhythm, broadening QRS, small flat P waves, realistic medical ECG print, no text, high quality' },
  { file: 'cxr-normal.jpg', size: '1344x768', prompt: 'Normal chest X-ray radiograph, frontal PA view of adult chest, clear dark lung fields with fine vascular markings, sharp costophrenic angles, normal sized cardiac silhouette, visible ribs spine and clavicles, realistic radiograph texture, no text or annotations, high quality, detailed' },
  { file: 'cxr-pneumothorax.jpg', size: '1344x768', prompt: 'Chest X-ray radiograph frontal view showing a large right-sided pneumothorax: black air-filled right lung zone with a thin white visceral pleural line and complete absence of lung markings beyond the line, normal left lung with vascular markings, mediastinum central, realistic radiograph, no text annotations, high quality' },
  { file: 'cxr-miliary-tb.jpg', size: '1344x768', prompt: 'Chest X-ray radiograph frontal view showing countless tiny uniform millet-seed sized nodules spread evenly through both lung fields, miliary tuberculosis pattern, normal sized heart, realistic radiograph texture, no text annotations, high quality' },
  { file: 'ct-mca-infarct.jpg', size: '1344x768', prompt: 'Axial non-contrast CT scan image slice of a human brain showing a large dark hypodense wedge-shaped area in the left middle cerebral artery territory with loss of grey-white matter differentiation and effaced sulci, grey-scale realistic medical CT texture, no text annotations, high quality' },
  { file: 'ct-subdural.jpg', size: '1344x768', prompt: 'Axial non-contrast CT scan of a human brain showing a bright white hyperdense crescent-shaped blood collection curving along the inside of the right skull, subdural hematoma, slight midline shift, grey-scale realistic medical CT, no text, high quality' },
  { file: 'mri-ms.jpg', size: '1344x768', prompt: 'Axial brain MRI scan FLAIR image showing several bright white ovoid demyelinating plaques scattered in the deep white matter around the lateral ventricles, dark CSF in ventricles, grey-scale realistic medical MRI texture, no text annotations, high quality' },
  { file: 'histo-cirrhosis.jpg', size: '1344x768', prompt: 'Histology photomicrograph H and E stain of liver cirrhosis, pale pink fibrous septa forming bridges that encircle rounded regenerative hepatocyte nodules, pink and purple stained tissue, microscope slide view, realistic medical histology image, high quality, detailed' },
  { file: 'histo-granuloma.jpg', size: '1344x768', prompt: 'Histology photomicrograph H and E stain showing a tuberculous caseating granuloma: central pale amorphous caseous necrosis surrounded by epithelioid cells and large multinucleated Langhans giant cells with peripheral horseshoe nuclei, rim of lymphocytes, pink purple tissue, realistic histology slide, high quality' },
  { file: 'smear-sickle.jpg', size: '1344x768', prompt: 'Peripheral blood smear high-power microscope view, Wright stain, showing many elongated crescent-shaped sickled red blood cells among normal round red cells, pale pink background, realistic hematology microscopy, high quality, detailed' },
  { file: 'smear-aml.jpg', size: '1344x768', prompt: 'Peripheral blood smear microscope view Wright stain showing many large immature myeloblast white blood cells with fine open nuclear chromatin and visible nucleoli, one cell containing a thin red needle-shaped Auer rod, crowded field, realistic hematology microscopy, high quality' },
  { file: 'derm-psoriasis.jpg', size: '1344x768', prompt: 'Clinical dermatology photograph of chronic plaque psoriasis on a person elbow and forearm: well-demarcated raised red erythematous plaques covered with silvery white scales, realistic medical photography lighting, clean neutral background, high quality' },
  { file: 'derm-zoster.jpg', size: '1344x768', prompt: 'Clinical dermatology photograph of herpes zoster on a torso: a narrow horizontal band of grouped small fluid-filled vesicles on red erythematous bases following a single dermatome around one side of the chest, realistic medical photography, high quality' },
  { file: 'fundus-htn.jpg', size: '1344x768', prompt: 'Retinal fundus photograph of hypertensive retinopathy: orange-red circular retina with pale optic disc, arteriovenous nipping where arteries cross veins, small flame-shaped hemorrhages radiating from the disc, fluffy white cotton wool spots, realistic ophthalmology fundus camera image, high quality' },
  { file: 'fundus-dr.jpg', size: '1344x768', prompt: 'Retinal fundus photograph of diabetic retinopathy: orange-red circular retina, numerous tiny red dot-blot hemorrhages and microaneurysms scattered across the posterior pole, yellow waxy hard exudates in a circinate ring near the macula, realistic ophthalmology fundus image, high quality' },
  { file: 'gram-staph.jpg', size: '1344x768', prompt: 'Gram stain microscopy photomicrograph showing numerous deep purple gram-positive round cocci bacteria arranged in irregular grape-like clusters on a pale background, oil immersion high magnification, realistic microbiology microscope image, high quality' },
  { file: 'gram-ecoli.jpg', size: '1344x768', prompt: 'Gram stain microscopy photomicrograph showing many pink-red gram-negative rod-shaped bacilli bacteria scattered on a pale background, oil immersion high magnification, realistic microbiology microscope image, high quality' },
  { file: 'xray-colles.jpg', size: '1152x864', prompt: 'Wrist X-ray radiograph lateral view showing a transverse fracture of the distal radius with the distal bone fragment displaced and tilted dorsally backward like a dinner fork deformity, realistic bone radiograph, grey-scale, no text annotations, high quality' },
  { file: 'barium-achalasia.jpg', size: '1344x768', prompt: 'Barium swallow X-ray radiograph showing a hugely dilated esophagus filled with white contrast tapering smoothly to a narrow bird-beak point at the lower esophageal sphincter, achalasia, realistic radiograph, grey background, no text, high quality' },
  { file: 'ophtha-cataract.jpg', size: '1024x1024', prompt: 'Close-up clinical photograph of a single human eye with a mature cataract: the pupil area appears milky white and opaque instead of black, white lens opacity visible behind the clear cornea, realistic medical photography, sharp detail, high quality' },
  { file: 'us-gallstone.jpg', size: '1344x768', prompt: 'Abdominal ultrasound image of a gallbladder containing one bright white echogenic gallstone casting a clean dark black posterior acoustic shadow, black anechoic bile, grey-scale realistic medical ultrasound with speckle texture, sector scan shape, no text, high quality' },
  { file: 'anatomy-coronary.jpg', size: '1152x864', prompt: 'Medical anatomy textbook illustration of the human heart anterior view showing the coronary arteries rendered in red and cardiac veins in blue on the heart surface, aorta and pulmonary artery trunk visible, premium clean medical illustration style, white background, no text labels, high quality, detailed' },
]

async function main() {
  const zai = await ZAI.create()
  const results = []
  for (const img of IMAGES) {
    const out = `${OUT}/${img.file}`
    if (fs.existsSync(out) && fs.statSync(out).size > 30000) {
      console.log(`SKIP (exists): ${img.file}`)
      results.push({ file: img.file, ok: true, skipped: true })
      continue
    }
    let ok = false
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const res = await zai.images.generations.create({ prompt: img.prompt, size: img.size })
        const b64 = res?.data?.[0]?.base64
        if (!b64) throw new Error('empty base64')
        const buf = Buffer.from(b64, 'base64')
        if (buf.length < 30000) throw new Error(`suspiciously small (${buf.length}b)`)
        fs.writeFileSync(out, buf)
        console.log(`OK: ${img.file} (${Math.round(buf.length / 1024)}kb)`)
        results.push({ file: img.file, ok: true, kb: Math.round(buf.length / 1024) })
        ok = true
      } catch (e) {
        console.log(`RETRY ${attempt} ${img.file}: ${e?.message ?? e}`)
        await new Promise(r => setTimeout(r, 2000 * attempt))
      }
    }
    if (!ok) results.push({ file: img.file, ok: false })
  }
  fs.writeFileSync('/home/z/my-project/prisma/gen-lab-report.json', JSON.stringify(results, null, 2))
  const failed = results.filter(r => !r.ok)
  console.log(`DONE. generated=${results.filter(r => r.ok && !r.skipped).length} skipped=${results.filter(r => r.skipped).length} failed=${failed.length}`)
  if (failed.length) console.log('FAILED:', failed.map(f => f.file).join(', '))
  process.exit(0)
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
