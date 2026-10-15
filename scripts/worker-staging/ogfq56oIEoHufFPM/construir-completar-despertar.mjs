// Añade al flujo del portero (ogfq56oIEoHufFPM) la segunda entrada «completar despertar»: el alta lo llama para UN cliente y corre la MISMA cadena (una sola copia, 15-oct).
//   node scripts/worker-staging/ogfq56oIEoHufFPM/construir-completar-despertar.mjs
// ADITIVO: un nodo webhook nuevo (responde al instante: «disparar y seguir») + «⓪ Entrada» reconoce la entrada nueva. La corrida diaria (horario y «a mano») queda IGUAL.
// Auth de la entrada nueva: `x-api-key` = INTERNAL_API_KEY de n8n (nunca SALA_DISPATCH_KEY). Exige `client_id` uuid y `pedir_ahora === true` (lo que dice el despertar); si no, no corre nada.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const WEBHOOK = 'Webhook · completar despertar (llave interna)'
export const RUTA = 'zero-risk/cerebro-completar-despertar'
const ENTRADA = '⓪ Entrada'

export const CODIGO_ENTRADA = `// ⓪ ENTRADA · mantenimiento diario del portero · CC#2 · 2026-10-10 · + «completar despertar» (CC-CEREBRO · 15-oct).
//  · por HORARIO: corre de verdad (dry_run=false), para todos los clientes activos.
//  · a mano (webhook con llave de despacho): \`dry_run\` BOOLEANO OBLIGATORIO; \`client_id\` (uuid) opcional limita el alcance.
//  · completar despertar (webhook con llave interna): lo llama el ALTA para UN cliente tras el despertar; exige \`client_id\` uuid y \`pedir_ahora === true\`. Misma cadena que la diaria.
// 🔴 Sin llave, o sin \`dry_run\` booleano en la entrada a mano, el flujo SE DETIENE aquí: no se lee ni se escribe nada.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
let d = null
try { d = $('${WEBHOOK}').first() } catch (e) { d = null }
let w = null
try { w = $('Webhook · a mano (con llave)').first() } catch (e) { w = null }
const base = { workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }
if (d) {
  const h = d.json || {}
  const esperada = String($env.INTERNAL_API_KEY || '')
  const recibida = String((h.headers || {})['x-api-key'] || '')
  if (!esperada || recibida !== esperada) throw new Error('DESPERTAR_SIN_LLAVE · falta o no coincide x-api-key (o INTERNAL_API_KEY no está configurada) · se DETIENE')
  const b = h.body || {}
  if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) throw new Error('DESPERTAR_CLIENTE_INVALIDO · \`client_id\` es obligatorio y debe ser un uuid · se DETIENE')
  if (b.pedir_ahora !== true) return []
  return [{ json: { ...base, via: 'despertar', dry_run: false, client_id: b.client_id } }]
}
if (!w) return [{ json: { ...base, via: 'horario', dry_run: false, client_id: null } }]
const h = w.json || {}
const esperada = String($env.SALA_DISPATCH_KEY || '')
const recibida = String((h.headers || {})['x-sala-dispatch-key'] || '')
if (!esperada || recibida !== esperada) throw new Error('DIARIO_SIN_LLAVE · falta o no coincide x-sala-dispatch-key (o SALA_DISPATCH_KEY no está configurada) · se DETIENE')
const b = h.body || {}
if (typeof b.dry_run !== 'boolean') throw new Error('DIARIO_DRY_RUN_OBLIGATORIO · \`dry_run\` es obligatorio y debe ser true o false · se DETIENE')
if (b.client_id !== undefined && (typeof b.client_id !== 'string' || !UUID.test(b.client_id))) throw new Error('DIARIO_CLIENTE_INVALIDO · \`client_id\` debe ser un uuid · se DETIENE')
return [{ json: { ...base, via: 'a mano', dry_run: b.dry_run, client_id: b.client_id || null } }]`

export function conCompletarDespertar(antes) {
  const w = JSON.parse(JSON.stringify(antes))
  if (w.nodes.some((n) => n.name === WEBHOOK)) throw new Error('la entrada «completar despertar» ya existe')
  const entrada = w.nodes.find((n) => n.name === ENTRADA)
  if (!entrada) throw new Error(`no existe «${ENTRADA}»`)
  entrada.parameters.jsCode = CODIGO_ENTRADA
  w.nodes.push({
    parameters: { httpMethod: 'POST', path: RUTA, responseMode: 'onReceived', options: {} },
    id: 'c0de0000-d35e-4a00-8000-000000000001', name: WEBHOOK, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 120], webhookId: 'cerebro-completar-despertar-0001',
  })
  w.connections[WEBHOOK] = { main: [[{ node: ENTRADA, type: 'main', index: 0 }]] }
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-completar-despertar.mjs')) {
  const antes = JSON.parse(fs.readFileSync(path.join(aqui, 'ogfq56oIEoHufFPM-ANTES-completar-despertar-2026-10-15.json'), 'utf8'))
  const w = conCompletarDespertar(antes)
  fs.writeFileSync(path.join(aqui, 'ogfq56oIEoHufFPM-ARREGLADO-completar-despertar-2026-10-15.json'), JSON.stringify(w, null, 2))
  console.log('ok · nodos', antes.nodes.length, '→', w.nodes.length, '· activo =', w.active)
}
