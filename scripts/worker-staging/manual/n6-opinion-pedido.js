// ⑤ LA OPINIÓN DE GPT CIEGO (S6). Arma el cuerpo de `POST /api/manual/opinion`: el manual (ya cerrado por la puerta) y nada más. GPT NO ve hallazgos, puntajes, versiones anteriores ni lo que corrigió el autor:
// la ruta arma el pedido con el manual en limpio y la materia cruda, con la UNA pregunta general.
const est = $('④ Juez · veredicto').first().json
const body = { client_id: est.client_id, dry_run: false, workflow_id: est.workflow_id, workflow_execution_id: est.workflow_execution_id, manual: est.manual1 }
return [{ json: { ...est, opinion_body: body } }]
