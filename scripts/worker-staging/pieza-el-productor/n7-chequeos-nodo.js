// ⑦ CHEQUEOS · ARMAR LA FILA DE LA PIEZA · CC#1 · 2026-10-01. Se concatena DESPUÉS de pieza-chequeos.js (aquí se usan sus funciones).
// 🔴 Una pieza NO VÁLIDA no se da por buena: se GUARDA igual (para diagnóstico) con el título «⛔ PIEZA NO VÁLIDA · motivo» y la corrida termina en ERROR visible (nodos ⑧/⑨). Nunca éxito mudo.
// Inválida = la vuelta no llegó, el productor falló (incluido el corte por tope), la respuesta no se pudo leer o la pieza viene sin titular NI texto.
const c = $('⑥ ¿Llegó la vuelta?').first().json
const hoy = new Date().toISOString().slice(0, 10)
const manual = { forbidden_words: c.forbidden_words || [] }

let ext = { legible: false, motivo: c.motivo || 'la vuelta del productor no llegó' }
if (c.llego_la_vuelta) ext = extraerPieza(c.texto)
const pieza = ext.legible ? ext.pieza : { titular: '', texto_principal: '', prompt_imagen: '', fuente_imagen: '', no_pude_cumplir: [], que_miro: [] }
// 02-oct · el horario de la pieza se compara con lo que el sistema vio de las sedes (sin sedes leídas no hay comparación: no se inventa una verificación)
const herrSedes = { horarioDeTexto: horarioDeTexto, canonicoHorario: canonicoHorario, describirHorario: describirHorario }
const sedesParaChequear = c.sedes_resumen && c.sedes_resumen.leidas === true ? c.sedes_resueltas : null
const res = ext.legible ? chequearPieza(c.brief, pieza, manual, sedesParaChequear, herrSedes) : { ok: false, hallazgos: [{ chequeo: 'respuesta_no_legible', detalle: ext.motivo, fatal: true }], por_chequeo: { respuesta_no_legible: 1 }, fatales: ['respuesta_no_legible'] }

let motivo_invalido = null
if (!c.llego_la_vuelta) motivo_invalido = c.motivo || 'la vuelta del productor no llegó'
else if (!ext.legible) motivo_invalido = 'la respuesta del productor no se pudo leer como pieza: ' + ext.motivo
else if (res.fatales.length) motivo_invalido = 'chequeo fatal: ' + res.fatales.join(', ')
const pieza_valida = motivo_invalido === null

const l = (v) => (Array.isArray(v) && v.length ? v.map((x) => '- ' + x).join('\n') : '(ninguno)')
const b = c.brief || {}
const P = []
P.push('# PIEZA · ' + c.brief_id + ' · ' + (b.plataforma || '?') + ' · ' + (b.tipo_de_pieza || '?') + ' · ' + (c.client_name || ''))
P.push('Parte de origen: ' + c.parte_id + ' · Brief: ' + c.brief_id + (c.plan_id ? ' · Plan: ' + c.plan_id : '') + ' · Manual: versión ' + c.manual_version + ' (' + c.manual_id + ')')
if (ext.reparado) P.push('\n> ⚠️ Formato reparado: el productor escribió ' + ext.comillas_reparadas + ' comilla(s) doble(s) sin escapar dentro de un texto y se escaparon para poder leer la pieza · el CONTENIDO no se alteró.')
if (!pieza_valida) P.push('\n> ⛔ PIEZA NO VÁLIDA · ' + motivo_invalido)
P.push('')
P.push('## LO QUE SE PIDIÓ ↔ LO QUE SALIÓ')
P.push('- Mensaje del brief: ' + (b.mensaje || ''))
P.push('- Límites del brief: ' + (b.limites || ''))
P.push('- Llamado del brief: ' + (b.llamado_a_la_accion || ''))
P.push('- TITULAR (' + String(pieza.titular || '').length + ' car.): ' + (pieza.titular || '(vacío)'))
P.push('- TEXTO PRINCIPAL (' + String(pieza.texto_principal || '').length + ' car.): ' + (pieza.texto_principal || '(vacío)'))
P.push('')
P.push('## IMAGEN')
P.push('- Fuente declarada: ' + (pieza.fuente_imagen || '(sin declarar)'))
P.push('- PROMPT para el generador (se guarda con la pieza):\n' + (pieza.prompt_imagen || '(sin prompt)'))
P.push('')
P.push('## Fotos reales que se le dieron al productor')
P.push('- enviadas: ' + c.fotos_enviadas + ' de ' + c.fotos_en_la_tabla + (c.sin_fotos ? ' (SIN FOTOS)' : ''))
if ((c.fotos_no_enviadas || []).length) P.push('- NO enviadas por el límite de 20 por pedido: ' + c.fotos_no_enviadas.length + ' (' + c.fotos_no_enviadas.join(', ') + ')')
;(c.fotos_excluidas || []).forEach((x) => P.push('- EXCLUIDA ' + x.id + ' · ' + x.label + ' · ' + x.causa))
P.push('')
P.push('## Sedes y voz que se le dieron al productor')
P.push(c.sedes_resumen && c.sedes_resumen.leidas === false ? '- SEDES: NO se pudieron leer (' + c.sedes_resumen.error + ')' : '- SEDES: ' + ((c.sedes_resumen && c.sedes_resumen.sedes) || []).map((s) => s.ciudad + ' (horario: ' + s.horario + ' · dirección: ' + s.direccion + ')').join(' · '))
;((c.sedes_resumen && c.sedes_resumen.descartes) || []).forEach((d) => P.push('- DESCARTADO: ' + d.motivo))
P.push('- VOZ: ' + (c.voz_resumen && c.voz_resumen.textos ? c.voz_resumen.textos + ' texto(s) de posts propios de referencia' : 'sin textos propios de referencia'))
P.push('')
P.push('## Qué miró el productor\n' + l(pieza.que_miro))
P.push('')
P.push('## Qué del brief NO pudo cumplir\n' + l(pieza.no_pude_cumplir))
P.push('')
P.push('## Chequeos (candidatos · no veredictos · decide quien aprueba)')
P.push(res.ok ? '✅ ninguno' : '⚠️ ' + res.hallazgos.length + ' hallazgo(s) DECLARADOS · no se corrigieron solos')
res.hallazgos.forEach((h) => P.push('- [' + h.chequeo + ']' + (h.fatal ? ' (FATAL)' : '') + ' ' + h.detalle))
if (!ext.legible && c.llego_la_vuelta) {
  P.push('')
  P.push('## ⚠️ Respuesta del productor (no legible como pieza · se guarda tal cual para diagnóstico)')
  P.push(String(c.texto || '').slice(0, 6000))
}
if (c.texto_parcial) {
  P.push('')
  P.push('## ⚠️ Texto PARCIAL del productor (la corrida se cortó: ' + (c.parcial_razon || '') + ' · NO es una pieza)')
  P.push(String(c.texto_parcial).slice(0, 6000))
}
const pieza_md = P.join('\n')

const fila_pieza = {
  client_id: c.client_id,
  title: (pieza_valida ? '' : '⛔ PIEZA NO VÁLIDA · ') + 'Pieza · ' + c.brief_id + ' · ' + (b.plataforma || '?') + ' · ' + hoy,
  output_type: 'campaign_piece',
  content: pieza_md,
  content_text: pieza_md,
  producing_agent: 'campaign-brief-agent',
  status: 'draft',
  provenance_tag: {
    fuente: 'pieza',
    workflow_id: $workflow.id,
    workflow_execution_id: $execution.id,
    brief_id: c.brief_id,
    parte_id: c.parte_id,
    plan_id: c.plan_id,
    manual_id: c.manual_id,
    manual_version: c.manual_version,
    valida: pieza_valida,
    motivo_invalido,
    legible: ext.legible,
    reparado: ext.reparado === true,
    comillas_reparadas: ext.comillas_reparadas || 0,
    chequeos_ok: res.ok,
    hallazgos: res.hallazgos,
    por_chequeo: res.por_chequeo,
    // LO QUE SE PIDIÓ (el brief entero) Y LO QUE SALIÓ (la pieza) viajan juntos: «se firma una foto, no una carpeta»
    brief: c.brief,
    pieza: ext.legible ? pieza : null,
    prompt_imagen: pieza.prompt_imagen || null,
    fuente_imagen: pieza.fuente_imagen || null,
    fotos: { en_la_tabla: c.fotos_en_la_tabla, enviadas: c.fotos_enviadas, no_enviadas: c.fotos_no_enviadas, excluidas: c.fotos_excluidas, sin_fotos: c.sin_fotos },
    que_miro: Array.isArray(pieza.que_miro) ? pieza.que_miro : [],
    no_pude_cumplir: Array.isArray(pieza.no_pude_cumplir) ? pieza.no_pude_cumplir : [],
    sedes: c.sedes_resumen || null,
    voz: c.voz_resumen || null,
    thinking_mode: 'disabled',
    tope_usd: c.tope_usd,
    costo_usd: c.vuelta_costo_usd === undefined ? null : c.vuelta_costo_usd,
    dry_run: c.dry_run === true,
  },
}
const payload_cable = {
  event_type: 'run_completed',
  worker_id: $workflow.id,
  worker_name: 'pieza',
  // el cable declara el resultado REAL (el cierre ⑧ lo corrige a pieza_con_problemas si algo falla)
  resultado: pieza_valida ? 'pieza_terminada' : 'pieza_no_valida',
  ...(pieza_valida ? {} : { motivo: motivo_invalido }),
  brief_id: c.brief_id,
  client_id: c.client_id,
  tenant_id: c.tenant_id || c.client_id,
  _sala_correlation_id: c._sala_correlation_id || null,
  _journey_id: c._journey_id || null,
  ts: new Date().toISOString(),
}
return [{
  json: {
    client_id: c.client_id,
    client_name: c.client_name,
    dry_run: c.dry_run === true,
    brief_id: c.brief_id,
    parte_id: c.parte_id,
    cuerpo_dry_run_enviado: c.cuerpo && c.cuerpo.dry_run,
    cuerpo_max_budget_usd: c.cuerpo && c.cuerpo.max_budget_usd,
    cuerpo_fotos: c.cuerpo && Array.isArray(c.cuerpo.images) ? c.cuerpo.images.length : 0,
    llego_la_vuelta: c.llego_la_vuelta,
    vuelta_real: c.vuelta_real,
    simulacro_usado: c.simulacro_usado,
    vuelta_costo_usd: c.vuelta_costo_usd,
    vuelta_modelo: c.vuelta_modelo,
    falla_del_productor: c.falla_del_productor || null,
    parcial_razon: c.parcial_razon || null,
    tope_usd: c.tope_usd,
    pieza_legible: ext.legible,
    pieza_reparada: ext.reparado === true,
    pieza_valida,
    motivo_invalido,
    titulo_pieza: fila_pieza.title,
    chequeos_ok: res.ok,
    hallazgos: res.hallazgos,
    por_chequeo: res.por_chequeo,
    _sala_correlation_id: c._sala_correlation_id || null,
    _journey_id: c._journey_id || null,
    pieza_md,
    fila_pieza,
    payload_cable,
  },
}]
