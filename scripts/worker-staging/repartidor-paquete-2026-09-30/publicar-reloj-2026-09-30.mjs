// PUBLICA el reloj del repartidor a 15 min con tope · CC#1 · 2026-09-30 · SÓLO con GO de Emilio, base viva y la palanca del paquete lista.
// Aborta si: la versión viva no es la de la foto «antes» (4d3167dd) · hay corridas vivas de empleados (se ignora el propio reloj, que es lo que se corrige).
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const ID = 'z2nS8Up115EA9TKz', ESPERADA = '4d3167dd-f2d9-4484-a371-aedcdc1f5058'
const get = async () => (await fetch(`${N8N}/api/v1/workflows/${ID}`, { headers: H })).json()
let vivas = 0
for (const st of ['running', 'waiting', 'new']) vivas += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=100`, { headers: H })).json()).data || []).filter((e) => e.workflowId !== ID).length
if (vivas) { console.log('ABORTO: corridas vivas', vivas); process.exit(1) }
const antes = await get()
if (antes.versionId !== ESPERADA) { console.log('ABORTO: versión viva', antes.versionId); process.exit(1) }
fs.writeFileSync(join(process.cwd(), 'reloj-vivo-ANTES.json'), JSON.stringify(antes))
await fetch(`${N8N}/api/v1/workflows/${ID}/deactivate`, { method: 'POST', headers: H })
const put = await fetch(`${N8N}/api/v1/workflows/${ID}`, { method: 'PUT', headers: H, body: fs.readFileSync(join(aqui, 'reloj-construido-2026-09-30.json'), 'utf8') })
console.log('PUT', put.status, put.status === 200 ? '' : (await put.text()).slice(0, 300))
await fetch(`${N8N}/api/v1/workflows/${ID}/activate`, { method: 'POST', headers: H })
const d = await get()
fs.writeFileSync(join(process.cwd(), 'reloj-vivo-DESPUES.json'), JSON.stringify(d))
const ma = Object.fromEntries(antes.nodes.map((n) => [n.name, JSON.stringify(n.parameters)]))
console.log(JSON.stringify({ versionAntes: antes.versionId, versionDespues: d.versionId, activo: d.active, nodos: d.nodes.length, cron: d.nodes.find((n) => n.name === 'Every 3min').parameters.rule.interval[0].expression, executionTimeout: d.settings.executionTimeout, cambiados: d.nodes.filter((n) => ma[n.name] !== JSON.stringify(n.parameters)).map((n) => n.name) }))
