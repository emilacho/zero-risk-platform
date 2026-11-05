/**
 * 05-nov · GO de Lenovo tras el doble chequeo a US$ 0: una sola cuenta de tiempos alrededor del redactor. Planeación `X9F0zp6LQ2xGEYVS` + segunda mitad `mdhgiJeCkLV2bTxL`.
 *
 * Renovar el techo · justo antes de pedir al redactor se renueva el plazo de la corrida. Si la plataforma contesta `corrida_no_viva`, para en rojo sin pagar al redactor.
 *   Cualquier otra respuesta sigue: una renovación fallida no debe tirar la corrida; el barrido sigue mirando el plazo viejo.
 * Espera · 60 min (el redactor real tardó de 10 a 22).
 * Recoger lo tardío · si venció sin texto, relee el punto de control 2 veces más, cada 10 min, sin pagar de nuevo. Si la vuelta llegó antes y vacía, no se espera más.
 *   Con corte dudoso no hay `ack_timestamp`: el texto se acepta desde la hora en que se pidió este intento.
 * Sin arrancar · «not configured» trae `upstream_status: 0` y la conexión rechazada no trae texto: en los dos el empleado no arrancó. Son rechazo y avisan al momento.
 *   Un corte a medias sigue esperando: no se puede saber si arrancó.
 * Mesa · el plazo ya no corta antes del acta: lo pagado no se tira por el reloj. Frenan su tope de gasto, «sin contestar» y el tope de vueltas (24 → 80: una vuelta en vuelo son 20 s).
 * Jefatura · lee el estado de la corrida justo antes. Si está `fallida` o `vencida` no abre (no paga). El plan A ya quedó guardado antes. Si no se pudo leer, sigue: no sabe que esté muerta.
 * Plan sin forma · tras su reintento el flujo terminaba con la corrida `corriendo` y el cliente bloqueado hasta el barrido. Ahora el botón siempre pide el chequeo, así que se cierra como `fallida`; el borrador sigue guardado.
 * Cables de la plataforma · `con_analisis` al pre-vuelo y `segunda_pasada` en la semilla de la segunda pasada. El rótulo del plan ya viajaba en el flujo vivo: no se toca.
 * Turno de mesa cortado · un corte o un 5xx ya no termina la mesa: se vuelve a pedir el paso, hasta 2 veces seguidas. Si el turno sigue trabajando, el candado responde `paso_en_vuelo` y se espera. Si ya se cobró, repetirlo se paga otra vez, dentro del tope de la mesa, que mira lo cobrado.
 * Altos deliberados · (una corrida ya `en_pausa` no se puede cerrar: si la pausa se guardó y se perdió la respuesta, sigue esperando y la suelta el dueño) sin acta, validador ilegible, pausa no guardada y reanudar sin material lanzan por la salida de error: se cierra la corrida como `fallida` y se vuelve a lanzar el mismo error, para que el aviso siga llegando. Un error inesperado en otro paso sigue con el barrido.
 * Segunda mitad · con corrida muerta se llama igual: el PDF y el cable no cuestan y el plan ya está pagado. Lo único que se salta es el parte a la sala, que sí puede lanzar trabajo pagado.
 *   Si la llama la aprobación del dueño, sigue como hoy: decidió una persona.
 *
 * No limita a ningún agente: no toca lo que proponen ni sus topes de gasto.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, nodo, redirigir, si } from './lib.mjs'

export const ESPERA_S = 3600
export const RELECTURA_S = 600
export const RELECTURAS = 2
export const MAX_VUELTAS_DE_MESA = 80
export const REINTENTOS_DE_TURNO = 2

const WEBHOOK = 'Webhook · planeacion'
const PEDIR = 'Pedir el plan al redactor'
const ESPERAR = 'Esperar al redactor'
const ACUSE = 'Redactor · ¿aceptó el pedido?'
const LEER = 'Vuelta · leer el punto de control'
const COMPLETAR = 'Vuelta · completar'
const LLEGO = '¿Llegó la vuelta?'
const CORTA = 'Parar · ¿corta aquí?'
const JEF = 'JEF · armar'
const SOBRE_MITAD = 'Segunda mitad · sobre'
const BRIEF = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
const CABLE = 'Cable · ¿volvió? · plan'

export const N_PREPARAR = 'Redactor · preparar el pedido'
export const N_SI_RENUEVA = 'Redactor · ¿renueva el plazo?'
export const N_RENOVAR = 'Redactor · renovar el plazo de la corrida'
export const N_VIVA = 'Redactor · ¿sigue viva la corrida?'
export const N_MAS = 'Vuelta · ¿esperar más?'
export const N_SI_MAS = 'Vuelta · ¿sigue esperando?'
export const N_OTRA = 'Vuelta · esperar otra vez'
export const N_ESTADO = 'JEF · ¿sigue viva la corrida?'
export const N_BRIEF_VIVA = 'BRIEF · ¿la corrida sigue viva?'

const VALIDAR_RESUMEN = 'Validar · resumen'
export const N_VALIDAR_ARMAR = 'Validar · armar el cierre'
export const N_VALIDAR_SI = 'Validar · ¿cerrar la corrida?'
export const N_VALIDAR_CERRAR = 'Validar · cerrar la corrida'
export const N_ALTO_ARMAR = 'Alto · armar el cierre'
export const N_ALTO_SI = 'Alto · ¿cerrar la corrida?'
export const N_ALTO_CERRAR = 'Alto · cerrar la corrida'
export const N_ALTO_ROJO = 'Alto · parar en rojo'
export const ALTOS = ['MESA · cerrar el acta', 'Validar · ¿qué dijo?', 'FIN · la pausa quedó guardada', 'Reanudar · poner el material guardado']

export const CODIGO_VALIDAR_ARMAR = [
  '// 05-nov · el botón ahora pide siempre el chequeo de forma. Si el plan no pasa tras su reintento, la corrida se cierra: el borrador queda guardado y espera a una persona.',
  'const j = $input.first().json || {}',
  "const s = ($('" + WEBHOOK + "').first().json.body || {})",
  "const aplica = s.plan_v3 === true && typeof s.corrida === 'string' && s.corrida.length > 0 && typeof s.client_id === 'string' && s.client_id.length > 0",
  "if (!aplica) return [{ json: { ...j, aplica: false } }]",
  "return [{ json: { ...j, aplica: true, cuerpo: { accion: 'cerrar', client_id: s.client_id, corrida: s.corrida, estado: 'fallida', motivo: 'el plan no pasó el chequeo de forma tras su reintento: el borrador quedó guardado y espera a una persona' } } }]",
].join('\n')

export const CODIGO_PREPARAR = [
  '// 05-nov · antes de pagar al redactor: se anota la hora de este intento y se arma la renovación del plazo de la corrida',
  'const j = $input.first().json || {}',
  "const s = ($('" + WEBHOOK + "').first().json.body || {})",
  "const aplica = s.plan_v3 === true && typeof s.corrida === 'string' && s.corrida.length > 0 && typeof s.client_id === 'string' && s.client_id.length > 0",
  "return [{ json: { ...j, pedido_en: new Date().toISOString(), renovar: { aplica: aplica, cuerpo: { accion: 'renovar', client_id: s.client_id, corrida: s.corrida } } } }]",
].join('\n')

export const CODIGO_VIVA = [
  '// 05-nov · solo para si la plataforma dice que la corrida ya no vive. Cualquier otra respuesta sigue: el plazo viejo lo sigue mirando el barrido.',
  'const r = $input.first().json || {}',
  "const b = r.body && typeof r.body === 'object' ? r.body : {}",
  "if (Number(r.statusCode) === 409 && b.error === 'corrida_no_viva') throw new Error('PLAN_CORRIDA_NO_VIVA · no se pagó al redactor · estado: ' + String(b.estado || 'desconocido'))",
  "return [{ json: $('" + N_PREPARAR + "').last().json }]",
].join('\n')

export const CODIGO_MAS = [
  '// 05-nov · venció la espera sin texto: el redactor puede estar terminando. Se relee el punto de control unas veces más, sin pagar de nuevo.',
  'const j = $input.first().json || {}',
  'const c = j.body ? j.body : j',
  "const texto = String(c.response || c.result || c.output || c.text || '')",
  'let dry = false',
  "try { dry = $('" + WEBHOOK + "').first().json.body.dry_run === true } catch (e) { dry = false }",
  'let desde = 0',
  "try { desde = Number($('" + ACUSE + "').last().json.esperando_desde) || 0 } catch (e) { desde = 0 }",
  'const pasado = Date.now() - desde',
  '// si la vuelta llegó antes de tiempo y vacía, no hay nada que esperar: la declara «¿Llegó la vuelta?»',
  'const vencio = pasado >= ' + (ESPERA_S - 60) + ' * 1000',
  'const quedan = pasado < ' + (ESPERA_S + RELECTURAS * RELECTURA_S - 60) + ' * 1000',
  'const mas = !dry && !texto.trim() && vencio && quedan',
  'return [{ json: { ...j, esperar_mas: mas } }]',
].join('\n')

const VER_ESTADO = [
  '// 05-nov · si la corrida ya no vive, no se paga la jefatura. Si no se pudo leer, no se sabe que esté muerta y sigue.',
  'const muerta = (function () {',
  "  try { const r = $('" + N_ESTADO + "').first().json; const f = Array.isArray(r.body) ? r.body[0] : null; return Number(r.statusCode) === 200 && f && ['fallida', 'vencida'].includes(f.estado) ? String(f.estado) : '' } catch (x) { return '' }",
  '})()',
  "if (muerta) return [{ json: { jef: { ...jef, corrida_muerta: true, motivo: 'la corrida ya no vive (' + muerta + '): no se paga la jefatura' } } }]",
].join('\n')

export const CODIGO_ALTO_ARMAR = [
  '// 05-nov · un alto deliberado: el error que lo detuvo llega aquí. Se cierra la corrida para no dejar al cliente bloqueado y se vuelve a lanzar el mismo error.',
  'const j = $input.first().json || {}',
  "const mensaje = String((j.error && j.error.message) || j.error || j.message || 'el plan se detuvo').replace(/( \\[line \\d+\\])+$/, '')",
  // lo que se ve es la razón en palabras de la empresa; el detalle técnico sigue en el aviso del error
  "const RAZON = { PLAN_MESA_SIN_ACTA: 'la mesa de estrategia no entregó su acta', PLAN_VALIDADOR_NO_LEGIBLE: 'no se pudo leer el chequeo de forma del plan', PLAN_PAUSA_NO_GUARDADA: 'no se pudo guardar la pausa del plan', PLAN_REANUDAR_SIN_MATERIAL: 'al volver de la pausa faltó el material guardado' }",
  "const codigo = (mensaje.match(/^PLAN_[A-Z_]+/) || [''])[0]",
  "const s = ($('" + WEBHOOK + "').first().json.body || {})",
  "const aplica = s.plan_v3 === true && typeof s.corrida === 'string' && s.corrida.length > 0 && typeof s.client_id === 'string' && s.client_id.length > 0",
  "return [{ json: { mensaje, aplica, cuerpo: aplica ? { accion: 'cerrar', client_id: s.client_id, corrida: s.corrida, estado: 'fallida', motivo: 'el plan se detuvo: ' + (RAZON[codigo] || mensaje.replace(/^PLAN_[A-Z_]+ · /, '').slice(0, 400)) } : null } }]",
].join('\n')

export const CODIGO_ALTO_ROJO = "throw new Error($('" + N_ALTO_ARMAR + "').last().json.mensaje)"

export function construirGoDobleChequeo(f) {
  // renovar el techo
  const cerrar = nodo(f, 'V9 · cerrar la corrida')
  const quienes = Object.entries(f.connections).flatMap(([de, c]) => (c.main ?? []).flatMap((g, s) => (g ?? []).filter((x) => x.node === PEDIR).map(() => [de, s])))
  if (quienes.length !== 3) throw new Error('«' + PEDIR + '» cambió de entradas: no se aplica a ciegas')
  agregarNodo(f, codigo(N_PREPARAR, CODIGO_PREPARAR), PEDIR, -800, -180)
  agregarNodo(f, si(N_SI_RENUEVA, '={{ $json.renovar.aplica }}'), PEDIR, -600, -180)
  const renovar = agregarNodo(f, { name: N_RENOVAR, type: 'n8n-nodes-base.httpRequest', typeVersion: cerrar.typeVersion, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(cerrar.parameters)) }, PEDIR, -400, -300)
  if (renovar.parameters.jsonBody !== '={{ JSON.stringify($json.cuerpo) }}') throw new Error('«V9 · cerrar la corrida» cambió de forma: no se aplica a ciegas')
  renovar.parameters.jsonBody = '={{ JSON.stringify($json.renovar.cuerpo) }}'
  renovar.parameters.options = { ...renovar.parameters.options, timeout: 60000 }
  agregarNodo(f, codigo(N_VIVA, CODIGO_VIVA), PEDIR, -200, -300)
  for (const [de, s] of quienes) redirigir(f, de, PEDIR, N_PREPARAR, s)
  conectar(f, N_PREPARAR, N_SI_RENUEVA)
  conectar(f, N_SI_RENUEVA, N_RENOVAR, 0)
  conectar(f, N_SI_RENUEVA, PEDIR, 1)
  conectar(f, N_RENOVAR, N_VIVA)
  conectar(f, N_VIVA, PEDIR)

  // la espera, lo tardío y lo que no arrancó
  const espera = nodo(f, ESPERAR)
  if (espera.parameters.resumeAmount !== 2700 || espera.parameters.resumeUnit !== 'seconds') throw new Error('«' + ESPERAR + '» cambió de forma: no se aplica a ciegas')
  espera.parameters.resumeAmount = ESPERA_S
  cambiarCodigo(f, ACUSE, 'if (!rechazado) return [{ json: { ...r, redactor_rechazado: false } }]', 'if (!rechazado) return [{ json: { ...r, redactor_rechazado: false, esperando_desde: Date.now() } }]')
  cambiarCodigo(f, ACUSE, "const texto = typeof r.error === 'string' ? r.error : ''", "// conexión rechazada: el pedido nunca entró, así que no hay nada que esperar\nconst noEntro = !!r.error && typeof r.error === 'object' && /ECONNREFUSED|ENOTFOUND|refused the connection/.test(JSON.stringify(r.error))\nconst texto = typeof r.error === 'string' ? r.error : (noEntro ? 'no se pudo conectar con la plataforma' : '')")
  cambiarCodigo(f, ACUSE, "const dudoso = texto === 'agent-runner timeout' || r.upstream_status === 0", "// sin configuración también trae upstream_status 0, pero ahí el empleado no arrancó: es rechazo\nconst sinConfigurar = /not configured/.test(texto)\nconst dudoso = !sinConfigurar && (texto === 'agent-runner timeout' || r.upstream_status === 0)")
  // ahora hay dos topes (24 h de la ficha y US$ 15 del plan) y la respuesta no dice cuál fue
  cambiarCodigo(f, ACUSE, "'el freno de gasto del cliente no dejó pedir el plan (se llegó al tope de 24 h)'", "'el freno de gasto no dejó pedir el plan (se llegó a uno de sus topes)'")
  cambiarCodigo(f, COMPLETAR, "try { ack = $('" + PEDIR + "').last().json.ack_timestamp } catch (e) { ack = null }", "try { ack = $('" + PEDIR + "').last().json.ack_timestamp } catch (e) { ack = null }\n// corte dudoso: sin acuse, cuenta desde la hora en que se pidió este intento\nif (!ack) { try { ack = $('" + N_PREPARAR + "').last().json.pedido_en } catch (e) { ack = null } }")
  agregarNodo(f, codigo(N_MAS, CODIGO_MAS), COMPLETAR, 200, 180)
  agregarNodo(f, si(N_SI_MAS, '={{ $json.esperar_mas }}'), COMPLETAR, 400, 180)
  agregarNodo(f, { name: N_OTRA, type: espera.type, typeVersion: espera.typeVersion, parameters: { resume: 'timeInterval', amount: RELECTURA_S, unit: 'seconds' } }, COMPLETAR, 600, 300)
  redirigir(f, COMPLETAR, LLEGO, N_MAS)
  conectar(f, N_MAS, N_SI_MAS)
  conectar(f, N_SI_MAS, N_OTRA, 0)
  conectar(f, N_SI_MAS, LLEGO, 1)
  conectar(f, N_OTRA, LEER)

  // la mesa: el plazo no corta antes del acta
  for (const [n, detalle] of [['MESA · decidir', 'la mesa no terminó a tiempo'], ['MESA · decidir la devolución', 'la mesa no terminó la devolución a tiempo']]) {
    const fin = " return [{ json: { fin: true, encargo_id: id, motivo: 'vencido', detalle: '" + detalle + "' } }]"
    cambiarCodigo(f, n, 'if (Date.now() - t0 > PLAZO_MS || vuelta >= MAX_PASOS)' + fin, '// 05-nov · un turno en vuelo ya está pagado: solo frena el tope de vueltas\nif (vuelta >= MAX_PASOS)' + fin)
    cambiarCodigo(f, n, "// 05-nov · si este turno fue la consolidación, la próxima vuelta recoge el acta ya pagada sin gastar: el plazo no la corta\nconst acabaDeCerrar = /consolida/.test(String(b.paso || ''))\nif ((!acabaDeCerrar && Date.now() - t0 > PLAZO_MS) || vuelta >= MAX_PASOS)" + fin, '// 05-nov · lo ya pagado no se tira por el reloj: la mesa llega al acta. Frenan su tope de gasto y este tope de vueltas\nif (vuelta >= MAX_PASOS)' + fin)
    // un turno cortado tiene otra oportunidad: lo pagado no se tira por un corte o un error pasajero
    const previos = "const fallosPrevios = (function () { try { return Number($('" + n + "').first().json.fallos) || 0 } catch (x) { return 0 } })()"
    const sinContestar = n === 'MESA · decidir' ? "if (!(http === 200)) return [{ json: { fin: true, encargo_id: id, motivo: 'sin_contestar', detalle: 'la mesa dejó de contestar (HTTP ' + txtHttp + ')' } }]" : "if (!(http === 200)) return [{ json: { fin: true, encargo_id: id, motivo: 'sin_contestar', detalle: 'la mesa dejó de contestar en la devolución (HTTP ' + txtHttp + ')' } }]"
    cambiarCodigo(f, n, sinContestar, '// 05-nov · un corte (sin respuesta) o un 5xx no termina la mesa: se vuelve a pedir el paso. Si sigue trabajando, responde paso_en_vuelo. Lo cobrado cuenta contra su tope\n' + previos + "\nif (!(http === 200) && (!Number.isFinite(http) || http >= 500) && fallosPrevios < " + REINTENTOS_DE_TURNO + " && vuelta < MAX_PASOS) {\n  try { await new Promise(function (ok) { setTimeout(ok, ESPERA_MS * (fallosPrevios + 1)) }) } catch (x) {}\n  return [{ json: { fin: false, encargo_id: id, fallos: fallosPrevios + 1 } }]\n}\n" + sinContestar)
    // mientras espera a un turno en vuelo, la cuenta de fallos no vuelve a cero
    cambiarCodigo(f, n, fin + "\n  return [{ json: { fin: false, encargo_id: id } }]\n}", fin + "\n  return [{ json: { fin: false, encargo_id: id, fallos: (function () { try { return Number($('" + n + "').first().json.fallos) || 0 } catch (x) { return 0 } })() } }]\n}")
    const m = nodo(f, n)
    if (!/const MAX_PASOS = \d+/.test(m.parameters.jsCode)) throw new Error('«' + n + '» cambió de forma: no se aplica a ciegas')
    m.parameters.jsCode = m.parameters.jsCode.replace(/const MAX_PASOS = \d+/, 'const MAX_PASOS = ' + MAX_VUELTAS_DE_MESA).replace(/const PLAZO_MS = \d+\n/, '').replace(/const t0 = .*\n/, '')
  }

  // los dos cables que pidió la plataforma (CC1, #928)
  const previo = nodo(f, 'V9 · pre-vuelo')
  const anclaPrevuelo = 'if (b.dry_run !== undefined) o.dry_run = b.dry_run;'
  if (!previo.parameters.jsonBody.includes(anclaPrevuelo)) throw new Error('«V9 · pre-vuelo» cambió de forma: no se aplica a ciegas')
  previo.parameters.jsonBody = previo.parameters.jsonBody.replace(anclaPrevuelo, anclaPrevuelo + ' if (b.con_analisis !== undefined) o.con_analisis = b.con_analisis;')
  const anclaActa = '// 04-nov · si la mesa de estrategia cerró un acta, finanzas la recibe en la semilla'
  cambiarCodigo(f, 'FIN2 · armar la semilla', anclaActa, '// 05-nov · D4: una pregunta en esta pasada no frena el plan; queda viva en la oficina\nsemilla.segunda_pasada = true\n' + anclaActa)

  // plan sin forma tras su reintento: el flujo termina y la corrida quedaba `corriendo`, con el cliente bloqueado hasta que venciera
  agregarNodo(f, codigo(N_VALIDAR_ARMAR, CODIGO_VALIDAR_ARMAR), VALIDAR_RESUMEN, 200, 0)
  agregarNodo(f, si(N_VALIDAR_SI, '={{ $json.aplica }}'), VALIDAR_RESUMEN, 400, 0)
  const cerrarValidar = agregarNodo(f, { name: N_VALIDAR_CERRAR, type: 'n8n-nodes-base.httpRequest', typeVersion: cerrar.typeVersion, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(cerrar.parameters)) }, VALIDAR_RESUMEN, 600, 0)
  cerrarValidar.parameters.options = { ...cerrarValidar.parameters.options, timeout: 60000 }
  conectar(f, VALIDAR_RESUMEN, N_VALIDAR_ARMAR)
  conectar(f, N_VALIDAR_ARMAR, N_VALIDAR_SI)
  conectar(f, N_VALIDAR_SI, N_VALIDAR_CERRAR, 0)

  // los altos deliberados cierran la corrida: el cliente no queda bloqueado hasta el barrido
  agregarNodo(f, codigo(N_ALTO_ARMAR, CODIGO_ALTO_ARMAR), ALTOS[0], 0, 400)
  agregarNodo(f, si(N_ALTO_SI, '={{ $json.aplica }}'), ALTOS[0], 200, 400)
  const cerrarAlto = agregarNodo(f, { name: N_ALTO_CERRAR, type: 'n8n-nodes-base.httpRequest', typeVersion: cerrar.typeVersion, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(cerrar.parameters)) }, ALTOS[0], 400, 300)
  cerrarAlto.parameters.options = { ...cerrarAlto.parameters.options, timeout: 60000 }
  agregarNodo(f, codigo(N_ALTO_ROJO, CODIGO_ALTO_ROJO), ALTOS[0], 600, 400)
  conectar(f, N_ALTO_ARMAR, N_ALTO_SI)
  conectar(f, N_ALTO_SI, N_ALTO_CERRAR, 0)
  conectar(f, N_ALTO_SI, N_ALTO_ROJO, 1)
  conectar(f, N_ALTO_CERRAR, N_ALTO_ROJO)
  for (const a of ALTOS) {
    const alto = nodo(f, a)
    if (alto.onError) throw new Error('«' + a + '» ya maneja sus errores: no se aplica a ciegas')
    alto.onError = 'continueErrorOutput'
    f.connections[a] = f.connections[a] ?? { main: [[]] }
    if (!f.connections[a].main[0]) f.connections[a].main[0] = []
    conectar(f, a, N_ALTO_ARMAR, 1)
  }

  // la jefatura: no pagar sobre una corrida muerta
  const leer = nodo(f, LEER)
  const estado = agregarNodo(f, { name: N_ESTADO, type: leer.type, typeVersion: leer.typeVersion, onError: 'continueRegularOutput', parameters: JSON.parse(JSON.stringify(leer.parameters)) }, JEF, -200, 180)
  estado.parameters.url = "={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/plan_corridas?client_id=eq.{{ encodeURIComponent(($('" + WEBHOOK + "').first().json.body || {}).client_id || '') }}&corrida=eq.{{ encodeURIComponent(($('" + WEBHOOK + "').first().json.body || {}).corrida || '') }}&select=estado&limit=1"
  estado.parameters.options = { ...estado.parameters.options, timeout: 60000 }
  redirigir(f, CORTA, JEF, N_ESTADO, 1)
  conectar(f, N_ESTADO, JEF)
  const ancla = 'if (!v || v.llego_la_vuelta !== true'
  cambiarCodigo(f, JEF, ancla, VER_ESTADO + '\n' + ancla)

  // el aviso a la segunda mitad
  cambiarCodigo(f, SOBRE_MITAD, "{ aprobacion_id: null, origen: 'planeacion/directo' }", "{ aprobacion_id: null, origen: 'planeacion/directo', corrida_muerta: (function () { try { return $('" + JEF + "').first().json.jef.corrida_muerta === true } catch (e) { return false } })() }")
}

export function construirGoDobleChequeoMitad(f) {
  // «Sobre» arma el cuerpo campo por campo: sin esto el aviso se pierde
  cambiarCodigo(f, 'Sobre', "origen: typeof b.origen === 'string' ? b.origen : 'planeacion/directo',", "origen: typeof b.origen === 'string' ? b.origen : 'planeacion/directo',\n  corrida_muerta: b.corrida_muerta === true,")
  agregarNodo(f, si(N_BRIEF_VIVA, "={{ $('Sobre').first().json.body.corrida_muerta === true }}"), BRIEF, -200, 180)
  redirigir(f, CABLE, BRIEF, N_BRIEF_VIVA)
  conectar(f, N_BRIEF_VIVA, BRIEF, 1)
}
