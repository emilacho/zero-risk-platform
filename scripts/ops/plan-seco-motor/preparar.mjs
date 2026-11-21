#!/usr/bin/env node
/**
 * Saca del n8n vivo (solo lectura) el plan, la segunda mitad y lo que llamen, y escribe copias para el n8n LOCAL del doble chequeo.
 * Lo único que cambia: direcciones fijas → servidor local, y las esperas por reloj según --reloj (se declara en cambios.json). Nada vuelve a producción.
 *   doppler run -p zero-risk -c prd -- node preparar.mjs <carpeta> [--reloj 10] [--arnes http://localhost:4100]
 */
import fs from 'node:fs'
import path from 'node:path'
const args = process.argv.slice(2)
const dir = args[0]
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const RELOJ = Number(flag('--reloj', '10'))
const ARNES = flag('--arnes', 'http://localhost:4100')
const B = (process.env.N8N_BASE_URL || '').replace(/\/$/, '')
const K = process.env.N8N_API_KEY
if (!dir || !B || !K) { console.error('uso: preparar.mjs <carpeta> (con N8N_BASE_URL y N8N_API_KEY)'); process.exit(1) }
fs.mkdirSync(dir, { recursive: true })

const PRODUCCION = [
  [/https:\/\/zero-risk-platform\.vercel\.app/g, 'PLATAFORMA'],
  [/https:\/\/n8n-production-72be\.up\.railway\.app\/webhook\/zero-risk\/texto-a-drive/g, 'ARNES/drive'],
  [/https:\/\/slack\.com\/api\/chat\.postMessage/g, 'ARNES/slack'],
  [/https:\/\/n8n-production-72be\.up\.railway\.app/g, 'N8N_LOCAL'],
]
const cambios = []
function transformar(w) {
  for (const n of w.nodes) {
    const antes = JSON.stringify(n.parameters ?? {})
    let t = antes
    // el corredor falso vive en el arnés, no en la plataforma
    t = t.replace(/https:\/\/zero-risk-platform\.vercel\.app\/api\/agents\/run-sdk/g, `${ARNES}/api/agents/run-sdk`)
    for (const [re, a] of PRODUCCION) {
      t = t.replace(re, a === 'PLATAFORMA' ? 'http://localhost:4200' : a === 'N8N_LOCAL' ? 'http://localhost:5678' : a.replace('ARNES', ARNES))
    }
    if (t !== antes) { n.parameters = JSON.parse(t); cambios.push({ flujo: w.id, nodo: n.name, que: 'direcciones a local' }) }
    if (n.type === 'n8n-nodes-base.wait' && n.parameters.resume === 'timeInterval' && Number(n.parameters.amount) > RELOJ) {
      cambios.push({ flujo: w.id, nodo: n.name, que: `espera ${n.parameters.amount} s → ${RELOJ} s` })
      n.parameters.amount = RELOJ
    }
  }
  return w
}
const leer = async (id) => { const r = await fetch(`${B}/api/v1/workflows/${id}`, { headers: { 'X-N8N-API-KEY': K } }); if (!r.ok) throw new Error(`${id} ${r.status}`); return r.json() }
const vistos = new Set()
const cola = ['X9F0zp6LQ2xGEYVS', 'o8qaF7bI0PKv2XGZ'] // el plan y el turno de la jefatura (el turno se despierta por dirección, no como subflujo)
while (cola.length) {
  const id = cola.shift()
  if (vistos.has(id)) continue
  vistos.add(id)
  const w = await leer(id)
  for (const n of w.nodes) if (n.type === 'n8n-nodes-base.executeWorkflow') { const s = n.parameters?.workflowId?.value ?? n.parameters?.workflowId; if (typeof s === 'string') cola.push(s) }
  const limpio = { id: w.id, name: `SECO · ${w.name}`, nodes: w.nodes, connections: w.connections, settings: w.settings, active: id === 'X9F0zp6LQ2xGEYVS', pinData: {}, versionId: w.versionId }
  transformar(limpio)
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(limpio, null, 1))
  console.log(id, w.name, w.nodes.length, 'nodos')
}
fs.writeFileSync(path.join(dir, 'cambios.json'), JSON.stringify(cambios, null, 1))
console.log('cambios declarados:', cambios.length)
const restos = fs.readdirSync(dir).filter((f) => f !== 'cambios.json').flatMap((f) => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0]))
console.log('direcciones que quedan:', [...new Set(restos)].join(' · '))
