/**
 * POST /api/testing/incrementality-results — persist incrementality result row.
 *
 * Closes W15-D-31. Workflow caller:
 *   `Zero Risk - Incrementality Test Runner (15min + Webhook)`
 *
 * Each cron tick, the runner computes lift / p-value for any active
 * experiments and posts the result here. Persisted to `incrementality_results`.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface IncResultBody {
  experiment_id: string
  client_id?: string | null
  test_type: 'incrementality' | 'geo_holdout' | 'ghost_ad' | 'PSA'
  p_value: number
  lift_pct?: number | null
  incremental_conversions?: number | null
  incremental_revenue_usd?: number | null
  sample_size?: number | null
  control_group_size?: number | null
  treatment_group_size?: number | null
  confidence_interval?: [number, number] | null
  captured_at?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<IncResultBody>(request, 'testing-incrementality-results')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    experiment_id: body.experiment_id,
    client_id: body.client_id ?? null,
    test_type: body.test_type,
    p_value: body.p_value,
    lift_pct: body.lift_pct ?? null,
    incremental_conversions: body.incremental_conversions ?? null,
    incremental_revenue_usd: body.incremental_revenue_usd ?? null,
    sample_size: body.sample_size ?? null,
    control_group_size: body.control_group_size ?? null,
    treatment_group_size: body.treatment_group_size ?? null,
    confidence_interval: body.confidence_interval ?? null,
    significant: body.p_value < 0.05,
    captured_at: body.captured_at || new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<{ id: string }>(
    () => supabase.from('incrementality_results').insert(row).select('id').single(),
    { context: '/api/testing/incrementality-results' },
  )
  if (r.fallback_mode) {
    return NextResponse.json({ ok: true, fallback_mode: true, persisted_id: null, note: r.reason })
  }
  return NextResponse.json({ ok: true, persisted_id: r.data?.id, significant: row.significant })
}
