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
    const m = nodo(f, n)
    if (!/const MAX_PASOS = \d+/.test(m.parameters.jsCode)) throw new Error('«' + n + '» cambió de forma: no se aplica a ciegas')
    m.parameters.jsCode = m.parameters.jsCode.replace(/const MAX_PASOS = \d+/, 'const MAX_PASOS = ' + MAX_VUELTAS_DE_MESA).replace(/const PLAZO_MS = \d+\n/, '').replace(/const t0 = .*\n/, '')
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
