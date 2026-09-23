// E111 · el sobre del alta a planeación lleva el interruptor de re-corrida TAL COMO VIENE EN EL TRATO (cambio 2).
//
// Medido (E110 · planeación 146741): el guardia «⑥ ¿corrida repetida?» sólo cede con `body.forzar === true` y el
// redactor sólo reescribe con `body.force_restart === true`. El sobre de hoy (E57 · 900b0e53) no lleva ninguno de
// los dos, y el trato sí trae `force_restart` (llega intacto a la salida de «Validate Deal Data»).
// Cambio (mínimo · un solo nodo · dos campos dentro de `payload`): `forzar` y `force_restart`, ambos
// `trato.force_restart === true`. Sin trato forzado salen `false` y nada cambia. Igual que `dry_run` en E108.
//
// node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e111.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const SOBRE = 'E57 · sobre · pedir planeación a la sala'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const MARCA = '"pedido": "plan de 90 dias", "dry_run": false,'
export const CAMPOS = '\n    "forzar": {{ $(\'Validate Deal Data\').first().json.force_restart === true }},\n    "force_restart": {{ $(\'Validate Deal Data\').first().json.force_restart === true }},'

export function construir(flujo) {
  const n = flujo.nodes.find((x) => x.name === SOBRE)
  if (!n) throw new Error(`no encontré «${SOBRE}»`)
  const body = String(n.parameters.jsonBody)
  if (body.includes('forzar')) throw new Error('el sobre ya lleva forzar · no construir dos veces')
  if (!body.includes(MARCA)) throw new Error('no encuentro la marca del sobre (900b0e53 · E108)')
  const nuevo = { ...n, parameters: { ...n.parameters, jsonBody: body.replace(MARCA, MARCA + CAMPOS) }, notes: ((n.notes || '') + '\nE111 · payload.forzar y payload.force_restart = trato.force_restart === true (el guardia ⑥ y el redactor de planeación).').trim() }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: flujo.nodes.map((x) => (x.name === SOBRE ? nuevo : x)), connections: flujo.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-e111.mjs')) {
  const vivo = JSON.parse(readFileSync(join(aqui, 'alta-antes-e111-900b0e53.json'), 'utf8'))
  const construido = construir(vivo)
  writeFileSync(join(aqui, 'alta-construida-e111.json'), JSON.stringify(construido, null, 2) + '\n')
  console.log('construida ·', construido.nodes.length, 'nodos · E57: payload.forzar + payload.force_restart desde el trato')
}
