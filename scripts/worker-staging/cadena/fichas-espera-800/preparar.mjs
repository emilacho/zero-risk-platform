// 21-nov · #1260 (GO Lenovo 02:16Z y 02:32Z · CC4) · el lector de fichas `k1IZ5eGfGbUeMQR8` espera al agente 290 000 ms → 800 000 ms (el techo de Vercel).
// SOLO LECTURA de n8n: baja el flujo vivo, guarda el ANTES y escribe el DESPUÉS con UN cambio (el `timeout` del nodo «② Agente (run-sdk)»).
// Aplicarlo es otro paso (`aplicar.mjs`), después del FIRME, con n8n 0/0 y el ANTES igual al vivo.
// Uso:  doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/fichas-espera-800/preparar.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ID = 'k1IZ5eGfGbUeMQR8'
export const NODO = '② Agente (run-sdk)'
export const ANTES_MS = 290000
export const DESPUES_MS = 800000
const aqui = dirname(fileURLToPath(import.meta.url))

/** el cambio, puro: SOLO el timeout de ese nodo; todo lo demás igual. Falla si el nodo no está o no tiene la espera de antes. */
export function conEspera800(flujo) {
  const nodos = flujo.nodes.filter((n) => n.name === NODO)
  if (nodos.length !== 1) throw new Error(`se esperaba 1 nodo «${NODO}», hay ${nodos.length}`)
  const t = nodos[0].parameters?.options?.timeout
  if (t !== ANTES_MS) throw new Error(`el nodo «${NODO}» espera ${t} ms, no ${ANTES_MS}: el vivo no es el que se midió`)
  const copia = structuredClone(flujo)
  copia.nodes.find((n) => n.name === NODO).parameters.options.timeout = DESPUES_MS
  return copia
}

/** lo que n8n acepta en un PUT (sin campos de solo lectura) */
export const cuerpoDelPut = (f) => ({ name: f.name, nodes: f.nodes, connections: f.connections, settings: f.settings ?? {} })

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = process.env.N8N_BASE_URL, key = process.env.N8N_API_KEY
  if (!base || !key) throw new Error('faltan N8N_BASE_URL / N8N_API_KEY (correr con doppler)')
  const r = await fetch(`${base}/api/v1/workflows/${ID}`, { headers: { 'X-N8N-API-KEY': key } })
  if (!r.ok) throw new Error(`n8n GET ${r.status}`)
  const vivo = await r.json()
  const despues = conEspera800(vivo)
  writeFileSync(join(aqui, `${ID}-ANTES-2026-11-21.json`), JSON.stringify(vivo, null, 2) + '\n')
  writeFileSync(join(aqui, `${ID}-DESPUES-2026-11-21.json`), JSON.stringify(despues, null, 2) + '\n')
  console.log(`ANTES y DESPUÉS escritos · activo=${vivo.active} · versionId=${vivo.versionId} · nodos=${vivo.nodes.length}`)
}
