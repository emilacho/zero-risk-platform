// E84 · construye el cimiento desde el retrato VIVO · sin red.
// Sólo reemplaza el código de «[BB] Rescate · red 3 · fusionar o PARAR». Nada más.
// node scripts/worker-staging/ssLtwYPt7zxuvnM2/construir.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'cimiento-VIVO-2026-09-17.json'), 'utf8'))
export const RED3 = '[BB] Rescate · red 3 · fusionar o PARAR'

let tocados = 0
const nodes = vivo.nodes.map((n) => {
  if (n.name !== RED3) return n
  tocados++
  return { ...n, parameters: { ...n.parameters, jsCode: readFileSync(join(aqui, 'red-3-fusionar.js'), 'utf8') } }
})
if (tocados !== 1) throw new Error(`esperaba 1 nodo «${RED3}», encontré ${tocados}`)

const construido = { name: vivo.name, nodes, connections: vivo.connections, settings: vivo.settings }
writeFileSync(join(aqui, 'cimiento-construido.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construido ·', nodes.length, 'nodos · cambia 1:', RED3)
