// ② GUARDA · sin plan vigente se DETIENE y no se escribe nada · CC#1 · 2026-09-29.
// Entrada: la fila más reciente de client_historical_outputs con output_type=campaign_plan_90d.
const prev = $('① GUARDA · sin manual aprobado se DETIENE').first().json
const filas = $input.all().map((i) => i.json).filter((r) => r && r.id)
if (filas.length === 0) {
  throw new Error('BRIEF_SIN_PLAN · el cliente ' + prev.client_id + ' no tiene plan de 90 días vigente · se DETIENE y NO escribe nada')
}
const p = filas[0]
const texto = String(p.content_text || '')
if (!texto.trim()) {
  throw new Error('BRIEF_PLAN_VACIO · el plan ' + p.id + ' no trae texto · se DETIENE y NO escribe nada')
}
return [{
  json: {
    ...prev,
    plan_id: p.id,
    plan_creado: p.created_at,
    plan_titulo: p.title || null,
    plan_texto: texto,
    // el sobre puede nombrar un plan; si el vigente es OTRO se declara (no se obedece a ciegas ni se oculta)
    plan_del_sobre: prev.plan_id || null,
    plan_del_sobre_distinto: !!(prev.plan_id && prev.plan_id !== p.id),
  },
}]
