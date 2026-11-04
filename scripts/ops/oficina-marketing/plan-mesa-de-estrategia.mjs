/**
 * 04-nov · GO Lenovo «construir la mesa de estrategia» (18:07Z) · lazo n8n de CC#2 en el plan `X9F0zp6LQ2xGEYVS`. Diseño: `DISENO-CC2…mesa-de-estrategia-del-plan-lado-n8n`. Plataforma (CC#1, #903): `POST /api/planeacion/mesa`.
 * Contrato: `abrir` { client_id, dry_run, trabajo_id, semilla, workflow_id } · `avanzar` { encargo_id } (409 paso_en_vuelo = reintenta; 409 mesa_apagada = pasa de largo) · termina cuando `terminado` es true; solo `estado: cerrado` trae `acta`.
 * Qué hace (todo detrás del interruptor: el pre-vuelo contesta `mesa: true` solo si está encendida; apagada, el plan es EXACTAMENTE el de hoy):
 *   · «V9 · decidir»: deja pasar `mesa` (true solo si el pre-vuelo dijo true).
 *   · Subgrafo `MESA · …` entre el paquete (PV3) y «FIN · ¿abre la oficina?»: ¿abre la mesa? → armar la semilla → abrir → decidir ↔ avanzar → cerrar el acta.
 *   · «MESA · cerrar el acta»: SIN acta válida (sin_acuerdo, cierre_por_tope, fallido, vencido) la ejecución falla EN ROJO: nunca un plan sin mesa en silencio ni a ciegas.
 *   · «FIN · armar la semilla»: lleva el acta (`semilla.acta`) para que finanzas calcule SOBRE ella.
 *   · «Redactor (B4)»: bloque «LO QUE ACORDÓ LA MESA» (antes del calendario) y `acta_usada` en la salida. Sin acta o mal formada: el pedido es el de hoy.
 * NO incluye (esperan a CC#1/Lenovo): la devolución de finanzas `no_viable`, el acta dentro de la pausa (no hace falta: `abrir` con el mismo trabajo_id devuelve la misma acta sin cobrar) ni el chequeo P21 en los nodos de la jefatura.
 */
import { agregarNodo, cambiarCodigo as cambiarCodigoLF, codigo, conectar, nodo, redirigir } from './lib.mjs'

/** como `cambiarCodigo`, pero respeta los saltos de línea del nodo (algunos del vivo vienen con CRLF) */
function cambiarCodigo(f, nombre, viejo, nuevo) {
  const CRLF = String.fromCharCode(13, 10), LF = String.fromCharCode(10)
  const crlf = nodo(f, nombre).parameters.jsCode.includes(CRLF)
  const a = (t) => (crlf ? t.split(CRLF).join(LF).split(LF).join(CRLF) : t)
  cambiarCodigoLF(f, nombre, a(viejo), a(nuevo))
}

export const N_ABRE_SI = 'MESA · ¿abre la mesa?'
export const N_SEMILLA = 'MESA · armar la semilla'
export const N_ABRIR = 'MESA · abrir la mesa'
export const N_DECIDIR = 'MESA · decidir'
export const N_SIGUE = 'MESA · ¿sigue la reunión?'
export const N_AVANZAR = 'MESA · avanzar un paso'
export const N_CERRAR = 'MESA · cerrar el acta'
const N_FIN_ABRE = 'FIN · ¿abre la oficina?'
const N_FIN_ABRIR = 'FIN · abrir la conversación'
const N_FIN_SEMILLA = 'FIN · armar la semilla'
const N_V9 = 'V9 · decidir'
const N_B4 = 'Redactor (B4)'
const WH = "$('Webhook · planeacion').first().json.body"

/** misma condición que «FIN · ¿abre la oficina?» (plan v3, cliente, sin finanzas ya resueltas) Y el pre-vuelo dijo `mesa: true` */
export const SI_ABRE_LA_MESA = `={{ (function () { try { const b = (${WH} || {}); if (!(b.plan_v3 === true && typeof b.client_id === 'string' && b.client_id.length > 0)) return false; if (typeof b.finanzas_id === 'string' && b.finanzas_id.length > 0) return false; if (typeof b.finanzas_motivo === 'string' && b.finanzas_motivo.length > 0) return false; return $('${N_V9}').first().json.mesa === true } catch (e) { return false } })() }}`

export const CODIGO_SEMILLA = String.raw`// 04-nov · arma la SEMILLA de la mesa de estrategia con lo que el plan ya tiene (manual completo, ficha, referencia, ICP, material de la Junta y paso 0, lo que dijo el dueño). Sin recortes: la plataforma declara si no cabe. Nunca lanza.
const body = ($('Webhook · planeacion').first().json.body || {})
let p = {}
try { p = $('Unir el texto libre del dueño al paquete').first().json || {} } catch (x) { try { p = $('Unir lo del dueño al paquete').first().json || {} } catch (y) { p = {} } }
const ficha = p.ficha && typeof p.ficha === 'object' ? p.ficha : {}
const cfg = ficha.config && typeof ficha.config === 'object' ? ficha.config : {}
const manual = p.manual && typeof p.manual === 'object' ? p.manual : {}
const reg = (p.registro_del_manual || manual.registro_del_manual || {}).registro
const semilla = {
  rubro: ficha.industry || null, pais: ficha.country || null, moneda: cfg.moneda || cfg.currency || null,
  ficha: ficha,
  referencia_del_producto: typeof p.referencia === 'string' ? p.referencia : null,
  registro_del_cliente: reg || null,
  icp: Array.isArray(p.icp) ? p.icp : [],
  material: Array.isArray(p.material) ? p.material : [],
  descartados: Array.isArray(p.descartados) ? p.descartados : [],
  hechos_del_dueno: Array.isArray(p.hechos_del_dueno) ? p.hechos_del_dueno : [],
  texto_libre_del_dueno: Array.isArray(p.texto_libre_del_dueno) ? p.texto_libre_del_dueno : [],
  casa: p.casa && typeof p.casa === 'object' ? p.casa : null,
  fecha: new Date(Date.now()).toISOString().slice(0, 10),
}
try { const mc = manual.contenido_del_manual; if (mc && typeof mc === 'object' && Object.keys(mc).length) semilla.manual_completo = mc } catch (x) {}
try { const q = $('PV3 · paquete').first().json; if (q && q.plan_version === 'v3' && q.semilla && Array.isArray(q.semilla.datos)) { semilla.datos = q.semilla.datos; semilla.datos_omitidos = Number(q.semilla.datos_omitidos) || 0; if (q.dry_run === true) semilla.corrida_es_de_ensayo = true } } catch (x) {}
return [{ json: { accion: 'abrir', client_id: String(body.client_id), dry_run: body.dry_run === true, semilla: semilla, t0: Date.now() } }]`

export const CODIGO_DECIDIR = String.raw`// 04-nov · a dónde sigue la reunión de la mesa de estrategia. FALLA HACIA «rojo»: nada de lo que se interprete mal se lee como acuerdo. Nunca lanza.
const PLAZO_MS = 1800000
const MAX_PASOS = 24
const ESPERA_MS = 20000
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
const http = Number(r.statusCode)
const vuelta = Number($runIndex) || 0
const t0 = Number($('${N_SEMILLA}').first().json.t0) || Date.now()
const txtHttp = Number.isFinite(http) ? http : 'sin respuesta'
if (vuelta === 0) {
  if (http === 409 && b.error === 'mesa_apagada') return [{ json: { fin: true, resultado: 'apagada' } }]
  if (!(http === 200 && typeof b.encargo_id === 'string' && b.encargo_id)) return [{ json: { fin: true, motivo: 'sin_abrir', detalle: 'la mesa no abrió (HTTP ' + txtHttp + ')' } }]
  if (b.terminado === true) return [{ json: { fin: true, encargo_id: b.encargo_id, estado: String(b.estado || ''), acta: b.acta || null, faltan: b.faltan || [] } }]
  return [{ json: { fin: false, encargo_id: b.encargo_id } }]
}
const id = $('${N_DECIDIR}').first().json.encargo_id
if (http === 409 && b.error === 'mesa_apagada') return [{ json: { fin: true, resultado: 'apagada' } }]
if (http === 409 && b.error === 'paso_en_vuelo') {
  try { await new Promise(function (ok) { setTimeout(ok, ESPERA_MS) }) } catch (x) {}
  if (Date.now() - t0 > PLAZO_MS || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó a tiempo' } }]
  return [{ json: { fin: false, encargo_id: id } }]
}
if (!(http === 200)) return [{ json: { fin: true, encargo_id: id, motivo: 'sin_contestar', detalle: 'la mesa dejó de contestar (HTTP ' + txtHttp + ')' } }]
if (b.terminado === true) return [{ json: { fin: true, encargo_id: id, estado: String(b.estado || ''), acta: b.acta || null, faltan: b.faltan || [], razon: b.razon || null } }]
if (Date.now() - t0 > PLAZO_MS || vuelta >= MAX_PASOS) return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: 'la mesa no terminó a tiempo' } }]
return [{ json: { fin: false, encargo_id: id } }]`

export const CODIGO_CERRAR = String.raw`// 04-nov · cierra la mesa de estrategia: SOLO un acta cerrada y bien formada deja pasar al plan. Todo lo demás falla EN ROJO (nunca un plan sin mesa en silencio, ni un plan a ciegas).
const d = $('${N_DECIDIR}').first().json || {}
if (d.resultado === 'apagada') return [{ json: { mesa: false } }]
const a = d.acta
const bien = d.estado === 'cerrado' && a && typeof a === 'object' && a.esquema === 'acta.v1' && Array.isArray(a.canales) && a.canales.length > 0 && a.numero && typeof a.numero === 'object' && Number(a.numero.meta) > 0
if (!bien) throw new Error('PLAN_MESA_SIN_ACTA · la mesa de estrategia no entregó un acta válida (estado: ' + String(d.estado || d.motivo || 'sin estado') + '; encargo: ' + String(d.encargo_id || 'sin abrir') + ') · ' + String(d.detalle || d.razon || '').slice(0, 300) + ' · se DETIENE: no se escribe un plan a ciegas')
return [{ json: { mesa: true, acta: a, encargo_id: d.encargo_id, aportes_que_faltan: Array.isArray(d.faltan) ? d.faltan : [] } }]`

export const CODIGO_ACTA = String.raw`// 04-nov · el acta de la mesa de estrategia llega como DATO (marketing decidió): el redactor escribe SOBRE ella. Mal formada o ausente = no se escribe nada (el pedido es el de siempre).
const ACT = (function () {
  try {
    const m = $('${N_CERRAR}').first().json
    const a = m && m.mesa === true ? m.acta : null
    if (!a || typeof a !== 'object' || a.esquema !== 'acta.v1' || !Array.isArray(a.canales) || a.canales.length < 1) return null
    if (!a.numero || !(Number(a.numero.meta) > 0)) return null
    if (!a.canales.every(function (c) { return c && typeof c.canal === 'string' && typeof c.peso === 'number' && Number.isFinite(c.peso) && typeof c.razon === 'string' })) return null
    return a
  } catch (e) { return null }
})();
const bloqueActa = ACT ? [
  '══════ LO QUE ACORDÓ LA MESA DE ESTRATEGIA ══════',
  'Escribe el plan SOBRE esto: no vuelvas a decidir canales, pesos, meta ni oferta. Es la decisión de marketing, ya tomada.',
  'Meta: ' + ACT.numero.meta + ' · ' + String(ACT.numero.por_que || ''),
  'Servicio: ' + String(ACT.servicio || ''), 'Audiencia: ' + String(ACT.audiencia || ''), 'Oferta: ' + String(ACT.oferta || ''),
  'Canales y su peso:',
  ...ACT.canales.map(function (c) { return '- ' + c.canal + ': ' + Math.round(c.peso * 100) + ' %' + (c.activo === false ? ' (diferido' + (c.condicion ? ': ' + c.condicion : '') + ')' : '') + ' · ' + c.razon }),
  'Camino: ' + String(ACT.camino || ''), 'Prueba: ' + String(ACT.prueba || ''),
  'Lo que no se hace:',
  ...(Array.isArray(ACT.no_se_hace) && ACT.no_se_hace.length ? ACT.no_se_hace.map(function (n) { return '- ' + String(n && n.que) + ' · ' + String(n && n.por_que) }) : ['- (nada)']),
  ...(Array.isArray(ACT.no_se) && ACT.no_se.length ? ['Lo que la mesa no sabe:', ...ACT.no_se.map(function (n) { return '- ' + String(n) })] : []),
  '',
] : [];
`

export function construirMesaDeEstrategia(f) {
  // 1 · el pre-vuelo avisa si la mesa está encendida
  cambiarCodigo(f, N_V9, 'material_viejo: cuerpo.material_viejo === true,', 'material_viejo: cuerpo.material_viejo === true, mesa: cuerpo.mesa === true,')

  // 2 · el subgrafo: entre el paquete (PV3) y la oficina financiera
  const fa = nodo(f, N_FIN_ABRIR)
  const clon = (nombre, accion) => {
    const p = JSON.parse(JSON.stringify(fa.parameters))
    p.url = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/planeacion/mesa' }}"
    if (accion === 'avanzar') {
      const av = JSON.parse(JSON.stringify(nodo(f, 'FIN · avanzar un paso').parameters))
      // el encargo lo da la propia mesa: «FIN · decidir» aún no corrió cuando la mesa avanza (CC#3 lo halló, 4-nov)
      p.jsonBody = av.jsonBody.split("$('FIN · decidir')").join("$('" + N_DECIDIR + "')")
    }
    if (!p.jsonBody.includes("accion: '" + accion + "'")) throw new Error('el cuerpo de «FIN · ' + accion + '» cambió de forma')
    return { name: nombre, type: 'n8n-nodes-base.httpRequest', typeVersion: fa.typeVersion, onError: 'continueRegularOutput', parameters: p }
  }
  const finAbre = nodo(f, N_FIN_ABRE)
  const si = { name: N_ABRE_SI, type: 'n8n-nodes-base.if', typeVersion: 2, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: SI_ABRE_LA_MESA, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } }
  const sigue = JSON.parse(JSON.stringify(nodo(f, 'FIN · ¿sigue la conversación?')))
  const siSigue = { name: N_SIGUE, type: sigue.type, typeVersion: sigue.typeVersion, parameters: sigue.parameters }
  agregarNodo(f, si, N_FIN_ABRE, -240, 420)
  agregarNodo(f, codigo(N_SEMILLA, CODIGO_SEMILLA), N_FIN_ABRE, 0, 420)
  agregarNodo(f, clon(N_ABRIR, 'abrir'), N_FIN_ABRE, 240, 420)
  agregarNodo(f, codigo(N_DECIDIR, CODIGO_DECIDIR), N_FIN_ABRE, 480, 420)
  agregarNodo(f, siSigue, N_FIN_ABRE, 720, 420)
  agregarNodo(f, clon(N_AVANZAR, 'avanzar'), N_FIN_ABRE, 960, 420)
  agregarNodo(f, codigo(N_CERRAR, CODIGO_CERRAR), N_FIN_ABRE, 960, 620)

  // quien entregaba a «FIN · ¿abre la oficina?» ahora entrega a la puerta de la mesa
  let tocados = 0
  for (const [de, v] of Object.entries(f.connections)) {
    if (de.startsWith('MESA · ')) continue
    ;(v.main || []).forEach((grupo, salida) => { if ((grupo || []).some((x) => x.node === N_FIN_ABRE)) { redirigir(f, de, N_FIN_ABRE, N_ABRE_SI, salida); tocados++ } })
  }
  if (tocados < 1) throw new Error('nadie entregaba a «' + N_FIN_ABRE + '»: el plan cambió de forma')
  conectar(f, N_ABRE_SI, N_SEMILLA, 0)
  conectar(f, N_ABRE_SI, N_FIN_ABRE, 1)
  conectar(f, N_SEMILLA, N_ABRIR)
  conectar(f, N_ABRIR, N_DECIDIR)
  conectar(f, N_DECIDIR, N_SIGUE)
  conectar(f, N_SIGUE, N_AVANZAR, 0)
  conectar(f, N_SIGUE, N_CERRAR, 1)
  conectar(f, N_AVANZAR, N_DECIDIR)
  conectar(f, N_CERRAR, N_FIN_ABRE)

  // 3 · la oficina financiera recibe el acta en su semilla (calcula SOBRE ella)
  cambiarCodigo(f, N_FIN_SEMILLA, "return [{ json: { accion: 'abrir', client_id: String(body.client_id)",
    "// 04-nov · si la mesa de estrategia cerró un acta, finanzas la recibe en la semilla (calcula SOBRE ella; no elige canales)\ntry { const m = $('" + N_CERRAR + "').first().json; if (m && m.mesa === true && m.acta && typeof m.acta === 'object') semilla.acta = m.acta } catch (x) {}\nreturn [{ json: { accion: 'abrir', client_id: String(body.client_id)")

  // 4 · el redactor escribe SOBRE el acta
  cambiarCodigo(f, N_B4, 'const pedido = [\n\'Eres el redactor de planes de campana de esta agencia.', CODIGO_ACTA + "const pedido = [\n'Eres el redactor de planes de campana de esta agencia.")
  cambiarCodigo(f, N_B4, '...bloqueCalendario,\n', '...bloqueActa,\n...bloqueCalendario,\n')
  cambiarCodigo(f, N_B4, '    claves_internas_quitadas_de_la_ficha: fichaSinInternos.quitadas,',
    "    ...(ACT ? { acta_usada: { canales: ACT.canales.length, meta: ACT.numero.meta } } : {}),\n    claves_internas_quitadas_de_la_ficha: fichaSinInternos.quitadas,")
}
