// PLANEACIÓN · seguimiento de r68 · el corregidor del plan con la tabla corregida («compará» en vez de «comparé») y el detector que MARCA el voseo que la tabla no conoce.
// Parte del flujo VIVO (CC#1 cambió «Pedir el plan al redactor» después de r68: no se pisa) y cambia SOLO el texto de la biblioteca pegada en «¿Llegó la vuelta?»
// (la versión r68-v1 → la actual). Una sola aparición exacta; si no, no construye.
//   node construir-seguimiento-r68.mjs   → lee `planeacion-ANTES-seguimiento-r68.json` (el vivo antes del cambio) y escribe `planeacion-ARREGLADO-seguimiento-r68.json` (NO toca n8n)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const NODO = '¿Llegó la vuelta?'
export const BIBLIOTECA_V1 = readFileSync(join(aqui, 'registro-del-plan-r68-v1.js'), 'utf8')
export const BIBLIOTECA_V2 = readFileSync(join(aqui, 'registro-del-plan.js'), 'utf8')
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const lf = (s) => s.replace(/\r\n/g, '\n')

export function construir(antes) {
  const nodos = antes.nodes.map((n) => JSON.parse(JSON.stringify(n)))
  const n = nodos.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  const eraCRLF = n.parameters.jsCode.includes('\r\n')
  const c = lf(n.parameters.jsCode)
  const viejo = lf(BIBLIOTECA_V1), nuevo = lf(BIBLIOTECA_V2)
  if (c.includes('function voseoDesconocido')) throw new Error('el nodo ya trae el seguimiento · no construir dos veces')
  const hay = c.split(viejo).length - 1
  if (hay !== 1) throw new Error(`la biblioteca r68-v1 aparece ${hay} veces en el nodo (debe ser 1): el vivo cambió, rehacer desde el vivo`)
  n.parameters.jsCode = eraCRLF ? c.replace(viejo, () => nuevo).replace(/\n/g, '\r\n') : c.replace(viejo, () => nuevo)
  const settings = {}
  for (const k of SETTINGS_OK) if (antes.settings?.[k] !== undefined) settings[k] = antes.settings[k]
  return { name: antes.name, nodes: nodos, connections: antes.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-seguimiento-r68.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'planeacion-ANTES-seguimiento-r68.json'), 'utf8'))
  writeFileSync(join(aqui, 'planeacion-ARREGLADO-seguimiento-r68.json'), JSON.stringify(construir(antes)))
  console.log('escrito planeacion-ARREGLADO-seguimiento-r68.json')
}
