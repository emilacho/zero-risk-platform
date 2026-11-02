/**
 * 02-nov · «PEDIR CAMBIOS AL MANUAL» · el flujo aparte `zero-risk/manual-cambios` (plan `PLAN-CC2-pedir-cambios-al-manual-parte-n8n` · contrato de CC1 `LISTO-CC1-pedir-cambios-al-manual-puerta-y-datos`, #837). US$ 0, nada aplicado.
 *   node scripts/ops/oficina-marketing/construir-manual-cambios.mjs · escribe nuevo/manual-cambios.json (flujo NUEVO, INACTIVO; el id lo da n8n al crearlo: `manual-cambios-id.txt`)
 * Qué hace, en orden (el flujo del alta del manual NO se toca; este lo llama como sub-flujo):
 *   ⓪ Llave · valida la llave de despacho (E67) y el sobre ANTES de gastar · el pedido repetido o ya resuelto se DETIENE sin gastar.
 *   ① lee el pedido en `plan_cambios` y lo marca `en_reescritura` (con el id de esta ejecución) · ② lee el manual vigente (`manual_base_id`) y la ficha del cliente.
 *   ③ arma la entrada del manual en modo reescritura (sin repetir el descubrimiento: el paquete trae un resumen que lo dice) · ④ llama al flujo del manual y ESPERA (sub-flujo publicado toda la corrida).
 *   ⑤ cierre: si el guardado ligó una versión nueva → `aplicado`; si no → `fallido` con el motivo. Un fallo del sub-flujo también cierra el pedido (nunca queda `en_reescritura` para siempre).
 * Ninguna regla dura sobre el equipo. El tope de gasto lo recibe el flujo del manual por `max_budget_usd` en cada llamada (ver `reescritura-del-manual.mjs`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { AQUI, codigo, conectar, si } from './lib.mjs'

export const MANUAL_ID = 'ssLtwYPt7zxuvnM2'
export const NOMBRE = 'Zero Risk — Manual · pedir cambios (reescritura) · CC#2'
export const PENDIENTE_ID = 'PENDIENTE-MANUAL-CAMBIOS'
export const archivoDelId = path.join(AQUI, 'manual-cambios-id.txt')
export const idDelFlujo = () => (fs.existsSync(archivoDelId) ? fs.readFileSync(archivoDelId, 'utf8').trim() : '') || PENDIENTE_ID

const BASE = "={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/"
const CABECERAS = [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }]
const OPC = { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } }
const httpSb = (name, method, url, cuerpoJs, extra = []) => ({
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: {
    method, url,
    sendHeaders: true,
    headerParameters: { parameters: [...CABECERAS, { name: 'Content-Type', value: 'application/json' }, ...extra] },
    ...(cuerpoJs ? { sendBody: true, specifyBody: 'json', jsonBody: cuerpoJs } : {}),
    options: OPC,
  },
})

const LLAVE = `// ⓪ LA LLAVE · CC#2 · 02-nov · «pedir cambios al manual» · mismo patrón que \`zero-risk/planeacion\` (lección E67).
// Este flujo GASTA (3 lentes + juez de fidelidad + corrección). Exige la llave de despacho del motor en \`x-sala-dispatch-key\` y valida el sobre ANTES de tocar nada.
const w = $input.first().json || {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}
const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) throw new Error('FLUJO_CERRADO · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) en su entorno · este flujo gasta y queda cerrado hasta que exista · E67.')
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) throw new Error('FLUJO_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · este flujo gasta y solo lo despierta la sala · E67.')
const b = w.body && typeof w.body === 'object' && !Array.isArray(w.body) ? w.body : {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const falla = (c, m) => { throw new Error('MANUAL_CAMBIOS_' + c + ' · ' + m + ' · se DETIENE antes de gastar') }
for (const k of ['client_id', 'manual_base_id', 'manual_cambio_id']) if (typeof b[k] !== 'string' || !UUID.test(b[k])) falla('SOBRE_INVALIDO', k + ' debe ser un uuid')
const texto = typeof b.cambios_del_dueno === 'string' ? b.cambios_del_dueno.replace(/\\s+/g, ' ').trim() : ''
if (texto.length < 5 || texto.length > 2000) falla('SOBRE_INVALIDO', 'cambios_del_dueno debe tener de 5 a 2.000 caracteres')
const lista = (x, k) => {
  if (x === undefined || x === null) return []
  if (!Array.isArray(x) || x.some((y) => typeof y !== 'string' || !y.trim() || y.length > 80) || x.length > 60) falla('SOBRE_INVALIDO', k + ' debe ser una lista de textos cortos')
  return x.map((y) => y.trim())
}
const seccion = b.seccion === undefined || b.seccion === null || b.seccion === '' ? null : (typeof b.seccion === 'string' && b.seccion.length <= 80 ? b.seccion.trim() : falla('SOBRE_INVALIDO', 'seccion debe ser un texto de hasta 80 caracteres'))
const tr = b.tope_reescritura_usd
if (tr !== undefined && tr !== null && (typeof tr !== 'number' || !isFinite(tr) || tr <= 0 || tr > 20)) falla('TOPE_INVALIDO', 'tope_reescritura_usd debe ser un número mayor que 0 y hasta 20')
return [{ json: { sobre: {
  client_id: b.client_id, manual_base_id: b.manual_base_id, manual_cambio_id: b.manual_cambio_id,
  cambios_del_dueno: texto, seccion, campos_validados: lista(b.campos_validados, 'campos_validados'), campos_liberados: lista(b.campos_liberados, 'campos_liberados'),
  tope_reescritura_usd: (tr === undefined || tr === null) ? 5 : tr, force_restart: b.force_restart === true, pedido_por: typeof b.pedido_por === 'string' ? b.pedido_por.slice(0, 60) : null,
} } }]`

const GUARDIA = `// ① GUARDIA DEL PEDIDO · el pedido debe existir, ser de este cliente y de un MANUAL; uno que ya tiene versión nueva (o ya terminó) NO se repite (clave única \`manual_cambio_id\`, sin gastar).
const sobre = $('⓪ Llave · Webhook · manual-cambios').first().json.sobre
const r = $input.first().json
if (r.statusCode !== 200) throw new Error('MANUAL_CAMBIOS_PEDIDO_NO_LEIDO · plan_cambios respondió ' + r.statusCode + ' · se DETIENE antes de gastar')
const f = Array.isArray(r.body) ? r.body[0] : null
if (!f) throw new Error('MANUAL_CAMBIOS_PEDIDO_INEXISTENTE · no hay un pedido con ese manual_cambio_id · se DETIENE antes de gastar')
if (f.documento !== 'manual' || f.client_id !== sobre.client_id) throw new Error('MANUAL_CAMBIOS_PEDIDO_AJENO · el pedido no es un cambio del manual de este cliente · se DETIENE antes de gastar')
if (f.manual_nuevo_id) return []        // ya tiene versión nueva: nada que repetir ni cobrar
if (f.estado === 'aplicado' || f.estado === 'cancelado') return []   // ya resuelto
if (f.estado === 'en_reescritura' && !sobre.force_restart) return []   // ya hay una corrida viva de este pedido
return [{ json: { sobre, pedido: f } }]`

const ARMAR = `// ③ ARMAR LA ENTRADA DEL MANUAL EN MODO REESCRITURA · sin repetir el descubrimiento: el manual vigente + la ficha + lo que el cerebro entrega por lectura (el flujo lo lee solo). Nada del cerebro se toca.
const sobre = $('⓪ Llave · Webhook · manual-cambios').first().json.sobre
const mal = (m) => [{ json: { fallo: m } }]   // no lanza: el cierre lee el motivo y marca el pedido fallido (nunca queda en_reescritura)
const lib = $('② Leer el manual vigente').first().json
const ficha = $('② Leer la ficha del cliente').first().json
const fb = Array.isArray(lib.body) ? lib.body[0] : null
const fc = Array.isArray(ficha.body) ? ficha.body[0] : null
if (lib.statusCode !== 200 || !fb) return mal('MANUAL_CAMBIOS_SIN_MANUAL_BASE · no se pudo leer el manual vigente (manual_base_id)')
if (fb.client_id !== sobre.client_id) return mal('MANUAL_CAMBIOS_MANUAL_AJENO · el manual base no es de este cliente')
if (ficha.statusCode !== 200 || !fc) return mal('MANUAL_CAMBIOS_SIN_FICHA · no se pudo leer la ficha del cliente')
let draft = fb.content_text
if (typeof draft === 'string') { try { draft = JSON.parse(draft) } catch (e) { draft = null } }
const vigente = draft && typeof draft === 'object' ? (draft.brand_book_draft && typeof draft.brand_book_draft === 'object' ? draft.brand_book_draft : draft) : null
if (!vigente || !Object.keys(vigente).length) return mal('MANUAL_CAMBIOS_MANUAL_VACIO · el manual base no trae contenido legible')
return [{ json: {
  client_id: sobre.client_id, client_name: fc.name, industry: fc.industry || 'unknown', website: fc.website_url || fc.domain || null,
  discovery_package: { discovery_summary: 'Reescritura sobre el manual vigente (versión ' + (fb.version == null ? '?' : fb.version) + '): no se repitió el descubrimiento; el equipo parte del manual vigente, la ficha y el cerebro.', reescritura: true },
  dry_run: false,
  reescritura: {
    manual_base_id: sobre.manual_base_id, manual_cambio_id: sobre.manual_cambio_id, cambios_del_dueno: sobre.cambios_del_dueno, seccion: sobre.seccion,
    campos_validados: sobre.campos_validados, campos_liberados: sobre.campos_liberados, tope_reescritura_usd: sobre.tope_reescritura_usd, manual_vigente: vigente,
  },
} }]`

const CIERRE = `// ⑤ CIERRE · lee el pedido otra vez: si el guardado ligó una versión nueva → aplicado; si no → fallido con el motivo (también cuando el flujo del manual falló). Nunca queda en_reescritura para siempre.
const sobre = $('⓪ Llave · Webhook · manual-cambios').first().json.sobre
const r = $input.first().json
const f = r.statusCode === 200 && Array.isArray(r.body) ? r.body[0] : null
let motivo = null
let armado = null
try { armado = $('③ Armar la entrada del manual').first().json.fallo || null } catch (x) { armado = null }
if (armado) motivo = armado
else if (!f) motivo = 'no se pudo releer el pedido al cerrar'
else if (!f.manual_nuevo_id) {
  let detalle = ''
  try { const e = $('④ Llamar al flujo del manual').first().json; detalle = e && e.error ? ' · ' + String(e.error.message || e.error).slice(0, 200) : '' } catch (x) { detalle = '' }
  motivo = 'el flujo terminó sin dejar una versión nueva del manual' + detalle
}
const aplicado = !motivo
return [{ json: {
  manual_cambio_id: sobre.manual_cambio_id, aplicado, manual_nuevo_id: f ? f.manual_nuevo_id || null : null,
  parche: aplicado ? { estado: 'aplicado', actualizado_en: new Date().toISOString() } : { estado: 'fallido', despertar_detalle: String(motivo).slice(0, 400), actualizado_en: new Date().toISOString() },
} }]`

export function construirManualCambios() {
  const WH = 'Webhook · manual-cambios', LL = '⓪ Llave · Webhook · manual-cambios'
  const nodos = []
  const add = (def, x, y) => { nodos.push({ id: `mc-${nodos.length + 1}`, position: [x, y], typeVersion: def.typeVersion ?? 2, ...def }); return def.name }
  const PEDIDO = "$('⓪ Llave · Webhook · manual-cambios').first().json.sobre.manual_cambio_id"
  const CLIENTE = "$('⓪ Llave · Webhook · manual-cambios').first().json.sobre.client_id"

  add({ name: WH, type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: 'a3d2c8e0-7b1f-4c54-9d3a-5e6f7a8b9c01', parameters: { httpMethod: 'POST', path: 'zero-risk/manual-cambios', responseMode: 'onReceived' } }, 0, 0)
  add(codigo(LL, LLAVE), 240, 0)
  add(httpSb('① Leer el pedido', 'GET', `=${BASE.slice(1)}plan_cambios?id=eq.{{ ${PEDIDO} }}&select=id,client_id,documento,estado,manual_nuevo_id,creado_en`), 480, 0)
  add(codigo('① Guardia del pedido', GUARDIA), 720, 0)
  add(httpSb('① Marcar en reescritura', 'PATCH', `=${BASE.slice(1)}plan_cambios?id=eq.{{ ${PEDIDO} }}`,
    "={{ JSON.stringify({ estado: 'en_reescritura', workflow_execution_id: String($execution.id), workflow_id: String($workflow.id), actualizado_en: new Date().toISOString() }) }}", [{ name: 'Prefer', value: 'return=minimal' }]), 960, 0)
  add(httpSb('② Leer el manual vigente', 'GET', `=${BASE.slice(1)}client_brand_books?id=eq.{{ $('⓪ Llave · Webhook · manual-cambios').first().json.sobre.manual_base_id }}&select=id,client_id,version,content_text`), 1200, 0)
  add(httpSb('② Leer la ficha del cliente', 'GET', `=${BASE.slice(1)}clients?id=eq.{{ ${CLIENTE} }}&select=id,name,industry,website_url,domain`), 1440, 0)
  add(codigo('③ Armar la entrada del manual', ARMAR), 1680, 0)
  add(si('③ ¿Se pudo armar?', '={{ !$json.fallo }}'), 1800, 0)
  add({ name: '④ Llamar al flujo del manual', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, onError: 'continueRegularOutput', parameters: { workflowId: { __rl: true, value: MANUAL_ID, mode: 'id' }, options: {} } }, 1920, 0)
  add(httpSb('⑤ Releer el pedido', 'GET', `=${BASE.slice(1)}plan_cambios?id=eq.{{ ${PEDIDO} }}&select=id,estado,manual_nuevo_id`), 2160, 0)
  add(codigo('⑤ Cierre · armar', CIERRE), 2400, 0)
  add(httpSb('⑤ Cerrar el pedido', 'PATCH', `=${BASE.slice(1)}plan_cambios?id=eq.{{ $json.manual_cambio_id }}`, '={{ JSON.stringify($json.parche) }}', [{ name: 'Prefer', value: 'return=minimal' }]), 2640, 0)

  const f = { id: idDelFlujo(), name: NOMBRE, nodes: nodos, connections: {}, settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveManualExecutions: true } }
  const cadena = [WH, LL, '① Leer el pedido', '① Guardia del pedido', '① Marcar en reescritura', '② Leer el manual vigente', '② Leer la ficha del cliente', '③ Armar la entrada del manual', '③ ¿Se pudo armar?']
  for (let i = 0; i < cadena.length - 1; i++) conectar(f, cadena[i], cadena[i + 1])
  conectar(f, '③ ¿Se pudo armar?', '④ Llamar al flujo del manual', 0) // sí → llama al manual
  conectar(f, '③ ¿Se pudo armar?', '⑤ Releer el pedido', 1)          // no → directo al cierre (fallido con el motivo)
  conectar(f, '④ Llamar al flujo del manual', '⑤ Releer el pedido')
  conectar(f, '⑤ Releer el pedido', '⑤ Cierre · armar')
  conectar(f, '⑤ Cierre · armar', '⑤ Cerrar el pedido')
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-manual-cambios.mjs')) {
  const f = construirManualCambios()
  const dir = path.join(AQUI, 'nuevo')
  fs.mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, 'manual-cambios.json')
  fs.writeFileSync(archivo, JSON.stringify(f, null, 2) + '\n')
  console.log(archivo, f.nodes.length + ' nodos')
}
