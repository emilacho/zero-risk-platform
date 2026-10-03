// ① GUARDA · el parte y el brief · CC#1 · 2026-10-01. Sin parte VÁLIDO, o sin ese brief dentro de él, se DETIENE y no se escribe nada.
// El brief se lee ESTRUCTURADO de `provenance_tag.parte` (lo guarda el flujo del brief junto al texto), no se parsea de un texto pegado a mano.
const env = $('⓪ Sobre · llave · modo seco').first().json
// 🔴 UN ERROR DE LA BASE NO ES «VACÍO» (certificación CC#3 · 01-oct): el nodo HTTP de la consulta tiene `onError: continueRegularOutput` y, si la base falla, entrega un ítem `{error:{…}}`
// (o PostgREST contesta un OBJETO `{code, message}` en vez de una lista). Leerlo como «sin parte» seguiría hacia el nodo que PAGA. Se DETIENE con su motivo.
const _filas = $input.all().map((i) => i.json)
const _falla = _filas.find((r) => r && ((r.error !== undefined && r.error !== null) || (r.code !== undefined && r.message !== undefined && r.id === undefined)))
if (_falla) {
  const _m = _falla.error && typeof _falla.error === 'object' ? (_falla.error.message || _falla.error.name) : (_falla.error || _falla.message)
  throw new Error('PIEZA_PARTE_CONSULTA_FALLO · la consulta a la base FALLÓ (' + String(_m || 'sin detalle').slice(0, 160) + ') · un error no es «sin parte» · se DETIENE y NO escribe nada')
}
const filas = $input.all().map((i) => i.json).filter((r) => r && r.id)
if (filas.length === 0) {
  throw new Error('PIEZA_SIN_PARTE · el cliente ' + env.client_id + ' no tiene un parte de trabajo (campaign_brief_pack) · se DETIENE y NO escribe nada')
}
const esNoValido = (r) => String(r.title || '').indexOf('⛔') === 0 || (r.provenance_tag && r.provenance_tag.valido === false)
let parte
if (env.parte_id) {
  parte = filas.find((r) => r.id === env.parte_id)
  if (!parte) throw new Error('PIEZA_PARTE_INEXISTENTE · el parte ' + env.parte_id + ' no existe para el cliente ' + env.client_id + ' · se DETIENE y NO escribe nada')
  if (esNoValido(parte)) throw new Error('PIEZA_PARTE_NO_VALIDO · el parte ' + parte.id + ' está marcado como NO VÁLIDO · no se produce una pieza desde un parte inválido · se DETIENE y NO escribe nada')
} else {
  parte = filas.find((r) => !esNoValido(r))
  if (!parte) throw new Error('PIEZA_PARTE_NO_VALIDO · todos los partes del cliente están marcados NO VÁLIDOS · se DETIENE y NO escribe nada')
}
const p = parte.provenance_tag && typeof parte.provenance_tag === 'object' ? parte.provenance_tag : {}
const estructurado = p.parte && typeof p.parte === 'object' ? p.parte : null
if (!estructurado || !Array.isArray(estructurado.entregables)) {
  throw new Error('PIEZA_PARTE_ILEGIBLE · el parte ' + parte.id + ' no trae su lista de entregables estructurada (provenance_tag.parte) · se DETIENE y NO escribe nada')
}
const brief = estructurado.entregables.find((e) => e && String(e.id) === env.brief_id)
if (!brief) {
  const hay = estructurado.entregables.map((e) => e && e.id).filter(Boolean).join(', ') || '(ninguno)'
  throw new Error('PIEZA_BRIEF_INEXISTENTE · el parte ' + parte.id + ' no tiene el brief ' + env.brief_id + ' · tiene: ' + hay + ' · se DETIENE y NO escribe nada')
}
const lista = (v) => (Array.isArray(v) && v.length ? v.map((x) => '  - ' + x).join('\n') : '  (ninguno)')
const vis = brief.visual
const L = []
L.push('BRIEF ' + brief.id + ' · ' + (brief.plataforma || '?') + ' · ' + (brief.tipo_de_pieza || '?'))
L.push('- QUÉ ES: ' + (brief.que_es || ''))
L.push('- DE QUÉ PARTE DEL PLAN SALE: ' + (brief.de_que_parte_del_plan || ''))
L.push('- OBJETIVO: ' + (brief.objetivo || ''))
L.push('- SEGMENTO: ' + (brief.segmento || ''))
L.push('- PROTAGONISTA: ' + (brief.protagonista || ''))
L.push('- MENSAJE (uno): ' + (brief.mensaje || ''))
L.push('- HIPÓTESIS: ' + (brief.hipotesis || ''))
L.push('- LÍMITES: ' + (brief.limites || ''))
L.push('- VOCABULARIO OBLIGATORIO:\n' + lista(brief.vocabulario_obligatorio))
L.push('- PROHIBIDO:\n' + lista(brief.prohibido))
L.push('- SINTAXIS: ' + (brief.sintaxis || ''))
L.push('- VISUAL: ' + (vis && typeof vis === 'object' ? 'capa que manda: ' + (vis.capa_que_manda || '?') + ' · ' + (vis.descripcion || '') + ' · MUESTRA: ' + (vis.muestra || '(sin muestra)') : String(vis || '')))
L.push('- LLAMADO A LA ACCIÓN: ' + (brief.llamado_a_la_accion || ''))
L.push('- VARIANTES: ' + (brief.variantes || ''))
L.push('- NEGATIVOS:\n' + lista(brief.negativos))
L.push('- APRUEBA Y PARA CUÁNDO: ' + (brief.aprueba_y_para_cuando || ''))
return [{
  json: {
    ...env,
    parte_id: parte.id,
    parte_creado: parte.created_at,
    plan_id: p.plan_id || null,
    manual_id_del_parte: p.manual_id || null,
    brief,
    brief_texto: L.join('\n'),
    plataforma: brief.plataforma || null,
    tipo_de_pieza: brief.tipo_de_pieza || null,
    // 03-oct · EL PRODUCTO: el protagonista de ESTE brief (y su vocabulario obligatorio, que ya viaja dentro de `brief`) · ③ y ⑤ lo usan para saber qué muestra cada foto
    protagonista: brief.protagonista || null,
  },
}]
