// ④ ¿Y AHORA? · lo que dijo `guardar`: terminó bien · la campaña necesita a Emilio · UNA corrección · un reintento. Nada de reintentos sin tope: la ruta ya cuenta (máx. 3) y aquí hay un tope propio de vueltas.
const s = $('③ Armar guardar').last().json
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
const base = { ...s }
delete base.guardar; delete base.run_sdk; delete base.llamada; delete base.agente; delete base.headers
if (status >= 400) throw new Error('CADENA_GUARDAR_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || 'sin detalle'))
if (b.necesita_humano) return [{ json: { ...base, fin: true, resultado: 'necesita_humano', alerta: b.alerta || null, fichas: b.fichas || [], detalle: b } }]
if (b.ok === true || b.ya_guardada === true) return [{ json: { ...base, fin: true, resultado: 'ok', detalle: b } }]
if (s.vuelta >= 6) throw new Error('CADENA_DEMASIADAS_VUELTAS · más de 6 vueltas en un paso: algo está mal · se DETIENE')
if (b.correccion === true) return [{ json: { ...base, fin: false, vuelta: s.vuelta + 1, correccion: { fichas: b.fichas || [], fila_ids: b.fila_ids || [], modo: b.modo || 'tanda' } } }]
if (b.reintentar === true) return [{ json: { ...base, fin: false, vuelta: s.vuelta + 1, correccion: s.correccion || null } }]
throw new Error('CADENA_RESPUESTA_NO_ENTENDIDA · ' + JSON.stringify(b).slice(0, 300))
