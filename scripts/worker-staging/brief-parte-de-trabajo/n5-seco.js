// ⑤ SECO · LO QUE SE HABRÍA ESCRITO · CC#1 · 2026-09-29. En modo seco NADA se escribe ni se avisa: ni la tabla, ni Drive, ni la sala.
// Pero llega hasta acá con las MISMAS filas y avisos que el camino real (los arma ④), y aquí se VALIDAN sus formas.
const c = $input.first().json
const f = c.fila_parte || {}
const faltan = []
for (const k of ['client_id', 'title', 'output_type', 'content', 'content_text', 'producing_agent', 'status', 'provenance_tag']) {
  if (f[k] === undefined || f[k] === null || f[k] === '') faltan.push('fila_parte.' + k)
}
if (f.output_type !== 'campaign_brief_pack') faltan.push('fila_parte.output_type debe ser campaign_brief_pack')
if (f.status !== 'draft') faltan.push('fila_parte.status debe ser draft')
const a = c.payload_cable || {}
for (const k of ['event_type', 'worker_id', 'worker_name', 'resultado', 'client_id']) {
  if (a[k] === undefined || a[k] === null || a[k] === '') faltan.push('payload_cable.' + k)
}
if (a.event_type !== 'run_completed') faltan.push('payload_cable.event_type debe ser run_completed')
if (a.worker_name !== 'brief') faltan.push('payload_cable.worker_name debe ser brief')
return [{
  json: {
    seco: true,
    escrituras_reales: 0,
    no_se_escribio_en: ['client_historical_outputs', 'Drive (texto-a-drive)', 'la sala (SALA_CALLBACK_URL)'],
    dry_run_enviado_al_nodo_que_paga: c.cuerpo_dry_run_enviado,
    la_vuelta_del_redactor: { llego: c.llego_la_vuelta, real: c.vuelta_real, simulacro: c.simulacro_usado, costo_usd: c.vuelta_costo_usd, modelo: c.vuelta_modelo },
    chequeos: { legible: c.parte_legible, ok: c.chequeos_ok, por_chequeo: c.por_chequeo, entregables: c.entregables, pendientes: c.pendientes_declarados },
    habria_guardado: { tabla: 'client_historical_outputs', output_type: f.output_type, status: f.status, titulo: f.title, largo_del_parte: String(f.content || '').length, provenance_tag_claves: Object.keys(f.provenance_tag || {}) },
    habria_avisado: a,
    formas_validas: faltan.length === 0,
    faltan,
  },
}]
