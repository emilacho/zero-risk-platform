/**
 * POST /api/stubs/whisper
 *
 * Drop-in replacement for OpenAI Whisper's `/audio/transcriptions` endpoint
 * during smoke tests. Accepts multipart/form-data (real Whisper spec) OR JSON,
 * returns a synthetic VTT response so downstream nodes get valid subtitle text.
 *
 * Rewrite n8n HTTP Request to hit this URL via:
 *   {{ $env.WHISPER_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/whisper' }}
 */

import { NextResponse } from 'next/server'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STUB_VTT = `WEBVTT

00:00:00.000 --> 00:00:03.000
[Stub subtitle] smoke test frame 1

00:00:03.000 --> 00:00:06.000
[Stub subtitle] smoke test frame 2

00:00:06.000 --> 00:00:09.000
[Stub subtitle] smoke test frame 3
`

export async function POST(request: Request) {
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  // Accept form, JSON, or empty — return the same synthetic VTT either way
  let responseFormat = 'vtt'
  if (contentType.includes('multipart/form-data')) {
    try {
      const form = await request.formData()
      responseFormat = (form.get('response_format') as string) || 'vtt'
    } catch {}
  } else if (contentType.includes('application/json')) {
    try {
      let _raw: unknown
  try {
    _raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }
  const _v = validateObject<Record<string, unknown>>(_raw, 'stub-row')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
      responseFormat = body?.response_format || 'vtt'
    } catch {}
  }

  if (responseFormat === 'json' || responseFormat === 'verbose_json') {
    return NextResponse.json({
      text: '[Stub] smoke test transcript',
      segments: [
        { id: 0, start: 0, end: 3, text: '[Stub subtitle] smoke test frame 1' },
        { id: 1, start: 3, end: 6, text: '[Stub subtitle] smoke test frame 2' },
      ],
      language: 'en',
      content: STUB_VTT,
      fallback_mode: true,
    })
  }

  // For vtt/srt/text, return JSON with `content` field so n8n's `$json.content`
  // usage in the workflow keeps working (matches how the workflow reads it).
  return NextResponse.json({
    ok: true,
    content: STUB_VTT,
    text: '[Stub] smoke test transcript',
    language: 'en',
    format: responseFormat,
    fallback_mode: true,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/stubs/whisper',
    method: 'POST',
    body: 'multipart/form-data with file + model + response_format',
    note: 'Drop-in stub for OpenAI Whisper. Override via env WHISPER_API_URL.',
  })
}
