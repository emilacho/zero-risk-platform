/**
 * /api/error-events
 *  POST → insert (from Sentry Alert Router)
 *  GET  → check recent duplicates (fingerprint + 24h window)
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

  const raw = await request.json().catch(() => ({}))
  const v = validateObject<Record<string, unknown>>(raw, 'error-events-create')
  if (!v.ok) return v.response
  const body = v.data as Record<string, unknown>

  const row = {
    fingerprint: (body.fingerprint as string) || null,
    source: (body.source as string) || 'sentry',
    severity: (body.severity as string) || 'P2',
    title: (body.title as string) || null,
    environment: (body.environment as string) || null,
    url: (body.url as string) || null,
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
