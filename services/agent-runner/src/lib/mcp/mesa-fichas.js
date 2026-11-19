// =============================================================
// 18-nov · lo que la herramienta `pedir_fichas` le devuelve al empleado (aparte de mesa-server.js para poder probarlo: 🟡 o12 de CC6).
// El empleado lee el TEXTO de las fichas (cada original completo, o «no consta»), nunca los datos crudos de la plataforma.
// Si la plataforma no confirmó, o la respuesta no trae el texto, vuelve como ERROR (nunca un éxito vacío).
// =============================================================

const fallo = (mensaje) => ({ isError: true, content: [{ type: 'text', text: mensaje }] })

/** r = lo que devolvió `llamar('pedir_fichas', …)`: {ok, cuerpo} o {ok:false, error} */
function respuestaDeFichas(r) {
  if (!r || !r.ok) return fallo((r && r.error) || 'la plataforma no respondió')
  const cuerpo = r.cuerpo || {}
  if (cuerpo.ok === false) return fallo(cuerpo.motivo || 'no se pudo leer ninguna ficha')
  if (typeof cuerpo.fichas !== 'string' || !cuerpo.fichas.trim()) return fallo('la plataforma no devolvió el texto de las fichas')
  return { content: [{ type: 'text', text: cuerpo.fichas }] }
}

module.exports = { respuestaDeFichas }
