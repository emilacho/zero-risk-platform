// ⑧ ¿GUARDÓ LA PIEZA? · CC#1 · 2026-10-01. Una corrida sin pieza guardada NO puede salir exitosa (regla 12-sep de planeación y del brief).
const v = $('⑦ Chequeos').first().json
let guardado = false, guardado_id = null, detalle_guardado = null
try {
  const g = $('⑧ Guardar la pieza').first().json
  const gb = g && g.body ? g.body : g
  const fila = Array.isArray(gb) ? gb[0] : gb
  guardado = !!(fila && fila.id)
  guardado_id = (fila && fila.id) || null
  if (!guardado) detalle_guardado = String((fila && (fila.message || fila.error || fila.code)) || (g && g.error && g.error.message) || 'sin id en la respuesta de la base').slice(0, 300)
} catch (x) { guardado = false; detalle_guardado = 'el nodo de guardado no entregó nada' }
const problemas = []
if (v.pieza_valida === false) problemas.push('PIEZA NO VÁLIDA · ' + v.motivo_invalido)
if (!v.llego_la_vuelta) problemas.push('la vuelta del productor NO llegó')
if (!guardado) problemas.push('la pieza NO quedó guardada en client_historical_outputs · ' + (detalle_guardado || ''))
return [{
  json: {
    ok: problemas.length === 0,
    pieza_guardada: guardado,
    pieza_guardada_id: guardado_id,
    chequeos_ok: v.chequeos_ok,
    hallazgos: (v.hallazgos || []).length,
    problemas,
    pieza_valida: v.pieza_valida !== false,
    motivo_invalido: v.motivo_invalido || null,
    client_id: v.client_id,
    brief_id: v.brief_id,
    // la sala se entera del resultado REAL: una pieza con problemas no se anuncia como terminada limpia
    payload_cable: { ...v.payload_cable, resultado: problemas.length === 0 ? 'pieza_terminada' : (v.pieza_valida === false ? 'pieza_no_valida' : 'pieza_con_problemas'), ...(problemas.length ? { problemas } : {}), ...(guardado_id ? { pieza_id: guardado_id } : {}) },
  },
}]
