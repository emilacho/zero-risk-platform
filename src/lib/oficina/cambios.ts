/**
 * PEDIR CAMBIOS · la ruta de verdad (los datos y la tarea viven en cambios-del-dueno.ts, sin ciclos con el orquestador).
 */
import type { Db } from './almacen-supabase'
import { esIntentoFallidoDeCambios, MAX_RONDAS_DE_CAMBIOS, TIPO_PIEZA_DE_OFICINA_BANDEJA, type CambiosDelDueno } from './cambios-del-dueno'
import { abrirEncargo } from './orquestador'
import type { Puertos } from './puertos'
import { TARGET_STEP_PRODUCIR } from './sobre'

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
type Fila = Record<string, unknown>

/** 29-oct · el dueño aprobó la pieza: su encargo pasa a «aprobada» (solo si estaba cerrado; un encargo vivo, fallido o ya aprobado no se toca) */
export async function marcarAprobada(db: Db, hitl_id: string): Promise<void> {
  await db.from('oficina_encargos').update({ estado: 'aprobada' }).eq('hitl_queue_id', hitl_id).in('estado', ['cerrado', 'cerrado_por_tope'])
}
export type ResultadoDeCambios = { status: number; cuerpo: Record<string, unknown> }

export interface PedidoDeCambios { hitl_id: string; comentario: string; laminas: number[]; reviewer: string }

/**
 * La ruta de verdad. Orden: (1) la pieza es de la oficina, real y está pendiente; (2) su encargo está cerrado; (3) hay ronda libre; (4) se TOMA la pieza en la bandeja con una condición (`status = pending`):
 * quien llega segundo (doble clic, Slack y ventana a la vez) recibe 409 sin abrir nada; (5) se abre la versión siguiente; si no abre, la pieza vuelve a pendiente.
 */
export async function pedirCambios(db: Db, P: Puertos, p: PedidoDeCambios): Promise<ResultadoDeCambios> {
  const h = await db.from('hitl_queue').select('id, status, type, client_id, metadata').eq('id', p.hitl_id).maybeSingle()
  if (h.error) return { status: 500, cuerpo: { error: 'bandeja_error', detalle: h.error.message } }
  const fila = h.data as Fila | null
  if (!fila) return { status: 404, cuerpo: { error: 'pieza_inexistente' } }
  if (fila.type !== TIPO_PIEZA_DE_OFICINA_BANDEJA) return { status: 409, cuerpo: { error: 'no_es_una_pieza_de_la_oficina', tipo: fila.type } }
  if (fila.status !== 'pending') return { status: 409, cuerpo: { error: 'ya_decidida', estado: fila.status } }

  const en = await db.from('oficina_encargos').select('*').eq('hitl_queue_id', p.hitl_id).limit(1)
  if (en.error) return { status: 500, cuerpo: { error: 'oficina_error', detalle: en.error.message } }
  const enc = ((en.data as Fila[] | null) ?? [])[0]
  if (!enc) return { status: 409, cuerpo: { error: 'la_pieza_no_tiene_encargo', detalle: 'no se halla el encargo de la oficina que la produjo' } }
  if (enc.dry_run === true) return { status: 409, cuerpo: { error: 'es_un_ensayo' } }
  if (enc.estado !== 'cerrado' && enc.estado !== 'cerrado_por_tope') return { status: 409, cuerpo: { error: 'encargo_no_cerrado', estado: enc.estado } }

  const hermanos = await db.from('oficina_encargos').select('version_encargo, sala_ref, estado, gasto_usd').eq('parte_id', enc.parte_id).eq('brief_id', enc.brief_id).eq('tipo_de_grupo', enc.tipo_de_grupo)
  if (hermanos.error) return { status: 500, cuerpo: { error: 'oficina_error', detalle: hermanos.error.message } }
  const rondasHechas = ((hermanos.data as Fila[] | null) ?? []).filter((x) => !esIntentoFallidoDeCambios(x)).map((x) => (esObjeto(x.sala_ref) && esObjeto(x.sala_ref.cambios_del_dueno) ? Number(x.sala_ref.cambios_del_dueno.ronda) || 0 : 0))
  const ronda = Math.max(0, ...rondasHechas) + 1
  if (ronda > MAX_RONDAS_DE_CAMBIOS) return { status: 409, cuerpo: { error: 'limite_de_rondas', rondas_hechas: ronda - 1, maximo: MAX_RONDAS_DE_CAMBIOS } }

  const hora = new Date().toISOString()
  const tomada = await db.from('hitl_queue').update({ status: 'edited', reviewer: p.reviewer, decided_at: hora, resolved_at: hora, decision: { pidio_cambios: true, ronda, comentario: p.comentario, laminas: p.laminas } }).eq('id', p.hitl_id).eq('status', 'pending').select('id')
  if (tomada.error) return { status: 500, cuerpo: { error: 'bandeja_error', detalle: tomada.error.message } }
  if (((tomada.data as Fila[] | null) ?? []).length === 0) return { status: 409, cuerpo: { error: 'ya_decidida', detalle: 'otra decisión se tomó mientras tanto' } }

  const salaPrevia = esObjeto(enc.sala_ref) ? enc.sala_ref : {}
  const filaDelCalendario = esObjeto(salaPrevia.fila) ? salaPrevia.fila : {}
  const cambios: CambiosDelDueno = { ronda, comentario: p.comentario.trim(), laminas: p.laminas, desde_hitl: p.hitl_id, pedido_por: p.reviewer }
  const cuerpo = {
    parte_id: enc.parte_id, brief_id: enc.brief_id, familia: enc.familia, dry_run: false, cambios_del_dueno: cambios,
    ...(typeof filaDelCalendario.id === 'string' ? { fila_id: filaDelCalendario.id } : {}), ...(typeof filaDelCalendario.fecha === 'string' ? { fecha: filaDelCalendario.fecha } : {}), ...(typeof filaDelCalendario.hora === 'string' ? { hora: filaDelCalendario.hora } : {}),
  }
  const r = await abrirEncargo(P, { cuerpo, client_id: String(enc.client_id), target_step_id: TARGET_STEP_PRODUCIR, sala_ref: { _journey_id: salaPrevia._journey_id ?? null, _sala_correlation_id: salaPrevia._sala_correlation_id ?? null } })
  // la mesa puede cerrar `fallido` AL ABRIR (p. ej. sin dirección creativa activa): la ruta contesta 200 con `accion: 'cerrado'` y nada corre; la pieza no se pierde, vuelve a la bandeja
  if (r.status !== 200 || r.cuerpo.accion === 'ya_existia' || r.cuerpo.accion === 'cerrado') {
    await db.from('hitl_queue').update({ status: 'pending', reviewer: null, decided_at: null, resolved_at: null, decision: {} }).eq('id', p.hitl_id).eq('status', 'edited') // no se pudo abrir: la pieza vuelve a esperar al dueño
    return { status: r.status === 200 ? 409 : r.status, cuerpo: { error: 'no_se_pudo_abrir_la_version_siguiente', detalle: r.cuerpo } }
  }
  return { status: 200, cuerpo: { ...r.cuerpo, ronda, rondas_restantes: MAX_RONDAS_DE_CAMBIOS - ronda } }
}
