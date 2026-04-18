/**
 * Client Brain — GET by client_id
 *
 * Simple context fetch for RUFLO Smart Router and other workflows that need
 * a lightweight client context without calling the full query_client_brain
 * semantic search tool.
 *
 * GET /api/client-brain/{client_id}?sections=client_brand_books,client_icp_documents
 *
 * Returns merged context document per requested section, plus guardrails.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getClientGuardrails } from '@/lib/client-brain'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const KNOWN_SECTION_TABLES: Record<string, { table: string; select: string }> = {
  client_brand_books: { table: 'client_brand_books', select: 'brand_voice, brand_values, brand_personality, visual_identity, messaging_pillars, target_audience' },
  client_icp_documents: { table: 'client_icp_documents', select: 'icp_name, demographics, psychographics, pain_points, buying_triggers, objections' },
  client_voc_library: { table: 'client_voc_library', select: 'quote, sentiment, source, theme, created_at' },
  client_competitive_landscape: { table: 'client_competitive_landscape', select: 'competitor_name, positioning, strengths, weaknesses, market_share' },
  client_historical_outputs: { table: 'client_historical_outputs', select: 'content_type, performance_metrics, produced_at' },
  client_service_capabilities: { table: 'client_service_capabilities', select: 'capability, enabled, notes' },
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ client_id: string }> }
) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const { client_id } = await params
  if (!client_id) {
    return NextResponse.json({ error: 'missing_client_id' }, { status: 400 })
  }

  const sectionsParam = request.nextUrl.searchParams.get('sections') || ''
  const requestedSections = sectionsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const supabase = getSupabaseAdmin()
  const result: Record<string, unknown> = { client_id }

  // Fetch guardrails if requested or no sections specified
  if (requestedSections.length === 0 || requestedSections.includes('guardrails')) {
    try {
      const guardrails = await getClientGuardrails(client_id)
      result.guardrails = guardrails
    } catch (e) {
      result.guardrails = null
    }
  }

  // Fetch each requested section
  const sectionsToFetch =
    requestedSections.length > 0 ? requestedSections : Object.keys(KNOWN_SECTION_TABLES)

  await Promise.all(
    sectionsToFetch.map(async (section) => {
      const cfg = KNOWN_SECTION_TABLES[section]
      if (!cfg) {
        result[section] = { error: 'unknown_section' }
        return
      }
      const { data, error } = await supabase
        .from(cfg.table)
        .select(cfg.select)
        .eq('client_id', client_id)
        .limit(20)

      if (error) {
        result[section] = { error: error.message }
      } else {
        result[section] = data || []
      }
    })
  )

  return NextResponse.json(result)
}
