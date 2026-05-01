/**
 * Agent Outcomes — WRITE (streaming endpoint)
 *
 * Called by Agent Outcomes Stream Writer workflow AND directly by
 * /api/agents/run on every completion. Fire-and-forget — fast, tolerant of
 * partial data, never throws a 500 to keep upstream pipelines alive.
 *
 * POST body:
 *   {
 *     agent_slug: string,            // required
 *     task_id?: string,
 *     request_id?: string,
 *     client_id?: string,
 *     input?: any,
 *     output?: any,
 *     tokens_used?: number,
 *     input_tokens?: number,
 *     output_tokens?: number,
 *     latency_ms?: number,
 *     success?: boolean (default true),
 *     error?: string,
 *     model?: string,
 *     cost_usd?: number
 *   }
 *
 * Always returns 200 with { ok } — even on DB errors (logged, not thrown).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

interface AgentOutcomeInput {
  agent_slug: string
  task_id?: string | null
  request_id?: string | null
  client_id?: string | null
  input?: unknown
  output?: unknown
  tokens_used?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
  latency_ms?: number | null
  duration_ms?: number | null
  success?: boolean
  error?: string | null
  model?: string | null
  cost_usd?: number | null
  outcome?: 'success' | 'failure' | 'partial' | 'deferred' | null
  metadata?: Record<string, unknown> | null
}

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    // Fire-and-forget endpoint — never throw to upstream
    return NextResponse.json({ ok: false, reason: 'invalid_json' })
  }

  const v = validateObject<AgentOutcomeInput>(raw, 'agent-outcomes-write')
  if (!v.ok) {
    // Don't propagate validation errors to upstream — log silently and 200 OK
    return NextResponse.json({ ok: false, reason: 'validation_error', detail: v.errors })
  }
  const body = v.data

  // Truncate large payloads to keep writes fast.
  // input/output columns are JSONB — coerce plain strings into { text } objects
  // so Postgres JSONB accepts them (raw strings aren't valid JSON).
  const clip = (v: unknown) => {
    if (v == null) return null
    if (typeof v === 'string') {
      const s = v.slice(0, 10000)
      // Try to parse as JSON; if it already was JSON, use that.
      try {
        const parsed = JSON.parse(s)
        return parsed
      } catch {
        // Not JSON — wrap as { text }
        return { text: s }
      }
    }
    if (typeof v === 'object') {
      const s = JSON.stringify(v)
      if (s.length <= 20000) return v
      return { _truncated: true, preview: s.slice(0, 20000) }
    }
    return { value: v }
  }

  const row = {
    agent_slug: String(body.agent_slug).slice(0, 100),
    task_id: body.task_id ? String(body.task_id).slice(0, 200) : null,
    request_id: body.request_id ? String(body.request_id).slice(0, 200) : null,
    client_id: body.client_id ? String(body.client_id).slice(0, 100) : null,
    input: clip(body.input),
    output: clip(body.output),
    tokens_used: toInt(body.tokens_used),
    input_tokens: toInt(body.input_tokens),
    output_tokens: toInt(body.output_tokens),
    latency_ms: toInt(body.latency_ms),
    success: body.success !== false,
    error: body.error ? String(body.error).slice(0, 2000) : null,
    model: body.model ? String(body.model).slice(0, 100) : null,
    cost_usd: typeof body.cost_usd === 'number' ? body.cost_usd : null,
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('agent_outcomes')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      console.error('[agent-outcomes/write] insert error:', error.message, error.details, error.hint)
      return NextResponse.json({ ok: false, reason: 'db_error', detail: error.message, hint: error.hint, code: error.code })
    }

    return NextResponse.json({ ok: true, id: data.id })
  } catch (err) {
    console.error('[agent-outcomes/write] exception:', err)
    return NextResponse.json({ ok: false, reason: 'exception' })
  }
}

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return isFinite(n) ? n : null
  }
  return null
}
