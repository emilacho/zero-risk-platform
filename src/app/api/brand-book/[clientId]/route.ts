/**
 * GET /api/brand-book/[clientId]
 *
 * Returns the latest Brand Book v0 for a client (clients + client_brand_books +
 * client_icp_documents) as a single JSON payload. Used by the brand-book viewer
 * page and any external consumer that wants the structured brand assets.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ clientId: string }>
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ error: 'missing_client_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const [clientRes, brandBookRes, icpsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, slug, industry, market, status')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('client_brand_books')
      .select('*')
      .eq('client_id', clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_icp_documents')
      .select('*')
      .eq('client_id', clientId)
      .order('segment_priority', { ascending: true }),
  ])

  if (!clientRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    client: clientRes.data,
    brand_book: brandBookRes.data ?? null,
    icps: icpsRes.data ?? [],
    approved: brandBookRes.data?.human_validated === true,
  })
}

/**
 * POST /api/brand-book/[clientId]
 *
 * Persiste un brand book en `client_brand_books` (paso Promote → canon del track
 * colaborativo · gateado por FIDELIDAD, no por firma humana). Endpoint canónico de
 * ESCRITURA · antes solo existía el GET + el insert dentro de /api/clients/upsert ·
 * el track llamaba a un path inexistente (/api/clients/{id}/brand-book · 404 HTML).
 * Auth interna · x-api-key === INTERNAL_API_KEY (mismo patrón run-sdk).
 * §148 · el draft completo (positioning/icp/customer/retention · sin columna propia)
 * se preserva en content_text como JSON · los campos con columna se mapean directo.
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ error: 'missing_client_id' }, { status: 400 })
  }
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const bb = (body.brand_book as Record<string, unknown>) || {}
  if (!bb || Object.keys(bb).length === 0) {
    return NextResponse.json({ error: 'missing_brand_book' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // FIX 2026-07-01 · IDEMPOTENCIA · el loop de fidelidad puede correr ciclos extra tras
  // persistir (judge no-determinístico · pasa un ciclo, falla otro). Si YA existe un brand
  // book para el cliente, devolvemos el existente SIN crear duplicado (detect persist=true).
  const existing = await supabase
    .from('client_brand_books')
    .select('id')
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing.data?.id) {
    return NextResponse.json({
      persisted: true,
      already_existed: true,
      id: existing.data.id,
      client_id: clientId,
    })
  }

  const row: Record<string, unknown> = {
    client_id: clientId,
    voice_description: bb.voice_description ?? null,
    forbidden_words: bb.forbidden_words ?? [],
    required_terminology: bb.required_terminology ?? [],
    // positioning es un statement de posicionamiento · encaja en elevator_pitch.
    elevator_pitch: bb.positioning ?? null,
    // el draft completo (incl. icp_summary/customer_angle/retention_notes que no tienen
    // columna) se preserva en content_text como JSON · nada se pierde.
    content_text: JSON.stringify({
      brand_book_draft: bb,
      fidelity_passed: body.fidelity_passed === true,
      fidelity_scores: body.fidelity_scores ?? null,
      fidelity_threshold: body.fidelity_threshold ?? null,
      approved_by: body.approved_by ?? 'faithfulness_check',
      approved_at: body.approved_at ?? new Date().toISOString(),
    }),
    auto_generated: true,
    auto_generated_from: body.source ?? 'onboarding_collaborative_build',
    human_validated: false,
    version: 1,
  }

  const { data, error } = await supabase
    .from('client_brand_books')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    return NextResponse.json(
      { persisted: false, error: 'insert_failed', detail: error.message?.slice(0, 400) },
      { status: 500 },
    )
  }
  return NextResponse.json({ persisted: true, id: data?.id, client_id: clientId })
}
