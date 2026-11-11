/**
 * Lo que el TOPE POR CAMPAÑA de la cadena (`src/lib/cadena/tope-de-campana.ts`) lee de la oficina · CC1 · 10-nov.
 * Aquí, y no en la cadena, porque solo la oficina nombra sus tablas. Solo lectura. Si la base falla, LANZA (un error no es «cero gastado»).
 *   · `encargosRealesDe`: los encargos REALES (no de ensayo) de esos `parte_id` (la campaña para las mesas de concepto y brief, y sus partes para las piezas);
 *   · `topesDeFamiliasActivas`: el tope por encargo de cada familia ACTIVA (una plantilla apagada no cuenta).
 */
export const TABLAS_DE_GASTO = { encargos: 'oficina_encargos', plantillas: 'oficina_tipos_de_grupo' } as const

/**
 * 11-nov (GO Lenovo 01:10Z) · la config con la que la PUERTA de la oficina decide si produce (`decidirPuerta`): la MISMA tabla, las MISMAS columnas y la MISMA normalización
 * que `almacen-supabase.ts leerConfig` (que también usa esto). La diferencia es solo ante el error: la oficina se apaga; el freno de la cadena necesita saber que NO pudo leer
 * (y seguir guardando lugar como hoy), así que `configDeLaPuerta` LANZA si la base falla o no hay fila.
 */
export const TABLA_DE_CONFIG = 'oficina_config'
export const COLUMNAS_DE_CONFIG = 'estado,familias_activas,clientes_ensayo'
export function configDesdeLaFila(d: Record<string, unknown>): ConfigDeOficina {
  const estado = d.estado === 'ensayo' || d.estado === 'encendida' ? d.estado : 'apagada'
  return { estado, familias_activas: Array.isArray(d.familias_activas) ? d.familias_activas.map(String) : [], clientes_ensayo: Array.isArray(d.clientes_ensayo) ? d.clientes_ensayo.map(String) : [] }
}
export async function configDeLaPuerta(db: DbDeGasto): Promise<ConfigDeOficina> {
  const { data, error } = (await db.from(TABLA_DE_CONFIG).select(COLUMNAS_DE_CONFIG).eq('id', 1).maybeSingle()) as Respuesta
  if (error) throw new Error(`la oficina no contestó: ${error.message ?? 'sin detalle'}`)
  if (!data) throw new Error('la config de la oficina no tiene fila')
  // fila #19 · qué familias no tienen pieza simple lo dice la CLASE de su plantilla (dato), no una lista de nombres; si no se puede leer, LANZA como la config
  const pls = await filas<{ familia: unknown; clase: unknown }>(db.from(TABLAS_DE_GASTO.plantillas).select('familia, clase'))
  const sin_pasarela = pls.filter((p) => typeof p.familia === 'string' && !tienePasarela(esClaseDePieza(p.clase) ? p.clase : null)).map((p) => String(p.familia))
  return { ...configDesdeLaFila(data as Record<string, unknown>), sin_pasarela }
}

type Respuesta = { data: unknown; error: { message?: string } | null }
import type { ConfigDeOficina } from './sobre'
import { esClaseDePieza, tienePasarela } from './clase'
// la forma mínima del cliente de la base que se usa aquí (la de Supabase la cumple)
export interface DbDeGasto { from(tabla: string): any }

export interface EncargoReal { id: string; parte_id: string; brief_id: string | null; estado: string; tope_usd: number | null; gasto_usd: number | null }

const filas = async <T>(q: PromiseLike<Respuesta>): Promise<T[]> => {
  const { data, error } = await q
  if (error) throw new Error(`la oficina no contestó: ${error.message ?? 'sin detalle'}`)
  return (data as T[] | null) ?? []
}
const numero = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function encargosRealesDe(db: DbDeGasto, parteIds: string[]): Promise<EncargoReal[]> {
  if (!parteIds.length) return []
  const r = await filas<Record<string, unknown>>(db.from(TABLAS_DE_GASTO.encargos).select('id, parte_id, brief_id, estado, tope_usd, gasto_usd').eq('dry_run', false).in('parte_id', parteIds).limit(2000))
  return r.map((e) => ({ id: String(e.id), parte_id: String(e.parte_id), brief_id: typeof e.brief_id === 'string' ? e.brief_id : null, estado: String(e.estado), tope_usd: numero(e.tope_usd), gasto_usd: numero(e.gasto_usd) }))
}

export async function topesDeFamiliasActivas(db: DbDeGasto): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of await filas<{ familia: unknown; tope_encargo_usd: unknown }>(db.from(TABLAS_DE_GASTO.plantillas).select('familia, tope_encargo_usd').eq('activo', true))) {
    const n = numero(t.tope_encargo_usd)
    if (typeof t.familia === 'string' && n !== null && n > 0) out[t.familia] = n
  }
  return out
}
