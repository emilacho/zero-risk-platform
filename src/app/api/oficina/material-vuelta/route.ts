/**
 * POST /api/oficina/material-vuelta · el AVISO del portero al encargo de la oficina que le pidió material (el pedido lleva esta ruta en `avisar_a`). NACE APAGADA: sin `material_activo` nadie pide nada y nadie avisa.
 * Es la ÚNICA ruta de la oficina que se abre con la llave INTERNA (`x-api-key`): el portero no conoce la llave de despacho de la sala, y el aviso lo manda con la que ya usa para todo. Por eso es estrecha:
 *  · comparación en tiempo constante (la de `internal-auth`); la llave de despacho NO abre esta ruta (si ambas fueran iguales, la ruta se cierra con 503);
 *  · exige `ref_de_quien_pide` = «<encargo_id>:<n>» de un turno `material` ABIERTO con el mismo `pedido_id`; cualquier otra cosa devuelve `sin_efecto` y no toca nada;
 *  · ningún flujo de n8n en medio: el aviso llega directo y reanuda el MISMO paso. Un aviso repetido o tardío no hace nada (idempotente).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { despertarAlFlujoDeLaOficina } from '@/lib/oficina/despertar'
import { recibirMaterial } from '@/lib/oficina/material-orquestador'
import { esObjeto, puertosReales } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// reanudar el paso sigue al encargo hasta su siguiente pausa o su cierre
export const maxDuration = 300

export async function POST(request: Request) {
  const sala = (process.env.SALA_DISPATCH_KEY ?? '').trim()
  if (sala && sala === (process.env.INTERNAL_API_KEY ?? '').trim()) return NextResponse.json({ error: 'llaves_iguales', detalle: 'la llave interna y la de despacho no pueden ser la misma: esta ruta queda cerrada' }, { status: 503 })
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detalle: auth.reason }, { status: auth.reason.includes('not configured') ? 503 : 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  try {
    const { P } = puertosReales(request)
    const r = await recibirMaterial(P, cuerpo)
    // si lo que sigue es un paso de EMPLEADO, esta ruta despierta al flujo `oficina · turno` con la llave de SU entorno (nadie más lo despertaría)
    if (r.status === 200 && r.cuerpo.accion === 'esperar' && esObjeto(r.cuerpo.turno)) {
      const ref = String(cuerpo.ref_de_quien_pide ?? '').split(':')[0]
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, ref, r.cuerpo.turno)
      return NextResponse.json({ ...r.cuerpo, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }, { status: r.status })
    }
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
