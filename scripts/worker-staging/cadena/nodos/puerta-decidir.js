// ⓪ DECIDIR · pasarela o cadena · lo dice el INTERRUPTOR (apagada · ensayo · encendida), no el sobre
// Pasarela = NEUTRAL: reenvía el cuerpo entero a la parte original y no cambia nada observable. Solo el sobre de abrir tiene sentido en pasarela: un sobre del vigía con la cadena apagada se DETIENE (no es de la parte original).
const s = $('⓪ Llave y origen').last().json
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (Number(r.statusCode) !== 200) throw new Error('PUERTA_ESTADO_NO_COMPROBABLE · ' + String(b.code || b.error || r.statusCode) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · se DETIENE y no escribe nada')
const efectivo = b.modo === 'cadena' ? 'cadena' : 'pasarela'
if (efectivo === 'pasarela' && s.modo !== 'abrir') throw new Error('PUERTA_CADENA_APAGADA · llegó un sobre del vigía (' + s.modo + ') pero la cadena está ' + String(b.estado_cadena) + ' · no se reenvía a la parte original · se DETIENE')
return [{ json: { ...s, efectivo, estado_cadena: b.estado_cadena || null } }]
