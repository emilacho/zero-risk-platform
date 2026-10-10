// ① GUARDA tras la preparación (S0/S1/S3, todo código). Decide si SIGUE a los pasos de modelo o termina aquí, y por qué.
//  · la preparación falló            → termina y lo DICE (nada se lee como «sin hallazgos»)
//  · sin hallazgos y eslogan ya está → no se hace nada
//  · dry_run                         → termina: NINGÚN paso de modelo corre en modo seco
const e = $('⓪ Entrada · llave').first().json
const r = $input.first().json || {}
const p = r.body ? r.body : r
if (!p || p.error || !p.informe) return [{ json: { ...e, ruta: 'fin', motivo: 'La preparación falló: ' + String((p && (p.error || p.detalle)) || 'sin respuesta') + ' ' + String((p && p.detalle) || '') } }]
if (p.sin_hallazgos === true) return [{ json: { ...e, prep: p, ruta: 'fin', motivo: 'Sin hallazgos de hecho y el eslogan ya está: no se hace nada.' } }]
if (e.dry_run === true) return [{ json: { ...e, prep: p, ruta: 'fin', motivo: 'dry_run: se preparó (materia, frases propias, hechos y evidencia del juez) y se detuvo antes de cualquier modelo.' } }]
return [{ json: { ...e, prep: p, ruta: 'seguir', motivo: '' } }]
