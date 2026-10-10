// ⑧ CIERRE con borrador: dice qué quedó escrito (borrador + tarjeta) y cuánto costó. Un error de la ruta se DICE (no se esconde). Nada de lo retirado sin fuente sale de este flujo hacia ningún canal.
const est = $('⑦ Borrador · pedido').first().json
const r0 = $input.first().json || {}
const r = r0.body ? r0.body : r0
return [{ json: { fin: r.ok === false ? 'borrador_con_error' : r.sin_cambios ? 'sin_cambios' : 'borrador_escrito', output_id: r.output_id || null, hitl_id: r.hitl_id || null, version_nueva: r.version_nueva === undefined ? null : r.version_nueva, costo_usd: est.costo_usd, error: r.error || null, autor_fallo: est.autor_fallo || null, respuesta_fallo: est.respuesta_fallo || null } }]
