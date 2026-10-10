// Constructor de los 3 flujos de la oficina de creativos (SALA 1) · CC#2 · 2026-10-09 · orden de Lenovo «flujos n8n creados INACTIVOS».
//
//   node construir-oficina.mjs --salida=<carpeta>   → escribe los 3 JSON · NO toca n8n
//   node construir-oficina.mjs --crear              → crea los 3 flujos REALES en n8n, INACTIVOS (no se publican ni se activan)
//   node construir-oficina.mjs --actualizar=puerta:<id>,turno:<id>,vigia:<id>   → PUT del JSON (nunca cambia si está activo o no)
//
//  · `oficina · puerta`  (webhook zero-risk/oficina)       la sala despierta esta puerta; sin `familia` (o con la oficina apagada) el sobre sigue INTACTO por la pieza simple (pasarela)
//  · `oficina · turno`   (webhook zero-risk/oficina-turno) UN paso por ejecución: portero o agente (run-sdk + espera), registra el resultado y despierta el paso siguiente
//  · `oficina · vigía`   (cada 10 min)                     vence la bandeja de la oficina y reanuda los pasos muertos
// 🔴 Por construcción: NINGÚN nodo que pague tiene `retryOnFail` · toda llamada HTTP entrega siempre salida (neverError) y una GUARDA decide · nada se traga un error ·
//    el modo seco no llama a ningún proveedor · NO se toca el mapa de viajes, ni la pieza simple, ni el alta · la llave de despacho es la de siempre (SALA_DISPATCH_KEY), jamás en el JSON.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

const VERCEL = 'https://zero-risk-platform.vercel.app'
const N8N_HOOKS = "={{ ($env.N8N_WEBHOOK_BASE || 'https://n8n-production-72be.up.railway.app/webhook').replace(/\\/+$/, '') }}"
const JSON_H = { name: 'Content-Type', value: 'application/json' }
const LLAVE = { name: 'x-sala-dispatch-key', value: '={{ $json.llave }}' }

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
  headers: [{ name: 'x-api-key', value: '={{ $env.SALA_CALLBACK_API_KEY || $env.INTERNAL_API_KEY }}' }, { name: 'x-source', value: 'n8n-oficina' }],
  body: '={{ JSON.stringify($json.payload_cable) }}', timeout: 60000, completa: false,
})
const SIGUIENTE = (nombre, pos) => http(nombre, `${N8N_HOOKS}/zero-risk/oficina-turno`, pos, { headers: [LLAVE], body: '={{ JSON.stringify($json.turno_body) }}', timeout: 30000, completa: false })

// ───────────────────────── 1 · LA PUERTA
export function construirPuerta({ path = 'zero-risk/oficina', nombre = 'Zero Risk — Oficina · la puerta (sobre producir → encargo o pasarela) · CC#2', webhookId = 'oficina-puerta-0001' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const N = { web: 'Webhook · oficina', sobre: '⓪ Sobre · llave', fam: '⓪ ¿Trae familia?', abrir: '① Abrir el encargo', ruta: '① ¿Qué pasó?', ifPas: '① ¿Pasarela?', ifTur: '① ¿Turno?', ifCab: '① ¿Cable?', pas: 'Pasarela · pieza simple', tur: 'Turno · arrancar', cab: 'Cable de vuelta · sala' }
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, name: N.web, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), webhookId },
    code(N.sobre, 'puerta-n0-sobre.js', x(1)),
    cond(N.fam, '={{ $json.tiene_familia }}', esVerdadero, x(2)),
    // el cuerpo ORIGINAL de la sala viaja tal cual (la ruta valida el resto y no lee nada de dentro del payload)
    http(N.abrir, `${VERCEL}/api/oficina/encargos`, x(3, -150), { headers: [LLAVE], body: '={{ JSON.stringify($json.body) }}', timeout: 120000 }),
    code(N.ruta, 'puerta-n1-ruta.js', x(4, -150)),
    cond(N.ifPas, '={{ $json.ruta }}', esIgual, x(5, -150), 'pasarela'),
    cond(N.ifTur, '={{ $json.ruta }}', esIgual, x(6, -150), 'turno'),
    cond(N.ifCab, '={{ $json.ruta }}', esIgual, x(7, -150), 'cable'),
    // PASARELA: el sobre sigue INTACTO por la pieza simple (el comportamiento de hoy); ella valida lo suyo y entrega su propio cable
    http(N.pas, `${N8N_HOOKS}/zero-risk/pieza`, x(6, 150), { headers: [LLAVE], body: '={{ JSON.stringify($json.cuerpo_original || $json.body) }}', timeout: 30000, completa: false }),
    SIGUIENTE(N.tur, x(7, -300)),
    CABLE(N.cab, x(8, -50)),
  ]
  const links = [
    [N.web, N.sobre], [N.sobre, N.fam],
    [N.fam, N.abrir, 0], [N.fam, N.pas, 1],
    [N.abrir, N.ruta], [N.ruta, N.ifPas],
    [N.ifPas, N.pas, 0], [N.ifPas, N.ifTur, 1],
    [N.ifTur, N.tur, 0], [N.ifTur, N.ifCab, 1],
    [N.ifCab, N.cab, 0],
  ]
  return { name: nombre, nodes, connections: conectar(nodes, links), settings: { executionOrder: 'v1' } }
}

// ───────────────────────── 2 · EL TURNO
export function construirTurno({ path = 'zero-risk/oficina-turno', nombre = 'Zero Risk — Oficina · un turno (portero o agente → resultado → siguiente) · CC#2', webhookId = 'oficina-turno-0001' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const N = {
    web: 'Webhook · oficina turno', entrada: '⓪ Entrada · llave', esPortero: '① ¿Portero?',
    pSeco: '① ¿Modo seco? (portero)', portero: '① Portero', pRes: '① Portero · resultado',
    armar: '② Armar el pedido', aSeco: '② ¿Modo seco?', agente: '② Agente (run-sdk)', acepto: '② ¿Aceptó el pedido?', ifAcepto: '② ¿Aceptó?', espera: '② Esperar al agente', vuelta: '② Vuelta',
    registrar: '③ Registrar el resultado', sigue: '③ ¿Y ahora?', ifEsperar: '③ ¿Siguiente paso?', siguiente: '③ Siguiente paso', cable: '③ Cable de vuelta · sala',
  }
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, name: N.web, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0), webhookId },
    code(N.entrada, 'turno-n0-entrada.js', x(1)),
    cond(N.esPortero, "={{ $json.turno.tipo }}", esIgual, x(2), 'portero'),
    // ── portero (una pregunta al cerebro: no escribe en ninguna tabla)
    cond(N.pSeco, '={{ $json.dry_run }}', esVerdadero, x(3, -300)),
    // 🔴 el portero puede costar (razonar llama al modelo): SIN reintento
    http(N.portero, `${N8N_HOOKS}/zero-risk/portero`, x(4, -450), { headers: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }], body: '={{ JSON.stringify($json.turno.pedido.cuerpo) }}', timeout: 120000, completa: false }),
    code(N.pRes, 'turno-n3p-portero.js', x(5, -300)),
    // ── agente
    code(N.armar, 'turno-n1-armar.js', x(3, 200)),
    cond(N.aSeco, '={{ $json.simulado }}', esVerdadero, x(4, 200)),
    // 🔴 SIN `retryOnFail`: el agente PAGA. Una llamada, un resultado (con reintento una llamada cortada por tope se cobró varias veces).
    http(N.agente, `${VERCEL}/api/agents/run-sdk`, x(5, 350), { headers: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }], body: '={{ JSON.stringify($json.cuerpo) }}', timeout: 60000, completa: false }),
    code(N.acepto, 'turno-n2-acepto.js', x(6, 350)),
    cond(N.ifAcepto, '={{ $json.aceptado }}', esVerdadero, x(7, 350)),
    // la espera vive más que el trabajo (un paso dura minutos); 1.800 s (30 min) cubren con holgura y el SDK acota el COSTO con max_budget_usd
    { parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: 1800, resumeUnit: 'seconds', options: {} }, name: N.espera, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: x(8, 250), webhookId: webhookId + '-espera' },
    code(N.vuelta, 'turno-n3-vuelta.js', x(9, 250)),
    // ── registrar y seguir
    http(N.registrar, `${VERCEL}/api/oficina/turnos`, x(10, 0), { headers: [LLAVE], body: '={{ JSON.stringify($json.resultado_body) }}', timeout: 300000 }),
    code(N.sigue, 'turno-n4-sigue.js', x(11, 0)),
    cond(N.ifEsperar, '={{ $json.ruta }}', esIgual, x(12, 0), 'esperar'),
    SIGUIENTE(N.siguiente, x(13, -100)),
    CABLE(N.cable, x(13, 100)),
  ]
  const links = [
    [N.web, N.entrada], [N.entrada, N.esPortero],
    [N.esPortero, N.pSeco, 0], [N.esPortero, N.armar, 1],
    [N.pSeco, N.pRes, 0], [N.pSeco, N.portero, 1], [N.portero, N.pRes], [N.pRes, N.registrar],
    [N.armar, N.aSeco], [N.aSeco, N.registrar, 0], [N.aSeco, N.agente, 1],
    [N.agente, N.acepto], [N.acepto, N.ifAcepto], [N.ifAcepto, N.espera, 0], [N.ifAcepto, N.registrar, 1],
    [N.espera, N.vuelta], [N.vuelta, N.registrar],
    [N.registrar, N.sigue], [N.sigue, N.ifEsperar], [N.ifEsperar, N.siguiente, 0], [N.ifEsperar, N.cable, 1],
  ]
  return { name: nombre, nodes, connections: conectar(nodes, links), settings: { executionOrder: 'v1' } }
}

// ───────────────────────── 3 · EL VIGÍA
export function construirVigia({ nombre = 'Zero Risk — Oficina · el vigía (vence la bandeja y reanuda los pasos muertos) · CC#2' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const N = { reloj: 'Reloj · cada 10 min', vigia: '① Vigilar', pend: '① Qué hacer con cada pendiente', esRean: '② ¿Reanudar?', rearmar: '② Re-armar el paso', paso: '② Re-armar · resultado', turno: 'Turno · arrancar', cable: 'Cable de vuelta · sala' }
  const llaveEnv = { name: 'x-sala-dispatch-key', value: '={{ $env.SALA_DISPATCH_KEY }}' }
  const nodes = [
    { parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } }, name: N.reloj, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: x(0) },
    http(N.vigia, `${VERCEL}/api/oficina/vigia`, x(1), { headers: [llaveEnv], body: '={{ JSON.stringify({}) }}', timeout: 300000 }),
    code(N.pend, 'vigia-n1-reanudar.js', x(2)),
    cond(N.esRean, '={{ $json.tipo }}', esIgual, x(3), 'reanudar'),
    http(N.rearmar, `${VERCEL}/api/oficina/turnos`, x(4, -120), { headers: [LLAVE], body: '={{ JSON.stringify({ accion: "siguiente", encargo_id: $json.encargo_id }) }}', timeout: 300000 }),
    code(N.paso, 'vigia-n2-rearmar.js', x(5, -120)),
    SIGUIENTE(N.turno, x(6, -120)),
    CABLE(N.cable, x(4, 150)),
  ]
  const links = [[N.reloj, N.vigia], [N.vigia, N.pend], [N.pend, N.esRean], [N.esRean, N.rearmar, 0], [N.esRean, N.cable, 1], [N.rearmar, N.paso], [N.paso, N.turno]]
  return { name: nombre, nodes, connections: conectar(nodes, links), settings: { executionOrder: 'v1' } }
}

export const FLUJOS = { puerta: construirPuerta, turno: construirTurno, vigia: construirVigia }

if (process.argv[1] && process.argv[1].endsWith('construir-oficina.mjs')) {
  const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const base = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app', key = process.env.N8N_API_KEY
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  if (process.argv.includes('--crear')) {
    for (const [k, f] of Object.entries(FLUJOS)) {
      const flujo = f()
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
    for (const [k, f] of Object.entries(FLUJOS)) { const flujo = f(); fs.writeFileSync(join(dir, `oficina-${k}.json`), JSON.stringify(flujo)); console.log('escrito', k, '· nodos', flujo.nodes.length) }
  }
}
