// CABLE ② · COLORES Y TIPOGRAFÍA DEL SITIO · constructor del Servicio de Apify (3lyknrP3PoS2KzUf) · CC#1 · 2026-09-25.
//
// Hace TRES cosas sobre el flujo vivo, y nada más:
//   1. Inserta el nodo Code «Colores y tipografía del sitio (cable ② · CC#1)» entre
//      «Rearmar con el id de la página» y «Merge · apify data ready» (entrada 1). El nodo embebe,
//      letra por letra, extraer-colores-y-tipografia.js + nodo-colores-y-tipografia.js.
//   2. «transform-sections» devuelve además `visual` (lo que encontró el nodo · null si no aplica).
//   3. «final-response-ok» devuelve `visual` a quien llamó.
// No toca el cuerpo que se le manda al raspador (saveHtml sigue apagado · corrección del Arquitecto):
// el HTML se pide aparte dentro del nodo y NO se guarda.
//
// node scripts/worker-staging/3lyknrP3PoS2KzUf/construir-cable-colores.mjs <flujo-vivo.json> <salida.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))

export const NODO = 'Colores y tipografía del sitio (cable ② · CC#1)'
export const REARMAR = 'Rearmar con el id de la página'
export const MERGE = 'Merge · apify data ready'
export const TRANSFORM = 'transform-sections'
export const FINAL = 'final-response-ok'
export const TRANSFORM_ANTES = '    apify_data_count: data.length,'
export const TRANSFORM_DESPUES = "    // CABLE ② (CC#1 · 2026-09-25) · colores y tipografías declarados por el sitio · null si la función no es el sitio propio\n    visual: (items[0] && items[0]._visual) || null,\n    apify_data_count: data.length,"
export const FINAL_ANTES = '    materia_prima: ctx.materia_prima === true,'
export const FINAL_DESPUES = "    materia_prima: ctx.materia_prima === true,\n    // CABLE ② (CC#1 · 2026-09-25) · lo que el sitio declara de colores y tipografías · null si no aplica\n    visual: ctx.visual || null,"
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

export const EXTRACTOR_SRC = readFileSync(join(aqui, 'extraer-colores-y-tipografia.js'), 'utf8')
export const NODO_SRC = readFileSync(join(aqui, 'nodo-colores-y-tipografia.js'), 'utf8')
/** El código del nodo = extractor (sin el `module.exports` de Node) + cuerpo del nodo. */
export function codigoDelNodo() {
  const extractor = EXTRACTOR_SRC.replace(/\nif \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*?\n\}\n?$/, '\n')
  return extractor + '\n' + NODO_SRC
}

export function construir(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of [REARMAR, MERGE, TRANSFORM, FINAL]) if (!byName.has(n)) throw new Error(`no encontré «${n}»`)
  if (byName.has(NODO)) throw new Error('el nodo del cable ② ya existe · no construir dos veces')
  const rearmar = byName.get(REARMAR)
  const salidas = (flujo.connections[REARMAR]?.main || [])
  if (salidas.length !== 1 || salidas[0].length !== 1 || salidas[0][0].node !== MERGE || salidas[0][0].index !== 1) {
    throw new Error(`«${REARMAR}» no sale sólo hacia «${MERGE}» entrada 1 (5e702294) · ${JSON.stringify(salidas)}`)
  }
  const tc = String(byName.get(TRANSFORM).parameters.jsCode)
  if (tc.includes('_visual')) throw new Error('transform-sections ya trae el cable ② · no construir dos veces')
  if (tc.split(TRANSFORM_ANTES).length - 1 !== 1) throw new Error('no encuentro (una vez) la línea apify_data_count en transform-sections (5e702294)')
  const fc = String(byName.get(FINAL).parameters.jsCode)
  if (fc.includes('ctx.visual')) throw new Error('final-response-ok ya trae el cable ② · no construir dos veces')
  if (fc.split(FINAL_ANTES).length - 1 !== 1) throw new Error('no encuentro (una vez) la línea materia_prima en final-response-ok (5e702294)')

  const nuevo = {
    parameters: { jsCode: codigoDelNodo() },
    id: 'cable-colores-y-tipografia-cc1',
    name: NODO,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [rearmar.position[0] + 240, rearmar.position[1]],
    onError: 'continueRegularOutput',
    notes: 'CABLE ② · CC#1 · 2026-09-25 · §144 Emilio. Pide el HTML del sitio propio aparte (no se guarda), extrae colores y tipografías declarados y los deja en clients.brand_colors/brand_fonts SÓLO si estaban vacíos. Deja pasar los ítems tal cual (texto y markdown intactos). Fallos declarados en _visual.error. Espejo: scripts/worker-staging/3lyknrP3PoS2KzUf/.',
  }
  const connections = JSON.parse(JSON.stringify(flujo.connections))
  connections[REARMAR] = { main: [[{ node: NODO, type: 'main', index: 0 }]] }
  connections[NODO] = { main: [[{ node: MERGE, type: 'main', index: 1 }]] }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  const nodes = flujo.nodes.map((x) =>
    x.name === TRANSFORM
      ? { ...x, parameters: { ...x.parameters, jsCode: tc.replace(TRANSFORM_ANTES, TRANSFORM_DESPUES) }, notes: ((x.notes || '') + '\nCABLE ② · devuelve `visual` (colores y tipografías del sitio).').trim() }
      : x.name === FINAL
        ? { ...x, parameters: { ...x.parameters, jsCode: fc.replace(FINAL_ANTES, FINAL_DESPUES) }, notes: ((x.notes || '') + '\nCABLE ② · devuelve `visual` a quien llamó.').trim() }
        : x,
  )
  const idx = nodes.findIndex((x) => x.name === REARMAR)
  nodes.splice(idx + 1, 0, nuevo)
  return { name: flujo.name, nodes, connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-cable-colores.mjs')) {
  const [, , entrada, salida] = process.argv
  if (!entrada || !salida) { console.error('uso: node construir-cable-colores.mjs <flujo-vivo.json> <salida.json>'); process.exit(2) }
  const vivo = JSON.parse(readFileSync(entrada, 'utf8'))
  const construido = construir(vivo)
  writeFileSync(salida, JSON.stringify(construido, null, 2) + '\n')
  console.log('construido ·', construido.nodes.length, 'nodos (antes', vivo.nodes.length, ') · nodo del cable ② insertado tras «' + REARMAR + '» · transform-sections y final-response-ok devuelven `visual`')
}
