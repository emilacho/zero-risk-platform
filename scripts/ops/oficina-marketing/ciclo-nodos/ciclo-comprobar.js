// CICLO DEL PLAN · tramo 2 · CC2 · «Ciclo · comprobar»: ningún cierre puede fallar en silencio. Una compuerta que no se abrió, un plan anterior que sigue «vigente» o una campaña que sigue apuntando
// al plan viejo se arreglan a mano, pero NO pasan: la corrida se DETIENE y dice cuál paso falló. Un paso que no corrió (porque no aplicaba) no cuenta.
const c = $('Ciclo · armar cierres').first().json
const aplica = {
  'Compuerta · abrir': !!c.aprobacion,
  'Anterior · reemplazado': !!c.anterior,
  'Campaña · a la vigente': !!c.campana,
  'Cambio · aplicado': !!c.cambio,
  'Compuerta anterior · reemplazada': !!c.aprobacion_anterior,
}
const fallos = []
const estado = (r) => Number(r && r.statusCode)
const bueno = (r) => { const s = estado(r); return s >= 200 && s < 300 }
for (const paso of Object.keys(aplica)) {
  if (!aplica[paso]) continue
  let items = null
  try { items = $(paso).all() } catch (e) { items = null }
  if (!items || !items.length) { fallos.push(paso + ' (no corrió)'); continue }
  const mal = items.find((i) => !bueno(i.json))
  if (mal) fallos.push(paso + ' (la base contestó ' + String(estado(mal.json)) + ')')
}
if (Array.isArray(c.hermanas) && c.hermanas.length) {
  let items = null
  try { items = $('Hermanas · no vigentes').all() } catch (e) { items = null }
  if (!items || !items.length) fallos.push('Hermanas · no vigentes (no corrió)')
  else { const mal = items.find((i) => !bueno(i.json)); if (mal) fallos.push('Hermanas · no vigentes (la base contestó ' + String(estado(mal.json)) + ')') }
}
if (fallos.length) throw new Error('CICLO_CIERRE_INCOMPLETO · ' + fallos.join(' · ') + ' · el plan ' + String(c.plan_id) + ' quedó guardado pero el ciclo NO se cerró: se arregla a mano antes de seguir')
let aprobacionId = null
if (aplica['Compuerta · abrir']) { const r = $('Compuerta · abrir').first().json; const cuerpo = Array.isArray(r.body) ? r.body[0] : null; aprobacionId = cuerpo && cuerpo.id ? cuerpo.id : null; if (!aprobacionId) throw new Error('CICLO_COMPUERTA_SIN_ID · la base no devolvió la fila de la compuerta') }
return [{ json: { ok: true, plan_id: c.plan_id, version: c.version, aprobacion_id: aprobacionId, seco: c.seco === true } }]
