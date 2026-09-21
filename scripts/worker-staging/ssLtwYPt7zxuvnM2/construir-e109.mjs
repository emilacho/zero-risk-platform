// E109 · el manual se escribe con la materia del cliente · lado del CIMIENTO · la otra mitad del cambio 3.
//
// «[BB] Fan-out prep» arma el grounding compartido de las 3 lentes a partir de discovery_package (que llega
// entero por Validate Deal Data → Confirm barato). Hoy no mira `materia_cliente`: aunque el alta la mande,
// las lentes no la verían. UNA línea en el grounding y su lugar en el orden de sacrificio (después de
// apify_sources: si no cabe, se cede ANTES que competidores y resumen, y se declara en _corte).
// No se reescribe ninguna lente ni el juez. Tope: la materia ya viene con tope desde el alta (3.500 + 1.000).
//
// node scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-e109.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'cimiento-antes-e109-36871fc3.json'), 'utf8'))

export const FANOUT = '[BB] Fan-out prep'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const GROUNDING_ANTES = "  apify_sources: (apifyAgg.sources || apifyAgg.results || []).slice(0, 10),\n"
const GROUNDING_DESPUES = GROUNDING_ANTES +
  "  // E109 (CC#1 2026-09-21) · la materia del cliente (sitio + Instagram propio + idioma) · viene con tope desde el alta.\n" +
  "  materia_cliente: discoveryPkg.materia_cliente || null,\n"
const SACRIFICIO_ANTES = "const _SACRIFICIO_EV = ['apify_sources', 'competitors', 'discovery_summary'];"
const SACRIFICIO_DESPUES = "const _SACRIFICIO_EV = ['apify_sources', 'materia_cliente', 'competitors', 'discovery_summary']; // E109 · la materia cede antes que competidores y resumen"

export function construir(flujo) {
  const n = flujo.nodes.find((x) => x.name === FANOUT)
  if (!n) throw new Error(`no encontré «${FANOUT}»`)
  const code = String(n.parameters.jsCode)
  if (code.includes('materia_cliente')) throw new Error('Fan-out prep ya trae E109 · no construir dos veces')
  if (!code.includes(GROUNDING_ANTES)) throw new Error('no encuentro la línea apify_sources del grounding (36871fc3)')
  if (!code.includes(SACRIFICIO_ANTES)) throw new Error('no encuentro el orden de sacrificio (36871fc3)')
  const nuevo = code.replace(GROUNDING_ANTES, GROUNDING_DESPUES).replace(SACRIFICIO_ANTES, SACRIFICIO_DESPUES)
  const fan = { ...n, parameters: { ...n.parameters, jsCode: nuevo }, notes: ((n.notes || '') + '\nE109 · grounding.materia_cliente (sitio + Instagram propio + idioma) · cede antes que competidores y resumen.').trim() }
  const nodes = flujo.nodes.map((x) => (x.name === FANOUT ? fan : x))
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes, connections: flujo.connections, settings }
}

const construido = construir(vivo)
writeFileSync(join(aqui, 'cimiento-construido-e109.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construido ·', construido.nodes.length, 'nodos · Fan-out prep: grounding.materia_cliente + orden de sacrificio')
