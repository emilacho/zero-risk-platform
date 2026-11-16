/**
 * POST /api/meta-social/post/facebook
 *
 * Organic Facebook Page publish via Meta Graph API v21 · single-step:
 *   POST /:page_id/feed (text-only) OR /:page_id/photos (with image_url)
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`
 *
 * La página sale de la FICHA DEL CLIENTE (`clients.config.redes_oficiales.meta.pagina_facebook`, ver
 * `lib/clients/cuentas-meta.ts`), nunca de una variable global (16-nov · CC3). Por eso `client_id` es obligatorio.
 * Token · `META_ACCESS_TOKEN` (usuario del sistema); con él se pide el token DE LA PÁGINA, el único que Facebook acepta.
 *
 * ENSAYO por defecto: sin `dry_run: false` explícito, arma la publicación (ruta + cuerpo) y comprueba el acceso a la
 * página SOLO LEYENDO; no publica. Publicar de verdad exige además `redes_oficiales.publicacion_real: true` en la ficha.
 *
 * Body shape:
 *   {
 *     message: string,             // post text (required unless image_url)
 *     image_url?: string,          // optional image · switches to /photos endpoint
 *     link_url?: string,           // optional link preview · sets `link` param
 *     client_id: string,           // resolved via multi-path resolver · REQUIRED
 *     dry_run?: boolean,           // solo `false` publica (y solo con la publicación real encendida en la ficha)
 *     task_id?: string,
 *     workflow_id?: string,
 *     agent_slug?: string,
 *   }
 *
 * Ensayo: { ok: true, ensayo: true, platform: 'facebook', cuenta, armado: { metodo, ruta, cuerpo } } (sin escribir nada)
 * Real:   { ok: true, platform: 'facebook', post_id, ... } + fila en agent_invocations (fire-and-forget).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { META_GRAPH_BASE, decidirModo, leerCuentasMeta, tokenDePagina } from '@/lib/clients/cuentas-meta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PostBody {
  message?: string
  image_url?: string
  link_url?: string
  client_id?: string
  dry_run?: unknown
  task_id?: string
  workflow_id?: string
  agent_slug?: string
}

interface GraphPostResp {
  id?: string
  post_id?: string // /photos endpoint returns { id, post_id }
  error?: { message?: string; type?: string; code?: number }
}

async function persistInvocation(args: {
  sessionId: string
  agentSlug: string
  clientId: string | null
  taskId: string | null
  workflowId: string | null
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
        cost_usd: 0,
        tokens_input: 0,
        tokens_output: 0,
        tokens_cache_read: 0,
        tokens_cache_creation: 0,
        num_turns: 1,
        status: args.status,
        exit_code: args.status === 'completed' ? 0 : 1,
        error_message: args.errorMessage,
        metadata: { source: 'api_meta_social_facebook', ...args.metadata },
      })
  } catch (err) {
    console.warn(
      '[meta-social/facebook] agent_invocations insert exception:',
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

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : ''
  const linkUrl = typeof body.link_url === 'string' ? body.link_url.trim() : ''
  if (!message && !imageUrl) {
    return NextResponse.json(
      { ok: false, error: 'message or image_url required', code: 'E-META-FB-INPUT' },
      { status: 400 },
    )
  }

  const tokenSistema = process.env.META_ACCESS_TOKEN || ''
  if (!tokenSistema) {
    return NextResponse.json(
      { ok: false, error: 'not_configured', code: 'E-META-FB-CONFIG-MISSING', missing: ['META_ACCESS_TOKEN'] },
      { status: 503 },
    )
  }

  const clientId = resolveClientIdFromBody(body as unknown)
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: 'client_id required', code: 'E-META-FB-CLIENT', detail: 'la página sale de la ficha del cliente' },
      { status: 400 },
    )
  }
  const lectura = await leerCuentasMeta(getSupabaseAdmin(), clientId)
  if (!lectura.ok) {
    return NextResponse.json(
      { ok: false, error: lectura.motivo, code: 'E-META-FB-CLIENT', detail: lectura.detalle ?? null },
      { status: lectura.motivo === 'cliente_no_existe' ? 404 : 502 },
    )
  }
  const pageId = lectura.cuentas.pagina_facebook
  if (!pageId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'cliente_sin_pagina_facebook',
        code: 'E-META-FB-CLIENT',
        detail: 'falta config.redes_oficiales.meta.pagina_facebook en la ficha del cliente',
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
        code: 'E-META-FB-ENSAYO',
        detail: 'publicar de verdad exige redes_oficiales.publicacion_real: true en la ficha (firma de Emilio)',
      },
      { status: 409 },
    )
  }

  const pagina = await tokenDePagina(pageId, tokenSistema)
  if (!pagina.ok) {
    return NextResponse.json(
      { ok: false, error: 'sin_acceso_a_la_pagina', code: 'E-META-FB-PAGE', detail: pagina.detalle },
      { status: 502 },
    )
  }

  const agentSlug = body.agent_slug || 'social-publisher'
  const sessionId = `meta-fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const taskId = body.task_id ?? null
  const workflowId = body.workflow_id ?? null
  const t0 = Date.now()

  // Endpoint selection · /photos when image_url present, else /feed
  const endpoint = imageUrl ? 'photos' : 'feed'

  const payload: Record<string, unknown> = {}
  if (imageUrl) {
    payload.url = imageUrl
    if (message) payload.caption = message
  } else {
    payload.message = message
    if (linkUrl) payload.link = linkUrl
  }

  if (modo.modo === 'ensayo') {
    // ENSAYO · nada se publica ni se escribe: se devuelve lo que se mandaría
    return NextResponse.json({
      ok: true,
      ensayo: true,
      platform: 'facebook',
      client_id: clientId,
      cuenta: { pagina_facebook: pageId, nombre: pagina.nombre },
      armado: { metodo: 'POST', ruta: `/${pageId}/${endpoint}`, cuerpo: payload },
      timestamp: new Date().toISOString(),
    })
  }

  const url = `${META_GRAPH_BASE}/${pageId}/${endpoint}?access_token=${encodeURIComponent(pagina.token)}`

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      durationMs: Date.now() - t0,
      status: 'failed',
      errorMessage: `graph_fetch_failed · ${msg}`,
      metadata: { endpoint, message_length: message.length, has_image: !!imageUrl },
    })
    return NextResponse.json(
      { ok: false, error: 'graph_fetch_failed', detail: msg },
      { status: 502 },
    )
  }
  const json = (await resp.json().catch(() => ({}))) as GraphPostResp
  if (!resp.ok || !(json.id || json.post_id)) {
    const errMsg = json.error?.message || `status_${resp.status}`
    void persistInvocation({
      sessionId,
      agentSlug,
      clientId,
      taskId,
      workflowId,
      durationMs: Date.now() - t0,
      status: 'failed',
      errorMessage: errMsg,
      metadata: { endpoint, upstream_status: resp.status, raw: json },
    })
    return NextResponse.json(
      {
        ok: false,
        error: 'meta_post_failed',
        upstream_status: resp.status,
        detail: errMsg,
        endpoint,
      },
      { status: resp.status >= 400 && resp.status < 500 ? resp.status : 502 },
    )
  }
  // /photos returns { id (photo_id), post_id } · /feed returns { id (post_id) }
  const postId = json.post_id || json.id || null
  const durationMs = Date.now() - t0

  void persistInvocation({
    sessionId,
    agentSlug,
    clientId,
    taskId,
    workflowId,
    durationMs,
    status: 'completed',
    errorMessage: null,
    metadata: {
      post_id: postId,
      endpoint,
      message_length: message.length,
      has_image: !!imageUrl,
      has_link: !!linkUrl,
      platform: 'facebook',
    },
  })

  return NextResponse.json({
    ok: true,
    platform: 'facebook',
    post_id: postId,
    endpoint,
    session_id: sessionId,
    client_id: clientId,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
  })
}
