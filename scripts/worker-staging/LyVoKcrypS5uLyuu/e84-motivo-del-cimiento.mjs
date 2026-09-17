// E84 · el alta que para por el cimiento dice POR QUÉ.
// Sólo cambia el mensaje de «Stop and Error · cimiento no promovido». Nada más.
// Antes: «CIMIENTO NO PROMOVIDO · track_pass= · ciclos_agotados=» con los dos campos VACÍOS
// cuando el cimiento MUERE (la salida de error del Execute Workflow trae `error`, no `track_*`),
// y también vacíos por la rama «cimiento.failed» (ahí $json es la respuesta del emisor de fase).
// node scripts/worker-staging/LyVoKcrypS5uLyuu/e84-motivo-del-cimiento.mjs scripts/worker-staging/LyVoKcrypS5uLyuu/alta-antes-e84-c84f8516.json scripts/worker-staging/LyVoKcrypS5uLyuu/alta-construida-e84.json
import { readFileSync, writeFileSync } from 'node:fs'

export const STOP = 'Stop and Error · cimiento no promovido'
export const MENSAJE =
  "={{ ($json.error !== undefined && $json.discovery_package !== undefined)" +
  " ? 'CIMIENTO MURIÓ · ' + String($json.error).slice(0, 700)" +
  " + ' · el manual NO se escribió · la causa viene de la corrida del cimiento (ssLtwYPt7zxuvnM2 · el motor la borra en ~4 h)'" +
  " : 'CIMIENTO NO PROMOVIDO · track_pass=' + $('[JEFATURA] Execute Cimiento Track').first().json.track_pass" +
  " + ' · ciclos_agotados=' + $('[JEFATURA] Execute Cimiento Track').first().json.track_exhausted" +
  " + ' · el manual NO se escribió · retención para revisión humana (NO se despacha nada).' }}"

const [, , entrada, salida] = process.argv
if (entrada && salida) {
  const vivo = JSON.parse(readFileSync(entrada, 'utf8'))
  let tocados = 0
  const nodes = vivo.nodes.map((n) => {
    if (n.name !== STOP) return n
    tocados++
    return { ...n, parameters: { ...n.parameters, errorMessage: MENSAJE } }
  })
  if (tocados !== 1) throw new Error(`esperaba 1 nodo «${STOP}», encontré ${tocados}`)
  writeFileSync(salida, JSON.stringify({ name: vivo.name, nodes, connections: vivo.connections, settings: vivo.settings }, null, 1) + '\n')
  console.log('construido ·', nodes.length, 'nodos · cambia 1:', STOP)
}
