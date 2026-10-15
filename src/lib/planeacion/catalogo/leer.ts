/**
 * PLAN v3 · V3 · LEER EL CATÁLOGO (diseño §4.3): UNA lectura por corrida; el resultado es el snapshot que viaja en el paquete.
 *   · solo filas `vigente`; solo columnas de negocio (la huella no puede depender de `id` ni de `creado_en`);
 *   · FALLA CERRADO (N6): un error de la base NO es «catálogo vacío», y un catálogo sin fuentes/tipos/topes NO es válido — jamás se corre con un snapshot a medias;
 *   · tabla inexistente (V1 sin aplicar) ⇒ `catalogo_no_aplicado`, distinto de un error de lectura.
 */
import { crearSnapshot, type CatalogoSnapshot, type FilasDelCatalogo } from '../dato-v1/catalogo'

export interface Db { from(t: string): any }
type Res = { data: unknown; error: { message: string; code?: string } | null }

/** columnas de negocio por tabla (la prueba las cruza con la migración de V1) */
export const COLUMNAS_DEL_CATALOGO = {
  plan_catalogo_fuentes: 'fuente_id,proveedor,funcion,via,provee,alcance,aplica_si,criticidad,reintentos,plazo_s,tope_usd,forma,moldes_de_ensayo,identidad_campos,da_ausencia_con,version,pais',
  plan_catalogo_tipos: 'tipo_id,atributo_cerebro,clase_dato,unidad,moneda_requerida,rango,frescura_limite_h,critico,tolerancia_redondeo,n_minimo,periodo_requerido,comparable_con,via_preferida,version,pais',
  plan_catalogo_reglas: 'regla_id,clase,operador,parametros,aplica_a,severidad,version,pais',
  plan_catalogo_lexico: 'lexico_id,idioma,grupo,terminos,version,pais',
  plan_catalogo_topes: 'tope_id,tramo,fuente_id,usd,contador,version',
} as const

export type ErrorDeCatalogo = { ok: false; causa: 'catalogo_no_aplicado' | 'lectura_fallida' | 'catalogo_incompleto'; detalle: string }
export type LecturaDeCatalogo = { ok: true; snapshot: CatalogoSnapshot } | ErrorDeCatalogo

const TABLA_AUSENTE = new Set(['42P01', 'PGRST205', 'PGRST202'])
const num = (x: unknown): number => (typeof x === 'string' ? Number(x) : (x as number))

export async function leerCatalogo(db: Db): Promise<LecturaDeCatalogo> {
  const salida: Record<string, Array<Record<string, unknown>>> = {}
  for (const [tabla, cols] of Object.entries(COLUMNAS_DEL_CATALOGO)) {
    let r: Res
    try { r = (await db.from(tabla).select(cols).eq('vigente', true)) as Res } catch (e) { return { ok: false, causa: 'lectura_fallida', detalle: `${tabla}: ${e instanceof Error ? e.message : String(e)}` } }
    if (r.error) return { ok: false, causa: r.error.code && TABLA_AUSENTE.has(r.error.code) ? 'catalogo_no_aplicado' : 'lectura_fallida', detalle: `${tabla}: ${r.error.message}` }
    if (!Array.isArray(r.data)) return { ok: false, causa: 'lectura_fallida', detalle: `${tabla}: la base no devolvió una lista` }
    salida[tabla] = r.data as Array<Record<string, unknown>>
  }
  // `numeric` viaja como texto desde PostgREST: se normaliza para que la huella no dependa del transporte
  for (const f of salida.plan_catalogo_fuentes) f.tope_usd = num(f.tope_usd)
  for (const t of salida.plan_catalogo_tipos) { t.frescura_limite_h = num(t.frescura_limite_h); t.tolerancia_redondeo = num(t.tolerancia_redondeo) }
  for (const t of salida.plan_catalogo_topes) t.usd = num(t.usd)
  const filas = {
    fuentes: salida.plan_catalogo_fuentes, tipos: salida.plan_catalogo_tipos, reglas: salida.plan_catalogo_reglas, lexico: salida.plan_catalogo_lexico, topes: salida.plan_catalogo_topes,
  } as unknown as FilasDelCatalogo
  const faltan = (['fuentes', 'tipos', 'topes'] as const).filter((k) => filas[k].length === 0)
  if (faltan.length) return { ok: false, causa: 'catalogo_incompleto', detalle: `sin filas vigentes en: ${faltan.join(', ')}` }
  return { ok: true, snapshot: crearSnapshot(filas) }
}
