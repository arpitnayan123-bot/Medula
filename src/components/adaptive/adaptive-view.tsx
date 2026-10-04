'use client'

// ─── ADAPTIVE ENGINE · ROOT (PRODUCT 04) ───
// Small state machine: home → run → report. Owns session lifecycle
// (start / resume / complete), the preset hand-off channel from other
// surfaces (adaptivePreset in the store), and zero-overflow layout.

import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { ADAPTIVE_MODES } from '@/lib/types'
import type { AdaptiveConfig, AdaptiveMode, AdaptiveReport, AdaptiveSessionStart } from '@/lib/types'
import { AdaptiveHome } from './adaptive-home'
import type { ResumeMeta } from './adaptive-home'
import { AdaptiveRun } from './adaptive-run'
import type { RunExtras } from './adaptive-run'
import { AdaptiveReportView } from './adaptive-report'

type Phase = 'home' | 'run' | 'report'

interface RunMeta {
  startIndex: number
  totalOverride?: number
  resumed: boolean
}

const DEFAULT_COUNTS: Record<AdaptiveMode, number> = {
  'ai-adaptive': 15, adaptive: 15, weakness: 12, pyq: 12,
  rapid: 15, clinical: 8, image: 8, exam: 20, custom: 10,
}

export function AdaptiveView() {
  const adaptivePreset = useAppStore((s) => s.adaptivePreset)
  const setAdaptivePreset = useAppStore((s) => s.setAdaptivePreset)

  const [phase, setPhase] = useState<Phase>('home')
  const [session, setSession] = useState<AdaptiveSessionStart | null>(null)
  const [runMeta, setRunMeta] = useState<RunMeta>({ startIndex: 0, resumed: false })
  const [report, setReport] = useState<AdaptiveReport | null>(null)
  const [markedIds, setMarkedIds] = useState<string[]>([])
  const [homeRefreshKey, setHomeRefreshKey] = useState(0)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  // Start a fresh session from a frozen config
  const start = useCallback(async (config: AdaptiveConfig) => {
    setStarting(true)
    setStartError(null)
    try {
      const res = await api.startAdaptiveSession({ config })
      setSession(res)
      setRunMeta({ startIndex: 0, resumed: false })
      setReport(null)
      setPhase('run') // the run screen renders an honest empty state if the queue is empty
    } catch {
      setStartError("The engine couldn't start this run — the backend may still be warming up. Try again in a moment.")
    } finally {
      setStarting(false)
    }
  }, [])

  // Rebuild a run mid-session: ask the engine for the next question and
  // reconstruct a session shell around it (answered count drives progress).
  const resume = useCallback(async (sessionId: string, meta: ResumeMeta) => {
    setStarting(true)
    setStartError(null)
    try {
      const nxt = await api.nextAdaptive({ sessionId })
      if (!nxt.question) {
        setStartError('This run has nothing left to answer — start a fresh one below.')
        setHomeRefreshKey((k) => k + 1)
        return
      }
      const label = ADAPTIVE_MODES.find((m) => m.id === meta.mode)?.label ?? 'Adaptive'
      const sessionStart: AdaptiveSessionStart = {
        sessionId,
        mode: meta.mode,
        label: `${label} · ${meta.total || 'resumed'} questions`,
        blurb: 'Resumed run — the engine kept your plan',
        questions: [nxt.question],
        timed: meta.mode === 'rapid' || meta.mode === 'exam',
        secondsPerQuestion: meta.mode === 'rapid' ? 45 : undefined,
        // Resumed exam: the client never stored the remaining budget, so the
        // clock restarts on the standard 1 min/question estimate — honest,
        // clearly a fresh clock, still exam-paced.
        totalSeconds: meta.mode === 'exam' ? Math.max(60, (meta.total || 20) * 60) : undefined,
      }
      setSession(sessionStart)
      setRunMeta({ startIndex: meta.answered, totalOverride: meta.total > 0 ? meta.total : undefined, resumed: true })
      setReport(null)
      setPhase('run')
    } catch {
      setStartError("Couldn't rebuild that run — the engine may have expired it. Start a fresh run instead.")
    } finally {
      setStarting(false)
    }
  }, [])

  // Preset hand-offs (Topic Hub, Progress, cross-links): the moment a preset
  // arrives, start that session and clear the channel.
  useEffect(() => {
    const preset = useAppStore.getState().adaptivePreset
    if (!preset) return
    setAdaptivePreset(null)
    if (preset.autoStart === false) {
      setHomeRefreshKey((k) => k + 1)
      return
    }
    const mode: AdaptiveMode = preset.mode ?? 'ai-adaptive'
    void start({
      mode,
      count: preset.count ?? DEFAULT_COUNTS[mode],
      subjectCode: preset.subjectCode,
      topicId: preset.topicId,
      conceptId: preset.conceptId,
    })
  }, [adaptivePreset, start, setAdaptivePreset])

  // Quit mid-run: NO complete call — the session stays incomplete and the
  // home payload will offer it back via the resume banner.
  const quitToHome = useCallback(() => {
    setPhase('home')
    setSession(null)
    setRunMeta({ startIndex: 0, resumed: false })
    setHomeRefreshKey((k) => k + 1)
  }, [])

  const backHomeFromReport = useCallback(() => {
    setPhase('home')
    setReport(null)
    setSession(null)
    setMarkedIds([])
    setHomeRefreshKey((k) => k + 1)
  }, [])

  const handleComplete = useCallback((rep: AdaptiveReport, extras: RunExtras) => {
    setReport(rep)
    setMarkedIds(extras.markedIds)
    setPhase('report')
  }, [])

  return (
    <div className="min-h-[60vh]">
      {phase === 'home' && (
        <AdaptiveHome
          onStart={start}
          onResume={resume}
          refreshKey={homeRefreshKey}
          starting={starting}
          startError={startError}
        />
      )}
      {phase === 'run' && session && (
        <AdaptiveRun
          key={`${session.sessionId}:${runMeta.startIndex}`}
          session={session}
          startIndex={runMeta.startIndex}
          totalOverride={runMeta.totalOverride}
          onComplete={handleComplete}
          onQuit={quitToHome}
          onDrillPyq={(conceptId) => void start({ mode: 'pyq', conceptId, count: 12 })}
        />
      )}
      {phase === 'report' && report && (
        <AdaptiveReportView report={report} markedIds={markedIds} onStart={start} onHome={backHomeFromReport} />
      )}
    </div>
  )
}
