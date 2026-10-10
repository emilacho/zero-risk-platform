// ⑥ LA VUELTA DEL AUTOR a la opinión. Lector tolerante; un fallo o un JSON ilegible NO se inventa: el manual sigue como estaba (ya cerrado por la puerta) y la respuesta queda vacía, declarado.
const est = $('⑥ Respuesta · pedido').first().json
const r = $input.first().json || {}
const c = r.body ? r.body : r
const fallo = c.success === false ? String(c.error || c.error_kind || 'sin detalle') : null
const texto = fallo ? '' : String(c.response || c.result || c.output || c.text || '')
const costo = typeof c.cost_usd === 'number' ? c.cost_usd : 0
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
const manual2 = obj && obj.manual && typeof obj.manual === 'object' && !Array.isArray(obj.manual) ? obj.manual : null
const respuesta = obj && Array.isArray(obj.respuesta) ? obj.respuesta.filter((x) => x && typeof x.punto === 'string' && (x.decision === 'tomada' || x.decision === 'no_tomada') && typeof x.razon === 'string') : []
const nota = fallo ? 'el autor FALLÓ al responder · ' + fallo : !manual2 ? 'la respuesta del autor no traía un manual legible' : null
return [{ json: { ...est, despues2: manual2 || est.manual1, respuesta_del_autor: respuesta, respuesta_fallo: nota, costo_usd: (Number(est.costo_usd) || 0) + costo } }]
