/**
 * POST /api/client-brain/rag-search
 *
 * Real pgvector similarity search over `client_brain_chunks` via the canonical
 * `queryClientBrain` (OpenAI 1536d embedding + 3-arg RPC `query_client_brain`).
 *
 * Sprint-brain §144 A1 · was a stub that always returned `snippets: []`.
 * Now returns real snippets. On any failure it degrades gracefully to
 * `fallback_mode: true` (empty snippets) so downstream n8n chains never break.
 * The observability log to `client_brain_snapshots` is preserved.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'
import { queryClientBrain, type BrainSection } from '@/lib/client-brain'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'lenient-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  const { client_id, query, snapshot_type, sections, k = 5 } = body

  if (!client_id) return NextResponse.json({ error: 'missing_field', field: 'client_id' }, { status: 400 })

  const matchCount = typeof k === 'number' && k > 0 ? Math.min(k, 50) : 5

  // Echo all input body fields so downstream n8n nodes can still read
  // $json.X for any field the workflow originally sent. Keeps the chain intact.
  const { client_id: _c, query: _q, snapshot_type: _s, sections: _sec, k: _k, ...rest } = body

  // Real RAG search · degrade gracefully on any failure.
  let snippets: Array<{
    source_table: string
    source_id: string
    label: string
    content_text: string
    similarity: number
  }> = []
  let fallbackMode = false
  let errorNote: string | undefined

  if (typeof query === 'string' && query.trim().length > 0) {
    try {
      const results = await queryClientBrain({
        client_id,
        query,
        sections: Array.isArray(sections) ? (sections as BrainSection[]) : undefined,
        match_count: matchCount,
      })
      snippets = results
    } catch (err) {
      fallbackMode = true
      errorNote = err instanceof Error ? err.message : 'unknown_error'
    }
  } else {
    fallbackMode = true
    errorNote = 'missing_or_empty_query'
  }

  // Log the query for observability (best-effort · never blocks the response).
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('client_brain_snapshots').insert({
      client_id,
      snapshot_type: 'rag_query_log',
      content: {
        query,
        snapshot_type,
        k: matchCount,
        source_count: snippets.length,
        fallback_mode: fallbackMode,
        ts: new Date().toISOString(),
      },
    })
  } catch {}

  return NextResponse.json({
    ...rest,                      // echoed original body fields
    ok: true,
    client_id,
    query,
    snippets,
    source_count: snippets.length,
    fallback_mode: fallbackMode,
    ...(errorNote ? { note: `fallback · ${errorNote}` } : {}),
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/client-brain/rag-search',
    method: 'POST',
    body: { client_id: 'required', query: 'string', sections: 'optional string[]', k: 'number default 5' },
    note: 'Real pgvector search over client_brain_chunks · degrades to fallback_mode on failure',
  })
}
