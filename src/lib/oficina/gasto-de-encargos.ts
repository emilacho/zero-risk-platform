/**
 * Lo que el TOPE POR CAMPAÑA de la cadena (`src/lib/cadena/tope-de-campana.ts`) lee de la oficina · CC1 · 10-nov.
 * Aquí, y no en la cadena, porque solo la oficina nombra sus tablas. Solo lectura. Si la base falla, LANZA (un error no es «cero gastado»).
 *   · `encargosRealesDe`: los encargos REALES (no de ensayo) de esos `parte_id` (la campaña para las mesas de concepto y brief, y sus partes para las piezas);
 *   · `topesDeFamiliasActivas`: el tope por encargo de cada familia ACTIVA (una plantilla apagada no cuenta);
 *   · `reservasDeFamiliasActivas` (11-nov · opción b de Lenovo 19:07): lo ESPERADO por pieza de cada familia activa (`reservasDesdeLaHistoria`).
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

export interface EncargoReal { id: string; parte_id: string; brief_id: string | null; estado: string; tope_usd: number | null; gasto_usd: number | null; familia: string | null }

const filas = async <T>(q: PromiseLike<Respuesta>): Promise<T[]> => {
  const { data, error } = await q
  if (error) throw new Error(`la oficina no contestó: ${error.message ?? 'sin detalle'}`)
  return (data as T[] | null) ?? []
}
const numero = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function encargosRealesDe(db: DbDeGasto, parteIds: string[]): Promise<EncargoReal[]> {
  if (!parteIds.length) return []
  const r = await filas<Record<string, unknown>>(db.from(TABLAS_DE_GASTO.encargos).select('id, parte_id, brief_id, estado, tope_usd, gasto_usd, familia').eq('dry_run', false).in('parte_id', parteIds).limit(2000))
  return r.map((e) => ({ id: String(e.id), parte_id: String(e.parte_id), brief_id: typeof e.brief_id === 'string' ? e.brief_id : null, estado: String(e.estado), tope_usd: numero(e.tope_usd), gasto_usd: numero(e.gasto_usd), familia: typeof e.familia === 'string' && e.familia ? e.familia : null }))
}

/**
 * 11-nov · fallidos que se rehacen solos (`cadena/rehacer-fallidos.ts`) · los encargos REALES (no ensayo, no prueba) de esos partes, con lo que hace falta para juzgarlos:
 * su versión, su tipo, la causa guardada (`estado_del_motor.fallo`, #1045) y la fila del calendario (`sala_ref.fila`). LANZA si la base no contesta (un error no es «ningún fallido»).
 */
export interface EncargoParaRehacer { id: string; parte_id: string; brief_id: string | null; tipo_de_grupo: string; familia: string | null; estado: string; gasto_usd: number; version_encargo: number; fallo: unknown; fila: unknown; creado_en: string }
export async function encargosParaRehacerDe(db: DbDeGasto, parteIds: string[]): Promise<EncargoParaRehacer[]> {
  if (!parteIds.length) return []
  const r = await filas<Record<string, unknown>>(db.from(TABLAS_DE_GASTO.encargos).select('id, parte_id, brief_id, tipo_de_grupo, familia, estado, gasto_usd, version_encargo, creado_en, fallo:estado_del_motor->fallo, fila:sala_ref->fila').eq('dry_run', false).eq('prueba', false).in('parte_id', parteIds).limit(2000))
  return r.map((e) => ({
    id: String(e.id), parte_id: String(e.parte_id), brief_id: typeof e.brief_id === 'string' ? e.brief_id : null, tipo_de_grupo: String(e.tipo_de_grupo ?? ''), familia: typeof e.familia === 'string' ? e.familia : null,
    estado: String(e.estado), gasto_usd: numero(e.gasto_usd) ?? 0, version_encargo: numero(e.version_encargo) ?? 1, fallo: e.fallo ?? null, fila: e.fila ?? null, creado_en: String(e.creado_en ?? ''),
  }))
}

/**
 * 11-nov · fallidos que se rehacen solos · UN encargo, con lo que hace falta para reabrirlo por `reabrir_causa_corregida` (`cadena/almacen-supabase.ts reabrirFallidoReal`).
 * Devuelve null si no existe. LANZA si la base no contesta.
 */
export interface EncargoParaReabrir { client_id: string; parte_id: string; brief_id: string; familia: string | null; estado: string; dry_run: boolean; sala_ref: Record<string, unknown> | null }
export async function encargoParaReabrirDe(db: DbDeGasto, encargoId: string): Promise<EncargoParaReabrir | null> {
  const { data, error } = (await db.from(TABLAS_DE_GASTO.encargos).select('client_id, parte_id, brief_id, familia, estado, dry_run, sala_ref').eq('id', encargoId).maybeSingle()) as Respuesta
  if (error) throw new Error(`la oficina no contestó: ${error.message ?? 'sin detalle'}`)
  if (!data) return null
  const e = data as Record<string, unknown>
  return {
    client_id: String(e.client_id), parte_id: String(e.parte_id), brief_id: String(e.brief_id), familia: typeof e.familia === 'string' ? e.familia : null, estado: String(e.estado),
    dry_run: e.dry_run === true, sala_ref: e.sala_ref && typeof e.sala_ref === 'object' ? (e.sala_ref as Record<string, unknown>) : null,
  }
}

export async function topesDeFamiliasActivas(db: DbDeGasto): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of await filas<{ familia: unknown; tope_encargo_usd: unknown }>(db.from(TABLAS_DE_GASTO.plantillas).select('familia, tope_encargo_usd').eq('activo', true))) {
    const n = numero(t.tope_encargo_usd)
    if (typeof t.familia === 'string' && n !== null && n > 0) out[t.familia] = n
  }
  return out
}

/** los encargos que TERMINARON su trabajo (cerrado o aprobado): su gasto es lo que de verdad costó una pieza. Fallidos y cerrados por tope cortaron a medias: no cuentan */
export const ESTADOS_TERMINADOS = ['cerrado', 'aprobada'] as const
/** cuántos de los últimos encargos terminados de una familia se promedian (así lo esperado sigue a los precios de hoy) */
export const HISTORIA_POR_FAMILIA = 20
/** con menos que esto el promedio no dice nada: se usa el dato de la plantilla, y sin dato, el tope */
export const MIN_HISTORIA = 3

/**
 * lo ESPERADO por pieza de cada familia activa · genérico, de cualquier cliente (11-nov · opción b de Lenovo 19:07) · pura:
 *   · con ≥ `MIN_HISTORIA` encargos reales terminados con gasto: el promedio de los últimos `HISTORIA_POR_FAMILIA` (`historia` viene del más reciente al más viejo);
 *   · si no, el dato `limites.reserva_por_pieza_usd` de su plantilla;
 *   · sin ninguno, la familia NO aparece (el freno cuenta su tope, del lado seguro).
 * Fuera de la historia: los ensayos (`dry_run`) y los encargos de PRUEBA (`prueba`, CC7/CC6 sobre 2e852b67): uno de prueba con gasto real fijaría lo esperado de todos los clientes.
 * Nunca pasa del tope de la familia.
 */
export function reservasDesdeLaHistoria(plantillas: Array<{ familia: unknown; tope_encargo_usd: unknown; limites: unknown }>, historia: Array<{ familia: unknown; gasto_usd: unknown }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of plantillas) {
    const tope = numero(p.tope_encargo_usd)
    if (typeof p.familia !== 'string' || tope === null || tope <= 0) continue
    const gastos = historia.filter((h) => h.familia === p.familia).map((h) => numero(h.gasto_usd)).filter((g): g is number => g !== null && g > 0).slice(0, HISTORIA_POR_FAMILIA)
    const lim = p.limites && typeof p.limites === 'object' && !Array.isArray(p.limites) ? (p.limites as Record<string, unknown>) : {}
    const dato = numero(lim.reserva_por_pieza_usd)
    const r = gastos.length >= MIN_HISTORIA ? gastos.reduce((a, g) => a + g, 0) / gastos.length : dato !== null && dato > 0 ? dato : null
    if (r !== null) out[p.familia] = Math.round(Math.min(r, tope) * 10000) / 10000
  }
  return out
}

export async function reservasDeFamiliasActivas(db: DbDeGasto): Promise<Record<string, number>> {
  const [plantillas, historia] = await Promise.all([
    filas<{ familia: unknown; tope_encargo_usd: unknown; limites: unknown }>(db.from(TABLAS_DE_GASTO.plantillas).select('familia, tope_encargo_usd, limites').eq('activo', true)),
    filas<{ familia: unknown; gasto_usd: unknown }>(db.from(TABLAS_DE_GASTO.encargos).select('familia, gasto_usd').eq('dry_run', false).eq('prueba', false).in('estado', [...ESTADOS_TERMINADOS]).order('creado_en', { ascending: false }).limit(2000)),
  ])
  return reservasDesdeLaHistoria(plantillas, historia)
}
