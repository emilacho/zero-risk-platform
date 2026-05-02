/**
 * GET /api/cost-usage — multi-service cost timeseries.
 *
 * Closes W15-D-09. Workflow caller:
 *   `Zero Risk - Cost Watchdog Multi-Service v2 (hourly)`
 *
 * Returns per-service spend bucketed by `granularity` (hour | day) over the
 * last `hours` window. Reads `cost_events` (preferred) — falls back to a
 * deterministic stub keyed off the bucket timestamp so the watchdog cron
 * remains testable when the table hasn't been backfilled yet.
 *
 * Auth: tier 2 INTERNAL.
 * Persistence: read-only over `cost_events`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface CostRow {
  service: string | null
  cost_usd: number | null
  occurred_at: string | null
}

type Granularity = 'hour' | 'day'

interface Bucket {
  bucket: string
  service: string
  cost_usd: number
}

function bucketKey(iso: string, gran: Granularity): string {
  // hour: YYYY-MM-DDTHH:00:00Z, day: YYYY-MM-DD
  if (gran === 'day') return iso.slice(0, 10)
  return iso.slice(0, 13) + ':00:00Z'
}

const KNOWN_SERVICES = ['anthropic', 'openai', 'apify', 'higgsfield', 'mailgun', 'ghl', 'supabase', 'vercel']

function deterministicStubBuckets(hours: number, gran: Granularity): Bucket[] {
  const bucketCount = gran === 'hour' ? hours : Math.max(1, Math.ceil(hours / 24))
  const stepMs = gran === 'hour' ? 3_600_000 : 86_400_000
  const now = Date.now()
  const out: Bucket[] = []
  for (let i = bucketCount - 1; i >= 0; i--) {
    const ts = new Date(now - i * stepMs).toISOString()
    const bucket = bucketKey(ts, gran)
    for (const service of KNOWN_SERVICES) {
      // Stable hash of (bucket+service) for reproducible mock cost
      let h = 0
      const s = bucket + service
      for (let j = 0; j < s.length; j++) h = (h * 31 + s.charCodeAt(j)) | 0
      const cost = Number((((Math.abs(h) % 5000) / 100) * (gran === 'day' ? 24 : 1)).toFixed(4))
      out.push({ bucket, service, cost_usd: cost })
    }
  }
  return out
}

function aggregate(rows: CostRow[], gran: Granularity): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const row of rows) {
    if (!row.occurred_at || !row.service) continue
    const bucket = bucketKey(row.occurred_at, gran)
    const key = `${bucket}::${row.service}`
    if (!map.has(key)) map.set(key, { bucket, service: row.service, cost_usd: 0 })
    map.get(key)!.cost_usd += typeof row.cost_usd === 'number' ? row.cost_usd : 0
  }
  return Array.from(map.values())
    .map(b => ({ ...b, cost_usd: Number(b.cost_usd.toFixed(4)) }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : a.service.localeCompare(b.service)))
}

function totalsByService(buckets: Bucket[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of buckets) out[b.service] = Number(((out[b.service] ?? 0) + b.cost_usd).toFixed(4))
  return out
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const u = new URL(request.url)
  const rawHours = parseInt(u.searchParams.get('hours') || '24', 10)
  const hours = Number.isFinite(rawHours) ? Math.min(Math.max(rawHours, 1), 720) : 24
  const granularity: Granularity = u.searchParams.get('granularity') === 'day' ? 'day' : 'hour'
  const service = u.searchParams.get('service') || undefined
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<CostRow[]>(
    () => {
      let q = supabase
        .from('cost_events')
        .select('service,cost_usd,occurred_at')
        .gte('occurred_at', since)
        .limit(50000)
      if (service) q = q.eq('service', service)
      return q
    },
    { context: '/api/cost-usage' },
  )

  if (r.fallback_mode) {
    let buckets = deterministicStubBuckets(hours, granularity)
    if (service) buckets = buckets.filter(b => b.service === service)
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      hours,
      granularity,
      buckets,
      totals_usd: totalsByService(buckets),
      grand_total_usd: Number(buckets.reduce((s, b) => s + b.cost_usd, 0).toFixed(4)),
      note: r.reason ?? 'cost_events query failed · stub served',
    })
  }

  const rows = r.data ?? []
  if (rows.length === 0) {
    let buckets = deterministicStubBuckets(hours, granularity)
    if (service) buckets = buckets.filter(b => b.service === service)
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      hours,
      granularity,
      buckets,
      totals_usd: totalsByService(buckets),
      grand_total_usd: Number(buckets.reduce((s, b) => s + b.cost_usd, 0).toFixed(4)),
      note: 'cost_events empty for window · deterministic stub served',
    })
  }

  const buckets = aggregate(rows, granularity)
  return NextResponse.json({
    ok: true,
    hours,
    granularity,
    filters: { service: service ?? null },
    buckets,
    totals_usd: totalsByService(buckets),
    grand_total_usd: Number(buckets.reduce((s, b) => s + b.cost_usd, 0).toFixed(4)),
  })
}
