// 2b · SEGUIR · el lector NO es reja: pase lo que pase (fichas guardadas, ya hechas, sin fichas o un fallo del sub-flujo) la puerta sigue con lo que dejó la estrategia,
// tal cual, y suma solo cómo terminó el lector. Sin fichas, la hoja lo declara.
const s = $('2 · ¿Estrategia?').last().json
const r = $input.first().json || {}
const fichas = r.error ? { resultado: 'fallo', error: String(r.error.message || r.error).slice(0, 300) } : { resultado: r.resultado || null, detalle: r.detalle || null }
return [{ json: { ...s, lector_de_fichas: fichas } }]
