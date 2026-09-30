// ENSAYO EN SECO DE LA PLANEACIÓN · CC#1 · 2026-09-30 · US$ 0 · decisión de Emilio (analítica propia de cualquier cliente + bloque «Lo que NO se buscó»).
//   node ensayo-planeacion-seco-2026-09-30.mjs [--salida=dir]
// 🔴 POR QUÉ ES UNA COPIA Y NO EL FLUJO VIVO: el flujo real de planeación SÓLO manda `dry_run` a los brazos. El redactor, «Guardar el plan», Drive y la sala
// NO respetan el modo seco (medido 30-sep): dispararlo «en seco» pagaría al redactor y escribiría el plan. La copia temporal cambia SÓLO tres cosas:
//   ① «Pedir el plan al redactor» manda `dry_run:true` (el corredor contesta su respuesta canónica · US$ 0)
//   ② se corta la conexión «¿Llegó la vuelta?» → «¿Hay plan?»: NADA se guarda, no sube a Drive, no avisa a la sala
//   ③ otro path y nombre de webhook (no comparte puerta con el flujo real)
// Todo lo demás es el código vivo: ficha, manual, elegir brazos, los 3 brazos (PostHog contra el proyecto real, sólo lectura), junta, derivador, redactor (armado del pedido),
// espera, y «¿Llegó la vuelta?» con el bloque nuevo. Lo que se ejerce es el CAMINO y el TEXTO del plan, no la calidad del redactor (respuesta simulada).
import fs from 'node:fs'
import { join } from 'node:path'
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const salida = (process.argv.find((a) => a.startsWith('--salida=')) || '').slice(9) || join(process.cwd(), 'salida-ensayo-planeacion')
fs.mkdirSync(salida, { recursive: true })

// --desde=<json> ensaya una foto guardada (p. ej. la versión ANTES) en vez del flujo vivo · sirve para separar «ya estaba» de «lo introduje»
const desde = (process.argv.find((x) => x.startsWith('--desde=')) || '').slice(8)
const vivo = desde ? JSON.parse(fs.readFileSync(desde, 'utf8')) : await (await fetch(`${N8N}/api/v1/workflows/X9F0zp6LQ2xGEYVS`, { headers: H })).json()
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
const copia = JSON.parse(JSON.stringify({ name: 'CC1 · prueba de planeación TEMPORAL (NO BORRAR hasta que CC#3 certifique)', nodes: vivo.nodes, connections: vivo.connections }))
copia.settings = Object.fromEntries(SETTINGS_OK.filter((k) => vivo.settings?.[k] !== undefined).map((k) => [k, vivo.settings[k]]))
const wh = copia.nodes.find((n) => n.name === 'Webhook · planeacion')
wh.parameters.path = 'zero-risk/planeacion-prueba-cc1'; wh.webhookId = 'planeacion-prueba-cc1-0001'
const pedir = copia.nodes.find((n) => n.name === 'Pedir el plan al redactor')
const antes = "JSON.stringify({ agent: 'campaign-brief-agent',"
if (!pedir.parameters.jsonBody.includes(antes)) throw new Error('no encontré el cuerpo del redactor')
pedir.parameters.jsonBody = pedir.parameters.jsonBody.replace(antes, "JSON.stringify({ dry_run: true, agent: 'campaign-brief-agent',")
delete copia.connections['¿Llegó la vuelta?'] // ② corte: nada se guarda ni sube ni avisa
const r = await (await fetch(`${N8N}/api/v1/workflows`, { method: 'POST', headers: H, body: JSON.stringify(copia) })).json()
if (!r.id) throw new Error('no se creó: ' + JSON.stringify(r).slice(0, 300))
console.log('copia temporal', r.id)
await fetch(`${N8N}/api/v1/workflows/${r.id}/activate`, { method: 'POST', headers: H })
await new Promise((s) => setTimeout(s, 3000))
await fetch(`${N8N}/webhook/zero-risk/planeacion-prueba-cc1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: CID, dry_run: true, forzar: true, force_restart: true }) })
let ex = null
for (let i = 0; i < 90; i++) {
  await new Promise((s) => setTimeout(s, 10000))
  const l = (await (await fetch(`${N8N}/api/v1/executions?workflowId=${r.id}&limit=3`, { headers: H })).json()).data || []
  if (l[0] && !['running', 'waiting', 'new'].includes(l[0].status)) { ex = l[0]; break }
}
await fetch(`${N8N}/api/v1/workflows/${r.id}/deactivate`, { method: 'POST', headers: H })
if (!ex) { console.log(JSON.stringify({ workflow_temporal: r.id, resultado: 'no terminó a tiempo' })); process.exit(2) }
const d = await (await fetch(`${N8N}/api/v1/executions/${ex.id}?includeData=true`, { headers: H })).json()
fs.writeFileSync(join(salida, `ejecucion-planeacion-seco-${ex.id}.json`), JSON.stringify(d))
const rd = d.data.resultData.runData
const items = (n) => (rd[n] || []).flatMap((run) => (run.data?.main || []).flat().map((x) => x?.json)).filter(Boolean)
const elegidos = items('elegir brazos')[0] || {}
const posthog = items('Brazo · PostHog').concat(items('firma de la rama · posthog'))
const analitica = posthog.find((x) => x && x.objetivo === 'analitica_propia' && x.datos) || null
const vuelta = items('¿Llegó la vuelta?')[0] || {}
const texto = String(vuelta.texto || '')
const bloque = texto.includes('## Lo que NO se buscó y por qué') ? texto.slice(texto.indexOf('## Lo que NO se buscó y por qué')) : null
const resumen = {
  workflow_temporal: r.id, ejecucion: ex.id, estado: d.status, error: d.data.resultData.error?.message || null, ultimo_nodo: d.data.resultData.lastNodeExecuted,
  pidio_analitica_propia: (elegidos.pedidos || []).some((p) => p.objetivo === 'analitica_propia'),
  parametros_analitica: (elegidos.pedidos || []).find((p) => p.objetivo === 'analitica_propia')?.params || null,
  descartados: (elegidos.descartados || []).map((x) => x.objetivo),
  brazo_posthog: analitica && { estado: analitica.estado, visitas: analitica.datos?.visitas, personas: analitica.datos?.personas_distintas, tipos_de_evento: (analitica.datos?.embudo || []).map((f) => f.evento + ':' + f.veces) },
  llego_la_vuelta: vuelta.llego_la_vuelta, descartados_declarados: vuelta.descartados_declarados,
  texto_del_plan_es_simulado: /DRY_RUN/.test(texto), bloque_en_el_plan: bloque,
  nodos_que_escriben_alcanzados: ['Guardar el plan', 'Plan → Drive (PDF)', 'Cable de vuelta · sala', 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', '⑥ AVISO · #alertas'].filter((n) => rd[n]),
}
fs.writeFileSync(join(salida, 'resumen-ensayo-planeacion.json'), JSON.stringify(resumen, null, 1))
console.log(JSON.stringify(resumen, null, 1))
