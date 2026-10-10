// ② EL AUTOR CORRIGE UNA VEZ SOLO LOS HALLAZGOS DE HECHO (S4). Arma el pedido del escritor del manual (`brand-strategist`, el mismo de las lentes).
// El autor recibe el manual vigente, la MATERIA CRUDA ordenada y la lista de hallazgos. Lo creativo no se toca; el eslogan lo escribe el código, no el autor.
const e = $input.first().json
const p = e.prep
const hallazgos = (p.informe.hechos || []).filter((h) => ['sin_cita', 'solo_sintesis', 'con_duda'].includes(h.estado))
const lista = hallazgos.map((h) => '- [' + h.campo + '] «' + h.clausula + '» — ' + (h.estado === 'con_duda' ? 'tiene una duda sin resolver: ' + (h.duda || '') : h.motivo || 'sin cita en lo raspado'))
const task =
  'Eres el escritor del manual de marca de un negocio. Más abajo tienes (1) el manual vigente en JSON, (2) la MATERIA cruda de lo que el negocio publicó de sí mismo, tal como se raspó, y (3) la lista de afirmaciones del manual que NO tienen respaldo en esa materia.\n\n' +
  'Corrige SOLO esas afirmaciones, UNA vez: o la respaldas con una cita LITERAL de la materia (y entonces la conservas), o la quitas. No agregues hechos que no estén en la materia. No cambies lo creativo (voz, personalidad, tono, ideas). ' +
  'No toques el campo `tagline`: lo escribe el sistema. Responde SOLO con un JSON: el manual completo, con las mismas claves del manual vigente.\n\n' +
  '## AFIRMACIONES SIN RESPALDO\n' + (lista.length ? lista.join('\n') : '(ninguna: solo falta el eslogan, que lo escribe el sistema)') + '\n\n' +
  '## MANUAL VIGENTE\n' + JSON.stringify(p.manual_vigente) + '\n\n' +
  '## MATERIA CRUDA (propia del negocio)\n' + String(p.materia.texto || '')
return [{ json: { ...e, autor_task: task, autor_step: 'manual-autor-s4', hallazgos_n: hallazgos.length } }]
