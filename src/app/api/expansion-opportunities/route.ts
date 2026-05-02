/**
 * POST /api/expansion-opportunities — Expansion Readiness Scanner write-path.
 *
 * Closes W15-D-10. Workflow caller:
 *   `Zero Risk - Expansion Readiness Scanner (Friday 2pm)`
 *
 * Sibling of GET /api/ghl/expansion-intent (read). This is the write-path
 * that records each scored opportunity for downstream QBR / CSM consumption.
 *
 * Auth: tier 2 INTERNAL. Validation: Ajv `expansion-opportunities`. Persists
 * to `expansion_opportunities` (graceful fallback if table missing).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ExpansionOpportunityBody {
  client_id: string
  opportunity_type: 'upsell' | 'cross_sell' | 'renewal_extension' | 'seat_expansion' | 'feature_unlock' | 'service_addon'
  score: number
  estimated_value_usd?: number | null
  confidence?: number | null
  evidence?: string[] | null
  next_action?: string | null
  owner_role?: string | null
  expires_at?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<ExpansionOpportunityBody>(request, 'expansion-opportunities')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    client_id: body.client_id,
    opportunity_type: body.opportunity_type,
    score: body.score,
    estimated_value_usd: body.estimated_value_usd ?? null,
    confidence: body.confidence ?? null,
    evidence: body.evidence ?? [],
    next_action: body.next_action ?? null,
    owner_role: body.owner_role ?? null,
    expires_at: body.expires_at ?? null,
    detected_at: new Date().toISOString(),
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('expansion_opportunities')
      .insert(row)
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
