// ① ¿QUÉ PASÓ AL ABRIR? · CC#2 · 2026-10-09 · decide el camino de la puerta con la respuesta REAL de /api/oficina/encargos (HTTP con respuesta completa: statusCode + body).
//   409 `oficina_no_abre` (apagada · familia no activa · cliente fuera del ensayo)  → PASARELA: el sobre sigue, intacto, por la pieza simple (el comportamiento de hoy)
//   200 `esperar`                                                                   → TURNO: arranca el flujo de turnos con el primer paso
//   200 `cerrado`                                                                   → CABLE: el encargo cerró al abrir (fallido, p. ej. la parte no existe) y la sala se entera
//   200 `ya_existia`                                                                → NADA: el mismo pedido ya tiene encargo (idempotente)
// Cualquier otra cosa se DETIENE con su motivo (nunca se traga un error ni se manda a la pasarela por duda).
const s = $('⓪ Sobre · llave').first().json
const e = $input.first().json || {}
if (e.error && typeof e.error === 'object') {
  throw new Error('OFICINA_ABRIR_NO_LLEGO · la llamada a /api/oficina/encargos falló antes de recibir respuesta (' + String(e.error.message || e.error.name || 'sin detalle').slice(0, 160) + ') · se DETIENE: no se manda a la pieza simple por duda')
}
const status = Number(e.statusCode)
const b = e.body && typeof e.body === 'object' ? e.body : {}

const cable = (resultado) => ({
  event_type: 'run_completed',
  worker_id: $workflow.id,
  worker_name: 'oficina',
  resultado,
  brief_id: s.body.brief_id || null,
  client_id: s.body.client_id || null,
  tenant_id: s.body.tenant_id || s.body.client_id || null,
  _sala_correlation_id: s.body._sala_correlation_id || null,
  _journey_id: s.body._journey_id || null,
  ts: new Date().toISOString(),
})
const base = { llave: s.llave, cuerpo_original: s.body }

if (status === 409 && b.error === 'oficina_no_abre') return [{ json: { ...base, ruta: 'pasarela', motivo: b.motivo || null } }]
if (status === 200 && b.accion === 'esperar' && b.encargo_id && b.turno) return [{ json: { ...base, ruta: 'turno', turno_body: { encargo_id: b.encargo_id, turno: b.turno } } }]
if (status === 200 && b.accion === 'cerrado') return [{ json: { ...base, ruta: 'cable', payload_cable: cable(String(b.resultado_para_la_sala || 'fallido')), motivo: b.motivo || null } }]
if (status === 200 && b.accion === 'ya_existia') return [{ json: { ...base, ruta: 'nada', encargo_id: b.encargo_id || null } }]
throw new Error('OFICINA_ABRIR_RECHAZADO · /api/oficina/encargos contestó ' + status + ' · ' + String(b.error || b.detalle || JSON.stringify(b)).slice(0, 240) + ' · se DETIENE')
