// ② RE-ARMAR EL PASO MUERTO · CC#2 · 2026-10-09 · con la respuesta de `POST /api/oficina/turnos {accion:'siguiente'}` para cada encargo cuyo paso murió (primer intento): el MISMO paso, con el mismo número y la misma dispatch_key.
// Un ítem por encargo (itemMatching empareja cada respuesta con su pendiente); si uno falla se DETIENE con su motivo, nunca se lee como «nada que hacer».
const salida = []
const respuestas = $input.all()
for (let k = 0; k < respuestas.length; k++) {
  const e = respuestas[k].json || {}
  const i = $('① Qué hacer con cada pendiente').itemMatching(k).json
  if (e.error && typeof e.error === 'object') throw new Error('OFICINA_VIGIA_REARMAR_NO_LLEGO · ' + String(e.error.message || 'sin detalle').slice(0, 200))
  const status = Number(e.statusCode)
  const b = e.body && typeof e.body === 'object' ? e.body : {}
  if (status === 200 && b.accion === 'esperar' && b.turno && b.turno.pedido) { salida.push({ json: { llave: i.llave, turno_body: { encargo_id: i.encargo_id, turno: b.turno } } }); continue }
  if (status === 200 && b.accion === 'cerrado') continue // se cerró por otro camino mientras tanto: nada que reanudar
  throw new Error('OFICINA_VIGIA_REARMAR_RECHAZADO · /api/oficina/turnos contestó ' + status + ' · ' + String(b.error || b.detalle || JSON.stringify(b)).slice(0, 200))
}
return salida
