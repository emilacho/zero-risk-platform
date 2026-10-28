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
import { fallar, jefaturaSinRespuesta, plantillaDe } from './orquestador'
import { resolverMaterialVencido } from './material-orquestador'

type Fila = Record<string, unknown>
export const MINUTOS_PARA_DAR_POR_MUERTO = 12
/** 28-oct · un turno LANZADO que ningún flujo acusó en este tiempo se perdió en el traspaso: se vuelve a entregar (no se da por muerto) */
export const MINUTOS_PARA_REANUDAR_LO_LANZADO = 3
/** cuántas veces se vuelve a entregar un turno sin acuse antes de dejarlo a la regla de los 12 min */
export const MAX_REENTREGAS_SIN_ACUSE = 3
/** J8a · el paso `jefatura` espera a una revisión que corre en n8n (≈ 5–15 min por salto, hasta ≈ 50 min en el peor caso): no es un paso muerto a los 12 min. Pasado este tiempo la pieza sigue «sin revisar» */
export const MINUTOS_PARA_ESPERAR_A_LA_JEFATURA = 90

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

export async function revisarPasosMuertos(P: Puertos, db: Db, ahora: Date): Promise<{ reanudar: string[]; fallidos: string[]; cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }> }> {
  const limite = new Date(ahora.getTime() - MINUTOS_PARA_DAR_POR_MUERTO * 60_000).toISOString()
  const limiteJefatura = new Date(ahora.getTime() - MINUTOS_PARA_ESPERAR_A_LA_JEFATURA * 60_000).toISOString()
  // ① LO LANZADO SIN ACUSE (traspaso perdido): a los 3 min se vuelve a entregar el mismo turno (el acuse atómico impide que dos flujos lo paguen)
  const limiteLanzado = new Date(ahora.getTime() - MINUTOS_PARA_REANUDAR_LO_LANZADO * 60_000).toISOString()
  const reentregar: string[] = []
  const sa = (await db.from('oficina_turnos').select('encargo_id,n,paso,tipo,inicio').eq('estado', 'corriendo').is('workflow_execution_id', null).lt('inicio', limiteLanzado)) as { data: Fila[] | null; error: { message: string } | null }
  if (sa.error) throw new Error(`vigía · leer los turnos sin acuse: ${sa.error.message}`)
  for (const t of sa.data ?? []) {
    if (t.tipo !== 'agente' && t.tipo !== 'portero') continue // material y jefatura tienen su propio plazo
    const enc = await P.almacen.leerEncargo(String(t.encargo_id))
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido'].includes(enc.estado)) continue
    const k = `lanzado:${String(t.paso)}:${String(t.n)}`
    const veces = enc.estado_del_motor.vueltas[k] ?? 0
    if (veces >= MAX_REENTREGAS_SIN_ACUSE) continue // se deja a la regla de los 12 min (muerto → un reintento → fallido)
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: { ...enc.estado_del_motor, vueltas: { ...enc.estado_del_motor.vueltas, [k]: veces + 1 } }, gasto_usd: enc.gasto_usd })
    reentregar.push(enc.id)
  }
  const r = (await db.from('oficina_turnos').select('encargo_id,n,paso,tipo,inicio').eq('estado', 'corriendo').lt('inicio', limite)) as { data: Fila[] | null; error: { message: string } | null }
  if (r.error) throw new Error(`vigía · leer los pasos vivos: ${r.error.message}`)
  const reanudar: string[] = [...reentregar], fallidos: string[] = []
  const cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }> = []
  for (const t of r.data ?? []) {
    const enc = await P.almacen.leerEncargo(String(t.encargo_id))
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido'].includes(enc.estado)) continue
    if (reentregar.includes(enc.id)) continue // se acaba de volver a entregar: no se da por muerto
    if (t.tipo === 'jefatura') {
      // J8a · la revisión de la jefatura tiene su propio plazo y su propio vigía: aquí solo se da por perdida pasado el plazo largo, y la pieza sigue marcada (nunca se pierde)
      if (String(t.inicio) >= limiteJefatura) continue
      await jefaturaSinRespuesta(P, enc.id, `la revisión de la jefatura no entregó en ${MINUTOS_PARA_ESPERAR_A_LA_JEFATURA} min`)
      reanudar.push(enc.id)
      continue
    }
    if (t.tipo === 'material') {
      // el portero tiene su propio plazo (20 min; techo 30): pasado el plazo se lee su pedido, pasado el techo se sigue SIN dato. Nunca es un «paso muerto» ni cierra el encargo como fallido
      const pl = await plantillaDe(P, enc)
      if (await resolverMaterialVencido(P, enc, pl, String(t.inicio), ahora) === 'cerrado') reanudar.push(enc.id)
      continue
    }
    const clave = `muerto:${String(t.paso)}`
    const veces = enc.estado_del_motor.vueltas[clave] ?? 0
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.gasto_usd, turno: { n: Number(t.n), paso: String(t.paso), tipo: 'agente', agente: null, estado: 'muerto', dispatch_key: null, cost_usd: 0, error: `sin vuelta en ${MINUTOS_PARA_DAR_POR_MUERTO} min` } })
    if (veces >= 1) {
      await fallar(P, enc, `el paso «${String(t.paso)}» murió dos veces (sin vuelta en ${MINUTOS_PARA_DAR_POR_MUERTO} min)`)
      fallidos.push(enc.id)
      cierres.push({ encargo_id: enc.id, resultado_para_la_sala: 'fallido', sala_ref: enc.sala_ref, client_id: enc.client_id, brief_id: enc.brief_id })
      continue
    }
    const estado = { ...enc.estado_del_motor, vueltas: { ...enc.estado_del_motor.vueltas, [clave]: veces + 1 } }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: estado, gasto_usd: enc.gasto_usd })
    reanudar.push(enc.id)
  }
  return { reanudar, fallidos, cierres }
}
