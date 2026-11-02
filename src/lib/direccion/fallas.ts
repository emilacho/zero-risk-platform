/**
 * GET /api/direccion/fallas · las fallas del FLUJO, no las del empleado (Lenovo 02-nov): dos corridas del manual fallaron con todos sus empleados en «completed», y «Lo que falló» no las veía.
 * Dos fuentes: los pedidos con `estado='fallido'`, que duran, y las ejecuciones en error de n8n, que solo duran unas horas (se declara en `fuentes`).
 * Una ejecución que cayó justo antes de cerrarse un pedido es esa misma falla: va como dato del pedido, no como otro renglón. Solo lectura.
 */
import { estaCompleto, sinSecretos, texto, type Contexto, type Fila, type Fuente } from './comun'

const DIA = /^\d{4}-\d{2}-\d{2}$/
const CLIENTE = /^[A-Za-z0-9_.-]{1,120}$/
const ECUADOR_MS = 5 * 3_600_000
const MS_DEL_DIA = 86_400_000
export const MAX_DIAS_DE_FALLAS = 92
const TOPE_DE_PEDIDOS = 500
/** el pedido se cierra apenas vuelve el flujo: medido 0,2 s en la corrida 212902 */
const MISMA_FALLA_MS = 10_000
const inicioDelDia = (d: string): number => Date.parse(`${d}T00:00:00Z`) + ECUADOR_MS
const fechaValida = (d: unknown): d is string => {
  if (typeof d !== 'string' || !DIA.test(d)) return false
  const t = Date.parse(`${d}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
}

/** el motivo en palabras para el panel; lo que no se reconoce se dice como falla sin explicar, nunca en texto técnico */
export function motivoEnPalabras(detalle: string | null): string {
  const d = detalle ?? ''
  const tope = /timed out after (\d+) seconds/i.exec(d)
  if (tope) return `Un paso pasó del límite de ${Math.round(Number(tope[1]) / 60)} min`
  if (/connection to the server was closed|socket hang up|ECONNRESET|terminated/i.test(d)) return 'Se cortó la conexión con el empleado'
  if (/sin dejar una versi[oó]n nueva/i.test(d)) return 'El proceso terminó sin dejar una versión nueva'
  return 'El proceso falló sin dar un motivo legible'
}

export interface Falla {
  origen: 'pedido' | 'ejecucion'
  id: string
  client_id: string | null
  documento: string | null
  empezo_en: string | null
  ocurrio_en: string
  duracion_ms: number | null
  motivo: string
  detalle: string | null
  ejecucion_id: string | null
  workflow_id: string | null
}
export interface OpcionesDeFallas { desde?: unknown; hasta?: unknown; client_id?: unknown }

async function leerEjecuciones(fuentes: Fuente[], c: Contexto, a: number, b: number): Promise<Fila[]> {
  const env = c.env ?? process.env
  const base = texto(env.N8N_BASE_URL), llave = texto(env.N8N_API_KEY)
  if (!base || !llave) { fuentes.push({ fuente: 'n8n', estado: 'sin_credencial', filas: 0, detalle: 'este entorno no tiene la dirección o la llave de n8n' }); return [] }
  const f = c.fetchImpl ?? fetch
  try {
    const r = await f(`${base.replace(/\/+$/, '')}/api/v1/executions?status=error&limit=100`, { headers: { 'X-N8N-API-KEY': llave, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    if (!r.ok) { fuentes.push({ fuente: 'n8n', estado: 'error', filas: 0, detalle: `n8n respondió HTTP ${r.status}` }); return [] }
    const j = await r.json() as { data?: Fila[] }
    const filas = (Array.isArray(j.data) ? j.data : []).filter((e) => { const t = Date.parse(String(e.stoppedAt ?? e.startedAt)); return t >= a && t < b })
    fuentes.push({ fuente: 'n8n', estado: 'ok', filas: filas.length, detalle: 'n8n conserva pocas horas de ejecuciones: esto no es el historial completo del período' })
    return filas
  } catch (e) {
    fuentes.push({ fuente: 'n8n', estado: 'error', filas: 0, detalle: sinSecretos(e instanceof Error ? e.message : String(e)) ?? 'error' })
    return []
  }
}

export async function leerFallasDelFlujo(c: Contexto, o: OpcionesDeFallas): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const mal = (detalle: string) => ({ status: 400, cuerpo: { ok: false, error: 'entrada_invalida', detalle } })
  if (!fechaValida(o.desde) || !fechaValida(o.hasta)) return mal('`desde` y `hasta` deben ser fechas AAAA-MM-DD')
  if (o.desde > o.hasta) return mal('`desde` no puede ser posterior a `hasta`')
  const a = inicioDelDia(o.desde), b = inicioDelDia(o.hasta) + MS_DEL_DIA
  if ((b - a) / MS_DEL_DIA > MAX_DIAS_DE_FALLAS) return mal(`el período admite hasta ${MAX_DIAS_DE_FALLAS} días`)
  const client_id = o.client_id === undefined || o.client_id === null || o.client_id === '' ? null : o.client_id
  if (client_id !== null && (typeof client_id !== 'string' || !CLIENTE.test(client_id))) return mal('`client_id` no es válido')

  const fuentes: Fuente[] = []
  let q = c.db.from('plan_cambios').select('id, client_id, documento, estado, despertar_detalle, creado_en, actualizado_en').eq('estado', 'fallido').gte('actualizado_en', new Date(a).toISOString()).lt('actualizado_en', new Date(b).toISOString())
  if (client_id) q = q.eq('client_id', client_id)
  const p = await q.order('actualizado_en', { ascending: false }).limit(TOPE_DE_PEDIDOS)
  const pedidos: Fila[] = p.error ? [] : ((p.data as Fila[] | null) ?? [])
  fuentes.push(p.error
    ? { fuente: 'plan_cambios', estado: 'error', filas: 0, detalle: sinSecretos(p.error.message) ?? 'error sin detalle' }
    : { fuente: 'plan_cambios', estado: 'ok', filas: pedidos.length, ...(pedidos.length >= TOPE_DE_PEDIDOS ? { truncado: true } : {}) })

  const ejecuciones = await leerEjecuciones(fuentes, c, a, b)
  const usadas = new Set<string>()
  const fallas: Falla[] = pedidos.map((f) => {
    const cierre = Date.parse(String(f.actualizado_en)), inicio = Date.parse(String(f.creado_en))
    const misma = ejecuciones.find((e) => { const t = Date.parse(String(e.stoppedAt)); return !usadas.has(String(e.id)) && t <= cierre && cierre - t <= MISMA_FALLA_MS })
    if (misma) usadas.add(String(misma.id))
    const detalle = sinSecretos(f.despertar_detalle)
    return {
      origen: 'pedido', id: String(f.id), client_id: texto(f.client_id), documento: texto(f.documento), empezo_en: texto(f.creado_en), ocurrio_en: String(f.actualizado_en),
      duracion_ms: Number.isNaN(cierre) || Number.isNaN(inicio) ? null : cierre - inicio, motivo: motivoEnPalabras(detalle), detalle,
      ejecucion_id: misma ? String(misma.id) : null, workflow_id: misma ? texto(misma.workflowId) : null,
    }
  })
  // sin filtro de cliente: una ejecución de n8n no dice de qué cliente es, así que con filtro no se puede afirmar que sea suya
  if (!client_id) {
    for (const e of ejecuciones) {
      if (usadas.has(String(e.id))) continue
      const fin = String(e.stoppedAt ?? e.startedAt), t0 = Date.parse(String(e.startedAt)), t1 = Date.parse(fin)
      fallas.push({
        origen: 'ejecucion', id: String(e.id), client_id: null, documento: null, empezo_en: texto(e.startedAt), ocurrio_en: fin,
        duracion_ms: Number.isNaN(t0) || Number.isNaN(t1) ? null : t1 - t0, motivo: motivoEnPalabras(null), detalle: null, ejecucion_id: String(e.id), workflow_id: texto(e.workflowId),
      })
    }
  }
  fallas.sort((x, y) => Date.parse(y.ocurrio_en) - Date.parse(x.ocurrio_en))
  return { status: 200, cuerpo: { ok: true, generado_en: c.ahora().toISOString(), desde: o.desde, hasta: o.hasta, completo: estaCompleto(fuentes), total: fallas.length, fallas, fuentes } }
}
