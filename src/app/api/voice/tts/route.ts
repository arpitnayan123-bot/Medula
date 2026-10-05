import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/voice/tts — text → spoken audio (audio/wav).
// TTS input is capped at 1024 chars/request, so longer replies are split on
// sentence boundaries and the WAV payloads are merged server-side into ONE
// buffer — the client plays a single <audio> element with no gap stitching.
// Speed is applied client-side via playbackRate (instant, no re-synthesis);
// the optional `speed` param (0.5–2.0) re-synthesizes when a natural pitch-
// shifted voice is preferred.

const MAX_CHARS = 6000 // hard cap — voice turns are short by contract
const CHUNK_LIMIT = 950

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { text?: string; speed?: number }
    // Defensive speakable() pass: the voice contract forbids markdown, but a
    // stray symbol must never be read aloud by TTS ("asterisk asterisk…").
    const text = (body.text ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[*_#>`|~•·]/g, ' ')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
    if (text.length > MAX_CHARS) {
      return NextResponse.json({ error: `text too long (${text.length} > ${MAX_CHARS})` }, { status: 413 })
    }
    const speed =
      typeof body.speed === 'number' && body.speed >= 0.5 && body.speed <= 2.0 ? body.speed : undefined

    const zai = await ZAI.create()
    const chunks = splitForTts(text)
    const buffers: Buffer[] = []
    for (const chunk of chunks) {
      const response = await zai.audio.tts.create({
        input: chunk,
        voice: 'tongtong',
        response_format: 'wav',
        stream: false,
        ...(speed !== undefined ? { speed } : {}),
      })
      const arrayBuffer = await response.arrayBuffer()
      const buf = Buffer.from(new Uint8Array(arrayBuffer))
      if (buf.length > 44) buffers.push(buf)
    }
    if (!buffers.length) {
      return NextResponse.json({ error: 'empty speech synthesis' }, { status: 502 })
    }
    const merged = buffers.length === 1 ? buffers[0] : mergeWav(buffers)
    return new NextResponse(new Uint8Array(merged), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(merged.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('voice/tts error:', err)
    return NextResponse.json({ error: 'Speech synthesis failed' }, { status: 500 })
  }
}

/** Sentence-boundary split for TTS: never break mid-sentence, never exceed
 *  the API's per-request character limit. */
export function splitForTts(text: string, limit = CHUNK_LIMIT): string[] {
  if (text.length <= limit) return [text]
  const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]?\s*|[^.!?…]+$/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const s of sentences) {
    const piece = s.trim()
    if (!piece) continue
    // A single over-long sentence is hard-split (rare — voice turns are short)
    if (piece.length > limit) {
      if (current) {
        chunks.push(current.trim())
        current = ''
      }
      for (let i = 0; i < piece.length; i += limit) chunks.push(piece.slice(i, i + limit))
      continue
    }
    if ((current + ' ' + piece).trim().length > limit) {
      if (current) chunks.push(current.trim())
      current = piece
    } else {
      current = (current + ' ' + piece).trim()
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : [text]
}

/** Merge standard PCM WAV buffers that share the format of the first one.
 *  Walks each RIFF chunk table to find `data` (never assumes a 44-byte
 *  header) and rebuilds one clean header around the concatenated PCM. */
export function mergeWav(buffers: Buffer[]): Buffer {
  const first = buffers[0]
  const fmt = readWavFormat(first)
  // Fallback: if the first buffer is not parseable, just concatenate raw.
  if (!fmt) return Buffer.concat(buffers)

  const pcmParts: Buffer[] = []
  for (const buf of buffers) {
    const data = readWavData(buf)
    pcmParts.push(data ?? (buf.length > 44 ? buf.subarray(44) : Buffer.alloc(0)))
  }
  const pcm = Buffer.concat(pcmParts)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // PCM fmt chunk size
  header.writeUInt16LE(1, 20) // audio format = PCM
  header.writeUInt16LE(fmt.channels, 22)
  header.writeUInt32LE(fmt.sampleRate, 24)
  header.writeUInt32LE(fmt.sampleRate * fmt.channels * fmt.bitsPerSample / 8, 28) // byte rate
  header.writeUInt16LE(fmt.channels * fmt.bitsPerSample / 8, 32) // block align
  header.writeUInt16LE(fmt.bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function readWavFormat(buf: Buffer): { sampleRate: number; channels: number; bitsPerSample: number } | null {
  try {
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
    let offset = 12
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4)
      const size = buf.readUInt32LE(offset + 4)
      if (id === 'fmt ') {
        return {
          channels: buf.readUInt16LE(offset + 10),
          sampleRate: buf.readUInt32LE(offset + 12),
          bitsPerSample: buf.readUInt16LE(offset + 22),
        }
      }
      offset += 8 + size + (size % 2)
    }
    return null
  } catch {
    return null
  }
}

function readWavData(buf: Buffer): Buffer | null {
  try {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
    let offset = 12
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4)
      const size = buf.readUInt32LE(offset + 4)
      if (id === 'data') {
        const end = Math.min(offset + 8 + size, buf.length)
        return buf.subarray(offset + 8, end)
      }
      offset += 8 + size + (size % 2)
    }
    return null
  } catch {
    return null
  }
}
