// E103 · el último cristal · el aviso a `planeación`: 25 s y dos intentos · SIGUE DECIDIENDO.
// Construye el alta desde el retrato VIVO · cambia UN nodo · NO le pone «continuar en error».
// node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e103.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'alta-antes-e103-2ebb4d47.json'), 'utf8'))

export const SOBRE = 'E57 · sobre · pedir planeación a la sala'
export const TOPE_MS = 25000
export const INTENTOS = 2
export const ESPERA_MS = 3000

let tocados = 0
const nodes = vivo.nodes.map((n) => {
  if (n.name !== SOBRE) return n
  tocados++
  return {
    ...n,
    // 🔴 SIN onError a propósito: este nodo DECIDE. Si los dos intentos fallan, la corrida PARA
    // (sin pedido de planeación, el recorrido quedaría trunco en silencio · E101 no lo tocó por eso).
    retryOnFail: true,
    maxTries: INTENTOS,
    waitBetweenTries: ESPERA_MS,
    parameters: {
      ...n.parameters,
      // 15 s era menos de lo que la puerta tarda cuando reconcilia (~6 s medidos, y 6 s bastaron
      // para matar la tercera bolita en otro nodo con 5 s). 25 s = el mismo tope que E101.
      options: { ...(n.parameters.options ?? {}), timeout: TOPE_MS },
    },
  }
})
if (tocados !== 1) throw new Error(`esperaba 1 nodo «${SOBRE}», encontré ${tocados}`)

writeFileSync(
  join(aqui, 'alta-construida-e103.json'),
  JSON.stringify({ name: vivo.name, nodes, connections: vivo.connections, settings: vivo.settings }, null, 1) + '\n',
)
console.log('construido ·', nodes.length, 'nodos · cambia 1:', SOBRE, '· 25 s · 2 intentos · SIN continuar-en-error')
