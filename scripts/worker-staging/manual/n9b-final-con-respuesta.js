// ⑥ El manual final es el que salió de la puerta DESPUÉS de la respuesta del autor.
const est = $('⑥ Respuesta · vuelta').first().json
const r = $input.first().json || {}
const c = r.body ? r.body : r
return [{ json: { ...est, manual_final: c && c.manual ? c.manual : est.despues2, manual_final_origen: 'respuesta', puerta2: { introducidos: (c && c.introducidos) || [], retirados: (c && c.retirados) || [] } } }]
