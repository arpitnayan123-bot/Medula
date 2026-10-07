'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Command, X } from 'lucide-react'

import { useAppStore } from '@/lib/store'

/**
 * Global keyboard cheat-sheet. Opens on "?" (any non-typing context), closes
 * on Escape, backdrop click, or the ✕ button. Pure reference — no settings.
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-foreground shadow-sm">
      {children}
    </kbd>
  )
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 text-xs leading-snug text-ink-soft">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{title}</p>
      <div className="divide-y divide-line/60">{children}</div>
    </div>
  )
}

export function ShortcutsOverlay() {
  const open = useAppStore((s) => s.shortcutsOpen)
  const setOpen = useAppStore((s) => s.setShortcutsOpen)
  const reduce = useReducedMotion()

  // "?" toggles · Escape closes (never while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === '?') {
        e.preventDefault()
        setOpen(!useAppStore.getState().shortcutsOpen)
      } else if (e.key === 'Escape' && useAppStore.getState().shortcutsOpen) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shortcuts-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <motion.div
            key="shortcuts-panel"
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
            className="glass-strong w-full max-w-lg rounded-2xl border border-line p-5 shadow-2xl md:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Command className="size-4 text-primary" aria-hidden />
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close shortcuts"
                className="rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="space-y-4">
              <Group title="Anywhere">
                <Row keys={['⌘', 'K']} label="Search every concept, subject & question" />
                <Row keys={['?']} label="Toggle this cheat sheet" />
                <Row keys={['Esc']} label="Close the explorer, search or any overlay" />
              </Group>
              <Group title="Question Lab">
                <Row keys={['A', 'B', 'C', 'D']} label="Pick an answer (or 1–4)" />
                <Row keys={['Esc']} label="End the run (asks to confirm)" />
              </Group>
              <Group title="Revise — flashcards">
                <Row keys={['Space']} label="Flip the card" />
                <Row keys={['1', '2', '3', '4']} label="Grade: Again · Hard · Good · Easy" />
              </Group>
            </div>

            <p className="mt-5 border-t border-line pt-3 text-[11px] leading-relaxed text-muted-foreground">
              Shortcuts never fire while you&apos;re typing in a field. Everything is also
              reachable by touch — this is just the fast lane.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
