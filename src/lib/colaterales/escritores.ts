/**
 * COLATERALES · tramo 2c · los ESCRITORES REALES de cada documento (puerto `EscritorDeDocumento` de aplicar.ts).
 * Cada uno sabe dónde y cómo guarda versiones SU tabla. Reglas comunes (CRITERIOS v2 §3 + H2):
 *   · siempre una fila NUEVA (versión + 1), nunca se reescribe una versión; la unicidad (campana_id, version) de la tabla frena una carrera (→ null);
 *   · se escribe SOLO por el almacén de la cadena (regla del proyecto: un solo lugar nombra sus tablas);
 *   · la versión nueva CONSERVA el estado/aprobación de la base (H2: un retoque aprobado no le quita la aprobación);
 *   · un documento en preparación (borrador) cuenta como ABIERTO y no se toca; uno descartado no se retoca;
 *   · un error de la base se LANZA (nunca se lee como «vacío»).
 * Estrategia: los pasos siguientes leen `contenido` (JSON), así que el retoque va por la RUTA de su llave; el texto nuevo debe tener
 * la MISMA forma que la base (mismas llaves y tipos): un retoque cambia valores, nunca la estructura.
 * Agnóstico: ningún dato de un cliente. Nadie lo llama todavía (lo enchufa 2d).
 */
import type { Almacen, EstrategiaGuardada } from '../cadena/almacen'
import { EscrituraRechazada, type EscritorDeDocumento, type Vigente } from './aplicar'

/** quien firma las versiones que escribe el motor */
export const AUTOR_DE_COLATERALES = 'colaterales'

/** la forma de un valor JSON: llaves y tipos, sin los textos */
export function forma(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(forma)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forma(x)]))
  return v === null ? 'null' : typeof v
}
export const mismaForma = (a: unknown, b: unknown): boolean => JSON.stringify(forma(a)) === JSON.stringify(forma(b))

export class FormaCambiada extends EscrituraRechazada {}
/** el texto retocado ya no es JSON (p. ej. un retoque por posición que metió comillas): se rechaza, nunca tumba la corrida (nota CC7 #990) */
export class TextoNoEsJson extends EscrituraRechazada {}

/** ESTRATEGIA · por el almacén de la cadena (el único lugar que nombra sus tablas) · ref = campana_id · texto = JSON de `contenido` */
export function escritorDeEstrategia(al: Pick<Almacen, 'ultimaEstrategia' | 'estrategiaEnVersion' | 'insertarEstrategiaSiLibre'>): EscritorDeDocumento {
  return {
    async leerVigente(ref): Promise<Vigente | null> {
      const f = await al.ultimaEstrategia(ref)
      if (!f || f.estado === 'descartada') return null
      return { texto: JSON.stringify(f.contenido), version: String(f.version), abierto: f.estado === 'borrador' }
    },
    async leerVersion(ref, version) {
      const f = await al.estrategiaEnVersion(ref, Number(version))
      return f ? JSON.stringify(f.contenido) : null
    },
    async escribirSiSigue(ref, base, texto) {
      const f = await al.ultimaEstrategia(ref)
      if (!f || String(f.version) !== base) return null
      let contenido: EstrategiaGuardada['contenido']
      try { contenido = JSON.parse(texto) as EstrategiaGuardada['contenido'] } catch { throw new TextoNoEsJson(`la estrategia ${ref} v${base}: el retoque deja un texto que no es JSON`) }
      if (!mismaForma(contenido, f.contenido)) throw new FormaCambiada(`la estrategia ${ref} v${base}: el retoque cambia la estructura`)
      const nueva = f.version + 1
      const libre = await al.insertarEstrategiaSiLibre({ campana_id: ref, version: nueva, estado: f.estado, contenido, agente: AUTOR_DE_COLATERALES, modelo: null, costo_usd: 0, workflow_execution_id: null, seco: f.seco === true })
      return libre ? String(nueva) : null
    },
  }
}
