// E99 ② · el aviso trae la CAUSA · el alta arma la causa del cimiento en un nodo propio antes de parar.
//
// Lo que pasó (E98 · alta 141329): «Stop and Error · cimiento no promovido» armaba su mensaje con una
// expresión larga y reventó con un TypeError del propio nodo ⇒ el aviso a #alertas trajo
// «Cannot use 'in' operator to search for 'description' in undefined» y no la causa. Y la causa que iba
// a imprimir («cimiento no promovido») era falsa: el cimiento devolvió un ítem que NO era su contrato.
//
// Arreglo: un Code node «Armar la causa · cimiento» (con try/catch · siempre devuelve una cadena) alimenta
// al Stop, cuyo mensaje pasa a ser `$json.causa`. Distingue los TRES casos:
//   · el cimiento MURIÓ (salida de error del Execute Workflow) ⇒ el error real
//   · el cimiento devolvió algo que NO es su contrato (sin _cimiento_return) ⇒ lo dice y muestra qué llegó
//   · el cimiento contestó honesto y no promovió ⇒ track_pass · track_published · motivo · ciclos · fuente
//
// node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e99.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const vivo = JSON.parse(readFileSync(join(aqui, 'alta-antes-e99-fae3046f.json'), 'utf8'))

export const EXECUTE = '[JEFATURA] Execute Cimiento Track'
export const EMIT = '[MODELB] Emit · cimiento.failed (honesto)'
export const STOP = 'Stop and Error · cimiento no promovido'
export const ARMAR = 'Armar la causa · cimiento'

const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

export const CODIGO_ARMAR = `// E99 (CC#3 2026-09-18) · arma la CAUSA con la que muere el alta cuando el cimiento no promueve.
// Siempre devuelve una cadena: el aviso a #alertas la lleva tal cual. NO decide nada · NO llama a nadie.
const j = (v) => { try { return JSON.stringify(v).slice(0, 400); } catch (e) { return String(v); } };
const inp = ($input.first() && $input.first().json) || {};
let ret = null, retErr = null;
try { ret = $('${EXECUTE}').first().json; } catch (e) { retErr = String(e && e.message || e); }

let causa;
if (inp.error !== undefined && inp.discovery_package !== undefined) {
  // salida de error del Execute Workflow: el cimiento MURIÓ · el ítem trae el error y el paquete
  const err = (inp.error && typeof inp.error === 'object') ? (inp.error.message || j(inp.error)) : String(inp.error);
  causa = 'CIMIENTO MURIÓ · ' + String(err).slice(0, 700) + ' · el manual NO se escribió · la causa entera está en la corrida del cimiento (ssLtwYPt7zxuvnM2 · el motor la borra en ~4 h)';
} else if (!ret || ret._cimiento_return !== true) {
  // E98: el cimiento devolvió un ítem que NO es su contrato (p. ej. el acuse del PDF) · no se sabe si promovió
  causa = 'EL CIMIENTO NO DEVOLVIÓ SU CONTRATO · llegó ' + (ret ? j(ret) : '(nada' + (retErr ? ' · ' + retErr : '') + ')') + ' · NO se sabe si el manual se promovió: mirar client_brand_books del cliente y la corrida del cimiento · nada se despacha (E99)';
} else {
  causa = 'CIMIENTO NO PROMOVIDO · track_pass=' + String(ret.track_pass) + ' · track_published=' + String(ret.track_published) + ' · motivo=' + String(ret.track_reason || '?') + ' · ciclos_agotados=' + String(ret.track_exhausted) + ' · fuente=' + String(ret._return_source || '?') + ' · el manual NO se escribió · retención para revisión humana (nada se despacha).';
}
if (typeof causa !== 'string' || !causa) causa = 'CIMIENTO NO PROMOVIDO · sin causa legible (E99)';
return [{ json: Object.assign({}, inp, { causa, _cimiento_ret: ret }) }];`

export function construir(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of [EXECUTE, EMIT, STOP]) if (!byName.has(n)) throw new Error(`no encontré «${n}» en el retrato vivo`)
  if (byName.has(ARMAR)) throw new Error('el retrato ya trae E99 · no construir dos veces')

  // el cableado esperado (fae3046f): Execute#1 → Stop · Emit#0 → Stop
  const a = (flujo.connections[EXECUTE]?.main?.[1] ?? []).map((x) => x.node)
  const b = (flujo.connections[EMIT]?.main?.[0] ?? []).map((x) => x.node)
  if (!a.includes(STOP) || !b.includes(STOP)) throw new Error(`el Stop no cuelga de Execute#1 y Emit#0 como en fae3046f · ${a} · ${b}`)

  const stop = byName.get(STOP)
  const armar = {
    id: 'e99-armar-la-causa-cimiento',
    name: ARMAR,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [stop.position[0] - 220, stop.position[1]],
    parameters: { jsCode: CODIGO_ARMAR },
    notes: 'E99 · arma la causa real (murió · no devolvió su contrato · no promovió) · el Stop sólo la imprime.',
  }
  const stopNuevo = {
    ...stop,
    position: [stop.position[0] + 60, stop.position[1]],
    parameters: {
      errorType: 'errorMessage',
      errorMessage: "={{ $json.causa || 'CIMIENTO NO PROMOVIDO · sin causa legible (E99)' }}",
    },
    notes: ((stop.notes || '') + '\nE99 · el mensaje viene armado de «Armar la causa · cimiento» · sin expresiones largas aquí.').trim(),
  }

  const connections = { ...flujo.connections }
  const redirigir = (nodo, salida) => {
    const c = connections[nodo]
    const main = (c.main ?? []).map((s, i) => (i === salida ? (s ?? []).map((x) => (x.node === STOP ? { ...x, node: ARMAR } : x)) : s))
    connections[nodo] = { ...c, main }
  }
  redirigir(EXECUTE, 1)
  redirigir(EMIT, 0)
  connections[ARMAR] = { main: [[{ node: STOP, type: 'main', index: 0 }]] }

  const nodes = flujo.nodes.map((n) => (n.name === STOP ? stopNuevo : n))
  nodes.push(armar)
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes, connections, settings }
}

const construido = construir(vivo)
writeFileSync(join(aqui, 'alta-construida-e99.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construida ·', construido.nodes.length, 'nodos · +«' + ARMAR + '» · Execute#1 y Emit#0 → Armar → Stop($json.causa)')
