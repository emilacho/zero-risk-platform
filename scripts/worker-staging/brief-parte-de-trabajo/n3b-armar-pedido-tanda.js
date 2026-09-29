// ③b ARMAR EL PEDIDO DE LA TANDA · CC#1 · 2026-09-29. Llamada k de N: los briefs COMPLETOS de los ids de esta tanda, y solo esos.
// El cuerpo lleva `dry_run` (misma regla que ③a) y se manda tal cual al nodo que paga.
const t = $input.first().json // la tanda actual (salida del recorrido)
const c = $('③a ¿Llegó la lista?').first().json // el contexto: manual, plan, lista, dry_run…
const REFERENCIA = __REFERENCIA__
const REGLAS = __REGLAS__

const tarea = [
  '## TU TAREA EN ESTA LLAMADA: SOLO LOS BRIEFS COMPLETOS DE ESTOS ENTREGABLES: ' + t.ids.join(', ') + '  (tanda ' + t.tanda_n + ' de ' + t.tandas_total + ')',
  'La lista cerrada YA está decidida (abajo, para que tengas el contexto de los demás). NO la reescribas, NO cambies ids, NO agregues entregables, NO escribas los briefs de otros ids.',
  'Escribe el brief con TODOS los campos de la referencia para cada uno de estos ids. Usa el mismo id, plataforma, tipo_de_pieza, que_es y de_que_parte_del_plan de la lista (puedes precisar la cita).',
  'Responde EXCLUSIVAMENTE con UN bloque JSON con esta forma exacta:',
  '{ "tanda": { "entregables": [ {',
  '    "id": "BRF-0001", "plataforma": "…", "tipo_de_pieza": "imagen|texto|listado|configuracion|carrusel|documento|otro",',
  '    "que_es": "…", "de_que_parte_del_plan": "Sección N + frase textual entre comillas simples", "objetivo": "…", "segmento": "…", "protagonista": "…", "mensaje": "UN solo mensaje",',
  '    "hipotesis": "…", "limites": "…", "vocabulario_obligatorio": ["…"], "prohibido": ["…"], "sintaxis": "…",',
  '    "visual": { "capa_que_manda": "producto|grafica", "descripcion": "…", "muestra": "…" },',
  '    "llamado_a_la_accion": "…", "variantes": "…", "negativos": ["…"], "aprueba_y_para_cuando": "…", "presupuesto": null',
  '  } ] } }',
].join('\n')

const pedido = [
  'Eres el planificador que BAJA un plan de marketing a TRABAJO, para el cliente «' + c.client_name + '».',
  '',
  REGLAS,
  '',
  tarea,
  '',
  '════════ LA LISTA CERRADA DE ENTREGABLES (ya decidida · solo contexto) ════════',
  JSON.stringify(c.lista.entregables),
  '',
  '════════ MANUAL DE MARCA VIGENTE (versión ' + c.manual_version + ' · id ' + c.manual_id + ') ════════',
  c.manual_texto || '(el manual no trae texto)',
  '',
  '════════ PLAN DE 90 DÍAS VIGENTE (id ' + c.plan_id + ') ════════',
  c.plan_texto,
  '',
  '════════ REFERENCIA · EL BRIEF DE UN ENTREGABLE (campos, reglas y trampas) ════════',
  REFERENCIA,
].join('\n')

const cuerpo = {
  agent: 'campaign-brief-agent',
  task: pedido,
  client_id: c.client_id,
  workflow_id: $workflow.id,
  workflow_execution_id: $execution.id,
  callback_url: $execution.resumeUrl,
  force_restart: true,
  // 🔴 EL INTERRUPTOR LLEGA AL NODO QUE PAGA (en cada tanda)
  dry_run: c.dry_run === true,
}
return [{ json: { tanda_n: t.tanda_n, tandas_total: t.tandas_total, ids: t.ids, cuerpo, pedido_caracteres: pedido.length } }]
