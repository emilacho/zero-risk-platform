// ═══ MANUAL UTILIZABLE · UNA SOLA REGLA PARA TODAS LAS PUERTAS · CC1 · 2026-11-10 (GO Lenovo 18:14Z «traba de piezas») ═══
// Lógica PURA (sin red, sin `this`, sin `require`): la leen el código de la plataforma (`campos-del-manual.ts`) y las guardas de n8n
// (planeación, brief, parte por filas y productor de la pieza), donde el constructor la pega ENTERA y una prueba exige que el texto sea idéntico.
// Regla (decisión de Lenovo, la que ya usaba la planeación desde el 04-nov): un manual cuenta como aprobado si PASÓ LA VARA automática
// O si lo VALIDÓ EL DUEÑO (`human_validated` sin `validado_por: 'jefatura'`; un manual firmado antes de que existiera `validado_por` es del dueño).
// Una validación de la jefatura sola NO lo vuelve utilizable (ADR-020: si la vara no alcanza tras el tope, decide un HUMANO).
// Nada de esto mira clientes ni rubros.
function manualUtilizable(m) {
  if (!m || typeof m !== 'object') return { utilizable: false, por: null, motivo: 'no hay manual' }
  var pt = m.provenance_tag
  if (typeof pt === 'string') { try { pt = JSON.parse(pt) } catch (e) { pt = {} } }
  if (!pt || typeof pt !== 'object') pt = {}
  if (m.gate_outcome === 'paso_la_vara') return { utilizable: true, por: 'vara', motivo: 'pasó la revisión automática' }
  if (m.human_validated === true && pt.validado_por !== 'jefatura') return { utilizable: true, por: 'dueno', motivo: 'lo validó el dueño' }
  return { utilizable: false, por: null, motivo: 'ni pasó la revisión automática ni lo validó el dueño (gate_outcome=' + JSON.stringify(m.gate_outcome === undefined ? null : m.gate_outcome) + ', human_validated=' + JSON.stringify(m.human_validated === undefined ? null : m.human_validated) + (pt.validado_por ? ', validado_por=' + JSON.stringify(pt.validado_por) : '') + ')' }
}
// ═══ fin manual utilizable ═══

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { manualUtilizable: manualUtilizable }
}
