// ⑤ ¿GUARDÓ Y SALIÓ EL PDF? · CC#1 · 2026-09-29. Una corrida sin parte guardado NO puede salir exitosa (regla 12-sep de planeación).
// El guardado va ANTES de Drive a propósito: si Drive falla, el parte NO se pierde.
// Aquí solo se llega si la vuelta llegó COMPLETA (lista + todas las tandas): sin vuelta no se guarda nada (regla de Emilio 29-sep).
// Un parte que llegó pero NO es legible se guarda CRUDO (ya estaba pagado) con legible:false, y NO va a Drive (un PDF de JSON roto no sirve).
const v = $('④ Chequeos').first().json
let guardado = false, guardado_id = null
try {
  const g = $('⑤ Guardar el parte').first().json
  const gb = g && g.body ? g.body : g
  const fila = Array.isArray(gb) ? gb[0] : gb
  guardado = !!(fila && fila.id)
  guardado_id = (fila && fila.id) || null
} catch (x) { guardado = false }
let rec = null
if (v.parte_legible) {
  try { const d = $('⑤ Parte a Drive').first().json; rec = d && d.body ? d.body : d } catch (x) { rec = null }
}
const hayPdf = !!(rec && rec.ok === true && rec.file_id)
const problemas = []
if (!guardado) problemas.push('el parte NO quedó guardado en client_historical_outputs')
if (v.parte_legible && !hayPdf) problemas.push('Drive no devolvió un archivo (' + String((rec && rec.motivo) || 'sin motivo') + ')')
if (!v.parte_legible) problemas.push('el parte NO es legible: se guardó CRUDO para diagnóstico (legible:false · no impide reintentar) y NO se mandó a Drive')
return [{
  json: {
    ok: problemas.length === 0,
    parte_guardado: guardado,
    parte_guardado_id: guardado_id,
    parte_legible: v.parte_legible,
    hay_pdf: hayPdf,
    file_id: (rec && rec.file_id) || null,
    url: (rec && rec.url) || null,
    chequeos_ok: v.chequeos_ok,
    hallazgos: (v.hallazgos || []).length,
    entregables: v.entregables,
    pendientes_declarados: v.pendientes_declarados,
    problemas,
    client_id: v.client_id,
    // la sala se entera del resultado REAL: un parte con problemas no se anuncia como terminado limpio
    payload_cable: { ...v.payload_cable, resultado: problemas.length === 0 ? 'parte_terminado' : 'parte_con_problemas' },
  },
}]
