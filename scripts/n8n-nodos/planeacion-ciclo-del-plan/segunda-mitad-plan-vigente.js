// CICLO DEL PLAN · tramo 2 · CC1 · 01-nov · sub-flujo «Plan · segunda mitad (PDF → brief)» · nodo Code «Plan vigente» (MISMO nombre que en planeación, a propósito:
// los nodos copiados —«Plan → Drive (PDF)», «¿Salió el PDF?», «BRIEF · sobre»— leen `$('Plan vigente').first().json` y `.jef_vigente` sin tocarlos).
// Va después de «Plan · pedir» (HTTP GET `…/rest/v1/client_historical_outputs?select=id,client_id,output_type,status,content_text,content,provenance_tag&id=eq.{{ $('Sobre').first().json.body.plan_id }}`
// con fullResponse + neverError). Sin fila, sin texto o de otro cliente: se DETIENE (no hay PDF ni brief de un plan que no existe).
const s = $('Sobre').first().json.body
const r = $input.first().json || {}
if (r.error && typeof r.error === 'object') throw new Error('SEGUNDA_MITAD_PLAN_NO_LEGIBLE · la lectura del plan falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ')')
if (Number(r.statusCode) !== 200) throw new Error('SEGUNDA_MITAD_PLAN_NO_LEGIBLE · la base contestó ' + String(r.statusCode))
const filas = Array.isArray(r.body) ? r.body : []
const fila = filas[0]
if (!fila || !fila.id) throw new Error('SEGUNDA_MITAD_PLAN_INEXISTENTE · no existe el plan ' + String(s.plan_id))
if (String(fila.client_id) !== String(s.client_id)) throw new Error('SEGUNDA_MITAD_PLAN_DE_OTRO_CLIENTE · el plan no es de este cliente')
if (fila.output_type !== 'campaign_plan_90d') throw new Error('SEGUNDA_MITAD_NO_ES_UN_PLAN · la fila no es un plan de 90 días (' + String(fila.output_type) + ')')
const texto = String(fila.content_text || fila.content || '').trim()
if (!texto) throw new Error('SEGUNDA_MITAD_PLAN_SIN_TEXTO · el plan no tiene texto')
return [{ json: Object.assign({}, fila, { jef_vigente: {
  texto: texto, caracteres: texto.length, con_pendientes: s.con_pendientes === true, pendientes: null, estado_del_plan: s.con_pendientes === true ? 'con_pendientes' : 'listo',
  client_id: fila.client_id, client_name: s.client_name || 'cliente', llego_la_vuelta: true, etiqueta: s.aprobacion_id ? 'aprobada' : 'directa',
} }) }]
