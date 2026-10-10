// ⑥ SALIDA · lo que el sub-flujo de fechas le devuelve a la puerta (una fecha sin fuente NUNCA detiene la campaña: solo deja pendientes las FILAS que dependen de ella)
// Llega por dos caminos: el FIN temprano (ya verificada / sin fuente: un ítem con `resultado`) o la respuesta de `guardar` (fullResponse).
const e = $input.first().json || {}
const esRespuesta = e.statusCode !== undefined && e.body !== undefined
const b = esRespuesta ? (e.body && typeof e.body === 'object' ? e.body : {}) : (e.detalle && typeof e.detalle === 'object' ? e.detalle : {})
if (esRespuesta && Number(e.statusCode) >= 400) throw new Error('CADENA_FECHAS_GUARDAR_' + String(b.code || b.error || e.statusCode) + ' · ' + String(b.detalle || b.detail || 'sin detalle'))
const entrada = $('⓪ Entrada').last().json
return [{ json: { paso: 'fechas', campana_id: entrada.campana_id, tipo: entrada.tipo, resultado: esRespuesta ? (b.estado || 'ok') : (e.resultado || 'ok'), verificadas: b.verificadas ?? 0, descartadas: b.descartadas || [] } }]
