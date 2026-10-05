'use client'

// ─── MEDICAL IMAGE LEARNING LAB · INTERACTIVE VIEWER (PRODUCT 10) ───
// The heart of the product — a dependency-free teaching viewer:
//   • zoom: wheel (desktop), pinch (two-pointer), double-tap / double-click
//   • pan: single-pointer drag (pointer events, touch-friendly)
//   • pin layer in % of the natural image size (student taps place pins)
//   • reveal-annotations toggle: numbered markers at region coords + labels
//   • compare mode: two independently zoomable panes (stacked on mobile)
//   • immersive fullscreen-ish mode, reset, caption + provenance + source note
// Region/pin convention (FROZEN in types.ts): x,y in % of natural size,
// r = hit radius in % of height; `aspect` (w/h) rides along with pins.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Crosshair, Expand, ImageOff, LocateFixed, Minimize2, Pin, Tags, ZoomIn, ZoomOut,
} from 'lucide-react'
import { LAB_PROVENANCE_META } from '@/lib/types'
import type { LabPin, LabProvenance } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EASE } from './lab-shared'

const MIN_SCALE = 1
const MAX_SCALE = 8
const DOUBLE_TAP_MS = 320
const TAP_SLOP_PX = 8
const DEFAULT_ASPECT = 4 / 3

interface Transform { s: number; x: number; y: number }

/** Numbered teaching annotation (guided step / region reveal). */
export interface LabAnnotation {
  n: number
  label: string
  x: number
  y: number
}

/** Student pin with optional grading outcome (feedback reveal). */
export interface LabPinMarker {
  x: number
  y: number
  verdict?: 'hit' | 'miss' | null
}

function clampT(t: Transform, boxW: number, boxH: number, dispW: number, dispH: number): Transform {
  const maxX = Math.max(0, (dispW * t.s - boxW) / 2)
  const maxY = Math.max(0, (dispH * t.s - boxH) / 2)
  return { s: t.s, x: Math.min(maxX, Math.max(-maxX, t.x)), y: Math.min(maxY, Math.max(-maxY, t.y)) }
}

// ─── One zoomable/pannable/pinnable stage ────────────────────────────────────

interface PaneProps {
  src: string
  alt: string
  pinMode?: boolean
  onPin?: (p: LabPin) => void
  pinDraft?: LabPin | null
  pins?: LabPinMarker[]
  annotations?: LabAnnotation[]
  forceAnnotations?: boolean
  compact?: boolean
  hideChrome?: boolean
  paneLabel?: string
}

function ViewerPane({ src, alt, pinMode = false, onPin, pinDraft, pins = [], annotations = [], forceAnnotations = false, compact = false, hideChrome = false, paneLabel }: PaneProps) {
  const reduce = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  const [boxW, setBoxW] = useState(0)
  const [loaded, setLoaded] = useState<{ src: string; aspect: number } | null>(null)
  const [maxH, setMaxH] = useState(compact ? 300 : 460)
  const [t, setT] = useState<Transform>({ s: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)

  const aspect = loaded?.src === src ? loaded.aspect : DEFAULT_ASPECT

  // Measure the container width (ResizeObserver — no layout thrash)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setBoxW(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Stage max height tracks the viewport (client-only — SSR-safe default above)
  useEffect(() => {
    const measure = () => setMaxH(compact ? 300 : Math.max(340, Math.min(640, Math.round(window.innerHeight * 0.58))))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [compact])

  // Display box: fit (boxW × maxH) with a sane minimum height. The wrapper is
  // centred horizontally (offX) — % pin maths accounts for it exactly.
  const { dispW, dispH, offX } = useMemo(() => {
    if (boxW <= 0) return { dispW: 0, dispH: 0, offX: 0 }
    let w = boxW
    let h = w / aspect
    if (h > maxH) { h = maxH; w = h * aspect }
    if (h < 180) {
      h = 180
      w = h * aspect
      if (w > boxW) { w = boxW; h = w / aspect }
    }
    return { dispW: w, dispH: h, offX: (boxW - w) / 2 }
  }, [boxW, aspect, maxH])

  // ── Gesture state (refs — never re-render on pointer noise) ──
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pan = useRef<{ sx: number; sy: number; bx: number; by: number; moved: boolean; t0: number } | null>(null)
  const pinch = useRef<{ d0: number; s0: number; mx: number; my: number; bx: number; by: number } | null>(null)
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    setT((prev) => {
      const s2 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.s * factor))
      if (s2 === prev.s) return prev
      if (boxW <= 0 || dispW <= 0) return prev
      const lx = (px - offX - prev.x) / prev.s
      const ly = (py - prev.y) / prev.s
      return clampT({ s: s2, x: px - offX - lx * s2, y: py - ly * s2 }, boxW, dispH, dispW, dispH)
    })
  }, [boxW, dispW, dispH, offX])

  const reset = useCallback(() => setT({ s: 1, x: 0, y: 0 }), [])

  // Wheel zoom — native non-passive listener (React's onWheel is passive)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0014)
      if (Math.abs(e.deltaY) < 2) return
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const toImagePct = useCallback((px: number, py: number): LabPin | null => {
    if (dispW <= 0) return null
    const lx = (px - offX - tRef.current.x) / tRef.current.s
    const ly = (py - tRef.current.y) / tRef.current.s
    if (lx < 0 || ly < 0 || lx > dispW || ly > dispH) return null
    return {
      x: Math.min(100, Math.max(0, (lx / dispW) * 100)),
      y: Math.min(100, Math.max(0, (ly / dispH) * 100)),
    }
  }, [dispW, dispH, offX])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    try { el.setPointerCapture(e.pointerId) } catch { /* already released */ }
    const rect = el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    pointers.current.set(e.pointerId, { x: px, y: py })
    if (pointers.current.size === 1) {
      pan.current = { sx: px, sy: py, bx: tRef.current.x, by: tRef.current.y, moved: false, t0: Date.now() }
      setDragging(true)
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s0: tRef.current.s,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        bx: tRef.current.x,
        by: tRef.current.y,
      }
      pan.current = null
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    pointers.current.set(e.pointerId, { x: px, y: py })

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const g = pinch.current
      const s2 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.s0 * (d / g.d0)))
      const lx = (g.mx - offX - g.bx) / g.s0
      const ly = (g.my - g.by) / g.s0
      setT(clampT({ s: s2, x: mx - offX - lx * s2 + (mx - g.mx), y: my - ly * s2 + (my - g.my) }, boxW, dispH, dispW, dispH))
      return
    }

    const p = pan.current
    if (p && pointers.current.size === 1) {
      const dx = px - p.sx
      const dy = py - p.sy
      if (Math.hypot(dx, dy) > TAP_SLOP_PX) p.moved = true
      setT(clampT({ s: tRef.current.s, x: p.bx + dx, y: p.by + dy }, boxW, dispH, dispW, dispH))
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    pointers.current.delete(e.pointerId)

    if (pinch.current && pointers.current.size < 2) {
      pinch.current = null
      const remaining = [...pointers.current.values()][0]
      if (remaining) pan.current = { sx: remaining.x, sy: remaining.y, bx: tRef.current.x, by: tRef.current.y, moved: true, t0: Date.now() }
    }

    const p = pan.current
    if (pointers.current.size === 0) {
      pan.current = null
      setDragging(false)
      if (p && !p.moved && Date.now() - p.t0 < 600) {
        // Tap (or mouse click): double-tap zoom toggle, else pin placement.
        const lt = lastTap.current
        if (lt && Date.now() - lt.t < DOUBLE_TAP_MS && Math.hypot(px - lt.x, py - lt.y) < 28) {
          lastTap.current = null
          if (tRef.current.s > 1.01) reset()
          else zoomAt(px, py, 2.5)
        } else {
          lastTap.current = { t: Date.now(), x: px, y: py }
          if (pinMode && onPin) {
            const pin = toImagePct(px, py)
            if (pin) onPin(pin)
          }
        }
      }
    }
  }

  const placeCentrePin = useCallback(() => {
    if (!onPin) return
    onPin({ x: 50, y: 50 })
  }, [onPin])

  const revealable = annotations.length > 0
  const annotationsOn = showAnnotations || forceAnnotations || (revealable && pins.some((m) => m.verdict != null))

  const cursor = pinMode ? 'cursor-crosshair' : t.s > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''

  return (
    <div className="min-w-0">
      <div
        ref={boxRef}
        className={cn(
          'relative w-full select-none overflow-hidden rounded-xl border border-line bg-surface-2/40',
          'touch-none', // the stage owns all touch gestures — scroll around it
          cursor,
        )}
        style={{ height: dispH > 0 ? Math.round(dispH) : 220 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="group"
        aria-label={paneLabel ?? alt}
      >
        {dispW > 0 && (
          <div
            className="absolute left-0 top-0 will-change-transform"
            style={{
              width: Math.round(dispW),
              height: Math.round(dispH),
              transform: `translate(${offX + t.x}px, ${t.y}px) scale(${t.s})`,
              transformOrigin: '0 0',
            }}
          >
            <img
              key={src}
              src={src}
              alt={alt}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setLoaded({ src, aspect: img.naturalWidth / img.naturalHeight })
                }
              }}
              className="pointer-events-none absolute inset-0 h-full w-full bg-surface-2/20 object-contain"
            />

            {/* ── Pin + annotation layer (% of the image box) ── */}
            <div className="pointer-events-none absolute inset-0">
              {annotationsOn && annotations.map((a) => (
                <motion.div
                  key={`a-${a.n}`}
                  initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="absolute"
                  style={{ left: `${a.x}%`, top: `${a.y}%` }}
                >
                  <span className="absolute -translate-x-1/2 -translate-y-1/2">
                    <span className="grid size-7 place-items-center rounded-full border-2 border-sev-warn bg-sev-warn/20 text-[11px] font-bold text-sev-warn shadow-[0_0_0_2px_rgba(0,0,0,0.25)] backdrop-blur-[2px]">
                      {a.n}
                    </span>
                    <span className="absolute left-1/2 top-full mt-1 max-w-[150px] -translate-x-1/2 truncate rounded-md border border-sev-warn/40 bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold text-sev-warn">
                      {a.label}
                    </span>
                  </span>
                </motion.div>
              ))}

              {pins.map((m, i) => (
                <motion.div
                  key={`p-${i}`}
                  initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="absolute"
                  style={{ left: `${m.x}%`, top: `${m.y}%` }}
                >
                  <span
                    className={cn(
                      'absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 shadow-[0_0_0_2px_rgba(0,0,0,0.25)]',
                      m.verdict === 'hit'
                        ? 'size-7 border-sev-ok bg-sev-ok/25 text-sev-ok'
                        : m.verdict === 'miss'
                          ? 'size-7 border-sev-crit bg-sev-crit/20 text-sev-crit'
                          : 'size-6 border-primary bg-primary/25 text-primary',
                    )}
                  >
                    <Pin className="size-3" aria-hidden />
                  </span>
                </motion.div>
              ))}

              {pinDraft && (
                <motion.div
                  key={`d-${pinDraft.x}-${pinDraft.y}`}
                  initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="absolute"
                  style={{ left: `${pinDraft.x}%`, top: `${pinDraft.y}%` }}
                >
                  <span className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 animate-pulse place-items-center rounded-full border-2 border-primary bg-primary/30 text-primary shadow-[0_0_0_2px_rgba(0,0,0,0.25)]">
                    <Pin className="size-3.5" aria-hidden />
                  </span>
                </motion.div>
              )}
            </div>
          </div>
        )}

        {boxW === 0 && <div className="absolute inset-0 animate-pulse bg-surface-2/40" aria-hidden />}

        {/* ── Stage chrome (outside the transform) ── */}
        {!hideChrome && (
          <>
            <div className="absolute right-2 top-2 flex flex-col gap-1.5">
              {revealable && (
                <button
                  type="button"
                  onClick={() => setShowAnnotations((v) => !v)}
                  aria-pressed={annotationsOn}
                  aria-label={annotationsOn ? 'Hide numbered annotations' : 'Reveal numbered annotations'}
                  className={cn(
                    'grid size-11 place-items-center rounded-xl border backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    annotationsOn
                      ? 'border-sev-warn/50 bg-sev-warn/20 text-sev-warn'
                      : 'border-line bg-background/70 text-ink-soft hover:text-foreground',
                  )}
                >
                  <Tags className="size-4" aria-hidden />
                </button>
              )}
            </div>

            <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => zoomAt(boxW / 2, dispH / 2, 1.35)}
                aria-label="Zoom in"
                className="grid size-11 place-items-center rounded-xl border border-line bg-background/70 text-ink-soft backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ZoomIn className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => zoomAt(boxW / 2, dispH / 2, 1 / 1.35)}
                aria-label="Zoom out"
                className="grid size-11 place-items-center rounded-xl border border-line bg-background/70 text-ink-soft backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ZoomOut className="size-4" aria-hidden />
              </button>
              {t.s > 1.01 && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Reset zoom and position"
                  className="grid size-11 place-items-center rounded-xl border border-primary/40 bg-primary/15 text-primary backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LocateFixed className="size-4" aria-hidden />
                </button>
              )}
            </div>

            {pinMode && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur-md">
                  <Crosshair className="size-3" aria-hidden /> Tap to pin
                </span>
                <button
                  type="button"
                  onClick={placeCentrePin}
                  aria-label="Place pin at the centre of the image (keyboard alternative)"
                  className="grid size-11 place-items-center rounded-xl border border-line bg-background/70 text-ink-soft backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Crosshair className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Public viewer (single + compare + immersive chrome) ─────────────────────

export interface LabViewerCompare {
  src: string
  alt: string
  caption?: string | null
  provenance?: LabProvenance | null
}

interface LabViewerProps {
  src: string
  alt: string
  caption?: string | null
  provenance?: LabProvenance | null
  sourceNote?: string | null
  annotations?: LabAnnotation[]
  forceAnnotations?: boolean
  pinMode?: boolean
  onPin?: (p: LabPin) => void
  pinDraft?: LabPin | null
  pins?: LabPinMarker[]
  compact?: boolean
  compare?: LabViewerCompare | null
  immersiveButton?: boolean
}

export function LabViewer({
  src, alt, caption, provenance, sourceNote, annotations, forceAnnotations, pinMode, onPin, pinDraft, pins,
  compact = false, compare = null, immersiveButton = true,
}: LabViewerProps) {
  const [immersive, setImmersive] = useState(false)
  const provMeta = provenance ? LAB_PROVENANCE_META[provenance] : null

  const stage = (immersiveLayout: boolean) => (
    <div className={cn('grid min-w-0 gap-3', compare ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1')}>
      <div className="min-w-0">
        <ViewerPane
          src={src}
          alt={alt}
          pinMode={pinMode}
          onPin={onPin}
          pinDraft={pinDraft}
          pins={pins}
          annotations={annotations}
          forceAnnotations={forceAnnotations}
          compact={compact || immersiveLayout}
          paneLabel={compare ? 'Primary image' : alt}
        />
        {!immersiveLayout && (caption || provMeta) && (
          <figcaption className="mt-2 min-w-0 space-y-1">
            {caption && <p className="text-xs font-medium leading-snug text-ink-soft">{caption}</p>}
            {provMeta && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft/80">
                <span className="truncate">{provMeta.badge}</span>
                {sourceNote && <span className="truncate font-normal normal-case tracking-normal">· {sourceNote}</span>}
              </p>
            )}
          </figcaption>
        )}
      </div>

      {compare && (
        <div className="min-w-0">
          <ViewerPane src={compare.src} alt={compare.alt} compact hideChrome paneLabel={`Comparison: ${compare.alt}`} />
          {!immersiveLayout && (
            <figcaption className="mt-2 min-w-0 space-y-1">
              {compare.caption && <p className="text-xs font-medium leading-snug text-ink-soft">{compare.caption}</p>}
              {compare.provenance && (
                <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-soft/80">
                  {LAB_PROVENANCE_META[compare.provenance].badge}
                </p>
              )}
            </figcaption>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="min-w-0">
      {stage(false)}

      {/* Immersive toggle */}
      {immersiveButton && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setImmersive(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface-2/50 px-3.5 text-[11px] font-semibold text-ink-soft transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Expand className="size-3.5" aria-hidden /> Immersive view
          </button>
        </div>
      )}

      {/* Immersive overlay — near-fullscreen stage */}
      {immersive && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background/95 p-3 backdrop-blur-xl md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Immersive image view"
        >
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold">{caption ?? alt}</p>
            <button
              type="button"
              onClick={() => setImmersive(false)}
              aria-label="Close immersive view"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2/60 text-ink-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Minimize2 className="size-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {stage(true)}
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact skeleton used while an image is still loading in lists. */
export function LabThumbSkeleton({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center justify-center rounded-lg border border-line bg-surface-2/50 text-ink-soft/50', className)}>
      <ImageOff className="size-4" aria-hidden />
    </span>
  )
}
