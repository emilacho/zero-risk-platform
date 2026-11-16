/**
 * POST /api/meta-social/post/instagram
 *
 * Organic Instagram Business publish via Meta Graph API v21 · 2-step flow:
 *   1) POST /:ig_user/media         → create media container (image_url + caption)
 *   2) POST /:ig_user/media_publish → publish container (creation_id)
 *
 * Auth · `x-api-key: INTERNAL_API_KEY` (matches /api/agents/run-sdk + meta-ads pattern).
 *
 * La cuenta sale de la FICHA DEL CLIENTE (`clients.config.redes_oficiales.meta.instagram_id`, ver
 * `lib/clients/cuentas-meta.ts`), nunca de una variable global (16-nov · CC3). Por eso `client_id` es obligatorio.
 * Token · `META_ACCESS_TOKEN` (usuario del sistema con instagram_basic + instagram_content_publish).
 *
 * ENSAYO por defecto: sin `dry_run: false` explícito, arma los dos pasos y comprueba la cuenta SOLO LEYENDO; no crea
 * el contenedor ni publica. Publicar de verdad exige además `redes_oficiales.publicacion_real: true` en la ficha.
 *
 * Body shape (camelCase or snake_case accepted via resolver):
 *   {
 *     image_url: string,           // public URL · Meta downloads it
 *     caption?: string,            // up to 2200 chars
 *     client_id: string,           // resolved via multi-path resolver · REQUIRED
 *     dry_run?: boolean,           // solo `false` publica (y solo con la publicación real encendida en la ficha)
 *     task_id?: string,
 *     workflow_id?: string,
 *     agent_slug?: string,
 *   }
 *
 * Ensayo: { ok: true, ensayo: true, platform: 'instagram', cuenta, armado: [paso1, paso2] } (sin escribir nada)
 * Real:   { ok: true, platform: 'instagram', media_id, creation_id, ... } + fila en agent_invocations.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { META_GRAPH_BASE, cuentaInstagram, decidirModo, leerCuentasMeta } from '@/lib/clients/cuentas-meta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PostBody {
  image_url?: string
  caption?: string
  client_id?: string
  dry_run?: unknown
  task_id?: string
  workflow_id?: string
  agent_slug?: string
}

interface GraphContainerResp {
  id?: string
  error?: { message?: string; type?: string; code?: number }
}

interface GraphPublishResp {
  id?: string
  error?: { message?: string; type?: string; code?: number }
}

async function persistInvocation(args: {
  sessionId: string
  agentSlug: string
  clientId: string | null
  taskId: string | null
  workflowId: string | null
  costUsd: number
  durationMs: number
  status: 'completed' | 'failed'
  errorMessage: string | null
  metadata: Record<string, unknown>
}) {
  try {
    const startedAt = new Date(Date.now() - args.durationMs).toISOString()
    const endedAt = new Date().toISOString()
    await getSupabaseAdmin()
      .from('agent_invocations')
      .insert({
        session_id: args.sessionId,
        agent_id: args.agentSlug,
        agent_name: args.agentSlug,
        command: null,
        task_id: args.taskId,
        workflow_id: args.workflowId,
        workflow_execution_id: null,
        client_id: args.clientId,
        journey_id: null,
        model: 'meta-graph-v21',
        started_at: startedAt,
        ended_at: endedAt,
        cost_usd: args.costUsd,
        tokens_input: 0,
        tokens_output: 0,
        tokens_cache_read: 0,
        tokens_cache_creation: 0,
        num_turns: 1,
        status: args.status,
        exit_code: args.status === 'completed' ? 0 : 1,
        error_message: args.errorMessage,
        metadata: { source: 'api_meta_social_instagram', ...args.metadata },
      })
  } catch (err) {
    console.warn(
      '[meta-social/instagram] agent_invocations insert exception:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }

  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : ''
  const caption = typeof body.caption === 'string' ? body.caption : ''
  if (!imageUrl) {
    return NextResponse.json(
      { ok: false, error: 'image_url required', code: 'E-META-IG-IMAGE-URL' },
      { status: 400 },
    )
  }

  const token = process.env.META_ACCESS_TOKEN || ''
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'not_configured', code: 'E-META-IG-CONFIG-MISSING', missing: ['META_ACCESS_TOKEN'] },
      { status: 503 },
    )
  }

  const clientId = resolveClientIdFromBody(body as unknown)
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: 'client_id required', code: 'E-META-IG-CLIENT', detail: 'la cuenta sale de la ficha del cliente' },
      { status: 400 },
    )
  }
  const lectura = await leerCuentasMeta(getSupabaseAdmin(), clientId)
  if (!lectura.ok) {
    return NextResponse.json(
      { ok: false, error: lectura.motivo, code: 'E-META-IG-CLIENT', detail: lectura.detalle ?? null },
      { status: lectura.motivo === 'cliente_no_existe' ? 404 : 502 },
    )
  }
  const igUserId = lectura.cuentas.instagram_id
  if (!igUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'cliente_sin_instagram',
        code: 'E-META-IG-CLIENT',
        detail: 'falta config.redes_oficiales.meta.instagram_id en la ficha del cliente',
      },
      { status: 409 },
    )
  }
  const modo = decidirModo(body.dry_run, lectura.cuentas)
  if (modo.modo === 'negado') {
    return NextResponse.json(
      {
        ok: false,
        error: modo.motivo,
        code: 'E-META-IG-ENSAYO',
        detail: 'publicar de verdad exige redes_oficiales.publicacion_real: true en la ficha (firma de Emilio)',
      },
      { status: 409 },
    )
  }

  if (modo.modo === 'ensayo') {
    // ENSAYO · ni contenedor ni publicación: se comprueba la cuenta leyendo y se devuelve lo que se mandaría
    const cuenta = await cuentaInstagram(igUserId, token)
    if (!cuenta.ok) {
      return NextResponse.json(
        { ok: false, error: 'sin_acceso_a_instagram', code: 'E-META-IG-ACCOUNT', detail: cuenta.detalle },
        { status: 502 },
      )
    }
    return NextResponse.json({
      ok: true,
      ensayo: true,
      platform: 'instagram',
      client_id: clientId,
      cuenta: { instagram_id: igUserId, usuario: cuenta.usuario },
      armado: [
        { metodo: 'POST', ruta: `/${igUserId}/media`, cuerpo: { image_url: imageUrl, caption } },
        { metodo: 'POST', ruta: `/${igUserId}/media_publish`, cuerpo: { creation_id: '<id del paso 1>' } },
      ],
      timestamp: new Date().toISOString(),
    })
  }

  const agentSlug = body.agent_slug || 'social-publisher'
  const sessionId = `meta-ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const taskId = body.task_id ?? null
  const workflowId = body.workflow_id ?? null
  const t0 = Date.now()

  // Step 1 · create container
  const containerUrl = `${META_GRAPH_BASE}/${igUserId}/media?access_token=${encodeURIComponent(token)}`
  let containerResp: Response
  try {
    containerResp = await fetch(containerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    void persistInvocation({
      sessionId,
      agentSlug,
      clientId,
      taskId,
      workflowId,
      costUsd: 0,
      durationMs: Date.now() - t0,
      status: 'failed',
      errorMessage: `container_fetch_failed · ${msg}`,
      metadata: { stage: 'container', image_url: imageUrl },
    })
    return NextResponse.json(
      { ok: false, error: 'graph_fetch_failed', detail: msg, stage: 'container' },
      { status: 502 },
    )
  }
  const containerJson = (await containerResp.json().catch(() => ({}))) as GraphContainerResp
  if (!containerResp.ok || !containerJson.id) {
    const errMsg = containerJson.error?.message || `container_status_${containerResp.status}`
    void persistInvocation({
      sessionId,
      agentSlug,
      clientId,
      taskId,
      workflowId,
      costUsd: 0,
      durationMs: Date.now() - t0,
      status: 'failed',
      errorMessage: errMsg,
      metadata: { stage: 'container', upstream_status: containerResp.status, raw: containerJson },
    })
    return NextResponse.json(
      {
        ok: false,
        error: 'meta_container_failed',
        upstream_status: containerResp.status,
        detail: errMsg,
        stage: 'container',
      },
      { status: containerResp.status >= 400 && containerResp.status < 500 ? containerResp.status : 502 },
    )
  }
  const creationId = containerJson.id

  // Step 2 · publish container
  const publishUrl = `${META_GRAPH_BASE}/${igUserId}/media_publish?access_token=${encodeURIComponent(token)}`
  let publishResp: Response
  try {
    publishResp = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    void persistInvocation({
      sessionId,
      agentSlug,
      clientId,
      taskId,
      workflowId,
      costUsd: 0,
      durationMs: Date.now() - t0,
      status: 'failed',
      errorMessage: `publish_fetch_failed · ${msg}`,
      metadata: { stage: 'publish', creation_id: creationId },
    })
    return NextResponse.json(
      { ok: false, error: 'graph_fetch_failed', detail: msg, stage: 'publish', creation_id: creationId },
      { status: 502 },
    )
  }
  const publishJson = (await publishResp.json().catch(() => ({}))) as GraphPublishResp
  if (!publishResp.ok || !publishJson.id) {
    const errMsg = publishJson.error?.message || `publish_status_${publishResp.status}`
    void persistInvocation({
      sessionId,
      agentSlug,
      clientId,
      taskId,
      workflowId,
      costUsd: 0,
      durationMs: Date.now() - t0,
      status: 'failed',
      errorMessage: errMsg,
      metadata: { stage: 'publish', creation_id: creationId, upstream_status: publishResp.status, raw: publishJson },
    })
    return NextResponse.json(
      {
        ok: false,
        error: 'meta_publish_failed',
        upstream_status: publishResp.status,
        detail: errMsg,
        stage: 'publish',
        creation_id: creationId,
      },
      { status: publishResp.status >= 400 && publishResp.status < 500 ? publishResp.status : 502 },
    )
  }
  const mediaId = publishJson.id
  const durationMs = Date.now() - t0

  void persistInvocation({
    sessionId,
    agentSlug,
    clientId,
    taskId,
    workflowId,
    costUsd: 0, // organic posts: no Anthropic spend on this hop; Meta is free
    durationMs,
    status: 'completed',
    errorMessage: null,
    metadata: {
      media_id: mediaId,
      creation_id: creationId,
      caption_length: caption.length,
      image_url: imageUrl,
      platform: 'instagram',
    },
  })

  return NextResponse.json({
    ok: true,
    platform: 'instagram',
    media_id: mediaId,
    creation_id: creationId,
    session_id: sessionId,
    client_id: clientId,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
  })
}
