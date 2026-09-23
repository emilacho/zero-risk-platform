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
import { sanitizeProseFields } from '@/lib/brand-book-caveat-extractor'
import { empujarManualAlCerebro } from '@/lib/brain/push-al-terminar'

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
 * Arma la fila que se inserta en `client_brand_books`.
 *
 * Extraído del handler para poder probarlo sin HTTP ni Supabase (mismo patrón que
 * `isRetriableRailwayProxyFailure` en agents/run-sdk). Función pura · sin efectos.
 */
export function buildBrandBookRow(
  clientId: string,
  bb: Record<string, unknown>,
  body: Record<string, unknown>,
  // E111 · la versión la decide el handler (max(version) del cliente + 1) · 1 si no hay ninguna.
  version: number = 1,
): Record<string, unknown> {
  // La advertencia que el empleado escribe sobre su propio trabajo sale de la
  // PROSA y pasa a ser un dato. No se borra: se mueve a `_caveats`. Medido en la
  // corrida de GoEuropeAdventure (manual 5648b126), donde `voice_description`
  // terminaba con "ADVERTENCIA DE CONFIANZA BAJA: ... (apify_sources vacio)".
  // Un manual sin advertencias sale byte-identico al de hoy.
  const prose = sanitizeProseFields(bb)
  const clean = (field: string, fallback: unknown) =>
    Object.prototype.hasOwnProperty.call(prose.cleaned, field) ? prose.cleaned[field] : fallback

  return {
    client_id: clientId,
    voice_description: clean('voice_description', bb.voice_description ?? null),
    forbidden_words: bb.forbidden_words ?? [],
    required_terminology: bb.required_terminology ?? [],
    // H1.2 (2026-08-20) · el posicionamiento tiene columna propia. Antes se guardaba
    // prestado en `elevator_pitch` ("encaja", decía el comentario) · el cerebro lo
    // indexaba con el rótulo equivocado. Son dos cosas distintas y ahora van separadas.
    // REQUIERE la migración 202608201200_client_brand_books_positioning.sql aplicada.
    positioning: clean('positioning', bb.positioning ?? null),
    elevator_pitch: clean('elevator_pitch', bb.elevator_pitch ?? null),
    // el draft completo (incl. icp_summary/customer_angle/retention_notes que no tienen
    // columna) se preserva en content_text como JSON · nada se pierde.
    content_text: JSON.stringify({
      // VERBATIM a proposito · registro forense de lo que produjeron las lentes.
      // Lo que se limpia son las COLUMNAS, que es lo que leen el cerebro, el
      // visor y el cliente. Aca no se pierde ni un caracter.
      brand_book_draft: bb,
      // Las advertencias rescatadas de la prosa · dato consultable en vez de
      // frase suelta. Ausente cuando el manual no traia ninguna.
      ...(Object.keys(prose.caveats).length > 0 ? { _caveats: prose.caveats } : {}),
      // Identificadores internos que se colaron igual · se DECLARAN, no se borran
      // (borrar a ciegas mutila la frase). Sirve para enterarse sin leer manual
      // por manual.
      ...(Object.keys(prose.leaked).length > 0
        ? { _leaked_internal_terms: prose.leaked }
        : {}),
      fidelity_passed: body.fidelity_passed === true,
      fidelity_scores: body.fidelity_scores ?? null,
      fidelity_threshold: body.fidelity_threshold ?? null,
      approved_by: body.approved_by ?? 'faithfulness_check',
      approved_at: body.approved_at ?? new Date().toISOString(),
      // (e) · el detalle del veredicto sigue viviendo acá · la columna de abajo
      // es para poder VERLO sin abrir el JSON fila por fila.
      gate_outcome: body.gate_outcome ?? null,
      gate_nota: body.gate_nota ?? null,
    }),
    // Sprint B · pieza (e) · 2026-08-28 (§144 Emilio) · el manual sale SIEMPRE, y el
    // que no alcanzó la vara sale MARCADO. Antes se retenía en silencio para una
    // revisión humana que nadie dispara: 0 manuales en 2 de 2 corridas del lazo.
    // Va en COLUMNA y no sólo dentro de `content_text` porque «sale marcado»
    // significa que la marca se ve listando la tabla, no parseando JSON.
    // REQUIERE la migración 202608281400_client_brand_books_gate_outcome.sql aplicada.
    // 'paso_la_vara' | 'salio_al_tope' · null = fila anterior a esta pieza.
    gate_outcome: body.gate_outcome ?? null,
    auto_generated: true,
    auto_generated_from: body.source ?? 'onboarding_collaborative_build',
    human_validated: false,
    version,
  }
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

  // E111 (CC#1 · 2026-09-23 · decisión de Emilio) · EL MANUAL SE VERSIONA. Antes (FIX
  // 2026-07-01) esta puerta era idempotente POR CLIENTE: si ya había una fila devolvía
  // `already_existed` sin insertar. Medido en E110 (cimiento 146732): el manual nuevo, que
  // pasó la vara con 0,935, nunca llegó a la base; el PDF de Drive y la planeación leyeron
  // el manual viejo de E107. Ahora cada manual que llega se guarda como versión nueva
  // (`max(version) + 1`) y ESA queda vigente: los lectores (GET · /limpio · planeación)
  // ya toman la mayor versión. Las anteriores se conservan: nada se borra ni se pisa.
  // El Promote del cimiento corre UNA vez por corrida (después del veredicto), así que
  // un ciclo extra del lazo no produce versiones extra.
  const previa = await supabase
    .from('client_brand_books')
    .select('id, version')
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (previa.error) {
    return NextResponse.json(
      { persisted: false, error: 'previous_lookup_failed', detail: previa.error.message?.slice(0, 400) },
      { status: 500 },
    )
  }
  const version = (Number(previa.data?.version) || 0) + 1

  const row = buildBrandBookRow(clientId, bb, body, version)

  const { data, error } = await supabase
    .from('client_brand_books')
    .insert(row)
    .select('id, gate_outcome')
    .single()

  if (error) {
    return NextResponse.json(
      { persisted: false, error: 'insert_failed', detail: error.message?.slice(0, 400) },
      { status: 500 },
    )
  }
  // EL RECIBO DICE QUÉ QUEDÓ ESCRITO (2026-09-01 · corrida 118856).
  // El escritor anterior a la pieza (e) aceptaba `gate_outcome` en el cuerpo, lo
  // descartaba y devolvía este mismo `persisted: true`. La marca se perdió entera y
  // la corrida recibió un recibo verde: nadie mintió, nadie preguntó. Lo que se
  // devuelve es lo que la BASE contestó tras el insert · no una copia del cuerpo.
  // LO QUE TERMINA EMPUJA (Emilio 2026-09-02) · el manual entra al cerebro AHORA,
  // no manana a las 07:00. Va DESPUES del insert exitoso y NO se espera: el recibo
  // vuelve antes de que el empuje arranque, asi que la fila del manual no queda
  // colgada de que el cerebro conteste. Ver `lib/brain/push-al-terminar.ts`.
  const brain_push = empujarManualAlCerebro({ client_id: clientId, source_id: data?.id })

  return NextResponse.json({
    persisted: true,
    id: data?.id,
    client_id: clientId,
    gate_outcome: data?.gate_outcome ?? null,
    // E111 · el recibo dice QUÉ versión quedó vigente y cuál era la anterior (null = primera).
    version,
    previous_id: previa.data?.id ?? null,
    // El recibo DICE que se empujo (o por que no) · nunca silencioso.
    brain_push,
  })
}
