// ① EL VIGÍA · CC#2 · 2026-10-09 · con la respuesta de `POST /api/oficina/vigia` arma UN ítem por trabajo pendiente: encargos a re-armar (paso muerto, primer intento) y cables de los que cerraron fallidos.
// Con la oficina apagada la ruta contesta `apagada` y no sale ningún ítem. Un error de la ruta se DETIENE (no se lee como «nada que hacer»).
const e = $input.first().json || {}
if (e.error && typeof e.error === 'object') throw new Error('OFICINA_VIGIA_NO_LLEGO · ' + String(e.error.message || 'sin detalle').slice(0, 200))
const status = Number(e.statusCode)
const b = e.body && typeof e.body === 'object' ? e.body : {}
if (status !== 200) throw new Error('OFICINA_VIGIA_RECHAZADO · /api/oficina/vigia contestó ' + status + ' · ' + String(b.error || b.detalle || JSON.stringify(b)).slice(0, 200))
if (b.accion !== 'vigilado') return [] // apagada o dry_run: nada que hacer
const llave = String($env.SALA_DISPATCH_KEY || '')
const items = []
for (const id of Array.isArray(b.reanudar) ? b.reanudar : []) items.push({ json: { tipo: 'reanudar', llave, encargo_id: String(id) } })
for (const c of Array.isArray(b.cierres) ? b.cierres : []) {
  const ref = c.sala_ref && typeof c.sala_ref === 'object' ? c.sala_ref : {}
  items.push({ json: { tipo: 'cable', llave, payload_cable: {
    event_type: 'run_completed', worker_id: $workflow.id, worker_name: 'oficina', resultado: String(c.resultado_para_la_sala || 'fallido'),
    brief_id: c.brief_id || null, client_id: c.client_id || null, tenant_id: c.client_id || null,
    _sala_correlation_id: ref._sala_correlation_id || null, _journey_id: ref._journey_id || null, ts: new Date().toISOString(),
  } } })
}
return items
