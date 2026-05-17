/**
 * POST /api/onboarding/trigger-cascade
 *
 * Proxy desde el wizard de onboarding al webhook n8n del workflow
 * `cliente-nuevo-landing-cascade-master`. El wizard arma el payload completo
 * (cliente + brand + assets) y este endpoint hace el forward con auth +
 * normalization mínima.
 *
 * Body shape (from wizard):
 *   {
 *     slug, client_name, industry, website_url, instagram_handle,
 *     brand: { logo_url, primary_color, accent_color, voice_tone, target_audience, brand_keywords },
 *     assets: [{ name, type, public_url }],
 *     onboarding_session_id, caller
 *   }
 *
 * Returns:
 *   { ok, execution_id, webhook_url, started_at }
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

interface TriggerBody {
  slug?: string
  client_name?: string
  industry?: string
  website_url?: string
  instagram_handle?: string | null
  brand?: {
    logo_url?: string | null
    primary_color?: string
    accent_color?: string
    voice_tone?: string
    target_audience?: string
    brand_keywords?: string[]
  }
  assets?: Array<{ name: string; type: string; public_url: string }>
  onboarding_session_id?: string | null
  caller?: string
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function POST(request: Request) {
  let body: TriggerBody
  try {
    body = (await request.json()) as TriggerBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 })
  }

  if (!body.slug || !SLUG_PATTERN.test(body.slug)) {
    return NextResponse.json({ ok: false, error: 'invalid_slug', code: 'E-TRIGGER-SLUG' }, { status: 400 })
  }
  if (!body.client_name) {
    return NextResponse.json({ ok: false, error: 'client_name_required', code: 'E-TRIGGER-NAME' }, { status: 400 })
  }

  const baseUrl = process.env.N8N_WEBHOOK_BASE_URL || 'https://n8n.zero-risk.com'
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/webhook/zero-risk/cliente-nuevo-landing`

  const payload = {
    slug: body.slug,
    client_name: body.client_name,
    industry: body.industry || '',
    website_url: body.website_url || '',
    instagram_handle: body.instagram_handle || null,
    brand: body.brand || {},
    assets: body.assets || [],
    onboarding_session_id: body.onboarding_session_id || null,
    caller: body.caller || 'onboarding-wizard',
    triggered_at: new Date().toISOString(),
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_TOKEN ? { 'x-n8n-token': process.env.N8N_WEBHOOK_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    })

    let upstream: unknown = null
    try {
      upstream = await res.json()
    } catch {
      upstream = await res.text().catch(() => null)
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'n8n_webhook_rejected',
          upstream_status: res.status,
          upstream_body: upstream,
          webhook_url: webhookUrl,
        },
        { status: 502 },
      )
    }

    const executionId =
      (upstream as { executionId?: string; execution_id?: string; data?: { executionId?: string } } | null)
        ?.executionId ||
      (upstream as { execution_id?: string } | null)?.execution_id ||
      (upstream as { data?: { executionId?: string } } | null)?.data?.executionId ||
      null

    return NextResponse.json({
      ok: true,
      execution_id: executionId,
      webhook_url: webhookUrl,
      started_at: payload.triggered_at,
      upstream,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'n8n_webhook_fetch_failed',
        detail: err instanceof Error ? err.message : String(err),
        webhook_url: webhookUrl,
      },
      { status: 502 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/onboarding/trigger-cascade',
    method: 'POST',
    purpose: 'Forward onboarding wizard payload to n8n cliente-nuevo-landing webhook',
    env: {
      N8N_WEBHOOK_BASE_URL: process.env.N8N_WEBHOOK_BASE_URL ? 'set' : 'unset',
      N8N_WEBHOOK_TOKEN: process.env.N8N_WEBHOOK_TOKEN ? 'set' : 'unset',
    },
  })
}
