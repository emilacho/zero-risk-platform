/**
 * POST /api/stubs/higgsfield/generate
 *
 * Drop-in replacement for Higgsfield Seedance 2.0 (`api.higgsfield.ai/v1/generate`)
 * during smoke tests and pre-prod. Returns a synthetic video_url + matching the
 * real API's response shape so downstream workflow nodes don't change.
 *
 * Rewrite the n8n workflow node to hit this URL via:
 *   {{ $env.HIGGSFIELD_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/higgsfield/generate' }}
 *
 * When real Higgsfield is wired, point HIGGSFIELD_API_URL to the real endpoint
 * and this stub is bypassed. No workflow changes needed.
 */

import { NextResponse } from 'next/server'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const prompt: string = body?.prompt || ''
  const duration = Number(body?.duration) || 15
  const aspectRatio: string = body?.aspect_ratio || '9:16'
  const style: string = body?.style || 'dynamic'
  const quality: string = body?.quality || '720p'

  const taskId = `seedance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const videoUrl = `https://stub.higgsfield.local/videos/${taskId}.mp4`

  // Mirror the real Seedance response shape (based on public docs):
  // { status, job_id, video_url, duration, aspect_ratio, resolution, ... }
  return NextResponse.json({
    ok: true,
    status: 'completed',
    job_id: taskId,
    task_id: taskId,
    video_url: videoUrl,
    thumbnail_url: videoUrl.replace('.mp4', '_thumb.jpg'),
    duration,
    duration_s: duration,
    aspect_ratio: aspectRatio,
    resolution: aspectRatio === '16:9' ? '1920x1080' : '1080x1920',
    style,
    quality,
    model: 'seedance-2.0',
    prompt_echo: prompt.slice(0, 200),
    cost_usd: 0,
    fallback_mode: true,
  })
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    endpoint: '/api/stubs/higgsfield/generate',
    method: 'POST',
    body: { prompt: 'string', duration: 'number', aspect_ratio: 'string', style: 'string', quality: 'string' },
    note: 'Drop-in stub for Higgsfield Seedance 2.0. Override via env HIGGSFIELD_API_URL.',
  })
}
