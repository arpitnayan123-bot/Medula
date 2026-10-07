'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Mic, MicOff, Play, Radio, RotateCcw, Square, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Sheen } from '@/components/primitives/aura'
import { SpringNumber, Stagger, StaggerItem } from '@/components/primitives/motion'
import type {
  VoiceDebrief,
  VoiceHome,
  VoiceMode,
  VoiceModeInfo,
  VoiceTranscriptEntry,
  VoiceTurnResult,
} from '@/lib/types'
import {
  createVoicePlayer,
  createVoiceRecorder,
  micSupported,
  type VoicePlayback,
  type VoiceRecorder,
} from './voice-audio'
import { VoiceDebriefCard } from './voice-debrief'

// PRODUCT 11 — MEDICAL VOICE TUTOR
// «Listen → Speak → Answer → Get feedback → Learn»
// One-tap session start, hands-free loop (auto-listen after the tutor speaks,
// tap-to-interrupt any time), typed-input fallback that is a first-class
// citizen (accessibility + micless devices), adjustable speaking speed.

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'
type Screen = 'home' | 'session' | 'debrief'

const SPEEDS = [0.75, 1, 1.25, 1.5] as const

const MODE_META: Record<VoiceMode, { icon: typeof Mic; accent: string }> = {
  listen: { icon: Radio, accent: 'bg-primary/10 text-primary' },
  rapid: { icon: Play, accent: 'bg-sev-warn/10 text-sev-warn' },
  viva: { icon: Mic, accent: 'bg-sev-crit/10 text-sev-crit' },
  revision: { icon: RotateCcw, accent: 'bg-sev-ok/10 text-sev-ok' },
  clinical: { icon: Square, accent: 'bg-primary/10 text-primary' },
  doubt: { icon: Type, accent: 'bg-info/10 text-info' },
}

const MODE_LABELS: Record<VoiceMode, string> = {
  listen: 'Listen',
  rapid: 'Rapid Fire',
  viva: 'Viva',
  revision: 'Revision',
  clinical: 'Clinical',
  doubt: 'Doubt',
}

export function VoiceView() {
  const [screen, setScreen] = useState<Screen>('home')
  const [home, setHome] = useState<VoiceHome | null>(null)
  const [homeError, setHomeError] = useState(false)
  const [micOk, setMicOk] = useState(true)
  const [starting, setStarting] = useState<VoiceMode | null>(null)
  const [debrief, setDebrief] = useState<VoiceDebrief | null>(null)

  const session = useRef<{
    sessionId: string
    mode: VoiceMode
    topicLabel: string
    transcript: VoiceTranscriptEntry[]
  } | null>(null)

  const { voicePreset, clearVoicePreset } = useAppStore()
  const presetFired = useRef(false)

  const loadHome = useCallback(async () => {
    setHomeError(false)
    try {
      const data = await api.voiceHome()
      setHome(data)
      setMicOk(micSupported())
    } catch {
      setHomeError(true)
    }
  }, [])

  useEffect(() => {
    void loadHome()
  }, [loadHome])

  const startSession = useCallback(
    async (mode: VoiceMode, topicId?: string, sessionId?: string) => {
      setStarting(sessionId ? 'revision' : mode)
      try {
        const res = await api.voiceStart(sessionId ? { sessionId } : { mode, topicId })
        session.current = {
          sessionId: res.sessionId,
          mode: res.mode,
          topicLabel: '',
          transcript:
            res.transcript && res.transcript.length
              ? res.transcript
              : res.greeting
                ? [{ role: 'tutor', text: res.greeting, at: new Date().toISOString() }]
                : [],
        }
        setDebrief(null)
        setScreen('session')
      } catch {
        setHomeError(true)
      } finally {
        setStarting(null)
      }
    },
    [],
  )

  // Hand-off preset from other surfaces (dashboard, revision, hub…)
  useEffect(() => {
    if (!voicePreset || presetFired.current) return
    presetFired.current = true
    const { mode, topicId } = voicePreset
    clearVoicePreset()
    void startSession(mode, topicId)
  }, [voicePreset, clearVoicePreset, startSession])

  const onSessionEnd = useCallback(
    async (result: VoiceDebrief) => {
      setDebrief(result)
      setScreen('debrief')
      void loadHome()
    },
    [loadHome],
  )

  if (screen === 'session' && session.current) {
    return (
      <VoiceSessionView
        sessionId={session.current.sessionId}
        mode={session.current.mode}
        initialTranscript={session.current.transcript}
        onEnd={onSessionEnd}
        onExit={() => {
          setScreen('home')
          void loadHome()
        }}
      />
    )
  }

  if (screen === 'debrief' && debrief) {
    return (
      <VoiceDebriefCard
        debrief={debrief}
        onHome={() => {
          setScreen('home')
          void loadHome()
        }}
        onAgain={(mode) => startSession(mode)}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-6">
      {/* ── Hero: one tap, hands-free ── */}
      <section className="podium rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Mic className="size-4" aria-hidden />
          Product 11 · hands-free learning
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Your medical tutor, out loud.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Put the phone down and just talk. Listen to a topic, answer rapid-fire questions, run a
          viva, clear your revision queue — or ask tonight&apos;s doubt, all by voice.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-ink-soft">
          {['Listen', 'Speak', 'Answer', 'Get feedback', 'Learn'].map((step, i) => (
            <span key={step} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-ink-soft/50">→</span>}
              <span className="clay-in rounded-full px-2.5 py-1">{step}</span>
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-14 rounded-2xl px-6 text-base font-semibold"
            onClick={() => startSession('listen')}
            disabled={starting !== null}
          >
            <Sheen className="justify-center gap-2">
              <Mic className="size-5" aria-hidden />
              {starting === 'listen' ? 'Starting…' : 'Start talking — one tap'}
            </Sheen>
          </Button>
          {!micOk && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-warn/10 px-3 py-1.5 text-xs font-medium text-sev-warn">
              <MicOff className="size-3.5" aria-hidden />
              No mic here — typed input works exactly the same
            </span>
          )}
        </div>
      </section>

      {/* ── Measured stats ── */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Your voice learning stats">
        {homeError || !home ? (
          <div className="clay-in col-span-full rounded-2xl p-4 text-sm text-ink-soft">
            <AlertTriangle className="mr-1.5 inline size-4 text-sev-warn" aria-hidden />
            {homeError
              ? 'Could not load your voice stats — check your connection and reopen.'
              : 'Loading your voice stats…'}
          </div>
        ) : (
          <>
            <Stat label="Voice sessions" value={home.stats.sessions} />
            <Stat label="Minutes spoken" value={home.stats.minutes} />
            <Stat label="Answers graded" value={home.stats.questions} />
            <Stat
              label="Spoken accuracy"
              value={home.stats.accuracy === null ? '—' : `${home.stats.accuracy}%`}
            />
          </>
        )}
      </section>

      {/* ── Resume ── */}
      {home?.resume && (
        <section className="mt-6">
          <button
            onClick={() => startSession(home.resume!.mode, undefined, home.resume!.sessionId)}
            disabled={starting !== null}
            className="clay clay-hover flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left disabled:opacity-60"
          >
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-sev-ok">
                Resume session
              </span>
              <span className="mt-0.5 block text-sm font-medium text-ink">
                {MODE_LABELS[home.resume.mode]} · started{' '}
                {new Date(home.resume.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
            <Play className="size-5 shrink-0 text-sev-ok" aria-hidden />
          </button>
        </section>
      )}

      {/* ── Why this now (measured) ── */}
      {home && home.suggestions.length > 0 && (
        <section className="mt-6" aria-label="Suggested for you">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Why this now</h2>
          <Stagger className="mt-2 grid gap-2 sm:grid-cols-2">
            {home.suggestions.map((s, i) => {
              const meta = MODE_META[s.mode]
              const Icon = meta.icon
              return (
                <StaggerItem key={`${s.mode}-${i}`}>
                  <button
                    onClick={() => startSession(s.mode, s.topicId ?? undefined)}
                    disabled={starting !== null}
                    className="clay clay-hover group flex items-start gap-3 rounded-2xl p-4 text-left disabled:opacity-60"
                  >
                    <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', meta.accent)}>
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{MODE_LABELS[s.mode]}</span>
                      <span className="mt-0.5 block text-xs text-ink-soft">{s.line}</span>
                    </span>
                  </button>
                </StaggerItem>
              )
            })}
          </Stagger>
        </section>
      )}

      {/* ── All six modes ── */}
      <section className="mt-6" aria-label="Voice learning modes">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Six ways to learn by voice</h2>
        {homeError || !home ? (
          <p className="mt-2 text-sm text-ink-soft">Modes load with your stats.</p>
        ) : (
          <Stagger className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {home.modes.map((m: VoiceModeInfo) => {
              const meta = MODE_META[m.id]
              const Icon = meta.icon
              return (
                <StaggerItem key={m.id}>
                  <div
                    className="clay clay-hover flex h-full flex-col rounded-2xl p-4"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={cn('flex size-9 items-center justify-center rounded-xl', meta.accent)}>
                        <Icon className="size-4.5" aria-hidden />
                      </span>
                      <span className="text-sm font-bold text-ink">{m.name}</span>
                      {m.expectsAnswer && (
                        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          answers graded
                        </span>
                      )}
                    </div>
                    <p className="mt-2 flex-1 text-xs text-ink-soft">{m.tagline}</p>
                    <p className="mt-2 text-xs italic text-primary">{m.speak}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full rounded-xl"
                      onClick={() => startSession(m.id)}
                      disabled={starting !== null}
                    >
                      {starting === m.id ? 'Starting…' : `Start ${m.name.toLowerCase()}`}
                    </Button>
                  </div>
                </StaggerItem>
              )
            })}
          </Stagger>
        )}
      </section>

      {/* ── Weak areas ── */}
      {home && home.weak.length > 0 && (
        <section className="mt-6" aria-label="Weak concepts">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Bring your weak spots — say them out loud
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {home.weak.map((w) => (
              <button
                key={w.name}
                onClick={() => startSession('viva')}
                className="warm-card rounded-full px-3 py-1.5 text-xs font-medium text-ink"
              >
                {w.name} · {w.mastery}%
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Honest boundaries ── */}
      <section className="clay-in mt-8 rounded-2xl p-4 text-xs leading-relaxed text-ink-soft">
        <p className="font-semibold text-ink">How this works &amp; where it stops</p>
        <p className="mt-1">
          Your speech is transcribed and processed to generate each reply; conversations are kept in
          your learning history to track progress. The Voice Tutor is an <strong>educational</strong>{' '}
          study aid — it never replaces a qualified medical professional, never diagnoses real
          patients, and tells you plainly when it is uncertain. Graded answers feed the same
          Mistake Intelligence, Smart Revision and Performance Analytics as everything else on
          Medula.
        </p>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="clay rounded-2xl p-4">
      <p className="text-xl font-bold text-ink">
        {typeof value === 'number' ? <SpringNumber value={value} /> : value}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Live session player (hands-free loop)
// ─────────────────────────────────────────────────────────────────────────

function VoiceSessionView({
  sessionId,
  mode,
  initialTranscript,
  onEnd,
  onExit,
}: {
  sessionId: string
  mode: VoiceMode
  initialTranscript: VoiceTranscriptEntry[]
  onEnd: (debrief: VoiceDebrief) => void
  onExit: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [speed, setSpeed] = useState<number>(1)
  const [handsFree, setHandsFree] = useState(true)
  const [micOk, setMicOk] = useState(true)
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>(initialTranscript)
  const [state, setState] = useState({ turns: Math.floor(initialTranscript.length / 2), questions: 0, correct: 0 })
  const [typed, setTyped] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [ending, setEnding] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)

  const playerRef = useRef<VoicePlayback | null>(null)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const startedAtRef = useRef(Date.now())
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const speedRef = useRef(speed)
  const handsFreeRef = useRef(handsFree)
  const modeRef = useRef(mode)

  phaseRef.current = phase
  speedRef.current = speed
  handsFreeRef.current = handsFree
  modeRef.current = mode

  // ——— listen: mic on, level metering (declared first — speak depends on it) ———
  const startListening = useCallback(async () => {
    if (phaseRef.current === 'listening') return
    try {
      const recorder = createVoiceRecorder((l) => setLevel(l))
      await recorder.start()
      recorderRef.current = recorder
      setMicError(null)
      setPhase('listening')
      setLevel(0)
    } catch {
      setMicOk(false)
      setMicError('Microphone unavailable — use the typed input below; everything else works the same.')
      setPhase('idle')
    }
  }, [])

  // ——— speak: TTS → playback → maybe auto-listen (hands-free loop) ———
  const speak = useCallback(
    async (text: string, expectsAnswerAfter: boolean) => {
      setPhase('speaking')
      try {
        const blob = await api.voiceTts(text)
        const player = playerRef.current ?? (playerRef.current = createVoicePlayer())
        const result = await player.play(blob, speedRef.current)
        if (result === 'ended' && handsFreeRef.current && micOk) {
          if (expectsAnswerAfter) await startListening()
          else {
            setPhase('idle')
            if (handsFreeRef.current) await startListening() // listen mode still hears follow-ups
          }
        } else {
          setPhase('idle')
        }
      } catch {
        setPhase('idle')
        setNotice('Speech playback failed — the text below is always available.')
      }
    },
    [micOk, startListening],
  )

  // ——— the turn core: acquire text → LLM → speak ———
  const runTurn = useCallback(
    async (acquire: () => Promise<{ heard: string; send: string }>) => {
      setPhase('thinking')
      try {
        const { heard, send } = await acquire()
        let nextTranscript: VoiceTranscriptEntry[] | null = null
        let reply = ''
        let ended = false
        let nextState = { turns: 0, questions: 0, correct: 0 }
        if (send) {
          setTranscript((t) => [...t, { role: 'student', text: send, at: new Date().toISOString() }])
          const res: VoiceTurnResult = await api.voiceTurn(sessionId, send)
          nextTranscript = res.transcript
          reply = res.reply
          ended = res.ended
          nextState = res.state
        } else {
          reply = "I didn't catch that — say it again a little louder, or type it below."
        }
        if (nextTranscript) setTranscript(nextTranscript)
        setState(nextState)
        await speak(reply, !ended)
      } catch (err) {
        setPhase('idle')
        setNotice(err instanceof Error && err.message.includes('413')
          ? 'That answer was very long — try a shorter one.'
          : 'Something went wrong reaching the tutor. Try again.')
      }
    },
    [sessionId, speak],
  )

  // ——— stop recording → ASR → turn ———
  const finishListening = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || !recorder.active) return
    const captured = recorder.stop()
    recorderRef.current = null
    setLevel(0)
    if (!captured || captured.durationMs < 600) {
      setPhase('idle')
      setNotice('That was too short — hold the orb, speak, then tap again.')
      return
    }
    await runTurn(async () => {
      const heard = await api.voiceAsr(captured.audioBase64)
      if (!heard) return { heard: '', send: '' }
      return { heard, send: heard }
    })
  }, [runTurn])

  const onOrbTap = useCallback(async () => {
    if (phaseRef.current === 'speaking') {
      playerRef.current?.stop() // interrupt — jump straight back to listening
      setPhase('idle')
      if (micOk) await startListening()
      return
    }
    if (phaseRef.current === 'listening') {
      await finishListening()
      return
    }
    if (phaseRef.current === 'idle') {
      if (micOk) await startListening()
    }
  }, [finishListening, micOk, startListening])

  const sendTyped = useCallback(async () => {
    const text = typed.trim()
    if (!text || phaseRef.current === 'thinking' || phaseRef.current === 'speaking') return
    setTyped('')
    recorderRef.current?.cancel()
    recorderRef.current = null
    await runTurn(async () => ({ heard: text, send: text }))
  }, [typed, runTurn])

  const endSession = useCallback(async () => {
    setEnding(true)
    recorderRef.current?.cancel()
    recorderRef.current = null
    playerRef.current?.stop()
    try {
      const debrief = await api.voiceComplete(sessionId)
      onEnd(debrief)
    } catch {
      setNotice('Could not close the session cleanly — check your connection and retry.')
      setEnding(false)
      setConfirmEnd(false)
    }
  }, [sessionId, onEnd])

  // elapsed timer + scroll transcript + cleanup
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [transcript.length])
  useEffect(() => {
    const p = playerRef.current
    const r = recorderRef.current
    return () => {
      r?.cancel()
      p?.stop()
    }
  }, [])
  // opening line speaks on mount (greeting already in transcript)
  const greetedRef = useRef(false)
  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    const last = initialTranscript[initialTranscript.length - 1]
    if (last?.role === 'tutor' && last.text) {
      void speak(last.text, true)
    } else if (micOk) {
      void startListening()
    }
  }, [])

  const modeMeta = MODE_META[modeRef.current]
  const ModeIcon = modeMeta.icon
  const tutorLine = [...transcript].reverse().find((t) => t.role === 'tutor')?.text ?? ''

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      {/* header */}
      <div className="clay flex items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-2.5">
          <span className={cn('flex size-9 items-center justify-center rounded-xl', modeMeta.accent)}>
            <ModeIcon className="size-4.5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">{MODE_LABELS[mode]} session</p>
            <p className="text-xs text-ink-soft">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              {state.questions > 0 && ` · ${state.correct}/${state.questions} correct`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl border-sev-crit/30 text-sev-crit hover:bg-sev-crit/10"
          onClick={() => setConfirmEnd(true)}
          disabled={ending}
        >
          <Square className="size-3.5" aria-hidden />
          End session
        </Button>
      </div>

      {/* orb — the one control that matters */}
      <div className="mt-6 flex flex-col items-center">
        <button
          onClick={onOrbTap}
          aria-label={
            phase === 'speaking'
              ? 'Interrupt and speak'
              : phase === 'listening'
                ? 'Stop and send your answer'
                : 'Tap to speak'
          }
          className={cn(
            'relative flex size-32 items-center justify-center rounded-full text-primary-foreground shadow-xl transition-all duration-300 sm:size-36',
            phase === 'listening' && 'bg-sev-crit shadow-sev-crit/30',
            phase === 'speaking' && 'bg-primary shadow-primary/30',
            phase === 'thinking' && 'bg-sev-warn shadow-sev-warn/30',
            phase === 'idle' && 'bg-sev-ok shadow-sev-ok/30',
          )}
          style={
            phase === 'listening'
              ? { transform: `scale(${1 + level * 0.22})` }
              : undefined
          }
        >
          {phase === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-sev-crit/30" aria-hidden />}
          {phase === 'speaking' && <span className="absolute inset-0 animate-pulse rounded-full bg-primary/25" aria-hidden />}
          {phase === 'listening' ? (
            <Mic className="size-10" aria-hidden />
          ) : phase === 'speaking' ? (
            <Radio className="size-10" aria-hidden />
          ) : phase === 'thinking' ? (
            <span className="size-8 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" aria-hidden />
          ) : (
            <Mic className="size-10" aria-hidden />
          )}
        </button>
        <p className="mt-3 text-sm font-medium text-ink" aria-live="polite">
          {phase === 'listening' && 'Listening — tap the orb when done'}
          {phase === 'speaking' && 'Speaking — tap to interrupt'}
          {phase === 'thinking' && 'Thinking…'}
          {phase === 'idle' && (micOk ? 'Tap to speak' : 'Mic unavailable — type below')}
        </p>
        {notice && <p className="mt-1 max-w-sm text-center text-xs text-sev-warn">{notice}</p>}
        {micError && <p className="mt-1 max-w-sm text-center text-xs text-sev-warn">{micError}</p>}
      </div>

      {/* current tutor line — large, readable, mirrored text */}
      {tutorLine && (
        <div className="clay-in mt-5 rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Tutor is saying</p>
          <p className="mt-1 text-sm leading-relaxed text-ink" aria-live="polite">{tutorLine}</p>
        </div>
      )}

      {/* controls: hands-free + speed */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => setHandsFree((v) => !v)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition',
            handsFree
              ? 'border-sev-ok/40 bg-sev-ok/10 text-sev-ok'
              : 'border-line bg-card text-ink-soft',
          )}
          aria-pressed={handsFree}
        >
          {handsFree ? 'Hands-free: on' : 'Hands-free: off'}
        </button>
        <div className="clay-in flex items-center gap-1 rounded-full px-1.5 py-1" role="group" aria-label="Speaking speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                speed === s ? 'bg-primary text-primary-foreground' : 'text-ink-soft hover:bg-primary/10',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* typed fallback — first-class, never a dead end */}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void sendTyped()
        }}
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type instead — works exactly like speaking…"
          className="clay-field h-11 rounded-xl"
          aria-label="Type your answer"
        />
        <Button type="submit" className="h-11 rounded-xl px-4" disabled={!typed.trim() || phase === 'thinking'}>
          Send
        </Button>
      </form>

      {/* transcript */}
      <div className="clay mt-5 max-h-72 overflow-y-auto rounded-2xl p-4" aria-label="Conversation history">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Conversation</p>
        <div className="mt-2 space-y-2.5">
          {transcript.map((t, i) => (
            <div key={i} className={cn('flex', t.role === 'student' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                  t.role === 'student' ? 'bg-primary/10 text-ink' : 'bg-muted text-ink-soft',
                )}
              >
                <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide opacity-60">
                  {t.role === 'tutor' ? 'Tutor' : 'You'}
                </span>
                {t.text}
              </div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* end confirm */}
      {confirmEnd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="End session confirmation">
          <div className="glass-strong w-full max-w-sm rounded-2xl p-5 shadow-float">
            <p className="text-sm font-bold text-ink">End this voice session?</p>
            <p className="mt-1 text-xs text-ink-soft">
              Your transcript, graded answers and study time are saved and fed to Mistake
              Intelligence and Smart Revision.
            </p>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1 rounded-xl bg-sev-crit hover:bg-sev-crit/90" onClick={() => void endSession()} disabled={ending}>
                {ending ? 'Saving…' : 'End & save'}
              </Button>
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmEnd(false)}>
                Keep talking
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
