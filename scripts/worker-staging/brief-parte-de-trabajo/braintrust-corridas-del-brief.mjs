// FORENSE DE LAS CORRIDAS REALES DEL BRIEF EN BRAINTRUST · CC#1 · 2026-09-30 · sólo lectura · US$ 0.
//   node braintrust-corridas-del-brief.mjs [--desde=2026-09-29T17:00:00Z] [--salida=dir]
// Braintrust traza cada `query()` del Claude Agent SDK del corredor (llave en las variables de Railway). Trae, por cada corrida de `campaign-brief-agent`: cuándo empezó y terminó,
// cuántas llamadas al modelo y a herramientas hizo, tokens, costo, y el ERROR textual si lo hubo. Es la única fuente de por qué falló la 158667 (el corredor no registró nada).
import fs from 'node:fs'
import { join } from 'node:path'
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const arg = (p) => (process.argv.find((a) => a.startsWith(p)) || '').slice(p.length)
const DESDE = Date.parse(arg('--desde=') || '2026-09-29T17:00:00Z')
const salida = arg('--salida=') || join(process.cwd(), 'salida-braintrust'); fs.mkdirSync(salida, { recursive: true })
const vars = (await (await fetch('https://backboard.railway.com/graphql/v2', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RAILWAY_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ variables(projectId:"3c79214f-4c70-4482-9d46-843b7c7e44aa", environmentId:"77abe4b1-cd0a-4477-b372-788d522ee86e", serviceId:"1710ac41-9fbf-4c29-8c1d-2d5a596f6fe7") }' }) })).json()).data.variables
const KEY = vars.BRAINTRUST_API_KEY
if (!KEY) { console.log('sin BRAINTRUST_API_KEY'); process.exit(1) }
const PROYECTO = '9a1f2db0-41d0-444d-97ce-665c29cbf174'
const traer = async (limit, cursor) => {
  const r = await fetch(`https://api-eu.braintrust.dev/v1/project_logs/${PROYECTO}/fetch`, { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ limit, ...(cursor ? { cursor } : {}) }) })
  if (!r.ok) throw new Error('Braintrust HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200))
  return r.json()
}
const filas = []
let cursor = null
for (let i = 0; i < 12; i++) {
  const p = await traer(200, cursor)
  const evs = p.events || []
  filas.push(...evs)
  cursor = p.cursor
  if (!evs.length || !cursor) break
  const masViejo = Math.min(...evs.map((e) => Date.parse(e.created)))
  if (masViejo < DESDE) break
}
const enVentana = filas.filter((e) => Date.parse(e.created) >= DESDE)
fs.writeFileSync(join(salida, 'braintrust-crudo.json'), JSON.stringify(enVentana))
console.log('registros en la ventana:', enVentana.length, '· tipos de span:', [...new Set(enVentana.map((e) => e.span_attributes?.name || e.span_attributes?.type || '?'))].join(', '))
// agrupar por raíz
const porRaiz = {}
for (const e of enVentana) (porRaiz[e.root_span_id] = porRaiz[e.root_span_id] || []).push(e)
const raices = Object.entries(porRaiz).map(([id, evs]) => {
  const raiz = evs.find((e) => e.span_id === id) || evs[0]
  const inicio = Math.min(...evs.map((e) => e.metrics?.start ?? Date.parse(e.created) / 1000))
  const fin = Math.max(...evs.map((e) => e.metrics?.end ?? e.metrics?.start ?? Date.parse(e.created) / 1000))
  const tools = evs.filter((e) => /tool|Tool/.test(e.span_attributes?.name || '') || e.span_attributes?.type === 'tool')
  const llm = evs.filter((e) => e.span_attributes?.type === 'llm')
  const errores = evs.filter((e) => e.error != null).map((e) => ({ span: e.span_attributes?.name, error: typeof e.error === 'string' ? e.error : JSON.stringify(e.error) }))
  const tokens = evs.reduce((a, e) => ({ prompt: a.prompt + (e.metrics?.prompt_tokens || 0), completion: a.completion + (e.metrics?.completion_tokens || 0), cached: a.cached + (e.metrics?.prompt_cached_tokens || 0), creado: a.creado + (e.metrics?.prompt_cache_creation_tokens || 0) }), { prompt: 0, completion: 0, cached: 0, creado: 0 })
  return { raiz: id, creado: raiz.created, nombre: raiz.span_attributes?.name, entrada: JSON.stringify(raiz.input || raiz.metadata || '').slice(0, 160), segundos: Math.round(fin - inicio), spans: evs.length, llamadas_al_modelo: llm.length, herramientas: tools.length, tokens, errores, herramientas_por_nombre: Object.entries(tools.reduce((a, e) => { const n = e.span_attributes?.name || '?'; a[n] = (a[n] || 0) + 1; return a }, {})).map(([n, c]) => n + '×' + c).join(' · ') }
}).sort((a, b) => Date.parse(a.creado) - Date.parse(b.creado))
fs.writeFileSync(join(salida, 'raices.json'), JSON.stringify(raices, null, 1))
for (const r of raices.filter((x) => x.segundos >= 120 || x.errores.length)) console.log(JSON.stringify(r).slice(0, 900))
