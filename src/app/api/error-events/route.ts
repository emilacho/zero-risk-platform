/**
 * /api/error-events
 *  POST → insert (from Sentry Alert Router)
 *  GET  → check recent duplicates (fingerprint + 24h window)
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
  const row = {
    fingerprint: body.fingerprint || null,
    source: body.source || 'sentry',
    severity: body.severity || 'P2',
    title: body.title || null,
    environment: body.environment || null,
    url: body.url || null,
    data: body,
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('error_events').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const url = new URL(request.url)
  const fingerprint = url.searchParams.get('fingerprint')
  const hours = parseInt(url.searchParams.get('hours') || '24', 10)

  const supabase = getSupabaseAdmin()
  let q = supabase.from('error_events').select('id, fingerprint, severity, created_at').order('created_at', { ascending: false }).limit(50)
  if (fingerprint) q = q.eq('fingerprint', fingerprint)
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  q = q.gte('created_at', since)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, rows: data || [], count: data?.length ?? 0, is_duplicate: (data?.length ?? 0) > 0 })
}
