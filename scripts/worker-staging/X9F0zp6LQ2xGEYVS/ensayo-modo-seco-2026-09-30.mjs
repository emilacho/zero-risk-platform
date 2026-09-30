// ENSAYO DEL MODO SECO DE PLANEACIÓN · CC#1 · 2026-09-30 · US$ 0.   node ensayo-modo-seco-2026-09-30.mjs [--salida=dir] [--desde=json]
// Pensado para NO poder gastar ni escribir aunque el interruptor estuviera roto:
//   ETAPA 1 · prueba con el motor de expresiones de n8n (un flujo mínimo con un nodo «Set») de que el cuerpo que recibe el redactor LLEVA `dry_run` (true / false explícito).
//   ETAPA 2 · copia COMPLETA de la construida (sólo cambian el path del webhook y las URL de los nodos que ESCRIBEN o AVISAN, que apuntan a un sumidero inexistente: si el interruptor
//             fallara, aparecerían ALCANZADOS en la ejecución y no escribirían nada). El redactor va con su URL real: sólo puede recibir dry_run:true si la etapa 1 lo probó.
//   Contadores de la base ANTES y DESPUÉS: filas de plan, invocaciones con costo, eventos de la sala.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const REF = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https:\/\/([^.]+)\..*$/, '$1')
const arg = (p) => (process.argv.find((a) => a.startsWith(p)) || '').slice(p.length)
const salida = arg('--salida=') || join(process.cwd(), 'salida-ensayo-modo-seco')
fs.mkdirSync(salida, { recursive: true })
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const desde = arg('--desde=') || join(aqui, 'planeacion-construida-modo-seco-2026-09-30.json')
const construida = JSON.parse(fs.readFileSync(desde, 'utf8'))
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const espera = (ms) => new Promise((s) => setTimeout(s, ms))
const sql = async (q) => (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json())
const crear = async (f) => { const r = await (await fetch(`${N8N}/api/v1/workflows`, { method: 'POST', headers: H, body: JSON.stringify(f) })).json(); if (!r.id) throw new Error('no se creó: ' + JSON.stringify(r).slice(0, 300)); await fetch(`${N8N}/api/v1/workflows/${r.id}/activate`, { method: 'POST', headers: H }); await espera(3000); return r.id }
const desactivar = (id) => fetch(`${N8N}/api/v1/workflows/${id}/deactivate`, { method: 'POST', headers: H })
const disparar = (path, body) => fetch(`${N8N}/webhook/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
async function esperarFin(wid, previos, max = 90) {
  for (let i = 0; i < max; i++) {
    await espera(8000)
    const l = (await (await fetch(`${N8N}/api/v1/executions?workflowId=${wid}&limit=5`, { headers: H })).json()).data || []
    const nueva = l.find((e) => !previos.has(e.id))
    if (nueva && !['running', 'waiting', 'new'].includes(nueva.status)) return nueva
  }
  return null
}
const detalle = async (id) => (await (await fetch(`${N8N}/api/v1/executions/${id}?includeData=true`, { headers: H })).json())
const corridas = (d) => d.data.resultData.runData

// ── ETAPA 1 · el motor de expresiones de n8n ─────────────────────────────────────────────────────────────────────────────────────────
const pedir = construida.nodes.find((n) => n.name === 'Pedir el plan al redactor')
const setNodo = {
  parameters: { mode: 'manual', assignments: { assignments: [{ id: 'a1', name: 'cuerpo_del_redactor', type: 'string', value: pedir.parameters.jsonBody }] }, options: {} },
  name: 'expresion', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [300, 0],
}
const wf1 = await crear({
  name: 'CC1 · prueba de la expresión del redactor TEMPORAL (se borra)',
  nodes: [
    { parameters: { httpMethod: 'POST', path: 'zero-risk/expresion-seco-cc1', responseMode: 'onReceived', options: {} }, name: 'Webhook · planeacion', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'expresion-seco-cc1-0001' },
    { parameters: { jsCode: "return [{ json: { pedido: 'P', cliente_id: 'c1' } }]" }, name: 'entrada', type: 'n8n-nodes-base.code', typeVersion: 2, position: [150, 0] },
    setNodo,
  ],
  connections: { 'Webhook · planeacion': { main: [[{ node: 'entrada', type: 'main', index: 0 }]] }, entrada: { main: [[{ node: 'expresion', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
})
const etapa1 = {}
for (const [nombre, body] of [['dry_run_true', { client_id: CID, dry_run: true }], ['dry_run_false', { client_id: CID, dry_run: false }], ['sin_dry_run', { client_id: CID }]]) {
  const previos = new Set(((await (await fetch(`${N8N}/api/v1/executions?workflowId=${wf1}&limit=20`, { headers: H })).json()).data || []).map((e) => e.id))
  await disparar('zero-risk/expresion-seco-cc1', body)
  const ex = await esperarFin(wf1, previos, 15)
  if (!ex) { etapa1[nombre] = { error: 'no terminó' }; continue }
  const d = await detalle(ex.id)
  const salidaSet = corridas(d).expresion?.[0]?.data?.main?.[0]?.[0]?.json
  const cuerpo = salidaSet ? JSON.parse(salidaSet.cuerpo_del_redactor) : null
  etapa1[nombre] = { estado: d.status, tiene_dry_run: cuerpo ? Object.prototype.hasOwnProperty.call(cuerpo, 'dry_run') : null, dry_run: cuerpo ? cuerpo.dry_run : null, agente: cuerpo && cuerpo.agent }
}
await desactivar(wf1); await fetch(`${N8N}/api/v1/workflows/${wf1}`, { method: 'DELETE', headers: H })
fs.writeFileSync(join(salida, 'etapa1-expresion-de-n8n.json'), JSON.stringify(etapa1, null, 1))
console.log('ETAPA 1 · lo que n8n evalúa como cuerpo del redactor:', JSON.stringify(etapa1))
if (!(etapa1.dry_run_true?.dry_run === true && etapa1.dry_run_false?.dry_run === false && etapa1.sin_dry_run?.dry_run === false && etapa1.sin_dry_run?.tiene_dry_run === true)) {
  console.log('🔴 ETAPA 1 NO PASÓ · no sigo (el redactor podría pagar)'); process.exit(3)
}

// ── ETAPA 2 · la copia completa con sumideros ─────────────────────────────────────────────────────────────────────────────────────────
const SUMIDERO = 'https://n8n-production-72be.up.railway.app/webhook/zero-risk/sumidero-cc1-no-existe'
const ESCRIBEN = ['Guardar el plan', 'Plan → Drive (PDF)', 'Cable de vuelta · sala', 'Cable de vuelta · repetida', 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', '⑥ AVISO · #alertas', 'Campana · plan sin PDF']
const copia = JSON.parse(JSON.stringify({ name: 'CC1 · prueba del modo seco de planeación TEMPORAL (NO BORRAR hasta que CC#3 certifique)', nodes: construida.nodes, connections: construida.connections }))
copia.settings = Object.fromEntries(SETTINGS_OK.filter((k) => construida.settings?.[k] !== undefined).map((k) => [k, construida.settings[k]]))
const wh = copia.nodes.find((n) => n.name === 'Webhook · planeacion'); wh.parameters.path = 'zero-risk/planeacion-seco-cc1'; wh.webhookId = 'planeacion-seco-cc1-0001'
const sumidero = []
for (const n of copia.nodes.filter((x) => ESCRIBEN.includes(x.name))) {
  if (typeof n.parameters.url !== 'string') throw new Error('el nodo ' + n.name + ' no tiene url')
  n.parameters.url = SUMIDERO; sumidero.push(n.name)
}
if (sumidero.length !== ESCRIBEN.length) throw new Error('no encontré todos los nodos que escriben: ' + sumidero.join(','))
const wf2 = await crear(copia)
console.log('ETAPA 2 · copia', wf2, '· sumidero en', sumidero.length, 'nodos')
const contadores = async (desdeTs) => {
  const [planes] = await sql(`select count(*)::int as n from client_historical_outputs where client_id='${CID}' and output_type='campaign_plan_90d'`)
  const [conCosto] = await sql(`select count(*)::int as n from agent_invocations where client_id='${CID}' and cost_usd > 0 and created_at > '${desdeTs}'`)
  const [sala] = await sql(`select count(*)::int as n from sala_event_log where created_at > '${desdeTs}'`)
  return { planes_del_cliente: planes?.n, invocaciones_con_costo_desde_el_inicio: conCosto?.n, eventos_de_sala_desde_el_inicio: sala?.n }
}
const t0 = new Date().toISOString()
const antes = await contadores(t0)
const resultados = {}
const casos = [
  ['seco_sin_forzar', { client_id: CID, dry_run: true }], // NO forzar: con plan previo, ANTES habría avisado a #alertas y a la sala
  ['seco_forzado', { client_id: CID, dry_run: true, forzar: true, force_restart: true }],
  ['dry_run_string', { client_id: CID, dry_run: 'true' }], // debe DETENERSE en la guarda, antes de cualquier brazo
]
for (const [nombre, body] of casos) {
  const previos = new Set(((await (await fetch(`${N8N}/api/v1/executions?workflowId=${wf2}&limit=20`, { headers: H })).json()).data || []).map((e) => e.id))
  await disparar('zero-risk/planeacion-seco-cc1', body)
  const ex = await esperarFin(wf2, previos, nombre === 'dry_run_string' ? 10 : 60)
  if (!ex) { resultados[nombre] = { estado: 'no terminó a tiempo' }; continue }
  const d = await detalle(ex.id)
  fs.writeFileSync(join(salida, `ejecucion-${nombre}-${ex.id}.json`), JSON.stringify(d))
  const rd = corridas(d)
  const j = (n) => rd[n]?.[0]?.data?.main?.[0]?.[0]?.json
  const seco = j('⑤ Seco · lo que se habría escrito')
  resultados[nombre] = {
    ejecucion: ex.id, estado: d.status, error: d.data.resultData.error?.message?.slice(0, 160) || null, ultimo_nodo: d.data.resultData.lastNodeExecuted,
    nodos_ejecutados: Object.keys(rd).length,
    llego_a_los_brazos: !!rd['Brazo · PostHog'], llego_al_redactor: !!rd['Pedir el plan al redactor'],
    interruptor_seco: rd['⑤ ¿Modo seco?'] ? { salida_verdadera: (rd['⑤ ¿Modo seco?'][0].data.main[0] || []).length, salida_falsa: (rd['⑤ ¿Modo seco?'][0].data.main[1] || []).length } : null,
    cierre_en_seco: seco ? { seco: seco.seco, escrituras_reales: seco.escrituras_reales, bloque: seco.la_vuelta_del_redactor?.bloque_de_lo_que_no_se_busco, descartados_declarados: seco.la_vuelta_del_redactor?.descartados_declarados } : null,
    texto_simulado: /DRY_RUN/.test(String(j('¿Llegó la vuelta?')?.texto || '')),
    nodos_que_escriben_o_avisan_ALCANZADOS: ESCRIBEN.filter((n) => rd[n]),
    aviso_por_repetida_alcanzado: !!(rd['⑥ Armar el aviso'] || rd['⑥ NO se corrió · repetida']),
  }
}
await desactivar(wf2)
const despues = await contadores(t0)
const resumen = { workflow_temporal: wf2, contadores_antes: antes, contadores_despues: despues, resultados }
fs.writeFileSync(join(salida, 'resumen-ensayo-modo-seco.json'), JSON.stringify(resumen, null, 1))
console.log(JSON.stringify(resumen, null, 1))
