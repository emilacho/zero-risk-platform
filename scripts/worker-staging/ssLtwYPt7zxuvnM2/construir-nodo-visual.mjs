// EL NODO VISUAL, DENTRO DEL CIMIENTO, ANTES DEL PROMOTE · constructor del cimiento (ssLtwYPt7zxuvnM2)
// · CC#1 · 2026-09-26 · §144 Emilio · diseño v3 (`zr-vault/docs/DISENO-2026-09-26-el-piso-visual-…`).
//
// Hace UNA cosa: inserta el nodo nuevo «[BB] Piso visual (antes del Promote · CC#1)» en el ÚNICO
// punto donde el diseño lo pide — antes de «[BB] Promote prep» —, sin tocar nada más. Hoy DOS ramas
// llegan a Promote prep (fidelidad PASS y ciclos agotados, medido en el flujo vivo): las dos se
// retargetean al nodo nuevo, y el nodo nuevo sale hacia Promote prep. El orden sale gratis: es
// secuencial por construcción, sin campo de orden ni `causation_id` que inventar.
// No toca: la sala, el Promote, el resto del alta, planeación, el juez, el esquema de la base
// (todo entra por `content_text`, sin migración), ni ningún otro nodo del cimiento.
//
// node scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-nodo-visual.mjs <flujo-vivo.json> <salida.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))

export const NODO = '[BB] Piso visual (antes del Promote · CC#1)'
export const IF_FIDELIDAD = '[BB] IF · fidelidad PASS'
export const IF_CICLOS = '[BB] IF · ciclos agotados'
export const PROMOTE_PREP = '[BB] Promote prep'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

export const LOGICA_SRC = readFileSync(join(aqui, 'piso-visual-logica.js'), 'utf8')
export const NODO_SRC = readFileSync(join(aqui, 'nodo-visual-piso.js'), 'utf8')
/** El código del nodo = lógica pura (sin el `module.exports` de Node) + el cuerpo del nodo. */
export function codigoDelNodo() {
  const logica = LOGICA_SRC.replace(/\nif \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\n\}\n?$/, '\n')
  return logica + '\n' + NODO_SRC
}

/** Retarget de UNA salida concreta (por índice) de un nodo IF, del destino viejo al nuevo. */
function retargetSalida(connections, desde, indiceSalida, destinoViejo, destinoNuevo) {
  const main = connections[desde]?.main
  if (!main || !main[indiceSalida]) throw new Error(`«${desde}» no tiene salida en el índice ${indiceSalida}`)
  const salida = main[indiceSalida]
  if (salida.length !== 1 || salida[0].node !== destinoViejo || salida[0].index !== 0) {
    throw new Error(`«${desde}»[${indiceSalida}] no apunta sólo a «${destinoViejo}» índice 0 · ${JSON.stringify(salida)}`)
  }
  main[indiceSalida] = [{ node: destinoNuevo, type: 'main', index: 0 }]
}

export function construir(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of [IF_FIDELIDAD, IF_CICLOS, PROMOTE_PREP]) if (!byName.has(n)) throw new Error(`no encontré «${n}»`)
  if (byName.has(NODO)) throw new Error('el nodo del piso visual ya existe · no construir dos veces')

  const connections = JSON.parse(JSON.stringify(flujo.connections))
  // «[BB] IF · fidelidad PASS»[0] = rama PASS (hoy → Promote prep) · [1] = rama no-pass, sin tocar.
  retargetSalida(connections, IF_FIDELIDAD, 0, PROMOTE_PREP, NODO)
  // «[BB] IF · ciclos agotados»[0] = rama agotado (hoy → Promote prep) · [1] = rama con ciclos, sin tocar (→ Lazo A prep).
  retargetSalida(connections, IF_CICLOS, 0, PROMOTE_PREP, NODO)
  connections[NODO] = { main: [[{ node: PROMOTE_PREP, type: 'main', index: 0 }]] }

  const ifFid = byName.get(IF_FIDELIDAD)
  const nuevo = {
    parameters: { jsCode: codigoDelNodo() },
    id: 'nodo-visual-piso-cc1',
    name: NODO,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [(ifFid.position[0] + byName.get(PROMOTE_PREP).position[0]) / 2, ifFid.position[1] + 150],
    onError: 'continueRegularOutput',
    notes: 'EL NODO VISUAL (CC#1 · 2026-09-26 · §144 Emilio). Lee sitio+Instagram PROPIOS ya raspados (nunca competidor · R6), mira las fotos SIN client_id (R5 · descarta si brain_hit:true), arma capa gráfica (filtrada contra lo que el sitio declaró) + capa del producto + reglas + muestra (siempre por código, nunca por el modelo). Escribe en brand_book_draft.visual · el Promote (sin tocar) lo copia entero a content_text. Aditivo: cualquier fallo queda en visual.error y no para la corrida. Espejo: scripts/worker-staging/ssLtwYPt7zxuvnM2/.',
  }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  const idx = flujo.nodes.findIndex((x) => x.name === PROMOTE_PREP)
  const nodes = flujo.nodes.slice()
  nodes.splice(idx, 0, nuevo)
  return { name: flujo.name, nodes, connections, settings }
}

/** Diferencias nodo a nodo entre lo construido y lo que devuelve la API tras publicar (o entre dos versiones). */
export function diferencias(a, b) {
  const norm = (n) => JSON.stringify({ name: n.name, type: n.type, typeVersion: n.typeVersion, parameters: n.parameters, disabled: n.disabled || false, onError: n.onError || null })
  const an = new Map(a.nodes.map((n) => [n.name, norm(n)]))
  const bn = new Map(b.nodes.map((n) => [n.name, norm(n)]))
  const cambiados = [...bn.keys()].filter((k) => an.has(k) && an.get(k) !== bn.get(k))
  const nuevos = [...bn.keys()].filter((k) => !an.has(k))
  const borrados = [...an.keys()].filter((k) => !bn.has(k))
  const conexionesIguales = JSON.stringify(a.connections) === JSON.stringify(b.connections)
  return { cambiados, nuevos, borrados, conexionesIguales }
}

if (process.argv[1] && process.argv[1].endsWith('construir-nodo-visual.mjs')) {
  const [, , entrada, salida] = process.argv
  if (!entrada || !salida) { console.error('uso: node construir-nodo-visual.mjs <flujo-vivo.json> <salida.json>'); process.exit(2) }
  const vivo = JSON.parse(readFileSync(entrada, 'utf8'))
  const construido = construir(vivo)
  writeFileSync(salida, JSON.stringify(construido, null, 2) + '\n')
  const dif = diferencias(vivo, construido)
  console.log('construido ·', construido.nodes.length, 'nodos (antes', vivo.nodes.length, ') · nuevo:', dif.nuevos.join(','), '· cambiados (conexiones, no contenido):', dif.cambiados.length ? dif.cambiados.join(',') : 'ninguno')
}
