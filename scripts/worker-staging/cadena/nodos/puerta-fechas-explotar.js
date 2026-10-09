// 3 · UNA FILA POR TIPO Y AÑO · cada una entra al sub-flujo de fechas con `seco` explícito y, solo en seco, su simulacro
const s = $input.first().json
const sim = s.simulacros && s.simulacros.fechas && typeof s.simulacros.fechas === 'object' ? s.simulacros.fechas : null
return s.fechas_pedidas.map((p) => ({ json: { campana_id: s.campana_id, seco: s.dry_run === true, pais: p.pais, tipo: p.tipo, ambito: p.ambito, anio: p.anio, simulacro: sim } }))
