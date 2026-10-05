import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/voice/asr — student speech → text.
// The client records 16 kHz mono 16-bit PCM WAV (see voice-audio.ts) and
// posts it as base64 JSON. No audio is persisted — the transcript only.

const MAX_BASE64 = 8 * 1024 * 1024 // ~6 MB raw audio ≈ 3 minutes of 16 kHz mono

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { audioBase64?: string }
    const audioBase64 = (body.audioBase64 ?? '').trim()
    if (!audioBase64) {
      return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 })
    }
    if (audioBase64.length > MAX_BASE64) {
      return NextResponse.json({ error: 'Recording too long — keep answers under ~90 seconds' }, { status: 413 })
    }

    const zai = await ZAI.create()
    const response = await zai.audio.asr.create({ file_base64: audioBase64 })
    const text = (response?.text ?? '').trim()

    return NextResponse.json({ ok: true, text })
  } catch (err) {
    console.error('voice/asr error:', err)
    return NextResponse.json({ error: 'Speech recognition failed' }, { status: 500 })
  }
}
