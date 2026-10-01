// ④ ¿YA HAY PIEZA DE ESTE BRIEF? · CC#1 · 2026-10-01. La misma pieza dos veces NO corre (cada corrida paga): se avisa. Con `forzar:true` se permite repetir a propósito.
// En modo seco no se aplica (no escribe nada, repetir no daña) pero se DECLARA.
const prev = $('③ GUARDA · las fotos propias').first().json
const ya = $input.all().map((i) => i.json).filter((r) => r && r.id)
const repetido = ya.length > 0
if (repetido && !prev.forzar && !prev.dry_run) {
  throw new Error('PIEZA_REPETIDA · ya existe la pieza ' + ya[0].id + ' (' + ya[0].created_at + ') del brief ' + prev.brief_id + ' del parte ' + prev.parte_id + ' · no corre dos veces la misma pieza · para repetirla a propósito, el sobre lleva forzar:true')
}
return [{ json: { ...prev, pieza_previa_id: repetido ? ya[0].id : null, repetido_declarado: repetido } }]
