// Plan vigente · J7 · CC#1 · 2026-10-14 · diseño v4 §5.1 · el plan que sigue por la cadena: la ÚLTIMA fila realmente guardada (C, si no B), y si no se guardó ninguna, A.
// Sin versión nueva devuelve EXACTAMENTE la salida de «Guardar el plan» (idéntico a hoy). Con una versión nueva devuelve su fila + `jef_vigente` (su texto y sus marcas, medidos con los mismos chequeos de hoy):
// los nodos de después (Drive, aviso, «BRIEF · sobre», «¿Salió el PDF?») leen `jef_vigente` si existe y, si no, lo de siempre.
const CFG = __CFG__
const orig = $('Guardar el plan').all()
let est = null
try { est = $('JEF · plan · el plan de guardado').first().json } catch (x) { est = null }
if (!est || !est.procesadas) return orig
let ultima = null, etiqueta = null
for (const S of ['B', 'C']) {
  try {
    const r = $('JEF · plan · guardar ' + S).first().json
    const row = Array.isArray(r.body) ? r.body[0] : null
    if ([200, 201].indexOf(Number(r.statusCode)) !== -1 && row && row.id) { ultima = row; etiqueta = S }
  } catch (x) { /* ese nodo no corrió */ }
}
if (!ultima || !est.procesadas[etiqueta]) return orig
const p = est.procesadas[etiqueta]
const vuelta = $('¿Llegó la vuelta?').first().json
return [{ json: { ...ultima, jef_vigente: { texto: p.texto, caracteres: p.caracteres, con_pendientes: p.con_pendientes, pendientes: p.pendientes, estado_del_plan: p.estado_del_plan, chequeo_del_plan: p.chequeo_del_plan, client_id: vuelta.client_id, client_name: vuelta.client_name, llego_la_vuelta: true, etiqueta } } }]
