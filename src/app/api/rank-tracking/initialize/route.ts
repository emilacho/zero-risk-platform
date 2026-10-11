/**
 * POST /api/rank-tracking/initialize
 * Called by the Flagship SEO workflow after Opus synthesis.
 * Body: { client_id, domain, keywords[], locale, duration_days, frequency, track_serp_features[] }
 * Effect: stamps an initial (rank=null) row per keyword so the daily cron knows what to track.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'
import { codigoDePais } from '@/lib/pais/pais-del-cliente'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const _raw = await request.json().catch(() => ({}))
  const _v = validateObject<Record<string, unknown>>(_raw, 'lenient-write')
  if (!_v.ok) return _v.response
  const body = _v.data as Record<string, any>
  const clientId = body.client_id
  const domain = body.domain
  const keywords: string[] = Array.isArray(body.keywords) ? body.keywords.filter(Boolean) : []
  // El país es del CLIENTE: el que manda el llamador, o el de su ficha. Sin ninguno NO se adivina (antes: 'EC' para todos).
  const paisDelLlamador = typeof body.locale?.country === 'string' ? body.locale.country.trim() : ''

  if (!clientId || !domain || keywords.length === 0) {
    return NextResponse.json({ error: 'client_id, domain, keywords[] required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  let country = paisDelLlamador
  if (!country) {
    const { data: ficha } = await supabase.from('clients').select('country').eq('id', clientId).limit(1).maybeSingle()
    country = codigoDePais(ficha?.country) ?? ''
  }
  if (!country) {
    return NextResponse.json({ error: 'pais_requerido', detail: 'ni locale.country en el cuerpo ni un país reconocible en la ficha del cliente (clients.country): no se adivina' }, { status: 400 })
  }

  // Find latest engagement for this domain to anchor tracking rows.
  const { data: engagement } = await supabase
    .from('seo_engagements')
    .select('id')
    .eq('client_id', clientId)
    .eq('domain', domain)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!engagement) {
    return NextResponse.json({ error: 'no engagement found for client+domain' }, { status: 404 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const rows = keywords.map((kw) => ({
    engagement_id: engagement.id,
    client_id: clientId,
    domain,
    keyword: kw,
    country,
    rank: null,
    serp_features: [],
    checked_at: today,
  }))

  // Upsert so re-init is safe.
  const { error } = await supabase
    .from('rank_tracking_daily')
    .upsert(rows, { onConflict: 'engagement_id,keyword,country,checked_at', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, engagement_id: engagement.id, keywords_initialized: keywords.length })
}
