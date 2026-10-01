// ⓪ EL SOBRE · LA LLAVE · EL MODO SECO · CC#1 · 2026-10-01 · flujo `zero-risk/pieza` (el productor: un brief → una pieza).
// Este flujo PAGA (un agente). Por eso: (1) exige la llave de despacho del motor (lección E67: un POST con la marca copiada arrancaba una corrida paga),
// (2) exige `dry_run` EXPLÍCITO (true|false) · no se asume nunca, (3) TODO valor mal escrito detiene la corrida ANTES de gastar (ignorarlo dejaría pagar a ciegas).
// Agnóstico: sirve para cualquier cliente y cualquier brief de cualquier parte; nada de aquí nombra a un cliente.
const w = $input.first().json || {}
const body = w.body && typeof w.body === 'object' ? w.body : {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}

const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) {
  throw new Error('PIEZA_CERRADA · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) en su entorno · este flujo paga y queda cerrado hasta que exista · E67.')
}
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) {
  throw new Error('PIEZA_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · este flujo paga y solo lo despierta la sala · E67.')
}

const UUID = /^[0-9a-fA-F-]{36}$/
if (!body.client_id) throw new Error('PIEZA_SIN_CLIENTE · falta client_id en el sobre · se DETIENE y no escribe nada')
// los ids se pegan en direcciones de la base: solo un uuid o un identificador simple, nada más
if (!UUID.test(String(body.client_id))) throw new Error('PIEZA_CLIENTE_INVALIDO · client_id no es un uuid · se DETIENE y no escribe nada')
if (body.parte_id !== undefined && body.parte_id !== null && !UUID.test(String(body.parte_id))) {
  throw new Error('PIEZA_PARTE_INVALIDO · parte_id no es un uuid · se DETIENE y no escribe nada')
}
if (body.brief_id === undefined || body.brief_id === null || String(body.brief_id).trim() === '') {
  throw new Error('PIEZA_SIN_BRIEF · falta brief_id en el sobre (el identificador del brief dentro del parte, p. ej. BRF-0006) · se DETIENE y no escribe nada')
}
if (!/^[A-Za-z0-9_-]{3,40}$/.test(String(body.brief_id))) {
  throw new Error('PIEZA_BRIEF_INVALIDO · brief_id debe ser un identificador simple (letras, números, guion) de 3 a 40 caracteres · llegó ' + JSON.stringify(body.brief_id) + ' · se DETIENE y no escribe nada')
}
if (typeof body.dry_run !== 'boolean') {
  throw new Error('PIEZA_DRY_RUN_AUSENTE · el sobre debe traer dry_run explícito (true o false) · no se asume · se DETIENE antes de gastar')
}

// TOPE DURO por llamada (US$) · el corredor se lo pasa al SDK y CORTA al alcanzarlo. Ausente ⇒ el de fábrica: 0,60 (cota del peor caso de UNA pieza con fotos y herramienta:
// el máximo medido de este agente 0,383 + las fotos ≈0,09 + lo que devuelva «mirar afuera» ≈0,04 + vueltas con caché ≈0,04 ≈ 0,56 · es una COTA, no una medición).
// Presente ⇒ número > 0 y ≤ 50; un tope MAL ESCRITO detiene antes de gastar.
const TOPE_DE_FABRICA_USD = 0.6
let tope_usd = TOPE_DE_FABRICA_USD
let tope_de_fabrica = true
if (body.tope_usd !== undefined) {
  const n = typeof body.tope_usd === 'number' ? body.tope_usd : (typeof body.tope_usd === 'string' && body.tope_usd.trim() !== '' ? Number(body.tope_usd) : NaN)
  if (!Number.isFinite(n) || n <= 0 || n > 50) {
    throw new Error('PIEZA_TOPE_INVALIDO · tope_usd debe ser un número mayor que 0 y hasta 50 · llegó ' + JSON.stringify(body.tope_usd) + ' · se DETIENE antes de gastar: ignorarlo dejaría pagar sin tope')
  }
  tope_usd = n
  tope_de_fabrica = false
}

return [{
  json: {
    client_id: String(body.client_id),
    tenant_id: body.tenant_id || body.client_id,
    parte_id: body.parte_id ? String(body.parte_id) : null,
    brief_id: String(body.brief_id),
    dry_run: body.dry_run,
    forzar: body.forzar === true || body.force_restart === true,
    desde_worker: body.desde_worker || null,
    _sala_correlation_id: body._sala_correlation_id || null,
    _journey_id: body._journey_id || null,
    // SOLO en modo seco: una respuesta del productor enlatada para ejercitar los chequeos con datos de forma real sin pagar. En modo real se IGNORA.
    simulacro_respuesta: body.dry_run === true && typeof body._simulacro_respuesta === 'string' ? body._simulacro_respuesta : null,
    tope_usd,
    tope_de_fabrica,
  },
}]
