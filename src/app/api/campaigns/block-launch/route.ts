/**
 * POST /api/campaigns/block-launch
 *
 * Called by the Ad Creative → Landing Message Match Validator workflow when
 * the Schwartz audit flags a >30pt mismatch. Records the block intent in
 * error_events (audit trail) and returns success so the workflow proceeds
 * to the Slack alert + respond-blocked terminator.
 *
 * Real impl could flip a `campaigns.launch_blocked` flag in Supabase — for
 * now this is a stub that echoes and logs.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const raw = await request.json().catch(() => ({}))
  const v = validateObject<Record<string, unknown>>(raw, 'campaigns-block-launch')
  if (!v.ok) return v.response
  const body = v.data as Record<string, any>
  const campaignId: string = body?.campaign_id || ''
  const clientId: string = body?.client_id || ''
  const reason: string = body?.reason || 'unspecified'
  const matchScore: number = typeof body?.match_score === 'number' ? body.match_score : 0
  const blockedBy: string = body?.blocked_by || 'unknown'

  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('error_events').insert({
      source: 'campaigns/block-launch',
      severity: matchScore < 50 ? 'P0' : 'P1',
      title: `Launch blocked: ${campaignId} (${reason})`,
      data: body,
    })
  } catch {}

  // Echo scalar body fields so the downstream respond-webhook / Slack nodes
  // still have everything they need.
  const echo: Record<string, unknown> = {}
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) echo[k] = v
  }

  return NextResponse.json({
    ...echo,
    ok: true,
    status: 'blocked',
    campaign_id: campaignId,
    client_id: clientId,
    reason,
    match_score: matchScore,
    blocked_by: blockedBy,
    blocked_at: new Date().toISOString(),
    fallback_mode: true,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/campaigns/block-launch',
    method: 'POST',
    body: { campaign_id: 'string', client_id: 'string', reason: 'string', match_score: 'number', blocked_by: 'string', required_actions: 'array' },
    note: 'Stub — records in error_events, returns ok.',
  })
}
