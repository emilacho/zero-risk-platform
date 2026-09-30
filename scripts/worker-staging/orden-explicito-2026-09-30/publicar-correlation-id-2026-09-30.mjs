// PUBLICA la corrección del correlation_id en planeación · CC#1 · 2026-09-30 · con el GO de Emilio. Aborta si la versión viva no es la de la foto «antes» o si hay corridas vivas.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const ID = 'X9F0zp6LQ2xGEYVS', ESPERADA = '0a301f99-ed6b-44c2-bc37-055edbf9294c'
const get = async () => (await fetch(`${N8N}/api/v1/workflows/${ID}`, { headers: H })).json()
let vivas = 0
for (const st of ['running', 'waiting', 'new']) vivas += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=100`, { headers: H })).json()).data || []).filter((e) => e.workflowId !== 'z2nS8Up115EA9TKz').length // z2nS8… = reloj de la sala (cada 3 min · no es trabajo de un empleado)
if (vivas) { console.log('ABORTO: corridas vivas', vivas); process.exit(1) }
const antes = await get()
if (antes.versionId !== ESPERADA) { console.log('ABORTO: versión viva', antes.versionId); process.exit(1) }
await fetch(`${N8N}/api/v1/workflows/${ID}/deactivate`, { method: 'POST', headers: H })
const put = await fetch(`${N8N}/api/v1/workflows/${ID}`, { method: 'PUT', headers: H, body: fs.readFileSync(join(aqui, 'planeacion-construida-correlation-id-2026-09-30.json'), 'utf8') })
console.log('PUT', put.status, put.status === 200 ? '' : (await put.text()).slice(0, 300))
await fetch(`${N8N}/api/v1/workflows/${ID}/activate`, { method: 'POST', headers: H })
const d = await get()
const ma = Object.fromEntries(antes.nodes.map((n) => [n.name, JSON.stringify(n.parameters)]))
console.log(JSON.stringify({ versionAntes: antes.versionId, versionDespues: d.versionId, activo: d.active, nodos: d.nodes.length, cambiados: d.nodes.filter((n) => ma[n.name] !== JSON.stringify(n.parameters)).map((n) => n.name) }))
