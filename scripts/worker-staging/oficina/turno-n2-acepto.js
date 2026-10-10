// ② ¿ACEPTÓ EL PEDIDO? · CC#2 · 2026-10-09 · mismo criterio que la pieza: run-sdk contesta SÍNCRONO 202 `{accepted:true}` si acepta (la vuelta llega después por el callback) o un RECHAZO con `error`.
// Un rechazo síncrono significa que el agente NO arrancó: se avisa YA a la oficina (resultado con error) en lugar de esperar la espera entera.
const c = $('② Armar el pedido').first().json
const e = $input.first().json || {}
const r = e.body && typeof e.body === 'object' ? e.body : e
// el nodo HTTP falló (red, tiempo): n8n entrega `{error:{message…}}` con `error` OBJETO · el rechazo de run-sdk trae `error` como TEXTO
if (r.error && typeof r.error === 'object') {
  return [{ json: { ...c, aceptado: false, resultado_body: { accion: 'resultado', encargo_id: c.encargo_id, n: c.turno.n, error: 'OFICINA_PEDIDO_NO_LLEGO · ' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 200), costo_usd: 0, workflow_execution_id: $execution.id } } }]
}
if (r.accepted === true) return [{ json: { ...c, aceptado: true } }]
const partes = [r.error, r.code, r.detail].filter((x) => x !== undefined && x !== null && x !== '')
return [{ json: { ...c, aceptado: false, resultado_body: { accion: 'resultado', encargo_id: c.encargo_id, n: c.turno.n, error: 'OFICINA_PEDIDO_RECHAZADO · ' + (partes.length ? partes.map(String).join(' · ').slice(0, 240) : JSON.stringify(r).slice(0, 200)), costo_usd: 0, workflow_execution_id: $execution.id } } }]
