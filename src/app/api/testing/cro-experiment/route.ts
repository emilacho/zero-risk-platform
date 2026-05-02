/**
 * POST /api/testing/cro-experiment — register a CRO A/B experiment.
 *
 * Closes W15-D-29. Workflow caller:
 *   `Zero Risk - Landing Page CRO Optimizer v2 (Sun 7am)`
 *
 * Persists the experiment definition (variants + hypothesis + primary metric).
 * Downstream: the validator + results endpoints (D-30/D-31) reference back to
 * the row's id. Graceful fallback if the table doesn't exist yet.
 *
 * Auth: tier 2 INTERNAL.
 * Validation: Ajv schema `testing-cro-experiment`.
 * Persistence: `cro_experiments` table.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface CroExperimentBody {
  client_id: string
  experiment_name: string
  hypothesis: string
  variants: Array<{ name: string; url: string; traffic_allocation?: number | null }>
  primary_metric?: string | null
  min_sample_size?: number | null
  confidence_level?: number | null
  starts_at?: string | null
  expected_duration_days?: number | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<CroExperimentBody>(request, 'testing-cro-experiment')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    client_id: body.client_id,
    experiment_name: body.experiment_name,
    hypothesis: body.hypothesis,
    variants: body.variants,
    primary_metric: body.primary_metric ?? 'conversion_rate',
    min_sample_size: body.min_sample_size ?? 1000,
    confidence_level: body.confidence_level ?? 0.95,
    starts_at: body.starts_at || new Date().toISOString(),
    expected_duration_days: body.expected_duration_days ?? 14,
    status: 'queued',
    created_at: new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<{ id: string }>(
    () => supabase.from('cro_experiments').insert(row).select('id').single(),
    { context: '/api/testing/cro-experiment' },
  )
  if (r.fallback_mode) {
    return NextResponse.json({ ok: true, fallback_mode: true, persisted_id: null, note: r.reason })
  }
  return NextResponse.json({ ok: true, persisted_id: r.data?.id, status: 'queued' })
}
