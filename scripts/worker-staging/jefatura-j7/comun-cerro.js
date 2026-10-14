// JEF · ¿cerró? · J7 · CC#1 · 2026-10-14 · lo que contestó `POST /api/jefatura/revisiones` (leer). NUNCA lanza.
// cerrada = estado terminal con su salida · seguir = todavía abierta y queda plazo · plazo = se acabó el tiempo (lo que llegue tarde NO se guarda) · error = cerró sin salida.
// Un fallo pasajero de la lectura (5xx, red) no corta la espera: se sigue sondeando hasta el plazo o el tope de sondeos.
const CFG = __CFG__
const base = $('JEF · ¿cómo abrió?').first().json.jef
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' && !Array.isArray(r.body) ? r.body : {}
const TERMINALES = ['cerrada', 'cerrada_por_tope', 'fallida']
const sondeos = Number($runIndex) + 1
const jef = { ...base, sondeos }
if (status === 200 && TERMINALES.indexOf(b.estado) !== -1) {
  if (b.salida && typeof b.salida === 'object') Object.assign(jef, { fase: 'cerrada', salida: b.salida, resultado: b.resultado || null })
  else Object.assign(jef, { fase: 'error', motivo: 'la revisión cerró (' + String(b.estado) + ') pero la lectura no trajo su salida' })
} else if (Date.now() > Number(base.plazo_fin) || sondeos >= CFG.max_sondeos) {
  Object.assign(jef, { fase: 'plazo', motivo: 'se acabó la espera (' + String(CFG.plazo_s) + ' s) sin que la revisión cerrara: lo que llegue tarde no se guarda' })
} else {
  Object.assign(jef, { fase: 'seguir' })
}
return [{ json: { jef } }]
