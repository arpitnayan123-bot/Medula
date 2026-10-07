'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import {
  Asterisk,
  BrainCircuit,
  ChevronRight,
  Map as MapIcon,
  Network,
  RefreshCcw,
  ScanSearch,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoMark } from '@/components/brand/logo'
import { HeroAnatomy } from '@/components/brand/hero-anatomy'
import { Magnetic, ScrollReveal, Stagger, StaggerItem } from '@/components/primitives/motion'
import { ContourAtlas } from '@/components/primitives/scenery'
import { Aurora, BorderBeam, Marquee, NoiseVeil, Sheen, SpotlightCard, TextShimmer, TiltCard } from '@/components/primitives/aura'
import { useAppStore } from '@/lib/store'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Reduced-motion as post-hydration state → SSR and first client render always match.
function usePrefersReducedMotion() {
  const prefers = useReducedMotion()
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    setReduce(prefers === true)
  }, [prefers])
  return reduce
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-soft">
      {children}
    </p>
  )
}

// ─── Fragmented → connected constellation ───
type Pt = { x: number; y: number }

const NODES: { label: string; latin: string; scattered: Pt; formed: Pt; color: string }[] = [
  { label: 'Anatomy', latin: 'Morphologia', scattered: { x: 100, y: 84 }, formed: { x: 168, y: 128 }, color: '#c97e59' },
  { label: 'Physiology', latin: 'Physiologia', scattered: { x: 688, y: 64 }, formed: { x: 632, y: 128 }, color: '#16788c' },
  { label: 'Pathology', latin: 'Pathologia', scattered: { x: 84, y: 384 }, formed: { x: 168, y: 332 }, color: '#c97e59' },
  { label: 'Pharmacology', latin: 'Pharmacologia', scattered: { x: 706, y: 392 }, formed: { x: 632, y: 332 }, color: '#5cb491' },
  { label: 'Medicine', latin: 'Medicina Interna', scattered: { x: 352, y: 428 }, formed: { x: 400, y: 234 }, color: '#4a7fae' },
  { label: 'NEET-PG', latin: 'Examen supremum', scattered: { x: 452, y: 44 }, formed: { x: 400, y: 72 }, color: '#d9ad6e' },
]

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [2, 4], [3, 4], [4, 5],
]

const CAPTIONS = [
  { text: 'Medical education is fragmented.', cls: 'text-ink-soft' },
  { text: "Medicine doesn't work in departments.", cls: 'text-foreground' },
  {
    text: "Your preparation shouldn't either.",
    cls: 'ink-gradient',
  },
]

function Constellation() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-18% 0px' })
  const reduce = usePrefersReducedMotion()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!inView || reduce) return
    const t1 = window.setTimeout(() => setPhase(1), 2200)
    const t2 = window.setTimeout(() => setPhase(2), 3700)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [inView, reduce])

  const connected = reduce || inView
  // Reduced motion → skip straight to the final caption/connected state (derived, no effect).
  const displayPhase = reduce ? 2 : phase

  return (
    <div ref={ref} className="relative">
      {/* Swapping captions */}
      <div className="grid justify-items-center text-center" aria-live="polite">
        {CAPTIONS.map((c, i) => (
          <motion.p
            key={c.text}
            className={`[grid-area:1/1] px-4 text-2xl font-semibold tracking-tight sm:text-4xl ${c.cls}`}
            initial={false}
            animate={{ opacity: displayPhase === i ? 1 : 0, y: displayPhase === i ? 0 : 14 }}
            transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
            aria-hidden={displayPhase !== i}
          >
            {c.text}
          </motion.p>
        ))}
      </div>

      <motion.svg
        viewBox="0 0 800 470"
        className="mt-6 h-auto w-full text-muted-foreground sm:mt-2"
        role="img"
        aria-label="Diagram of scattered medical subjects connecting into one linked knowledge constellation ending at NEET-PG"
        initial={false}
        animate={{ opacity: inView ? 1 : 0.55 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        {/* Dim dashed lines between scattered nodes */}
        {EDGES.map(([a, b], i) => (
          <motion.line
            key={`scatter-${i}`}
            x1={NODES[a].scattered.x}
            y1={NODES[a].scattered.y}
            x2={NODES[b].scattered.x}
            y2={NODES[b].scattered.y}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="4 8"
            initial={{ opacity: 0.28 }}
            animate={{ opacity: connected && !reduce ? 0 : 0.28 }}
            transition={{ duration: 0.8, delay: connected && !reduce ? 0.35 : 0 }}
          />
        ))}

        {/* Formation edges drawing in */}
        {EDGES.map(([a, b], i) => (
          <motion.line
            key={`edge-${i}`}
            x1={NODES[a].formed.x}
            y1={NODES[a].formed.y}
            x2={NODES[b].formed.x}
            y2={NODES[b].formed.y}
            stroke={i === EDGES.length - 1 ? '#5cb491' : '#16788c'}
            strokeWidth={1.4}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 0.5 : 0 }}
            animate={connected ? { pathLength: 1, opacity: 0.5 } : { pathLength: 0, opacity: 0 }}
            transition={{
              pathLength: { duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.75 + i * 0.13, ease: 'easeOut' },
              opacity: { duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.75 + i * 0.13 },
            }}
          />
        ))}

        {/* Nodes fly into formation */}
        {NODES.map((n, i) => (
          <motion.g
            key={n.label}
            initial={{ x: n.scattered.x, y: n.scattered.y, opacity: 0.45 }}
            animate={{
              x: connected ? n.formed.x : n.scattered.x,
              y: connected ? n.formed.y : n.scattered.y,
              opacity: connected ? 1 : 0.45,
            }}
            transition={{ duration: reduce ? 0 : 1.15, delay: reduce ? 0 : 0.15 + i * 0.09, ease: EASE }}
          >
            <circle r={18} fill={n.color} opacity={0.14} />
            <circle r={18} fill="none" stroke={n.color} strokeOpacity={connected ? 0.4 : 0.1} strokeWidth={1} />
            <circle r={5.5} fill={n.color} />
            <text
              y={26}
              textAnchor="middle"
              fontSize={14}
              fontWeight={n.label === 'NEET-PG' ? 600 : 500}
              fill="currentColor"
            >
              {n.label}
            </text>
            <text
              y={39}
              textAnchor="middle"
              fontSize={9}
              fontStyle="italic"
              fill="currentColor"
              opacity={0.55}
            >
              {n.latin}
            </text>
          </motion.g>
        ))}
      </motion.svg>
    </div>
  )
}

// ─── Feature grid data ───
const FEATURES = [
  {
    icon: MapIcon,
    title: 'Doubt Search',
    latin: 'Quaestio Tua',
    hue: 'cyan',
    desc: "Type the topic you're confused about — get the concept, practice questions, flashcards and cases together in one clean answer.",
  },
  {
    icon: Network,
    title: 'Concept Explorer',
    latin: 'Nexus Conceptuum',
    hue: 'sky',
    desc: "Every node answers the question “Why am I learning this?” — chains that link today's lecture to the wards, the viva and the exam hall.",
  },
  {
    icon: BrainCircuit,
    title: 'Understand Your Topic',
    latin: 'Ars Vivendi Diagrammatum',
    hue: 'emerald',
    desc: 'The whole syllabus as living, moving 3D diagrams — narrated step by step, with every point students slip on highlighted.',
  },
  {
    icon: RefreshCcw,
    title: 'Adaptive Revision',
    latin: 'Repetitio Spatiata',
    hue: 'amber',
    desc: 'Spaced repetition driven by a real forgetting curve — each concept resurfaces exactly when your memory of it starts to decay.',
  },
  {
    icon: ScanSearch,
    title: 'Error Intelligence',
    latin: 'Analysis Errorum',
    hue: 'sky',
    desc: 'Confusion detection and mistake-pattern analysis turn every wrong answer into a targeted fix instead of a shrug.',
  },
  {
    icon: Stethoscope,
    title: 'Clinical Case Simulator',
    latin: 'Simulationes Clinicae',
    hue: 'cyan',
    desc: 'Progressive-reveal cases that train reasoning the way wards do — history, examination, investigations, decisions.',
  },
  {
    icon: Sparkles,
    title: 'AI Study Coach',
    latin: 'Praeceptor Artificialis',
    hue: 'emerald',
    desc: 'Next-best-action scheduling and an AI tutor with 7 explanation modes — from five-year-old-simple to exam-crisp.',
  },
] as const

const HUES: Record<string, string> = {
  cyan: 'text-primary bg-primary/10 border-primary/20 group-hover:border-primary/40',
  sky: 'text-info bg-info/10 border-info/20 group-hover:border-info/40',
  emerald:
    'text-sev-ok bg-sev-ok/10 border-sev-ok/20 group-hover:border-sev-ok/40',
  amber:
    'text-sev-warn bg-sev-warn/10 border-sev-warn/20 group-hover:border-sev-warn/40',
}

// ─── Capability strip — the platform's eight instruments, drifting quietly ───
const CAPABILITIES = [
  'Doubt Search',
  'Concept Explorer',
  'Understand Your Topic',
  'Adaptive Revision',
  'Error Intelligence',
  'Clinical Case Simulator',
  'AI Study Coach',
  'Topic Hub',
] as const

// ─── Classroom → NEET-PG chain ───
const CHAIN = ['CBME competency', 'Core concept', 'Clinical connection', 'Question practice', 'Revision schedule']

// ─── Personas ───
const PERSONAS = [
  { tag: 'Year 1', title: 'Foundation', desc: 'Build the concept base the rest of medicine stands on.' },
  { tag: 'Year 2', title: 'Integration', desc: 'The heavy years — connected subject by subject, not in silos.' },
  { tag: 'Year 3', title: 'Clinical', desc: 'Ward work feeds the map, and the map feeds your answers.' },
  { tag: 'Intern', title: 'Intensive', desc: 'Internship and serious prep, compressed into one system.' },
]

export function LandingPage() {
  const setView = useAppStore((s) => s.setView)
  const reduce = usePrefersReducedMotion()

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault()
    const el = document.querySelector(hash)
    if (!el) return
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* ─── Sticky nav ─── */}
      <header className="glass-strong sticky top-0 z-40 border-b border-line">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a
            href="#top"
            onClick={(e) => scrollTo(e, '#top')}
            className="flex items-center gap-2.5"
            aria-label="MEDULA home"
          >
            <LogoMark size={34} />
            <span className="text-lg font-extrabold tracking-tight">MEDULA</span>
          </a>

          <div className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            {[
              ['Philosophy', '#philosophy'],
              ['Doubt Search', '#features'],
              ['AI Tutor', '#ai-tutor'],
              ['Roadmap', '#roadmap'],
            ].map(([label, href]) => (
              <a key={label} href={href} onClick={(e) => scrollTo(e, href)} className="transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </div>

          <Button
            size="lg"
            className="h-10 rounded-full px-5 text-sm font-semibold"
            onClick={() => setView('signin')}
          >
            Sign in
          </Button>
        </nav>
      </header>

      <main id="top" className="overflow-x-clip">
        {/* ─── HERO ─── */}
        <section className="relative overflow-hidden">
          <Aurora intensity={0.9} />
          <ContourAtlas className="opacity-60" />
          <div className="med-grid absolute inset-0" aria-hidden />
          <div
            className="absolute left-1/2 top-[-20%] h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-gold/[0.12] blur-3xl"
            aria-hidden
          />

          {/* Animated ECG line */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-16 h-32 w-full [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]"
            aria-hidden
          >
            <svg viewBox="0 0 1200 160" preserveAspectRatio="none" className="h-full w-full opacity-[0.28]">
              <path
                className="ecg-line"
                d="M0 90 H150 l10 -14 10 14 H360 l8 10 12 -46 14 82 10 -46 6 10 H640 l10 -16 10 16 H880 l8 10 12 -46 14 82 10 -46 6 10 H1200"
                fill="none"
                stroke="#16788c"
                strokeWidth={1.6}
              />
            </svg>
          </div>

          <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground sm:text-xs"
            >
              <span className="size-1.5 rounded-full bg-primary" />
              PROJECT MEDULA · The control centre of your medical mind
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.12, ease: EASE }}
              className="mt-8 text-4xl font-bold tracking-tighter sm:text-6xl lg:text-7xl"
            >
              Don&apos;t just study medicine.
              <br />
              <span className="ink-gradient">
                Build a <TextShimmer>medical brain</TextShimmer>.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.24, ease: EASE }}
              className="mt-6 max-w-2xl text-balance text-base leading-relaxed text-ink-soft sm:text-lg"
            >
              An AI-powered learning system that connects your MBBS curriculum, clinical reasoning and
              NEET-PG preparation into one continuously evolving knowledge map.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.36, ease: EASE }}
              className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
            >
              <Magnetic>
                <Sheen className="rounded-full">
                  <Button
                    size="lg"
                    className="h-12 rounded-full px-8 text-sm font-semibold tracking-wide"
                    onClick={() => setView('signin')}
                  >
                    START YOUR MEDICAL JOURNEY
                  </Button>
                </Sheen>
              </Magnetic>
              <Magnetic>
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12 rounded-full border border-line px-8 text-sm font-semibold tracking-wide text-ink-soft transition-transform hover:scale-[1.03] hover:text-foreground"
                  onClick={() => {
                    // Sign-in is always explicit — no silent entry into the app.
                    // With an active session the sign-in page shows the one-tap
                    // "Welcome back" resume card; without one, the full form.
                    setView('signin')
                  }}
                >
                  SEARCH ANY DOUBT, FREE
                </Button>
              </Magnetic>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.55 }}
              className="mt-8 text-xs text-muted-foreground"
            >
              Built on the NMC CBME curriculum · For every MBBS year → NEET-PG
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.5, ease: EASE }}
              className="mt-10 w-full max-w-md"
            >
              <HeroAnatomy className="mx-auto w-full max-w-md" />
            </motion.div>
          </div>

          <NoiseVeil />
        </section>

        {/* ─── Capability strip — quiet drift of the eight instruments ─── */}
        <div className="border-y border-line/60 py-4">
          <Marquee duration={30}>
            {CAPABILITIES.map((name) => (
              <Fragment key={name}>
                <span className="clay-in whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium text-ink-soft">
                  {name}
                </span>
                <Asterisk className="size-3 shrink-0 text-gold" aria-hidden />
              </Fragment>
            ))}
          </Marquee>
        </div>

        {/* ─── Fragmented → connected ─── */}
        <section id="philosophy" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-4xl">
            <ScrollReveal className="mb-10 flex justify-center">
              <Eyebrow>The philosophy</Eyebrow>
            </ScrollReveal>
            <Constellation />
          </div>
        </section>

        {/* ─── Feature grid ─── */}
        <section id="features" className="scroll-mt-24 border-t border-line px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <ScrollReveal className="max-w-2xl">
              <Eyebrow>One system · six instruments</Eyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
                The learning operating system
              </h2>
              <p className="mt-4 text-ink-soft">
                Six instruments, one continuous loop: learn → connect → forget a little → repair → repeat.
              </p>
            </ScrollReveal>

            <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <StaggerItem key={f.title} className="h-full">
                  <SpotlightCard className="h-full overflow-visible rounded-2xl">
                    <motion.div
                      id={f.title === 'Doubt Search' ? 'medical-map' : f.title === 'AI Study Coach' ? 'ai-tutor' : undefined}
                      whileHover={{ scale: 1.02 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      className="clay clay-hover group h-full scroll-mt-32 rounded-2xl p-6"
                    >
                      <div
                        className={`grid size-11 place-items-center rounded-xl border transition-all duration-300 ${HUES[f.hue]}`}
                      >
                        <f.icon className="size-5" aria-hidden />
                      </div>
                      <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
                      <p className="text-[10.5px] font-semibold italic uppercase tracking-wider text-primary/80">{f.latin}</p>
                      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.desc}</p>
                    </motion.div>
                  </SpotlightCard>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ─── Classroom → NEET-PG chain ─── */}
        <section id="roadmap" className="scroll-mt-24 border-t border-line px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-5xl text-center">
            <ScrollReveal>
              <Eyebrow>From classroom to NEET-PG</Eyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">One chain. No dead ends.</h2>
              <p className="mx-auto mt-4 max-w-2xl text-ink-soft">
                Every lecture, concept and question you touch is slotted into the same chain — so classroom
                learning and NEET-PG preparation stop being separate lives.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <div className="clay relative mt-12 overflow-hidden rounded-3xl px-5 py-8 sm:px-8">
                <BorderBeam duration={11} size={260} />
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                  {CHAIN.map((step, i) => (
                    <div key={step} className="flex items-center gap-2 sm:gap-3">
                      <span className="clay-in rounded-full px-4 py-2.5 text-sm font-medium text-ink-soft">
                        {step}
                      </span>
                      {i < CHAIN.length - 1 && (
                        <motion.span
                          aria-hidden
                          className="text-primary"
                          initial={{ x: 0 }}
                          animate={reduce ? undefined : { x: [0, 4, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                        >
                          <ChevronRight className="size-4" />
                        </motion.span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ─── Persona strip ─── */}
        <section className="border-t border-line px-4 py-24 sm:px-6 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <ScrollReveal className="max-w-2xl">
              <Eyebrow>Every stage of the journey</Eyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
                Your first year. Your final year. Your attempt.
              </h2>
            </ScrollReveal>

            <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PERSONAS.map((p) => (
                <StaggerItem key={p.tag} className="h-full">
                  <TiltCard className="h-full">
                    <div className="clay clay-hover h-full rounded-2xl p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                        {p.tag}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold tracking-tight">{p.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{p.desc}</p>
                    </div>
                  </TiltCard>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="px-4 pb-24 sm:px-6 sm:pb-32">
          <ScrollReveal from="scale" className="mx-auto max-w-5xl">
            <div className="podium relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12 sm:py-20">
              <div className="med-grid absolute inset-0 opacity-70" aria-hidden />
              <div className="relative">
                <h2 className="mx-auto max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  The system understands where you are, what you forgot, and what to study next.
                </h2>
                <Button
                  size="lg"
                  className="mt-10 h-12 rounded-full px-10 text-sm font-semibold tracking-wide"
                  onClick={() => setView('onboarding')}
                >
                  START
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-line px-4 py-8 sm:px-6">
        <p className="mx-auto max-w-6xl text-center text-xs text-muted-foreground sm:text-left">
          MEDULA — the medical learning operating system. Not medical advice. Always verify with official NMC/NBEMS sources.
        </p>
      </footer>
    </div>
  )
}
