// 2b · ENTRADA DEL LECTOR DE FICHAS (Sprint 4 · A entrega 2) · `seco` explícito y el simulacro (solo en seco) · el sub-flujo pone sus propios workflow ids
// Un ensayo que trae simulacros pero NINGUNO para las fichas NO llama al modelo: el lector «lee» cero fichas (US$ 0) y la hoja lo declara.
const s = $input.first().json
const conSimulacros = s.simulacros && typeof s.simulacros === 'object'
const sim = conSimulacros && Array.isArray(s.simulacros.fichas) ? s.simulacros.fichas : conSimulacros ? [{ fichas: [], pendientes: ['ensayo sin fichas simuladas'] }] : null
return [{ json: { campana_id: s.campana_id, seco: s.dry_run === true, simulacro: sim } }]
