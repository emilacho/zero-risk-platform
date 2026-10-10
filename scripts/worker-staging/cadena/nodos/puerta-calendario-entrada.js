// 4 · ENTRADA DEL CALENDARIO (tanda 1) · `seco` explícito y el simulacro de la tanda 1 (solo en seco)
const s = $('2 · ¿Estrategia?').last().json
const sim = s.simulacros && Array.isArray(s.simulacros.calendario) ? s.simulacros.calendario : null
return [{ json: { campana_id: s.campana_id, seco: s.dry_run === true, tanda: 1, simulacro: sim } }]
