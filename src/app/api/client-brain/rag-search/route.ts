/**
 * POST /api/client-brain/rag-search
 *
 * Stub: logs the query and returns an empty snippets array so downstream
 * workflows can proceed. Real implementation will do pgvector similarity
 * search against client_brand_books + client_voc_library + etc.
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
  const { client_id, query, snapshot_type, k = 5 } = body

  if (!client_id) return NextResponse.json({ error: 'missing_field', field: 'client_id' }, { status: 400 })

  // Log the query for observability
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('client_brain_snapshots').insert({
      client_id,
      snapshot_type: 'rag_query_log',
      content: { query, snapshot_type, k, ts: new Date().toISOString() },
    })
  } catch {}

  // Echo all input body fields so downstream n8n nodes can still read
  // $json.X for any field the workflow originally sent. Keeps the chain intact.
  const { client_id: _c, query: _q, snapshot_type: _s, k: _k, ...rest } = body
  return NextResponse.json({
    ...rest,                      // echoed original body fields
    ok: true,
    client_id,
    query,
    snippets: [],                 // real pgvector search TODO
    source_count: 0,
    fallback_mode: true,
    note: 'Stub: returning empty snippets. Real RAG implementation pending.',
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/client-brain/rag-search',
    method: 'POST',
    body: { client_id: 'required', query: 'string', snapshot_type: 'optional', k: 'number default 5' },
    note: 'Stub implementation — returns empty snippets + fallback_mode: true',
  })
}
