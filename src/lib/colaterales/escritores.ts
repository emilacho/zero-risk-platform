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
import type { Almacen, BriefCreativoGuardado, EstrategiaGuardada } from '../cadena/almacen'
import { insumosDelBrief, leerBriefCreativo } from '../cadena/brief-creativo'
import { bloqueosDelBrief, MOTIVO_RETOQUE_DE_COLATERALES } from '../cadena/mesas'
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

/** el texto retocado del brief lo devolvería el verificador (un bloqueo): un retoque nunca valida lo que la mesa no podría entregar */
export class BriefConBloqueos extends EscrituraRechazada {}

type AlmacenDelBrief = Pick<Almacen, 'ultimoBriefCreativo' | 'briefsDe' | 'insertarBriefCreativoSiLibre' | 'campana' | 'cargarContexto' | 'ultimaEstrategia'>
/**
 * BRIEF (11-nov · escritores por tramo, el primero) · por el almacén de la cadena · ref = campana_id · texto = `texto_md` (markdown: el retoque va por posición).
 *   · vigente = la ÚLTIMA versión: `borrador` = abierta (no se toca) · `devuelta` / `descartada` = no hay vigente (se va a rehacer) · solo una `validada` se retoca;
 *   · los pasos de abajo leen `leido`, no solo el texto: el escritor lo RECALCULA con `leerBriefCreativo` (nunca lo copia) y juzga los bloqueos SOBRE ESE `leido`
 *     nuevo con el mismo juicio que la entrega de la mesa (`bloqueosDelBrief`); con un bloqueo, `BriefConBloqueos` y el retoque queda pendiente;
 *   · insumos del `leido`: el contexto del plan de la campaña y los canales de la estrategia VIGENTE al retocar (puede ser otra versión que la que usó el brief
 *     original: es la que rige hoy, línea 1 de CC7); el registro va como AVISO (la jefatura ya juzgó el retoque contra el manual en 2d) y no abre revisión de registro;
 *   · la versión nueva queda `validada` (H2), con `motivo` = MOTIVO_RETOQUE_DE_COLATERALES (el contador de reaperturas no la cuenta), costo 0 y SIN encargo
 *     (ningún encargo la hizo: línea de CC6). DESHACER pasa por este mismo `escribirSiSigue`, así que lleva la misma marca;
 *   · la escritura es condicional (la base debe seguir siendo la última y `validada`) y la carrera la decide el único (campaña, versión) → null.
 * Agnóstico: ningún dato de un cliente.
 */
export function escritorDeBrief(al: AlmacenDelBrief): EscritorDeDocumento {
  return {
    async leerVigente(ref): Promise<Vigente | null> {
      const f = await al.ultimoBriefCreativo(ref)
      if (!f || f.estado === 'devuelta' || f.estado === 'descartada') return null
      if (f.estado === 'borrador') return { texto: f.texto_md ?? '', version: String(f.version), abierto: true }
      if (!f.texto_md) return null
      return { texto: f.texto_md, version: String(f.version) }
    },
    async leerVersion(ref, version) {
      const f = (await al.briefsDe(ref)).find((b) => b.version === Number(version))
      return f?.texto_md ?? null
    },
    async escribirSiSigue(ref, base, texto) {
      const f = await al.ultimoBriefCreativo(ref)
      if (!f || String(f.version) !== base || f.estado !== 'validada') return null
      const campana = await al.campana(ref)
      if (!campana) throw new Error(`el brief ${ref} v${base}: la campaña no existe`)
      const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
      const estr = await al.ultimaEstrategia(ref)
      // orden (línea 2 de CC7): primero el texto retocado, después SU `leido`, después los bloqueos sobre ese `leido`, recién entonces la escritura
      const leido = leerBriefCreativo(texto, { ...insumosDelBrief(ctx, estr?.contenido.canales), registroSoloAviso: true })
      const bloquea = bloqueosDelBrief(leido)
      if (bloquea.length) throw new BriefConBloqueos(`el brief ${ref} v${base}: el retoque lo deja con bloqueos (${bloquea.slice(0, 3).join(' · ')})`)
      const nueva = f.version + 1
      const fila: BriefCreativoGuardado = {
        campana_id: ref, version: nueva, estado: 'validada', texto_md: texto, leido: leido as unknown as Record<string, unknown>,
        devolucion_texto: null, motivo: MOTIVO_RETOQUE_DE_COLATERALES, costo_usd: 0, encargo_id: null, plazo_en: null, seco: f.seco === true,
      }
      return (await al.insertarBriefCreativoSiLibre(fila)) ? String(nueva) : null
    },
  }
}
