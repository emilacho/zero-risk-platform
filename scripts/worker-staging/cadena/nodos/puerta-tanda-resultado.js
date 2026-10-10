// TANDA · ¿RESULTADO? · lo que el cable le cuenta a la sala
const s = $('⓪ Decidir').last().json
const r = $input.first().json || {}
const bien = r.resultado === 'ok' || r.resultado === 'ya_hecha'
return [{ json: { ...s, resultado: bien ? 'cadena_abierta' : 'necesita_humano', alerta: bien ? null : (r.alerta || null), nota: 'tanda ' + String(s.tanda) + ': ' + String(r.resultado) } }]
