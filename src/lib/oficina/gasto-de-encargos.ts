/**
 * Lo que el TOPE POR CAMPAÑA de la cadena (`src/lib/cadena/tope-de-campana.ts`) lee de la oficina · CC1 · 10-nov.
 * Aquí, y no en la cadena, porque solo la oficina nombra sus tablas. Solo lectura. Si la base falla, LANZA (un error no es «cero gastado»).
 *   · `encargosRealesDe`: los encargos REALES (no de ensayo) de esos `parte_id` (la campaña para las mesas de concepto y brief, y sus partes para las piezas);
 *   · `topesDeFamiliasActivas`: el tope por encargo de cada familia ACTIVA (una plantilla apagada no cuenta).
 */
export const TABLAS_DE_GASTO = { encargos: 'oficina_encargos', plantillas: 'oficina_tipos_de_grupo' } as const

type Respuesta = { data: unknown; error: { message?: string } | null }
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
