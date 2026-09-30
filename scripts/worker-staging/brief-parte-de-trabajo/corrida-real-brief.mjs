// LA CORRIDA REAL DEL BRIEF · CC#1 · 2026-09-30 · autorizada por Emilio (tope duro US$ 3,50 · una sola corrida · cero intervención).
//   node corrida-real-brief.mjs --salida=dir                 → SÓLO las sondas y la comprobación previa (gratis) · NO dispara
//   node corrida-real-brief.mjs --salida=dir --confirmar     → las mismas y, si TODO está en verde, DISPARA UNA vez
// Opciones: --tope=3 (lo que se le pide al SDK · holgura sobre lo autorizado, porque el SDK revisa el presupuesto ENTRE llamadas y puede pasarse por una) · --autorizado=3.5
//
// Cómo dispara (la vía diseñada · la misma de CC#2 el 29-sep): deja el sobre en /api/sala/intake con la forma EXACTA que emite el nodo «BRIEF · sobre» de planeación; el repartidor de la sala
// (reloj de 3 min) lo recoge y despacha el flujo del brief con SU llave (que no se puede leer desde afuera). `forzar:true` porque el plan vigente ya tiene un parte (la guarda de «brief repetido»).
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resumenDeLaCorrida, veredictoDeLaCorrida } from './resumen-corrida-brief.mjs'
const aqui = dirname(fileURLToPath(import.meta.url))
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const arg = (p) => (process.argv.find((a) => a.startsWith(p)) || '').slice(p.length)
const TOPE = Number(arg('--tope=') || 3), AUTORIZADO = Number(arg('--autorizado=') || 3.5)
// --razonamiento=disabled|low|medium · experimento 30-sep · limita el pensamiento interno del redactor (ausente ⇒ razonamiento completo, como siempre)
const RAZ = arg('--razonamiento=') || null
if (RAZ !== null && !['disabled', 'low', 'medium'].includes(RAZ)) { console.log('--razonamiento inválido: ' + RAZ); process.exit(1) }
const CONFIRMAR = process.argv.includes('--confirmar')
const salida = arg('--salida=') || join(process.cwd(), 'salida-corrida-real'); fs.mkdirSync(salida, { recursive: true })
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118', FLUJO_BRIEF = 'PQdIgbuFexuBsoh8'
const N8N = process.env.N8N_BASE_URL, HN = { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
const VERCEL = 'https://zero-risk-platform.vercel.app', RUNNER = 'https://zero-risk-platform-production.up.railway.app'
const REF = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https:\/\/([^.]+)\..*$/, '$1')
const sql = async (q) => { const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json(); if (!Array.isArray(r)) throw new Error('consulta falló: ' + JSON.stringify(r).slice(0, 200)); return r }
const espera = (ms) => new Promise((s) => setTimeout(s, ms))
const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m)
const parar = (m) => { log('🔴 ' + m + ' · NO SE DISPARA'); fs.writeFileSync(join(salida, 'abortada.txt'), m); process.exit(1) }

// ═══ 1 · SONDAS GRATUITAS · ¿lo publicado trae el tope? ═══════════════════════════════════════════════════════════════════════════════
// con el cliente REAL (sin client_id la puerta lo trata como «cubo de sistema» y podría avisar) · va en SECO y con tope inválido: se rechaza con 400 antes de correr nada (US$ 0)
const sonda = { agent: 'campaign-brief-agent', task: 'sonda del tope · no corre', client_id: CID, workflow_id: 'SONDA-TOPE-CC1', workflow_execution_id: '0', dry_run: true, max_budget_usd: 0 }
const v = await fetch(`${VERCEL}/api/agents/run-sdk`, { method: 'POST', headers: { 'x-api-key': process.env.INTERNAL_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(sonda) })
const vj = await v.json().catch(() => ({}))
log(`sonda Vercel · HTTP ${v.status} · ${vj.error || vj.code || ''}`)
if (!(v.status === 400 && vj.error === 'max_budget_usd_invalid')) parar('Vercel NO trae el tope por corrida (esperaba 400 max_budget_usd_invalid)')
const rn = await fetch(`${RUNNER}/run-sdk`, { method: 'POST', headers: { 'x-internal-auth': process.env.INTERNAL_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ agentName: sonda.agent, task: sonda.task, workflowId: sonda.workflow_id, workflowExecutionId: sonda.workflow_execution_id, clientId: CID, dryRun: true, maxBudgetUsd: 0 }) })
const rj = await rn.json().catch(() => ({}))
log(`sonda corredor · HTTP ${rn.status} · ${rj.error || ''}`)
if (!(rn.status === 400 && rj.error === 'max_budget_usd_invalid')) parar('el corredor NO trae el tope por corrida (esperaba 400 max_budget_usd_invalid)')
// sondas del razonamiento (sólo si se pide) · valor inválido ⇒ 400 antes de correr nada (US$ 0) en Vercel y en el corredor
if (RAZ !== null) {
  const vr = await fetch(`${VERCEL}/api/agents/run-sdk`, { method: 'POST', headers: { 'x-api-key': process.env.INTERNAL_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sonda, max_budget_usd: 1, thinking_mode: 'invalido' }) })
  const vrj = await vr.json().catch(() => ({}))
  log(`sonda razonamiento Vercel · HTTP ${vr.status} · ${vrj.error || ''}`)
  if (!(vr.status === 400 && vrj.error === 'thinking_mode_invalid')) parar('Vercel NO trae thinking_mode (esperaba 400 thinking_mode_invalid)')
  const rr = await fetch(`${RUNNER}/run-sdk`, { method: 'POST', headers: { 'x-internal-auth': process.env.INTERNAL_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ agentName: sonda.agent, task: sonda.task, workflowId: sonda.workflow_id, workflowExecutionId: sonda.workflow_execution_id, clientId: CID, dryRun: true, thinking_mode: 'invalido' }) })
  const rrj = await rr.json().catch(() => ({}))
  log(`sonda razonamiento corredor · HTTP ${rr.status} · ${rrj.error || ''}`)
  if (!(rr.status === 400 && rrj.error === 'thinking_mode_invalid')) parar('el corredor NO trae thinking_mode (esperaba 400 thinking_mode_invalid)')
}
const flujo = await (await fetch(`${N8N}/api/v1/workflows/${FLUJO_BRIEF}`, { headers: HN })).json()
const cod = (n) => String(flujo.nodes.find((x) => x.name === n)?.parameters?.jsCode || '')
const conTope = cod('⓪ Sobre · llave · modo seco').includes('BRIEF_TOPE_INVALIDO') && cod('③ Armar el cuerpo del redactor').includes('max_budget_usd') && cod('③ ¿Llegó la vuelta?').includes('falla_del_redactor') && (RAZ === null || (cod('⓪ Sobre · llave · modo seco').includes('BRIEF_RAZONAMIENTO_INVALIDO') && cod('③ Armar el cuerpo del redactor').includes('thinking_mode')))
log(`flujo del brief · versión ${flujo.versionId} · activo=${flujo.active} · trae el tope=${conTope}`)
if (!flujo.active || !conTope) parar('el flujo del brief no está activo o no trae el tope')

// ═══ 2 · COMPROBACIÓN PREVIA (base · vivas · despliegues · freno diario con margen · terreno) ══════════════════════════════════════════
const previa = join(salida, 'comprobacion-previa.json')
const r = spawnSync(process.execPath, [join(aqui, 'comprobacion-previa-corrida-real.mjs'), `--tope=${AUTORIZADO}`, `--salida=${previa}`], { encoding: 'utf8' })
console.log(r.stdout.split('\n').map((l) => l.slice(0, 260)).join('\n'))
const cp = JSON.parse(fs.readFileSync(previa, 'utf8'))
if (!cp.puede_dispararse) parar('la comprobación previa falló: ' + Object.entries(cp.veredictos).filter(([, x]) => !x.ok).map(([k]) => k).join(', '))
if (!CONFIRMAR) { log('🟢 TODO EN VERDE · listo para disparar (falta --confirmar)'); process.exit(0) }

// ═══ 3 · DISPARO (UNA vez) ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
const [plan] = await sql(`select id::text from client_historical_outputs where client_id='${CID}' and output_type='campaign_plan_90d' order by created_at desc limit 1`)
const dia = new Date().toISOString().slice(0, 10)
const clave = `cc1-brief-real-${dia}-${new Date().toISOString().slice(11, 16).replace(':', '')}` // con la hora: un reintento tras un rechazo NO choca con una clave ya usada
const correlacion = randomUUID() // la sala exige UUID (medido 30-sep 07:02: 22P02 con un texto)
const previos = await sql(`select count(*)::int as n from sala_event_log where step_id like '%${clave}%' or stream_id::text like '%${clave}%'`).catch(() => [{ n: 0 }])
if (previos[0].n > 0) parar('ya hay asientos con la clave ' + clave + ' · una corrida por día: no se dispara dos veces')
const t0 = new Date()
const cuerpo = {
  source: 'planeacion/plan-listo', intent: 'briefear',
  payload: { client_id: CID, plan_id: plan.id, dry_run: false, forzar: true, tope_usd: TOPE, ...(RAZ !== null ? { razonamiento: RAZ } : {}), desde_worker: 'X9F0zp6LQ2xGEYVS' },
  idempotency_key: clave + ':briefear', logical_period: 'alta:' + clave, tenant_id: CID, client_id: CID,
  // la puerta de la sala RECHAZA `correlation_id: null` (debe ser texto no vacío o no venir · medido 30-sep 07:02, invalid_envelope) · un texto propio deja la corrida rastreable
  correlation_id: correlacion,
}
fs.writeFileSync(join(salida, 'sobre-enviado.json'), JSON.stringify({ ...cuerpo, hora: t0.toISOString() }, null, 1))
log(`🚀 DISPARO · sobre a /api/sala/intake · plan ${plan.id} · razonamiento ${RAZ ?? 'completo'} · tope pedido US$ ${TOPE} (autorizado US$ ${AUTORIZADO}) · forzar=true`)
const ing = await fetch(`${VERCEL}/api/sala/intake`, { method: 'POST', headers: { 'x-api-key': process.env.INTERNAL_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
const ingj = await ing.json().catch(() => ({}))
fs.writeFileSync(join(salida, 'respuesta-de-la-sala.json'), JSON.stringify({ http: ing.status, ...ingj }, null, 1))
log(`respuesta de la sala · HTTP ${ing.status} · ${JSON.stringify(ingj).slice(0, 240)}`)
if (ingj.kind === 'duplicate') parar('la sala dice DUPLICADO: no despachó nada nuevo (¡revisar antes de reintentar!)')
if (!(ing.ok && (ingj.ok === true || ingj.kind === 'accepted'))) parar('la sala no aceptó el sobre (¡ya no se puede reintentar sin revisar!)')

// ═══ 4 · SEGUIMIENTO ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const vistos = new Set(); let ex = null; let ultimoEstado = ''
for (let i = 0; i < 160; i++) { // hasta ~80 min
  await espera(30000)
  const asientos = await sql(`select event_id::text, step_id, step_state, journey_type, occurred_at from sala_event_log where occurred_at >= '${t0.toISOString()}' and journey_type = 'BRIEF' order by occurred_at`).catch(() => [])
  for (const a of asientos) if (!vistos.has(a.event_id)) { vistos.add(a.event_id); log(`  🗒️ sala · asiento «${a.step_id}» ${a.step_state || ''} (${a.journey_type})`) }
  const l = ((await (await fetch(`${N8N}/api/v1/executions?workflowId=${FLUJO_BRIEF}&limit=5`, { headers: HN })).json()).data || []).find((e) => Date.parse(e.startedAt) >= t0.getTime() - 5000)
  const est = l ? `${l.id}:${l.status}` : 'sin ejecución todavía'
  if (est !== ultimoEstado) { ultimoEstado = est; log('  ⚙️  flujo del brief · ' + est) }
  if (l && !['running', 'waiting', 'new'].includes(l.status)) { ex = l; break }
}
if (!ex) { log('🟠 pasaron ~80 min y la corrida sigue viva o no arrancó · se deja de mirar (NO se reintenta)'); fs.writeFileSync(join(salida, 'sin-terminar.txt'), 'sigue viva o no arrancó'); process.exit(3) }

// ═══ 5 · RECOLECCIÓN ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const d = await (await fetch(`${N8N}/api/v1/executions/${ex.id}?includeData=true`, { headers: HN })).json()
fs.writeFileSync(join(salida, `ejecucion-${ex.id}.json`), JSON.stringify(d))
const res = resumenDeLaCorrida(d)
const [inv] = await sql(`select id::text, round(cost_usd::numeric,4)::float as costo, round(duration_ms/1000.0)::int as segundos, input_tokens, output_tokens, status, started_at from agent_invocations where workflow_execution_id = '${ex.id}' and agent_name = 'campaign-brief-agent' order by started_at desc limit 1`).catch(() => [null])
const [g24] = await sql(`select coalesce(sum(cost_usd),0)::numeric(12,4)::float as gastado_24h from agent_invocations where client_id='${CID}' and started_at >= now() - interval '24 hours'`)
const filas = await sql(`select id::text, title, status, length(content_text)::int as caracteres, provenance_tag from client_historical_outputs where id = '${res.guardado.id || '00000000-0000-0000-0000-000000000000'}'`).catch(() => [])
const [parteDb] = filas
const contenido = parteDb ? (await sql(`select content_text from client_historical_outputs where id = '${parteDb.id}'`))[0]?.content_text : null
if (contenido) fs.writeFileSync(join(salida, 'parte.md'), contenido)
const asientos = await sql(`select event_id::text, step_id, step_state, journey_type, occurred_at from sala_event_log where occurred_at >= '${t0.toISOString()}' and journey_type = 'BRIEF' order by occurred_at`).catch(() => [])
const intentos = await sql(`select attempt_number, status, http_status_code, attempted_at from agent_callback_attempts where callback_url like '%waiting/${ex.id}%' order by attempted_at`).catch(() => [])
const costoReal = inv?.costo ?? res.vuelta.cost_usd
const veredicto = veredictoDeLaCorrida(res, { topeAutorizadoUsd: AUTORIZADO, costoRealUsd: costoReal })
const informe = { hora_disparo: t0.toISOString(), tope_pedido_usd: TOPE, tope_autorizado_usd: AUTORIZADO, plan: plan.id, resumen: res, invocacion: inv, gastado_24h_despues: g24.gastado_24h, parte_guardado: parteDb ? { id: parteDb.id, titulo: parteDb.title, status: parteDb.status, caracteres: parteDb.caracteres, provenance_tag: { ...parteDb.provenance_tag, parte: parteDb.provenance_tag?.parte ? '(ver parte.md)' : null } } : null, entregables: (parteDb?.provenance_tag?.parte?.entregables || []).map((e) => ({ id: e.id, plataforma: e.plataforma, tipo: e.tipo_de_pieza, mensaje: String(e.mensaje || '').slice(0, 140) })), pendientes: parteDb?.provenance_tag?.parte?.pendientes_declarados || [], asientos_de_la_sala: asientos, intentos_de_vuelta: intentos, veredicto }
fs.writeFileSync(join(salida, 'informe.json'), JSON.stringify(informe, null, 1))
console.log('\n' + JSON.stringify({ estado: res.estado, error: res.error, duracion_s: res.duracion_s, gastado_usd: costoReal, tope_usd: TOPE, entregables: res.chequeos.entregables, parte_valido: res.chequeos.parte_valido, drive: res.drive, cable: res.cable_volvio, asientos: asientos.map((a) => a.step_id), veredicto: veredicto.map((x) => (x.ok ? '✅ ' : '🔴 ') + x.punto) }, null, 1))
