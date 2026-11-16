/**
 * GET /api/meta-social/insights/[post_id]
 *
 * Fetch insights for a Meta Graph post (FB feed/photo or IG media) via Graph
 * API v21 `/:post_id/insights`. Returns metric → value/period map.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`
 *
 * Required Meta env vars (Vercel project) · 503 'not_configured' if missing:
 *   - META_ACCESS_TOKEN (or platform-specific tokens) · same scopes used at
 *     publish time
 *
 * Query · ?platform=facebook|instagram (default `facebook`) · selects the
 * default metric set per platform · also `?metrics=metric1,metric2` to
 * override.
 *
 * Default metric sets (medidos contra Meta el 16-nov · CC3: `post_impressions`, `post_engaged_users`,
 * `impressions` y `engagement` ya NO existen y hacían fallar TODA la lectura):
 *   - facebook · post_media_view, post_clicks, post_reactions_like_total, post_reactions_by_type_total
 *   - instagram · reach, views, likes, comments, saved, shares, total_interactions
 *
 * Facebook · con `?client_id=` se lee con el token DE LA PÁGINA del cliente (su ficha, ver
 * `lib/clients/cuentas-meta.ts`): Facebook rechaza el token del sistema para los posts de una página.
 *
 * Read-only · no agent_invocations write (it's a read).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { META_GRAPH_BASE, leerCuentasMeta, tokenDePagina } from '@/lib/clients/cuentas-meta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_METRICS: Record<'facebook' | 'instagram', string[]> = {
  facebook: ['post_media_view', 'post_clicks', 'post_reactions_like_total', 'post_reactions_by_type_total'],
  instagram: ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions'],
}

interface InsightValue {
  value: unknown
  end_time?: string
}
interface InsightDatum {
  name?: string
  period?: string
  title?: string
  description?: string
  values?: InsightValue[]
}
interface GraphInsightsResp {
  data?: InsightDatum[]
  error?: { message?: string; type?: string; code?: number }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ post_id: string }> },
) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const { post_id } = await context.params
  if (!post_id) {
    return NextResponse.json(
      { ok: false, error: 'post_id required', code: 'E-META-INSIGHTS-ID' },
      { status: 400 },
    )
  }

  const url = new URL(request.url)
  const platformParam = (url.searchParams.get('platform') || 'facebook').toLowerCase()
  const platform: 'facebook' | 'instagram' =
    platformParam === 'instagram' ? 'instagram' : 'facebook'
  const metricsParam = url.searchParams.get('metrics')
  const metrics =
    (metricsParam ? metricsParam.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_METRICS[platform])

  let token = process.env.META_ACCESS_TOKEN || process.env.META_FB_PAGE_ACCESS_TOKEN || process.env.META_IG_ACCESS_TOKEN || ''
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: 'not_configured',
        code: 'E-META-INSIGHTS-CONFIG-MISSING',
        missing: ['META_ACCESS_TOKEN (or META_FB_PAGE_ACCESS_TOKEN / META_IG_ACCESS_TOKEN)'],
      },
      { status: 503 },
    )
  }

  // Facebook + cliente · el token de SU página (el del sistema no sirve para los posts de una página)
  const clientId = (url.searchParams.get('client_id') || '').trim()
  if (platform === 'facebook' && clientId) {
    const lectura = await leerCuentasMeta(getSupabaseAdmin(), clientId)
    if (!lectura.ok) {
      return NextResponse.json(
        { ok: false, error: lectura.motivo, code: 'E-META-INSIGHTS-CLIENT', detail: lectura.detalle ?? null },
        { status: lectura.motivo === 'cliente_no_existe' ? 404 : 502 },
      )
    }
    const pageId = lectura.cuentas.pagina_facebook
    if (!pageId) {
      return NextResponse.json(
        { ok: false, error: 'cliente_sin_pagina_facebook', code: 'E-META-INSIGHTS-CLIENT' },
        { status: 409 },
      )
    }
    const pagina = await tokenDePagina(pageId, token)
    if (!pagina.ok) {
      return NextResponse.json(
        { ok: false, error: 'sin_acceso_a_la_pagina', code: 'E-META-INSIGHTS-PAGE', detail: pagina.detalle },
        { status: 502 },
      )
    }
    token = pagina.token
  }

  const graphUrl =
    `${META_GRAPH_BASE}/${encodeURIComponent(post_id)}/insights` +
    `?metric=${encodeURIComponent(metrics.join(','))}` +
    `&access_token=${encodeURIComponent(token)}`

  let resp: Response
  try {
    resp = await fetch(graphUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'graph_fetch_failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
  const json = (await resp.json().catch(() => ({}))) as GraphInsightsResp
  if (!resp.ok) {
    const errMsg = json.error?.message || `status_${resp.status}`
    return NextResponse.json(
      {
        ok: false,
        error: 'meta_insights_failed',
        upstream_status: resp.status,
        detail: errMsg,
      },
      { status: resp.status >= 400 && resp.status < 500 ? resp.status : 502 },
    )
  }

  // Flatten the insights array into { metric_name: { value, period, title } }
  const insights: Record<string, { value: unknown; period: string | null; title: string | null }> = {}
  for (const datum of json.data ?? []) {
    if (!datum.name) continue
    const last = datum.values?.[datum.values.length - 1]
    insights[datum.name] = {
      value: last?.value ?? null,
      period: datum.period ?? null,
      title: datum.title ?? null,
    }
  }

  return NextResponse.json({
    ok: true,
    platform,
    post_id,
    metrics_requested: metrics,
    insights,
    raw: json.data ?? [],
    timestamp: new Date().toISOString(),
  })
}
