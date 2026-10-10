// Constructor del flujo «Cerebro · mantenimiento diario del portero» · CC#2 · 2026-10-10 · P4 del diseño `docs/DISENO-2026-10-10-portero-diario.md` (§8, §11 y §12).
//
//   node construir-diario.mjs --salida=<carpeta>   → escribe el JSON · NO toca n8n
//   node construir-diario.mjs --crear              → crea el flujo REAL en n8n, INACTIVO (no se publica ni se activa)
//   node construir-diario.mjs --actualizar=<id>    → PUT del JSON (nunca cambia si está activo o no)
//
// ARRANCA DESPUÉS del flujo de la mañana (`EZXAFQvKZsJlvGNO`, horario `30 6 * * *`) y NO lo llama ni lo toca (B1 de CC#3): su horario es `30 8 * * *` en la HORA DE n8n, NO en UTC (medido por CC#1: el de la mañana, rotulado 06:30, corre a las 10:30 UTC, o sea la zona de la instancia va 4 h detrás de UTC, y este correrá hacia las 12:30 UTC, DESPUÉS de la mañana: NO se «arregla» a UTC o correría antes) (la hora real se vuelve a verificar en n8n
// antes de encender). Hace: ① plan de la AMPLIACIÓN (lo que la mañana no cubre: Mapas propio + reseñas, comentarios, reparto) · ② ampliar (llamadas al Servicio de Apify, solo con dry_run=false) ·
// ③ correr (comparar, limpio y ordenado, oportunidades) · ④ cierre. NO tiene paso de avisar (D-5) ni ningún paso de modelo.
// 🔴 Por construcción: NINGÚN nodo reintenta · toda llamada HTTP entrega siempre salida (neverError) · con `dry_run` no se llama a ningún proveedor · el flujo NO lee ninguna tabla (todo lo decide la app) ·
//    nace INACTIVO · ninguna llave escrita en el JSON.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(join(aqui, f), 'utf8')

const VERCEL = 'https://zero-risk-platform.vercel.app'
const JSON_H = { name: 'Content-Type', value: 'application/json' }
const LLAVE_INTERNA = { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }
export const NOMBRES = { web: 'Webhook · a mano (con llave)', horario: 'Horario diario 08:30 (hora de n8n)', entrada: '⓪ Entrada', plan: '① Plan de la ampliación', separar: '① Un elemento por cliente', ampliar: '② Ampliar (Servicio de Apify)', pedido: '③ Pedido a correr', correr: '③ Correr (comparar · limpiar · preparar)', cierre: '④ Cierre' }
const N = NOMBRES

const code = (nombre, archivo, pos) => ({ parameters: { jsCode: leer(archivo) }, name: nombre, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })
const http = (nombre, url, pos, { headers = [], body, timeout = 30000 }) => ({
  parameters: { method: 'POST', url, sendHeaders: true, headerParameters: { parameters: [JSON_H, ...headers] }, sendBody: true, specifyBody: 'json', jsonBody: body, options: { timeout, response: { response: { neverError: true } } } },
  name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
})
function conectar(nodes, links) {
  const connections = {}
  const nombres = new Set(nodes.map((n) => n.name))
  for (const [de, a] of links) {
    if (!nombres.has(de) || !nombres.has(a)) throw new Error(`enlace a un nodo que no existe: ${de} → ${a}`)
    connections[de] = connections[de] || { main: [[]] }
    connections[de].main[0].push({ node: a, type: 'main', index: 0 })
  }
  return connections
}

export function construirDiario({ path = 'zero-risk/cerebro-diario-mantenimiento-ensayo', nombre = 'Zero Risk — Cerebro · mantenimiento diario del portero (ampliar → comparar → limpiar → preparar) · CC#2', webhookId = 'cerebro-diario-mantenimiento-0001' } = {}) {
  const x = (i, y = 0) => [i * 260, y]
  const nodes = [
    { parameters: { httpMethod: 'POST', path, responseMode: 'lastNode', options: {} }, name: N.web, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: x(0, -120), webhookId },
    { parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 8 * * *' }] } }, name: N.horario, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: x(0, 120) },
    code(N.entrada, 'n0-entrada.js', x(1)),
    http(N.plan, `${VERCEL}/api/brain/diario/plan`, x(2), { headers: [LLAVE_INTERNA], body: '={{ JSON.stringify({ dry_run: $json.dry_run, ...($json.client_id ? { client_id: $json.client_id } : {}), workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id }) }}', timeout: 120000 }),
    code(N.separar, 'n1-separar.js', x(3)),
    code(N.ampliar, 'n2-ampliar.js', x(4)),
    code(N.pedido, 'n3-correr-pedido.js', x(5)),
    // un pedido «saltado» (sin cliente o con falla del plan) manda un cuerpo inerte `{dry_run:true}`: la ruta contesta 400 sin leer ni escribir y el cierre lo ignora
    http(N.correr, `${VERCEL}/api/brain/diario/correr`, x(6), { headers: [LLAVE_INTERNA], body: '={{ JSON.stringify($json.correr_body || { dry_run: true }) }}', timeout: 120000 }),
    code(N.cierre, 'n4-cierre.js', x(7)),
  ]
  const links = [[N.web, N.entrada], [N.horario, N.entrada], [N.entrada, N.plan], [N.plan, N.separar], [N.separar, N.ampliar], [N.ampliar, N.pedido], [N.pedido, N.correr], [N.correr, N.cierre]]
  return { name: nombre, nodes, connections: conectar(nodes, links), settings: { executionOrder: 'v1' } }
}

if (process.argv[1] && process.argv[1].endsWith('construir-diario.mjs')) {
  const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
  const base = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app', key = process.env.N8N_API_KEY
  const arg = (p) => process.argv.find((a) => a.startsWith(p))?.slice(p.length)
  const hdr = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' }
  const flujo = construirDiario()
  if (process.argv.includes('--crear')) {
    const r = await (await fetch(`${base}/api/v1/workflows`, { method: 'POST', headers: hdr, body: JSON.stringify(flujo) })).json()
    console.log('FLUJO REAL «mantenimiento diario» creado (INACTIVO · no publicado):', r.id || JSON.stringify(r).slice(0, 300), '· nodos', flujo.nodes.length, '· active =', r.active)
  } else if (arg('--actualizar=')) {
    const r = await fetch(`${base}/api/v1/workflows/${arg('--actualizar=')}`, { method: 'PUT', headers: hdr, body: JSON.stringify(flujo) })
    console.log('PUT', arg('--actualizar='), r.status)
  } else {
    const dir = arg('--salida=') || '.'
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(join(dir, 'cerebro-diario-mantenimiento.json'), JSON.stringify(flujo))
    console.log('escrito cerebro-diario-mantenimiento.json · nodos', flujo.nodes.length)
  }
}
