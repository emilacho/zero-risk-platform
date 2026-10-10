/**
 * M2 · EL BORRADOR Y LA BANDEJA. Escribe SOLO en `client_historical_outputs` (tipo `brand_book_draft_revision`, `draft`) y en `hitl_queue` (tipo `manual_de_marca_review`).
 * NO hay tabla nueva y NO se toca `client_brand_books` hasta la firma (la promoción está en `promover.ts`).
 *
 *  · `dry_run` se respeta desde la primera línea: con `dry_run: true` NO se escribe nada y se devuelve lo que se escribiría.
 *  · LO QUITADO SIN FUENTE NO VA A EMILIO (firma 10-oct: «si no existe no es necesario para mí verlo»): el registro interno (`retirados`) vive SOLO en el `provenance_tag` del borrador
 *    (auditoría); la tarjeta de la bandeja no lo lleva, ni su vista previa, ni los hechos, ni nada que se le muestre.
 */
import { renderManualLimpio } from '../brand-book-render-limpio'
import { diferenciasPorCampo, type Db, type Insumos, type ResultadoDeCierre } from './revision'

export const TIPO_DE_BORRADOR = 'brand_book_draft_revision'
export const TIPO_DE_BANDEJA = 'manual_de_marca_review'
export const DIAS_DE_VIGENCIA_DE_LA_TARJETA = 14

export interface OpinionDeGpt { ok: boolean; texto?: string; error?: string; costo_usd?: number }
export interface EntradaDelBorrador {
  insumos: Insumos
  cierre: ResultadoDeCierre
  opinion?: OpinionDeGpt | null
  /** la respuesta del autor a la opinión (S7): tomada / no tomada, cada una con su razón */
  respuesta_del_autor?: Array<{ punto: string; decision: 'tomada' | 'no_tomada'; razon: string }> | null
  costo_usd: number
  workflow_id: string
  workflow_execution_id: string
  dry_run: boolean
  ahora?: Date
}
export interface ResultadoDelBorrador {
  ok: boolean
  simulado: boolean
  error?: string
  output_id?: string | null
  hitl_id?: string | null
  version_nueva: number
  sin_cambios: boolean
  /** lo que se escribió (o se escribiría) en la bandeja: se ve exactamente lo que verá Emilio */
  tarjeta: Record<string, unknown>
}

/** la tarjeta que ve Emilio: manual nuevo en limpio, qué cambió, cada hecho con su cita y fuente, las dudas, la opinión de GPT y la respuesta del autor, y el costo. SIN lo retirado. */
export function armarTarjeta(e: EntradaDelBorrador): { titulo: string; vista_previa: string; metadata: Record<string, unknown> } {
  const { insumos: ins, cierre } = e
  const nueva = (ins.version_vigente ?? 0) + 1
  const limpio = renderManualLimpio({ brand_book: cierre.manual, client_name: ins.client_name })
  // la tarjeta muestra qué CAMPOS cambiaron y cómo quedaron; NO el texto anterior (podría traer justo la afirmación que salió por no tener cita)
  const diferencias = diferenciasPorCampo(ins.manual, cierre.manual).map((d) => ({ campo: d.campo, despues: d.despues }))
  const hechos = cierre.hechos_visibles
    .map((h) => ({ campo: h.campo, clausula: h.clausula, estado: h.estado, cita_literal: h.cita_literal, fuente: h.fuente ? { rotulo: h.fuente.rotulo, url: h.fuente.url ?? null, tipo: h.fuente.tipo } : null, duda: h.duda }))
  const dudas = hechos.filter((h) => h.estado === 'con_duda').map((h) => ({ campo: h.campo, clausula: h.clausula, duda: h.duda }))
  const opinion = e.opinion
    ? e.opinion.ok ? { rotulo: 'opinión del revisor externo (no es un dato confirmado)', texto: e.opinion.texto ?? '' } : { rotulo: 'SIN SEGUNDA MIRADA', error: e.opinion.error ?? 'el revisor externo no respondió' }
    : null
  return {
    titulo: `${opinion && 'error' in opinion ? '⚠️ SIN SEGUNDA MIRADA · ' : ''}Manual de marca · versión ${nueva} · ${ins.client_name}`,
    vista_previa: limpio.texto.slice(0, 1500),
    metadata: {
      version_nueva: nueva, version_vigente: ins.version_vigente, manual_en_limpio: limpio.texto, diferencias, hechos, dudas,
      opinion_de_gpt: opinion, respuesta_del_autor: e.respuesta_del_autor ?? null,
      costo_usd: e.costo_usd, eslogan: cierre.eslogan, ...(opinion && 'error' in opinion ? { sin_segunda_mirada: true } : {}),
      workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id,
    },
  }
}

export async function guardarBorrador(db: Db, e: EntradaDelBorrador): Promise<ResultadoDelBorrador> {
  const { insumos: ins, cierre } = e
  const nueva = (ins.version_vigente ?? 0) + 1
  const tarjeta = armarTarjeta(e)
  const diferencias = diferenciasPorCampo(ins.manual, cierre.manual)
  const base = { version_nueva: nueva, tarjeta: { titulo: tarjeta.titulo, vista_previa: tarjeta.vista_previa, ...tarjeta.metadata } }
  // sin cambios frente a lo vigente ⇒ no hay nada que firmar (ni borrador ni tarjeta)
  if (diferencias.length === 0) return { ok: true, simulado: e.dry_run, output_id: null, hitl_id: null, sin_cambios: true, ...base }
  if (e.dry_run) return { ok: true, simulado: true, output_id: null, hitl_id: null, sin_cambios: false, ...base }

  const ahora = e.ahora ?? new Date()
  const contenido = JSON.stringify({ manual: cierre.manual, version_base: ins.version_vigente, huella_base: ins.foto.huella, diferencias, eslogan: cierre.eslogan, costo_usd: e.costo_usd })
  const out = await db.from('client_historical_outputs').insert({
    client_id: ins.client_id, title: `Manual de marca · borrador de la versión ${nueva}`, output_type: TIPO_DE_BORRADOR, content: contenido, content_text: contenido,
    producing_agent: 'manual · revisión', status: 'draft',
    // AUDITORÍA INTERNA: lo que salió del manual por no tener cita. Solo vive aquí; la bandeja no lo recibe.
    provenance_tag: { fuente: 'manual_revision', version_base: ins.version_vigente, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id, registro_interno: { retirados: cierre.retirados } },
  }).select('id').single()
  if (out.error) return { ok: false, simulado: false, error: `borrador: ${out.error.message}`, sin_cambios: false, ...base }
  const output_id = String((out.data as Record<string, unknown>).id)

  const hitl = await db.from('hitl_queue').insert({
    client_id: ins.client_id, agent_name: 'manual · revisión', risk_type: 'strategic_decision', output_preview: tarjeta.vista_previa, type: TIPO_DE_BANDEJA, title: tarjeta.titulo,
    priority: 'medium', status: 'pending', payload: {}, metadata: tarjeta.metadata, output_id, expires_at: new Date(ahora.getTime() + DIAS_DE_VIGENCIA_DE_LA_TARJETA * 86_400_000).toISOString(),
  }).select('id').single()
  if (hitl.error) return { ok: false, simulado: false, error: `bandeja: ${hitl.error.message} (el borrador ${output_id} quedó escrito)`, output_id, sin_cambios: false, ...base }
  return { ok: true, simulado: false, output_id, hitl_id: String((hitl.data as Record<string, unknown>).id), sin_cambios: false, ...base }
}
