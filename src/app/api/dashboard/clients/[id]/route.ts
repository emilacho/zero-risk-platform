/**
 * GET /api/dashboard/clients/[id]
 *
 * Dashboard surface · per-cliente detail · full client row + agents that
 * worked on this cliente (rolled-up sessions + spend per agent) + Storage
 * file listing under `client-websites/<slug>/` + journey timeline. Read-only.
 *
 * The [id] route param is the client UUID.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ClientRow {
  id: string
  name: string | null
  slug: string | null
  website_url: string | null
  domain: string | null
  industry: string | null
  market: string | null
  country: string | null
  language: string | null
  preferred_language: string | null
  status: string | null
  brand_voice: string | null
  config: Record<string, unknown> | null
  logo_url: string | null
  brand_colors: unknown
  brand_fonts: unknown
  created_at: string | null
  updated_at: string | null
}

interface InvocationRow {
  id: string
  agent_id: string | null
  agent_name: string | null
  model: string | null
  cost_usd: number | null
  tokens_input: number | null
  tokens_output: number | null
  started_at: string | null
  ended_at: string | null
  status: string | null
  metadata: Record<string, unknown> | null
}

interface JourneyRow {
  id: string
  journey: string | null
  current_stage: string | null
  status: string | null
  trigger_type: string | null
  trigger_source: string | null
  hitl_pending_count: number | null
  hitl_resolved_count: number | null
  outcome: string | null
  error_count: number | null
  last_error: string | null
  started_at: string | null
  updated_at: string | null
  completed_at: string | null
}

interface StorageObject {
  name: string
  id: string | null
  updated_at: string | null
  created_at: string | null
  last_accessed_at: string | null
  metadata: Record<string, unknown> | null
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id required', code: 'E-DASHBOARD-CLIENT-DETAIL-ID' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (clientErr) {
      return NextResponse.json(
        { ok: false, error: clientErr.message, code: 'E-DASHBOARD-CLIENT-DETAIL-READ' },
        { status: 500 },
      )
    }
    if (!client) {
      return NextResponse.json(
        { ok: false, error: `client not found · id=${id}`, code: 'E-DASHBOARD-CLIENT-DETAIL-NOTFOUND' },
        { status: 404 },
      )
    }
    const c = client as ClientRow

    const { data: invocations } = await supabase
      .from('agent_invocations')
      .select(
        'id, agent_id, agent_name, model, cost_usd, tokens_input, tokens_output, started_at, ended_at, status, metadata',
      )
      .eq('client_id', id)
      .order('started_at', { ascending: false })
      .limit(200)

    const agentsTouched = new Map<string, { agent_id: string; sessions: number; cost_usd: number; last_at: string | null }>()
    for (const row of (invocations ?? []) as InvocationRow[]) {
      if (!row.agent_id) continue
      const a =
        agentsTouched.get(row.agent_id) ??
        { agent_id: row.agent_id, sessions: 0, cost_usd: 0, last_at: null }
      a.sessions += 1
      a.cost_usd += Number(row.cost_usd ?? 0)
      if (row.started_at && (!a.last_at || row.started_at > a.last_at)) a.last_at = row.started_at
      agentsTouched.set(row.agent_id, a)
    }
    const agentsWorked = Array.from(agentsTouched.values())
      .map(a => ({ ...a, cost_usd: Number(a.cost_usd.toFixed(6)) }))
      .sort((a, b) => b.sessions - a.sessions)

    const { data: journeys } = await supabase
      .from('client_journey_state')
      .select(
        'id, journey, current_stage, status, trigger_type, trigger_source, hitl_pending_count, hitl_resolved_count, outcome, error_count, last_error, started_at, updated_at, completed_at',
      )
      .eq('client_id', id)
      .order('started_at', { ascending: false })
      .limit(20)

    let files: StorageObject[] = []
    if (c.slug) {
      const { data: list } = await supabase.storage.from('client-websites').list(c.slug, {
        limit: 100,
        sortBy: { column: 'updated_at', order: 'desc' },
      })
      if (Array.isArray(list)) files = list as StorageObject[]
    }

    return NextResponse.json({
      ok: true,
      client: c,
      agents_worked: agentsWorked,
      invocations_recent: ((invocations ?? []) as InvocationRow[]).slice(0, 50),
      invocations_count: invocations?.length ?? 0,
      journeys: (journeys ?? []) as JourneyRow[],
      files,
      files_bucket: 'client-websites',
      files_prefix: c.slug ?? null,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
