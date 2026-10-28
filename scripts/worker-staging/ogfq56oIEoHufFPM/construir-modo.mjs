// «Modo del portero» en el flujo diario (ogfq56oIEoHufFPM) · CC-CEREBRO · 2026-10-28 · encargo modo-construccion-y-plan-apify (firma de Emilio «dale»).
// El horario dispara a las TRES horas (12:30, 18:30 y 00:30 UTC) y el primer paso pregunta a /api/brain/alimentar/modo si TOCA correr ahora (PORTERO_MODO es un dato de Vercel):
//   construccion → las 3; campana → solo la de las 12:30. En construcción cada corrida va con `forzar` (la guarda «una por día» es de campaña).
// Cambia SOLO: el horario (cron y zona UTC: n8n usa America/New_York y el 1-nov las 08:30 pasarían a las 13:30 UTC), «⓪ Entrada», «① Repartir» y «④ Alimentar». Sin nodos ni conexiones nuevos (el nodo del horario se RENOMBRA).
//   node construir-modo.mjs <ANTES.json>   → escribe ogfq56oIEoHufFPM-ARREGLADO-modo-2026-10-28.json junto a este archivo (no toca n8n)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NOMBRE_VIEJO_DEL_HORARIO = 'Horario diario 08:30 (hora de n8n)'
export const NOMBRE_NUEVO_DEL_HORARIO = 'Horario · 12:30, 18:30 y 00:30 UTC (el modo decide)'
export const CRON_NUEVO = '30 0,12,18 * * *'
const lf = (s) => String(s).replace(/\r\n/g, '\n')
const igualFin = (orig, nuevo) => (orig.includes('\r\n') ? nuevo.replace(/\n/g, '\r\n') : nuevo)

const ENTRADA_VIEJA = "if (!w) return [{ json: { ...base, via: 'horario', dry_run: false, client_id: null } }]"
const ENTRADA_NUEVA = `if (!w) {
  // EL MODO (28-oct): el horario dispara a las 12:30, 18:30 y 00:30 UTC; /modo dice si TOCA correr ahora (construccion: las 3 · campana: solo las 12:30) y si va con forzar.
  let m = null
  try { m = await this.helpers.httpRequest({ url: 'https://zero-risk-platform.vercel.app/api/brain/alimentar/modo', method: 'GET', json: true, timeout: 30000, headers: { 'x-api-key': $env.INTERNAL_API_KEY } }) } catch (e) { m = null }
  if (!m || typeof m.corre_ahora !== 'boolean') {
    // sin respuesta del modo NO se pierde la diaria: solo la corrida de las 12:30 UTC corre (como antes); las otras dos esperan
    const h = new Date().getUTCHours() * 60 + new Date().getUTCMinutes()
    if (Math.abs(h - 750) > 20) return []
    return [{ json: { ...base, via: 'horario', dry_run: false, client_id: null, modo: 'sin_respuesta', forzar_corrida: false } }]
  }
  if (!m.corre_ahora) return []
  return [{ json: { ...base, via: 'horario', dry_run: false, client_id: null, modo: m.modo, forzar_corrida: m.forzar === true } }]
}`
const ENTRADA_U_VIEJA = "reintento: b.reintento === true, posicion_ahora: b.posicion_ahora === true } }]"
const ENTRADA_U_NUEVA = "reintento: b.reintento === true, forzar_corrida: b.forzar_corrida === true, posicion_ahora: b.posicion_ahora === true } }]"
const REPARTIR_VIEJA = "body: { client_id: it.json.cliente, origen_del_reparto: String(entrada.workflow_execution_id) } })"
const REPARTIR_NUEVA = "body: { client_id: it.json.cliente, origen_del_reparto: String(entrada.workflow_execution_id), forzar_corrida: entrada.forzar_corrida === true } })"
const ALIMENTAR_VIEJA = "...($('⓪ Entrada').first().json.reintento === true ? { forzar: true } : {})"
const ALIMENTAR_NUEVA = "...($('⓪ Entrada').first().json.reintento === true || $('⓪ Entrada').first().json.forzar_corrida === true ? { forzar: true } : {})"

function cambiar(texto, viejo, nuevo, donde) {
  const t = lf(texto), v = lf(viejo)
  if (t.split(v).length !== 2) throw new Error(donde + ': el texto a cambiar aparece ' + (t.split(v).length - 1) + ' veces (debe ser 1)')
  return igualFin(texto, t.replace(v, lf(nuevo)))
}

/** devuelve una COPIA del flujo con el modo aplicado; falla si ya está aplicado o si falta algo */
export function aplicarModo(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = w.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo «' + n + '»'); return x }
  const h = nodo(NOMBRE_VIEJO_DEL_HORARIO)
  if (lf(JSON.stringify(h.parameters)).includes(CRON_NUEVO)) throw new Error('el horario ya tiene el modo')
  h.parameters = { ...h.parameters, rule: { interval: [{ field: 'cronExpression', expression: CRON_NUEVO }] } }
  h.name = NOMBRE_NUEVO_DEL_HORARIO
  if (w.connections[NOMBRE_VIEJO_DEL_HORARIO]) { w.connections[NOMBRE_NUEVO_DEL_HORARIO] = w.connections[NOMBRE_VIEJO_DEL_HORARIO]; delete w.connections[NOMBRE_VIEJO_DEL_HORARIO] }
  w.settings = { ...(w.settings || {}), timezone: 'UTC' }
  const e = nodo('⓪ Entrada'); e.parameters = { ...e.parameters, jsCode: cambiar(cambiar(e.parameters.jsCode, ENTRADA_VIEJA, ENTRADA_NUEVA, '⓪ Entrada (horario)'), ENTRADA_U_VIEJA, ENTRADA_U_NUEVA, '⓪ Entrada (un cliente)') }
  const r = nodo('① Repartir (una ejecución por cliente)'); r.parameters = { ...r.parameters, jsCode: cambiar(r.parameters.jsCode, REPARTIR_VIEJA, REPARTIR_NUEVA, '① Repartir') }
  const a = nodo('④ Alimentar (filtrar · razonar · archivar)'); a.parameters = { ...a.parameters, jsonBody: cambiar(a.parameters.jsonBody, ALIMENTAR_VIEJA, ALIMENTAR_NUEVA, '④ Alimentar') }
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-modo.mjs')) {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const entrada = process.argv[2]
  if (!entrada) { console.error('uso: node construir-modo.mjs <ANTES.json>'); process.exit(2) }
  fs.writeFileSync(join(aqui, 'ogfq56oIEoHufFPM-ARREGLADO-modo-2026-10-28.json'), JSON.stringify(aplicarModo(JSON.parse(fs.readFileSync(entrada, 'utf8'))), null, 2))
  console.log('escrito ogfq56oIEoHufFPM-ARREGLADO-modo-2026-10-28.json')
}
