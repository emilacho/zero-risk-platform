// JEF · plan · armar la elección · J7 · CC#1 · 2026-10-14 · lo que le pide a la ruta `elegir_version`: las evaluaciones y las filas del plan que YA existen (para no duplicar: una hija por padre, G4/G7).
// Si las filas no se pudieron leer NO se elige ni se guarda nada (no se puede garantizar que no se duplique): A sigue vigente.
const CFG = __CFG__
const ev = $('JEF · plan · evaluar').first().json
const r = $input.first().json || {}
const filas = r.body
if (Number(r.statusCode) !== 200 || !Array.isArray(filas)) return [{ json: { ok: false, motivo: 'no se pudieron leer las filas del plan (HTTP ' + String(r.statusCode) + '): no se guarda ninguna versión' } }]
const existentes = filas.filter((f) => f && typeof f.id === 'string').map((f) => ({ id: f.id, version_de: f.provenance_tag && typeof f.provenance_tag.version_de === 'string' && f.provenance_tag.version_de ? f.provenance_tag.version_de : null }))
const tags = {}
for (const f of filas) if (f && typeof f.id === 'string' && f.provenance_tag && typeof f.provenance_tag === 'object') tags[f.id] = f.provenance_tag
return [{ json: { ok: true, cuerpo: { accion: 'elegir_version', revision_id: ev.jef.revision_id, evaluaciones: ev.evaluaciones, id_de_a: ev.id_de_a, existentes }, tags } }]
