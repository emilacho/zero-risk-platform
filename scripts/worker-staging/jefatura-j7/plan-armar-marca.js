// JEF · plan · armar la marca · J7 · CC#1 · 2026-10-14 · R4 cerrado POR DISEÑO (firma A): si la revisión del plan NO terminó bien (se pasó el plazo, o cerró con desacuerdo / sin segunda mirada / por tope / fallida)
// el plan sigue su camino con su marca «revisión incompleta» — nunca se pierde y nunca se hace pasar por revisado. Cuelga de «Plan vigente» como una rama lateral: no cambia lo que reciben el PDF, el aviso ni el brief.
// Sin marca que poner (jefatura apagada, 409, error, revisión limpia) no devuelve ítems y la rama termina aquí: idéntico a hoy. La marca se escribe en el `provenance_tag` COMPLETO de la fila vigente (G5), nunca parcial.
const CFG = __CFG__
const pv = $input.first().json || {}
let jef = {}
try { jef = $('JEF · aplicar').first().json.jef || {} } catch (x) { jef = {} }
let resultado = null, motivo = null
if (jef.fase === 'plazo') { resultado = 'incompleta_por_plazo'; motivo = String(jef.motivo || 'se acabó el plazo de la revisión') }
else if (jef.fase === 'cerrada' && jef.salida && typeof jef.salida === 'object') {
  let r = String(jef.salida.resultado || '')
  // si hubo versiones nuevas, el resultado final (con_desacuerdo cuando no se adoptó la última) lo dijo `elegir_version`
  try { const est = $('JEF · plan · el plan de guardado').first().json; if (est && est.resultado) r = String(est.resultado) } catch (x) { /* no hubo elección */ }
  if (r && r !== 'limpia') resultado = r
}
if (!resultado) return []
const tag = pv.provenance_tag
if (typeof pv.id !== 'string' || !pv.id || !tag || typeof tag !== 'object' || Array.isArray(tag) || !Object.keys(tag).length) return []
if (tag.jefatura_marcas && tag.jefatura_marcas.resultado === resultado && tag.jefatura_marcas.revision_id === (jef.revision_id || null)) return []
let cliente = null
try { cliente = $('¿Llegó la vuelta?').first().json.client_name } catch (x) { cliente = null }
const jefatura_marcas = { resultado, revision_id: jef.revision_id || null, motivo, marcado_en: new Date().toISOString() }
const texto = ':warning: *Plan con revisión incompleta* — ' + String(cliente || 'el cliente') + '\n• la revisión de calidad terminó: `' + resultado + '`' + (motivo ? ' (' + motivo + ')' : '') + '\n• el plan SIGUE su camino (PDF y brief) marcado en su `provenance_tag.jefatura_marcas`; queda marcado para revisión'
return [{ json: { id: pv.id, cuerpo: { provenance_tag: Object.assign({}, tag, { jefatura_marcas }) }, texto, resultado } }]
