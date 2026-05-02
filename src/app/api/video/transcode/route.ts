/**
 * POST /api/video/transcode — stub for FFmpeg transcode orchestrator.
 *
 * Real impl would spawn a Railway worker that runs ffmpeg with the per-platform
 * specs and returns signed URLs for each export. Stub echoes `exports` and
 * returns a synthetic `export_urls` map so downstream Record/Slack nodes succeed.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'lenient-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  const taskId: string = body?.task_id || `video_${Date.now()}`
  const inputUrl: string = body?.input_url || ''
  type ExportSpec = { platform?: string; aspect_ratio?: string; resolution?: string; bitrate?: string; fps?: number }
  const exportsList: ExportSpec[] = Array.isArray(body?.exports) ? body.exports : []

  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('video_transcode_log').insert({
      task_id: taskId, input_url: inputUrl,
      exports: exportsList, ts: new Date().toISOString(),
    })
  } catch {}

  // Synthetic per-platform URLs
  const exportUrls: Record<string, string> = {}
  for (const exp of exportsList) {
    const platform = exp.platform || 'default'
    exportUrls[platform] = `https://stub.storage.local/video_assets/${taskId}/${platform}.mp4`
  }
  if (!Object.keys(exportUrls).length) {
    exportUrls.default = `https://stub.storage.local/video_assets/${taskId}/default.mp4`
  }

  const echo: Record<string, unknown> = {}
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) echo[k] = v
  }

  return NextResponse.json({
    ...echo,
    ok: true,
    task_id: taskId,
    export_urls: exportUrls,
    exports_completed: Object.keys(exportUrls).length,
    status: 'completed',
    fallback_mode: true,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/video/transcode',
    method: 'POST',
    body: { task_id: 'string', input_url: 'url', exports: 'array of platform specs', add_subtitles: 'bool', subtitle_vtt: 'string' },
    note: 'Stub — returns synthetic export_urls map. Real FFmpeg worker TODO.',
  })
}
