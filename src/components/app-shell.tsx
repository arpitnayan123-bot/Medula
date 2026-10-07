'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useOnline } from '@/hooks/use-online'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Logo } from '@/components/brand/logo'
import { SPRING_SOFT, SPRING_SNAP } from '@/components/primitives/motion'
import { cn } from '@/lib/utils'
import {
  Home, Brain, BookMarked, BookOpen, CalendarCheck, CalendarClock, CircleHelp, ClipboardList, GraduationCap, LibraryBig, Network, Stethoscope, RefreshCcw,
  Sparkles, UserRound, Search, Menu, X, ScanEye, ScanSearch, Mic, Gauge, Users,
  Keyboard, WifiOff, LayoutGrid, Compass, FlaskConical, Target, Bandage, Trophy, Command,
} from 'lucide-react'
import type { View } from '@/lib/types'

// One flat registry — used by the mobile "More" sheet and lookups.
// 'os' is the HOME surface (answers "what should I do next?"); 'home' is the
// Today surface (plan + subjects + internship) inside Daily study.
const NAV: { id: View; label: string; icon: typeof Home; hint?: string }[] = [
  { id: 'os', label: 'Home', icon: Command },
  { id: 'home', label: 'Today', icon: Home },
  { id: 'map', label: 'Search', icon: Search },
  { id: 'hub', label: 'Topic Hub', icon: BookMarked },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'questions', label: 'Questions', icon: CircleHelp },
  { id: 'adaptive', label: 'Adaptive', icon: Target },
  { id: 'exam', label: 'Exam Lab', icon: ClipboardList },
  { id: 'mistakes', label: 'Mistakes', icon: Bandage },
  { id: 'revision', label: 'Smart Revision', icon: CalendarCheck },
  { id: 'planner', label: 'Planner', icon: CalendarClock },
  { id: 'graph', label: 'Knowledge Graph', icon: Network },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'revise', label: 'Revise', icon: RefreshCcw },
  { id: 'understand', label: 'Understand', icon: Brain },
  { id: 'cases', label: 'Case Simulator', icon: Stethoscope },
  { id: 'lab', label: 'Image Lab', icon: ScanEye },
  { id: 'voice', label: 'Voice Tutor', icon: Mic },
  { id: 'research', label: 'Research', icon: FlaskConical },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'library', label: 'Resource Hub', icon: LibraryBig },
  { id: 'ask', label: 'Ask Engine', icon: ScanSearch },
  { id: 'community', label: 'Community', icon: Users },
  { id: 'gamify', label: 'Motivation', icon: Trophy },
  { id: 'brain', label: 'Medical Brain', icon: Brain },
  { id: 'faculty', label: 'Faculty Studio', icon: GraduationCap },
  { id: 'tutor', label: 'AI Tutor', icon: Sparkles },
  { id: 'profile', label: 'Profile', icon: UserRound },
]

// Desktop sidebar + drawer render THREE clear groups instead of eleven flat
// rows — the library is assimilated, not scattered. Profile lives in the
// sidebar footer card (desktop) and the More sheet (mobile), not the groups.
const NAV_GROUPS: { title: string; items: View[] }[] = [
  { title: 'Education OS', items: ['os'] },
  { title: 'Daily study', items: ['home', 'map', 'hub', 'learn', 'questions', 'adaptive', 'exam', 'mistakes', 'revision', 'planner', 'graph', 'performance', 'revise'] },
  { title: 'Intelligence', items: ['brain', 'faculty'] },
  { title: 'Clinical & deep dives', items: ['understand', 'cases', 'lab', 'voice'] },
  { title: 'Community', items: ['community'] },
  { title: 'Growth', items: ['gamify'] },
  { title: 'Discover', items: ['ask', 'research', 'explore', 'library', 'tutor'] },
]

// Views that open as drill-downs of a parent section keep the parent
// highlighted in every nav surface (sidebar, drawer, More sheet).
const PARENT_OF: Partial<Record<View, View>> = {
  progress: 'profile',
  roadmap: 'profile',
}
const sectionOf = (v: View): View => PARENT_OF[v] ?? v

// Mobile bottom bar — the core daily loop opens on the OS home (what should
// I do next) plus Search / Questions / Revise, and a "More" sheet with the
// remaining sections.
const MOBILE_NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'os', label: 'Home', icon: Command },
  { id: 'map', label: 'Search', icon: Search },
  { id: 'questions', label: 'Questions', icon: CircleHelp },
  { id: 'revise', label: 'Revise', icon: RefreshCcw },
]
const MORE_NAV = NAV.filter((item) => !MOBILE_NAV.some((m) => m.id === item.id))

// Brand logo comes from @/components/brand/logo (imported above)
// Night mode removed by design — one signature porcelain theme, zero theme chrome.

const navItem = (id: View) => NAV.find((n) => n.id === id)!

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, setView, setSearchOpen, setShortcutsOpen, profile } = useAppStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const moreSheetRef = useRef<HTMLDivElement>(null)
  const online = useOnline()
  const reduce = useReducedMotion()
  // Scroll-reactive header — the glass bar gains depth once the page travels.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  // Sidebar / drawer item — one shared recipe so every surface feels identical.
  const navRow = (id: View, onGo: (v: View) => void) => {
    const item = navItem(id)
    const active = sectionOf(view) === item.id
    return (
      <button
        key={item.id}
        onClick={() => onGo(item.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 active:scale-[0.985]',
          active
            ? 'clay text-primary font-medium'
            : 'text-ink-soft hover:bg-surface-2/70 hover:text-foreground hover:translate-x-0.5',
        )}
      >
        <item.icon className={cn('size-4 shrink-0 transition-colors', active ? 'text-primary' : 'text-ink-soft/80 group-hover:text-foreground')} />
        <span className="truncate">{item.label}</span>
        {active && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
      </button>
    )
  }

  const groupsBlock = (onGo: (v: View) => void) => (
    <div className="space-y-0.5">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="pb-1.5">
          <p className="flex items-center gap-2 px-3 pb-1 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/75">
            {group.title === 'Education OS' && <span className="size-1 rounded-full bg-gold" aria-hidden />}
            {group.title}
          </p>
          {group.items.map((id) => navRow(id, onGo))}
        </div>
      ))}
    </div>
  )

  const profileRow = (
    <button
      onClick={() => go('profile')}
      className="clay-hover flex min-h-11 w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-2/60"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/18 to-primary/8 text-sm font-semibold text-primary ring-1 ring-inset ring-white/60">
        {(profile?.name ?? 'Dr').slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">Dr. {profile?.name ?? '…'}</span>
        <span className="block text-[11px] text-ink-soft">
          {profile ? (profile.year <= 4 ? `Year ${profile.year}` : profile.year === 5 ? 'Intern' : 'Dedicated') : ''}
        </span>
      </span>
    </button>
  )

  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip-to-content — invisible until keyboard-focused (a11y) */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ── Desktop sidebar — floating porcelain panel ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col lg:flex">
        <div className="flex h-full flex-col border-r border-line/80 bg-sidebar/85 shadow-[8px_0_32px_-24px_oklch(0.55_0.05_65/35%)] backdrop-blur-xl">
          <div className="px-5 pb-4 pt-6">
            <button onClick={() => setView('landing')} aria-label="MEDULA home" className="rounded-xl outline-none ring-primary/50 focus-visible:ring-2">
              <Logo />
            </button>
          </div>
          <div className="rule-soft mx-5" aria-hidden />
          <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-1" aria-label="Main navigation">
            {groupsBlock(go)}
          </nav>
          <div className="p-4 pt-2">{profileRow}</div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex flex-1 flex-col lg:pl-60">
        {/* Top bar — warm glass */}
        <header
          className={cn(
            'glass-strong sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line/70 px-3 transition-shadow duration-300 md:px-5',
            scrolled
              ? 'shadow-[0_14px_36px_-20px_oklch(0.55_0.05_65/55%)]'
              : 'shadow-[0_8px_24px_-20px_oklch(0.55_0.05_65/45%)]',
          )}
        >
          <button
            className="press flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-surface-2/70 hover:text-foreground lg:hidden"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Open navigation"
          >
            {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="lg:hidden">{logoButton(true)}</div>

          <button
            onClick={() => setSearchOpen(true)}
            className="clay-field mx-auto hidden h-10 w-full max-w-md items-center gap-2.5 rounded-full px-4 text-sm text-ink-soft transition-colors hover:text-foreground md:flex"
          >
            <Search className="size-4 text-primary/70" />
            <span>Search medicine…</span>
            <kbd className="ml-auto rounded-md border border-line bg-card/80 px-1.5 py-0.5 font-mono text-[10px] text-ink-soft shadow-sm">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <button
              onClick={() => setSearchOpen(true)}
              className="press flex size-10 items-center justify-center rounded-xl text-ink-soft hover:bg-surface-2/70 hover:text-foreground md:hidden"
              aria-label="Search"
            >
              <Search className="size-4" />
            </button>
            <button
              onClick={() => setShortcutsOpen(true)}
              className="press hidden size-10 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-surface-2/70 hover:text-foreground sm:flex"
              aria-label="Keyboard shortcuts (?)"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="size-4" />
            </button>
            <button
              onClick={() => go('profile')}
              className="press hidden size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/18 to-primary/8 text-sm font-semibold text-primary ring-1 ring-inset ring-white/60 transition-shadow hover:shadow-raised sm:flex lg:hidden"
              aria-label="Open profile"
            >
              {(profile?.name ?? 'Dr').slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        {/* Mobile drawer — porcelain panel glides in on a soft spring */}
        <AnimatePresence>
          {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <motion.div
              className="absolute inset-0 bg-[oklch(0.35_0.04_60/45%)] backdrop-blur-sm"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.nav
              className="absolute inset-y-0 left-0 w-80 max-w-[86vw] border-r border-line bg-sidebar p-4 pt-6 shadow-[24px_0_60px_-30px_oklch(0.4_0.05_60/50%)]"
              initial={reduce ? false : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: '-100%' }}
              transition={SPRING_SOFT}
            >
              <div className="mb-4 flex items-center justify-between">
                <button onClick={() => setMobileNavOpen(false)} aria-label="Close menu" className="rounded-xl"><Logo /></button>
              </div>
              <div className="rule-soft mb-2" aria-hidden />
              <div className="h-[calc(100%-5.5rem)] overflow-y-auto pb-safe-inset pr-0.5">
                {groupsBlock(go)}
                <div className="border-t border-line/70 pt-3">{navRow('profile', go)}</div>
              </div>
            </motion.nav>
          </div>
          )}
        </AnimatePresence>

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
                className="callout callout-warn m-3 flex items-center justify-center gap-2 !rounded-xl px-4 py-2 text-xs font-medium"
              >
                <WifiOff className="size-3.5 shrink-0 text-sev-warn" aria-hidden />
                <span className="text-ink-soft">
                  You&apos;re offline — everything you&apos;ve already loaded keeps working. Progress
                  syncs when you&apos;re back.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content — id/aria give the skip link a target; pb-safe-nav clears
            the floating mobile dock + device safe-area inset. The keyed motion
            wrapper gives every view a calm, physical entrance. */}
        <main id="main-content" aria-label="Main content" tabIndex={-1} className="flex-1 overflow-x-clip pb-safe-nav">
          <motion.div
            key={view}
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.996 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>

        {/* Sticky footer — mt-auto keeps it pinned when content is short;
            pb-safe-nav lifts its text above the floating mobile dock */}
        <footer className="mt-auto px-4 pb-safe-nav md:px-6">
          <div className="rule-soft mx-auto max-w-6xl" aria-hidden />
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 py-4 text-[11px] text-ink-soft sm:flex-row">
            <span>MEDULA — the control centre of your medical mind.</span>
            <span>Educational platform · Not medical advice · Verify against official NMC / NBEMS sources</span>
          </div>
        </footer>
      </div>

      {/* ── Mobile dock: the daily loop + More — floating porcelain glass ── */}
      <nav
        className="fixed inset-x-3 z-40 lg:hidden"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Primary"
      >
        <div className="glass-strong grid grid-cols-5 rounded-2xl shadow-float">
          {MOBILE_NAV.map((item) => {
            const active = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                className={cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] transition-colors',
                  active ? 'text-primary' : 'text-ink-soft',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active &&
                  (reduce ? (
                    <span className="clay absolute inset-x-2 inset-y-1 -z-10 rounded-xl" aria-hidden />
                  ) : (
                    <motion.span
                      layoutId="dock-active-pill"
                      className="clay absolute inset-x-2 inset-y-1 -z-10 rounded-xl"
                      transition={SPRING_SNAP}
                      aria-hidden
                    />
                  ))}
                <item.icon className="size-5" />
                {item.label}
              </button>
            )
          })}
          <button
            ref={moreBtnRef}
            onClick={() => { setMobileNavOpen(false); setMoreOpen((o) => !o) }}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] transition-colors',
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
      <AnimatePresence>
        {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            className="absolute inset-0 bg-[oklch(0.35_0.04_60/45%)] backdrop-blur-sm"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <motion.div
            ref={moreSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            tabIndex={-1}
            className="pb-safe-inset glass-strong absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl p-4 pt-3 shadow-float outline-none"
            initial={reduce ? false : { y: '100%' }}
            animate={{ y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={SPRING_SOFT}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">All sections</p>
            <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
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
                        ? 'clay font-medium text-primary'
                        : 'text-ink-soft hover:bg-surface-2/70 hover:text-foreground',
                    )}
                  >
                    <item.icon className={cn('size-4', active ? 'text-primary' : 'text-ink-soft/80')} />
                    {item.label}
                    {active && <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </div>
        )}
      </AnimatePresence>
    </div>
  )
}
