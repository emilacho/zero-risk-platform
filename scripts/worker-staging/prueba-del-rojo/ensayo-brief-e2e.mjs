// ENSAYO DE PUNTA A PUNTA del brief con la palanca y el parte honesto · CC#1 · 2026-09-30 · US$ 0 (todo dry_run).
//   node ensayo-brief-e2e.mjs [--salida=dir]    (lee .env.local del proyecto principal)
// Crea una COPIA temporal del flujo (inactiva salvo durante el ensayo) con el código ACTUAL; sólo la puerta de la llave de despacho se salta EN LA COPIA
// (la llave vive cifrada en n8n y no se puede leer; la puerta no cambió y tiene sus propias pruebas). Ejerce: palanca → corredor entrega la vuelta → chequeos → veredicto.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const BRIEF = join(aqui, '..', 'brief-parte-de-trabajo')
const require = createRequire(import.meta.url)
const { armarSimulacroSano } = require(join(BRIEF, 'simulacro-parte-sano.js'))
const { construirFlujo } = await import(pathToFileURL(join(BRIEF, 'construir-brief.mjs')).href)
const envPath = process.env.ENV_FILE || 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }
const N8N = process.env.N8N_BASE_URL, H = { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' }
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SBH = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY }
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const salida = (process.argv.find((a) => a.startsWith('--salida=')) || '').slice(9) || join(aqui, 'salida-ensayo')
fs.mkdirSync(salida, { recursive: true })

const get = async (u) => (await fetch(SB + '/rest/v1/' + u, { headers: SBH })).json()
const [manual] = await get(`client_brand_books?select=forbidden_words,required_terminology&client_id=eq.${CID}&order=version.desc&limit=1`)
const [plan] = await get(`client_historical_outputs?select=content_text&output_type=eq.campaign_plan_90d&client_id=eq.${CID}&order=created_at.desc&limit=1`)
if (!manual || !plan) throw new Error('sin manual o sin plan de Náufrago')
const SANO = armarSimulacroSano(plan.content_text, manual)
const VACIO = '```json\n{"parte":{"entregables":[],"huecos":["el plan no bajó a trabajo"]}}\n```'

// la copia de prueba · sólo la puerta de la llave se salta
const f = construirFlujo({ path: 'zero-risk/brief-prueba-cc1', nombre: 'CC1 · prueba del brief con palanca TEMPORAL (NO BORRAR hasta que CC#3 certifique)', webhookId: 'brief-prueba-cc1-0002' })
const sobre = f.nodes.find((n) => n.name.startsWith('⓪'))
sobre.parameters.jsCode = sobre.parameters.jsCode.replace("if (!esperada) {", 'if (false) {').replace('if (!ok) {', 'if (false) {')
const r = await (await fetch(`${N8N}/api/v1/workflows`, { method: 'POST', headers: H, body: JSON.stringify(f) })).json()
if (!r.id) throw new Error('no se creó: ' + JSON.stringify(r).slice(0, 300))
console.log('copia temporal', r.id)
await fetch(`${N8N}/api/v1/workflows/${r.id}/activate`, { method: 'POST', headers: H })
await new Promise((s) => setTimeout(s, 3000))

const casos = [['sano', SANO], ['vacio', VACIO]]
const resultados = {}
for (const [nombre, sim] of casos) {
  await fetch(`${N8N}/webhook/zero-risk/brief-prueba-cc1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: CID, dry_run: true, forzar: true, _simulacro_respuesta: sim }) })
  await new Promise((s) => setTimeout(s, 4000))
  // la ejecución más nueva de la copia
  let ex = null
  for (let i = 0; i < 40; i++) {
    const l = (await (await fetch(`${N8N}/api/v1/executions?workflowId=${r.id}&limit=5`, { headers: H })).json()).data || []
    const nueva = l.find((e) => !resultados[e.id] && !Object.values(resultados).some((x) => x.id === e.id))
    if (nueva && nueva.status !== 'running' && nueva.status !== 'waiting' && nueva.status !== 'new') { ex = nueva; break }
    await new Promise((s) => setTimeout(s, 5000))
  }
  if (!ex) { resultados[nombre] = { id: null, estado: 'no terminó a tiempo' }; continue }
  const d = await (await fetch(`${N8N}/api/v1/executions/${ex.id}?includeData=true`, { headers: H })).json()
  fs.writeFileSync(join(salida, `ejecucion-${nombre}-${ex.id}.json`), JSON.stringify(d))
  const rd = d.data.resultData.runData
  const j = (n) => rd[n] && rd[n][0].data && rd[n][0].data.main && rd[n][0].data.main[0] && rd[n][0].data.main[0][0] && rd[n][0].data.main[0][0].json
  const espera = j('③ Esperar al redactor') || {}
  const cuerpoVuelta = espera.body || espera
  resultados[nombre] = {
    id: ex.id, estado: d.status, error: d.data.resultData.error && d.data.resultData.error.message,
    ultimo_nodo: d.data.resultData.lastNodeExecuted,
    vuelta_delivered_by: cuerpoVuelta.delivered_by, vuelta_success: cuerpoVuelta.success, vuelta_cost_usd: cuerpoVuelta.cost_usd,
    palanca_enviada: j('③ Armar el cuerpo del redactor') && j('③ Armar el cuerpo del redactor').cuerpo.callback_mode,
    llego: j('③ ¿Llegó la vuelta?') && { llego_la_vuelta: j('③ ¿Llegó la vuelta?').llego_la_vuelta, vuelta_costo_usd: j('③ ¿Llegó la vuelta?').vuelta_costo_usd, simulacro_usado: j('③ ¿Llegó la vuelta?').simulacro_usado },
    chequeos: j('④ Chequeos') && { parte_legible: j('④ Chequeos').parte_legible, parte_valido: j('④ Chequeos').parte_valido, motivo_invalido: j('④ Chequeos').motivo_invalido, entregables: j('④ Chequeos').entregables, titulo: j('④ Chequeos').titulo_parte },
    seco: j('⑤ Seco · lo que se habría escrito') && { habria_cerrado_como: j('⑤ Seco · lo que se habría escrito').habria_cerrado_como, formas_validas: j('⑤ Seco · lo que se habría escrito').formas_validas, titulo_drive: j('⑤ Seco · lo que se habría escrito').habria_subido_a_drive_con_titulo, escrituras_reales: j('⑤ Seco · lo que se habría escrito').escrituras_reales },
    escribio_en_real: ['⑤ Guardar el parte', '⑤ Parte a Drive', '⑥ Cable de vuelta · sala'].filter((n) => rd[n]),
  }
}
await fetch(`${N8N}/api/v1/workflows/${r.id}/deactivate`, { method: 'POST', headers: H })
fs.writeFileSync(join(salida, 'resumen.json'), JSON.stringify({ workflow_temporal: r.id, resultados }, null, 1))
console.log(JSON.stringify({ workflow_temporal: r.id, resultados }, null, 1))
