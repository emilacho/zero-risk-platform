// ⓪ GUARDA · EL LOTE · cadena · parte por filas · CC#1 · 2026-10-09 · diseño v2 §10.3
// Un lote es la lista de filas que el vigía pidió briefear. ANTES de gastar: que existan, que sean de ESTE cliente, que la campaña esté activa y que NINGUNA sea de video ni esté ya briefeada.
const s = $('⓪ Sobre · llave · modo seco').first().json
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status !== 200 || !b.campana) throw new Error('PARTE_LOTE_NO_LEGIBLE · ' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · se DETIENE y NO escribe nada')
if (b.campana.client_id !== s.client_id) throw new Error('PARTE_LOTE_DE_OTRO_CLIENTE · la campaña no es del cliente del sobre · se DETIENE y NO escribe nada')
if (b.campana.estado !== 'activa') throw new Error('PARTE_CAMPANA_NO_ACTIVA · la campaña está ' + String(b.campana.estado) + ' · no se briefea · se DETIENE y NO escribe nada')
const ids = s.fila_ids
if (new Set(ids).size !== ids.length) throw new Error('PARTE_LOTE_CON_REPETIDAS · el lote repite filas · se DETIENE y NO escribe nada')
const porId = new Map((Array.isArray(b.filas) ? b.filas : []).map((f) => [f.id, f]))
const faltan = ids.filter((id) => !porId.has(id))
if (faltan.length) throw new Error('PARTE_LOTE_FILAS_INEXISTENTES · ' + faltan.join(', ') + ' · se DETIENE y NO escribe nada')
const filas = ids.map((id) => porId.get(id))
const video = filas.filter((f) => f.estado === 'espera_video')
if (video.length) throw new Error('PARTE_LOTE_CON_VIDEO · ' + video.map((f) => f.id).join(', ') + ' esperan al brazo de video y NO entran a un lote · se DETIENE y NO escribe nada')
const ya = filas.filter((f) => ['briefeada', 'en_oficina', 'aprobada'].indexOf(f.estado) !== -1)
if (ya.length) throw new Error('PARTE_LOTE_YA_BRIEFEADO · ' + ya.map((f) => f.id).join(', ') + ' ya salieron briefeadas · no corre dos veces · se DETIENE y NO escribe nada')
const noListas = filas.filter((f) => ['validada', 'lista_para_brief'].indexOf(f.estado) === -1)
if (noListas.length) throw new Error('PARTE_LOTE_FILAS_NO_LISTAS · ' + noListas.map((f) => f.id + ':' + f.estado).join(', ') + ' · se DETIENE y NO escribe nada')
return [{ json: { ...s, plan_id: b.campana.plan_id, filas_lote: filas, calendario_version: b.version, lote_key: s.campana_id + ':' + s.lote + ':' + b.version } }]
