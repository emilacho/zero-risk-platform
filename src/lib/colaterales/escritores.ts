/**
 * COLATERALES · tramo 2c · los ESCRITORES REALES de cada documento (puerto `EscritorDeDocumento` de aplicar.ts).
 * Cada uno sabe dónde y cómo guarda versiones SU tabla. Reglas comunes (CRITERIOS v2 §3 + H2):
 *   · siempre una fila NUEVA (versión + 1), nunca se reescribe una versión; la unicidad (campana_id, version) de la tabla frena una carrera (23505 → null);
 *   · la versión nueva CONSERVA el estado/aprobación de la base (H2: un retoque aprobado no le quita la aprobación);
 *   · un documento en preparación (borrador) cuenta como ABIERTO y no se toca; uno descartado no se retoca;
 *   · un error de la base se LANZA (nunca se lee como «vacío»).
 * Estrategia: los pasos siguientes leen `contenido` (JSON), así que el retoque va por la RUTA de su llave; el texto nuevo debe tener
 * la MISMA forma que la base (mismas llaves y tipos): un retoque cambia valores, nunca la estructura.
 * Agnóstico: ningún dato de un cliente. Nadie lo llama todavía (lo enchufa 2d).
 */
import { EscrituraRechazada, type EscritorDeDocumento, type Vigente } from './aplicar'

export type Db = { from(tabla: string): any }
const DUPLICADO = '23505'
/** quien firma las versiones que escribe el motor */
export const AUTOR_DE_COLATERALES = 'colaterales'

function ok<T>(r: { data: T; error: { message: string; code?: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

/** la forma de un valor JSON: llaves y tipos, sin los textos */
export function forma(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(forma)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forma(x)]))
  return v === null ? 'null' : typeof v
}
export const mismaForma = (a: unknown, b: unknown): boolean => JSON.stringify(forma(a)) === JSON.stringify(forma(b))

export class FormaCambiada extends EscrituraRechazada {}

/** ESTRATEGIA · `cadena_estrategias` · ref = campana_id · texto = JSON de `contenido` */
export function escritorDeEstrategia(db: Db): EscritorDeDocumento {
  const ultima = async (ref: string): Promise<Record<string, unknown> | null> => {
    const d = ok(await db.from('cadena_estrategias').select('*').eq('campana_id', ref).order('version', { ascending: false }).limit(1), 'leer la estrategia vigente') as Record<string, unknown>[] | null
    return d?.[0] ?? null
  }
  return {
    async leerVigente(ref): Promise<Vigente | null> {
      const f = await ultima(ref)
      if (!f || f.estado === 'descartada') return null
      return { texto: JSON.stringify(f.contenido), version: String(f.version), abierto: f.estado === 'borrador' }
    },
    async leerVersion(ref, version) {
      const d = ok(await db.from('cadena_estrategias').select('contenido').eq('campana_id', ref).eq('version', Number(version)).limit(1), 'leer una versión de la estrategia') as Record<string, unknown>[] | null
      return d?.[0] ? JSON.stringify(d[0].contenido) : null
    },
    async escribirSiSigue(ref, base, texto) {
      const f = await ultima(ref)
      if (!f || String(f.version) !== base) return null
      const contenido = JSON.parse(texto)
      if (!mismaForma(contenido, f.contenido)) throw new FormaCambiada(`la estrategia ${ref} v${base}: el retoque cambia la estructura`)
      const nueva = Number(f.version) + 1
      const r = await db.from('cadena_estrategias').insert({
        campana_id: ref, version: nueva, estado: f.estado, contenido, texto_md: null, agente: AUTOR_DE_COLATERALES, modelo: null, costo_usd: 0, workflow_execution_id: null, seco: f.seco === true,
      }).select('version')
      if (r.error?.code === DUPLICADO) return null
      ok(r, 'escribir la estrategia')
      return String(nueva)
    },
  }
}
