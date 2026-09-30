// ARREGLO DE RAÍZ DEL ORDEN DE NODOS · CC#1 · 2026-09-30 · decisión de Emilio: «dependencia explícita en vez de posición».
//
// EL DEFECTO (papel `2026-09-30-HALLAZGO-CC1-el-orden-de-los-nodos-…`): un nodo lee con `$('X')` a otro de una RAMA HERMANA; el orden entre hermanas sale de la posición en el
// lienzo y de que las ramas vecinas estén vacías o llenas. #403 lo arregló MOVIENDO nodos (un parche que depende de la posición). Aquí el orden lo GARANTIZA el grafo:
// el nodo leído pasa a ser ANTECESOR del que lo lee (una cadena en serie), así que ya no importa dónde se dibuje ni qué ramas salgan vacías.
//
//   PLANEACIÓN (X9F0zp6LQ2xGEYVS · v d67390d1)  ① GUARDA → «El número de la casa» → «La referencia del producto» → «Ficha del cliente» → (todo lo demás como siempre)
//     Antes: ① GUARDA repartía a los tres EN PARALELO. Ahora casa y referencia son antecesores de «Derivador (B5)» y de «armar el paquete», que los leen.
//     Seguro porque ambos nodos: continúan ante error · SIEMPRE devuelven una salida (alwaysOutputData) · no leen nada de su entrada (ni $json ni $input) · «Ficha del cliente»
//     tampoco lee nada de su entrada (usa el webhook por nombre) ⇒ una entrada más no cambia lo que piden ni cuántas veces corren (1 ítem ⇒ 1 corrida).
//   VIGÍA DEL SILENCIO (0WRWM0cChdiAxfTY · v d2014d36)  Reloj/Puerta → «El umbral del silencio» → «El reloj de la sala» → «El libro de la sala» → «[SALA] Vigía · decide»
//     Antes: el disparador repartía a los tres en paralelo y sólo «El libro» iba a «decide»; los otros dos eran ramas ciegas que «decide» leía con try/catch (y funcionaba
//     porque estaban dibujadas arriba). Seguro porque los tres: continúan ante error · siempre devuelven salida · no usan $json.
//
//   node construir-orden-explicito-2026-09-30.mjs    → escribe `*-construida-orden-explicito-2026-09-30.json` (NO toca n8n)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

const enlace = (a) => ({ node: a, type: 'main', index: 0 })
function nodo(flujo, n) { const x = flujo.nodes.find((k) => k.name === n); if (!x) throw new Error(`no encontré «${n}»`); return x }
/** lo que hay que tener antes de encadenar: que el nodo SIEMPRE entregue algo y no lea su entrada · si no, la cadena se cortaría o cambiaría de sentido */
function exigirEncadenable(flujo, n) {
  const x = nodo(flujo, n)
  const t = JSON.stringify(x.parameters || {})
  if (x.alwaysOutputData !== true) throw new Error(`«${n}» no tiene alwaysOutputData: si viniera vacío cortaría la cadena`)
  if (x.onError !== 'continueRegularOutput') throw new Error(`«${n}» no continúa ante error`)
  if (/\$json|\$input/.test(t)) throw new Error(`«${n}» lee su entrada: encadenarlo cambiaría lo que pide`)
}
function esperar(flujo, de, hijos) {
  const actual = (flujo.connections[de]?.main?.[0] || []).map((h) => h.node)
  if (JSON.stringify(actual) !== JSON.stringify(hijos)) throw new Error(`«${de}» ya no va a ${JSON.stringify(hijos)} (va a ${JSON.stringify(actual)}) · el flujo cambió desde la foto`)
}
const salidaDe = (flujo, connections) => {
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: flujo.nodes, connections, settings }
}

export const PLANEACION = {
  GUARDA: '① GUARDA · sin manual aprobado se DETIENE', CASA: 'El número de la casa', REFERENCIA: 'La referencia del producto', FICHA: 'Ficha del cliente',
}
export function construirPlaneacion(flujo) {
  const P = PLANEACION
  if (flujo.connections[P.CASA]?.main?.[0]?.length) throw new Error('«El número de la casa» ya tiene hijos · ya está construido o el flujo cambió')
  esperar(flujo, P.GUARDA, [P.FICHA, P.CASA, P.REFERENCIA])
  for (const n of [P.CASA, P.REFERENCIA, P.FICHA]) exigirEncadenable(flujo, n)
  const c = JSON.parse(JSON.stringify(flujo.connections))
  c[P.GUARDA] = { main: [[enlace(P.CASA)]] }
  c[P.CASA] = { main: [[enlace(P.REFERENCIA)]] }
  c[P.REFERENCIA] = { main: [[enlace(P.FICHA)]] }
  return salidaDe(flujo, c)
}

export const VIGIA = {
  RELOJ: 'Reloj · cada 6 horas', PUERTA: 'Puerta · preguntar a pedido', UMBRAL: 'El umbral del silencio', RELOJ_SALA: 'El reloj de la sala', LIBRO: 'El libro de la sala', DECIDE: '[SALA] Vigía · decide',
}
export function construirVigia(flujo) {
  const V = VIGIA
  if (flujo.connections[V.UMBRAL]?.main?.[0]?.length) throw new Error('«El umbral del silencio» ya tiene hijos · ya está construido o el flujo cambió')
  esperar(flujo, V.RELOJ, [V.UMBRAL, V.RELOJ_SALA, V.LIBRO])
  esperar(flujo, V.PUERTA, [V.UMBRAL, V.RELOJ_SALA, V.LIBRO])
  esperar(flujo, V.LIBRO, [V.DECIDE])
  for (const n of [V.UMBRAL, V.RELOJ_SALA, V.LIBRO]) exigirEncadenable(flujo, n)
  const c = JSON.parse(JSON.stringify(flujo.connections))
  c[V.RELOJ] = { main: [[enlace(V.UMBRAL)]] }
  c[V.PUERTA] = { main: [[enlace(V.UMBRAL)]] }
  c[V.UMBRAL] = { main: [[enlace(V.RELOJ_SALA)]] }
  c[V.RELOJ_SALA] = { main: [[enlace(V.LIBRO)]] }
  // «El libro» → «decide» ya estaba
  return salidaDe(flujo, c)
}

if (process.argv[1] && process.argv[1].endsWith('construir-orden-explicito-2026-09-30.mjs')) {
  const leer = (f) => JSON.parse(readFileSync(join(aqui, f), 'utf8'))
  const p = construirPlaneacion(leer('planeacion-antes-orden-explicito-2026-09-30.json'))
  writeFileSync(join(aqui, 'planeacion-construida-orden-explicito-2026-09-30.json'), JSON.stringify(p, null, 2) + '\n')
  const v = construirVigia(leer('vigia-antes-orden-explicito-2026-09-30.json'))
  writeFileSync(join(aqui, 'vigia-construida-orden-explicito-2026-09-30.json'), JSON.stringify(v, null, 2) + '\n')
  console.log('planeación construida ·', p.nodes.length, 'nodos · vigía construida ·', v.nodes.length, 'nodos · sólo conexiones')
}
