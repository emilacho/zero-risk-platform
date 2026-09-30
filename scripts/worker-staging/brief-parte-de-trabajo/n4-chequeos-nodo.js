// ④ CHEQUEOS · cuerpo del nodo · CC#1 · 2026-09-29 (la lógica pura `brief-chequeos.js` va ANTEPUESTA por el constructor).
// Gratis y en código. Lo que falle SE DECLARA en el parte · NO se corrige solo. Arma la fila que ⑤ guardará y el aviso de ⑥.
const c = $input.first().json
const ext = c.llego_la_vuelta ? extraerParte(c.texto) : { legible: false, motivo: c.motivo || 'la vuelta del redactor no llegó' }
const manual = { forbidden_words: c.forbidden_words || [], required_terminology: c.required_terminology || [] }
const parte = ext.legible ? ext.parte : { entregables: [], pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [] }
const res = ext.legible
  ? chequear(parte, manual, c.plan_texto)
  : { ok: false, hallazgos: [{ chequeo: 'respuesta_no_legible', entregable: null, detalle: ext.motivo }], por_chequeo: { respuesta_no_legible: 1 }, entregables_revisados: 0 }

// ── EL VEREDICTO · un parte que no vale NO se lee como éxito (encargo Lenovo 30-sep §2) ──────────────────────
// Inválido = la vuelta no llegó · la respuesta no se pudo leer como parte · trae 0 entregables · o falla un chequeo de CONTEO/CIFRAS
// (sin_entregables · centinela: la cifra copiada del ejemplo). Los demás hallazgos siguen SOLO declarándose (no se corrigen solos).
// Nada se rellena: un parte vacío se llama vacío.
const CHEQUEOS_FATALES = ['respuesta_no_legible', 'sin_entregables', 'centinela']
const motivos = []
if (!c.llego_la_vuelta) motivos.push(c.falla_del_redactor ? 'el redactor FALLÓ · ' + c.falla_del_redactor : 'la vuelta del redactor NO llegó')
if (!ext.legible) motivos.push('la respuesta no se pudo leer como parte (' + (ext.motivo || 'sin motivo') + ')')
if (ext.legible && parte.entregables.length === 0) motivos.push('entregables: 0')
res.hallazgos.filter((h) => CHEQUEOS_FATALES.indexOf(h.chequeo) !== -1 && h.chequeo !== 'respuesta_no_legible' && h.chequeo !== 'sin_entregables').forEach((h) => motivos.push('falla el chequeo «' + h.chequeo + '»' + (h.entregable ? ' en ' + h.entregable : '')))
const parte_valido = motivos.length === 0
const motivo_invalido = parte_valido ? null : motivos.join(' · ')

// ── el parte, legible (lo que Emilio lee en Drive) ────────────────────────────────────────────────
const L = []
const p = (s) => L.push(s === undefined ? '' : s)
const lista = (a) => (Array.isArray(a) && a.length ? a.map((x) => '  - ' + (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') : '  (ninguno)')
const hoy = new Date().toISOString().slice(0, 10)
if (!parte_valido) {
  p('# ⛔ PARTE NO VÁLIDO · NO USAR')
  p('Motivo: ' + motivo_invalido)
  p('Este documento se conserva sólo para diagnóstico. No es un parte de trabajo.')
  p('')
}
p('# PARTE DE TRABAJO · ' + c.client_name + ' · ' + hoy)
p('Plan de origen: ' + c.plan_id + ' · Manual: versión ' + c.manual_version + ' (' + c.manual_id + ')' + (c.dry_run ? ' · ⚠️ MODO SECO (no es un parte real)' : ''))
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
if (!ext.legible) {
  p('')
  p('## ⚠️ Respuesta del redactor (no legible como parte · se guarda tal cual para diagnóstico)')
  p(String(c.texto || '').slice(0, 6000))
}
const parte_md = L.join('\n')

const fila_parte = {
  client_id: c.client_id,
  title: (parte_valido ? '' : '⛔ PARTE NO VÁLIDO · ') + 'Parte de trabajo · briefs · ' + hoy,
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
    legible: ext.legible,
    valido: parte_valido,
    motivo_invalido,
    chequeos_ok: res.ok,
    hallazgos: res.hallazgos.length,
    por_chequeo: res.por_chequeo,
    entregables: parte.entregables.length,
    pendientes: (parte.pendientes_declarados || []).length,
    huecos: (parte.huecos || []).length,
    dry_run: c.dry_run === true,
    guardado_antes_de_drive: true,
    tope_usd: c.tope_usd === undefined ? null : c.tope_usd,
    costo_usd: c.vuelta_costo_usd === undefined ? null : c.vuelta_costo_usd,
    parte: ext.legible ? parte : null,
  },
}
const payload_cable = {
  event_type: 'run_completed',
  worker_id: $workflow.id,
  worker_name: 'brief',
  // el cable declara el resultado REAL (el cierre ⑤ lo corrige a parte_no_valido / parte_con_problemas si algo falla)
  resultado: parte_valido ? 'parte_terminado' : 'parte_no_valido',
  ...(parte_valido ? {} : { motivo: motivo_invalido }),
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
    plan_id: c.plan_id,
    manual_id: c.manual_id,
    cuerpo_dry_run_enviado: c.cuerpo && c.cuerpo.dry_run,
    llego_la_vuelta: c.llego_la_vuelta,
    vuelta_real: c.vuelta_real,
    simulacro_usado: c.simulacro_usado,
    vuelta_costo_usd: c.vuelta_costo_usd,
    vuelta_modelo: c.vuelta_modelo,
    falla_del_redactor: c.falla_del_redactor || null,
    tope_usd: c.tope_usd === undefined ? null : c.tope_usd,
    parte_legible: ext.legible,
    parte_valido,
    motivo_invalido,
    titulo_parte: fila_parte.title,
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
