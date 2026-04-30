import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireInternalApiKey } from '@/lib/auth-middleware'

// Disable Next.js route handler caching — always fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/hitl/pending
 * Unified view of all pending HITL items across both systems:
 *   System A — pipeline_steps (Pipeline Orchestrator HITL pauses)
 *   System B — hitl_pending_approvals (n8n workflow HITL gates)
 *
 * Bridges GAP #5 (two parallel HITL systems) on the read side:
 * both systems' items appear in a single unified response.
 *
 * Query params:
 *   include_rejected=true — also return rejected System A steps with retry_url
 *   include_system_b=true — include System B items (default: true)
 *   limit=N — max results per system (default 50, max 200)
 */
export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const includeRejected = searchParams.get('include_rejected') === 'true'
  const includeSystemB = searchParams.get('include_system_b') !== 'false' // default true
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

  const supabase = getSupabaseAdmin()

  // ── System A: pipeline_steps ──────────────────────────────────────────────

  let queryA = supabase
    .from('pipeline_steps')
    .select('id, pipeline_id, step_index, step_name, step_display_name, agent_name, output_text, hitl_status, hitl_feedback, created_at')
    .eq('hitl_required', true)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (includeRejected) {
    queryA = queryA.in('hitl_status', ['pending', 'rejected'])
  } else {
    queryA = queryA.eq('hitl_status', 'pending').eq('status', 'paused_hitl')
  }

  const { data: stepRows, error: stepsError } = await queryA
  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 500 })
  }
  const pendingSteps = stepRows || []

  // Enrich System A items with pipeline + client info
  const pipelineIds = Array.from(new Set(pendingSteps.map(s => s.pipeline_id)))
  const [{ data: pipelines }, { data: clients }] = await Promise.all([
    pipelineIds.length > 0
      ? supabase.from('pipeline_executions').select('id, objective, client_id').in('id', pipelineIds)
      : Promise.resolve({ data: [] }),
    Promise.resolve({ data: [] as Array<{ id: string; name: string }> }), // lazy init
  ])

  const clientIdsA = Array.from(new Set((pipelines || []).map(p => p.client_id).filter(Boolean)))
  const { data: clientsA } = clientIdsA.length > 0
    ? await supabase.from('clients').select('id, name').in('id', clientIdsA)
    : { data: [] }

  const pipelineMap = new Map((pipelines || []).map(p => [p.id, p]))
  const clientMapA = new Map((clientsA || []).map(c => [c.id, c]))

  type HitlItem = {
    source: string; step_id: string | null; pipeline_id: string | null
    step_index: number | null; step_name: string | null; agent: string | null
    objective: string; client: string; preview: string
    hitl_status: string; submitted_at: string
    resolve_url: string | null; resolve_body: Record<string, unknown> | null
    retry_url: string | null; retry_body: Record<string, unknown> | null
    [key: string]: unknown
  }

  const systemAItems: HitlItem[] = pendingSteps.map((item) => {
    const pipeline = pipelineMap.get(item.pipeline_id)
    const client = pipeline?.client_id ? clientMapA.get(pipeline.client_id) : null
    const isRejected = item.hitl_status === 'rejected'

    return {
      source: 'pipeline_orchestrator',
      step_id: item.id,
      pipeline_id: item.pipeline_id,
      step_index: item.step_index,
      step_name: item.step_display_name || item.step_name,
      agent: item.agent_name,
      objective: pipeline?.objective || 'Unknown',
      client: client?.name || 'Unknown',
      preview: item.output_text?.substring(0, 500) || 'No preview available',
      hitl_status: item.hitl_status,
      hitl_feedback: isRejected ? (item.hitl_feedback ?? null) : null,
      submitted_at: item.created_at,
      resolve_url: isRejected ? null : `/api/hitl/resolve`,
      resolve_body: isRejected ? null : { step_id: item.id, decision: 'approved|rejected|edited' },
      retry_url: isRejected ? `/api/hitl/retry` : null,
      retry_body: isRejected ? { step_id: item.id } : null,
    }
  })

  // ── System B: hitl_pending_approvals ──────────────────────────────────────

  let systemBItems: HitlItem[] = []

  if (includeSystemB) {
    const { data: approvalRows } = await supabase
      .from('hitl_pending_approvals')
      .select('item_id, approval_type, required_approver, client_id, phase, priority, payload, status, expires_at, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit)

    const bClientIds = Array.from(new Set((approvalRows || []).map(r => r.client_id).filter(Boolean)))
    const { data: clientsB } = bClientIds.length > 0
      ? await supabase.from('clients').select('id, name').in('id', bClientIds)
      : { data: [] }
    const clientMapB = new Map((clientsB || []).map(c => [c.id, c]))

    systemBItems = (approvalRows || []).map((item) => {
      const client = item.client_id ? clientMapB.get(item.client_id) : null
      const payloadPreview = item.payload ? JSON.stringify(item.payload).substring(0, 500) : 'No payload'

      return {
        source: 'n8n_workflow' as const,
        step_id: item.item_id,
        pipeline_id: null,
        step_index: null,
        step_name: item.approval_type || 'generic_approval',
        agent: null,
        objective: item.phase || item.approval_type || 'Unknown',
        client: client?.name || item.client_id || 'Unknown',
        preview: payloadPreview,
        hitl_status: 'pending' as const,
        priority: item.priority,
        expires_at: item.expires_at,
        submitted_at: item.created_at,
        resolve_url: `/api/hitl/submit-approval`,
        resolve_body: { item_id: item.item_id, decision: 'approved|rejected' },
        retry_url: null,
        retry_body: null,
      }
    })
  }

  // ── Merge + return ────────────────────────────────────────────────────────

  const allItems = [...systemAItems, ...systemBItems].sort(
    (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  )

  const pending = allItems.filter(i => i.hitl_status === 'pending')
  const rejected = systemAItems.filter(i => i.hitl_status === 'rejected')

  return NextResponse.json({
    pending_count: pending.length,
    ...(includeRejected && { rejected_count: rejected.length }),
    system_a_count: systemAItems.filter(i => i.hitl_status === 'pending').length,
    ...(includeSystemB && { system_b_count: systemBItems.length }),
    items: includeRejected ? allItems : pending,
  })
}
