/**
 * Agent Routing Log
 *
 * Called by RUFLO Smart Router to log every classification decision
 * for post-hoc analysis + Meta-Agent learning signal.
 *
 * POST body:
 *   {
 *     request_id: string,
 *     client_id?: string,
 *     original_request: string,
 *     classification_type: "depth-first" | "breadth-first" | "straightforward",
 *     assigned_agents: string[] | object[],
 *     complexity?: "low" | "medium" | "high" | "critical",
 *     confidence?: number (0-1)
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { validateObject } from '@/lib/input-validator'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

const VALID_CLASSIFICATIONS = new Set(['depth-first', 'breadth-first', 'straightforward'])
const VALID_COMPLEXITY = new Set(['low', 'medium', 'high', 'critical'])

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const raw = await request.json().catch(() => null)
  if (!raw) {
    return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }
  const v = validateObject<Record<string, unknown>>(raw, 'agent-routing-log')
  if (!v.ok) return v.response
  const body = v.data as Record<string, any>

  // Defense-in-depth: schema also enforces, but keep runtime check for clarity.
  if (!VALID_CLASSIFICATIONS.has(body.classification_type)) {
    return NextResponse.json({ error: 'invalid_classification', got: body.classification_type }, { status: 400 })
  }

  const row: Record<string, unknown> = {
    request_id: body.request_id,
    client_id: body.client_id || null,
    original_request: String(body.original_request).slice(0, 5000),
    classification_type: body.classification_type,
    assigned_agents: Array.isArray(body.assigned_agents) ? body.assigned_agents : [],
    complexity: VALID_COMPLEXITY.has(body.complexity) ? body.complexity : null,
    confidence: typeof body.confidence === 'number' ? Math.max(0, Math.min(1, body.confidence)) : null,
    status: 'routed',
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('agent_routing_log')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[agent-routing/log] insert error:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id, routed_at: data.routed_at })
}
