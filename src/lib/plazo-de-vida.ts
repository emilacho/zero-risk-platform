/**
 * EL PLAZO DE VIDA · 11-nov · regla rígida #21 (GO Lenovo 03:55Z · diseño CC1 · opción 1 de Lenovo 13:05 · líneas de CC6).
 * UNA sola regla decide si un trabajo que sigue «en curso» está vivo o muerto. La usan TODOS los que antes decidían con su propio número fijo:
 * el vigía de la oficina (12 min), el de la jefatura (35 min), el brazo de video (45 min), el lote de la cadena (2 h), el limpiador de incidentes (24 h)
 * y los paneles de Dirección (corridas y riesgos, 1 h).
 *
 * Cómo decide (código, no agente; todo medido):
 *   · el TECHO de cada trabajo sale de su propio historial: la corrida real más larga de ese agente × MARGEN_DEL_TECHO. Nunca es más corto que el número
 *     de hoy de ese lugar (el PISO): ningún trabajo que hoy vive pasa a morir. Con menos de CORRIDAS_MINIMAS corridas reales, el techo es el piso;
 *   · el LATIDO: el corredor escribe `agent_dispatches.updated_at` de su despacho cada LATIDO_DEL_CORREDOR_MS mientras el empleado trabaja. Un despacho
 *     `running` que ya latió al menos una vez y latió hace menos de LATIDOS_PERDIDOS latidos sigue vivo aunque pase su techo, hasta TECHO_CON_LATIDO veces
 *     el techo (nada espera para siempre). El latido solo ALARGA la vida, nunca la acorta;
 *   · lo que no se puede leer no mata: si el despacho o el historial no se pudieron leer, el trabajo queda como está en esta vuelta (`sin_dato`) y se anota.
 */

export const LATIDO_DEL_CORREDOR_MS = 60_000
/** cuántos latidos seguidos pueden faltar antes de dejar de creerle al latido (3 = 3 min) */
export const LATIDOS_PERDIDOS = 3
/** el techo medido = la corrida real más larga del agente × esto */
export const MARGEN_DEL_TECHO = 1.5
/** con menos corridas reales que esto, el techo es el piso de hoy */
export const CORRIDAS_MINIMAS = 10
/** un trabajo que sigue latiendo vive, como mucho, este múltiplo de su techo */
export const TECHO_CON_LATIDO = 3

const MIN = 60_000

/** lo que se lee del libro de despachos (`agent_dispatches`) */
export interface DespachoLeido { status: string; created_at?: string | null; running_at?: string | null; updated_at?: string | null }
/** una lectura puede fallar: un error nunca se lee como «sin latido» */
export type Lectura<T> = { ok: true; valor: T } | { ok: false; motivo: string }

const ms = (x: unknown): number => (typeof x === 'string' && x ? Date.parse(x) : NaN)

/** el techo en ms: la corrida real más larga × MARGEN_DEL_TECHO, nunca menos que el piso; sin historia suficiente, el piso */
export function techoMedidoMs(pisoMs: number, duracionesMs: readonly number[]): number {
  const reales = duracionesMs.filter((d) => Number.isFinite(d) && d > 0)
  if (reales.length < CORRIDAS_MINIMAS) return pisoMs
  return Math.max(pisoMs, Math.ceil(Math.max(...reales) * MARGEN_DEL_TECHO))
}

/** ¿late? `running`, latió al menos una vez después de arrancar (sin el corredor nuevo nadie late: no se le cree) y su último latido es reciente */
export function late(d: DespachoLeido | null, ahora: Date): boolean {
  if (!d || d.status !== 'running') return false
  const ultimo = ms(d.updated_at), arranque = ms(d.running_at ?? d.created_at)
  if (!Number.isFinite(ultimo) || !Number.isFinite(arranque) || ultimo <= arranque) return false
  return ahora.getTime() - ultimo < LATIDOS_PERDIDOS * LATIDO_DEL_CORREDOR_MS
}

export type Vida =
  | { estado: 'vivo'; techo_min: number; latiendo: boolean }
  | { estado: 'muerto'; techo_min: number; motivo: string }
  | { estado: 'sin_dato'; motivo: string }

export interface PasoEnCurso {
  /** desde cuándo corre (la fila del paso o del despacho) */
  inicio: string | null | undefined
  /** el número de hoy de ese lugar: el techo nunca es más corto */
  pisoMs: number
  /** las duraciones reales del agente (o del brazo) · null = no hay agente que medir (se usa el piso) */
  duraciones: Lectura<readonly number[]> | null
  /** el despacho del paso · null = no tiene despacho (sin latido posible) */
  despacho: Lectura<DespachoLeido | null> | null
}

/** LA regla · pura */
export function vidaDelPaso(p: PasoEnCurso, ahora: Date): Vida {
  if (p.duraciones && !p.duraciones.ok) return { estado: 'sin_dato', motivo: `no se pudo leer el historial (${p.duraciones.motivo})` }
  if (p.despacho && !p.despacho.ok) return { estado: 'sin_dato', motivo: `no se pudo leer el despacho (${p.despacho.motivo})` }
  const inicio = ms(p.inicio)
  if (!Number.isFinite(inicio)) return { estado: 'sin_dato', motivo: 'el paso no tiene hora de inicio legible' }
  const techo = techoMedidoMs(p.pisoMs, p.duraciones?.ok ? p.duraciones.valor : [])
  const techo_min = Math.ceil(techo / MIN)
  const edad = ahora.getTime() - inicio
  const latiendo = late(p.despacho?.ok ? p.despacho.valor : null, ahora)
  if (edad < techo) return { estado: 'vivo', techo_min, latiendo }
  if (latiendo && edad < techo * TECHO_CON_LATIDO) return { estado: 'vivo', techo_min, latiendo }
  return { estado: 'muerto', techo_min, motivo: latiendo ? `sigue latiendo pero pasó ${TECHO_CON_LATIDO} veces su techo (${techo_min} min)` : `sin vuelta en ${techo_min} min` }
}

/**
 * cómo leer lo que la regla necesita: el despacho de un trabajo y las corridas reales de un agente. Si la base falla, LANZA (quien llama lo vuelve `sin_dato`).
 * 🔴 El despacho se busca por EJECUCIÓN + AGENTE, no por la llave del turno: la oficina y la jefatura guardan su propia llave (`<encargo>:<n>`, `<revisión>:<n>`)
 * y el libro de despachos otra (`dispatch:<flujo>:<agente>:<ejecución>`): casaban 0/202 y 0/73 (CC6, 11-nov). Por ejecución + agente casan 157/172 y 65/73.
 */
export interface LectorDeVida {
  despacho(workflow_execution_id: string, agente: string): Promise<DespachoLeido | null>
  duraciones(agente: string): Promise<readonly number[]>
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** envuelve un lector: cada agente se lee una sola vez por vuelta, y un error queda como lectura fallida (nunca como «vacío») */
export function lecturasDeVida(l: LectorDeVida): { despacho(ejecucion: string | null | undefined, agente: string | null | undefined): Promise<Lectura<DespachoLeido | null> | null>; duraciones(a: string | null | undefined): Promise<Lectura<readonly number[]> | null> } {
  const cache = new Map<string, Promise<Lectura<readonly number[]>>>()
  return {
    async despacho(ejecucion, agente) {
      if (!ejecucion || !agente) return null
      try { return { ok: true, valor: await l.despacho(ejecucion, agente) } } catch (e) { return { ok: false, motivo: mensaje(e) } }
    },
    async duraciones(a) {
      if (!a) return null
      if (!cache.has(a)) cache.set(a, l.duraciones(a).then((valor) => ({ ok: true as const, valor }), (e) => ({ ok: false as const, motivo: mensaje(e) })))
      return cache.get(a) as Promise<Lectura<readonly number[]>>
    },
  }
}

/** cuántas corridas reales se miran por agente (las más recientes) */
export const CORRIDAS_QUE_SE_MIRAN = 50
type Db = { from(tabla: string): any }
/** de los despachos de una misma ejecución y agente (un reintento deja 2: 8 de 378 el 11-nov), el que sigue `running`; si ninguno, el más nuevo */
export function elegirDespacho(filas: readonly DespachoLeido[]): DespachoLeido | null {
  const nuevos = [...filas].sort((a, b) => (ms(b.created_at) || 0) - (ms(a.created_at) || 0))
  return nuevos.find((d) => d.status === 'running') ?? nuevos[0] ?? null
}

/** el lector sobre la base: corridas REALES (completadas, con costo y duración: un ensayo cuesta 0) por `agent_id`; el despacho por ejecución + agente */
export function lectorDeVidaDeSupabase(db: Db): LectorDeVida {
  return {
    async despacho(ejecucion, agente) {
      const r = await db.from('agent_dispatches').select('status, created_at, running_at, updated_at').eq('workflow_execution_id', ejecucion).eq('agent_name', agente).order('created_at', { ascending: false }).limit(5)
      if (r.error) throw new Error(`leer el despacho: ${r.error.message}`)
      return elegirDespacho((r.data ?? []) as DespachoLeido[])
    },
    async duraciones(a) {
      // (el brazo de video no es un agente: lo mide la propia oficina por sus turnos · `lectorDeVidaDeLaOficina` en `oficina/vigia.ts`)
      const r = await db.from('agent_invocations').select('duration_ms').eq('agent_id', a).eq('status', 'completed').gt('cost_usd', 0).gt('duration_ms', 0).order('started_at', { ascending: false }).limit(CORRIDAS_QUE_SE_MIRAN)
      if (r.error) throw new Error(`leer las corridas de ${a}: ${r.error.message}`)
      return ((r.data ?? []) as { duration_ms: number | string }[]).map((f) => Number(f.duration_ms))
    },
  }
}
