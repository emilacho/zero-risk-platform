// ⑧ CIERRE sin pasos de modelo: la preparación falló, no había hallazgos, o era dry_run. Dice qué pasó. Costo 0. Nada de lo retirado sin fuente sale de este flujo hacia ningún canal.
const e = $input.first().json || {}
return [{ json: { fin: 'sin_modelo', motivo: e.motivo || '', dry_run: e.dry_run === true, costo_usd: 0 } }]
