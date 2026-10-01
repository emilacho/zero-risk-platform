// ② GUARDA · sin manual APROBADO se DETIENE · CC#1 · 2026-10-01. El manual aporta las palabras prohibidas para los chequeos (el brief ya trae las suyas).
const prev = $('① GUARDA · el parte y el brief').first().json
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
