/**
 * /api/seo-engagements/[id]/deliverables
 *  POST → persist playbook + agent outputs (called by "Persist Deliverables" node)
 *  GET  → list deliverables for an engagement
 *
 * POST body shape (from the Flagship SEO workflow):
 *   { playbook: {...}, agent_outputs: {...}, raw_data: {...} }
 *
 * We split the payload into one row per deliverable kind for queryability,
 * then bump engagement status → 'awaiting_review'.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveEngagementId(rawId: string) {
  const supabase = getSupabaseAdmin()
  const col = UUID_RE.test(rawId) ? 'id' : 'task_id'
  const { data } = await supabase.from('seo_engagements').select('id').eq(col, rawId).maybeSingle()
  return data?.id ?? null
}

export async function POST(request: Request, ctx: { params: { id: string } }) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const engagementId = await resolveEngagementId(ctx.params.id)
  if (!engagementId) return NextResponse.json({ error: 'engagement not_found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const playbook = body.playbook ?? null
  const agentOutputs = body.agent_outputs ?? {}
  const rawData = body.raw_data ?? null

  const rows: Array<Record<string, unknown>> = []

  if (playbook) {
    rows.push({ engagement_id: engagementId, kind: 'orchestrator_synthesis', title: 'Opus 90-day playbook', content: playbook, status: 'draft' })
    if (playbook.exec_summary) rows.push({ engagement_id: engagementId, kind: 'executive_summary', title: 'Executive Summary', content: playbook.exec_summary, status: 'draft' })
    if (playbook.calendar_12w) rows.push({ engagement_id: engagementId, kind: 'content_calendar', title: '12-week calendar', content: playbook.calendar_12w, status: 'draft' })
    if (playbook.kpi_dashboard) rows.push({ engagement_id: engagementId, kind: 'kpi_dashboard', title: 'KPI dashboard spec', content: playbook.kpi_dashboard, status: 'draft' })
    if (playbook.risks) rows.push({ engagement_id: engagementId, kind: 'risk_register', title: 'Risk register', content: playbook.risks, status: 'draft' })
  }

  // Per-agent breakouts
  const subOutputs: Record<string, string> = {
    content_strategy: 'pillar',
    technical_seo: 'tech_fix',
    geo_optimization: 'llms_txt',
    backlink_strategy: 'backlink_prospects',
    competitive_intelligence: 'raw_agent_output',
  }
  for (const [agentKey, kind] of Object.entries(subOutputs)) {
    const out = agentOutputs?.[agentKey]
    if (!out) continue
    rows.push({ engagement_id: engagementId, kind, title: `Agent: ${agentKey}`, content: out, status: 'draft' })
  }

  const supabase = getSupabaseAdmin()
  let inserted = 0
  if (rows.length > 0) {
    const { data, error } = await supabase.from('seo_deliverables').insert(rows).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = data?.length ?? 0
  }

  await supabase
    .from('seo_engagements')
    .update({
      status: 'awaiting_review',
      playbook,
      agent_outputs: agentOutputs,
      raw_data: rawData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', engagementId)

  return NextResponse.json({ ok: true, engagement_id: engagementId, deliverables_inserted: inserted })
}

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const engagementId = await resolveEngagementId(ctx.params.id)
  if (!engagementId) return NextResponse.json({ error: 'engagement not_found' }, { status: 404 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('seo_deliverables')
    .select('*')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deliverables: data ?? [] })
}
