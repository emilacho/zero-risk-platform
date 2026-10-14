/**
 * EL PUENTE AL ÍNDICE · una sola biblioteca de consulta (firma 14-oct: las oficinas BUSCAN; el portero no empuja nada).
 * Las fichas son la fuente de verdad; `client_brain_chunks` es su índice derivado. Este módulo es PURO y IDEMPOTENTE:
 *   · `puenteDeFicha`: de una ficha entregable al trozo que se escribe por la única puerta (`/api/brain/ingest-source`);
 *   · `reconciliarPuente`: dadas las fichas del cliente y los trozos que ya existen, dice QUÉ falta escribir (fichas entregables sin trozo) y QUÉ sobra
 *     (trozos de fichas retiradas, descartadas o inexistentes). Corre en cada pasada: una falla de ayer se repara hoy sin duplicar nada
 *     (el trozo se escribe por upsert con la clave `source_id` = id de la ficha).
 * Una ficha `descartada` (duda / sin confirmar) o `incierta` NUNCA va al índice.
 */
import type { PuenteDeIndice } from './archivar'

export interface FichaParaPuente {
  id: string
  client_id: string
  ref: string
  clase: string | null
  titulo: string | null
  contenido: string | null
  fecha_fuente: string | null
  observado_en: string | null
  creado_en?: string | null
  propiedad: string | null
  origen: string | null
  descartada: boolean | null
  retirada_en: string | null
  prueba?: boolean | null
  /** huella del texto: dos fichas vivas de la misma fuente con la misma huella son el MISMO contenido (la misma línea en varias páginas) */
  huella?: string | null
}
const MAX_TEXTO = 7000
const iso10 = (s: string | null | undefined): string => String(s ?? '').slice(0, 10)

/** ¿esta ficha debe estar en el índice? entregable = viva, no descartada, no incierta, no de prueba y con contenido */
export function esBuscable(f: FichaParaPuente): boolean {
  return !f.retirada_en && f.descartada !== true && f.propiedad !== 'incierta' && f.prueba !== true && !!String(f.contenido ?? '').trim()
}

export function puenteDeFicha(f: FichaParaPuente): PuenteDeIndice {
  const fuente = /^portero:([^:]+):/.exec(f.ref)?.[1] ?? 'desconocida'
  const fecha = f.fecha_fuente ? `(fecha ${iso10(f.fecha_fuente)})` : `(visto ${iso10(f.observado_en ?? f.creado_en)})`
  return {
    source_table: 'cerebro_fichas', source_id: f.id, client_id: f.client_id, source: 'portero_diario',
    sections: [{ section_label: String(f.clase ?? fuente), text: `${f.titulo ?? fuente} — ${f.contenido ?? ''} ${fecha}`.slice(0, MAX_TEXTO) }],
    // la voz de un TERCERO va marcada como raspado ajeno: el corredor no la inyecta sin sello (regla estrecha de CC#1, 02-oct)
    metadata: { portero_diario: true, fuente, propiedad: f.propiedad, origen: f.origen, ficha_id: f.id, ...(f.origen === 'tercero' ? { apify_function: 'portero_diario_tercero' } : {}) },
  }
}

/** pasada del puente: cuántos trozos se escriben y se sacan como máximo en UNA llamada (una llamada larga pasa los 120 s de la ruta); el flujo repite hasta terminar */
export const MAX_TROZOS_A_ESCRIBIR_POR_PASADA = 40
export const MAX_TROZOS_A_SACAR_POR_PASADA = 200
export interface ResultadoDeReconciliar { escribir: PuenteDeIndice[]; sacar: string[]; ya_buscables: number; duplicadas: number }
/** `chunkSourceIds` = los `source_id` de los trozos del cliente cuyo `source_table` es `cerebro_fichas` */
const fuenteDe = (f: FichaParaPuente): string => /^portero:([^:]+):/.exec(f.ref)?.[1] ?? 'desconocida'
const cuando = (f: FichaParaPuente): string => String(f.observado_en ?? f.creado_en ?? '')

/** de las fichas buscables, deja UNA por (fuente, huella): la más antigua (empate: el id menor). Las demás son repetidas y no van al índice */
export function sinRepetidas(buscables: FichaParaPuente[]): { unicas: FichaParaPuente[]; repetidas: FichaParaPuente[] } {
  const grupos = new Map<string, FichaParaPuente[]>()
  const unicas: FichaParaPuente[] = []
  for (const f of buscables) {
    if (!f.huella) { unicas.push(f); continue }
    const k = `${fuenteDe(f)}|${f.huella}`
    ;(grupos.get(k) ?? grupos.set(k, []).get(k)!).push(f)
  }
  const repetidas: FichaParaPuente[] = []
  for (const g of grupos.values()) {
    const orden = [...g].sort((a, b) => (cuando(a) < cuando(b) ? -1 : cuando(a) > cuando(b) ? 1 : a.id < b.id ? -1 : 1))
    unicas.push(orden[0]); repetidas.push(...orden.slice(1))
  }
  return { unicas, repetidas }
}

/** `chunkSourceIds` = los `source_id` de los trozos del cliente cuyo `source_table` es `cerebro_fichas`. Devuelve TODO lo pendiente (el tope por pasada lo aplica quien envía). */
export function reconciliarPuente(fichas: FichaParaPuente[], chunkSourceIds: Iterable<string>): ResultadoDeReconciliar {
  const hay = new Set(chunkSourceIds)
  const { unicas, repetidas } = sinRepetidas(fichas.filter(esBuscable))
  const idsBuscables = new Set(unicas.map((f) => f.id))
  const escribir = unicas.filter((f) => !hay.has(f.id)).sort((a, b) => (a.id < b.id ? -1 : 1)).map(puenteDeFicha)
  // trozos que ya no deben estar: ficha retirada, descartada, incierta, de prueba, REPETIDA o que ya no existe
  const sacar = [...hay].filter((id) => !idsBuscables.has(id)).sort()
  return { escribir, sacar, ya_buscables: unicas.length - escribir.length, duplicadas: repetidas.length }
}
