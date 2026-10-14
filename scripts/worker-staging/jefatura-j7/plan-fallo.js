// JEF · plan · algo falló · J7 · CC#1 · 2026-10-14 · cualquier paso de guardar una versión que no salió bien termina AQUÍ y sigue a «Plan vigente», que devuelve la última fila realmente guardada (o A).
// Nada se reintenta y nada se borra: lo ya guardado queda (con su rastro) y se dice qué falló. NO lanza.
const CFG = __CFG__
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
return [{ json: { fallo: true, http: Number.isFinite(Number(r.statusCode)) ? Number(r.statusCode) : null, detalle: String(b.error || b.detalle || (r.error && r.error.message) || 'sin detalle').slice(0, 300) } }]
