// ② LA VUELTA DEL AUTOR (S4). Un fallo declarado del agente o un JSON que no se puede leer NO se inventa: el manual sigue como estaba y se DICE.
// Lee el JSON de forma tolerante (el primer objeto balanceado del texto). El costo es el que reporta el corredor (sin costo reportado, 0 y se declara).
const est = $('② Autor · pedido').first().json
const r = $input.first().json || {}
const c = r.body ? r.body : r
const fallo = c.success === false ? String(c.error || c.error_kind || 'sin detalle') : null
const texto = fallo ? '' : String(c.response || c.result || c.output || c.text || '')
const costo = typeof c.cost_usd === 'number' ? c.cost_usd : typeof c.costUsd === 'number' ? c.costUsd : 0
function primerObjeto(t) {
  const i = t.indexOf('{')
  if (i < 0) return null
  let d = 0, dentro = false, esc = false
  for (let k = i; k < t.length; k++) {
    const ch = t[k]
    if (dentro) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') dentro = false; continue }
    if (ch === '"') dentro = true
    else if (ch === '{') d++
    else if (ch === '}') { d--; if (d === 0) { try { return JSON.parse(t.slice(i, k + 1)) } catch (_) { return null } } }
  }
  return null
}
const obj = texto ? primerObjeto(texto) : null
const despues = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj.manual && typeof obj.manual === 'object' ? obj.manual : obj) : null
const nota = fallo ? 'el autor FALLÓ · ' + fallo : !texto.trim() ? 'la vuelta del autor llegó vacía' : !despues ? 'la respuesta del autor no traía un JSON legible' : null
return [{ json: { ...est, despues: despues || est.prep.manual_vigente, autor_fallo: nota, costo_usd: (Number(est.costo_usd) || 0) + costo } }]
