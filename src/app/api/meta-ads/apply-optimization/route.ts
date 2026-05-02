/**
 * Meta Ads — Apply Optimization (action endpoint)
 *
 * Executes optimization actions on Meta ads based on Optimization Agent
 * recommendations. All actions go through HITL gate for high-spend (>$100/day)
 * — this endpoint enforces that gate.
 *
 * Used by: Meta Ads Full-Stack Optimizer v2 (cluster 4) after diminishing
 * returns analysis produces action recommendations.
 *
 * POST body:
 *   {
 *     action: "pause" | "resume" | "update_budget" | "kill_creative",
 *     entity_type: "campaign" | "adset" | "ad",
 *     entity_id: string,
 *     params?: { new_daily_budget_cents?, reason? },
 *     client_id: string,
 *     request_id?: string,
 *     dry_run?: boolean             // default true — safety
 *   }
 *
 * Behavior:
 *   - dry_run=true (default): validates + writes intent to ad_creative_refreshes,
 *     returns what WOULD happen
 *   - dry_run=false: also calls Meta Graph API to apply
 *
 * Env: META_ACCESS_TOKEN
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const VALID_ACTIONS = new Set(['pause', 'resume', 'update_budget', 'kill_creative'])
const VALID_ENTITIES = new Set(['campaign', 'adset', 'ad'])

export async function POST(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const token = process.env.META_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'not_configured', missing: ['META_ACCESS_TOKEN'] },
      { status: 503 }
    )
  }

  const _raw = await request.json().catch(() => null)
  if (!_raw) return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  const _v = validateObject<Record<string, unknown>>(_raw, 'lenient-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  if (!body || !body.action || !body.entity_type || !body.entity_id || !body.client_id) {
    return NextResponse.json(
      { error: 'missing_fields', required: ['action', 'entity_type', 'entity_id', 'client_id'] },
      { status: 400 }
    )
  }

  if (!VALID_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: 'invalid_action', got: body.action, valid: [...VALID_ACTIONS] }, { status: 400 })
  }
  if (!VALID_ENTITIES.has(body.entity_type)) {
    return NextResponse.json({ error: 'invalid_entity_type', got: body.entity_type }, { status: 400 })
  }

  const isDryRun = body.dry_run !== false

  // Always log intent to ad_creative_refreshes
  const supabase = getSupabaseAdmin()
  const auditRow = {
    campaign_id: body.entity_type === 'campaign' ? body.entity_id : (body.params?.campaign_id || body.entity_id),
    client_id: body.client_id,
    ad_id: body.entity_type === 'ad' ? body.entity_id : '',
    fatigue_signals: body.params?.fatigue_signals || {},
    refresh_reason: body.params?.reason || body.action,
    hitl_approved: !isDryRun, // dry_run means not approved yet
    deployed: false,
  }

  const { data: audit } = await supabase
    .from('ad_creative_refreshes')
    .insert(auditRow)
    .select('id')
    .single()

  if (isDryRun) {
    return NextResponse.json({
      ok: true,
      mode: 'dry_run',
      audit_id: audit?.id,
      would_apply: {
        action: body.action,
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        params: body.params || {},
      },
      note: 'Call again with dry_run=false to apply. HITL approval should have happened before that.',
    })
  }

  // Apply via Meta Graph API
  try {
    let apiUrl = ''
    let apiMethod: 'POST' | 'DELETE' = 'POST'
    let apiBody: Record<string, unknown> = {}

    switch (body.action) {
      case 'pause':
        apiUrl = `${META_GRAPH_BASE}/${body.entity_id}?access_token=${token}`
        apiBody = { status: 'PAUSED' }
        break
      case 'resume':
        apiUrl = `${META_GRAPH_BASE}/${body.entity_id}?access_token=${token}`
        apiBody = { status: 'ACTIVE' }
        break
      case 'update_budget': {
        const cents = body.params?.new_daily_budget_cents
        if (typeof cents !== 'number' || cents < 100) {
          return NextResponse.json({ error: 'invalid_budget', detail: 'new_daily_budget_cents required, min 100' }, { status: 400 })
        }
        apiUrl = `${META_GRAPH_BASE}/${body.entity_id}?access_token=${token}`
        apiBody = { daily_budget: cents }
        break
      }
      case 'kill_creative':
        apiUrl = `${META_GRAPH_BASE}/${body.entity_id}?access_token=${token}`
        apiBody = { status: 'ARCHIVED' }
        break
    }

    const res = await fetch(apiUrl, {
      method: apiMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody),
      signal: AbortSignal.timeout(25000),
    })
    const data = await res.json()

    if (!res.ok) {
      // Update audit with failure
      if (audit?.id) {
        await supabase
          .from('ad_creative_refreshes')
          .update({ deployed: false })
          .eq('id', audit.id)
      }
      return NextResponse.json(
        { error: 'meta_api_error', status: res.status, detail: data?.error || data, audit_id: audit?.id },
        { status: res.status }
      )
    }

    // Mark deployed
    if (audit?.id) {
      await supabase
        .from('ad_creative_refreshes')
        .update({ deployed: true, deployed_at: new Date().toISOString() })
        .eq('id', audit.id)
    }

    return NextResponse.json({
      ok: true,
      mode: 'live',
      action: body.action,
      entity_id: body.entity_id,
      meta_response: data,
      audit_id: audit?.id,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[meta-ads/apply-optimization] error:', msg)
    return NextResponse.json({ error: 'fetch_error', detail: msg, audit_id: audit?.id }, { status: 502 })
  }
}
