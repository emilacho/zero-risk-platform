// ANÁLISIS DEL PLAN v2 (solo lectura) · CC#1 · 2026-10-12 · lo que pide el arranque: chequeo revisarPlan (P1–P6) sobre el plan nuevo, presupuesto desde la meta con escenarios, presencia de temporada / idea de marca /
// disponibilidad / calendario de 12 semanas / recompra, identidad y moneda del manual, 0 voseo, 0 nombres internos, PDF en Drive. NO corrige nada: mide y declara.
//   node analizar-plan-v2-2026-10-12.mjs <client_id> <desde_ISO> <ejecucion.json> [--salida=dir]
import fs from 'node:fs'
import { join } from 'node:path'
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const [CID, DESDE, ARCH] = process.argv.slice(2)
const salida = (process.argv.find((a) => a.startsWith('--salida=')) || '').slice(9) || process.cwd()
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY, HS = { apikey: SK, Authorization: 'Bearer ' + SK }
const REF = SB.replace(/^https:\/\/([^.]+)\..*$/, '$1')
const sql = async (q) => (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })).json())
const plan = (await sql(`select id::text, status, created_at::text, content_text from client_historical_outputs where client_id='${CID}' and output_type='campaign_plan_90d' and created_at >= '${DESDE}' order by created_at desc limit 1`))[0]
if (!plan) { console.log(JSON.stringify({ plan: null, motivo: 'no hay plan guardado desde el disparo' })); process.exit(2) }
const t = String(plan.content_text || '')
fs.writeFileSync(join(salida, 'plan-v2-texto.txt'), t)
const d = JSON.parse(fs.readFileSync(ARCH, 'utf8'))
const rd = d.data.resultData.runData
const items = (n) => (rd[n] || []).flatMap((run) => (run.data?.main || []).flat().map((x) => x?.json)).filter(Boolean)
const vuelta = items('¿Llegó la vuelta?')[0] || {}
const red = items('Redactor (B4)')[0] || {}
const ctx = red.contexto_chequeo || {}
const manual = (await sql(`select version, primary_colors, typography from client_brand_books where client_id='${CID}' order by version desc limit 1`))[0]
const cuenta = (re) => (t.match(re) || []).length
const unico = (re) => { const m = t.match(re); return m ? [...new Set(m.map((x) => x.trim()))].slice(0, 8) : [] }
const colores = [...t.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase())
const coloresManual = (ctx.identidad?.colores || []).map((c) => String(c).toLowerCase())
const tipografiasManual = ctx.identidad?.tipografias || []
const tipografiasEnPlan = tipografiasManual.filter((f) => t.toLowerCase().includes(String(f).toLowerCase()))
const monedas = unico(/\b(US\$|USD|\$ ?[0-9]|EUR|€|COP|MXN|S\/)/g)
const resultado = {
  plan_id: plan.id, estado: plan.status, creado: plan.created_at, caracteres: t.length, manual_version: manual?.version,
  revisarPlan: { ok: vuelta.chequeo_del_plan?.ok ?? null, marcas: vuelta.chequeo_del_plan?.marcas ?? null, registro_revisado: vuelta.registro_revisado ?? null, calentamiento_quitado: vuelta.calentamiento_quitado ?? null },
  presupuesto_desde_la_meta: {
    meta_con_cifra: /meta[^\n]{0,160}\b[0-9][0-9.,]*\b/i.test(t),
    ventas_o_clientes_necesarios: /(ventas|clientes|pedidos)[^\n]{0,60}necesari/i.test(t) || /necesit[^\n]{0,80}(ventas|clientes|pedidos)/i.test(t),
    costo_por_cliente_o_pedido: /costo por (cliente|pedido|venta)|CAC|costo de adquisici/i.test(t),
    fuente_o_rango: /(rango|fuente)[^\n]{0,80}(mercado|benchmark|referenc)/i.test(t),
    escenarios: unico(/escenario[^\n]{0,40}/gi),
    gasto_diario_por_dias: /[0-9]+ ?(USD|US\$|\$)[^\n]{0,30}(d[ií]a)[^\n]{0,30}[×x*][^\n]{0,20}90/i.test(t),
  },
  secciones: {
    temporada_o_momentos_de_compra: cuenta(/temporada|momento[s]? de compra|feriado|fecha[s]? (clave|especial)/gi),
    idea_de_marca: cuenta(/idea de marca|recordaci[oó]n/gi),
    disponibilidad: cuenta(/disponibilidad|d[oó]nde (y c[oó]mo )?(puede|pueden) comprar|canales de venta|puntos de contacto/gi),
    calendario_12_semanas: cuenta(/semana (1|2|3|4|5|6|7|8|9|10|11|12)\b/gi),
    recompra_retencion: cuenta(/recompra|retenci[oó]n|fideliz/gi),
    agencia_agentica: cuenta(/variantes|optimizaci[oó]n continua|la agencia (se encarga|hace)/gi),
  },
  identidad_y_moneda: {
    colores_en_el_plan: [...new Set(colores)], colores_fuera_del_manual: [...new Set(colores)].filter((c) => !coloresManual.includes(c)),
    tipografias_del_manual_nombradas: tipografiasEnPlan, moneda_declarada: ctx.moneda ?? null, monedas_que_aparecen: monedas,
  },
  voseo: unico(/\b(vos|sos|tenés|querés|podés|sabés|mirá|decí|hacé|pedí|fijate|vení|tené|poné)\b/gi),
  nombres_internos: unico(/\b[a-z]+(_[a-z0-9]+)+\b|spend_cap|ficha_mapa|analitica_propia|competidores_precio|redes_sociales|cerebro_cliente|campaign-brief-agent|run-sdk|workflow|n8n/gi),
  menciona_tope_interno: /spend_cap|tope (interno|de la casa)|la casa (fija|decide)/i.test(t),
  calentamiento_al_inicio: /^(claro|por supuesto|aqu[ií] (tienes|est[aá])|con gusto)/i.test(t.trim()),
  pdf_en_drive: (() => { const x = items('Plan → Drive (PDF)'); const y = items('¿Salió el PDF?'); return { drive: x.map((j) => ({ ok: j.ok ?? j.body?.ok ?? null, url: j.url ?? j.body?.url ?? j.webViewLink ?? null, nombre: j.nombre ?? j.name ?? null })), salio_el_pdf: y.map((j) => ({ hay_pdf: j.hay_pdf ?? j.pdf_ok ?? null, motivo: j.motivo ?? null })) } })(),
  nodos_ejecutados_clave: Object.keys(rd).filter((n) => /redactor|Guardar|Drive|vuelta|Cable|BRIEF|Seco|AVISO|repetida/i.test(n)),
}
fs.writeFileSync(join(salida, 'analisis-plan-v2.json'), JSON.stringify(resultado, null, 1))
console.log(JSON.stringify(resultado, null, 1).slice(0, 6000))
