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

export interface ResultadoDeReconciliar { escribir: PuenteDeIndice[]; sacar: string[]; ya_buscables: number }
/** `chunkSourceIds` = los `source_id` de los trozos del cliente cuyo `source_table` es `cerebro_fichas` */
export function reconciliarPuente(fichas: FichaParaPuente[], chunkSourceIds: Iterable<string>): ResultadoDeReconciliar {
  const hay = new Set(chunkSourceIds)
  const buscables = fichas.filter(esBuscable)
  const idsBuscables = new Set(buscables.map((f) => f.id))
  const escribir = buscables.filter((f) => !hay.has(f.id)).sort((a, b) => (a.id < b.id ? -1 : 1)).map(puenteDeFicha)
  // trozos que ya no deben estar: ficha retirada, descartada, incierta, de prueba o que ya no existe
  const sacar = [...hay].filter((id) => !idsBuscables.has(id)).sort()
  return { escribir, sacar, ya_buscables: buscables.length - escribir.length }
}
