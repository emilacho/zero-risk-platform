/**
 * GET /api/brand-book/[clientId]/limpio · el manual de marca EN LIMPIO.
 *
 * Existe para que el manual pueda irse solo a Drive en PDF sin que el flujo de
 * n8n tenga que saber cómo se arma un manual. n8n pide, esto responde texto
 * listo para convertir · la lógica vive en el repositorio y la cubren pruebas.
 *
 * 🔴 Devuelve la versión LIMPIA · sin puntajes, sin nombres de columna, sin
 * costo de la corrida, sin advertencias internas. Los cuatro manuales que ya
 * están en Drive llevan todo eso adentro y dos publican el costo — no vuelve
 * a viajar el sucio.
 *
 * Responde ·
 *   200 { ok, nombre, texto, secciones[], omitidas[], fugas[], client_name }
 *   401 sin llave interna
 *   404 el cliente no tiene manual
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { renderManualLimpio } from '@/lib/brand-book-render-limpio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ clientId: string }>
}

export async function GET(req: Request, { params }: RouteContext) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ ok: false, error: 'missing_client_id' }, { status: 400 })
  }
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data: bb, error } = await supabase
    .from('client_brand_books')
    .select('*')
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'lookup_failed', detail: error.message?.slice(0, 300) },
      { status: 500 },
    )
  }
  if (!bb) {
    return NextResponse.json({ ok: false, error: 'sin_manual', client_id: clientId }, { status: 404 })
  }

  // El nombre del cliente sale de `clients` · el manual no lo guarda, y el
  // nombre del archivo en Drive depende de él.
  const { data: cli } = await supabase
    .from('clients')
    .select('name, industry, country, website_url')
    .eq('id', clientId)
    .maybeSingle()

  const render = renderManualLimpio({
    brand_book: bb as Record<string, unknown>,
    client_name: (cli?.name as string) ?? 'Cliente',
    industry: (cli?.industry as string) ?? null,
    country: (cli?.country as string) ?? null,
    website: (cli?.website_url as string) ?? null,
    created_at: (bb as { created_at?: string }).created_at ?? null,
  })

  return NextResponse.json({
    ok: true,
    client_id: clientId,
    client_name: (cli?.name as string) ?? 'Cliente',
    nombre: render.nombre,
    texto: render.texto,
    secciones: render.secciones,
    omitidas: render.omitidas,
    // Debería ser SIEMPRE vacío · si trae algo, algo interno se coló y hay que verlo.
    fugas: render.fugas,
  })
}
