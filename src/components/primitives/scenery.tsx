'use client'

// ─── ATELIER SCENERY — Haikei-spirit generative SVG backdrops ────────────────
// Original art, warm Atlas palette, pure SVG + CSS motion (no WebGL, no libs).
// Every piece: aria-hidden, pointer-events-none, absolute by default — drop it
// as the first child of a relative section and let content sit above (z-10).
// All drift animations respect prefers-reduced-motion via the .scenery CSS in
// globals.css (transitions disabled there).

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

type SceneryProps = { className?: string }

/** Shared frame: absolute inset, clipped, behind content. */
function Frame({ className, children, label }: { className?: string; children: React.ReactNode; label: string }) {
  return (
    <div
      aria-hidden
      data-scenery
      role='presentation'
      className={cn('pointer-events-none absolute inset-0 overflow-hidden select-none', className)}
    >
      {children}
    </div>
  )
}

// ── 1 · AuroraWaves — layered warm wave bands (hero base) ────────────────────

export function AuroraWaves({ className }: SceneryProps) {
  const reduce = useReducedMotion()
  return (
    <Frame className={className} label='drifting warm waves'>
      <svg className='absolute inset-0 size-full' viewBox='0 0 1440 560' preserveAspectRatio='xMidYMid slice'>
        <defs>
          <linearGradient id='aw-1' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%' stopColor='oklch(0.84 0.07 82 / 0.5)' />
            <stop offset='100%' stopColor='oklch(0.87 0.06 165 / 0.34)' />
          </linearGradient>
          <linearGradient id='aw-2' x1='0' y1='0' x2='1' y2='0'>
            <stop offset='0%' stopColor='oklch(0.86 0.055 45 / 0.4)' />
            <stop offset='100%' stopColor='oklch(0.80 0.09 85 / 0.26)' />
          </linearGradient>
          <linearGradient id='aw-3' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor='oklch(0.93 0.03 165 / 0.5)' />
            <stop offset='100%' stopColor='oklch(0.99 0.005 92 / 0)' />
          </linearGradient>
        </defs>
        <motion.path
          d='M0,320 C240,240 420,380 720,320 C1020,260 1200,360 1440,290 L1440,560 L0,560 Z'
          fill='url(#aw-1)'
          animate={reduce ? undefined : { x: [0, -36, 0] }}
          transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.path
          d='M0,400 C260,330 480,460 760,400 C1040,340 1240,430 1440,380 L1440,560 L0,560 Z'
          fill='url(#aw-2)'
          animate={reduce ? undefined : { x: [0, 30, 0] }}
          transition={reduce ? undefined : { duration: 32, repeat: Infinity, ease: 'easeInOut' }}
        />
        <path d='M0,480 C300,430 560,520 860,470 C1160,420 1300,500 1440,460 L1440,560 L0,560 Z' fill='url(#aw-3)' />
      </svg>
    </Frame>
  )
}

// ── 2 · ContourAtlas — topographic contour lines (the Atlas signature) ───────

const CONTOURS = [
  'M-40,120 C180,40 360,180 560,110 C760,40 940,170 1180,90 C1300,50 1400,90 1480,60',
  'M-40,200 C200,120 380,250 600,180 C820,110 1000,240 1220,160 C1320,125 1420,160 1480,135',
  'M-40,290 C220,210 420,330 640,265 C860,200 1040,320 1240,250 C1340,215 1420,245 1480,225',
  'M-40,380 C240,305 440,415 660,355 C880,295 1060,405 1260,340 C1350,312 1420,335 1480,320',
  'M-40,470 C260,400 460,505 680,450 C900,395 1080,495 1280,435 C1360,412 1420,430 1480,420',
]

export function ContourAtlas({ className, opacity = 0.5 }: SceneryProps & { opacity?: number }) {
  return (
    <Frame className={className} label='atlas contour lines'>
      <svg className='absolute inset-0 size-full' viewBox='0 0 1440 560' preserveAspectRatio='xMidYMid slice'>
        <g fill='none' stroke='oklch(0.505 0.078 197)' strokeWidth='1.1' opacity={opacity}>
          {CONTOURS.map((d, i) => (
            <path key={i} d={d} strokeOpacity={0.34 - i * 0.045} strokeDasharray={i % 2 ? '1 7' : undefined} />
          ))}
        </g>
        <g fill='none' stroke='oklch(0.80 0.115 85)' strokeWidth='1.4' opacity={opacity * 0.85}>
          <path d='M-40,155 C190,80 370,215 580,145 C790,75 970,205 1200,125 C1310,88 1410,120 1480,95' />
          <circle cx='580' cy='145' r='3' fill='oklch(0.80 0.115 85)' stroke='none' />
          <circle cx='1200' cy='125' r='2.4' fill='oklch(0.66 0.13 35)' stroke='none' />
        </g>
      </svg>
    </Frame>
  )
}

// ── 3 · BlobField — soft organic washes for empty/quiet zones ────────────────

export function BlobField({ className }: SceneryProps) {
  const reduce = useReducedMotion()
  return (
    <Frame className={className} label='soft organic washes'>
      <motion.div
        className='absolute -top-24 -left-16 size-80 rounded-full blur-3xl'
        style={{ background: 'oklch(0.88 0.06 82 / 0.5)' }}
        animate={reduce ? undefined : { y: [0, 18, 0], scale: [1, 1.06, 1] }}
        transition={reduce ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className='absolute top-1/3 -right-20 size-96 rounded-full blur-3xl'
        style={{ background: 'oklch(0.9 0.05 165 / 0.45)' }}
        animate={reduce ? undefined : { y: [0, -22, 0], scale: [1, 1.08, 1] }}
        transition={reduce ? undefined : { duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      <motion.div
        className='absolute -bottom-28 left-1/4 size-72 rounded-full blur-3xl'
        style={{ background: 'oklch(0.87 0.055 45 / 0.4)' }}
        animate={reduce ? undefined : { y: [0, 14, 0] }}
        transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
      />
    </Frame>
  )
}

// ── 4 · DotMatrix — quiet dot grid with radial fade ──────────────────────────

export function DotMatrix({ className, tone = 'oklch(0.505 0.078 197 / 0.16)' }: SceneryProps & { tone?: string }) {
  return (
    <Frame className={className} label='dot grid'>
      <svg className='absolute inset-0 size-full'>
        <defs>
          <pattern id='dm-dots' width='22' height='22' patternUnits='userSpaceOnUse'>
            <circle cx='1.4' cy='1.4' r='1.4' fill={tone} />
          </pattern>
          <radialGradient id='dm-fade' cx='50%' cy='38%' r='75%'>
            <stop offset='0%' stopColor='white' />
            <stop offset='100%' stopColor='white' stopOpacity='0' />
          </radialGradient>
          <mask id='dm-mask'>
            <rect width='100%' height='100%' fill='url(#dm-fade)' />
          </mask>
        </defs>
        <rect width='100%' height='100%' fill='url(#dm-dots)' mask='url(#dm-mask)' />
      </svg>
    </Frame>
  )
}

// ── 5 · OrbitRings — concentric knowledge orbits (progress atoms) ────────────

export function OrbitRings({ className }: SceneryProps) {
  const reduce = useReducedMotion()
  return (
    <Frame className={className} label='knowledge orbits'>
      <svg className='absolute inset-0 size-full' viewBox='0 0 400 400' preserveAspectRatio='xMidYMid slice'>
        <g fill='none' transform='translate(200 200)'>
          <circle r='120' stroke='oklch(0.505 0.078 197 / 0.2)' strokeDasharray='2 9' />
          <circle r='86' stroke='oklch(0.80 0.115 85 / 0.3)' strokeDasharray='2 7' />
          <circle r='52' stroke='oklch(0.62 0.105 158 / 0.26)' strokeDasharray='2 6' />
          <motion.g
            animate={reduce ? undefined : { rotate: 360 }}
            transition={reduce ? undefined : { duration: 40, repeat: Infinity, ease: 'linear' }}
          >
            <circle cx='120' cy='0' r='4' fill='oklch(0.505 0.078 197 / 0.55)' />
            <circle cx='-86' cy='0' r='3' fill='oklch(0.80 0.115 85 / 0.6)' />
          </motion.g>
          <motion.g
            animate={reduce ? undefined : { rotate: -360 }}
            transition={reduce ? undefined : { duration: 55, repeat: Infinity, ease: 'linear' }}
          >
            <circle cx='52' cy='0' r='3.2' fill='oklch(0.62 0.105 158 / 0.55)' />
          </motion.g>
          <circle r='8' fill='oklch(0.66 0.13 35 / 0.35)' />
        </g>
      </svg>
    </Frame>
  )
}

// ── 6 · PulseTrace — a single living ECG line (brand pulse) ──────────────────

const PULSE_PATH =
  'M0,60 L64,60 L78,60 L86,38 L94,82 L102,60 L120,60 L132,54 L144,66 L156,60 L220,60 L234,60 L242,30 L250,90 L258,60 L276,60 L288,52 L300,68 L312,60 L376,60 L390,60 L398,40 L406,80 L414,60 L432,60 L444,55 L456,65 L468,60 L532,60 L546,60 L554,26 L562,94 L570,60 L588,60 L600,53 L612,67 L624,60 L688,60 L720,60'

export function PulseTrace({ className, height = 120 }: SceneryProps & { height?: number }) {
  const reduce = useReducedMotion()
  return (
    <Frame className={className} label='ecg pulse'>
      <svg className='absolute inset-x-0 top-1/2 w-full -translate-y-1/2' height={height} viewBox='0 0 720 120' preserveAspectRatio='none'>
        <motion.path
          d={PULSE_PATH}
          fill='none'
          stroke='oklch(0.66 0.13 35)'
          strokeWidth='1.8'
          strokeLinecap='round'
          initial={reduce ? undefined : { pathLength: 0, opacity: 0.9 }}
          animate={reduce ? undefined : { pathLength: 1 }}
          transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
        />
      </svg>
    </Frame>
  )
}

// ── 7 · MoleculeDrift — floating nodes + edges (pharma/biochem zones) ────────

export function MoleculeDrift({ className }: SceneryProps) {
  const reduce = useReducedMotion()
  const nodes = [
    { x: 60, y: 80, r: 5, c: 'oklch(0.505 0.078 197 / 0.4)' },
    { x: 150, y: 40, r: 3.5, c: 'oklch(0.80 0.115 85 / 0.55)' },
    { x: 220, y: 110, r: 4.5, c: 'oklch(0.62 0.105 158 / 0.42)' },
    { x: 310, y: 60, r: 3, c: 'oklch(0.66 0.13 35 / 0.4)' },
    { x: 120, y: 160, r: 3, c: 'oklch(0.80 0.115 85 / 0.45)' },
    { x: 270, y: 170, r: 3.6, c: 'oklch(0.505 0.078 197 / 0.34)' },
  ]
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [0, 4], [2, 5], [4, 5],
  ]
  return (
    <Frame className={className} label='floating molecule'>
      <svg className='absolute inset-0 size-full' viewBox='0 0 360 220' preserveAspectRatio='xMidYMid slice'>
        <g stroke='oklch(0.245 0.02 60 / 0.1)' strokeWidth='1'>
          {edges.map(([a, b], i) => (
            <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} />
          ))}
        </g>
        {nodes.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.c}
            animate={reduce ? undefined : { y: [0, i % 2 ? 7 : -7, 0] }}
            transition={reduce ? undefined : { duration: 8 + i * 1.7, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
          />
        ))}
      </svg>
    </Frame>
  )
}

// ── 8 · GrainVeil — barely-there paper grain (texture, not noise) ────────────

export function GrainVeil({ className }: SceneryProps) {
  return (
    <Frame className={cn('opacity-[0.35]', className)} label='paper grain'>
      <svg className='absolute inset-0 size-full'>
        <filter id='gv-noise'>
          <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch' />
          <feColorMatrix type='saturate' values='0' />
          <feComponentTransfer>
            <feFuncA type='linear' slope='0.05' />
          </feComponentTransfer>
        </filter>
        <rect width='100%' height='100%' filter='url(#gv-noise)' />
      </svg>
    </Frame>
  )
}
