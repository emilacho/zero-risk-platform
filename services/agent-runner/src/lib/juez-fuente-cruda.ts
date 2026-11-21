/**
 * ENCARGO 13 · 21-nov · EL JUEZ DE FIDELIDAD RECIBE DEL CEREBRO SOLO FUENTE CRUDA (firma D1: «un resumen del modelo no es fuente»).
 *
 * Hoy el corredor suma 5 trozos del cerebro a TODA llamada, también a la del juez: pueden ser síntesis (documentos de ICP,
 * panorama competitivo, resúmenes) o EL MISMO MANUAL que está juzgando (circular). Aquí, cuando el pedido viene marcado
 * `extra.fidelity_judge: true` (el marcador canónico de los dos jueces: el del manual y el del cimiento), el empuje del
 * cerebro cambia: no se le quita material, se le entrega SOLO fuente cruda propia o humana, con su procedencia visible en
 * `<fuente rotulo tipo="primaria_propia|humana">…</fuente>`. Nunca síntesis, informes ni `client_brand_books`.
 *
 * Qué es cruda aquí (el mismo canon de `src/lib/manual/procedencia.ts`, que este servicio no puede importar; una prueba
 * ata las dos listas para que no se separen):
 *  · el trozo NO viene de una tabla de síntesis (ICP, panorama, manual, VOC, históricos);
 *  · su procedencia NO delata una síntesis (agent_synthesis, onboarding_discovery, agent_output, legacy);
 *  · si viene de `cerebro_fichas`: la ficha está viva, es `propiedad: propia` y su clase no es una síntesis
 *    (resumen vivo, informes, evaluaciones del modelo). Lo del dueño (dato/aprendizaje) es fuente humana.
 *  · Ante la duda, se excluye (nunca se presume primaria) y queda contado en `brain_chunks_no_crudos_dropped`.
 *
 * Una consulta que FALLA marca `brain_fallo` (encargo 15: el paso se detiene esperando al cerebro). 0 trozos crudos NO es
 * fallo: el juez sigue con la evidencia cruda que ya trae su pedido, y queda anotado `sin_fuente_cruda`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { enrichSystemPromptWithClientBrain, type EnrichmentResult } from './brain-enrichment.js'

/** el pedido es de UN juez de fidelidad (el marcador que ya mandan los dos flujos del juez) */
export function esPedidoDelJuezDeFidelidad(extra: unknown): boolean {
  return !!extra && typeof extra === 'object' && !Array.isArray(extra) && (extra as Record<string, unknown>).fidelity_judge === true
}

/** copia atada por prueba a `src/lib/manual/procedencia.ts` (TABLAS_DE_SINTESIS · ORIGENES_DE_SINTESIS) */
export const TABLAS_DE_SINTESIS = ['client_icp_documents', 'client_competitive_landscape', 'client_brand_books', 'client_voc_library', 'client_historical_outputs']
export const ORIGENES_DE_SINTESIS = ['agent_synthesis', 'onboarding_discovery', 'agent_output', 'legacy_pre_adr012']
/** clases de `cerebro_fichas` que escribió (o juzgó) un modelo: no son fuente para el juez */
export const CLASES_DE_SINTESIS_DE_FICHA = ['resumen_vivo', 'informe_de_analisis', 'competidor_evaluacion', 'mercado_posicion']
/** clases que son material HUMANO (lo dio el dueño); el resto de lo propio crudo es `primaria_propia` */
export const CLASES_HUMANAS = ['dato_del_dueno', 'aprendizaje_del_dueno']
/** cuántos trozos DE MÁS se piden para que el filtro de cruda no deje al juez corto */
export const MARGEN_DE_CRUDA = 15

type FichaMinima = { id: string; clase: string | null; propiedad: string | null; retirada_en: string | null; titulo: string | null }

/** el tipo D1 de un trozo, con su ficha si la tiene; null = NO es fuente cruda (se excluye) */
export function tipoCrudoDelTrozo(c: { source_table: string; provenance_source?: string | null }, ficha: FichaMinima | null | undefined): 'primaria_propia' | 'humana' | null {
  if (TABLAS_DE_SINTESIS.includes(c.source_table)) return null
  if (c.provenance_source && ORIGENES_DE_SINTESIS.includes(c.provenance_source)) return null
  if (c.source_table !== 'cerebro_fichas') return null // ante la duda (una tabla desconocida), se excluye
  if (!ficha || ficha.retirada_en) return null
  if (ficha.propiedad !== 'propia') return null // lo de terceros no habla del cliente
  const clase = ficha.clase ?? ''
  if (CLASES_DE_SINTESIS_DE_FICHA.includes(clase)) return null
  return CLASES_HUMANAS.includes(clase) ? 'humana' : 'primaria_propia'
}

/**
 * El empuje del cerebro para el JUEZ: los mismos pasos del empuje normal (huella de la consulta + búsqueda), pero el
 * resultado se filtra a fuente cruda y se formatea con su procedencia. Nunca lanza.
 */
export async function fuenteCrudaParaElJuez(args: { supabase: SupabaseClient; clientId: string | null | undefined; taskDescription: string; agentSlug?: string; topK?: number }): Promise<EnrichmentResult> {
  const topK = args.topK ?? 5
  // la búsqueda la hace el empuje de siempre (misma huella, misma consulta), pidiendo margen para poder filtrar
  const base = await enrichSystemPromptWithClientBrain({ ...args, topK: topK + MARGEN_DE_CRUDA })
  if (!base.brain_hit) return { ...base, brain_push: 'solo_fuente_cruda_del_juez' } // fallo, vacío o sin cliente: tal cual (el fallo detiene por el encargo 15)
  try {
    const ids = base.evidence_refs
    const { data, error } = await args.supabase.from('client_brain_chunks').select('id, source_table, source_id, section_label, chunk_text, provenance_tag').in('id', ids)
    if (error) return { ...vacio(base), brain_fallo: true, brain_error_detalle: String(error.message ?? 'error de la base'), error: 'juez_trozos_failed' }
    const trozos = (data ?? []) as Array<{ id: string; source_table: string; source_id: string; section_label: string | null; chunk_text: string; provenance_tag: { source?: string } | null }>
    const refsDeFicha = [...new Set(trozos.filter((t) => t.source_table === 'cerebro_fichas').map((t) => String(t.source_id)))]
    let fichas = new Map<string, FichaMinima>()
    if (refsDeFicha.length) {
      const f = await args.supabase.from('cerebro_fichas').select('id, clase, propiedad, retirada_en, titulo').in('id', refsDeFicha)
      if (f.error) return { ...vacio(base), brain_fallo: true, brain_error_detalle: String(f.error.message ?? 'error de la base'), error: 'juez_fichas_failed' }
      fichas = new Map(((f.data ?? []) as FichaMinima[]).map((x) => [String(x.id), x]))
    }
    const porId = new Map(trozos.map((t) => [String(t.id), t]))
    const crudos: Array<{ t: (typeof trozos)[number]; tipo: 'primaria_propia' | 'humana'; ficha: FichaMinima | undefined }> = []
    let descartados = 0
    for (const id of ids) { // el orden de la búsqueda (más parecido primero) se conserva
      const t = porId.get(String(id))
      if (!t) { descartados++; continue }
      const ficha = t.source_table === 'cerebro_fichas' ? fichas.get(String(t.source_id)) : undefined
      const tipo = tipoCrudoDelTrozo({ source_table: t.source_table, provenance_source: t.provenance_tag?.source ?? null }, ficha ?? null)
      if (!tipo) { descartados++; continue }
      if (crudos.length < topK) crudos.push({ t, tipo, ficha })
    }
    if (!crudos.length) {
      return { ...vacio(base), error: 'sin_fuente_cruda', brain_chunks_no_crudos_dropped: descartados }
    }
    const lineas: string[] = []
    lineas.push('# Fuente cruda del cliente (cerebro · firma D1)')
    lineas.push('')
    lineas.push('Material que el negocio publicó de sí mismo o que dio una persona, con su procedencia. NO hay síntesis de modelos, informes ni el manual que juzgas: si algo no está aquí ni en la EVIDENCIA del pedido, no lo viste.')
    lineas.push('')
    for (const { t, tipo, ficha } of crudos) {
      const rotulo = [ficha?.clase, ficha?.titulo ?? t.section_label].filter(Boolean).join(' · ') || t.section_label || t.source_table
      lineas.push(`<fuente rotulo="${String(rotulo).replace(/"/g, '’')}" tipo="${tipo}">`)
      lineas.push(t.chunk_text)
      lineas.push('</fuente>')
      lineas.push('')
    }
    return {
      ...base,
      enrichment: lineas.join('\n').trimEnd(),
      brain_chunks_count: crudos.length,
      chunks_used: crudos.length,
      evidence_refs: crudos.map((x) => String(x.t.id)),
      brain_push: 'solo_fuente_cruda_del_juez',
      brain_chunks_no_crudos_dropped: descartados,
    }
  } catch (e) {
    return { ...vacio(base), brain_fallo: true, brain_error_detalle: e instanceof Error ? e.message : String(e), error: 'juez_cruda_failed' }
  }
}

const vacio = (base: EnrichmentResult): EnrichmentResult => ({ ...base, enrichment: '', brain_hit: false, brain_chunks_count: 0, chunks_used: 0, evidence_refs: [], brain_push: 'solo_fuente_cruda_del_juez' })
