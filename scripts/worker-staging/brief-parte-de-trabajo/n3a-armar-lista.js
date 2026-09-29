// ③a ARMAR EL PEDIDO DE LA LISTA · CC#1 · 2026-09-29 · el parte va EN TANDAS (para caber en los 800 s de la función de Vercel).
// Llamada 1 de N: el agente devuelve SOLO la lista cerrada de entregables (id · plataforma · tipo · una línea · de qué parte del plan
// sale) + los pendientes, huecos, contradicciones y dependencias. Los briefs completos se piden después, por tandas (③b).
// 🔴 MODO SECO DE VERDAD: `dry_run` viaja en el CUERPO que se manda a /api/agents/run-sdk (campo `cuerpo.dry_run`); el nodo HTTP
// manda EXACTAMENTE `JSON.stringify(cuerpo)`, así que lo enviado queda visible como la salida de ESTE nodo.
// `force_restart:true` es obligatorio: sin él el corredor sirve un punto de control guardado (vuelve en 0,7 s sin haber corrido).
const prev = $('② ¿Ya hay parte de este plan? · guarda').first().json
let ficha = {}
try { const f = $input.first().json; ficha = Array.isArray(f) ? f[0] || {} : f || {} } catch (e) { ficha = {} }
const nombre = String(ficha.name || ficha.client_name || 'cliente')

const REFERENCIA = __REFERENCIA__
const REGLAS = __REGLAS__

const tarea = [
  '## TU TAREA EN ESTA LLAMADA: SOLO LA LISTA CERRADA (NO escribas los briefs completos)',
  'Lee el manual y el plan y decide QUÉ entregables de producción hay que hacer (máximo 10, los que el plan pide; ni uno inventado).',
  'Responde EXCLUSIVAMENTE con UN bloque JSON con esta forma exacta:',
  '{ "lista": {',
  '  "entregables": [ { "id": "BRF-0001", "plataforma": "…", "tipo_de_pieza": "imagen|texto|listado|configuracion|carrusel|documento|otro", "que_es": "una sola línea", "de_que_parte_del_plan": "Sección N + frase textual del plan entre comillas simples" } ],',
  '  "pendientes_declarados": [ { "entregable": "…", "plataforma": "…", "motivo": "…" } ],',
  '  "huecos": [ "…" ],',
  '  "contradicciones_plan_vs_manual": [ { "que": "…", "plan_dice": "…", "manual_dice": "…", "que_se_hizo": "…" } ],',
  '  "dependencias": [ "…" ]',
  '} }',
].join('\n')

const pedido = [
  'Eres el planificador que BAJA un plan de marketing a TRABAJO. Vas a producir un PARTE DE TRABAJO para el cliente «' + nombre + '».',
  '',
  REGLAS,
  '',
  tarea,
  '',
  '════════ MANUAL DE MARCA VIGENTE (versión ' + prev.manual_version + ' · id ' + prev.manual_id + ') ════════',
  prev.manual_texto || '(el manual no trae texto)',
  '',
  '════════ PLAN DE 90 DÍAS VIGENTE (id ' + prev.plan_id + ') ════════',
  prev.plan_texto,
  '',
  '════════ REFERENCIA · EL BRIEF DE UN ENTREGABLE (campos, reglas y trampas) ════════',
  REFERENCIA,
].join('\n')

const cuerpo = {
  agent: 'campaign-brief-agent',
  task: pedido,
  client_id: prev.client_id,
  workflow_id: $workflow.id,
  workflow_execution_id: $execution.id,
  callback_url: $execution.resumeUrl,
  force_restart: true,
  // 🔴 EL INTERRUPTOR LLEGA AL NODO QUE PAGA
  dry_run: prev.dry_run === true,
}
return [{ json: { ...prev, client_name: nombre, paso: 'lista', cuerpo, pedido_caracteres: pedido.length } }]
