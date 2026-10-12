// ENSAYO EN SECO · PLAN DE 90 DÍAS v2 de un cliente · CC#1 · 2026-10-12 · US$ 0 · obligatorio ANTES de la corrida real (FIRMA-EMILIO «plan v2»).
//   node ensayo-plan-v2-seco-2026-10-12.mjs <client_id> [--salida=dir]
// Es una COPIA TEMPORAL del flujo vivo `X9F0zp6LQ2xGEYVS` (misma técnica del ensayo del 30-sep): cambia SOLO tres cosas: otro path/nombre de webhook sin la llave de despacho (la llave solo la tiene la sala),
// el redactor recibe `dry_run:true` (el corredor contesta su respuesta canónica · US$ 0; ya viene así del vivo) y se corta la salida de «⑤ ¿Modo seco?» hacia «¿Hay plan?» (nada se guarda, no sube a Drive, no avisa).
// Lo demás es el código vivo: ficha, manual (la versión más reciente), guarda, brazos (dry_run), junta, derivador, redactor (armado del pedido con el bloque «plan a primer nivel»), espera y «¿Llegó la vuelta?» con `revisarPlan`.
// Se EJERCE el camino y el pedido; no la calidad del redactor (respuesta simulada). La copia queda DESACTIVADA al terminar (y se borra con --borrar).
import fs from 'node:fs'
import { join } from 'node:path'
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL.replace(/\/$/, ''), H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const CID = process.argv[2]
if (!/^[0-9a-f-]{36}$/i.test(CID ?? '')) { console.error('uso: ensayo-plan-v2-seco-2026-10-12.mjs <client_id>'); process.exit(1) }
const arg = (p) => (process.argv.find((a) => a.startsWith(p)) || '').slice(p.length)
const salida = arg('--salida=') || join(process.cwd(), 'salida-ensayo-plan-v2'); fs.mkdirSync(salida, { recursive: true })

const vivo = await (await fetch(`${N8N}/api/v1/workflows/X9F0zp6LQ2xGEYVS`, { headers: H })).json()
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const copia = JSON.parse(JSON.stringify({ name: 'CC1 · ensayo en seco del plan v2 TEMPORAL (se puede borrar)', nodes: vivo.nodes, connections: vivo.connections }))
copia.settings = Object.fromEntries(SETTINGS_OK.filter((k) => vivo.settings?.[k] !== undefined).map((k) => [k, vivo.settings[k]]))
const wh = copia.nodes.find((n) => n.name === 'Webhook · planeacion')
wh.parameters.path = 'zero-risk/planeacion-seco-plan-v2-cc1'; wh.webhookId = 'planeacion-seco-plan-v2-cc1-0001'
// ① sin la llave de despacho (la copia no gasta: el redactor va en seco y nada se escribe)
const llave = copia.nodes.find((n) => n.name.startsWith('⓪'))
const siguiente = copia.connections[llave.name].main[0][0].node
copia.connections['Webhook · planeacion'] = { main: [[{ node: siguiente, type: 'main', index: 0 }]] }
// ② el redactor DEBE ir en seco: se comprueba, no se supone
const pedir = copia.nodes.find((n) => n.name === 'Pedir el plan al redactor')
if (!pedir.parameters.jsonBody.includes("dry_run: (($('Webhook · planeacion').first().json.body || {}).dry_run === true)")) throw new Error('el redactor del vivo no recibe dry_run del sobre: no se ensaya')
// ③ corte: nada se guarda ni sube ni avisa (la salida «real» de ⑤)
const modo = copia.connections['⑤ ¿Modo seco?']
copia.connections['⑤ ¿Modo seco?'] = { main: [modo.main[0], []] }
const r = await (await fetch(`${N8N}/api/v1/workflows`, { method: 'POST', headers: H, body: JSON.stringify(copia) })).json()
if (!r.id) throw new Error('no se creó: ' + JSON.stringify(r).slice(0, 300))
console.log('copia temporal', r.id)
await fetch(`${N8N}/api/v1/workflows/${r.id}/activate`, { method: 'POST', headers: H })
await new Promise((s) => setTimeout(s, 3000))
const t0 = Date.now()
const disp = await fetch(`${N8N}/webhook/zero-risk/planeacion-seco-plan-v2-cc1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: CID, dry_run: true, forzar: true, force_restart: true }) })
console.log('disparo (seco)', disp.status)
let ex = null
for (let i = 0; i < 90; i++) {
  await new Promise((s) => setTimeout(s, 10000))
  const l = (await (await fetch(`${N8N}/api/v1/executions?workflowId=${r.id}&limit=3`, { headers: H })).json()).data || []
  if (l[0] && !['running', 'waiting', 'new'].includes(l[0].status)) { ex = l[0]; break }
}
await fetch(`${N8N}/api/v1/workflows/${r.id}/deactivate`, { method: 'POST', headers: H })
if (!ex) { console.log(JSON.stringify({ workflow_temporal: r.id, resultado: 'no terminó a tiempo' })); process.exit(2) }
const d = await (await fetch(`${N8N}/api/v1/executions/${ex.id}?includeData=true`, { headers: H })).json()
fs.writeFileSync(join(salida, `ejecucion-plan-v2-seco-${ex.id}.json`), JSON.stringify(d))
const rd = d.data.resultData.runData
const items = (n) => (rd[n] || []).flatMap((run) => (run.data?.main || []).flat().map((x) => x?.json)).filter(Boolean)
const nodosEjecutados = Object.keys(rd)
const sec = items('⑤ Seco · lo que se habría escrito')[0] || null
const red = items('Redactor (B4)')[0] || {}
const vuelta = items('¿Llegó la vuelta?')[0] || {}
const guarda = items('① GUARDA · sin manual aprobado se DETIENE')[0] || {}
fs.writeFileSync(join(salida, 'pedido-al-redactor.txt'), String(red.pedido || ''))
const resumen = {
  workflow_temporal: r.id, ejecucion: ex.id, estado: d.status, segundos: Math.round((Date.now() - t0) / 1000), error: d.data.resultData.error?.message || null, ultimo_nodo: d.data.resultData.lastNodeExecuted,
  llego_al_seco: !!sec, escrituras_reales: sec?.escrituras_reales ?? null,
  nodos_que_escriben_ejecutados: nodosEjecutados.filter((n) => /Guardar el plan|Plan → Drive|Cable de vuelta|BRIEF · sobre|AVISO|Campana/.test(n)),
  manual: { version: guarda.version ?? guarda.manual_version ?? null, claves_de_la_guarda: Object.keys(guarda).slice(0, 25) },
  ficha_sin_topes: { claves_quitadas: red.claves_internas_quitadas_de_la_ficha ?? null, spend_cap_en_el_pedido: /spend_cap/i.test(String(red.pedido || '')) },
  pedido: { caracteres: String(red.pedido || '').length, tiene_plan_a_primer_nivel: /EL PLAN A PRIMER NIVEL/.test(String(red.pedido || '')) },
  contexto_chequeo: red.contexto_chequeo ?? null,
  registro: red.registro_usado ?? null,
  vuelta: { llego: vuelta.llego_la_vuelta ?? null, caracteres: vuelta.caracteres ?? null, chequeo_del_plan: vuelta.chequeo_del_plan ?? null, motivo: vuelta.motivo ?? null },
}
fs.writeFileSync(join(salida, 'resumen-ensayo.json'), JSON.stringify(resumen, null, 1))
console.log(JSON.stringify(resumen, null, 1).slice(0, 5000))
if (process.argv.includes('--borrar')) await fetch(`${N8N}/api/v1/workflows/${r.id}`, { method: 'DELETE', headers: H })
