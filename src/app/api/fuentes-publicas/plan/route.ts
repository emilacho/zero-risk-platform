/**
 * POST /api/fuentes-publicas/plan · qué reseñas, textos y videos públicos pedir para UN cliente, según su rubro, su país, su sitio y sus redes. Solo lectura, US$ 0, sin modelo.
 * Cuerpo: { client_id, limites? }. Llave interna. Lo llama el alta (n8n) antes de pedirle esas fuentes al Servicio de Apify.
 * Devuelve el plan (llamadas + omitidas con su motivo) y el costo estimado por llamada con los precios MEDIDOS (`COSTO_UNITARIO_USD`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { cargarFichaYRaspado } from '@/lib/manual/almacen-supabase'
import { getSupabaseAdmin } from '@/lib/supabase'
import { planDeLaFicha, type FichaDeFuentes } from '@/lib/fuentes-publicas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const cuerpo: unknown = await request.json().catch(() => null)
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return NextResponse.json({ error: 'invalid_body', detail: 'el cuerpo debe ser un objeto JSON' }, { status: 400 })
  const c = cuerpo as Record<string, unknown>
  if (typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return NextResponse.json({ error: 'invalid_client_id', detail: 'client_id debe ser un uuid' }, { status: 400 })
  const lim = c.limites && typeof c.limites === 'object' && !Array.isArray(c.limites) ? (c.limites as Record<string, unknown>) : {}
  const limites: { resenas?: number; publicaciones?: number; videos?: number } = {}
  for (const k of ['resenas', 'publicaciones', 'videos'] as const) if (typeof lim[k] === 'number' && lim[k] > 0 && lim[k] <= 500) limites[k] = lim[k] as number
  try {
    const { ficha, filas } = await cargarFichaYRaspado(c.client_id)
    if (!ficha) return NextResponse.json({ error: 'cliente_desconocido', detail: 'no hay ficha con ese client_id' }, { status: 404 })
    const f = await getSupabaseAdmin().from('clients').select('name,industry,market,country,website_url,config').eq('id', c.client_id).maybeSingle()
    if (f.error) throw new Error(f.error.message)
    const { entrada, plan, estimado } = planDeLaFicha((f.data ?? {}) as FichaDeFuentes, filas, Object.keys(limites).length ? limites : undefined)
    return NextResponse.json({ ok: true, client_id: c.client_id, entrada: { rubro: entrada.rubro, pais: entrada.pais, enlaces_del_sitio: entrada.enlaces?.length ?? 0, redes: Object.keys(entrada.redes ?? {}), mapas_propios: !!entrada.mapas, enlaces_descartados: (entrada.descartados ?? []).slice(0, 30) }, ...plan, estimado }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'plan_fallo', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
