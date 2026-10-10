// Constructor del flujo «Manual · revisión» · CC#2 · 2026-10-10 · M3 de la revisión del manual · orden de Lenovo «flujo n8n INACTIVO con el paso del juez alimentado SOLO con fuente cruda».
//
//   node construir-manual.mjs --salida=<carpeta>   → escribe el JSON · NO toca n8n
//   node construir-manual.mjs --crear              → crea el flujo REAL en n8n, INACTIVO (no se publica ni se activa)
//   node construir-manual.mjs --actualizar=<id>    → PUT del JSON (nunca cambia si está activo o no)
//
//  · webhook `zero-risk/manual-revision` (POST { client_id, dry_run }) con la llave de despacho de siempre (SALA_DISPATCH_KEY, jamás escrita en el JSON). `dry_run` BOOLEANO OBLIGATORIO.
//  · ① preparar (S0/S1/S3, todo código)  ② el autor corrige una vez solo los hallazgos de hecho  ③ la puerta final (código)  ④ EL JUEZ DE FIDELIDAD con evidencia SOLO cruda (paso nuevo, aditivo)
//    ⑤ la opinión de GPT ciego (una sola pregunta, 3 reintentos, no bloquea)  ⑥ el autor responde (una pasada) + la puerta  ⑦ borrador + tarjeta de la bandeja  ⑧ cierre.
// 🔴 Por construcción: el cimiento `ssLtwYPt7zxuvnM2` y el lazo A `kSSAvCbEfHs2Hoa0` NO se llaman ni se tocan (el manual vigente es lo que ellos produjeron; esta revisión lo corrige DESPUÉS) ·
//    NINGÚN nodo que pague tiene `retryOnFail` · toda llamada HTTP entrega siempre salida (neverError) y una GUARDA decide · con `dry_run` ningún paso de modelo corre · lo retirado sin fuente no sale a ningún canal.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

const VERCEL = 'https://zero-risk-platform.vercel.app'
const JSON_H = { name: 'Content-Type', value: 'application/json' }
const LLAVE_INTERNA = { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }
const N = {
  web: 'Webhook · manual revisión', entrada: '⓪ Entrada · llave',
  preparar: '① Preparar (S0/S1/S3)', guarda: '① Guarda', ifSigue: '① ¿Sigue?',
  autorPedido: '② Autor · pedido', autorRun: '② Autor · run-sdk', autorVuelta: '② Autor · vuelta',
  puerta1: '③ Puerta final (S5)',
  juezPedido: '④ Juez · pedido', juezRun: '④ Juez · run-sdk', juezVeredicto: '④ Juez · veredicto',
  opPedido: '⑤ Opinión · pedido', opHttp: '⑤ Opinión GPT', opVuelta: '⑤ Opinión · vuelta', ifOpino: '⑤ ¿Opinó?',
  resPedido: '⑥ Respuesta · pedido', resRun: '⑥ Respuesta · run-sdk', resVuelta: '⑥ Respuesta · vuelta', puerta2: '⑥ Puerta final 2 (S5)',
  finCon: '⑥ Manual final · con respuesta', finSin: '⑤ Manual final · sin opinión',
  borPedido: '⑦ Borrador · pedido', borHttp: '⑦ Borrador y bandeja', cierreBor: '⑧ Cierre · borrador', cierreSin: '⑧ Cierre · sin modelo',
}
const LLAVE_DESPACHO = { name: 'x-sala-dispatch-key', value: `={{ $('${N.entrada}').first().json.llave }}` }

const code = (nombre, archivo, pos) => ({ parameters: { jsCode: leer(archivo) }, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })
const http = (nombre, url, pos, { headers = [], body = null, timeout = 30000 } = {}) => ({
  parameters: {
    method: 'POST', url, sendHeaders: true, headerParameters: { parameters: [JSON_H, ...headers] },
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
    options: { timeout, response: { response: { neverError: true } } },
  },
  name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
})
const cond = (nombre, izq, operador, pos, derecha = '') => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: izq, rightValue: derecha, operator: operador }] }, options: {} },
  name: nombre, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos,
})
const esVerdadero = { type: 'boolean', operation: 'true', singleValue: true }
const esIgual = { type: 'string', operation: 'equals' }

function conectar(nodes, links) {
  const connections = {}
  const nombres = new Set(nodes.map((n) => n.name))
  for (const [de, a, salida = 0] of links) {
    if (!nombres.has(de) || !nombres.has(a)) throw new Error(`enlace a un nodo que no existe: ${de} → ${a}`)
    connections[de] = connections[de] || { main: [] }
    while (connections[de].main.length <= salida) connections[de].main.push([])
    connections[de].main[salida].push({ node: a, type: 'main', index: 0 })
  }
  return connections
}

/** el cuerpo de una llamada al corredor de agentes: UNA llamada, UN resultado (sin retryOnFail: el agente PAGA) */
const agente = (slug, tarea, paso, tope, extra = '') =>
  `={{ JSON.stringify({ agent: '${slug}', client_id: $json.client_id, workflow_id: $workflow.id, workflow_execution_id: $execution.id, step_name: $json.${paso}, task: $json.${tarea}, force_restart: true, dry_run: false, max_budget_usd: ${tope}, thinking_mode: 'disabled'${extra} }) }}`

export function construirManual({ path = 'zero-risk/manual-revision', nombre = 'Zero Risk — Manual · revisión (código → autor → puerta → juez de fidelidad → GPT ciego → bandeja) · CC#2', webhookId = 'manual-revision-0001' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, name: N.web, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), webhookId },
    code(N.entrada, 'n0-entrada.js', x(1)),
    // ① toda la preparación es código: no llama a ningún modelo (la ruta lo declara con `modelos_llamados: 0`)
    http(N.preparar, `${VERCEL}/api/manual/revisar`, x(2), { headers: [LLAVE_INTERNA, LLAVE_DESPACHO], body: '={{ JSON.stringify({ client_id: $json.client_id, dry_run: $json.dry_run, workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id }) }}', timeout: 120000 }),
    code(N.guarda, 'n1-guarda.js', x(3)),
    cond(N.ifSigue, '={{ $json.ruta }}', esIgual, x(4), 'seguir'),
    // ② el autor corrige UNA vez solo los hallazgos de hecho
    code(N.autorPedido, 'n2-autor-prep.js', x(5, -150)),
    http(N.autorRun, `${VERCEL}/api/agents/run-sdk`, x(6, -150), { headers: [LLAVE_INTERNA], body: agente('brand-strategist', 'autor_task', 'autor_step', 1.25), timeout: 800000 }),
    code(N.autorVuelta, 'n3-autor-resultado.js', x(7, -150)),
    // ③ la puerta final: lo que no tiene cita SALE y queda solo en el registro interno
    http(N.puerta1, `${VERCEL}/api/manual/recomprobar`, x(8, -150), { headers: [LLAVE_INTERNA], body: "={{ JSON.stringify({ client_id: $json.client_id, despues: $json.despues }) }}", timeout: 120000 }),
    // ④ EL JUEZ DE FIDELIDAD: mismos campos y umbral que siempre, evidencia SOLO cruda
    code(N.juezPedido, 'n4-juez-pedido.js', x(9, -150)),
    http(N.juezRun, `${VERCEL}/api/agents/run-sdk`, x(10, -150), { headers: [LLAVE_INTERNA], body: agente('editor-en-jefe', 'juez_task', 'juez_step', 0.5, ", context: { role: 'faithfulness_judge', threshold: 0.85 }, extra: { fidelity_judge: true }"), timeout: 800000 }),
    code(N.juezVeredicto, 'n5-juez-veredicto.js', x(11, -150)),
    // ⑤ GPT ciego: una sola pregunta, 3 reintentos dentro de la ruta; si falla NO bloquea
    code(N.opPedido, 'n6-opinion-pedido.js', x(12, -150)),
    http(N.opHttp, `${VERCEL}/api/manual/opinion`, x(13, -150), { headers: [LLAVE_INTERNA, LLAVE_DESPACHO], body: '={{ JSON.stringify($json.opinion_body) }}', timeout: 300000 }),
    code(N.opVuelta, 'n7-opinion-vuelta.js', x(14, -150)),
    cond(N.ifOpino, '={{ $json.hay_opinion }}', esVerdadero, x(15, -150)),
    // ⑥ el autor responde (una pasada) y la puerta vuelve a cerrar
    code(N.resPedido, 'n8-respuesta-pedido.js', x(16, -300)),
    http(N.resRun, `${VERCEL}/api/agents/run-sdk`, x(17, -300), { headers: [LLAVE_INTERNA], body: agente('brand-strategist', 'respuesta_task', 'respuesta_step', 0.6), timeout: 800000 }),
    code(N.resVuelta, 'n9-respuesta-vuelta.js', x(18, -300)),
    http(N.puerta2, `${VERCEL}/api/manual/recomprobar`, x(19, -300), { headers: [LLAVE_INTERNA], body: "={{ JSON.stringify({ client_id: $json.client_id, despues: $json.despues2 }) }}", timeout: 120000 }),
    code(N.finCon, 'n9b-final-con-respuesta.js', x(20, -300)),
    code(N.finSin, 'n9c-final-sin-respuesta.js', x(16, 0)),
    // ⑦ borrador (client_historical_outputs) + tarjeta (hitl_queue): NO toca client_brand_books
    code(N.borPedido, 'n10-borrador-pedido.js', x(21, -150)),
    http(N.borHttp, `${VERCEL}/api/manual/borrador`, x(22, -150), { headers: [LLAVE_INTERNA, LLAVE_DESPACHO], body: '={{ JSON.stringify($json.borrador_body) }}', timeout: 120000 }),
    code(N.cierreBor, 'n11b-cierre-borrador.js', x(23, -150)),
    code(N.cierreSin, 'n11a-cierre-sin-modelo.js', x(5, 200)),
  ]
  const links = [
    [N.web, N.entrada], [N.entrada, N.preparar], [N.preparar, N.guarda], [N.guarda, N.ifSigue], [N.ifSigue, N.autorPedido, 0], [N.ifSigue, N.cierreSin, 1],
    [N.autorPedido, N.autorRun], [N.autorRun, N.autorVuelta], [N.autorVuelta, N.puerta1], [N.puerta1, N.juezPedido], [N.juezPedido, N.juezRun], [N.juezRun, N.juezVeredicto],
    [N.juezVeredicto, N.opPedido], [N.opPedido, N.opHttp], [N.opHttp, N.opVuelta], [N.opVuelta, N.ifOpino], [N.ifOpino, N.resPedido, 0], [N.ifOpino, N.finSin, 1],
    [N.resPedido, N.resRun], [N.resRun, N.resVuelta], [N.resVuelta, N.puerta2], [N.puerta2, N.finCon],
    [N.finCon, N.borPedido], [N.finSin, N.borPedido], [N.borPedido, N.borHttp], [N.borHttp, N.cierreBor],
  ]
  return { name: nombre, nodes, connections: conectar(nodes, links), settings: { executionOrder: 'v1' } }
}

export const NOMBRES_DE_NODOS = N

if (process.argv[1] && process.argv[1].endsWith('construir-manual.mjs')) {
  const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const base = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app', key = process.env.N8N_API_KEY
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  const flujo = construirManual()
  if (process.argv.includes('--crear')) {
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(flujo) })).json()
    console.log('FLUJO REAL «manual · revisión» creado (INACTIVO · no publicado):', r.id || JSON.stringify(r).slice(0, 300), '· nodos', flujo.nodes.length, '· active =', r.active)
  } else if (arg('--actualizar=')) {
    const r = await fetch(`${base}/api/v1/workflows/${arg('--actualizar=')}`, { method: 'PUT', headers: hdr, body: JSON.stringify(flujo) })
    console.log('PUT', arg('--actualizar='), r.status)
  } else {
    const dir = arg('--salida=') || '.'
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(join(dir, 'manual-revision.json'), JSON.stringify(flujo))
    console.log('escrito manual-revision.json · nodos', flujo.nodes.length)
  }
}
