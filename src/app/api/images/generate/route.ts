import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'
import { resolveClientIdFromBody } from '@/lib/client-id-resolver'
import { capture } from '@/lib/posthog'
import { PRICING_BY_SIZE, priceForSize } from '@/lib/image-pricing'
import { randomUUID } from 'node:crypto'

// Sprint #6 Brazo 1 · GPT Image generation wrapper
//
// POST /api/images/generate
// Body: { prompt, client_id?, agent_slug?, size?, model?, caller? }
// Uses gpt-image-1 (Stack canonical · STACK_FINAL_V3). The model returns
// base64 only (no `response_format: "url"` like DALL-E 3), so we decode and
// upload to the `agent-images` Supabase Storage bucket to produce a stable
// public URL the caller can paste into Notion / GHL / dashboards.

const STORAGE_BUCKET = 'agent-images'
const DEFAULT_MODEL = 'gpt-image-1'
const DEFAULT_SIZE = '1024x1024'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  const prompt = sanitizeString(body.prompt as string | undefined, 4000)
  if (!prompt) {
    return NextResponse.json(
      { error: 'Missing required field: prompt' },
      { status: 400 },
    )
  }

  const size = sanitizeString(body.size as string | undefined, 20) || DEFAULT_SIZE
  const model = sanitizeString(body.model as string | undefined, 50) || DEFAULT_MODEL
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

  capture('image_generation_invoked', resolvedClientId ?? 'system', {
    model,
    size,
    agent_slug: agentSlug,
    caller,
    has_client_id: !!resolvedClientId,
  })

  // --- 1. Call OpenAI Images API -------------------------------------------
  let openaiData: {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>
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
      body: JSON.stringify({ prompt, model, size, n: 1 }),
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

  if (openaiStatus >= 400 || !openaiData?.data?.[0]?.b64_json) {
    const errMsg = openaiData?.error?.message || `openai_status_${openaiStatus}`
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
  const b64 = openaiData.data[0].b64_json!
  const revisedPrompt = openaiData.data[0].revised_prompt ?? null
  const imageBuffer = Buffer.from(b64, 'base64')
  const generationId = randomUUID()
  const storagePath = `${resolvedClientId ?? 'system'}/${generationId}.png`

  const uploadRes = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: 'image/png',
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
  const costUsd = priceForSize(size)

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
      raw_response: { revised_prompt: revisedPrompt },
    })
    .select('id, created_at')
    .single()

  if (insertError) {
    // Hard fail · we have the image in Storage but no audit row. Caller
    // gets the URL anyway so the work isn't lost, but logs the failure.
    console.error('[images/generate] insert failed:', insertError.message)
  }

  capture('image_generation_completed', resolvedClientId ?? 'system', {
    model,
    size,
    cost_usd: costUsd,
    generation_id: generationId,
  })

  return NextResponse.json({
    success: true,
    generation_id: row?.id ?? generationId,
    image_url: imageUrl,
    storage_path: storagePath,
    revised_prompt: revisedPrompt,
    cost_usd: costUsd,
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
    model: DEFAULT_MODEL,
    sizes_supported: Object.keys(PRICING_BY_SIZE),
    pricing_usd: PRICING_BY_SIZE,
    body_shape: {
      prompt: 'string (required)',
      client_id: 'string (optional · multi-path resolver Fix 8b)',
      agent_slug: 'string (optional)',
      size: '"1024x1024" | "1024x1536" | "1536x1024"',
      model: 'string (default gpt-image-1)',
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
