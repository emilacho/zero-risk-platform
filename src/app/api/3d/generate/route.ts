import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { capture } from '@/lib/posthog'
import { randomUUID } from 'node:crypto'

// Sprint #6 Brazo Meshy · 3D model generation wrapper
//
// POST /api/3d/generate
// Body: { prompt, client_id?, agent_slug?, type?, format?, art_style?,
//         topology?, target_polycount?, caller? }
// Uses meshy-4 (Stack canonical · STACK_FINAL_V3 Bloque 2 entry 2026-05-16).
// Two-step API · POST /v2/text-to-3d creates a task, returns task UUID ·
// poll GET /v2/text-to-3d/{id} until status=SUCCEEDED · response includes
// model_urls.{glb,fbx,obj,usdz}. We download the requested format and
// upload to `client-websites/{slug}/3d-models/` (existing bucket · mime
// types widened in migration 202605161900). client_id resolver chain
// (Fix 8b/8c) populates client_id from any nested path.

const STORAGE_BUCKET = 'client-websites'
const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v2'
const DEFAULT_MODEL = 'meshy-6'
const DEFAULT_FORMAT = 'glb'
const DEFAULT_ART_STYLE = 'realistic'
const DEFAULT_TYPE = 'object'
const POLL_INTERVAL_MS = 8_000
const POLL_TIMEOUT_MS = 240_000 // 4 min cap · refine mode usually completes <2min

// Meshy charges ~$0.20 preview · ~$0.30 refine · we publish a stable
// estimate per generation. Real cost shows in the Meshy dashboard.
// `preview` skips texturing (cheaper · faster) · `refine` adds PBR maps.
const PRICING_BY_MODE: Record<string, number> = {
  preview: 0.2,
  refine: 0.5,
}

export const runtime = 'nodejs'
export const maxDuration = 300

const VALID_FORMATS = ['glb', 'fbx', 'obj', 'usdz'] as const
const VALID_TYPES = ['object', 'character', 'environment'] as const
const VALID_ART_STYLES = ['realistic', 'cartoon', 'low-poly', 'sculpture', 'pbr'] as const

type MeshyFormat = (typeof VALID_FORMATS)[number]
type MeshyType = (typeof VALID_TYPES)[number]
type MeshyArtStyle = (typeof VALID_ART_STYLES)[number]

interface MeshyTaskResponse {
  result?: string
  error?: { message?: string }
}

interface MeshyPollResponse {
  id?: string
  status?: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'
  progress?: number
  model_urls?: {
    glb?: string
    fbx?: string
    obj?: string
    usdz?: string
  }
  thumbnail_url?: string
  prompt?: string
  art_style?: string
  task_error?: { message?: string }
  error?: { message?: string }
  polycount?: number
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }

  const prompt = sanitizeString(body.prompt as string | undefined, 2000)
  if (!prompt) {
    return NextResponse.json(
      { error: 'Missing required field: prompt' },
      { status: 400 },
    )
  }

  const formatRaw = sanitizeString(body.format as string | undefined, 10) || DEFAULT_FORMAT
  const format = (VALID_FORMATS as readonly string[]).includes(formatRaw)
    ? (formatRaw as MeshyFormat)
    : DEFAULT_FORMAT

  const typeRaw = sanitizeString(body.type as string | undefined, 20) || DEFAULT_TYPE
  const type = (VALID_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as MeshyType)
    : DEFAULT_TYPE

  const artStyleRaw = sanitizeString(body.art_style as string | undefined, 20) || DEFAULT_ART_STYLE
  const artStyle = (VALID_ART_STYLES as readonly string[]).includes(artStyleRaw)
    ? (artStyleRaw as MeshyArtStyle)
    : DEFAULT_ART_STYLE

  const mode = (sanitizeString(body.mode as string | undefined, 12) || 'preview').toLowerCase()
  const validMode = mode === 'refine' ? 'refine' : 'preview'

  const agentSlug = sanitizeString(body.agent_slug as string | undefined, 60) || null
  const caller = sanitizeString(body.caller as string | undefined, 40) || 'api'
  const resolvedClientId = resolveClientIdFromBody(body)

  const meshyKey = process.env.MESHY_API_KEY
  if (!meshyKey) {
    return NextResponse.json(
      { error: 'MESHY_API_KEY not configured', code: 'E-MESHY-CONFIG' },
      { status: 500 },
    )
  }

  const supabase = getSupabaseAdmin()
  const startedAt = Date.now()

  capture('3d_generation_invoked', resolvedClientId ?? 'system', {
    model: DEFAULT_MODEL,
    format,
    type,
    art_style: artStyle,
    mode: validMode,
    agent_slug: agentSlug,
    caller,
    has_client_id: !!resolvedClientId,
  })

  // --- 1. POST /v2/text-to-3d · create task ---------------------------------
  let createBody: MeshyTaskResponse
  let createStatus = 0
  try {
    const createRes = await fetch(`${MESHY_API_BASE}/text-to-3d`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meshyKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: validMode,
        prompt,
        art_style: artStyle,
        should_remesh: true,
        ai_model: DEFAULT_MODEL,
      }),
    })
    createStatus = createRes.status
    createBody = (await createRes.json()) as MeshyTaskResponse
  } catch (err) {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      type,
      artStyle,
      format,
      caller,
      durationMs: Date.now() - startedAt,
      errorMessage: `fetch_failed · ${err instanceof Error ? err.message : 'unknown'}`,
    })
    return NextResponse.json(
      { error: 'meshy_fetch_failed', detail: String(err) },
      { status: 502 },
    )
  }

  const taskId = createBody.result
  if (createStatus >= 400 || !taskId) {
    const errMsg = createBody.error?.message || `meshy_status_${createStatus}`
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      type,
      artStyle,
      format,
      caller,
      durationMs: Date.now() - startedAt,
      errorMessage: errMsg,
      raw: createBody as unknown,
    })
    const status = createStatus === 401 || createStatus === 403 ? createStatus : 502
    return NextResponse.json(
      {
        error: 'meshy_create_failed',
        detail: errMsg,
        upstream_status: createStatus,
      },
      { status },
    )
  }

  // --- 2. Poll task status until SUCCEEDED / FAILED / timeout ---------------
  const poll = await pollMeshyTask(taskId, meshyKey)
  if (poll.kind === 'timeout') {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      type,
      artStyle,
      format,
      caller,
      meshyTaskId: taskId,
      durationMs: Date.now() - startedAt,
      errorMessage: `poll_timeout · last_status=${poll.lastStatus}`,
      status: 'timeout',
    })
    return NextResponse.json(
      {
        error: 'meshy_poll_timeout',
        detail: `Last status ${poll.lastStatus} after ${POLL_TIMEOUT_MS}ms`,
        meshy_task_id: taskId,
      },
      { status: 504 },
    )
  }
  if (poll.kind === 'failed') {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      type,
      artStyle,
      format,
      caller,
      meshyTaskId: taskId,
      durationMs: Date.now() - startedAt,
      errorMessage: poll.error,
      raw: poll.raw as unknown,
    })
    return NextResponse.json(
      {
        error: 'meshy_task_failed',
        detail: poll.error,
        meshy_task_id: taskId,
      },
      { status: 502 },
    )
  }

  // poll.kind === 'success'
  const meshyData = poll.data
  const modelUrl = meshyData.model_urls?.[format]
  if (!modelUrl) {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      type,
      artStyle,
      format,
      caller,
      meshyTaskId: taskId,
      durationMs: Date.now() - startedAt,
      errorMessage: `no_model_url_for_format · ${format}`,
      raw: meshyData as unknown,
    })
    return NextResponse.json(
      {
        error: 'meshy_no_model_url',
        detail: `Meshy succeeded but did not return a model URL for format ${format}`,
        available_formats: Object.keys(meshyData.model_urls ?? {}),
      },
      { status: 502 },
    )
  }

  // --- 3. Download model + upload to Supabase Storage -----------------------
  let modelBuffer: Buffer
  try {
    const dl = await fetch(modelUrl)
    if (!dl.ok) throw new Error(`download_status_${dl.status}`)
    modelBuffer = Buffer.from(await dl.arrayBuffer())
  } catch (err) {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      type,
      artStyle,
      format,
      caller,
      meshyTaskId: taskId,
      durationMs: Date.now() - startedAt,
      errorMessage: `model_download_failed · ${err instanceof Error ? err.message : 'unknown'}`,
    })
    return NextResponse.json(
      { error: 'meshy_model_download_failed', detail: String(err) },
      { status: 502 },
    )
  }

  const slug = await resolveClientSlug(supabase, resolvedClientId)
  const generationId = randomUUID()
  const timestamp = Date.now()
  const storagePath = `${slug}/3d-models/${timestamp}-${generationId.slice(0, 8)}.${format}`
  const mimeType = mimeForFormat(format)

  const uploadRes = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, modelBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadRes.error) {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      type,
      artStyle,
      format,
      caller,
      meshyTaskId: taskId,
      durationMs: Date.now() - startedAt,
      errorMessage: `storage_upload_failed · ${uploadRes.error.message}`,
    })
    return NextResponse.json(
      { error: 'storage_upload_failed', detail: uploadRes.error.message },
      { status: 500 },
    )
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath)
  const publicModelUrl = publicUrlData.publicUrl

  const costUsd = PRICING_BY_MODE[validMode] ?? PRICING_BY_MODE.preview
  const durationMs = Date.now() - startedAt

  // --- 4. Persist agent_3d_generations row ---------------------------------
  const { data: row, error: insertError } = await supabase
    .from('agent_3d_generations')
    .insert({
      id: generationId,
      client_id: resolvedClientId,
      agent_slug: agentSlug,
      prompt,
      art_style: artStyle,
      format,
      type,
      meshy_task_id: taskId,
      storage_path: storagePath,
      model_url: publicModelUrl,
      thumbnail_url: meshyData.thumbnail_url ?? null,
      polycount: meshyData.polycount ?? null,
      model: DEFAULT_MODEL,
      cost_usd: costUsd,
      duration_ms: durationMs,
      status: 'completed',
      caller,
      raw_response: { task_id: taskId, art_style: meshyData.art_style ?? artStyle, mode: validMode },
    })
    .select('id, created_at')
    .single()

  if (insertError) {
    console.error('[3d/generate] insert failed:', insertError.message)
  }

  capture('3d_generation_completed', resolvedClientId ?? 'system', {
    model: DEFAULT_MODEL,
    format,
    cost_usd: costUsd,
    duration_ms: durationMs,
    generation_id: generationId,
  })

  return NextResponse.json({
    success: true,
    generation_id: row?.id ?? generationId,
    model_id: taskId,
    model_url: publicModelUrl,
    thumbnail_url: meshyData.thumbnail_url ?? null,
    storage_path: storagePath,
    format,
    type,
    art_style: artStyle,
    mode: validMode,
    cost_usd: costUsd,
    duration_ms: durationMs,
    model: DEFAULT_MODEL,
    polycount: meshyData.polycount ?? null,
    client_id: resolvedClientId,
    created_at: row?.created_at ?? new Date().toISOString(),
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/3d/generate',
    method: 'POST',
    model: DEFAULT_MODEL,
    formats_supported: VALID_FORMATS,
    types_supported: VALID_TYPES,
    art_styles_supported: VALID_ART_STYLES,
    pricing_usd_by_mode: PRICING_BY_MODE,
    body_shape: {
      prompt: 'string (required · max 2000)',
      client_id: 'string (optional · multi-path resolver Fix 8b)',
      agent_slug: 'string (optional)',
      type: '"object" | "character" | "environment" (default object)',
      format: '"glb" | "fbx" | "obj" | "usdz" (default glb)',
      art_style: '"realistic" | "cartoon" | "low-poly" | "sculpture" | "pbr" (default realistic)',
      mode: '"preview" | "refine" (default preview · refine adds PBR maps · 2.5x cost)',
      caller: 'string (optional · audit attribution)',
    },
  })
}

// --- helpers ---------------------------------------------------------------

type PollResult =
  | { kind: 'success'; data: MeshyPollResponse }
  | { kind: 'failed'; error: string; raw: MeshyPollResponse }
  | { kind: 'timeout'; lastStatus: string }

async function pollMeshyTask(
  taskId: string,
  meshyKey: string,
): Promise<PollResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let lastStatus: string = 'PENDING'
  while (Date.now() < deadline) {
    let body: MeshyPollResponse
    try {
      const res = await fetch(`${MESHY_API_BASE}/text-to-3d/${taskId}`, {
        headers: { Authorization: `Bearer ${meshyKey}` },
      })
      body = (await res.json()) as MeshyPollResponse
    } catch (err) {
      return {
        kind: 'failed',
        error: `poll_fetch_failed · ${err instanceof Error ? err.message : 'unknown'}`,
        raw: {} as MeshyPollResponse,
      }
    }
    lastStatus = body.status ?? 'unknown'
    if (body.status === 'SUCCEEDED') return { kind: 'success', data: body }
    if (body.status === 'FAILED' || body.status === 'CANCELED') {
      return {
        kind: 'failed',
        error:
          body.task_error?.message ||
          body.error?.message ||
          `meshy_status_${body.status}`,
        raw: body,
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return { kind: 'timeout', lastStatus }
}

async function resolveClientSlug(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clientId: string | null,
): Promise<string> {
  if (!clientId) return 'system'
  try {
    const { data } = await supabase
      .from('clients')
      .select('slug')
      .eq('id', clientId)
      .maybeSingle()
    const slug = (data?.slug as string | undefined) ?? null
    return slug && /^[a-z0-9_-]+$/i.test(slug) ? slug : 'system'
  } catch {
    return 'system'
  }
}

function mimeForFormat(format: MeshyFormat): string {
  switch (format) {
    case 'glb':
      return 'model/gltf-binary'
    case 'fbx':
      return 'application/octet-stream'
    case 'obj':
      return 'text/plain'
    case 'usdz':
      return 'application/vnd.usdz+zip'
  }
}

async function persistFailure(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>
  clientId: string | null
  agentSlug: string | null
  prompt: string
  type: MeshyType
  artStyle: MeshyArtStyle
  format: MeshyFormat
  caller: string
  meshyTaskId?: string
  durationMs: number
  errorMessage: string
  status?: 'failed' | 'timeout'
  raw?: unknown
}) {
  try {
    await params.supabase.from('agent_3d_generations').insert({
      client_id: params.clientId,
      agent_slug: params.agentSlug,
      prompt: params.prompt,
      art_style: params.artStyle,
      format: params.format,
      type: params.type,
      meshy_task_id: params.meshyTaskId ?? null,
      model: DEFAULT_MODEL,
      cost_usd: 0,
      duration_ms: params.durationMs,
      status: params.status ?? 'failed',
      error_message: params.errorMessage,
      caller: params.caller,
      raw_response: params.raw ? (params.raw as Record<string, unknown>) : null,
    })
  } catch (err) {
    console.error('[3d/generate] persistFailure insert failed:', err)
  }
}
