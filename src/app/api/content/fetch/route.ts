/**
 * POST /api/content/fetch — Stub for Content Repurposing workflow.
 * Writes query to content_fetch_cache + returns a mock pillar content payload.
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
  const { client_id, pillar_id } = body
  if (!client_id) return NextResponse.json({ error: 'missing_field', field: 'client_id' }, { status: 400 })

  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('content_fetch_cache').insert({
      client_id,
      pillar_id: pillar_id || null,
      content: { request: body, ts: new Date().toISOString() },
    })
  } catch {}

  // Echo any non-consumed input fields so downstream nodes can still read $json.X
  const { client_id: _c, pillar_id: _p, ...rest } = body
  return NextResponse.json({
    ...rest,
    ok: true,
    client_id,
    pillar_id: pillar_id || 'mock-pillar',
    content: {
      title: 'Stub pillar content',
      body: 'This is a stub response. Real content fetch pending.',
      word_count: 10,
    },
    fallback_mode: true,
  })
}

export async function GET() {
  return NextResponse.json({ endpoint: '/api/content/fetch', method: 'POST', body: { client_id: 'required', pillar_id: 'string' } })
}
