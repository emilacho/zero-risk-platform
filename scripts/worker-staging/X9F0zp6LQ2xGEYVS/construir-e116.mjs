// E116 · cambio 2 · EL PEDIDO DE PLANEACIÓN AL REDACTOR DEJA EL VOSEO (español de Ecuador · tuteo).
//
// Medido (E114 · planeación 149154): el plan salió con voseo («tenés», «corrés», «podés») y el propio pedido
// que arma «Redactor (B4)» está en voseo («Sos el redactor…», «Escribi», «No tenes autorizacion», «deci»…).
// La identidad del agente es neutra (0 formas) y el documento de referencia («La referencia del producto») no
// está en voseo (sus «hace/explica/decía» son tercera persona). Cambio: SÓLO texto dentro de cadenas del nodo
// «Redactor (B4)» · palabra por palabra, lista cerrada · ninguna lógica. Nada más se toca.
//
// node scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-e116.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const REDACTOR = 'Redactor (B4)'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

/** lista cerrada · cada par es (texto exacto en voseo → tuteo) · con su cantidad esperada en 14951fff */
export const REEMPLAZOS = [
  ['usalo tal cual y deci en el plan que lo fija la casa', 'usalo tal cual y di en el plan que lo fija la casa', 1],
  ['y deci que sin el, el costo maximo', 'y di que sin el, el costo maximo', 1],
  ['Podes sostener el 60% con material', 'Puedes sostener el 60% con material', 1],
  ['⇒ ESCRIBI TEXTUALMENTE que el 60%', '⇒ ESCRIBE TEXTUALMENTE que el 60%', 1],
  ['⇒ deci QUE parte del 60% esta ASIGNADA', '⇒ di QUE parte del 60% esta ASIGNADA', 1],
  ["'Sos el redactor de planes de campana de esta agencia. Escribi UN plan de 90 dias para el',", "'Eres el redactor de planes de campana de esta agencia. Escribe UN plan de 90 dias para el',", 1],
  ['esto es evidencia, usala y citá de donde salio', 'esto es evidencia, usala y cita de donde salio', 1],
  ['Lo segundo es un hueco. Escribilos distinto.', 'Lo segundo es un hueco. Escribelos distinto.', 1],
  ['No tenes autorizacion para fijar presupuesto', 'No tienes autorizacion para fijar presupuesto', 1],
  ['aprueba una persona. Decilo asi en el plan.', 'aprueba una persona. Dilo asi en el plan.', 1],
  ['SECCIONES QUE NO PODES OMITIR', 'SECCIONES QUE NO PUEDES OMITIR', 1],
  ['Si la escribis aca, el plan esta mal.', 'Si la escribes aca, el plan esta mal.', 1],
  ['no listes lo que ya tiene; deci QUE LE FALTA', 'no listes lo que ya tiene; di QUE LE FALTA', 1],
]
/** lo que NO debe quedar en cadenas del pedido · para verificar */
export const VOSEO = /\b(Sos|sos|Escribi|ESCRIBI|Escribilos|escribis|tenes|Tenes|Podes|PODES|podes|deci|Deci|Decilo|citá|querés|creés|pedilo|decilo)\b/g

export function construir(flujo) {
  const n = flujo.nodes.find((x) => x.name === REDACTOR)
  if (!n) throw new Error(`no encontré «${REDACTOR}»`)
  let code = String(n.parameters.jsCode)
  if (code.includes('Eres el redactor')) throw new Error('el pedido ya está en tuteo · no construir dos veces')
  for (const [a, b, veces] of REEMPLAZOS) {
    const c = code.split(a).length - 1
    if (c !== veces) throw new Error(`«${a.slice(0, 40)}…» aparece ${c} veces, esperaba ${veces} (14951fff)`)
    code = code.split(a).join(b)
  }
  const quedan = code.match(VOSEO) || []
  if (quedan.length) throw new Error('quedan formas de voseo en el pedido: ' + [...new Set(quedan)].join(','))
  const nuevo = { ...n, parameters: { ...n.parameters, jsCode: code }, notes: ((n.notes || '') + '\nE116 · el pedido al redactor en tuteo (español de Ecuador) · 13 reemplazos de texto · sin lógica.').trim() }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: flujo.nodes.map((x) => (x.name === REDACTOR ? nuevo : x)), connections: flujo.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-e116.mjs')) {
  const vivo = JSON.parse(readFileSync(join(aqui, 'planeacion-antes-e116-14951fff.json'), 'utf8'))
  const construido = construir(vivo)
  writeFileSync(join(aqui, 'planeacion-construida-e116.json'), JSON.stringify(construido, null, 2) + '\n')
  console.log('construida ·', construido.nodes.length, 'nodos · Redactor (B4) en tuteo ·', REEMPLAZOS.length, 'reemplazos')
}
