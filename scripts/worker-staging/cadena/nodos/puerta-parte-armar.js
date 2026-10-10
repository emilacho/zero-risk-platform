// PARTE · el lote por fecha que mandó el vigía → la copia de la parte «por filas» (la original no se toca). Nada de decidir aquí: la copia valida el lote.
const s = $input.first().json
if (!s.campana_id || !s.lote || !Array.isArray(s.fila_ids) || s.fila_ids.length === 0) throw new Error('PUERTA_PARTE_SIN_LOTE · el sobre del vigía debe traer campana_id, lote y fila_ids · se DETIENE y no escribe nada')
const cuerpo = { client_id: s.client_id, tenant_id: s.tenant_id, campana_id: s.campana_id, lote: s.lote, fila_ids: s.fila_ids, dry_run: s.dry_run, _journey_id: s._journey_id, _sala_correlation_id: s._sala_correlation_id }
return [{ json: { ...s, cuerpo_parte: JSON.stringify(cuerpo) } }]
