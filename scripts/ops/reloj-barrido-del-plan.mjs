#!/usr/bin/env node
/**
 * 03-nov · RESPUESTA LENOVO a CC#2 («corrida vencida y el barrido sin llamador») · el RELOJ del barrido de corridas del plan. US$ 0, nada aplicado.
 * `POST /api/planeacion/corrida/barrer` existía sin llamador: una corrida del plan que pasa su `vence_en` se queda «corriendo» y frena al cliente (`plan_en_curso`).
 * Este flujo la llama cada 15 minutos, para CUALQUIER cliente. Cumple los 6 guardarraíles de la agencia:
 *   1 cadencia definida · cron cada 15 minutos (96 al día; más es alarma)       2 reintentos con tope · 3 intentos, espera fija, sin reintento infinito
 *   3 idempotente · el barrido no repite (corrida ya cerrada no cambia)          4 rastro · el resultado queda en el registro de la corrida y en la fila de la corrida cerrada
 *   5 sin costo · no invoca ningún agente ni modelo                              6 sin agentes · no aplica workflow_id (no hay llamada a /api/agents)
 * 7 (regla de Emilio · «una alarma por incidente, los cambios en su hilo» · RESPUESTA Lenovo 03-nov): si el reloj falla, el flujo publica UNA alarma en #alertas y guarda el hilo
 *   (`thread_ts`); mientras siga fallando NO repite; cuando vuelve a funcionar RESPONDE en ese hilo. El estado del incidente vive en la memoria del propio flujo
 *   (`$getWorkflowStaticData`, la misma técnica del freno E79 del avisador): no se toca el avisador de CC#1. El incidente SOLO se abre cuando Slack confirmó la alarma y SOLO se cierra
 *   cuando Slack confirmó la respuesta: si Slack falla, el siguiente tic lo reintenta (ruido, nunca silencio). El flujo de errores E73 queda como red para lo imprevisto (el flujo muere sin pasar por el cierre).
 *   node scripts/ops/reloj-barrido-del-plan.mjs [salida.json]   → escribe el flujo construido (por defecto scripts/worker-staging/reloj-barrido-del-plan/reloj-construido.json)
 */
import fs from 'node:fs'
import path from 'node:path'

export const NOMBRE = 'Zero Risk — Reloj del barrido de corridas del plan (cada 15 min · CC#2)'
export const CRON = '*/15 * * * *'
export const AVISO_DE_ERROR = '5fkPLbZvQsQa1bcd' // Zero Risk — Aviso de error → #alertas (E73 · CC#1): red para lo imprevisto
export const CANAL_ALERTAS = 'C0B7XUUEBHA'
export const RUTA = '/api/planeacion/corrida/barrer'
export const N_RELOJ = 'Reloj · cada 15 minutos'
export const N_BARRER = 'Barrer · corridas del plan vencidas'
export const N_CIERRE = 'Cierre · decidir si avisar'
export const N_SI_FALLO = '¿Primer fallo?'
export const N_ALARMA = 'ALARMA · #alertas · el reloj no pudo barrer'
export const N_ANOTA = 'Abrir el incidente · solo si la alarma llegó'
export const N_SI_VOLVIO = '¿Volvió a funcionar?'
export const N_AVISO_VOLVIO = 'EN EL HILO · #alertas · el reloj volvió'
export const N_LIMPIA = 'Cerrar el incidente · solo si la respuesta llegó'

export const CODIGO_CIERRE = [
  '// 03-nov · decide si AVISAR. El nodo HTTP no rompe con un rechazo (neverError) ni con un corte de red (continueRegularOutput): sin este cierre un 401/404/500 pasaría en silencio.',
  '// Regla de Emilio: UNA alarma por incidente y sus cambios en SU hilo. La memoria del flujo recuerda el incidente: solo se abre cuando Slack confirmó la alarma.',
  'const r = $input.first().json || {};',
  'const estado = Number(r.statusCode);',
  'const cuerpo = (r.body && typeof r.body === "object") ? r.body : {};',
  'const mem = $getWorkflowStaticData("global");',
  'const bien = estado === 200 && cuerpo.accion === "barrido";',
  'if (bien) {',
  '  console.log("[reloj-barrido-del-plan] " + JSON.stringify(cuerpo).slice(0, 500));',
  '  if (mem.incidente_desde) return [{ json: { accion: "avisar_volvio", desde: mem.incidente_desde, hilo: mem.incidente_hilo || null, barrido: cuerpo } }];',
  '  return [{ json: { accion: "nada", barrido: cuerpo } }];',
  '}',
  'const detalle = (r.error ? "error de red: " + String((r.error && r.error.message) || r.error).slice(0, 200) : "estado " + (Number.isFinite(estado) ? estado : "desconocido") + " · " + JSON.stringify(cuerpo).slice(0, 300));',
  'if (mem.incidente_desde) {',
  '  console.log("[reloj-barrido-del-plan] SIGUE FALLANDO (ya avisado desde " + mem.incidente_desde + ") · " + detalle);',
  '  return [{ json: { accion: "nada", sigue_fallando: true } }];',
  '}',
  'const base = ($env.N8N_BASE_URL || "https://n8n-production-72be.up.railway.app").replace(/\\/$/, "");',
  'const url = base + "/workflow/" + $workflow.id + "/executions/" + $execution.id;',
  'return [{ json: { accion: "avisar_fallo", detalle: detalle,',
  '  texto: "🔴 El reloj del barrido de corridas del plan no pudo barrer · " + detalle + "\\nQUÉ HACER: abrir la ejecución antes de 4 h (el motor la borra) · " + url + "\\nMientras siga fallando no se repite; cuando vuelva, se responde en este hilo." } }];',
].join('\n')

/** Se abre el incidente SOLO si Slack confirmó la alarma (guarda su hilo): si no llegó, el siguiente tic vuelve a avisar. */
export const CODIGO_ANOTA = [
  '// 03-nov · el incidente se abre solo cuando la alarma LLEGÓ (Slack ok:true) y se guarda su hilo para responder ahí al recuperarse.',
  'const respuesta = $input.first().json || {};',
  'if (respuesta.ok !== true || !respuesta.ts) {',
  '  console.log("[reloj-barrido-del-plan] la alarma no llegó a Slack · el incidente NO se abre; el siguiente tic vuelve a avisar · " + JSON.stringify(respuesta).slice(0, 200));',
  '  return [{ json: { abierto: false } }];',
  '}',
  'const mem = $getWorkflowStaticData("global");',
  'mem.incidente_desde = new Date().toISOString();',
  'mem.incidente_hilo = respuesta.ts;',
  'return [{ json: { abierto: true, hilo: respuesta.ts } }];',
].join('\n')

/** Se cierra el incidente SOLO si Slack confirmó la respuesta en el hilo: si no llegó, queda abierto y el siguiente tic lo reintenta. */
export const CODIGO_LIMPIA = [
  '// 03-nov · el incidente se cierra solo cuando la respuesta en el hilo LLEGÓ (Slack ok:true). Si no llegó, queda abierto y el siguiente tic vuelve a responder.',
  'const respuesta = $input.first().json || {};',
  'if (respuesta.ok !== true) {',
  '  console.log("[reloj-barrido-del-plan] la respuesta en el hilo no llegó a Slack · el incidente sigue abierto · " + JSON.stringify(respuesta).slice(0, 200));',
  '  return [{ json: { cerrado: false } }];',
  '}',
  'const mem = $getWorkflowStaticData("global");',
  'mem.incidente_desde = null;',
  'mem.incidente_hilo = null;',
  'return [{ json: { cerrado: true } }];',
].join('\n')

const slack = (id, nombre, y, cuerpo) => ({
  id, name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1040, y], onError: 'continueRegularOutput',
  parameters: {
    method: 'POST', url: 'https://slack.com/api/chat.postMessage', sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.SLACK_BOT_TOKEN }}' }, { name: 'Content-Type', value: 'application/json; charset=utf-8' }] },
    sendBody: true, specifyBody: 'json', jsonBody: cuerpo, options: { timeout: 30000 },
  },
})
const si = (id, nombre, y, campo, valor) => ({
  id, name: nombre, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [780, y],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'cond', leftValue: `={{ $json.${campo} }}`, rightValue: valor, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and',
    },
    options: {},
  },
})
const codigo = (id, nombre, x, y, jsCode) => ({ id, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { jsCode } })

export function construir() {
  return {
    name: NOMBRE,
    nodes: [
      {
        id: 'rb-0001', name: N_RELOJ, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0],
        parameters: { rule: { interval: [{ field: 'cronExpression', expression: CRON }] } },
      },
      {
        id: 'rb-0002', name: N_BARRER, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 0],
        retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
        parameters: {
          method: 'POST',
          url: `={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}${RUTA}`,
          sendHeaders: true,
          headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
          sendBody: true, specifyBody: 'json', jsonBody: '={ "dry_run": false }',
          options: { timeout: 800000, response: { response: { fullResponse: true, neverError: true } } },
        },
      },
      codigo('rb-0003', N_CIERRE, 520, 0, CODIGO_CIERRE),
      si('rb-0004', N_SI_FALLO, -120, 'accion', 'avisar_fallo'),
      slack('rb-0005', N_ALARMA, -200, `={{ JSON.stringify({ channel: "${CANAL_ALERTAS}", text: $('${N_CIERRE}').first().json.texto }) }}`),
      codigo('rb-0006', N_ANOTA, 1300, -200, CODIGO_ANOTA),
      si('rb-0007', N_SI_VOLVIO, 120, 'accion', 'avisar_volvio'),
      slack('rb-0008', N_AVISO_VOLVIO, 200, `={{ JSON.stringify({ channel: "${CANAL_ALERTAS}", thread_ts: $('${N_CIERRE}').first().json.hilo, text: "✅ El reloj del barrido de corridas del plan volvió a funcionar (fallaba desde " + $('${N_CIERRE}').first().json.desde + ")." }) }}`),
      codigo('rb-0009', N_LIMPIA, 1300, 200, CODIGO_LIMPIA),
    ],
    connections: {
      [N_RELOJ]: { main: [[{ node: N_BARRER, type: 'main', index: 0 }]] },
      [N_BARRER]: { main: [[{ node: N_CIERRE, type: 'main', index: 0 }]] },
      [N_CIERRE]: { main: [[{ node: N_SI_FALLO, type: 'main', index: 0 }, { node: N_SI_VOLVIO, type: 'main', index: 0 }]] },
      [N_SI_FALLO]: { main: [[{ node: N_ALARMA, type: 'main', index: 0 }], []] },
      [N_ALARMA]: { main: [[{ node: N_ANOTA, type: 'main', index: 0 }]] },
      [N_SI_VOLVIO]: { main: [[{ node: N_AVISO_VOLVIO, type: 'main', index: 0 }], []] },
      [N_AVISO_VOLVIO]: { main: [[{ node: N_LIMPIA, type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveManualExecutions: true, errorWorkflow: AVISO_DE_ERROR },
  }
}

const esMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (esMain) {
  const salida = process.argv[2] ?? path.join('scripts', 'worker-staging', 'reloj-barrido-del-plan', 'reloj-construido.json')
  fs.mkdirSync(path.dirname(salida), { recursive: true })
  fs.writeFileSync(salida, JSON.stringify(construir(), null, 1))
  console.log('construido ·', salida)
}
