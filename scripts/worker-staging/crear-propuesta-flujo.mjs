/**
 * Crea (una vez) el flujo «Manual · propuesta del agente» en n8n a partir de `propuesta-NUEVO-2026-10-12.json` y lo publica. Si ya existe uno con ese nombre, NO crea otro: lo dice.
 *   node crear-propuesta-flujo.mjs [--activar]
 * Escribe el id y el respaldo de lo que quedó vivo en propuesta-del-agente/propuesta-VIVO-<fecha>.json (por si hay que volver atrás: desactivar y borrar el flujo; no toca ningún otro).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(AQUI, 'propuesta-del-agente')
const envPath = 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
const env = fs.readFileSync(envPath, 'utf8')
const g = (k) => process.env[k] ?? (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const BASE = g('N8N_BASE_URL').replace(/\/$/, '')
const KEY = g('N8N_API_KEY')
const api = async (m, p, body) => {
  const r = await fetch(`${BASE}/api/v1${p}`, { method: m, headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t.slice(0, 300)}`)
  return JSON.parse(t)
}
const flujo = JSON.parse(fs.readFileSync(path.join(DIR, 'propuesta-NUEVO-2026-10-12.json'), 'utf8'))
const existentes = (await api('GET', '/workflows?limit=250')).data.filter((w) => w.name === flujo.name)
if (existentes.length) { console.log('YA existe (no se crea otro):', existentes.map((w) => `${w.id} activo=${w.active}`).join(' · ')); process.exit(0) }
const creado = await api('POST', '/workflows', { name: flujo.name, nodes: flujo.nodes, connections: flujo.connections, settings: flujo.settings })
console.log('creado', creado.id)
if (process.argv.includes('--activar')) { await api('POST', `/workflows/${creado.id}/activate`); console.log('activado') }
const vivo = await api('GET', `/workflows/${creado.id}`)
fs.writeFileSync(path.join(DIR, `propuesta-VIVO-2026-10-12-${creado.id}.json`), JSON.stringify(vivo, null, 2))
console.log('respaldo escrito · activo =', vivo.active)
