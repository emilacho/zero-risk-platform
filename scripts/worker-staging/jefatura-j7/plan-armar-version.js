// JEF · plan · armar S · J7 · CC#1 · 2026-10-14 · prepara guardar la versión S (B o C): su fila, su `provenance_tag` (lo calcula la RUTA con la fila de partida LEÍDA, nunca a mano) y a quién reemplaza.
// El padre de B es A; el de C es B (o A si B no pasó). Se lee el `provenance_tag` ACTUAL del padre (el de A viene de «Guardar el plan»; el de B, de lo que acaba de devolver su inserción).
const CFG = __CFG__
const S = CFG.etiqueta
const est = $('JEF · plan · el plan de guardado').first().json
const g = est.guardar.find((x) => x.etiqueta === S)
const fila = (() => { const gg = $('Guardar el plan').first().json; const gb = gg && gg.body ? gg.body : gg; return Array.isArray(gb) ? gb[0] : gb })()
const insertada = (E) => { try { const r = $('JEF · plan · guardar ' + E).first().json; const row = Array.isArray(r.body) ? r.body[0] : null; return [200, 201].indexOf(Number(r.statusCode)) !== -1 && row && row.id ? row : null } catch (x) { return null } }
const padre = (() => {
  if (g.version_de === 'A') return { label: 'A', id: est.id_de_a, tag: fila.provenance_tag }
  const insB = insertada('B')
  if (insB) return { label: 'B', id: insB.id, tag: insB.provenance_tag }
  const reB = (est.guardar.find((x) => x.etiqueta === 'B') || {}).reutilizar_id
  return { label: 'B', id: reB || null, tag: reB ? est.tags[reB] : null }
})()
const p = est.procesadas[S]
const hoy = new Date().toISOString().slice(0, 10)
return [{ json: {
  padre,
  pedido_tag: { accion: 'provenance_de_version', provenance_tag: padre.tag, etiqueta: S, version: g.version, version_de: padre.id, jefatura_revision_id: est.jef.revision_id },
  fila_base: { client_id: est.client_id, title: 'Plan de 90 dias · ' + hoy + ' · versión ' + S, output_type: 'campaign_plan_90d', content: p.texto, content_text: p.texto, producing_agent: 'campaign-brief-agent', status: 'draft' },
  // lo que describe a ESTA versión y no a A (la fila hereda el resto del rastro de A)
  tag_propio: { caracteres: p.caracteres, estado_del_plan: p.estado_del_plan, pendientes: p.pendientes || null },
} }]
