// Constructor de los 2 flujos de la jefatura (J4) · CC#2 · 2026-10-13 · orden de Lenovo «flujos n8n APAGADOS por constructor» (patrón de oficina/construir-oficina.mjs).
//
//   node construir-jefatura.mjs --salida=<carpeta>   → escribe los 2 JSON · NO toca n8n
//   node construir-jefatura.mjs --crear              → crea los 2 flujos REALES en n8n, INACTIVOS (no se publican ni se activan); se niega si ya existe uno con ese nombre
//   node construir-jefatura.mjs --actualizar=turno:<id>,vigia:<id>   → PUT del JSON (nunca cambia si está activo o no)
//
//  · `jefatura · turno` (webhook zero-risk/jefatura-turno)  UN paso de agente por ejecución: pide a run-sdk (jefe-marketing, o el dueño de cada parte que corrige o decide), espera la vuelta, la registra en
//                                                            POST /api/jefatura/turnos y despierta el paso siguiente; al cerrar, ENTREGA al llamador (`devolver_a`) por webhook propio o por el cable de la sala.
//                                                            SIN portero ni GPT: viven dentro de la ruta (diseño v4 §10).
//  · `jefatura · vigía` (cada 10 min)                        re-arma el paso muerto (primer intento) y entrega los cierres que dejó el vigía.
// 🔴 Por construcción: NINGÚN nodo que pague tiene `retryOnFail` · toda llamada HTTP entrega siempre salida (neverError) y una GUARDA decide · nada se traga un error ·
//    el modo seco no llama a ningún proveedor · el nodo «Agente» manda SIEMPRE `x-skip-editor-middleware: 1` (diseño v4 §9) · la llave de despacho es la de siempre (SALA_DISPATCH_KEY), jamás en el JSON ·
//    NO se toca la oficina, el cimiento, `Lazo A`, ni nada de naufrago.ec. Nada se engancha a ningún productor (eso es J7, otra firma).
//
// CONTRATO que este constructor ASUME de las rutas de CC#1 (J3) — si difieren, se ajusta aquí y en los .js (una sola fuente):
//   POST /api/jefatura/turnos  { accion:'resultado', revision_id, n, texto|error, costo_usd, workflow_execution_id, tokens_in?, tokens_out? }  |  { accion:'siguiente', revision_id }
//        → 200 { accion:'esperar', turno:{ n, tipo:'agente', paso, dispatch_key, pedido:{ agent_name, task, client_id, esquema, max_budget_usd, thinking_mode?, extra?, images?, dry_run:boolean, simulacion?, reintento_formato? } } }
//        → 200 { accion:'cerrado', resultado, marcas:{con_desacuerdo,sin_segunda_mirada}, devolver:{ tipo:'webhook'|'sala_ref'|'ninguno', url?, cuerpo? }, sala_ref?, simulado? }
//   POST /api/jefatura/vigia   {} → 200 { accion:'vigilado'|'apagada', reanudar:[revision_id], cierres:[{ revision_id, resultado, devolver, sala_ref?, client_id? }] }
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

const VERCEL = 'https://zero-risk-platform.vercel.app'
const N8N_HOOKS = "={{ ($env.N8N_WEBHOOK_BASE || 'https://n8n-production-72be.up.railway.app/webhook').replace(/\\/+$/, '') }}"
const JSON_H = { name: 'Content-Type', value: 'application/json' }
const LLAVE = { name: 'x-sala-dispatch-key', value: '={{ $env.SALA_DISPATCH_KEY }}' }
/** la jefatura revisa a estos agentes: varios están en EDITOR_WHITELIST; sin esta cabecera resucitan los 3 revisores de julio (3 llamadas de pago por texto) */
export const CABECERA_DEL_EDITOR = { name: 'x-skip-editor-middleware', value: '1' }

const code = (nombre, archivo, pos) => ({ parameters: { jsCode: leer(archivo) }, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })
const http = (nombre, url, pos, { headers = [], body = null, timeout = 30000, completa = true } = {}) => ({
  parameters: {
    method: 'POST', url, sendHeaders: true, headerParameters: { parameters: [JSON_H, ...headers] },
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
    options: { timeout, response: { response: { neverError: true, ...(completa ? { fullResponse: true } : {}) } } },
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

const CABLE = (nombre, pos) => http(nombre, "={{ $env.SALA_CALLBACK_URL || 'https://zero-risk-platform.vercel.app/api/sala/callback' }}", pos, {
  headers: [{ name: 'x-api-key', value: '={{ $env.SALA_CALLBACK_API_KEY || $env.INTERNAL_API_KEY }}' }, { name: 'x-source', value: 'n8n-jefatura' }],
  body: '={{ JSON.stringify($json.payload_cable) }}', timeout: 60000, completa: false,
})
/** la entrega al llamador: la dirección ya la validó el código del nodo anterior (solo nuestro n8n o nuestro Vercel) */
const ENTREGA = (nombre, pos) => http(nombre, '={{ $json.entrega_url }}', pos, { headers: [LLAVE], body: '={{ JSON.stringify($json.entrega_cuerpo) }}', timeout: 60000, completa: false })
const SIGUIENTE = (nombre, pos) => http(nombre, `${N8N_HOOKS}/zero-risk/jefatura-turno`, pos, { headers: [LLAVE], body: '={{ JSON.stringify($json.turno_body) }}', timeout: 30000, completa: false })

// ───────────────────────── 1 · EL TURNO
export function construirTurno({ path = 'zero-risk/jefatura-turno', nombre = 'Zero Risk — Jefatura · un turno (agente → resultado → siguiente) · CC#2', webhookId = 'jefatura-turno-0001' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const N = {
    web: 'Webhook · jefatura turno', entrada: '⓪ Entrada · llave',
    armar: '② Armar el pedido', aSeco: '② ¿Modo seco?', agente: '② Agente (run-sdk)', acepto: '② ¿Aceptó el pedido?', ifAcepto: '② ¿Aceptó?', espera: '② Esperar al agente', vuelta: '② Vuelta',
    registrar: '③ Registrar el resultado', sigue: '③ ¿Y ahora?', ifEsperar: '③ ¿Siguiente paso?', siguiente: '③ Siguiente paso', ifWebhook: '③ ¿Entrega por webhook?', entrega: '③ Entregar al llamador', ifCable: '③ ¿Cable a la sala?', cable: '③ Cable de vuelta · sala',
  }
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, name: N.web, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), webhookId },
    code(N.entrada, 'turno-n0-entrada.js', x(1)),
    code(N.armar, 'turno-n1-armar.js', x(2)),
    cond(N.aSeco, '={{ $json.simulado }}', esVerdadero, x(3)),
    // 🔴 SIN `retryOnFail`: el agente PAGA. Una llamada, un resultado (con reintento una llamada cortada por tope se cobró varias veces).
    // 🔴 `x-skip-editor-middleware: 1` SIEMPRE: la jefatura es quien revisa; el editor de julio no debe correr (y rebota 403 dejando filas `editor_escalation`).
    http(N.agente, `${VERCEL}/api/agents/run-sdk`, x(4, 150), { headers: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }, CABECERA_DEL_EDITOR], body: '={{ JSON.stringify($json.cuerpo) }}', timeout: 60000, completa: false }),
    code(N.acepto, 'turno-n2-acepto.js', x(5, 150)),
    cond(N.ifAcepto, '={{ $json.aceptado }}', esVerdadero, x(6, 150)),
    // la espera vive más que el trabajo (un paso dura minutos; el plan reescrito, hasta ~6); 1.800 s (30 min) cubren con holgura y el SDK acota el COSTO con max_budget_usd
    { parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: 1800, resumeUnit: 'seconds', options: {} }, name: N.espera, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: x(7, 50), webhookId: webhookId + '-espera' },
    code(N.vuelta, 'turno-n3-vuelta.js', x(8, 50)),
    http(N.registrar, `${VERCEL}/api/jefatura/turnos`, x(9, 0), { headers: [LLAVE], body: '={{ JSON.stringify($json.resultado_body) }}', timeout: 300000 }),
    code(N.sigue, 'turno-n4-sigue.js', x(10, 0)),
    cond(N.ifEsperar, '={{ $json.ruta }}', esIgual, x(11, 0), 'esperar'),
    SIGUIENTE(N.siguiente, x(12, -150)),
    cond(N.ifWebhook, '={{ $json.ruta }}', esIgual, x(12, 50), 'webhook'),
    ENTREGA(N.entrega, x(13, -50)),
    cond(N.ifCable, '={{ $json.ruta }}', esIgual, x(13, 150), 'cable'),
    CABLE(N.cable, x(14, 100)),
  ]
  const links = [
    [N.web, N.entrada], [N.entrada, N.armar], [N.armar, N.aSeco],
    [N.aSeco, N.registrar, 0], [N.aSeco, N.agente, 1],
    [N.agente, N.acepto], [N.acepto, N.ifAcepto], [N.ifAcepto, N.espera, 0], [N.ifAcepto, N.registrar, 1],
    [N.espera, N.vuelta], [N.vuelta, N.registrar],
    [N.registrar, N.sigue], [N.sigue, N.ifEsperar],
    [N.ifEsperar, N.siguiente, 0], [N.ifEsperar, N.ifWebhook, 1],
    [N.ifWebhook, N.entrega, 0], [N.ifWebhook, N.ifCable, 1],
    [N.ifCable, N.cable, 0],
  ]
  return { name: nombre, nodes, connections: conectar(nodes, links), settings: { executionOrder: 'v1' } }
}

// ───────────────────────── 2 · EL VIGÍA
export function construirVigia({ nombre = 'Zero Risk — Jefatura · el vigía (reanuda los pasos muertos y entrega los cierres) · CC#2' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const N = { reloj: 'Reloj · cada 10 min', vigia: '① Vigilar', pend: '① Qué hacer con cada pendiente', esRean: '② ¿Reanudar?', rearmar: '② Re-armar el paso', paso: '② Re-armar · resultado', turno: 'Turno · arrancar', ifWebhook: '③ ¿Entrega por webhook?', entrega: '③ Entregar al llamador', cable: 'Cable de vuelta · sala' }
  const nodes = [
    { parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } }, name: N.reloj, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: x(0) },
    http(N.vigia, `${VERCEL}/api/jefatura/vigia`, x(1), { headers: [LLAVE], body: '={{ JSON.stringify({}) }}', timeout: 300000 }),
    code(N.pend, 'vigia-n1-reanudar.js', x(2)),
    cond(N.esRean, '={{ $json.tipo }}', esIgual, x(3), 'reanudar'),
    http(N.rearmar, `${VERCEL}/api/jefatura/turnos`, x(4, -120), { headers: [LLAVE], body: '={{ JSON.stringify({ accion: "siguiente", revision_id: $json.revision_id }) }}', timeout: 300000 }),
    code(N.paso, 'vigia-n2-rearmar.js', x(5, -120)),
    SIGUIENTE(N.turno, x(6, -120)),
    cond(N.ifWebhook, '={{ $json.tipo }}', esIgual, x(4, 150), 'webhook'),
    ENTREGA(N.entrega, x(5, 50)),
    CABLE(N.cable, x(5, 250)),
  ]
  const links = [
    [N.reloj, N.vigia], [N.vigia, N.pend], [N.pend, N.esRean],
    [N.esRean, N.rearmar, 0], [N.esRean, N.ifWebhook, 1],
    [N.rearmar, N.paso], [N.paso, N.turno],
    [N.ifWebhook, N.entrega, 0], [N.ifWebhook, N.cable, 1],
  ]
  return { name: nombre, nodes, connections: conectar(nodes, links), settings: { executionOrder: 'v1' } }
}

export const FLUJOS = { turno: construirTurno, vigia: construirVigia }

if (process.argv[1] && process.argv[1].endsWith('construir-jefatura.mjs')) {
  const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const base = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app', key = process.env.N8N_API_KEY
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  if (process.argv.includes('--crear')) {
    const lista = await (await fetch(`${base}/api/v1/workflows?limit=250`, { headers: hdr })).json()
    for (const [k, f] of Object.entries(FLUJOS)) {
      const flujo = f()
      const ya = (lista.data ?? []).find((w) => w.name === flujo.name)
      if (ya) { console.log(`FLUJO «${k}» YA EXISTE (${ya.id}, activo=${ya.active}) · no se crea otro; usa --actualizar=${k}:${ya.id}`); continue }
      const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(flujo) })).json()
      console.log(`FLUJO REAL «${k}» creado (INACTIVO · no publicado):`, r.id || JSON.stringify(r).slice(0, 300), '· nodos', flujo.nodes.length, '· active =', r.active)
    }
  } else if (arg('--actualizar=')) {
    for (const par of arg('--actualizar=').split(',')) {
      const [k, id] = par.split(':')
      const r = await fetch(`${base}/api/v1/workflows/${id}`, { method: 'PUT', headers: hdr, body: JSON.stringify(FLUJOS[k]()) })
      console.log('PUT', k, id, r.status)
    }
  } else {
    const dir = arg('--salida=') || '.'
    fs.mkdirSync(dir, { recursive: true })
    for (const [k, f] of Object.entries(FLUJOS)) { const flujo = f(); fs.writeFileSync(join(dir, `jefatura-${k}.json`), JSON.stringify(flujo)); console.log('escrito', k, '· nodos', flujo.nodes.length) }
  }
}
