// ① ¿QUÉ DIJO `cobertura`? · ya verificada o sin fuente = FIN (no se repite el gasto) · investigar = una fila por dominio permitido (la lista sale de cadena_config, vacía por defecto)
const s = $('⓪ Entrada').last().json
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status !== 200) throw new Error('CADENA_COBERTURA_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle'))
if (b.estado === 'ya_verificada' || b.estado === 'sin_fuente') return [{ json: { ...s, fin: true, resultado: b.estado, detalle: b } }]
if (b.estado === 'investigar' && Array.isArray(b.dominios) && b.dominios.length > 0) return b.dominios.map((d) => ({ json: { ...s, fin: false, dominio: String(d), intento: b.intento } }))
throw new Error('CADENA_COBERTURA_NO_ENTENDIDA · ' + JSON.stringify(b).slice(0, 300))
