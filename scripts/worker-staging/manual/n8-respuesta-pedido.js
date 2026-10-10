// ⑥ EL AUTOR RESPONDE A LA OPINIÓN (S7), UNA sola pasada: por cada punto decide `tomada` (y corrige) o `no_tomada`, siempre con su razón. No puede meter un hecho sin cita: la puerta lo vuelve a cerrar después.
const est = $('⑤ Opinión · vuelta').first().json
const task =
  'Eres el escritor del manual de marca de un negocio. Un revisor independiente dio su OPINIÓN sobre el manual. Es una opinión, no un dato confirmado: puede equivocarse. ' +
  'Responde UNA sola vez: por cada punto de la opinión decide `tomada` (y corriges el manual) o `no_tomada`, y escribe siempre la razón. Solo puedes afirmar hechos que estén en la MATERIA cruda, con su cita literal; si no están, no los afirmes. ' +
  'No toques el campo `tagline`. Responde SOLO con un JSON: {"manual": <el manual completo>, "respuesta": [{"punto": "...", "decision": "tomada"|"no_tomada", "razon": "..."}]}.\n\n' +
  '## OPINIÓN DEL REVISOR\n' + est.opinion.texto + '\n\n## MANUAL\n' + JSON.stringify(est.manual1) + '\n\n## MATERIA CRUDA (propia del negocio)\n' + String(est.prep.materia.texto || '')
return [{ json: { ...est, respuesta_task: task, respuesta_step: 'manual-autor-s7' } }]
