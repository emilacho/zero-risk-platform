// CICLO DEL PLAN · tramo 2 · CC1 · 01-nov · nodo Code «Ciclo · armar cierres» (flujo X9F0zp6LQ2xGEYVS). Va DESPUÉS de «Plan vigente» y ANTES de «Parar · ¿plan revisado?».
// Arma los cuerpos que los HTTP siguientes mandan a la base (cada uno con su fila; lo que no aplica sale null y su HTTP no corre):
//   (1) aprobacion · la COMPUERTA: una fila en plan_aprobaciones por versión real (un ensayo no abre compuerta) con el sobre con que `plan-aprobar` reanuda la segunda mitad
//   (2) anterior   · solo reescritura: el plan base queda reemplazado POR EL TAG (vigente=false · superseded_por · superseded_en); su status NO cambia y la fila NO se borra
//   (3) hermanas   · las otras filas de ESTA corrida (A, y B o C no elegidas) quedan vigente=false: solo la que eligió «Plan vigente» es la vigente
//   (4) campana    · solo reescritura: cadena_campanas.plan_id pasa del plan base a la vigente
//   (5) cambio     · solo reescritura con plan_cambio_id: el pedido del dueño queda aplicado con plan_nuevo_id
//   (6) aprobacion_anterior · solo reescritura: la compuerta del plan base queda «reemplazado»
// PATCH de provenance_tag REEMPLAZA el jsonb entero: por eso se manda el tag completo, nunca una clave suelta.
const g = $('Plan vigente').first().json
const gb = g && g.body ? g.body : g
const fila = Array.isArray(gb) ? gb[0] : gb
if (!fila || !fila.id) throw new Error('CICLO_SIN_PLAN_GUARDADO · «Plan vigente» no trajo una fila con id: no hay compuerta que abrir')
const v = (g && g.jef_vigente) || $('¿Llegó la vuelta?').first().json
const body = (function () { try { return $('Webhook · planeacion').first().json.body || {} } catch (e) { return {} } })()
let re = null
try { re = $('Plan anterior · leer').first().json } catch (e) { re = null }
const esRe = !!(re && re.reescritura === true && re.plan_anterior && re.plan_anterior.id)
const seco = body.dry_run === true
const ahora = new Date().toISOString()
const tagDe = (f) => (f && f.provenance_tag && typeof f.provenance_tag === 'object' && !Array.isArray(f.provenance_tag) ? f.provenance_tag : {})
const version = Number.isInteger(tagDe(fila).version) && tagDe(fila).version >= 1 ? tagDe(fila).version : (esRe ? (Number(re.plan_anterior.version) || 1) + 1 : 1)
// (3) las hermanas: A (de «Guardar el plan») y B/C guardadas por la jefatura, menos la elegida
const hermanas = []
const sumar = (f) => { if (f && f.id && f.id !== fila.id && !hermanas.some((h) => h.id === f.id)) hermanas.push({ id: f.id, provenance_tag: Object.assign({}, tagDe(f), { vigente: false, superseded_por: fila.id, superseded_en: ahora, hermana_de_la_misma_corrida: true }) }) }
try { const a = $('Guardar el plan').first().json; const ab = a && a.body ? a.body : a; sumar(Array.isArray(ab) ? ab[0] : ab) } catch (e) { /* sin A */ }
for (const S of ['B', 'C']) { try { const r = $('JEF · plan · guardar ' + S).first().json; const rb = Array.isArray(r.body) ? r.body[0] : null; if (r && [200, 201].indexOf(Number(r.statusCode)) !== -1) sumar(rb) } catch (e) { /* esa versión no corrió */ } }
const sobre = {
  client_id: fila.client_id, plan_id: fila.id, version: version,
  client_name: v.client_name || null, con_pendientes: v.con_pendientes === true,
  dry_run: seco, plan_v3: body.plan_v3 === true, corrida: body.corrida || null,
  _journey_id: body._journey_id || null, _sala_correlation_id: body._sala_correlation_id || null,
  tenant_id: body.tenant_id || fila.client_id, planeacion_execution_id: $execution.id,
}
return [{ json: {
  es_reescritura: esRe, version: version, seco: seco, plan_id: fila.id,
  // sin_compuerta = la segunda mitad corre aquí mismo: abrir una compuerta permitiría aprobar después y sacar un SEGUNDO brief
  aprobacion: seco || body.sin_compuerta === true ? null : { client_id: fila.client_id, plan_id: fila.id, version: version, estado: 'pendiente', sobre_de_reanudacion: sobre, workflow_id: $workflow.id, workflow_execution_id: $execution.id },
  anterior: esRe ? { id: re.plan_anterior.id, provenance_tag: Object.assign({}, re.plan_anterior.tag || {}, { vigente: false, superseded_por: fila.id, superseded_en: ahora }) } : null,
  hermanas: hermanas,
  campana: esRe ? { client_id: String(fila.client_id), plan_id_anterior: String(re.plan_anterior.id), plan_id: String(fila.id), actualizada_en: ahora } : null,
  cambio: esRe && re.plan_cambio_id ? { id: re.plan_cambio_id, estado: 'aplicado', plan_nuevo_id: fila.id, workflow_execution_id: $execution.id, actualizado_en: ahora } : null,
  aprobacion_anterior: esRe ? { plan_id: re.plan_anterior.id, estado: 'reemplazado', actualizado_en: ahora } : null,
  sobre: sobre,
} }]
