// ④ ¿YA HAY PIEZA DE ESTE BRIEF? · CC#1 · 2026-10-01. La misma pieza dos veces NO corre (cada corrida paga): se avisa. Con `forzar:true` se permite repetir a propósito.
// En modo seco no se aplica (no escribe nada, repetir no daña) pero se DECLARA.
const prev = $('③ GUARDA · las fotos propias').first().json
// 🔴 UN ERROR DE LA BASE NO ES «VACÍO» (certificación CC#3 · 01-oct): el nodo HTTP de la consulta tiene `onError: continueRegularOutput` y, si la base falla, entrega un ítem `{error:{…}}`
// (o PostgREST contesta un OBJETO `{code, message}` en vez de una lista). Leerlo como «no hay pieza previa» seguiría hacia el nodo que PAGA. Se DETIENE con su motivo.
const _filas = $input.all().map((i) => i.json)
const _falla = _filas.find((r) => r && ((r.error !== undefined && r.error !== null) || (r.code !== undefined && r.message !== undefined && r.id === undefined)))
if (_falla) {
  const _m = _falla.error && typeof _falla.error === 'object' ? (_falla.error.message || _falla.error.name) : (_falla.error || _falla.message)
  throw new Error('PIEZA_REPETIDA_CONSULTA_FALLO · la consulta a la base FALLÓ (' + String(_m || 'sin detalle').slice(0, 160) + ') · un error no es «no hay pieza previa» · se DETIENE y NO escribe nada')
}
const ya = $input.all().map((i) => i.json).filter((r) => r && r.id)
const repetido = ya.length > 0
if (repetido && !prev.forzar && !prev.dry_run) {
  throw new Error('PIEZA_REPETIDA · ya existe la pieza ' + ya[0].id + ' (' + ya[0].created_at + ') del brief ' + prev.brief_id + ' del parte ' + prev.parte_id + ' · no corre dos veces la misma pieza · para repetirla a propósito, el sobre lleva forzar:true')
}
return [{ json: { ...prev, pieza_previa_id: repetido ? ya[0].id : null, repetido_declarado: repetido } }]
