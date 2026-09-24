// E121 · EL ANCLAJE DE COMPETIDORES NO PUEDE FALLAR POR EL NOMBRE · lado del ALTA (3 nodos · texto).
//
// Medido (E120B · alta 149699 · versión viva a4b21ac8):
//   1. «[ANCHOR] Load client (canonical competitor_list)» pide GET /api/clients?name=<nombre> → 409
//      client_name_ambiguous (3 fichas «Náufrago»: la nueva + 2 lápidas) → el guardia queda en
//      _anchor.applied:false (no_canonical) y se cae al camino de respaldo.
//   2. «Persist Client to Supabase» manda `industry: 'unknown'` (el valor por defecto del validador) y
//      la puerta lo escribe: pisa lo que el poblador del descubrimiento pueda haber puesto.
//   3. «[APIFY] Enrich competitors» arma `client_id: unwrap.client_id || null` (unwrap = salida del guardia,
//      sin client_id) → null.
// Cambios (mínimos): 1. el anclaje busca por `client_id` (el de la corrida) · 2. la industria sólo viaja si
// el trato la trajo (si fue un valor por defecto, null · la puerta ignora null) · 3. el cliente del
// enriquecimiento sale de «Validate Deal Data». Nada más se toca.
//
// node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e121.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const LOAD = '[ANCHOR] Load client (canonical competitor_list)'
export const PERSIST = 'Persist Client to Supabase'
export const ENRICH = '[APIFY] Enrich competitors'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

export const QS_ANTES = { name: 'name', value: "={{ $('Validate Deal Data').item.json.client_name || '' }}" }
export const QS_DESPUES = { name: 'client_id', value: "={{ $('Validate Deal Data').item.json.client_id || '' }}" }
export const PERSIST_ANTES = "  industry: $('Validate Deal Data').first().json.industry || null,"
export const PERSIST_DESPUES = "  industry: (($('Validate Deal Data').first().json._defaults_aplicados || []).includes('industry') ? null : ($('Validate Deal Data').first().json.industry || null)),   // E121 · si fue valor por defecto no viaja: el poblador del descubrimiento rellena sólo lo vacío"
export const ENRICH_ANTES = 'return [{ json: { client_id: unwrap.client_id || null, competitors: enriched,'
export const ENRICH_DESPUES = "return [{ json: { client_id: $('Validate Deal Data').first().json.client_id || unwrap.client_id || null, competitors: enriched,"

export function construir(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of [LOAD, PERSIST, ENRICH]) if (!byName.has(n)) throw new Error(`no encontré «${n}»`)
  const load = byName.get(LOAD), persist = byName.get(PERSIST), enrich = byName.get(ENRICH)
  const qs = load.parameters.queryParameters?.parameters || []
  if (qs.some((p) => p.name === 'client_id')) throw new Error('el anclaje ya busca por client_id · no construir dos veces')
  if (qs.length !== 1 || qs[0].name !== QS_ANTES.name || qs[0].value !== QS_ANTES.value) throw new Error('el anclaje no tiene la consulta esperada (a4b21ac8)')
  const pb = String(persist.parameters.jsonBody)
  if (pb.includes('_defaults_aplicados')) throw new Error('Persist ya trae E121 · no construir dos veces')
  if (pb.split(PERSIST_ANTES).length - 1 !== 1) throw new Error('no encuentro (una vez) la línea de industry en Persist (a4b21ac8)')
  const ec = String(enrich.parameters.jsCode)
  if (ec.includes("$('Validate Deal Data').first().json.client_id")) throw new Error('Enrich ya trae E121 · no construir dos veces')
  if (ec.split(ENRICH_ANTES).length - 1 !== 1) throw new Error('no encuentro (una vez) el return de Enrich (a4b21ac8)')
  const loadNuevo = { ...load, parameters: { ...load.parameters, queryParameters: { parameters: [QS_DESPUES] } }, notes: ((load.notes || '') + '\nE121 · busca al cliente por client_id (el de la corrida), no por nombre (ambiguo con las lápidas).').trim() }
  const persistNuevo = { ...persist, parameters: { ...persist.parameters, jsonBody: pb.replace(PERSIST_ANTES, PERSIST_DESPUES) }, notes: ((persist.notes || '') + '\nE121 · industry no viaja si fue valor por defecto (unknown): el poblador rellena sólo lo vacío.').trim() }
  const enrichNuevo = { ...enrich, parameters: { ...enrich.parameters, jsCode: ec.replace(ENRICH_ANTES, ENRICH_DESPUES) }, notes: ((enrich.notes || '') + '\nE121 · client_id desde Validate Deal Data (antes salía null).').trim() }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: flujo.nodes.map((x) => (x.name === LOAD ? loadNuevo : x.name === PERSIST ? persistNuevo : x.name === ENRICH ? enrichNuevo : x)), connections: flujo.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-e121.mjs')) {
  const vivo = JSON.parse(readFileSync(join(aqui, 'alta-antes-e121-a4b21ac8.json'), 'utf8'))
  const construido = construir(vivo)
  writeFileSync(join(aqui, 'alta-construida-e121.json'), JSON.stringify(construido, null, 2) + '\n')
  console.log('construida ·', construido.nodes.length, 'nodos · anclaje por client_id · industry sin unknown · enrich con cliente')
}
