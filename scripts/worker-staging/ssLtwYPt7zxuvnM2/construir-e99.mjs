// E99 · el alta lee la respuesta equivocada · el cimiento devuelve al padre el RESULTADO, no el acuse del PDF.
//
// Lo que pasó (E98 · 2026-09-18 · cimiento 141335): «[BB] Promote → canon» abría en DOS ramas terminales,
// «Return scores a parent» y «[BB] Manual → Drive (PDF)». El motor devuelve al «Execute Workflow» del padre
// la salida del ÚLTIMO nodo que corre, y ese era el del PDF: {"message":"Workflow was started"}.
// El alta leyó track_published = undefined ⇒ «cimiento no promovido» (FALSO: estaba promovido y con PDF).
//
// Arreglo · una conexión: Promote → canon ⇒ Manual → Drive (PDF) ⇒ Return scores a parent.
// El PDF sigue saliendo (antes), y «Return scores» queda como el ÚLTIMO nodo · anexa el acuse del PDF sin decidir nada.
//
// node scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-e99.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'cimiento-VIVO-2026-09-18-e99.json'), 'utf8'))

export const PROMOTE = '[BB] Promote → canon'
export const PDF = '[BB] Manual → Drive (PDF)'
export const RETURN = 'Return scores a parent (grade-cimiento gate)'

// El PUT del motor sólo acepta estas claves de settings.
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

export const ANEXO_PDF = `
// E99 (CC#3 2026-09-18) · este nodo DEBE ser el ÚLTIMO del cimiento: el motor devuelve al padre la
// salida del último nodo que corre. En la segunda bolita (141335) corría ANTES que «[BB] Manual → Drive (PDF)»
// y el padre recibió {"message":"Workflow was started"} ⇒ «cimiento no promovido» FALSO (canon 2176f143 escrito).
// El PDF ahora va antes y su acuse se anexa aquí · NO decide nada · si el nodo del PDF no corrió, se dice.
let _pdf = { solicitado: false, acuse: null };
try {
  const _a = $('${PDF}').first().json || {};
  _pdf = { solicitado: _a.message === 'Workflow was started' || _a.ok === true, acuse: _a };
} catch (e) { _pdf = { solicitado: false, acuse: null, nota: 'el nodo del PDF no corrió antes que este' }; }
`

export function construir(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of [PROMOTE, PDF, RETURN]) if (!byName.has(n)) throw new Error(`no encontré «${n}» en el retrato vivo`)

  // ① conexiones · Promote → PDF → Return · (antes: Promote → {Return, PDF} · dos terminales)
  const salidasPromote = (flujo.connections[PROMOTE]?.main?.[0] ?? []).map((x) => x.node).sort()
  if (JSON.stringify(salidasPromote) !== JSON.stringify([PDF, RETURN].sort())) {
    throw new Error(`«${PROMOTE}» no abre en {PDF, Return} como en 7e0b4ff9 · abre en: ${salidasPromote.join(' + ')}`)
  }
  if (flujo.connections[PDF] || flujo.connections[RETURN]) throw new Error('el PDF o el Return ya tienen salida · no es el retrato esperado')
  const connections = { ...flujo.connections }
  connections[PROMOTE] = { main: [[{ node: PDF, type: 'main', index: 0 }]] }
  connections[PDF] = { main: [[{ node: RETURN, type: 'main', index: 0 }]] }

  // ② «Return scores» anexa el acuse del PDF · y sigue devolviendo el contrato entero
  const ret = byName.get(RETURN)
  const code = String(ret.parameters.jsCode)
  const marca = 'return [{ json: {\n  fidelity_scores:'
  if (!code.includes(marca)) throw new Error('no encuentro el `return` del contrato en «Return scores»')
  if (code.includes('E99 (CC#3')) throw new Error('el retrato ya trae E99 · no construir dos veces')
  const nuevoCode = code
    .replace(marca, ANEXO_PDF + marca)
    .replace('  _cimiento_return: true\n', '  pdf_manual: _pdf,   // E99 · acuse del PDF (informativo)\n  _cimiento_return: true\n')
  if (!nuevoCode.includes('pdf_manual: _pdf')) throw new Error('no pude anexar pdf_manual al contrato')
  const retNuevo = {
    ...ret,
    parameters: { ...ret.parameters, jsCode: nuevoCode },
    notes: ((ret.notes || '') + '\nE99 · ÚLTIMO nodo del cimiento: lo que sale de aquí es lo que lee el alta. El PDF corre antes.').trim(),
  }
  const pdf = byName.get(PDF)
  const pdfNuevo = { ...pdf, notes: ((pdf.notes || '') + '\nE99 · corre ANTES de «Return scores» · su acuse NO es el contrato del cimiento.').trim() }

  const nodes = flujo.nodes.map((n) => (n.name === RETURN ? retNuevo : n.name === PDF ? pdfNuevo : n))
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes, connections, settings }
}

const construido = construir(vivo)
writeFileSync(join(aqui, 'cimiento-construido-e99.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construido ·', construido.nodes.length, 'nodos · Promote → PDF → Return · Return anexa pdf_manual')
