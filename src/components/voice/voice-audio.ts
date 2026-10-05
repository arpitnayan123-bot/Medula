'use client'

// PRODUCT 11 — MEDICAL VOICE TUTOR · client audio engine
// Two jobs, zero external dependencies:
//   1. voiceRecorder — getUserMedia → 16 kHz mono PCM → WAV → base64.
//      We synthesize the WAV ourselves (never MediaRecorder) so the ASR
//      route always receives a format it accepts regardless of browser
//      codec support (webm/opus is NOT on the ASR contract).
//   2. voicePlayer — one <audio> element, speed-adjustable playback with
//      promise-based completion so the hands-free loop can chain
//      speak → listen → speak without interval guessing.

const TARGET_RATE = 16000
const MAX_SECONDS = 90 // ASR route rejects anything beyond ~3 min; stay tight

export interface VoiceRecorder {
  start: () => Promise<void>
  stop: () => { audioBase64: string; durationMs: number } | null
  cancel: () => void
  readonly active: boolean
}

/** Create a recorder bound to one capture session. `onLevel` fires with a
 *  0..1 amplitude for UI metering. Fails loudly when mic permission is
 *  denied — the caller falls back to typed input. */
export function createVoiceRecorder(onLevel?: (level: number) => void): VoiceRecorder {
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let processor: ScriptProcessorNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let chunks: Float32Array[] = []
  let totalSamples = 0
  let startedAt = 0
  let running = false

  async function start(): Promise<void> {
    if (running) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone is not available in this browser')
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    ctx = new AudioContext({ sampleRate: TARGET_RATE })
    source = ctx.createMediaStreamSource(stream)
    processor = ctx.createScriptProcessor(4096, 1, 1)
    chunks = []
    totalSamples = 0
    startedAt = Date.now()
    running = true

    processor.onaudioprocess = (e) => {
      if (!running) return
      const input = e.inputBuffer.getChannelData(0)
      chunks.push(new Float32Array(input))
      totalSamples += input.length
      if (onLevel) {
        let peak = 0
        for (let i = 0; i < input.length; i += 8) {
          const a = Math.abs(input[i])
          if (a > peak) peak = a
        }
        onLevel(Math.min(1, peak))
      }
      // hard safety stop — auto-finalize by zeroing further accumulation
      if (totalSamples > TARGET_RATE * MAX_SECONDS) running = false
    }
    source.connect(processor)
    // ScriptProcessor needs a destination to pump; muted gain keeps it silent
    const silent = ctx.createGain()
    silent.gain.value = 0
    processor.connect(silent)
    silent.connect(ctx.destination)
  }

  function teardown() {
    try {
      processor?.disconnect()
      source?.disconnect()
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
    } catch {
      /* already torn down */
    }
    processor = null
    source = null
    stream = null
    ctx = null
  }

  function stop(): { audioBase64: string; durationMs: number } | null {
    if (!running || !ctx) {
      teardown()
      return null
    }
    running = false
    const nativeRate = ctx.sampleRate
    const durationMs = Math.max(0, Date.now() - startedAt)
    const merged = mergeChunks(chunks, totalSamples)
    teardown()
    if (!merged.length) return null

    const resampled = nativeRate === TARGET_RATE ? merged : resample(merged, nativeRate, TARGET_RATE)
    const wav = encodeWav(resampled, TARGET_RATE)
    return { audioBase64: toBase64(wav), durationMs }
  }

  function cancel() {
    running = false
    teardown()
    chunks = []
    totalSamples = 0
  }

  return {
    start,
    stop,
    cancel,
    get active() {
      return running
    },
  }
}

function mergeChunks(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** Linear-interpolation resample (fallback when the browser ignores the
 *  requested 16 kHz context rate). Good enough for speech → ASR. */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || fromRate <= 0) return input
  const ratio = fromRate / toRate
  const outLength = Math.floor(input.length / ratio)
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = pos - i0
    out[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return out
}

/** 16-bit PCM WAV encoder (mono). */
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Uint8Array(buffer)
}

/** Chunked base64 (avoids RangeError on large recordings). */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// ── Playback ──────────────────────────────────────────────────────────────

export interface VoicePlayback {
  /** Plays the blob; resolves 'ended' when finished, 'stopped' when interrupted. */
  play: (blob: Blob, speed: number) => Promise<'ended' | 'stopped'>
  stop: () => void
  readonly playing: boolean
}

export function createVoicePlayer(): VoicePlayback {
  let audio: HTMLAudioElement | null = null
  let url: string | null = null
  let playing = false
  let stopRequested = false

  async function play(blob: Blob, speed: number): Promise<'ended' | 'stopped'> {
    stopRequested = false
    cleanup()
    url = URL.createObjectURL(blob)
    audio = new Audio(url)
    audio.playbackRate = Math.max(0.5, Math.min(2, speed))
    audio.preservesPitch = true
    playing = true
    try {
      await audio.play()
    } catch {
      // autoplay policy — surface as stopped; the UI always mirrors text
      cleanup()
      return 'stopped'
    }
    return new Promise((resolve) => {
      const done = (result: 'ended' | 'stopped') => {
        audio?.removeEventListener('ended', onEnded)
        audio?.removeEventListener('error', onError)
        playing = false
        cleanup()
        resolve(result)
      }
      const onEnded = () => done('ended')
      const onError = () => done('stopped')
      audio?.addEventListener('ended', onEnded, { once: true })
      audio?.addEventListener('error', onError, { once: true })
      // poll for an interrupt requested before listeners attached
      const iv = setInterval(() => {
        if (stopRequested) {
          clearInterval(iv)
          audio?.pause()
          done('stopped')
        }
      }, 100)
      audio?.addEventListener('ended', () => clearInterval(iv), { once: true })
    })
  }

  function cleanup() {
    if (url) URL.revokeObjectURL(url)
    url = null
    audio = null
  }

  function stop() {
    stopRequested = true
    try {
      audio?.pause()
    } catch {
      /* not playing */
    }
  }

  return {
    play,
    stop,
    get playing() {
      return playing
    },
  }
}

/** Capability probe — drives the client-side micSupported override. */
export function micSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof (window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) ===
      'function'
  )
}
