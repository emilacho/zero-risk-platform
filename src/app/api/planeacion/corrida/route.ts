/**
 * POST /api/planeacion/corrida · el estado de la corrida del plan v3 (V13 · CC#2 · 15-oct). NADIE la llama todavía; la tabla `plan_corridas` nace SIN aplicar.
 * Llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`). Cuerpo: `{ accion: 'abrir'|'reintentar'|'correr'|'renovar'|'cerrar', client_id, corrida, … }`.
 *   abrir      { dry_run } → crea (insert-once) o continúa; 409 `corrida_activa` si el cliente ya tiene OTRA corrida viva.
 *   reintentar { intentos_esperado } → compare-and-set; `perdiste_la_carrera` si otro re-disparo ganó.
 *   correr     { motivo? } → de `esperando` a `corriendo` (con el techo de una corrida en marcha).
 *   renovar    {} → solo desde `corriendo`: el techo vuelve a contar desde ahora (se llama al pedirle el plan al redactor); `409 corrida_no_viva` si ya no vive.
 *   cerrar     { estado: 'hecha'|'fallida', motivo? } → si la corrida ya se dio por fallida y aquí llega «hecha», sigue siendo 409, queda dicho que entregó y avisa a #alertas.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/finanzas/ruta'
import { abrir, cerrar, correr, reintentar, renovar } from '@/lib/planeacion/corridas'
import { avisarAAlertas } from '@/lib/portero-alimenta/avisos'
import { almacenDeCorridas, type Db } from '@/lib/planeacion/corridas-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let c: Record<string, unknown>
  try { const j: unknown = await request.json(); if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new Error('no objeto'); c = j as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const P = almacenDeCorridas(getSupabaseAdmin() as unknown as Db)
  try {
    const base = { client_id: c.client_id as string, corrida: c.corrida as string }
    const r =
      c.accion === 'abrir' ? await abrir(P, { ...base, dry_run: c.dry_run as boolean })
      : c.accion === 'reintentar' ? await reintentar(P, { ...base, intentos_esperado: c.intentos_esperado as number })
      : c.accion === 'correr' ? await correr(P, { ...base, motivo: typeof c.motivo === 'string' ? c.motivo : undefined })
      : c.accion === 'renovar' ? await renovar(P, base)
      : c.accion === 'cerrar' ? await cerrar(P, { ...base, estado: c.estado as 'hecha' | 'fallida', motivo: typeof c.motivo === 'string' ? c.motivo : undefined })
      : null
    if (!r) return NextResponse.json({ error: 'entrada_invalida', errores: ['`accion` debe ser abrir, reintentar, correr, renovar o cerrar'] }, { status: 400 })
    const { status, ...cuerpo } = r
    // 05-nov (E4) · el flujo sigue ante este rechazo: sin este aviso, un plan entregado sobre una corrida ya fallida no lo vería nadie
    if ('entrega_tardia' in cuerpo && cuerpo.entrega_tardia) await avisarAAlertas({ db: getSupabaseAdmin() as never })(`El plan de la corrida «${String(c.corrida)}» terminó después de que se diera por fallida. Hay que revisar si se pagó dos veces.`, `plan-entrega-tardia:${String(c.corrida)}`)
    // 04-nov (firma de Lenovo): `corrida_id` = `plan_corridas.id`, el `trabajo_id` de tipo `plan` de cada llamada · no está si la respuesta no trae la fila
    return NextResponse.json('fila' in cuerpo ? { ...cuerpo, corrida_id: cuerpo.fila.id } : cuerpo, { status })
  } catch (e) {
    return NextResponse.json({ error: 'plan_corridas_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
