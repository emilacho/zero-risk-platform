// ⓪ EL SOBRE · LA LLAVE · EL MODO SECO · CC#1 · 2026-09-29 · encargo Lenovo §1.
// Este flujo PAGA (varias llamadas a un agente). Por eso: (1) exige la llave de despacho del motor (lección E67: un POST con la
// marca copiada arrancaba una corrida paga) y (2) exige `dry_run` EXPLÍCITO (true|false) en el sobre · no se asume nunca
// (lección 28-sep: en otro flujo el dry_run moría en el primer nodo y una prueba «gratis» cobró US$ 0,37).
const w = $input.first().json || {}
const body = w.body && typeof w.body === 'object' ? w.body : {}
const headers = w.headers && typeof w.headers === 'object' ? w.headers : {}

const esperada = String($env.SALA_DISPATCH_KEY || '').trim()
if (!esperada) {
  throw new Error('BRIEF_CERRADO · el motor no tiene la llave de despacho (SALA_DISPATCH_KEY) en su entorno · este flujo paga y queda cerrado hasta que exista · E67.')
}
const recibida = String(headers['x-sala-dispatch-key'] || '')
let ok = recibida.length === esperada.length
for (let i = 0; i < esperada.length; i++) ok = recibida.charCodeAt(i) === esperada.charCodeAt(i) && ok
if (!ok) {
  throw new Error('BRIEF_PROCEDENCIA_INVALIDA · llave de despacho ausente o incorrecta · este flujo paga y solo lo despierta la sala · E67.')
}

if (!body.client_id) throw new Error('BRIEF_SIN_CLIENTE · falta client_id en el sobre · se DETIENE y no escribe nada')
// el client_id se pega en direcciones de la base: solo un uuid, nada más
if (!/^[0-9a-fA-F-]{36}$/.test(String(body.client_id))) throw new Error('BRIEF_CLIENTE_INVALIDO · client_id no es un uuid · se DETIENE y no escribe nada')
if (typeof body.dry_run !== 'boolean') {
  throw new Error('BRIEF_DRY_RUN_AUSENTE · el sobre debe traer dry_run explícito (true o false) · no se asume · se DETIENE antes de gastar')
}
// Tamaño de la tanda: cuántos briefs se piden por llamada. MEDIDO 29-sep: ~12.400 tokens por entregable (más de la mitad
// razonamiento interno) a ~50 tokens/s ⇒ 2 entregables ≈ 8 min · el tope de la función es 800 s (13,3 min). Rango 1-3, por defecto 2.
const tandaPedida = Number(body.tanda)
const tanda = Number.isInteger(tandaPedida) && tandaPedida >= 1 && tandaPedida <= 3 ? tandaPedida : 2

// SOLO en modo seco: respuestas de redactor enlatadas para probar los chequeos y el bucle con datos de forma real sin pagar.
// `_simulacro = { lista: "<texto>", tandas: ["<texto>", …] }`. En modo real se IGNORA por completo (los nodos ③ ni lo miran).
const sim = body.dry_run === true && body._simulacro && typeof body._simulacro === 'object' ? body._simulacro : null

return [{
  json: {
    client_id: String(body.client_id),
    tenant_id: body.tenant_id || body.client_id,
    plan_id: body.plan_id || null,
    dry_run: body.dry_run,
    forzar: body.forzar === true || body.force_restart === true,
    tanda,
    desde_worker: body.desde_worker || null,
    _sala_correlation_id: body._sala_correlation_id || null,
    _journey_id: body._journey_id || null,
    simulacro: sim,
  },
}]
