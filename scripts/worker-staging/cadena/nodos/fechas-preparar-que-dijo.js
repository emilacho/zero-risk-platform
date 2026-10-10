// ③ ¿QUÉ DIJO `preparar`? · lista para llamar · ya hecha · sin fuente (el tipo queda sin fuente y la campaña SIGUE) · lo demás falla ruidoso antes de gastar
const s = $('③ Armar preparar').last().json
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
const base = { ...s }
delete base.pedido; delete base.paginas
if (status === 200 && b.run_sdk) return [{ json: { ...base, fin: false, corrida_id: b.corrida_id, headers: b.headers || {}, run_sdk: b.run_sdk } }]
if (status === 200 && (b.ya_hecha === true || b.estado === 'sin_fuente')) return [{ json: { ...base, fin: true, resultado: b.ya_hecha ? 'ya_hecha' : 'sin_fuente', detalle: b } }]
throw new Error('CADENA_FECHAS_PREPARAR_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · no se llamó a ningún agente')
