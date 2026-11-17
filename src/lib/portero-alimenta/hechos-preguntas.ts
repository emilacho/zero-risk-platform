/**
 * LAS PREGUNTAS DE LOS HECHOS DEL NEGOCIO (ENCARGO 2 de Cerebro · 17-nov · punto 2).
 * En cada corrida el portero deriva los hechos de cada cliente (`hechos-del-negocio.ts`) y, por cada HUECO (falta un hecho esencial o dos fuentes se contradicen),
 * crea la pregunta al dueño por la ruta de la PLATAFORMA (`POST /api/dueno/preguntas`, `accion: "preguntar"`, oficina «cerebro»): el cerebro no escribe en `dueno_preguntas`.
 * La respuesta del dueño entra por su puerta con atribución y, en la lectura siguiente, cierra el hueco (el hecho la cita).
 *  · SIN PREGUNTAS REPETIDAS: un tema que ya existe para ese cliente en `dueno_preguntas` (pendiente, respondida, asumida, descartada u obsoleta, de cualquier fecha) NUNCA
 *    se vuelve a preguntar desde aquí. Es más estricto que la ruta (que solo frena lo pendiente de las últimas 72 h): el dueño decide una vez.
 *  · Tope por corrida y cliente: lo que no entra hoy se pregunta en la corrida siguiente.
 *  · `dry_run`: solo dice qué preguntaría. US$ 0: no llama a ningún modelo.
 */
import { esExactamenteElMismoTema } from './dueno'
import { leerHechosDelNegocio, type HuecoDeHechos } from './hechos-del-negocio'
import type { Db } from './alimentar'

type Fila = Record<string, unknown>
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export const OFICINA_DE_LOS_HECHOS = 'cerebro'
export const AGENTE_DE_LOS_HECHOS = 'portero-hechos-del-negocio'
export const CANAL_DE_LOS_HECHOS = 'dashboard · Tu oficina'
export const TOPE_DE_PREGUNTAS_POR_CORRIDA = 3

export type Preguntar = (cuerpo: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>
export interface ResultadoDePreguntas {
  creadas: Array<{ tema: string; pregunta_id: string }>
  ya_existian: Array<{ tema: string; motivo: string }>
  /** con dry_run: lo que preguntaría */
  se_preguntaria: string[]
  /** las que pasan del tope de hoy (van en la corrida siguiente) */
  para_otra_corrida: string[]
  fallidas: Array<{ tema: string; detalle: string }>
}

/** crea (o no) las preguntas de los huecos de UN cliente. Nunca lanza */
export async function preguntarHuecos(
  deps: { db: Db; preguntar: Preguntar },
  a: { clientId: string; huecos: HuecoDeHechos[]; workflow_id: string; workflow_execution_id: string; dry_run: boolean; sedes?: string[] },
): Promise<ResultadoDePreguntas> {
  const r: ResultadoDePreguntas = { creadas: [], ya_existian: [], se_preguntaria: [], para_otra_corrida: [], fallidas: [] }
  if (!a.huecos.length) return r
  const q = await deps.db.from('dueno_preguntas').select('tema, estado').eq('client_id', a.clientId).limit(2000)
  // sin poder leer el historial NO se pregunta a ciegas (podría repetir)
  if (q.error) { for (const h of a.huecos) r.fallidas.push({ tema: h.tema, detalle: `dueno_preguntas: ${String(q.error.message ?? q.error).slice(0, 120)}` }); return r }
  const historial = ((q.data ?? []) as Fila[]).map((f) => ({ tema: txt(f.tema), estado: txt(f.estado) }))
  let hechas = 0
  for (const h of a.huecos) {
    const ya = historial.find((p) => esExactamenteElMismoTema(p.tema, h.tema))
    if (ya) { r.ya_existian.push({ tema: h.tema, motivo: `ya se le preguntó al dueño (estado: ${ya.estado || 'sin estado'})` }); continue }
    if (a.dry_run) { r.se_preguntaria.push(h.tema); continue }
    if (hechas >= TOPE_DE_PREGUNTAS_POR_CORRIDA) { r.para_otra_corrida.push(h.tema); continue }
    try {
      const sede = h.oferta && (a.sedes ?? []).includes(h.oferta) ? h.oferta : undefined
      const res = await deps.preguntar({
        accion: 'preguntar', client_id: a.clientId, workflow_id: a.workflow_id, workflow_execution_id: a.workflow_execution_id,
        preguntado_por: { oficina: OFICINA_DE_LOS_HECHOS, agente: AGENTE_DE_LOS_HECHOS }, canal: CANAL_DE_LOS_HECHOS,
        tema: h.tema, pregunta: h.pregunta, ...(sede ? { sede_clave: sede } : {}),
      })
      const b = res.body ?? {}
      if (res.status === 200 && b.registrada === true && typeof b.pregunta_id === 'string') { r.creadas.push({ tema: h.tema, pregunta_id: b.pregunta_id }); hechas++; historial.push({ tema: h.tema, estado: 'pendiente' }) }
      else if (res.status === 200 && (b.ya_respondida || b.ya_preguntada || b.repetida)) r.ya_existian.push({ tema: h.tema, motivo: b.ya_respondida ? 'el dueño ya lo respondió' : b.ya_preguntada ? 'otra oficina ya lo preguntó' : 'la misma pregunta sigue pendiente' })
      else r.fallidas.push({ tema: h.tema, detalle: `${res.status} ${txt(b.error)} ${txt(b.detalle)}`.trim().slice(0, 160) })
    } catch (e) {
      r.fallidas.push({ tema: h.tema, detalle: (e instanceof Error ? e.message : String(e)).slice(0, 160) })
    }
  }
  return r
}

/** el puerto real: la ruta de la plataforma, por HTTP con la llave interna */
export function preguntarPorHttp(p: { base: string; llave: string; fetch?: typeof fetch }): Preguntar {
  const f = p.fetch ?? fetch
  const url = `${p.base.replace(/\/+$/, '')}/api/dueno/preguntas`
  return async (cuerpo) => {
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': p.llave }, body: JSON.stringify(cuerpo) })
    let body: Record<string, unknown> = {}
    try { body = (await res.json()) as Record<string, unknown> } catch { body = { error: 'respuesta_no_json' } }
    return { status: res.status, body }
  }
}

/** el paso de cada corrida: por cliente, deriva sus hechos y pregunta sus huecos. Un cliente que falla no frena a los demás; nada de esto cambia lo que decide el vigilante */
export async function actualizarHechosDeLosClientes(
  deps: { db: Db; preguntar: Preguntar; ahora?: Date },
  a: { clientes: string[]; workflow_id: string; workflow_execution_id: string; dry_run: boolean },
): Promise<Array<{ client_id: string; estado: 'ok' | 'no_se_pudo_leer'; hechos: number; sin_dato: number; detalle?: string; preguntas?: ResultadoDePreguntas }>> {
  const out: Array<{ client_id: string; estado: 'ok' | 'no_se_pudo_leer'; hechos: number; sin_dato: number; detalle?: string; preguntas?: ResultadoDePreguntas }> = []
  for (const clientId of a.clientes) {
    const l = await leerHechosDelNegocio(deps.db, clientId, deps.ahora ?? new Date())
    if (l.estado !== 'ok') { out.push({ client_id: clientId, estado: 'no_se_pudo_leer', hechos: 0, sin_dato: 0, detalle: l.detalle }); continue }
    const sedes = [...new Set(l.hechos.map((h) => h.oferta).concat(l.sin_dato.map((s) => s.oferta)).filter((x): x is string => !!x))]
    const preguntas = await preguntarHuecos(deps, { clientId, huecos: l.huecos, workflow_id: a.workflow_id, workflow_execution_id: a.workflow_execution_id, dry_run: a.dry_run, sedes })
    out.push({ client_id: clientId, estado: 'ok', hechos: l.hechos.length, sin_dato: l.sin_dato.length, preguntas })
  }
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** lo que hace la ruta del vigilante al cierre de cada corrida: los clientes que el vigilante revisó (`body.clientes`); en seco (o sin `dry_run: false`) no pregunta nada; sin clientes, null */
export async function hechosDeLaCorridaDelVigilante(deps: { db: Db; preguntar: Preguntar; ahora?: Date }, cuerpo: unknown, body: Record<string, unknown>) {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const revisados = Array.isArray(body.clientes) ? (body.clientes as Array<Record<string, unknown>>) : []
  const clientes = [...new Set(revisados.map((x) => String(x?.client_id ?? '')).filter((x) => UUID.test(x)))]
  if (!clientes.length) return null
  const wf = typeof c.workflow_id === 'string' ? c.workflow_id.trim() : '', ex = typeof c.workflow_execution_id === 'string' ? c.workflow_execution_id.trim() : ''
  // preguntar exige el proceso que lo pidió: sin él, solo se dice qué se preguntaría
  const dry_run = c.dry_run !== false || !wf || !ex
  return actualizarHechosDeLosClientes(deps, { clientes, workflow_id: wf, workflow_execution_id: ex, dry_run })
}
