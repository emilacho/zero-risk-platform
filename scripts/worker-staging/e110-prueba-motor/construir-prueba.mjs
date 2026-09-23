// E110 · PRUEBA EN EL MOTOR REAL A COSTO CERO (CC#1 · 2026-09-22)
//
// Lo que E109 no probó fue el EMPAREJAMIENTO del motor (pairedItem), que la prueba en miniatura no modela.
// Esta prueba corre en n8n de verdad, con el flujo CONSTRUIDO tal cual, pero con cada nodo que cuesta o deja
// rastro (HTTP · Execute Workflow · Wait · Respond) reemplazado por un nodo de código que devuelve LO GRABADO
// en la corrida real (146661 / 146532 / 146544), ítem por ítem y con su pairedItem. Los nodos de código y las
// puertas (IF) corren de verdad con su código real: el Gate nuevo, Load landscape_summary (su referencia
// `$('Validate Deal Data').item` se evalúa POR ÍTEM en el sustituto), Transform con materia, Fan-out prep, Judge prep.
//
// Sustitutos con referencias `.item` en sus parámetros corren en modo «por ítem» y evalúan ESAS MISMAS
// referencias (si el emparejamiento falla, el nodo falla igual que en 146661). El resultado queda en
// `_prueba_e110.resueltos` de su salida. El disparador original se sustituye por lo grabado y se agrega un
// webhook de prueba propio (sin llave: el sustituto del disparador ya trae la grabación).
//
// Sin errorWorkflow (para no molestar al avisador) · sin credenciales · nombre que grita BORRAR.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const STUB_TYPES = new Set(['n8n-nodes-base.httpRequest', 'n8n-nodes-base.executeWorkflow', 'n8n-nodes-base.wait', 'n8n-nodes-base.respondToWebhook', 'n8n-nodes-base.webhook', 'n8n-nodes-base.executeWorkflowTrigger'])
export const DISPARO = 'PRUEBA E110 · disparo (borrar)'

export function grabaciones(rutas) {
  return rutas.map((r) => { const e = JSON.parse(readFileSync(r, 'utf8')); return { id: String(e.id), runData: e.data.resultData.runData || {} } })
}
function corridas(datasets, nombre) {
  for (const d of datasets) {
    const runs = d.runData[nombre]
    if (!runs || !runs.length) continue
    const out = runs.map((r) => ((r.data || {}).main || [])[0] || null)
    if (out.some((x) => x === null)) continue   // el nodo murió en esa corrida (Load landscape_summary en 146661) · buscar en otra
    return { fuente: d.id, runs: out.map((items) => items.map((it) => ({ json: it.json, pairedItem: it.pairedItem ?? null }))) }
  }
  return null
}
const refsItem = (params) => [...new Set([...JSON.stringify(params).matchAll(/\$\('([^']+)'\)\.item\b/g)].map((m) => m[1]))]
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
// E111 · el cuerpo JSON de un nodo HTTP (`={ … {{ expr }} … }`) se evalúa en el sustituto con las MISMAS expresiones,
// como plantilla JS: cada `{{ expr }}` pasa a `${ expr }` y el resto queda literal. Así el sobre real se ve resuelto.
const plantillaCuerpo = (jsonBody) => {
  if (typeof jsonBody !== 'string' || !jsonBody.startsWith('=')) return null
  const partes = jsonBody.slice(1).split(/\{\{([\s\S]*?)\}\}/)
  let out = '`'
  for (let i = 0; i < partes.length; i++) out += i % 2 === 0 ? partes[i].replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') : '${' + partes[i] + '}'
  return out + '`'
}
const mezclar = (base, parche) => { const o = { ...base }; for (const [k, v] of Object.entries(parche || {})) o[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') ? mezclar(base[k], v) : v; return o }

// E118 · `mantener`: nodos que se dejan REALES aunque sean HTTP (p. ej. la reserva en Cal.com para una prueba real
// de reserva · declarada) · todo lo demás que cuesta o deja rastro sigue sustituido por lo grabado.
export function construirPrueba({ flujo, datasets, nombre, webhookPath, trigger, materia = null, parche = null, quitar = [], stubsExtra = [], mantener = [] }) {
  const quitarSet = new Set(quitar)
  const nodes = []
  const informe = []
  for (const n of flujo.nodes) {
    if (quitarSet.has(n.name)) { informe.push({ nodo: n.name, accion: 'QUITADO' }); continue }
    const esTrigger = n.name === trigger
    if (mantener.includes(n.name) && !esTrigger) { nodes.push(n); informe.push({ nodo: n.name, accion: 'REAL (mantenido · HTTP de verdad)', tipo: n.type.replace('n8n-nodes-base.', '') }); continue }
    if (!(STUB_TYPES.has(n.type) || stubsExtra.includes(n.name) || esTrigger)) { nodes.push(n); informe.push({ nodo: n.name, accion: 'REAL', tipo: n.type.replace('n8n-nodes-base.', '') }); continue }
    const g = corridas(datasets, n.name)
    const refs = refsItem(n.parameters)
    let jsCode, mode
    if (esTrigger) {
      if (!g) throw new Error(`disparador sin grabación: ${n.name}`)
      const item = JSON.parse(JSON.stringify(g.runs[0][0]))
      if (materia) { item.json.discovery_package = { ...(item.json.discovery_package || {}), materia_cliente: materia } }
      if (parche) { item.json = mezclar(item.json, parche) }
      jsCode = `// STUB E110 · disparador · lo grabado en ${g.fuente}${materia ? ' + materia_cliente inyectada (salida real del Transform de la prueba del alta)' : ''}${parche ? ' + parche ' + JSON.stringify(parche) : ''}\nreturn [${JSON.stringify({ json: item.json })}];`
      mode = undefined
    } else if (!g) {
      jsCode = `// STUB E110 · este nodo NO corrió en las grabaciones · si se alcanza, la prueba se desvió del camino grabado\nthrow new Error('PRUEBA E110 · nodo sin grabación alcanzado: ${esc(n.name)}');`
      mode = undefined
    } else if (refs.length || plantillaCuerpo(n.parameters.jsonBody)) {
      mode = 'runOnceForEachItem'
      const cuerpo = plantillaCuerpo(n.parameters.jsonBody)
      jsCode = [
        `// STUB E110 · por ítem · devuelve lo grabado en ${g.fuente} y evalúa las MISMAS referencias .item${cuerpo ? ' y el MISMO cuerpo JSON' : ''} del nodo original`,
        `const RUNS = ${JSON.stringify(g.runs)};`,
        `const REFS = ${JSON.stringify(refs)};`,
        'const r = RUNS[Math.min($runIndex, RUNS.length - 1)];',
        'const rec = r[Math.min($itemIndex, r.length - 1)];',
        `if (!rec) throw new Error('PRUEBA E110 · sin ítem grabado para ${esc(n.name)} · run ' + $runIndex + ' · item ' + $itemIndex);`,
        'const resueltos = {};',
        "for (const ref of REFS) { const it = $(ref).item; resueltos[ref] = (it && it.json) ? (it.json.client_id || Object.keys(it.json).slice(0, 4).join('+')) : 'VACIO'; }",
        cuerpo ? `const _cuerpoTxt = ${cuerpo};\nlet cuerpo; try { cuerpo = JSON.parse(_cuerpoTxt); } catch (e) { cuerpo = { _no_es_json: _cuerpoTxt.slice(0, 2000) }; }` : 'const cuerpo = null;',
        `return { json: Object.assign({}, rec.json, { _prueba_e110: { nodo: ${JSON.stringify(n.name)}, run: $runIndex, item: $itemIndex, resueltos, cuerpo } }) };`,
      ].join('\n')
    } else {
      mode = undefined
      jsCode = [
        `// STUB E110 · todos los ítems · devuelve lo grabado en ${g.fuente} con su pairedItem`,
        `const RUNS = ${JSON.stringify(g.runs)};`,
        'const r = RUNS[Math.min($runIndex, RUNS.length - 1)];',
        'return r.map((it, i) => ({ json: it.json, pairedItem: it.pairedItem === null ? { item: 0 } : it.pairedItem }));',
      ].join('\n')
    }
    const stub = { id: n.id, name: n.name, type: 'n8n-nodes-base.code', typeVersion: 2, position: n.position, parameters: mode ? { mode, jsCode } : { jsCode }, notes: `STUB E110 · era ${n.type}` }
    nodes.push(stub)
    informe.push({ nodo: n.name, accion: esTrigger ? 'STUB-DISPARADOR' : 'STUB', era: n.type.replace('n8n-nodes-base.', ''), fuente: g ? g.fuente : null, runs: g ? g.runs.length : 0, items: g ? g.runs.map((r) => r.length).join(',') : '-', refs, modo: mode || 'allItems' })
  }
  const stubbed = new Set(informe.filter((i) => i.accion.startsWith('STUB')).map((i) => i.nodo))
  const connections = {}
  for (const [from, o] of Object.entries(flujo.connections)) {
    if (quitarSet.has(from)) continue
    const main = (o.main || []).map((outs) => (outs || []).filter((c) => !quitarSet.has(c.node)))
    connections[from] = { main: stubbed.has(from) ? [main[0] || []] : main }   // un sustituto tiene UNA salida: se cae la rama de error
  }
  const disparo = { id: 'prueba-e110-disparo', name: DISPARO, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: randomUUID(), parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'onReceived', options: {} } }
  nodes.unshift(disparo)
  connections[DISPARO] = { main: [[{ node: trigger, type: 'main', index: 0 }]] }
  const settings = { executionOrder: flujo.settings?.executionOrder || 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', saveExecutionProgress: true, saveManualExecutions: true }
  return { flujo: { name: nombre, nodes, connections, settings }, informe }
}

// ── CLI ──  node construir-prueba.mjs <flujo.json> <salida.json> <nombre> <webhookPath> <trigger> <grab1,grab2> [--materia f] [--quitar a|b] [--stubs a|b]
if (process.argv[1] && process.argv[1].endsWith('construir-prueba.mjs')) {
  const [, , fl, out, nombre, webhookPath, trigger, grabs, ...rest] = process.argv
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null }
  const materia = opt('--materia') ? JSON.parse(readFileSync(opt('--materia'), 'utf8')) : null
  const parche = opt('--parche') ? JSON.parse(opt('--parche')) : null   // E111 · se mezcla en el json del disparador (p. ej. {"body":{"forzar":true}})
  const quitar = opt('--quitar') ? opt('--quitar').split('|') : []
  const stubsExtra = opt('--stubs') ? opt('--stubs').split('|') : []
  const mantener = opt('--mantener') ? opt('--mantener').split('|') : []   // E118 · nodos HTTP que se dejan reales (declarados)
  const { flujo, informe } = construirPrueba({ flujo: JSON.parse(readFileSync(fl, 'utf8')), datasets: grabaciones(grabs.split(',')), nombre, webhookPath, trigger, materia, parche, quitar, stubsExtra, mantener })
  writeFileSync(out, JSON.stringify(flujo, null, 2) + '\n')
  writeFileSync(out.replace(/\.json$/, '.informe.json'), JSON.stringify(informe, null, 2) + '\n')
  const st = informe.filter((i) => i.accion.startsWith('STUB')), re = informe.filter((i) => i.accion === 'REAL'), q = informe.filter((i) => i.accion === 'QUITADO')
  console.log(`prueba «${nombre}» · nodos ${flujo.nodes.length} · reales ${re.length} · sustitutos ${st.length} (con grabación ${st.filter((s) => s.fuente).length} · sin grabación ${st.filter((s) => !s.fuente && s.accion === 'STUB').length} · por ítem ${st.filter((s) => s.modo === 'runOnceForEachItem').length}) · quitados ${q.length}`)
  for (const s of st.filter((s) => s.modo === 'runOnceForEachItem')) console.log(`   por ítem · ${s.nodo} · ${s.fuente} · runs ${s.runs} · items ${s.items} · .item→ ${s.refs.join(', ')}`)
}
