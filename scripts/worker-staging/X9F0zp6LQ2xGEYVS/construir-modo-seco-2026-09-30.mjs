// PLANEACIÓN · EL MODO SECO LLEGA DE VERDAD A TODO EL FLUJO · CC#1 · 2026-09-30 · decisión de Emilio (mismo patrón que el flujo del brief).
//
// EL AGUJERO (medido 30-sep): el flujo real de planeación sólo mandaba `dry_run` a los TRES BRAZOS. El redactor (paga), «Guardar el plan» (escribe), «Plan → Drive»
// (sube), la sala (cable) y los avisos NO lo respetaban: un «ensayo seco» pagaba al redactor y escribía el plan. Costó dos días.
//
// LO QUE SE CONSTRUYE (sobre la foto del flujo vivo `planeacion-antes-modo-seco-2026-09-30.json` · v a9fb9ebd · lista cerrada):
//   ① «① GUARDA» valida `dry_run` del sobre: AUSENTE ⇒ corre real como hoy (la sala NO lo manda y no se le rompe nada) · `true`/`false` booleanos ⇒ se respetan ·
//      cualquier OTRA cosa ("true", 1, null…) ⇒ la corrida SE DETIENE ANTES DE GASTAR: un valor que parece seco y no lo es pagaría creyendo que no (lección 28-sep).
//      🔴 A diferencia del brief NO se exige explícito: el despachador de la sala no manda `dry_run` en absoluto y exigirlo rompería las planeaciones reales.
//   ② «Pedir el plan al redactor» manda `dry_run` SIEMPRE explícito (true o false, nunca ausente) al nodo que paga.
//   ③ «⑤ ¿Modo seco?» (nuevo) va DESPUÉS de «¿Llegó la vuelta?» y ANTES de todo lo que escribe: verdadero ⇒ «⑤ Seco · lo que se habría escrito» (nuevo, terminal, no toca nada);
//      falso ⇒ «¿Hay plan?» como siempre.
//   ④ «⑥ IF · ¿corrida repetida?» ya no manda la rama de aviso (Slack + sala) cuando es seco: un ensayo NUNCA avisa a nadie ni escribe en la sala.
//
//   node construir-modo-seco-2026-09-30.mjs   → escribe `planeacion-construida-modo-seco-2026-09-30.json` (NO toca n8n)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const GUARDA = '① GUARDA · sin manual aprobado se DETIENE'
export const PEDIR = 'Pedir el plan al redactor'
export const VUELTA = '¿Llegó la vuelta?'
export const HAY_PLAN = '¿Hay plan?'
export const REPETIDA = '⑥ IF · ¿corrida repetida?'
export const SECO_IF = '⑤ ¿Modo seco?'
export const SECO_CIERRE = '⑤ Seco · lo que se habría escrito'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

/** el sobre del webhook · lo lee todo el que decide seco/real, siempre igual */
const SOBRE = `$('Webhook · planeacion').first().json.body`

// ① la guarda valida dry_run
export const GUARDA_VIEJO = `const cid = $('Webhook · planeacion').first().json.body.client_id;
if (!cid) { throw new Error('PLANEACION_SIN_CLIENTE · falta client_id en el sobre'); }
`
export const GUARDA_NUEVO = `const cid = $('Webhook · planeacion').first().json.body.client_id;
if (!cid) { throw new Error('PLANEACION_SIN_CLIENTE · falta client_id en el sobre'); }
// 🔴 EL MODO SECO (2026-09-30 · decisión de Emilio) · \`dry_run\` del sobre: AUSENTE ⇒ corre real como hoy (el despachador de la sala NO lo manda) ·
// booleano ⇒ se respeta · CUALQUIER OTRA COSA ("true", 1, null…) ⇒ la corrida SE DETIENE ANTES DE GASTAR: un valor que parece seco y no lo es
// pagaría al redactor creyendo que no (lección 28-sep: una prueba «gratis» cobró US$ 0,37).
const dryDelSobre = $('Webhook · planeacion').first().json.body.dry_run;
if (dryDelSobre !== undefined && typeof dryDelSobre !== 'boolean') {
  throw new Error('PLANEACION_DRY_RUN_INVALIDO · dry_run del sobre debe ser true o false (booleano) o no venir · llegó ' + JSON.stringify(dryDelSobre) + ' (' + typeof dryDelSobre + ') · se DETIENE antes de gastar: un valor que parece seco y no lo es pagaría al redactor');
}
`

// ② el nodo que paga manda dry_run explícito
export const PEDIR_VIEJO = "JSON.stringify({ agent: 'campaign-brief-agent',"
export const PEDIR_NUEVO = `JSON.stringify({ dry_run: ((${SOBRE} || {}).dry_run === true), agent: 'campaign-brief-agent',`

// ④ la rama de aviso de «corrida repetida» no sale en seco
export const REPETIDA_CONDICION = {
  leftValue: `={{ (${SOBRE} || {}).dry_run !== true }}`,
  rightValue: true,
  operator: { type: 'boolean', operation: 'true', singleValue: true },
}

// ③ el interruptor y su cierre
const CODIGO_SECO = `// ⑤ SECO · LO QUE SE HABRÍA ESCRITO · CC#1 · 2026-09-30. En modo seco NADA se escribe, ni se sube, ni se avisa: ni la tabla, ni Drive, ni la sala, ni el aviso, ni el parte.
// Llega hasta acá con el MISMO camino que el real (ficha · manual · brazos · junta · derivador · pedido al redactor · espera · vuelta) y aquí sólo se DECLARA lo que habría pasado.
const v = $input.first().json || {}
const sobre = $('Webhook · planeacion').first().json.body || {}
if (!v.llego_la_vuelta) {
  throw new Error('PLANEACION_SECO_SIN_VUELTA · en el ensayo la vuelta del redactor NO llegó (' + String(v.motivo || 'sin motivo') + ') · en modo real esto habría terminado en aviso, no en plan')
}
const texto = String(v.texto || '')
return [{
  json: {
    seco: true,
    escrituras_reales: 0,
    no_se_escribio_en: ['client_historical_outputs (Guardar el plan)', 'Drive (texto-a-drive)', 'la sala (SALA_CALLBACK_URL · cable de vuelta)', 'el parte del brief (sobre plan-listo)', '#alertas (avisos)'],
    dry_run_enviado_al_nodo_que_paga: true,
    client_id: v.client_id || sobre.client_id || null,
    la_vuelta_del_redactor: { llego: !!v.llego_la_vuelta, caracteres: v.caracteres, bloque_de_lo_que_no_se_busco: texto.indexOf('## Lo que NO se buscó y por qué') !== -1, descartados_declarados: v.descartados_declarados === undefined ? null : v.descartados_declarados },
    habria_guardado: { tabla: 'client_historical_outputs', output_type: 'campaign_plan_90d', status: 'draft', largo_del_plan: texto.length },
    habria_subido_a_drive: { nombre_de_cliente: v.client_name || null, largo_del_texto: texto.length },
    habria_avisado_a_la_sala: { event_type: 'run_completed', worker_name: 'planeacion' },
    forzar_recibido: sobre.forzar === true,
  },
}]
`

export function construir(flujo) {
  const nodo = (n) => { const x = flujo.nodes.find((k) => k.name === n); if (!x) throw new Error(`no encontré «${n}»`); return x }
  if (flujo.nodes.some((n) => n.name === SECO_IF)) throw new Error('ya está construido')
  const cuenta = (code, viejo, quien) => { const c = code.split(viejo).length - 1; if (c !== 1) throw new Error(`${quien}: «${viejo.slice(0, 50)}…» aparece ${c} veces, esperaba 1`) }

  const g = nodo(GUARDA)
  cuenta(g.parameters.jsCode, GUARDA_VIEJO, GUARDA)
  const guarda = { ...g, parameters: { ...g.parameters, jsCode: g.parameters.jsCode.replace(GUARDA_VIEJO, () => GUARDA_NUEVO) } }

  const p = nodo(PEDIR)
  cuenta(p.parameters.jsonBody, PEDIR_VIEJO, PEDIR)
  const pedir = { ...p, parameters: { ...p.parameters, jsonBody: p.parameters.jsonBody.replace(PEDIR_VIEJO, () => PEDIR_NUEVO) } }

  const r = nodo(REPETIDA)
  const conds = r.parameters.conditions.conditions
  if (conds.length !== 2) throw new Error(`${REPETIDA}: esperaba 2 condiciones, hay ${conds.length}`)
  const repetida = { ...r, parameters: { ...r.parameters, conditions: { ...r.parameters.conditions, conditions: [...conds, { ...REPETIDA_CONDICION, id: 'no-es-seco' }] } } }

  const vuelta = nodo(VUELTA)
  const [x, y] = vuelta.position
  const seco_if = {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [{ id: 'es-seco', leftValue: `={{ (${SOBRE} || {}).dry_run === true }}`, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      },
    },
    name: SECO_IF, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x + 110, y + 260],
  }
  const seco_cierre = { parameters: { jsCode: CODIGO_SECO }, name: SECO_CIERRE, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x + 330, y + 260] }

  const connections = JSON.parse(JSON.stringify(flujo.connections))
  // «¿Llegó la vuelta?» → «⑤ ¿Modo seco?» (antes iba directo a «¿Hay plan?»)
  const hijos = connections[VUELTA]?.main?.[0]
  if (!hijos || hijos.length !== 1 || hijos[0].node !== HAY_PLAN) throw new Error('«¿Llegó la vuelta?» ya no va sólo a «¿Hay plan?» · el flujo cambió desde la foto')
  connections[VUELTA] = { main: [[{ node: SECO_IF, type: 'main', index: 0 }]] }
  connections[SECO_IF] = { main: [[{ node: SECO_CIERRE, type: 'main', index: 0 }], [{ node: HAY_PLAN, type: 'main', index: 0 }]] } // 0 = verdadero (seco) · 1 = falso (real)

  const reemplazos = { [GUARDA]: guarda, [PEDIR]: pedir, [REPETIDA]: repetida }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: [...flujo.nodes.map((n) => reemplazos[n.name] || n), seco_if, seco_cierre], connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-modo-seco-2026-09-30.mjs')) {
  const vivo = JSON.parse(readFileSync(join(aqui, 'planeacion-antes-modo-seco-2026-09-30.json'), 'utf8'))
  const construido = construir(vivo)
  writeFileSync(join(aqui, 'planeacion-construida-modo-seco-2026-09-30.json'), JSON.stringify(construido, null, 2) + '\n')
  console.log('construida ·', construido.nodes.length, 'nodos (+2) · 3 parches (GUARDA · Pedir el plan · corrida repetida) + interruptor y cierre en seco')
}
