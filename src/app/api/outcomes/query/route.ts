/**
 * POST /api/outcomes/query — query past agent outcomes.
 *
 * Closes W15-D-24. Workflow caller:
 *   `Zero Risk — Creative Performance Learner (Daily 4AM UTC)`
 *
 * Sister to /api/agent-outcomes/write (POST · already exists). The Learner
 * cron POSTs filter criteria here and gets back a paginated outcome list to
 * mine for "what worked vs didn't" patterns. Reads agent_outcomes table with
 * graceful fallback when the table is missing or empty.
 *
 * Why POST not GET? The filter shape is rich enough (tags array, JSON-shaped
 * since/until, optional client_id) that it doesn't fit cleanly in a query
 * string. Mirrors the established `/api/agent-outcomes/write` POST pattern.
 *
 * Body (Ajv schema: outcomes-query · all fields optional):
 *   {
 *     client_id?, agent_slug?, outcome_type?,
 *     since_days?, until?, limit? (1..500), offset?,
 *     campaign_id?, min_confidence? (0..1), tags?: string[]
 *   }
 *
 * Response (200):
 *   {
 *     ok: true,
 *     count: number,
 *     limit: number,
 *     offset: number,
 *     rows: AgentOutcome[],
 *     fallback_mode?: true
 *   }
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { validateObject } from '@/lib/input-validator'
import { withSupabaseResult } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface QueryFilter {
  client_id?: string | null
  agent_slug?: string | null
  outcome_type?: 'success' | 'failure' | 'partial' | 'deferred' | null
  since_days?: number | null
  until?: string | null
  limit?: number | null
  offset?: number | null
  campaign_id?: string | null
  min_confidence?: number | null
  tags?: string[]
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }

  const v = validateObject<QueryFilter>(raw, 'outcomes-query')
  if (!v.ok) return v.response
  const filter = v.data

  const limit = Math.min(500, Math.max(1, filter.limit ?? 50))
  const offset = Math.max(0, filter.offset ?? 0)
  const sinceDays = filter.since_days ?? 30

  const supabase = getSupabaseAdmin()
  const r = await withSupabaseResult<Array<Record<string, unknown>>>(
    () => {
      let q = supabase
        .from('agent_outcomes')
        .select('id, agent_slug, task_id, request_id, client_id, outcome, tokens_used, latency_ms, success, model, cost_usd, created_at, metadata')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (filter.client_id) q = q.eq('client_id', filter.client_id)
      if (filter.agent_slug) q = q.eq('agent_slug', filter.agent_slug)
      if (filter.outcome_type) q = q.eq('outcome', filter.outcome_type)
      if (filter.campaign_id) q = q.eq('metadata->>campaign_id', filter.campaign_id)
      if (sinceDays) {
        const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
        q = q.gte('created_at', since)
      }
      if (filter.until) q = q.lte('created_at', filter.until)
      return q
    },
    { context: '/api/outcomes/query' },
  )

  const fallbackMode = r.fallback_mode
  const rows: Array<Record<string, unknown>> = r.fallback_mode ? [] : (r.data ?? [])

  return NextResponse.json({
    ok: true,
    count: rows.length,
    limit,
    offset,
    rows,
    ...(fallbackMode ? { fallback_mode: true } : {}),
  })
}
