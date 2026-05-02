/**
 * POST /api/metrics/fetch — Creative Performance Learner read-path.
 *
 * Closes W15-D-21. Workflow caller:
 *   `Zero Risk - Creative Performance Learner (Daily 4am)`
 *
 * POST (not GET) because callers send variable-length metric_names + filter
 * objects that wouldn't cleanly fit query params. Reads from
 * `performance_metrics` (graceful fallback to empty array).
 *
 * Auth: tier 2 INTERNAL. Validation: Ajv `metrics-fetch`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface MetricsFetchBody {
  client_id?: string | null
  metric_names: string[]
  since_days?: number | null
  until?: string | null
  platform?: string | null
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

  const v = await validateInput<MetricsFetchBody>(request, 'metrics-fetch')
  if (!v.ok) return v.response
  const body = v.data

  const sinceDays = body.since_days ?? 30
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
  const limit = Math.min(body.limit ?? 200, 1000)

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<unknown[]>(
    () => {
      let q = supabase
        .from('performance_metrics')
        .select('metric_name, value, captured_at, platform, client_id, dimensions')
        .in('metric_name', body.metric_names)
        .gte('captured_at', since)
        .order('captured_at', { ascending: false })
        .limit(limit)
      if (body.client_id) q = q.eq('client_id', body.client_id)
      if (body.platform) q = q.eq('platform', body.platform)
      if (body.until) q = q.lte('captured_at', body.until)
      return q
    },
    { context: '/api/metrics/fetch' },
  )

  const fallbackMode = r.fallback_mode
  const metrics = (r.fallback_mode ? [] : (r.data ?? [])) as unknown[]

  return NextResponse.json({
    ok: true,
    count: metrics.length,
    metrics,
    filter: {
      metric_names: body.metric_names,
      client_id: body.client_id ?? null,
      since_days: sinceDays,
      platform: body.platform ?? null,
    },
    ...(fallbackMode ? { fallback_mode: true } : {}),
  })
}
