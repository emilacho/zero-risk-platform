// ③ Fin: una sola salida con lo que pasó (el seco no escribe ni llama al modelo; el rastro queda en la respuesta del webhook).
const e = $input.first().json
if (e.fin) return [{ json: e.fin }]
const r = e.escrito && e.escrito.body ? e.escrito.body : e.escrito
if (e.dry_run) return [{ json: { ok: true, dry_run: true, client_id: e.client_id, insumos: e.insumos, task_chars: e.insumos && e.insumos.task ? e.insumos.task.length : 0 } }]
if (!r || r.ok !== true) return [{ json: { ok: false, error: (r && r.error) || 'escribir_fallo', detalle: (r && r.detalle) || 'la puerta de escribir no contestó' } }]
return [{ json: { ok: true, dry_run: false, client_id: e.client_id, version: r.version, id: r.id, solo_cambia: r.solo_cambia, costo_usd: e.costo_usd, fotos_propias: e.insumos.fotos_propias, sin_fotos_propias: e.insumos.sin_fotos_propias } }]
