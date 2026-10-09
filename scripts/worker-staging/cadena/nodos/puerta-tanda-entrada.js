// TANDA SIGUIENTE · el vigía pidió abrir la tanda N de una campaña ya activa · `seco` explícito, simulacro solo en seco
const s = $input.first().json
if (!s.campana_id || !Number.isInteger(s.tanda) || s.tanda < 2) throw new Error('PUERTA_TANDA_INVALIDA · el sobre del vigía debe traer campana_id y tanda ≥ 2 · se DETIENE y no escribe nada')
const sim = s.simulacros && Array.isArray(s.simulacros.calendario) ? s.simulacros.calendario : null
return [{ json: { campana_id: s.campana_id, seco: s.dry_run === true, tanda: s.tanda, simulacro: sim } }]
