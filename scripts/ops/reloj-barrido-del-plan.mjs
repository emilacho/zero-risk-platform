#!/usr/bin/env node
/**
 * 03-nov · RESPUESTA LENOVO a CC#2 («corrida vencida y el barrido sin llamador») · el RELOJ del barrido de corridas del plan. US$ 0, nada aplicado.
 * `POST /api/planeacion/corrida/barrer` existía sin llamador: una corrida del plan que pasa su `vence_en` se queda «corriendo» y frena al cliente (`plan_en_curso`).
 * Este flujo la llama cada 15 minutos, para CUALQUIER cliente. Cumple los 6 guardarraíles de la agencia:
 *   1 cadencia definida · cron cada 15 minutos (96 al día; más es alarma)       2 reintentos con tope · 3 intentos, espera fija, sin reintento infinito
 *   3 idempotente · el barrido no repite (corrida ya cerrada no cambia)          4 rastro · el cierre deja el resultado en el registro y FALLA si la ruta no contestó 200 «barrido»
 *   5 sin costo · no invoca ningún agente ni modelo                              6 sin agentes · no aplica workflow_id (no hay llamada a /api/agents)
 * 7 (regla de Emilio · «una alarma por incidente» · RESPUESTA Lenovo 03-nov): si el reloj falla, sale UN aviso (el del flujo de errores E73); mientras siga fallando NO repite;
 *   cuando vuelve a funcionar sale UN aviso de recuperación. El estado del incidente vive en la memoria del propio flujo (`$getWorkflowStaticData`, la misma técnica del freno E79 del avisador):
 *   no se toca el avisador de CC#1 ni se inventa infraestructura. Si la memoria no se pudo guardar, el fallo es ruido (se repite), nunca silencio.
 *   node scripts/ops/reloj-barrido-del-plan.mjs [salida.json]   → escribe el flujo construido (por defecto scripts/worker-staging/reloj-barrido-del-plan/reloj-construido.json)
 */
import fs from 'node:fs'
import path from 'node:path'

export const NOMBRE = 'Zero Risk — Reloj del barrido de corridas del plan (cada 15 min · CC#2)'
export const CRON = '*/15 * * * *'
export const AVISO_DE_ERROR = '5fkPLbZvQsQa1bcd' // Zero Risk — Aviso de error → #alertas (E73 · CC#1)
export const CANAL_ALERTAS = 'C0B7XUUEBHA'
export const RUTA = '/api/planeacion/corrida/barrer'
export const N_RELOJ = 'Reloj · cada 15 minutos'
export const N_BARRER = 'Barrer · corridas del plan vencidas'
export const N_CIERRE = 'Cierre · el barrido contestó o la corrida falla'
export const N_SI_VOLVIO = '¿Volvió a funcionar?'
export const N_AVISO_VOLVIO = 'AVISO · #alertas · el reloj volvió'
export const N_LIMPIA = 'Cierre del incidente · solo si el aviso llegó'

export const CODIGO_CIERRE = [
  '// 03-nov · el barrido contestó 200 «barrido» o ESTA corrida falla (una sola vez por incidente). El nodo HTTP no rompe con un rechazo (neverError): sin este cierre un 401/404/500 pasaría',
  '// en silencio. Regla de Emilio: UNA alarma por incidente. El incidente se recuerda en la memoria del flujo: el 1.er fallo lanza (avisa el flujo de errores); los siguientes no repiten.',
  'const r = $input.first().json;',
  'const estado = Number(r.statusCode);',
  'const cuerpo = (r.body && typeof r.body === "object") ? r.body : {};',
  'const mem = $getWorkflowStaticData("global");',
  'const bien = estado === 200 && cuerpo.accion === "barrido";',
  'if (!bien) {',
  '  const detalle = "estado " + (Number.isFinite(estado) ? estado : "desconocido") + " · " + JSON.stringify(cuerpo).slice(0, 300);',
  '  if (mem.incidente_desde) {',
  '    console.log("[reloj-barrido-del-plan] SIGUE FALLANDO (ya avisado desde " + mem.incidente_desde + ") · " + detalle);',
  '    return [{ json: { ok: false, sigue_fallando: true, volvio: false } }];',
  '  }',
  '  mem.incidente_desde = new Date().toISOString();',
  '  throw new Error("BARRIDO_SIN_RESPUESTA · " + detalle);',
  '}',
  'console.log("[reloj-barrido-del-plan] " + JSON.stringify(cuerpo).slice(0, 500));',
  'return [{ json: { ok: true, volvio: !!mem.incidente_desde, desde: mem.incidente_desde || null, barrido: cuerpo } }];',
].join('\n')

/** Se borra el incidente SOLO si Slack confirmó el aviso de recuperación: si no llegó, el siguiente tic lo intenta otra vez. */
export const CODIGO_LIMPIA = [
  '// 03-nov · el incidente se cierra solo cuando el aviso de recuperación LLEGÓ (Slack ok:true). Si no llegó, queda abierto y el siguiente tic vuelve a avisar.',
  'const respuesta = $input.first().json || {};',
  'if (respuesta.ok !== true) {',
  '  console.log("[reloj-barrido-del-plan] el aviso de recuperación no llegó a Slack · el incidente sigue abierto · " + JSON.stringify(respuesta).slice(0, 200));',
  '  return [{ json: { cerrado: false } }];',
  '}',
  'const mem = $getWorkflowStaticData("global");',
  'mem.incidente_desde = null;',
  'return [{ json: { cerrado: true } }];',
].join('\n')

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
        retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
        parameters: {
          method: 'POST',
          url: `={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}${RUTA}`,
          sendHeaders: true,
          headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
          sendBody: true, specifyBody: 'json', jsonBody: '={ "dry_run": false }',
          options: { timeout: 800000, response: { response: { fullResponse: true, neverError: true } } },
        },
      },
      { id: 'rb-0003', name: N_CIERRE, type: 'n8n-nodes-base.code', typeVersion: 2, position: [520, 0], parameters: { jsCode: CODIGO_CIERRE } },
      {
        id: 'rb-0004', name: N_SI_VOLVIO, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [780, 0],
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
            conditions: [{ id: 'volvio', leftValue: '={{ $json.volvio }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
            combinator: 'and',
          },
          options: {},
        },
      },
      {
        id: 'rb-0005', name: N_AVISO_VOLVIO, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1040, -80],
        onError: 'continueRegularOutput',
        parameters: {
          method: 'POST', url: 'https://slack.com/api/chat.postMessage', sendHeaders: true,
          headerParameters: { parameters: [{ name: 'Authorization', value: '=Bearer {{ $env.SLACK_BOT_TOKEN }}' }, { name: 'Content-Type', value: 'application/json; charset=utf-8' }] },
          sendBody: true, specifyBody: 'json',
          jsonBody: `={{ JSON.stringify({ channel: "${CANAL_ALERTAS}", text: "✅ El reloj del barrido de corridas del plan volvió a funcionar (fallaba desde " + $json.desde + ")." }) }}`,
          options: { timeout: 30000 },
        },
      },
      { id: 'rb-0006', name: N_LIMPIA, type: 'n8n-nodes-base.code', typeVersion: 2, position: [1300, -80], parameters: { jsCode: CODIGO_LIMPIA } },
    ],
    connections: {
      [N_RELOJ]: { main: [[{ node: N_BARRER, type: 'main', index: 0 }]] },
      [N_BARRER]: { main: [[{ node: N_CIERRE, type: 'main', index: 0 }]] },
      [N_CIERRE]: { main: [[{ node: N_SI_VOLVIO, type: 'main', index: 0 }]] },
      [N_SI_VOLVIO]: { main: [[{ node: N_AVISO_VOLVIO, type: 'main', index: 0 }], []] },
      [N_AVISO_VOLVIO]: { main: [[{ node: N_LIMPIA, type: 'main', index: 0 }]] },
    },
    // CERT CC#3 (reserva 1): un fallo del reloj no puede quedar mudo (n8n guarda las ejecuciones ~4 h). Es el aviso de errores que ya usan otros flujos (E73).
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
