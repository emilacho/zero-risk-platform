// Arma el flujo «juicio de lo ajeno» (ADENDA 2 · c) desde entrada.js y lo deja en flujo-juicio-de-lo-ajeno.json (cuerpo de creación, SIN `active`).
// Uso: node construir-flujo.mjs            → solo escribe el JSON
//      node construir-flujo.mjs --crear    → además lo CREA en n8n (queda INACTIVO) e imprime su id. Pide N8N_BASE_URL y N8N_API_KEY.
import fs from 'node:fs'
const DIR = new URL('.', import.meta.url)
const RUTA = 'https://zero-risk-platform.vercel.app/api/brain/alimentar/juicio-de-lo-ajeno'
export function armarFlujo() {
  const jsCode = fs.readFileSync(new URL('entrada.js', DIR), 'utf8')
  return {
    name: 'Zero Risk — Cerebro · juicio de lo ajeno (prueba y primera pasada) · CC-CEREBRO',
    nodes: [
      { id: 'w1', name: 'Webhook · a mano (llave interna)', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'cerebro-juicio-de-lo-ajeno', parameters: { httpMethod: 'POST', path: 'zero-risk/cerebro-juicio-de-lo-ajeno', responseMode: 'lastNode', options: {} } },
      { id: 'e1', name: '⓪ Entrada', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0], parameters: { jsCode } },
      { id: 'j1', name: '① Juicio de lo ajeno', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [480, 0], parameters: {
        method: 'POST', url: RUTA, sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: { timeout: 300000 },
      } },
    ],
    connections: { 'Webhook · a mano (llave interna)': { main: [[{ node: '⓪ Entrada', type: 'main', index: 0 }]] }, '⓪ Entrada': { main: [[{ node: '① Juicio de lo ajeno', type: 'main', index: 0 }]] } },
    settings: { executionOrder: 'v1', timezone: 'UTC' },
  }
}
if (process.argv[1] && /construir-flujo\.mjs$/.test(process.argv[1])) {
  const f = armarFlujo()
  fs.writeFileSync(new URL('flujo-juicio-de-lo-ajeno.json', DIR), JSON.stringify(f, null, 1) + '\n')
  console.log('escrito flujo-juicio-de-lo-ajeno.json')
  if (process.argv.includes('--crear')) {
    const B = String(process.env.N8N_BASE_URL ?? '').replace(/\/$/, ''), K = process.env.N8N_API_KEY
    const r = await fetch(`${B}/api/v1/workflows`, { method: 'POST', headers: { 'X-N8N-API-KEY': K, 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const j = await r.json()
    if (!r.ok) { console.log('ALTO · n8n', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1) }
    console.log('CREADO (inactivo)', j.id, '· activo', j.active)
  }
}
