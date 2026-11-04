/**
 * 04-nov · cable de la devolución de finanzas (LISTO de CC#1 «finanzas sobre el acta, opción A» #908) · lado n8n de CC#2 en el plan `X9F0zp6LQ2xGEYVS`.
 * Contrato (CC#1): la firma trae `viabilidad: { no_viable, motivo, cifra }` (solo con acta). Con `no_viable: true` y la mesa sin devolver → `devolver` a la mesa con `motivo` y `cifra`, avanzar hasta cerrar,
 * y abrir finanzas DE NUEVO con el acta nueva (un encargo nuevo: el anterior ya cerró). Si vuelve a dar `no_viable`, sigue al redactor. UNA sola vuelta.
 * Qué hace (solo corre si la mesa corrió Y finanzas dijo `no_viable`; apagada o viable, el plan es el de hoy):
 *   · «FIN · cerrar la oficina» (y su gemelo) deja pasar `viabilidad` de la firma.
 *   · `MESA · ¿devuelve finanzas?` → preparar → devolver → decidir ↔ avanzar (lazo propio, plazo propio) → cerrar la devolución → `MESA · ¿hay acta nueva?`.
 *   · Con acta nueva: una SEGUNDA pasada de finanzas, nodos `FIN2 · …` (gemelos de los de la primera; así cada lazo cuenta sus propias vueltas). Sin acta nueva (la reconsolidación falló, o `devolver` no se pudo): sigue con la primera pasada, sin gastar de más.
 *   · `FIN · sobre` usa el resultado de la 2ª pasada solo si trae tablero (`finanzas_id`); si no, el de la 1ª. `Redactor (B4)` escribe sobre el acta más nueva (la de la devolución si existe).
 * La 2ª pasada NO pausa para el dueño (si la plataforma la pausara, queda declarada como «sin bloque» y el plan sigue con la 1ª).
 */
import { agregarNodo, cambiarCodigo as cambiarCodigoLF, codigo, conectar, nodo, redirigir } from './lib.mjs'

/** como `cambiarCodigo`, pero respeta los saltos de línea del nodo (algunos del vivo vienen con CRLF) */
function cambiarCodigo(f, nombre, viejo, nuevo) {
  const CRLF = String.fromCharCode(13, 10), LF = String.fromCharCode(10)
  const crlf = nodo(f, nombre).parameters.jsCode.includes(CRLF)
  const a = (t) => (crlf ? t.split(CRLF).join(LF).split(LF).join(CRLF) : t)
  cambiarCodigoLF(f, nombre, a(viejo), a(nuevo))
}

export const N_DEV_SI = 'MESA · ¿devuelve finanzas?'
export const N_DEV_PREP = 'MESA · preparar la devolución'
export const N_DEV_HTTP = 'MESA · devolver a la mesa'
export const N_DEV_DECIDIR = 'MESA · decidir la devolución'
export const N_DEV_SIGUE = 'MESA · ¿sigue la devolución?'
export const N_DEV_AVANZAR = 'MESA · avanzar la devolución'
export const N_DEV_CERRAR = 'MESA · cerrar la devolución'
export const N_DEV_NUEVA = 'MESA · ¿hay acta nueva?'
const N_FIN_CERRAR = 'FIN · cerrar la oficina'
const N_FIN_SOBRE = 'FIN · sobre'
const N_MESA_CERRAR = 'MESA · cerrar el acta'
const N_B4 = 'Redactor (B4)'
/** los nodos de la primera pasada de finanzas que se copian (sin la pausa); `FIN · X` → `FIN2 · X` */
export const FIN_CLONADOS = ['armar la semilla', 'abrir la conversación', 'decidir', '¿sigue la conversación?', 'avanzar un paso', '¿leer la firma?', 'leer el encargo', 'cerrar la oficina', 'preguntar al dueño']
export const dos = (n) => n.replace(/^FIN · /, 'FIN2 · ')

export const SI_DEVUELVE = `={{ (function () { try { const m = $('${N_MESA_CERRAR}').first().json; if (!(m && m.mesa === true && typeof m.encargo_id === 'string' && m.encargo_id)) return false; const c = $('${N_FIN_CERRAR}').first().json; return !!(c && c.viabilidad && c.viabilidad.no_viable === true) } catch (e) { return false } })() }}`
export const SI_ACTA_NUEVA = '={{ !!($json.acta && $json.devuelta === true) }}'

export const CODIGO_PREPARAR = String.raw`// 04-nov · finanzas dijo «no viable»: se prepara lo que se le devuelve a la mesa (el motivo y la cifra los puso la firma). UNA sola vez: este camino solo se recorre desde la primera pasada.
const m = $('${N_MESA_CERRAR}').first().json || {}
const c = $('${N_FIN_CERRAR}').first().json || {}
const v = c.viabilidad && typeof c.viabilidad === 'object' ? c.viabilidad : {}
const motivo = typeof v.motivo === 'string' && v.motivo.trim() ? v.motivo.trim().slice(0, 1500) : 'finanzas dice que el plan no es viable con este reparto'
return [{ json: { encargo_id: String(m.encargo_id), motivo: motivo, cifra: v.cifra === undefined ? null : v.cifra, t0: Date.now() } }]`

export const CODIGO_DEV_DECIDIR = String.raw`// 04-nov · a dónde sigue la reunión corta de la devolución. Aquí NADA tumba el plan: si no se pudo devolver o la mesa no cerró, sigue la primera pasada (sin acta nueva). Nunca lanza.
const PLAZO_MS = 1800000
const MAX_PASOS = 24
const ESPERA_MS = 20000
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
const http = Number(r.statusCode)
const vuelta = Number($runIndex) || 0
const p = $('${N_DEV_PREP}').first().json
const id = p.encargo_id
const t0 = Number(p.t0) || Date.now()
const txtHttp = Number.isFinite(http) ? http : 'sin respuesta'
if (vuelta === 0) {
  if (http === 200 && b.devuelta === true) return [{ json: { fin: false, encargo_id: id } }]
  return [{ json: { fin: true, encargo_id: id, motivo: 'sin_devolver', detalle: 'la mesa no aceptó la devolución (HTTP ' + txtHttp + (b.error ? ' ' + String(b.error) : '') + ')' } }]
}
if (http === 409 && b.error === 'paso_en_vuelo') {
  try { await new Promise(function (ok) { setTimeout(ok, ESPERA_MS) }) } catch (x) {}
  if (Date.now() - t0 > PLAZO_MS || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó la devolución a tiempo' } }]
  return [{ json: { fin: false, encargo_id: id } }]
}
if (!(http === 200)) return [{ json: { fin: true, encargo_id: id, motivo: 'sin_contestar', detalle: 'la mesa dejó de contestar en la devolución (HTTP ' + txtHttp + ')' } }]
if (b.terminado === true) return [{ json: { fin: true, encargo_id: id, estado: String(b.estado || ''), acta: b.acta || null, faltan: b.faltan || [], razon: b.razon || null } }]
if (Date.now() - t0 > PLAZO_MS || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó la devolución a tiempo' } }]
return [{ json: { fin: false, encargo_id: id } }]`

export const CODIGO_DEV_CERRAR = String.raw`// 04-nov · cierra la devolución: solo un acta NUEVA, cerrada y bien formada abre la segunda pasada de finanzas. Todo lo demás: sigue la primera pasada (se declara, no se frena el plan).
const d = $('${N_DEV_DECIDIR}').first().json || {}
const a = d.acta
const bien = d.estado === 'cerrado' && a && typeof a === 'object' && a.esquema === 'acta.v1' && Array.isArray(a.canales) && a.canales.length > 0 && a.numero && typeof a.numero === 'object' && Number(a.numero.meta) > 0
if (!bien) return [{ json: { mesa: true, devuelta: false, sin_acta_nueva: true, estado: String(d.estado || ''), motivo: d.motivo || null, detalle: String(d.detalle || d.razon || '').slice(0, 300) } }]
return [{ json: { mesa: true, devuelta: true, acta: a, encargo_id: d.encargo_id, aportes_que_faltan: Array.isArray(d.faltan) ? d.faltan : [] } }]`

const ACTA_VIEJA = "    const m = $('MESA · cerrar el acta').first().json\n    const a = m && m.mesa === true ? m.acta : null\n"
const ACTA_NUEVA = "    let m = null\n    try { const d = $('" + N_DEV_CERRAR + "').first().json; if (d && d.devuelta === true && d.acta) m = d } catch (e) { m = null }\n    if (!m) m = $('MESA · cerrar el acta').first().json\n    const a = m && m.mesa === true ? m.acta : null\n"

export function construirDevolucionALaMesa(f) {
  // 1 · la firma deja pasar la viabilidad (primera pasada y, al clonar, la segunda)
  cambiarCodigo(f, N_FIN_CERRAR, "const MAPA = {", "const via = salida && salida.viabilidad && typeof salida.viabilidad === 'object' ? salida.viabilidad : null\nconst MAPA = {")
  cambiarCodigo(f, N_FIN_CERRAR, "if (salida.estado === 'firmado') return [{ json: { finanzas_id: id, finanzas_motivo: null } }]", "if (salida.estado === 'firmado') return [{ json: { finanzas_id: id, finanzas_motivo: null, viabilidad: via } }]")
  cambiarCodigo(f, N_FIN_CERRAR, "return [{ json: { finanzas_id: id, finanzas_motivo: estado === 'sin_acuerdo' || salida.sin_acuerdo === true ? 'sin_acuerdo' : 'sin_firma' } }]", "return [{ json: { finanzas_id: id, finanzas_motivo: estado === 'sin_acuerdo' || salida.sin_acuerdo === true ? 'sin_acuerdo' : 'sin_firma', viabilidad: via } }]")

  // 2 · la segunda pasada de finanzas: gemelos `FIN2 · …`
  const NOMBRES = FIN_CLONADOS.map((n) => 'FIN · ' + n)
  const reemplazos = (txt) => {
    let t = txt
    for (const n of NOMBRES) t = t.split("$('" + n + "')").join("$('" + dos(n) + "')")
    return t
  }
  let ancla = N_FIN_CERRAR, dx = 0
  for (const n of NOMBRES) {
    const o = JSON.parse(JSON.stringify(nodo(f, n)))
    const def = { name: dos(n), type: o.type, typeVersion: o.typeVersion, parameters: JSON.parse(reemplazos(JSON.stringify(o.parameters))) }
    if (o.onError) def.onError = o.onError
    if (n === 'FIN · armar la semilla') {
      def.parameters.jsCode = def.parameters.jsCode.split("$('" + N_MESA_CERRAR + "')").join("$('" + N_DEV_CERRAR + "')")
      if (!def.parameters.jsCode.includes(N_DEV_CERRAR)) throw new Error('la semilla de finanzas no lee el acta de la mesa: cambió de forma')
    }
    agregarNodo(f, def, ancla, 0, 0)
    nodo(f, def.name).position = [nodo(f, n).position[0], nodo(f, n).position[1] + 1100]
    dx += 240
  }
  const cx = (de, a, salida = 0) => conectar(f, dos('FIN · ' + de), dos('FIN · ' + a), salida)
  cx('armar la semilla', 'abrir la conversación'); cx('abrir la conversación', 'decidir'); cx('decidir', '¿sigue la conversación?')
  cx('¿sigue la conversación?', 'avanzar un paso', 0); cx('¿sigue la conversación?', '¿leer la firma?', 1); cx('avanzar un paso', 'decidir')
  cx('¿leer la firma?', 'leer el encargo', 0); cx('¿leer la firma?', 'cerrar la oficina', 1); cx('leer el encargo', 'cerrar la oficina')
  cx('cerrar la oficina', 'preguntar al dueño', 0); conectar(f, dos(N_FIN_CERRAR), N_FIN_SOBRE, 0)

  // 3 · el camino de la devolución, entre «cerrar la oficina» y «sobre»
  const base = nodo(f, N_FIN_CERRAR)
  const a = (def, dy) => { const n = agregarNodo(f, def, N_FIN_CERRAR, 0, 0); n.position = [base.position[0] + 240 * (dy.i), base.position[1] + 560]; return n }
  const sigue = JSON.parse(JSON.stringify(nodo(f, 'MESA · ¿sigue la reunión?')))
  const avanzar = JSON.parse(JSON.stringify(nodo(f, 'MESA · avanzar un paso')))
  const devolver = JSON.parse(JSON.stringify(nodo(f, 'MESA · abrir la mesa')))
  devolver.parameters.jsonBody = "={{ JSON.stringify(Object.assign({ accion: 'devolver', encargo_id: $json.encargo_id, motivo: $json.motivo, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }, $json.cifra === null || $json.cifra === undefined ? {} : { cifra: $json.cifra })) }}"
  avanzar.parameters.jsonBody = avanzar.parameters.jsonBody.split("$('MESA · decidir')").join("$('" + N_DEV_PREP + "')")
  if (!avanzar.parameters.jsonBody.includes(N_DEV_PREP)) throw new Error('«MESA · avanzar un paso» cambió de forma: no se halla la lectura del encargo')
  const si = (name, expr) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } })
  const http = (name, o) => ({ name, type: o.type, typeVersion: o.typeVersion, onError: o.onError, parameters: o.parameters })
  a(si(N_DEV_SI, SI_DEVUELVE), { i: 1 })
  a(codigo(N_DEV_PREP, CODIGO_PREPARAR), { i: 2 })
  a(http(N_DEV_HTTP, devolver), { i: 3 })
  a(codigo(N_DEV_DECIDIR, CODIGO_DEV_DECIDIR), { i: 4 })
  a({ name: N_DEV_SIGUE, type: sigue.type, typeVersion: sigue.typeVersion, parameters: sigue.parameters }, { i: 5 })
  a(http(N_DEV_AVANZAR, avanzar), { i: 6 })
  a(codigo(N_DEV_CERRAR, CODIGO_DEV_CERRAR), { i: 7 })
  a(si(N_DEV_NUEVA, SI_ACTA_NUEVA), { i: 8 })
  // «cerrar la oficina» ya no entrega directo a «sobre»: pasa por la puerta de la devolución
  redirigir(f, N_FIN_CERRAR, N_FIN_SOBRE, N_DEV_SI, 0)
  conectar(f, N_DEV_SI, N_DEV_PREP, 0); conectar(f, N_DEV_SI, N_FIN_SOBRE, 1)
  conectar(f, N_DEV_PREP, N_DEV_HTTP); conectar(f, N_DEV_HTTP, N_DEV_DECIDIR); conectar(f, N_DEV_DECIDIR, N_DEV_SIGUE)
  conectar(f, N_DEV_SIGUE, N_DEV_AVANZAR, 0); conectar(f, N_DEV_SIGUE, N_DEV_CERRAR, 1); conectar(f, N_DEV_AVANZAR, N_DEV_DECIDIR)
  conectar(f, N_DEV_CERRAR, N_DEV_NUEVA)
  conectar(f, N_DEV_NUEVA, dos('FIN · armar la semilla'), 0); conectar(f, N_DEV_NUEVA, N_FIN_SOBRE, 1)

  // 4 · el sobre usa la segunda pasada solo si trae tablero; el redactor, el acta más nueva
  cambiarCodigo(f, N_FIN_SOBRE, "const c = $('FIN · cerrar la oficina').first().json;",
    "let c = null; try { const c2 = $('" + dos(N_FIN_CERRAR) + "').first().json; if (c2 && c2.finanzas_id) c = c2 } catch (x2) { c = null }; if (!c) c = $('FIN · cerrar la oficina').first().json;")
  cambiarCodigo(f, N_B4, ACTA_VIEJA, ACTA_NUEVA)
}
