/**
 * POST /api/testing/fetch-test-results — query recent test results.
 *
 * Closes W15-D-30. Workflow caller:
 *   `Zero Risk - Incrementality Test Runner (15min + Webhook)`
 *
 * Returns recent rows from `test_results` (CRO + incrementality + others)
 * matching the filter. POST instead of GET so multi-field filters compose
 * cleanly. Defaults: since_hours=24, limit=50, max=500.
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

interface FetchResultsBody {
  client_id?: string | null
  experiment_id?: string | null
  test_type?: 'cro' | 'incrementality' | 'subject_line' | 'creative' | null
  status?: 'running' | 'completed' | 'stopped' | 'queued' | null
  since_hours?: number | null
  limit?: number | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<FetchResultsBody>(request, 'testing-fetch-test-results')
  if (!v.ok) return v.response
  const body = v.data

  const sinceHours = body.since_hours ?? 24
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const limit = Math.min(body.limit ?? 50, 500)

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<unknown[]>(
    () => {
      let q = supabase
        .from('test_results')
        .select('id, experiment_id, test_type, status, client_id, p_value, lift_pct, sample_size, captured_at')
        .gte('captured_at', since)
        .order('captured_at', { ascending: false })
        .limit(limit)
      if (body.client_id) q = q.eq('client_id', body.client_id)
      if (body.experiment_id) q = q.eq('experiment_id', body.experiment_id)
      if (body.test_type) q = q.eq('test_type', body.test_type)
      if (body.status) q = q.eq('status', body.status)
      return q as unknown as Promise<{ data: unknown[] | null; error: { message: string } | null }>
    },
    { context: '/api/testing/fetch-test-results' },
  )

  const results = (r.data as unknown[]) ?? []
  return NextResponse.json({
    ok: true,
    count: results.length,
    results,
    filter: {
      client_id: body.client_id ?? null,
      experiment_id: body.experiment_id ?? null,
      test_type: body.test_type ?? null,
      status: body.status ?? null,
      since_hours: sinceHours,
    },
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
