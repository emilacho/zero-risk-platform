// ⑦ EL BORRADOR Y LA TARJETA (S8). Arma el cuerpo de `POST /api/manual/borrador` con el manual FINAL (el que salió de la última puerta). `dry_run` es false aquí porque este nodo solo se alcanza con dry_run=false.
// Lo retirado sin fuente lo recalcula la ruta y queda solo en el registro interno del borrador: este flujo NO lo manda a ninguna bandeja ni canal.
const est = $input.first().json
const con = est.manual_final_origen === 'respuesta'
const body = {
  client_id: est.client_id, dry_run: false, workflow_id: est.workflow_id, workflow_execution_id: est.workflow_execution_id,
  manual: est.manual_final, opinion: est.opinion || null, respuesta_del_autor: con ? est.respuesta_del_autor : null,
  costo_usd: Math.round((Number(est.costo_usd) || 0) * 1e6) / 1e6, fidelidad: est.fidelidad || null,
}
return [{ json: { ...est, borrador_body: body } }]
