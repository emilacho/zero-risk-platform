// 2 · ENTRADA DE LA ESTRATEGIA · la puerta propaga `seco` EXPLÍCITO y el simulacro (solo en seco) · el sub-flujo pone sus propios workflow ids
const s = $input.first().json
const sim = s.simulacros && Array.isArray(s.simulacros.estrategia) ? s.simulacros.estrategia : null
return [{ json: { campana_id: s.campana_id, seco: s.dry_run === true, simulacro: sim } }]
