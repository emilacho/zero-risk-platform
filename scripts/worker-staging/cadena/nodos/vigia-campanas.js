// 2 · UNA FILA POR CAMPAÑA ACTIVA · sin campañas, un solo ítem `ninguna` (la corrida termina limpia, no «en error»)
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status !== 200) throw new Error('VIGIA_CAMPANAS_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle'))
const cs = Array.isArray(b.campanas) ? b.campanas : []
if (cs.length === 0) return [{ json: { ninguna: true } }]
return cs.map((c) => ({ json: { ninguna: false, campana_id: c.id, client_id: c.client_id, seco: c.seco === true, sala_ref: c.sala_ref || {} } }))
