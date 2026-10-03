// ⑤ GUARDA · SEDES Y VOZ DEL CLIENTE · CC#1 · 2026-10-02 · encargo Lenovo «sedes, mapas, cerebro y voz» puntos 1, 2, 3 y 6.
// El nodo anterior llama a `/api/clients/sedes/recolectar` (US$ 0: sólo lee lo que el sistema ya guardó del cliente y lo deja en la ficha de sedes con su fuente y su fecha).
// 🔴 Una lectura caída NO detiene la pieza ni se rellena: se DECLARA (`sedes_info.error`) y el pedido le dice al productor que no afirme ningún horario/dirección/teléfono que no venga en el brief.
// (No es un error tragado: el motivo viaja a la pieza y queda guardado en su `provenance_tag.sedes`; una respuesta que no es lo que se espera tampoco se interpreta: se declara.)
const e = $input.first().json || {}
const r = e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : e
let info
if (r.error && typeof r.error === 'object') {
  info = { error: 'no se pudo leer la ficha de sedes (' + String(r.error.message || r.error.name || 'sin detalle').slice(0, 160) + ')' }
} else if (r.ok !== true) {
  info = { error: String(r.error || r.detail || 'la lectura de sedes no contestó ok').slice(0, 200) }
} else if (!Array.isArray(r.sedes)) {
  info = { error: 'la lectura de sedes contestó ok pero sin la lista de sedes' }
} else {
  info = { sedes: r.sedes, textos_propios: Array.isArray(r.textos_propios) ? r.textos_propios : [], descartes: Array.isArray(r.descartes) ? r.descartes : [], choques: Array.isArray(r.choques) ? r.choques : [], mapas_por_sede: Array.isArray(r.mapas_por_sede) ? r.mapas_por_sede : [], nuevas: r.nuevas || 0 }
}
return [{ json: { sedes_info: info } }]
