/**
 * POST /api/voc/ingest · Sprint-brain §144 · Task 2
 *
 * Ingesta de Voice-of-Customer (feedback + testimonios) al cerebro del cliente.
 * Doble escritura · client_voc_library (estructurada · idempotente por dedup_hash)
 * + client_brain_chunks (RAG · embed 1536d + provenance_tag evidence/tenant_trusted).
 *
 * Body · { client_id, entries: VocEntryInput[] }
 * Auth · x-api-key (INTERNAL_API_KEY · canon agentes-solo-via-workflows).
 *
 * Graceful · nunca lanza · 200 con resumen por-entrada (o 400/401/502 en error duro).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ingestVocEntries, type VocEntryInput } from '@/lib/brain/voc-ingest'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Body {
  client_id?: string
  entries?: VocEntryInput[]
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let raw: unknown = {}
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }

  const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Body
  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : ''
  const entries = Array.isArray(body.entries) ? body.entries : []

  if (!clientId) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-VOC-MISSING-CLIENT', detail: 'client_id required' },
      { status: 400 },
    )
  }
  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'validation_error', code: 'E-VOC-NO-ENTRIES', detail: 'entries[] required · non-empty' },
      { status: 400 },
    )
  }

  const result = await ingestVocEntries(getSupabaseAdmin(), { clientId, entries })

  // Hard failure (nothing landed) → 502 · partial/full success → 200.
  if (!result.ok && result.entries_ingested === 0) {
    return NextResponse.json(result, { status: 502 })
  }
  return NextResponse.json(result, { status: 200 })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/voc/ingest',
    method: 'POST',
    body: {
      client_id: 'uuid (required)',
      entries: '[{ quote_text, source, source_url?, customer_name?, customer_segment?, sentiment?, category?, themes?, quote_date?, trust_level? }]',
    },
    note: 'Doble escritura · client_voc_library + client_brain_chunks (RAG · provenance evidence/tenant_trusted)',
  })
}
