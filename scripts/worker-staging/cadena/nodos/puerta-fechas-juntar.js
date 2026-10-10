// 3 · JUNTAR · vuelve UN solo ítem (si no, el calendario correría una vez por tipo) · una fecha sin fuente NUNCA detiene la campaña
const s = $('3 · Fechas · ¿hay?').last().json
return [{ json: { ...s, fechas_hechas: $input.all().map((i) => i.json.resultado) } }]
