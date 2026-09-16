// E68 · construye el vigía del silencio desde el retrato VIVO · sin red.
// Sólo AGREGA el cierre después del aviso. No toca ningún nodo existente.
// node scripts/worker-staging/0WRWM0cChdiAxfTY/construir.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'vigia-VIVO-2026-09-16.json'), 'utf8'))

const AVISO = 'AVISO · #alertas'
const CIERRE = 'Cierre · el aviso llegó o la corrida falla'

const cierre = {
  id: 'vigia-cierre-aviso',
  name: CIERRE,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1240, 220],
  parameters: { jsCode: readFileSync(join(aqui, 'cierre-aviso.js'), 'utf8'), mode: 'runOnceForAllItems' },
}

const construido = {
  name: vivo.name,
  nodes: [...vivo.nodes, cierre],
  connections: { ...vivo.connections, [AVISO]: { main: [[{ node: CIERRE, type: 'main', index: 0 }]] } },
  settings: vivo.settings,
}

writeFileSync(join(aqui, 'vigia-construido.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construido ·', construido.nodes.length, 'nodos')
