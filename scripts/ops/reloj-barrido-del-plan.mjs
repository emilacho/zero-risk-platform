#!/usr/bin/env node
/**
 * 03-nov · RESPUESTA LENOVO a CC#2 («corrida vencida y el barrido sin llamador») · el RELOJ del barrido de corridas del plan. US$ 0, nada aplicado.
 * `POST /api/planeacion/corrida/barrer` existía sin llamador: una corrida del plan que pasa su `vence_en` se queda «corriendo» y frena al cliente (`plan_en_curso`).
 * Este flujo la llama cada 15 minutos, para CUALQUIER cliente. Cumple los 6 guardarraíles de la agencia:
 *   1 cadencia definida · cron cada 15 minutos (96 al día; más es alarma)       2 reintentos con tope · 3 intentos, espera fija, sin reintento infinito
 *   3 idempotente · el barrido no repite (corrida ya cerrada no cambia)   4 rastro · el cierre deja el resultado en el registro y FALLA si la ruta no contestó 200 «barrido»
 *   5 sin costo · no invoca ningún agente ni modelo                    6 sin agentes · no aplica workflow_id (no hay llamada a /api/agents)
 *   node scripts/ops/reloj-barrido-del-plan.mjs [salida.json]   → escribe el flujo construido (por defecto scripts/worker-staging/reloj-barrido-del-plan/reloj-construido.json)
 */
import fs from 'node:fs'
import path from 'node:path'

export const NOMBRE = 'Zero Risk — Reloj del barrido de corridas del plan (cada 15 min · CC#2)'
export const CRON = '*/15 * * * *'
export const RUTA = '/api/planeacion/corrida/barrer'
export const N_RELOJ = 'Reloj · cada 15 minutos'
export const N_BARRER = 'Barrer · corridas del plan vencidas'
export const N_CIERRE = 'Cierre · el barrido contestó o la corrida falla'

export const CODIGO_CIERRE = [
  '// 03-nov · el barrido contestó 200 «barrido» o ESTA corrida falla. El nodo HTTP no rompe con un rechazo (neverError): sin este cierre un 401/404/500 pasaría en silencio',
  '// (la ruta devolvió 404 hasta que se publicó #868 y nadie lo habría visto). El resultado queda en el registro de la corrida.',
  'const r = $input.first().json;',
  'const estado = Number(r.statusCode);',
  'const cuerpo = (r.body && typeof r.body === "object") ? r.body : {};',
  'if (estado !== 200 || cuerpo.accion !== "barrido") {',
  '  throw new Error("BARRIDO_SIN_RESPUESTA · estado " + (Number.isFinite(estado) ? estado : "desconocido") + " · " + JSON.stringify(cuerpo).slice(0, 300));',
  '}',
  'console.log("[reloj-barrido-del-plan] " + JSON.stringify(cuerpo).slice(0, 500));',
  'return [{ json: { ok: true, barrido: cuerpo } }];',
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
    ],
    connections: {
      [N_RELOJ]: { main: [[{ node: N_BARRER, type: 'main', index: 0 }]] },
      [N_BARRER]: { main: [[{ node: N_CIERRE, type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveManualExecutions: true },
  }
}

const esMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (esMain) {
  const salida = process.argv[2] ?? path.join('scripts', 'worker-staging', 'reloj-barrido-del-plan', 'reloj-construido.json')
  fs.mkdirSync(path.dirname(salida), { recursive: true })
  fs.writeFileSync(salida, JSON.stringify(construir(), null, 1))
  console.log('construido ·', salida)
}
