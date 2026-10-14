// JEF · plan · el plan de guardado · J7 · CC#1 · 2026-10-14 · lo que contestó `elegir_version`: qué versión se adopta, qué se guarda (B antes que C, sin duplicar) y qué se marca.
// Aquí no se escribe nada. Si no hay nada que guardar (se adoptó A, o ya existían las hijas) «Plan vigente» devuelve lo de hoy.
const CFG = __CFG__
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
const ev = $('JEF · plan · evaluar').first().json
const el = $('JEF · plan · armar la elección').first().json
const plan = b.plan_de_guardado && typeof b.plan_de_guardado === 'object' ? b.plan_de_guardado : {}
const guardar = Array.isArray(plan.guardar) ? plan.guardar.filter((g) => g && (g.etiqueta === 'B' || g.etiqueta === 'C') && ev.procesadas[g.etiqueta]) : []
return [{ json: { jef: ev.jef, id_de_a: ev.id_de_a, client_id: ev.client_id, procesadas: ev.procesadas, tags: el.tags, adoptada: b.adoptada || null, resultado: b.resultado || null, marcas: b.marcas || null, guardar, razones: Array.isArray(b.razones) ? b.razones : [], solo_en_la_traza: Array.isArray(plan.solo_en_la_traza) ? plan.solo_en_la_traza : [] } }]
