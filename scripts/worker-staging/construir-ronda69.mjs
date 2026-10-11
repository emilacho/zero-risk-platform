// ronda 69 · construye los flujos corregidos desde un respaldo FRESCO (no toca n8n):
//  · la llave de Apify va por cabecera `Authorization: Bearer …`, NO en la dirección (`?token=`): n8n copia la dirección en los datos de una ejecución fallida (lo vi en la 173262)
//  · el turno de la oficina pide la vuelta por el corredor (`callback_mode: 'runner'`; para un agente que no puede, run-sdk lo ignora y la vuelta sigue por Vercel + recuperación)
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')

export function cambiar(codigo, antes, despues, que) {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
  return codigo.replace(antes, () => despues)
}
const conFinDeLinea = (codigo, fn) => {
  const crlf = codigo.includes('\r\n')
  const r = fn(crlf ? codigo.split('\r\n').join('\n') : codigo)
  return crlf ? r.split('\n').join('\r\n') : r
}

// ───────────── nodos HTTP: `token={{ $env.X }}` fuera de la dirección → cabecera
const RE_TOKEN = /([?&])token=\{\{\s*\$env\.(APIFY_API_TOKEN|APIFY_TOKEN)\s*\}\}(&?)/
/** la dirección sin la llave: `?token=X&b=1` → `?b=1` · `?a=1&token=X` → `?a=1` · `?token=X` → `` · `…&token=X&b=1` → `…&b=1` */
export function direccionSinLlave(url) {
  const m = RE_TOKEN.exec(url)
  if (!m) return { url, variable: null }
  const [todo, pre, variable, suf] = m
  const reemplazo = pre === '?' ? (suf ? '?' : '') : (suf ? '&' : '')
  return { url: url.replace(todo, reemplazo), variable }
}
export function tieneLlaveEnLaDireccion(nodo) {
  return typeof nodo?.parameters?.url === 'string' && RE_TOKEN.test(nodo.parameters.url)
}
export function llavePorCabecera(nodo) {
  const n = JSON.parse(JSON.stringify(nodo))
  const { url, variable } = direccionSinLlave(n.parameters.url)
  if (!variable) throw new Error(`«${n.name}»: no trae la llave en la dirección`)
  n.parameters.url = url
  n.parameters.sendHeaders = true
  const hp = n.parameters.headerParameters && Array.isArray(n.parameters.headerParameters.parameters) ? n.parameters.headerParameters.parameters : []
  if (hp.some((h) => String(h.name).toLowerCase() === 'authorization')) throw new Error(`«${n.name}»: ya trae una cabecera Authorization`)
  n.parameters.headerParameters = { parameters: [...hp, { name: 'Authorization', value: `=Bearer {{ $env.${variable} }}` }] }
  return n
}
export function llaveDeApifyPorCabecera(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  let n = 0
  f.nodes = f.nodes.map((x) => { if (tieneLlaveEnLaDireccion(x)) { n++; return llavePorCabecera(x) } return x })
  if (n === 0) throw new Error('ningún nodo con la llave en la dirección')
  return f
}

// ───────────── Servicio de Apify: los nodos HTTP + el código del importe real (ronda 68) con la llave en cabecera
export const IMPORTE_HTTP_VIEJO = "const http = (u) => helpers.httpRequest({ url: u, method: 'GET', json: true, timeout: 15000 });"
export const IMPORTE_HTTP_NUEVO = "const http = (u) => helpers.httpRequest({ url: u, method: 'GET', json: true, timeout: 15000, headers: { Authorization: 'Bearer ' + $env.APIFY_API_TOKEN } });"
export const IMPORTE_URL_LISTA_VIEJA = "lista = await http('https://api.apify.com/v2/actor-runs?limit=100&desc=1&token=' + token)"
export const IMPORTE_URL_LISTA_NUEVA = "lista = await http('https://api.apify.com/v2/actor-runs?limit=100&desc=1')"
export const IMPORTE_URL_ENTRADA_VIEJA = "var entrada = await http('https://api.apify.com/v2/key-value-stores/' + r.defaultKeyValueStoreId + '/records/INPUT?token=' + token)"
export const IMPORTE_URL_ENTRADA_NUEVA = "var entrada = await http('https://api.apify.com/v2/key-value-stores/' + r.defaultKeyValueStoreId + '/records/INPUT')"
export function servicioApify(flujo) {
  const f = llaveDeApifyPorCabecera(flujo)
  const x = f.nodes.filter((m) => m.name === 'Armar la fila de la libreta')
  if (x.length !== 1) throw new Error('nodos «Armar la fila de la libreta»: ' + x.length)
  x[0].parameters.jsCode = conFinDeLinea(x[0].parameters.jsCode, (c) => {
    c = cambiar(c, IMPORTE_HTTP_VIEJO, IMPORTE_HTTP_NUEVO, 'importe.http')
    c = cambiar(c, IMPORTE_URL_LISTA_VIEJA, IMPORTE_URL_LISTA_NUEVA, 'importe.lista')
    return cambiar(c, IMPORTE_URL_ENTRADA_VIEJA, IMPORTE_URL_ENTRADA_NUEVA, 'importe.entrada')
  })
  return f
}

// ───────────── nodos de código que preguntan por una corrida (Cerebro · ponerse al día · y mantenimiento del portero)
export const CORRIDA_VIEJA = "ll.apify_run_id + '?token=' + $env.APIFY_API_TOKEN, method: 'GET', headers: {} })"
export const CORRIDA_NUEVA = "ll.apify_run_id, method: 'GET', headers: { Authorization: 'Bearer ' + $env.APIFY_API_TOKEN } })"
export function codigoDeCorrida(nombreDelNodo) {
  return (flujo) => {
    const f = JSON.parse(JSON.stringify(flujo))
    const x = f.nodes.filter((m) => m.name === nombreDelNodo)
    if (x.length !== 1) throw new Error(`nodos «${nombreDelNodo}»: ${x.length}`)
    x[0].parameters.jsCode = conFinDeLinea(x[0].parameters.jsCode, (c) => {
      const n = c.split(CORRIDA_VIEJA).length - 1
      if (n < 1) throw new Error(`«${nombreDelNodo}»: no está la llamada con la llave en la dirección`)
      return c.split(CORRIDA_VIEJA).join(CORRIDA_NUEVA)
    })
    return f
  }
}

// ───────────── turno de la oficina
export const OFICINA_VIEJO = '  callback_url: $execution.resumeUrl,\n  force_restart: true,'
export const OFICINA_NUEVO = "  callback_url: $execution.resumeUrl,\n  // ronda 69 · la vuelta la entrega el corredor cuando el agente puede (diseño de láminas); si no puede, run-sdk lo ignora y la vuelta sigue por Vercel con la recuperación del resultado\n  callback_mode: 'runner',\n  force_restart: true,"
export function oficinaTurno(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const x = f.nodes.filter((m) => m.name === '② Armar el pedido')
  if (x.length !== 1) throw new Error('nodos «② Armar el pedido»: ' + x.length)
  x[0].parameters.jsCode = conFinDeLinea(x[0].parameters.jsCode, (c) => cambiar(c, OFICINA_VIEJO, OFICINA_NUEVO, 'oficina.callback_mode'))
  return f
}

/** los flujos de esta ronda: [id, carpeta/prefijo, función] */
export const FLUJOS = [
  ['3lyknrP3PoS2KzUf', '3lyknrP3PoS2KzUf/servicio-apify', servicioApify],
  ['jrnP5qTvEh0ACGkM', 'jrnP5qTvEh0ACGkM/anotar-gasto', llaveDeApifyPorCabecera],
  ['Dz2n5bA3yW89I2Ye', 'Dz2n5bA3yW89I2Ye/landing-cascade', llaveDeApifyPorCabecera],
  ['Smu6A18qr1XJ2uzB', 'Smu6A18qr1XJ2uzB/relector-esquemas', llaveDeApifyPorCabecera],
  ['vRSkPFxe5IbdQbz3', 'vRSkPFxe5IbdQbz3/inteligencia-competitiva', llaveDeApifyPorCabecera],
  ['EZXAFQvKZsJlvGNO', 'EZXAFQvKZsJlvGNO/cerebro-diario', codigoDeCorrida('② Ejecutar el plan y medir')],
  ['ogfq56oIEoHufFPM', 'ogfq56oIEoHufFPM/cerebro-mantenimiento', codigoDeCorrida('② Ampliar (Servicio de Apify)')],
  ['bTbWL9lUvQCfStAz', 'bTbWL9lUvQCfStAz/oficina-turno', oficinaTurno],
]
