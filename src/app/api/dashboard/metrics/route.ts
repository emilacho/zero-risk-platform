/**
 * GET /api/dashboard/metrics
 *
 * Dashboard surface · global KPIs · agents/clients/spend/workflows totals
 * con 30-day windowed counters. Read-only.
 *
 * Distinto del /api/dashboard root (campaign-centric) · este es
 * agent/cliente-centric · ambos coexisten sin colisión.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface InvocationCostRow {
  cost_usd: number | null
  started_at: string | null
}

interface ImageGenRow {
  cost_usd: number | null
  created_at: string | null
}

async function fetchWorkflowCount(): Promise<number | null> {
  const n8nUrl = process.env.N8N_BASE_URL
  const n8nKey = process.env.N8N_API_KEY
  if (!n8nUrl || !n8nKey) return null
  try {
    const res = await fetch(`${n8nUrl.replace(/\/+$/, '')}/api/v1/workflows?limit=250`, {
      headers: { 'X-N8N-API-KEY': n8nKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: unknown[] }
    return Array.isArray(json.data) ? json.data.length : null
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: agentsTotal },
      { count: agentsActive },
      { count: clientsTotal },
      { data: invsAll },
      { data: invs30d },
      { data: imgs30d },
      workflowsCount,
    ] = await Promise.all([
      supabase.from('agents').select('id', { count: 'exact', head: true }),
      supabase
        .from('agents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      // Sprint 6 cleanup · clients_total now counts non-archived only
      // (archived_at IS NULL). Matches dashboard "Active clients" KPI.
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null),
      supabase
        .from('agent_invocations')
        .select('cost_usd, started_at')
        .limit(50_000),
      supabase
        .from('agent_invocations')
        .select('cost_usd, started_at')
        .gte('started_at', since30)
        .limit(50_000),
      supabase
        .from('agent_image_generations')
        .select('cost_usd, created_at')
        .gte('created_at', since30)
        .limit(10_000),
      fetchWorkflowCount(),
    ])

    const sum = (rows: { cost_usd: number | null }[]) =>
      rows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0)

    const totalSpend = sum((invsAll ?? []) as InvocationCostRow[])
    const spend30d = sum((invs30d ?? []) as InvocationCostRow[])
    const imageSpend30d = sum((imgs30d ?? []) as ImageGenRow[])

    return NextResponse.json({
      ok: true,
      totals: {
        agents_total: agentsTotal ?? 0,
        agents_active: agentsActive ?? 0,
        clients_total: clientsTotal ?? 0,
        invocations_total: invsAll?.length ?? 0,
        invocations_30d: invs30d?.length ?? 0,
        images_generated_30d: imgs30d?.length ?? 0,
        spend_usd_total: Number(totalSpend.toFixed(6)),
        spend_usd_30d: Number(spend30d.toFixed(6)),
        image_spend_usd_30d: Number(imageSpend30d.toFixed(6)),
        workflows_n8n: workflowsCount, // null si n8n API no responde
      },
      sources: {
        agents: 'agents table',
        clients: 'clients table',
        invocations: 'agent_invocations table',
        images: 'agent_image_generations table',
        workflows: workflowsCount === null ? 'n8n API unavailable' : 'n8n API live',
      },
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
