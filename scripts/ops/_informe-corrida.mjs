import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const t = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k) => (t.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL'), g('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const B = g('N8N_BASE_URL').replace(/\/$/, ''), H = { 'X-N8N-API-KEY': g('N8N_API_KEY') }
const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const dia = new Date().toISOString().slice(0, 10)
const desde = `${dia}T00:00:00Z`
const out = {}
// 1 · ejecuciones
const ex = (await (await fetch(`${B}/api/v1/executions?workflowId=ogfq56oIEoHufFPM&limit=15`, { headers: H })).json()).data
out.ejecuciones = ex.map((e) => ({ id: e.id, status: e.status, desde: e.startedAt, hasta: e.stoppedAt, min: e.stoppedAt ? Math.round((Date.parse(e.stoppedAt) - Date.parse(e.startedAt)) / 6000) / 10 : null }))
// 2 · rastro del día
const c = await db.from('cerebro_portero_corridas').select('*').eq('client_id', C).eq('dia', dia).limit(1)
out.corrida = c.data?.[0] ?? null
// 3 · fichas de hoy
const f = await db.from('cerebro_fichas').select('id, ref, clase, titulo, origen, sede, atributo, decision, descartada, retirada_en, creado_en, alcance').eq('client_id', C).gte('creado_en', desde).order('creado_en', { ascending: true }).limit(1000)
const por = {}
for (const x of f.data ?? []) { const k = `${String(x.ref).split(':').slice(0, 2).join(':')}|${x.clase}|${x.decision}${x.descartada ? '|descartada' : ''}`; por[k] = (por[k] ?? 0) + 1 }
out.fichas_de_hoy = { total: f.data?.length ?? 0, por_tipo: por, sedes: [...new Set((f.data ?? []).map((x) => x.sede ?? '(todas)'))] }
out.fichas_nuevas_muestra = (f.data ?? []).slice(0, 40).map((x) => `${x.clase} · ${String(x.titulo).slice(0, 70)} · sede ${x.sede ?? '-'} · ${x.decision}`)
const comp = (f.data ?? []).filter((x) => /competidor|demanda/.test(String(x.clase)))
out.competencia_y_posicion_de_hoy = comp.map((x) => `${x.clase} · ${String(x.titulo).slice(0, 90)}`)
// 4 · gasto
const costs = await db.from('costs').select('service, amount_usd, created_at, description').like('service', 'apify:%').gte('created_at', desde).limit(1000)
const porServicio = {}
for (const x of (costs.data ?? []).filter((y) => String(y.description).includes(C))) { porServicio[x.service] = Math.round(((porServicio[x.service] ?? 0) + Number(x.amount_usd || 0)) * 10000) / 10000 }
out.gasto_apify_por_servicio = porServicio
const inv = await db.from('agent_invocations').select('agent_name, cost_usd, created_at, workflow_id, metadata').eq('client_id', C).gte('created_at', desde).limit(500)
const porAg = {}
for (const x of inv.data ?? []) porAg[x.agent_name] = Math.round(((porAg[x.agent_name] ?? 0) + Number(x.cost_usd || 0)) * 10000) / 10000
out.gasto_modelo_por_agente = porAg
// 5 · resumen vivo
const rv = await db.from('cerebro_fichas').select('contenido, observado_en, provenance_tag').eq('client_id', C).eq('clase', 'resumen_vivo').is('retirada_en', null).order('observado_en', { ascending: false }).limit(2)
out.resumen_vivo = (rv.data ?? []).map((x) => ({ observado_en: x.observado_en, pulido_por: x.provenance_tag?.datos?.pulido_por ?? null, texto: x.contenido }))
// 6 · ventas
const ventas = (f.data ?? []).filter((x) => String(x.atributo ?? '').startsWith('metrica:loyverse:'))
out.ventas_de_hoy = ventas.map((x) => `${x.atributo} · ${x.titulo}`).slice(0, 30)
// 7 · índice
const fv = await db.from('cerebro_fichas').select('id', { count: 'exact', head: true }).eq('client_id', C).is('retirada_en', null).eq('descartada', false)
const ch = await db.from('client_brain_chunks').select('id', { count: 'exact', head: true }).eq('client_id', C).eq('source_table', 'cerebro_fichas')
out.indice = { fichas_vivas: fv.count, trozos: ch.count }
// 8 · avisos y vigilante (del cierre de la ejecución más nueva del cliente)
const ult = ex.find((e) => e.status !== 'running')
if (ult) {
  const d = await (await fetch(`${B}/api/v1/executions/${ult.id}?includeData=true`, { headers: H })).json()
  const rd = d.data?.resultData?.runData ?? {}
  const j = (n) => rd[n]?.[0]?.data?.main?.[0]?.[0]?.json
  out.ejecucion_mas_nueva = { id: ult.id, status: ult.status }
  out.cierre = j('⑤ Cierre')
  out.vigilante = j('⑥ Vigilar (apaga y avisa si algo falla)')
  out.ampliacion = j('② Ampliar (Servicio de Apify)')?.ampliacion ?? null
  out.nodos_que_corrieron = Object.keys(rd)
}
const av = await db.from('cerebro_avisos').select('*').gte('creado_en', desde).limit(20)
out.avisos_del_sistema = av.data ?? av.error?.message
console.log(JSON.stringify(out, null, 1))
