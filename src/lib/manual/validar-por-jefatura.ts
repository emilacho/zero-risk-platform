/**
 * E4 · EL CIERRE DE LA REVISIÓN DEL MANUAL CON LA JEFATURA (30-oct). Reemplaza el paso «borrador + tarjeta en la bandeja de Emilio» por «la jefatura decide»:
 *
 *   escribe el borrador (auditoría) → `decidirLaJefatura` (vara de fidelidad + completitud + segunda mirada + sin dudas) →
 *     · valida  ⇒ `promoverManualRevisado` con `validado_por: 'jefatura'`: nueva versión `max+1` vigente, `human_validated=true`, con fecha; se empuja al cerebro;
 *     · no valida ⇒ el borrador queda `draft` con los motivos a la vista; NO se crea tarjeta para el dueño (no es trabajo suyo); el manual vigente sigue marcado como propuesta.
 *
 * Una versión nueva solo si hay algo que firmar: el manual cambió, o el vigente no estaba validado (la jefatura valida el vigente copiándolo como versión nueva; ninguna fila se edita).
 * `dry_run` no escribe ni promueve. La regla del 28-ago (el manual sale siempre, marcado) no se toca: aquí solo se decide el sello «validado».
 */
import { evaluarCompletitud } from './campos-del-manual'
import { armarTarjeta, TIPO_DE_BORRADOR, type EntradaDelBorrador, type ResultadoDelBorrador } from './borrador'
import { decidirLaJefatura } from './jefatura'
import { diferenciasPorCampo, type Db } from './revision'
import { promoverManualRevisado } from './promover'

export async function guardarYValidarPorJefatura(db: Db, e: EntradaDelBorrador): Promise<ResultadoDelBorrador> {
  const { insumos: ins, cierre } = e
  const nueva = (ins.version_vigente ?? 0) + 1
  const tarjeta = armarTarjeta(e)
  const diferencias = diferenciasPorCampo(ins.manual, cierre.manual)
  const base = { version_nueva: nueva, tarjeta: { titulo: tarjeta.titulo, vista_previa: tarjeta.vista_previa, ...tarjeta.metadata } }

  // ¿el vigente ya está validado? (solo importa si no hay diferencias)
  let vigenteValidado = false
  if (diferencias.length === 0) {
    const v = await db.from('client_brand_books').select('human_validated').eq('client_id', ins.client_id).order('version', { ascending: false }).limit(1)
    if (v.error) return { ok: false, simulado: false, error: `no pude leer el manual vigente: ${v.error.message}`, sin_cambios: true, ...base }
    vigenteValidado = ((Array.isArray(v.data) ? v.data : [])[0] as Record<string, unknown> | undefined)?.human_validated === true
  }
  if (diferencias.length === 0 && vigenteValidado) return { ok: true, simulado: e.dry_run, output_id: null, hitl_id: null, sin_cambios: true, ...base }

  const completitud = evaluarCompletitud(cierre.manual, { tipo: e.tipo_de_negocio, buscadoEn: e.buscado_en })
  const veredicto = decidirLaJefatura({
    fidelidad: e.fidelidad,
    completitud,
    segunda_mirada: !!e.opinion && e.opinion.ok === true,
    dudas_abiertas: cierre.hechos_visibles.filter((h) => h.estado === 'con_duda').length,
  })
  const jefatura = { ...veredicto, completo: completitud.completo }
  if (e.dry_run) return { ok: true, simulado: true, output_id: null, hitl_id: null, sin_cambios: diferencias.length === 0, jefatura, ...base }

  const ahora = e.ahora ?? new Date()
  const contenido = JSON.stringify({ manual: cierre.manual, version_base: ins.version_vigente, huella_base: ins.foto.huella, diferencias, eslogan: cierre.eslogan, costo_usd: e.costo_usd })
  const out = await db.from('client_historical_outputs').insert({
    client_id: ins.client_id, title: `Manual de marca · borrador de la versión ${nueva}`, output_type: TIPO_DE_BORRADOR, content: contenido, content_text: contenido,
    producing_agent: 'manual · revisión', status: 'draft',
    // H3 (CC#3, 10-oct): lo produjo un modelo ⇒ evidencia no confiable. AUDITORÍA INTERNA: lo retirado por no tener cita solo vive aquí.
    provenance_tag: { type: 'evidence', trust_level: 'untrusted', fuente: 'manual_revision', version_base: ins.version_vigente, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id, registro_interno: { retirados: cierre.retirados }, jefatura: { valida: veredicto.valida, motivos: veredicto.motivos, decidido_en: ahora.toISOString() } },
  }).select('id').single()
  if (out.error) return { ok: false, simulado: false, error: `borrador: ${out.error.message}`, sin_cambios: diferencias.length === 0, jefatura, ...base }
  const output_id = String((out.data as Record<string, unknown>).id)
  if (!veredicto.valida) return { ok: true, simulado: false, output_id, hitl_id: null, sin_cambios: diferencias.length === 0, jefatura, ...base }

  const promocion = await promoverManualRevisado(db, { output_id, client_id: ins.client_id, aprobador: 'jefatura', validado_por: 'jefatura', ahora })
  return { ok: promocion.ok, simulado: false, ...(promocion.ok ? {} : { error: `la jefatura validó pero no se pudo promover: ${promocion.error}` }), output_id, hitl_id: null, sin_cambios: diferencias.length === 0, jefatura: { ...jefatura, promocion }, ...base }
}
