/**
 * GET /api/dashboard/agents/[slug]
 *
 * Dashboard surface · per-agent detail · identity meta + recent
 * invocations + files produced (agent_image_generations) + 30-day daily
 * activity timeline. Read-only.
 *
 * The [slug] route param can be either canonical hyphenated form
 * (`brand-strategist`) or underscored form (`brand_strategist`) — agents
 * table is queried for both because the data has historical naming drift
 * (see agent-alias-map.ts:17).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface InvocationRow {
  id: string
  session_id: string | null
  agent_id: string | null
  agent_name: string | null
  client_id: string | null
  model: string | null
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  cost_usd: number | null
  tokens_input: number | null
  tokens_output: number | null
  status: string | null
  metadata: Record<string, unknown> | null
}

interface ImageGenRow {
  id: string
  client_id: string | null
  agent_slug: string | null
  prompt: string | null
  storage_path: string | null
  image_url: string | null
  size: string | null
  cost_usd: number | null
  status: string | null
  created_at: string | null
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    if (!slug) {
      return NextResponse.json(
        { ok: false, error: 'slug required', code: 'E-DASHBOARD-AGENT-DETAIL-SLUG' },
        { status: 400 },
      )
    }

    const variants = Array.from(new Set([slug, slug.replace(/-/g, '_'), slug.replace(/_/g, '-')]))
    const supabase = getSupabaseAdmin()

    const { data: agentRows, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, display_name, role, model, status, identity_content, identity_source, created_at, updated_at')
      .in('name', variants)
      .limit(1)
    if (agentErr) {
      return NextResponse.json(
        { ok: false, error: agentErr.message, code: 'E-DASHBOARD-AGENT-DETAIL-READ' },
        { status: 500 },
      )
    }
    const agent = agentRows?.[0]
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: `agent not found · slug=${slug}`, code: 'E-DASHBOARD-AGENT-DETAIL-NOTFOUND' },
        { status: 404 },
      )
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: invocations } = await supabase
      .from('agent_invocations')
      .select(
        'id, session_id, agent_id, agent_name, client_id, model, started_at, ended_at, duration_ms, cost_usd, tokens_input, tokens_output, status, metadata',
      )
      .in('agent_id', variants)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(100)

    const { data: images } = await supabase
      .from('agent_image_generations')
      .select('id, client_id, agent_slug, prompt, storage_path, image_url, size, cost_usd, status, created_at')
      .in('agent_slug', variants)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    const timeline = new Map<string, { date: string; sessions: number; cost_usd: number }>()
    for (const row of (invocations ?? []) as InvocationRow[]) {
      if (!row.started_at) continue
      const date = row.started_at.slice(0, 10)
      const slot = timeline.get(date) ?? { date, sessions: 0, cost_usd: 0 }
      slot.sessions += 1
      slot.cost_usd += Number(row.cost_usd ?? 0)
      timeline.set(date, slot)
    }
    const timelineArr = Array.from(timeline.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ date: d.date, sessions: d.sessions, cost_usd: Number(d.cost_usd.toFixed(6)) }))

    return NextResponse.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        display_name: agent.display_name,
        role: agent.role,
        model: agent.model,
        status: agent.status,
        identity_chars: agent.identity_content?.length ?? 0,
        identity_source: agent.identity_source,
        created_at: agent.created_at,
        updated_at: agent.updated_at,
      },
      invocations: (invocations ?? []) as InvocationRow[],
      files_produced: (images ?? []) as ImageGenRow[],
      timeline_30d: timelineArr,
      window_days: 30,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
