// ① EL VIGÍA · CC#2 · J4 · 2026-10-13 · con la respuesta de `POST /api/jefatura/vigia` arma UN ítem por trabajo pendiente: revisiones a re-armar (paso muerto a los 12 min, primer intento) y entregas de las que cerraron `fallida` por el vigía.
// Con la jefatura apagada la ruta contesta `apagada` y no sale ningún ítem. Un error de la ruta se DETIENE (no se lee como «nada que hacer»).
const e = $input.first().json || {}
if (e.error && typeof e.error === 'object') throw new Error('JEFATURA_VIGIA_NO_LLEGO · ' + String(e.error.message || 'sin detalle').slice(0, 200))
const status = Number(e.statusCode)
const b = e.body && typeof e.body === 'object' ? e.body : {}
if (status !== 200) throw new Error('JEFATURA_VIGIA_RECHAZADO · /api/jefatura/vigia contestó ' + status + ' · ' + String(b.error || b.detalle || JSON.stringify(b)).slice(0, 200))
if (b.accion !== 'vigilado') return [] // apagada o dry_run: nada que hacer
const llave = String($env.SALA_DISPATCH_KEY || '')
const permitidas = [String($env.N8N_WEBHOOK_BASE || 'https://n8n-production-72be.up.railway.app/webhook').replace(/\/+$/, '') + '/', 'https://zero-risk-platform.vercel.app/']
const items = []
for (const id of Array.isArray(b.reanudar) ? b.reanudar : []) items.push({ json: { tipo: 'reanudar', llave, revision_id: String(id) } })
for (const c of Array.isArray(b.cierres) ? b.cierres : []) {
  const dev = c.devolver && typeof c.devolver === 'object' ? c.devolver : null
  const ref = c.sala_ref && typeof c.sala_ref === 'object' ? c.sala_ref : {}
  const tipo = dev && typeof dev.tipo === 'string' ? dev.tipo : (c.sala_ref ? 'sala_ref' : 'ninguno')
  if (tipo === 'webhook') {
    const url = String(dev.url || '')
    if (!permitidas.some((p) => url.startsWith(p))) throw new Error('JEFATURA_DESTINO_NO_PERMITIDO · devolver.url no es de nuestro n8n ni de nuestro Vercel · no se entrega a un tercero · se DETIENE (' + url.slice(0, 80) + ')')
    items.push({ json: { tipo: 'webhook', llave, entrega_url: url, entrega_cuerpo: { revision_id: String(c.revision_id || ''), resultado: String(c.resultado || 'fallida'), ...(dev.cuerpo && typeof dev.cuerpo === 'object' ? dev.cuerpo : {}) } } })
  } else if (tipo === 'sala_ref') {
    items.push({ json: { tipo: 'cable', llave, payload_cable: {
      event_type: 'run_completed', worker_id: $workflow.id, worker_name: 'jefatura', resultado: String(c.resultado_para_la_sala || c.resultado || 'fallido'),
      revision_id: String(c.revision_id || ''), client_id: c.client_id || null, tenant_id: c.client_id || null,
      _sala_correlation_id: ref._sala_correlation_id || null, _journey_id: ref._journey_id || null, ts: new Date().toISOString(),
    } } })
  }
}
return items
