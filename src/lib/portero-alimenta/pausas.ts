/**
 * REANUDAR A UN CLIENTE PAUSADO (P2) · el vigilante pausa a UN cliente con problema (tabla `cerebro_portero_pausas`) y el flujo sigue para los demás.
 * Reanudarlo es un DATO (`levantada_en`), no apagar y prender el flujo en n8n: lo hace quien arregló la causa (una oficina, un empleado técnico) por esta ruta, con su motivo.
 * La pausa levantada queda en la historia (nada se borra). `dry_run` obligatorio; con false exige workflow_id y workflow_execution_id. US$ 0.
 */
import type { Db } from './alimentar'
import { validar, type Respuesta } from './rutas'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })

export async function rutaReanudar(deps: { db: Db; ahora?: Date }, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo)
  if ('status' in v) return v
  const motivo = txt(v.cuerpo.motivo), por = txt(v.cuerpo.por)
  if (!motivo || !por) return err(400, 'entrada_invalida', '`motivo` (qué se arregló) y `por` (quién lo arregló) son obligatorios: queda en la historia')
  const ahora = deps.ahora ?? new Date()
  const q = await deps.db.from('cerebro_portero_pausas').select('id, desde, motivo').eq('client_id', v.client_id).is('levantada_en', null).limit(5)
  if (q.error) return err(502, 'lectura_fallida', `cerebro_portero_pausas: ${q.error.message}`)
  const abiertas = lista(q.data)
  if (!abiertas.length) return { status: 200, body: { ok: true, ya_activo: true, nota: 'el cliente no estaba pausado' } }
  if (v.dry_run) return { status: 200, body: { ok: true, dry_run: true, levantaria: abiertas.map((a) => ({ id: String(a.id), desde: txt(a.desde), motivo: txt(a.motivo) })), nota: 'dry_run: no se levantó nada' } }
  const errores: string[] = []
  for (const a of abiertas) {
    const u = await deps.db.from('cerebro_portero_pausas').update({ levantada_en: ahora.toISOString(), levantada_por: por.slice(0, 120), motivo_de_levantarla: motivo.slice(0, 300) }).eq('id', String(a.id))
    if (u.error) errores.push(`${String(a.id)}: ${u.error.message}`)
  }
  return { status: errores.length ? 502 : 200, body: { ok: errores.length === 0, reanudado: true, client_id: v.client_id, errores, nota: 'entra de nuevo en la próxima corrida del portero' } }
}

/** las pausas abiertas (para que una oficina o el informe diario las vea) */
export async function rutaPausasAbiertas(deps: { db: Db }): Promise<Respuesta> {
  const q = await deps.db.from('cerebro_portero_pausas').select('client_id, desde, motivo, problemas').is('levantada_en', null).order('desde', { ascending: false }).limit(200)
  if (q.error) return err(502, 'lectura_fallida', `cerebro_portero_pausas: ${q.error.message}`)
  return { status: 200, body: { ok: true, pausados: lista(q.data).map((p) => ({ client_id: txt(p.client_id), desde: txt(p.desde), motivo: txt(p.motivo), problemas: Array.isArray(p.problemas) ? p.problemas : [] })) } }
}
