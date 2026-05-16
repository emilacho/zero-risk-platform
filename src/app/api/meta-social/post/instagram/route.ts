/**
 * POST /api/meta-social/post/instagram
 *
 * Organic Instagram Business publish via Meta Graph API v21 · 2-step flow:
 *   1) POST /:ig_user/media         → create media container (image_url + caption)
 *   2) POST /:ig_user/media_publish → publish container (creation_id)
 *
 * Auth · `x-api-key: INTERNAL_API_KEY` (matches /api/agents/run-sdk + meta-ads pattern).
 *
 * Required Meta env vars (Vercel project) · 503 'not_configured' if missing:
 *   - META_IG_BUSINESS_ACCOUNT_ID · numeric IG Business Account id
 *   - META_IG_ACCESS_TOKEN _or_ META_ACCESS_TOKEN · page-scoped token with
 *     instagram_basic + instagram_content_publish scopes
 *
 * Body shape (camelCase or snake_case accepted via resolver):
 *   {
 *     image_url: string,           // public URL · Meta downloads it
 *     caption?: string,            // up to 2200 chars
 *     client_id?: string,          // resolved via multi-path resolver
 *     task_id?: string,
 *     workflow_id?: string,
 *     agent_slug?: string,
 *   }
 *
 * On success: { ok: true, platform: 'instagram', media_id, creation_id, ... }
 * Persists an `agent_invocations` row (fire-and-forget) so dashboards see the post.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

interface PostBody {
  image_url?: string
  caption?: string
  client_id?: string
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

  const igUserId = process.env.META_IG_BUSINESS_ACCOUNT_ID || ''
  const token = process.env.META_IG_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || ''
  if (!igUserId || !token) {
    return NextResponse.json(
      {
        ok: false,
        error: 'not_configured',
        code: 'E-META-IG-CONFIG-MISSING',
        missing: [
          !igUserId && 'META_IG_BUSINESS_ACCOUNT_ID',
          !token && '(META_IG_ACCESS_TOKEN | META_ACCESS_TOKEN)',
        ].filter(Boolean),
      },
      { status: 503 },
    )
  }

  const clientId = resolveClientIdFromBody(body as unknown)
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
