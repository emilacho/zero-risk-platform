// LA CORRIDA REAL DEL PLAN DE 90 DÍAS v2 · CC#1 · 2026-10-12 · FIRMADA ≈ US$ 1,5 (FIRMA-EMILIO «plan v2») · UNA sola corrida · desde el disparo SOLO SE MIRA.
//   node corrida-real-plan-v2-2026-10-12.mjs <client_id> --tope=1.5 --salida=dir            → comprobaciones previas (gratis), NO dispara
//   node corrida-real-plan-v2-2026-10-12.mjs <client_id> --tope=1.5 --salida=dir --confirmar → las mismas y, si TODO está en verde, DISPARA UNA vez
// Camino normal: el sobre `alta/journey-completed` · `planear` a /api/sala/intake con `forzar`/`force_restart` verdadero (sin eso el redactor devolvía el plan viejo desde su punto de control), que el repartidor de la sala despacha a la planeación.
// El tope de la ficha (`config.spend_cap_usd`) se fija al valor firmado y se LEE DE VUELTA antes de disparar.
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const arg = (p) => (process.argv.find((a) => a.startsWith(p)) || '').slice(p.length)
const CID = process.argv[2]
const TOPE = Number(arg('--tope=') || 1.5)
const CONFIRMAR = process.argv.includes('--confirmar')
const salida = arg('--salida=') || join(process.cwd(), 'salida-corrida-plan-v2'); fs.mkdirSync(salida, { recursive: true })
if (!/^[0-9a-f-]{36}$/i.test(CID ?? '') || !(TOPE > 0)) { console.error('uso: corrida-real-plan-v2-2026-10-12.mjs <client_id> --tope=1.5 --salida=dir [--confirmar]'); process.exit(1) }
const N8N = process.env.N8N_BASE_URL.replace(/\/$/, ''), HN = { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY, HS = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }
const REF = SB.replace(/^https:\/\/([^.]+)\..*$/, '$1')
const sql = async (q) => { const r = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })).json(); return r }
const log = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(l); fs.appendFileSync(join(salida, 'bitacora.txt'), l + '\n') }
const parar = (m) => { log('🛑 ' + m); fs.writeFileSync(join(salida, 'PARADO.txt'), m); process.exit(3) }
const espera = (ms) => new Promise((x) => setTimeout(x, ms))

// ═══ 1 · COMPROBACIONES PREVIAS (gratis) ═══
const corriendo = async (st) => ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=50`, { headers: HN })).json()).data || []).length
const [run, wait] = [await corriendo('running'), await corriendo('waiting')]
log(`n8n · corriendo ${run} · esperando ${wait}`); if (run || wait) parar('hay ejecuciones vivas en n8n: no se dispara')
const flujo = await (await fetch(`${N8N}/api/v1/workflows/X9F0zp6LQ2xGEYVS`, { headers: HN })).json()
log(`planeación X9F0 · activo=${flujo.active}`); if (!flujo.active) parar('la planeación no está activa')
const cons = await (await fetch(`${N8N}/api/v1/workflows/z2nS8Up115EA9TKz`, { headers: HN })).json()
log(`repartidor de la sala · activo=${cons.active}`); if (!cons.active) parar('el repartidor de la sala no está activo')
const cfg = await sql(`select clave, valor::text from cadena_config where clave in ('estado_cadena','clientes_ensayo')`)
log('cadena · ' + JSON.stringify(cfg)); if (!(Array.isArray(cfg) && cfg.some((c) => c.clave === 'estado_cadena' && /apagada/.test(c.valor)))) parar('la cadena no está «apagada»')
const mb = await sql(`select id::text, version from client_brand_books where client_id='${CID}' order by version desc limit 1`)
log('manual más reciente · ' + JSON.stringify(mb[0]))
const previos = await sql(`select id::text, created_at::text from client_historical_outputs where client_id='${CID}' and output_type='campaign_plan_90d' order by created_at desc`)
log('planes que ya existen · ' + previos.length)

// ═══ 2 · EL TOPE DE LA FICHA, LEÍDO DE VUELTA ═══
const fila = (await (await fetch(`${SB}/rest/v1/clients?id=eq.${CID}&select=id,config`, { headers: HS })).json())[0]
if (!fila) parar('no hay ficha con ese client_id')
const antes = fila.config?.spend_cap_usd ?? null
if (antes !== TOPE) {
  if (!CONFIRMAR) log(`(solo comprobación) el tope de la ficha es ${antes}; con --confirmar se fija en ${TOPE}`)
  else {
    const nueva = { ...(fila.config || {}), spend_cap_usd: TOPE }
    const p = await fetch(`${SB}/rest/v1/clients?id=eq.${CID}`, { method: 'PATCH', headers: { ...HS, Prefer: 'return=representation' }, body: JSON.stringify({ config: nueva }) })
    if (!p.ok) parar('no se pudo fijar el tope: ' + p.status)
  }
}
const leido = (await (await fetch(`${SB}/rest/v1/clients?id=eq.${CID}&select=config`, { headers: HS })).json())[0]?.config?.spend_cap_usd ?? null
log(`tope de la ficha leído de vuelta · antes ${antes} · ahora ${leido}`)
if (CONFIRMAR && leido !== TOPE) parar('el tope leído de vuelta no es el firmado')
if (!CONFIRMAR) { log('✅ comprobaciones previas hechas · NO se disparó (falta --confirmar)'); process.exit(0) }

// ═══ 3 · DISPARO (una vez) ═══
const t0 = new Date()
const clave = randomUUID()
const cuerpo = {
  source: 'alta/journey-completed', intent: 'planear',
  payload: { pedido: 'plan de 90 dias', dry_run: false, forzar: true, force_restart: true, client_id: CID, desde_worker: 'LyVoKcrypS5uLyuu', journey_id: clave },
  idempotency_key: clave + ':planear', logical_period: 'alta:' + clave, tenant_id: CID, client_id: CID, correlation_id: randomUUID(),
}
fs.writeFileSync(join(salida, 'sobre-enviado.json'), JSON.stringify({ ...cuerpo, hora: t0.toISOString() }, null, 1))
log(`🚀 DISPARO · sobre a /api/sala/intake · tope ${TOPE} · forzar=true`)
const ing = await fetch('https://zero-risk-platform.vercel.app/api/sala/intake', { method: 'POST', headers: { 'x-api-key': process.env.INTERNAL_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
const ingj = await ing.json().catch(() => ({}))
fs.writeFileSync(join(salida, 'respuesta-de-la-sala.json'), JSON.stringify({ http: ing.status, ...ingj }, null, 1))
log(`respuesta de la sala · HTTP ${ing.status} · ${JSON.stringify(ingj).slice(0, 240)}`)
if (ingj.kind === 'duplicate') parar('la sala dice DUPLICADO: no despachó nada nuevo (revisar antes de reintentar)')
if (!(ing.ok && (ingj.ok === true || ingj.kind === 'accepted'))) parar('la sala no aceptó el sobre (no se reintenta sin revisar)')

// ═══ 4 · SOLO MIRAR ═══
let ex = null, ultimo = ''
for (let i = 0; i < 200; i++) {
  await espera(30000)
  const l = ((await (await fetch(`${N8N}/api/v1/executions?workflowId=X9F0zp6LQ2xGEYVS&limit=5`, { headers: HN })).json()).data || []).find((e) => Date.parse(e.startedAt) >= t0.getTime() - 5000)
  const est = l ? `${l.id}:${l.status}` : 'sin ejecución todavía'
  if (est !== ultimo) { ultimo = est; log('  ⚙️  planeación · ' + est) }
  if (l && !['running', 'waiting', 'new'].includes(l.status)) { ex = l; break }
}
if (!ex) { log('🟠 pasó el tiempo de espera y la corrida sigue viva o no arrancó · se deja de mirar (NO se reintenta)'); fs.writeFileSync(join(salida, 'sin-terminar.txt'), 'sigue viva o no arrancó'); process.exit(4) }
await espera(20000)
const d = await (await fetch(`${N8N}/api/v1/executions/${ex.id}?includeData=true`, { headers: HN })).json()
fs.writeFileSync(join(salida, `ejecucion-${ex.id}.json`), JSON.stringify(d))
log(`planeación terminó · ${ex.id} · ${d.status} · último nodo ${d.data?.resultData?.lastNodeExecuted}`)

// ═══ 5 · RECOLECCIÓN (solo lectura) ═══
const desde = t0.toISOString()
const inv = await sql(`select agent_name, status, cost_usd, duration_ms, left(coalesce(error_message,''),160) as error, created_at::text from agent_invocations where client_id='${CID}' and created_at >= '${desde}' order by created_at`)
const plan = await sql(`select id::text, status, created_at::text, length(content_text) as largo from client_historical_outputs where client_id='${CID}' and output_type='campaign_plan_90d' and created_at >= '${desde}' order by created_at desc limit 3`)
const libro = await sql(`select service, amount_usd, amount_usd_exact, left(description, 120) as d from costs where created_at >= '${desde}' and (service like 'apify%' or service like 'anthropic%' or service like 'claude%') order by created_at`)
const resumen = { disparo: desde, ejecucion: ex.id, estado: d.status, agentes: inv, plan_guardado: plan, libro_de_costos: libro, tope_leido: leido }
fs.writeFileSync(join(salida, 'resumen-recoleccion.json'), JSON.stringify(resumen, null, 1))
log('recolección guardada · resumen-recoleccion.json')
console.log(JSON.stringify(resumen, null, 1).slice(0, 4000))
