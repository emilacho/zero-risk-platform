// EL PORTERO NO CORRIÓ (15-oct 12:30 UTC) · causa: el paso ② llamaba al Servicio de Apify 7 veces SEGUIDAS dentro de UN nodo de código y n8n corta cada tarea de código a los 120 s
// («Task execution timed out after 120 seconds»); el flujo disparó, murió a medias y el vigilante (que vive al final) no pudo hablar → la alarma dijo «no disparó».
// Arreglo (aditivo, sin cambiar qué se pide ni el orden): cada nodo de código que llama en bucle lleva un PRESUPUESTO de tiempo: no empieza una llamada nueva pasado el presupuesto,
// el tiempo de cada llamada se acota a lo que queda del nodo, y lo que no cupo se DECLARA (omitidas_por_tiempo), nunca se pierde en silencio.
// ② se reparte en tres nodos encadenados (tanda 1 → tanda 2 → ② Ampliar) con el mismo código: lo que no cupo en uno pasa al siguiente.
//   node scripts/worker-staging/construir-presupuesto-de-tiempo.mjs
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).split('\\').join('/')
export const DIR = RAIZ + 'scripts/worker-staging/ogfq56oIEoHufFPM/'
export const ANTES = DIR + 'portero-ANTES-presupuesto-de-tiempo-2026-10-15.json'
export const ARREGLADO = DIR + 'portero-ARREGLADO-presupuesto-de-tiempo-2026-10-15.json'
export const TOPE_DEL_NODO_MS = 112_000 // n8n corta a los 120 s: se deja margen
export const PRESUPUESTO_PARA_EMPEZAR_MS = 60_000 // pasado esto no se empieza otra llamada en ESTE nodo
export const PRESUPUESTO_DE_LECTURA_MS = 80_000
export const NODO_AMPLIAR = '② Ampliar (Servicio de Apify)'
export const NODOS_TANDA = ['② Ampliar (tanda 1)', '② Ampliar (tanda 2)']
export const NODO_BIS = '② bis Leer artículos (Servicio de Apify)'
export const NODO_TER = '② ter Leer reseñas y videos (Servicio de Apify)'
export const NODO_PUENTE = '④ bis Puente (repetir hasta terminar)'

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
const reloj = `const T0 = Date.now() // presupuesto de tiempo: n8n corta la tarea de código a los 120 s\nconst RESTA_MS = () => Math.max(5000, ${TOPE_DEL_NODO_MS} - (Date.now() - T0))\n`

/** el código de ② con presupuesto: lee lo pendiente de la tanda anterior y deja lo que no cupo */
/** una llamada que pasa de su tiempo LANZA en n8n y mataría el nodo con todo lo ya hecho: se convierte en una respuesta fallida (statusCode 0) que cada nodo ya sabe declarar */
export function capturar(codigo) {
  return conFinDeLinea(codigo, (c) => {
    const ini = 'this.helpers.httpRequest({ json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: '
    const fin = ', ...o })'
    if (c.split(ini).length !== 2) throw new Error('el ayudante de llamadas no es el esperado')
    const i = c.indexOf(ini)
    const j = c.indexOf(fin, i)
    if (j < 0 || !/^[0-9]+$/.test(c.slice(i + ini.length, j))) throw new Error('el ayudante de llamadas no es el esperado')
    const cola = ".catch((err) => ({ statusCode: 0, body: { error: 'sin respuesta: ' + String((err && err.message) || err).slice(0, 140) } }))"
    return c.slice(0, j + fin.length) + cola + c.slice(j + fin.length)
  })
}

export function codigoDeAmpliar(original, esUltima) {
  return conFinDeLinea(original, (c) => {
    let x = c
    x = cambiar(x, "const salidas = []\nfor (const item of $input.all()) {", reloj + `const ES_ULTIMA = ${esUltima}\nconst salidas = []\nfor (const item of $input.all()) {`, 'cabecera')
    x = cambiar(x, "const salida = { ...e, ampliacion: { hecho: false, llamadas: [], gasto_usd: 0, parado: null } }",
      "const salida = { ...e, ampliacion: e.ampliacion ? { ...e.ampliacion } : { hecho: false, llamadas: [], gasto_usd: 0, parado: null } }\n  delete salida.acciones_pendientes", 'estado previo')
    x = cambiar(x, "  let seguidasConFalla = 0\n  for (const a of e.acciones || []) {\n    const t0 = Date.now()\n",
      "  let seguidasConFalla = e.ampliacion && e.ampliacion.seguidas_con_falla ? e.ampliacion.seguidas_con_falla : 0\n  const pendientes = []\n  const lista = Array.isArray(e.acciones_pendientes) ? e.acciones_pendientes : e.acciones || []\n  for (const a of lista) {\n    if (salida.ampliacion.parado) continue // dos fallas seguidas: se declara en parado, no se sigue\n    if (Date.now() - T0 > " + PRESUPUESTO_PARA_EMPEZAR_MS + ") { pendientes.push(a); continue } // no cupo en este nodo: pasa al siguiente\n    const t0 = Date.now()\n", 'bucle')
    x = cambiar(x, "const r = await http({ url: N8N + '/webhook/apify-service-workflow', method: 'POST',", "const r = await http({ timeout: RESTA_MS(), url: N8N + '/webhook/apify-service-workflow', method: 'POST',", 'tiempo de la llamada')
    x = cambiar(x, "const u = await http({ url: 'https://api.apify.com/v2/actor-runs/'", "const u = await http({ timeout: Math.min(15000, RESTA_MS()), url: 'https://api.apify.com/v2/actor-runs/'", 'tiempo del costo')
    x = cambiar(x, "  salida.ampliacion.hecho = salida.ampliacion.llamadas.length > 0 && salida.ampliacion.llamadas.every((l) => l.hecho)\n",
      "  salida.ampliacion.seguidas_con_falla = seguidasConFalla\n  if (ES_ULTIMA) {\n    salida.ampliacion.omitidas_por_tiempo = pendientes.map((a) => a.fuente + ': ' + a.funcion) // se DICE lo que no cupo\n    delete salida.ampliacion.seguidas_con_falla\n  } else salida.acciones_pendientes = pendientes\n  salida.ampliacion.hecho = salida.ampliacion.llamadas.length > 0 && salida.ampliacion.llamadas.every((l) => l.hecho) && pendientes.length === 0\n", 'cierre')
    return x
  })
}

/** ② bis y ② ter: una llamada por página/acción; no se empieza otra pasado el presupuesto y lo omitido se declara */
export function codigoDeLectura(original, campo) {
  return conFinDeLinea(original, (c) => {
    let x = c
    x = cambiar(x, "const previos = $(", reloj + "const previos = $(", 'cabecera ' + campo)
    x = cambiar(x, "  for (const a of r.acciones) {\n    const t0 = Date.now()\n",
      `  for (const a of r.acciones) {\n    if (Date.now() - T0 > ${PRESUPUESTO_DE_LECTURA_MS}) { (salida.${campo}.omitidas_por_tiempo = salida.${campo}.omitidas_por_tiempo || []).push(a.funcion + (a.objetivo ? ' · ' + a.objetivo : '')); continue }\n    const t0 = Date.now()\n`, 'bucle ' + campo)
    x = cambiar(x, "await http({ url: N8N + '/webhook/apify-service-workflow', method: 'POST',", "await http({ timeout: RESTA_MS(), url: N8N + '/webhook/apify-service-workflow', method: 'POST',", 'tiempo ' + campo)
    return x
  })
}

export function codigoDelPuente(original) {
  return conFinDeLinea(original, (c) => {
    let x = c
    x = cambiar(x, "const previos = $(", reloj + "const previos = $(", 'cabecera puente')
    x = cambiar(x, "v < 12 && p && typeof p.quedan === 'number' && p.quedan > 0 && e.dry_run !== true; v++) {", `v < 12 && Date.now() - T0 < ${PRESUPUESTO_DE_LECTURA_MS} && p && typeof p.quedan === 'number' && p.quedan > 0 && e.dry_run !== true; v++) {`, 'vueltas')
    x = cambiar(x, "const r = await http({ url: ORIGEN + '/api/brain/alimentar/puente',", "const r = await http({ timeout: RESTA_MS(), url: ORIGEN + '/api/brain/alimentar/puente',", 'tiempo puente')
    return x
  })
}

export function portero(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const m = f.nodes.filter((x) => x.name === n); if (m.length !== 1) throw new Error(m.length + ' nodos «' + n + '»'); return m[0] }
  if (JSON.stringify(f).includes('RESTA_MS')) throw new Error('el flujo ya tiene el presupuesto de tiempo')
  const amp = nodo(NODO_AMPLIAR)
  const orig = amp.parameters.jsCode
  const ids = (k) => '00303605-a2e8-467a-ba0f-47d87a4a70' + String(k).padStart(2, '0')
  NODOS_TANDA.forEach((nombre, k) => {
    f.nodes.push({ ...JSON.parse(JSON.stringify(amp)), id: ids(k + 1), name: nombre, position: [amp.position[0] - 220 * (NODOS_TANDA.length - k), amp.position[1]], parameters: { ...amp.parameters, jsCode: codigoDeAmpliar(orig, false) } })
  })
  amp.parameters.jsCode = codigoDeAmpliar(orig, true)
  // conexiones: ① Plan unificado → tanda 1 → tanda 2 → ② Ampliar
  const plan = f.connections['① Plan unificado']
  if (!plan || plan.main[0].length !== 1 || plan.main[0][0].node !== NODO_AMPLIAR) throw new Error('las conexiones de ① Plan unificado no son las esperadas')
  plan.main[0][0].node = NODOS_TANDA[0]
  f.connections[NODOS_TANDA[0]] = { main: [[{ node: NODOS_TANDA[1], type: 'main', index: 0 }]] }
  f.connections[NODOS_TANDA[1]] = { main: [[{ node: NODO_AMPLIAR, type: 'main', index: 0 }]] }
  const bis = nodo(NODO_BIS); bis.parameters.jsCode = codigoDeLectura(bis.parameters.jsCode, 'articulos')
  const ter = nodo(NODO_TER); ter.parameters.jsCode = codigoDeLectura(ter.parameters.jsCode, 'tanda2')
  const pte = nodo(NODO_PUENTE); pte.parameters.jsCode = codigoDelPuente(pte.parameters.jsCode)
  for (const n of [amp, ...NODOS_TANDA.map(nodo), bis, ter, pte]) n.parameters.jsCode = capturar(n.parameters.jsCode)
  return f
}

if (process.argv[1] && /construir-presupuesto-de-tiempo\.mjs$/.test(process.argv[1])) {
  const antes = JSON.parse(fs.readFileSync(ANTES, 'utf8'))
  const despues = portero(antes)
  fs.writeFileSync(ARREGLADO, JSON.stringify(despues, null, 1))
  console.log('ARREGLADO escrito:', ARREGLADO, '· nodos', antes.nodes.length, '→', despues.nodes.length)
}
