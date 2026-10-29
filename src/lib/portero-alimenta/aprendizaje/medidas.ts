/** Contadores del aprendizaje: «aprobadas a la primera» y «cambios por pieza». Los llena la oficina; aquí solo se guardan y se suman. */
import type { Db } from '../alimentar'
import type { Respuesta } from '../rutas'
import { leerTodas } from '../paginar'

type Fila = Record<string, unknown>
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })

export async function registrarMedida(db: Db, cuerpo: unknown): Promise<Respuesta> {
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Fila
  const clientId = txt(b.client_id), pieza = txt(b.pieza_ref).slice(0, 120)
  if (!clientId || !pieza) return err(400, 'entrada_invalida', '`client_id` y `pieza_ref` son obligatorios')
  if (typeof b.aprobada_a_la_primera !== 'boolean') return err(400, 'entrada_invalida', '`aprobada_a_la_primera` debe ser verdadero o falso')
  const cambios = b.cambios_pedidos === undefined ? 0 : Number(b.cambios_pedidos)
  if (!Number.isInteger(cambios) || cambios < 0 || cambios > 100) return err(400, 'entrada_invalida', '`cambios_pedidos` debe ser un entero entre 0 y 100')
  if (b.aprobada_a_la_primera && cambios > 0) return err(400, 'entrada_incoherente', 'una pieza aprobada a la primera no tiene cambios pedidos')
  const fila = { client_id: clientId, pieza_ref: pieza, aprobada_a_la_primera: b.aprobada_a_la_primera, cambios_pedidos: cambios, usado_aprendizaje: b.usado_aprendizaje === true, registrado_por: txt(b.registrado_por).slice(0, 80) || null, registrado_en: new Date().toISOString() }
  const w = await db.from('cerebro_aprendizaje_medidas').upsert(fila, { onConflict: 'client_id,pieza_ref' })
  if (w.error) return err(502, 'registro_fallido', `cerebro_aprendizaje_medidas: ${w.error.message}`)
  return { status: 200, body: { ok: true, registrada: fila } }
}

export function resumirMedidas(filas: Fila[]) {
  const sumar = (xs: Fila[]) => {
    const piezas = xs.length, primera = xs.filter((x) => x.aprobada_a_la_primera === true).length, cambios = xs.reduce((s, x) => s + (Number(x.cambios_pedidos) || 0), 0)
    return { piezas, aprobadas_a_la_primera: primera, porcentaje_a_la_primera: piezas ? Math.round((primera / piezas) * 1000) / 10 : null, cambios_por_pieza: piezas ? Math.round((cambios / piezas) * 100) / 100 : null }
  }
  return { total: sumar(filas), con_aprendizaje: sumar(filas.filter((x) => x.usado_aprendizaje === true)), sin_aprendizaje: sumar(filas.filter((x) => x.usado_aprendizaje !== true)) }
}

export async function leerMedidas(db: Db, clientId: string | null): Promise<Respuesta> {
  const r = await leerTodas(() => { let q = db.from('cerebro_aprendizaje_medidas').select('client_id, pieza_ref, aprobada_a_la_primera, cambios_pedidos, usado_aprendizaje'); if (clientId) q = q.eq('client_id', clientId); return q.order('pieza_ref', { ascending: true }) })
  if (r.error) return err(502, 'lectura_fallida', `cerebro_aprendizaje_medidas: ${r.error.message}`)
  return { status: 200, body: { ok: true, client_id: clientId, ...resumirMedidas(r.data) } }
}
