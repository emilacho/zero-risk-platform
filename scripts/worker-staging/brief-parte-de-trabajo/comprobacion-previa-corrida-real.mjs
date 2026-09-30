// COMPROBACIÓN PREVIA DE LA CORRIDA REAL DEL BRIEF · CC#1 · 2026-09-30 · sólo lectura · US$ 0.
//   node comprobacion-previa-corrida-real.mjs [--tope=3.5] [--salida=archivo.json]
// Cinco cosas, cada una con su veredicto (la corrida NO se dispara si alguna falla):
//   ① la base está sana   ② cero corridas vivas (n8n + libro de despachos)   ③ cero despliegues en vuelo (Railway + Vercel)
//   ④ el freno diario de Náufrago (US$ 8 / 24 h por FAMILIA de cliente, medido como lo mide el freno) deja margen para el tope de esta corrida
//   ⑤ el estado del terreno: manual aprobado · plan vigente · partes previos (la guarda «brief repetido») · costo histórico del agente
import fs from 'node:fs'
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const arg = (p) => (process.argv.find((a) => a.startsWith(p)) || '').slice(p.length)
const TOPE = Number(arg('--tope=') || 3.5)
const CAP_DIARIO = Number(arg('--cap=') || 8)
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const N8N = process.env.N8N_BASE_URL, HN = { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
const REF = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https:\/\/([^.]+)\..*$/, '$1')
const sql = async (q) => { const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }); const j = await r.json(); if (!Array.isArray(j)) throw new Error('consulta falló: ' + JSON.stringify(j).slice(0, 200)); return j }
const informe = { hora: new Date().toISOString(), tope_de_la_corrida_usd: TOPE, cap_diario_usd: CAP_DIARIO, veredictos: {} }
const veredicto = (k, ok, detalle) => { informe.veredictos[k] = { ok, ...detalle }; console.log((ok ? '✅' : '🔴') + ' ' + k + ' · ' + JSON.stringify(detalle).slice(0, 400)) }

// ① base sana
try {
  const t0 = Date.now()
  const [c] = await sql(`select (select count(*) from clients)::int as clientes, (select count(*) from agent_invocations)::int as invocaciones, (select count(*) from client_historical_outputs)::int as salidas, now() as ahora`)
  veredicto('1_base_sana', c.clientes > 0 && c.invocaciones > 0, { ...c, ms: Date.now() - t0 })
} catch (e) { veredicto('1_base_sana', false, { error: String(e.message) }) }

// ② cero corridas vivas
try {
  let n8n = 0
  const detalle = {}
  for (const st of ['running', 'waiting', 'new']) { const l = ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=100`, { headers: HN })).json()).data || []); detalle[st] = l.length; n8n += l.length }
  const [d] = await sql(`select count(*)::int as abiertos from agent_dispatches where status in ('accepted','running') and created_at > now() - interval '3 hours'`)
  const [i] = await sql(`select count(*)::int as en_vuelo from agent_invocations where status not in ('completed','error','failed') and started_at > now() - interval '3 hours'`).catch(() => [{ en_vuelo: null }])
  veredicto('2_cero_corridas_vivas', n8n === 0 && d.abiertos === 0, { n8n: detalle, despachos_abiertos: d.abiertos, invocaciones_no_terminadas_3h: i.en_vuelo })
} catch (e) { veredicto('2_cero_corridas_vivas', false, { error: String(e.message) }) }

// ③ cero despliegues en vuelo
try {
  const r = await (await fetch('https://backboard.railway.com/graphql/v2', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RAILWAY_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ project(id:"3c79214f-4c70-4482-9d46-843b7c7e44aa") { environments { edges { node { serviceInstances { edges { node { serviceName latestDeployment { status createdAt } } } } } } } } }' }) })).json()
  const s = r.data.project.environments.edges[0].node.serviceInstances.edges.map((x) => x.node)
  const rail = s.map((x) => ({ servicio: x.serviceName, estado: x.latestDeployment?.status, desde: x.latestDeployment?.createdAt }))
  const salud = await (await fetch('https://zero-risk-platform-production.up.railway.app/health')).json()
  const enVueloRail = rail.filter((x) => !['SUCCESS', 'FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(String(x.estado)))
  // Vercel · último despliegue de producción
  const dep = await (await fetch('https://api.vercel.com/v6/deployments?projectId=prj_UNusLHZNj5vOVrvCEHcRL8EUms2i&teamId=team_TrnhVzPnakxuNlzEqKMVGutw&limit=3&target=production', { headers: { Authorization: 'Bearer ' + process.env.VERCEL_TOKEN } })).json()
  const vercel = (dep.deployments || []).map((d) => ({ estado: d.state || d.readyState, creado: new Date(d.created).toISOString(), commit: (d.meta?.githubCommitSha || '').slice(0, 7) }))
  const enVueloVercel = vercel.filter((x) => ['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING'].includes(x.estado))
  veredicto('3_cero_despliegues_en_vuelo', enVueloRail.length === 0 && enVueloVercel.length === 0 && salud.status === 'ok', { railway: rail, corredor_uptime_s: salud.uptimeSeconds, vercel_produccion: vercel })
} catch (e) { veredicto('3_cero_despliegues_en_vuelo', false, { error: String(e.message) }) }

// ④ el freno diario, medido como lo mide el freno (familia canónica · started_at de las últimas 24 h)
try {
  const [fam] = await sql(`select coalesce(canonical_client_id::text, id::text) as canonico from clients where id = '${CID}'`)
  const canonico = fam?.canonico || CID
  const familia = await sql(`select id::text as id from clients where id = '${canonico}' or canonical_client_id = '${canonico}'`)
  const ids = familia.map((f) => `'${f.id}'`).join(',') || `'${CID}'`
  const [g] = await sql(`select coalesce(sum(cost_usd),0)::numeric(12,4) as gastado, count(*)::int as filas, min(started_at) as la_mas_vieja_de_la_ventana from agent_invocations where client_id in (${ids}) and started_at >= now() - interval '24 hours'`)
  const gastado = Number(g.gastado)
  const margen = +(CAP_DIARIO - gastado).toFixed(4)
  // el freno bloquea cuando gastado >= cap AL INICIO del pedido; con el tope de la corrida no debe poder pasarse: gastado + tope <= cap
  const peorCaso = +(gastado + TOPE).toFixed(4)
  const top = await sql(`select agent_name, round(cost_usd::numeric,4)::text as costo, started_at from agent_invocations where client_id in (${ids}) and started_at >= now() - interval '24 hours' and cost_usd > 0 order by cost_usd desc limit 5`)
  // ¿cuándo se libera margen? la fila más vieja de la ventana sale a las 24 h
  veredicto('4_freno_diario_con_margen', peorCaso <= CAP_DIARIO, { familia_de_clientes: familia.length, gastado_24h_usd: gastado, filas_24h: g.filas, cap_diario_usd: CAP_DIARIO, margen_usd: margen, peor_caso_con_el_tope_usd: peorCaso, la_fila_mas_vieja_de_la_ventana: g.la_mas_vieja_de_la_ventana, mayores_gastos: top })
} catch (e) { veredicto('4_freno_diario_con_margen', false, { error: String(e.message) }) }

// ⑤ el terreno
try {
  const [manual] = await sql(`select id::text, version, gate_outcome, created_at from client_brand_books where client_id='${CID}' order by version desc limit 1`)
  const [plan] = await sql(`select id::text, created_at, title, length(content_text)::int as caracteres, status from client_historical_outputs where client_id='${CID}' and output_type='campaign_plan_90d' order by created_at desc limit 1`)
  const partes = await sql(`select id::text, created_at, title, status, provenance_tag->>'plan_id' as plan_id, (provenance_tag->>'dry_run') as dry_run, (provenance_tag->>'valido') as valido from client_historical_outputs where client_id='${CID}' and output_type='campaign_brief_pack' order by created_at desc limit 5`)
  const hist = await sql(`select round(cost_usd::numeric,4)::text as costo, round(duration_ms/1000.0)::int as segundos, started_at, status from agent_invocations where agent_name='campaign-brief-agent' and cost_usd > 0 order by started_at desc limit 6`)
  const partesDelPlan = plan ? partes.filter((p) => p.plan_id === plan.id && p.dry_run !== 'true') : []
  veredicto('5_el_terreno', !!manual && manual.gate_outcome === 'paso_la_vara' && !!plan, { manual, plan, partes_previos_del_plan_vigente: partesDelPlan.length, partes_recientes: partes, historia_del_agente: hist, guarda_de_repetido_saltara: partesDelPlan.length > 0 })
} catch (e) { veredicto('5_el_terreno', false, { error: String(e.message) }) }

informe.puede_dispararse = Object.values(informe.veredictos).every((v) => v.ok)
console.log('\n' + (informe.puede_dispararse ? '🟢 TODO EN ORDEN · se puede disparar' : '🔴 NO SE DISPARA · al menos una comprobación falló'))
const salida = arg('--salida=')
if (salida) fs.writeFileSync(salida, JSON.stringify(informe, null, 1))
