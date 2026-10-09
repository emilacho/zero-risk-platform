/**
 * EL VIGÍA de la oficina (lo llama un reloj de n8n cada 10 min; la ruta es `POST /api/oficina/vigia`). Dos trabajos, ambos idempotentes:
 *  ① VENCER LA BANDEJA: una pieza de la oficina que Emilio no aprobó antes de su fecha (`expires_at`) deja de esperar: queda ANOTADA y NUNCA se publica sola.
 *     `hitl_queue.status` solo admite pending · approved · rejected · edited (comprobado en el catálogo el 09-oct): se marca `rejected` con `resolved_by = oficina-vigia`,
 *     la nota «no aprobada antes de su fecha; no se publica» y `decision.vencida = true`, para que ningún consumidor la confunda con un rechazo de calidad.
 *  ② PASOS MUERTOS: un paso en «corriendo» más de 12 min no volverá (el callback vive en un waitUntil de 800 s). Se marca `muerto` y se reintenta UNA vez (mismo número, misma
 *     dispatch_key); si vuelve a morir, el encargo cierra `fallido` y avisa. La ruta devuelve los encargos a re-armar; el flujo los reanuda con `siguiente`.
 * Solo toca filas de la OFICINA (metadata.origen = 'oficina'); una fila ajena `pending` jamás se toca.
 */
import type { Db } from './almacen-supabase'
import { filasQueVencen, NOTA_DE_VENCIMIENTO } from './entrega'
import type { Puertos } from './puertos'
import { fallar } from './orquestador'

type Fila = Record<string, unknown>
export const MINUTOS_PARA_DAR_POR_MUERTO = 12

export async function vencerBandeja(db: Db, ahora: Date): Promise<{ vencidas: string[] }> {
  const r = (await db.from('hitl_queue').select('id,status,expires_at,metadata').eq('status', 'pending').lt('expires_at', ahora.toISOString())) as { data: Fila[] | null; error: { message: string } | null }
  if (r.error) throw new Error(`vigía · leer la bandeja: ${r.error.message}`)
  const candidatas = filasQueVencen((r.data ?? []).map((x) => ({ id: String(x.id), status: String(x.status), expires_at: (x.expires_at as string | null) ?? null, metadata: (x.metadata as Record<string, unknown> | null) ?? null })), ahora)
  const vencidas: string[] = []
  for (const f of candidatas) {
    // condicional en la base: solo si SIGUE pendiente (una aprobación que llegó justo antes no se pisa)
    const u = (await db.from('hitl_queue').update({ status: 'rejected', resolved_by: 'oficina-vigia', reviewer: 'oficina-vigia', resolution_notes: NOTA_DE_VENCIMIENTO, resolved_at: ahora.toISOString(), decided_at: ahora.toISOString(), decision: { vencida: true, motivo: NOTA_DE_VENCIMIENTO, expires_at: f.expires_at } }).eq('id', f.id).eq('status', 'pending').select('id')) as { data: Fila[] | null; error: { message: string } | null }
    if (u.error) throw new Error(`vigía · vencer ${f.id}: ${u.error.message}`)
    if (u.data?.length) vencidas.push(f.id)
  }
  return { vencidas }
}

export async function revisarPasosMuertos(P: Puertos, db: Db, ahora: Date): Promise<{ reanudar: string[]; fallidos: string[] }> {
  const limite = new Date(ahora.getTime() - MINUTOS_PARA_DAR_POR_MUERTO * 60_000).toISOString()
  const r = (await db.from('oficina_turnos').select('encargo_id,n,paso,inicio').eq('estado', 'corriendo').lt('inicio', limite)) as { data: Fila[] | null; error: { message: string } | null }
  if (r.error) throw new Error(`vigía · leer los pasos vivos: ${r.error.message}`)
  const reanudar: string[] = [], fallidos: string[] = []
  for (const t of r.data ?? []) {
    const enc = await P.almacen.leerEncargo(String(t.encargo_id))
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido'].includes(enc.estado)) continue
    const clave = `muerto:${String(t.paso)}`
    const veces = enc.estado_del_motor.vueltas[clave] ?? 0
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.gasto_usd, turno: { n: Number(t.n), paso: String(t.paso), tipo: 'agente', agente: null, estado: 'muerto', dispatch_key: null, cost_usd: 0, error: `sin vuelta en ${MINUTOS_PARA_DAR_POR_MUERTO} min` } })
    if (veces >= 1) {
      await fallar(P, enc, `el paso «${String(t.paso)}» murió dos veces (sin vuelta en ${MINUTOS_PARA_DAR_POR_MUERTO} min)`)
      fallidos.push(enc.id)
      continue
    }
    const estado = { ...enc.estado_del_motor, vueltas: { ...enc.estado_del_motor.vueltas, [clave]: veces + 1 } }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: estado, gasto_usd: enc.gasto_usd })
    reanudar.push(enc.id)
  }
  return { reanudar, fallidos }
}
