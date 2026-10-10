// ⑤ SALIDA · lo que el sub-flujo le devuelve a la puerta (los sub-flujos NO llaman a la sala: el cable de vuelta lo manda la puerta)
const s = $input.first().json
const d = s.detalle && typeof s.detalle === 'object' ? s.detalle : {}
return [{ json: { paso: s.paso, campana_id: s.campana_id, tanda: s.tanda ?? null, resultado: s.resultado, alerta: s.alerta || null, fichas: s.fichas || [], fechas_pedidas: d.fechas_pedidas || [], detalle: d } }]
