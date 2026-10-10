// 4 · ¿CALENDARIO? · el resultado que el cable le cuenta a la sala: la cadena abrió, o la campaña necesita a Emilio
const s = $('2 · ¿Estrategia?').last().json
const r = $input.first().json || {}
const bien = r.resultado === 'ok' || r.resultado === 'ya_hecha'
return [{ json: { ...s, resultado: bien ? 'cadena_abierta' : 'necesita_humano', alerta: bien ? null : (r.alerta || null), nota: bien ? 'estrategia validada y tanda 1 materializada' : 'la tanda 1 no quedó: ' + String(r.resultado) } }]
