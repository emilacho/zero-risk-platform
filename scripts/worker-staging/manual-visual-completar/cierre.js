// CIERRE · el manual nuevo tiene que haberse guardado de verdad (persisted:true); si no, el flujo FALLA ruidoso (el aviso de error lo recoge) · el intento ya está anotado, no hay bucle.
const d = $('Decidir y armar').first().json
const r = $input.first().json || {}
if (r.persisted !== true) throw new Error('MANUAL_VISUAL_NO_GUARDADO · ' + d.client_id + ' · ' + JSON.stringify(r).slice(0, 300))
return [{ json: { client_id: d.client_id, guardado: true, version: r.version, motivo: d.motivo, estado_antes: d.estado_antes, estado_nuevo: d.estado_nuevo } }]
