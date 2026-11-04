// CICLO DEL PLAN · tramo 2 · CC1 · 01-nov · sub-flujo «Plan · segunda mitad (PDF → brief)» · nodo Code «Sobre».
// El sub-flujo entra por DOS puertas: el webhook `zero-risk/plan-aprobado` (lo despierta la puerta `plan-aprobar` con la llave de despacho; antes pasa por
// una «⓪ Llave» igual a la de planeación) o la llamada directa desde la planeación (Execute Workflow, cuando NO hay compuerta: ensayo o `sin_compuerta`).
// Deja UN solo sobre normalizado en `body`: los nodos copiados de la cola de planeación leen `$('Sobre').first().json.body` donde antes leían `$('Webhook · planeacion').first().json.body`.
const e = $input.first().json || {}
const b = e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : e
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (typeof b.plan_id !== 'string' || !UUID.test(b.plan_id)) throw new Error('SEGUNDA_MITAD_SIN_PLAN · el sobre no trae plan_id (uuid) · se DETIENE antes de tocar nada')
if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) throw new Error('SEGUNDA_MITAD_SIN_CLIENTE · el sobre no trae client_id (uuid) · se DETIENE antes de tocar nada')
return [{ json: { body: {
  client_id: b.client_id, plan_id: b.plan_id, tenant_id: typeof b.tenant_id === 'string' && b.tenant_id ? b.tenant_id : b.client_id,
  aprobacion_id: typeof b.aprobacion_id === 'string' && UUID.test(b.aprobacion_id) ? b.aprobacion_id : null,
  client_name: typeof b.client_name === 'string' && b.client_name.trim() ? b.client_name.trim() : null,
  con_pendientes: b.con_pendientes === true, dry_run: b.dry_run === true, plan_v3: b.plan_v3 === true,
  corrida: typeof b.corrida === 'string' && b.corrida ? b.corrida : null,
  _journey_id: typeof b._journey_id === 'string' && b._journey_id ? b._journey_id : null,
  _sala_correlation_id: typeof b._sala_correlation_id === 'string' && b._sala_correlation_id ? b._sala_correlation_id : null,
  aprobado_por: typeof b.aprobado_por === 'string' ? b.aprobado_por : null,
  origen: typeof b.origen === 'string' ? b.origen : 'planeacion/directo',
} } }]
