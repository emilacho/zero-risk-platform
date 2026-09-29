// ④ CHEQUEOS · cuerpo del nodo · CC#1 · 2026-09-29 (la lógica pura `brief-chequeos.js` va ANTEPUESTA por el constructor).
// Gratis y en código. Lo que falle SE DECLARA en el parte · NO se corrige solo. Arma la fila que ⑤ guardará y el aviso de ⑥.
// Entrada: la salida de «③c Juntar» (lista + tandas) que ya pasó «¿llegó todo?». Si no llegó todo NUNCA se llega aquí.
const c = $input.first().json
const ext = c.llego_la_vuelta ? extraerParte(c.texto) : { legible: false, motivo: c.motivo || 'la vuelta del redactor no llegó' }
const manual = { forbidden_words: c.forbidden_words || [], required_terminology: c.required_terminology || [] }
const parte = ext.legible ? ext.parte : { entregables: [], pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [] }
const res = ext.legible
  ? chequear(parte, manual, c.plan_texto, { lista_ids: c.lista_ids, ids_extra: c.ids_extra_no_pedidos })
  : { ok: false, hallazgos: [{ chequeo: 'respuesta_no_legible', entregable: null, detalle: ext.motivo }], por_chequeo: { respuesta_no_legible: 1 }, entregables_revisados: 0 }
// «legible» para guardar/mandar a Drive = hay al menos un brief de verdad
const legible = ext.legible && parte.entregables.length > 0

// ── el parte, legible (lo que Emilio lee en Drive) ────────────────────────────────────────────────
const L = []
const p = (s) => L.push(s === undefined ? '' : s)
const lista = (a) => (Array.isArray(a) && a.length ? a.map((x) => '  - ' + (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') : '  (ninguno)')
const hoy = new Date().toISOString().slice(0, 10)
p('# PARTE DE TRABAJO · ' + c.client_name + ' · ' + hoy)
p('Plan de origen: ' + c.plan_id + ' · Manual: versión ' + c.manual_version + ' (' + c.manual_id + ')' + (c.dry_run ? ' · ⚠️ MODO SECO (no es un parte real)' : '') + ' · ' + c.tandas_total + ' tanda(s) de ≤' + c.tanda + ' entregable(s)')
p('')
p('## Estado de los chequeos: ' + (res.ok ? '✅ sin hallazgos' : '⚠️ ' + res.hallazgos.length + ' hallazgo(s) DECLARADOS · no se corrigieron solos'))
if (!res.ok) {
  Object.keys(res.por_chequeo).forEach((k) => p('- ' + k + ': ' + res.por_chequeo[k]))
  p('')
  res.hallazgos.forEach((h) => p('- [' + h.chequeo + ']' + (h.entregable ? ' ' + h.entregable + ' ·' : '') + ' ' + h.detalle))
}
p('')
if (c.plan_del_sobre_distinto) p('> ⚠️ El sobre nombraba el plan ' + c.plan_del_sobre + ' pero el plan vigente es ' + c.plan_id + ' · se usó el vigente.')
p('## Entregables (' + parte.entregables.length + ')')
parte.entregables.forEach((e) => {
  p('')
  p('### ' + (e.id || '(sin id)') + ' · ' + (e.plataforma || '?') + ' · ' + (e.tipo_de_pieza || '?'))
  p('- QUÉ ES: ' + (e.que_es || ''))
  p('- DE QUÉ PARTE DEL PLAN SALE: ' + (e.de_que_parte_del_plan || ''))
  p('- OBJETIVO: ' + (e.objetivo || ''))
  p('- SEGMENTO: ' + (e.segmento || ''))
  p('- PROTAGONISTA: ' + (e.protagonista || ''))
  p('- MENSAJE (uno): ' + (typeof e.mensaje === 'string' ? e.mensaje : JSON.stringify(e.mensaje)))
  p('- HIPÓTESIS: ' + (e.hipotesis || ''))
  p('- LÍMITES: ' + (e.limites || ''))
  p('- VOCABULARIO OBLIGATORIO:\n' + lista(e.vocabulario_obligatorio))
  p('- PROHIBIDO:\n' + lista(e.prohibido))
  p('- SINTAXIS: ' + (e.sintaxis || ''))
  const v = e.visual
  p('- VISUAL: ' + (v && typeof v === 'object' ? 'capa que manda: ' + (v.capa_que_manda || '?') + ' · ' + (v.descripcion || '') + ' · MUESTRA: ' + (v.muestra || '(sin muestra)') : String(v || '')))
  p('- LLAMADO A LA ACCIÓN: ' + (e.llamado_a_la_accion || ''))
  p('- VARIANTES: ' + (e.variantes || ''))
  p('- NEGATIVOS:\n' + lista(e.negativos))
  p('- APRUEBA Y PARA CUÁNDO: ' + (e.aprueba_y_para_cuando || ''))
  p('- PRESUPUESTO: ' + (e.presupuesto === null || e.presupuesto === undefined ? '(no fijado por el plan)' : String(e.presupuesto)))
})
p('')
p('## Pendientes DECLARADOS (no se pueden briefear todavía)')
;(parte.pendientes_declarados || []).forEach((x) => p('- ' + (x.entregable || '?') + (x.plataforma ? ' · ' + x.plataforma : '') + ' — ' + (x.motivo || '')))
if (!(parte.pendientes_declarados || []).length) p('(ninguno declarado)')
p('')
p('## Huecos declarados (lo que faltaba y NO se rellenó)')
p(lista(parte.huecos))
p('')
p('## Contradicciones plan ↔ manual (declaradas, no obedecidas)')
;(parte.contradicciones_plan_vs_manual || []).forEach((x) => p('- ' + (x.que || '?') + ' · el plan dice: ' + (x.plan_dice || '?') + ' · el manual dice: ' + (x.manual_dice || '?') + ' · ' + (x.que_se_hizo || '')))
if (!(parte.contradicciones_plan_vs_manual || []).length) p('(ninguna declarada)')
p('')
p('## Dependencias')
p(lista(parte.dependencias))
const crudos = c.respuestas_crudas_ilegibles || []
if (crudos.length) {
  p('')
  p('## ⚠️ Respuestas del redactor que NO fueron legibles (se guardan crudas para diagnóstico · ya estaban pagadas)')
  crudos.forEach((t) => p(String(t).slice(0, 6000)))
}
const parte_md = L.join('\n')

const fila_parte = {
  client_id: c.client_id,
  title: 'Parte de trabajo · briefs · ' + hoy,
  output_type: 'campaign_brief_pack',
  content: parte_md,
  content_text: parte_md,
  producing_agent: 'campaign-brief-agent',
  status: 'draft',
  provenance_tag: {
    fuente: 'brief',
    workflow_id: $workflow.id,
    workflow_execution_id: $execution.id,
    plan_id: c.plan_id,
    manual_id: c.manual_id,
    manual_version: c.manual_version,
    // «legible» es lo que mira la guardia de repetido: un parte ilegible NO impide reintentar
    legible: legible,
    chequeos_ok: res.ok,
    hallazgos: res.hallazgos.length,
    por_chequeo: res.por_chequeo,
    entregables: parte.entregables.length,
    pendientes: (parte.pendientes_declarados || []).length,
    huecos: (parte.huecos || []).length,
    tandas: c.tandas_total,
    tanda_tamano: c.tanda,
    tandas_ilegibles: c.tandas_ilegibles || [],
    costo_usd: c.vuelta_costo_usd,
    dry_run: c.dry_run === true,
    guardado_antes_de_drive: true,
    parte: legible ? parte : null,
    respuestas_crudas_ilegibles: crudos.length ? crudos : null,
  },
}
const payload_cable = {
  event_type: 'run_completed',
  worker_id: $workflow.id,
  worker_name: 'brief',
  resultado: 'parte_terminado',
  client_id: c.client_id,
  tenant_id: c.tenant_id || c.client_id,
  _sala_correlation_id: c._sala_correlation_id || null,
  _journey_id: c._journey_id || null,
  ts: new Date().toISOString(),
}
const dryRuns = c.dry_runs_enviados || []
return [{
  json: {
    client_id: c.client_id,
    client_name: c.client_name,
    dry_run: c.dry_run === true,
    plan_id: c.plan_id,
    manual_id: c.manual_id,
    // cada llamada al nodo que paga (la lista y cada tanda) mandó el dry_run del sobre
    dry_runs_enviados: dryRuns,
    todas_las_llamadas_con_el_dry_run_del_sobre: dryRuns.length > 0 && dryRuns.every((x) => x === (c.dry_run === true)),
    llamadas_al_redactor: dryRuns.length,
    llego_la_vuelta: c.llego_la_vuelta,
    vuelta_real: c.vuelta_real,
    simulacro_usado: c.simulacro_usado,
    vuelta_costo_usd: c.vuelta_costo_usd,
    vuelta_modelo: c.vuelta_modelo,
    tandas_total: c.tandas_total,
    parte_legible: legible,
    chequeos_ok: res.ok,
    hallazgos: res.hallazgos,
    por_chequeo: res.por_chequeo,
    entregables: parte.entregables.length,
    pendientes_declarados: (parte.pendientes_declarados || []).length,
    _sala_correlation_id: c._sala_correlation_id || null,
    _journey_id: c._journey_id || null,
    parte_md,
    fila_parte,
    payload_cable,
  },
}]
