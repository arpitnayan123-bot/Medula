'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useOnline } from '@/hooks/use-online'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Logo } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import {
  Home, Brain, BookMarked, BookOpen, CalendarCheck, CircleHelp, Stethoscope, RefreshCcw,
  Sparkles, UserRound, Search, Menu, X,
  Keyboard, WifiOff, LayoutGrid, Compass, FlaskConical, Target, Bandage,
} from 'lucide-react'
import type { View } from '@/lib/types'

// One flat registry — used by the mobile "More" sheet and lookups.
const NAV: { id: View; label: string; icon: typeof Home; hint?: string }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'map', label: 'Search', icon: Search },
  { id: 'hub', label: 'Topic Hub', icon: BookMarked },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'questions', label: 'Questions', icon: CircleHelp },
  { id: 'adaptive', label: 'Adaptive', icon: Target },
  { id: 'mistakes', label: 'Mistakes', icon: Bandage },
  { id: 'revision', label: 'Smart Revision', icon: CalendarCheck },
  { id: 'revise', label: 'Revise', icon: RefreshCcw },
  { id: 'understand', label: 'Understand', icon: Brain },
  { id: 'cases', label: 'Cases', icon: Stethoscope },
  { id: 'research', label: 'Research', icon: FlaskConical },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'tutor', label: 'AI Tutor', icon: Sparkles },
  { id: 'profile', label: 'Profile', icon: UserRound },
]

// Desktop sidebar + drawer render THREE clear groups instead of eleven flat
// rows — the library is assimilated, not scattered. Profile lives in the
// sidebar footer card (desktop) and the More sheet (mobile), not the groups.
const NAV_GROUPS: { title: string; items: View[] }[] = [
  { title: 'Daily study', items: ['home', 'map', 'hub', 'learn', 'questions', 'adaptive', 'mistakes', 'revision', 'revise'] },
  { title: 'Clinical & deep dives', items: ['understand', 'cases'] },
  { title: 'Discover', items: ['research', 'explore', 'tutor'] },
]

// Views that open as drill-downs of a parent section keep the parent
// highlighted in every nav surface (sidebar, drawer, More sheet).
const PARENT_OF: Partial<Record<View, View>> = {
  progress: 'profile',
  roadmap: 'profile',
}
const sectionOf = (v: View): View => PARENT_OF[v] ?? v

// Mobile bottom bar — the core daily loop (Home / Search / Questions / Revise)
// plus a "More" button that opens a bottom sheet with the remaining sections.
const MOBILE_NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'map', label: 'Search', icon: Search },
  { id: 'questions', label: 'Questions', icon: CircleHelp },
  { id: 'revise', label: 'Revise', icon: RefreshCcw },
]
const MORE_NAV = NAV.filter((item) => !MOBILE_NAV.some((m) => m.id === item.id))

// Brand logo comes from @/components/brand/logo (imported above)
// Night mode removed by design — one signature sky-blue theme, zero theme chrome.

const navItem = (id: View) => NAV.find((n) => n.id === id)!

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, setView, setSearchOpen, setShortcutsOpen, profile } = useAppStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const moreSheetRef = useRef<HTMLDivElement>(null)
  const online = useOnline()
  const reduce = useReducedMotion()

  // "More" bottom sheet: Escape closes (focus returns to the toggle) and a
  // light focus trap keeps Tab cycling inside the sheet while it's open.
  useEffect(() => {
    if (!moreOpen) return
    const raf = requestAnimationFrame(() => moreSheetRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMoreOpen(false)
        moreBtnRef.current?.focus()
        return
      }
      if (e.key === 'Tab' && moreSheetRef.current) {
        const items = Array.from(moreSheetRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)'))
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  // Cmd/Ctrl+K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearchOpen])

  const go = (v: View) => {
    setView(v)
    setMobileNavOpen(false)
    if (moreOpen) {
      setMoreOpen(false)
      // Keyboard flow: after choosing a section in the sheet, move focus into
      // the new view instead of dropping it on <body>.
      requestAnimationFrame(() => document.getElementById('main-content')?.focus())
    }
  }

  const logoButton = (compact: boolean) => (
    <button onClick={() => setView('landing')} aria-label="MEDULA home" className="rounded-xl outline-none ring-primary/50 focus-visible:ring-2">
      <Logo compact={compact} />
    </button>
  )

  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip-to-content — invisible until keyboard-focused (a11y) */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ── Desktop sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-sidebar/80 backdrop-blur-xl lg:flex">
        <div className="p-5"><button onClick={() => setView('landing')} aria-label="MEDULA home" className="rounded-xl"><Logo /></button></div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="pb-1">
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/80">
                {group.title}
              </p>
              {group.items.map((id) => {
                const item = navItem(id)
                const active = sectionOf(view) === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors min-h-11',
                      active
                        ? 'bg-primary/12 font-medium text-primary'
                        : 'text-ink-soft hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                    {active && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <button
            onClick={() => go('profile')}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-2 min-h-11"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {(profile?.name ?? 'Dr').slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">Dr. {profile?.name ?? '…'}</span>
              <span className="block text-[11px] text-ink-soft">
                {profile ? (profile.year <= 4 ? `Year ${profile.year}` : profile.year === 5 ? 'Intern' : 'Dedicated') : ''}
              </span>
            </span>
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex flex-1 flex-col lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-background/80 px-3 backdrop-blur-xl md:px-5">
          <button
            className="flex size-10 items-center justify-center rounded-xl hover:bg-surface-2 lg:hidden"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Open navigation"
          >
            {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="lg:hidden">{logoButton(true)}</div>

          <button
            onClick={() => setSearchOpen(true)}
            className="mx-auto hidden h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-ink-soft transition-colors hover:border-primary/40 md:flex"
          >
            <Search className="size-4" />
            <span>Search medicine…</span>
            <kbd className="ml-auto rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex size-10 items-center justify-center rounded-xl hover:bg-surface-2 md:hidden"
              aria-label="Search"
            >
              <Search className="size-4" />
            </button>
            <button
              onClick={() => setShortcutsOpen(true)}
              className="hidden size-10 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-surface-2 hover:text-foreground sm:flex"
              aria-label="Keyboard shortcuts (?)"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="size-4" />
            </button>
          </div>
        </header>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
            <nav className="absolute inset-y-0 left-0 w-72 border-r border-line bg-background p-4 pt-5 shadow-2xl">
              <div className="mb-5"><button onClick={() => setMobileNavOpen(false)} aria-label="Close menu" className="rounded-xl"><Logo /></button></div>
              <div className="space-y-1">
                {NAV_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/80">
                      {group.title}
                    </p>
                    {group.items.map((id) => {
                      const item = navItem(id)
                      return (
                        <button
                          key={item.id}
                          onClick={() => go(item.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm min-h-11',
                            sectionOf(view) === item.id ? 'bg-primary/12 font-medium text-primary' : 'text-ink-soft hover:bg-surface-2',
                          )}
                        >
                          <item.icon className="size-4" /> {item.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
                <div className="pt-2">
                  {(() => {
                    const item = navItem('profile')
                    return (
                      <button
                        onClick={() => go(item.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm min-h-11',
                          sectionOf(view) === 'profile' ? 'bg-primary/12 font-medium text-primary' : 'text-ink-soft hover:bg-surface-2',
                        )}
                      >
                        <item.icon className="size-4" /> {item.label}
                      </button>
                    )
                  })()}
                </div>
              </div>
            </nav>
          </div>
        )}

        {/* Offline banner — calm, never blocks; everything loaded keeps working */}
        <AnimatePresence>
          {!online && (
            <motion.div
              key="offline-banner"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div
                role="status"
                className="flex items-center justify-center gap-2 border-b border-sev-warn/30 bg-sev-warn/10 px-4 py-2 text-xs font-medium text-sev-warn"
              >
                <WifiOff className="size-3.5 shrink-0" aria-hidden />
                <span>
                  You&apos;re offline — everything you&apos;ve already loaded keeps working. Progress
                  syncs when you&apos;re back.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content — id/aria give the skip link a target; pb-safe-nav clears
            the fixed mobile bottom nav + device safe-area inset */}
        <main id="main-content" aria-label="Main content" tabIndex={-1} className="flex-1 pb-safe-nav">
          {children}
        </main>

        {/* Sticky footer — mt-auto keeps it pinned when content is short;
            pb-safe-nav lifts its text above the fixed mobile bottom nav */}
        <footer className="mt-auto border-t border-line px-4 pb-safe-nav md:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 py-4 text-[11px] text-ink-soft sm:flex-row">
            <span>MEDULA — the control centre of your medical mind.</span>
            <span>Educational platform · Not medical advice · Verify against official NMC / NBEMS sources</span>
          </div>
        </footer>
      </div>

      {/* ── Mobile bottom nav: daily loop + More ── */}
      <nav className="pb-safe-inset fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/90 backdrop-blur-xl lg:hidden" aria-label="Primary">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors',
                view === item.id ? 'text-primary' : 'text-ink-soft',
              )}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <item.icon className="size-5" />
              {item.label}
            </button>
          ))}
          <button
            ref={moreBtnRef}
            onClick={() => { setMobileNavOpen(false); setMoreOpen((o) => !o) }}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] transition-colors',
              moreOpen ? 'text-primary' : 'text-ink-soft',
            )}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
          >
            <LayoutGrid className="size-5" />
            More
          </button>
        </div>
      </nav>

      {/* ── "More" bottom sheet — the remaining views, mobile only ── */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-hidden />
          <div
            ref={moreSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            tabIndex={-1}
            className="pb-safe-inset glass-strong absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl p-4 pt-3 shadow-2xl outline-none"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">All sections</p>
            <div className="space-y-1">
              {MORE_NAV.map((item) => {
                const active = sectionOf(view) === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition-colors',
                      active
                        ? 'bg-primary/12 font-medium text-primary'
                        : 'text-ink-soft hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                    {active && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
