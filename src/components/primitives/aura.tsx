'use client'

// ─── AURA — the v3 expressiveness layer over Porcelain Atlas ────────────────
// Skiper-UI/Aceternity-grade effects (cursor spotlight, border beams, aurora
// fields, marquees, tilt, sheen, grain) re-engineered for a LIGHT, WARM,
// academic surface: champagne/teal/mint washes on ivory — never neon, never
// dark. Every primitive:
//   · is presentational only (no data, handlers, or a11y changes),
//   · respects prefers-reduced-motion (renders the calm static state),
//   · animates only transform/opacity (GPU-composited), pointer work is
//     spring-smoothed and disabled on touch,
//   · is designed for RESTRAINT — one, maybe two, aura moments per view.

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type HTMLMotionProps } from 'framer-motion'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Touch / pointer coarse detection (tilt + spotlight are pointer luxuries) ─

function subscribeFinePointer(onChange: () => void): () => void {
  const mq = window.matchMedia('(pointer: fine)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function useFinePointer(): boolean {
  return useSyncExternalStore(subscribeFinePointer, () => window.matchMedia('(pointer: fine)').matches, () => false)
}

// ── SpotlightCard — a warm radial glow follows the cursor across the card ────
// The signature "alive surface": as the pointer travels, a soft teal-champagne
// wash tracks it under the content. Pours light like a reading lamp, not neon.

export function SpotlightCard({
  className,
  children,
  size = 520,
  tone = 'rgba(22, 120, 140, 0.075)',
  ...rest
}: {
  className?: string
  children: ReactNode
  /** Spotlight diameter in px. */
  size?: number
  /** Radial core color (use low alpha — the wash should whisper). */
  tone?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const reduce = useReducedMotion()
  const fine = useFinePointer()
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(-9999)
  const my = useMotionValue(-9999)
  const sx = useSpring(mx, { stiffness: 140, damping: 22, mass: 0.6 })
  const sy = useSpring(my, { stiffness: 140, damping: 22, mass: 0.6 })
  const background = useTransform(
    [sx, sy],
    ([x, y]: number[]) =>
      `radial-gradient(${size}px circle at ${x}px ${y}px, ${tone}, transparent 68%)`,
  )

  function onMove(e: React.MouseEvent) {
    if (reduce || !fine || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    mx.set(e.clientX - r.left)
    my.set(e.clientY - r.top)
  }
  function onLeave() {
    mx.set(-9999)
    my.set(-9999)
  }

  return (
    <div
      ref={ref}
      className={cn('group/spot relative overflow-hidden', className)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      {...rest}
    >
      {reduce || !fine ? null : (
        <motion.span
          aria-hidden
          className='pointer-events-none absolute inset-0 z-0 transition-opacity duration-500 [mask-image:radial-gradient(circle_at_center,white,transparent_92%)] group-hover/spot:opacity-100'
          style={{ background, opacity: 0 }}
        />
      )}
      <div className='relative z-10 h-full'>{children}</div>
    </div>
  )
}

// ── BorderBeam — a comet of champagne light traveling the card's edge ───────
// Pure CSS: a conic gradient spins inside a masked border ring. The single
// most recognizable "premium" tell — spend it only on the ONE hero card.

export function BorderBeam({
  className,
  duration = 9,
  size = 220,
  delay = 0,
  reverse = false,
}: {
  className?: string
  /** Seconds per lap. */
  duration?: number
  /** Beam tail length in px. */
  size?: number
  delay?: number
  reverse?: boolean
}) {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <span aria-hidden className={cn('pointer-events-none absolute inset-0 rounded-[inherit]', className)}>
      <span
        className='absolute inset-0 rounded-[inherit] [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)] p-px'
        style={{ WebkitMask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)' }}
      >
        <span
          className='beam absolute inset-0 rounded-[inherit]'
          style={
            {
              '--beam-angle-start': reverse ? '360deg' : '0deg',
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
              background: `conic-gradient(from var(--beam-angle-start), transparent 0deg, transparent ${Math.max(140, 360 - (size / 6))}deg, rgba(232, 196, 106, 0.85) ${360 - size / 12}deg, rgba(22, 120, 140, 0.9) 360deg)`,
              animationDirection: reverse ? 'reverse' : 'normal',
            } as React.CSSProperties
          }
        />
      </span>
    </span>
  )
}

// ── Aurora — slow champagne/mint/teal light drifting behind hero content ────
// The landing hero's living sky. Static, soft washes under reduced motion.

export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const reduce = useReducedMotion()
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]', className)}
      style={{ opacity: intensity }}
    >
      <span className='aurora-blob aurora-a absolute -left-[12%] -top-[30%] h-[70%] w-[55%] rounded-full blur-3xl' />
      <span className='aurora-blob aurora-b absolute -right-[15%] -top-[18%] h-[64%] w-[48%] rounded-full blur-3xl' />
      <span className='aurora-blob aurora-c absolute bottom-[-28%] left-[22%] h-[58%] w-[52%] rounded-full blur-3xl' />
      {reduce ? (
        <style>{'.aurora-blob{animation:none !important}'}</style>
      ) : null}
    </span>
  )
}

// ── Marquee — an infinite, edge-faded drift of quiet chips ───────────────────
// For ambient social proof / capability strips. Pauses on hover; content is
// duplicated aria-hidden so screen readers hear it exactly once.

export function Marquee({
  className,
  children,
  duration = 32,
  reverse = false,
  pauseOnHover = true,
}: {
  className?: string
  children: ReactNode
  /** Seconds for one full loop. */
  duration?: number
  reverse?: boolean
  pauseOnHover?: boolean
}) {
  const reduce = useReducedMotion()
  const row = (
    <div className='flex min-w-full shrink-0 items-center gap-3 px-1.5' aria-hidden={reduce ? undefined : true}>
      {children}
    </div>
  )
  return (
    <div
      className={cn('group/marquee relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]', className)}
      role={reduce ? undefined : 'marquee'}
    >
      <div
        className={cn('flex w-max', !reduce && 'marquee-track', pauseOnHover && 'group-hover/marquee:[animation-play-state:paused]')}
        style={{ animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' } as React.CSSProperties}
      >
        {row}
        {row}
      </div>
    </div>
  )
}

// ── TiltCard — a gentle 3D lean toward the cursor ────────────────────────────
// Max 4.5°, spring-settled, pointer-fine only. Makes hero feature cards feel
// like objects on a desk instead of pixels on glass.

export function TiltCard({
  className,
  children,
  max = 4.5,
  scale = 1.008,
  ...rest
}: {
  className?: string
  children: ReactNode
  max?: number
  scale?: number
} & Omit<HTMLMotionProps<'div'>, 'children' | 'style'>) {
  const reduce = useReducedMotion()
  const fine = useFinePointer()
  const ref = useRef<HTMLDivElement>(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const sx = useSpring(px, { stiffness: 160, damping: 20 })
  const sy = useSpring(py, { stiffness: 160, damping: 20 })
  const rotateX = useTransform(sy, [0, 1], [max, -max])
  const rotateY = useTransform(sx, [0, 1], [-max, max])

  function onMove(e: React.MouseEvent) {
    if (reduce || !fine || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    px.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
    py.set(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))
  }
  function onLeave() {
    px.set(0.5)
    py.set(0.5)
  }

  if (reduce || !fine) return <div className={className}>{children}</div>
  return (
    <motion.div
      ref={ref}
      className={cn('[perspective:1200px]', className)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      {...rest}
    >
      <motion.div
        className='h-full w-full [transform-style:preserve-3d]'
        style={{ rotateX, rotateY }}
        whileHover={{ scale }}
        transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

// ── Sheen — a light sweep across primary CTAs on hover ──────────────────────

export function Sheen({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('sheen-host relative inline-flex overflow-hidden rounded-[inherit]', className)}>
      {children}
      <span aria-hidden className='sheen-sweep pointer-events-none absolute inset-0' />
    </span>
  )
}

// ── WordCycle — one rotating word inside a display heading ───────────────────
// The greeting breathes: "understand medicine a little {deeper|brighter|sharper|clearer}".

const CYCLE_EASE = [0.22, 1, 0.36, 1] as const

export function WordCycle({
  words,
  interval = 3400,
  className,
}: {
  words: string[]
  interval?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (reduce || words.length < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % words.length), interval)
    return () => clearInterval(t)
  }, [reduce, words.length, interval])

  if (reduce) return <span className={className}>{words[0]}</span>
  return (
    <span className={cn('relative inline-block align-baseline', className)} aria-live='off'>
      <motion.span
        key={i}
        className='inline-block'
        initial={{ y: '0.55em', opacity: 0, filter: 'blur(4px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        exit={{ y: '-0.55em', opacity: 0 }}
        transition={{ duration: 0.55, ease: CYCLE_EASE }}
      >
        {words[i]}
      </motion.span>
    </span>
  )
}

// ── GlowRing — conic progress ring with a champagne halo (achievement moments)

export function GlowRing({
  value,
  size = 120,
  stroke = 8,
  className,
  children,
}: {
  /** 0–100. */
  value: number
  size?: number
  stroke?: number
  className?: string
  children?: ReactNode
}) {
  const reduce = useReducedMotion()
  const clamped = Math.max(0, Math.min(100, value))
  const angle = (clamped / 100) * 360
  return (
    <span className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <span
        aria-hidden
        className='absolute inset-0 rounded-full'
        style={{
          background: `conic-gradient(from -90deg, rgba(22,120,140,0.92) ${angle}deg, rgba(232,196,106,0.5) ${angle}deg, rgba(232,196,106,0.5) ${Math.min(360, angle + 40)}deg, transparent ${Math.min(360, angle + 40)}deg)`,
          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - var(--ring-w, 8px)), #000 calc(100% - var(--ring-w, 8px) + 0.5px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - var(--ring-w, 8px)), #000 calc(100% - var(--ring-w, 8px) + 0.5px))',
          // @ts-expect-error CSS custom property
          '--ring-w': `${stroke}px`,
          filter: reduce ? undefined : 'drop-shadow(0 0 10px rgba(232,196,106,0.35))',
        }}
      />
      {children}
    </span>
  )
}

// ── NoiseVeil — micro-grain so flat ivory reads as fine paper ────────────────

export function NoiseVeil({ className, opacity = 0.035 }: { className?: string; opacity?: number }) {
  return (
    <span
      aria-hidden
      className={cn('noise-veil pointer-events-none absolute inset-0 rounded-[inherit]', className)}
      style={{ opacity }}
    />
  )
}

// ── TextShimmer — quiet metallic drift for a single hero word/number ─────────

export function TextShimmer({ className, children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return <span className={className}>{children}</span>
  return <span className={cn('shimmer-text bg-clip-text text-transparent', className)}>{children}</span>
}
