/**
 * POST /api/outcomes/record — wrapper over /api/agent-outcomes/write.
 * Kept as a separate route because some workflows call this exact path.
 */

import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
    table: 'agent_outcomes',
    // transform the workflow body shape to the agent_outcomes row shape
    transform: (r) => ({
      agent_name: r.agent_slug || r.agent_name || 'unknown',
      task_type: r.task_type || 'unknown',
      task_input: r.task_input || r.input_text || '',
      output_summary: r.output_summary || r.output_text || r.output || '',
      cost_usd: typeof r.cost_usd === 'number' ? r.cost_usd : 0,
      duration_ms: r.duration_ms ?? r.latency_ms ?? 0,
      success: r.success !== false,
      final_verdict: r.final_verdict || (r.success !== false ? 'approved' : 'rejected'),
      processed_by_meta_agent: false,
      client_id: r.client_id || null,
      request_id: r.request_id || null,
      error: r.error || null,
    }),
  })
}
