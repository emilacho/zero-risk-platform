// ⑧ SECO · LO QUE SE HABRÍA ESCRITO · CC#1 · 2026-10-01. En modo seco NADA se escribe ni se avisa: ni la tabla ni la sala.
// Pero llega hasta acá con las MISMAS filas y avisos que el camino real (los arma ⑦), y aquí se VALIDAN sus formas.
const c = $input.first().json
const f = c.fila_pieza || {}
const faltan = []
for (const k of ['client_id', 'title', 'output_type', 'content', 'content_text', 'producing_agent', 'status', 'provenance_tag']) {
  if (f[k] === undefined || f[k] === null || f[k] === '') faltan.push('fila_pieza.' + k)
}
if (f.output_type !== 'campaign_piece') faltan.push('fila_pieza.output_type debe ser campaign_piece')
if (f.status !== 'draft') faltan.push('fila_pieza.status debe ser draft')
for (const k of ['brief', 'parte_id', 'brief_id', 'valida', 'fotos']) {
  if (!f.provenance_tag || f.provenance_tag[k] === undefined) faltan.push('fila_pieza.provenance_tag.' + k)
}
const a = c.payload_cable || {}
for (const k of ['event_type', 'worker_id', 'worker_name', 'resultado', 'client_id']) {
  if (a[k] === undefined || a[k] === null || a[k] === '') faltan.push('payload_cable.' + k)
}
if (a.event_type !== 'run_completed') faltan.push('payload_cable.event_type debe ser run_completed')
if (a.worker_name !== 'pieza') faltan.push('payload_cable.worker_name debe ser pieza')
const habria_cerrado_como = c.pieza_valida === false ? 'ERROR · PIEZA_NO_VALIDA · ' + c.motivo_invalido : 'pieza_terminada'
const salida = {
  json: {
    seco: true,
    escrituras_reales: 0,
    no_se_escribio_en: ['client_historical_outputs', 'la sala (SALA_CALLBACK_URL)'],
    dry_run_enviado_al_nodo_que_paga: c.cuerpo_dry_run_enviado,
    tope_enviado_al_nodo_que_paga_usd: c.cuerpo_max_budget_usd,
    fotos_enviadas_al_nodo_que_paga: c.cuerpo_fotos,
    la_vuelta_del_productor: { llego: c.llego_la_vuelta, real: c.vuelta_real, simulacro: c.simulacro_usado, costo_usd: c.vuelta_costo_usd, modelo: c.vuelta_modelo },
    chequeos: { legible: c.pieza_legible, ok: c.chequeos_ok, por_chequeo: c.por_chequeo },
    habria_guardado: { tabla: 'client_historical_outputs', output_type: f.output_type, status: f.status, titulo: f.title, largo_de_la_pieza: String(f.content || '').length, provenance_tag_claves: Object.keys(f.provenance_tag || {}) },
    pieza_valida: c.pieza_valida !== false,
    motivo_invalido: c.motivo_invalido || null,
    habria_cerrado_como,
    habria_avisado: a,
    formas_validas: faltan.length === 0,
    faltan,
  },
}
// 🔴 el ensayo ejerce el MISMO veredicto que el camino real: una pieza inválida termina la corrida en error (con la salida ya guardada en la ejecución)
if (c.pieza_valida === false) throw new Error('PIEZA_NO_VALIDA (modo seco) · ' + c.motivo_invalido + ' · en modo real habría guardado la pieza con la marca y cerrado en error')
return [salida]
