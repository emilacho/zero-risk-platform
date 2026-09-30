// ACTUALIZA los dos nodos del flujo VIVO del brief: ⓪ sobre (razonamiento apagado POR DEFECTO) y ④ chequeos (lector tolerante de comillas) · CC#1 · 2026-10-01 · GO de Emilio.
//   node publicar-lector-y-razonamiento-brief.mjs            → sólo construye y compara (no toca n8n)
//   node publicar-lector-y-razonamiento-brief.mjs --publicar → 0 corridas vivas (excepto el reloj de la sala) + versión viva esperada + desactivar → PUT → activar → verificar
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const { N, codigoDeNodo } = await import('./construir-brief.mjs')
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const ID = 'PQdIgbuFexuBsoh8', VERSION_PREFIJO = '95c7695a'
const PUBLICAR = process.argv.includes('--publicar')
const SETTINGS_OK = ['executionOrder', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress', 'timezone', 'executionTimeout', 'errorWorkflow', 'callerPolicy']
const get = async () => (await fetch(`${N8N}/api/v1/workflows/${ID}`, { headers: H })).json()
const vivo = await get()
if (!vivo.versionId.startsWith(VERSION_PREFIJO)) { console.log('ABORTO: versión viva', vivo.versionId); process.exit(1) }
const CAMBIOS = [['sobre', N.sobre], ['chequeos', N.chequeos]]
for (const [clave, nombre] of CAMBIOS) {
  const nodo = vivo.nodes.find((n) => n.name === nombre)
  if (!nodo || typeof nodo.parameters.jsCode !== 'string') { console.log('ABORTO: falta el nodo', nombre); process.exit(1) }
  if (nodo.parameters.jsCode.includes('repararComillas') || nodo.parameters.jsCode.includes("razonamiento = 'disabled'")) { console.log('ABORTO: el nodo ya trae el cambio', nombre); process.exit(1) }
  nodo.parameters.jsCode = codigoDeNodo(clave)
}
const settings = {}
for (const k of SETTINGS_OK) if (vivo.settings?.[k] !== undefined) settings[k] = vivo.settings[k]
const cuerpo = JSON.stringify({ name: vivo.name, nodes: vivo.nodes, connections: vivo.connections, settings })
console.log('construido · nodos', vivo.nodes.length, '· cambian', CAMBIOS.map((c) => c[1]).join(' + '))
if (!PUBLICAR) process.exit(0)
let vivas = 0
for (const st of ['running', 'waiting', 'new']) vivas += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=100`, { headers: H })).json()).data || []).filter((e) => e.workflowId !== 'z2nS8Up115EA9TKz').length // z2nS8… = reloj de la sala
if (vivas) { console.log('ABORTO: corridas vivas', vivas); process.exit(1) }
const antes = await get()
fs.writeFileSync(join(process.cwd(), 'brief-vivo-ANTES.json'), JSON.stringify(antes))
await fetch(`${N8N}/api/v1/workflows/${ID}/deactivate`, { method: 'POST', headers: H })
const put = await fetch(`${N8N}/api/v1/workflows/${ID}`, { method: 'PUT', headers: H, body: cuerpo })
console.log('PUT', put.status, put.status === 200 ? '' : (await put.text()).slice(0, 300))
await fetch(`${N8N}/api/v1/workflows/${ID}/activate`, { method: 'POST', headers: H })
const d = await get()
fs.writeFileSync(join(process.cwd(), 'brief-vivo-DESPUES.json'), JSON.stringify(d))
const ma = Object.fromEntries(antes.nodes.map((n) => [n.name, JSON.stringify(n.parameters)]))
console.log(JSON.stringify({ versionAntes: antes.versionId, versionDespues: d.versionId, activo: d.active, nodos: d.nodes.length, cambiados: d.nodes.filter((n) => ma[n.name] !== JSON.stringify(n.parameters)).map((n) => n.name), wait: d.nodes.find((n) => n.name === N.espera)?.parameters?.resumeAmount }))
