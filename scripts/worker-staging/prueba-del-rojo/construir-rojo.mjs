// Flujo TEMPORAL de la prueba del rojo (ARQ 2026-09-30 · CC#1). NO se borra hasta que CC#3 certifique: sus ejecuciones son la evidencia.
//   node construir-rojo.mjs --crear      → crea el flujo (inactivo)
// Se dispara con POST /webhook/zero-risk/rojo-cc1-prueba  {"modo":"runner_largo"|"viejo_largo"|"runner_corto"}
// Todo va en dry_run (cero costo): ejerce el camino de ENTREGA, no la calidad del agente.
const codeArmar = `
const b = $input.first().json.body || $input.first().json
const modo = b.modo
const cuerpo = { agent: 'campaign-brief-agent', task: 'prueba del rojo · pedido trivial (' + modo + ')', client_id: null,
  workflow_id: $workflow.id, workflow_execution_id: String($execution.id), step_name: 'rojo-cc1', dry_run: true, callback_url: $execution.resumeUrl }
if (modo === 'runner_largo' || modo === 'runner_corto') cuerpo.callback_mode = 'runner'
if (modo === 'runner_largo' || modo === 'viejo_largo') cuerpo.test_delay_ms = Number(b.espera_ms || 900000)
if (!['runner_largo','viejo_largo','runner_corto'].includes(modo)) throw new Error('modo inválido: ' + modo)
return [{ json: { modo, cuerpo, t_inicio: new Date().toISOString() } }]
`
const codeRegistrar = `
const a = $('Armar').first().json
const r = $input.first().json
const llego = r && (r.body || r)
const t = new Date().toISOString()
return [{ json: { modo: a.modo, execution_id: String($execution.id), t_inicio: a.t_inicio, t_vuelta: t, segundos: Math.round((Date.parse(t) - Date.parse(a.t_inicio)) / 1000),
  llego_vuelta: !!(llego && Object.keys(llego).length), success: llego && llego.success, delivered_by: llego && llego.delivered_by, dispatch_key: llego && llego.dispatch_key,
  error: llego && llego.error, error_kind: llego && llego.error_kind, respuesta_recortada: JSON.stringify(llego || null).slice(0, 400) } }]
`
export function construir() {
  const nodes = [
    { parameters: { path: 'zero-risk/rojo-cc1-prueba', httpMethod: 'POST', responseMode: 'onReceived', options: {} }, name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'rojo-cc1-prueba-0001' },
    { parameters: { jsCode: codeArmar }, name: 'Armar', type: 'n8n-nodes-base.code', typeVersion: 2, position: [260, 0] },
    { parameters: { method: 'POST', url: 'https://zero-risk-platform.vercel.app/api/agents/run-sdk', sendHeaders: true, headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}', options: { timeout: 60000, response: { response: { neverError: true } } } },
      name: 'run-sdk', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [520, 0], onError: 'continueRegularOutput' },
    { parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: 1500, resumeUnit: 'seconds', options: {} }, name: 'Esperar la vuelta', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [780, 0], webhookId: 'rojo-cc1-prueba-0001-espera' },
    { parameters: { jsCode: codeRegistrar }, name: 'Registrar', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1040, 0] },
  ]
  const link = (a, b) => [a, { main: [[{ node: b, type: 'main', index: 0 }]] }]
  const connections = Object.fromEntries([link('Webhook', 'Armar'), link('Armar', 'run-sdk'), link('run-sdk', 'Esperar la vuelta'), link('Esperar la vuelta', 'Registrar')])
  return { name: 'CC1 · prueba del rojo TEMPORAL (NO BORRAR hasta que CC#3 certifique)', nodes, connections, settings: { executionOrder: 'v1' } }
}
if (process.argv[1] && process.argv[1].endsWith('construir-rojo.mjs') && process.argv.includes('--crear')) {
  const base = process.env.N8N_BASE_URL
  const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(construir()) })).json()
  console.log('creado', r.id || JSON.stringify(r).slice(0, 300))
}
