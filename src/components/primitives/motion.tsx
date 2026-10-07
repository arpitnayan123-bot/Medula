'use client'

// ─── ATELIER MOTION — the elevation layer over Porcelain Atlas ───────────────
// Spring-physics primitives for the whole product. Every primitive:
//   · respects useReducedMotion (renders final state instantly),
//   · is presentational only (never touches data, handlers, a11y),
//   · composes — wrap any element or primitive from kit.tsx.
// Feel: calm, physical, premium. Never flash, never gaming.

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export { EASE } from '@/components/primitives/kit'

// ── Signature springs (the house feel) ───────────────────────────────────────

/** The house spring — one gentle overshoot, like pressed porcelain settling. */
export const SPRING: Transition = { type: 'spring', stiffness: 320, damping: 26, mass: 0.9 }
/** Softer spring for large surfaces (heroes, panels). */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 180, damping: 24, mass: 1.1 }
/** Snappy spring for small controls (chips, toggles, pills). */
export const SPRING_SNAP: Transition = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 }

// ── Stagger orchestration ────────────────────────────────────────────────────

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
}

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

/** Container that orchestrates its `StaggerItem` children in a gentle cascade. */
export function Stagger({
  className,
  children,
  once = true,
  amount = 0.12,
  delay = 0,
}: {
  className?: string
  children: ReactNode
  once?: boolean
  amount?: number
  delay?: number
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial='hidden'
      whileInView='show'
      viewport={{ once, amount }}
      transition={{ delayChildren: delay }}
    >
      {children}
    </motion.div>
  )
}

/** Child of `Stagger` — wraps one card / row / tile. */
export function StaggerItem({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & Omit<HTMLMotionProps<'div'>, 'children'>) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={staggerChild} {...rest}>
      {children}
    </motion.div>
  )
}

// ── Scroll reveals — content arrives as you travel ───────────────────────────

/** Viewport-aware reveal with optional direction. Fires once. */
export function ScrollReveal({
  className,
  children,
  from = 'up',
  amount = 0.15,
  delay = 0,
}: {
  className?: string
  children: ReactNode
  from?: 'up' | 'down' | 'left' | 'right' | 'scale'
  amount?: number
  delay?: number
}) {
  const reduce = useReducedMotion()
  const offsets: Record<string, { x?: number; y?: number; scale?: number }> = {
    up: { y: 22 },
    down: { y: -22 },
    left: { x: 26 },
    right: { x: -26 },
    scale: { scale: 0.96 },
  }
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, ...offsets[from] }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Gentle parallax — an element drifts slower than the page scroll. */
export function Parallax({
  className,
  children,
  distance = 36,
}: {
  className?: string
  children: ReactNode
  distance?: number
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const raw = useTransform(scrollYProgress, [0, 1], [distance, -distance])
  const y = useSpring(raw, { stiffness: 90, damping: 22, mass: 0.8 })
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y }}>{children}</motion.div>
    </div>
  )
}

// ── Tactile surfaces ─────────────────────────────────────────────────────────

/** Card that lifts on hover with a spring and settles on press. Pure CSS where possible. */
export function LiftCard({
  className,
  children,
  amount = 4,
  ...rest
}: { className?: string; children: ReactNode; amount?: number } & HTMLMotionProps<'div'>) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      whileHover={{ y: -amount, transition: SPRING }}
      whileTap={{ scale: 0.985, transition: SPRING_SNAP }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * Magnetic — the element leans a few px toward the cursor and springs home.
 * Used sparingly: hero CTAs, primary actions.
 */
export function Magnetic({
  className,
  children,
  strength = 0.18,
  max = 8,
}: {
  className?: string
  children: ReactNode
  strength?: number
  max?: number
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, SPRING_SOFT)
  const y = useSpring(my, SPRING_SOFT)

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    mx.set(Math.max(-max, Math.min(max, dx * strength)))
    my.set(Math.max(-max, Math.min(max, dy * strength)))
  }
  function onLeave() {
    mx.set(0)
    my.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={cn('inline-block', className)}
      style={reduce ? undefined : { x, y }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
    </motion.div>
  )
}

/** One-shot pop-in for badges, toasts, achievement moments. */
export function Pop({ className, children, delay = 0 }: { className?: string; children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, scale: 0.82, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...SPRING_SNAP, delay }}
    >
      {children}
    </motion.div>
  )
}

/** Pressable wrapper — springy scale-down on press for any clickable. */
export function Pressable({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & HTMLMotionProps<'div'>) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} whileTap={{ scale: 0.97, transition: SPRING_SNAP }} {...rest}>
      {children}
    </motion.div>
  )
}

// ── Living data marks ────────────────────────────────────────────────────────

/** Spring-animated progress bar (0–100). Fills to `value` with the teal→mint ink. */
export function SpringBar({
  value,
  className,
  barClassName,
  delay = 0.1,
}: {
  value: number
  className?: string
  barClassName?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2 shadow-well', className)}
      role='presentation'
    >
      <motion.div
        className={cn('h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.62_0.105_158)]', barClassName)}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={reduce ? { duration: 0 } : { ...SPRING_SOFT, delay }}
      />
    </div>
  )
}

/** Rotating rings — quiet orbital loader / live mark. */
export function OrbitPulse({ className, size = 40 }: { className?: string; size?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      aria-hidden
      className={cn('inline-block rounded-full border border-primary/25 border-t-primary', className)}
      style={{ width: size, height: size }}
      animate={reduce ? undefined : { rotate: 360 }}
      transition={reduce ? undefined : { duration: 1.4, ease: 'linear', repeat: Infinity }}
    />
  )
}

/** Shimmer skeleton line — matches Atlas well tone. */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg bg-surface-2', className)} aria-hidden />
}

// ── Count-up with spring settle (for big stat moments) ───────────────────────

export function SpringNumber({
  value,
  className,
  suffix,
  prefix,
}: {
  value: number
  className?: string
  suffix?: string
  prefix?: string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 80, damping: 22 })

  useEffect(() => {
    mv.set(value)
  }, [value, mv])

  useMotionValueEvent(spring, 'change', (v) => setDisplay(Math.round(v)))

  if (reduce) {
    return (
      <span className={cn('tabular-nums', className)}>
        {prefix}
        {value}
        {suffix}
      </span>
    )
  }
  return (
    <span className={cn('tabular-nums', className)}>
      {prefix}
      {display}
      {suffix}
    </span>
  )
}

// ── Ambient pulse for live indicators (streaks, "live" dots) ─────────────────

export function LiveDot({ className, tone = 'bg-sev-ok' }: { className?: string; tone?: string }) {
  const reduce = useReducedMotion()
  return (
    <span className={cn('relative inline-flex size-2', className)} aria-hidden>
      <motion.span
        className={cn('absolute inline-flex size-full rounded-full opacity-60', tone)}
        animate={reduce ? undefined : { scale: [1, 2.1], opacity: [0.55, 0] }}
        transition={reduce ? undefined : { duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
      />
      <span className={cn('relative inline-flex size-2 rounded-full', tone)} />
    </span>
  )
}

/** Smoothly cross-fades a number list change without layout jump (kept minimal). */
export { animate, motion }
