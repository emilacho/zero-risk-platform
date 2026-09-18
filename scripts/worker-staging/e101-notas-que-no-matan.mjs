// E101 · UNA NOTA QUE NO DECIDE NADA NO PUEDE MATAR UNA CORRIDA.
//
// La tercera bolita (2026-09-18 · alta 141414 · US$ 0,46) murió en «[MODELB] Phase-boundary Emit ·
// onboarding_specialist_done»: una nota informativa al libro de la sala con tope de 5 s, sin onError y sin
// reintento. La puerta tardó 6 s (la nota SÍ quedó escrita 0,8 s después del corte) y el motor mató el alta.
//
// Qué hace este constructor, por nodo COSMÉTICO (anota · no decide · nadie lee su salida por nombre):
//   · tope 25 s (antes 5–20 s) · reintento ×2 con 3 s · onError = salida de error (la corrida SIGUE)
//   · un nodo «Nota perdida · <fase>» cuelga de esa salida de error: deja constancia, devuelve
//     {ok:false, code:'nota_perdida'} al mismo sucesor de siempre y le manda el aviso al AVISADOR que ya existe
//     (5fkPLbZvQsQa1bcd) por Execute Workflow sin esperar. En la cola vieja del alta (nodos que ningún disparador
//     alcanza) sólo se blinda el nodo (continuar) · no se cuelgan avisos de nodos que no corren.
//   · al avisador se le agrega una segunda entrada (Execute Workflow Trigger) que desemboca en «Armar el aviso»,
//     y el título distingue «SE PERDIÓ UNA NOTA · la corrida SIGUE» de «MURIÓ UNA CORRIDA».
// Qué NO toca: nada que decida o cuya salida lea otro nodo por nombre (E57 · sobre · Confirm barato · Persist
// Client · Notion · polls · lentes · juez · guardas).
//
// node scripts/worker-staging/e101-notas-que-no-matan.mjs   → escribe *-construida-e101.json en cada carpeta
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const AVISADOR_ID = '5fkPLbZvQsQa1bcd'
export const AVISAR = 'Avisar nota perdida → avisador'
export const TOPE_MS = 25000
export const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

/** los nodos que ANOTAN · si fallan, la corrida sigue */
export const COSMETICOS = {
  LyVoKcrypS5uLyuu: [
    '[MODELB] Phase-boundary Emit · reconciliación OBSERVE',
    '[MODELB] Phase-boundary Emit · onboarding_specialist_done',
    '[MODELB] Phase-boundary Emit · cliente_persisted',
    '[MODELB] Phase-boundary Emit · APIFY_WIRE',
    '[MODELB] Phase-boundary Emit · notion_workspace_created',
    '[MODELB] Phase-boundary Emit · success_plan_built',
    '[MODELB] Phase-boundary Emit · kickoff_scheduled',
    '[MODELB] Phase-boundary Emit · mc_inbox_notified',
    '[MODELB] Phase-boundary Emit · journey_completed',
    '[MODELB] Phase-boundary Emit · CASCADE',
    '[MODELB] Emit · cimiento.promoted',
    '[MODELB] Emit · cimiento.failed (honesto)',
    '[MODELB] Write-back Callback · run terminal',
    'Alert Slack: Onboarding Initiated',
    'AM Handoff → SALA event (am_handoff)',
  ],
  wu1DUAXIuEG5nNTX: [
    '[MODELB] Phase-boundary Emit · notion_workspace_created',
    '[MODELB] Phase-boundary Emit · success_plan_built',
    '[MODELB] Phase-boundary Emit · kickoff_scheduled',
    '[MODELB] Phase-boundary Emit · journey_completed',
    '[MODELB] Write-back Callback · run terminal',
    'Alert Slack: Onboarding Initiated',
  ],
}
/** nombrados y NO tocados · deciden o alguien lee su salida por nombre */
export const NO_SE_TOCAN = {
  LyVoKcrypS5uLyuu: ['E57 · sobre · pedir planeación a la sala', 'Confirm barato · competitor list', '[APIFY-WIRE] POST /api/hitl/queue (canon)', 'Persist Client to Supabase', 'Poll · Discovery Status', '[RD] Poll Status', 'Create Notion Client Workspace', 'Create Success Plan in Notion'],
  wu1DUAXIuEG5nNTX: ['Create Notion Client Workspace', 'Create Success Plan in Notion', 'Schedule Kickoff Call (Cal.com)'],
}

export const corto = (n) => n.replace(/^\[MODELB\] (Phase-boundary Emit · |Emit · |Write-back Callback · )/, '').replace(/^Alert Slack: /, 'slack · ').replace(/^AM Handoff.*/, 'am_handoff')
export const nombreNota = (n) => 'Nota perdida · ' + corto(n)

export const codigoNota = (nodo) => `// E101 (CC#3 2026-09-18) · una nota que no decide nada no puede matar la corrida.
// Este nodo cuelga de la SALIDA DE ERROR de «${nodo}» (tras 2 intentos y ${TOPE_MS / 1000} s de tope): la nota se perdió,
// la corrida SIGUE con {ok:false, code:'nota_perdida'} hacia el mismo sucesor de siempre, y queda constancia:
// el mismo ítem viaja al avisador (${AVISADOR_ID}) sin esperar · título «SE PERDIÓ UNA NOTA · la corrida SIGUE».
const base = String(($env && $env.N8N_BASE_URL) || 'https://n8n-production-72be.up.railway.app').replace(/\\/+$/, '');
const nodo = ${JSON.stringify(nodo)};
return $input.all().map((i) => {
  const e = (i.json && i.json.error) || {};
  const msg = String(typeof e === 'string' ? e : (e.message || e.description || (Object.keys(e).length ? JSON.stringify(e) : '') || 'sin mensaje')).slice(0, 400);
  const exId = String(($execution && $execution.id) || '?');
  const wfId = String(($workflow && $workflow.id) || '?');
  console.log('[nota-perdida] ' + nodo + ' · ' + msg + ' · la corrida SIGUE · corrida ' + exId);
  return { json: {
    ok: false, code: 'nota_perdida', nota_perdida: true, nodo, error: msg,
    execution: { id: exId, url: base + '/workflow/' + wfId + '/executions/' + exId, mode: ($execution && $execution.mode) || '?', lastNodeExecuted: nodo,
      error: { message: 'SE PERDIÓ UNA NOTA · la corrida SIGUE · ' + nodo + ' · ' + msg, node: { name: nodo } } },
    workflow: { id: wfId, name: ($workflow && $workflow.name) || '?' },
  } };
});`

/** nodos alcanzables desde los disparadores (webhook · executeWorkflowTrigger) · incluye salidas de error */
export function alcanzables(flujo) {
  const vistos = new Set()
  const pila = flujo.nodes.filter((n) => /webhook$|executeWorkflowTrigger|errorTrigger|scheduleTrigger|manualTrigger/.test(n.type) && !n.disabled).map((n) => n.name)
  while (pila.length) {
    const n = pila.pop()
    if (vistos.has(n)) continue
    vistos.add(n)
    for (const salida of flujo.connections[n]?.main ?? []) for (const x of salida ?? []) pila.push(x.node)
  }
  return vistos
}

export function blindar(flujo, id) {
  const lista = COSMETICOS[id]
  if (!lista) throw new Error(`sin lista de cosméticos para ${id}`)
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of lista) if (!byName.has(n)) throw new Error(`no encontré «${n}» en ${id}`)
  if (byName.has(AVISAR)) throw new Error(`${id} ya trae E101 · no construir dos veces`)
  // ninguno de los cosméticos puede ser leído por nombre por otro nodo (si lo es, DECIDE · no se toca)
  for (const c of lista) for (const n of flujo.nodes) {
    const t = JSON.stringify(n.parameters || {})
    if (t.includes(`$('${c}')`) || t.includes(`$("${c}")`)) throw new Error(`«${c}» lo lee por nombre «${n.name}» · no es cosmético · sacar de la lista`)
  }
  const vivos = alcanzables(flujo)
  const connections = JSON.parse(JSON.stringify(flujo.connections))
  const nodes = []
  const avisar = {
    id: 'e101-avisar-nota-perdida',
    name: AVISAR,
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1.2,
    position: [0, 0],
    parameters: { workflowId: { __rl: true, value: AVISADOR_ID, mode: 'id' }, options: { waitForSubWorkflow: false } },
    onError: 'continueRegularOutput',
    notes: 'E101 · reusa el avisador de errores (E73) · sin esperar · si el aviso falla, la corrida sigue igual.',
  }
  let conAviso = 0, soloBlindados = 0
  for (const n of flujo.nodes) {
    if (!lista.includes(n.name)) { nodes.push(n); continue }
    const p = JSON.parse(JSON.stringify(n.parameters || {}))
    p.options = p.options || {}
    p.options.timeout = Math.max(TOPE_MS, Number(p.options.timeout || 0))
    const vivo = vivos.has(n.name)
    const blindado = {
      ...n,
      parameters: p,
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 3000,
      onError: vivo ? 'continueErrorOutput' : 'continueRegularOutput',
      notes: ((n.notes || '') + `\nE101 · ANOTA, no decide: tope ${TOPE_MS / 1000} s · 2 intentos · si falla, la corrida SIGUE` + (vivo ? ' y «Nota perdida» avisa.' : ' (cola vieja · sin aviso).')).trim(),
    }
    nodes.push(blindado)
    if (!vivo) { soloBlindados++; continue }
    conAviso++
    const nota = {
      id: 'e101-nota-perdida-' + corto(n.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
      name: nombreNota(n.name),
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [n.position[0], n.position[1] + 180],
      parameters: { jsCode: codigoNota(n.name) },
      notes: 'E101 · cuelga de la salida de error del emisor · la corrida sigue · el aviso va al avisador.',
    }
    nodes.push(nota)
    const c = connections[n.name] || { main: [[]] }
    const exito = c.main?.[0] ?? []
    c.main = [exito, [{ node: nota.name, type: 'main', index: 0 }]]
    connections[n.name] = c
    connections[nota.name] = { main: [[...exito.map((x) => ({ ...x })), { node: AVISAR, type: 'main', index: 0 }]] }
  }
  if (conAviso) {
    const ref = byName.get(lista[0])
    avisar.position = [ref.position[0] + 300, ref.position[1] + 360]
    nodes.push(avisar)
  }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { cuerpo: { name: flujo.name, nodes, connections, settings }, conAviso, soloBlindados }
}

export const TRIGGER_NOTA = 'Nota perdida (desde un flujo vivo)'
export function avisadorConEntrada(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  if (byName.has(TRIGGER_NOTA)) throw new Error('el avisador ya trae E101')
  const armar = byName.get('Armar el aviso')
  if (!armar) throw new Error('falta «Armar el aviso»')
  const code = String(armar.parameters.jsCode)
  const a1 = "const e = $input.first().json || {};"
  const a2 = "titulo: 'MURIÓ UNA CORRIDA · ' +"
  if (!code.includes(a1) || !code.includes(a2)) throw new Error('«Armar el aviso» no tiene la forma esperada (df848663)')
  const nuevo = code
    .replace(a1, a1 + "\n// E101 · una nota perdida (la corrida SIGUE) llega por la segunda entrada · mismo freno, otro título.\nconst nota = e.nota_perdida === true;")
    .replace(a2, "titulo: (nota ? 'SE PERDIÓ UNA NOTA · la corrida SIGUE · ' : 'MURIÓ UNA CORRIDA · ') +")
    .replace('  suprimido: suprimido,\n', '  suprimido: suprimido,\n  nota_perdida: nota,\n')
  if (!nuevo.includes('nota_perdida: nota')) throw new Error('no pude anexar nota_perdida al aviso')
  const trigger = {
    id: 'e101-nota-perdida-trigger',
    name: TRIGGER_NOTA,
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1,
    position: [armar.position[0] - 260, armar.position[1] + 200],
    parameters: { inputSource: 'passthrough' },
    notes: 'E101 · segunda entrada: un flujo vivo perdió una nota que no decide nada · la corrida sigue · aquí queda constancia.',
  }
  const nodes = flujo.nodes.map((n) => (n.name === 'Armar el aviso' ? { ...n, parameters: { ...n.parameters, jsCode: nuevo } } : n))
  nodes.push(trigger)
  const connections = { ...flujo.connections, [TRIGGER_NOTA]: { main: [[{ node: 'Armar el aviso', type: 'main', index: 0 }]] } }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes, connections, settings }
}

const leer = (p) => JSON.parse(readFileSync(join(aqui, p), 'utf8'))
const escribir = (p, v) => writeFileSync(join(aqui, p), JSON.stringify(v, null, 2) + '\n')
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const alta = blindar(leer('LyVoKcrypS5uLyuu/alta-antes-e101-d1108e41.json'), 'LyVoKcrypS5uLyuu')
  escribir('LyVoKcrypS5uLyuu/alta-construida-e101.json', alta.cuerpo)
  console.log('alta ·', alta.cuerpo.nodes.length, 'nodos · con aviso', alta.conAviso, '· sólo blindados (cola vieja)', alta.soloBlindados)
  const sf = blindar(leer('wu1DUAXIuEG5nNTX/segunda-fase-antes-e101-55495be5.json'), 'wu1DUAXIuEG5nNTX')
  escribir('wu1DUAXIuEG5nNTX/segunda-fase-construida-e101.json', sf.cuerpo)
  console.log('segunda fase ·', sf.cuerpo.nodes.length, 'nodos · con aviso', sf.conAviso, '· sólo blindados', sf.soloBlindados)
  const av = avisadorConEntrada(leer('5fkPLbZvQsQa1bcd/avisador-antes-e101-df848663.json'))
  escribir('5fkPLbZvQsQa1bcd/avisador-construido-e101.json', av)
  console.log('avisador ·', av.nodes.length, 'nodos · +«' + TRIGGER_NOTA + '» → Armar el aviso')
}
