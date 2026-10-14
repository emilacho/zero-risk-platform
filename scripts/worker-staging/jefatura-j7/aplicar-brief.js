// JEF · aplicar · BRIEF · J7 · CC#1 · 2026-10-14 · lo que le pasa al parte tras la revisión. SOLO MARCA: nunca cambia un brief ni lo detiene.
// Sin revisión cerrada (apagada, tipo no activo, error, plazo, sin salida) devuelve EXACTAMENTE la salida de «④ Chequeos»: idéntico a hoy.
const CFG = __CFG__
const orig = $('④ Chequeos').all()
const entrada = $input.first().json || {}
const jef = entrada.jef && typeof entrada.jef === 'object' ? entrada.jef : {}
if (jef.fase !== 'cerrada' || !jef.salida || typeof jef.salida !== 'object') return orig
const sal = jef.salida
const marcas = sal.marcas && typeof sal.marcas === 'object' ? sal.marcas : {}
const desacuerdos = Array.isArray(sal.desacuerdos) ? sal.desacuerdos.map((d) => String(d)) : []
const resultado = String(sal.resultado || jef.resultado || '')
const it = JSON.parse(JSON.stringify(orig[0].json))
if (!it.fila_parte || typeof it.fila_parte !== 'object' || !it.fila_parte.provenance_tag) return orig
const lineas = []
if (resultado === 'con_desacuerdo') lineas.push('- La revisión del sistema encontró puntos que el parte no resuelve' + (marcas.sin_segunda_mirada ? ' y no tuvo segunda mirada.' : '.'))
else if (resultado === 'sin_segunda_mirada') lineas.push('- La revisión del sistema no tuvo segunda mirada (el revisor externo no contestó): el parte quedó revisado a medias.')
else if (resultado === 'incompleta_por_tope') lineas.push('- La revisión del sistema se cortó por tope de costo: el parte quedó revisado a medias.')
else if (resultado === 'fallida') lineas.push('- La revisión del sistema falló: este parte NO se revisó.')
for (const d of desacuerdos.slice(0, 6)) lineas.push('- ' + d.slice(0, 300))
if (lineas.length) {
  const bloque = '\n\n## Revisión del sistema (jefatura · solo aviso)\n' + lineas.join('\n') + '\n'
  it.parte_md = String(it.parte_md || '') + bloque
  it.fila_parte.content = String(it.fila_parte.content || '') + bloque
  it.fila_parte.content_text = String(it.fila_parte.content_text || '') + bloque
}
it.fila_parte.provenance_tag.jefatura = { revision_id: jef.revision_id || sal.revision_id || null, resultado, con_desacuerdo: marcas.con_desacuerdo === true, sin_segunda_mirada: marcas.sin_segunda_mirada === true, desacuerdos: desacuerdos.length, costo_usd: typeof sal.costo_usd === 'number' ? sal.costo_usd : null, simulado: sal.simulado === true }
return [{ json: it }]
