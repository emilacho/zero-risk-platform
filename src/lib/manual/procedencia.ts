/**
 * R4 · UN RESUMEN DEL MODELO NO ES FUENTE. Tipos de fuente y resolución de citas. PURO.
 *
 *  primaria_propia · lo que el cliente publicó de sí mismo (sitio, su red, su perfil de mapas, título/meta)
 *  humana          · lo que dio o firmó una persona (campos del trato, ficha con firma)
 *  tercero         · competidores y terceros: sirve para hablar del mercado, NUNCA del cliente
 *  sintesis        · todo lo que escribió un agente (resumen del descubrimiento, documentos de ICP, resumen competitivo, trozos del cerebro que lo delatan)
 * Una cita que resuelve SOLO a `sintesis` no es fuente. Lo mismo vale para el juez de fidelidad (firma D1): su evidencia es solo `primaria_propia` y `humana`.
 */
import { contieneLiteral, normalizar } from './texto'

export type TipoDeFuente = 'primaria_propia' | 'humana' | 'tercero' | 'sintesis'
export type CanalDeFuente = 'sitio' | 'instagram' | 'mapas' | 'alta' | 'ficha' | 'otro'
export type RolDeFuente = 'titulo' | 'meta' | 'biografia' | 'leyenda' | 'cuerpo' | 'perfil' | 'estructurado' | 'dato'

export interface Fuente {
  id: string
  tipo: TipoDeFuente
  canal: CanalDeFuente
  rol: RolDeFuente
  /** «sitio propio · /nosotros», «Instagram propio · biografía»… (lo que ve Emilio en la bandeja) */
  rotulo: string
  url?: string
  texto: string
}

export const esPrimaria = (f: Pick<Fuente, 'tipo'>): boolean => f.tipo === 'primaria_propia' || f.tipo === 'humana'

/** tablas del cerebro / de la base cuyo contenido lo escribió un agente (dato: se amplía sin tocar la lógica) */
export const TABLAS_DE_SINTESIS = ['client_icp_documents', 'client_competitive_landscape', 'client_brand_books', 'client_voc_library', 'client_historical_outputs']
/** `provenance_tag.source` que delatan una síntesis */
export const ORIGENES_DE_SINTESIS = ['agent_synthesis', 'onboarding_discovery', 'agent_output', 'legacy_pre_adr012']

/** el tipo de un trozo del cerebro o de una fila de la base. Ante la duda es `sintesis` (nunca se presume primaria). */
export function tipoDeFuenteDeCerebro(c: { source_table?: string | null; provenance_source?: string | null; es_raspado_propio?: boolean; es_raspado_tercero?: boolean }): TipoDeFuente {
  if (c.es_raspado_propio) return 'primaria_propia'
  if (c.es_raspado_tercero) return 'tercero'
  if (c.source_table && TABLAS_DE_SINTESIS.includes(c.source_table)) return 'sintesis'
  if (c.provenance_source && ORIGENES_DE_SINTESIS.includes(c.provenance_source)) return 'sintesis'
  return 'sintesis'
}

export interface CitaDelAutor { literal: string; fuente_id: string }
export interface CitaResuelta { existe: boolean; fuente: Fuente | null; tipo: TipoDeFuente | null; motivo?: 'fuente_desconocida' | 'no_esta_en_la_fuente' }

/** la cita existe TAL CUAL (sin tildes, mayúsculas ni puntuación; por palabras completas) en la fuente que dice */
export function resolverCita(cita: CitaDelAutor | null | undefined, fuentes: Fuente[]): CitaResuelta {
  if (!cita || !normalizar(cita.literal)) return { existe: false, fuente: null, tipo: null, motivo: 'no_esta_en_la_fuente' }
  const f = fuentes.find((x) => x.id === cita.fuente_id)
  if (!f) return { existe: false, fuente: null, tipo: null, motivo: 'fuente_desconocida' }
  return contieneLiteral(f.texto, cita.literal) ? { existe: true, fuente: f, tipo: f.tipo } : { existe: false, fuente: f, tipo: f.tipo, motivo: 'no_esta_en_la_fuente' }
}

/** (D1) la evidencia del juez de fidelidad: SOLO fuente cruda propia o humana; ninguna síntesis de modelo, ningún tercero */
export function evidenciaParaElJuez(fuentes: Fuente[], tope = 24_000): { texto: string; fuentes_usadas: string[]; excluidas: Array<{ id: string; tipo: TipoDeFuente }>; recortada: boolean } {
  const usadas = fuentes.filter(esPrimaria)
  const excluidas = fuentes.filter((f) => !esPrimaria(f)).map((f) => ({ id: f.id, tipo: f.tipo }))
  let texto = ''
  const ids: string[] = []
  let recortada = false
  for (const f of usadas) {
    const bloque = `## ${f.rotulo}\n${f.texto.trim()}\n\n`
    if (texto.length + bloque.length > tope) {
      const resto = tope - texto.length
      if (resto > 200) { texto += bloque.slice(0, resto) + `\n[bloque recortado: se leyeron ${resto} de ${bloque.length} caracteres]\n`; ids.push(f.id) }
      recortada = true
      break
    }
    texto += bloque; ids.push(f.id)
  }
  return { texto: texto.trimEnd(), fuentes_usadas: ids, excluidas, recortada }
}
