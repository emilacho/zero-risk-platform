/**
 * POST /api/storage/upload — stub for Supabase Storage upload.
 *
 * Real impl would download `file_url` and push to `storage.objects` at `path`.
 * For now this records the intent and returns a synthetic stored_url that
 * downstream nodes can use. Echoes the incoming body so `$json.X` keeps flowing.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const bucket: string = body?.bucket || 'assets'
  const path: string = body?.path || `unspecified/${Date.now()}.bin`
  const sourceUrl: string = body?.file_url || body?.url || ''

  // Log the intent; ignore DB errors so the chain keeps going
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('storage_upload_log').insert({
      bucket, path, source_url: sourceUrl,
      metadata: body?.metadata || null,
      ts: new Date().toISOString(),
    })
  } catch {}

  // Synthetic public URL (pretend the upload succeeded)
  const storedUrl = `https://stub.storage.local/${bucket}/${path}`

  // Echo scalar fields for workflow propagation
  const echo: Record<string, unknown> = {}
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) echo[k] = v
  }

  return NextResponse.json({
    ...echo,
    ok: true,
    bucket,
    path,
    stored_url: storedUrl,
    public_url: storedUrl,
    file_url: storedUrl,
    size_bytes: null,
    fallback_mode: true,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/storage/upload',
    method: 'POST',
    body: { bucket: 'string', path: 'string', file_url: 'url', metadata: 'object optional' },
    note: 'Stub — returns synthetic stored_url. Real Supabase Storage upload TODO.',
  })
}
