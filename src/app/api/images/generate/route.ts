import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { capture } from '@/lib/posthog'
import { PRICING_BY_SIZE, costForImage, type ImageUsage } from '@/lib/image-pricing'
import { imageBytesFromItem, sniffImageFormat, type ImagesApiItem } from '@/lib/image-response'
import { randomUUID } from 'node:crypto'
import { checkInternalKey } from '@/lib/internal-auth'
import { registrarImagenEnElLibro } from '@/lib/image-ledger'

// Sprint #6 Brazo 1 · GPT Image generation wrapper
//
// POST /api/images/generate
// Body: { prompt, client_id?, agent_slug?, size?, model?, caller? }
// Modelo: body.model › env IMAGE_MODEL › 'gpt-image-1' (se retira el 23-oct-2026;
// el reemplazo se activa cambiando IMAGE_MODEL, sin tocar código). La respuesta
// puede traer `b64_json` o `url`: en ambos casos se sube al bucket
// `agent-images` de Supabase Storage para dar una URL pública estable que el
// llamador pueda pegar en Notion / dashboards. Costo: real por tokens si la
// respuesta trae `usage` (ver image-pricing.ts).

const STORAGE_BUCKET = 'agent-images'
const FALLBACK_MODEL = 'gpt-image-1'
const QUALITIES = new Set(['low', 'medium', 'high', 'auto'])

/** Modelo por defecto · leído en cada pedido para que un cambio de env aplique sin redeploy de código. */
function defaultModel(): string {
  return sanitizeString(process.env.IMAGE_MODEL, 50) || FALLBACK_MODEL
}
const DEFAULT_SIZE = '1024x1024'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }

  const prompt = sanitizeString(body.prompt as string | undefined, 4000)
  if (!prompt) {
    return NextResponse.json(
      { error: 'Missing required field: prompt' },
      { status: 400 },
    )
  }

  const size = sanitizeString(body.size as string | undefined, 20) || DEFAULT_SIZE
  const model = sanitizeString(body.model as string | undefined, 50) || defaultModel()
  const qualityRaw = sanitizeString(body.quality as string | undefined, 10)
  const quality = qualityRaw && QUALITIES.has(qualityRaw) ? qualityRaw : null
  const agentSlug = sanitizeString(body.agent_slug as string | undefined, 60) || null
  const caller = sanitizeString(body.caller as string | undefined, 40) || 'api'
  const resolvedClientId = resolveClientIdFromBody(body)

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY not configured', code: 'E-OPENAI-CONFIG' },
      { status: 500 },
    )
  }

  const supabase = getSupabaseAdmin()
  const startedAtMs = Date.now()

  capture('image_generation_invoked', resolvedClientId ?? 'system', {
    model,
    size,
    agent_slug: agentSlug,
    caller,
    has_client_id: !!resolvedClientId,
  })

  // --- 1. Call OpenAI Images API -------------------------------------------
  let openaiData: {
    data?: ImagesApiItem[]
    usage?: ImageUsage
    error?: { message?: string; type?: string }
  }
  let openaiStatus = 0
  try {
    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, model, size, n: 1, ...(quality ? { quality } : {}) }),
    })
    openaiStatus = openaiRes.status
    openaiData = await openaiRes.json()
  } catch (err) {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      model,
      size,
      caller,
      errorMessage: `fetch_failed · ${err instanceof Error ? err.message : 'unknown'}`,
    })
    return NextResponse.json(
      { error: 'openai_fetch_failed', detail: String(err) },
      { status: 502 },
    )
  }

  const imageBuffer =
    openaiStatus < 400 ? await imageBytesFromItem(openaiData?.data?.[0]) : null

  if (openaiStatus >= 400 || !imageBuffer) {
    const errMsg =
      openaiData?.error?.message ||
      (openaiStatus < 400 ? 'no_image_in_response' : `openai_status_${openaiStatus}`)
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      model,
      size,
      caller,
      errorMessage: errMsg,
      raw: openaiData,
    })
    // Map OpenAI 401/403 (scope) to a recognizable code for the caller; other
    // failures bubble through as 502.
    const status = openaiStatus === 401 || openaiStatus === 403 ? openaiStatus : 502
    return NextResponse.json(
      {
        error: 'openai_image_failed',
        detail: errMsg,
        upstream_status: openaiStatus,
      },
      { status },
    )
  }

  // --- 2. Decode + upload to Supabase Storage -----------------------------
  const revisedPrompt = openaiData.data?.[0]?.revised_prompt ?? null
  const format = sniffImageFormat(imageBuffer)
  const generationId = randomUUID()
  const storagePath = `${resolvedClientId ?? 'system'}/${generationId}.${format.ext}`

  const uploadRes = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: format.contentType,
      upsert: false,
    })

  if (uploadRes.error) {
    await persistFailure({
      supabase,
      clientId: resolvedClientId,
      agentSlug,
      prompt,
      model,
      size,
      caller,
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
  const imageUrl = publicUrlData.publicUrl

  // --- 3. Persist agent_image_generations row -----------------------------
  const { cost_usd: costUsd, basis: costBasis } = costForImage({
    model,
    size,
    usage: openaiData.usage,
  })

  const { data: row, error: insertError } = await supabase
    .from('agent_image_generations')
    .insert({
      id: generationId,
      client_id: resolvedClientId,
      agent_slug: agentSlug,
      prompt,
      revised_prompt: revisedPrompt,
      storage_path: storagePath,
      image_url: imageUrl,
      size,
      model,
      cost_usd: costUsd,
      status: 'completed',
      caller,
      // raw_response excluded · holds the b64 blob which we already store in
      // Storage. Keep DB small.
      raw_response: { revised_prompt: revisedPrompt, usage: openaiData.usage ?? null, cost_basis: costBasis, quality },
    })
    .select('id, created_at')
    .single()

  if (insertError) {
    // Hard fail · we have the image in Storage but no audit row. Caller
    // gets the URL anyway so the work isn't lost, but logs the failure.
    console.error('[images/generate] insert failed:', insertError.message)
  }

  // El costo de la imagen entra TAMBIÉN al libro de invocaciones (una fila por imagen, atada a su generation_id): el freno §150 suma ese libro y antes no veía las imágenes.
  await registrarImagenEnElLibro(supabase, {
    generationId: row?.id ?? generationId, clientId: resolvedClientId, agentSlug, model, size, quality, caller, costUsd, costBasis,
    startedAtMs, endedAtMs: Date.now(),
    workflowId: sanitizeString(body.workflow_id as string | undefined, 80) || null,
    workflowExecutionId: sanitizeString(body.workflow_execution_id as string | undefined, 120) || null,
  })

  capture('image_generation_completed', resolvedClientId ?? 'system', {
    model,
    size,
    cost_usd: costUsd,
    cost_basis: costBasis,
    generation_id: generationId,
  })

  return NextResponse.json({
    success: true,
    generation_id: row?.id ?? generationId,
    image_url: imageUrl,
    storage_path: storagePath,
    revised_prompt: revisedPrompt,
    cost_usd: costUsd,
    cost_basis: costBasis,
    model,
    size,
    client_id: resolvedClientId,
    created_at: row?.created_at ?? new Date().toISOString(),
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/images/generate',
    method: 'POST',
    model: defaultModel(),
    sizes_supported: Object.keys(PRICING_BY_SIZE),
    pricing_usd: PRICING_BY_SIZE,
    body_shape: {
      prompt: 'string (required)',
      client_id: 'string (optional · multi-path resolver Fix 8b)',
      agent_slug: 'string (optional)',
      size: '"1024x1024" | "1024x1536" | "1536x1024"',
      model: 'string (default env IMAGE_MODEL, else gpt-image-1)',
      quality: '"low" | "medium" | "high" | "auto" (optional · omitted = provider default)',
      caller: 'string (optional · audit attribution)',
    },
  })
}

async function persistFailure(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>
  clientId: string | null
  agentSlug: string | null
  prompt: string
  model: string
  size: string
  caller: string
  errorMessage: string
  raw?: unknown
}) {
  try {
    await params.supabase.from('agent_image_generations').insert({
      client_id: params.clientId,
      agent_slug: params.agentSlug,
      prompt: params.prompt,
      model: params.model,
      size: params.size,
      caller: params.caller,
      status: 'failed',
      error_message: params.errorMessage,
      cost_usd: 0,
      raw_response: params.raw ? (params.raw as Record<string, unknown>) : null,
    })
  } catch (err) {
    console.error('[images/generate] persistFailure insert failed:', err)
  }
}
