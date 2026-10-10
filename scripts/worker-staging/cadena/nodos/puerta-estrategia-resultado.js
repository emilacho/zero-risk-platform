// 2 · ¿ESTRATEGIA? · terminó bien (o ya estaba hecha) → sigue; si la campaña necesita a Emilio → se corta aquí y se avisa por el cable
const s = $('1 · ¿Abierta?').last().json
const r = $input.first().json || {}
if (r.resultado === 'ok' || r.resultado === 'ya_hecha') return [{ json: { ...s, sigue: true, fechas_pedidas: Array.isArray(r.fechas_pedidas) ? r.fechas_pedidas : [] } }]
return [{ json: { ...s, sigue: false, resultado: 'necesita_humano', alerta: r.alerta || null, nota: 'la estrategia no quedó validada: ' + String(r.resultado) } }]
