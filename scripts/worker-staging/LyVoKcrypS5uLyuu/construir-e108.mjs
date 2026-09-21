// E108 · el interruptor `dry_run` viaja en el sobre de la sala a planeación.
//
// Medido (E107 · planeación 146562): el sobre `planear` que arma el alta en «E57 · sobre · pedir planeación a la
// sala» NO lleva `dry_run`. La puerta de la sala guarda `payload` opaco, el despachador lo esparce entero en el cuerpo
// y planeación lee `body.dry_run` para los tres brazos ⇒ llegó `undefined` y el Servicio Apify se negó (correcto).
// Cambio mínimo · UN campo: `"dry_run": false` dentro de `payload`. Nada más se toca.
//
// node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e108.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'alta-antes-e108-ad844460.json'), 'utf8'))

export const SOBRE = 'E57 · sobre · pedir planeación a la sala'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const ANTES = '"pedido": "plan de 90 dias",'
const DESPUES = '"pedido": "plan de 90 dias", "dry_run": false,'

export function construir(flujo) {
  const n = flujo.nodes.find((x) => x.name === SOBRE)
  if (!n) throw new Error(`no encontré «${SOBRE}»`)
  const body = String(n.parameters.jsonBody)
  if (body.includes('"dry_run"')) throw new Error('el sobre ya lleva dry_run · no construir dos veces')
  if (!body.includes(ANTES)) throw new Error('el sobre no tiene la forma esperada (ad844460)')
  const nuevo = {
    ...n,
    parameters: { ...n.parameters, jsonBody: body.replace(ANTES, DESPUES) },
    notes: ((n.notes || '') + '\nE108 · el sobre lleva `dry_run: false` explícito: el ensayo se decide en el origen · planeación lo pasa tal cual a los brazos.').trim(),
  }
  const nodes = flujo.nodes.map((x) => (x.name === SOBRE ? nuevo : x))
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes, connections: flujo.connections, settings }
}

const construido = construir(vivo)
writeFileSync(join(aqui, 'alta-construida-e108.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construida ·', construido.nodes.length, 'nodos · el sobre lleva dry_run:false')
