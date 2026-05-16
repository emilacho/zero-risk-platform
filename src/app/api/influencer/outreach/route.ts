/**
 * POST /api/influencer/outreach · single-agent invocation of `influencer-manager`
 *
 * Sprint #6 deferred-resolve · slug `influencer_partnerships_manager` was
 * one of 3 backfill placeholders (canonical-adopted to `influencer-manager`
 * in migration 202605162000). This endpoint is the "wire" for that agent ·
 * thin wrapper over `/api/agents/run` that takes a brief + target list
 * and returns a structured outreach plan (NOT auto-sent · plan only).
 *
 * Why a standalone endpoint (vs adding to social-multi-platform-publisher) ·
 * outreach is a fundamentally different flow than content publishing · the
 * existing 7-node social-publisher is image-asset-driven. Influencer
 * outreach is contact-list + DM-template + status-tracking. Different shape ·
 * different surface · clean separation now keeps both growable later.
 *
 * Output is plan-only · sending DMs / emails is downstream (n8n workflow
 * picks up the plan and pipes through GHL email or IG DM API). This route
 * does NOT perform sending.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

interface InfluencerTarget {
  /** IG handle WITHOUT the @ · e.g. "naufrago.ec" */
  handle: string
  /** Optional platform context · default 'instagram' */
  platform?: 'instagram' | 'tiktok' | 'youtube' | 'twitter'
  /** Operator hint to the agent · "what we know about this person" */
  notes?: string
}

interface OutreachRequest {
  client_id?: string
  campaign_brief: string
  /** Targets · max 25 per request · agent produces 1 plan per target */
  targets: InfluencerTarget[]
  budget_per_collab_usd?: number
  caller?: string
}

interface AgentRunResponse {
  success?: boolean
  response?: string
  cost_usd?: number
  model?: string
  session_id?: string | null
  error?: string
}

function validate(raw: unknown): { ok: true; data: OutreachRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.campaign_brief !== 'string' || !r.campaign_brief.trim()) {
    return { ok: false, error: 'campaign_brief required (plain text · max 4000 chars)' }
  }
  if (r.campaign_brief.length > 4000) {
    return { ok: false, error: 'campaign_brief too long · max 4000 chars' }
  }
  if (!Array.isArray(r.targets) || r.targets.length === 0) {
    return { ok: false, error: 'targets must be a non-empty array' }
  }
  if (r.targets.length > 25) {
    return { ok: false, error: 'targets capped at 25 per request' }
  }
  for (const t of r.targets) {
    if (!t || typeof t !== 'object') return { ok: false, error: 'every target must be an object' }
    const tt = t as Record<string, unknown>
    if (typeof tt.handle !== 'string' || !tt.handle.trim()) {
      return { ok: false, error: 'every target must have a handle (string)' }
    }
    if (tt.platform !== undefined && !['instagram', 'tiktok', 'youtube', 'twitter'].includes(tt.platform as string)) {
      return { ok: false, error: `invalid platform: ${String(tt.platform)}` }
    }
  }
  if (r.budget_per_collab_usd !== undefined && (typeof r.budget_per_collab_usd !== 'number' || r.budget_per_collab_usd < 0)) {
    return { ok: false, error: 'budget_per_collab_usd must be a non-negative number' }
  }
  return { ok: true, data: r as unknown as OutreachRequest }
}

function buildTask(req: OutreachRequest): string {
  const targetsBlock = req.targets
    .map(
      (t, i) =>
        `${i + 1}. @${t.handle} · platform=${t.platform ?? 'instagram'}${t.notes ? ' · notes=' + t.notes : ''}`,
    )
    .join('\n')
  const budgetLine = req.budget_per_collab_usd
    ? `Budget per collaboration · up to $${req.budget_per_collab_usd} USD (operator cap · plan must respect)`
    : 'Budget per collaboration · not specified · plan should propose tier-based ranges'
  return [
    `Campaign brief (operator-provided):\n${req.campaign_brief}`,
    `Targets (${req.targets.length}):\n${targetsBlock}`,
    budgetLine,
    'Task: produce a per-target outreach plan. Return strict JSON (NO prose outside the JSON) with shape:',
    '{ "version": "outreach-v1", "campaign_summary": "...", "targets": [ { "handle": "...", "platform": "...", "qualification_score": 0-10, "rationale": "...", "outreach_message_draft": "...", "deliverable_proposed": "...", "compensation_proposed_usd": number | null, "follow_up_window_days": number, "red_flags": [ "..." ] } ], "overall_strategy_notes": "...", "open_questions": [ "..." ] }. The outreach_message_draft must be in the language matching the target audience (Spanish/English/etc as fits the brief context).',
  ].join('\n\n')
}

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < 0 || end < start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const v = validate(raw)
  if (!v.ok) {
    return NextResponse.json({ error: 'validation_failed', detail: v.error }, { status: 400 })
  }
  const req = v.data

  const internalApiKey = process.env.INTERNAL_API_KEY
  if (!internalApiKey) {
    return NextResponse.json({ error: 'INTERNAL_API_KEY missing' }, { status: 500 })
  }

  const url = new URL(request.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const resolvedClientId = resolveClientIdFromBody(req as unknown as Record<string, unknown>)

  const startedAt = Date.now()
  const body = {
    agent: 'influencer-manager',
    task: buildTask(req),
    client_id: resolvedClientId,
    caller: req.caller ?? 'influencer-outreach',
    context: {
      campaign_brief: req.campaign_brief,
      targets: req.targets,
      budget_per_collab_usd: req.budget_per_collab_usd ?? null,
    },
  }

  let agentRes: AgentRunResponse
  let agentHttpStatus = 0
  try {
    const res = await fetch(`${baseUrl}/api/agents/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': internalApiKey,
      },
      body: JSON.stringify(body),
    })
    agentHttpStatus = res.status
    agentRes = (await res.json()) as AgentRunResponse
  } catch (err) {
    return NextResponse.json(
      {
        error: 'agent_fetch_failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    )
  }

  const duration_ms = Date.now() - startedAt
  if (agentHttpStatus !== 200 || agentRes.success === false) {
    return NextResponse.json(
      {
        ok: false,
        error: agentRes.error ?? `agent_returned_${agentHttpStatus}`,
        duration_ms,
        cost_usd: agentRes.cost_usd ?? 0,
        model: agentRes.model ?? null,
        session_id: agentRes.session_id ?? null,
      },
      { status: 502 },
    )
  }

  const rawText = agentRes.response ?? ''
  const parsedPlan = parseJsonResponse(rawText)

  // Optional Storage persistence · `client-websites/{slug}/influencer-outreach/{ts}.json`
  // when client_id resolves to a known slug. Best-effort · non-fatal if upload fails.
  let storage_path: string | null = null
  if (resolvedClientId && parsedPlan) {
    try {
      const supabase = getSupabaseAdmin()
      const { data: cli } = await supabase
        .from('clients')
        .select('slug')
        .eq('id', resolvedClientId)
        .maybeSingle()
      const slug = (cli?.slug as string | undefined) ?? null
      if (slug && /^[a-z0-9_-]+$/i.test(slug)) {
        const date = new Date().toISOString().slice(0, 10)
        const path = `${slug}/influencer-outreach/${date}/${Date.now()}-plan.json`
        const up = await supabase.storage
          .from('client-websites')
          .upload(path, Buffer.from(JSON.stringify(parsedPlan, null, 2)), {
            contentType: 'application/json; charset=utf-8',
            upsert: true,
            cacheControl: '300',
          })
        if (!up.error) storage_path = path
      }
    } catch {
      // soft fail · plan still returned in response body
    }
  }

  return NextResponse.json({
    ok: parsedPlan !== null,
    client_id: resolvedClientId,
    targets_requested: req.targets.length,
    targets_planned: Array.isArray(parsedPlan?.targets) ? (parsedPlan!.targets as unknown[]).length : 0,
    plan: parsedPlan,
    raw_response: rawText,
    storage_path,
    cost_usd: agentRes.cost_usd ?? 0,
    duration_ms,
    model: agentRes.model ?? null,
    session_id: agentRes.session_id ?? null,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/influencer/outreach',
    method: 'POST',
    agent: 'influencer-manager',
    description:
      'Sprint #6 deferred-resolve · single-agent outreach plan generator. Wires the canonical-adopted influencer-manager (from agents.influencer_partnerships_manager placeholder · migration 202605162000) into a callable surface. Plan-only · no DMs/emails sent.',
    body_shape: {
      client_id: 'string (optional · multi-path resolver Fix 8b)',
      campaign_brief: 'string (required · max 4000 chars)',
      targets: 'array of { handle, platform?, notes? } · max 25 entries',
      budget_per_collab_usd: 'number (optional)',
      caller: 'string (optional · audit attribution)',
    },
  })
}
