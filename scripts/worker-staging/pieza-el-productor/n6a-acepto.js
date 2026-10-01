// ⑥ ¿ACEPTÓ EL PEDIDO? · CC#1 · 2026-10-01 · certificación CC#3 (punto 2). `run-sdk` contesta SÍNCRONO: 202 `{accepted:true…}` si acepta el pedido (la vuelta llega después por el corredor) o un
// RECHAZO (400/403/429/502 con `error` · `code` · `detail`) si no. El nodo HTTP del productor tiene `neverError`, así que un rechazo llegaba aquí como un cuerpo cualquiera y el flujo
// ESPERABA LA HORA de ⑥ para declarar «la vuelta NO llegó» con el motivo equivocado. Ahora se DETIENE YA, con la causa verdadera, ANTES de esperar.
// Un rechazo síncrono significa que el agente NO arrancó (nada que esperar). Un 5xx del proxy puede dejar al corredor con el pedido recibido: si llegara una vuelta a una espera cerrada daría 409 (4xx es definitivo).
const c = $('⑤ Armar el cuerpo del productor').first().json
const e = $input.first().json || {}
const r = e.body && typeof e.body === 'object' ? e.body : e
// el nodo HTTP FALLÓ (red, tiempo): n8n entrega `{error:{message…}}` con `error` OBJETO · el rechazo de run-sdk trae `error` como TEXTO
if (r.error && typeof r.error === 'object') {
  throw new Error('PIEZA_PEDIDO_NO_LLEGO · la llamada a run-sdk falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ') · el agente NO se puede dar por arrancado · se DETIENE antes de esperar')
}
if (r.accepted === true) {
  // 🔴 EL ECO DE LOS LÍMITES (obligatorio · canon de Emilio): el acuse debe devolver EXACTAMENTE los límites de «mirar afuera» que se mandaron. Sin eco ⇒ el camino los perdió (Vercel viejo) o no los entendió.
  // Ojo: en la vuelta por callback el acuse es inmediato y el trabajo ya se programó: el agente PUDO arrancar. Lo acota el tope de gasto (max_budget_usd) y por eso la comprobación PREVIA al corredor (`⑤ GUARDA`) es la que impide el caso normal.
  const pedidos = c.cuerpo && c.cuerpo.mirar_afuera_limites
  if (pedidos) {
    const eco = r.mirar_afuera_limites
    const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b)
    const mismosPermitidos = eco && Array.isArray(eco.permitidos) && Array.isArray(pedidos.permitidos) && eco.permitidos.length === pedidos.permitidos.length && pedidos.permitidos.every((x) => eco.permitidos.indexOf(x) !== -1)
    if (!eco || typeof eco !== 'object' || !igual(eco.max_pedidos, pedidos.max_pedidos) || (pedidos.permitidos && !mismosPermitidos)) {
      throw new Error('PIEZA_LIMITES_NO_ACEPTADOS · run-sdk aceptó el pedido pero NO devolvió el eco de los límites de «mirar afuera» (mandé ' + JSON.stringify(pedidos) + ' · volvió ' + JSON.stringify(eco === undefined ? null : eco) + ') · el camino los perdió o no los entendió · se DETIENE · el agente pudo arrancar sin ellos (lo acota max_budget_usd) · revisar el despliegue de Vercel y del corredor')
    }
  }
  return [{ json: { ...c, pedido_aceptado: true, dispatch_key: r.dispatch_key || null, aceptado_en: r.ack_timestamp || null, limites_confirmados: !!pedidos } }]
}
if (Object.keys(r).length === 0) {
  throw new Error('PIEZA_PEDIDO_NO_LLEGO · run-sdk contestó vacío · el agente NO se puede dar por arrancado · se DETIENE antes de esperar')
}
const partes = [r.error, r.code, r.detail, r.upstream_status !== undefined ? 'upstream_status ' + r.upstream_status : null].filter((x) => x !== undefined && x !== null && x !== '')
throw new Error('PIEZA_PEDIDO_RECHAZADO · run-sdk NO aceptó el pedido: ' + (partes.length ? partes.map((x) => String(x)).join(' · ').slice(0, 300) : JSON.stringify(r).slice(0, 200)) + ' · el agente NO arrancó · se DETIENE YA (no se espera la vuelta)')
