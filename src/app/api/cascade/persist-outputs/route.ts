/**
 * POST /api/cascade/persist-outputs
 *
 * CC#2 Path D · 2026-05-16 · serves the new n8n workflow `Zero Risk —
 * Cliente Nuevo · Landing Cascade Master` (file path
 * `n8n-workflows/tier-1/cliente-nuevo-landing-cascade-master.json`). The
 * workflow drives the 9-agent cascade and posts the assembled outputs
 * map here for Storage persistence. This endpoint is intentionally
 * single-responsibility · Storage I/O only · NO agent invocations · NO
 * Anthropic spend · NO Vercel 5-min timeout risk.
 *
 * Replaces the all-in-one `/api/cascade/onboard` route (now deprecated)
 * per the canonical rule canonized in CLAUDE.md
 * "multi-agent cascades viven en n8n workflows · NO Vercel endpoints
 * directos · Capa 2 strict".
 *
 * Auth · `x-api-key INTERNAL_API_KEY`.
 *
 * Body shape:
 *   {
 *     client_id: string (uuid),
 *     slug: string,
 *     version?: string,  // default 'v2'
 *     task_id?: string,
 *     outputs: Record<string, unknown>  // keyed by agent stage
 *   }
 *
 * Persists to bucket `client-websites` under path
 * `{slug}/{version}/cascade-summary-{version}.json` plus one file per
 * non-null output stage at
 * `{slug}/{version}/agents-outputs/{stage}.json`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STORAGE_BUCKET = 'client-websites'

interface PersistBody {
  client_id?: string
  slug?: string
  version?: string
  task_id?: string
  outputs?: Record<string, unknown>
}

interface UploadResult {
  path: string
  ok: boolean
  error?: string | null
  bytes?: number
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: PersistBody
  try {
    body = (await request.json()) as PersistBody
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-INPUT-PARSE' },
      { status: 400 },
    )
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  const version = (typeof body.version === 'string' && body.version.trim()) || 'v2'
  const taskId = typeof body.task_id === 'string' ? body.task_id : null
  const outputs = body.outputs && typeof body.outputs === 'object' ? body.outputs : null

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: 'slug required', code: 'E-PERSIST-SLUG' },
      { status: 400 },
    )
  }
  if (!outputs) {
    return NextResponse.json(
      { ok: false, error: 'outputs map required', code: 'E-PERSIST-OUTPUTS' },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()
  const baseDir = `${slug}/${version}`
  const uploads: UploadResult[] = []

  // Per-stage outputs · one file per non-null output stage
  for (const [stage, payload] of Object.entries(outputs)) {
    if (payload === null || payload === undefined) continue
    const path = `${baseDir}/agents-outputs/${stage}.json`
    const json = JSON.stringify(payload, null, 2)
    const up = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, json, { contentType: 'application/json', upsert: true })
    uploads.push({ path, ok: !up.error, error: up.error?.message ?? null, bytes: json.length })
  }

  // Summary · cascade-summary-{version}.json at the version root
  const summary = {
    ok: true,
    client_id: clientId,
    slug,
    version,
    task_id: taskId,
    persisted_at: new Date().toISOString(),
    stages: Object.keys(outputs).filter(k => outputs[k] !== null && outputs[k] !== undefined),
    outputs,
  }
  const summaryPath = `${baseDir}/cascade-summary-${version}.json`
  const summaryJson = JSON.stringify(summary, null, 2)
  const summaryUp = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(summaryPath, summaryJson, { contentType: 'application/json', upsert: true })
  uploads.push({
    path: summaryPath,
    ok: !summaryUp.error,
    error: summaryUp.error?.message ?? null,
    bytes: summaryJson.length,
  })

  const okCount = uploads.filter(u => u.ok).length
  return NextResponse.json({
    ok: okCount === uploads.length,
    client_id: clientId,
    slug,
    version,
    bucket: STORAGE_BUCKET,
    base_dir: baseDir,
    uploads_total: uploads.length,
    uploads_ok: okCount,
    uploads_failed: uploads.length - okCount,
    uploads,
    timestamp: new Date().toISOString(),
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cascade/persist-outputs',
    method: 'POST',
    purpose:
      'Storage-only persist for n8n Cliente Nuevo · Landing Cascade Master workflow · canonical Capa 2 architecture (CLAUDE.md governance 2026-05-16)',
    body_shape: {
      client_id: 'string (uuid)',
      slug: 'string (required · client slug for storage path)',
      version: 'string (optional · default v2)',
      task_id: 'string (optional)',
      outputs: 'Record<string, unknown> · keyed by agent stage · null/undefined values skipped',
    },
    storage: {
      bucket: STORAGE_BUCKET,
      per_stage_path: '{slug}/{version}/agents-outputs/{stage}.json',
      summary_path: '{slug}/{version}/cascade-summary-{version}.json',
    },
  })
}
