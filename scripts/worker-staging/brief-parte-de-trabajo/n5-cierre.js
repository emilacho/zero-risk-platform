// ⑤ ¿GUARDÓ Y SALIÓ EL PDF? · CC#1 · 2026-09-29. Una corrida sin parte guardado o sin PDF NO puede salir exitosa (regla 12-sep de planeación).
// El guardado va ANTES de Drive a propósito: si Drive falla, el parte NO se pierde.
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
try { const d = $('⑤ Parte a Drive').first().json; rec = d && d.body ? d.body : d } catch (x) { rec = null }
const hayPdf = !!(rec && rec.ok === true && rec.file_id)
const problemas = []
if (v.parte_valido === false) problemas.push('PARTE NO VÁLIDO · ' + v.motivo_invalido)
if (!v.llego_la_vuelta) problemas.push('la vuelta del redactor NO llegó')
if (!guardado) problemas.push('el parte NO quedó guardado en client_historical_outputs')
if (!hayPdf) problemas.push('Drive no devolvió un archivo (' + String((rec && rec.motivo) || 'sin motivo') + ')')
return [{
  json: {
    ok: problemas.length === 0,
    parte_guardado: guardado,
    parte_guardado_id: guardado_id,
    hay_pdf: hayPdf,
    file_id: (rec && rec.file_id) || null,
    url: (rec && rec.url) || null,
    chequeos_ok: v.chequeos_ok,
    hallazgos: (v.hallazgos || []).length,
    entregables: v.entregables,
    pendientes_declarados: v.pendientes_declarados,
    problemas,
    parte_valido: v.parte_valido !== false,
    motivo_invalido: v.motivo_invalido || null,
    client_id: v.client_id,
    // la sala se entera del resultado REAL: un parte con problemas no se anuncia como terminado limpio
    payload_cable: { ...v.payload_cable, resultado: problemas.length === 0 ? 'parte_terminado' : (v.parte_valido === false ? 'parte_no_valido' : 'parte_con_problemas'), ...(problemas.length ? { problemas } : {}) },
  },
}]
