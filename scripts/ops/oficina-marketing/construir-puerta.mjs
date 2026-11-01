/**
 * T5 · paso 1 · la PUERTA de la cadena (`pBAp5Cx7R39U585i`) y el SUB-FLUJO del calendario (`cR22ztH1p2ihTIwD`) para el nuevo orden (brief → gran idea → calendario).
 *   node scripts/ops/oficina-marketing/construir-puerta.mjs        · escribe nuevo/pBAp….json y nuevo/cR22….json
 * Qué cambia (y SOLO esto):
 *   · calendario `① ¿Qué dijo?`: la respuesta `esperar_concepto` (con la palanca encendida la tanda espera brief/gran idea) deja de ser un error: el sub-flujo termina con `esperando_concepto` y el detalle (falta, versión).
 *   · puerta `4 · ¿Calendario?` y `Tanda · ¿resultado?`: ese resultado entra a la cadena de nodos «Mesa · …» que hace el PRÓXIMO paso que falte (brief o concepto): pide el sobre a la cadena
 *     (`/api/cadena/{brief|concepto}` acción `abrir`) y se lo lleva a la oficina (`/api/oficina/encargos`, `origen: 'cadena'`, `despertar: true`): el flujo es el CARTERO. Si lo que falta es la entrega de la mesa
 *     o la firma de Emilio, no hace nada (se espera). Cada pasada es idempotente: la cadena contesta `ya_abierta`/`ya_hecha` y la oficina `ya_existia`.
 *   · Con la palanca APAGADA el calendario nunca contesta `esperar_concepto`: ningún nodo nuevo se ejecuta y la puerta es la de hoy.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, escribirNuevo, http, leerVivo, redirigir, si } from './lib.mjs'

const URL_CADENA = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/cadena/' + $json.mesa_paso }}"
const URL_OFICINA = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/oficina/encargos' }}"

// ───────────────────────────────────────── código de los nodos nuevos (vive aquí y se prueba ejecutándolo tal cual)
export const ESPERANDO = (via) => `if (r.resultado === 'esperando_concepto') return [{ json: { ...s, esperando: true, espera: r.detalle && typeof r.detalle === 'object' ? r.detalle : {}, resultado: 'cadena_abierta', alerta: null, nota: 'la ${via} espera la gran idea aprobada (falta: ' + String((r.detalle && r.detalle.falta) || '?') + ')' } }]
`

export const CODIGO_QUE_SIGUE = `// MESA · QUÉ SIGUE · la tanda dijo «espero la gran idea» y dijo QUÉ falta: brief → se abre la mesa del brief · concepto → se abre la mesa de concepto · entrega (la mesa está trabajando) o aprobacion (espera a Emilio) → nada que hacer, se espera.
// El plazo de la mesa lo cierra la oficina y la firma de Emilio no vence: este flujo NUNCA decide por ellos. Cada pasada solo da el próximo paso; la siguiente vuelta del reloj da el que sigue.
const s = $input.first().json
const falta = String((s.espera && s.espera.falta) || '')
const paso = falta === 'brief' ? 'brief' : falta === 'concepto' ? 'concepto' : null
if (!paso && falta !== 'entrega' && falta !== 'aprobacion') throw new Error('PUERTA_MESA_FALTA_DESCONOCIDA · la tanda dijo que espera y que le falta ' + JSON.stringify(falta) + ' · no se sabe qué abrir · se DETIENE')
const pedido = paso ? { accion: 'abrir', campana_id: s.campana_id, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) } : null
return [{ json: { ...s, mesa_paso: paso, mesa_pedido: pedido ? JSON.stringify(pedido) : null, nota: paso ? 'se abre la mesa de ' + paso : 'la mesa sigue trabajando o espera a Emilio (falta: ' + falta + ')' } }]
`

export const CODIGO_LEER_APERTURA = `// MESA · LEER LO QUE ABRIÓ LA CADENA · 200 con sobre → hay que llevárselo a la oficina · ya_abierta / ya_hecha → nada (idempotente) · 409 con necesita_humano → la campaña pide a una persona
// Todo lo demás se DETIENE con su motivo (nunca se traga un error: una mesa que no abre no se confunde con una que está trabajando).
const s = $('Mesa · qué sigue').last().json
const r = $input.first().json || {}
if (r.error && typeof r.error === 'object') throw new Error('PUERTA_MESA_ABRIR_NO_LLEGO · la llamada a la cadena falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ') · se DETIENE')
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status === 200 && b.sobre && typeof b.sobre === 'object') return [{ json: { ...s, sobre: b.sobre, mesa_version: b.version || null } }]
if (status === 200 && (b.ya_abierta === true || b.ya_hecha === true)) return [{ json: { ...s, sobre: null, nota: 'la mesa de ' + s.mesa_paso + ' ya estaba ' + (b.ya_abierta ? 'abierta' : 'hecha') + ': no se repite' } }]
if (status === 409 && b.necesita_humano === true) return [{ json: { ...s, sobre: null, resultado: 'necesita_humano', alerta: b.alerta || null, nota: 'la mesa de ' + s.mesa_paso + ' no puede reabrirse: ' + String(b.error || '') } }]
throw new Error('PUERTA_MESA_ABRIR_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · se DETIENE')
`

export const CODIGO_ABRIO = `// MESA · ¿ABRIÓ EN LA OFICINA? · 200 esperar → la mesa arrancó (la ruta despertó al flujo de turnos) · ya_existia → nada · cerrado → la oficina cerró al abrir y YA se lo entregó a la cadena (por su puerto)
// 409 oficina_no_abre (apagada · familia no activa · cliente fuera del ensayo) → la cadena dejó una mesa abierta que nadie trabaja: la campaña pide a una persona. Lo demás se DETIENE.
const s = $('Mesa · leer lo que abrió').last().json
const e = $input.first().json || {}
if (e.error && typeof e.error === 'object') throw new Error('PUERTA_MESA_OFICINA_NO_LLEGO · la llamada a /api/oficina/encargos falló antes de recibir respuesta (' + String(e.error.message || e.error.name || 'sin detalle').slice(0, 160) + ') · se DETIENE')
const status = Number(e.statusCode)
const b = e.body && typeof e.body === 'object' ? e.body : {}
const { sobre, ...resto } = s
if (status === 200 && b.accion === 'esperar') return [{ json: { ...resto, nota: 'la mesa de ' + s.mesa_paso + ' abrió' + (b.despertado === false ? ' (sin despertar al flujo de turnos: lo hallará el vigía de la oficina)' : '') } }]
if (status === 200 && b.accion === 'ya_existia') return [{ json: { ...resto, nota: 'la mesa de ' + s.mesa_paso + ' ya tenía encargo: no se repite' } }]
if (status === 200 && b.accion === 'cerrado') return [{ json: { ...resto, nota: 'la mesa de ' + s.mesa_paso + ' cerró al abrir (' + String(b.estado || '') + '): ' + String(b.motivo || '') } }]
if (status === 409 && b.error === 'oficina_no_abre') return [{ json: { ...resto, resultado: 'necesita_humano', alerta: null, nota: 'la oficina no abre la mesa de ' + s.mesa_paso + ' (' + String(b.motivo || 'apagada o familia inactiva') + '): la cadena la dejó abierta' } }]
throw new Error('PUERTA_MESA_OFICINA_RECHAZADO · /api/oficina/encargos contestó ' + status + ' · ' + String(b.error || b.detalle || JSON.stringify(b)).slice(0, 240) + ' · se DETIENE')
`

export function construirPuerta() {
  const f = leerVivo('pBAp5Cx7R39U585i')
  cambiarCodigo(f, '4 · ¿Calendario?', "const bien = r.resultado === 'ok' || r.resultado === 'ya_hecha'", ESPERANDO('tanda 1') + "const bien = r.resultado === 'ok' || r.resultado === 'ya_hecha'")
  cambiarCodigo(f, 'Tanda · ¿resultado?', "const bien = r.resultado === 'ok' || r.resultado === 'ya_hecha'", ESPERANDO('tanda') + "const bien = r.resultado === 'ok' || r.resultado === 'ya_hecha'")

  agregarNodo(f, si('Mesa · ¿espera la gran idea?', '={{ $json.esperando === true }}'), 'Cable · armar', -1400, 500)
  agregarNodo(f, codigo('Mesa · qué sigue', CODIGO_QUE_SIGUE), 'Cable · armar', -1150, 500)
  agregarNodo(f, si('Mesa · ¿hay una mesa que abrir?', '={{ $json.mesa_paso !== null }}'), 'Cable · armar', -900, 500)
  agregarNodo(f, http('Mesa · abrir en la cadena', URL_CADENA, [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }], '={{ $json.mesa_pedido }}'), 'Cable · armar', -650, 500)
  agregarNodo(f, codigo('Mesa · leer lo que abrió', CODIGO_LEER_APERTURA), 'Cable · armar', -400, 500)
  agregarNodo(f, si('Mesa · ¿llevarlo a la oficina?', '={{ !!$json.sobre }}'), 'Cable · armar', -150, 500)
  agregarNodo(f, http('Mesa · abrir en la oficina', URL_OFICINA, [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-sala-dispatch-key', value: '={{ $env.SALA_DISPATCH_KEY }}' }], '={{ JSON.stringify({ ...$json.sobre, origen: "cadena", despertar: true }) }}', 120000), 'Cable · armar', 100, 500)
  agregarNodo(f, codigo('Mesa · ¿abrió?', CODIGO_ABRIO), 'Cable · armar', 350, 500)

  // los dos resultados del calendario entran a la cadena de nodos «Mesa · …»; si no esperan, siguen EXACTAMENTE por donde seguían
  redirigir(f, '4 · ¿Calendario?', 'Cable · armar', 'Mesa · ¿espera la gran idea?')
  redirigir(f, 'Tanda · ¿resultado?', 'Cable · armar', 'Mesa · ¿espera la gran idea?')
  conectar(f, 'Mesa · ¿espera la gran idea?', 'Mesa · qué sigue', 0)
  conectar(f, 'Mesa · ¿espera la gran idea?', 'Cable · armar', 1)
  conectar(f, 'Mesa · qué sigue', 'Mesa · ¿hay una mesa que abrir?')
  conectar(f, 'Mesa · ¿hay una mesa que abrir?', 'Mesa · abrir en la cadena', 0)
  conectar(f, 'Mesa · ¿hay una mesa que abrir?', 'Cable · armar', 1)
  conectar(f, 'Mesa · abrir en la cadena', 'Mesa · leer lo que abrió')
  conectar(f, 'Mesa · leer lo que abrió', 'Mesa · ¿llevarlo a la oficina?')
  conectar(f, 'Mesa · ¿llevarlo a la oficina?', 'Mesa · abrir en la oficina', 0)
  conectar(f, 'Mesa · ¿llevarlo a la oficina?', 'Cable · armar', 1)
  conectar(f, 'Mesa · abrir en la oficina', 'Mesa · ¿abrió?')
  conectar(f, 'Mesa · ¿abrió?', 'Cable · armar')
  return f
}

export function construirCalendario() {
  const f = leerVivo('cR22ztH1p2ihTIwD')
  cambiarCodigo(f, '① ¿Qué dijo?', "if (status === 409 && (b.error === 'presupuesto_agotado'",
    "// nuevo orden: con la palanca encendida la tanda espera brief / gran idea aprobada: es un fin DECLARADO (sin corrida ni gasto), no un error\nif (status === 200 && b.accion === 'esperar_concepto') return [{ json: { ...base, fin: true, resultado: 'esperando_concepto', detalle: b } }]\nif (status === 409 && (b.error === 'presupuesto_agotado'")
  return f
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('construir-puerta.mjs')) {
  console.log(escribirNuevo(construirPuerta()))
  console.log(escribirNuevo(construirCalendario()))
}
