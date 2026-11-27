// Constructor del flujo «Manual · Cómo se produce con IA» · encargo 16 (21-nov) · flujo n8n INACTIVO.
//
//   node construir.mjs --salida=<carpeta>   → escribe el JSON · NO toca n8n
//   node construir.mjs --crear              → crea el flujo REAL en n8n, INACTIVO (no se publica ni se activa)
//   node construir.mjs --actualizar=<id>    → PUT del JSON (nunca cambia si está activo o no)
//
//  · webhook `zero-risk/manual-produccion-con-ia` (POST { client_id, dry_run, reescribir? }) con la llave INTERNA en la
//    cabecera (`x-api-key` comparada contra $env.INTERNAL_API_KEY en ⓪; NUNCA SALA_DISPATCH_KEY; jamás escrita en este JSON).
//    Llave ausente, errada o entorno sin la variable → ⓪ lanza y NADA corre (🔴 2 de CC6 en #1275).
//  · ⓪ llave y cuerpo → ① preparar (la puerta lee el cerebro entero y arma el pedido) → con `dry_run` NINGÚN paso de
//    modelo corre (fin seco con los conteos) → ② el AGENTE por flujo (`run-sdk`, creative-director-mesa (encargo 17: convierte manual en instrucciones de producción, trabaja en español), tope US$ 0,80, `force_restart: true`
//    (adenda 27-nov: el punto de control del corredor guarda por flujo+cliente+paso SIN distinguir ejecuciones y una corrida nueva devolvía el texto viejo del 23-nov; esta puerta siempre quiere escritura fresca); si el
//    cerebro falla, el corredor detiene el paso «esperando al cerebro», encargo 15) → ③ escribir (encargo 17: BORRADOR con
//    tarjeta en la bandeja, SIN vigencia: la versión del manual la crea la aprobación de Emilio) → fin.
//  · Ningún nodo que pague tiene retryOnFail · toda llamada HTTP entrega siempre salida (neverError) y una GUARDA decide.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

const VERCEL = 'https://zero-risk-platform.vercel.app'
const JSON_H = { name: 'Content-Type', value: 'application/json' }
const LLAVE_INTERNA = { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }
const N = {
  web: 'Webhook · producción con IA', entrada: '⓪ Entrada · llave',
  preparar: '① Preparar (el cerebro entero)', guarda: '① Guarda', ifSigue: '① ¿Sigue?', ifSeco: '① ¿Seco?',
  agenteRun: '② Agente · run-sdk', vuelta: '② Vuelta', ifTexto: '② ¿Hay texto?',
  escribir: '③ Escribir la sección', fin: '③ Fin',
}
const code = (nombre, archivo, pos) => ({ parameters: { jsCode: leer(archivo) }, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })
const http = (nombre, url, pos, { headers = [], body = null, timeout = 30000 } = {}) => ({
  parameters: {
    method: 'POST', url, sendHeaders: true, headerParameters: { parameters: [JSON_H, ...headers] },
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
    options: { timeout, response: { response: { neverError: true } } },
  },
  name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
})
const cond = (nombre, izq, pos) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: izq, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} },
  name: nombre, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos,
})
const x = (n, dy = 0) => [n * 220, 300 + dy]

const nodes = [
  { parameters: { httpMethod: 'POST', path: 'zero-risk/manual-produccion-con-ia', responseMode: 'lastNode', options: {} }, name: N.web, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0) },
  code(N.entrada, 'n0-entrada.js', x(1)),
  http(N.preparar, `${VERCEL}/api/manual/produccion-con-ia`, x(2), { headers: [LLAVE_INTERNA], body: '={{ JSON.stringify({ accion: "preparar", client_id: $json.client_id, reescribir: $json.reescribir }) }}', timeout: 120000 }),
  code(N.guarda, 'n1-guarda.js', x(3)),
  cond(N.ifSigue, '={{ $json.sigue }}', x(4)),
  cond(N.ifSeco, '={{ $json.dry_run === false }}', x(5)),
  http(N.agenteRun, `${VERCEL}/api/agents/run-sdk`, x(6, -150), { headers: [LLAVE_INTERNA], body: '={{ JSON.stringify({ agent: "creative-director-mesa", client_id: $json.client_id, workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id, step_name: "manual-produccion-con-ia", task: $json.insumos.task, force_restart: true, dry_run: false, max_budget_usd: 0.8, thinking_mode: "disabled" }) }}', timeout: 800000 }),
  code(N.vuelta, 'n2-vuelta.js', x(7, -150)),
  cond(N.ifTexto, '={{ $json.sigue }}', x(8, -150)),
  http(N.escribir, `${VERCEL}/api/manual/produccion-con-ia`, x(9, -300), { headers: [LLAVE_INTERNA], body: '={{ JSON.stringify({ accion: "escribir", client_id: $json.client_id, texto: $json.texto, version_base: $json.insumos.version_base, dry_run: false, workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id }) }}', timeout: 120000 }),
  { parameters: { mode: 'raw', jsonOutput: '={{ JSON.stringify({ ...$(\'② Vuelta\').first().json, escrito: $json }) }}', options: {} }, name: '③ Juntar', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: x(10, -300) },
  code(N.fin, 'n3-fin.js', x(11)),
]
const connections = {
  [N.web]: { main: [[{ node: N.entrada, type: 'main', index: 0 }]] },
  [N.entrada]: { main: [[{ node: N.preparar, type: 'main', index: 0 }]] },
  [N.preparar]: { main: [[{ node: N.guarda, type: 'main', index: 0 }]] },
  [N.guarda]: { main: [[{ node: N.ifSigue, type: 'main', index: 0 }]] },
  [N.ifSigue]: { main: [[{ node: N.ifSeco, type: 'main', index: 0 }], [{ node: N.fin, type: 'main', index: 0 }]] },
  [N.ifSeco]: { main: [[{ node: N.agenteRun, type: 'main', index: 0 }], [{ node: N.fin, type: 'main', index: 0 }]] },
  [N.agenteRun]: { main: [[{ node: N.vuelta, type: 'main', index: 0 }]] },
  [N.vuelta]: { main: [[{ node: N.ifTexto, type: 'main', index: 0 }]] },
  [N.ifTexto]: { main: [[{ node: N.escribir, type: 'main', index: 0 }], [{ node: N.fin, type: 'main', index: 0 }]] },
  [N.escribir]: { main: [[{ node: '③ Juntar', type: 'main', index: 0 }]] },
  '③ Juntar': { main: [[{ node: N.fin, type: 'main', index: 0 }]] },
}
const flujo = { name: 'Manual · Cómo se produce con IA (encargo 16)', nodes, connections, settings: { executionOrder: 'v1' } }

const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
if (arg('--salida=')) {
  const carpeta = arg('--salida=')
  fs.mkdirSync(carpeta, { recursive: true })
  fs.writeFileSync(join(carpeta, 'manual-produccion-con-ia.json'), JSON.stringify(flujo, null, 1))
  console.log('JSON escrito en', carpeta, '· NO se tocó n8n')
} else if (process.argv.includes('--crear') || arg('--actualizar=')) {
  const base = process.env.N8N_BASE_URL?.replace(/\/$/, '')
  const llave = process.env.N8N_API_KEY
  if (!base || !llave) { console.error('faltan N8N_BASE_URL / N8N_API_KEY en el entorno'); process.exit(1) }
  const hdr = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': llave }
  if (process.argv.includes('--crear')) {
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(flujo) })).json()
    console.log('creado INACTIVO:', r.id ?? JSON.stringify(r))
  } else {
    const r = await fetch(`${base}/api/v1/workflows/${arg('--actualizar=')}`, { method: 'PUT', headers: hdr, body: JSON.stringify(flujo) })
    console.log('actualizado:', r.status)
  }
} else {
  console.log('uso: --salida=<carpeta> | --crear | --actualizar=<id>')
}
