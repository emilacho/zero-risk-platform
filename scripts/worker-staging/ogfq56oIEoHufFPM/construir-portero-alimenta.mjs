// Construye el flujo «Cerebro · mantenimiento diario del portero» (ogfq56oIEoHufFPM) en su versión que ALIMENTA, a partir de su copia ANTES. NO toca n8n: escribe el JSON ARREGLADO.
//   node scripts/worker-staging/ogfq56oIEoHufFPM/construir-portero-alimenta.mjs
// Reutiliza lo de hoy (webhook con llave, horario, ⓪ Entrada, ① elemento por cliente, ② Ampliar) y AÑADE:
//   ① Descubrir (plan unificado y diario) · ① Plan unificado · ② bis Artículos · ② ter Reseñas y videos · ④ Alimentar (filtrar → razonar → archivar) · ④ bis Puente (repite hasta terminar) · ⑤ Cierre
// RETIRADOS (sin lector, no se encienden nunca): ③ Pedido a correr y ③ Correr (`/api/brain/diario/correr`); la lista de clientes sale de `…/alimentar/descubrir` con `fase:'clientes'`.
// El flujo queda INACTIVO (`active:false`). Encenderlo es el último paso de la lista de encendido, con interruptores y «dale».
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const antes = JSON.parse(fs.readFileSync(path.join(aqui, 'ogfq56oIEoHufFPM-ANTES-2026-10-14.json'), 'utf8'))
const w = JSON.parse(JSON.stringify(antes))
const por = (n) => w.nodes.find((x) => x.name === n)
const ORIGEN = 'https://zero-risk-platform.vercel.app'
const cabecera = { sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] } }
const http = (name, id, pos, url, jsonBody, timeout = 120000) => ({
  parameters: { method: 'POST', url: `${ORIGEN}${url}`, ...cabecera, sendBody: true, specifyBody: 'json', jsonBody, options: { timeout, response: { response: { neverError: true } } } },
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
})
const code = (name, id, pos, jsCode) => ({ parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos })
// el cuerpo común: un cliente real o, si no hay cliente (plan fallido / sin clientes), un uuid que la ruta contesta 404 sin leer nada
const NADIE = '00000000-0000-4000-8000-000000000000'
const cuerpo = (extra = '') => `={{ JSON.stringify({ dry_run: $json.dry_run, client_id: $json.cliente || '${NADIE}', workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id${extra} }) }}`

// ───────── ① la lista de clientes activos sale de la ruta NUEVA (la vieja `diario/plan` está RETIRADA)
const clientesNodo = por('① Plan de la ampliación')
clientesNodo.name = '① Clientes activos'
clientesNodo.parameters.url = `${ORIGEN}/api/brain/alimentar/descubrir`
clientesNodo.parameters.jsonBody = "={{ JSON.stringify({ dry_run: $json.dry_run, fase: 'clientes', ...($json.client_id ? { client_id: $json.client_id } : {}), workflow_id: $json.workflow_id, workflow_execution_id: $json.workflow_execution_id }) }}"

// ───────── ① Descubrir + ① Plan unificado (reemplazan las acciones del plan de hoy por el plan unificado y diario)
const descubrir = http('① Descubrir (el portero que alimenta)', '6f0a1c10-0001-4a00-8000-00000000d001', [1040, 0], '/api/brain/alimentar/descubrir', cuerpo())
const unificado = code('① Plan unificado', '6f0a1c10-0002-4a00-8000-00000000d002', [1300, 0], `// ① PLAN UNIFICADO · junta, por cliente, lo que el plan de hoy dijo (quién es cliente activo) con lo que dice el portero que alimenta (qué pedirle hoy a Apify: TODO diario, tope US$ 1,50).
// 🔴 Si el portero está APAGADO (PORTERO_ALIMENTAR) la ruta contesta {apagado:true}: aquí no hay acciones y el flujo no pide nada nuevo. Un fallo se DICE; nunca se lee como «no hay nada».
const base = $('① Un elemento por cliente').all().map((i) => i.json)
const resp = $input.all().map((i) => { const r = i.json || {}; return r.body ? r.body : r })
return base.map((e, k) => {
  const r = resp[k] || {}
  if (e.falla || !e.cliente) return { json: { ...e, portero: { omitido: true } } }
  if (r.apagado) return { json: { ...e, acciones: [], omitidas: [], no_cubiertas: [], portero: { apagado: true } } }
  if (r.error || !r.plan) return { json: { ...e, acciones: [], falla: 'El portero no pudo armar el plan: ' + String(r.error || r.detalle || 'sin respuesta'), portero: { error: true } } }
  return { json: { ...e, acciones: r.plan.hacer || [], omitidas: r.plan.omitidas || [], no_cubiertas: r.plan.no_cubiertas || [], gastado_hoy_usd: (r.gasto_de_hoy && r.gasto_de_hoy.total_usd) || 0,
    portero: { tope_usd: r.tope_por_cliente_usd, costo_maximo_del_plan_usd: r.plan.costo_maximo_del_plan_usd, propuestas: (r.propuestas && r.propuestas.aceptadas) || [] } } }
})`)

// ───────── ② bis · segunda tanda: lee las ≤ 3 páginas de la búsqueda de hoy
const articulos = http('② bis Artículos (qué leer)', '6f0a1c10-0003-4a00-8000-00000000d003', [1560, 0], '/api/brain/alimentar/descubrir', cuerpo(", fase: 'articulos'"))
const ampliar = por('② Ampliar (Servicio de Apify)').parameters.jsCode
const leer = code('② bis Leer artículos (Servicio de Apify)', '6f0a1c10-0004-4a00-8000-00000000d004', [1820, 0], `// ② bis · LEE las páginas que el portero eligió de la búsqueda de hoy (≤ 3, nunca el sitio propio ni redes). Misma regla que ②: con dry_run NO llama a nadie; una llamada por página, SIN reintento.
// El Servicio guarda SOLO calling_workflow_id como llamado_por: la tanda lleva el sufijo «#articulo» para que el portero sepa que es una página de un tercero.
const N8N = 'https://n8n-production-72be.up.railway.app'
const http = async (o) => this.helpers.httpRequest({ json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 140000, ...o })
const previos = $('② Ampliar (Servicio de Apify)').all().map((i) => i.json)
const resp = $input.all().map((i) => { const r = i.json || {}; return r.body ? r.body : r })
const salidas = []
for (let k = 0; k < previos.length; k++) {
  const e = previos[k]
  const r = resp[k] || {}
  const salida = { ...e, articulos: { hecho: false, llamadas: [], gasto_usd: 0, omitidas: r.omitidas || [] } }
  if (e.falla || !e.cliente || e.dry_run === true || r.apagado || !Array.isArray(r.acciones)) { salida.articulos.nota = e.dry_run === true ? 'dry_run: no se llamó a ningún proveedor' : 'sin páginas que leer'; salidas.push({ json: salida }); continue }
  for (const a of r.acciones) {
    const t0 = Date.now()
    const x = await http({ url: N8N + '/webhook/apify-service-workflow', method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: { client_id: e.cliente, apify_function: a.funcion, params: a.params, destination: 'respuesta', dry_run: false, metadata: { ...(a.metadata || {}), calling_workflow_id: e.workflow_id + '#articulo' } } })
    const b = x.body && typeof x.body === 'object' ? x.body : {}
    const ok = x.statusCode === 200 && b.ok === true
    salida.articulos.llamadas.push({ funcion: a.funcion, objetivo: a.objetivo, hecho: ok, http: x.statusCode, ms: Date.now() - t0, usd_max: a.usd_max })
    salida.articulos.gasto_usd = Number((salida.articulos.gasto_usd + (typeof a.usd_max === 'number' ? a.usd_max : 0)).toFixed(6))
  }
  salida.articulos.hecho = salida.articulos.llamadas.length > 0 && salida.articulos.llamadas.every((l) => l.hecho)
  // el gasto de las páginas se suma al de la ampliación para que \`correr\` lo compare con el tope
  salida.ampliacion = { ...(e.ampliacion || {}), gasto_usd: Number((((e.ampliacion && e.ampliacion.gasto_usd) || 0) + salida.articulos.gasto_usd).toFixed(6)) }
  salidas.push({ json: salida })
}
return salidas`)


// ───────── ② ter · tanda 2: reseñas de la ficha de Mapas (≤ 100) y videos de Instagram SOLO si hay publicaciones nuevas (se revisa todos los días)
const tanda2 = http('② ter Reseñas y videos (qué pedir)', '6f0a1c10-0006-4a00-8000-00000000d006', [2080, 0], '/api/brain/alimentar/descubrir', cuerpo(", fase: 'tanda2'"))
const leerTanda2 = code('② ter Leer reseñas y videos (Servicio de Apify)', '6f0a1c10-0007-4a00-8000-00000000d007', [2340, 0], `// ② ter · pide al Servicio lo que la tanda 1 hizo posible: las reseñas de la ficha CONFIRMADA de Mapas y los videos de Instagram solo si hubo publicaciones nuevas.
// Misma regla que ②: con dry_run NO llama a nadie; una llamada por acción, SIN reintento. Sufijo «#tanda2» en calling_workflow_id.
const N8N = 'https://n8n-production-72be.up.railway.app'
const http = async (o) => this.helpers.httpRequest({ json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 140000, ...o })
const previos = $('② bis Leer artículos (Servicio de Apify)').all().map((i) => i.json)
const resp = $input.all().map((i) => { const r = i.json || {}; return r.body ? r.body : r })
const salidas = []
for (let k = 0; k < previos.length; k++) {
  const e = previos[k]
  const r = resp[k] || {}
  const salida = { ...e, tanda2: { hecho: false, llamadas: [], gasto_usd: 0, omitidas: r.omitidas || [], revision: r.revision_de_publicaciones || null } }
  if (e.falla || !e.cliente || e.dry_run === true || r.apagado || !Array.isArray(r.acciones)) { salida.tanda2.nota = e.dry_run === true ? 'dry_run: no se llamó a ningún proveedor' : 'sin nada que pedir'; salidas.push({ json: salida }); continue }
  for (const a of r.acciones) {
    const t0 = Date.now()
    const x = await http({ url: N8N + '/webhook/apify-service-workflow', method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: { client_id: e.cliente, apify_function: a.funcion, params: a.params, destination: 'respuesta', dry_run: false, metadata: { ...(a.metadata || {}), calling_workflow_id: e.workflow_id + '#tanda2' } } })
    const b = x.body && typeof x.body === 'object' ? x.body : {}
    salida.tanda2.llamadas.push({ funcion: a.funcion, objetivo: a.objetivo, hecho: x.statusCode === 200 && b.ok === true, http: x.statusCode, ms: Date.now() - t0, usd_max: a.usd_max })
    salida.tanda2.gasto_usd = Number((salida.tanda2.gasto_usd + (typeof a.usd_max === 'number' ? a.usd_max : 0)).toFixed(6))
  }
  salida.tanda2.hecho = salida.tanda2.llamadas.length > 0 && salida.tanda2.llamadas.every((l) => l.hecho)
  salida.ampliacion = { ...(e.ampliacion || {}), gasto_usd: Number((((e.ampliacion && e.ampliacion.gasto_usd) || 0) + salida.tanda2.gasto_usd).toFixed(6)) }
  salidas.push({ json: salida })
}
return salidas`)

// ───────── ④ Alimentar + ⑤ Cierre
const alimentar = http('④ Alimentar (filtrar · razonar · archivar)', '6f0a1c10-0005-4a00-8000-00000000d005', [2600, 0], '/api/brain/alimentar/procesar', cuerpo(), 280000)
// ④ bis · el puente por pasadas: cada llamada envía ≤ 40 trozos y dice cuántos `quedan`; se repite hasta 0 (tope 12 vueltas por cliente), sin 504
const puenteNodo = code('④ bis Puente (repetir hasta terminar)', '6f0a1c10-0008-4a00-8000-00000000d008', [2860, 0], `// ④ bis · RECONCILIA el puente a la biblioteca por pasadas de ≤ 40 trozos hasta que no quede nada (idempotente). Con dry_run solo cuenta (una llamada).
// Una falla se DICE; nunca se lee como «no queda nada». No llama a Apify ni a ningún modelo.
const ORIGEN = '${ORIGEN}'
const http = async (o) => this.helpers.httpRequest({ json: true, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 130000, ...o })
const previos = $('② ter Leer reseñas y videos (Servicio de Apify)').all().map((i) => i.json)
const alimentadas = $input.all().map((i) => { const r = i.json || {}; return r.body ? r.body : r })
const salidas = []
for (let k = 0; k < previos.length; k++) {
  const e = previos[k]
  const a = alimentadas[k] || {}
  const salida = { ...e, alimentada: a, puente_final: null }
  if (e.falla || !e.cliente || a.apagado) { salidas.push({ json: salida }); continue }
  let p = a.puente || null
  const vueltas = []
  for (let v = 0; v < 12 && p && typeof p.quedan === 'number' && p.quedan > 0 && e.dry_run !== true; v++) {
    const r = await http({ url: ORIGEN + '/api/brain/alimentar/puente', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': $env.INTERNAL_API_KEY },
      body: { client_id: e.cliente, dry_run: false, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id } })
    const b = r.body && typeof r.body === 'object' ? r.body : {}
    vueltas.push({ http: r.statusCode, quedan: b.puente && b.puente.quedan, errores: b.errores || [] })
    if (r.statusCode !== 200 || !b.puente) { p = { ...(p || {}), falla: 'el puente respondió ' + r.statusCode }; break }
    p = b.puente
  }
  salida.puente_final = p ? { ...p, vueltas } : null
  salidas.push({ json: salida })
}
return salidas`)
const cierre = por('④ Cierre')
cierre.name = '⑤ Cierre'
cierre.position = [2600, 0]
cierre.parameters.jsCode = `// ⑤ CIERRE · una línea por cliente: qué pidió el portero, qué leyó, qué archivó (suma / reemplaza / nada / duda), qué quedó en la biblioteca y qué costó. Un error se DICE.
const clientes = $input.all().map((i) => i.json).map((p) => {
  const a = p.alimentada || {}
  const res = (a.plan && a.plan.resumen) || {}
  const q = p.puente_final || {}
  return {
    cliente: p.cliente || null,
    plan_fallo: p.falla || null,
    portero: p.portero || null,
    ampliacion: p.ampliacion ? { hecho: p.ampliacion.hecho, gasto_usd: p.ampliacion.gasto_usd, parado: p.ampliacion.parado, llamadas: (p.ampliacion.llamadas || []).length } : null,
    articulos: p.articulos ? { hecho: p.articulos.hecho, llamadas: (p.articulos.llamadas || []).length, gasto_usd: p.articulos.gasto_usd } : null,
    tanda2: p.tanda2 ? { hecho: p.tanda2.hecho, llamadas: (p.tanda2.llamadas || []).map((l) => l.funcion), gasto_usd: p.tanda2.gasto_usd, revision: p.tanda2.revision, omitidas: (p.tanda2.omitidas || []).map((o) => o.fuente + ': ' + o.por_que) } : null,
    alimentar: a.apagado ? 'apagado' : a.estado || (p.falla ? 'saltado' : 'sin_respuesta'),
    suma: res.suma || 0, reemplaza: res.reemplaza || 0, nada: res.nada || 0, duda: res.duda || 0, sin_confirmar: res.sin_confirmar || 0,
    modelo_usd: (a.gasto && a.gasto.modelo_usd) || 0,
    puente: { quedan: typeof q.quedan === 'number' ? q.quedan : null, vueltas: (q.vueltas || []).length, falla: q.falla || q.lectura_fallida || null },
    errores: [].concat(Array.isArray(a.errores) ? a.errores : []),
    detalle: a.detalle || a.error || null,
  }
})
const e = $('⓪ Entrada').first().json
const malo = clientes.some((c) => c.plan_fallo || c.errores.length > 0 || c.puente.falla || (typeof c.puente.quedan === 'number' && c.puente.quedan > 0) || ['con_errores', 'lectura_fallida', 'sin_respuesta'].includes(c.alimentar))
return [{ json: { fin: malo ? 'con_errores' : 'hecho', via: e.via, dry_run: e.dry_run, clientes } }]`

// ───────── montaje
w.nodes = w.nodes.filter((n) => n.name !== '③ Pedido a correr' && n.name !== '③ Correr (comparar · limpiar · preparar)') // retirados: sin lector
w.nodes.push(descubrir, unificado, articulos, leer, tanda2, leerTanda2, alimentar, puenteNodo)
// recolocar para que el lienzo se lea de izquierda a derecha
const pos = { '① Clientes activos': [520, 0], '① Un elemento por cliente': [780, 0], '② Ampliar (Servicio de Apify)': [1560, 0] }
for (const [n, p] of Object.entries(pos)) por(n).position = p
tanda2.position = [2080, 0]
leerTanda2.position = [2340, 0]
alimentar.position = [2600, 0]
puenteNodo.position = [2860, 0]
cierre.position = [3120, 0]
w.name = 'Zero Risk — Cerebro · mantenimiento diario del portero (que ALIMENTA) · CC-CEREBRO' // n8n rechaza nombres de más de 128 caracteres
w.active = false
const c = w.connections
const sig = (de, a) => { c[de] = { main: [[{ node: a, type: 'main', index: 0 }]] } }
sig('① Un elemento por cliente', descubrir.name)
sig(descubrir.name, unificado.name)
sig(unificado.name, '② Ampliar (Servicio de Apify)')
sig('② Ampliar (Servicio de Apify)', articulos.name)
sig(articulos.name, leer.name)
sig(leer.name, tanda2.name)
sig(tanda2.name, leerTanda2.name)
sig(leerTanda2.name, alimentar.name)
sig(alimentar.name, puenteNodo.name)
sig(puenteNodo.name, cierre.name)
c['① Clientes activos'] = c['① Plan de la ampliación']
delete c['① Plan de la ampliación']
for (const k of Object.keys(c)) for (const b of c[k].main) for (const t of b) if (t.node === '① Plan de la ampliación') t.node = '① Clientes activos'
delete c['③ Pedido a correr']
delete c['③ Correr (comparar · limpiar · preparar)']
delete c['④ Cierre']
// se quita lo que el API no acepta al crear/actualizar
const salida = { name: w.name, nodes: w.nodes, connections: w.connections, settings: { executionOrder: 'v1' }, staticData: null }
const dest = path.join(aqui, 'ogfq56oIEoHufFPM-ARREGLADO-alimenta-2026-10-14.json')
fs.writeFileSync(dest, JSON.stringify(salida, null, 2))
console.log('escrito', dest, '· nodos', w.nodes.length)
