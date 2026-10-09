// ① ¿QUÉ DIJO `preparar`? · tres cosas buenas (lista para llamar · ya hecha · la campaña ya quedó en necesita_humano) y todo lo demás FALLA RUIDOSO antes de gastar
const s = $('① Armar el pedido').last().json
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
const base = { ...s }
delete base.pedido
if (status === 200 && b.ya_hecha === true) return [{ json: { ...base, fin: true, resultado: 'ya_hecha', detalle: b } }]
if (status === 200 && b.run_sdk) return [{ json: { ...base, fin: false, corrida_id: b.corrida_id, headers: b.headers || {}, run_sdk: b.run_sdk, intento: b.intento || 1 } }]
// el tope (de presupuesto o de intentos) ya dejó la campaña en necesita_humano con su reloj: no es un error del flujo, es un fin declarado
if (status === 409 && (b.error === 'presupuesto_agotado' || b.error === 'intentos_agotados')) return [{ json: { ...base, fin: true, resultado: 'necesita_humano', alerta: b.alerta || null, detalle: b } }]
throw new Error('CADENA_PREPARAR_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle') + ' · no se llamó a ningún agente')
