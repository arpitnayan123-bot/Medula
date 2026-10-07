'use client'

// ─── SIGN IN — demo-first premium auth page ───
// Sign-in is ALWAYS an explicit user action — a stored session never silently
// signs the doctor in. Returning devices land on the "Welcome back" resume
// card (one tap, no password); "Use a different account" clears the stored
// session and reveals the full form. Custom emails route through onboarding
// as fresh accounts. Demo credentials are printed on the page on purpose:
// this is an educational demo.

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Clock, Eye, EyeOff, History, Loader2, LockKeyhole, LogIn, Mail, ShieldCheck, Sparkles, UserRound, UserRoundPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAppStore, readStoredSession, readStoredView, viewFromHash, viewToLabel, writeStoredSession, clearStoredSession, type StoredSession } from '@/lib/store'
import { LogoMark } from '@/components/brand/logo'
import type { Profile, View } from '@/lib/types'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const DEMO_EMAIL = 'doctor@medula.in'
const DEMO_PASSWORD = 'medula2024'

type Phase = 'idle' | 'working' | 'error'

// Human "last active" for the resume card.
function lastActiveLabel(at: number): string {
  if (!at) return 'recently'
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export function SignInView({ initialHash }: { initialHash?: string }) {
  const setView = useAppStore(s => s.setView)
  const setProfile = useAppStore(s => s.setProfile)
  const reduce = useReducedMotion()

  // A stored session never auto-enters the app — it only qualifies for the
  // explicit one-tap resume card below. readStoredSession is client-only,
  // and this view mounts after hydration (the SPA boots on 'landing').
  const [resume, setResume] = useState<StoredSession | null>(() => readStoredSession())

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  // The map remembers where the doctor left off — offer to resume there.
  // A deep link (#/learn) wins over the stored last view.
  // (SignInView mounts client-side only, so reading localStorage here is safe.)
  const [resumeView] = useState<View | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = readStoredView()
    return viewFromHash(initialHash) ?? (stored && stored !== 'home' ? stored : null)
  })

  const enterApp = (profile: Profile | null) => {
    if (profile) {
      setProfile(profile)
      if (profile.onboarded) {
        // Deep link wins, then the stored last view, else the OS home.
        setView(viewFromHash(initialHash) ?? readStoredView() ?? 'os')
      } else {
        setView('onboarding')
      }
    } else {
      setProfile(null)
      setView('onboarding')
    }
  }

  const submit = async (mode: 'form' | 'demo') => {
    setPhase('working')
    setError(null)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'demo' ? { mode: 'demo' } : { email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Sign-in failed. Try again.')
        setPhase('error')
        return
      }
      // Explicit session — reloads stay signed in; sign-out clears it.
      writeStoredSession(data.account === 'demo' ? 'demo' : 'new')
      enterApp(data.profile ?? null)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      setPhase('error')
    }
  }

  const onSubmitForm = (e: React.FormEvent) => {
    e.preventDefault()
    void submit('form')
  }

  // Resume gate — explicit by design. Demo accounts re-run the demo sign-in
  // (one tap, no password); personal accounts re-fetch the profile and route
  // to onboarding when it was never finished.
  const continueSession = async () => {
    if (!resume) return
    if (resume.account === 'demo') {
      void submit('demo')
      return
    }
    setPhase('working')
    setError(null)
    try {
      const r = await api.getProfile()
      writeStoredSession('new') // slide the 30-day inactivity window
      enterApp(r.profile ?? null)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      setPhase('error')
    }
  }

  // Escape hatch: forget this device's session and show the full form.
  const switchAccount = () => {
    clearStoredSession()
    setResume(null)
    setPhase('idle')
    setError(null)
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      {/* ambient warm scene — champagne dawn + mint canopy */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gold/[0.14] blur-3xl" />
        <div className="scene-float absolute -left-16 top-1/3 size-72 rounded-full bg-mint/[0.18] blur-3xl" />
        <div className="scene-float absolute -right-20 bottom-10 size-80 rounded-full bg-gold/[0.12] blur-3xl" style={{ animationDelay: '3s' }} />
        <div className="scene-float absolute -left-24 bottom-1/4 size-64 rounded-full bg-mint/[0.12] blur-3xl" style={{ animationDelay: '6s' }} />
      </div>

      {/* top bar */}
      <header className="relative z-10 flex h-16 items-center px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setView('landing')}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to home
        </button>
      </header>

      {/* sign-in card — resume gate when a session exists, full form otherwise */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        {resume ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="clay w-full max-w-md rounded-3xl p-6 sm:p-8"
            aria-labelledby="signin-resume-heading"
          >
            <div className="flex flex-col items-center text-center">
              <LogoMark size={58} />
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-ink-soft">Medula · Medical Learning OS</p>
              <h1 id="signin-resume-heading" className="mt-3 text-2xl font-semibold tracking-tight">Welcome back, Doctor</h1>
              <p className="mt-1.5 text-sm text-ink-soft">
                You&apos;re signed in on this device — continue where you left off, or switch accounts.
              </p>
            </div>

            {/* identity + last active */}
            <div className="mt-6 space-y-2 rounded-2xl border border-line bg-background/60 p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                  <UserRound className="size-3.5" />
                </span>
                {resume.account === 'demo' ? 'Demo account · doctor@medula.in' : 'Personal account'}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                Last active {lastActiveLabel(resume.at)} · your map remembers exactly where you left off
              </p>
              {resumeView && (
                <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-[11px] font-semibold text-primary">
                  <History className="size-3" aria-hidden />
                  Picks up at {viewToLabel(resumeView)}
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
                {error}
              </p>
            )}

            <Button
              type="button"
              size="lg"
              className="mt-5 min-h-11 w-full gap-2 text-sm font-semibold"
              onClick={() => void continueSession()}
              disabled={phase === 'working'}
            >
              {phase === 'working' ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {resume.account === 'demo' ? 'Continue as Demo Doctor' : 'Continue to your dashboard'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 min-h-10 w-full gap-2 text-sm font-medium text-ink-soft"
              onClick={switchAccount}
              disabled={phase === 'working'}
            >
              <UserRoundPlus className="size-4" />
              Use a different account
            </Button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground">
              <ShieldCheck className="size-3" />
              Educational demo only — no real credentials or patient data are stored.
            </p>
          </motion.div>
        ) : (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="clay w-full max-w-md rounded-3xl p-6 sm:p-8"
        >
          {/* brand */}
          <div className="flex flex-col items-center text-center">
            <LogoMark size={58} />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-ink-soft">Medula · Medical Learning OS</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Welcome back, doctor</h1>
            <p className="mt-1.5 text-sm text-ink-soft">
              Sign in to your medical universe — your map remembers exactly where you left off.
            </p>
            {resumeView && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-[11px] font-semibold text-primary">
                <History className="size-3" aria-hidden />
                Resume at {viewToLabel(resumeView)} after sign-in
              </p>
            )}
          </div>

          {/* form */}
          <form onSubmit={onSubmitForm} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="signin-email" className="text-xs font-medium">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  placeholder={DEMO_EMAIL}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="clay-in h-11 min-h-11 border-0 pl-9 shadow-none focus-visible:ring-2"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signin-password" className="text-xs font-medium">Password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="signin-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="clay-in h-11 min-h-11 border-0 pl-9 pr-10 shadow-none focus-visible:ring-2"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit/10 px-3 py-2 text-xs font-medium text-sev-crit">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="min-h-11 w-full gap-2 text-sm font-semibold" disabled={phase === 'working'}>
              {phase === 'working' ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              Sign in
            </Button>
          </form>

          {/* demo shortcut */}
          <div className="mt-5 rounded-2xl border border-sev-ok/30 bg-sev-ok/[0.07] p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-sev-ok">
              <Sparkles className="size-3.5" /> Demo access
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-soft">
              <span className="inline-flex items-center gap-1"><UserRound className="size-3" /> {DEMO_EMAIL}</span>
              <span className="inline-flex items-center gap-1"><LockKeyhole className="size-3" /> {DEMO_PASSWORD}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-2.5 min-h-10 w-full gap-2 border-sev-ok/40 text-sm font-semibold text-sev-ok hover:bg-sev-ok/10"
              onClick={() => void submit('demo')}
              disabled={phase === 'working'}
            >
              {phase === 'working' ? <Loader2 className="size-4 animate-spin" /> : <UserRound className="size-4" />}
              Use demo account — skip the form
            </Button>
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3" />
            Educational demo only — no real credentials or patient data are stored.
          </p>
        </motion.div>
        )}
      </main>

      {/* footer */}
      <footer className="relative z-10 mt-auto border-t border-line px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        MEDULA — educational learning platform. Not medical advice. Verify with official NMC/NBEMS sources.
      </footer>
    </div>
  )
}
