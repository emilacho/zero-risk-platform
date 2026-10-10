// ③ ¿Y AHORA? · CC#2 · 2026-10-09 · decide qué sigue con la respuesta REAL de `POST /api/oficina/turnos` (statusCode + body).
//   200 `esperar` → el SIGUIENTE paso: se vuelve a despertar este mismo flujo (una ejecución por paso: ninguna pasa de unos minutos)
//   200 `cerrado` → el encargo terminó (bandeja, desacuerdo, tope o fallido): se manda el CABLE a la sala con el resultado REAL
//   cualquier otra respuesta (409 turno no esperado, 5xx…) → se DETIENE con su motivo (nunca se da por bien)
const c = $('⓪ Entrada · llave').first().json
const e = $input.first().json || {}
if (e.error && typeof e.error === 'object') throw new Error('OFICINA_RESULTADO_NO_LLEGO · POST /api/oficina/turnos falló antes de recibir respuesta (' + String(e.error.message || e.error.name || 'sin detalle').slice(0, 160) + ')')
const status = Number(e.statusCode)
const b = e.body && typeof e.body === 'object' ? e.body : {}
if (status === 200 && b.accion === 'esperar' && b.turno) return [{ json: { llave: c.llave, ruta: 'esperar', turno_body: { encargo_id: c.encargo_id, turno: b.turno } } }]
if (status === 200 && b.accion === 'cerrado') {
  const ref = b.sala_ref && typeof b.sala_ref === 'object' ? b.sala_ref : {}
  return [{ json: { llave: c.llave, ruta: 'cable', payload_cable: {
    event_type: 'run_completed', worker_id: $workflow.id, worker_name: 'oficina',
    resultado: String(b.resultado_para_la_sala || 'fallido'), encargo_id: c.encargo_id, estado: b.estado || null, con_desacuerdo: b.con_desacuerdo === true, simulado: b.simulado === true,
    _sala_correlation_id: ref._sala_correlation_id || null, _journey_id: ref._journey_id || null, ts: new Date().toISOString(),
  } } }]
}
throw new Error('OFICINA_TURNO_RECHAZADO · /api/oficina/turnos contestó ' + status + ' · ' + String(b.error || b.detalle || JSON.stringify(b)).slice(0, 240) + ' · se DETIENE')
