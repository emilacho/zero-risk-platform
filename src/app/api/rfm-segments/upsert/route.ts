/**
 * POST /api/rfm-segments/upsert — RFM Segmentation Nightly write-path.
 *
 * Closes W15-D-25. Workflow caller:
 *   `Zero Risk - RFM Segmentation Nightly (Daily 2am)`
 *
 * Idempotent on (client_id, contact_id): nightly re-runs overwrite the row
 * so segment transitions are tracked via previous_segment field. Graceful
 * fallback if table missing.
 *
 * Auth: tier 2 INTERNAL. Validation: Ajv `rfm-segments-upsert`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RfmSegmentBody {
  client_id: string
  contact_id: string
  segment: string
  recency_days?: number | null
  frequency_30d?: number | null
  monetary_lifetime_usd?: number | null
  rfm_score?: string | null
  computed_at?: string | null
  previous_segment?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<RfmSegmentBody>(request, 'rfm-segments-upsert')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    client_id: body.client_id,
    contact_id: body.contact_id,
    segment: body.segment,
    recency_days: body.recency_days ?? null,
    frequency_30d: body.frequency_30d ?? null,
    monetary_lifetime_usd: body.monetary_lifetime_usd ?? null,
    rfm_score: body.rfm_score ?? null,
    previous_segment: body.previous_segment ?? null,
    computed_at: body.computed_at || new Date().toISOString(),
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('rfm_segments')
      .upsert(row, { onConflict: 'client_id,contact_id' })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({
        ok: true,
        fallback_mode: true,
        persisted_id: null,
        note: `DB write failed gracefully: ${error.message.slice(0, 200)}`,
      })
    }

    return NextResponse.json({ ok: true, persisted_id: data?.id })
  } catch (err) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      persisted_id: null,
      note: `DB exception: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
    })
  }
}
