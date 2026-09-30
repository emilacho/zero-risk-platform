// EL RELOJ DEL REPARTIDOR BAJA A RED DE SEGURIDAD · CC#1 · 2026-09-30 · paquete del repartidor (pieza ④) · SÓLO CONSTRUYE (lee la foto «antes», escribe la «construida»; no toca n8n).
//   node construir-reloj-2026-09-30.mjs
// Cambios (todos AJUSTES · cero nodos nuevos/borrados · cero conexiones movidas):
//   · «Every 3min» → cada 15 min (`*/15 * * * *`) · el nombre del nodo NO cambia (las conexiones lo referencian) pero se declara en la nota del nodo
//   · «Query recent tenants» → tope de 20 s (sin tope, con la base colgada esperaba para siempre)
//   · «Consume tick per tenant» → tope de 75 s (por encima del tope de 60 s de la ruta: la ruta corta primero y responde)
//   · ajuste del flujo `executionTimeout` = 300 s (red de seguridad: por debajo del ciclo de 15 min)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const SETTINGS_OK = ['executionOrder', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress', 'timezone', 'executionTimeout', 'errorWorkflow', 'callerPolicy']
export function construirReloj(antes) {
  const w = JSON.parse(JSON.stringify(antes))
  const nodo = (n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo ' + n); return x }
  const cron = nodo('Every 3min')
  if (cron.parameters.rule.interval[0].expression !== '*/3 * * * *') throw new Error('el reloj ya no es el de la foto (cada 3 min)')
  cron.parameters.rule.interval[0].expression = '*/15 * * * *'
  cron.notes = 'Red de seguridad · cada 15 min (antes cada 3) · paquete del repartidor 30-sep · el nombre del nodo se conserva a propósito'
  nodo('Query recent tenants').parameters.options.timeout = 20000
  nodo('Consume tick per tenant').parameters.options.timeout = 75000
  const settings = {}
  for (const k of SETTINGS_OK) if (w.settings?.[k] !== undefined) settings[k] = w.settings[k]
  settings.executionTimeout = 300
  return { name: w.name, nodes: w.nodes, connections: w.connections, settings }
}
if (process.argv[1] && process.argv[1].endsWith('construir-reloj-2026-09-30.mjs')) {
  const antes = JSON.parse(fs.readFileSync(join(aqui, 'reloj-antes-2026-09-30.json'), 'utf8'))
  fs.writeFileSync(join(aqui, 'reloj-construido-2026-09-30.json'), JSON.stringify(construirReloj(antes)))
  console.log('ok · versión de la foto', antes.versionId, '· nodos', antes.nodes.length)
}
