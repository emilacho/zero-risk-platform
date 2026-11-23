// ① Guarda de preparar: la puerta contesta siempre (neverError); aquí se decide. Un fallo es un fin claro, no un paso a medias.
const e = $('⓪ Entrada · llave').first().json
const r = $input.first().json
const body = r.body ? r.body : r
if (!body || body.ok !== true || !body.insumos) {
  return [{ json: { ...e, sigue: false, fin: { ok: false, error: (body && body.error) || 'preparar_fallo', detalle: (body && body.detalle) || 'la puerta de preparar no contestó' } } }]
}
return [{ json: { ...e, sigue: true, insumos: body.insumos } }]
