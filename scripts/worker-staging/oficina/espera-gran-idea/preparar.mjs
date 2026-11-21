// 21-nov · GO Lenovo 10:19Z (firma de Emilio 10:18Z) · el flujo `Oficina · un turno` (`bTbWL9lUvQCfStAz`) espera la vuelta del agente 1 800 s → 15 300 s.
// Por qué: la dirección de la gran idea reserva US$ 10 por turno y su plazo es 250 min (`PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN`); la espera del flujo tiene que dejarlo caber
// (250 min + 5 de margen = 255 min). Con 1 800 s el Wait se agota a los 30 min y el turno vuelve «vacío» aunque el agente siga trabajando.
// SOLO LECTURA de n8n: baja el flujo vivo, guarda el ANTES y escribe el DESPUÉS con UN cambio (`resumeAmount` del nodo «② Esperar al agente»).
// Aplicarlo es otro paso (`aplicar.mjs`), después del FIRME, con n8n 0/0 y el ANTES igual al vivo.
// Uso:  doppler run -p zero-risk -c prd -- node scripts/worker-staging/oficina/espera-gran-idea/preparar.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ID = 'bTbWL9lUvQCfStAz'
export const NODO = '② Esperar al agente'
export const ANTES_S = 1800
export const DESPUES_S = 15300
export const FECHA = '2026-11-21'
const aqui = dirname(fileURLToPath(import.meta.url))

/** el cambio, puro: SOLO la espera de ese nodo; todo lo demás igual. Falla si el nodo no está, no es un Wait por webhook en segundos o no tiene la espera de antes. */
export function conEsperaDeLaGranIdea(flujo) {
  const nodos = flujo.nodes.filter((n) => n.name === NODO)
  if (nodos.length !== 1) throw new Error(`se esperaba 1 nodo «${NODO}», hay ${nodos.length}`)
  const p = nodos[0].parameters ?? {}
  if (p.resume !== 'webhook' || p.limitWaitTime !== true || p.resumeUnit !== 'seconds') throw new Error(`el nodo «${NODO}» no es un Wait por webhook con límite en segundos`)
  if (p.resumeAmount !== ANTES_S) throw new Error(`el nodo «${NODO}» espera ${p.resumeAmount} s, no ${ANTES_S}: el vivo no es el que se midió`)
  const copia = structuredClone(flujo)
  copia.nodes.find((n) => n.name === NODO).parameters.resumeAmount = DESPUES_S
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
  const despues = conEsperaDeLaGranIdea(vivo)
  writeFileSync(join(aqui, `${ID}-ANTES-${FECHA}.json`), JSON.stringify(vivo, null, 2) + '\n')
  writeFileSync(join(aqui, `${ID}-DESPUES-${FECHA}.json`), JSON.stringify(despues, null, 2) + '\n')
  console.log(`ANTES y DESPUÉS escritos · activo=${vivo.active} · versionId=${vivo.versionId} · nodos=${vivo.nodes.length}`)
}
