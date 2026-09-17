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

    // FIX 2026-08-08 (CC#1 · rompió el tiro exec 85117) · el acotado por corrida
    // filtraba la columna EQUIVOCADA. n8n manda `$execution.id` — un NÚMERO — y ese
    // valor vive en `workflow_execution_id`; la columna `workflow_id` guarda el UUID
    // del despacho (verificado: exec 85117 → workflow_id `e72653b8-…`,
    // workflow_execution_id `85117`). El filtro `workflow_id=eq.85117` no coincidía
    // NUNCA → `invocation_status:null` durante 31 polls → POLL_TIMEOUT con el
    // descubrimiento ya terminado y el ICP escrito. Se elige la columna por la FORMA
    // del valor: numérico ⇒ execution id · lo demás (UUID / `rediscovery-<n>`) ⇒ workflow_id.
    const scopeCol =
      workflowId && /^\d+$/.test(workflowId) ? 'workflow_execution_id' : 'workflow_id'

    let invQuery =
      `${baseUrl}/rest/v1/agent_invocations` +
      `?client_id=eq.${encodeURIComponent(clientId)}` +
      `&agent_name=eq.onboarding-specialist` +
      `&select=status,output_summary,metadata,cost_usd,workflow_id,workflow_execution_id,started_at` +
      `&order=started_at.desc&limit=1`
    if (workflowId) invQuery += `&${scopeCol}=eq.${encodeURIComponent(workflowId)}`

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
      metadata?: Record<string, unknown> | null
      cost_usd?: number
      workflow_id?: string
    }>

    const inv = invRows?.[0]
    const ready = !!inv && TERMINAL.has(String(inv.status))

    if (!ready) {
      // Fix raíz (a) 2026-07-19 · el ledger `agent_dispatches` es la señal DURABLE
      // de "el dispatch existe y está en vuelo": la intención se registra SÍNCRONA
      // antes del 202, así que accepted/running ⇒ ready:false SIN falso-timeout (el
      // caller sabe que es un dispatch real en curso, no uno perdido). La ausencia de
      // fila de ledger para un workflow_id conocido delata una intención perdida.
      let dispatchStatus: string | null = null
      if (workflowId) {
        try {
          // Misma corrección que arriba · el ledger guarda el execution id numérico
          // en `workflow_execution_id` y el UUID del despacho en `workflow_id`.
          const dispResp = await fetch(
            `${baseUrl}/rest/v1/agent_dispatches` +
              `?${scopeCol}=eq.${encodeURIComponent(workflowId)}` +
              `&select=status&order=created_at.desc&limit=1`,
            { headers: restHeaders, cache: 'no-store' },
          )
          if (dispResp.ok) {
            const dispRows = (await dispResp.json()) as Array<{ status?: string }>
            dispatchStatus = dispRows?.[0]?.status ?? null
          }
        } catch {
          /* best-effort · la señal de invocación sigue siendo válida sin esto */
        }
      }
      return NextResponse.json({
        ok: true,
        ready: false,
        client_id: clientId,
        invocation_status: inv?.status ?? null,
        dispatch_status: dispatchStatus,
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

    // E93 (CC#1 2026-09-17) · el punto de consulta NUNCA entrega un texto recortado como
    // si fuera entero. `output_summary` se guarda recortado (E91 · 34 % de las filas · el
    // descubridor 18/18) y en la bolita el alta recibió 2.001 caracteres de 22.888 sin
    // enterarse. La fila declara cuánto medía de verdad (`metadata.response_length`);
    // acá se compara y se DECLARA. La respuesta viaja igual (no se inventa nada), pero
    // marcada: quien la lee sabe qué le llegó.
    const estado = describeStoredResponse(inv.output_summary, inv.metadata)
    return NextResponse.json({
      ok: true,
      ready: true,
      client_id: clientId,
      status: inv.status,
      // `response` preserves the field the worker's unwrap node forwards to the
      // downstream cascade ($('Call Onboarding Specialist: Auto-Discovery').item.json.response).
      response: inv.output_summary ?? '',
      response_complete: estado.complete,
      response_truncated: estado.truncated,
      response_length_stored: estado.stored_length,
      response_length_real: estado.real_length,
      response_note: estado.note,
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

/**
 * E93 · ¿lo guardado es lo entero? · se decide fila por fila con lo que la propia fila
 * declara (`metadata.response_length` = largo real de la respuesta del empleado).
 *   complete   true  → guardado == real · se puede leer como entera
 *              false → guardado < real · RECORTADA · no se lee como entera
 *              null  → la fila no declara el largo real (filas viejas) · «no sé» · se avisa
 * El marcador «…» al final es una pista, no una prueba: sólo cuenta el largo declarado.
 * Exportada para la prueba (evidencia real de 140135: 2.001 de 4.545 · 2.001 de 22.888 · 1.730 de 1.730).
 */
export function describeStoredResponse(
  stored: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): {
  complete: boolean | null
  truncated: boolean | null
  stored_length: number
  real_length: number | null
  note: string | null
} {
  const text = typeof stored === 'string' ? stored : ''
  const stored_length = text.length
  const raw = metadata && typeof metadata === 'object' ? (metadata as { response_length?: unknown }).response_length : undefined
  const real_length = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
  const endsWithEllipsis = /(…|\.\.\.)\s*$/.test(text)
  if (real_length === null) {
    return {
      complete: null,
      truncated: null,
      stored_length,
      real_length: null,
      note:
        'RESPUESTA DE LARGO DESCONOCIDO · la fila no declara response_length · no se puede afirmar que esté entera' +
        (endsWithEllipsis ? ' · termina en «…» (probablemente recortada)' : ''),
    }
  }
  // lo guardado lleva un «…» de marca cuando se recortó: se compara sin él
  const storedSinMarca = endsWithEllipsis ? text.replace(/(…|\.\.\.)\s*$/, '').length : stored_length
  const truncated = storedSinMarca < real_length
  return {
    complete: !truncated,
    truncated,
    stored_length,
    real_length,
    note: truncated
      ? `RESPUESTA RECORTADA · guardados ${storedSinMarca} de ${real_length} caracteres (${Math.round((storedSinMarca / real_length) * 100)} %) · NO leer como entera · la parte perdida no se recupera de esta fila`
      : null,
  }
}
