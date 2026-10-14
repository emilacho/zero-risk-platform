// JEF · ¿cómo abrió? · J7 · CC#1 · 2026-10-14 · lo que contestó `POST /api/jefatura/revisiones` (abrir). NUNCA lanza: cualquier cosa rara queda como fase `error` y el productor sigue como hoy.
// Fases: cerrada (la ruta ya cerró) · esperar (hay un turno de agente por despertar) · espera_sin_turno (la revisión ya existía y sigue abierta o cerró: se lee) · no_abre (409: apagada, tipo no activo, fuera del ensayo, sin otra vuelta…) · error.
const CFG = __CFG__
const s = $('JEF · armar').first().json
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' && !Array.isArray(r.body) ? r.body : {}
const jef = { ...s.jef }
if (status === 200 && b.accion === 'cerrado' && b.revision_id) {
  Object.assign(jef, { fase: 'cerrada', revision_id: String(b.revision_id), salida: b.salida && typeof b.salida === 'object' ? b.salida : null, resultado: b.resultado || null })
} else if (status === 200 && b.accion === 'esperar' && b.revision_id && b.turno && typeof b.turno === 'object') {
  Object.assign(jef, { fase: 'esperar', revision_id: String(b.revision_id), turno: b.turno })
} else if (status === 200 && b.accion === 'ya_existia' && b.revision_id) {
  Object.assign(jef, { fase: 'espera_sin_turno', revision_id: String(b.revision_id), estado_previo: b.estado || null })
} else if (status === 409) {
  Object.assign(jef, { fase: 'no_abre', motivo: String(b.motivo || b.error || '409') })
} else {
  const corte = r.error && typeof r.error === 'object' ? String(r.error.message || r.error.name || 'la llamada se cortó') : null
  Object.assign(jef, { fase: 'error', http: Number.isFinite(status) ? status : null, motivo: String(b.error || b.detalle || corte || ('HTTP ' + String(r.statusCode))).slice(0, 300) })
}
return [{ json: { jef } }]
