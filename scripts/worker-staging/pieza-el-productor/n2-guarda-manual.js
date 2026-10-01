// ② GUARDA · sin manual APROBADO se DETIENE · CC#1 · 2026-10-01. El manual aporta las palabras prohibidas para los chequeos (el brief ya trae las suyas).
const prev = $('① GUARDA · el parte y el brief').first().json
// 🔴 UN ERROR DE LA BASE NO ES «VACÍO» (certificación CC#3 · 01-oct): el nodo HTTP de la consulta tiene `onError: continueRegularOutput` y, si la base falla, entrega un ítem `{error:{…}}`
// (o PostgREST contesta un OBJETO `{code, message}` en vez de una lista). Leerlo como «sin manual» seguiría hacia el nodo que PAGA. Se DETIENE con su motivo.
const _filas = $input.all().map((i) => i.json)
const _falla = _filas.find((r) => r && ((r.error !== undefined && r.error !== null) || (r.code !== undefined && r.message !== undefined && r.id === undefined)))
if (_falla) {
  const _m = _falla.error && typeof _falla.error === 'object' ? (_falla.error.message || _falla.error.name) : (_falla.error || _falla.message)
  throw new Error('PIEZA_MANUAL_CONSULTA_FALLO · la consulta a la base FALLÓ (' + String(_m || 'sin detalle').slice(0, 160) + ') · un error no es «sin manual» · se DETIENE y NO escribe nada')
}
const filas = $input.all().map((i) => i.json).filter((r) => r && r.id)
if (filas.length === 0) {
  throw new Error('PIEZA_SIN_MANUAL · el cliente ' + prev.client_id + ' no tiene manual de marca · se DETIENE y NO escribe nada')
}
const m = filas[0]
if (m.gate_outcome !== 'paso_la_vara') {
  throw new Error('PIEZA_MANUAL_NO_APROBADO · manual ' + m.id + ' con gate_outcome=' + JSON.stringify(m.gate_outcome) + ' · se DETIENE y NO escribe nada')
}
return [{
  json: {
    ...prev,
    manual_id: m.id,
    manual_version: m.version,
    forbidden_words: Array.isArray(m.forbidden_words) ? m.forbidden_words : [],
    required_terminology: Array.isArray(m.required_terminology) ? m.required_terminology : [],
    manual_distinto_del_parte: !!(prev.manual_id_del_parte && prev.manual_id_del_parte !== m.id),
  },
}]
