// CICLO DEL PLAN · tramo 2 · CC1 · 01-nov · nodo Code «Plan anterior · leer» (flujo de planeación X9F0zp6LQ2xGEYVS). Va justo después de «Plan anterior · pedir»
// (HTTP GET de la fila del plan base: `…/rest/v1/client_historical_outputs?select=id,client_id,output_type,status,content_text,provenance_tag&id=eq.{{ plan_base_id || '00000000-0000-4000-8000-000000000000' }}`
// con fullResponse + neverError; sin plan_base_id pide un uuid que no existe y recibe [] sin fallar).
// Sin `plan_base_id` en el sobre ⇒ { reescritura: false } y la corrida sigue como hoy (plan de cero). Con él ⇒ valida la fila y DETIENE antes de gastar si algo no cuadra.
const body = (function () { try { return $('Webhook · planeacion').first().json.body || {} } catch (e) { return {} } })()
const id = body.plan_base_id
if (id === undefined || id === null || id === '') return [{ json: { reescritura: false } }]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (typeof id !== 'string' || !UUID.test(id)) throw new Error('REESCRITURA_PLAN_BASE_INVALIDO · plan_base_id no es un uuid · se DETIENE antes de gastar')
const cambios = typeof body.cambios_del_dueno === 'string' ? body.cambios_del_dueno.trim() : ''
if (cambios.length < 5 || cambios.length > 4000) throw new Error('REESCRITURA_SIN_CAMBIOS · cambios_del_dueno debe tener de 5 a 4000 caracteres · se DETIENE antes de gastar')
const r = $input.first().json || {}
if (r.error && typeof r.error === 'object') throw new Error('REESCRITURA_PLAN_BASE_NO_LEGIBLE · la lectura del plan base falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ') · se DETIENE antes de gastar')
if (Number(r.statusCode) !== 200) throw new Error('REESCRITURA_PLAN_BASE_NO_LEGIBLE · la base contestó ' + String(r.statusCode) + ' · se DETIENE antes de gastar')
const filas = Array.isArray(r.body) ? r.body : []
const f = filas[0]
if (!f || !f.id) throw new Error('REESCRITURA_PLAN_BASE_INEXISTENTE · no existe el plan ' + id + ' · se DETIENE antes de gastar')
if (String(f.client_id) !== String(body.client_id)) throw new Error('REESCRITURA_PLAN_DE_OTRO_CLIENTE · el plan base no es de este cliente · se DETIENE antes de gastar')
if (f.output_type !== 'campaign_plan_90d') throw new Error('REESCRITURA_NO_ES_UN_PLAN · la fila ' + id + ' no es un plan de 90 días (' + String(f.output_type) + ') · se DETIENE antes de gastar')
if (f.status === 'rejected') throw new Error('REESCRITURA_PLAN_RECHAZADO · el plan base está rechazado · se DETIENE antes de gastar')
const tag = f.provenance_tag && typeof f.provenance_tag === 'object' && !Array.isArray(f.provenance_tag) ? f.provenance_tag : {}
if (tag.vigente === false || tag.superseded_por) throw new Error('REESCRITURA_PLAN_REEMPLAZADO · el plan base ya fue reemplazado por una versión más nueva · se DETIENE antes de gastar')
const texto = String(f.content_text || f.content || '').trim()
if (!texto) throw new Error('REESCRITURA_PLAN_SIN_TEXTO · el plan base no tiene texto · se DETIENE antes de gastar')
const version = Number.isInteger(tag.version) && tag.version >= 1 ? tag.version : 1
if (version > 3) throw new Error('REESCRITURA_TOPE_DE_VUELTAS · el plan ya va por la versión ' + version + ' (3 reescrituras): se decide a mano · se DETIENE antes de gastar')
const cambioId = typeof body.plan_cambio_id === 'string' && UUID.test(body.plan_cambio_id) ? body.plan_cambio_id : null
return [{ json: {
  reescritura: true,
  plan_anterior: { id: f.id, version: version, texto: texto, tag: tag, status: f.status },
  version_nueva: version + 1,
  cambios_del_dueno: cambios,
  plan_cambio_id: cambioId,
  // el PATCH que sigue (HTTP «Cambio · en reescritura») deja el pedido del dueño como tomado por esta corrida; sin plan_cambio_id (disparo a mano) no hay nada que marcar
  cambio_patch: cambioId ? { id: cambioId, estado: 'en_reescritura', workflow_id: $workflow.id, workflow_execution_id: $execution.id, actualizado_en: new Date().toISOString() } : null,
} }]
