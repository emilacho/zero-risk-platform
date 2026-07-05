/**
 * GET /api/onboarding/discovery-status/[clientId]
 *
 * Poll-based resume signal for the onboarding worker (CC#3 2026-07-05 · Solución A).
 *
 * WHY · the deal-won worker (`LyVoKcrypS5uLyuu`) used to pause on an n8n
 * "Wait on webhook" node and rely on the Vercel `waitUntil` async callback to
 * resume it (`/api/agents/run-sdk` Track O). That callback runs AFTER the agent
 * inside `waitUntil`, which does not reliably survive real-duration runs — the
 * agent completes but the callback never fires (0 rows in `agent_callback_attempts`),
 * so the worker hangs until its 900s timeout (diagnosis
 * `raw/findings/2026-07-05-callback-stuck-wait-diagnosis.md`).
 *
 * FIX · n8n polls THIS endpoint instead of waiting for the fragile callback. The
 * discovery output is persisted to the DB SYNCHRONOUSLY by the run-sdk proxy
 * (`agent_invocations` insert · 3-retry reliable · + `clients.config.apify`)
 * BEFORE the callback would fire · so the DB is the durable signal, the callback
 * is not.
 *
 * SIGNAL · the latest `onboarding-specialist` invocation for this client with a
 * terminal status (completed|error). That insert is the reliable "agent done"
 * marker (the callback is the unreliable part, not the invocation write).
 *
 * PAYLOAD (mirrors the old callback body the worker's unwrap node expected) ·
 *   { ready, response, discovery_output: { own_handles, competitors }, status, cost_usd }
 *
 * Responses ·
 *   200 · { ok:true, ready:boolean, ... }  (ready:false while still running)
 *   400 · client_id_required
 *   401 · unauthorized
 *   500 · internal error
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ clientId: string }>
}

const TERMINAL = new Set(['completed', 'error', 'failed'])

export async function GET(request: Request, context: RouteContext) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const { clientId } = await context.params
  if (!clientId) {
    return NextResponse.json({ error: 'client_id_required' }, { status: 400 })
  }

  // Optional workflow_id scoping · when the caller passes ?workflow_id=<journey>
  // we prefer the invocation from THIS journey (avoids reading a stale prior run
  // for the same client). Falls back to the latest invocation for the client.
  const url = new URL(request.url)
  const workflowId = url.searchParams.get('workflow_id')

  try {
    // NOTE (CC#3 2026-07-05): read via DIRECT PostgREST fetch, NOT supabase-js.
    // The supabase-js admin client persistently failed to return freshly-written
    // `agent_invocations` rows in the Vercel runtime (row visible via raw REST +
    // service key, invisible via `getSupabaseAdmin().from(...)` for minutes ·
    // 6/6 consistent) which hung the poll. A plain `fetch` to /rest/v1 with the
    // service key — the exact call that works from any client — sidesteps the
    // js-client-specific staleness. Keep this over supabase-js here.
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!baseUrl || !serviceKey) {
      return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 })
    }
    const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

    let invQuery =
      `${baseUrl}/rest/v1/agent_invocations` +
      `?client_id=eq.${encodeURIComponent(clientId)}` +
      `&agent_name=eq.onboarding-specialist` +
      `&select=status,output_summary,cost_usd,workflow_id,started_at` +
      `&order=started_at.desc&limit=1`
    if (workflowId) invQuery += `&workflow_id=eq.${encodeURIComponent(workflowId)}`

    const invResp = await fetch(invQuery, { headers: restHeaders, cache: 'no-store' })
    if (!invResp.ok) {
      return NextResponse.json(
        { error: 'invocation_query_failed', detail: `rest ${invResp.status}` },
        { status: 500 },
      )
    }
    const invRows = (await invResp.json()) as Array<{
      status?: string
      output_summary?: string
      cost_usd?: number
      workflow_id?: string
    }>

    const inv = invRows?.[0]
    const ready = !!inv && TERMINAL.has(String(inv.status))

    if (!ready) {
      return NextResponse.json({
        ok: true,
        ready: false,
        client_id: clientId,
        invocation_status: inv?.status ?? null,
      })
    }

    // Agent done · assemble the discovery payload from the durable DB state.
    let discoveryOutput: { own_handles?: unknown; competitors?: unknown } = {}
    const clientResp = await fetch(
      `${baseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=config`,
      { headers: restHeaders, cache: 'no-store' },
    )
    if (clientResp.ok) {
      const clientRows = (await clientResp.json()) as Array<{ config?: Record<string, unknown> }>
      const apify = (clientRows?.[0]?.config?.apify ?? undefined) as
        | Record<string, unknown>
        | undefined
      if (apify) {
        discoveryOutput = {
          own_handles: apify.own_handles ?? null,
          competitors: apify.competitor_list ?? [],
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ready: true,
      client_id: clientId,
      status: inv.status,
      // `response` preserves the field the worker's unwrap node forwards to the
      // downstream cascade ($('Call Onboarding Specialist: Auto-Discovery').item.json.response).
      response: inv.output_summary ?? '',
      discovery_output: discoveryOutput,
      cost_usd: inv.cost_usd ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'internal_error', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
