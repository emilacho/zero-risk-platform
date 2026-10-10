// ④ EL JUEZ DE FIDELIDAD (paso nuevo, aditivo; el del cimiento cerrado NO se toca). Misma vara que siempre: puntúa 0..1 cuán soportado está cada campo, umbral 0,85, gateados `positioning` e `icp_summary`.
// 🔴 LA EVIDENCIA ES SOLO FUENTE CRUDA (firma D1): sale de `evidencia_del_juez` de la puerta (propia + humana). NUNCA documentos de ICP, resúmenes del descubrimiento ni trozos sintéticos del cerebro.
// Cabe en 14.000 caracteres (el corredor admite 16.000): si no cabe, CEDE LA EVIDENCIA, nunca los campos, y se declara.
const est = $('② Autor · vuelta').first().json
const r1 = $input.first().json || {}
const recomprobado = r1.body ? r1.body : r1
const manual1 = recomprobado && recomprobado.manual ? recomprobado.manual : est.despues
const CAMPOS = ['positioning', 'icp_summary', 'voice_description', 'customer_angle', 'retention_notes']
const TOPE = 14000
const PROSA = 'Eres un evaluador de FIDELIDAD (groundedness). Dada la EVIDENCIA real del cliente y los CAMPOS de un manual de marca, puntúa de 0 a 1 qué tan soportado por la evidencia está cada campo (1 = totalmente respaldado · 0 = inventado o contradice). LLAMA AL TOOL `emit_fidelity_scores` con tus puntajes (un número de 0 a 1 por campo). NO narres: usa el tool.\n\n'
const campos = JSON.stringify(CAMPOS.map((f) => ({ field: f, value: String(manual1[f] || '') })))
const cabEv = 'EVIDENCIA (solo el material crudo que el negocio publicó de sí mismo):\n'
const cabCampos = '\n\nCAMPOS:\n'
let ev = String((est.prep.evidencia_del_juez && est.prep.evidencia_del_juez.texto) || '')
const cabeEntera = PROSA.length + cabEv.length + ev.length + cabCampos.length + campos.length <= TOPE
let evidencia_recortada = est.prep.evidencia_del_juez ? est.prep.evidencia_del_juez.recortada === true : false
if (!cabeEntera) { ev = ev.slice(0, Math.max(0, TOPE - (PROSA.length + cabEv.length + cabCampos.length + campos.length))); evidencia_recortada = true }
const task = PROSA + cabEv + ev + cabCampos + campos
return [{ json: { ...est, manual1, puerta1: { introducidos: recomprobado.introducidos || [], retirados: recomprobado.retirados || [], eslogan: recomprobado.eslogan || null }, juez_task: task.slice(0, TOPE), juez_step: 'manual-juez-fidelidad', evidencia_recortada, evidencia_excluida: (est.prep.evidencia_del_juez && est.prep.evidencia_del_juez.excluidas) || [] } }]
