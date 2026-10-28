// ⓪ TOMAR EL TURNO · CC#2 · 2026-10-28 · el flujo acusa recibo del turno (POST /api/oficina/turnos {accion:'acuse'}). Solo UN flujo lo toma: si otro despertar (el vigía, un reintento, una reapertura a mano) llega después,
// la sala contesta `ya_tomado` y ESTE flujo se detiene aquí, SIN llamar al agente ni al portero (nada se paga dos veces). Si la llamada del acuse falla, el flujo sigue (el acuse nunca frena una pieza por sí solo).
const e = $('⓪ Entrada · llave').first().json
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (Number(r.statusCode) === 200 && (b.acuse === 'ya_tomado' || b.acuse === 'no_abierto')) return []
return [{ json: e }]
