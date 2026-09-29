// ② ¿YA HAY PARTE DE ESTE PLAN? · decisión de Emilio 09-sep: el mismo plan dos veces NO corre, avisa · CC#1 · 2026-09-29.
// En modo seco no se aplica (no escribe nada, así que repetir no daña) pero se DECLARA. Con `forzar:true` se permite.
const prev = $('② GUARDA · sin plan se DETIENE').first().json
const ya = $input.all().map((i) => i.json).filter((r) => r && r.id)
const repetido = ya.length > 0
if (repetido && !prev.forzar && !prev.dry_run) {
  throw new Error('BRIEF_REPETIDO · ya existe el parte ' + ya[0].id + ' (' + ya[0].created_at + ') del plan ' + prev.plan_id + ' · no corre dos veces el mismo plan · para repetirlo a propósito, el sobre lleva forzar:true')
}
return [{ json: { ...prev, parte_previo_id: repetido ? ya[0].id : null, repetido_declarado: repetido } }]
